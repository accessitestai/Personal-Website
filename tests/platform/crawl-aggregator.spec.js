/**
 * Platform crawl aggregator tests (v4.2.0 commit H).
 *
 * Loads the AMASAMYA platform's index.html in a headless tab, simulates
 * a Site Crawl session by dispatching AMASAMYA_extension_crawl_page
 * window-message events with synthetic per-page findings, then asserts
 * the aggregated table groups them correctly.
 *
 * The aggregator's selector-pattern normaliser is the most important
 * piece because that is what turns N copies of "same finding on N
 * pages" into one row with "Pages affected: N".
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const url  = require('url');

const PLATFORM = url.pathToFileURL(
  path.resolve(__dirname, '..', '..', 'amasamya', 'index.html')
).href;

/* Feed N synthetic per-page findings to the platform. Returns the
   group-table rows after the aggregator has rendered. */
async function feedAndCollect(page, pages) {
  await page.evaluate((pages) => {
    pages.forEach((p, i) => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type:       'AMASAMYA_extension_crawl_page',
          url:        p.url,
          finalUrl:   p.url,
          title:      p.title || '',
          status:     p.status || 'audited',
          index:      i,
          findings:   p.findings || [],
          durationMs: 1000,
          timestamp:  new Date().toISOString()
        },
        origin: window.location.origin
      }));
    });
    /* Force a re-render. The listener also calls this on every page,
       but tests want a deterministic moment after all dispatches. */
    if (typeof crawlRenderAggregated === 'function') crawlRenderAggregated();
  }, pages);
  /* Read the rendered rows. Skip drill-down rows (which have role neither
     button nor empty content). */
  return await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#crawl-aggregate-body tr'))
      .filter(tr => tr.getAttribute('role') === 'button');
    return rows.map(tr => {
      const cells = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
      return {
        engine:        cells[0],
        criterion:     cells[1],
        selector:      cells[2],
        severity:      cells[3],
        pagesAffected: cells[4]
      };
    });
  });
}

