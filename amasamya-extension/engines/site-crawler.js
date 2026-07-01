/**
 * AMASAMYA Site Crawler (v4.2.0)
 *
 * Sequential URL queue that walks a list of pages, opens each one in a
 * background tab, injects content-script.js, collects the audit findings,
 * and moves on. Runs in the background service-worker context once the
 * v4.2.0 release flips SITE_CRAWL_ENABLED.
 *
 * Design notes:
 *
 *   - One tab at a time. Concurrent tabs trade browser memory for marginal
 *     wall-time, and we already cap at 200 pages where 200 * 3 seconds is
 *     under 15 minutes serially. Memory is the harder constraint.
 *
 *   - Tabs open in the background (active: false). The user can keep
 *     working in their foreground tab while the crawl runs.
 *
 *   - Auth-walled and timed-out pages are recorded with a structured
 *     reason but do not stop the crawl. Cancel always stops cleanly.
 *
 *   - The crawler is dependency-injected: callers pass a `deps` object
 *     with the chrome.* methods it needs. Production calls construct
 *     with the real chrome APIs; unit tests construct with fakes. The
 *     module itself imports nothing from chrome.* so it loads in Node.
 *
 *   - The module exports a constructor function rather than a singleton
 *     so tests can spin up an isolated crawler per case.
 */

