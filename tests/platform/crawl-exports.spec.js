/**
 * Platform crawl export tests (v4.2.0 commit I).
 *
 * Feed a synthetic crawl session into the platform, then call each
 * export generator directly. We capture the download payload by
 * intercepting URL.createObjectURL and replacing _crawlDownload so
 * the test asserts on the actual content the user would receive.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const url  = require('url');

const PLATFORM = url.pathToFileURL(
  path.resolve(__dirname, '..', '..', 'amasamya', 'index.html')
).href;

const SAMPLE_PAGES = [
  { url: 'https://acme.com/a', status: 'audited', title: 'A', findings: [
    { engine: 'Images', criterion: 'WCAG 2.2 SC 1.1.1', selector: 'img.a', severity: 'Serious', verdict: 'Fail', issue: 'Missing alt', howToFix: 'Add an alt attribute' },
    { engine: 'Forms',  criterion: 'WCAG 2.2 SC 1.3.1', selector: '#user-1 input', severity: 'Moderate', verdict: 'Fail', issue: 'Missing label', howToFix: 'Wrap with <label>' }
  ] },
  { url: 'https://acme.com/b', status: 'audited', title: 'B', findings: [
    { engine: 'Images', criterion: 'WCAG 2.2 SC 1.1.1', selector: 'img.a', severity: 'Serious', verdict: 'Fail', issue: 'Missing alt', howToFix: 'Add an alt attribute' }
  ] },
  { url: 'https://acme.com/login', status: 'auth-wall', title: 'Sign in', findings: [] }
];

async function seedSession(page, pages) {
  await page.evaluate((pages) => {
    pages.forEach((p, i) => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type:'AMASAMYA_extension_crawl_page',
          url: p.url, finalUrl: p.url, title: p.title || '',
          status: p.status || 'audited',
          index: i, findings: p.findings || [], durationMs: 1000,
          timestamp: new Date().toISOString()
        },
        origin: window.location.origin
      }));
    });
    if (typeof crawlRenderAggregated === 'function') crawlRenderAggregated();
  }, pages);
}

/* Intercept _crawlDownload so we can read the produced content
   without actually triggering a browser file save. The override
   stores filename, mimeType, content on window for the test to read. */
async function installDownloadCapture(page) {
  await page.evaluate(() => {
    window.__lastDownload = null;
    window._crawlDownload = function (filename, mimeType, content) {
      window.__lastDownload = { filename: filename, mimeType: mimeType, content: content };
    };
  });
}

test.describe('Platform crawl exports', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/firebasejs|gstatic\.com\/firebasejs/, route => route.abort());
    await page.addInitScript(() => { window.__AMASAMYA_crawlSession = null; });
    await page.goto(PLATFORM);
    await page.waitForLoadState('domcontentloaded');
    await seedSession(page, SAMPLE_PAGES);
    await installDownloadCapture(page);
  });

  test('HTML export emits a well-formed report stamped with the platform version', async ({ page }) => {
    await page.evaluate(() => crawlExportHtml());
    const dl = await page.evaluate(() => window.__lastDownload);
    expect(dl).not.toBeNull();
    expect(dl.filename).toMatch(/\.html$/);
    expect(dl.mimeType).toBe('text/html');
    expect(dl.content).toContain('AMASAMYA Site Crawl Report');
    expect(dl.content).toContain('Aggregated Findings');
    expect(dl.content).toMatch(/AMASAMYA v\d+\.\d+\.\d+/);
    /* The two distinct issues should be in the table. */
    expect(dl.content).toContain('Images');
    expect(dl.content).toContain('Forms');
  });

  test('CSV by template has the expected header + row for each group', async ({ page }) => {
    await page.evaluate(() => crawlExportCsvByTemplate());
    const dl = await page.evaluate(() => window.__lastDownload);
    expect(dl.filename).toBe('AMASAMYA-site-crawl-by-template.csv');
    const lines = dl.content.split('\r\n');
    expect(lines[0]).toContain('Engine,Criterion,Selector pattern,Severity,Verdict,Pages affected');
    /* Two distinct issues = 2 data rows (header + 2). */
    expect(lines.length).toBe(3);
    /* Highest-impact row comes first: Images on 2 of 3 pages. */
    expect(lines[1]).toContain('Images');
    expect(lines[1]).toContain(',2,3,');
  });

  test('CSV by page has one row per (page, finding) including auth-wall pages', async ({ page }) => {
    await page.evaluate(() => crawlExportCsvByPage());
    const dl = await page.evaluate(() => window.__lastDownload);
    expect(dl.filename).toBe('AMASAMYA-site-crawl-by-page.csv');
    const lines = dl.content.split('\r\n');
    expect(lines[0]).toContain('Page index,URL,Status');
    /* Page A: 2 findings -> 2 rows.
       Page B: 1 finding  -> 1 row.
       Page C: auth-wall  -> 1 empty-findings row.
       Plus header = 5 lines. */
    expect(lines.length).toBe(5);
    expect(lines.find(l => l.includes('auth-wall'))).toBeTruthy();
  });

  test('JSON raw includes both per-page records and pre-computed groups', async ({ page }) => {
    await page.evaluate(() => crawlExportJsonRaw());
    const dl = await page.evaluate(() => window.__lastDownload);
    expect(dl.filename).toBe('AMASAMYA-site-crawl.json');
    expect(dl.mimeType).toBe('application/json');
    const payload = JSON.parse(dl.content);
    expect(payload.tool).toBe('AMASAMYA');
    expect(payload.kind).toBe('site-crawl-session');
    expect(payload.site).toBe('acme.com');
    expect(payload.totalPages).toBe(3);
    expect(Array.isArray(payload.groups)).toBe(true);
    expect(payload.groups.length).toBe(2);
    expect(Array.isArray(payload.pages)).toBe(true);
    expect(payload.pages.length).toBe(3);
    /* groups[0] should be the most-affected one with affectedUrls
       deduplicated. */
    expect(payload.groups[0].pagesAffected).toBe(2);
    expect(payload.groups[0].affectedUrls.length).toBe(2);
  });

  test('export bails cleanly when no crawl data is present', async ({ page }) => {
    /* Clear the session entirely and reset the capture. */
    await page.evaluate(() => {
      window.__AMASAMYA_crawlSession = null;
      window.__lastDownload = null;
    });
    await page.evaluate(() => crawlExportHtml());
    /* With no session, the export must produce no download payload.
       This is the observable contract: no surprise file save when
       the user clicks Export on an empty session. */
    const dl = await page.evaluate(() => window.__lastDownload);
    expect(dl).toBeNull();
  });
});