test.describe('Platform crawl aggregator', () => {
  test.beforeEach(async ({ page }) => {
    /* Block Firebase CDN so the auth guard takes its
       "Firebase unavailable" branch and the page stays on
       index.html instead of redirecting to auth.html. */
    await page.route(/firebasejs|gstatic\.com\/firebasejs/, route => route.abort());
    await page.addInitScript(() => {
      window.__AMASAMYA_crawlSession = null;
    });
    await page.goto(PLATFORM);
    await page.waitForLoadState('domcontentloaded');
  });

  test('aggregator collapses identical findings across pages', async ({ page }) => {
    const finding = {
      engine:    'Images',
      criterion: 'WCAG 2.2 SC 1.1.1',
      selector:  'img.product-thumb',
      severity:  'Serious',
      verdict:   'Fail',
      issue:     'Image missing alt attribute',
      howToFix:  'Add an alt attribute that describes the image'
    };
    const pages = [];
    for (let i = 0; i < 5; i++) {
      pages.push({ url: 'https://example.com/p' + i, status: 'audited', findings: [finding] });
    }
    const rows = await feedAndCollect(page, pages);
    expect(rows.length).toBe(1);
    expect(rows[0].engine).toBe('Images');
    expect(rows[0].pagesAffected).toContain('5');
    expect(rows[0].pagesAffected).toContain('of 5');
  });

  test('selector pattern normalises numeric ids', async ({ page }) => {
    /* Three different ids on three pages, same template. The pattern
       normaliser should collapse #user-1 / #user-2 / #user-3 into
       #user-N and the aggregator should report one row, three pages. */
    const pages = [
      { url: 'https://example.com/u/1', status: 'audited', findings: [{ engine: 'Forms', criterion: 'WCAG 2.2 SC 1.3.1', selector: '#user-1 input', severity: 'Moderate', verdict: 'Fail', issue: 'Missing label' }] },
      { url: 'https://example.com/u/2', status: 'audited', findings: [{ engine: 'Forms', criterion: 'WCAG 2.2 SC 1.3.1', selector: '#user-2 input', severity: 'Moderate', verdict: 'Fail', issue: 'Missing label' }] },
      { url: 'https://example.com/u/3', status: 'audited', findings: [{ engine: 'Forms', criterion: 'WCAG 2.2 SC 1.3.1', selector: '#user-3 input', severity: 'Moderate', verdict: 'Fail', issue: 'Missing label' }] }
    ];
    const rows = await feedAndCollect(page, pages);
    expect(rows.length).toBe(1);
    expect(rows[0].selector).toContain('#user-N');
    expect(rows[0].pagesAffected).toContain('3');
  });

  test('keeps distinct findings as separate rows', async ({ page }) => {
    const pages = [
      { url: 'https://example.com/a', status: 'audited', findings: [
        { engine: 'Images', criterion: 'WCAG 2.2 SC 1.1.1', selector: 'img.a', severity: 'Serious', verdict: 'Fail', issue: 'Missing alt' },
        { engine: 'Forms',  criterion: 'WCAG 2.2 SC 1.3.1', selector: 'input.b', severity: 'Moderate', verdict: 'Fail', issue: 'Missing label' }
      ] },
      { url: 'https://example.com/b', status: 'audited', findings: [
        { engine: 'Images', criterion: 'WCAG 2.2 SC 1.1.1', selector: 'img.a', severity: 'Serious', verdict: 'Fail', issue: 'Missing alt' }
      ] }
    ];
    const rows = await feedAndCollect(page, pages);
    expect(rows.length).toBe(2);
    /* Sort order: most pages affected first. Images appears on 2,
       Forms on 1. */
    expect(rows[0].engine).toBe('Images');
    expect(rows[1].engine).toBe('Forms');
  });

  test('ignores pages with non-audited status', async ({ page }) => {
    const pages = [
      { url: 'https://example.com/a',          status: 'audited',   findings: [{ engine: 'Images', criterion: 'WCAG 2.2 SC 1.1.1', selector: 'img', severity: 'Serious', verdict: 'Fail', issue: 'X' }] },
      { url: 'https://example.com/login',      status: 'auth-wall', findings: [] },
      { url: 'https://example.com/very/slow',  status: 'timeout',   findings: [] }
    ];
    const rows = await feedAndCollect(page, pages);
    expect(rows.length).toBe(1);
    expect(rows[0].pagesAffected).toContain('1');
  });

  test('mode toggle to per-page renders the per-page table', async ({ page }) => {
    const pages = [
      { url: 'https://example.com/a', status: 'audited', findings: [{ engine: 'Images', criterion: 'WCAG 2.2 SC 1.1.1', selector: 'img', severity: 'Serious', verdict: 'Fail', issue: 'X' }] },
      { url: 'https://example.com/b', status: 'audited', findings: [] }
    ];
    await feedAndCollect(page, pages);
    /* Switch to per-page mode. */
    await page.evaluate(() => {
      document.getElementById('crawl-mode-perpage').checked = true;
      document.getElementById('crawl-mode-perpage').dispatchEvent(new Event('change', { bubbles: true }));
    });
    const perPageCount = await page.locator('#crawl-perpage-body tr').count();
    expect(perPageCount).toBe(2);
    const aggHidden = await page.evaluate(() =>
      document.getElementById('crawl-aggregate-table-wrap').style.display);
    expect(aggHidden).toBe('none');
  });

  test('meta strip reports site, page count, distinct issues', async ({ page }) => {
    const pages = [];
    for (let i = 0; i < 3; i++) {
      pages.push({ url: 'https://acme.com/page' + i, status: 'audited', findings: [
        { engine: 'Images', criterion: 'WCAG 2.2 SC 1.1.1', selector: 'img', severity: 'Serious', verdict: 'Fail', issue: 'X' }
      ] });
    }
    await feedAndCollect(page, pages);
    const meta = await page.evaluate(() => ({
      site:    document.getElementById('crawl-aggregate-site').textContent,
      count:   document.getElementById('crawl-ingest-count').textContent,
      groups:  document.getElementById('crawl-aggregate-groups').textContent
    }));
    expect(meta.site).toContain('acme.com');
    expect(meta.count).toBe('3');
    expect(meta.groups).toContain('1');
  });
});
