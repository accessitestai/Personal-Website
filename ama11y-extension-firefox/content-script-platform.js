/**
 * AMA11Y Extension (Firefox) — Platform Bridge Content Script
 *
 * Runs on the AMA11Y Platform page (https://ama11y.akhileshmalani.com).
 *
 * Receives the findings payload from the background script via
 * browser.runtime.onMessage and forwards it into the page's own
 * JavaScript context via window.postMessage.
 *
 * The platform page listens for window messages of type
 * 'ama11y_extension_results' and renders the findings automatically.
 */

browser.runtime.onMessage.addListener((message) => {
  if (message.type !== 'ama11y_platform_results') return;

  // Forward into the page's JS context
  window.postMessage({
    type:      'ama11y_extension_results',
    findings:  message.findings,
    pageTitle: message.pageTitle,
    pageUrl:   message.pageUrl,
    timestamp: message.timestamp
  }, '*');
});
