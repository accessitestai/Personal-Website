/**
 * AMA11Y Phase 1 Engines — Extracted from bookmarklet for extension use
 * 8 audit engines + utility functions
 */

/* ================================================================
   CONSTANTS AND CONFIGURATION
================================================================ */

const TOOL_VERSION = '2.0.0';
const WCAG_LEVELS = { A: 'A', AA: 'AA', AAA: 'AAA' };

const CONTRAST = {
  NORMAL_AA:  4.5,
  LARGE_AA:   3.0,
  NORMAL_AAA: 7.0,
  LARGE_AAA:  4.5,
  NON_TEXT:   3.0
};

const LARGE_TEXT_PT_BOLD   = 14;
const LARGE_TEXT_PT_NORMAL = 18;
const PT_TO_PX             = 1.333333;
const FOCUS_MIN_AREA       = 4;

const SEV = { CRITICAL: 'Critical', SERIOUS: 'Serious', MODERATE: 'Moderate', MINOR: 'Minor' };

const LANDMARK_ROLES = [
  'banner','complementary','contentinfo','form','main',
  'navigation','region','search'
];

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
   ID GENERATOR
================================================================ */

let findingCounter = 0;
function generateId() {
  return `AMA11Y-${String(++findingCounter).padStart(4, '0')}`;
}
function resetCounter() {
  findingCounter = 0;
}

/* ================================================================
   UTILITY: COLOUR CONTRAST CALCULATIONS
================================================================ */

function parseColour(str) {
  if (!str || str === 'transparent' || str === 'rgba(0, 0, 0, 0)') {
    return { r: 255, g: 255, b: 255, a: 0 };
  }
  let m;
  m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (m) {
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
  }
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

function blendColour(fg, bg) {
  const a = fg.a !== undefined ? fg.a : 1;
  if (a >= 1) return fg;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1
  };
}

