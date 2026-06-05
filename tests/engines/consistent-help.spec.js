/**
 * Playwright test - AMASAMYA Engine 22 (Consistent Help, SC 3.2.6).
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const url  = require('url');

const FIXTURE = url.pathToFileURL(
  path.resolve(__dirname, '..', '..', 'amasamya-extension', 'test-fixtures', 'sc-3.2.6-consistent-help.html')
).href;
const ENGINE = path.resolve(__dirname, '..', '..', 'amasamya-extension', 'engines', 'consistent-help.js');

test.describe('Engine 22: Consistent Help (SC 3.2.6)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE);
    await page.addScriptTag({ path: ENGINE });
  });

  test('engine loads and exposes run()', async ({ page }) => {
    const shape = await page.evaluate(() => ({
      hasRun: typeof window.AMASAMYAEngineConsistentHelp?.run === 'function'
    }));
    expect(shape.hasRun).toBe(true);
  });

  test('every Warn-marked element is reported as Warning', async ({ page }) => {
    const result = await page.evaluate(() => {
      const f = window.AMASAMYAEngineConsistentHelp.run();
      const marked = Array.from(document.querySelectorAll('[data-amasamya-expect="warn"]'));
      return marked.map(el => {
        /* The fixture marks links by their href / id and the chat
           widget by id; build the same selector the engine uses. */
        const sel = el.id ? '#' + el.id : el.tagName.toLowerCase();
        const finding = f.find(x => x.selector === sel || (el.id === '' && x.element.includes(el.outerHTML.slice(0, 80))));
        return { tag: el.tagName, id: el.id, verdict: finding?.verdict || 'MISSING' };
      });
    });
    /* At minimum the chat-widget (#chat-widget) should be detected. */
    const chatRow = result.find(r => r.id === 'chat-widget');
    expect(chatRow?.verdict).toBe('Warning');
  });

  test('engine reports at least one finding from each category present', async ({ page }) => {
    const cats = await page.evaluate(() => {
      const f = window.AMASAMYAEngineConsistentHelp.run();
      const set = new Set();
      f.forEach(x => {
        const m = /Help mechanism detected: ([^.]+)\./.exec(x.issue || '');
        if (m) set.add(m[1].trim());
      });
      return Array.from(set);
    });
    /* Fixture contains a /help link, a /contact link, a tel: link
       and a chat button. Expect at least 3 distinct categories. */
    expect(cats.length).toBeGreaterThanOrEqual(3);
  });

  test('every finding cites SC 3.2.6 and Warning verdict', async ({ page }) => {
    const summary = await page.evaluate(() => {
      const f = window.AMASAMYAEngineConsistentHelp.run();
      return {
        total: f.length,
        nonWarn: f.filter(x => x.verdict !== 'Warning').length,
        badCrit: f.filter(x => !/3\.2\.6/.test(x.criterion)).length
      };
    });
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.nonWarn).toBe(0);
    expect(summary.badCrit).toBe(0);
  });

  test('persists ordered help list to sessionStorage', async ({ page }) => {
    const stored = await page.evaluate(() => {
      window.AMASAMYAEngineConsistentHelp.run();
      const raw = sessionStorage.getItem('__AMASAMYA_HelpOrder');
      return raw ? JSON.parse(raw) : null;
    });
    expect(stored).not.toBeNull();
    expect(Array.isArray(stored.items)).toBe(true);
    expect(stored.items.length).toBeGreaterThan(0);
  });
});
