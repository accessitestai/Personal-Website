/**
 * AMASAMYA Phase 2 Engine: Text Spacing Audit
 * Applies WCAG 1.4.12 text spacing overrides and detects content clipping.
 * WCAG: SC 1.4.12
 */

function auditTextSpacing() {
  const findings = [];

  // WCAG 1.4.12 minimum text spacing values
  const SPACING = {
    lineHeight: 1.5,      // 1.5x font size
    paragraphSpacing: 2,  // 2x font size
    letterSpacing: 0.12,  // 0.12x font size
    wordSpacing: 0.16     // 0.16x font size
  };

  // Get all text-containing elements
  const textElements = Array.from(document.querySelectorAll('*')).filter(el => {
    if (['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG','PATH','BR','HR','IMG'].includes(el.tagName)) return false;
    const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (!hasText) return false;
    const cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }).slice(0, 150);

  // Record original dimensions before applying overrides
  const originalDimensions = textElements.map(el => {
    const rect = el.getBoundingClientRect();
    return {
      el,
      width: rect.width,
      height: rect.height,
      scrollWidth: el.scrollWidth,
      scrollHeight: el.scrollHeight,
      clientWidth: el.clientWidth,
      clientHeight: el.clientHeight
    };
  });

  // Check for elements with overflow:hidden that could clip text
  const overflowElements = Array.from(document.querySelectorAll('*')).filter(el => {
    const cs = window.getComputedStyle(el);
    return (cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowY === 'hidden') &&
           cs.display !== 'none' && cs.visibility !== 'hidden';
  }).slice(0, 100);

  // Apply WCAG 1.4.12 text spacing overrides temporarily
  const styleId = 'AMASAMYA-text-spacing-test';
  let existingTestStyle = document.getElementById(styleId);
  if (existingTestStyle) existingTestStyle.remove();

  const testStyle = document.createElement('style');
  testStyle.id = styleId;
  testStyle.textContent = `
    * {
      line-height: ${SPACING.lineHeight} !important;
      letter-spacing: 0.12em !important;
      word-spacing: 0.16em !important;
    }
    p, div, li, td, th, dd, dt, blockquote, figcaption, label, span {
      margin-bottom: 2em !important;
    }
  `;
  document.head.appendChild(testStyle);

  // Force reflow
  document.body.offsetHeight;

  // Check for clipping/overflow after text spacing is applied
  overflowElements.forEach(el => {
    const cs = window.getComputedStyle(el);
    const hasFixedHeight = cs.height !== 'auto' && !cs.height.includes('%');
    const hasFixedWidth = cs.width !== 'auto' && !cs.width.includes('%');
    const hasMaxHeight = cs.maxHeight !== 'none';
    const hasTextOverflow = cs.textOverflow === 'ellipsis';

    // Check if content is now clipped
    if (el.scrollHeight > el.clientHeight + 2 && (hasFixedHeight || hasMaxHeight)) {
      const clippedAmount = el.scrollHeight - el.clientHeight;
      findings.push({
        id: generateId(), engine: 'Text Spacing', element: describeEl(el),
        criterion: 'WCAG 2.2 SC 1.4.12 Text Spacing (Level AA)',
        issue: `Content is clipped after applying WCAG text spacing overrides. ${clippedAmount}px of content is hidden vertically due to overflow: hidden with a fixed height.`,
        computed: `overflow: ${cs.overflow}; height: ${cs.height}; max-height: ${cs.maxHeight}; scrollHeight: ${el.scrollHeight}px; clientHeight: ${el.clientHeight}px`,
        required: 'No loss of content or functionality when text spacing is increased to WCAG 1.4.12 minimum values',
        verdict: 'Fail', severity: SEV.SERIOUS,
        howToFix: 'Remove fixed heights or use min-height instead. Use overflow: auto or overflow: visible instead of overflow: hidden. Ensure containers can expand when text spacing increases.'
      });
    }

    if (el.scrollWidth > el.clientWidth + 2 && hasFixedWidth) {
      findings.push({
        id: generateId(), engine: 'Text Spacing', element: describeEl(el),
        criterion: 'WCAG 2.2 SC 1.4.12 Text Spacing (Level AA)',
        issue: 'Content is clipped horizontally after applying WCAG text spacing overrides.',
        computed: `overflow: ${cs.overflow}; width: ${cs.width}; scrollWidth: ${el.scrollWidth}px; clientWidth: ${el.clientWidth}px`,
        required: 'No loss of content when letter-spacing and word-spacing are increased',
        verdict: 'Fail', severity: SEV.SERIOUS,
        howToFix: 'Remove fixed widths or allow horizontal overflow. Use flexible widths that accommodate increased text spacing.'
      });
    }

    if (hasTextOverflow) {
      findings.push({
        id: generateId(), engine: 'Text Spacing', element: describeEl(el),
        criterion: 'WCAG 2.2 SC 1.4.12 Text Spacing (Level AA)',
        issue: 'Element uses text-overflow: ellipsis which may hide content when text spacing is increased.',
        computed: `text-overflow: ellipsis; overflow: ${cs.overflow}; white-space: ${cs.whiteSpace}`,
        required: 'Full text must be accessible when text spacing is increased',
        verdict: 'Warning', severity: SEV.MODERATE,
        howToFix: 'Ensure the full text is accessible through an alternative method (e.g., tooltip, expandable area). Ideally, allow the container to expand with increased text spacing.'
      });
    }
  });

  // Check for single-line containers with nowrap that would clip
  textElements.forEach(el => {
    const cs = window.getComputedStyle(el);
    if (cs.whiteSpace === 'nowrap' && (cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis')) {
      findings.push({
        id: generateId(), engine: 'Text Spacing', element: describeEl(el),
        criterion: 'WCAG 2.2 SC 1.4.12 Text Spacing (Level AA)',
        issue: 'Element uses white-space: nowrap with overflow hidden. Increased letter-spacing and word-spacing may cause text to be clipped.',
        computed: `white-space: ${cs.whiteSpace}; overflow: ${cs.overflow}; text-overflow: ${cs.textOverflow}`,
        required: 'Text must not be clipped when spacing is increased',
        verdict: 'Warning', severity: SEV.MODERATE,
        howToFix: 'Allow text wrapping where possible. Remove white-space: nowrap or ensure overflow is visible.'
      });
    }
  });

  // Remove test styles
  testStyle.remove();

  if (findings.length === 0) {
    findings.push({
      id: generateId(), engine: 'Text Spacing', element: 'Page',
      criterion: 'WCAG 2.2 SC 1.4.12 Text Spacing (Level AA)',
      issue: 'No text spacing issues detected. Content remains visible with WCAG 1.4.12 text spacing overrides applied.',
      computed: `${textElements.length} text elements and ${overflowElements.length} overflow containers checked`,
      required: 'No loss of content or functionality when text spacing is increased',
      verdict: 'Pass', severity: SEV.MINOR,
      howToFix: 'No action required. Verify manually with the Text Spacing bookmarklet.'
    });
  }

  return findings;
}
