/**
 * AMASAMYA Extension - Content Script
 * Injected into the active tab to run all 13 audit engines.
 * Results are sent to the service worker via chrome.runtime.sendMessage.
 */

(function () {
  'use strict';

  // Prevent double-injection
  if (window.__AMASAMYAAuditRunning) return;
  window.__AMASAMYAAuditRunning = true;

  /* ================================================================
     PHASE 1 ENGINES + UTILITIES (inlined from phase1-engines.js)
  ================================================================ */

  const TOOL_VERSION = '3.1.0';
  const CONTRAST = { NORMAL_AA: 4.5, LARGE_AA: 3.0, NORMAL_AAA: 7.0, LARGE_AAA: 4.5, NON_TEXT: 3.0 };
  const LARGE_TEXT_PT_BOLD = 14;
  const LARGE_TEXT_PT_NORMAL = 18;
  const PT_TO_PX = 1.333333;
  const SEV = { CRITICAL: 'Critical', SERIOUS: 'Serious', MODERATE: 'Moderate', MINOR: 'Minor' };
  const LANDMARK_ROLES = ['banner','complementary','contentinfo','form','main','navigation','region','search'];
  const IMPLICIT_LANDMARKS = { header: 'banner', footer: 'contentinfo', main: 'main', nav: 'navigation', aside: 'complementary', section: 'region', form: 'form' };

  let findingCounter = 0;
  function generateId() { return `AMASAMYA-${String(++findingCounter).padStart(4, '0')}`; }

  function parseColour(str) {
    if (!str || str === 'transparent' || str === 'rgba(0, 0, 0, 0)') return { r: 255, g: 255, b: 255, a: 0 };
    let m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
    m = str.match(/^#([0-9a-f]+)$/i);
    if (m) {
      const h = m[1];
      if (h.length === 3) return { r: parseInt(h[0]+h[0],16), g: parseInt(h[1]+h[1],16), b: parseInt(h[2]+h[2],16), a: 1 };
      if (h.length === 6) return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16), a: 1 };
      if (h.length === 8) return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16), a: parseInt(h.slice(6,8),16)/255 };
    }
    return null;
  }

  function blendColour(fg, bg) {
    const a = fg.a !== undefined ? fg.a : 1;
    if (a >= 1) return fg;
    return { r: Math.round(fg.r * a + bg.r * (1 - a)), g: Math.round(fg.g * a + bg.g * (1 - a)), b: Math.round(fg.b * a + bg.b * (1 - a)), a: 1 };
  }

  function linearise(c) { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }
  function luminance(col) { return 0.2126 * linearise(col.r) + 0.7152 * linearise(col.g) + 0.0722 * linearise(col.b); }
  function contrastRatio(c1, c2) { const l1 = luminance(c1), l2 = luminance(c2); return (Math.max(l1,l2) + 0.05) / (Math.min(l1,l2) + 0.05); }

  function getEffectiveBg(el) {
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    const ancestors = [];
    let cur = el;
    while (cur && cur !== document.documentElement) { ancestors.unshift(cur); cur = cur.parentElement; }
    for (const node of ancestors) { const c = parseColour(window.getComputedStyle(node).backgroundColor); if (c && c.a > 0) bg = blendColour(c, bg); }
    return bg;
  }

  function isLargeText(cs) {
    const ptSize = parseFloat(cs.fontSize) / PT_TO_PX;
    const bold = parseInt(cs.fontWeight) >= 700 || cs.fontWeight === 'bold';
    return (bold && ptSize >= LARGE_TEXT_PT_BOLD) || (!bold && ptSize >= LARGE_TEXT_PT_NORMAL);
  }

  function getAccessibleName(el) {
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) { const names = labelledBy.split(/\s+/).map(id => { const ref = document.getElementById(id); return ref ? ref.textContent.trim() : ''; }).filter(Boolean); if (names.length) return names.join(' '); }
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
    if (el.id) { const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(el.id) : el.id; const label = document.querySelector(`label[for="${escaped}"]`); if (label) return label.textContent.trim(); }
    const wrappingLabel = el.closest('label');
    if (wrappingLabel) return wrappingLabel.textContent.trim();
    if (el.tagName === 'IMG') return el.getAttribute('alt') || '';
    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();
    return el.textContent.trim().slice(0, 120);
  }

  function describeEl(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const role = el.getAttribute('role') ? `[role="${el.getAttribute('role')}"]` : '';
    const name = getAccessibleName(el);
    const label = name ? ` "${name.slice(0, 60)}"` : '';
    return `<${tag}${id}${cls}${role}>${label}`;
  }

  /* ================================================================
     ENGINE 1: FOCUS ORDER
  ================================================================ */
  function auditFocusOrder() {
    const findings = [];
    const focusable = Array.from(document.querySelectorAll('a[href],button,input:not([type="hidden"]),select,textarea,[tabindex],[contenteditable="true"],details>summary,audio[controls],video[controls],[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="combobox"],[role="listbox"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="option"],[role="slider"],[role="spinbutton"],[role="switch"],[role="tab"],[role="textbox"],[role="treeitem"]')).filter(el => {
      const ti = parseInt(el.getAttribute('tabindex'));
      if (el.getAttribute('tabindex') !== null && ti < 0) return false;
      if (el.disabled) return false;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return !(rect.width === 0 && rect.height === 0);
    });
    focusable.filter(el => { const ti = parseInt(el.getAttribute('tabindex')); return !isNaN(ti) && ti > 0; }).forEach(el => {
      findings.push({ id: generateId(), engine: 'Focus Order', element: describeEl(el), criterion: 'WCAG 2.2 SC 2.4.3 Focus Order (Level A)', issue: `Positive tabindex value of ${el.getAttribute('tabindex')} found.`, computed: `tabindex="${el.getAttribute('tabindex')}"`, required: 'tabindex="0" or no tabindex', verdict: 'Fail', severity: SEV.SERIOUS, howToFix: 'Remove the tabindex attribute or set it to 0.' });
    });
    document.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog').forEach(dialog => {
      const cs = window.getComputedStyle(dialog);
      if (cs.display !== 'none' && cs.visibility !== 'hidden') {
        if (!dialog.querySelector('[aria-label*="close" i],[aria-label*="dismiss" i],button[class*="close" i]')) {
          findings.push({ id: generateId(), engine: 'Focus Order', element: describeEl(dialog), criterion: 'WCAG 2.2 SC 2.1.2 No Keyboard Trap (Level A)', issue: 'Dialog without detectable close mechanism.', computed: 'No close button found', required: 'Keyboard-operable close mechanism', verdict: 'Warning', severity: SEV.CRITICAL, howToFix: 'Add a close button and Escape key handler.' });
        }
      }
    });
    findings.push({ id: generateId(), engine: 'Focus Order', element: 'Page', criterion: 'WCAG 2.2 SC 2.4.3 Focus Order (Level A)', issue: `${focusable.length} focusable elements found.`, computed: `${focusable.length} focusable elements`, required: 'Logical focus order', verdict: 'Info', severity: SEV.MINOR, howToFix: 'Verify focus order matches reading order.' });
    return findings;
  }

  /* ================================================================
     ENGINE 2: FOCUS VISIBILITY
  ================================================================ */
  function auditFocusVisibility() {
    const findings = [];
    const focusable = Array.from(document.querySelectorAll('a[href],button,input:not([type="hidden"]),select,textarea,[tabindex="0"]')).filter(el => { if (el.disabled) return false; const cs = window.getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; }).slice(0, 80);
    focusable.forEach(el => {
      const cs = window.getComputedStyle(el);
      const hasOutline = cs.outlineStyle !== 'none' && (parseFloat(cs.outlineWidth) || 0) >= 1;
      const hasBoxShadow = cs.boxShadow && cs.boxShadow !== 'none';
      if (!hasOutline && !hasBoxShadow && (cs.outlineStyle === 'none' || (parseFloat(cs.outlineWidth) || 0) === 0)) {
        findings.push({ id: generateId(), engine: 'Focus Visibility', element: describeEl(el), criterion: 'WCAG 2.2 SC 2.4.7 Focus Visible (Level AA)', issue: 'Focus indicator appears removed or suppressed.', computed: `outline: ${cs.outlineStyle} ${cs.outlineWidth}`, required: 'Visible 2px+ focus indicator with 3:1 contrast', verdict: 'Fail', severity: SEV.SERIOUS, howToFix: 'Provide a :focus-visible style with visible outline.' });
      } else if (hasOutline) {
        const fg = parseColour(cs.outlineColor), bg = getEffectiveBg(el);
        if (fg && bg) { const ratio = contrastRatio(blendColour(fg, bg), bg); if (ratio < CONTRAST.NON_TEXT) { findings.push({ id: generateId(), engine: 'Focus Visibility', element: describeEl(el), criterion: 'WCAG 2.2 SC 2.4.11 Focus Appearance (Level AA)', issue: `Focus outline contrast ${ratio.toFixed(2)}:1 below 3:1 minimum.`, computed: `${ratio.toFixed(2)}:1`, required: '3:1 minimum', verdict: 'Fail', severity: SEV.SERIOUS, howToFix: 'Increase focus outline contrast.' }); } }
      }
    });
    if (findings.length === 0) findings.push({ id: generateId(), engine: 'Focus Visibility', element: 'Page', criterion: 'WCAG 2.2 SC 2.4.7/2.4.11', issue: 'No focus visibility failures.', computed: `${focusable.length} checked`, required: 'Visible focus indicators', verdict: 'Pass', severity: SEV.MINOR, howToFix: 'No action required.' });
    return findings;
  }

  /* ================================================================
     ENGINE 3: COLOUR CONTRAST
  ================================================================ */
  function auditColourContrast() {
    const findings = [];
    const textEls = Array.from(document.querySelectorAll('*')).filter(el => {
      if (['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG','PATH'].includes(el.tagName)) return false;
      if (!Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 0)) return false;
      const cs = window.getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) !== 0;
    }).slice(0, 200);
    textEls.forEach(el => {
      const cs = window.getComputedStyle(el), fgRaw = parseColour(cs.color);
      if (!fgRaw) return;
      const bg = getEffectiveBg(el), fg = blendColour(fgRaw, bg), ratio = contrastRatio(fg, bg), large = isLargeText(cs);
      const reqAA = large ? CONTRAST.LARGE_AA : CONTRAST.NORMAL_AA, reqAAA = large ? CONTRAST.LARGE_AAA : CONTRAST.NORMAL_AAA, label = large ? 'large text' : 'normal text';
      if (ratio < reqAA) findings.push({ id: generateId(), engine: 'Colour Contrast', element: describeEl(el), criterion: `WCAG 2.2 SC 1.4.3 (Level AA) - ${label}`, issue: `Contrast ${ratio.toFixed(2)}:1 below ${reqAA}:1 for ${label}.`, computed: `${ratio.toFixed(2)}:1 (fg: ${cs.color})`, required: `${reqAA}:1`, verdict: 'Fail', severity: ratio < 2.0 ? SEV.CRITICAL : SEV.SERIOUS, howToFix: `Adjust colours to achieve ${reqAA}:1+.` });
      else if (ratio < reqAAA) findings.push({ id: generateId(), engine: 'Colour Contrast', element: describeEl(el), criterion: `WCAG 2.2 SC 1.4.6 (Level AAA) - ${label}`, issue: `Contrast ${ratio.toFixed(2)}:1 passes AA but fails AAA (${reqAAA}:1).`, computed: `${ratio.toFixed(2)}:1`, required: `${reqAAA}:1`, verdict: 'Warning', severity: SEV.MODERATE, howToFix: `Increase to ${reqAAA}:1 for AAA.` });
    });
    Array.from(document.querySelectorAll('button,input,select,textarea,[role="button"],[role="checkbox"],[role="radio"],[role="switch"]')).filter(el => { const cs = window.getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; }).slice(0, 80).forEach(el => {
      const cs = window.getComputedStyle(el), bc = parseColour(cs.borderColor), bg = getEffectiveBg(el.parentElement || el);
      if (!bc || bc.a === 0) return;
      const ratio = contrastRatio(blendColour(bc, bg), bg);
      if (ratio < CONTRAST.NON_TEXT) findings.push({ id: generateId(), engine: 'Colour Contrast', element: describeEl(el), criterion: 'WCAG 2.2 SC 1.4.11 Non-text Contrast (Level AA)', issue: `Border contrast ${ratio.toFixed(2)}:1 below 3:1.`, computed: `${ratio.toFixed(2)}:1`, required: '3:1', verdict: 'Fail', severity: SEV.SERIOUS, howToFix: 'Increase border contrast to 3:1+.' });
    });
    return findings;
  }

  /* ================================================================
     ENGINE 4: HEADING STRUCTURE
  ================================================================ */
  function auditHeadingStructure() {
    const findings = [];
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')).filter(el => { const cs = window.getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; });
    if (headings.length === 0) { findings.push({ id: generateId(), engine: 'Heading Structure', element: 'Page', criterion: 'WCAG 2.2 SC 1.3.1/2.4.6', issue: 'No headings found.', computed: '0', required: 'At least one heading', verdict: 'Fail', severity: SEV.SERIOUS, howToFix: 'Add an H1 heading.' }); return findings; }
    const h1s = headings.filter(h => h.tagName === 'H1' || (h.getAttribute('role') === 'heading' && h.getAttribute('aria-level') === '1'));
    if (h1s.length === 0) findings.push({ id: generateId(), engine: 'Heading Structure', element: 'Page', criterion: 'WCAG 2.2 SC 2.4.6', issue: 'No H1 found.', computed: '0 H1', required: 'One H1', verdict: 'Fail', severity: SEV.SERIOUS, howToFix: 'Add a descriptive H1.' });
    else if (h1s.length > 1) findings.push({ id: generateId(), engine: 'Heading Structure', element: 'Page', criterion: 'WCAG 2.2 SC 2.4.6', issue: `${h1s.length} H1 headings found.`, computed: `${h1s.length} H1`, required: 'One H1', verdict: 'Warning', severity: SEV.MODERATE, howToFix: 'Demote extra H1 headings.' });
    let prevLevel = 0;
    headings.forEach(h => {
      let level = h.tagName && h.tagName.match(/^H[1-6]$/) ? parseInt(h.tagName[1]) : (parseInt(h.getAttribute('aria-level')) || 2);
      if (prevLevel > 0 && level > prevLevel + 1) findings.push({ id: generateId(), engine: 'Heading Structure', element: describeEl(h), criterion: 'WCAG 2.2 SC 1.3.1', issue: `Skipped H${prevLevel} to H${level}.`, computed: `H${prevLevel}→H${level}`, required: `H${prevLevel + 1}`, verdict: 'Fail', severity: SEV.MODERATE, howToFix: `Use H${prevLevel + 1} instead.` });
      if (!getAccessibleName(h).trim()) findings.push({ id: generateId(), engine: 'Heading Structure', element: describeEl(h), criterion: 'WCAG 2.2 SC 2.4.6', issue: 'Empty heading.', computed: 'empty', required: 'Descriptive text', verdict: 'Fail', severity: SEV.SERIOUS, howToFix: 'Add text or remove.' });
      prevLevel = level;
    });
    return findings;
  }

  /* ================================================================
     ENGINE 5: LANDMARKS
  ================================================================ */
  function auditLandmarks() {
    const findings = [], landmarks = [];
    LANDMARK_ROLES.forEach(role => { document.querySelectorAll(`[role="${role}"]`).forEach(el => { const cs = window.getComputedStyle(el); if (cs.display !== 'none' && cs.visibility !== 'hidden') landmarks.push({ el, role, source: 'aria' }); }); });
    Object.entries(IMPLICIT_LANDMARKS).forEach(([tag, role]) => { document.querySelectorAll(tag).forEach(el => { if (el.getAttribute('role')) return; if ((tag === 'section' || tag === 'form') && !getAccessibleName(el)) return; const cs = window.getComputedStyle(el); if (cs.display !== 'none' && cs.visibility !== 'hidden') landmarks.push({ el, role, source: 'implicit' }); }); });
    if (!landmarks.some(l => l.role === 'main')) findings.push({ id: generateId(), engine: 'Landmarks', element: 'Page', criterion: 'WCAG 2.2 SC 2.4.1', issue: 'No main landmark.', computed: 'No <main>', required: 'One main landmark', verdict: 'Fail', severity: SEV.SERIOUS, howToFix: 'Add <main> element.' });
    const mains = landmarks.filter(l => l.role === 'main');
    if (mains.length > 1) findings.push({ id: generateId(), engine: 'Landmarks', element: 'Page', criterion: 'WCAG 2.2 SC 1.3.1', issue: `${mains.length} main landmarks.`, computed: `${mains.length}`, required: 'Exactly one', verdict: 'Fail', severity: SEV.SERIOUS, howToFix: 'Remove duplicates.' });
    const rc = {};
    landmarks.forEach(l => { rc[l.role] = rc[l.role] || []; rc[l.role].push(l); });
    Object.entries(rc).forEach(([role, items]) => { if (items.length > 1 && role !== 'main') { const names = items.map(l => getAccessibleName(l.el)); if (new Set(names.filter(Boolean)).size < items.length) findings.push({ id: generateId(), engine: 'Landmarks', element: `Multiple ${role}`, criterion: 'WCAG 2.2 SC 1.3.1', issue: `${items.length} ${role} landmarks without unique names.`, computed: `${items.length} ${role}`, required: 'Unique names', verdict: 'Fail', severity: SEV.MODERATE, howToFix: 'Add unique aria-labels.' }); } });
    const outside = Array.from(document.querySelectorAll('p,li,td,th,dt,dd,blockquote,pre,figcaption')).filter(el => { const cs = window.getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || !el.textContent.trim()) return false; return !el.closest('main,[role="main"],nav,[role="navigation"],header,[role="banner"],footer,[role="contentinfo"],aside,[role="complementary"],section[aria-label],section[aria-labelledby],[role="region"],[role="form"],form[aria-label]'); });
    if (outside.length > 0) findings.push({ id: generateId(), engine: 'Landmarks', element: 'Page', criterion: 'WCAG 2.2 SC 1.3.1', issue: `${outside.length} elements outside landmarks.`, computed: `${outside.length}`, required: 'All content in landmarks', verdict: 'Warning', severity: SEV.MODERATE, howToFix: 'Wrap content in landmark elements.' });
    if (findings.length === 0) findings.push({ id: generateId(), engine: 'Landmarks', element: 'Page', criterion: 'Landmark Structure', issue: `${landmarks.length} landmarks, no issues.`, computed: landmarks.map(l => l.role).join(', '), required: 'Appropriate structure', verdict: 'Pass', severity: SEV.MINOR, howToFix: 'No action.' });
    return findings;
  }

  /* ================================================================
     ENGINE 6: IMAGES
     ================================================================
     Deduplicates structurally identical images. A real-world bank /
     enterprise page often reuses the same icon hundreds of times via
     <use href="#id"> or by pasting the same <img src> in every row.
     Reporting each occurrence individually produced reports with
     700+ identical lines (Mujtaba IOB audit, May 2026). We now
     fingerprint each unique problem and emit one finding per unique
     fingerprint with an occurrence count.
  ================================================================ */
  function auditImages() {
    const findings = [];
    /* Map fingerprint -> { count, sampleEl, kind } so we can emit one
       finding per unique problem with the occurrence count. */
    const seen = new Map();

    function record(kind, key, el, build) {
      const fp = kind + ':' + key;
      const prior = seen.get(fp);
      if (prior) { prior.count++; return; }
      seen.set(fp, { count: 1, sampleEl: el, build });
    }

    function fingerprintSvg(el) {
      /* Unified key - every reference to the same icon (whether
         <svg id="X"> in a defs block or <svg><use href="#X"/></svg>
         reusing it) produces the same fingerprint. So fixing one
         source icon resolves every reuse on the page; one finding,
         not many. */
      const u = el.querySelector('use');
      const href = u && (u.getAttribute('href') || u.getAttribute('xlink:href'));
      const idRef = (href || '').replace(/^#/, '');
      if (idRef) return 'icon=' + idRef;
      if (el.id) return 'icon=' + el.id;
      return 'html=' + (el.innerHTML || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    }

    Array.from(document.querySelectorAll('img,[role="img"],svg')).filter(el => {
      const cs = window.getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    }).forEach(el => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'img') {
        const alt = el.getAttribute('alt');
        const srcKey = (el.getAttribute('src') || '') + '|' + (alt === null ? 'NULL' : alt);
        if (alt === null) {
          record('img-noalt', srcKey, el, ({ count, sampleEl }) => ({
            id: generateId(), engine: 'Images', element: describeEl(sampleEl) + (count > 1 ? '  (and ' + (count - 1) + ' more identical)' : ''),
            criterion: 'WCAG 2.2 SC 1.1.1 (Level A)',
            issue: count > 1 ? `Missing alt attribute (${count} identical images on this page).` : 'Missing alt attribute.',
            computed: 'absent' + (count > 1 ? ` × ${count}` : ''),
            required: 'alt attribute required',
            verdict: 'Fail', severity: SEV.CRITICAL,
            howToFix: 'Add alt="" if decorative, or a descriptive alt text. Fixing one source fixes every occurrence.'
          }));
        } else if (alt.trim() === '') {
          record('img-emptyalt', srcKey, el, ({ count, sampleEl }) => ({
            id: generateId(), engine: 'Images', element: describeEl(sampleEl) + (count > 1 ? '  (and ' + (count - 1) + ' more identical)' : ''),
            criterion: 'WCAG 2.2 SC 1.1.1 (Level A)',
            issue: `Decorative image (alt=""). Verify. File: ${(sampleEl.src || '').split('/').pop().split('?')[0]}` + (count > 1 ? ` (${count} identical occurrences)` : ''),
            computed: 'alt=""' + (count > 1 ? ` × ${count}` : ''),
            required: 'Correct for decorative only',
            verdict: 'Info', severity: SEV.MINOR,
            howToFix: 'Confirm image is decorative.'
          }));
        } else {
          const bad = ['image','photo','picture','graphic','icon','img','.png','.jpg','.gif','.svg','.webp'];
          if (bad.some(p => alt.toLowerCase() === p || alt.toLowerCase().endsWith(p))) {
            record('img-genericalt', srcKey, el, ({ count, sampleEl }) => ({
              id: generateId(), engine: 'Images', element: describeEl(sampleEl) + (count > 1 ? '  (and ' + (count - 1) + ' more identical)' : ''),
              criterion: 'WCAG 2.2 SC 1.1.1 (Level A)',
              issue: `Generic alt "${alt}"` + (count > 1 ? ` (${count} identical occurrences)` : '') + '.',
              computed: `alt="${alt}"` + (count > 1 ? ` × ${count}` : ''),
              required: 'Descriptive text',
              verdict: 'Fail', severity: SEV.SERIOUS,
              howToFix: 'Replace with meaningful description. Fixing the source fixes every occurrence.'
            }));
          }
        }
      }
      if (tag === 'svg' && el.getAttribute('aria-hidden') !== 'true' && !getAccessibleName(el) && !el.querySelector('title')) {
        record('svg-noname', fingerprintSvg(el), el, ({ count, sampleEl }) => ({
          id: generateId(), engine: 'Images', element: describeEl(sampleEl) + (count > 1 ? '  (and ' + (count - 1) + ' more identical reuses)' : ''),
          criterion: 'WCAG 2.2 SC 1.1.1 (Level A)',
          issue: count > 1
            ? `SVG has no accessible name (${count} identical reuses of this icon on the page - typically a <use href> reference).`
            : 'SVG has no accessible name.',
          computed: 'No title/aria-label' + (count > 1 ? ` × ${count}` : ''),
          required: 'Accessible name or aria-hidden',
          verdict: 'Fail', severity: SEV.SERIOUS,
          howToFix: 'Add <title> inside the SVG, or aria-hidden="true" if decorative. Fixing the source icon fixes every reuse on the page.'
        }));
      }
    });

    /* Emit one finding per unique problem. */
    for (const entry of seen.values()) {
      findings.push(entry.build(entry));
    }
    return findings;
  }

  /* ================================================================
     ENGINE 7: FORMS
  ================================================================ */
  function auditForms() {
    const findings = [];
    Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="reset"]):not([type="button"]),select,textarea,[role="textbox"],[role="combobox"],[role="listbox"],[role="checkbox"],[role="radio"],[role="switch"],[role="spinbutton"]')).filter(el => { const cs = window.getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && !el.disabled; }).forEach(el => {
      const name = getAccessibleName(el);
      if (!name || !name.trim()) findings.push({ id: generateId(), engine: 'Forms', element: describeEl(el), criterion: 'WCAG 2.2 SC 1.3.1/3.3.2 (Level A)', issue: `Unlabelled ${el.getAttribute('type') || el.tagName.toLowerCase()} control.`, computed: 'No accessible name', required: 'Programmatic label', verdict: 'Fail', severity: SEV.CRITICAL, howToFix: 'Add <label for="">, aria-label, or aria-labelledby.' });
    });
    Array.from(document.querySelectorAll('[required],[aria-required="true"]')).forEach(el => {
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (el.getAttribute('aria-required') !== 'true' && !el.required) findings.push({ id: generateId(), engine: 'Forms', element: describeEl(el), criterion: 'WCAG 2.2 SC 1.3.1 (Level A)', issue: 'Required field without aria-required.', computed: 'Not set', required: 'aria-required="true"', verdict: 'Warning', severity: SEV.MODERATE, howToFix: 'Add aria-required="true".' });
    });
    return findings;
  }

  /* ================================================================
     ENGINE 8: LINKS AND BUTTONS
  ================================================================ */
  function auditLinksButtons() {
    const findings = [], generic = ['click here','read more','learn more','here','more','link','button','continue','go','visit','see more','view more','details'];
    Array.from(document.querySelectorAll('a[href],[role="link"]')).filter(el => { const cs = window.getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; }).forEach(el => {
      const name = getAccessibleName(el).toLowerCase().trim();
      if (!name) findings.push({ id: generateId(), engine: 'Links and Buttons', element: describeEl(el), criterion: 'WCAG 2.2 SC 2.4.4/4.1.2 (Level A)', issue: 'Link has no accessible name.', computed: 'empty', required: 'Descriptive name', verdict: 'Fail', severity: SEV.CRITICAL, howToFix: 'Add link text or aria-label.' });
      else if (generic.includes(name)) findings.push({ id: generateId(), engine: 'Links and Buttons', element: describeEl(el), criterion: 'WCAG 2.2 SC 2.4.4 (Level A)', issue: `Generic link text "${name}".`, computed: `"${name}"`, required: 'Descriptive text', verdict: 'Fail', severity: SEV.SERIOUS, howToFix: 'Use descriptive text or aria-label.' });
    });
    Array.from(document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]')).filter(el => { const cs = window.getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; }).forEach(el => {
      if (!getAccessibleName(el).trim()) findings.push({ id: generateId(), engine: 'Links and Buttons', element: describeEl(el), criterion: 'WCAG 2.2 SC 4.1.2 (Level A)', issue: 'Button has no accessible name.', computed: 'empty', required: 'Descriptive name', verdict: 'Fail', severity: SEV.CRITICAL, howToFix: 'Add button text or aria-label.' });
    });
    return findings;
  }

  /* ================================================================
     PHASE 2 ENGINE 9: HIGH CONTRAST
  ================================================================ */
  function auditHighContrast() {
    const findings = [];
    const els = Array.from(document.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="progressbar"],[role="meter"]')).filter(el => { const cs = window.getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; }).slice(0, 100);
    els.forEach(el => {
      const cs = window.getComputedStyle(el);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !el.textContent.trim() && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
        findings.push({ id: generateId(), engine: 'High Contrast', element: describeEl(el), criterion: 'WCAG 2.2 SC 1.4.3 - High Contrast Mode', issue: 'Background-image element with no text fallback. Lost in forced-colors mode.', computed: `bg-image present; no text/aria-label`, required: 'Text fallback or inline SVG with currentColor', verdict: 'Fail', severity: SEV.SERIOUS, howToFix: 'Add text content or use inline SVG with currentColor.' });
      }
      if (el.matches('button,a[href],input,select,textarea,[role="button"],[role="link"]') && (parseFloat(cs.borderWidth) || 0) === 0 && cs.borderStyle === 'none' && cs.outlineStyle === 'none') {
        findings.push({ id: generateId(), engine: 'High Contrast', element: describeEl(el), criterion: 'WCAG 2.2 SC 2.4.11 - High Contrast Mode', issue: 'Interactive element has no border or outline. May lack visible boundary in forced-colors mode.', computed: 'border: none; outline: none', required: 'Visible boundary in forced-colors mode', verdict: 'Warning', severity: SEV.MODERATE, howToFix: 'Add border: 2px solid transparent (becomes visible in forced-colors).' });
      }
    });
    const custom = Array.from(document.querySelectorAll('input[type="checkbox"],input[type="radio"]')).filter(el => { const cs = window.getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.opacity === '0' || (cs.position === 'absolute' && (r.width <= 1 || r.height <= 1)); });
    if (custom.length > 0) findings.push({ id: generateId(), engine: 'High Contrast', element: `${custom.length} custom controls`, criterion: 'WCAG 2.2 SC 1.4.3 - High Contrast Mode', issue: `${custom.length} hidden native controls with custom styling. May lose state indicators in forced-colors.`, computed: `${custom.length} hidden inputs`, required: 'Operable in forced-colors', verdict: 'Warning', severity: SEV.SERIOUS, howToFix: 'Add @media (forced-colors: active) fallback styles.' });
    if (findings.length === 0) findings.push({ id: generateId(), engine: 'High Contrast', element: 'Page', criterion: 'High Contrast Mode', issue: 'No issues detected.', computed: `${els.length} checked`, required: 'Visible in forced-colors', verdict: 'Pass', severity: SEV.MINOR, howToFix: 'Verify manually.' });
    return findings;
  }

  /* ================================================================
     PHASE 2 ENGINE 10: DARK MODE
  ================================================================ */
  function auditDarkMode() {
    const findings = [];
    let hasDarkStyles = false;
    try { for (const s of document.styleSheets) { try { for (const r of s.cssRules || []) { if (r.conditionText && r.conditionText.includes('prefers-color-scheme')) { hasDarkStyles = true; break; } } } catch(e){} if (hasDarkStyles) break; } } catch(e){}
    const hasThemeAttr = document.documentElement.hasAttribute('data-theme') || document.documentElement.classList.contains('dark') || document.body.classList.contains('dark') || document.body.classList.contains('dark-mode');
    if (!hasDarkStyles && !hasThemeAttr) findings.push({ id: generateId(), engine: 'Dark Mode', element: 'Page', criterion: 'WCAG 2.2 SC 1.4.3 - Dark Mode', issue: 'No dark mode support detected.', computed: 'No prefers-color-scheme rules or theme classes', required: 'Support user colour scheme preferences', verdict: 'Warning', severity: SEV.MODERATE, howToFix: 'Add @media (prefers-color-scheme: dark) styles.' });
    const textEls = Array.from(document.querySelectorAll('*')).filter(el => { if (['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG','PATH','BR','HR'].includes(el.tagName)) return false; if (!Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())) return false; const cs = window.getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; }).slice(0, 100);
    textEls.forEach(el => { const s = el.getAttribute('style') || ''; if (/(?:^|;)\s*color\s*:/i.test(s) || /(?:^|;)\s*background(?:-color)?\s*:/i.test(s)) findings.push({ id: generateId(), engine: 'Dark Mode', element: describeEl(el), criterion: 'WCAG 2.2 SC 1.4.3 - Dark Mode', issue: 'Inline colour styles may not adapt to dark mode.', computed: `style="${s.slice(0, 80)}"`, required: 'Use CSS custom properties', verdict: 'Warning', severity: SEV.MODERATE, howToFix: 'Replace inline styles with CSS custom properties.' }); });
    const bodyBg = getEffectiveBg(document.body);
    if (luminance(bodyBg) < 0.2) { textEls.slice(0, 80).forEach(el => { const cs = window.getComputedStyle(el), fg = parseColour(cs.color); if (!fg) return; const bg = getEffectiveBg(el), ratio = contrastRatio(blendColour(fg, bg), bg), large = isLargeText(cs), req = large ? CONTRAST.LARGE_AA : CONTRAST.NORMAL_AA; if (ratio < req) findings.push({ id: generateId(), engine: 'Dark Mode', element: describeEl(el), criterion: 'WCAG 2.2 SC 1.4.3 - Dark Mode Active', issue: `Dark mode contrast ${ratio.toFixed(2)}:1 below ${req}:1.`, computed: `${ratio.toFixed(2)}:1`, required: `${req}:1`, verdict: 'Fail', severity: ratio < 2 ? SEV.CRITICAL : SEV.SERIOUS, howToFix: 'Adjust dark mode colours.' }); }); }
    if (findings.length === 0) findings.push({ id: generateId(), engine: 'Dark Mode', element: 'Page', criterion: 'Dark Mode', issue: 'No issues.', computed: `Dark styles: ${hasDarkStyles || hasThemeAttr}`, required: 'Contrast maintained', verdict: 'Pass', severity: SEV.MINOR, howToFix: 'No action.' });
    return findings;
  }

  /* ================================================================
     PHASE 2 ENGINE 11: TEXT SPACING
  ================================================================ */
  function auditTextSpacing() {
    const findings = [];
    const overflows = Array.from(document.querySelectorAll('*')).filter(el => { const cs = window.getComputedStyle(el); return (cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowY === 'hidden') && cs.display !== 'none'; }).slice(0, 100);
    const textEls = Array.from(document.querySelectorAll('*')).filter(el => { if (['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG','PATH','BR','HR','IMG'].includes(el.tagName)) return false; if (!Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())) return false; const cs = window.getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; }).slice(0, 150);
    const sid = 'AMASAMYA-ts-test';
    let old = document.getElementById(sid); if (old) old.remove();
    const ts = document.createElement('style'); ts.id = sid;
    ts.textContent = '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p,div,li,td,th,dd,dt,blockquote,figcaption,label,span { margin-bottom: 2em !important; }';
    document.head.appendChild(ts); document.body.offsetHeight;
    overflows.forEach(el => {
      const cs = window.getComputedStyle(el);
      if (el.scrollHeight > el.clientHeight + 2 && (cs.height !== 'auto' || cs.maxHeight !== 'none')) findings.push({ id: generateId(), engine: 'Text Spacing', element: describeEl(el), criterion: 'WCAG 2.2 SC 1.4.12 (Level AA)', issue: `Content clipped vertically (${el.scrollHeight - el.clientHeight}px hidden).`, computed: `overflow: hidden; height: ${cs.height}`, required: 'No content loss with increased spacing', verdict: 'Fail', severity: SEV.SERIOUS, howToFix: 'Use min-height and overflow: auto.' });
      if (el.scrollWidth > el.clientWidth + 2 && cs.width !== 'auto') findings.push({ id: generateId(), engine: 'Text Spacing', element: describeEl(el), criterion: 'WCAG 2.2 SC 1.4.12 (Level AA)', issue: 'Content clipped horizontally.', computed: `overflow: hidden; width: ${cs.width}`, required: 'No horizontal clipping', verdict: 'Fail', severity: SEV.SERIOUS, howToFix: 'Use flexible widths.' });
      if (cs.textOverflow === 'ellipsis') findings.push({ id: generateId(), engine: 'Text Spacing', element: describeEl(el), criterion: 'WCAG 2.2 SC 1.4.12 (Level AA)', issue: 'text-overflow: ellipsis may hide content.', computed: 'text-overflow: ellipsis', required: 'Full text accessible', verdict: 'Warning', severity: SEV.MODERATE, howToFix: 'Allow container expansion.' });
    });
    textEls.forEach(el => { const cs = window.getComputedStyle(el); if (cs.whiteSpace === 'nowrap' && (cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis')) findings.push({ id: generateId(), engine: 'Text Spacing', element: describeEl(el), criterion: 'WCAG 2.2 SC 1.4.12 (Level AA)', issue: 'white-space: nowrap with overflow hidden.', computed: `white-space: nowrap; overflow: ${cs.overflow}`, required: 'Allow wrapping', verdict: 'Warning', severity: SEV.MODERATE, howToFix: 'Remove white-space: nowrap or use overflow: visible.' }); });
    ts.remove();
    if (findings.length === 0) findings.push({ id: generateId(), engine: 'Text Spacing', element: 'Page', criterion: 'WCAG 2.2 SC 1.4.12 (Level AA)', issue: 'No text spacing issues.', computed: `${textEls.length} elements checked`, required: 'Content visible with spacing overrides', verdict: 'Pass', severity: SEV.MINOR, howToFix: 'No action.' });
    return findings;
  }

  /* ================================================================
     PHASE 2 ENGINE 12: DOM ORDER
  ================================================================ */
  function auditDomOrder() {
    const findings = [];
    const allEls = Array.from(document.querySelectorAll('*')).filter(el => { const cs = window.getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; }).slice(0, 500);
    allEls.forEach(el => { const o = parseInt(window.getComputedStyle(el).order); if (!isNaN(o) && o !== 0) findings.push({ id: generateId(), engine: 'DOM Order', element: describeEl(el), criterion: 'WCAG 2.2 SC 1.3.2 (Level A)', issue: `CSS order: ${o} changes visual position.`, computed: `order: ${o}`, required: 'Visual matches DOM order', verdict: 'Warning', severity: SEV.SERIOUS, howToFix: 'Rearrange HTML instead of using CSS order.' }); });
    allEls.forEach(el => { const cs = window.getComputedStyle(el); if ((cs.display === 'flex' || cs.display === 'inline-flex') && (cs.flexDirection === 'row-reverse' || cs.flexDirection === 'column-reverse')) { const ch = Array.from(el.children).filter(c => { const s = window.getComputedStyle(c); return s.display !== 'none'; }); if (ch.length > 1) findings.push({ id: generateId(), engine: 'DOM Order', element: describeEl(el), criterion: 'WCAG 2.2 SC 1.3.2 (Level A)', issue: `${cs.flexDirection} reverses ${ch.length} children.`, computed: `flex-direction: ${cs.flexDirection}`, required: 'Visual matches DOM order', verdict: 'Warning', severity: SEV.SERIOUS, howToFix: `Rearrange HTML and use ${cs.flexDirection === 'row-reverse' ? 'row' : 'column'}.` }); } });
    const grids = allEls.filter(el => { const d = window.getComputedStyle(el).display; return d === 'grid' || d === 'inline-grid'; });
    grids.forEach(container => {
      const children = Array.from(container.children).filter(c => window.getComputedStyle(c).display !== 'none');
      const placed = children.filter(c => { const cs = window.getComputedStyle(c); return (cs.gridRowStart && cs.gridRowStart !== 'auto') || (cs.gridColumnStart && cs.gridColumnStart !== 'auto'); });
      if (placed.length > 1) {
        const visual = children.slice().sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return Math.abs(ra.top - rb.top) > 5 ? ra.top - rb.top : ra.left - rb.left; });
        if (children.some((c, i) => c !== visual[i])) findings.push({ id: generateId(), engine: 'DOM Order', element: describeEl(container), criterion: 'WCAG 2.2 SC 1.3.2 (Level A)', issue: `Grid visual order differs from DOM order.`, computed: `${placed.length} placed items`, required: 'Matching order', verdict: 'Warning', severity: SEV.SERIOUS, howToFix: 'Rearrange HTML to match visual grid order.' });
      }
    });
    if (findings.length === 0) findings.push({ id: generateId(), engine: 'DOM Order', element: 'Page', criterion: 'WCAG 2.2 SC 1.3.2 (Level A)', issue: 'DOM order matches visual order.', computed: `${allEls.length} checked`, required: 'Matching order', verdict: 'Pass', severity: SEV.MINOR, howToFix: 'No action.' });
    return findings;
  }

  /* ================================================================
     PHASE 2 ENGINE 13: ARIA VALIDATION
  ================================================================ */
  function auditAriaValidation() {
    const findings = [];
    const VALID_ROLES = new Set(['alert','alertdialog','button','checkbox','combobox','dialog','gridcell','link','log','marquee','menuitem','menuitemcheckbox','menuitemradio','option','progressbar','radio','scrollbar','searchbox','slider','spinbutton','status','switch','tab','tabpanel','textbox','timer','tooltip','treeitem','grid','listbox','menu','menubar','radiogroup','tablist','tree','treegrid','application','article','cell','columnheader','definition','directory','document','feed','figure','group','heading','img','list','listitem','math','none','note','presentation','row','rowgroup','rowheader','separator','table','term','toolbar','banner','complementary','contentinfo','form','main','navigation','region','search','generic']);
    const REQ_OWNED = { list: ['listitem','group'], listbox: ['option','group'], menu: ['menuitem','menuitemcheckbox','menuitemradio','group'], menubar: ['menuitem','menuitemcheckbox','menuitemradio','group'], radiogroup: ['radio'], tablist: ['tab'], tree: ['treeitem','group'], treegrid: ['row','rowgroup'], grid: ['row','rowgroup'], table: ['row','rowgroup'], rowgroup: ['row'], row: ['cell','columnheader','gridcell','rowheader'] };
    const REQ_CTX = { listitem: ['list','group'], option: ['listbox','group'], menuitem: ['menu','menubar','group'], menuitemcheckbox: ['menu','menubar','group'], menuitemradio: ['menu','menubar','group'], tab: ['tablist'], treeitem: ['tree','group'], row: ['grid','treegrid','table','rowgroup'], cell: ['row'], columnheader: ['row'], gridcell: ['row'], rowheader: ['row'] };
    const VALID_ARIA = new Set(['aria-activedescendant','aria-atomic','aria-autocomplete','aria-braillelabel','aria-brailleroledescription','aria-busy','aria-checked','aria-colcount','aria-colindex','aria-colindextext','aria-colspan','aria-controls','aria-current','aria-describedby','aria-description','aria-details','aria-disabled','aria-dropeffect','aria-errormessage','aria-expanded','aria-flowto','aria-grabbed','aria-haspopup','aria-hidden','aria-invalid','aria-keyshortcuts','aria-label','aria-labelledby','aria-level','aria-live','aria-modal','aria-multiline','aria-multiselectable','aria-orientation','aria-owns','aria-placeholder','aria-posinset','aria-pressed','aria-readonly','aria-relevant','aria-required','aria-roledescription','aria-rowcount','aria-rowindex','aria-rowindextext','aria-rowspan','aria-selected','aria-setsize','aria-sort','aria-valuemax','aria-valuemin','aria-valuenow','aria-valuetext']);
    const BOOL_ARIA = new Set(['aria-atomic','aria-busy','aria-disabled','aria-grabbed','aria-hidden','aria-modal','aria-multiline','aria-multiselectable','aria-readonly','aria-required']);
    const TRI_ARIA = new Set(['aria-checked','aria-pressed']);

    const ariaEls = Array.from(document.querySelectorAll('[role],[aria-label],[aria-labelledby],[aria-describedby],[aria-hidden],[aria-expanded],[aria-checked],[aria-pressed],[aria-selected],[aria-live],[aria-controls],[aria-owns],[aria-haspopup],[aria-required],[aria-invalid],[aria-disabled],[aria-current],[aria-modal]')).filter(el => window.getComputedStyle(el).display !== 'none').slice(0, 200);

    ariaEls.forEach(el => {
      const role = el.getAttribute('role');
      if (role) {
        role.trim().split(/\s+/).forEach(r => { if (!VALID_ROLES.has(r)) findings.push({ id: generateId(), engine: 'ARIA Validation', element: describeEl(el), criterion: 'WCAG 2.2 SC 4.1.2 (Level A)', issue: `Invalid role "${r}".`, computed: `role="${role}"`, required: 'Valid WAI-ARIA 1.2 role', verdict: 'Fail', severity: SEV.SERIOUS, howToFix: `Replace "${r}" with a valid role.` }); });
        const eff = role.trim().split(/\s+/)[0];
        if (REQ_OWNED[eff]) { const ch = Array.from(el.querySelectorAll('[role]')); const has = ch.some(c => REQ_OWNED[eff].includes(c.getAttribute('role'))); const hasImplicit = (eff === 'list' && el.querySelector('li')) || (eff === 'table' && el.querySelector('tr')) || (eff === 'row' && el.querySelector('td,th')); if (!has && !hasImplicit && el.children.length > 0) findings.push({ id: generateId(), engine: 'ARIA Validation', element: describeEl(el), criterion: 'WCAG 2.2 SC 4.1.2 (Level A)', issue: `role="${eff}" missing required children: ${REQ_OWNED[eff].join(', ')}.`, computed: `Children: ${ch.map(c => c.getAttribute('role')).filter(Boolean).join(', ') || 'none'}`, required: `Contains ${REQ_OWNED[eff].join(' or ')}`, verdict: 'Fail', severity: SEV.SERIOUS, howToFix: `Add required child roles.` }); }
        if (REQ_CTX[eff]) { let p = el.parentElement, found = false; while (p && p !== document.body) { const pr = p.getAttribute('role'); if (pr && REQ_CTX[eff].includes(pr)) { found = true; break; } const t = p.tagName.toLowerCase(); if ((eff === 'listitem' && (t === 'ul' || t === 'ol')) || (eff === 'row' && ['table','thead','tbody','tfoot'].includes(t)) || (['cell','columnheader','rowheader'].includes(eff) && t === 'tr')) { found = true; break; } p = p.parentElement; } if (!found) findings.push({ id: generateId(), engine: 'ARIA Validation', element: describeEl(el), criterion: 'WCAG 2.2 SC 4.1.2 (Level A)', issue: `role="${eff}" not in required parent: ${REQ_CTX[eff].join(', ')}.`, computed: 'No matching parent', required: `Inside ${REQ_CTX[eff].join(' or ')}`, verdict: 'Fail', severity: SEV.SERIOUS, howToFix: `Place inside a ${REQ_CTX[eff][0]} container.` }); }
      }
      Array.from(el.attributes).forEach(attr => {
        if (!attr.name.startsWith('aria-')) return;
        if (!VALID_ARIA.has(attr.name)) findings.push({ id: generateId(), engine: 'ARIA Validation', element: describeEl(el), criterion: 'WCAG 2.2 SC 4.1.2 (Level A)', issue: `Invalid attribute "${attr.name}".`, computed: `${attr.name}="${attr.value}"`, required: 'Valid WAI-ARIA attribute', verdict: 'Fail', severity: SEV.MODERATE, howToFix: 'Remove or fix attribute name.' });
        if (BOOL_ARIA.has(attr.name) && attr.value !== 'true' && attr.value !== 'false') findings.push({ id: generateId(), engine: 'ARIA Validation', element: describeEl(el), criterion: 'WCAG 2.2 SC 4.1.2 (Level A)', issue: `"${attr.name}" value "${attr.value}" invalid (must be true/false).`, computed: `${attr.name}="${attr.value}"`, required: '"true" or "false"', verdict: 'Fail', severity: SEV.MODERATE, howToFix: 'Set to "true" or "false".' });
        if (TRI_ARIA.has(attr.name) && !['true','false','mixed'].includes(attr.value)) findings.push({ id: generateId(), engine: 'ARIA Validation', element: describeEl(el), criterion: 'WCAG 2.2 SC 4.1.2 (Level A)', issue: `"${attr.name}" value "${attr.value}" invalid.`, computed: `${attr.name}="${attr.value}"`, required: '"true", "false", or "mixed"', verdict: 'Fail', severity: SEV.MODERATE, howToFix: 'Use "true", "false", or "mixed".' });
        if (['aria-labelledby','aria-describedby','aria-controls','aria-owns','aria-flowto','aria-activedescendant','aria-details','aria-errormessage'].includes(attr.name)) {
          attr.value.trim().split(/\s+/).forEach(id => { if (id && !document.getElementById(id)) findings.push({ id: generateId(), engine: 'ARIA Validation', element: describeEl(el), criterion: 'WCAG 2.2 SC 4.1.2 (Level A)', issue: `"${attr.name}" references missing ID "${id}".`, computed: `${attr.name}="${attr.value}"`, required: 'ID must exist', verdict: 'Fail', severity: SEV.SERIOUS, howToFix: `Add element with id="${id}" or fix reference.` }); });
        }
      });
      if (el.getAttribute('aria-hidden') === 'true') {
        const hasFocusable = el.matches('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])') || el.querySelector('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if (hasFocusable) findings.push({ id: generateId(), engine: 'ARIA Validation', element: describeEl(el), criterion: 'WCAG 2.2 SC 4.1.2 (Level A)', issue: 'aria-hidden="true" with focusable children.', computed: 'Focusable content hidden from screen readers', required: 'No focusable content inside aria-hidden', verdict: 'Fail', severity: SEV.CRITICAL, howToFix: 'Remove aria-hidden or add tabindex="-1" to focusable children.' });
      }
    });
    if (findings.length === 0) findings.push({ id: generateId(), engine: 'ARIA Validation', element: 'Page', criterion: 'WCAG 2.2 SC 4.1.2 (Level A)', issue: 'No ARIA issues.', computed: `${ariaEls.length} checked`, required: 'Valid ARIA usage', verdict: 'Pass', severity: SEV.MINOR, howToFix: 'No action.' });
    return findings;
  }

  /* ================================================================
     ENGINE 14: TARGET SIZE (WCAG 2.2 SC 2.5.8 - NEW)
     Every interactive target must be ≥ 24×24 CSS pixels.
     Inline text links are exempt per the SC 2.5.8 exception.
  ================================================================ */
  function auditTargetSize() {
    const findings = [];
    const SELECTOR = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="option"],[role="tab"],[role="slider"],[role="spinbutton"],[tabindex="0"]';
    const MIN = 24;
    const targets = Array.from(document.querySelectorAll(SELECTOR)).filter(el => {
      if (el.disabled) return false;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    targets.forEach(el => {
      const cs = window.getComputedStyle(el);
      // Inline text links are exempt (SC 2.5.8 exception 1 - inline)
      if (el.tagName === 'A' && cs.display === 'inline') return;
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width), h = Math.round(r.height);
      if (w < MIN || h < MIN) {
        findings.push({
          id: generateId(), engine: 'Target Size',
          element: describeEl(el),
          criterion: 'WCAG 2.2 SC 2.5.8 Target Size Minimum (Level AA)',
          issue: `Target ${w}×${h}px is below the 24×24 CSS px minimum.`,
          computed: `${w}×${h}px`,
          required: '24×24 CSS pixels',
          verdict: 'Fail',
          severity: (w < 16 || h < 16) ? SEV.SERIOUS : SEV.MODERATE,
          howToFix: `Add min-width:24px; min-height:24px; or increase padding to reach 24×24px.`
        });
      }
    });
    if (findings.length === 0)
      findings.push({ id: generateId(), engine: 'Target Size', element: 'Page', criterion: 'WCAG 2.2 SC 2.5.8 (Level AA)', issue: 'All interactive targets meet 24×24 CSS px minimum.', computed: `${targets.length} checked`, required: '24×24 CSS pixels', verdict: 'Pass', severity: SEV.MINOR, howToFix: 'No action required.' });
    return findings;
  }

  /* ================================================================
     ENGINE 15: LABEL IN NAME (WCAG 2.2 SC 2.5.3 - NEW)
     For controls with visible text, the accessible name must CONTAIN
     that visible text so speech-input users can activate by speaking it.
  ================================================================ */
  function auditLabelInName() {
    const findings = [];
    const SELECTOR = 'a[href],button,input,select,textarea,summary,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="menuitem"],[role="option"],[role="tab"]';
    Array.from(document.querySelectorAll(SELECTOR)).filter(el => {
      if (el.disabled) return false;
      const cs = window.getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    }).forEach(el => {
      // Collect only direct visible text (not from aria-label override)
      const visibleText = Array.from(el.childNodes)
        .filter(n => n.nodeType === 3)
        .map(n => n.textContent.trim())
        .join(' ')
        .trim()
        || el.textContent.trim().slice(0, 100);
      if (!visibleText || visibleText.length < 2) return; // no meaningful visible text

      const accName = getAccessibleName(el);
      if (!accName) return; // no accessible name to compare

      // Case-insensitive substring check - normalise whitespace
      const normVis = visibleText.toLowerCase().replace(/\s+/g, ' ');
      const normAcc = accName.toLowerCase().replace(/\s+/g, ' ');
      if (normAcc.includes(normVis)) return; // passes

      // Ignore if difference is only punctuation / emoji (false-positive guard)
      const alphaVis = normVis.replace(/[^a-z0-9]/g, '');
      const alphaAcc = normAcc.replace(/[^a-z0-9]/g, '');
      if (!alphaVis || alphaAcc.includes(alphaVis)) return;

      findings.push({
        id: generateId(), engine: 'Label in Name',
        element: describeEl(el),
        criterion: 'WCAG 2.2 SC 2.5.3 Label in Name (Level A)',
        issue: `Accessible name "${accName.slice(0, 60)}" does not contain visible label "${visibleText.slice(0, 60)}".`,
        computed: `Accessible name: "${accName.slice(0, 60)}"`,
        required: `Must contain: "${visibleText.slice(0, 60)}"`,
        verdict: 'Fail',
        severity: SEV.SERIOUS,
        howToFix: 'Start the aria-label with the visible text, or remove aria-label and rely on visible text alone.'
      });
    });
    if (findings.length === 0)
      findings.push({ id: generateId(), engine: 'Label in Name', element: 'Page', criterion: 'WCAG 2.2 SC 2.5.3 (Level A)', issue: 'No Label in Name mismatches found.', computed: 'All checked', required: 'Accessible name contains visible text', verdict: 'Pass', severity: SEV.MINOR, howToFix: 'No action required.' });
    return findings;
  }

  /* ================================================================
     ENGINE 16: RESIZE TEXT (WCAG 2.2 SC 1.4.4)
     Verifies that the page survives a 200% zoom - the criterion
     allows reflow, but content must not be lost or clipped. We
     temporarily scale the page via CSS zoom, sample the layout,
     compare against the baseline, then revert. Sites that hard-code
     pixel heights, use `overflow:hidden` over text, or set
     `white-space:nowrap` on long copy fail this engine.
  ================================================================ */
  function auditResizeText() {
    const findings = [];
    const TEXT_SELECTOR = 'p, li, td, th, dt, dd, figcaption, h1, h2, h3, h4, h5, h6, blockquote, label, button, a, span, div';
    /* Baseline: collect bounding boxes and clip status BEFORE zoom. */
    const probes = Array.from(document.querySelectorAll(TEXT_SELECTOR))
      .filter(el => {
        const cs = window.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        /* Need actual text content, not nested element wrappers. */
        const direct = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 4);
        return direct;
      })
      .slice(0, 250);

    const before = probes.map(el => {
      const r = el.getBoundingClientRect();
      return { el, w: r.width, h: r.height, sw: el.scrollWidth, sh: el.scrollHeight };
    });
    const docBefore = document.documentElement.scrollWidth;

    /* Apply 200% zoom. CSS zoom (Chromium-supported) reflows text and
       grows pixel sizes proportionally - closest in-page approximation
       of browser-zoom-to-200%. */
    const original = document.documentElement.style.zoom || '';
    document.documentElement.style.zoom = '2';
    /* Force layout. */
    void document.documentElement.offsetHeight;

    const docAfter = document.documentElement.scrollWidth;
    const horizScrollIntroduced = docAfter > docBefore * 2.05;   /* 5% slack for legitimate growth */

    const after = probes.map(el => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, sw: el.scrollWidth, sh: el.scrollHeight };
    });

    /* Revert immediately so the user's view doesn't flicker. */
    document.documentElement.style.zoom = original;
    void document.documentElement.offsetHeight;

    /* Diagnose: an element fails resize if its scrollHeight/Width
       grew but its visible height/width didn't (= clipping). */
    let clipped = 0;
    after.forEach((a, i) => {
      const b = before[i];
      const grewContent = (a.sh > b.sh + 2) || (a.sw > b.sw + 2);
      const containedVisually = (a.h <= b.h * 1.05) && (a.w <= b.w * 1.05);
      if (grewContent && containedVisually) {
        clipped++;
        if (clipped <= 8) {
          findings.push({
            id: generateId(), engine: 'Resize Text',
            element: describeEl(b.el),
            criterion: 'WCAG 2.2 SC 1.4.4 Resize Text (Level AA)',
            issue: 'Element clips its content at 200% zoom. Content overflows but the visible box stays the same - text becomes inaccessible.',
            computed: `before ${Math.round(b.w)}×${Math.round(b.h)} (scroll ${b.sw}×${b.sh}), after ${Math.round(a.w)}×${Math.round(a.h)} (scroll ${a.sw}×${a.sh})`,
            required: 'No clipping at 200% zoom',
            verdict: 'Fail', severity: SEV.SERIOUS,
            howToFix: 'Replace fixed pixel heights with min-height. Remove overflow:hidden on text containers. Use auto/min-content for wrapping containers.'
          });
        }
      }
    });

    if (horizScrollIntroduced) {
      findings.push({
        id: generateId(), engine: 'Resize Text', element: 'Document',
        criterion: 'WCAG 2.2 SC 1.4.4 Resize Text (Level AA)',
        issue: 'Page introduces horizontal scrolling at 200% zoom beyond the expected proportional growth.',
        computed: `document.scrollWidth: ${docBefore}px before, ${docAfter}px after`,
        required: 'Reflow without two-dimensional scrolling',
        verdict: 'Fail', severity: SEV.SERIOUS,
        howToFix: 'Use responsive layout with relative units (rem, %, fr). Avoid fixed pixel widths on top-level layout containers.'
      });
    }

    if (clipped > 8) {
      findings.push({
        id: generateId(), engine: 'Resize Text', element: 'Document',
        criterion: 'WCAG 2.2 SC 1.4.4 Resize Text (Level AA)',
        issue: `Additional ${clipped - 8} elements also clip at 200% zoom (only first 8 listed above).`,
        computed: `${clipped} clipped of ${before.length} sampled`,
        required: 'No clipping at 200% zoom',
        verdict: 'Fail', severity: SEV.SERIOUS,
        howToFix: 'See above. Pattern is widespread across the page.'
      });
    }

    if (findings.length === 0)
      findings.push({ id: generateId(), engine: 'Resize Text', element: 'Page', criterion: 'WCAG 2.2 SC 1.4.4 (Level AA)', issue: 'Page survives 200% zoom without clipping.', computed: `${probes.length} text elements sampled`, required: 'No clipping at 200%', verdict: 'Pass', severity: SEV.MINOR, howToFix: 'Verify manually with browser zoom (Ctrl/Cmd +).' });
    return findings;
  }

  /* ================================================================
     ENGINE 17: DARK MODE CONTRAST (extends Engine 10)
     Engine 10 detects whether the page declares dark-mode styles.
     This engine goes further: parses every @media (prefers-color-scheme:
     dark) rule, extracts the colour pairs the rule defines, and computes
     contrast ratios for each pair. Catches dark themes that "support"
     dark mode but ship low-contrast palettes - the most common pattern
     in retrofitted dark themes.
  ================================================================ */
  function auditDarkModeContrast() {
    const findings = [];
    const darkRules = [];

    /* Walk every reachable stylesheet collecting rules inside an
       @media (prefers-color-scheme: dark) block. Cross-origin sheets
       throw on access - skip silently. */
    for (let i = 0; i < document.styleSheets.length; i++) {
      let rules;
      try { rules = document.styleSheets[i].cssRules || []; }
      catch (e) { continue; }
      for (let j = 0; j < rules.length; j++) {
        const r = rules[j];
        if (r.conditionText && /prefers-color-scheme\s*:\s*dark/i.test(r.conditionText)) {
          for (let k = 0; k < (r.cssRules || []).length; k++) {
            darkRules.push(r.cssRules[k]);
          }
        }
      }
    }

    if (darkRules.length === 0) {
      findings.push({
        id: generateId(), engine: 'Dark Mode Contrast', element: 'Page',
        criterion: 'WCAG 2.2 SC 1.4.3 (dark mode)',
        issue: 'No dark-mode CSS rules found, so dark-mode contrast cannot be verified.',
        computed: '0 @media (prefers-color-scheme: dark) rules',
        required: 'Either no dark mode (covered by Dark Mode engine) or dark rules present',
        verdict: 'Info', severity: SEV.MINOR,
        howToFix: 'If you intend to support dark mode, add @media (prefers-color-scheme: dark) styles.'
      });
      return findings;
    }

    /* For each dark rule that pairs a foreground color with an
       inferable background, compute contrast. */
    let pairsChecked = 0, pairsFailed = 0;
    darkRules.forEach(rule => {
      if (!rule.style) return;
      const fg = rule.style.color;
      const bg = rule.style.backgroundColor || rule.style.background;
      if (!fg || !bg) return;
      const fgC = parseColour(fg), bgC = parseColour(bg);
      if (!fgC || !bgC) return;
      const fgFinal = blendColour(fgC, bgC.a >= 1 ? bgC : { r: 18, g: 18, b: 18, a: 1 });
      const bgFinal = bgC.a >= 1 ? bgC : { r: 18, g: 18, b: 18, a: 1 };
      const ratio = contrastRatio(fgFinal, bgFinal);
      pairsChecked++;
      if (ratio < 4.5) {
        pairsFailed++;
        if (pairsFailed <= 6) {
          findings.push({
            id: generateId(), engine: 'Dark Mode Contrast',
            element: `selector: ${rule.selectorText || '(unknown)'}`,
            criterion: 'WCAG 2.2 SC 1.4.3 (Level AA - dark mode palette)',
            issue: `Dark-mode rule pairs foreground "${fg}" with background "${bg}" - contrast ratio ${ratio.toFixed(2)}:1 fails 4.5:1.`,
            computed: `${ratio.toFixed(2)}:1`,
            required: '4.5:1 for normal text',
            verdict: 'Fail', severity: ratio < 3.0 ? SEV.CRITICAL : SEV.SERIOUS,
            howToFix: 'Lighten the foreground or darken the background. Most dark themes work well around #e0e0e0 on #1a1a1a (12.6:1).'
          });
        }
      }
    });

    if (pairsFailed > 6) {
      findings.push({
        id: generateId(), engine: 'Dark Mode Contrast', element: 'Page',
        criterion: 'WCAG 2.2 SC 1.4.3 (dark mode palette)',
        issue: `Additional ${pairsFailed - 6} dark-mode contrast failures not listed.`,
        computed: `${pairsFailed} failures of ${pairsChecked} declared pairs`,
        required: '4.5:1', verdict: 'Fail', severity: SEV.SERIOUS,
        howToFix: 'Re-tune the dark palette holistically rather than fixing individual pairs.'
      });
    }

    if (pairsFailed === 0 && pairsChecked > 0) {
      findings.push({ id: generateId(), engine: 'Dark Mode Contrast', element: 'Page', criterion: 'WCAG 2.2 SC 1.4.3 (dark mode)', issue: `${pairsChecked} dark-mode colour pairs all meet 4.5:1.`, computed: `${pairsChecked} pairs OK`, required: '4.5:1', verdict: 'Pass', severity: SEV.MINOR, howToFix: 'No action required.' });
    } else if (pairsChecked === 0) {
      findings.push({ id: generateId(), engine: 'Dark Mode Contrast', element: 'Page', criterion: 'WCAG 2.2 SC 1.4.3 (dark mode)', issue: 'Dark-mode rules present but no inline colour/background pairs found to verify. Many themes use CSS custom properties - those would need to be checked in the rendered DOM with prefers-color-scheme: dark active.', computed: `${darkRules.length} dark rules, 0 inline pairs`, required: 'Verifiable colour pairs', verdict: 'Info', severity: SEV.MINOR, howToFix: 'Run a manual check in dark mode, or expose colour custom properties on root element so this engine can sample them.' });
    }

    return findings;
  }

  /* ================================================================
     ENGINE 18: COLOUR-ONLY MEANING (WCAG 2.2 SC 1.4.1)
     Heuristic: flags suspicious patterns where colour is the only
     way to convey meaning. False-positive prone by nature, so all
     verdicts are Warnings, not Fails - they say "review this".
  ================================================================ */
  function auditColourOnlyMeaning() {
    const findings = [];

    /* Pattern 1: copy that literally references a colour as the
       discriminator. "Click the red button" relies on sighted
       perception; if a screen reader user heard that copy, they have
       no way to distinguish the red button from any other button. */
    const COLOUR_WORDS = '(red|green|blue|yellow|orange|purple|pink|black|white|grey|gray|brown|cyan|magenta|amber|lime|teal|violet|maroon)';
    const COLOUR_REF = new RegExp(
      '\\b(click|press|select|tap|see|find|the|use)\\s+(?:the\\s+)?' + COLOUR_WORDS +
      '\\s+(button|link|icon|tab|item|box|cell|row|dot|circle|square|arrow|bar|highlight|text|word|number|line|area|section|panel|card|badge)\\b',
      'i'
    );
    document.querySelectorAll('p, li, td, dd, span, label, button, a, h1, h2, h3, h4, h5, h6').forEach(el => {
      const txt = el.textContent || '';
      if (txt.length < 5 || txt.length > 400) return;
      const m = txt.match(COLOUR_REF);
      if (m) {
        findings.push({
          id: generateId(), engine: 'Colour-Only Meaning',
          element: describeEl(el),
          criterion: 'WCAG 2.2 SC 1.4.1 Use of Colour (Level A)',
          issue: `Copy refers to UI by colour alone: "${m[0]}". Screen-reader users cannot distinguish elements by colour.`,
          computed: m[0],
          required: 'Refer to UI by name, position, or shape, not colour',
          verdict: 'Warning', severity: SEV.SERIOUS,
          howToFix: 'Rephrase to "Press Save" or "Click the rightmost button" - name the element, do not describe its colour.'
        });
      }
    });

    /* Pattern 2: required-field markers that rely on a red asterisk
       or a colour change with no programmatic indicator. Flag any
       <input required> or [aria-required="true"] whose nearest label
       contains an asterisk but the field has no aria-invalid, no
       describedby announcing "required", and no visible "required"
       text near the label. */
    document.querySelectorAll('input[required],select[required],textarea[required],[aria-required="true"]').forEach(field => {
      const labelEl = field.id
        ? document.querySelector('label[for="' + (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(field.id) : field.id) + '"]')
        : field.closest('label');
      if (!labelEl) return;
      const labelText = labelEl.textContent || '';
      const hasAsterisk = /\*/.test(labelText);
      const saysRequired = /required|mandatory|must/i.test(labelText);
      const hasAriaRequired = field.getAttribute('aria-required') === 'true' || field.required;
      if (hasAsterisk && !saysRequired && !hasAriaRequired) {
        findings.push({
          id: generateId(), engine: 'Colour-Only Meaning',
          element: describeEl(field),
          criterion: 'WCAG 2.2 SC 1.4.1 / 3.3.2',
          issue: 'Required field is marked only with an asterisk and colour, with no programmatic "required" indicator or text label.',
          computed: 'Asterisk present in label; no aria-required; no "required" word',
          required: 'Mark required fields with both visible text and aria-required',
          verdict: 'Warning', severity: SEV.MODERATE,
          howToFix: 'Add aria-required="true" on the field, and append visually-readable text such as "(required)" to the label.'
        });
      }
    });

    /* Pattern 3: status indicators where two adjacent siblings differ
       only by background colour. Common pattern: green/red dots side
       by side with no aria-label or text. */
    const dots = Array.from(document.querySelectorAll('span, i, em, b, div')).filter(el => {
      if (el.children.length > 0) return false;
      if (el.textContent.trim()) return false;     /* has text - fine */
      const cs = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.width > 32) return false;   /* not a status-dot-sized element */
      const bg = parseColour(cs.backgroundColor);
      if (!bg || bg.a < 0.5) return false;
      return !el.getAttribute('aria-label') && !el.getAttribute('title') && !el.getAttribute('aria-labelledby');
    });
    if (dots.length >= 3) {
      findings.push({
        id: generateId(), engine: 'Colour-Only Meaning', element: `${dots.length} small coloured elements`,
        criterion: 'WCAG 2.2 SC 1.4.1 Use of Colour (Level A)',
        issue: `${dots.length} small coloured shapes with no accessible name. Likely status indicators that convey meaning by colour alone.`,
        computed: `${dots.length} matched`,
        required: 'Each status indicator needs aria-label or visible text',
        verdict: 'Warning', severity: SEV.MODERATE,
        howToFix: 'Add aria-label="Active" / aria-label="Inactive" (or equivalent), or pair the dot with text such as "Online" / "Offline".'
      });
    }

    if (findings.length === 0)
      findings.push({ id: generateId(), engine: 'Colour-Only Meaning', element: 'Page', criterion: 'WCAG 2.2 SC 1.4.1 (Level A)', issue: 'No colour-only-meaning patterns detected by heuristic.', computed: 'Heuristic only - manual review still recommended', required: 'No colour-only meaning', verdict: 'Pass', severity: SEV.MINOR, howToFix: 'Manually verify any chart, badge, or status indicator on the page.' });
    return findings;
  }

  /* ================================================================
     ENGINE 19: TARGET SIZE - AAA (WCAG 2.2 SC 2.5.5, 44×44)
     Engine 14 covers the AA minimum (24×24). This adds the AAA
     check (44×44) as a Warning so designers can see the gap to
     mobile-friendly sizing without it being treated as a failure.
  ================================================================ */
  function auditTargetSizeAAA() {
    const findings = [];
    const SELECTOR = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="option"],[role="tab"],[role="slider"],[role="spinbutton"],[tabindex="0"]';
    const MIN = 44;
    const targets = Array.from(document.querySelectorAll(SELECTOR)).filter(el => {
      if (el.disabled) return false;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    let count = 0;
    targets.forEach(el => {
      const cs = window.getComputedStyle(el);
      if (el.tagName === 'A' && cs.display === 'inline') return;   /* exception: inline links */
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width), h = Math.round(r.height);
      /* Already at AA failure (< 24) - Engine 14 reported it. We add
         AAA findings only for AA-passing targets that miss AAA. */
      if (w >= 24 && h >= 24 && (w < MIN || h < MIN)) {
        count++;
        if (count <= 12) {
          findings.push({
            id: generateId(), engine: 'Target Size AAA',
            element: describeEl(el),
            criterion: 'WCAG 2.2 SC 2.5.5 Target Size (Level AAA)',
            issue: `Target ${w}×${h}px meets AA (24×24) but is below the AAA recommendation of 44×44.`,
            computed: `${w}×${h}px`,
            required: '44×44 CSS pixels (AAA)',
            verdict: 'Warning', severity: SEV.MODERATE,
            howToFix: 'Mobile and motor-impaired users benefit from 44×44 targets. Add min-width/min-height: 44px or generous padding.'
          });
        }
      }
    });
    if (count > 12) {
      findings.push({ id: generateId(), engine: 'Target Size AAA', element: 'Page', criterion: 'WCAG 2.2 SC 2.5.5 (Level AAA)', issue: `Additional ${count - 12} targets meet AA but miss AAA 44×44.`, computed: `${count} sub-44 targets`, required: '44×44', verdict: 'Warning', severity: SEV.MODERATE, howToFix: 'Audit your design system component sizes globally.' });
    }
    if (findings.length === 0)
      findings.push({ id: generateId(), engine: 'Target Size AAA', element: 'Page', criterion: 'WCAG 2.2 SC 2.5.5 (Level AAA)', issue: 'All AA-passing targets also meet the 44×44 AAA recommendation.', computed: `${targets.length} checked`, required: '44×44', verdict: 'Pass', severity: SEV.MINOR, howToFix: 'No action required.' });
    return findings;
  }

  /* ================================================================
     MAIN RUNNER
  ================================================================ */
  try {
    findingCounter = 0;
    const engines = [
      { name: 'Focus Order', fn: auditFocusOrder },
      { name: 'Focus Visibility', fn: auditFocusVisibility },
      { name: 'Colour Contrast', fn: auditColourContrast },
      { name: 'Heading Structure', fn: auditHeadingStructure },
      { name: 'Landmarks', fn: auditLandmarks },
      { name: 'Images', fn: auditImages },
      { name: 'Forms', fn: auditForms },
      { name: 'Links and Buttons', fn: auditLinksButtons },
      { name: 'High Contrast', fn: auditHighContrast },
      { name: 'Dark Mode', fn: auditDarkMode },
      { name: 'Text Spacing', fn: auditTextSpacing },
      { name: 'DOM Order', fn: auditDomOrder },
      { name: 'ARIA Validation', fn: auditAriaValidation },
      { name: 'Target Size', fn: auditTargetSize },
      { name: 'Label in Name', fn: auditLabelInName },
      { name: 'Resize Text', fn: auditResizeText },
      { name: 'Dark Mode Contrast', fn: auditDarkModeContrast },
      { name: 'Colour-Only Meaning', fn: auditColourOnlyMeaning },
      { name: 'Target Size AAA', fn: auditTargetSizeAAA }
    ];

    const findings = [];
    engines.forEach(engine => {
      try {
        findings.push(...engine.fn());
      } catch (err) {
        findings.push({
          id: generateId(), engine: engine.name, element: 'Audit Engine',
          criterion: 'AMASAMYA Internal',
          issue: `${engine.name} engine error: ${err && err.message ? err.message : String(err)}`,
          computed: String(err), required: 'Engine should complete without errors',
          verdict: 'Info', severity: SEV.MINOR,
          howToFix: 'Report this page URL. Other results are still valid.'
        });
      }
    });

    // Send results to service worker
    chrome.runtime.sendMessage({
      type: 'audit-results',
      findings: findings,
      pageTitle: document.title,
      pageUrl: window.location.href,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'audit-error',
      error: err && err.message ? err.message : String(err)
    });
  } finally {
    window.__AMASAMYAAuditRunning = false;
  }
})();
