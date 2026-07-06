/**
 * Side-panel regression suite (v4.2.0 safety net).
 *
 * Pinned tests that assert the existing side-panel structure keeps
 * working as v4.2.0 commits start touching the UI. These run BEFORE
 * any new tab is added so they capture the v4.0.1 behaviour as the
 * baseline. If a future commit accidentally breaks tab navigation,
 * the existing audit table, or the Close button, these fail loud.
 *
 * The side panel runs in chrome-extension:// context with real
 * chrome.* APIs. To test it under Playwright we load the HTML via
 * file:// URL and stub the chrome.* API surface that panel.js
 * touches at module load and on DOMContentLoaded. The stubs are
 * no-ops returning empty promises - we are testing the static
 * structure and the local keyboard handlers, not the chrome-API
 * integration.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const url  = require('url');

const PANEL = url.pathToFileURL(
  path.resolve(__dirname, '..', '..', 'amasamya-extension', 'sidepanel', 'panel.html')
).href;

/* Inject this BEFORE panel.js runs so the chrome.* references at
   top of file do not throw. We mock only the surface panel.js
   actually touches at load. */
const CHROME_STUB = `
  window.chrome = window.chrome || {};
  chrome.runtime = chrome.runtime || {
    sendMessage: () => Promise.resolve(),
    onMessage:   { addListener: () => {} },
    lastError:   null
  };
  chrome.storage = chrome.storage || {
    local:   { get: () => Promise.resolve({}), set: () => Promise.resolve() },
    session: { get: (k, cb) => cb && cb({}), remove: () => {} }
  };
  chrome.tabs = chrome.tabs || {
    query: () => Promise.resolve([{ id: 0, url: 'https://example.com', title: 'Example' }])
  };
  chrome.scripting = chrome.scripting || {
    executeScript: () => Promise.resolve()
  };
`;

