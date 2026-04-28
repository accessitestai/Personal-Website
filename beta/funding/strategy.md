# AMASAMYA Beta-Stage Funding Strategy

## Read this first — what you actually need

You don't need a venture round. You need **roughly $3,000–$10,000** to
fund a credible closed-beta and the immediate follow-on work. The right
sources for that amount are not VCs. They are:

1. **Existing warm investor contacts** — even small individual cheques
   ($1k–$5k) from 2–3 people you already know.
2. **Accessibility / disability-focused grants** — small but real;
   non-dilutive; the application window is the slow part.
3. **Pre-paid pilot customers** — agencies, gov teams, mid-size
   companies who need WCAG compliance NOW and will pay $1k–$5k for
   a 30-day pilot.
4. **Accelerators with disability-tech tracks** — small cash + program
   credits + introductions. Slower (months) but stack with the above.
5. **Open-source / community funding** — GitHub Sponsors, Open
   Collective, individual a11y community supporters. Slow trickle but
   compounding goodwill.

**Do not** pitch institutional VCs at this stage. AMASAMYA has no
revenue, no traction metrics, and no team — those three gaps make the
average VC meeting a waste of your scarcest resource (time). Save VCs
for after beta produces 3–5 case studies and 1–2 paying pilot
customers.

---

## What you're actually pitching

The pitchable story is short and specific:

> "I've built a working WCAG 2.2 audit platform that audits live URLs,
> documents in 8 file formats, and mobile-app checklists. It's
> designed blind-first — the entire interface is operable with a
> screen reader. I'm one developer, fully bootstrapped, and the
> product is production-hardened (PBKDF2-protected auth, encrypted
> API key storage, 0 axe-core violations on every page, full test
> coverage). I'm now ready for closed beta with paid sessions for
> 8 daily screen-reader users, plus follow-on bug-fix runway. I'm
> raising **$[X]** to fund honoraria, accessibility-tooling
> subscriptions, and a 6-week sprint to public launch. Use of funds
> is itemised. Milestones are in the next bullet."

That's the elevator pitch. Memorise it. Customise the bracket. Don't
embellish.

## What's actually pitchable (your unique angles)

You have three genuine differentiators. Lead with whichever fits the
audience.

| Angle | Use with |
|---|---|
| **Blind-first design** — most a11y tools are built by sighted devs for sighted devs to "check a box". Your tool was usable by a screen reader from commit one. | Disability-focused funders, accessibility-pro investors, NFB / RNIB intros. |
| **Format coverage breadth** — PDF, DOCX, PPTX, XLSX, EPUB, ODT/ODS/ODP. Most competitors do PDF + HTML and stop. | Pilot customers (especially gov, education, publishing). |
| **Capital efficiency** — solo dev, fully self-funded MVP, production hardening already done. Small cheque now → real beta in 30 days. | Angel investors, micro-VCs, founder-friendly individuals. |

## What you're NOT pitching

Be explicit, internally and externally, about what's *not* on offer:

- ❌ A multi-million-dollar ARR projection. You don't have data for one.
- ❌ A team. You're solo and that's fine for this stage.
- ❌ A defensible moat against Deque / axe / Pope Tech. Your moat is
   the blind-first angle and the format coverage, not patents.
- ❌ An IPO trajectory. Don't even hint at one.

Pretending to have these will get you laughed out of the room by
sophisticated investors and will burn the warm contacts you do have.

## Numbers — what to actually ask for

Pick the row that matches your runway need. **Be specific.** "I need
funding to grow the business" gets ignored. "I need $4,200 — $1,600 for
8 tester honoraria, $400 for tooling, $2,000 for a 6-week build sprint
on the top 5 issues testers will surface — and I'll close the round
within 30 days" gets a meeting.

