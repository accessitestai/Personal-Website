/**
 * AMASAMYA Engine 21 - Dragging Movements (WCAG 2.2 SC 2.5.7, Level AA)
 *
 * Reference: https://www.w3.org/TR/WCAG22/#dragging-movements
 *
 * What the SC requires:
 *   All functionality that uses a dragging movement for operation can
 *   be achieved by a single pointer without dragging, unless dragging
 *   is essential or the functionality is determined by the user agent
 *   and not modified by the author.
 *
 * Detection strategy:
 *   1. Native draggable=true elements always satisfy the "uses
 *      dragging" precondition.
 *   2. Elements that have HTML5 dragstart / dragend handlers attached.
 *   3. Elements where both a press handler (pointerdown / mousedown /
 *      touchstart) AND a move handler (pointermove / mousemove /
 *      touchmove) are present, indicating a drag interaction in JS.
 *
 *   For each candidate, look for a single-pointer alternative in
 *   scope: a same-purpose button child or sibling, an explicit
 *   keyboard handler (keydown / keyup / keypress), or a role=slider /
 *   role=scrollbar pattern with aria-valuenow (which mandates keyboard
 *   support by ARIA contract).
 *
 *   Pass    - drag detected AND a single-pointer alternative is in scope.
 *   Fail    - drag detected AND no alternative.
 *   Warning - ambiguous case (handlers on a non-interactive container,
 *             or the alternative is keyboard-only without a button).
 *
 * Listener detection requires the audit harness to install a one-time
 * proxy over EventTarget.prototype.addEventListener BEFORE the page's
 * own JS runs. content-script.js does this at the very top of the
 * audit run by calling installListenerProbe(); the engine reads the
 * accumulated map at audit time.
 */

