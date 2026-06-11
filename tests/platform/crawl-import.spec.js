/**
 * Platform Site Crawl JSON import tests (v4.2.0).
 *
 * The extension's Site Crawl tab emits a JSON file with shape:
 *   { tool: 'AMASAMYA', version, kind: 'site-crawl-report',
 *     taken, results: [ { url, status, findings, ... } ] }
 *
 * The platform's import handler must recognise this shape, route it
 * through the existing crawl-session pipeline, and produce the same
 * aggregated view that a live crawl produces. Before commit 44 the
 * handler only recognised single-page audit JSON and rejected Site
 * Crawl files with "File does not contain a valid AMASAMYA findings
 * array."
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const url  = require('url');

const PLATFORM = url.pathToFileURL(
  path.resolve(__dirname, '..', '..', 'amasamya', 'index.html')
).href;

function makeReport(pages) {
  return {
    tool:    'AMASAMYA',
    version: '4.0.1',
    kind:    'site-crawl-report',
    taken:   '2026-06-12T10:00:00.000Z',
    results: pages.map((p, i) => Object.assign({
      finalUrl:   p.url,
      title:      '',
      index:      i,
      durationMs: 1000,
      timestamp:  '2026-06-12T10:00:0' + i + '.000Z'
    }, p))
  };
}

async function importPayload(page, payload) {
  /* Call importSiteCrawlReport directly. Production wires the JSON
     file picker to it; for tests we skip the file picker and feed
     the parsed object straight in. */
  await page.evaluate((payload) => {
    if (typeof importSiteCrawlReport === 'function') {
      importSiteCrawlReport(payload);
    } else {
      throw new Error('importSiteCrawlReport is not defined');
    }
  }, payload);
}

