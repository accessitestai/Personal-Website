/**
 * Platform crawl session metadata tests (v4.2.0 commit J).
 *
 * Asserts that the metadata header above the aggregated table
 * reports site, time window, and per-status page counts
 * correctly. The header is a definition list so screen-reader
 * users can navigate it with NVDA's term quick-key.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const url  = require('url');

const PLATFORM = url.pathToFileURL(
  path.resolve(__dirname, '..', '..', 'amasamya', 'index.html')
).href;

async function feed(page, pages, sessionStartedAt) {
  await page.evaluate(({ pages, sessionStartedAt }) => {
    /* Pre-seed startedAt so the duration calculation has a fixed
       base. The listener creates the session on the first message
       it receives, copying startedAt = new Date().toISOString(), so
       we have to set it ourselves before dispatching. */
    if (!window.__AMASAMYA_crawlSession) {
      window.__AMASAMYA_crawlSession = {
        startedAt: sessionStartedAt,
        pages: [],
        bySite: null,
        bySiteUrl: null
      };
    } else {
      window.__AMASAMYA_crawlSession.startedAt = sessionStartedAt;
    }
    pages.forEach((p, i) => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'AMASAMYA_extension_crawl_page',
          url: p.url, finalUrl: p.url, title: p.title || '',
          status: p.status || 'audited',
          index: i, findings: p.findings || [], durationMs: 1000,
          timestamp: p.timestamp || new Date().toISOString()
        },
        origin: window.location.origin
      }));
    });
    if (typeof crawlRenderAggregated === 'function') crawlRenderAggregated();
  }, { pages, sessionStartedAt });
}

test.describe('Platform crawl session metadata header', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/firebasejs|gstatic\.com\/firebasejs/, route => route.abort());
    await page.addInitScript(() => { window.__AMASAMYA_crawlSession = null; });
    await page.goto(PLATFORM);
    await page.waitForLoadState('domcontentloaded');
  });

  test('renders site host, started, finished, and a non-zero duration', async ({ page }) => {
    const startedAt  = '2026-06-10T10:00:00.000Z';
    const finishedAt = '2026-06-10T10:05:30.000Z';
    await feed(page, [
      { url: 'https://acme.com/a', status: 'audited', findings: [], timestamp: finishedAt }
    ], startedAt);

    const meta = await page.evaluate(() => ({
      site:     document.getElementById('crawl-meta-site').textContent,
      started:  document.getElementById('crawl-meta-started').textContent,
      finished: document.getElementById('crawl-meta-finished').textContent,
      duration: document.getElementById('crawl-meta-duration').textContent
    }));
    expect(meta.site).toContain('acme.com');
    expect(meta.started).not.toBe('-');
    expect(meta.finished).not.toBe('-');
    expect(meta.duration).toMatch(/min|s/);
  });

  test('counts pages by status', async ({ page }) => {
    await feed(page, [
      { url: 'https://acme.com/a',    status: 'audited' },
      { url: 'https://acme.com/b',    status: 'audited' },
      { url: 'https://acme.com/c',    status: 'audited' },
      { url: 'https://acme.com/login', status: 'auth-wall' },
      { url: 'https://acme.com/slow', status: 'timeout' },
      { url: 'https://acme.com/x',    status: 'load-error' }
    ], '2026-06-10T10:00:00.000Z');

    const counts = await page.evaluate(() => ({
      audited: document.getElementById('crawl-meta-audited').textContent,
      auth:    document.getElementById('crawl-meta-auth').textContent,
      timeout: document.getElementById('crawl-meta-timeout').textContent,
      errors:  document.getElementById('crawl-meta-errors').textContent
    }));
    expect(counts.audited).toBe('3');
    expect(counts.auth).toBe('1');
    expect(counts.timeout).toBe('1');
    expect(counts.errors).toBe('1');
  });

  test('metadata is a definition list with role=group and accessible label', async ({ page }) => {
    await feed(page, [
      { url: 'https://acme.com/a', status: 'audited' }
    ], '2026-06-10T10:00:00.000Z');

    const dl = page.locator('#crawl-session-meta');
    await expect(dl).toHaveAttribute('role', 'group');
    await expect(dl).toHaveAttribute('aria-label', /metadata/i);
    /* Eight dt/dd pairs total. */
    const dtCount = await page.locator('#crawl-session-meta dt').count();
    const ddCount = await page.locator('#crawl-session-meta dd').count();
    expect(dtCount).toBe(8);
    expect(ddCount).toBe(8);
  });
});
