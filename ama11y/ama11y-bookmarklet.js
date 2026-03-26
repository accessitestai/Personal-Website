/**
 * AMA11Y — Accessibility Management and Audit Layer
 * Phase 1: Bookmarklet Core Engine
 * Version: 1.0.0
 * Author: Akhilesh Malani
 * Site: ama11y.akhileshmalani.com
 *
 * Milestone coverage:
 *   1.1 Focus order engine
 *   1.2 Focus visibility engine
 *   1.3 Colour contrast engine
 *   1.4 Heading structure engine
 *   1.5 Landmark engine
 *   1.6 Accessible results panel (JAWS/NVDA/VoiceOver)
 *   1.7 Findings export as JSON
 *
 * Zero outbound network calls. Runs entirely within the browser tab.
 */

(function () {
  'use strict';

  /* ================================================================
     CONSTANTS AND CONFIGURATION
  ================================================================ */

  const TOOL_ID        = 'ama11y-panel';
  const TOOL_VERSION   = '1.0.0';
  const WCAG_LEVELS    = { A: 'A', AA: 'AA', AAA: 'AAA' };

  // Contrast thresholds per WCAG 2.2
  const CONTRAST = {
    NORMAL_AA:  4.5,
    LARGE_AA:   3.0,
    NORMAL_AAA: 7.0,
    LARGE_AAA:  4.5,
    NON_TEXT:   3.0
  };

  // Large text thresholds
  const LARGE_TEXT_PT_BOLD   = 14; // 14pt bold = large
  const LARGE_TEXT_PT_NORMAL = 18; // 18pt normal = large
  const PT_TO_PX             = 1.333333;

  // WCAG 2.2 SC 2.4.11 focus indicator minimum area (CSS pixels squared)
  const FOCUS_MIN_AREA = 4;

  // Severity levels
  const SEV = { CRITICAL: 'Critical', SERIOUS: 'Serious', MODERATE: 'Moderate', MINOR: 'Minor' };

  // All valid ARIA landmark roles
  const LANDMARK_ROLES = [
    'banner','complementary','contentinfo','form','main',
    'navigation','region','search'
  ];

  // HTML elements that implicitly map to landmark roles
  const IMPLICIT_LANDMARKS = {
    header:  'banner',
    footer:  'contentinfo',
    main:    'main',
    nav:     'navigation',
    aside:   'complementary',
    section: 'region',
    form:    'form'
  };

  /* ================================================================
     UTILITY: REMOVE EXISTING PANEL
  ================================================================ */

  function removeExisting () {
    const old = document.getElementById(TOOL_ID);
    if (old) old.remove();
    const oldStyle = document.getElementById('ama11y-style');
    if (oldStyle) oldStyle.remove();
  }

  /* ================================================================
     UTILITY: COLOUR CONTRAST CALCULATIONS
  ================================================================ */

  /**
   * Parse any CSS colour string into { r, g, b, a } with values 0–255 / 0–1.
   * Handles rgb(), rgba(), hex3, hex4, hex6, hex8.
   */
  function parseColour (str) {
    if (!str || str === 'transparent' || str === 'rgba(0, 0, 0, 0)') {
      return { r: 255, g: 255, b: 255, a: 0 };
    }
    let m;
    // rgb / rgba
    m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (m) {
      return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
    }
    // hex
    m = str.match(/^#([0-9a-f]+)$/i);
    if (m) {
      const h = m[1];
      if (h.length === 3) {
        return { r: parseInt(h[0]+h[0],16), g: parseInt(h[1]+h[1],16), b: parseInt(h[2]+h[2],16), a: 1 };
      }
      if (h.length === 6) {
        return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16), a: 1 };
      }
      if (h.length === 8) {
        return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16), a: parseInt(h.slice(6,8),16)/255 };
      }
    }
    return null;
  }

  /** Blend foreground over background accounting for alpha */
  function blendColour (fg, bg) {
    const a = fg.a !== undefined ? fg.a : 1;
    if (a >= 1) return fg;
    return {
      r: Math.round(fg.r * a + bg.r * (1 - a)),
      g: Math.round(fg.g * a + bg.g * (1 - a)),
      b: Math.round(fg.b * a + bg.b * (1 - a)),
      a: 1
    };
  }

  /** sRGB linearise a single channel (0–255) */
  function linearise (c) {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }

  /** Relative luminance of an { r, g, b } colour */
  function luminance (col) {
    return 0.2126 * linearise(col.r) + 0.7152 * linearise(col.g) + 0.0722 * linearise(col.b);
  }

  /** WCAG contrast ratio between two colours */
  function contrastRatio (c1, c2) {
    const l1 = luminance(c1);
    const l2 = luminance(c2);
    const lighter = Math.max(l1, l2);
    const darker  = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * Walk up the DOM to find the effective background colour of an element,
   * compositing alpha layers as we go.
   */
  function getEffectiveBg (el) {
    let bg = { r: 255, g: 255, b: 255, a: 1 }; // default white canvas
    const ancestors = [];
    let cur = el;
    while (cur && cur !== document.documentElement) {
      ancestors.unshift(cur);
      cur = cur.parentElement;
    }
    for (const node of ancestors) {
      const cs = window.getComputedStyle(node);
      const c  = parseColour(cs.backgroundColor);
      if (c && c.a > 0) {
        bg = blendColour(c, bg);
      }
    }
    return bg;
  }

  /** Determine whether text is "large" per WCAG definitions */
  function isLargeText (cs) {
    const pxSize = parseFloat(cs.fontSize);
    const ptSize = pxSize / PT_TO_PX;
    const bold   = parseInt(cs.fontWeight) >= 700 || cs.fontWeight === 'bold';
    return (bold && ptSize >= LARGE_TEXT_PT_BOLD) || (!bold && ptSize >= LARGE_TEXT_PT_NORMAL);
  }

  /* ================================================================
     UTILITY: ACCESSIBLE NAME COMPUTATION (SIMPLIFIED)
  ================================================================ */

  function getAccessibleName (el) {
    // aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const names = labelledBy.split(/\s+/).map(id => {
        const ref = document.getElementById(id);
        return ref ? ref.textContent.trim() : '';
      }).filter(Boolean);
      if (names.length) return names.join(' ');
    }
    // aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
    // for inputs: associated label
    if (el.id) {
      const label = document.querySelector(`label[for="${(typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(el.id) : el.id.replace(/([\0-\x1f\x7f]|^-?\d)|^-$|[^\x80-\uFFFF\w-]/g, '\\CSS.escape(el.id)'))}"]`);
      if (label) return label.textContent.trim();
    }
    // wrapping label
    const wrappingLabel = el.closest('label');
    if (wrappingLabel) return wrappingLabel.textContent.trim();
    // alt for images
    if (el.tagName === 'IMG') return el.getAttribute('alt') || '';
    // title
    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();
    // text content
    return el.textContent.trim().slice(0, 120);
  }

  /* ================================================================
     UTILITY: ELEMENT DESCRIPTION FOR REPORTS
  ================================================================ */

  function describeEl (el) {
    const tag  = el.tagName.toLowerCase();
    const id   = el.id   ? `#${el.id}`   : '';
    const cls  = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const role = el.getAttribute('role') ? `[role="${el.getAttribute('role')}"]` : '';
    const name = getAccessibleName(el);
    const label = name ? ` "${name.slice(0, 60)}"` : '';
    return `<${tag}${id}${cls}${role}>${label}`;
  }

  /* ================================================================
     ENGINE 1: FOCUS ORDER
     Milestone 1.1
  ================================================================ */

  function auditFocusOrder () {
    const findings = [];
    const focusable = Array.from(document.querySelectorAll(
      'a[href], button, input:not([type="hidden"]), select, textarea, ' +
      '[tabindex], [contenteditable="true"], details > summary, ' +
      'audio[controls], video[controls], [role="button"], [role="link"], ' +
      '[role="checkbox"], [role="radio"], [role="combobox"], [role="listbox"], ' +
      '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], ' +
      '[role="option"], [role="slider"], [role="spinbutton"], [role="switch"], ' +
      '[role="tab"], [role="textbox"], [role="treeitem"]'
    )).filter(el => {
      const ti = parseInt(el.getAttribute('tabindex'));
      if (el.getAttribute('tabindex') !== null && ti < 0) return false;
      if (el.disabled) return false;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      return true;
    });

    // Check for positive tabindex (anti-pattern)
    const posTabIndex = focusable.filter(el => {
      const ti = parseInt(el.getAttribute('tabindex'));
      return !isNaN(ti) && ti > 0;
    });

    if (posTabIndex.length > 0) {
      posTabIndex.forEach(el => {
        findings.push({
          id:          generateId(),
          engine:      'Focus Order',
          element:     describeEl(el),
          criterion:   'WCAG 2.2 SC 2.4.3 Focus Order (Level A)',
          issue:       `Positive tabindex value of ${el.getAttribute('tabindex')} found. Positive tabindex values override the natural DOM order and create an unpredictable focus sequence for keyboard and screen reader users.`,
          computed:    `tabindex="${el.getAttribute('tabindex')}"`,
          required:    'tabindex="0" or no tabindex attribute',
          verdict:     'Fail',
          severity:    SEV.SERIOUS,
          howToFix:    'Remove the tabindex attribute or set it to 0. Manage focus order through correct DOM order instead.'
        });
      });
    }

    // Check for focus traps (elements that may trap keyboard users)
    // Note: real trap detection requires live interaction; we flag dialog elements without close mechanisms
    const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog');
    dialogs.forEach(dialog => {
      const cs = window.getComputedStyle(dialog);
      if (cs.display !== 'none' && cs.visibility !== 'hidden') {
        const closeBtn = dialog.querySelector('[aria-label*="close" i], [aria-label*="dismiss" i], button[class*="close" i]');
        if (!closeBtn) {
          findings.push({
            id:        generateId(),
            engine:    'Focus Order',
            element:   describeEl(dialog),
            criterion: 'WCAG 2.2 SC 2.1.2 No Keyboard Trap (Level A)',
            issue:     'Dialog element found without a detectable close or dismiss mechanism. Users may become trapped in this dialog.',
            computed:  'No close button or dismiss control detected within dialog',
            required:  'A keyboard-operable close mechanism must be present within the dialog',
            verdict:   'Warning',
            severity:  SEV.CRITICAL,
            howToFix:  'Add a close button inside the dialog. Ensure pressing Escape also closes the dialog and returns focus to the trigger element.'
          });
        }
      }
    });

    // Report total focusable count as informational
    findings.push({
      id:        generateId(),
      engine:    'Focus Order',
      element:   'Page',
      criterion: 'WCAG 2.2 SC 2.4.3 Focus Order (Level A)',
      issue:     `${focusable.length} focusable elements found on this page. The tab sequence has been recorded.`,
      computed:  `${focusable.length} focusable elements`,
      required:  'All focusable elements must receive focus in a logical, meaningful order',
      verdict:   'Info',
      severity:  SEV.MINOR,
      howToFix:  'Review the focus order list and verify each element receives focus in a reading-order sequence.',
      extra:     { focusSequence: focusable.map((el, i) => `${i + 1}. ${describeEl(el)}`) }
    });

    return findings;
  }

  /* ================================================================
     ENGINE 2: FOCUS VISIBILITY
     Milestone 1.2
  ================================================================ */

  function auditFocusVisibility () {
    const findings = [];
    const focusable = Array.from(document.querySelectorAll(
      'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex="0"]'
    )).filter(el => {
      if (el.disabled) return false;
      const cs = window.getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    }).slice(0, 80); // cap at 80 to avoid performance issues on very large pages

    focusable.forEach(el => {
      const cs = window.getComputedStyle(el);
      // Check if outline is suppressed
      const outlineStyle = cs.outlineStyle;
      const outlineWidth = parseFloat(cs.outlineWidth) || 0;
      const outlineColor = cs.outlineColor;

      // Check :focus-visible via computed outline on the element
      // We check the computed outline — if outline is none/0 and no box-shadow focus style
      const boxShadow    = cs.boxShadow;
      const borderWidth  = parseFloat(cs.borderWidth) || 0;

      const hasOutline   = outlineStyle !== 'none' && outlineWidth >= 1;
      const hasBoxShadow = boxShadow && boxShadow !== 'none';

      if (!hasOutline && !hasBoxShadow) {
        // Check if there is a CSS rule that deliberately removes outline
        const hasOutlineNone = outlineStyle === 'none' || outlineWidth === 0;
        if (hasOutlineNone) {
          findings.push({
            id:        generateId(),
            engine:    'Focus Visibility',
            element:   describeEl(el),
            criterion: 'WCAG 2.2 SC 2.4.7 Focus Visible (Level AA) and SC 2.4.11 Focus Appearance (Level AA)',
            issue:     'Focus indicator appears to be removed or suppressed on this element. The computed outline is none or zero width, and no box-shadow focus style is present.',
            computed:  `outline: ${outlineStyle} ${outlineWidth}px; box-shadow: ${boxShadow || 'none'}`,
            required:  'A visible focus indicator with minimum 2px outline or equivalent and 3:1 contrast ratio against adjacent colours',
            verdict:   'Fail',
            severity:  SEV.SERIOUS,
            howToFix:  'Remove outline: none from CSS. Provide a :focus-visible style with at least a 2px solid outline that has 3:1 contrast against its background. Never use outline: none without providing an equivalent replacement.'
          });
        }
      } else if (hasOutline) {
        // Check focus indicator contrast
        const fg = parseColour(outlineColor);
        const bg = getEffectiveBg(el);
        if (fg && bg) {
          const ratio = contrastRatio(blendColour(fg, bg), bg);
          if (ratio < CONTRAST.NON_TEXT) {
            findings.push({
              id:        generateId(),
              engine:    'Focus Visibility',
              element:   describeEl(el),
              criterion: 'WCAG 2.2 SC 2.4.11 Focus Appearance (Level AA)',
              issue:     `Focus indicator contrast ratio of ${ratio.toFixed(2)}:1 is below the required 3:1 minimum. The focus indicator is not sufficiently visible against the background.`,
              computed:  `Focus outline contrast: ${ratio.toFixed(2)}:1 (outline colour: ${outlineColor})`,
              required:  'Minimum 3:1 contrast ratio between the focus indicator and adjacent colours',
              verdict:   'Fail',
              severity:  SEV.SERIOUS,
              howToFix:  `Increase the contrast of the focus outline colour. Current ratio is ${ratio.toFixed(2)}:1, minimum required is 3:1.`
            });
          }
        }
      }
    });

    if (findings.length === 0) {
      findings.push({
        id:        generateId(),
        engine:    'Focus Visibility',
        element:   'Page',
        criterion: 'WCAG 2.2 SC 2.4.7 and SC 2.4.11',
        issue:     'No focus visibility failures detected in the sampled focusable elements.',
        computed:  `${focusable.length} elements checked`,
        required:  'All focusable elements must have a visible focus indicator',
        verdict:   'Pass',
        severity:  SEV.MINOR,
        howToFix:  'No action required. Continue to verify manually when navigating by keyboard.'
      });
    }

    return findings;
  }

  /* ================================================================
     ENGINE 3: COLOUR CONTRAST
     Milestone 1.3
  ================================================================ */

  function auditColourContrast () {
    const findings = [];

    // Select all elements that contain visible text
    const textEls = Array.from(document.querySelectorAll('*')).filter(el => {
      if (['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG','PATH'].includes(el.tagName)) return false;
      // Only elements with direct text content
      const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
      if (!hasText) return false;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (parseFloat(cs.opacity) === 0) return false;
      return true;
    }).slice(0, 200); // cap for performance

    textEls.forEach(el => {
      const cs    = window.getComputedStyle(el);
      const fgRaw = parseColour(cs.color);
      if (!fgRaw) return;

      const bg    = getEffectiveBg(el);
      const fg    = blendColour(fgRaw, bg);
      const ratio = contrastRatio(fg, bg);
      const large = isLargeText(cs);

      const requiredAA  = large ? CONTRAST.LARGE_AA  : CONTRAST.NORMAL_AA;
      const requiredAAA = large ? CONTRAST.LARGE_AAA : CONTRAST.NORMAL_AAA;
      const levelLabel  = large ? 'large text' : 'normal text';

      if (ratio < requiredAA) {
        findings.push({
          id:        generateId(),
          engine:    'Colour Contrast',
          element:   describeEl(el),
          criterion: `WCAG 2.2 SC 1.4.3 Contrast Minimum (Level AA) — ${levelLabel}`,
          issue:     `Contrast ratio of ${ratio.toFixed(2)}:1 fails the Level AA minimum of ${requiredAA}:1 for ${levelLabel}.`,
          computed:  `${ratio.toFixed(2)}:1 (foreground: ${cs.color}, background: rgb(${bg.r},${bg.g},${bg.b}))`,
          required:  `Minimum ${requiredAA}:1 for ${levelLabel} at Level AA`,
          verdict:   'Fail',
          severity:  ratio < 2.0 ? SEV.CRITICAL : SEV.SERIOUS,
          howToFix:  `Adjust the foreground colour ${cs.color} or the background colour to achieve at least ${requiredAA}:1 contrast. For ${levelLabel} at Level AAA the requirement is ${requiredAAA}:1.`
        });
      } else if (ratio < requiredAAA) {
        findings.push({
          id:        generateId(),
          engine:    'Colour Contrast',
          element:   describeEl(el),
          criterion: `WCAG 2.2 SC 1.4.6 Contrast Enhanced (Level AAA) — ${levelLabel}`,
          issue:     `Contrast ratio of ${ratio.toFixed(2)}:1 passes Level AA but fails the Level AAA enhanced minimum of ${requiredAAA}:1 for ${levelLabel}.`,
          computed:  `${ratio.toFixed(2)}:1 (foreground: ${cs.color})`,
          required:  `Minimum ${requiredAAA}:1 for ${levelLabel} at Level AAA`,
          verdict:   'Warning',
          severity:  SEV.MODERATE,
          howToFix:  `To meet Level AAA, increase contrast to at least ${requiredAAA}:1.`
        });
      }
    });

    // Non-text contrast: interactive components
    const interactiveEls = Array.from(document.querySelectorAll(
      'button, input, select, textarea, [role="button"], [role="checkbox"], [role="radio"], [role="switch"]'
    )).filter(el => {
      const cs = window.getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    }).slice(0, 80);

    interactiveEls.forEach(el => {
      const cs           = window.getComputedStyle(el);
      const borderColor  = parseColour(cs.borderColor);
      const bg           = getEffectiveBg(el.parentElement || el);
      if (!borderColor || borderColor.a === 0) return;
      const blended = blendColour(borderColor, bg);
      const ratio   = contrastRatio(blended, bg);
      if (ratio < CONTRAST.NON_TEXT) {
        findings.push({
          id:        generateId(),
          engine:    'Colour Contrast',
          element:   describeEl(el),
          criterion: 'WCAG 2.2 SC 1.4.11 Non-text Contrast (Level AA)',
          issue:     `Interactive component border contrast ratio of ${ratio.toFixed(2)}:1 is below the required 3:1 minimum. The visual boundary of this component is not sufficiently visible.`,
          computed:  `${ratio.toFixed(2)}:1 (border: ${cs.borderColor})`,
          required:  'Minimum 3:1 for UI component boundaries',
          verdict:   'Fail',
          severity:  SEV.SERIOUS,
          howToFix:  `Increase the border colour contrast to at least 3:1 against the background. Current ratio is ${ratio.toFixed(2)}:1.`
        });
      }
    });

    return findings;
  }

  /* ================================================================
     ENGINE 4: HEADING STRUCTURE
     Milestone 1.4
  ================================================================ */

  function auditHeadingStructure () {
    const findings = [];
    const headings  = Array.from(document.querySelectorAll(
      'h1,h2,h3,h4,h5,h6,[role="heading"]'
    )).filter(el => {
      const cs = window.getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    });

    if (headings.length === 0) {
      findings.push({
        id:        generateId(),
        engine:    'Heading Structure',
        element:   'Page',
        criterion: 'WCAG 2.2 SC 1.3.1 Info and Relationships (Level A) and SC 2.4.6 Headings and Labels (Level AA)',
        issue:     'No heading elements found on this page. Pages must use headings to provide structure and enable screen reader navigation.',
        computed:  '0 headings found',
        required:  'At least one heading to identify the main content. Ideally a single H1 for the page title.',
        verdict:   'Fail',
        severity:  SEV.SERIOUS,
        howToFix:  'Add a descriptive H1 heading that identifies the page. Use H2 through H6 to structure sections logically.'
      });
      return findings;
    }

    // Check for exactly one H1
    const h1s = headings.filter(h => h.tagName === 'H1' || (h.getAttribute('role') === 'heading' && h.getAttribute('aria-level') === '1'));
    if (h1s.length === 0) {
      findings.push({
        id:        generateId(),
        engine:    'Heading Structure',
        element:   'Page',
        criterion: 'WCAG 2.2 SC 2.4.6 Headings and Labels (Level AA)',
        issue:     'No H1 heading found. Each page should have a single H1 that describes its primary purpose.',
        computed:  '0 H1 headings',
        required:  'One H1 heading per page',
        verdict:   'Fail',
        severity:  SEV.SERIOUS,
        howToFix:  'Add an H1 heading that clearly describes the page. The H1 should be the first heading on the page and should match or relate to the page title.'
      });
    } else if (h1s.length > 1) {
      findings.push({
        id:        generateId(),
        engine:    'Heading Structure',
        element:   'Page',
        criterion: 'WCAG 2.2 SC 2.4.6 Headings and Labels (Level AA)',
        issue:     `${h1s.length} H1 headings found. Multiple H1 headings make it difficult for screen reader users to understand the page structure.`,
        computed:  `${h1s.length} H1 headings`,
        required:  'One H1 heading per page',
        verdict:   'Warning',
        severity:  SEV.MODERATE,
        howToFix:  'Review whether multiple H1 headings are intentional (for example in a multi-article page). If not, demote secondary H1 headings to H2 or lower.'
      });
    }

    // Check for skipped heading levels
    let prevLevel = 0;
    headings.forEach(h => {
      let level;
      if (h.tagName && h.tagName.match(/^H[1-6]$/)) {
        level = parseInt(h.tagName[1]);
      } else {
        level = parseInt(h.getAttribute('aria-level')) || 2;
      }
      if (prevLevel > 0 && level > prevLevel + 1) {
        findings.push({
          id:        generateId(),
          engine:    'Heading Structure',
          element:   describeEl(h),
          criterion: 'WCAG 2.2 SC 1.3.1 Info and Relationships (Level A)',
          issue:     `Heading level skipped from H${prevLevel} to H${level}. Skipping heading levels breaks the logical document outline and confuses screen reader users navigating by heading.`,
          computed:  `H${prevLevel} followed by H${level}`,
          required:  `H${prevLevel + 1} should appear before H${level}`,
          verdict:   'Fail',
          severity:  SEV.MODERATE,
          howToFix:  `Change this heading from H${level} to H${prevLevel + 1}, or add intermediate heading levels to fill the gap. Do not use heading levels solely for visual size.`
        });
      }
      // Check for empty headings
      const name = getAccessibleName(h);
      if (!name || name.trim().length === 0) {
        findings.push({
          id:        generateId(),
          engine:    'Heading Structure',
          element:   describeEl(h),
          criterion: 'WCAG 2.2 SC 2.4.6 Headings and Labels (Level AA)',
          issue:     'Empty heading found. A heading with no text content provides no useful navigation landmark for screen reader users.',
          computed:  'Heading text: empty',
          required:  'All headings must have descriptive text content',
          verdict:   'Fail',
          severity:  SEV.SERIOUS,
          howToFix:  'Add descriptive text to this heading, or remove the heading element if it is not needed for document structure.'
        });
      }
      prevLevel = level;
    });

    return findings;
  }

  /* ================================================================
     ENGINE 5: LANDMARK REGIONS
     Milestone 1.5
  ================================================================ */

  function auditLandmarks () {
    const findings = [];

    // Collect all landmarks
    const landmarks = [];

    // Explicit ARIA role landmarks
    LANDMARK_ROLES.forEach(role => {
      document.querySelectorAll(`[role="${role}"]`).forEach(el => {
        const cs = window.getComputedStyle(el);
        if (cs.display !== 'none' && cs.visibility !== 'hidden') {
          landmarks.push({ el, role, source: 'aria' });
        }
      });
    });

    // Implicit HTML landmarks
    Object.entries(IMPLICIT_LANDMARKS).forEach(([tag, role]) => {
      document.querySelectorAll(tag).forEach(el => {
        const cs = window.getComputedStyle(el);
        // Skip if already captured via explicit role
        const explicit = el.getAttribute('role');
        if (explicit) return;
        // section and form only become landmarks with accessible name
        if ((tag === 'section' || tag === 'form') && !getAccessibleName(el)) return;
        if (cs.display !== 'none' && cs.visibility !== 'hidden') {
          landmarks.push({ el, role, source: 'implicit' });
        }
      });
    });

    // Check for required landmarks
    const hasMain = landmarks.some(l => l.role === 'main');
    if (!hasMain) {
      findings.push({
        id:        generateId(),
        engine:    'Landmark Regions',
        element:   'Page',
        criterion: 'WCAG 2.2 SC 1.3.6 Identify Purpose (Level AAA) and best practice for SC 2.4.1',
        issue:     'No main landmark found. A main landmark is essential for screen reader users to skip directly to the primary content of the page.',
        computed:  'No <main> element or role="main" found',
        required:  'One main landmark per page',
        verdict:   'Fail',
        severity:  SEV.SERIOUS,
        howToFix:  'Wrap the primary page content in a <main> element. There should be exactly one main landmark per page.'
      });
    }

    // Check for multiple main landmarks
    const mains = landmarks.filter(l => l.role === 'main');
    if (mains.length > 1) {
      findings.push({
        id:        generateId(),
        engine:    'Landmark Regions',
        element:   'Page',
        criterion: 'WCAG 2.2 SC 1.3.1 Info and Relationships (Level A)',
        issue:     `${mains.length} main landmarks found. Only one main landmark is permitted per page.`,
        computed:  `${mains.length} main landmarks`,
        required:  'Exactly one main landmark',
        verdict:   'Fail',
        severity:  SEV.SERIOUS,
        howToFix:  'Remove duplicate main landmarks. Each page must have exactly one <main> element.'
      });
    }

    // Check for duplicate landmark roles without unique names
    const roleCounts = {};
    landmarks.forEach(l => {
      roleCounts[l.role] = (roleCounts[l.role] || []);
      roleCounts[l.role].push(l);
    });

    Object.entries(roleCounts).forEach(([role, items]) => {
      if (items.length > 1 && role !== 'main') {
        const names = items.map(l => getAccessibleName(l.el));
        const uniqueNames = new Set(names.filter(Boolean));
        if (uniqueNames.size < items.length) {
          findings.push({
            id:        generateId(),
            engine:    'Landmark Regions',
            element:   `Multiple [role="${role}"]`,
            criterion: 'WCAG 2.2 SC 1.3.1 Info and Relationships (Level A)',
            issue:     `${items.length} ${role} landmarks found without unique accessible names. When multiple landmarks of the same type are present, each must have a unique name so screen reader users can distinguish between them.`,
            computed:  `${items.length} ${role} landmarks, names: ${names.join(', ') || 'none'}`,
            required:  'Each landmark of the same type must have a unique accessible name via aria-label or aria-labelledby',
            verdict:   'Fail',
            severity:  SEV.MODERATE,
            howToFix:  `Add a unique aria-label or aria-labelledby to each ${role} landmark to distinguish them. For example, aria-label="Primary navigation" and aria-label="Secondary navigation".`
          });
        }
      }
    });

    // Check for content outside landmarks
    const allText = Array.from(document.querySelectorAll('p, li, td, th, dt, dd, blockquote, pre, figcaption'))
      .filter(el => {
        const cs = window.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        if (!el.textContent.trim()) return false;
        // Check if this element is inside a landmark
        return !el.closest(
          'main, [role="main"], nav, [role="navigation"], header, [role="banner"], ' +
          'footer, [role="contentinfo"], aside, [role="complementary"], ' +
          'section[aria-label], section[aria-labelledby], [role="region"], [role="form"], form[aria-label]'
        );
      });

    if (allText.length > 0) {
      findings.push({
        id:        generateId(),
        engine:    'Landmark Regions',
        element:   'Page',
        criterion: 'WCAG 2.2 SC 1.3.1 Info and Relationships (Level A)',
        issue:     `${allText.length} text content elements found outside any landmark region. All meaningful content should be within a landmark to allow screen reader users to navigate directly to it.`,
        computed:  `${allText.length} elements outside landmarks`,
        required:  'All meaningful content must be within a landmark region',
        verdict:   'Warning',
        severity:  SEV.MODERATE,
        howToFix:  'Ensure all page content is wrapped in appropriate landmark elements: <main>, <nav>, <header>, <footer>, <aside>, or <section> with an accessible name.'
      });
    }

    if (findings.length === 0) {
      findings.push({
        id:        generateId(),
        engine:    'Landmark Regions',
        element:   'Page',
        criterion: 'WCAG 2.2 Landmark Structure',
        issue:     `${landmarks.length} landmarks found. No landmark structure failures detected.`,
        computed:  landmarks.map(l => `${l.role} (${l.source})`).join(', '),
        required:  'Appropriate landmark structure',
        verdict:   'Pass',
        severity:  SEV.MINOR,
        howToFix:  'No action required.'
      });
    }

    return findings;
  }

  /* ================================================================
     ADDITIONAL ENGINE: IMAGES ALT TEXT
  ================================================================ */

  function auditImages () {
    const findings = [];
    const images = Array.from(document.querySelectorAll('img, [role="img"], svg[aria-hidden!="true"]'))
      .filter(el => {
        const cs = window.getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden';
      });

    images.forEach(el => {
      const tag  = el.tagName.toLowerCase();
      const role = el.getAttribute('role');

      if (tag === 'img') {
        const alt = el.getAttribute('alt');
        if (alt === null) {
          findings.push({
            id:        generateId(),
            engine:    'Images',
            element:   describeEl(el),
            criterion: 'WCAG 2.2 SC 1.1.1 Non-text Content (Level A)',
            issue:     'Image is missing an alt attribute entirely. All img elements must have an alt attribute.',
            computed:  'alt attribute absent',
            required:  'alt="" for decorative images; descriptive alt text for informative images',
            verdict:   'Fail',
            severity:  SEV.CRITICAL,
            howToFix:  'Add alt="" if the image is purely decorative and conveys no information. Add descriptive alt text if the image conveys meaning or information.'
          });
        } else if (alt.trim().length === 0) {
          // Decorative — this is correct. Check it is truly decorative.
          // We flag as info only
          const src = el.src || '';
          const filename = src.split('/').pop().split('?')[0];
          findings.push({
            id:        generateId(),
            engine:    'Images',
            element:   describeEl(el),
            criterion: 'WCAG 2.2 SC 1.1.1 Non-text Content (Level A)',
            issue:     `Image has empty alt text (alt=""). This is correct for decorative images. Verify this image is truly decorative and conveys no information. Filename: ${filename}`,
            computed:  'alt=""',
            required:  'Empty alt is correct for decorative images only',
            verdict:   'Info',
            severity:  SEV.MINOR,
            howToFix:  'Confirm this image is decorative. If it conveys information, replace alt="" with a descriptive text alternative.'
          });
        } else {
          // Check for file name or generic alt text
          const altLower = alt.toLowerCase();
          const badPatterns = ['image', 'photo', 'picture', 'graphic', 'icon', 'img', '.png', '.jpg', '.gif', '.svg', '.webp'];
          const isBad = badPatterns.some(p => altLower === p || altLower.endsWith(p));
          if (isBad) {
            findings.push({
              id:        generateId(),
              engine:    'Images',
              element:   describeEl(el),
              criterion: 'WCAG 2.2 SC 1.1.1 Non-text Content (Level A)',
              issue:     `Image alt text "${alt}" appears to be a filename, generic label, or file extension rather than a meaningful description.`,
              computed:  `alt="${alt}"`,
              required:  'Descriptive alt text that conveys the purpose or content of the image',
              verdict:   'Fail',
              severity:  SEV.SERIOUS,
              howToFix:  'Replace the alt text with a concise description of what the image shows or what purpose it serves. Avoid words like "image", "photo", or file extensions.'
            });
          }
        }
      }

      // SVG without accessible name
      if (tag === 'svg' && el.getAttribute('aria-hidden') !== 'true') {
        const name = getAccessibleName(el);
        if (!name) {
          const hasTitle = el.querySelector('title');
          if (!hasTitle) {
            findings.push({
              id:        generateId(),
              engine:    'Images',
              element:   describeEl(el),
              criterion: 'WCAG 2.2 SC 1.1.1 Non-text Content (Level A)',
              issue:     'SVG element is not hidden from assistive technology and has no accessible name. Add a <title> element or aria-label, or set aria-hidden="true" if the SVG is decorative.',
              computed:  'No <title>, aria-label, or aria-labelledby found on SVG',
              required:  '<title> element as first child, or aria-label attribute, or aria-hidden="true" for decorative SVGs',
              verdict:   'Fail',
              severity:  SEV.SERIOUS,
              howToFix:  'Add a <title> element as the first child of the SVG with a descriptive name. Also add role="img" and aria-labelledby pointing to the title element\'s id.'
            });
          }
        }
      }
    });

    return findings;
  }

  /* ================================================================
     ADDITIONAL ENGINE: FORM LABELS
  ================================================================ */

  function auditForms () {
    const findings = [];
    const controls = Array.from(document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="reset"]):not([type="button"]), ' +
      'select, textarea, [role="textbox"], [role="combobox"], [role="listbox"], ' +
      '[role="checkbox"], [role="radio"], [role="switch"], [role="spinbutton"]'
    )).filter(el => {
      const cs = window.getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && !el.disabled;
    });

    controls.forEach(el => {
      const name = getAccessibleName(el);
      if (!name || name.trim().length === 0) {
        const type = el.getAttribute('type') || el.tagName.toLowerCase();
        findings.push({
          id:        generateId(),
          engine:    'Forms',
          element:   describeEl(el),
          criterion: 'WCAG 2.2 SC 1.3.1 Info and Relationships (Level A) and SC 3.3.2 Labels or Instructions (Level A)',
          issue:     `Form control of type "${type}" has no accessible label. Screen reader users will not know the purpose of this control.`,
          computed:  'No accessible name found via aria-label, aria-labelledby, <label for="">, or wrapping <label>',
          required:  'Every form control must have a programmatically associated accessible name',
          verdict:   'Fail',
          severity:  SEV.CRITICAL,
          howToFix:  'Associate a <label> element using the for attribute matching the control\'s id. Alternatively use aria-label or aria-labelledby to provide the accessible name.'
        });
      }
    });

    // Check for required fields indicated only by colour
    const requiredFields = Array.from(document.querySelectorAll('[required], [aria-required="true"]'));
    requiredFields.forEach(el => {
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      // Check if required is indicated in accessible name or description
      const name = getAccessibleName(el);
      const desc = el.getAttribute('aria-describedby');
      const hasTextIndicator = name && (name.includes('*') || name.toLowerCase().includes('required'));
      const hasAriaRequired  = el.getAttribute('aria-required') === 'true' || el.required;
      if (!hasAriaRequired) {
        findings.push({
          id:        generateId(),
          engine:    'Forms',
          element:   describeEl(el),
          criterion: 'WCAG 2.2 SC 1.3.1 Info and Relationships (Level A)',
          issue:     'Field appears to be required but aria-required="true" is not set. Screen readers will not announce this field as required.',
          computed:  'required attribute or aria-required not confirmed',
          required:  'aria-required="true" on all required fields',
          verdict:   'Warning',
          severity:  SEV.MODERATE,
          howToFix:  'Add aria-required="true" to all required form fields. Also indicate the requirement in visible text, not colour alone.'
        });
      }
    });

    return findings;
  }

  /* ================================================================
     ADDITIONAL ENGINE: LINKS AND BUTTONS
  ================================================================ */

  function auditLinksButtons () {
    const findings = [];

    const genericLinkTexts = ['click here','read more','learn more','here','more','link','button','continue','go','visit','see more','view more','details'];

    const links = Array.from(document.querySelectorAll('a[href], [role="link"]')).filter(el => {
      const cs = window.getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    });

    links.forEach(el => {
      const name = getAccessibleName(el).toLowerCase().trim();
      if (!name) {
        findings.push({
          id:        generateId(),
          engine:    'Links and Buttons',
          element:   describeEl(el),
          criterion: 'WCAG 2.2 SC 2.4.4 Link Purpose In Context (Level A) and SC 4.1.2 Name, Role, Value (Level A)',
          issue:     'Link has no accessible name. Screen reader users will not know the destination or purpose of this link.',
          computed:  'Accessible name: empty',
          required:  'All links must have an accessible name that describes their purpose or destination',
          verdict:   'Fail',
          severity:  SEV.CRITICAL,
          howToFix:  'Add descriptive link text, or use aria-label to provide a name if the visual text cannot be changed.'
        });
      } else if (genericLinkTexts.includes(name)) {
        findings.push({
          id:        generateId(),
          engine:    'Links and Buttons',
          element:   describeEl(el),
          criterion: 'WCAG 2.2 SC 2.4.4 Link Purpose In Context (Level A)',
          issue:     `Link text "${name}" is generic and does not describe the link destination or purpose when read out of context by a screen reader.`,
          computed:  `Accessible name: "${name}"`,
          required:  'Link text must describe the destination or purpose without relying on surrounding context',
          verdict:   'Fail',
          severity:  SEV.SERIOUS,
          howToFix:  `Replace "${name}" with descriptive text. If the visual text cannot change, add aria-label with a full description, for example aria-label="Read more about our accessibility policy".`
        });
      }
    });

    // Buttons without accessible names
    const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'))
      .filter(el => {
        const cs = window.getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden';
      });

    buttons.forEach(el => {
      const name = getAccessibleName(el).trim();
      if (!name) {
        findings.push({
          id:        generateId(),
          engine:    'Links and Buttons',
          element:   describeEl(el),
          criterion: 'WCAG 2.2 SC 4.1.2 Name, Role, Value (Level A)',
          issue:     'Button has no accessible name. Screen reader users will not know what this button does.',
          computed:  'Accessible name: empty',
          required:  'All buttons must have an accessible name describing their action',
          verdict:   'Fail',
          severity:  SEV.CRITICAL,
          howToFix:  'Add visible text inside the button, or use aria-label if the button contains only an icon.'
        });
      }
    });

    return findings;
  }

  /* ================================================================
     ID GENERATOR
  ================================================================ */

  let findingCounter = 0;
  function generateId () {
    return `AMA11Y-${String(++findingCounter).padStart(4, '0')}`;
  }

  /* ================================================================
     MAIN AUDIT RUNNER
  ================================================================ */

  function runAllAudits () {
    findingCounter = 0;
    const engines = [
      { name: 'Focus Order',     fn: auditFocusOrder      },
      { name: 'Focus Visibility',fn: auditFocusVisibility  },
      { name: 'Colour Contrast', fn: auditColourContrast   },
      { name: 'Heading Structure',fn: auditHeadingStructure },
      { name: 'Landmarks',       fn: auditLandmarks        },
      { name: 'Images',          fn: auditImages           },
      { name: 'Forms',           fn: auditForms            },
      { name: 'Links and Buttons',fn: auditLinksButtons    }
    ];
    const all = [];
    engines.forEach(function(engine) {
      try {
        const results = engine.fn();
        all.push.apply(all, results);
      } catch (err) {
        all.push({
          id:        generateId(),
          engine:    engine.name,
          element:   'Audit Engine',
          criterion: 'AMA11Y Internal',
          issue:     'The ' + engine.name + ' audit engine encountered an error on this page: ' + (err && err.message ? err.message : String(err)),
          computed:  String(err),
          required:  'Engine should complete without errors',
          verdict:   'Info',
          severity:  SEV.MINOR,
          howToFix:  'Report this page URL. The other audit results above are still valid.'
        });
      }
    });
    return all;
  }

  /* ================================================================
     RESULTS PANEL — ACCESSIBLE HTML UI
     Milestone 1.6
  ================================================================ */

  function buildPanel (findings) {
    removeExisting();

    const counts = {
      Fail:    findings.filter(f => f.verdict === 'Fail').length,
      Warning: findings.filter(f => f.verdict === 'Warning').length,
      Pass:    findings.filter(f => f.verdict === 'Pass').length,
      Info:    findings.filter(f => f.verdict === 'Info').length,
      [SEV.CRITICAL]: findings.filter(f => f.severity === SEV.CRITICAL && f.verdict === 'Fail').length,
      [SEV.SERIOUS]:  findings.filter(f => f.severity === SEV.SERIOUS  && f.verdict === 'Fail').length,
      [SEV.MODERATE]: findings.filter(f => f.severity === SEV.MODERATE && f.verdict !== 'Pass').length,
      [SEV.MINOR]:    findings.filter(f => f.severity === SEV.MINOR).length
    };

    // Inject styles
    const style = document.createElement('style');
    style.id = 'ama11y-style';
    style.textContent = `
      #ama11y-panel *,#ama11y-panel *::before,#ama11y-panel *::after{box-sizing:border-box;margin:0;padding:0;}
      #ama11y-panel{
        position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.92);z-index:2147483647;
        overflow-y:auto;font-family:'Segoe UI',system-ui,sans-serif;
        color:#f0f0f0;padding:0;
      }
      #ama11y-inner{
        max-width:1100px;margin:0 auto;padding:24px 20px 48px;
      }
      #ama11y-panel h1{font-size:1.8rem;color:#7ec8e3;margin-bottom:4px;letter-spacing:.02em;}
      #ama11y-panel h2{font-size:1.2rem;color:#b8d4e8;margin:24px 0 12px;border-bottom:1px solid #334;padding-bottom:6px;}
      #ama11y-panel h3{font-size:1rem;color:#a0c4d8;margin:0 0 4px;}
      #ama11y-panel p{font-size:.9rem;line-height:1.6;color:#ccc;margin-bottom:8px;}
      #ama11y-panel code{font-family:'Cascadia Code','Consolas',monospace;font-size:.82rem;background:#1a2a3a;padding:2px 6px;border-radius:3px;color:#7ec8e3;}
      .ama11y-skip{
        position:absolute;top:-999px;left:-999px;
        background:#003366;color:#fff;padding:8px 16px;border-radius:0 0 6px 0;font-size:.9rem;z-index:1;
      }
      .ama11y-skip:focus{top:0;left:0;}
      #ama11y-topbar{
        display:flex;align-items:center;justify-content:space-between;
        background:#0a1628;padding:14px 20px;position:sticky;top:0;z-index:10;
        border-bottom:2px solid #7ec8e3;
      }
      #ama11y-topbar h1{margin:0;font-size:1.4rem;}
      #ama11y-close{
        background:#c0392b;color:#fff;border:none;padding:8px 18px;
        border-radius:4px;font-size:.9rem;cursor:pointer;font-weight:600;
      }
      #ama11y-close:focus{outline:3px solid #fff;outline-offset:2px;}
      #ama11y-close:hover{background:#e74c3c;}
      .ama11y-summary{
        display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));
        gap:12px;margin:20px 0;
      }
      .ama11y-card{
        background:#0e1f2f;border-radius:6px;padding:14px;text-align:center;
        border:1px solid #1e3a5a;
      }
      .ama11y-card .count{font-size:2rem;font-weight:700;line-height:1;}
      .ama11y-card .label{font-size:.78rem;color:#aaa;margin-top:4px;text-transform:uppercase;letter-spacing:.06em;}
      .count-fail{color:#e74c3c;}
      .count-warn{color:#f39c12;}
      .count-pass{color:#2ecc71;}
      .count-info{color:#7ec8e3;}
      .count-crit{color:#ff6b6b;}
      .count-ser{color:#ff9f43;}
      .count-mod{color:#ffd93d;}
      .count-min{color:#6bcb77;}
      #ama11y-export-bar{
        display:flex;gap:12px;flex-wrap:wrap;margin:16px 0;
        align-items:center;
      }
      #ama11y-export-bar button{
        background:#0e3460;color:#7ec8e3;border:1px solid #7ec8e3;
        padding:8px 16px;border-radius:4px;cursor:pointer;font-size:.85rem;
      }
      #ama11y-export-bar button:hover{background:#1a4a80;}
      #ama11y-export-bar button:focus{outline:3px solid #fff;outline-offset:2px;}
      #ama11y-filter-bar{
        display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center;
      }
      #ama11y-filter-bar label{font-size:.85rem;color:#aaa;}
      #ama11y-filter-bar select{
        background:#0e1f2f;color:#f0f0f0;border:1px solid #334;
        padding:6px 10px;border-radius:4px;font-size:.85rem;
      }
      #ama11y-filter-bar select:focus{outline:3px solid #7ec8e3;outline-offset:2px;}
      #ama11y-results-table{
        width:100%;border-collapse:collapse;font-size:.82rem;
      }
      #ama11y-results-table th{
        background:#0a1e30;color:#7ec8e3;padding:10px 12px;
        text-align:left;border-bottom:2px solid #1e3a5a;
        font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;
        position:sticky;top:52px;z-index:5;
      }
      #ama11y-results-table td{
        padding:10px 12px;border-bottom:1px solid #1a2a3a;
        vertical-align:top;line-height:1.5;
      }
      #ama11y-results-table tr:hover td{background:#0e1f2f;}
      #ama11y-results-table tr:focus-within td{background:#0e1f2f;}
      .verdict-fail{color:#e74c3c;font-weight:700;}
      .verdict-warn{color:#f39c12;font-weight:700;}
      .verdict-pass{color:#2ecc71;font-weight:700;}
      .verdict-info{color:#7ec8e3;}
      .sev-critical{color:#ff6b6b;font-weight:600;}
      .sev-serious{color:#ff9f43;font-weight:600;}
      .sev-moderate{color:#ffd93d;}
      .sev-minor{color:#6bcb77;}
      .ama11y-expand{
        background:transparent;border:1px solid #334;color:#7ec8e3;
        padding:3px 8px;border-radius:3px;cursor:pointer;font-size:.75rem;
        margin-top:4px;
      }
      .ama11y-expand:focus{outline:3px solid #fff;outline-offset:2px;}
      .ama11y-detail{
        display:none;margin-top:8px;padding:10px;
        background:#070f1a;border-radius:4px;border-left:3px solid #7ec8e3;
      }
      .ama11y-detail.open{display:block;}
      .ama11y-detail p{margin-bottom:6px;}
      .ama11y-detail strong{color:#b8d4e8;}
      #ama11y-live{
        position:absolute;width:1px;height:1px;overflow:hidden;
        clip:rect(0,0,0,0);white-space:nowrap;
      }
      @media(max-width:600px){
        #ama11y-results-table th:nth-child(4),
        #ama11y-results-table td:nth-child(4),
        #ama11y-results-table th:nth-child(5),
        #ama11y-results-table td:nth-child(5){display:none;}
      }
    `;
    document.head.appendChild(style);

    // Build panel HTML
    const panel = document.createElement('div');
    panel.id    = TOOL_ID;
    panel.setAttribute('role', 'alertdialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'ama11y-panel-heading');
    panel.setAttribute('aria-describedby', 'ama11y-panel-summary');
    panel.setAttribute('tabindex', '-1');

    // Skip link
    const skip = document.createElement('a');
    skip.href      = '#ama11y-results';
    skip.className = 'ama11y-skip';
    skip.textContent = 'Skip to audit results table';
    panel.appendChild(skip);

    // Live region for announcements
    const live = document.createElement('div');
    live.id = 'ama11y-live';
    live.setAttribute('aria-live', 'assertive');
    live.setAttribute('aria-atomic', 'true');
    panel.appendChild(live);

    // Top bar
    const topbar = document.createElement('div');
    topbar.id = 'ama11y-topbar';

    const title = document.createElement('h1');
    title.id = 'ama11y-panel-heading';
    title.textContent = 'AMA11Y — Audit Results';
    topbar.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.id          = 'ama11y-close';
    closeBtn.textContent = 'Close Panel (Escape)';
    closeBtn.setAttribute('aria-label', 'Close AMA11Y audit panel');
    closeBtn.addEventListener('click', removeExisting);
    topbar.appendChild(closeBtn);

    panel.appendChild(topbar);

    // Inner wrapper
    const inner = document.createElement('div');
    inner.id = 'ama11y-inner';

    // Audit meta
    const meta = document.createElement('p');
    meta.textContent = `Page audited: ${document.title || window.location.href} — ${new Date().toLocaleString('en-GB')} — AMA11Y v${TOOL_VERSION}`;
    meta.style.cssText = 'font-size:.78rem;color:#777;margin:12px 0 4px;';
    inner.appendChild(meta);

    // Summary section
    const summaryHeading = document.createElement('h2');
    summaryHeading.textContent = 'Audit Summary';
    inner.appendChild(summaryHeading);

    const summaryGrid = document.createElement('div');
    summaryGrid.className = 'ama11y-summary';
    summaryGrid.setAttribute('role', 'region');
    summaryGrid.setAttribute('aria-label', 'Finding counts by verdict and severity');

    const cards = [
      { count: counts.Fail,              label: 'Failures',      cls: 'count-fail' },
      { count: counts.Warning,           label: 'Warnings',      cls: 'count-warn' },
      { count: counts.Pass,              label: 'Passes',        cls: 'count-pass' },
      { count: counts[SEV.CRITICAL],     label: 'Critical',      cls: 'count-crit' },
      { count: counts[SEV.SERIOUS],      label: 'Serious',       cls: 'count-ser'  },
      { count: counts[SEV.MODERATE],     label: 'Moderate',      cls: 'count-mod'  },
      { count: counts[SEV.MINOR],        label: 'Minor / Info',  cls: 'count-min'  }
    ];

    cards.forEach(c => {
      const card = document.createElement('div');
      card.className = 'ama11y-card';
      card.innerHTML = `<div class="count ${c.cls}" aria-hidden="true">${c.count}</div><div class="label">${c.label}</div>`;
      card.setAttribute('aria-label', `${c.count} ${c.label}`);
      summaryGrid.appendChild(card);
    });

    inner.appendChild(summaryGrid);

    // Accessible summary for screen readers
    const srSummary = document.createElement('p');
    srSummary.id = 'ama11y-panel-summary';
    srSummary.textContent = `Audit complete. ${counts.Fail} failures, ${counts.Warning} warnings, ${counts[SEV.CRITICAL]} critical, ${counts[SEV.SERIOUS]} serious, ${counts[SEV.MODERATE]} moderate.`;
    srSummary.style.cssText = 'font-size:.85rem;color:#aaa;margin-bottom:12px;';
    inner.appendChild(srSummary);

    // Export bar
    const exportHeading = document.createElement('h2');
    exportHeading.textContent = 'Export Findings';
    inner.appendChild(exportHeading);

    const exportBar = document.createElement('div');
    exportBar.id = 'ama11y-export-bar';
    exportBar.setAttribute('role', 'group');
    exportBar.setAttribute('aria-label', 'Export options');

    const exportJSON = document.createElement('button');
    exportJSON.textContent = 'Export as JSON';
    exportJSON.setAttribute('aria-label', 'Export findings as JSON file');
    exportJSON.addEventListener('click', () => exportFindings(findings, 'json'));

    const exportHTML = document.createElement('button');
    exportHTML.textContent = 'Export as HTML Report';
    exportHTML.setAttribute('aria-label', 'Export findings as accessible HTML report');
    exportHTML.addEventListener('click', () => exportFindings(findings, 'html'));

    const exportCSV = document.createElement('button');
    exportCSV.textContent = 'Export as CSV';
    exportCSV.setAttribute('aria-label', 'Export findings as CSV file for Excel');
    exportCSV.addEventListener('click', () => exportFindings(findings, 'csv'));

    const exportTXT = document.createElement('button');
    exportTXT.textContent = 'Export as Plain Text';
    exportTXT.setAttribute('aria-label', 'Export findings as plain text file');
    exportTXT.addEventListener('click', () => exportFindings(findings, 'txt'));

    exportBar.append(exportJSON, exportHTML, exportCSV, exportTXT);
    inner.appendChild(exportBar);

    // Filter bar
    const filterHeading = document.createElement('h2');
    filterHeading.id = 'ama11y-results';
    filterHeading.textContent = `All Findings (${findings.length} total)`;
    inner.appendChild(filterHeading);

    const filterBar = document.createElement('div');
    filterBar.id = 'ama11y-filter-bar';

    const verdictLabel = document.createElement('label');
    verdictLabel.textContent = 'Filter by verdict: ';
    verdictLabel.setAttribute('for', 'ama11y-verdict-filter');
    const verdictSel = document.createElement('select');
    verdictSel.id = 'ama11y-verdict-filter';
    ['All', 'Fail', 'Warning', 'Pass', 'Info'].forEach(v => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = v;
      verdictSel.appendChild(opt);
    });

    const engineLabel = document.createElement('label');
    engineLabel.textContent = 'Filter by audit: ';
    engineLabel.setAttribute('for', 'ama11y-engine-filter');
    const engineSel = document.createElement('select');
    engineSel.id = 'ama11y-engine-filter';
    const engines = ['All', ...new Set(findings.map(f => f.engine))];
    engines.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e; opt.textContent = e;
      engineSel.appendChild(opt);
    });

    verdictSel.addEventListener('change', () => applyFilter(verdictSel.value, engineSel.value, findings));
    engineSel.addEventListener('change', () => applyFilter(verdictSel.value, engineSel.value, findings));

    filterBar.append(verdictLabel, verdictSel, engineLabel, engineSel);
    inner.appendChild(filterBar);

    // Results table
    const tableWrap = document.createElement('div');
    tableWrap.setAttribute('role', 'region');
    tableWrap.setAttribute('aria-label', 'Audit findings table');
    tableWrap.setAttribute('tabindex', '0');
    tableWrap.style.overflowX = 'auto';

    const table = document.createElement('table');
    table.id = 'ama11y-results-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['ID', 'Engine', 'Element', 'Criterion', 'Severity', 'Verdict', 'Details'].forEach(col => {
      const th = document.createElement('th');
      th.setAttribute('scope', 'col');
      th.textContent = col;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    tbody.id = 'ama11y-tbody';
    renderRows(tbody, findings);
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    inner.appendChild(tableWrap);

    panel.appendChild(inner);
    document.body.appendChild(panel);

    // Trap focus within panel
    panel.addEventListener('keydown', e => {
      if (e.key === 'Escape') { removeExisting(); }
      if (e.key === 'Tab') {
        const focusable = panel.querySelectorAll(
          'a[href], button, select, [tabindex="0"]'
        );
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    });

    // JAWS focus management: repeated focus interval per PDD 13.1.5
    // Try up to 10 times at 100ms intervals until panel has focus
    let focusAttempts = 0;
    const focusInterval = setInterval(() => {
      focusAttempts++;
      panel.focus();
      if (document.activeElement === panel || document.activeElement === closeBtn || focusAttempts >= 10) {
        clearInterval(focusInterval);
        if (document.activeElement !== panel && document.activeElement !== closeBtn) {
          closeBtn.focus();
        }
      }
    }, 100);

    // Announce to screen reader via assertive live region
    live.textContent = `AMA11Y audit complete. ${counts.Fail} failures, ${counts.Warning} warnings, ${counts.Pass} passes found. ${counts[SEV.CRITICAL]} critical. Use heading navigation to browse results.`;
  }

  function renderRows (tbody, findings) {
    tbody.innerHTML = '';
    findings.forEach(f => {
      const tr = document.createElement('tr');

      const tdId = document.createElement('td');
      tdId.textContent = f.id;

      const tdEngine = document.createElement('td');
      tdEngine.textContent = f.engine;

      const tdEl = document.createElement('td');
      const elCode = document.createElement('code');
      elCode.textContent = f.element.slice(0, 80);
      tdEl.appendChild(elCode);

      const tdCrit = document.createElement('td');
      tdCrit.textContent = f.criterion;

      const tdSev = document.createElement('td');
      tdSev.textContent = f.severity;
      const sevClass = {
        [SEV.CRITICAL]: 'sev-critical',
        [SEV.SERIOUS]:  'sev-serious',
        [SEV.MODERATE]: 'sev-moderate',
        [SEV.MINOR]:    'sev-minor'
      }[f.severity] || '';
      if (sevClass) tdSev.className = sevClass;

      const tdVerdict = document.createElement('td');
      tdVerdict.textContent = f.verdict;
      const vClass = {
        Fail: 'verdict-fail', Warning: 'verdict-warn',
        Pass: 'verdict-pass', Info: 'verdict-info'
      }[f.verdict] || '';
      if (vClass) tdVerdict.className = vClass;

      const tdDetail = document.createElement('td');
      const expandBtn = document.createElement('button');
      expandBtn.className   = 'ama11y-expand';
      expandBtn.textContent = 'Show detail';
      expandBtn.setAttribute('aria-expanded', 'false');
      expandBtn.setAttribute('aria-label', `Show detail for finding ${f.id}`);

      const detailDiv = document.createElement('div');
      detailDiv.className = 'ama11y-detail';
      detailDiv.setAttribute('role', 'region');
      detailDiv.setAttribute('aria-label', `Detail for finding ${f.id}`);
      detailDiv.innerHTML = `
        <p><strong>Issue:</strong> ${escHtml(f.issue)}</p>
        <p><strong>Computed:</strong> <code>${escHtml(f.computed)}</code></p>
        <p><strong>Required:</strong> ${escHtml(f.required)}</p>
        <p><strong>How to fix:</strong> ${escHtml(f.howToFix)}</p>
        ${f.extra && f.extra.focusSequence ? `<p><strong>Focus sequence (first 20):</strong></p><ol>${f.extra.focusSequence.slice(0,20).map(s=>`<li><code>${escHtml(s)}</code></li>`).join('')}</ol>` : ''}
      `;

      expandBtn.addEventListener('click', () => {
        const isOpen = detailDiv.classList.contains('open');
        detailDiv.classList.toggle('open', !isOpen);
        expandBtn.textContent = isOpen ? 'Show detail' : 'Hide detail';
        expandBtn.setAttribute('aria-expanded', String(!isOpen));
      });

      tdDetail.appendChild(expandBtn);
      tdDetail.appendChild(detailDiv);

      tr.append(tdId, tdEngine, tdEl, tdCrit, tdSev, tdVerdict, tdDetail);
      tr.dataset.verdict = f.verdict;
      tr.dataset.engine  = f.engine;
      tbody.appendChild(tr);
    });
  }

  function applyFilter (verdict, engine, findings) {
    const filtered = findings.filter(f => {
      const vMatch = verdict === 'All' || f.verdict === verdict;
      const eMatch = engine  === 'All' || f.engine  === engine;
      return vMatch && eMatch;
    });
    const tbody = document.getElementById('ama11y-tbody');
    if (tbody) renderRows(tbody, filtered);
    const live = document.getElementById('ama11y-live');
    if (live) live.textContent = `Filter applied. ${filtered.length} findings shown.`;
  }

  function escHtml (str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ================================================================
     EXPORT ENGINE
     Milestone 1.7
  ================================================================ */

  function exportFindings (findings, format) {
    const title   = document.title || window.location.hostname;
    const dateStr = new Date().toISOString().replace('T',' ').slice(0,19);
    let content, mime, ext;

    if (format === 'json') {
      const payload = {
        tool:       'AMA11Y',
        version:    TOOL_VERSION,
        auditedURL: window.location.href,
        auditedTitle: title,
        auditDate:  dateStr,
        findingCounts: {
          total:    findings.length,
          fail:     findings.filter(f=>f.verdict==='Fail').length,
          warning:  findings.filter(f=>f.verdict==='Warning').length,
          pass:     findings.filter(f=>f.verdict==='Pass').length,
          critical: findings.filter(f=>f.severity===SEV.CRITICAL&&f.verdict==='Fail').length,
          serious:  findings.filter(f=>f.severity===SEV.SERIOUS&&f.verdict==='Fail').length,
          moderate: findings.filter(f=>f.severity===SEV.MODERATE&&f.verdict!=='Pass').length
        },
        findings: findings.map(f => ({
          id: f.id, engine: f.engine, element: f.element,
          criterion: f.criterion, issue: f.issue,
          computed: f.computed, required: f.required,
          verdict: f.verdict, severity: f.severity, howToFix: f.howToFix
        }))
      };
      content = JSON.stringify(payload, null, 2);
      mime    = 'application/json';
      ext     = 'json';

    } else if (format === 'csv') {
      const headers = ['ID','Engine','Element','Criterion','Severity','Verdict','Issue','Computed','Required','How to Fix'];
      const rows = findings.map(f => [
        f.id, f.engine, f.element, f.criterion, f.severity, f.verdict,
        f.issue, f.computed, f.required, f.howToFix
      ].map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','));
      content = [headers.join(','), ...rows].join('\r\n');
      mime    = 'text/csv';
      ext     = 'csv';

    } else if (format === 'txt') {
      const lines = [
        `AMA11Y Accessibility Audit Report`,
        `Tool Version: ${TOOL_VERSION}`,
        `Page: ${title}`,
        `URL: ${window.location.href}`,
        `Date: ${dateStr}`,
        `Total findings: ${findings.length}`,
        `Failures: ${findings.filter(f=>f.verdict==='Fail').length}`,
        `Warnings: ${findings.filter(f=>f.verdict==='Warning').length}`,
        '',
        '='.repeat(80),
        ''
      ];
      findings.forEach((f, i) => {
        lines.push(`Finding ${i+1} of ${findings.length}`);
        lines.push(`ID:        ${f.id}`);
        lines.push(`Engine:    ${f.engine}`);
        lines.push(`Verdict:   ${f.verdict}`);
        lines.push(`Severity:  ${f.severity}`);
        lines.push(`Element:   ${f.element}`);
        lines.push(`Criterion: ${f.criterion}`);
        lines.push(`Issue:     ${f.issue}`);
        lines.push(`Computed:  ${f.computed}`);
        lines.push(`Required:  ${f.required}`);
        lines.push(`Fix:       ${f.howToFix}`);
        lines.push('-'.repeat(80));
        lines.push('');
      });
      content = lines.join('\n');
      mime    = 'text/plain';
      ext     = 'txt';

    } else if (format === 'html') {
      content = buildHTMLReport(findings, title, dateStr);
      mime    = 'text/html';
      ext     = 'html';
    }

    // Trigger download
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ama11y-report-${dateStr.slice(0,10)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const live = document.getElementById('ama11y-live');
    if (live) live.textContent = `Report exported as ${ext.toUpperCase()} file.`;
  }

  function buildHTMLReport (findings, pageTitle, dateStr) {
    const fail    = findings.filter(f=>f.verdict==='Fail').length;
    const warn    = findings.filter(f=>f.verdict==='Warning').length;
    const crit    = findings.filter(f=>f.severity===SEV.CRITICAL&&f.verdict==='Fail').length;
    const serious = findings.filter(f=>f.severity===SEV.SERIOUS&&f.verdict==='Fail').length;

    const rows = findings.map((f,i) => `
      <tr>
        <td>${escHtml(f.id)}</td>
        <td>${escHtml(f.engine)}</td>
        <td><code>${escHtml(f.element.slice(0,80))}</code></td>
        <td>${escHtml(f.criterion)}</td>
        <td>${escHtml(f.severity)}</td>
        <td>${escHtml(f.verdict)}</td>
        <td>
          <p>${escHtml(f.issue)}</p>
          <p><strong>Computed:</strong> <code>${escHtml(f.computed)}</code></p>
          <p><strong>Required:</strong> ${escHtml(f.required)}</p>
          <p><strong>How to fix:</strong> ${escHtml(f.howToFix)}</p>
        </td>
      </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AMA11Y Audit Report — ${escHtml(pageTitle)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Segoe UI',system-ui,sans-serif;color:#1a1a1a;background:#fff;padding:0;}
  .skip{position:absolute;top:-999px;left:-999px;background:#003366;color:#fff;padding:8px 16px;}
  .skip:focus{top:0;left:0;}
  header{background:#003366;color:#fff;padding:24px 32px;}
  header h1{font-size:1.6rem;margin-bottom:4px;}
  header p{font-size:.9rem;opacity:.8;}
  main{max-width:1200px;margin:0 auto;padding:32px;}
  h2{font-size:1.2rem;color:#003366;margin:24px 0 12px;border-bottom:2px solid #e0e8f0;padding-bottom:6px;}
  .summary{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0 24px;}
  .card{background:#f0f5fa;border-radius:6px;padding:16px 20px;min-width:110px;text-align:center;border:1px solid #cde;}
  .card .n{font-size:1.8rem;font-weight:700;}
  .card .l{font-size:.75rem;color:#555;text-transform:uppercase;letter-spacing:.05em;margin-top:2px;}
  .n-fail{color:#c0392b;} .n-warn{color:#d68910;} .n-pass{color:#1e8449;} .n-crit{color:#c0392b;} .n-ser{color:#d35400;}
  table{width:100%;border-collapse:collapse;font-size:.82rem;}
  th{background:#003366;color:#fff;padding:10px 12px;text-align:left;font-size:.75rem;text-transform:uppercase;}
  td{padding:10px 12px;border-bottom:1px solid #e8eef5;vertical-align:top;line-height:1.5;}
  tr:nth-child(even) td{background:#f8fafc;}
  code{font-family:'Cascadia Code',Consolas,monospace;font-size:.8rem;background:#eef2f7;padding:1px 5px;border-radius:2px;}
  footer{background:#f0f5fa;padding:16px 32px;font-size:.8rem;color:#555;border-top:1px solid #dde;}
  @media(max-width:700px){th:nth-child(4),td:nth-child(4),th:nth-child(5),td:nth-child(5){display:none;}}
</style>
</head>
<body>
<a class="skip" href="#main-content">Skip to main content</a>
<header role="banner">
  <h1>AMA11Y Accessibility Audit Report</h1>
  <p>Page: ${escHtml(pageTitle)} &nbsp;|&nbsp; URL: ${escHtml(window.location.href)} &nbsp;|&nbsp; Date: ${escHtml(dateStr)} &nbsp;|&nbsp; Tool: AMA11Y v${TOOL_VERSION}</p>
</header>
<main id="main-content">
  <h2>Summary</h2>
  <div class="summary" role="region" aria-label="Finding counts">
    <div class="card"><div class="n n-fail" aria-label="${fail} failures">${fail}</div><div class="l">Failures</div></div>
    <div class="card"><div class="n n-warn" aria-label="${warn} warnings">${warn}</div><div class="l">Warnings</div></div>
    <div class="card"><div class="n n-crit" aria-label="${crit} critical">${crit}</div><div class="l">Critical</div></div>
    <div class="card"><div class="n n-ser" aria-label="${serious} serious">${serious}</div><div class="l">Serious</div></div>
    <div class="card"><div class="n n-pass" aria-label="${findings.length} total">${findings.length}</div><div class="l">Total</div></div>
  </div>
  <h2 id="findings-heading">All Findings (${findings.length})</h2>
  <div role="region" aria-labelledby="findings-heading" style="overflow-x:auto;">
    <table aria-label="Accessibility audit findings">
      <thead>
        <tr>
          <th scope="col">ID</th>
          <th scope="col">Engine</th>
          <th scope="col">Element</th>
          <th scope="col">Criterion</th>
          <th scope="col">Severity</th>
          <th scope="col">Verdict</th>
          <th scope="col">Detail and Remediation</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</main>
<footer role="contentinfo">
  <p>Generated by AMA11Y v${TOOL_VERSION} — ama11y.akhileshmalani.com — Private and Confidential — Akhilesh Malani</p>
</footer>
</body>
</html>`;
  }

  /* ================================================================
     ENTRY POINT
  ================================================================ */

  try {
    const findings = runAllAudits();
    buildPanel(findings);
  } catch (err) {
    // Announce error to screen reader via alert - guaranteed to be heard
    alert('AMA11Y encountered an error: ' + (err && err.message ? err.message : String(err)) + '. Please report this page URL to Akhilesh Malani.');
  }

})();
