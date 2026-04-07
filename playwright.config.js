// Playwright config for the screen-reader tests.
// Assumes a local dev server is running on http://localhost:3000
// (e.g. `npx http-server -p 3000` or `python -m http.server 3000`).

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: './tests',
  timeout: 20000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 }
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } }
  ]
};