function linearise(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(col) {
  return 0.2126 * linearise(col.r) + 0.7152 * linearise(col.g) + 0.0722 * linearise(col.b);
}

function contrastRatio(c1, c2) {
  const l1 = luminance(c1);
  const l2 = luminance(c2);
  const lighter = Math.max(l1, l2);
  const darker  = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getEffectiveBg(el) {
  let bg = { r: 255, g: 255, b: 255, a: 1 };
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

function isLargeText(cs) {
  const pxSize = parseFloat(cs.fontSize);
  const ptSize = pxSize / PT_TO_PX;
  const bold   = parseInt(cs.fontWeight) >= 700 || cs.fontWeight === 'bold';
  return (bold && ptSize >= LARGE_TEXT_PT_BOLD) || (!bold && ptSize >= LARGE_TEXT_PT_NORMAL);
}

/* ================================================================
   UTILITY: ACCESSIBLE NAME COMPUTATION (SIMPLIFIED)
================================================================ */

function getAccessibleName(el) {
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const names = labelledBy.split(/\s+/).map(id => {
      const ref = document.getElementById(id);
      return ref ? ref.textContent.trim() : '';
    }).filter(Boolean);
    if (names.length) return names.join(' ');
  }
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
  if (el.id) {
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(el.id) : el.id;
    const label = document.querySelector(`label[for="${escaped}"]`);
    if (label) return label.textContent.trim();
  }
  const wrappingLabel = el.closest('label');
  if (wrappingLabel) return wrappingLabel.textContent.trim();
  if (el.tagName === 'IMG') return el.getAttribute('alt') || '';
  const title = el.getAttribute('title');
  if (title && title.trim()) return title.trim();
  return el.textContent.trim().slice(0, 120);
}

/* ================================================================
   UTILITY: ELEMENT DESCRIPTION FOR REPORTS
================================================================ */

function describeEl(el) {
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
   ENGINE 1: FOCUS ORDER (SC 2.4.3, SC 2.1.2)
================================================================ */

function auditFocusOrder() {
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

  const posTabIndex = focusable.filter(el => {
    const ti = parseInt(el.getAttribute('tabindex'));
    return !isNaN(ti) && ti > 0;
  });

  if (posTabIndex.length > 0) {
    posTabIndex.forEach(el => {
      findings.push({
        id: generateId(), engine: 'Focus Order', element: describeEl(el),
        criterion: 'WCAG 2.2 SC 2.4.3 Focus Order (Level A)',
        issue: `Positive tabindex value of ${el.getAttribute('tabindex')} found. Positive tabindex values override the natural DOM order and create an unpredictable focus sequence.`,
        computed: `tabindex="${el.getAttribute('tabindex')}"`,
        required: 'tabindex="0" or no tabindex attribute',
        verdict: 'Fail', severity: SEV.SERIOUS,
        howToFix: 'Remove the tabindex attribute or set it to 0. Manage focus order through correct DOM order instead.'
      });
    });
  }

  const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog');
  dialogs.forEach(dialog => {
    const cs = window.getComputedStyle(dialog);
    if (cs.display !== 'none' && cs.visibility !== 'hidden') {
      const closeBtn = dialog.querySelector('[aria-label*="close" i], [aria-label*="dismiss" i], button[class*="close" i]');
      if (!closeBtn) {
        findings.push({
          id: generateId(), engine: 'Focus Order', element: describeEl(dialog),
          criterion: 'WCAG 2.2 SC 2.1.2 No Keyboard Trap (Level A)',
          issue: 'Dialog element found without a detectable close or dismiss mechanism.',
          computed: 'No close button or dismiss control detected within dialog',
          required: 'A keyboard-operable close mechanism must be present within the dialog',
          verdict: 'Warning', severity: SEV.CRITICAL,
          howToFix: 'Add a close button inside the dialog. Ensure pressing Escape also closes the dialog.'
        });
      }
    }
  });

  findings.push({
    id: generateId(), engine: 'Focus Order', element: 'Page',
    criterion: 'WCAG 2.2 SC 2.4.3 Focus Order (Level A)',
    issue: `${focusable.length} focusable elements found on this page.`,
    computed: `${focusable.length} focusable elements`,
    required: 'All focusable elements must receive focus in a logical, meaningful order',
    verdict: 'Info', severity: SEV.MINOR,
    howToFix: 'Review the focus order and verify each element receives focus in reading order.'
  });

  return findings;
}

/* ================================================================
   ENGINE 2: FOCUS VISIBILITY (SC 2.4.7, SC 2.4.11)
================================================================ */

function auditFocusVisibility() {
  const findings = [];
  const focusable = Array.from(document.querySelectorAll(
    'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex="0"]'
  )).filter(el => {
    if (el.disabled) return false;
    const cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }).slice(0, 80);

  focusable.forEach(el => {
    const cs = window.getComputedStyle(el);
    const outlineStyle = cs.outlineStyle;
    const outlineWidth = parseFloat(cs.outlineWidth) || 0;
    const outlineColor = cs.outlineColor;
    const boxShadow    = cs.boxShadow;
    const hasOutline   = outlineStyle !== 'none' && outlineWidth >= 1;
    const hasBoxShadow = boxShadow && boxShadow !== 'none';

    if (!hasOutline && !hasBoxShadow) {
      const hasOutlineNone = outlineStyle === 'none' || outlineWidth === 0;
      if (hasOutlineNone) {
        findings.push({
          id: generateId(), engine: 'Focus Visibility', element: describeEl(el),
          criterion: 'WCAG 2.2 SC 2.4.7 Focus Visible (Level AA) and SC 2.4.11 Focus Appearance (Level AA)',
          issue: 'Focus indicator appears to be removed or suppressed on this element.',
          computed: `outline: ${outlineStyle} ${outlineWidth}px; box-shadow: ${boxShadow || 'none'}`,
          required: 'A visible focus indicator with minimum 2px outline or equivalent and 3:1 contrast ratio',
          verdict: 'Fail', severity: SEV.SERIOUS,
          howToFix: 'Remove outline: none from CSS. Provide a :focus-visible style with at least a 2px solid outline that has 3:1 contrast.'
        });
      }
    } else if (hasOutline) {
      const fg = parseColour(outlineColor);
      const bg = getEffectiveBg(el);
      if (fg && bg) {
        const ratio = contrastRatio(blendColour(fg, bg), bg);
        if (ratio < CONTRAST.NON_TEXT) {
          findings.push({
            id: generateId(), engine: 'Focus Visibility', element: describeEl(el),
            criterion: 'WCAG 2.2 SC 2.4.11 Focus Appearance (Level AA)',
            issue: `Focus indicator contrast ratio of ${ratio.toFixed(2)}:1 is below the required 3:1 minimum.`,
            computed: `Focus outline contrast: ${ratio.toFixed(2)}:1 (outline colour: ${outlineColor})`,
            required: 'Minimum 3:1 contrast ratio between the focus indicator and adjacent colours',
            verdict: 'Fail', severity: SEV.SERIOUS,
            howToFix: `Increase the contrast of the focus outline colour. Current ratio is ${ratio.toFixed(2)}:1, minimum required is 3:1.`
          });
        }
      }
    }
  });

  if (findings.length === 0) {
    findings.push({
      id: generateId(), engine: 'Focus Visibility', element: 'Page',
      criterion: 'WCAG 2.2 SC 2.4.7 and SC 2.4.11',
      issue: 'No focus visibility failures detected in the sampled focusable elements.',
      computed: `${focusable.length} elements checked`,
      required: 'All focusable elements must have a visible focus indicator',
      verdict: 'Pass', severity: SEV.MINOR,
      howToFix: 'No action required.'
    });
  }

  return findings;
}

/* ================================================================
   ENGINE 3: COLOUR CONTRAST (SC 1.4.3, SC 1.4.6, SC 1.4.11)
================================================================ */

function auditColourContrast() {
  const findings = [];

  const textEls = Array.from(document.querySelectorAll('*')).filter(el => {
    if (['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG','PATH'].includes(el.tagName)) return false;
    const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (!hasText) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity) === 0) return false;
    return true;
  }).slice(0, 200);

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
        id: generateId(), engine: 'Colour Contrast', element: describeEl(el),
        criterion: `WCAG 2.2 SC 1.4.3 Contrast Minimum (Level AA) — ${levelLabel}`,
        issue: `Contrast ratio of ${ratio.toFixed(2)}:1 fails the Level AA minimum of ${requiredAA}:1 for ${levelLabel}.`,
        computed: `${ratio.toFixed(2)}:1 (foreground: ${cs.color}, background: rgb(${bg.r},${bg.g},${bg.b}))`,
        required: `Minimum ${requiredAA}:1 for ${levelLabel} at Level AA`,
        verdict: 'Fail', severity: ratio < 2.0 ? SEV.CRITICAL : SEV.SERIOUS,
        howToFix: `Adjust the foreground or background colour to achieve at least ${requiredAA}:1 contrast.`
      });
    } else if (ratio < requiredAAA) {
      findings.push({
        id: generateId(), engine: 'Colour Contrast', element: describeEl(el),
        criterion: `WCAG 2.2 SC 1.4.6 Contrast Enhanced (Level AAA) — ${levelLabel}`,
        issue: `Contrast ratio of ${ratio.toFixed(2)}:1 passes Level AA but fails Level AAA minimum of ${requiredAAA}:1.`,
        computed: `${ratio.toFixed(2)}:1 (foreground: ${cs.color})`,
        required: `Minimum ${requiredAAA}:1 for ${levelLabel} at Level AAA`,
        verdict: 'Warning', severity: SEV.MODERATE,
        howToFix: `To meet Level AAA, increase contrast to at least ${requiredAAA}:1.`
      });
    }
  });

  // Non-text contrast
  const interactiveEls = Array.from(document.querySelectorAll(
    'button, input, select, textarea, [role="button"], [role="checkbox"], [role="radio"], [role="switch"]'
  )).filter(el => {
    const cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }).slice(0, 80);

  interactiveEls.forEach(el => {
    const cs          = window.getComputedStyle(el);
    const borderColor = parseColour(cs.borderColor);
    const bg          = getEffectiveBg(el.parentElement || el);
    if (!borderColor || borderColor.a === 0) return;
    const blended = blendColour(borderColor, bg);
    const ratio   = contrastRatio(blended, bg);
    if (ratio < CONTRAST.NON_TEXT) {
      findings.push({
        id: generateId(), engine: 'Colour Contrast', element: describeEl(el),
        criterion: 'WCAG 2.2 SC 1.4.11 Non-text Contrast (Level AA)',
        issue: `Interactive component border contrast ratio of ${ratio.toFixed(2)}:1 is below the required 3:1 minimum.`,
        computed: `${ratio.toFixed(2)}:1 (border: ${cs.borderColor})`,
        required: 'Minimum 3:1 for UI component boundaries',
        verdict: 'Fail', severity: SEV.SERIOUS,
        howToFix: `Increase the border colour contrast to at least 3:1. Current ratio is ${ratio.toFixed(2)}:1.`
      });
    }
  });

  return findings;
}

