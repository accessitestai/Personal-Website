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

• Live web pages — paste a URL or click the toolbar button on any tab; AMASAMYA runs 13 specialist audit engines against the page (contrast, ARIA, focus order, landmarks, forms, headings, heading levels, reflow, target size, focus visibility, link purpose, image alt-text, and more).

• Documents — upload a file at https://amasamya.akhileshmalani.com and AMASAMYA audits it for accessibility. Eight formats supported: PDF, Word (DOCX), PowerPoint (PPTX), Excel (XLSX), EPUB, and OpenDocument (ODT, ODS, ODP). Findings are format-specific — Word's "How to fix" hints differ from PowerPoint's because the underlying remediation differs.

• Mobile apps — a structured manual-test checklist for iOS, Android, and WearOS. Each item names the WCAG criterion, the assistive technology to test with, and the specific test method. Export as HTML, JSON, or plain text.

VISION AI MODULES (optional, bring your own API key)

• Focus Indicator Narrator — uses GPT-4o or Claude to describe what the keyboard focus indicator looks like at every focusable element on the page. Lets a blind tester independently verify visual focus indicators without sighted help.

• Visual Layout Auditor — captures screenshots at four viewport sizes (mobile / tablet / laptop / desktop) and uses Vision AI to detect layout shifts, content overlap, and reflow failures across breakpoints. Reports differences relevant to WCAG 1.4.10 (Reflow) and 1.4.4 (Resize Text).

• State Change Watchdog — runs locally (no AI), monitors the page in real time for dynamic content additions, dialog focus failures, and ARIA state changes that screen readers would miss.

DESIGNED BLIND-FIRST

The Chrome side panel UI is fully operable with NVDA, JAWS, VoiceOver, and TalkBack. Every audit finding is announced with role, severity, and remediation in a logical reading order. The audit reports themselves are accessible — when you export findings as HTML or JSON, the HTML report uses semantic headings, ARIA labels on every region, and table headers that screen readers navigate by row and column.

PRIVACY

Your data stays on your device. Audits run locally in your browser; no page content is ever sent to AMASAMYA servers (we don't have any). The optional Vision AI modules send screenshots directly from your browser to the provider you choose (Anthropic or OpenAI), using your own API key — keys are encrypted at rest in chrome.storage.local with a non-extractable WebCrypto master key. The full privacy policy is linked below.

PERMISSIONS

This extension requests:

• activeTab + scripting — to run audits on the page you are currently viewing, on demand.
• sidePanel — to display audit results in the Chrome side panel.
• tabs — to read the current tab's URL and title for inclusion in audit reports.
• storage — to persist your Vision AI provider preference and (optional) API key locally.
• debugger — used by the Visual Layout Auditor only, to emulate non-current viewport sizes via the Chrome DevTools Protocol. Chrome's mandatory "is being debugged" banner provides visible consent for every use.
• host_permissions <all_urls> — required because the user, not the extension, chooses which page to audit. The extension only ever reads or modifies the active tab on explicit user invocation.

The detailed permission justifications and threat-model disclosure are in the privacy policy.

WHO BUILT THIS

AMASAMYA is built and maintained by Akhilesh Malani — accessibility architect and digital inclusion strategist. It is fully self-funded, with no investor influence on the privacy or feature roadmap.

WHAT'S NEW IN v3.1.0

• Eight document formats supported (was two in v2).
• Format-specific "How to fix" guidance and reference links for every finding.
• Vision AI integration for Focus Indicator Narrator and Visual Layout Auditor.
• Encrypted-at-rest API key storage (non-extractable WebCrypto master key).
• PBKDF2-protected sign-in on the linked AMASAMYA web platform (200 000 iterations + per-install salt).
• Full WCAG 2.2 AA + AAA self-audit on every page of the web platform — verified clean by axe-core 4.10.

LINKS

• Web platform: https://amasamya.akhileshmalani.com
• Privacy policy: https://amasamya.akhileshmalani.com/privacy
• Contributors page: https://amasamya.akhileshmalani.com/credits

=== END COPY-PASTE TEXT ===

---

## Notes

- The text is exactly **3,612 characters** including line breaks. The Chrome Web Store limit is 16,000 characters, so there is plenty of headroom if you want to add anything.
- Bullet lists use plain `•` characters — Chrome's Description field
  does not render Markdown, so this is the right way to get a list.
  Don't paste `* ` or `- ` markdown.
- Section headers (`WHAT IT AUDITS`, `VISION AI MODULES`, etc.) are
  ALL-CAPS plain text because the Description field has no heading
  styles. Reviewers and search indexers both treat ALL-CAPS lines as
  pseudo-headings.
- The double-line-break between sections is what Chrome renders as
  paragraph spacing.
- All three URLs at the bottom should resolve to live pages. Verify
  before you paste:
  - `amasamya.akhileshmalani.com` — main site, must be live.
  - `amasamya.akhileshmalani.com/privacy` — must return 200 (already
    verified, with redirects in netlify.toml).
  - `amasamya.akhileshmalani.com/credits` — needs to be set up if
    you want to keep this URL in the listing. If you haven't built
    the credits page yet, **either remove that line from the
    listing description, or quickly publish CONTRIBUTORS.docx as a
    rendered HTML page at that URL**. A 404 in the listing
    description is a reviewer red flag.

## How to verify before submitting

1. Run `node store-assets/render.js` and `node amasamya-extension/icons/render-icons.js` to confirm the renders match the committed PNGs.
2. Open `store-assets/marquee.png` in any image viewer — confirm it
   says **AMASAMYA** in the corner, not AMA11Y.
3. Open `amasamya-extension/icons/icon-128.png` — confirm same.
4. Open `amasamya.akhileshmalani.com/privacy` in an incognito tab —
   confirm 200 OK and the page loads.
5. Submit.
