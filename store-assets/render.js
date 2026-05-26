/**
 * Render every store-assets/*.html to its matching *.png at the
 * canvas size declared in the HTML's <body> CSS.
 *
 * Why this exists: store-assets/*.html are the *source of truth*
 * for the Chrome Web Store icons, marquee, small promo, and
 * screenshots. The committed *.png files are derived artefacts.
 * After any rebrand or copy change, the PNGs go stale and need
 * to be regenerated. Doing this manually with screenshots is how
 * we ended up with AMA11Y-era PNGs sitting next to AMASAMYA-era
 * HTML in commit f4b3951.
 *
 * Run:
 *   node store-assets/render.js
 *
 * Requires Playwright (already a dev dep for the test suite).
 */
const { chromium } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');

const ASSETS = [
  { html: 'icon-128.html',     out: 'icon-128.png',     width: 128,  height: 128  },
  { html: 'icon-512.html',     out: 'icon-512.png',     width: 512,  height: 512  },
  { html: 'marquee.html',      out: 'marquee.png',      width: 1400, height: 560  },
  { html: 'small-promo.html',  out: 'small-promo.png',  width: 440,  height: 280  },
  { html: 'ss1-wcag.html',     out: 'ss1-wcag.png',     width: 1280, height: 800  },
  { html: 'ss2-focus.html',    out: 'ss2-focus.png',    width: 1280, height: 800  },
  { html: 'ss3-layout.html',   out: 'ss3-layout.png',   width: 1280, height: 800  },
  { html: 'ss4-watchdog.html', out: 'ss4-watchdog.png', width: 1280, height: 800  },
  { html: 'ss5-settings.html', out: 'ss5-settings.png', width: 1280, height: 800  },
];

(async () => {
  const browser = await chromium.launch();
  for (const a of ASSETS) {
    const htmlPath = path.join(__dirname, a.html);
    const pngPath  = path.join(__dirname, a.out);
    if (!fs.existsSync(htmlPath)) {
      console.warn(`  WARN ${a.html} missing - skip`);
      continue;
    }
    const ctx = await browser.newContext({
      viewport: { width: a.width, height: a.height },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.goto('file:///' + htmlPath.replace(/\\/g, '/'));
    /* Wait for fonts so glyphs render at correct width - without
       this, the screenshot can be taken before custom Segoe UI
       weights settle and the layout shifts horizontally. */
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: pngPath,
      type: 'png',
      omitBackground: false,
      clip: { x: 0, y: 0, width: a.width, height: a.height },
    });
    await ctx.close();
    const bytes = fs.statSync(pngPath).size;
    console.log(`  OK   ${a.html.padEnd(20)} -> ${a.out.padEnd(20)} (${a.width}x${a.height}, ${bytes.toLocaleString()} bytes)`);
  }
  await browser.close();
  console.log('Done.');
})().catch(err => { console.error(err); process.exit(1); });
