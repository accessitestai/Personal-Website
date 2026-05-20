# AMASAMYA - One-Page Brief for Funders

*Render as a single PDF, no logo header, plain typography. Anyone who
wants more than one page is the wrong reader for this stage.*

---

**AMASAMYA** - A blind-first WCAG 2.2 accessibility audit platform for
the web, documents, and mobile.

[https://amasamya.akhileshmalani.com](https://amasamya.akhileshmalani.com) ·
[CONTRIBUTORS.md] · [Chrome Web Store listing - pending]

## The problem

The European Accessibility Act takes effect June 2025. ADA Title II
applies to public-sector digital content. Section 508 is enforced
across US federal contractors. Yet **most accessibility audit tools
are built by sighted developers for sighted developers** - they're
hard to use without a screen reader, they cover HTML well but documents
poorly, and their findings are written in jargon that doesn't help a
non-sighted developer fix the problem.

## The product

AMASAMYA is a web-based audit platform with three engines and a Chrome
extension:

- **Web Audit** - runs 13 WCAG 2.2 engines on any URL the user provides.
- **Document Audit** - parses and audits 8 file formats (PDF, DOCX,
  PPTX, XLSX, EPUB, ODT, ODS, ODP) with format-specific findings and
  step-by-step "How to fix" hints.
- **Mobile Checklist** - structured manual-test workflow for iOS,
  Android, and WearOS.
- **Vision AI integration** - optional Focus Indicator Narrator and
  Visual Layout Auditor backed by GPT-4o or Claude (using the user's
  own API key - keys never reach our servers).

The entire UI is keyboard- and screen-reader-first. Every audit finding
is paired with a specific remediation hint and at least one
authoritative reference link.

## What's already built (as of [date])

- Full production tool, deployed at amasamya.akhileshmalani.com.
- Chrome extension submitted to the Web Store; approval pending.
- 0 axe-core violations across every served page (verified 28 April 2026).
- All test suites passing (Playwright + custom hardening tests).
- Production-grade security: PBKDF2-protected PIN auth, AES-GCM
  encryption-at-rest for AI API keys with a non-extractable WebCrypto
  master key.
- Self-funded MVP. Zero outside capital to date.

## What I'm raising

**$[2,500 / 7,500 / 20,000]** - itemised:

| Item | Amount |
|---|---|
| 8 paid beta-tester sessions ($200 each) | $1,600 |
| Accessibility tooling subscriptions (NVDA training licenses, JAWS, screen-recording, scheduling) | $400 |
| 6-week build sprint to fix top issues from beta | $5,000 |
| Reserve for grant-application fees / pilot-customer demo travel | $500 |

I am the sole user of these funds. There is no team to pay.

## Use of funds - milestones

| Week | Deliverable |
|---|---|
| 1–2 | Send 5 warm-channel beta-tester invites; hold 3 sessions; collect feedback. |
| 3 | Triage feedback into P0/P1 issue list; ship hot-fixes. |
| 4–6 | Build sprint: address top 5 tester-reported issues; ship public release. |
| 7 | Public soft-launch post; pilot-customer outreach to 10 prospective buyers. |
| 8–12 | Convert 1–2 pilots into paying contracts; report back to funders. |

## Why now

- WCAG 2.2 became the AA reference in late 2023; enterprise compliance
  upgrades are running through 2026.
- EU Accessibility Act enforcement starts June 2025.
- Vision AI (GPT-4o, Claude 4) makes affordable, accurate alt-text
  description and layout analysis newly possible - AMASAMYA is among
  the first audit tools to integrate this directly.

## The founder

**Akhilesh Malani** - accessibility architect, ~10 years in digital
inclusion strategy, previously [add 1–2 specific roles or projects].
[link to LinkedIn or homepage]

## What I'm asking from you

One of:

1. A small cheque ($1,000–$5,000), with a clear milestone-based
   reporting cadence (one written update per month for six months).
2. An introduction to one funder, accelerator, or pilot customer in
   your network.
3. A 30-minute call to tell me where I'm wrong about anything above.

If none of these fit, no need to reply. If any of them do, reply to
this email and I'll send a short due-diligence packet (financials,
test reports, deploy logs) within 24 hours.

- Akhilesh Malani
[your email] · [your phone, optional]
