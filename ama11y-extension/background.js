/**
 * AMA11Y Extension — Background Service Worker
 * Orchestrates audit injection, side panel, message passing,
 * and automatic AMA11Y Platform integration.
 *
 * Flow:
 *  1. User presses Ctrl+Shift+U on any page.
 *  2. Content script runs all 13 audit engines (bypasses CSP).
 *  3. Results go to the side panel (existing behaviour — unchanged).
 *  4. Results ALSO go to the AMA11Y Platform tab automatically (new).
 *     The platform tab is opened/focused and the findings appear in
 *     the Web Audit section, ready for AI enhancement.
 */

const PLATFORM_URL = 'https://ama11y.akhileshmalani.com';

// NOTE: Do NOT call setPanelBehavior({ openPanelOnActionClick: true }) here.
// When that flag is true, Chrome intercepts the action click/keyboard shortcut
// to open the side panel but DOES NOT fire chrome.action.onClicked — meaning
// the content script would never be injected and no audit would run.
// Instead, onClicked opens the side panel manually below (best of both worlds).

// When the extension icon is clicked or Ctrl+Shift+U is pressed
chrome.action.onClicked.addListener(async (tab) => {
  // Open the side panel for this window
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (e) {
    // Ignore — panel may already be open
  }

  // Inject the content script to run the audit
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content-script.js']
    });
  } catch (err) {
    console.error('AMA11Y injection error:', err);
  }
});

// Relay messages from content script to side panel AND platform
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'audit-results' || message.type === 'audit-error') {

    // ── 1. Forward to side panel (existing behaviour — unchanged) ──
    chrome.runtime.sendMessage(message).catch(() => {
      // Side panel may not be open yet — store for later recovery
      chrome.storage.session.set({ lastAudit: message }).catch(() => {});
    });

    // ── 2. Send results to AMA11Y Platform tab (new) ──
    if (message.type === 'audit-results') {
      sendResultsToPlatform(message);
    }
  }
  return false;
});

/**
 * Find or open the AMA11Y Platform tab, then post the findings
 * into it via the platform bridge content script.
 *
 * If the platform tab is already open: focus it, send results.
 * If not: open a new tab, wait for load, send results.
 *
 * Fails silently — the side panel always has the results as fallback.
 */
async function sendResultsToPlatform(message) {
  const payload = {
    type:      'ama11y_platform_results',
    findings:  message.findings  || [],
    pageTitle: message.title     || message.pageTitle || 'Untitled Page',
    pageUrl:   message.url       || message.pageUrl   || '',
    timestamp: message.timestamp || new Date().toISOString()
  };

  try {
    // Check for an existing open platform tab
    const existingTabs = await chrome.tabs.query({ url: PLATFORM_URL + '/*' });

    if (existingTabs.length > 0) {
      const platformTab = existingTabs[0];

      // Bring it to front
      await chrome.tabs.update(platformTab.id, { active: true });
      try {
        await chrome.windows.update(platformTab.windowId, { focused: true });
      } catch (_) {}

      // Brief settle then deliver
      await delay(150);
      await chrome.tabs.sendMessage(platformTab.id, payload);

    } else {
      // Open a fresh platform tab
      const newTab = await chrome.tabs.create({ url: PLATFORM_URL, active: true });

      // Wait until the page is fully loaded
      await waitForTabLoad(newTab.id);

      // Allow content script + DOMContentLoaded handlers to finish
      await delay(500);

      await chrome.tabs.sendMessage(newTab.id, payload);
    }

  } catch (err) {
    // Non-fatal — the side panel still shows results
    console.warn('AMA11Y platform bridge:', err.message);
  }
}

/** Resolves when the given tab reaches status === 'complete',
 *  or after a 12-second safety timeout. */
function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 12000); // safety net
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
