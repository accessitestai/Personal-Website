/**
 * Site Crawl screen-reader announcements - regression suite for the
 * v4.2.0 K calibration accessibility fixes.
 *
 * Loads the side panel HTML with mocked chrome.* APIs, then dispatches
 * the site-crawl-ui messages background.js would send, then asserts:
 *
 *   1. The progress label is on an aria-live="polite" region with
 *      aria-atomic="true" so updates are announced without focus.
 *   2. The progressbar carries an aria-valuetext that reads as a
 *      sentence ("Page 3 of 10, 30 percent complete") rather than a
 *      bare percent.
 *   3. The polite live region (#live-region-polite) receives a
 *      per-page completion announcement that includes the URL path,
 *      status, finding count, and duration.
 *   4. The results-table rows have an aria-label that combines the
 *      cells into one readable sentence.
 *   5. The summary on complete consolidates counts into one sentence
 *      instead of four badge values.
 *
 * The flag SITE_CRAWL_ENABLED is read at panel.js load time. For the
 * test we patch the panel.js source on-the-fly so the test harness
 * exercises the flag-on code path without depending on which
 * release branch the working tree is on.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const url  = require('url');
const fs   = require('fs');

const PANEL_PATH = path.resolve(__dirname, '..', '..', 'amasamya-extension', 'sidepanel', 'panel.html');
const PANEL_JS_PATH = path.resolve(__dirname, '..', '..', 'amasamya-extension', 'sidepanel', 'panel.js');
const PANEL = url.pathToFileURL(PANEL_PATH).href;

const CHROME_STUB = `
  window.chrome = window.chrome || {};
  chrome.runtime = chrome.runtime || {
    sendMessage: () => Promise.resolve(),
    onMessage:   { addListener: (fn) => { window.__panelOnMessage = fn; } },
    lastError:   null
  };
  chrome.storage = chrome.storage || {
    local:   { get: () => Promise.resolve({}), set: () => Promise.resolve() },
    session: { get: (k, cb) => cb && cb({}), remove: () => {} }
  };
  chrome.tabs = chrome.tabs || {
    query: () => Promise.resolve([{ id: 0, url: 'https://example.com', title: 'Example' }])
  };
  chrome.scripting = chrome.scripting || { executeScript: () => Promise.resolve() };
`;

/* Helper: send a site-crawl-ui message into the panel via the
   registered chrome.runtime.onMessage listener. */
async function sendCrawlUi(page, message) {
  await page.evaluate((m) => {
    const fn = window.__panelOnMessage;
    if (typeof fn === 'function') fn(Object.assign({ type: 'site-crawl-ui' }, m));
  }, message);
}

