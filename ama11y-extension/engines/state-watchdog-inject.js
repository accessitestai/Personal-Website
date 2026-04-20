/**
 * AMA11Y — State Change Watchdog
 * Module 3: Dynamic Content & AT Notification Checker
 *
 * Injected into the target page on demand. Sets up a MutationObserver
 * that watches for DOM and ARIA state changes and evaluates whether
 * they are correctly surfaced to assistive technology.
 *
 * Checks performed:
 *   1. Dynamic content added without a live region ancestor (SC 4.1.3)
 *   2. Dialog / alertdialog appearing without focus management (SC 2.4.3)
 *   3. aria-hidden removed without live region (SC 4.1.3)
 *   4. hidden attribute removed without live region (SC 4.1.3)
 *   5. ARIA state attribute changes (aria-expanded / aria-checked / etc.) — Info
 *
 * Message flow:
 *   inject → bg:  state-watchdog-started   (ready)
 *   inject → bg:  state-watchdog-event     (per event)
 *   inject → bg:  state-watchdog-stopped   (after disconnect)
 *   bg → inject:  state-watchdog-stop      (panel clicked Stop)
 */

(function StateChangeWatchdog() {
  'use strict';

  /* ── Prevent double-injection ── */
  if (window.__ama11y_watchdog_active) return;
  window.__ama11y_watchdog_active = true;

  /* ── Live region roles & attributes ── */
  const LIVE_ROLES  = new Set(['alert', 'status', 'log', 'marquee', 'timer', 'alertdialog']);
  const LIVE_ATTRS  = ['aria-live', 'aria-atomic', 'aria-relevant'];

  /* ── ARIA state attributes to track ── */
  const ARIA_STATE_ATTRS = new Set([
    'aria-expanded', 'aria-selected', 'aria-checked',
    'aria-pressed',  'aria-disabled', 'aria-hidden', 'aria-invalid'
  ]);

  /* ── Tags to ignore (non-visible / structural) ── */
  const SKIP_TAGS = new Set([
    'script', 'style', 'meta', 'link', 'noscript',
    'template', 'head', 'title', 'base', 'param', 'source'
  ]);

  let eventCounter = 0;
  let running      = true;

  /* ──────────────────────────────────────────────
     HELPERS
  ────────────────────────────────────────────── */

  /** Walk up the tree; return true if any ancestor is a live region. */
  function hasLiveRegionAncestor(el) {
    let node = el;
    while (node && node !== document.body) {
      const role = node.getAttribute?.('role');
      if (role && LIVE_ROLES.has(role)) return true;
      for (const attr of LIVE_ATTRS) {
        if (node.hasAttribute?.(attr)) return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  /** Build a short, readable CSS-like selector for reporting. */
  function getSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return '#' + el.id;
    const role  = el.getAttribute('role');
    const label = el.getAttribute('aria-label') || el.getAttribute('title');
    if (role && label) return `[role="${role}"][aria-label="${label.slice(0, 30)}"]`;
    if (role)          return `${el.tagName.toLowerCase()}[role="${role}"]`;
    const cls = Array.from(el.classList).slice(0, 2).join('.');
    return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
  }

  /** Return true when the element is likely visible and content-bearing. */
  function isSignificantNode(el) {
    if (!el || el.nodeType !== 1) return false;
    if (SKIP_TAGS.has(el.tagName.toLowerCase())) return false;
    /* Skip nodes that are inside hidden subtrees */
    if (el.closest('[hidden]'))               return false;
    if (el.closest('[aria-hidden="true"]'))   return false;
    /* Require a non-trivial bounding box */
    const r = el.getBoundingClientRect();
    return r.width > 10 && r.height > 10;
  }

  /** True when element is (or acts as) a dialog. */
  function isDialogRole(el) {
    if (!el || el.nodeType !== 1) return false;
    const role = el.getAttribute('role');
    return role === 'dialog' || role === 'alertdialog' ||
           el.tagName.toLowerCase() === 'dialog';
  }

  /* ──────────────────────────────────────────────
     EVENT REPORTING
  ────────────────────────────────────────────── */

  function reportEvent({ type, verdict, wcag, element, description }) {
    if (!running) return;
    eventCounter++;
    const now  = new Date();
    const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map(n => String(n).padStart(2, '0')).join(':');

    try {
      chrome.runtime.sendMessage({
        type:  'state-watchdog-event',
        event: {
          id:          eventCounter,
          time,
          verdict,          /* 'Fail' | 'Warning' | 'Info' */
          eventType:   type,
          selector:    element ? getSelector(element) : '',
          wcag,
          description
        }
      });
    } catch (_) {
      /* Context invalidated (extension reloaded) — stop silently */
      running = false;
    }
  }

  /* ──────────────────────────────────────────────
     CHECK 1 — Dynamic content without live region
  ────────────────────────────────────────────── */

  function checkDynamicContent(addedNode) {
    if (!isSignificantNode(addedNode)) return;

    /* Dialog role — hand off to focus check */
    if (isDialogRole(addedNode)) {
      checkDialogFocus(addedNode);
      return;
    }

    /* Require non-trivial text */
    const text = addedNode.textContent?.trim().slice(0, 120) || '';
    if (text.length < 4) return;

    if (hasLiveRegionAncestor(addedNode)) {
      /* Good pattern — content will be announced */
      reportEvent({
        type:        'Dynamic content in live region',
        verdict:     'Info',
        wcag:        'SC 4.1.3',
        element:     addedNode,
        description: `Content "${text.slice(0, 60)}…" added inside a live region — screen readers will announce it.`
      });
    } else {
      /* Missing live region — potential SC 4.1.3 failure */
      reportEvent({
        type:        'Dynamic content, no live region',
        verdict:     'Fail',
        wcag:        'SC 4.1.3',
        element:     addedNode,
        description: `Visible content "${text.slice(0, 60)}…" added to the DOM outside any live region. ` +
                     `Screen readers will likely miss it. Add role="status", role="alert", or aria-live on a ` +
                     `suitable ancestor.`
      });
    }
  }

  /* ──────────────────────────────────────────────
     CHECK 2 — Dialog appearing without focus mgmt
  ────────────────────────────────────────────── */

  function checkDialogFocus(dialogEl) {
    const sel = getSelector(dialogEl);
    /* Wait 400 ms — allow the opening script to move focus */
    setTimeout(() => {
      if (!running)                            return;
      if (!document.body.contains(dialogEl))  return;   /* already removed */

      const focused      = document.activeElement;
      const focusInside  = dialogEl.contains(focused) || focused === dialogEl;

      if (!focusInside) {
        reportEvent({
          type:        'Dialog: focus not moved inside',
          verdict:     'Fail',
          wcag:        'SC 2.4.3',
          element:     dialogEl,
          description: `Dialog "${sel}" appeared but keyboard focus (${getSelector(focused)}) ` +
                       `was not moved inside it. On open, focus must land on a focusable element ` +
                       `within the dialog (or on the dialog itself if focusable).`
        });
      } else {
        reportEvent({
          type:        'Dialog: focus correctly managed',
          verdict:     'Info',
          wcag:        'SC 2.4.3',
          element:     dialogEl,
          description: `Dialog "${sel}" appeared and focus was correctly placed on ` +
                       `${getSelector(focused)} inside it.`
        });
      }
    }, 400);
  }

  /* ──────────────────────────────────────────────
     CHECK 3 — ARIA state attribute changes
  ────────────────────────────────────────────── */

  function checkAriaStateChange(el, attrName, oldVal, newVal) {
    /* aria-hidden removal — content becomes visible */
    if (attrName === 'aria-hidden' && newVal === 'false' && oldVal === 'true') {
      if (!isSignificantNode(el)) return;
      if (hasLiveRegionAncestor(el)) return;   /* covered by live region */
      reportEvent({
        type:        'aria-hidden removed — no live region',
        verdict:     'Warning',
        wcag:        'SC 4.1.3',
        element:     el,
        description: `${getSelector(el)} was un-hidden (aria-hidden: true → false) but has no ` +
                     `live region ancestor. Screen readers may not announce the revealed content.`
      });
      return;
    }

    /* aria-expanded toggle — informational (correct pattern) */
    if (attrName === 'aria-expanded') {
      const controlled = el.getAttribute('aria-controls');
      reportEvent({
        type:        `aria-expanded → ${newVal}`,
        verdict:     'Info',
        wcag:        'SC 4.1.2',
        element:     el,
        description: `${getSelector(el)} toggled aria-expanded from "${oldVal}" to "${newVal}"` +
                     (controlled ? `. Controlled panel: #${controlled}.` :
                                   '. No aria-controls present — consider adding one.')
      });
      return;
    }

    /* Other state changes — informational */
    if (oldVal !== newVal) {
      reportEvent({
        type:        `${attrName}: ${oldVal} → ${newVal}`,
        verdict:     'Info',
        wcag:        'SC 4.1.2',
        element:     el,
        description: `${getSelector(el)} ${attrName} changed from "${oldVal}" to "${newVal}".`
      });
    }
  }

  /* ──────────────────────────────────────────────
     CHECK 4 — hidden attribute removed
  ────────────────────────────────────────────── */

  function checkHiddenAttrChange(el, oldVal, newVal) {
    /* null newVal means the attribute was removed → content is now visible */
    if (oldVal !== null && newVal === null) {
      if (!isSignificantNode(el)) return;
      if (hasLiveRegionAncestor(el)) return;

      const text = el.textContent?.trim().slice(0, 80) || '';
      if (text.length < 3) return;

      reportEvent({
        type:        'hidden removed — no live region',
        verdict:     'Warning',
        wcag:        'SC 4.1.3',
        element:     el,
        description: `${getSelector(el)} became visible (hidden attribute removed) but is not ` +
                     `inside a live region. Consider wrapping in role="status" so screen readers ` +
                     `are notified.`
      });
    }
  }

  /* ──────────────────────────────────────────────
     MUTATION OBSERVER
  ────────────────────────────────────────────── */

  const observer = new MutationObserver((mutations) => {
    if (!running) return;

    for (const mutation of mutations) {

      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) checkDynamicContent(node);
        }

      } else if (mutation.type === 'attributes') {
        const el      = mutation.target;
        const attr    = mutation.attributeName;
        const newVal  = el.getAttribute(attr);   /* null when attribute was removed */
        const oldVal  = mutation.oldValue;

        if (ARIA_STATE_ATTRS.has(attr)) {
          if (oldVal !== newVal) checkAriaStateChange(el, attr, oldVal, newVal);
        }

        if (attr === 'hidden') {
          checkHiddenAttrChange(el, oldVal, newVal);
        }
      }
    }
  });

  observer.observe(document.body, {
    childList:          true,
    subtree:            true,
    attributes:         true,
    attributeFilter:    [...ARIA_STATE_ATTRS, 'hidden'],
    attributeOldValue:  true
  });

  /* ──────────────────────────────────────────────
     STOP LISTENER
  ────────────────────────────────────────────── */

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'state-watchdog-stop') {
      running = false;
      observer.disconnect();
      window.__ama11y_watchdog_active = false;
      try {
        chrome.runtime.sendMessage({ type: 'state-watchdog-stopped' });
      } catch (_) {}
    }
  });

  /* ──────────────────────────────────────────────
     READY SIGNAL
  ────────────────────────────────────────────── */

  try {
    chrome.runtime.sendMessage({
      type:  'state-watchdog-started',
      url:   location.href,
      title: document.title
    });
  } catch (_) {}

})();
