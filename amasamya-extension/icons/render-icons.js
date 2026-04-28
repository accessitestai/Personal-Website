/**
 * Render every icon-N.svg in this folder to a matching icon-N.png at
 * exactly N×N pixels. Chrome uses the PNGs at runtime (in the toolbar,
 * chrome://extensions, and the Web Store listing), so the PNGs must
 * stay in lock-step with the SVG sources.
 *
 * Run after editing any icon SVG:
 *   node amasamya-extension/icons/render-icons.js
 *
 * Requires Playwright (already a dev dep for the test suite).
 */
const { chromium } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');

const SIZES = [16, 32, 48, 128];
const HERE  = __dirname;

(async () => {
  const browser = await chromium.launch();
  for (const sz of SIZES) {
    const svgPath = path.join(HERE, `icon-${sz}.svg`);
    const pngPath = path.join(HERE, `icon-${sz}.png`);
    if (!fs.existsSync(svgPath)) {
      console.warn(`  WARN icon-${sz}.svg missing - skip`);
      continue;
    }
    /* Wrap the SVG in a minimal HTML doc with a transparent body so
       PNG transparency is preserved (Chrome's toolbar renders icons
       on a coloured background and any white padding bleeds through). */
    const svg = fs.readFileSync(svgPath, 'utf8');
    const html =
      '<!doctype html><html><head><meta charset="utf-8">' +
      '<style>html,body{margin:0;padding:0;background:transparent;}' +
      `body{width:${sz}px;height:${sz}px;}svg{display:block;}</style>` +
      '</head><body>' + svg + '</body></html>';

    const ctx = await browser.newContext({
      viewport: { width: sz, height: sz },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: pngPath,
      type: 'png',
      omitBackground: true,
      clip: { x: 0, y: 0, width: sz, height: sz },
    });
    await ctx.close();
    const bytes = fs.statSync(pngPath).size;
    console.log(`  OK   icon-${sz}.svg -> icon-${sz}.png (${sz}x${sz}, ${bytes.toLocaleString()} bytes)`);
  }
  await browser.close();
  console.log('Done.');
})().catch(err => { console.error(err); process.exit(1); });
