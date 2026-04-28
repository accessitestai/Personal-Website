# AMASAMYA Beta — Tester Brief

Thank you for agreeing to test AMASAMYA. This page tells you everything
you need before you start. Reading time: ~3 minutes.

## What AMASAMYA is

AMASAMYA is a web-based accessibility audit platform that runs WCAG 2.2
checks on:
- Live web pages (paste a URL, get findings).
- Documents you upload — PDF, Word (DOCX), PowerPoint (PPTX), Excel
  (XLSX), EPUB, OpenDocument (ODT/ODS/ODP), and legacy `.doc`.
- Mobile apps (structured manual checklist for iOS/Android/WearOS).

It is designed blind-first: the entire interface is operable with a
screen reader and keyboard, and the audit findings are written to be
useful to a non-sighted developer or content author.

## What we want from you

About **30 minutes** of your time, doing real work in the tool, and
honest feedback on what worked and what didn't.

We want to hear:
1. Friction in sign-up, sign-in, or any tab transition.
2. Anything a screen reader announces incorrectly, ambiguously, or not
   at all.
3. Any audit finding whose "How to fix" hint or reference link was
   confusing, wrong, or not useful.
4. Anything that took more than 3 keystrokes that could obviously have
   taken 1.
5. The single thing that, if we don't fix it, would stop you
   recommending the tool to a colleague.

We do **not** need:
- Typo or grammar fixes (send those separately if you spot them).
- Visual / colour-design opinions.
- Feature requests for things outside accessibility audit.

## Compensation

We'll send a **$[AMOUNT] [Amazon / Apple / direct] gift card** by email
within 7 days of receiving your feedback form, regardless of how
positive or critical it is.

If you'd prefer to be acknowledged publicly on our contributors page
instead of (or in addition to) compensation, tell us in the form.

## What to test — suggested 30-minute path

Pick a path based on what you do day-to-day. You don't need to do all of
it.

### Path 1 — Web audit (10 min)

1. Open [https://amasamya.akhileshmalani.com](https://amasamya.akhileshmalani.com).
2. Sign in with Google, or set up a PIN.
3. Go to the **Web Audit** tab.
4. Paste a URL of a site you know well. Run the audit.
5. When findings come back, navigate them with your screen reader.
6. Pick one Fail and one Warning — read the "How to fix" hint and the
   linked reference. Did they help?

### Path 2 — Document audit (10 min)

1. Sign in.
2. Open the **Documents** tab.
3. Upload any PDF, Word document, or PowerPoint deck you have lying
   around — preferably one you know has accessibility issues.
4. Read through the findings list.
5. Tell us: are the findings format-appropriate? Are the "How to fix"
   hints actionable?

### Path 3 — Vision AI features (10 min, optional)

These features need an OpenAI or Anthropic API key — your own.
We never see your key.

1. Open **AI Settings** tab.
2. Paste your OpenAI or Anthropic key. Save.
3. Go to **Live Audit** tab.
4. Run the **Focus Indicator Narrator** or **Visual Layout Auditor** on
   any page.
5. Tell us: did the AI's description match what you expected? Was it
   useful, useless, or actively misleading?

## Privacy

- AMASAMYA stores your sign-in state in your browser only. We do not
  track you or sell anything.
- API keys you paste in **AI Settings** are encrypted at rest in your
  browser and only sent to the provider you chose (OpenAI, Anthropic,
  or Google). They never reach our servers.
- Full privacy policy: [https://amasamya.akhileshmalani.com/privacy](https://amasamya.akhileshmalani.com/privacy).

## How to send feedback

Three options — pick whichever is easier:

1. **Form** (10 minutes): [link to feedback form]
2. **Email**: reply to the message that brought you here. Free-form is
   fine.
3. **30-min Zoom call**: book a slot at [calendly link] — we'll do the
   testing together, no prep needed.

## What happens after

Within 48 hours: a personal thank-you reply.

Within 2 weeks: a short follow-up listing the changes we made because of
your feedback.

If you want to be credited publicly on the contributors page, we'll
include your name and a link of your choosing (LinkedIn, blog, mastodon,
nothing). If you'd rather stay anonymous, that's the default — say so
explicitly only if you want public credit.

## Questions before you start

Reply to the email that brought you here, or message
[YOUR_EMAIL_OR_HANDLE]. I usually reply same day.

— Akhilesh Malani, AMASAMYA
