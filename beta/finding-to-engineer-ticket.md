# From AMASAMYA Finding to Engineer Ticket

Prepared for Mujtaba, May 2026.

This is a one-page template that converts a single AMASAMYA finding into a defect ticket your engineering team can act on. The template works in Jira, GitHub Issues, Azure DevOps, or any other tracker. Total reading time: about five minutes.

## The template — six fields

Every accessibility ticket has the same six fields. Copying the structure makes triage easier for the engineering team because they always know where to look.

**1. Title.** One sentence. Names the WCAG criterion, the element, and the symptom. Example: "WCAG 1.1.1 — search input has no accessible name on the homepage".

**2. WCAG reference.** The exact criterion and conformance level, plus a link to the W3C technique page. Example: `WCAG 2.2 SC 1.1.1 Non-text Content (Level A) — https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html`.

**3. Severity.** Critical, Serious, Moderate, or Minor, taken straight from the AMASAMYA finding.

**4. Where to find it.** The page URL plus the element selector from AMASAMYA's Element column. Example: `https://example.com/account/login on element <input.nw1UBF.v1zwn25>`.

**5. What is wrong (one paragraph, two or three sentences).** Plain language description of the failure mode and who is affected. Example: "The main search input on the homepage has no associated label or aria-label attribute. Screen reader users navigating with NVDA hear 'edit' with no further context when they tab into this field. The field is the primary interaction on the page; this is a complete blocker for keyboard and screen reader users."

**6. Acceptance criteria.** Two or three bullets stating what "fixed" means. Example:
- The input has either a visible `<label for="search-input">` or an `aria-label="Search products"` attribute, or both.
- NVDA on Windows announces the field's purpose when tab focus lands on it.
- The fix is verified manually with at least one screen reader before the ticket is closed.

That is the entire template. Six fields. Anyone on the engineering team can read it and know what to do.

## One worked example using a real finding from your IOB audit

Take this row from your Indian Overseas Bank audit:

```
ID:        AMASAMYA-0040
Engine:    Forms
Element:   <input.nw1UBF.v1zwn25> "Search for Products, Brands and More"
Criterion: WCAG 2.2 SC 1.3.1/3.3.2 (Level A)
Issue:     Unlabelled text control.
Computed:  No accessible name
Required:  Programmatic label
Verdict:   Fail
Severity:  Critical
How to Fix: Add <label for="">, aria-label, or aria-labelledby.
```

The engineering ticket for this becomes:

> **Title:** WCAG 1.3.1 / 3.3.2 — main search input on the homepage is unlabelled
>
> **WCAG reference:** WCAG 2.2 SC 1.3.1 Info and Relationships (Level A) plus SC 3.3.2 Labels or Instructions (Level A). W3C technique: https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html and https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html
>
> **Severity:** Critical
>
> **Where to find it:** Indian Overseas Bank net banking homepage, on element `<input class="nw1UBF v1zwn25">` near the top of the page. The element has placeholder text "Search for Products, Brands and More" but no associated label.
>
> **What is wrong:** The homepage's main search input has no associated `<label>` element, no `aria-label` attribute, and no `aria-labelledby` reference. Placeholder text is not a substitute for a label — screen readers may or may not announce placeholder text depending on the browser and the user's verbosity settings, and the placeholder disappears when the user begins typing, leaving them with no context. NVDA tab navigation announces this field as "edit" only.
>
> **Acceptance criteria:**
> - The input has either a visible `<label for="search-input">Search</label>` element preceding it, or an `aria-label="Search"` attribute on the input itself. A visible label is preferred for low-vision users and is consistent with general usability practice.
> - When a sighted-keyboard-only user tabs into the field, the visible label is clearly associated with it (either visually adjacent, or via clear focus styling).
> - When an NVDA, JAWS, or VoiceOver user tabs into the field, the screen reader announces "Search, edit, blank" (or equivalent) with the purpose of the field clearly stated.
> - Manual verification with at least one screen reader is performed before the ticket is closed.

That ticket is about four hundred words. It can be filed in any tracker. The engineering team has everything they need without needing to ask follow-up questions.

## What this template explicitly does not do

It does not include screenshots. Screen reader users do not produce or consume screenshots in their normal workflow, and many engineering teams ask for them as a habit rather than a necessity. If a sighted engineer specifically requests a screenshot, your manual tester can capture one and attach it later. Do not let the absence of a screenshot delay filing the ticket.

It does not include code. The engineering team's job is to write the fix. Your job is to specify the defect clearly enough that they cannot fix the wrong thing. Suggested code in a ticket sometimes helps and sometimes traps the engineer into a specific solution that is not optimal for their codebase.

It does not include automated-tool screenshots. The AMASAMYA finding ID is sufficient provenance — anyone who wants to verify can re-run the audit. Pasting the AMASAMYA report into a ticket as a screenshot is overkill.

## A small habit that compounds

When you triage a batch of AMASAMYA findings, group them by Engine first. All the Images-engine findings become one batch, all the Forms-engine findings another. Often the same root cause is producing multiple findings — fix the design-system component once, and ten tickets become one ticket with ten acceptance criteria. Your engineering team will appreciate this; it is the difference between forty tickets in their backlog and four.

If you find yourself unable to group, that is also fine. Some engineering teams want one ticket per defect. Adopt whatever convention your team already uses.

— Akhilesh Malani
