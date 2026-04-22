/**
 * AMASAMYA Phase 2 Engine: Dark Mode Simulation
 * Emulates prefers-color-scheme: dark and detects contrast failures.
 * WCAG: SC 1.4.3, SC 1.4.11
 */

function auditDarkMode() {
  const findings = [];

  // Check if the page has any dark mode styles defined
  let hasDarkModeStyles = false;
  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          if (rule.conditionText && rule.conditionText.includes('prefers-color-scheme')) {
            hasDarkModeStyles = true;
            break;
          }
        }
      } catch (e) {
        // Cross-origin stylesheet — skip
      }
      if (hasDarkModeStyles) break;
    }
  } catch (e) {
    // StyleSheets not accessible
  }

  // Check for CSS custom properties that suggest theme support
  const rootStyles = window.getComputedStyle(document.documentElement);
  const hasThemeVars = ['--bg', '--background', '--text', '--fg', '--foreground', '--color-bg', '--color-text',
    '--theme', '--dark', '--light', '--surface', '--on-surface'].some(v => {
    try { return rootStyles.getPropertyValue(v).trim().length > 0; } catch (e) { return false; }
  });

  // Check data-theme or class-based theme
  const hasThemeAttr = document.documentElement.hasAttribute('data-theme') ||
    document.documentElement.classList.contains('dark') ||
    document.body.classList.contains('dark') ||
    document.body.classList.contains('dark-mode') ||
    document.documentElement.classList.contains('dark-mode');

  if (!hasDarkModeStyles && !hasThemeVars && !hasThemeAttr) {
    findings.push({
      id: generateId(), engine: 'Dark Mode', element: 'Page',
      criterion: 'WCAG 2.2 SC 1.4.3 Contrast Minimum (Level AA) — Dark Mode',
      issue: 'No dark mode support detected. The page does not appear to respond to prefers-color-scheme: dark media query, and no theme custom properties or class-based theming was found.',
      computed: 'No @media (prefers-color-scheme: dark) rules, no theme CSS custom properties, no dark mode class',
      required: 'Pages should support user colour scheme preferences for accessibility',
      verdict: 'Warning', severity: SEV.MODERATE,
      howToFix: 'Add a @media (prefers-color-scheme: dark) query with appropriate colour adjustments, or implement a class-based theme toggle.'
    });
  }

  // Check for hardcoded colours that would not adapt in dark mode
  const textElements = Array.from(document.querySelectorAll('*')).filter(el => {
    if (['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG','PATH','BR','HR'].includes(el.tagName)) return false;
    const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (!hasText) return false;
    const cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }).slice(0, 150);

  // Detect elements with inline colour styles (hardcoded, won't adapt)
  textElements.forEach(el => {
    const inlineStyle = el.getAttribute('style') || '';
    const hasInlineColor = /(?:^|;)\s*color\s*:/i.test(inlineStyle);
    const hasInlineBg = /(?:^|;)\s*background(?:-color)?\s*:/i.test(inlineStyle);

    if (hasInlineColor || hasInlineBg) {
      const cs = window.getComputedStyle(el);
      findings.push({
        id: generateId(), engine: 'Dark Mode', element: describeEl(el),
        criterion: 'WCAG 2.2 SC 1.4.3 Contrast Minimum (Level AA) — Dark Mode',
        issue: `Element has inline ${hasInlineColor ? 'color' : ''}${hasInlineColor && hasInlineBg ? ' and ' : ''}${hasInlineBg ? 'background-color' : ''} style. Inline styles override theme changes and may cause contrast failures in dark mode.`,
        computed: `Inline style: ${inlineStyle.slice(0, 100)}`,
        required: 'Colours should use CSS custom properties or classes that adapt to theme changes',
        verdict: 'Warning', severity: SEV.MODERATE,
        howToFix: 'Replace inline colour styles with CSS custom properties (e.g., color: var(--text-color)) or class-based styles that respond to dark mode.'
      });
    }
  });

  // Check for light-coloured text on light backgrounds (common dark-mode-only issue)
  // This would be a problem if dark mode is active and colours didn't properly switch
  const body = document.body;
  const bodyBg = getEffectiveBg(body);
  const isDarkBg = luminance(bodyBg) < 0.2;

  if (isDarkBg) {
    // Page appears to be in dark mode — check for contrast issues specific to dark themes
    textElements.slice(0, 100).forEach(el => {
      const cs = window.getComputedStyle(el);
      const fgRaw = parseColour(cs.color);
      if (!fgRaw) return;
      const bg = getEffectiveBg(el);
      const fg = blendColour(fgRaw, bg);
      const ratio = contrastRatio(fg, bg);
      const large = isLargeText(cs);
      const requiredAA = large ? CONTRAST.LARGE_AA : CONTRAST.NORMAL_AA;

      if (ratio < requiredAA) {
        findings.push({
          id: generateId(), engine: 'Dark Mode', element: describeEl(el),
          criterion: `WCAG 2.2 SC 1.4.3 Contrast Minimum (Level AA) — Dark Mode Active`,
          issue: `Dark mode contrast failure: ratio of ${ratio.toFixed(2)}:1 is below the ${requiredAA}:1 minimum for ${large ? 'large' : 'normal'} text.`,
          computed: `${ratio.toFixed(2)}:1 (fg: ${cs.color}, bg: rgb(${bg.r},${bg.g},${bg.b}))`,
          required: `Minimum ${requiredAA}:1 in dark mode`,
          verdict: 'Fail', severity: ratio < 2.0 ? SEV.CRITICAL : SEV.SERIOUS,
          howToFix: `Adjust dark mode colours to achieve at least ${requiredAA}:1 contrast. Light text on dark backgrounds often needs to be lighter than expected.`
        });
      }
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: generateId(), engine: 'Dark Mode', element: 'Page',
      criterion: 'WCAG 2.2 SC 1.4.3 — Dark Mode',
      issue: 'No dark mode-specific issues detected.',
      computed: `Dark mode styles detected: ${hasDarkModeStyles || hasThemeVars || hasThemeAttr}`,
      required: 'Colours must maintain sufficient contrast in dark mode',
      verdict: 'Pass', severity: SEV.MINOR,
      howToFix: 'No action required. Verify manually with prefers-color-scheme: dark enabled.'
    });
  }

  return findings;
}
