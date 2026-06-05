/**
 * Playwright test - AMASAMYA Engine 21 (Dragging Movements, SC 2.5.7).
 *
 * Listener detection requires the probe to be installed BEFORE the
 * page's own JS attaches handlers. We use page.addInitScript() to
 * inject the probe at document_start, then navigate to the fixture.
 * The fixture's <script> block attaches handlers after the probe is
 * in place, so the WeakMap captures them.
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const url  = require('url');
const fs   = require('fs');

const FIXTURE = url.pathToFileURL(
  path.resolve(__dirname, '..', '..', 'amasamya-extension', 'test-fixtures', 'sc-2.5.7-dragging-movements.html')
).href;

const ENGINE_SRC = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'amasamya-extension', 'engines', 'dragging-movements.js'),
  'utf8'
);

test.describe('Engine 21: Dragging Movements (SC 2.5.7)', () => {
  test.beforeEach(async ({ page }) => {
    /* Install the listener probe at document_start. The probe sits
       on EventTarget.prototype.addEventListener and records every
       (element, eventType) pair before the page's own JS runs. */
    await page.addInitScript(`
      (function () {
        if (window.__AMASAMYAListenerProbe) return;
        var map = new WeakMap();
        window.__AMASAMYAListenerProbe = map;
        var orig = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type, listener, opts) {
          try {
            if (this && this.nodeType === 1) {
              var s = map.get(this);
              if (!s) { s = new Set(); map.set(this, s); }
              s.add(String(type).toLowerCase());
            }
          } catch (e) { /* never break the page */ }
          return orig.call(this, type, listener, opts);
        };
      })();
    `);
    await page.goto(FIXTURE);
    /* Now load the engine into the page context. */
    await page.addScriptTag({ content: ENGINE_SRC });
  });

  test('engine module loads and exposes run()', async ({ page }) => {
    const shape = await page.evaluate(() => ({
      hasRun: typeof window.AMASAMYAEngineDraggingMovements?.run === 'function'
    }));
    expect(shape.hasRun).toBe(true);
  });

  test('every Pass-marked element receives a Pass verdict', async ({ page }) => {
    const result = await page.evaluate(() => {
      const findings = window.AMASAMYAEngineDraggingMovements.run();
      const pass = Array.from(document.querySelectorAll('[data-amasamya-expect="pass"]'));
      return pass.map(el => {
        const sel = '#' + el.id;
        const f = findings.find(x => x.selector === sel);
        return { id: el.id, verdict: f?.verdict || 'MISSING' };
      });
    });
    for (const row of result) {
      expect(row.verdict, `Element #${row.id} should Pass`).toBe('Pass');
    }
  });

  test('every Fail-marked element receives a Fail or Warning verdict', async ({ page }) => {
    /* For SC 2.5.7 a Fail in the fixture may be reported as Warning
       when the element is a canvas (engine cannot judge intent from
       markup alone). Accept either. */
    const result = await page.evaluate(() => {
      const findings = window.AMASAMYAEngineDraggingMovements.run();
      const fail = Array.from(document.querySelectorAll('[data-amasamya-expect="fail"]'));
      return fail.map(el => {
        const sel = '#' + el.id;
        const f = findings.find(x => x.selector === sel);
        return { id: el.id, tag: el.tagName.toLowerCase(), verdict: f?.verdict || 'MISSING' };
      });
    });
    for (const row of result) {
      expect(['Fail', 'Warning'], `Element #${row.id} (${row.tag}) should Fail or Warning`).toContain(row.verdict);
    }
  });

  test('every finding cites SC 2.5.7 and engine name', async ({ page }) => {
    const summary = await page.evaluate(() => {
      const f = window.AMASAMYAEngineDraggingMovements.run();
      return {
        total: f.length,
        badEngine: f.filter(x => x.engine !== 'Dragging Movements').length,
        badCrit:   f.filter(x => !/2\.5\.7/.test(x.criterion)).length
      };
    });
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.badEngine).toBe(0);
    expect(summary.badCrit).toBe(0);
  });
});