/* ================================================================
   ENGINE 4: HEADING STRUCTURE (SC 1.3.1, SC 2.4.6)
================================================================ */

function auditHeadingStructure() {
  const findings = [];
  const headings = Array.from(document.querySelectorAll(
    'h1,h2,h3,h4,h5,h6,[role="heading"]'
  )).filter(el => {
    const cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  });

  if (headings.length === 0) {
    findings.push({
      id: generateId(), engine: 'Heading Structure', element: 'Page',
      criterion: 'WCAG 2.2 SC 1.3.1 Info and Relationships (Level A) and SC 2.4.6 Headings and Labels (Level AA)',
      issue: 'No heading elements found on this page.',
      computed: '0 headings found',
      required: 'At least one heading to identify the main content',
      verdict: 'Fail', severity: SEV.SERIOUS,
      howToFix: 'Add a descriptive H1 heading that identifies the page.'
    });
    return findings;
  }

  const h1s = headings.filter(h => h.tagName === 'H1' || (h.getAttribute('role') === 'heading' && h.getAttribute('aria-level') === '1'));
  if (h1s.length === 0) {
    findings.push({
      id: generateId(), engine: 'Heading Structure', element: 'Page',
      criterion: 'WCAG 2.2 SC 2.4.6 Headings and Labels (Level AA)',
      issue: 'No H1 heading found.',
      computed: '0 H1 headings',
      required: 'One H1 heading per page',
      verdict: 'Fail', severity: SEV.SERIOUS,
      howToFix: 'Add an H1 heading that clearly describes the page.'
    });
  } else if (h1s.length > 1) {
    findings.push({
      id: generateId(), engine: 'Heading Structure', element: 'Page',
      criterion: 'WCAG 2.2 SC 2.4.6 Headings and Labels (Level AA)',
      issue: `${h1s.length} H1 headings found.`,
      computed: `${h1s.length} H1 headings`,
      required: 'One H1 heading per page',
      verdict: 'Warning', severity: SEV.MODERATE,
      howToFix: 'Review whether multiple H1 headings are intentional. If not, demote secondary H1 headings.'
    });
  }

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
        id: generateId(), engine: 'Heading Structure', element: describeEl(h),
        criterion: 'WCAG 2.2 SC 1.3.1 Info and Relationships (Level A)',
        issue: `Heading level skipped from H${prevLevel} to H${level}.`,
        computed: `H${prevLevel} followed by H${level}`,
        required: `H${prevLevel + 1} should appear before H${level}`,
        verdict: 'Fail', severity: SEV.MODERATE,
        howToFix: `Change this heading from H${level} to H${prevLevel + 1}, or add intermediate heading levels.`
      });
    }
    const name = getAccessibleName(h);
    if (!name || name.trim().length === 0) {
      findings.push({
        id: generateId(), engine: 'Heading Structure', element: describeEl(h),
        criterion: 'WCAG 2.2 SC 2.4.6 Headings and Labels (Level AA)',
        issue: 'Empty heading found.',
        computed: 'Heading text: empty',
        required: 'All headings must have descriptive text content',
        verdict: 'Fail', severity: SEV.SERIOUS,
        howToFix: 'Add descriptive text to this heading, or remove it if not needed.'
      });
    }
    prevLevel = level;
  });

  return findings;
}

