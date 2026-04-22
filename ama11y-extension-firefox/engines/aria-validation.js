/**
 * AMASAMYA Phase 2 Engine: ARIA Validation
 * Full WAI-ARIA 1.2 attribute and role validation.
 * WCAG: SC 4.1.2 (Name, Role, Value)
 */

function auditAriaValidation() {
  const findings = [];

  // WAI-ARIA 1.2 valid roles
  const VALID_ROLES = new Set([
    // Widget roles
    'alert','alertdialog','button','checkbox','combobox','dialog','gridcell',
    'link','log','marquee','menuitem','menuitemcheckbox','menuitemradio',
    'option','progressbar','radio','scrollbar','searchbox','slider','spinbutton',
    'status','switch','tab','tabpanel','textbox','timer','tooltip','treeitem',
    // Composite widget roles
    'grid','listbox','menu','menubar','radiogroup','tablist','tree','treegrid',
    // Document structure roles
    'application','article','cell','columnheader','definition','directory','document',
    'feed','figure','group','heading','img','list','listitem','math','none','note',
    'presentation','row','rowgroup','rowheader','separator','table','term','toolbar',
    // Landmark roles
    'banner','complementary','contentinfo','form','main','navigation','region','search',
    // Live region roles
    'log','marquee','status','timer',
    // Generic role
    'generic'
  ]);

  // Roles that require specific owned elements
  const REQUIRED_OWNED = {
    'list':       ['listitem', 'group'],
    'listbox':    ['option', 'group'],
    'menu':       ['menuitem', 'menuitemcheckbox', 'menuitemradio', 'group'],
    'menubar':    ['menuitem', 'menuitemcheckbox', 'menuitemradio', 'group'],
    'radiogroup': ['radio'],
    'tablist':    ['tab'],
    'tree':       ['treeitem', 'group'],
    'treegrid':   ['row', 'rowgroup'],
    'grid':       ['row', 'rowgroup'],
    'table':      ['row', 'rowgroup'],
    'rowgroup':   ['row'],
    'row':        ['cell', 'columnheader', 'gridcell', 'rowheader']
  };

  // Roles that require a specific context (parent role)
  const REQUIRED_CONTEXT = {
    'listitem':         ['list', 'group'],
    'option':           ['listbox', 'group'],
    'menuitem':         ['menu', 'menubar', 'group'],
    'menuitemcheckbox': ['menu', 'menubar', 'group'],
    'menuitemradio':    ['menu', 'menubar', 'group'],
    'tab':              ['tablist'],
    'treeitem':         ['tree', 'group'],
    'row':              ['grid', 'treegrid', 'table', 'rowgroup'],
    'cell':             ['row'],
    'columnheader':     ['row'],
    'gridcell':         ['row'],
    'rowheader':        ['row']
  };

  // Valid ARIA states and properties
  const VALID_ARIA_ATTRS = new Set([
    'aria-activedescendant','aria-atomic','aria-autocomplete','aria-braillelabel',
    'aria-brailleroledescription','aria-busy','aria-checked','aria-colcount',
    'aria-colindex','aria-colindextext','aria-colspan','aria-controls',
    'aria-current','aria-describedby','aria-description','aria-details',
    'aria-disabled','aria-dropeffect','aria-errormessage','aria-expanded',
    'aria-flowto','aria-grabbed','aria-haspopup','aria-hidden','aria-invalid',
    'aria-keyshortcuts','aria-label','aria-labelledby','aria-level','aria-live',
    'aria-modal','aria-multiline','aria-multiselectable','aria-orientation',
    'aria-owns','aria-placeholder','aria-posinset','aria-pressed','aria-readonly',
    'aria-relevant','aria-required','aria-roledescription','aria-rowcount',
    'aria-rowindex','aria-rowindextext','aria-rowspan','aria-selected',
    'aria-setsize','aria-sort','aria-valuemax','aria-valuemin','aria-valuenow',
    'aria-valuetext'
  ]);

  // Boolean ARIA attributes (must be "true" or "false")
  const BOOLEAN_ARIA = new Set([
    'aria-atomic','aria-busy','aria-disabled','aria-grabbed','aria-hidden',
    'aria-modal','aria-multiline','aria-multiselectable','aria-readonly',
    'aria-required'
  ]);

  // Tristate attributes (true, false, mixed)
  const TRISTATE_ARIA = new Set(['aria-checked','aria-pressed']);

  // Deprecated ARIA attributes
  const DEPRECATED_ARIA = new Set(['aria-dropeffect','aria-grabbed']);

  // Get all elements with ARIA attributes or roles
  const ariaElements = Array.from(document.querySelectorAll(
    '[role], [aria-label], [aria-labelledby], [aria-describedby], [aria-hidden], ' +
    '[aria-expanded], [aria-checked], [aria-pressed], [aria-selected], [aria-live], ' +
    '[aria-controls], [aria-owns], [aria-haspopup], [aria-required], [aria-invalid], ' +
    '[aria-disabled], [aria-current], [aria-modal], [aria-valuemin], [aria-valuemax], ' +
    '[aria-valuenow], [aria-valuetext], [aria-orientation], [aria-autocomplete], ' +
    '[aria-activedescendant], [aria-busy], [aria-level], [aria-multiline], ' +
    '[aria-multiselectable], [aria-placeholder], [aria-readonly], [aria-roledescription], ' +
    '[aria-sort], [aria-colcount], [aria-colindex], [aria-colspan], [aria-rowcount], ' +
    '[aria-rowindex], [aria-rowspan], [aria-posinset], [aria-setsize], [aria-errormessage], ' +
    '[aria-keyshortcuts], [aria-flowto], [aria-details], [aria-description], [aria-atomic], ' +
    '[aria-relevant]'
  )).filter(el => {
    const cs = window.getComputedStyle(el);
    return cs.display !== 'none';
  }).slice(0, 200);

  ariaElements.forEach(el => {
    const role = el.getAttribute('role');

    // 1. Validate role value
    if (role) {
      const roles = role.trim().split(/\s+/);
      roles.forEach(r => {
        if (!VALID_ROLES.has(r)) {
          findings.push({
            id: generateId(), engine: 'ARIA Validation', element: describeEl(el),
            criterion: 'WCAG 2.2 SC 4.1.2 Name, Role, Value (Level A)',
            issue: `Invalid ARIA role "${r}". This role is not defined in WAI-ARIA 1.2.`,
            computed: `role="${role}"`,
            required: 'Only valid WAI-ARIA 1.2 roles may be used',
            verdict: 'Fail', severity: SEV.SERIOUS,
            howToFix: `Remove or replace the invalid role "${r}" with a valid WAI-ARIA role. Check the WAI-ARIA specification for the correct role.`
          });
        }
      });

      // 2. Check required owned elements
      const effectiveRole = roles[0];
      if (REQUIRED_OWNED[effectiveRole]) {
        const requiredRoles = REQUIRED_OWNED[effectiveRole];
        const children = Array.from(el.querySelectorAll('[role]'));
        const ownedViaAria = (el.getAttribute('aria-owns') || '').split(/\s+/)
          .map(id => document.getElementById(id)).filter(Boolean);
        const allOwned = [...children, ...ownedViaAria];

        const hasRequiredChild = allOwned.some(child => {
          const childRole = child.getAttribute('role');
          return childRole && requiredRoles.includes(childRole);
        });

        // Also check implicit roles from HTML elements
        const hasImplicitChild = (() => {
          if (effectiveRole === 'list') return el.querySelector('li') !== null;
          if (effectiveRole === 'table') return el.querySelector('tr') !== null;
          if (effectiveRole === 'row') return el.querySelector('td, th') !== null;
          return false;
        })();

        if (!hasRequiredChild && !hasImplicitChild && el.children.length > 0) {
          findings.push({
            id: generateId(), engine: 'ARIA Validation', element: describeEl(el),
            criterion: 'WCAG 2.2 SC 4.1.2 Name, Role, Value (Level A)',
            issue: `Element with role="${effectiveRole}" does not contain required owned elements with role: ${requiredRoles.join(', ')}.`,
            computed: `role="${effectiveRole}"; children roles: ${children.map(c => c.getAttribute('role')).filter(Boolean).join(', ') || 'none'}`,
            required: `role="${effectiveRole}" must contain elements with role: ${requiredRoles.join(' or ')}`,
            verdict: 'Fail', severity: SEV.SERIOUS,
            howToFix: `Add the required child role(s) (${requiredRoles.join(', ')}) inside this ${effectiveRole} container.`
          });
        }
      }

      // 3. Check required context (parent role)
      if (REQUIRED_CONTEXT[effectiveRole]) {
        const requiredParents = REQUIRED_CONTEXT[effectiveRole];
        let parentEl = el.parentElement;
        let hasRequiredParent = false;

        // Walk up to find a parent with one of the required roles
        while (parentEl && parentEl !== document.body) {
          const parentRole = parentEl.getAttribute('role');
          if (parentRole && requiredParents.includes(parentRole)) {
            hasRequiredParent = true;
            break;
          }
          // Check implicit roles
          const tag = parentEl.tagName.toLowerCase();
          if (effectiveRole === 'listitem' && (tag === 'ul' || tag === 'ol')) { hasRequiredParent = true; break; }
          if (effectiveRole === 'row' && (tag === 'table' || tag === 'thead' || tag === 'tbody' || tag === 'tfoot')) { hasRequiredParent = true; break; }
          if ((effectiveRole === 'cell' || effectiveRole === 'columnheader' || effectiveRole === 'rowheader') && tag === 'tr') { hasRequiredParent = true; break; }

          // Check aria-owns from other elements
          const owningEl = document.querySelector(`[aria-owns~="${el.id}"]`);
          if (owningEl) {
            const ownerRole = owningEl.getAttribute('role');
            if (ownerRole && requiredParents.includes(ownerRole)) {
              hasRequiredParent = true;
              break;
            }
          }

          parentEl = parentEl.parentElement;
        }

        if (!hasRequiredParent) {
          findings.push({
            id: generateId(), engine: 'ARIA Validation', element: describeEl(el),
            criterion: 'WCAG 2.2 SC 4.1.2 Name, Role, Value (Level A)',
            issue: `Element with role="${effectiveRole}" is not contained within a required parent role: ${requiredParents.join(', ')}.`,
            computed: `role="${effectiveRole}"; parent roles: none matching`,
            required: `role="${effectiveRole}" must be inside an element with role: ${requiredParents.join(' or ')}`,
            verdict: 'Fail', severity: SEV.SERIOUS,
            howToFix: `Ensure this element is a child of (or owned via aria-owns by) an element with role="${requiredParents[0]}".`
          });
        }
      }

      // 4. Check for conflicting role + native semantics
      const tag = el.tagName.toLowerCase();
      const conflicts = {
        'a[href]': ['button'], // link becoming button
        'button': ['link'],
        'input[type="checkbox"]': ['switch'], // valid but worth noting
        'h1,h2,h3,h4,h5,h6': ['button', 'link', 'tab'] // heading with interactive role
      };
    }

    // 5. Validate all ARIA attribute names and values
    const attrs = Array.from(el.attributes);
    attrs.forEach(attr => {
      if (!attr.name.startsWith('aria-')) return;

      // Check if attribute name is valid
      if (!VALID_ARIA_ATTRS.has(attr.name)) {
        findings.push({
          id: generateId(), engine: 'ARIA Validation', element: describeEl(el),
          criterion: 'WCAG 2.2 SC 4.1.2 Name, Role, Value (Level A)',
          issue: `Invalid ARIA attribute "${attr.name}". This attribute is not defined in WAI-ARIA 1.2.`,
          computed: `${attr.name}="${attr.value}"`,
          required: 'Only valid WAI-ARIA attributes may be used',
          verdict: 'Fail', severity: SEV.MODERATE,
          howToFix: `Remove or replace "${attr.name}" with a valid ARIA attribute. Check for typos.`
        });
        return;
      }

      // Check deprecated attributes
      if (DEPRECATED_ARIA.has(attr.name)) {
        findings.push({
          id: generateId(), engine: 'ARIA Validation', element: describeEl(el),
          criterion: 'WCAG 2.2 SC 4.1.2 Name, Role, Value (Level A)',
          issue: `Deprecated ARIA attribute "${attr.name}" found. This attribute is deprecated in WAI-ARIA 1.2.`,
          computed: `${attr.name}="${attr.value}"`,
          required: 'Avoid deprecated ARIA attributes',
          verdict: 'Warning', severity: SEV.MINOR,
          howToFix: `Remove "${attr.name}" and use alternative approaches as specified in WAI-ARIA 1.2.`
        });
      }

      // Validate boolean attribute values
      if (BOOLEAN_ARIA.has(attr.name)) {
        if (attr.value !== 'true' && attr.value !== 'false') {
          findings.push({
            id: generateId(), engine: 'ARIA Validation', element: describeEl(el),
            criterion: 'WCAG 2.2 SC 4.1.2 Name, Role, Value (Level A)',
            issue: `ARIA attribute "${attr.name}" has invalid value "${attr.value}". Must be "true" or "false".`,
            computed: `${attr.name}="${attr.value}"`,
            required: 'Value must be "true" or "false"',
            verdict: 'Fail', severity: SEV.MODERATE,
            howToFix: `Set ${attr.name} to either "true" or "false".`
          });
        }
      }

      // Validate tristate attribute values
      if (TRISTATE_ARIA.has(attr.name)) {
        if (attr.value !== 'true' && attr.value !== 'false' && attr.value !== 'mixed') {
          findings.push({
            id: generateId(), engine: 'ARIA Validation', element: describeEl(el),
            criterion: 'WCAG 2.2 SC 4.1.2 Name, Role, Value (Level A)',
            issue: `ARIA attribute "${attr.name}" has invalid value "${attr.value}". Must be "true", "false", or "mixed".`,
            computed: `${attr.name}="${attr.value}"`,
            required: 'Value must be "true", "false", or "mixed"',
            verdict: 'Fail', severity: SEV.MODERATE,
            howToFix: `Set ${attr.name} to "true", "false", or "mixed".`
          });
        }
      }

      // Validate ID references
      if (['aria-labelledby','aria-describedby','aria-controls','aria-owns','aria-flowto',
           'aria-activedescendant','aria-details','aria-errormessage'].includes(attr.name)) {
        const ids = attr.value.trim().split(/\s+/);
        ids.forEach(id => {
          if (id && !document.getElementById(id)) {
            findings.push({
              id: generateId(), engine: 'ARIA Validation', element: describeEl(el),
              criterion: 'WCAG 2.2 SC 4.1.2 Name, Role, Value (Level A)',
              issue: `ARIA attribute "${attr.name}" references ID "${id}" which does not exist in the document.`,
              computed: `${attr.name}="${attr.value}"`,
              required: 'ARIA ID references must point to existing elements in the document',
              verdict: 'Fail', severity: SEV.SERIOUS,
              howToFix: `Ensure an element with id="${id}" exists in the page, or update the ${attr.name} value to reference the correct element.`
            });
          }
        });
      }

      // Validate numeric attributes
      if (['aria-level','aria-posinset','aria-setsize','aria-colcount','aria-colindex',
           'aria-colspan','aria-rowcount','aria-rowindex','aria-rowspan'].includes(attr.name)) {
        const num = parseInt(attr.value);
        if (isNaN(num)) {
          findings.push({
            id: generateId(), engine: 'ARIA Validation', element: describeEl(el),
            criterion: 'WCAG 2.2 SC 4.1.2 Name, Role, Value (Level A)',
            issue: `ARIA attribute "${attr.name}" has non-numeric value "${attr.value}".`,
            computed: `${attr.name}="${attr.value}"`,
            required: 'Value must be a valid integer',
            verdict: 'Fail', severity: SEV.MODERATE,
            howToFix: `Set ${attr.name} to a valid integer value.`
          });
        }
      }
    });

    // 6. Check for aria-hidden="true" on focusable elements
    if (el.getAttribute('aria-hidden') === 'true') {
      const isFocusable = el.matches(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) || el.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');

      if (isFocusable) {
        findings.push({
          id: generateId(), engine: 'ARIA Validation', element: describeEl(el),
          criterion: 'WCAG 2.2 SC 4.1.2 Name, Role, Value (Level A)',
          issue: 'Element with aria-hidden="true" contains focusable elements. This creates a disconnect where keyboard users can focus elements that screen readers cannot see.',
          computed: 'aria-hidden="true" with focusable descendants',
          required: 'aria-hidden="true" elements must not contain focusable elements',
          verdict: 'Fail', severity: SEV.CRITICAL,
          howToFix: 'Either remove aria-hidden="true", or add tabindex="-1" to all focusable elements within this container to prevent keyboard focus.'
        });
      }
    }
  });

  // 7. Check for role="presentation" or role="none" on elements with global ARIA attributes
  const presentationElements = Array.from(document.querySelectorAll('[role="presentation"], [role="none"]'));
  presentationElements.forEach(el => {
    const globalAria = ['aria-label','aria-labelledby','aria-describedby','aria-live','aria-atomic'];
    const hasGlobal = globalAria.some(a => el.hasAttribute(a));
    if (hasGlobal) {
      findings.push({
        id: generateId(), engine: 'ARIA Validation', element: describeEl(el),
        criterion: 'WCAG 2.2 SC 4.1.2 Name, Role, Value (Level A)',
        issue: `Element with role="${el.getAttribute('role')}" has global ARIA attributes that conflict with the presentation role. The presentation role removes semantics, but global ARIA attributes add semantics back.`,
        computed: `role="${el.getAttribute('role')}"; ${globalAria.filter(a => el.hasAttribute(a)).map(a => `${a}="${el.getAttribute(a)}"`).join('; ')}`,
        required: 'Elements with role="presentation" or "none" should not have global ARIA attributes',
        verdict: 'Warning', severity: SEV.MODERATE,
        howToFix: 'Either remove the presentation/none role, or remove the conflicting ARIA attributes.'
      });
    }
  });

  if (findings.length === 0) {
    findings.push({
      id: generateId(), engine: 'ARIA Validation', element: 'Page',
      criterion: 'WCAG 2.2 SC 4.1.2 Name, Role, Value (Level A)',
      issue: 'No ARIA validation issues detected.',
      computed: `${ariaElements.length} elements with ARIA attributes checked`,
      required: 'All ARIA usage must conform to WAI-ARIA 1.2 specification',
      verdict: 'Pass', severity: SEV.MINOR,
      howToFix: 'No action required.'
    });
  }

  return findings;
}
