# AMASAMYA Chrome Extension Roadmap

Last reviewed: 2026-06-04.

This file captures what is committed, what is planned, and what has been
explicitly deferred. It is the single source of truth for "what is next".
If a feature is not on this list, it is not planned.

## Current release: v3.4.2 (Published)

Shipping with 19 WCAG 2.2 audit engines, three Vision AI providers
(Gemini, Anthropic, OpenAI), Focus Indicator Narrator, Visual Layout
Auditor, State Change Watchdog, baseline regression detection,
side-panel UI with Close button + Escape-key focus trap +
restricted-URL guard, and exports to JSON, HTML, CSV, Text, SARIF,
and annotated PNG. Privacy policy rewritten to satisfy Chrome Web
Store per-category disclosure requirements.

Status: Published on the Chrome Web Store; no open reviewer issues.

## In development: v4.0.0

The five new engines below are now wired into content-script.js.
Engine count moves from 19 to 24.

## v4.0 - "Coverage and continuity"

Target window: 4 to 6 weeks after v3.4.1 reaches stable on the Chrome
Web Store. Theme is broader WCAG 2.2 coverage plus the regression-tracking
workflow that beta testers have asked for.

### v4.0 - Item 1: Five new WCAG 2.2 audit engines

Brings the engine count from 19 to 24. Each engine ships with a header
comment that links to the WCAG SC, a fixture page under
`test-fixtures/`, and a Playwright test that confirms expected fail and
pass cases.

| # | Engine | WCAG SC | Level | Notes |
|---|---|---|---|---|
| 20 | Identify Input Purpose | 1.3.5 | AA | Checks `autocomplete` tokens on form fields against the WCAG-listed set of 53 input-purpose tokens. |
| 21 | Dragging Movements | 2.5.7 | AA | Flags elements with `pointerdown` plus `pointermove` handlers that have no equivalent single-pointer activation. |
| 22 | Consistent Help | 3.2.6 | A | Detects help mechanisms (contact link, help link, chat widget, FAQ) and checks they appear in the same relative order across pages of the same site. Requires a multi-page audit context (see v4.0 - Item 2). |
| 23 | Redundant Entry | 3.3.7 | A | Detects forms in a multi-step flow that ask for information the user has already provided, without an auto-populate or auto-select control. |
| 24 | Accessible Authentication (Minimum) | 3.3.8 | AA | Flags authentication flows that require a cognitive function test (CAPTCHA, memorise-this-pattern, transcribe-this) without an alternative. |

Engines 22, 23, 24 are partial-only. We can detect the *signal* of a
violation (presence of CAPTCHA, presence of multi-step flow) but
cannot fully judge correctness without crawling. We mark these as
**Warning** verdicts with a clear "manual review needed" note rather
than **Fail**.

### v4.0 - Item 2: Audit diff and history

Build on top of the existing baseline feature so a user can see what
changed between any two audits of the same URL.

- New side-panel section: **History**.
- Stores the last 10 audits per URL in `chrome.storage.local` (capped
  by `chrome.storage.local.QUOTA_BYTES`, currently 10 MB).
- New verdict column: **New**, **Resolved**, **Unchanged**, **Regressed**.
- Diff is computed on `{engine, criterion, selector}` as the identity tuple.
- Export: diff CSV showing only New + Regressed rows, for engineer
  ticket creation.

Screen-reader specifics:

- The History list is a single-column table, sorted newest first.
- Each row is keyboard-activatable (Enter loads that audit as the
  current view).
- The diff itself uses the same findings-table pattern as the WCAG
  audit, so existing NVDA/JAWS muscle memory carries over.

## v5.0 - "Privacy-first"

Target window: 4 to 6 weeks after v4.0 ships, assuming v4.0 stabilises.

### v5.0 - Item 1: Offline-only mode

Run Focus Indicator Narrator and Visual Layout Auditor without any
external API call.

- Bundle a CV pipeline that detects focus-ring presence, focus-ring
  contrast against the underlying pixels, and visual occlusion or
  clipping at each emulated breakpoint.
- Use OpenCV.js (or tract-onnx if the WASM size becomes a Chrome Web
  Store reviewer concern) plus a small pre-trained classifier shipped
  inside the extension.
- New setting: **Privacy mode**. When on, the extension never makes a
  network request. When off, behaviour is unchanged (Vision AI path).
- Privacy mode is the default for users who have not configured any
  Vision AI key on first run.

Acceptance criteria:

- Offline path agrees with at least one Vision AI provider on at
  least 85% of focus-indicator findings across the benchmark fixture
  set (`test-fixtures/focus-benchmark/`).
- Total ZIP size under 6 MB after WASM and model files (Chrome Web
  Store soft cap is 10 MB; below 6 MB avoids reviewer pushback).
- No telemetry of any kind in privacy mode.

This is the most architecturally invasive feature on the roadmap and
gets its own release line for that reason.

## Separate product: AMASAMYA CLI

Not part of the extension. Tracked here for visibility only.

- New repo: `accessitestai/amasamya-cli`.
- `npm install -g @amasamya/cli`.
- Wraps the same engine modules (post-refactor in v4.0 to make them
  environment-agnostic) and runs them under Puppeteer or Playwright
  against a URL list.
- Emits SARIF 2.1.0 (for GitHub Code Scanning) and JUnit XML (for
  generic CI consumers).
- Target window: after v5.0 ships, once engines are stable.

## Explicitly deferred or dropped

These were considered and are not currently planned. Recorded here so
the next person reading this file does not re-propose them.

| Item | Status | Reason |
|---|---|---|
| Screen-reader narration recorder | Dropped | Would ship "what NVDA *probably* says", which is unverifiable without a real screen reader. Shipping an approximation to a blind audience is the wrong trade. Revisit only if a real tester asks for it by name. |
| iOS / Android companion app | Deferred indefinitely | Out of scope for a desktop browser extension. |
| Self-hosted Vision AI proxy | Deferred | Solved by v5.0 offline mode instead. |
| Browser support beyond Chromium | Deferred | Firefox add-on uses a meaningfully different API surface (no `chrome.sidePanel`, different `chrome.debugger` semantics). Re-evaluate after v5.0. |

## How this file changes

Update the **Last reviewed** date at the top of the file every time
this roadmap is revisited. Move shipped items into a `## Shipped`
section at the bottom (to be created on first promotion) rather than
deleting them, so anyone reading the file can see the trajectory.
