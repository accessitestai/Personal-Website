# Reading an AMASAMYA Report

Prepared for Mujtaba, May 2026. Aimed at someone using automated testing tools for the first time.

This guide explains what to look for in an AMASAMYA audit report, how to triage findings, and how to tell which findings are real and which are noise. Total reading time: about fifteen minutes.

## The shape of a report

An AMASAMYA report has ten columns: ID, Engine, Element, Criterion, Issue, Computed, Required, Verdict, Severity, How to Fix. You will see this same shape whether you read the report inside the Chrome side panel, export it as CSV, or open the exported HTML version.

The two most important columns are **Verdict** and **Severity**. Everything else describes what was checked and how to fix it.

## Verdict and Severity — read these first

Every finding has a verdict — one of four values:

- **Fail** — the criterion is definitely not met. This is the thing your engineering team needs to fix. Treat every Fail as a real defect.
- **Warning** — the criterion is possibly not met, but the tool is not certain enough to call it Fail. Often this means a heuristic flagged something that needs a human to look at. Most Warnings turn out to be real issues; some are false positives. Read the Issue column to decide.
- **Pass** — the criterion is met. These rows are confirmation that something is working. You can skim past them when triaging, but they are useful when you are writing a compliance report and need to demonstrate that you actually tested the criterion.
- **Info** — a neutral observation. Often this is a count of focusable elements, or a note that an engine did not find anything to test. Skim past unless something jumps out.

Every finding also has a severity — Critical, Serious, Moderate, or Minor.

- **Critical** — a complete blocker for some users. A button with no accessible name. A field with no label. Text that is invisible (contrast 1.0). Fix these first.
- **Serious** — a real barrier for some users but not a complete blocker. Generic alt text ("Image"). A focus indicator that has been removed but contrast is otherwise fine. Fix these next.
- **Moderate** — degrades the experience but does not block. A skipped heading level. Missing dark-mode support.
- **Minor** — usually informational. Sometimes an opinion call about whether a recommendation should be treated as a fail.

The two columns together give you a clean triage rule: **Critical Fails first, Serious Fails next, then Warnings, then the rest can wait or be considered for the next sprint**.

## The other columns

- **ID** — a row identifier like `AMASAMYA-0007`. Used when you want to refer to a specific finding in a ticket without copy-pasting the whole row.
- **Engine** — which of the seventeen audit engines produced this finding. Engines like Images, Forms, Colour Contrast, Focus Visibility. Useful for filtering: if you want to see only colour contrast issues, sort or filter by Engine.
- **Element** — a short description of the DOM element the finding is about. Example: `<button.btn-primary> "Submit"`. The format is tag name, optional class or id, and the visible label in quotes.
- **Criterion** — the WCAG 2.2 Success Criterion (SC) reference. Looks like `WCAG 2.2 SC 1.1.1 Non-text Content (Level A)`. The Level A / AA / AAA suffix tells you how strict the rule is.
- **Issue** — one sentence describing what is wrong.
- **Computed** — what the tool actually measured. Example: `outline: none 0px` for a focus visibility failure, or `Contrast 2.83:1` for a contrast failure.
- **Required** — what the criterion requires. Example: `Visible 2px+ focus indicator with 3:1 contrast`.
- **How to Fix** — a one-sentence remediation hint. This is your starting point for the engineering ticket but rarely the whole answer.

## Telling signal from noise

Some pages produce huge reports — hundreds of findings. The IOB audit you ran produced 715 findings, but only six of them were unique problems; the other 709 were duplicates of the same issue. Recognising this pattern saves you hours.

Three rules of thumb:

**Rule one — if many rows have the same Engine, the same Issue, and similar Element descriptions, treat them as a single problem.** Fix the source, and every duplicate disappears. AMASAMYA v3.3.0 onwards collapses these duplicates and notes the occurrence count inline (for example, "118 identical reuses of this icon on the page"). For reports from earlier versions, you do this deduplication by eye when reading the CSV.

**Rule two — Pass and Info rows are confirmation, not problems.** A finding that says "All interactive targets meet 24×24 CSS px minimum. Pass." is telling you something good. Do not file a ticket for these.

**Rule three — Warning rows need a human judgment.** The tool flagged something that might be wrong. Read the Issue and Computed columns and decide. If you are not sure, treat it as a Fail for documentation purposes and let the engineering team push back if they disagree.

## Where automated tools genuinely cannot help

AMASAMYA, like every automated accessibility tool, can verify roughly thirty to forty per cent of WCAG criteria. The other sixty per cent always need a human — usually a screen reader user — to test. Specifically:

- Whether a heading actually describes the section it precedes (the tool can verify that the heading exists but not whether it is meaningful).
- Whether an alt text is appropriate for the image (the tool can flag generic alt like "image" but cannot judge whether "Quarterly revenue chart" is correct or wrong for a specific image).
- Whether a form's error handling is genuinely helpful in context.
- Whether a complex widget — a date picker, a multi-select dropdown, a tree view — is actually usable with a screen reader, beyond having the correct ARIA roles.
- Whether the page works with refreshable braille displays, with voice control, or with switch-access devices.
- Whether the experience is good for users with cognitive disabilities, including reading-level appropriateness and consistency of navigation.

Your manual testing fills these gaps. AMASAMYA's job is to handle the mechanical sixty per cent so your team's manual time can go to the parts that actually need a human.

## A quick worked example

From your Indian Overseas Bank audit, after the v3.3.0 deduplication fix, the report has roughly fifteen findings instead of seven hundred. Reading them by the triage rule above:

- **Two Serious Fails on Landmarks and Heading Structure** — the page has no `<main>` element and no headings at all. This is a screen reader navigation problem. Engineering ticket priority: high.
- **Six Serious Fails on Images** — six SVG icons missing accessible names, each reused many times. One fix per icon, applied at the source SVG, fixes every reuse. Engineering ticket priority: medium-high.
- **One Moderate Warning on Dark Mode** — no `prefers-color-scheme: dark` support. Worth raising but not urgent.
- **Several Pass rows on Focus Visibility, Target Size, Text Spacing** — these are confirmation that the bank got something right. Skim past during triage; cite during compliance documentation.

So the actionable engineering output of the IOB audit is roughly eight to ten tickets, not seven hundred. That number is a real reflection of what your team needs to deliver to the engineering side, not an overwhelming wall.

## What to bring to our call

You do not need to do anything before we speak. But if you have spare time, picking one page from a product you actually care about (not necessarily the assessment portal — anything will do for practice) and running an audit on it will give us a real report to talk through during the call. Bringing your own findings to the conversation works better than walking through an abstract example.

— Akhilesh Malani
