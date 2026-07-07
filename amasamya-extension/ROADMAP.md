# AMASAMYA Chrome Extension Roadmap

Last reviewed: 2026-07-08 (post-v4.3.0 publish).

This file captures what is committed, what is planned, and what has been
explicitly deferred. It is the single source of truth for "what is next".
If a feature is not on this list, it is not planned.

## Published: v4.0.0, v4.0.1, v4.2.0, v4.3.0

Both Live on the Chrome Web Store. v4.0.0 shipped the 24 audit
engines, three Vision AI providers, Focus Indicator Narrator,
Visual Layout Auditor, State Change Watchdog, baseline regression
detection. v4.0.1 was the internal-audit patch pass (live-region
politeness, emoji noise removal, Redundant-Entry warning flood cap,
Dragging-Movements pre-filter, Mac shortcut text, summary cards
keyboard-focusable, main landmark programmatically focusable,
minimum_chrome_version 114).

## Shipped: v4.2.0 "Site Crawl"

Published on the Chrome Web Store 2026-07-01. Manifest at 4.2.0.
SITE_CRAWL_ENABLED flipped true in background.js and panel.js.
ZIP built at `dist/amasamya-extension-v4.2.0.zip` (127 KB, 26
entries). Uploaded 2026-07-01, approved same day.

What shipped in v4.2.0 (Site Crawl core):

- Crawl queue + concurrent audit runner module
  (engines/site-crawler.js). 3 pages in parallel by default.
- Sitemap.xml parser with sitemap-index recursion, 10 s fetch
  timeout, and 200-page hard cap
  (engines/sitemap-parser.js).
- Side-panel Site Crawl tab with paste-URLs (default) and
  sitemap input modes, start/cancel, live progress, per-page
  results table.
- Background service-worker driver that hooks audit results
  from injected pages and forwards per-page records to the
  platform tab when one is open.
- Platform-side Aggregated Reports mode with per-template
  grouping and drill-down to affected pages.
- Four crawl exports: HTML grouped report, CSV by template,
  CSV by page, JSON raw.
- Crawl session metadata header (start, finish, duration,
  per-status page counts) as a definition list for
  screen-reader navigation.
- Platform import of the crawl JSON shape, routed through the
  live ingest pipeline so imported sessions behave like live
  ones.

Post-upload polish pass (folded into the same submission before
publish):

- Crawler correctness sweep. Sitemap fetches now time out after
  10 s (AbortController), reject empty 200 responses with an
  actionable error, and recurse into sitemap-index trees deeper
  (depth 5, threshold 2000 URLs). Crawler distinguishes NO_RESPONSE
  from PASS so CSP-blocked pages no longer count as clean. Waiter
  race between content-script and the background-side awaitAudit
  waiter fixed by a per-tabId pending buffer. Cancel pre-empts the
  current waiter so it feels immediate. Findings shape validated at
  the platform bridge.
- Crawler concurrency. Runs 3 pages in parallel (was strictly
  serial); real-world wall time on a 32.5 s/page workload drops to
  ~3.5 s. Concurrency is tunable via start() options for sites that
  push back on parallel hits.
- Side-panel keyboard and screen-reader sweep. Tablist arrow-key
  hint moved out of `<ul>` and into an `sr-only` paragraph so
  aria-describedby actually resolves. Focus Narrator and Visual
  Layout Auditor progress: aria-live moved from the wrapper onto the
  persistent label so updates announce reliably. Finding-detail
  toggle now announces expanded/collapsed. Settings Save/Clear
  status text stays on screen instead of wiping at 3 s. Site Crawl
  URL fields (textarea + input) wrapped in `role="application"` so
  JAWS passes arrow keys straight to the field instead of ejecting
  focus to the virtual cursor. External About link announces "opens
  in a new tab".
- Focus trap. Panel now auto-focuses the currently selected tab on
  load (Chrome leaves focus on the toolbar after activation, which
  ejected the very first Tab press). Tab and Shift+Tab wrap within
  the panel instead of leaking to browser chrome.
- Close confirmation. Header Close button and Escape both raise a
  role="dialog" aria-modal="true" confirmation with Cancel focused
  by default. Guards against accidental Escape presses. Escape
  inside the confirm dialog cancels. Escape inside editable form
  fields is untouched.

Extension ID on the store remains
`blnfmiipkccpggpinjofhhglfcgglbif`. No user action needed on
install; the Alt+Shift+1 shortcut stays bound and the panel
queries chrome.commands.getAll() at load so any user whose
Chrome dropped the binding sees the correct fallback text.

Screen-reader specifics (retained across every crawl):