test.describe('Site Crawl screen-reader announcements (K calibration fix)', () => {
  test.beforeEach(async ({ page }) => {
    /* Patch SITE_CRAWL_ENABLED to true at load time by intercepting
       the panel.js fetch and rewriting that single line. Keeps the
       working-tree default off while still exercising the flag-on
       code path here. */
    const realJs = fs.readFileSync(PANEL_JS_PATH, 'utf8');
    const patched = realJs.replace(
      /const SITE_CRAWL_ENABLED = false;[^\n]*/,
      'const SITE_CRAWL_ENABLED = true;'
    );
    await page.route('**/panel.js', route => {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: patched });
    });
    await page.addInitScript(CHROME_STUB);
    await page.goto(PANEL);
    await page.waitForLoadState('domcontentloaded');
  });

  test('progress label has aria-live=polite and aria-atomic=true', async ({ page }) => {
    const label = page.locator('#crawl-progress-label');
    await expect(label).toHaveAttribute('aria-live', 'polite');
    await expect(label).toHaveAttribute('aria-atomic', 'true');
  });

  test('progress bar gets aria-valuetext sentence on progress phase', async ({ page }) => {
    await sendCrawlUi(page, { phase: 'queued', total: 10 });
    await sendCrawlUi(page, { phase: 'progress', index: 2, total: 10, url: 'https://example.com/about' });
    const valueText = await page.locator('#crawl-progress-bar').getAttribute('aria-valuetext');
    expect(valueText).toMatch(/Page 3 of 10/);
    /* index is zero-based, so index 2 == 2 of 10 already audited == 20%. */
    expect(valueText).toMatch(/20 percent complete/);
  });

  test('progress label text reads as a sentence with one-based index and URL path', async ({ page }) => {
    await sendCrawlUi(page, { phase: 'queued', total: 5 });
    await sendCrawlUi(page, { phase: 'progress', index: 0, total: 5, url: 'https://example.com/products?category=shoes' });
    const labelText = await page.locator('#crawl-progress-label').textContent();
    expect(labelText).toContain('Auditing page 1 of 5');
    /* URL path only, not the full URL. */
    expect(labelText).toContain('/products?category=shoes');
    expect(labelText).not.toContain('https://');
  });

  test('per-page completion fires a polite live announcement with path, status, findings, seconds', async ({ page }) => {
    await sendCrawlUi(page, { phase: 'queued', total: 3 });
    await sendCrawlUi(page, { phase: 'pageComplete', record: {
      url: 'https://example.com/checkout',
      finalUrl: 'https://example.com/checkout',
      title: 'Checkout',
      status: 'audited',
      index: 0,
      durationMs: 2400,
      findings: [{}, {}, {}, {}, {}]   /* five fake findings */
    } });
    /* The polite region clears itself, then sets the text via a
       50 ms setTimeout. Wait for it to settle, then read. */
    await page.waitForTimeout(120);
    const polite = await page.locator('#live-region-polite').textContent();
    expect(polite).toMatch(/Page 1 complete/);
    expect(polite).toContain('/checkout');
    expect(polite).toMatch(/Audited successfully/);
    expect(polite).toMatch(/5 findings/);
    expect(polite).toMatch(/2\.4 seconds/);
  });

  test('auth-wall page completion does not promise a findings count', async ({ page }) => {
    await sendCrawlUi(page, { phase: 'queued', total: 1 });
    await sendCrawlUi(page, { phase: 'pageComplete', record: {
      url: 'https://example.com/login',
      status: 'auth-wall',
      index: 0,
      durationMs: 800,
      findings: []
    } });
    await page.waitForTimeout(120);
    const polite = await page.locator('#live-region-polite').textContent();
    expect(polite).toMatch(/Skipped, page is behind a sign in/);
    /* Findings clause is suppressed for non-audited statuses so the
       user is not told "0 findings" for a page that was never run. */
    expect(polite).not.toMatch(/0 findings/);
    expect(polite).not.toMatch(/finding/);
  });

  test('appended results-table row carries a sentence aria-label', async ({ page }) => {
    await sendCrawlUi(page, { phase: 'queued', total: 1 });
    await sendCrawlUi(page, { phase: 'pageComplete', record: {
      url: 'https://example.com/p',
      status: 'audited',
      index: 4,
      durationMs: 1500,
      findings: [{}]
    } });
    const ariaLabel = await page.locator('#crawl-results-body tr').first().getAttribute('aria-label');
    expect(ariaLabel).toMatch(/Row 5/);
    expect(ariaLabel).toContain('https://example.com/p');
    expect(ariaLabel).toMatch(/Audited successfully/);
    expect(ariaLabel).toMatch(/1 finding/);
    expect(ariaLabel).toMatch(/1\.5 seconds/);
  });

  test('complete phase announces a consolidated summary sentence', async ({ page }) => {
    await sendCrawlUi(page, { phase: 'queued', total: 3 });
    await sendCrawlUi(page, { phase: 'pageComplete', record: { url: 'https://e.com/a', status: 'audited',   index: 0, durationMs: 1000, findings: [] } });
    await sendCrawlUi(page, { phase: 'pageComplete', record: { url: 'https://e.com/b', status: 'auth-wall', index: 1, durationMs: 500,  findings: [] } });
    await sendCrawlUi(page, { phase: 'pageComplete', record: { url: 'https://e.com/c', status: 'timeout',   index: 2, durationMs: 25000, findings: [] } });
    await sendCrawlUi(page, { phase: 'complete' });
    await page.waitForTimeout(120);
    const polite = await page.locator('#live-region-polite').textContent();
    expect(polite).toMatch(/Crawl complete/);
    expect(polite).toMatch(/1 audited/);
    expect(polite).toMatch(/1 skipped at sign in/);
    expect(polite).toMatch(/1 timed out/);
  });

  test('error phase routes through the assertive live region', async ({ page }) => {
    await sendCrawlUi(page, { phase: 'queued', total: 1 });
    await sendCrawlUi(page, { phase: 'error', message: 'CSP blocked injection' });
    await page.waitForTimeout(120);
    const assertive = await page.locator('#live-region-assertive').textContent();
    expect(assertive).toMatch(/Crawl error: CSP blocked injection/);
  });

  test('progress region has its own labelled landmark', async ({ page }) => {
    const region = page.locator('#crawl-progress-wrap');
    await expect(region).toHaveAttribute('role', 'region');
    await expect(region).toHaveAttribute('aria-label', /progress/i);
  });
});
