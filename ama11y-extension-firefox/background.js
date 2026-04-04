/**
 * AMA11Y Extension (Firefox) — Background Script
 * Orchestrates audit injection, sidebar, and message passing.
 */

// When the extension icon is clicked or Alt+Shift+A is pressed
browser.browserAction.onClicked.addListener(async (tab) => {
  // Open the sidebar
  browser.sidebarAction.open();

  // Inject the content script to run the audit
  try {
    await browser.tabs.executeScript(tab.id, {
      file: 'content-script.js'
    });
  } catch (err) {
    console.error('AMA11Y injection error:', err);
  }
});

// Relay messages from content script to sidebar
browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'audit-results' || message.type === 'audit-error') {
    // Forward to all extension pages (sidebar)
    browser.runtime.sendMessage(message).catch(() => {
      // Sidebar may not be ready yet — store for later
      browser.storage.local.set({ lastAudit: message }).catch(() => {});
    });
  }
});