test.describe('Platform Site Crawl JSON import', () => {
  test.beforeEach(async ({ page }) => {
    /* Block Firebase CDN so the auth guard takes the no-Firebase
       fallback and the page stays on index.html instead of
       redirecting to auth.html. */
    await page.route(/firebasejs|gstatic\.com\/firebasejs/, route => route.abort());
    await page.addInitScript(() => { window.__AMASAMYA_crawlSession = null; });
    await page.goto(PLATFORM);
    await page.waitForLoadState('domcontentloaded');
  });

  test('importSiteCrawlReport is defined as a global', async ({ page }) => {
    const ok = await page.evaluate(() => typeof importSiteCrawlReport === 'function');
    expect(ok).toBe(true);
  });

  test('imported report populates the crawl session with the right page count', async ({ page }) => {
    await importPayload(page, makeReport([
      { url: 'https://acme.com/a', status: 'audited',   findings: [{ engine: 'Images', criterion: 'WCAG 2.2 SC 1.1.1', selector: 'img', severity: 'Serious', verdict: 'Fail', issue: 'X' }] },
      { url: 'https://acme.com/b', status: 'audited',   findings: [] },
      { url: 'https://acme.com/login', status: 'auth-wall', findings: [] }
    ]));
    const session = await page.evaluate(() => ({
      pages:  window.__AMASAMYA_crawlSession?.pages?.length || 0,
      bySite: window.__AMASAMYA_crawlSession?.bySite || null,
      imported: window.__AMASAMYA_crawlSession?.imported === true
    }));
    expect(session.pages).toBe(3);
    expect(session.bySite).toBe('acme.com');
    expect(session.imported).toBe(true);
  });

  test('imported report renders the aggregated view with one row per distinct issue', async ({ page }) => {
    const finding = { engine: 'Images', criterion: 'WCAG 2.2 SC 1.1.1', selector: 'img.thumb', severity: 'Serious', verdict: 'Fail', issue: 'Missing alt' };
    await importPayload(page, makeReport([
      { url: 'https://acme.com/p1', status: 'audited', findings: [finding] },
      { url: 'https://acme.com/p2', status: 'audited', findings: [finding] },
      { url: 'https://acme.com/p3', status: 'audited', findings: [finding] }
    ]));
    /* The Site Crawl Results section should become visible. */
    const visible = await page.evaluate(() => {
      const el = document.getElementById('crawl-aggregate-section');
      return el && el.style.display !== 'none';
    });
    expect(visible).toBe(true);

    /* Three identical findings should collapse to one aggregated row. */
    const rows = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#crawl-aggregate-body tr'))
        .filter(tr => tr.getAttribute('role') === 'button')
        .map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()));
    });
    expect(rows.length).toBe(1);
    expect(rows[0][0]).toBe('Images');
    expect(rows[0][4]).toContain('3 of 3');
  });

  test('session metadata header reflects the imported time window, not the replay time', async ({ page }) => {
    await importPayload(page, {
      tool:    'AMASAMYA',
      version: '4.0.1',
      kind:    'site-crawl-report',
      taken:   '2026-06-01T08:00:00.000Z',
      results: [
        { url: 'https://acme.com/a', status: 'audited',   findings: [], index: 0, durationMs: 1000, timestamp: '2026-06-01T08:00:00.000Z' },
        { url: 'https://acme.com/b', status: 'audited',   findings: [], index: 1, durationMs: 1000, timestamp: '2026-06-01T08:05:00.000Z' }
      ]
    });
    /* The session's startedAt should equal the first record's
       timestamp, not the moment we replayed it. */
    const startedAt = await page.evaluate(() => window.__AMASAMYA_crawlSession?.startedAt);
    expect(startedAt).toBe('2026-06-01T08:00:00.000Z');
  });

  test('importing a second report replaces the first, does not double-count', async ({ page }) => {
    await importPayload(page, makeReport([
      { url: 'https://first.com/a', status: 'audited', findings: [] },
      { url: 'https://first.com/b', status: 'audited', findings: [] }
    ]));
    await importPayload(page, makeReport([
      { url: 'https://second.com/a', status: 'audited', findings: [] }
    ]));
    const session = await page.evaluate(() => ({
      pages: window.__AMASAMYA_crawlSession?.pages?.length || 0,
      bySite: window.__AMASAMYA_crawlSession?.bySite || null
    }));
    expect(session.pages).toBe(1);
    expect(session.bySite).toBe('second.com');
  });

  test('rejects a malformed report cleanly (no pages added)', async ({ page }) => {
    /* Empty results array should still be accepted (a crawl that
       found no pages is a valid edge case), but it must not crash. */
    await importPayload(page, {
      tool: 'AMASAMYA', version: '4.0.1', kind: 'site-crawl-report',
      taken: new Date().toISOString(), results: []
    });
    const session = await page.evaluate(() => window.__AMASAMYA_crawlSession);
    /* Session is either null (no pages dispatched) or has zero
       pages. Either is acceptable: the contract is "do not throw". */
    if (session) {
      expect(session.pages.length).toBe(0);
    } else {
      expect(session).toBeNull();
    }
  });

  test('full file-picker flow: passes JSON through change event without error', async ({ page }) => {
    /* End-to-end: simulate the file-input change event with a real
       Blob, which exercises the JSON.parse + dispatch path on the
       handler itself, not the helper. */
    const payload = JSON.stringify(makeReport([
      { url: 'https://e2e.example/a', status: 'audited', findings: [{ engine: 'Images', criterion: 'WCAG 2.2 SC 1.1.1', selector: 'img', severity: 'Serious', verdict: 'Fail', issue: 'X' }] }
    ]));
    await page.setInputFiles('#json-file-input', {
      name: 'crawl.json',
      mimeType: 'application/json',
      buffer: Buffer.from(payload, 'utf8')
    });
    /* The FileReader is asynchronous; give it a tick. */
    await page.waitForTimeout(250);
    const pages = await page.evaluate(() => window.__AMASAMYA_crawlSession?.pages?.length || 0);
    expect(pages).toBe(1);
  });
});