test.describe('Side panel: existing structure regression safety net', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(CHROME_STUB);
    await page.goto(PANEL);
    /* Give DOMContentLoaded handlers a tick to run. */
    await page.waitForLoadState('domcontentloaded');
  });

  test('header shows brand, version, and Close button', async ({ page }) => {
    const brand   = await page.locator('header h1').textContent();
    const version = await page.locator('header .version').textContent();
    const close   = page.locator('#close-panel-btn');
    expect(brand).toBe('AMASAMYA');
    expect(version).toMatch(/^v\d+\.\d+/);
    await expect(close).toBeVisible();
    await expect(close).toHaveAttribute('aria-label', /Close/i);
  });

  test('visible tabs include WCAG / Visual / Settings (Site Crawl present when v4.2.0 flag is on)', async ({ page }) => {
    /* Hidden tabs must not appear in the user-facing tab cycle.
       Use the same :not([hidden]) filter the panel.js keydown
       handler uses. The Site Crawl tab is visible iff
       SITE_CRAWL_ENABLED is true in panel.js. Both states are
       acceptable; the assertion below tolerates either. */
    const tabs = await page.locator('.panel-tab:not([hidden])').allTextContents();
    /* Pre-v4.2.0 (flag off): three tabs.
       v4.2.0 (flag on): four tabs, Site Crawl at the end. */
    expect([
      ['WCAG Audit', 'Visual Audit', 'Settings'],
      ['WCAG Audit', 'Visual Audit', 'Settings', 'Site Crawl']
    ]).toContainEqual(tabs);
  });

  test('only the WCAG tab is selected by default', async ({ page }) => {
    const wcagSelected     = await page.locator('#ptab-wcag').getAttribute('aria-selected');
    const visualSelected   = await page.locator('#ptab-visual').getAttribute('aria-selected');
    const settingsSelected = await page.locator('#ptab-settings').getAttribute('aria-selected');
    expect(wcagSelected).toBe('true');
    expect(visualSelected).toBe('false');
    expect(settingsSelected).toBe('false');
    /* And the corresponding panels show / hide. */
    await expect(page.locator('#ppanel-wcag')).toBeVisible();
    await expect(page.locator('#ppanel-visual')).toBeHidden();
    await expect(page.locator('#ppanel-settings')).toBeHidden();
  });

  test('ArrowRight on the focused tab advances selection', async ({ page }) => {
    await page.locator('#ptab-wcag').focus();
    await page.keyboard.press('ArrowRight');
    expect(await page.locator('#ptab-visual').getAttribute('aria-selected')).toBe('true');
    expect(await page.locator('#ptab-wcag').getAttribute('aria-selected')).toBe('false');
    await expect(page.locator('#ppanel-visual')).toBeVisible();
    await expect(page.locator('#ppanel-wcag')).toBeHidden();
  });

  test('ArrowLeft wraps from WCAG to the last visible tab', async ({ page }) => {
    /* Last visible tab depends on whether the v4.2.0 Site Crawl flag
       is on. With flag off the last visible tab is Settings. With
       flag on the last visible tab is Site Crawl. Either is acceptable
       so long as ArrowLeft from WCAG lands on the actual last visible
       tab the keyboard handler sees. */
    await page.locator('#ptab-wcag').focus();
    await page.keyboard.press('ArrowLeft');
    const expectedLast = await page.evaluate(() => {
      const visible = Array.from(document.querySelectorAll('.panel-tab')).filter(t => !t.hidden);
      return visible[visible.length - 1].id;
    });
    expect(await page.locator('#' + expectedLast).getAttribute('aria-selected')).toBe('true');
  });

  test('End key jumps to the last visible tab', async ({ page }) => {
    await page.locator('#ptab-wcag').focus();
    await page.keyboard.press('End');
    const expectedLast = await page.evaluate(() => {
      const visible = Array.from(document.querySelectorAll('.panel-tab')).filter(t => !t.hidden);
      return visible[visible.length - 1].id;
    });
    expect(await page.locator('#' + expectedLast).getAttribute('aria-selected')).toBe('true');
  });

  test('summary count cards are keyboard-focusable with role=group', async ({ page }) => {
    const cards = ['card-fail', 'card-warn', 'card-pass', 'card-info', 'card-total'];
    for (const id of cards) {
      const card = page.locator('#' + id);
      await expect(card).toHaveAttribute('tabindex', '0');
      await expect(card).toHaveAttribute('role', 'group');
      await expect(card).toHaveAttribute('aria-label', /:.*\d+/);
    }
  });

  test('skip link targets main and main is programmatically focusable', async ({ page }) => {
    const skipHref = await page.locator('a.skip-link').getAttribute('href');
    expect(skipHref).toBe('#main-content');
    const mainTabIndex = await page.locator('#main-content').getAttribute('tabindex');
    expect(mainTabIndex).toBe('-1');
  });

  test('both live regions exist with the correct politeness', async ({ page }) => {
    const polite    = page.locator('#live-region-polite');
    const assertive = page.locator('#live-region-assertive');
    await expect(polite).toHaveAttribute('aria-live', 'polite');
    await expect(assertive).toHaveAttribute('aria-live', 'assertive');
    /* Both should be visually hidden via sr-only. */
    await expect(polite).toHaveClass(/sr-only/);
    await expect(assertive).toHaveClass(/sr-only/);
  });

  test('export toolbar leads with the six baseline export buttons in order', async ({ page }) => {
    /* v4.3.0: the toolbar can now contain additional buttons (Diff
       CSV) that are hidden by default until a diff view is active.
       Assert the first six positions to keep the regression signal
       without freezing the toolbar size. */
    const buttons = await page.locator('#export-toolbar button').allTextContents();
    const firstSix = buttons.slice(0, 6);
    expect(firstSix).toEqual(['JSON', 'HTML', 'CSV', 'Text', 'SARIF', 'Annotated screenshot']);
  });

  test('no remaining emoji or unicode glyph noise in user-visible labels', async ({ page }) => {
    /* Scan visible text content for the specific glyphs we deliberately
       removed in v4.0.1. Catches regressions where someone re-adds an
       emoji to a label. */
    const body = await page.locator('body').textContent();
    const banned = ['📸', '▲', '✔', '✓', '✗'];
    for (const g of banned) {
      expect(body).not.toContain(g);
    }
  });

  test('reaudit button exists and is labelled', async ({ page }) => {
    const btn = page.locator('#reaudit-btn');
    await expect(btn).toBeVisible();
    expect(await btn.textContent()).toBe('Re-run Audit');
  });
});
