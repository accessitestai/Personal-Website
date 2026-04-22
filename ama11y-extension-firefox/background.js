/**
 * AMASAMYA Extension (Firefox) — Background Script
 * Orchestrates audit injection, sidebar, message passing,
 * and automatic AMASAMYA Platform integration.
 *
 * Flow:
 *  1. User presses Ctrl+Shift+U on any page.
 *  2. Content script runs all 13 audit engines (bypasses CSP).
 *  3. Results go to the sidebar (existing behaviour — unchanged).
 *  4. Results ALSO go to the AMASAMYA Platform tab automatically (new).
 *     The platform tab is opened/focused and the findings appear in
 *     the Web Audit section, ready for AI enhancement.
 */

const PLATFORM_URL = 'https://amasamya.akhileshmalani.com';

// When the extension icon is clicked or Ctrl+Shift+U is pressed
browser.browserAction.onClicked.addListener(async (tab) => {
  // Open the sidebar (existing behaviour)
  browser.sidebarAction.open();

  // Inject the content script to run the audit
  try {
    await browser.tabs.executeScript(tab.id, {
      file: 'content-script.js'
    });
  } catch (err) {
    console.error('AMASAMYA injection error:', err);
  }
});

// Relay messages from content script to sidebar AND platform
browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'audit-results' || message.type === 'audit-error') {

    // ── 1. Forward to sidebar (existing behaviour — unchanged) ──
    browser.runtime.sendMessage(message).catch(() => {
      // Sidebar may not be open yet — store for later recovery
      browser.storage.local.set({ lastAudit: message }).catch(() => {});
    });

    // ── 2. Send results to AMASAMYA Platform tab (new) ──
    if (message.type === 'audit-results') {
      sendResultsToPlatform(message);
    }
  }
});

/**
 * Find or open the AMASAMYA Platform tab, then post the findings
 * into it via the platform bridge content script.
 *
 * Fails silently — the sidebar always has the results as fallback.
 */
async function sendResultsToPlatform(message) {
  const payload = {
    type:      'AMASAMYA_platform_results',
    findings:  message.findings  || [],
    pageTitle: message.title     || message.pageTitle || 'Untitled Page',
    pageUrl:   message.url       || message.pageUrl   || '',
    timestamp: message.timestamp || new Date().toISOString()
  };

  try {
    // Check for an existing open platform tab
    const existingTabs = await browser.tabs.query({ url: PLATFORM_URL + '/*' });

    if (existingTabs.length > 0) {
      const platformTab = existingTabs[0];

      // Bring it to front
      await browser.tabs.update(platformTab.id, { active: true });
      try {
        await browser.windows.update(platformTab.windowId, { focused: true });
      } catch (_) {}

      // Brief settle then deliver
      await delay(150);
      await browser.tabs.sendMessage(platformTab.id, payload);

    } else {
      // Open a fresh platform tab
      const newTab = await browser.tabs.create({ url: PLATFORM_URL, active: true });

      // Wait until the page is fully loaded
      await waitForTabLoad(newTab.id);

      // Allow content script + DOMContentLoaded handlers to finish
      await delay(500);

      await browser.tabs.sendMessage(newTab.id, payload);
    }

  } catch (err) {
    // Non-fatal — the sidebar still shows results
    console.warn('AMASAMYA platform bridge:', err.message);
  }
}

/** Resolves when the given tab reaches status === 'complete',
 *  or after a 12-second safety timeout. */
function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === 'complete') {
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 12000); // safety net
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
