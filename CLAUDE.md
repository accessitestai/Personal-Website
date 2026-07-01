# Working Notes for Claude

This file captures persistent preferences and project context for Claude sessions
working on this repository. Read it at the start of any session.

## About the human in this project

**Akhilesh Malani** - accessibility architect and digital inclusion strategist.
**Screen-reader user**, primarily NVDA and JAWS on Windows. Less proficient
with VoiceOver on macOS than with NVDA/JAWS on Windows.

The audience for many of the drafts I prepare (mailing-list replies, beta
tester invitations, follow-up emails) is **also the blind community**. Many
of them are screen reader users.

## Mandatory style rules

### Every instruction step I write must be screen-reader-first

This applies both to:

- **Instructions I give Akhilesh directly** in chat (how to install something,
  how to navigate a dashboard, how to verify a setting).
- **Drafts I prepare for Akhilesh to send to others** (mailing-list replies,
  emails, tester briefs).

Specifically, this means:

- **No visual locators.** Never say "look at the top-right" or "the icon
  in the corner" or "the third button from the left".
- **Use keyboard navigation language.** Tab, Shift+Tab, Enter, Space, arrow
  keys, screen-reader-specific hotkeys (H for heading in NVDA/JAWS browse
  mode, B for button, F for form field, K for link, D for landmark,
  VO + Cmd + H on VoiceOver, and so on).
- **Use direct URLs wherever possible** to bypass UI navigation entirely.
  If the destination has a deep link, give the URL instead of "navigate to X
  by clicking Y then Z".
- **Reference UI by label text and role**, not by position. Say "the button
  labelled Save" not "the Save button at the bottom of the form" - labels
  are unambiguous to a screen reader; positions are not.
- **State what the screen reader will announce** at each step where useful.
  "Your screen reader will announce 'Page loaded'." "NVDA will announce
  'button' followed by the button's label."
- **Acknowledge known accessibility quirks** of the surface being used.
  Example: Chrome's side panel sometimes does not appear in F6 cycle on the
  first press; tell the user this proactively rather than letting them
  discover it as a failure.

### Punctuation rule (immutable)

**Never use the em-dash character.** That includes the literal Unicode
em-dash (code point U+2014), the HTML named character reference for the
em-dash, and any visual approximation of it. This applies to every piece
of text I produce: chat responses, file content, code comments, commit
messages, blog posts, audit-finding copy, anywhere. Akhilesh established
this rule on 19 May 2026 after a full repo sweep removed roughly 1,800
existing em-dashes.

When the prose would naturally call for an em-dash, use one of:

- a regular hyphen with surrounding spaces ( - ),
- a comma,
- a colon,
- a full stop and a new sentence.

Pick whichever reads cleanest in context. Em-dashes do not appear in
this project, ever, going forward.

### Tone

- **Plain, direct, no marketing language.**
- **Honest about limitations and false positives.**
- **No celebratory or congratulatory framing** unless explicitly warranted by
  a real achievement. Akhilesh has flagged that "this sounds rude" feedback
  once - calibrate to warm-but-direct.
- **Brevity over comprehensiveness.** When in doubt, shorter is better.

### Modifiers Akhilesh uses

| Modifier | Meaning |
|---|---|
| `/silent` | No preamble, no commentary - give the answer directly. |

## Project context (as of this writing)

- **Personal-Website** (this repo) - akhileshmalani.com portfolio + AMASAMYA
  web platform at amasamya.akhileshmalani.com subdomain.
- **AMASAMYA Chrome extension** - published on Chrome Web Store at extension
  ID `blnfmiipkccpggpinjofhhglfcgglbif`. v4.0.0, v4.0.1, and v4.2.0
  are all Published. v4.2.0 "Site Crawl" went live on 2026-07-01
  (uploaded and approved same day). It ships the crawl queue +
  sitemap.xml parser + side-panel Site Crawl tab + platform
  Aggregated Reports + four export shapes (HTML, two CSV flavours,
  JSON) + crawl session metadata header + platform import of the
  crawl JSON shape, plus the polish pass folded in pre-approval:
  crawler correctness sweep (10 s fetch timeout, empty sitemap
  rejection, NO_RESPONSE status, waiter race fix, findings shape
  validation, deeper sitemap-index recursion), 3-page concurrent
  runner (roughly 10x faster wall time), side-panel keyboard/SR
  sweep, Site Crawl URL fields wrapped in role="application" so JAWS
  arrow keys work inside them, focus trap and auto-focus-into on
  panel open, and a role="dialog" close-confirmation on both header
  Close button and Escape. Default keyboard shortcut is Alt+Shift+1
  after Akhilesh reported JAWS table-cell command conflicts on
  Alt+Shift+Period and Alt+Shift+Comma. Side panel queries
  chrome.commands.getAll() at load and renders the actual bound
  chord. Audit diff and history is v4.3.0; offline-only Vision AI is
  v5.0. See amasamya-extension/ROADMAP.md.
- **Public source** - github.com/accessitestai/AMASAMYA (mirror of the
  extension code; MIT licence). The full Personal-Website source remains
  private at github.com/accessitestai/Personal-Website.
- **Hosting** - Netlify. Auto-deploys on push to `main`.
- **Domains** - akhileshmalani.com (root portfolio), amasamya.akhileshmalani.com
  (audit platform).

## Things to avoid

- Suggesting screenshot-driven debugging unless Akhilesh has already supplied
  the screenshot.
- Suggesting Akhilesh "look at" anything visual on a UI.
- Suggesting "pin the icon to your toolbar" or other visual-affordance tips.
- Recommending tasks that require GUI clicks when an equivalent CLI / URL /
  keyboard path exists.
- Adding emoji, decorative dashes, or visual ASCII art to any output Akhilesh
  will read with a screen reader.
- Bulk-replying with "this is great work!" - Akhilesh prefers honest
  assessment over encouragement.