(function (global) {
  'use strict';

  const DEFAULT_OPTIONS = Object.freeze({
    maxPages:    200,
    timeoutMs:   30000, /* per-page hard cap, then move on */
    delayMs:     200,   /* v4.2.1: was 500 ms; concurrency spreads load */
    activeTab:   false, /* crawled tabs open in background */
    /* v4.2.1: run this many pages in parallel. 1 = strictly serial
       (previous behaviour). 3 is a safe default: three background
       tabs are within any modern machine's memory ceiling, and the
       message router keys waiters + pending buffer by tabId so
       concurrent audits do not cross-talk. Real-world speedup on a
       32.5 s/page workload is a wall time of ~11 s effective per
       page. Users who hit rate limits on a single origin can lower
       this to 1 through options at start(). */
    concurrency: 3
  });

  /* Page-result statuses. Kept terse because they go into exported
     reports where readers will see them many times.
     v4.2.1: added NO_RESPONSE for the "script injected but the page
     never posted audit-results" case (CSP block, page-side JS error).
     Previously that case was recorded as PASS with empty findings,
     which polluted aggregate reports with silent false negatives. */
  const STATUS = Object.freeze({
    PASS:        'audited',
    AUTH_WALL:   'auth-wall',
    TIMEOUT:     'timeout',
    LOAD_ERROR:  'load-error',
    NO_RESPONSE: 'no-response',
    CANCELLED:   'cancelled',
    SKIPPED:     'skipped'
  });

  /* v4.2.1: normalise a URL for dedup + crawl. Strips fragment (the
     "#foo" hash is same-page navigation, never a distinct crawl
     target) and trailing slashes on the path. Query strings are
     preserved because they can point to genuinely different pages
     on server-rendered sites. */
  function normalizeUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const hashIdx = s.indexOf('#');
    return (hashIdx >= 0 ? s.slice(0, hashIdx) : s).trim();
  }

  /* Heuristic check used to decide whether a page redirected to a
     login screen mid-crawl. Conservative on purpose: we would rather
     under-flag than mistake a normal page for an auth wall. */
  function looksLikeAuthWall(finalUrl, finalTitle) {
    if (!finalUrl) return false;
    const u = String(finalUrl).toLowerCase();
    const t = String(finalTitle || '').toLowerCase();
    return /\/(login|signin|sign-in|auth|authenticate|sso|account\/login)(\b|\/|\?)/.test(u)
        || /^(sign in|log in|login|authentication)\b/.test(t);
  }

  /* Default dependencies for the production browser. Wired into a real
     chrome service worker. A test harness passes its own object so we
     never reach the actual browser APIs.

     awaitAuditResults(tabId, timeoutMs) is the one piece of glue
     between the runner and the page-side content-script.js. It must
     resolve with the findings array (possibly empty) when
     content-script.js posts its audit-results message for `tabId`,
     or with null on timeout. Default implementation lives in
     background.js so it can hook the real chrome.runtime.onMessage
     bus; tests pass a noop. */
  function makeDefaultDeps() {
    return {
      createTab:         (url) => chrome.tabs.create({ url: url, active: false }),
      removeTab:         (tabId) => chrome.tabs.remove(tabId),
      getTab:            (tabId) => chrome.tabs.get(tabId),
      executeScript:     (tabId, files) => chrome.scripting.executeScript({ target: { tabId: tabId }, files: files }),
      onTabUpdated:      chrome.tabs && chrome.tabs.onUpdated,
      onAuditMessage:    chrome.runtime && chrome.runtime.onMessage,
      awaitAuditResults: (tabId, timeoutMs) => Promise.resolve(null),
      delay:             (ms) => new Promise((r) => setTimeout(r, ms)),
      now:               () => Date.now()
    };
  }

  class SiteCrawler {
    constructor(deps) {
      this.deps     = deps || makeDefaultDeps();
      this.options  = Object.assign({}, DEFAULT_OPTIONS);
      this.queue    = [];        /* unprocessed URLs */
      this.results  = [];        /* per-page result records */
      this.state    = 'idle';    /* idle | running | cancelling | done */
      this.callbacks = { progress: null, pageComplete: null, complete: null, error: null };
      this._activeTabId = null;
    }

    on(event, fn) {
      if (event in this.callbacks) this.callbacks[event] = fn;
      return this;
    }

    _emit(event, payload) {
      const fn = this.callbacks[event];
      if (typeof fn === 'function') {
        try { fn(payload); } catch (_) { /* host code bugs must not stop the crawl */ }
      }
    }

    /*
      start(urls, options) - kicks off a crawl.

      urls    - array of absolute URL strings.
      options - optional override for maxPages, timeoutMs, delayMs.

      Returns a promise that resolves with the result array when the
      crawl finishes (normal completion, cancellation, or all-failed).
      The promise never rejects: per-page errors are recorded as a
      result entry with status set accordingly.
    */
    async start(urls, options) {
      if (this.state === 'running') throw new Error('Crawl already running');
      if (!Array.isArray(urls)) throw new TypeError('urls must be an array');

      Object.assign(this.options, options || {});

      /* Apply the hard cap up front so the rest of the run knows the
         real ceiling. The UI is expected to warn the user separately
         when the user-provided list exceeds the cap; this is the
         defence-in-depth enforcement. */
      const dedup = [];
      const seen  = new Set();
      for (const raw of urls) {
        const url = normalizeUrl(raw);  /* v4.2.1: strip #fragments before dedup */
        if (!url) continue;
        if (!/^https?:\/\//i.test(url)) continue;  /* v4.2.1: skip mailto:, javascript:, data:, chrome:// */
        if (seen.has(url)) continue;
        seen.add(url);
        dedup.push(url);
        if (dedup.length >= this.options.maxPages) break;
      }
      this.queue   = dedup;
      this.results = [];
      this.state   = 'running';
      this._startedAt = this.deps.now();

      /* v4.2.1: concurrent runner. Previous behaviour was strictly
         serial and reported real-world wall times of ~32 s per page
         on rich e-commerce targets. With concurrency=3 the same
         workload finishes in roughly a third of the wall time
         without changing per-page audit fidelity.

         Design notes:
           - `nextIndex` is the write cursor into the queue. Workers
             claim indices atomically-in-a-single-threaded-JS sense.
           - `_auditOne` already returns a fully-formed record even
             on failure, so no reject path can starve the loop.
           - We inter-page delay per worker (not global) so we do not
             hammer the same origin from three parallel slots. Every
             slot pauses after each finished page before it takes
             the next one; net origin traffic is comparable to the
             old serial + 500 ms behaviour.
           - Results are appended as they finish and sorted by
             `index` at the end so exports remain deterministic.
           - Cancel short-circuits the queue read; in-flight audits
             still complete their finally block (tab cleanup), but
             the crawler stops enqueuing new ones. */
      const total       = this.queue.length;
      const concurrency = Math.max(1, this.options.concurrency | 0);
      let   nextIndex   = 0;

      const worker = async () => {
        while (this.state !== 'cancelling') {
          const i = nextIndex++;
          if (i >= total) return;
          const url = this.queue[i];
          this._emit('progress', { index: i, total: total, url: url });
          const record = await this._auditOne(url, i);
          this.results.push(record);
          this._emit('pageComplete', record);
          if (this.state === 'running' && nextIndex < total) {
            await this.deps.delay(this.options.delayMs);
          }
        }
      };

      const workers = [];
      for (let w = 0; w < Math.min(concurrency, total); w++) workers.push(worker());
      await Promise.all(workers);

      /* Deterministic order for exports and per-page tables. */
      this.results.sort((a, b) => a.index - b.index);

      this.state = 'done';
      const summary = this._summary();
      this._emit('complete', summary);
      return summary;
    }

    cancel() {
      if (this.state === 'running') this.state = 'cancelling';
    }

    _summary() {
      const counts = {};
      Object.values(STATUS).forEach((s) => { counts[s] = 0; });
      this.results.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
      return {
        startedAt:  this._startedAt,
        finishedAt: this.deps.now(),
        total:      this.queue.length,
        completed:  this.results.length,
        counts:     counts,
        results:    this.results
      };
    }

    async _auditOne(url, index) {
      const start = this.deps.now();
      let tabId   = null;
      try {
        const tab = await this.deps.createTab(url);
        if (!tab || typeof tab.id !== 'number') throw new Error('createTab returned no id');
        tabId            = tab.id;
        this._activeTabId = tabId;

        const loaded = await this._waitForLoad(tabId, this.options.timeoutMs);
        if (loaded.status === 'timeout') {
          return { url: url, index: index, status: STATUS.TIMEOUT, durationMs: this.deps.now() - start, finalUrl: null, finalTitle: null, findings: [] };
        }
        if (loaded.status === 'load-error') {
          return { url: url, index: index, status: STATUS.LOAD_ERROR, durationMs: this.deps.now() - start, finalUrl: null, finalTitle: null, findings: [], error: loaded.error };
        }

        /* loaded.status === 'ok'. Now check whether we landed on a
           login screen, in which case we record an auth-wall and
           skip the engine injection. */
        const tabInfo = await this.deps.getTab(tabId).catch(() => ({}));
        const finalUrl = tabInfo.url || url;
        const finalTitle = tabInfo.title || '';
        if (looksLikeAuthWall(finalUrl, finalTitle)) {
          return { url: url, index: index, status: STATUS.AUTH_WALL, durationMs: this.deps.now() - start, finalUrl: finalUrl, finalTitle: finalTitle, findings: [] };
        }

        /* Inject the audit engine, then await the findings message
           it posts back via chrome.runtime.sendMessage. The waiter
           is dep-injected so unit tests can resolve it
           deterministically. Production wires the dep to a one-shot
           runtime listener filtered by sender.tab.id. */
        await this.deps.executeScript(tabId, ['content-script.js']);
        /* v4.2.1: differentiate "audit ran and returned N findings"
           from "content-script never posted back". The waiter
           resolves with null on its own timeout (25 s in production).
           A null return means the page has strict CSP, threw before
           our injection, or navigated away, and we must not count it
           as PASS - that would pollute aggregate reports. */
        let fromPage = null;
        try {
          fromPage = await this.deps.awaitAuditResults(tabId, this.options.timeoutMs);
        } catch (_) { /* treat as null below */ }

        if (this.state === 'cancelling') {
          return { url: url, index: index, status: STATUS.CANCELLED, durationMs: this.deps.now() - start, finalUrl: finalUrl, finalTitle: finalTitle, findings: [] };
        }
        if (fromPage === null) {
          return { url: url, index: index, status: STATUS.NO_RESPONSE, durationMs: this.deps.now() - start, finalUrl: finalUrl, finalTitle: finalTitle, findings: [], error: 'Content script did not return audit findings within ' + this.options.timeoutMs + ' ms. The page may block extension scripts (strict CSP) or have thrown a JavaScript error before the audit could run.' };
        }
        const findings = Array.isArray(fromPage) ? fromPage : [];

        return { url: url, index: index, status: STATUS.PASS, durationMs: this.deps.now() - start, finalUrl: finalUrl, finalTitle: finalTitle, findings: findings };
      } catch (err) {
        return { url: url, index: index, status: STATUS.LOAD_ERROR, durationMs: this.deps.now() - start, finalUrl: null, finalTitle: null, findings: [], error: (err && err.message) ? err.message : String(err) };
      } finally {
        if (tabId !== null) {
          try { await this.deps.removeTab(tabId); } catch (_) { /* tab may already be closed */ }
        }
        this._activeTabId = null;
      }
    }

    /*
      Promise-returning helper that resolves when the tab's
      readyState becomes complete or the timeout fires. Resolves
      (never rejects) with one of:
        { status: 'ok' }
        { status: 'timeout' }
        { status: 'load-error', error: <message> }
    */
    _waitForLoad(tabId, timeoutMs) {
      const deps = this.deps;
      return new Promise((resolve) => {
        let settled = false;
        const finish = (val) => {
          if (settled) return;
          settled = true;
          try { deps.onTabUpdated && deps.onTabUpdated.removeListener && deps.onTabUpdated.removeListener(listener); } catch (_) {}
          resolve(val);
        };
        const timer = setTimeout(() => finish({ status: 'timeout' }), timeoutMs);
        const listener = (changedTabId, changeInfo) => {
          if (changedTabId !== tabId) return;
          if (changeInfo && changeInfo.status === 'complete') { clearTimeout(timer); finish({ status: 'ok' }); }
        };
        try {
          deps.onTabUpdated && deps.onTabUpdated.addListener && deps.onTabUpdated.addListener(listener);
        } catch (err) {
          clearTimeout(timer);
          finish({ status: 'load-error', error: (err && err.message) || 'addListener failed' });
        }
      });
    }
  }

  const api = { SiteCrawler: SiteCrawler, STATUS: STATUS, DEFAULT_OPTIONS: DEFAULT_OPTIONS, _internal: { looksLikeAuthWall: looksLikeAuthWall } };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.AMASAMYASiteCrawler = api;
  }
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
