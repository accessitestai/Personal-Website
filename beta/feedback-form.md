# AMASAMYA Beta Feedback Form

This is the question set to paste into Google Forms, Typeform, or any
other accessible form builder. **Order matters** — easy/identifying
questions first so people warm up, then the open-ended questions where
the real signal lives, then logistics.

Estimated completion time: **8–12 minutes**.

---

## Section 1 — About you (2 min)

**Q1.1 — Your name (optional, only used for the contributors page)**
Short text. Required: No.

**Q1.2 — Email**
Used only to send your gift card and the follow-up message. We will not
add you to a mailing list.
Short text. Required: Yes.

**Q1.3 — How would you describe your screen reader use?**
Single choice.
- I'm a daily screen reader user (blind / low vision).
- I use a screen reader several times a week (low vision / professional
  testing).
- I'm a sighted accessibility professional who tests with a screen
  reader.
- Other (explain in Q1.5).

**Q1.4 — Which screen reader did you primarily use for this test?**
Multiple choice (check all).
- NVDA
- JAWS
- VoiceOver (macOS)
- VoiceOver (iOS)
- TalkBack
- Narrator
- Orca
- Other:

**Q1.5 — Anything else about your context we should know?** *(optional)*
Long text. Required: No.

---

## Section 2 — First impressions (2 min)

**Q2.1 — Which path did you test?**
Multiple choice (check all).
- Web Audit (paste a URL, audit it).
- Document Audit (upload a file).
- Mobile Checklist.
- Vision AI features (Focus Narrator / Visual Layout Auditor).
- I tried to test but was blocked before I got there. (Explain in Q5.1.)

**Q2.2 — Sign-in / first-run experience**
Five-point scale: 1 = "actively painful", 5 = "felt natural".

**Q2.3 — Did anything in the sign-in flow stop you, slow you, or feel
wrong?**
Long text. Required: No.

---

## Section 3 — Audit findings quality (4 min)

**Q3.1 — Findings list navigation**
Five-point scale: 1 = "couldn't find my way around", 5 = "everything was
where I expected".

**Q3.2 — "How to fix" hints**
Five-point scale: 1 = "useless or misleading", 5 = "I could act on
them".

**Q3.3 — Reference links attached to findings**
Five-point scale: 1 = "didn't help", 5 = "took me right to the answer".

**Q3.4 — Pick one finding from your test session that was most useful.**
Long text. *(What was it, and why did it work?)*

**Q3.5 — Pick one finding that was confusing, wrong, or unhelpful.**
Long text. *(What was it, and what would have helped?)*

---

## Section 4 — Screen reader experience (3 min)

**Q4.1 — Did the screen reader announce things correctly as you
navigated?**
Long text. Required: Yes.

**Q4.2 — Did any control fail to announce its label, role, or state?**
Long text. *(Buttons reading as "button button", checkboxes not
announcing checked state, etc.)*

**Q4.3 — Did any live-region update fire too often, too rarely, or with
the wrong urgency (assertive vs polite)?**
Long text. Required: No.

**Q4.4 — Did any heading-level skip, missing landmark, or focus-trap
issue stop you from reading something?**
Long text. Required: No.

---

## Section 5 — The honest stuff (1 min)

**Q5.1 — What is the single thing that, if we don't fix it, would stop
you recommending AMASAMYA to a colleague?**
Long text. Required: Yes. *(One thing. Be specific.)*

**Q5.2 — What did AMASAMYA do better than other accessibility audit
tools you've used?**
Long text. Required: No.

**Q5.3 — On a scale of 0 to 10, how likely are you to use AMASAMYA in
your own work in the next 30 days?**
Number 0–10.

---

## Section 6 — Logistics (1 min)

**Q6.1 — Public credit on the AMASAMYA contributors page?**
Single choice.
- Yes — credit me by name. (Q6.2 fills in the link.)
- Yes — credit me anonymously as "Beta Tester #N".
- No public credit, please. *(default)*

**Q6.2 — Optional link for your contributor entry** *(LinkedIn, blog,
Mastodon, GitHub — anything)*
Short text. Required: No.

**Q6.3 — Compensation preference**
Single choice.
- Gift card (Amazon / Apple — we'll ask which after).
- Donation to a charity of my choice (Q6.4).
- Co-credit only — I don't need compensation.

**Q6.4 — If donating: charity name + URL**
Short text. Required: No.

**Q6.5 — Anything else?**
Long text. Required: No.

---

## Form-builder accessibility checklist

Before you publish the form, verify:

- [ ] Every question has a programmatic label (Google Forms does this
      automatically for the question text — verify with NVDA + Forms
      Mode that each label reads).
- [ ] Required fields are announced as required.
- [ ] Error messages on missing required fields announce as
      `aria-live="polite"` (Google Forms does this; Typeform does not by
      default — Typeform is harder to make accessible, prefer Google
      Forms).
- [ ] No CAPTCHA. (Google Forms only inserts one if abuse is detected;
      monitor and switch to email submission if it appears.)
- [ ] Test the form yourself end-to-end with a screen reader before
      sending the link to anyone. If you can't fill the form with the
      screen reader, neither can your testers.
