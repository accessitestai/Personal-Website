/**
 * AMASAMYA Phase 2 Engine: DOM Order Audit
 * Compares visual rendering order with DOM source order.
 * WCAG: SC 1.3.2 (Meaningful Sequence)
 */

function auditDomOrder() {
  const findings = [];

  // Check for CSS order property usage (flexbox/grid reordering)
  const allElements = Array.from(document.querySelectorAll('*')).filter(el => {
    const cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }).slice(0, 500);

  const reorderedElements = [];

  allElements.forEach(el => {
    const cs = window.getComputedStyle(el);
    const order = parseInt(cs.order);

    // Detect explicit CSS order property (non-zero means reordering)
    if (!isNaN(order) && order !== 0) {
      reorderedElements.push(el);
      findings.push({
        id: generateId(), engine: 'DOM Order', element: describeEl(el),
        criterion: 'WCAG 2.2 SC 1.3.2 Meaningful Sequence (Level A)',
        issue: `Element has CSS order: ${order}. The CSS order property changes the visual position without changing the DOM order. Screen readers and keyboard navigation follow the DOM order, which may differ from the visual presentation.`,
        computed: `CSS order: ${order}; parent display: ${window.getComputedStyle(el.parentElement).display}`,
        required: 'Visual order must match DOM order, or the reading sequence must remain meaningful',
        verdict: 'Warning', severity: SEV.SERIOUS,
        howToFix: 'Rearrange the HTML source order to match the desired visual order instead of using CSS order. If reordering is necessary, verify that the DOM reading sequence still makes sense.'
      });
    }
  });

  // Check for flex-direction: row-reverse or column-reverse
  allElements.forEach(el => {
    const cs = window.getComputedStyle(el);
    const display = cs.display;
    const flexDir = cs.flexDirection;

    if ((display === 'flex' || display === 'inline-flex') &&
        (flexDir === 'row-reverse' || flexDir === 'column-reverse')) {
      const children = Array.from(el.children).filter(child => {
        const childCs = window.getComputedStyle(child);
        return childCs.display !== 'none' && childCs.visibility !== 'hidden';
      });

      if (children.length > 1) {
        findings.push({
          id: generateId(), engine: 'DOM Order', element: describeEl(el),
          criterion: 'WCAG 2.2 SC 1.3.2 Meaningful Sequence (Level A)',
          issue: `Flex container uses ${flexDir}. This reverses the visual order of ${children.length} child elements without changing the DOM order. Screen readers read in DOM order, which is the reverse of what is visually displayed.`,
          computed: `display: ${display}; flex-direction: ${flexDir}; ${children.length} visible children`,
          required: 'Visual reading order must match DOM order for meaningful content',
          verdict: 'Warning', severity: SEV.SERIOUS,
          howToFix: `Rearrange the HTML source order and use flex-direction: ${flexDir === 'row-reverse' ? 'row' : 'column'} instead. If reverse order is intentional, verify screen reader reading order is still logical.`
        });
      }
    }
  });

  // Check for grid elements with explicit placement that may create non-sequential reading
  const gridContainers = allElements.filter(el => {
    const cs = window.getComputedStyle(el);
    return cs.display === 'grid' || cs.display === 'inline-grid';
  });

  gridContainers.forEach(container => {
    const children = Array.from(container.children).filter(child => {
      const cs = window.getComputedStyle(child);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    });

    const placedChildren = children.filter(child => {
      const cs = window.getComputedStyle(child);
      const row = cs.gridRowStart;
      const col = cs.gridColumnStart;
      // Check if explicitly placed (not auto)
      return (row && row !== 'auto') || (col && col !== 'auto');
    });

    if (placedChildren.length > 1) {
      // Check if visual order matches DOM order
      const visualOrder = children.slice().sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        // Sort top-to-bottom, then left-to-right
        if (Math.abs(rectA.top - rectB.top) > 5) return rectA.top - rectB.top;
        return rectA.left - rectB.left;
      });

      let orderMismatch = false;
      for (let i = 0; i < children.length; i++) {
        if (children[i] !== visualOrder[i]) {
          orderMismatch = true;
          break;
        }
      }

      if (orderMismatch) {
        findings.push({
          id: generateId(), engine: 'DOM Order', element: describeEl(container),
          criterion: 'WCAG 2.2 SC 1.3.2 Meaningful Sequence (Level A)',
          issue: `Grid container has ${placedChildren.length} explicitly placed children whose visual order differs from DOM order. Screen readers follow DOM order, which may not match the visual layout.`,
          computed: `display: grid; ${placedChildren.length} explicitly placed items; visual order differs from DOM order`,
          required: 'Grid item visual order should match DOM order for meaningful reading sequence',
          verdict: 'Warning', severity: SEV.SERIOUS,
          howToFix: 'Rearrange the HTML source order to match the intended visual reading order, or verify that the DOM order still provides a meaningful sequence.'
        });
      }
    }
  });

  // Check for position: absolute/fixed elements that may appear in a different visual location
  const positionedElements = allElements.filter(el => {
    const cs = window.getComputedStyle(el);
    return (cs.position === 'absolute' || cs.position === 'fixed') &&
           el.textContent.trim().length > 0 &&
           el.getAttribute('aria-hidden') !== 'true';
  }).slice(0, 30);

  // Check if positioned elements appear visually before their DOM position
  positionedElements.forEach(el => {
    const cs = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    // Skip elements that are clearly off-screen (likely skip links or hidden content)
    if (rect.top < -100 || rect.left < -100) return;

    // Check if element appears at the top of the page but is late in the DOM
    const allBodyChildren = Array.from(document.body.querySelectorAll('*'));
    const domIndex = allBodyChildren.indexOf(el);
    const totalElements = allBodyChildren.length;
    const domPosition = domIndex / totalElements; // 0 = start, 1 = end

    // Element is visually at top (first 20% of viewport) but late in DOM (last 50%)
    if (rect.top < window.innerHeight * 0.2 && domPosition > 0.5) {
      findings.push({
        id: generateId(), engine: 'DOM Order', element: describeEl(el),
        criterion: 'WCAG 2.2 SC 1.3.2 Meaningful Sequence (Level A)',
        issue: 'Positioned element appears visually near the top of the page but is located late in the DOM. Screen readers will encounter this content much later than a sighted user would.',
        computed: `position: ${cs.position}; visual top: ${Math.round(rect.top)}px; DOM position: ${Math.round(domPosition * 100)}%`,
        required: 'Positioned content should appear in a meaningful location within the DOM reading order',
        verdict: 'Warning', severity: SEV.MODERATE,
        howToFix: 'Move the element earlier in the DOM so its reading order matches its visual position, or use aria-flowto to suggest a reading order.'
      });
    }
  });

  // Check for tabindex that creates non-sequential tab order
  const tabbableElements = Array.from(document.querySelectorAll('[tabindex]')).filter(el => {
    const ti = parseInt(el.getAttribute('tabindex'));
    return !isNaN(ti) && ti > 0;
  });

  if (tabbableElements.length > 1) {
    // Sort by tabindex value and check if the resulting order makes visual sense
    const sorted = tabbableElements.slice().sort((a, b) => {
      return parseInt(a.getAttribute('tabindex')) - parseInt(b.getAttribute('tabindex'));
    });

    findings.push({
      id: generateId(), engine: 'DOM Order', element: 'Page',
      criterion: 'WCAG 2.2 SC 1.3.2 Meaningful Sequence (Level A) and SC 2.4.3 Focus Order (Level A)',
      issue: `${tabbableElements.length} elements with positive tabindex values create a custom tab order that may not match the visual reading sequence.`,
      computed: `Elements with positive tabindex: ${tabbableElements.map(el => `${describeEl(el)} [tabindex=${el.getAttribute('tabindex')}]`).join('; ')}`,
      required: 'Tab order must follow a logical, visually meaningful sequence',
      verdict: 'Fail', severity: SEV.SERIOUS,
      howToFix: 'Remove positive tabindex values. Use tabindex="0" and arrange elements in the correct DOM order instead.'
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: generateId(), engine: 'DOM Order', element: 'Page',
      criterion: 'WCAG 2.2 SC 1.3.2 Meaningful Sequence (Level A)',
      issue: 'No DOM order discrepancies detected. Visual order appears to match DOM reading order.',
      computed: `${allElements.length} elements checked for order properties, flex-reverse, grid placement, and positioning`,
      required: 'Visual order must match DOM reading order',
      verdict: 'Pass', severity: SEV.MINOR,
      howToFix: 'No action required.'
    });
  }

  return findings;
}
