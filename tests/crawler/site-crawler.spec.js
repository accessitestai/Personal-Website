/**
 * SiteCrawler unit tests.
 *
 * Pure logic tests: no real chrome.tabs / chrome.scripting needed. We
 * construct the crawler with a fake `deps` object that records calls
 * and returns scripted responses. The crawler module itself does not
 * import chrome.* so this runs in plain Node under Playwright's
 * test runner.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');

const { SiteCrawler, STATUS, _internal } = require(
  path.resolve(__dirname, '..', '..', 'amasamya-extension', 'engines', 'site-crawler.js')
);

/* Build a fake deps object whose chrome-API analogues just resolve.

   v4.2.1: `onTabUpdated` now holds a Set of listeners rather than a
   single reference. The real chrome.tabs.onUpdated supports any
   number of registered listeners simultaneously, and the SiteCrawler
   installs one per in-flight audit; with concurrency > 1 the old
   single-slot fake caused earlier workers' listeners to be
   overwritten and their `_waitForLoad` never resolved. Every load
   event is dispatched to every listener; each listener filters on
   its captured tabId. */
function makeFakeDeps(opts) {
  opts = opts || {};
  let tabIdSeq = 1000;
  const events = [];
  const listeners = new Set();
  const deps = {
    createTab: async (url) => {
      events.push({ op: 'createTab', url: url });
      const myTabId = tabIdSeq++;
      /* Schedule the load event AFTER returning the tab so the crawler
         has time to register its listener. Every registered listener
         gets called with this tab's id; they filter internally. */
      setTimeout(() => {
        for (const fn of listeners) {
          try { fn(myTabId, { status: 'complete' }); } catch (_) {}
        }
      }, 5);
      return { id: myTabId };
    },
    removeTab: async (tabId) => { events.push({ op: 'removeTab', tabId: tabId }); },
    getTab:    async (tabId) => ({ id: tabId, url: opts.finalUrl || 'https://example.com/p', title: opts.finalTitle || 'Example' }),
    executeScript: async (tabId, files) => { events.push({ op: 'executeScript', tabId: tabId, files: files }); },
    awaitAuditResults: async (tabId) => opts.findings || [],
    onTabUpdated: {
      addListener:    (fn) => { listeners.add(fn); },
      removeListener: (fn) => { listeners.delete(fn); }
    },
    onAuditMessage: null,
    delay: () => Promise.resolve(),
    now:   (() => { let t = 0; return () => (t += 100); })()
  };
  deps._events = events;
  return deps;
}

test.describe('SiteCrawler', () => {
  test('exports the expected shape', () => {
    expect(typeof SiteCrawler).toBe('function');
    expect(Object.keys(STATUS)).toContain('PASS');
    expect(Object.keys(STATUS)).toContain('AUTH_WALL');
    expect(Object.keys(STATUS)).toContain('TIMEOUT');
  });

  test('audits each URL in order and closes its tab', async () => {
    const deps = makeFakeDeps();
    const crawler = new SiteCrawler(deps);
    const urls = ['https://example.com/a', 'https://example.com/b', 'https://example.com/c'];
    const summary = await crawler.start(urls);
    expect(summary.completed).toBe(3);
    /* Every URL got createTab + executeScript + removeTab. */
    expect(deps._events.filter((e) => e.op === 'createTab').length).toBe(3);
    expect(deps._events.filter((e) => e.op === 'executeScript').length).toBe(3);
    expect(deps._events.filter((e) => e.op === 'removeTab').length).toBe(3);
    /* Each result records the original URL and a status. */
    summary.results.forEach((r, i) => {
      expect(r.url).toBe(urls[i]);
      expect(r.status).toBe(STATUS.PASS);
    });
  });

  test('caps the queue at maxPages even if more URLs are supplied', async () => {
    const deps = makeFakeDeps();
    const crawler = new SiteCrawler(deps);
    const urls = [];
    for (let i = 0; i < 250; i++) urls.push('https://example.com/p' + i);
    const summary = await crawler.start(urls, { maxPages: 50, delayMs: 0 });
    expect(summary.total).toBe(50);
    expect(summary.completed).toBe(50);
    expect(deps._events.filter((e) => e.op === 'createTab').length).toBe(50);
  });

  test('deduplicates URLs', async () => {
    const deps = makeFakeDeps();
    const crawler = new SiteCrawler(deps);
    const urls = ['https://example.com/p', 'https://example.com/p', 'https://example.com/q'];
    const summary = await crawler.start(urls);
    expect(summary.total).toBe(2);
  });

  test('flags auth-wall pages without running the engine', async () => {
    const deps = makeFakeDeps({ finalUrl: 'https://example.com/login', finalTitle: 'Sign in' });
    const crawler = new SiteCrawler(deps);
    const summary = await crawler.start(['https://example.com/dashboard']);
    expect(summary.results[0].status).toBe(STATUS.AUTH_WALL);
    /* No executeScript should have fired on an auth-walled page. */
    expect(deps._events.find((e) => e.op === 'executeScript')).toBeUndefined();
  });

  test('looksLikeAuthWall matches common login URL patterns', () => {
    const yes = [
      ['https://example.com/login',          'Login'],
      ['https://example.com/signin',         ''],
      ['https://example.com/auth/start',     ''],
      ['https://example.com/account/login',  ''],
      ['https://accounts.google.com/sso',    '']
    ];
    const no = [
      ['https://example.com/blog/log-into-fitness', ''],  /* substring, not a path */
      ['https://example.com/products',              ''],
      ['https://example.com/help/signing-pdfs',     '']
    ];
    yes.forEach(([u, t]) => expect(_internal.looksLikeAuthWall(u, t)).toBe(true));
    no.forEach(([u, t])  => expect(_internal.looksLikeAuthWall(u, t)).toBe(false));
  });

  test('cancel mid-run produces a clean partial summary', async () => {
    const deps = makeFakeDeps();
    const crawler = new SiteCrawler(deps);
    const urls = ['a', 'b', 'c', 'd', 'e'].map((s) => 'https://example.com/' + s);
    let cancelled = false;
    crawler.on('pageComplete', (rec) => {
      if (rec.index === 1 && !cancelled) {
        cancelled = true;
        crawler.cancel();
      }
    });
    const summary = await crawler.start(urls, { delayMs: 0 });
    /* At least the first two audits should have completed before cancel
       took effect. The fifth audit should not have started. */
    expect(summary.completed).toBeGreaterThanOrEqual(2);
    expect(summary.completed).toBeLessThan(5);
  });

  test('fires progress, pageComplete, and complete callbacks', async () => {
    const deps = makeFakeDeps();
    const crawler = new SiteCrawler(deps);
    const log = [];
    crawler.on('progress',     (p) => log.push({ kind: 'progress', index: p.index }))
           .on('pageComplete', (r) => log.push({ kind: 'pageComplete', url: r.url }))
           .on('complete',     (s) => log.push({ kind: 'complete', completed: s.completed }));
    await crawler.start(['https://example.com/a', 'https://example.com/b']);
    expect(log.filter((l) => l.kind === 'progress').length).toBe(2);
    expect(log.filter((l) => l.kind === 'pageComplete').length).toBe(2);
    expect(log.filter((l) => l.kind === 'complete').length).toBe(1);
  });

  test('rejects starting while another crawl is running', async () => {
    const deps = makeFakeDeps();
    const crawler = new SiteCrawler(deps);
    const p1 = crawler.start(['https://example.com/a']);
    await expect(crawler.start(['https://example.com/b'])).rejects.toThrow(/already running/);
    await p1;
  });
});
