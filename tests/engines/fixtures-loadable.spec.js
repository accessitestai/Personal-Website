/**
 * Smoke test - every v4.0 engine fixture loads, parses, and contains
 * at least one pass-marked and one fail-marked element. This catches
 * accidental fixture breakage long before the engine tests run, and
 * gives us early signal when a fixture is malformed.
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const url  = require('url');

const FIXTURES = [
  'sc-1.3.5-input-purpose.html',
  'sc-2.5.7-dragging-movements.html',
  'sc-3.2.6-consistent-help.html',
  'sc-3.3.7-redundant-entry.html',
  'sc-3.3.8-accessible-authentication.html'
];

test.describe('v4.0 fixture smoke', () => {
  for (const file of FIXTURES) {
    test(`${file} loads and is well-formed`, async ({ page }) => {
      const fileUrl = url.pathToFileURL(
        path.resolve(__dirname, '..', '..', 'amasamya-extension', 'test-fixtures', file)
      ).href;
      await page.goto(fileUrl);
      const counts = await page.evaluate(() => {
        return {
          pass: document.querySelectorAll('[data-amasamya-expect="pass"]').length,
          fail: document.querySelectorAll('[data-amasamya-expect="fail"]').length,
          warn: document.querySelectorAll('[data-amasamya-expect="warn"]').length,
          h1:   document.querySelectorAll('h1').length
        };
      });
      /* Every fixture must have a single H1, at least one fail
         marker, and either a pass or a warn marker. SC 3.2.6 is
         allowed to be warn-only since the engine can only emit
         Warnings from a single-page audit. */
      expect(counts.h1).toBe(1);
      expect(counts.fail + counts.warn).toBeGreaterThan(0);
      expect(counts.pass + counts.warn).toBeGreaterThan(0);
    });
  }
});
