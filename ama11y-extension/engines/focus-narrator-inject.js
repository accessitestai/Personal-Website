/**
 * AMA11Y — Focus Indicator Narrator
 * Module 2: Visual-to-Audio Engine
 *
 * Injected into the target page. Enumerates every focusable element,
 * focuses each one in DOM order, then coordinates with the background
 * service worker to capture a screenshot and run Vision AI analysis.
 *
 * Message flow (per element):
 *   inject → bg:  focus-narrator-element-ready  (rect + element info)
 *   bg    → inject: focus-narrator-next          (proceed to next element)
 *
 * The inject script waits for the background ack before moving on,
 * preventing race conditions between focus events and screenshots.
 */

(async function FocusNarratorInject() {
  'use strict';

  /* ── Focusable elements selector (follows WHATWG interactive content) ── */
  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'details > summary:first-of-type',
    '[contenteditable]:not([contenteditable="false"])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');

  /* ── Collect visible, focusable elements ── */
  function getElements() {
    return Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR)).filter(el => {
      if (el.closest('[hidden]') || el.closest('[aria-hidden="true"]')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  /* ── Build a short, meaningful selector for reporting ── */
  function getSelector(el) {
    if (el.id)                         return '#' + el.id;
    const label = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
    if (label)                         return `${el.tagName.toLowerCase()}[aria-label]`;
    const name  = el.name || el.getAttribute('data-testid');
    if (name)                          return `${el.tagName.toLowerCase()}[name="${name}"]`;
    const cls   = Array.from(el.classList).slice(0, 2).join('.');
    return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
  }

  /* ── Get the human-readable text label for an element ── */
  function getLabel(el) {
    return (
      el.getAttribute('aria-label') ||
      (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent) ||
      el.getAttribute('title') ||
      el.getAttribute('placeholder') ||
      el.value ||
      el.textContent ||
      ''
    ).trim().slice(0, 80);
  }

  /* ── Wait for background to acknowledge the screenshot ── */
  function waitForAck(timeoutMs = 8000) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      function listener(msg) {
        if (msg.type === 'focus-narrator-next') {
          clearTimeout(timer);
          chrome.runtime.onMessage.removeListener(listener);
          resolve();
        }
      }
      chrome.runtime.onMessage.addListener(listener);
    });
  }

  /* ── Main loop ── */
  const elements = getElements();
  const originalFocus = document.activeElement;

  /* Notify side panel: starting */
  chrome.runtime.sendMessage({
    type:  'focus-narrator-start',
    total: elements.length,
    url:   location.href,
    title: document.title
  });

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];

    /* Scroll the element into the centre of the viewport */
    el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });

    /* Small pause — let scroll settle and any CSS transitions finish */
    await new Promise(r => setTimeout(r, 120));

    /* Apply keyboard focus */
    try { el.focus({ preventScroll: true }); } catch (_) {}

    /* Another brief pause — let the focus ring render */
    await new Promise(r => setTimeout(r, 100));

    const rect = el.getBoundingClientRect();
    const scrollX = window.scrollX || 0;
    const scrollY = window.scrollY || 0;

    const elementInfo = {
      index:    i,
      total:    elements.length,
      tag:      el.tagName.toLowerCase(),
      type:     el.getAttribute('type') || '',
      role:     el.getAttribute('role') || el.tagName.toLowerCase(),
      label:    getLabel(el),
      selector: getSelector(el),
      href:     el.href || '',
      /* Viewport-relative bounding rect (what the screenshot sees) */
      rect: {
        x:      Math.round(rect.x),
        y:      Math.round(rect.y),
        width:  Math.round(rect.width),
        height: Math.round(rect.height)
      },
      /* Page-absolute position (for context) */
      pageRect: {
        x:      Math.round(rect.x + scrollX),
        y:      Math.round(rect.y + scrollY),
        width:  Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };

    /* Tell background: element is focused, please screenshot */
    chrome.runtime.sendMessage({
      type:    'focus-narrator-element-ready',
      element: elementInfo
    });

    /* Wait for background to finish before moving to next element */
    await waitForAck();
  }

  /* Restore original focus where possible */
  try {
    if (originalFocus && typeof originalFocus.focus === 'function') {
      originalFocus.focus();
    }
  } catch (_) {}

  /* Notify background + panel: all done */
  chrome.runtime.sendMessage({ type: 'focus-narrator-complete' });

})();