/* ================================================================
   ENGINE 5: LANDMARK REGIONS (SC 1.3.1, SC 2.4.1)
================================================================ */

function auditLandmarks() {
  const findings = [];
  const landmarks = [];

  LANDMARK_ROLES.forEach(role => {
    document.querySelectorAll(`[role="${role}"]`).forEach(el => {
      const cs = window.getComputedStyle(el);
      if (cs.display !== 'none' && cs.visibility !== 'hidden') {
        landmarks.push({ el, role, source: 'aria' });
      }
    });
  });

  Object.entries(IMPLICIT_LANDMARKS).forEach(([tag, role]) => {
    document.querySelectorAll(tag).forEach(el => {
      const cs = window.getComputedStyle(el);
      const explicit = el.getAttribute('role');
      if (explicit) return;
      if ((tag === 'section' || tag === 'form') && !getAccessibleName(el)) return;
      if (cs.display !== 'none' && cs.visibility !== 'hidden') {
        landmarks.push({ el, role, source: 'implicit' });
      }
    });
  });

  const hasMain = landmarks.some(l => l.role === 'main');
  if (!hasMain) {
    findings.push({
      id: generateId(), engine: 'Landmark Regions', element: 'Page',
      criterion: 'WCAG 2.2 SC 1.3.6 Identify Purpose (Level AAA) and best practice for SC 2.4.1',
      issue: 'No main landmark found.',
      computed: 'No <main> element or role="main" found',
      required: 'One main landmark per page',
      verdict: 'Fail', severity: SEV.SERIOUS,
      howToFix: 'Wrap the primary page content in a <main> element.'
    });
  }

  const mains = landmarks.filter(l => l.role === 'main');
  if (mains.length > 1) {
    findings.push({
      id: generateId(), engine: 'Landmark Regions', element: 'Page',
      criterion: 'WCAG 2.2 SC 1.3.1 Info and Relationships (Level A)',
      issue: `${mains.length} main landmarks found.`,
      computed: `${mains.length} main landmarks`,
      required: 'Exactly one main landmark',
      verdict: 'Fail', severity: SEV.SERIOUS,
      howToFix: 'Remove duplicate main landmarks.'
    });
  }

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
          id: generateId(), engine: 'Landmark Regions', element: `Multiple [role="${role}"]`,
          criterion: 'WCAG 2.2 SC 1.3.1 Info and Relationships (Level A)',
          issue: `${items.length} ${role} landmarks found without unique accessible names.`,
          computed: `${items.length} ${role} landmarks, names: ${names.join(', ') || 'none'}`,
          required: 'Each landmark of the same type must have a unique accessible name',
          verdict: 'Fail', severity: SEV.MODERATE,
          howToFix: `Add a unique aria-label or aria-labelledby to each ${role} landmark.`
        });
      }
    }
  });

  const allText = Array.from(document.querySelectorAll('p, li, td, th, dt, dd, blockquote, pre, figcaption'))
    .filter(el => {
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (!el.textContent.trim()) return false;
      return !el.closest(
        'main, [role="main"], nav, [role="navigation"], header, [role="banner"], ' +
        'footer, [role="contentinfo"], aside, [role="complementary"], ' +
        'section[aria-label], section[aria-labelledby], [role="region"], [role="form"], form[aria-label]'
      );
    });

  if (allText.length > 0) {
    findings.push({
      id: generateId(), engine: 'Landmark Regions', element: 'Page',
      criterion: 'WCAG 2.2 SC 1.3.1 Info and Relationships (Level A)',
      issue: `${allText.length} text content elements found outside any landmark region.`,
      computed: `${allText.length} elements outside landmarks`,
      required: 'All meaningful content must be within a landmark region',
      verdict: 'Warning', severity: SEV.MODERATE,
      howToFix: 'Ensure all page content is wrapped in appropriate landmark elements.'
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: generateId(), engine: 'Landmark Regions', element: 'Page',
      criterion: 'WCAG 2.2 Landmark Structure',
      issue: `${landmarks.length} landmarks found. No landmark structure failures detected.`,
      computed: landmarks.map(l => `${l.role} (${l.source})`).join(', '),
      required: 'Appropriate landmark structure',
      verdict: 'Pass', severity: SEV.MINOR,
      howToFix: 'No action required.'
    });
  }

  return findings;
}

