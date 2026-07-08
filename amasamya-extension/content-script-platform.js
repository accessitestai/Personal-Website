/**
 * AMASAMYA Extension - Platform Bridge Content Script
 *
 * Runs on the AMASAMYA Platform page (https://amasamya.akhileshmalani.com).
 *
 * Purpose:
 *   The background service worker cannot directly call functions on a web
 *   page - it can only message content scripts. This script lives in the
 *   platform tab, receives the findings payload from the background via
 *   chrome.runtime.onMessage, and forwards it into the page's own
 *   JavaScript context via window.postMessage.
 *
 *   The platform page listens for window messages of type
 *   'AMASAMYA_extension_results' and renders the findings automatically.
 */

/*
 * v4.3.1 (2026-07-08): postMessage target changed from '*' to
 * location.origin so an embedded cross-origin iframe on the
 * platform page cannot receive audit findings. The manifest content-
 * script match rule already scopes execution to the platform origin,
 * so location.origin is always the platform's own origin.
 */
chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message.type !== 'string') return;
  /* Standard single-page audit results from the WCAG engine. */
  if (message.type === 'AMASAMYA_platform_results') {
    window.postMessage({
      type:      'AMASAMYA_extension_results',
      findings:  message.findings,
      pageTitle: message.pageTitle,
      pageUrl:   message.pageUrl,
      timestamp: message.timestamp
    }, location.origin);
    return;
  }

  /* v4.2.0 Site Crawl: one of these arrives per audited page during a
     crawl. The platform accumulates them into a single aggregated
     session record. status is one of 'audited', 'auth-wall',
     'timeout', 'load-error'; only 'audited' carries findings. */
  if (message.type === 'AMASAMYA_crawl_page_result') {
    window.postMessage({
      type:       'AMASAMYA_extension_crawl_page',
      url:        message.url,
      finalUrl:   message.finalUrl,
      title:      message.title,
      status:     message.status,
      index:      message.index,
      findings:   message.findings || [],
      durationMs: message.durationMs,
      timestamp:  message.timestamp
    }, location.origin);
    return;
  }
});
