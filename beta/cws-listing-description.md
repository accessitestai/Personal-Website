# Chrome Web Store — Listing Description

This is the long-form description text for the AMASAMYA listing.
**Paste the section between the two `=== BEGIN/END ===` markers
verbatim into the Description field on the Chrome Web Store
Developer Dashboard.**

The text below the markers is reference / commentary — do not paste
that.

---

=== BEGIN COPY-PASTE TEXT ===

AMASAMYA is a blind-first WCAG 2.2 accessibility audit tool. The whole interface is keyboard- and screen-reader-first; every audit finding includes specific remediation guidance and a link to the relevant WCAG technique.

WHAT IT AUDITS

Live web pages. Paste a URL or click the toolbar button on any tab. AMASAMYA runs a full WCAG 2.2 audit on the active page covering colour contrast, ARIA validation, focus management, structural semantics, and the broader interaction patterns the standard requires.

Documents. Upload a file at the linked AMASAMYA web platform and the tool audits its accessibility. The supported formats include PDFs, Microsoft Office files, EPUB books, and OpenDocument files. Findings are format-specific because the underlying remediation differs from one format to the next.

Mobile apps. A structured manual-test checklist for iOS, Android, and WearOS. Each item names the WCAG criterion, the assistive technology to use, and the specific test method. Reports can be exported.

VISION AI MODULES (optional, bring your own API key)

Focus Indicator Narrator. Uses a Vision AI provider you configure to describe what the keyboard focus indicator looks like at every focusable element on the page. Lets a blind tester independently verify visual focus indicators without sighted help.

Visual Layout Auditor. Captures the page at four viewport widths and uses Vision AI to detect layout shifts and reflow failures across breakpoints. Reports differences relevant to WCAG 1.4.10 Reflow and 1.4.4 Resize Text.

State Change Watchdog. Runs locally with no AI calls. Monitors the page in real time for dynamic content additions, dialog focus failures, and ARIA state changes that a screen reader user would otherwise miss.

DESIGNED BLIND-FIRST

The Chrome side panel UI is fully operable with major Windows, macOS, and Android screen readers. Every audit finding is announced with its role, severity, and remediation in a logical reading order. Exported reports use semantic headings and properly labelled regions so the report file is itself accessible.

PRIVACY

Your data stays on your device. Audits run locally in your browser. No page content is ever sent to AMASAMYA servers, because there are none. The optional Vision AI modules send screenshots directly from your browser to the provider you have chosen, using your own API key. Keys are encrypted at rest with a non-extractable WebCrypto master key and never leave your device. The full privacy policy is linked below.

PERMISSIONS

The activeTab and scripting permissions let AMASAMYA run audits on the tab you are currently viewing, on demand only.

The sidePanel permission opens the Chrome side panel where audit results are displayed.

The tabs permission reads the current tab's URL and title so reports can be labelled with the page they came from.

The storage permission persists your Vision AI provider preference and any API key you choose to enter.

The debugger permission is used only by the Visual Layout Auditor module, to emulate viewport widths via the Chrome DevTools Protocol. Chrome's mandatory "is being debugged" banner provides visible consent every time the feature runs.

The host_permissions all_urls scope is required because the user, not the extension, decides which page is audited. The extension only ever reads or modifies the active tab on explicit user invocation.

Detailed permission justifications and threat-model disclosure are in the privacy policy.

WHO BUILT THIS

AMASAMYA is built and maintained by Akhilesh Malani — accessibility architect and digital inclusion strategist. It is fully self-funded, with no investor influence on the privacy or feature roadmap.

LINKS

Web platform: https://amasamya.akhileshmalani.com
Privacy policy: https://amasamya.akhileshmalani.com/privacy
Contributors page: https://amasamya.akhileshmalani.com/credits

=== END COPY-PASTE TEXT ===

---

## What changed in this rewrite (Yellow Argon fix)

The reviewer flagged "PDF, Word (DOCX), PowerPoint (PPTX), Excel
(XLSX), EPUB, and OpenDocument (ODT, ODS, ODP)" as keyword spam. To
keep the listing safely on the right side of the policy, I also
removed every other comma-separated keyword list that a reviewer
could plausibly flag the same way:

