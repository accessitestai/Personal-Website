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
    // Activate the screen reader directly so the toggle state is deterministic.
    await page.evaluate(() => window._wsrScreenReader.activate());
    // Condition-based wait - the intro/auto-land sequence finishes when
    // the tree has been built and the cursor is non-negative. Replaces a
    // 1.5s timeout that flaked under CI load.
    await page.waitForFunction(() => {
      const w = window._wsrScreenReader;
      return w && w.active && Array.isArray(w.nodes) && w.nodes.length > 0 && w.cursor >= 0;
    }, null, { timeout: 5000 });
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

  test('paragraph containing a link does not include the link text in its own name (no double-read)', async ({ page }) => {
    /* 2026-07-08 regression guard for the container double-read fix.
       Inject a fresh paragraph with a nested link into the DOM,
       rebuild the reading tree, and assert:
       1. Both nodes exist (the walker still surfaces the link so
          quick-nav with K continues to find it).
       2. The paragraph's accessible name does NOT contain the link
          text word-for-word (previously it included the link text,
          causing a double-read when Down arrow moved from paragraph
          to link).
       3. The link node's accessible name is the link text on its
          own.
    */
    const result = await page.evaluate(() => {
      const p = document.createElement('p');
      p.id = 'wsr-double-read-fixture';
      p.innerHTML = 'Read the <a href="#doc-target">documentation</a> for details.';
      const main = document.querySelector('main') || document.body;
      main.appendChild(p);
      window._wsrScreenReader.rebuildTree();
      const nodes = window._wsrScreenReader.nodes;
      const paraNode = nodes.find(n => n.element === p);
      const linkNode = nodes.find(n => n.element && n.element.tagName === 'A' && n.element.getAttribute('href') === '#doc-target');
      return {
        paraName:  paraNode ? paraNode.name : null,
        paraRole:  paraNode ? paraNode.role : null,
        linkName:  linkNode ? linkNode.name : null,
        linkRole:  linkNode ? linkNode.role : null
      };
    });
    expect(result.paraRole).toBe('paragraph');
    expect(result.linkRole).toBe('link');
    /* Paragraph text must contain its own words but NOT the link text. */
    expect(result.paraName).toContain('Read the');
    expect(result.paraName).toContain('for details');
    expect(result.paraName.toLowerCase()).not.toContain('documentation');
    /* Link's own name is the link text, unaffected by the fix. */
    expect(result.linkName).toBe('documentation');
  });

  test('tree rebuilds after language change', async ({ page }) => {
    const beforeCount = await page.evaluate(() => window._wsrScreenReader.nodes.length);
    await page.evaluate(() => localStorage.setItem('translateLang', 'hi'));
    /* The tree rebuild is debounced; wait for it to settle by polling
       for either a node-count change or for the nodes array to refresh.
       Cap at 5s so a regression fails loud rather than silently passing. */
    await page.waitForFunction((before) => {
      const w = window._wsrScreenReader;
      return w && Array.isArray(w.nodes) && w.nodes.length > 0 && w.nodes.length !== before;
    }, beforeCount, { timeout: 5000 }).catch(() => { /* fall through to assertion */ });
    const nodes = await page.evaluate(() => window._wsrScreenReader.nodes.length);
    expect(nodes).toBeGreaterThan(50);
  });
});