/* ================================================================
   ENGINE 6: IMAGES ALT TEXT (SC 1.1.1)
================================================================ */

function auditImages() {
  const findings = [];
  const images = Array.from(document.querySelectorAll('img, [role="img"], svg:not([aria-hidden="true"])'))
    .filter(el => {
      const cs = window.getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    });

  images.forEach(el => {
    const tag  = el.tagName.toLowerCase();

    if (tag === 'img') {
      const alt = el.getAttribute('alt');
      if (alt === null) {
        findings.push({
          id: generateId(), engine: 'Images', element: describeEl(el),
          criterion: 'WCAG 2.2 SC 1.1.1 Non-text Content (Level A)',
          issue: 'Image is missing an alt attribute entirely.',
          computed: 'alt attribute absent',
          required: 'alt="" for decorative images; descriptive alt text for informative images',
          verdict: 'Fail', severity: SEV.CRITICAL,
          howToFix: 'Add alt="" if decorative. Add descriptive alt text if informative.'
        });
      } else if (alt.trim().length === 0) {
        const src = el.src || '';
        const filename = src.split('/').pop().split('?')[0];
        findings.push({
          id: generateId(), engine: 'Images', element: describeEl(el),
          criterion: 'WCAG 2.2 SC 1.1.1 Non-text Content (Level A)',
          issue: `Image has empty alt text (alt=""). Verify this image is truly decorative. Filename: ${filename}`,
          computed: 'alt=""',
          required: 'Empty alt is correct for decorative images only',
          verdict: 'Info', severity: SEV.MINOR,
          howToFix: 'Confirm this image is decorative. If it conveys information, add descriptive alt text.'
        });
      } else {
        const altLower = alt.toLowerCase();
        const badPatterns = ['image', 'photo', 'picture', 'graphic', 'icon', 'img', '.png', '.jpg', '.gif', '.svg', '.webp'];
        const isBad = badPatterns.some(p => altLower === p || altLower.endsWith(p));
        if (isBad) {
          findings.push({
            id: generateId(), engine: 'Images', element: describeEl(el),
            criterion: 'WCAG 2.2 SC 1.1.1 Non-text Content (Level A)',
            issue: `Image alt text "${alt}" appears to be a filename or generic label.`,
            computed: `alt="${alt}"`,
            required: 'Descriptive alt text that conveys the purpose or content of the image',
            verdict: 'Fail', severity: SEV.SERIOUS,
            howToFix: 'Replace the alt text with a concise description of what the image shows.'
          });
        }
      }
    }

    if (tag === 'svg' && el.getAttribute('aria-hidden') !== 'true') {
      const name = getAccessibleName(el);
      if (!name) {
        const hasTitle = el.querySelector('title');
        if (!hasTitle) {
          findings.push({
            id: generateId(), engine: 'Images', element: describeEl(el),
            criterion: 'WCAG 2.2 SC 1.1.1 Non-text Content (Level A)',
            issue: 'SVG element is not hidden from assistive technology and has no accessible name.',
            computed: 'No <title>, aria-label, or aria-labelledby found on SVG',
            required: '<title> element as first child, or aria-label attribute, or aria-hidden="true"',
            verdict: 'Fail', severity: SEV.SERIOUS,
            howToFix: 'Add a <title> element as the first child of the SVG, or set aria-hidden="true" if decorative.'
          });
        }
      }
    }
  });

  return findings;
}

