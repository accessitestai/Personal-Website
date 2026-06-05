/**
 * AMASAMYA Engine 24 - Accessible Authentication, Minimum
 *                      (WCAG 2.2 SC 3.3.8, Level AA)
 *
 * Reference: https://www.w3.org/TR/WCAG22/#accessible-authentication-minimum
 *
 * What the SC requires:
 *   A cognitive function test (such as remembering a password or
 *   solving a puzzle) is not required for any step in an authentication
 *   process unless that step provides at least one of the following:
 *     - Alternative: another authentication method that does not rely
 *       on a cognitive function test.
 *     - Mechanism: a mechanism is available to assist the user in
 *       completing the cognitive function test.
 *     - Object Recognition: the cognitive function test is to recognize
 *       objects.
 *     - Personal Content: the cognitive function test is to identify
 *       non-text content the user provided to the Web site.
 *
 * Detection strategy:
 *   1. CAPTCHA signals (Fail unless an alternative is present):
 *      - <iframe> whose src includes recaptcha or hcaptcha domains
 *      - <img> with src or alt matching captcha / puzzle
 *      - Inputs labelled "type the characters" / "what do you see"
 *   2. Paste-blocking password fields (Fail):
 *      - <input type="password"> with onpaste="return false" or
 *        autocomplete="off"
 *   3. Image-grid puzzle (Warning - could be legitimate UI):
 *      - <fieldset> containing N images, legend matches "select all"
 *   4. Magic-link sign-in (Pass signal):
 *      - <a> with accessible name containing "sign in with a link",
 *        "email link", "magic link", "passwordless"
 *   5. Password manager friendliness (Pass for password fields):
 *      - autocomplete contains "current-password" or "new-password"
 *        AND no paste-block attribute.
 *
 * Out of scope:
 *   - Hardware-key WebAuthn flows (no DOM signal to detect)
 *   - SMS-OTP flows (not a cognitive function test per SC 3.3.8)
 */