- Per-page completion announcements via the polite live region
  (for example "Page 3 complete. /checkout. Audited
  successfully. 5 findings. 2.4 seconds.").
- aria-valuetext on the progress bar reads as a sentence rather
  than a bare percent.

## Shipped: v4.3.0 "Audit Diff and History"

Published on the Chrome Web Store 2026-07-08. Manifest at 4.3.0.
Two new engine modules (`engines/audit-history.js` and
`engines/audit-diff.js`), full Playwright coverage (32 new tests,
132 passing overall at publish time; 133 including the
subsequent screen-reader.js double-read regression guard). ZIP
built at `dist/amasamya-extension-v4.3.0.zip`. Uploaded 2026-07-06,
approved 2026-07-08.

What ships in v4.3.0:

- On-device history storage. Every completed audit is saved to
  `chrome.storage.local` with per-URL bucketing, a 10-audit cap
  per URL (oldest evicted first), and an 8 MB total-storage soft
  cap with automatic eviction to a 6 MB target when over.
- URL normalisation for history keys. Fragments dropped, utm_*
  and common tracker params (`gclid`, `fbclid`, `mc_cid`, etc.)
  dropped, trailing slash on non-root paths dropped. Distinct
  query-driven pages remain distinct history buckets.
- Diff engine. Identity tuple `{engine, criterion, selector}`,
  exact match. Four verdicts: New, Regressed (Pass or Warning
  became Fail), Unchanged, Resolved (identity gone from current).
  Pure module, no I/O, tests-first.
- Auto-diff. The moment a URL has 2+ audits in history, the
  panel automatically renders the Change column, the diff
  summary card ("Compared to your last audit on 2026-07-01:
  N new, N regressed, N unchanged, N resolved."), and appends
  resolved rows to the bottom of the findings table.
- Screen-reader announcements. The complete-audit polite
  announcement now trails the diff summary sentence so JAWS/NVDA
  users hear the delta without navigating to it. Row-level
  aria-labels prepend the diff verdict word so it lands before
  the row's other columns are read.
- Diff CSV export. Toolbar button labelled "Diff CSV (new +
  regressed)" appears only when a diff view is active. Writes
  only the actionable rows in a format directly consumable as
  a ticket-import CSV. Filename encodes the compared-against
  timestamp so multiple exports do not overwrite.
- History section in the side panel. Collapsed by default. Two-
  column table (When, Findings) plus a Load button per row.
  Clicking Load swaps the current view to that historical audit
  and re-runs the diff against whatever came immediately before
  it. Current row is marked distinctly.
- History management. "Clear history for this URL" and "Clear
  all AMASAMYA history" buttons inside the History section.
  History is intentionally separate from baseline and API keys;
  clearing one does not touch the others.

Non-goals in v4.3.0 (deferred to v4.4.0 or later):

- Framework selector (React / Vue / Angular / vanilla). Adds
  real per-engine rule variation. Deferred so v4.3.0 ships now.
- Baseline promotion from history (right-click a past audit and
  set it as the baseline). Simple, deferred.
- Selector normalisation for stability against `:nth-child`
  drift. Reactive, based on real crawl signal. Deferred.
- Cross-URL diff (audit URL A vs audit URL B). Rarely useful,
  deferred.
- Cloud sync of history. Violates the no-backend promise.
  Not planned.

## Next release: v4.4.0 - deferred v4.3.0 nice-to-haves

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

## v4.2.0 - "Site Crawl" (audit a whole site in one shot)

Theme: developers and managers will not audit pages one at a time.
The hybrid architecture documented below keeps the crawl on the
user's device (preserves the no-backend privacy story) while moving
aggregation into the platform so the output is manager-readable.

### Architecture (hybrid: extension crawls, platform aggregates)

The extension acquires a URL list, walks it sequentially in the user's
already-authenticated browser session, runs the 24 engines on each
page, and forwards per-page findings to the platform over the existing
`content-script-platform.js` bridge. The platform's Reports panel
ingests per-page reports into a single aggregated view.

No server-side crawl. No new backend. The privacy policy stays valid
as written. CORS is bypassed because the audit happens inside the
user's browser session, not from `amasamya.akhileshmalani.com`.

### Authentication

In scope, but passively. The extension runs in the user's existing
browser session, so any site the user is signed into on Chrome is
also signed in when the crawler walks it. The extension does not
store credentials, does not handle multi-factor, does not replay
sessions. A page that redirects to a login screen mid-crawl is
logged as "auth wall" and skipped, not retried.

### URL list source (v1 ships with two, defers the third)

1. **`sitemap.xml` ingestion** (v1): user enters the site root,
   crawler fetches `/sitemap.xml`, parses it, walks every URL listed.
   Covers most marketing and content sites.
2. **User-pasted URL list** (v1): textarea, one URL per line. The
   escape hatch when sitemap is missing, gated, or wrong.
3. **Recursive link following** (v4.2.1 or v4.3): start at one URL
   and follow internal `<a href>` links to a configurable depth.
   Deferred because cycle detection, query-string deduplication, and
   "trap" pages (infinite calendars, infinite scroll) need real
   calibration before shipping.

### Cap per run

200 pages in v1. Hard cap enforced both in code and in the UI,
never silent truncation. A 200-page crawl is roughly 7 to 13
minutes wall time. Push to 500 in v4.3 only if real users hit
the limit.

### Output

The platform's Reports panel gains an **Aggregated** mode that
groups findings by `{engine, criterion, selector pattern}` and
reports "this issue appears on N of M pages". Per-page detail
remains accessible by drilling into the group. Export formats
extend to include "by template" and "by page" views.

### Privacy implications

None. The crawl runs in the user's browser session. Findings are
forwarded to the platform via the existing content-script-platform
bridge that the user already trusts. No new data leaves the device
that does not already leave it today.

### Acceptance criteria

- Sitemap-driven crawl of a 100-page WordPress site completes
  cleanly with no hung tabs.
- Aggregated report identifies template-level issues (one finding
  per template, not 100 duplicates).
- Auth-walled pages are clearly labelled as skipped, not as Pass.
- Memory: no Chrome tab over 200 MB during a 200-page crawl.
- Cancellable mid-run with a clean partial report.

## v5.0 - "Privacy-first"

Target window: 4 to 6 weeks after v4.2 ships, assuming the
intermediate releases stabilise.

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