| Tier | Amount | What it funds | Ask from |
|---|---|---|---|
| **Minimum-viable beta** | $2,500 | 8 × $200 honoraria + $300 tooling + $600 buffer | One angel, friends-and-family, micro-grant |
| **Beta + 6-week sprint** | $7,500 | The above + $5,000 for ~3 weeks of full-time finish-the-launch work | Two angels, single accessibility grant, one pilot customer |
| **Beta + 3-month runway** | $20,000 | The above + 2 more months focused on customer development | Three to five angels, accelerator small-cheque, pilot customer paying ahead |

Pick the smallest number that gets you to a real launch. Smaller asks
close faster and don't dilute the relationships you might want to
return to in 6 months.

## Multi-track timeline

Run all four tracks in parallel. Tracks 1 and 3 can close in days.
Track 2 takes weeks. Track 4 takes months.

```
Week 1     Existing warm contacts  →   first cheques (Track 1)
Week 1-2   Pilot-customer outreach  →   pre-paid contracts (Track 3)
Week 1-4   Grant applications      →   non-dilutive funding (Track 2)
Month 2-3  Accelerator applications →   later-stage support (Track 4)
```

Don't wait for one track before starting the next.

## Funding source list (concrete starting points)

### Track 2 — Accessibility & disability grants

Small dollar amounts ($1k–$25k), but non-dilutive and the social
proof matters. **Application windows are open year-round at most of
these. Check the actual website before assuming the program still
exists.**

- **Comcast NBCUniversal Voices of the Everyperson grants** — small
  cheques to disability-tech founders.
- **Knowbility AccessU community grants** — small project funding.
- **Microsoft AI for Accessibility** — AI-powered a11y tools; AMASAMYA
  fits squarely (Vision AI engines).
- **Google.org Impact Challenge for Accessibility** — runs irregularly.
- **National Federation of the Blind Imagination Fund** — for tech that
  serves blind users.
- **Disability:IN supplier diversity programs** — not a grant per se,
  but corporate buyer access.

### Track 3 — Pre-paid pilot customers

Faster than grants. Look for organisations with:
- Recent ADA / Section 508 / EAA enforcement letters or lawsuits.
- New WCAG 2.2 compliance deadlines (US fed contractors: ICT Refresh;
  EU: European Accessibility Act, June 2025).
- Public commitment to accessibility but no internal tooling.

Specific channels:
- LinkedIn search: "Accessibility Lead" / "Digital Inclusion Manager"
  at agencies, banks, hospitals, universities, gov bodies.
- Section508.gov procurement contacts (US fed sub-contractor angle).
- Higher-ed: Office of Disability Services + Web Communications usually
  share a budget; pitch jointly.

### Track 4 — Accelerators with disability-tech focus

- **2Gether-International** — accelerator for disability-led startups.
  Accepts solo founders. Provides small cheque + intros.
- **Remarkable (Australia)** — global pre-accelerator + accelerator;
  cohorts run several times a year.
- **Disability:IN NextGen Leaders** — fellowship rather than cheque,
  but opens doors.
- **Techstars** — most cohorts now have an a11y-friendly option but
  the bar is high; only apply if you have one paying pilot first.

---

## What to do today (concrete)

1. Read the email templates in `beta/funding/templates/`.
2. Pick **one** of your existing warm investor contacts.
3. Send Template 1 (warm angel) today, customised.
4. Write the names of 5 more warm contacts. Send to the next two
   tomorrow.
5. By end of week, have sent 3–5 emails, scheduled at least one call,
   and started one grant application.

The hardest part of fundraising is not the email — it's pressing send
on the first one. Once one cheque commits (even $1k), the social proof
makes the next ones dramatically easier.

## A blunt warning

Solo founders raising small cheques get a lot of "let me think about
it" and "send me an update in 6 months". Both mean no. Treat them as
no, move on, and follow up *only* with a real milestone update
("CWS just approved the listing", "first paying pilot signed",
"closed $X from Y") — never just to nudge. Nudging without a
milestone is begging, and begging is its own anti-signal.
