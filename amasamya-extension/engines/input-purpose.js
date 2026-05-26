/**
 * AMASAMYA Engine 20 - Identify Input Purpose (WCAG 2.2 SC 1.3.5, Level AA)
 *
 * Status: DRAFT for v4.0. NOT registered in content-script.js.
 *
 * Reference: https://www.w3.org/TR/WCAG22/#identify-input-purpose
 * Token list: WCAG 2.2 section 7.3, the 53 "input purpose" tokens.
 *
 * What this engine does:
 *   1. Iterate every form-control element in the document.
 *   2. Classify each control's likely input purpose using name, id,
 *      type, label text, and existing autocomplete value.
 *   3. For any control whose purpose maps to one of the 53 WCAG
 *      tokens, check whether the control already has a matching
 *      autocomplete attribute.
 *
 * Verdicts:
 *   Pass    - autocomplete is present and matches a WCAG token that
 *             agrees with the classifier (or autocomplete is set to
 *             a valid token for a field whose purpose is otherwise
 *             not detectable from name/label).
 *   Fail    - classifier identifies a known purpose AND
 *               a) autocomplete attribute is absent, or
 *               b) autocomplete is "off", or
 *               c) autocomplete value is not in the WCAG token list.
 *   Warning - classifier is uncertain, OR a purpose is detected but
 *             the input is invisible / disabled (so SC may not apply).
 *
 * Out of scope:
 *   - <input type="search">, <input type="hidden">, <input type="submit">,
 *     <input type="reset">, <input type="button">, <input type="image">
 *   - <button> elements
 *   - <textarea> elements (free-text, no defined input purpose)
 *   - Inputs inside a search landmark or labelled "search"
 *
 * Performance: the engine runs in one pass over document.querySelectorAll
 * with no layout reads; expected under 50 ms on a 500-input page.
 */