/* ================================================================
   ENGINE 7: FORM LABELS (SC 1.3.1, SC 3.3.2)
================================================================ */

function auditForms() {
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
        id: generateId(), engine: 'Forms', element: describeEl(el),
        criterion: 'WCAG 2.2 SC 1.3.1 Info and Relationships (Level A) and SC 3.3.2 Labels or Instructions (Level A)',
        issue: `Form control of type "${type}" has no accessible label.`,
        computed: 'No accessible name found',
        required: 'Every form control must have a programmatically associated accessible name',
        verdict: 'Fail', severity: SEV.CRITICAL,
        howToFix: 'Associate a <label> element using the for attribute, or use aria-label or aria-labelledby.'
      });
    }
  });

  const requiredFields = Array.from(document.querySelectorAll('[required], [aria-required="true"]'));
  requiredFields.forEach(el => {
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const hasAriaRequired = el.getAttribute('aria-required') === 'true' || el.required;
    if (!hasAriaRequired) {
      findings.push({
        id: generateId(), engine: 'Forms', element: describeEl(el),
        criterion: 'WCAG 2.2 SC 1.3.1 Info and Relationships (Level A)',
        issue: 'Field appears to be required but aria-required="true" is not set.',
        computed: 'required attribute or aria-required not confirmed',
        required: 'aria-required="true" on all required fields',
        verdict: 'Warning', severity: SEV.MODERATE,
        howToFix: 'Add aria-required="true" to all required form fields.'
      });
    }
  });

  return findings;
}

