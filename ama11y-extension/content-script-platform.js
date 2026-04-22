/**
 * AMASAMYA Extension — Platform Bridge Content Script
 *
 * Runs on the AMASAMYA Platform page (https://amasamya.akhileshmalani.com).
 *
 * Purpose:
 *   The background service worker cannot directly call functions on a web
 *   page — it can only message content scripts. This script lives in the
 *   platform tab, receives the findings payload from the background via
 *   chrome.runtime.onMessage, and forwards it into the page's own
 *   JavaScript context via window.postMessage.
 *
 *   The platform page listens for window messages of type
 *   'AMASAMYA_extension_results' and renders the findings automatically.
 */

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'AMASAMYA_platform_results') return;

  // Forward into the page's JS context
  window.postMessage({
    type:      'AMASAMYA_extension_results',
    findings:  message.findings,
    pageTitle: message.pageTitle,
    pageUrl:   message.pageUrl,
    timestamp: message.timestamp
  }, '*');
});
