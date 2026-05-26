/**
 * Playwright test - AMASAMYA Engine 20 (Identify Input Purpose, SC 1.3.5).
 *
 * Runs the engine against the canonical fixture and verifies that
 * every input element flagged with data-amasamya-expect="pass" / "fail"
 * / "warn" receives the matching verdict. Inputs flagged
 * data-amasamya-expect="none" must NOT appear in the engine's output.
 *
 * The fixture is loaded as a file:// URL so no dev server is needed
 * for engine tests (unlike the screen-reader tests). The engine
 * module is injected into the page via page.addScriptTag().
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const url  = require('url');

const FIXTURE = url.pathToFileURL(
  path.resolve(__dirname, '..', '..', 'amasamya-extension', 'test-fixtures', 'sc-1.3.5-input-purpose.html')
).href;

const ENGINE = path.resolve(__dirname, '..', '..', 'amasamya-extension', 'engines', 'input-purpose.js');

test.describe('Engine 20: Identify Input Purpose (SC 1.3.5)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE);
    await page.addScriptTag({ path: ENGINE });
  });

  test('engine module loads and exposes run()', async ({ page }) => {
    const apiShape = await page.evaluate(() => {
      const api = window.AMASAMYAEngineInputPurpose;
      return {
        hasRun:    typeof api?.run === 'function',
        tokenCount: api?.WCAG_TOKENS?.length || 0
      };
    });
    expect(apiShape.hasRun).toBe(true);
    expect(apiShape.tokenCount).toBe(53);
  });

  test('every Pass-marked input receives a Pass verdict', async ({ page }) => {
    const result = await page.evaluate(() => {
      const findings = window.AMASAMYAEngineInputPurpose.run();
      const passInputs = Array.from(document.querySelectorAll('input[data-amasamya-expect="pass"]'));
      return passInputs.map((el) => {
        const sel = '#' + el.id;
        const f = findings.find(x => x.selector === sel);
        return { id: el.id, verdict: f?.verdict || 'MISSING' };
      });
    });
    for (const row of result) {
      expect(row.verdict, `Input #${row.id} should Pass`).toBe('Pass');
    }
  });

  test('every Fail-marked input receives a Fail verdict', async ({ page }) => {
    const result = await page.evaluate(() => {
      const findings = window.AMASAMYAEngineInputPurpose.run();
      const failInputs = Array.from(document.querySelectorAll('input[data-amasamya-expect="fail"]'));
      return failInputs.map((el) => {
        const sel = '#' + el.id;
        const f = findings.find(x => x.selector === sel);
        return { id: el.id, verdict: f?.verdict || 'MISSING', issue: f?.issue || '' };
      });
    });
    for (const row of result) {
      expect(row.verdict, `Input #${row.id} should Fail (${row.issue})`).toBe('Fail');
    }
  });

  test('out-of-scope inputs do not appear in findings', async ({ page }) => {
    const leaks = await page.evaluate(() => {
      const findings = window.AMASAMYAEngineInputPurpose.run();
      const noneInputs = Array.from(document.querySelectorAll('[data-amasamya-expect="none"]'));
      return noneInputs
        .map(el => '#' + el.id)
        .filter(sel => findings.some(f => f.selector === sel));
    });
    expect(leaks).toEqual([]);
  });

  test('every finding cites SC 1.3.5 and engine name', async ({ page }) => {
    const summary = await page.evaluate(() => {
      const f = window.AMASAMYAEngineInputPurpose.run();
      return {
        total:      f.length,
        wrongEngine: f.filter(x => x.engine !== 'Identify Input Purpose').length,
        wrongCrit:   f.filter(x => !/1\.3\.5/.test(x.criterion)).length
      };
    });
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.wrongEngine).toBe(0);
    expect(summary.wrongCrit).toBe(0);
  });
});
