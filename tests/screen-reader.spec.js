// Playwright tests for the Web Screen Reader.
// Setup (one-time):
//   npm install -D @playwright/test
//   npx playwright install chromium
// Run:
//   npx playwright test

const { test, expect } = require('@playwright/test');

const SITE = 'http://localhost:3000/';

test.describe('Web Screen Reader', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SITE);
    await page.waitForLoadState('networkidle');
    // Activate the screen reader directly so the toggle state is deterministic
    await page.evaluate(() => window._wsrScreenReader.activate());
    await page.waitForTimeout(1500); // let the activate() intro speak and auto-land
  });

  test('activates and builds an element tree', async ({ page }) => {
    const state = await page.evaluate(() => ({
      active: window._wsrScreenReader.active,
      nodes:  window._wsrScreenReader.nodes.length,
      cursor: window._wsrScreenReader.cursor
    }));
    expect(state.active).toBe(true);
    expect(state.nodes).toBeGreaterThan(50);
    expect(state.cursor).toBeGreaterThanOrEqual(0);
  });

  test('ArrowDown advances the cursor', async ({ page }) => {
    const before = await page.evaluate(() => window._wsrScreenReader.cursor);
    await page.keyboard.press('ArrowDown');
    const after = await page.evaluate(() => window._wsrScreenReader.cursor);
    expect(after).toBeGreaterThan(before);
  });

  test('H jumps to next heading', async ({ page }) => {
    await page.keyboard.press('h');
    const node = await page.evaluate(() => {
      const w = window._wsrScreenReader;
      return w.nodes[w.cursor] ? w.nodes[w.cursor].role : null;
    });
    expect(node).toBe('heading');
  });

  test('K jumps to next link', async ({ page }) => {
    await page.keyboard.press('k');
    const role = await page.evaluate(() =>
      window._wsrScreenReader.nodes[window._wsrScreenReader.cursor].role);
    expect(role).toBe('link');
  });

  test('B jumps to next button', async ({ page }) => {
    await page.keyboard.press('b');
    const role = await page.evaluate(() =>
      window._wsrScreenReader.nodes[window._wsrScreenReader.cursor].role);
    expect(['button', 'switch']).toContain(role);
  });

  test('Shift+H navigates backwards through headings', async ({ page }) => {
    await page.keyboard.press('h');
    await page.keyboard.press('h');
    const mid = await page.evaluate(() => window._wsrScreenReader.cursor);
    await page.keyboard.press('Shift+H');
    const back = await page.evaluate(() => window._wsrScreenReader.cursor);
    expect(back).toBeLessThan(mid);
  });

  test('Escape deactivates the screen reader', async ({ page }) => {
    await page.keyboard.press('Escape');
    const active = await page.evaluate(() => window._wsrScreenReader.active);
    expect(active).toBe(false);
  });

  test('tree rebuilds after language change', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('translateLang', 'hi'));
    await page.waitForTimeout(2000);
    const nodes = await page.evaluate(() => window._wsrScreenReader.nodes.length);
    expect(nodes).toBeGreaterThan(50);
  });
});