/* ================================================================
   ENGINE 8: LINKS AND BUTTONS (SC 2.4.4, SC 4.1.2)
================================================================ */

function auditLinksButtons() {
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
        id: generateId(), engine: 'Links and Buttons', element: describeEl(el),
        criterion: 'WCAG 2.2 SC 2.4.4 Link Purpose In Context (Level A) and SC 4.1.2 Name, Role, Value (Level A)',
        issue: 'Link has no accessible name.',
        computed: 'Accessible name: empty',
        required: 'All links must have an accessible name describing their purpose',
        verdict: 'Fail', severity: SEV.CRITICAL,
        howToFix: 'Add descriptive link text, or use aria-label.'
      });
    } else if (genericLinkTexts.includes(name)) {
      findings.push({
        id: generateId(), engine: 'Links and Buttons', element: describeEl(el),
        criterion: 'WCAG 2.2 SC 2.4.4 Link Purpose In Context (Level A)',
        issue: `Link text "${name}" is generic and does not describe the destination.`,
        computed: `Accessible name: "${name}"`,
        required: 'Link text must describe the destination or purpose',
        verdict: 'Fail', severity: SEV.SERIOUS,
        howToFix: `Replace "${name}" with descriptive text, or use aria-label with a full description.`
      });
    }
  });

  const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'))
    .filter(el => {
      const cs = window.getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    });

  buttons.forEach(el => {
    const name = getAccessibleName(el).trim();
    if (!name) {
      findings.push({
        id: generateId(), engine: 'Links and Buttons', element: describeEl(el),
        criterion: 'WCAG 2.2 SC 4.1.2 Name, Role, Value (Level A)',
        issue: 'Button has no accessible name.',
        computed: 'Accessible name: empty',
        required: 'All buttons must have an accessible name describing their action',
        verdict: 'Fail', severity: SEV.CRITICAL,
        howToFix: 'Add visible text inside the button, or use aria-label for icon buttons.'
      });
    }
  });

  return findings;
}
