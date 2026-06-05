/**
 * AMASAMYA Engine 22 - Consistent Help (WCAG 2.2 SC 3.2.6, Level A)
 *
 * Reference: https://www.w3.org/TR/WCAG22/#consistent-help
 *
 * What the SC requires:
 *   If a Web page contains any of the following help mechanisms, and
 *   those mechanisms are repeated on multiple Web pages within a Set
 *   of Web Pages, they occur in the same relative order to other page
 *   content, unless a change is initiated by the user:
 *     - human contact details
 *     - human contact mechanism
 *     - self-help option
 *     - fully automated contact mechanism
 *
 * Detection scope:
 *   A single-page audit cannot prove "same relative order across the
 *   set of pages" - that is an inter-page invariant. This engine
 *   therefore EMITS WARNINGS only, recording every detected help
 *   mechanism with its DOM order so an auditor can cross-reference
 *   against a second-page audit.
 *
 *   Engine output also stores the ordered list on
 *   sessionStorage under key __AMASAMYA_HelpOrder so a future v4.1
 *   diff feature can compare two audits of the same site.
 *
 * Heuristics used to identify help mechanisms:
 *   - Contact link: <a> whose accessible name matches /contact/i
 *   - Help link: <a> whose accessible name matches /help|support|faq/i
 *   - Phone number: <a href="tel:..."> or text matching common phone patterns near a "phone"/"call" label
 *   - Email link: <a href="mailto:...">
 *   - Chat widget: button or div with role=button whose accessible name matches /chat|message us/i
 *   - Self-help: <a> whose accessible name matches /faq|knowledge base|docs/i
 */

(function (global) {
  'use strict';

  const CATEGORY_RULES = [
    { category: 'human contact mechanism', match: (el) => el.tagName === 'A' && /^tel:/i.test(el.getAttribute('href') || '') },
    { category: 'human contact details',   match: (el) => el.tagName === 'A' && /^mailto:/i.test(el.getAttribute('href') || '') },
    { category: 'human contact mechanism', match: (el) => el.tagName === 'A' && /\bcontact\b/i.test(accessibleName(el)) },
    { category: 'self-help option',        match: (el) => el.tagName === 'A' && /\b(faq|knowledge\s*base|documentation|docs|help center)\b/i.test(accessibleName(el)) },
    { category: 'self-help option',        match: (el) => el.tagName === 'A' && /\b(help|support)\b/i.test(accessibleName(el)) && !/\bhelping\b/i.test(accessibleName(el)) },
    { category: 'fully automated contact', match: (el) => isButton(el) && /\b(chat|message us|live chat|chatbot)\b/i.test(accessibleName(el)) }
  ];

  function accessibleName(el) {
    return (el.getAttribute('aria-label') || el.textContent || '').trim();
  }
  function isButton(el) {
    return el.tagName === 'BUTTON' || (el.getAttribute('role') || '').toLowerCase() === 'button';
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

  function classify(el) {
    for (const rule of CATEGORY_RULES) {
      try { if (rule.match(el)) return rule.category; } catch (_) {}
    }
    return null;
  }

  function run() {
    const findings = [];
    const ordered = [];
    /* Walk in document order via querySelectorAll. */
    const candidates = document.querySelectorAll('a, button, [role="button"]');
    candidates.forEach((el, idx) => {
      if (!isVisible(el)) return;
      const category = classify(el);
      if (!category) return;
      ordered.push({
        order:    ordered.length + 1,
        category: category,
        name:     accessibleName(el).slice(0, 60),
        selector: cssPath(el)
      });
      findings.push({
        engine:    'Consistent Help',
        criterion: 'WCAG 2.2 SC 3.2.6 (Level A)',
        selector:  cssPath(el),
        element:   (el.outerHTML || '').slice(0, 200),
        verdict:   'Warning',
        severity:  'Minor',
        issue:     `Help mechanism detected: ${category}. Single-page audit cannot verify SC 3.2.6 ("same relative order across the set of pages"). Re-run on a second page of the same site and compare orders.`,
        howToFix:  `Ensure this ${category} appears in the same relative order on every page of the site where it is present. Position ${ordered.length} of ${candidates.length} candidates scanned.`,
        helpOrder: ordered.length
      });
    });

    /* Persist the ordered list so a future diff feature (v4.1) can
       compare across pages without re-running detection. */
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('__AMASAMYA_HelpOrder', JSON.stringify({
          url:    location.href,
          taken:  new Date().toISOString(),
          items:  ordered
        }));
      }
    } catch (_) { /* sessionStorage can throw in some sandboxes */ }

    return findings;
  }

  const api = { run, _internal: { classify, CATEGORY_RULES } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.AMASAMYAEngineConsistentHelp = api;
})(typeof window !== 'undefined' ? window : globalThis);