| Old phrasing (removed) | Why it was risky | New phrasing |
|---|---|---|
| `Eight formats supported: PDF, Word (DOCX), PowerPoint (PPTX), Excel (XLSX), EPUB, and OpenDocument (ODT, ODS, ODP)` | Direct cause of the Yellow Argon rejection — long enumeration of file-format keywords, several with parenthetical aliases. | `The supported formats include PDFs, Microsoft Office files, EPUB books, and OpenDocument files.` |
| `13 specialist audit engines against the page (contrast, ARIA, focus order, landmarks, forms, headings, heading levels, reflow, target size, focus visibility, link purpose, image alt-text, and more)` | A 12-item parenthetical of WCAG-flavoured keywords. The exact pattern Chrome's policy targets. | `a full WCAG 2.2 audit … covering colour contrast, ARIA validation, focus management, structural semantics, and the broader interaction patterns the standard requires.` |
| `fully operable with NVDA, JAWS, VoiceOver, and TalkBack` | Brand-name pile-up — the four highest-volume accessibility search terms in one comma list. | `fully operable with major Windows, macOS, and Android screen readers.` |
| `Export as HTML, JSON, or plain text` | Mild but unnecessary; replaced with neutral phrasing. | `Reports can be exported.` |
| `(mobile / tablet / laptop / desktop)` | Borderline — slash-separated keyword list; removed for safety. | `at four viewport widths` |
| `WHAT'S NEW IN v3.1.0` bullet list of feature keywords | Each bullet was a feature-keyword sentence; collectively they read as a keyword roll-up. | Section deleted. Anyone who wants the changelog can read it on the linked web platform. |
| `Eight document formats supported (was two in v2)` | Same keyword pattern as the flagged sentence. | Removed with the rest of the WHAT'S NEW section. |

The description is also slightly shorter overall (~3,300 characters
vs the previous ~3,600), well within the 16,000-character limit.

## Notes

- The text uses `•` bullet points only inside section bodies that
  read naturally as a list (none in this revision) — flat prose
  paragraphs are safer than bullets for this listing.
- Section headers (`WHAT IT AUDITS`, `VISION AI MODULES`, etc.) are
  ALL-CAPS plain text because the Description field has no heading
  styles.
- The double-line-break between sections is what Chrome renders as
  paragraph spacing.
- All three URLs at the bottom should resolve to live pages. Verify
  before you paste:
  - `amasamya.akhileshmalani.com` — main site, must be live.
  - `amasamya.akhileshmalani.com/privacy` — must return 200 (already
    verified, with redirects in netlify.toml).
  - `amasamya.akhileshmalani.com/credits` — needs to exist if you
    want to keep this URL in the listing. If you haven't built the
    credits page yet, either remove that line from the listing
    description, or publish `CONTRIBUTORS.docx` as a rendered HTML
    page at that URL.

## How to verify before submitting

1. Open the .docx in Word and read the description aloud. If any
   sentence sounds like a search-engine keyword stuffing exercise,
   rewrite it as plainer prose before pasting.
2. Confirm the section between BEGIN/END markers contains no
   parenthetical keyword lists and no comma-separated brand names.
3. Paste, save draft, submit for review.

## Reply to the rejection email

When you resubmit, also reply to the Yellow Argon rejection email
with one short paragraph so the reviewer sees you addressed their
specific feedback. Suggested text:

> Thank you for the detailed rejection note. I have rewritten the
> listing description to remove the file-format enumeration that
> triggered the Yellow Argon keyword-spam flag, and I have
> proactively removed several other comma-separated keyword lists
> elsewhere in the description (the WCAG-engine enumeration and the
> screen-reader brand list) that pattern-match the same policy. The
> revised description focuses on what AMASAMYA does in plain prose
> rather than enumerating supported names. The resubmission also
> includes the corrected runtime icons (the previous build still
> rendered as "A11Y") and freshly regenerated screenshots. Please
> review at your convenience.
>
> — Akhilesh Malani
