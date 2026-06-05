/**
 * AMASAMYA Engine 23 - Redundant Entry (WCAG 2.2 SC 3.3.7, Level A)
 *
 * Reference: https://www.w3.org/TR/WCAG22/#redundant-entry
 *
 * What the SC requires:
 *   Information previously entered by or provided to the user that is
 *   required to be entered again in the same process is either
 *   auto-populated, or available for the user to select - except when
 *   re-entering the information is essential, when re-entering is
 *   required for security, or when previously entered information is
 *   no longer valid.
 *
 * Single-page detection limits:
 *   The engine cannot know what was already entered earlier in a flow
 *   from a single page. What it CAN detect:
 *     - Strong signal that this page is a step in a multi-step flow
 *       (step indicator, aria-current="step", progress bar with
 *       N of M wording).
 *     - Whether a "use same as ..." toggle / auto-fill button exists
 *       (Pass signal).
 *     - Whether the page explicitly tells the user to "re-enter"
 *       previously entered data with no auto-fill option (Fail).
 *
 * Verdicts:
 *   Pass    - same-as-shipping checkbox or auto-fill toggle present.
 *   Fail    - text on the page contains "re-enter" / "enter again" /
 *             "for verification" near a field whose autocomplete
 *             token matches a category the user likely entered before,
 *             AND no auto-fill option exists.
 *   Warning - multi-step flow detected, fields exist that could be
 *             duplicates, but the engine cannot verify from one page.
 *
 * Out of scope:
 *   Search fields, single-step forms with no step indicator.
 */

(function (global) {
  'use strict';

  const STEP_INDICATORS = [
    'ol.step-indicator', 'ol.steps', 'ol.wizard-steps',
    '[role="progressbar"][aria-valuemax]',
    '[aria-current="step"]',
    '.step-progress', '.checkout-steps'
  ];
  const REENTRY_PHRASES = /\b(re[-\s]?enter|enter again|for verification|confirm your|reconfirm)\b/i;
  /* Matches: "same address as shipping", "same as", "use same",
     "use shipping address", "copy from", "auto-fill", "autofill". */
  const AUTOFILL_LABEL  = /\b(same(\s+\w+){0,3}\s+as|use\s+(same|shipping|previous|saved)|copy\s+from|auto[-\s]?fill)\b/i;

  function isMultiStep() {
    for (const sel of STEP_INDICATORS) {
      if (document.querySelector(sel)) return true;
    }
    /* Last-ditch: page title or H1 contains "Step N of M". */
    const h1 = document.querySelector('h1');
    if (h1 && /step\s*\d+\s*of\s*\d+/i.test(h1.textContent || '')) return true;
    return false;
  }

  function hasAutofillToggle(scope) {
    const root = scope || document;
    const labels = Array.from(root.querySelectorAll('label, button'));
    return labels.some(el => AUTOFILL_LABEL.test((el.textContent || '').trim()));
  }

  function scopeForInput(el) {
    return el.closest('form, fieldset, section, [role="form"], [role="region"]') || document;
  }

  function nearbyText(el) {
    /* Look at the field's own label and at most 3 immediately
       preceding siblings (often the introductory paragraph that
       says "please re-enter..."). Walking up the ancestor tree
       was too greedy: it swept the entire form and mis-attributed
       re-entry wording to fields it did not apply to. */
    let bag = '';
    const id = el.id;
    if (id) {
      const lbl = document.querySelector(`label[for="${cssEscape(id)}"]`);
      if (lbl) bag += ' ' + (lbl.textContent || '');
    }
    const wrap = el.closest('label');
    if (wrap) bag += ' ' + (wrap.textContent || '');
    let sib = el.previousElementSibling;
    let hops = 0;
    while (sib && hops < 3) {
      bag += ' ' + (sib.textContent || '');
      sib = sib.previousElementSibling;
      hops++;
    }
    return bag;
  }

  function cssEscape(s) {
    return (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(s) : String(s).replace(/(["\\#.:>+~*\^$|?()\[\]\s])/g, '\\$1');
  }
  function cssPath(el) {
    if (el.id) return '#' + cssEscape(el.id);
    return el.tagName.toLowerCase() + (el.name ? `[name="${el.name}"]` : '');
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
    const multiStep = isMultiStep();
    /* Globally-present autofill controls (recorded as Pass findings
       so reviewers see the positive signals). Scoped per-input
       autofill is checked separately when evaluating each input. */
    const globalAutofill = hasAutofillToggle(document);

    if (globalAutofill) {
      const ctl = Array.from(document.querySelectorAll('label, button'))
        .find(el => AUTOFILL_LABEL.test((el.textContent || '').trim()));
      if (ctl) {
        findings.push({
          engine:    'Redundant Entry',
          criterion: 'WCAG 2.2 SC 3.3.7 (Level A)',
          selector:  cssPath(ctl),
          element:   (ctl.outerHTML || '').slice(0, 200),
          verdict:   'Pass',
          severity:  'Minor',
          issue:     'Auto-fill or "same as previous" control detected; satisfies SC 3.3.7 for the fields within its scope.',
          howToFix:  ''
        });
      }
    }

    /* If not in a multi-step flow there is nothing to warn about. */
    if (!multiStep) return findings;

    /* Walk inputs that collect known-purpose data and look for
       re-entry wording. Autofill is evaluated PER FORM/SECTION
       SCOPE: a same-as-shipping toggle in one form does not
       exonerate a re-entry field in a different form on the
       same page. */
    const inputs = document.querySelectorAll('input[autocomplete]:not([autocomplete="off"])');
    inputs.forEach(el => {
      if (!isVisible(el)) return;
      const text     = nearbyText(el);
      const reentry  = REENTRY_PHRASES.test(text);
      const autofill = hasAutofillToggle(scopeForInput(el));

      const base = {
        engine:    'Redundant Entry',
        criterion: 'WCAG 2.2 SC 3.3.7 (Level A)',
        selector:  cssPath(el),
        element:   (el.outerHTML || '').slice(0, 200)
      };

      if (reentry && !autofill) {
        findings.push(Object.assign({}, base, {
          verdict:  'Fail',
          severity: 'Moderate',
          issue:    `Multi-step flow asks the user to re-enter ${el.getAttribute('autocomplete')} information without an auto-fill or selection option.`,
          howToFix: 'Pre-populate the field from the user\'s prior entry, or provide a "use previous" / "same as" control.'
        }));
        return;
      }

      /* Multi-step flow + field with known purpose, but no explicit
         re-entry wording. Warning so an auditor confirms. */
      findings.push(Object.assign({}, base, {
        verdict:  'Warning',
        severity: 'Minor',
        issue:    `Multi-step flow detected. Field collects ${el.getAttribute('autocomplete')} data; engine cannot confirm whether the same data was already requested earlier in the flow.`,
        howToFix: 'If this field repeats a value the user already entered earlier in the flow, pre-populate it or expose a "use previous" control.'
      }));
    });

    return findings;
  }

  const api = { run, _internal: { isMultiStep, hasAutofillToggle } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.AMASAMYAEngineRedundantEntry = api;
})(typeof window !== 'undefined' ? window : globalThis);