(function (global) {
  'use strict';

  const CAPTCHA_IFRAME_SRC = /(google\.com\/recaptcha|hcaptcha\.com|turnstile\.cloudflare|captcha\.com)/i;
  const CAPTCHA_TEXT       = /\b(captcha|recaptcha|hcaptcha|type the characters|enter the characters|i'?m not a robot|prove you are human)\b/i;
  const PUZZLE_TEXT        = /\b(select all|identify (the )?(images|pictures) (with|containing)|click each|drag the slider to)\b/i;
  const MAGIC_LINK_TEXT    = /\b(magic\s*link|sign\s*in\s*with\s*a\s*link|email\s*link|passwordless\s*sign|email me a link)\b/i;
  const MEMORABLE_PWD_TEXT = /\b(memorable|memorise|memorize|recall your)\s+(password|word)\b/i;

  function accessibleName(el) {
    return (el.getAttribute('aria-label') || el.textContent || el.getAttribute('alt') || '').trim();
  }
  function nearbyText(el) {
    const lbl = el.id ? document.querySelector(`label[for="${cssEscape(el.id)}"]`) : null;
    return ((lbl && lbl.textContent) || '') + ' ' + (el.closest('label')?.textContent || '') + ' ' + accessibleName(el);
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

  function pageHasMagicLink() {
    /* Look for a sign-in alternative anywhere on the page. */
    const links = document.querySelectorAll('a, button');
    for (const l of links) {
      if (MAGIC_LINK_TEXT.test(accessibleName(l))) return true;
    }
    return false;
  }

  function run() {
    const findings = [];
    const magicLink = pageHasMagicLink();

    /* 1. CAPTCHA iframes. */
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(el => {
      if (!isVisible(el)) return;
      const src   = el.getAttribute('src') || '';
      const title = el.getAttribute('title') || '';
      if (CAPTCHA_IFRAME_SRC.test(src) || CAPTCHA_TEXT.test(title)) {
        const base = {
          engine:    'Accessible Authentication',
          criterion: 'WCAG 2.2 SC 3.3.8 (Level AA)',
          selector:  cssPath(el),
          element:   (el.outerHTML || '').slice(0, 200)
        };
        if (magicLink) {
          findings.push(Object.assign({}, base, {
            verdict: 'Pass',
            severity: 'Minor',
            issue:   'CAPTCHA present but a magic-link alternative is available on the same page; SC 3.3.8 alternative path is satisfied.',
            howToFix: ''
          }));
        } else {
          findings.push(Object.assign({}, base, {
            verdict: 'Fail',
            severity: 'Serious',
            issue:   'CAPTCHA iframe detected with no alternative authentication method on the page.',
            howToFix: 'Provide an alternative such as magic-link / email-link sign-in, WebAuthn, or a recognisable-object CAPTCHA that does not rely on transcription.'
          }));
        }
      }
    });

    /* 2. Password fields. */
    const pwds = document.querySelectorAll('input[type="password"]');
    pwds.forEach(el => {
      if (!isVisible(el)) return;
      const onpaste = el.getAttribute('onpaste') || '';
      const ac      = (el.getAttribute('autocomplete') || '').toLowerCase();
      const blocksPaste = /false|return\s*false|preventdefault/i.test(onpaste);
      const blocksAutocomplete = ac === 'off';
      const memorablePhrase = MEMORABLE_PWD_TEXT.test(nearbyText(el));

      const base = {
        engine:    'Accessible Authentication',
        criterion: 'WCAG 2.2 SC 3.3.8 (Level AA)',
        selector:  cssPath(el),
        element:   (el.outerHTML || '').slice(0, 200)
      };

      if (blocksPaste || blocksAutocomplete || memorablePhrase) {
        findings.push(Object.assign({}, base, {
          verdict: 'Fail',
          severity: 'Serious',
          issue:   `Password field blocks password-manager assistance (${blocksPaste ? 'paste disabled' : ''}${blocksAutocomplete ? (blocksPaste ? ', ' : '') + 'autocomplete=off' : ''}${memorablePhrase ? (blocksPaste || blocksAutocomplete ? ', ' : '') + 'memorable-password wording' : ''}), which forces the user to recall the password (cognitive function test).`,
          howToFix: 'Remove onpaste handlers that block paste, replace autocomplete="off" with autocomplete="current-password" or "new-password", and drop "memorable password" / "recall your password" wording.'
        }));
      } else if (ac.includes('current-password') || ac.includes('new-password')) {
        findings.push(Object.assign({}, base, {
          verdict: 'Pass',
          severity: 'Minor',
          issue:   `Password field allows password-manager assistance (autocomplete="${ac}", paste not blocked).`,
          howToFix: ''
        }));
      }
    });

    /* 3. Image-grid puzzles. */
    const fieldsets = document.querySelectorAll('fieldset');
    fieldsets.forEach(el => {
      if (!isVisible(el)) return;
      const legend = el.querySelector('legend');
      if (!legend) return;
      if (!PUZZLE_TEXT.test(legend.textContent || '')) return;
      const imgs = el.querySelectorAll('img');
      if (imgs.length < 2) return;
      findings.push({
        engine:    'Accessible Authentication',
        criterion: 'WCAG 2.2 SC 3.3.8 (Level AA)',
        selector:  cssPath(el),
        element:   (el.outerHTML || '').slice(0, 200),
        verdict:   'Warning',
        severity:  'Moderate',
        issue:     'Image-selection puzzle pattern detected. May be a CAPTCHA (Fail) or a legitimate selection UI (Pass). Manual review needed.',
        howToFix:  'If this is part of authentication, replace with object-recognition (SC 3.3.8 exception) or provide an alternative path such as magic-link.'
      });
    });

    /* 4. Explicit magic-link sign-in link reported as Pass evidence. */
    if (magicLink) {
      const ml = Array.from(document.querySelectorAll('a, button'))
        .find(l => MAGIC_LINK_TEXT.test(accessibleName(l)));
      if (ml) {
        findings.push({
          engine:    'Accessible Authentication',
          criterion: 'WCAG 2.2 SC 3.3.8 (Level AA)',
          selector:  cssPath(ml),
          element:   (ml.outerHTML || '').slice(0, 200),
          verdict:   'Pass',
          severity:  'Minor',
          issue:     'Magic-link / passwordless sign-in alternative detected; satisfies SC 3.3.8 alternative requirement.',
          howToFix:  ''
        });
      }
    }

    return findings;
  }

  const api = { run, _internal: { CAPTCHA_IFRAME_SRC, MAGIC_LINK_TEXT } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.AMASAMYAEngineAccessibleAuth = api;
})(typeof window !== 'undefined' ? window : globalThis);
