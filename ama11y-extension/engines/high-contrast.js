/**
 * AMASAMYA Phase 2 Engine: High Contrast Simulation
 * Tests how pages render under Windows High Contrast / forced-colors mode.
 * WCAG: SC 1.4.3, SC 2.4.11
 */

function auditHighContrast() {
  const findings = [];

  // Elements that rely on background-image or background-color for meaning
  const meaningfulBgElements = Array.from(document.querySelectorAll(
    'button, a[href], input, select, textarea, [role="button"], [role="link"], ' +
    '[role="checkbox"], [role="radio"], [role="switch"], [role="tab"], ' +
    '[role="progressbar"], [role="meter"], .badge, .tag, .chip, .pill, .status, .indicator'
  )).filter(el => {
    const cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }).slice(0, 100);

  meaningfulBgElements.forEach(el => {
    const cs = window.getComputedStyle(el);

    // Check for background-image used for meaning (icons, indicators)
    const bgImage = cs.backgroundImage;
    if (bgImage && bgImage !== 'none') {
      const hasTextContent = el.textContent.trim().length > 0;
      const hasAriaLabel = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');

      if (!hasTextContent && !hasAriaLabel) {
        findings.push({
          id: generateId(), engine: 'High Contrast', element: describeEl(el),
          criterion: 'WCAG 2.2 SC 1.4.3 Contrast Minimum (Level AA) — High Contrast Mode',
          issue: 'Element uses background-image with no text fallback. In Windows High Contrast mode, background images are removed, making this element invisible or meaningless.',
          computed: `background-image: ${bgImage.slice(0, 80)}; text content: none; aria-label: none`,
          required: 'Visible text or accessible name that remains when background images are stripped',
          verdict: 'Fail', severity: SEV.SERIOUS,
          howToFix: 'Add visible text content, or use an inline SVG with currentColor instead of a background image. Ensure meaning is not conveyed by background images alone.'
        });
      }
    }

    // Check for elements using only border/background to show state (no text indicator)
    const borderStyle = cs.borderStyle;
    const borderWidth = parseFloat(cs.borderWidth) || 0;
    const bgColor = parseColour(cs.backgroundColor);
    const isInteractive = el.matches('button, a[href], input, select, textarea, [role="button"], [role="link"]');

    if (isInteractive && borderWidth === 0 && borderStyle === 'none') {
      // Interactive element with no border — in forced-colors mode, the browser
      // adds a border, but custom styling may not survive
      const outline = cs.outlineStyle;
      const outlineWidth = parseFloat(cs.outlineWidth) || 0;
      if (outline === 'none' && outlineWidth === 0) {
        findings.push({
          id: generateId(), engine: 'High Contrast', element: describeEl(el),
          criterion: 'WCAG 2.2 SC 2.4.11 Focus Appearance (Level AA) — High Contrast Mode',
          issue: 'Interactive element has no border and no outline. In forced-colors mode, custom focus indicators that rely on colour alone may not be visible.',
          computed: `border: ${borderStyle} ${borderWidth}px; outline: ${outline} ${outlineWidth}px`,
          required: 'Interactive elements must have visible boundaries that survive forced-colors mode',
          verdict: 'Warning', severity: SEV.MODERATE,
          howToFix: 'Add a visible border to interactive elements, or use transparent borders that become visible in forced-colors mode: border: 2px solid transparent.'
        });
      }
    }
  });

  // Check for custom checkboxes/radios that hide the native input
  const customControls = Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]')).filter(el => {
    const cs = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    // Detect visually hidden native inputs (common pattern for custom styled controls)
    return (cs.opacity === '0' || cs.position === 'absolute' && (rect.width <= 1 || rect.height <= 1) ||
            cs.clip === 'rect(0px, 0px, 0px, 0px)');
  });

  if (customControls.length > 0) {
    findings.push({
      id: generateId(), engine: 'High Contrast', element: `${customControls.length} custom controls`,
      criterion: 'WCAG 2.2 SC 1.4.3 Contrast Minimum (Level AA) — High Contrast Mode',
      issue: `${customControls.length} visually hidden native checkbox/radio inputs found (likely replaced with CSS-styled custom controls). Custom styled form controls may lose their visual state indicators in Windows High Contrast mode.`,
      computed: `${customControls.length} hidden native inputs with custom visual replacements`,
      required: 'Custom controls must remain operable and visually distinguishable in forced-colors mode',
      verdict: 'Warning', severity: SEV.SERIOUS,
      howToFix: 'Test custom form controls in Windows High Contrast mode. Use the forced-colors media query to provide fallback styles: @media (forced-colors: active) { /* fallback styles */ }.'
    });
  }

  // Check for colour-only status indicators
  const statusElements = Array.from(document.querySelectorAll(
    '[class*="status"], [class*="badge"], [class*="indicator"], [class*="dot"], [class*="signal"], ' +
    '[class*="alert"], [class*="warning"], [class*="error"], [class*="success"], [class*="info"]'
  )).filter(el => {
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    // Check if it has minimal text and relies on colour
    const text = el.textContent.trim();
    return text.length === 0 || text.length <= 2; // likely a colour dot or icon
  }).slice(0, 30);

  statusElements.forEach(el => {
    findings.push({
      id: generateId(), engine: 'High Contrast', element: describeEl(el),
      criterion: 'WCAG 2.2 SC 1.4.1 Use of Color (Level A) — High Contrast Mode',
      issue: 'Status indicator element appears to rely primarily on colour. In forced-colors mode, background colours are overridden and the indicator may become invisible.',
      computed: `text content: "${el.textContent.trim() || 'none'}"`,
      required: 'Status must be conveyed through text, icons, or patterns in addition to colour',
      verdict: 'Warning', severity: SEV.MODERATE,
      howToFix: 'Add visible text label, an SVG icon using currentColor, or a pattern that survives forced-colors mode.'
    });
  });

  if (findings.length === 0) {
    findings.push({
      id: generateId(), engine: 'High Contrast', element: 'Page',
      criterion: 'WCAG 2.2 SC 1.4.3 — High Contrast Mode',
      issue: 'No high contrast mode issues detected in the sampled elements.',
      computed: `${meaningfulBgElements.length} elements checked`,
      required: 'All content must remain visible and operable in forced-colors mode',
      verdict: 'Pass', severity: SEV.MINOR,
      howToFix: 'No action required. Verify manually in Windows High Contrast mode.'
    });
  }

  return findings;
}