(function (global) {
  'use strict';

  /* WCAG 2.2 input purpose tokens, section 7.3. Frozen list of 53. */
  const WCAG_TOKENS = Object.freeze([
    'name', 'honorific-prefix', 'given-name', 'additional-name', 'family-name',
    'honorific-suffix', 'nickname', 'organization-title', 'username',
    'new-password', 'current-password', 'organization',
    'street-address', 'address-line1', 'address-line2', 'address-line3',
    'address-level4', 'address-level3', 'address-level2', 'address-level1',
    'country', 'country-name', 'postal-code',
    'cc-name', 'cc-given-name', 'cc-additional-name', 'cc-family-name',
    'cc-number', 'cc-exp', 'cc-exp-month', 'cc-exp-year', 'cc-csc', 'cc-type',
    'transaction-currency', 'transaction-amount', 'language',
    'bday', 'bday-day', 'bday-month', 'bday-year',
    'sex', 'url', 'photo',
    'tel', 'tel-country-code', 'tel-national', 'tel-area-code',
    'tel-local', 'tel-local-prefix', 'tel-local-suffix', 'tel-extension',
    'email', 'impp'
  ]);
  const WCAG_TOKEN_SET = new Set(WCAG_TOKENS);

  /* Classifier rules. Each rule examines a control and returns either
     a WCAG token (the predicted purpose) or null (no opinion). Rules
     are evaluated in order; the first non-null answer wins.

     Each rule has a `confidence` band:
       'high'   - very likely correct, mismatch becomes a Fail
       'medium' - likely correct, mismatch becomes a Fail with a softer note
       'low'    - speculative, mismatch becomes a Warning */
  const RULES = [
    /* Type-based: very high confidence. */
    { name: 'type=email', confidence: 'high',
      test: (el) => el.type === 'email' ? 'email' : null },
    { name: 'type=tel',   confidence: 'high',
      test: (el) => el.type === 'tel'   ? 'tel'   : null },
    { name: 'type=url',   confidence: 'high',
      test: (el) => el.type === 'url'   ? 'url'   : null },
    { name: 'type=password', confidence: 'high', test: (el) => {
      if (el.type !== 'password') return null;
      /* New-password vs current-password is decided by neighbouring
         field labels. If there is a second password field nearby,
         assume new-password. */
      const form = el.form;
      if (!form) return 'current-password';
      const pws = form.querySelectorAll('input[type="password"]');
      return pws.length > 1 ? 'new-password' : 'current-password';
    } },

    /* Name/id/label-based: medium confidence. */
    { name: 'email-by-name', confidence: 'medium',
      test: (el) => matchAny(el, /\bemail\b|e-mail|emailaddress/i) ? 'email' : null },
    { name: 'first-name',    confidence: 'medium',
      test: (el) => matchAny(el, /\b(first[\s_-]?name|given[\s_-]?name|fname)\b/i) ? 'given-name' : null },
    { name: 'last-name',     confidence: 'medium',
      test: (el) => matchAny(el, /\b(last[\s_-]?name|family[\s_-]?name|surname|lname)\b/i) ? 'family-name' : null },
    { name: 'full-name',     confidence: 'medium',
      test: (el) => matchAny(el, /\b(full[\s_-]?name|your[\s_-]?name)\b/i) ? 'name' : null },
    { name: 'phone',         confidence: 'medium',
      test: (el) => matchAny(el, /\b(phone|mobile|telephone|cell)\b/i) ? 'tel' : null },
    { name: 'street',        confidence: 'medium',
      test: (el) => matchAny(el, /\b(street|address1|address[\s_-]?line[\s_-]?1|addr1)\b/i) ? 'street-address' : null },
    { name: 'city',          confidence: 'medium',
      test: (el) => matchAny(el, /\b(city|town)\b/i) ? 'address-level2' : null },
    { name: 'state',         confidence: 'medium',
      test: (el) => matchAny(el, /\b(state|province|region)\b/i) ? 'address-level1' : null },
    { name: 'postcode',      confidence: 'medium',
      test: (el) => matchAny(el, /\b(zip|postcode|postal[\s_-]?code|pincode)\b/i) ? 'postal-code' : null },
    { name: 'country',       confidence: 'medium',
      test: (el) => matchAny(el, /\bcountry\b/i) ? 'country' : null },
    { name: 'cc-number',     confidence: 'high',
      test: (el) => matchAny(el, /\b(card[\s_-]?number|cc[\s_-]?number|cardnum|creditcard)\b/i) ? 'cc-number' : null },
    { name: 'cc-csc',        confidence: 'high',
      test: (el) => matchAny(el, /\b(cvv|cvc|csc|security[\s_-]?code)\b/i) ? 'cc-csc' : null },
    { name: 'cc-exp',        confidence: 'medium',
      test: (el) => matchAny(el, /\b(expir(y|ation)|exp[\s_-]?date)\b/i) ? 'cc-exp' : null },
    { name: 'username',      confidence: 'low',
      test: (el) => matchAny(el, /\b(username|userid|login)\b/i) ? 'username' : null },
    { name: 'birthday',      confidence: 'medium',
      test: (el) => matchAny(el, /\b(birth|bday|dob|date[\s_-]?of[\s_-]?birth)\b/i) ? 'bday' : null }
  ];

  function matchAny(el, regex) {
    const haystacks = [
      el.name || '',
      el.id || '',
      el.getAttribute('autocomplete') || '',
      el.getAttribute('placeholder') || '',
      labelTextFor(el),
      el.getAttribute('aria-label') || ''
    ];
    return haystacks.some(h => regex.test(h));
  }

  function labelTextFor(el) {
    /* Prefer <label for>, fall back to closest <label>. */
    if (el.id) {
      const lbl = document.querySelector(`label[for="${cssEscape(el.id)}"]`);
      if (lbl) return (lbl.textContent || '').trim();
    }
    const wrap = el.closest('label');
    if (wrap) return (wrap.textContent || '').trim();
    return '';
  }

  function cssEscape(s) {
    /* Minimal subset; CSS.escape is fine when available. */
    return (typeof CSS !== 'undefined' && CSS.escape)
      ? CSS.escape(s)
      : String(s).replace(/(["\\#.:>+~*\^$|?()\[\]\s])/g, '\\$1');
  }

  function isInScope(el) {
    if (el.tagName === 'TEXTAREA') return false;
    if (el.tagName === 'BUTTON')   return false;
    if (el.tagName === 'SELECT')   return false; /* covered by other engines */
    if (el.tagName !== 'INPUT')    return false;
    const t = (el.type || 'text').toLowerCase();
    const skip = new Set(['search', 'hidden', 'submit', 'reset', 'button',
                          'image', 'checkbox', 'radio', 'file', 'color',
                          'range', 'number']);
    if (skip.has(t)) return false;
    /* Skip controls inside an explicit search context. */
    if (el.closest('[role="search"], form[role="search"]')) return false;
    /* Skip hidden/disabled controls but emit Warning so reviewers see
       they were skipped. */
    return true;
  }

  function isVisible(el) {
    if (el.disabled) return false;
    if (el.hidden)   return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (el.getClientRects().length === 0) return false;
    return true;
  }

  function classify(el) {
    for (const rule of RULES) {
      const purpose = rule.test(el);
      if (purpose) return { purpose, rule: rule.name, confidence: rule.confidence };
    }
    return null;
  }

  function getDeclaredTokens(el) {
    const raw = el.getAttribute('autocomplete');
    if (raw == null) return { kind: 'absent', tokens: [] };
    const lc = raw.trim().toLowerCase();
    if (lc === '' || lc === 'off')   return { kind: 'off',     tokens: [] };
    if (lc === 'on')                  return { kind: 'on',      tokens: [] };
    /* WCAG permits space-separated tokens with optional section
       prefix (shipping/billing) and contact-type prefix (home/work). */
    return { kind: 'present', tokens: lc.split(/\s+/) };
  }

  function tokensContainPurpose(tokens, purpose) {
    return tokens.some(t => t === purpose || WCAG_TOKEN_SET.has(t) && t === purpose);
  }

  function tokensHaveAnyWcagToken(tokens) {
    return tokens.some(t => WCAG_TOKEN_SET.has(t));
  }

  function cssPath(el) {
    /* Compact selector for finding output. */
    if (el.id) return '#' + cssEscape(el.id);
    if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
    return el.tagName.toLowerCase();
  }

  /* Public API: run() returns an array of finding objects in the
     same shape as the other AMASAMYA engines, so future
     integration into content-script.js is a one-line registration. */
  function run() {
    const findings = [];
    const inputs = document.querySelectorAll('input');
    inputs.forEach((el) => {
      if (!isInScope(el)) return;
      const visible = isVisible(el);
      const guess   = classify(el);
      if (!guess) return; /* No detectable purpose; engine has nothing to say. */

      const decl = getDeclaredTokens(el);
      const base = {
        engine:    'Identify Input Purpose',
        criterion: 'WCAG 2.2 SC 1.3.5 (Level AA)',
        selector:  cssPath(el),
        element:   el.outerHTML.slice(0, 200),
        purposeDetected: guess.purpose,
        purposeRule:     guess.rule,
        declaredAutocomplete: el.getAttribute('autocomplete')
      };

      if (!visible) {
        findings.push(Object.assign({}, base, {
          verdict: 'Warning',
          severity: 'Minor',
          issue:   `Field appears to collect ${guess.purpose} but is hidden or disabled; SC 1.3.5 may not apply. Verify manually.`,
          howToFix: 'If this field is exposed at any point during user interaction, add autocomplete="' + guess.purpose + '".'
        }));
        return;
      }

      if (decl.kind === 'absent' || decl.kind === 'on') {
        findings.push(Object.assign({}, base, {
          verdict: 'Fail',
          severity: guess.confidence === 'high' ? 'Serious' : 'Moderate',
          issue:   `Field collects ${guess.purpose} but has no autocomplete attribute. Assistive technology cannot identify the purpose programmatically.`,
          howToFix: `Add autocomplete="${guess.purpose}" to this input.`
        }));
        return;
      }

      if (decl.kind === 'off') {
        findings.push(Object.assign({}, base, {
          verdict: 'Fail',
          severity: 'Serious',
          issue:   `autocomplete="off" prevents assistive technology from identifying the ${guess.purpose} purpose.`,
          howToFix: `Replace autocomplete="off" with autocomplete="${guess.purpose}". Use other techniques (server-side rejection, paste-disable opt-out, etc.) if you need to prevent stored credentials.`
        }));
        return;
      }

      /* decl.kind === 'present' */
      if (tokensContainPurpose(decl.tokens, guess.purpose)) {
        findings.push(Object.assign({}, base, {
          verdict: 'Pass',
          severity: 'Minor',
          issue:   `Field correctly declares autocomplete token "${guess.purpose}".`,
          howToFix: ''
        }));
        return;
      }

      if (tokensHaveAnyWcagToken(decl.tokens)) {
        /* Declared a valid WCAG token but a different one than we
           expected. Author probably knows their data better than the
           classifier; emit Warning, not Fail. */
        findings.push(Object.assign({}, base, {
          verdict: 'Warning',
          severity: 'Minor',
          issue:   `Field declares autocomplete="${decl.tokens.join(' ')}" but the classifier expected "${guess.purpose}". Confirm which is correct.`,
          howToFix: `If the field truly collects ${guess.purpose}, change the autocomplete value. Otherwise the current declaration is acceptable.`
        }));
        return;
      }

      /* Declared a non-WCAG token (vendor extension like "fname"). */
      findings.push(Object.assign({}, base, {
        verdict: 'Fail',
        severity: 'Moderate',
        issue:   `autocomplete="${decl.tokens.join(' ')}" is not from the WCAG 2.2 input-purpose token list.`,
        howToFix: `Replace with autocomplete="${guess.purpose}".`
      }));
    });
    return findings;
  }

  /* Export. In the browser, attach to window so the test harness
     can call it. In Node (for unit tests), expose via module.exports. */
  const api = { run, WCAG_TOKENS, _internal: { classify, getDeclaredTokens, RULES } };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.AMASAMYAEngineInputPurpose = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
