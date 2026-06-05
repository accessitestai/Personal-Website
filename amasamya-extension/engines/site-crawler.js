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
    maxPages:   200,
    timeoutMs:  30000, /* per-page hard cap, then move on */
    delayMs:    500,   /* gap between tab close and next tab open */
    activeTab:  false  /* crawled tabs open in background */
  });

  /* Page-result statuses. Kept terse because they go into exported
     reports where readers will see them many times. */
  const STATUS = Object.freeze({
    PASS:       'audited',
    AUTH_WALL:  'auth-wall',
    TIMEOUT:    'timeout',
    LOAD_ERROR: 'load-error',
    CANCELLED:  'cancelled',
    SKIPPED:    'skipped'
  });

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
        const url = String(raw || '').trim();
        if (!url || seen.has(url)) continue;
        seen.add(url);
        dedup.push(url);
        if (dedup.length >= this.options.maxPages) break;
      }
      this.queue   = dedup;
      this.results = [];
      this.state   = 'running';
      this._startedAt = this.deps.now();

      for (let i = 0; i < this.queue.length; i++) {
        if (this.state === 'cancelling') break;
        const url = this.queue[i];
        this._emit('progress', { index: i, total: this.queue.length, url: url });
        const record = await this._auditOne(url, i);
        this.results.push(record);
        this._emit('pageComplete', record);
        /* Small inter-page delay so we do not hammer the same origin
           hard enough to look like a denial-of-service to a WAF. */
        if (this.state === 'running' && i < this.queue.length - 1) {
          await this.deps.delay(this.options.delayMs);
        }
      }

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
        let findings = [];
        try {
          const fromPage = await this.deps.awaitAuditResults(tabId, this.options.timeoutMs);
          if (Array.isArray(fromPage)) findings = fromPage;
        } catch (_) { /* keep findings empty */ }

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
