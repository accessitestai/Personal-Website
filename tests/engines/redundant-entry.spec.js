/**
 * Playwright test - AMASAMYA Engine 23 (Redundant Entry, SC 3.3.7).
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const url  = require('url');

const FIXTURE = url.pathToFileURL(
  path.resolve(__dirname, '..', '..', 'amasamya-extension', 'test-fixtures', 'sc-3.3.7-redundant-entry.html')
).href;
const ENGINE = path.resolve(__dirname, '..', '..', 'amasamya-extension', 'engines', 'redundant-entry.js');

test.describe('Engine 23: Redundant Entry (SC 3.3.7)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE);
    await page.addScriptTag({ path: ENGINE });
  });

  test('engine loads and exposes run()', async ({ page }) => {
    const ok = await page.evaluate(() => typeof window.AMASAMYAEngineRedundantEntry?.run === 'function');
    expect(ok).toBe(true);
  });

  test('detects same-as-shipping as a Pass signal', async ({ page }) => {
    const verdict = await page.evaluate(() => {
      const f = window.AMASAMYAEngineRedundantEntry.run();
      const p = f.find(x => x.verdict === 'Pass');
      return p?.verdict || 'MISSING';
    });
    expect(verdict).toBe('Pass');
  });

  test('flags re-entry email as Fail', async ({ page }) => {
    const verdict = await page.evaluate(() => {
      const f = window.AMASAMYAEngineRedundantEntry.run();
      const r = f.find(x => x.selector === '#fail-billing-email');
      return r?.verdict || 'MISSING';
    });
    expect(verdict).toBe('Fail');
  });

  test('flags ambiguous phone field as Warning', async ({ page }) => {
    const verdict = await page.evaluate(() => {
      const f = window.AMASAMYAEngineRedundantEntry.run();
      const r = f.find(x => x.selector === '#fail-billing-phone');
      return r?.verdict || 'MISSING';
    });
    expect(verdict).toBe('Warning');
  });

  test('every finding cites SC 3.3.7 and engine name', async ({ page }) => {
    const summary = await page.evaluate(() => {
      const f = window.AMASAMYAEngineRedundantEntry.run();
      return {
        total:    f.length,
        badEng:   f.filter(x => x.engine !== 'Redundant Entry').length,
        badCrit:  f.filter(x => !/3\.3\.7/.test(x.criterion)).length
      };
    });
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.badEng).toBe(0);
    expect(summary.badCrit).toBe(0);
  });
});