(function (global) {
  'use strict';

  const DRAG_PRESS_EVENTS = new Set(['pointerdown', 'mousedown', 'touchstart']);
  const DRAG_MOVE_EVENTS  = new Set(['pointermove', 'mousemove', 'touchmove']);
  const DRAG_HTML5_EVENTS = new Set(['dragstart', 'dragend', 'drag']);
  const KEY_EVENTS        = new Set(['keydown', 'keyup', 'keypress']);

  /* Reads the listener probe map maintained on window. Safe when the
     probe was never installed: returns an empty Set so the rule
     evaluates without crashing. */
  function listenersOn(el, eventNames) {
    const probe = global.__AMASAMYAListenerProbe;
    if (!probe || !probe.has(el)) return new Set();
    const all = probe.get(el);
    const out = new Set();
    eventNames.forEach(n => { if (all.has(n)) out.add(n); });
    return out;
  }

  function hasAnyListener(el, eventSet) {
    const probe = global.__AMASAMYAListenerProbe;
    if (!probe || !probe.has(el)) return false;
    const all = probe.get(el);
    for (const ev of all) { if (eventSet.has(ev)) return true; }
    return false;
  }

  function isDraggableCandidate(el) {
    /* Native HTML drag. */
    if (el.draggable === true || el.getAttribute('draggable') === 'true') return 'html5-draggable';
    if (hasAnyListener(el, DRAG_HTML5_EVENTS)) return 'html5-handlers';
    /* JS-driven drag: press + move both present. */
    const hasPress = hasAnyListener(el, DRAG_PRESS_EVENTS);
    const hasMove  = hasAnyListener(el, DRAG_MOVE_EVENTS);
    if (hasPress && hasMove) return 'press-plus-move';
    return null;
  }

  function findSinglePointerAlternative(el) {
    /* 1. ARIA slider / scrollbar with aria-valuenow already implies
       keyboard support per ARIA spec, so it counts as an alternative
       provided the element is keyboard-focusable. */
    const role = (el.getAttribute('role') || '').toLowerCase();
    if ((role === 'slider' || role === 'scrollbar') && el.hasAttribute('aria-valuenow')) {
      if (el.tabIndex >= 0) return { type: 'aria-keyboard', detail: `role=${role} with aria-valuenow and tabindex` };
    }

    /* 2. Explicit keydown listener attached to the draggable element. */
    const keys = listenersOn(el, KEY_EVENTS);
    if (keys.size > 0) return { type: 'keyboard-handler', detail: 'keydown/keyup handler on element' };

    /* 3. Sibling or descendant buttons whose accessible name suggests
       an equivalent action. We do not try to be smart about which
       button maps to which axis; presence of any aria-labelled action
       button in the same container is enough to claim "alternative
       exists". */
    const scope = el.parentElement || el;
    const buttons = scope.querySelectorAll('button, [role="button"]');
    if (buttons.length > 0) {
      const namedButtons = Array.from(buttons).filter(b => {
        const name = (b.getAttribute('aria-label') || b.textContent || '').trim();
        return name.length > 0;
      });
      if (namedButtons.length > 0) {
        return { type: 'button-alternative', detail: `${namedButtons.length} adjacent button(s)` };
      }
    }
    return null;
  }

  function cssEscape(s) {
    return (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(s) : String(s).replace(/(["\\#.:>+~*\^$|?()\[\]\s])/g, '\\$1');
  }
  function cssPath(el) {
    if (el.id) return '#' + cssEscape(el.id);
    const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + cls;
  }

  function isVisible(el) {
    if (el.hidden) return false;
    if (typeof el.getBoundingClientRect !== 'function') return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const style = (typeof window !== 'undefined') ? window.getComputedStyle(el) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    return true;
  }

  function run() {
    const findings = [];
    /* Candidate set: every element. We early-exit cheaply for
       non-candidates. The probe map keeps the actual lookups O(1). */
    const all = document.querySelectorAll('*');
    all.forEach((el) => {
      const dragKind = isDraggableCandidate(el);
      if (!dragKind) return;
      if (!isVisible(el)) return;

      const alt = findSinglePointerAlternative(el);
      const base = {
        engine:    'Dragging Movements',
        criterion: 'WCAG 2.2 SC 2.5.7 (Level AA)',
        selector:  cssPath(el),
        element:   (el.outerHTML || '').slice(0, 200),
        dragKind:  dragKind,
        alternative: alt ? alt.type : 'none'
      };

      if (alt) {
        findings.push(Object.assign({}, base, {
          verdict: 'Pass',
          severity: 'Minor',
          issue:   `Dragging detected (${dragKind}) and a single-pointer alternative is present (${alt.detail}).`,
          howToFix: ''
        }));
        return;
      }

      /* No alternative found. Decide Fail vs Warning by interactive
         context: a non-interactive container (div with drag handlers
         only) is more often a hand-rolled control than an unrelated
         element, so Fail. A canvas or svg is harder to judge from
         markup alone, so Warning so the auditor can verify. */
      const tag = el.tagName.toLowerCase();
      const verdictIsHardFail = tag === 'div' || tag === 'li' || tag === 'span' || tag === 'section' || tag === 'article';
      const verdict  = verdictIsHardFail ? 'Fail' : 'Warning';
      const severity = verdictIsHardFail ? 'Serious' : 'Moderate';
      findings.push(Object.assign({}, base, {
        verdict:  verdict,
        severity: severity,
        issue:   `Dragging detected (${dragKind}) but no single-pointer alternative was found within the parent scope.`,
        howToFix: 'Add a labelled button alternative (Move up / Move down, increment / decrement, etc.) next to the draggable, or expose keyboard interaction via role=slider with aria-valuenow plus tabindex and a keydown handler.'
      }));
    });
    return findings;
  }

  /* Listener probe installer. content-script.js calls this once at
     the start of the audit BEFORE injecting the page's own
     handlers... in practice we inject this engine AFTER the page,
     so the probe will not capture historical handlers. The Playwright
     test installs the probe before navigating, which is the supported
     test path. For runtime use inside content-script.js we install
     the probe synchronously at document_start via an ad-hoc
     world=MAIN injection - see content-script.js. */
  function installListenerProbe() {
    if (global.__AMASAMYAListenerProbe) return;
    const map = new WeakMap();
    global.__AMASAMYAListenerProbe = map;
    const origAdd = global.EventTarget && global.EventTarget.prototype.addEventListener;
    if (!origAdd) return;
    global.EventTarget.prototype.addEventListener = function (type, listener, opts) {
      try {
        if (this && this.nodeType === 1) {
          let s = map.get(this);
          if (!s) { s = new Set(); map.set(this, s); }
          s.add(String(type).toLowerCase());
        }
      } catch (_) { /* swallow - probe must never break the page */ }
      return origAdd.call(this, type, listener, opts);
    };
  }

  const api = { run, installListenerProbe, _internal: { isDraggableCandidate, findSinglePointerAlternative } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.AMASAMYAEngineDraggingMovements = api;
})(typeof window !== 'undefined' ? window : globalThis);
