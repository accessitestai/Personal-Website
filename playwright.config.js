// Playwright config.
//
// The engine tests under tests/engines/ load fixture HTML directly
// from disk via file:// URLs and need no dev server.
//
// The screen-reader tests under tests/screen-reader.spec.js drive
// the live portfolio (akhileshmalani.com) at http://localhost:3000,
// so we boot npx http-server automatically. reuseExistingServer is
// true so running `npm run serve` in another terminal is honoured
// rather than fought.

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: './tests',
  timeout: 20000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 }
  },
  webServer: {
    command: 'npx http-server -p 3000 -c-1 -s',
    url: 'http://localhost:3000/',
    reuseExistingServer: true,
    timeout: 30000
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } }
  ]
};
