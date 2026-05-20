# AMASAMYA Beta - Pre-Flight Checklist

Run through this **before** sending the first outreach email. Anything
unticked here will turn into a tester complaint within 48 hours.

Estimated time to complete: **2–3 hours**.

---

## 1. Tool itself

- [ ] Chrome Web Store appeal accepted; listing privacy URL field saved
      to a 200-OK URL.
- [ ] `https://amasamya.akhileshmalani.com` resolves and serves the
      latest deploy. Confirm by checking that the dashboard's empty-state
      shows the new "Run a Web Audit / Audit a Document / Import JSON"
      CTAs (added in the P2 sweep).
- [ ] `https://amasamya.akhileshmalani.com/privacy` resolves with no
      axe-core violations. (Verified clean as of commit `4d93eef`.)
- [ ] `npx playwright test` shows **8/8 passed** locally.
      *(As of commit `[next]` - including the screen-reader Escape fix.)*
- [ ] PIN sign-in works for new users **and** auto-migrates legacy
      users to PBKDF2 on first sign-in.
- [ ] Document upload works end-to-end for at least one real file in
      each format: `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.epub`, `.odt`.
      **Run this manually before launch - synthetic tests don't catch
      every parser edge case.**
- [ ] AI Settings: paste a real OpenAI key, save, refresh, confirm the
      key persists encrypted (check `localStorage.AMASAMYA-ai-keys-v6`
      shows opaque base64, not plaintext `sk-...`).
- [ ] AI call retry: trigger an AI call with rate-limited or invalid
      key. Confirm the user-facing error is helpful, not a JSON dump.
- [ ] Error toast: trigger any unhandled rejection (e.g. upload a
      corrupt ZIP). Confirm the toast shows, is screen-reader-announced,
      and dismisses on Escape or button click.

## 2. Public-facing pages

- [ ] `/beta/tester-brief.md` rendered as HTML at a stable public URL.
      Either commit it as `beta/tester-brief.html` or use GitHub Pages /
      Notion / similar - but the link must not require login.
- [ ] `/beta/feedback-form.md` translated into a real Google Form. Form
      itself tested with NVDA + Forms Mode end-to-end. *(See the form's
      built-in accessibility checklist at the bottom of `feedback-form.md`.)*
- [ ] `/beta/outreach-emails.md` filled in with the actual honorarium
      amount, your real LinkedIn / homepage URL, and your real test brief
      URL. **Do not send a template with `[X]` placeholders still in it.**
- [ ] `CONTRIBUTORS.md` published - either as a markdown file in the
      repo root or rendered at `/amasamya/credits.html` so testers
      see it before they fill the form. Linking to "we'll credit you
      somewhere" without showing the page is a red flag.

## 3. Tools you'll need on launch day

- [ ] **Spreadsheet** with the columns from `outreach-emails.md` →
      "Tracking - keep this simple". Empty rows, ready to fill.
- [ ] **Email signature** with your role + AMASAMYA URL. Plain text.
- [ ] **Calendly / Cal.com** link for the optional Zoom-based test
      sessions, with 30-minute slots and a buffer between bookings.
- [ ] **Gift-card method** decided and tested:
      - Amazon e-gift cards work in most countries; PayPal is widely
        accepted; Apple cards are region-locked (US/UK/EU only).
      - Test the delivery flow on yourself first - recipient should be
        able to redeem within 5 minutes of receipt.
- [ ] **Budget allocated and committed.** Recommend $[X] × N testers
      sitting in a separate sub-account so you don't accidentally not
      pay someone.

## 4. Communication / response setup

- [ ] An inbox you actually check daily. Not a `noreply@`. Not a shared
      team alias unless someone owns same-day reply.
- [ ] Auto-reply set up for the AMASAMYA tester inbox saying
      *"Thanks - I read every reply within 24 hours; if you don't hear
      back within 48, please nudge me."* Real auto-reply, not a "ticket
      created" template.
- [ ] First-reply boilerplate (1 sentence) ready to paste:
      *"Thanks for being willing to test - here's the brief: [link],
      and the feedback form: [link]. The honorarium is $[X]. Reply with
      any questions or just dive in whenever works."*

## 5. Plan for what comes back

- [ ] **Triage rule**: every piece of feedback gets logged in an issue
      tracker the same day. GitHub Issues, Linear, plain text file -
      anything traceable. "I'll remember it" is not a plan.
- [ ] **Severity labels**: copy the same scheme used in the P0/P1/P2
      audit. Blockers ship first. Don't add new features until the
      tester-reported P0/P1 list is clear.
- [ ] **Public changelog**: a `CHANGELOG.md` or `/amasamya/changes`
      page where you note, by date, what changed because of which
      tester. The 2-week follow-up email links here. This is the
      single highest-leverage thing you can do for trust - if the
      changelog is real and dated, future testers believe their
      feedback will matter.

## 6. Metrics to watch (week 1)

Don't over-instrument; pick three numbers and update them weekly.

- [ ] **Reply rate**: of N outreach emails sent, how many got a
      response? <20% means subject lines or channels need rework. >50%
      is excellent - protect it by not spamming the same audience
      again later.
- [ ] **Test completion rate**: of testers who said yes, what fraction
      actually finished and sent feedback? <60% means the brief is too
      long, the tool has a sign-in barrier, or honoraria are too low.
- [ ] **Net Promoter–style question**: Q5.3 on the form (likelihood of
      using AMASAMYA in next 30 days). Track the average. Below 6.0 is
      a red flag - fix something obvious before sending the next batch.

---

## Anti-patterns to avoid

- ❌ **Launching the public Chrome Web Store listing on the same day as
      tester emails go out.** Stagger by at least a week. Testers find
      bugs that the public should not.
- ❌ **Asking testers for testimonials before fixing what they
      reported.** This is the single most reliable way to burn a
      relationship.
- ❌ **Treating "I'll fix that later" replies as completed work.** They
      aren't. The tracking spreadsheet exists for this reason.
- ❌ **Adding new features during beta.** Lock the feature set; only
      ship bug fixes and accessibility regressions during the test
      window. Two weeks minimum.
- ❌ **Hiring a copywriter for the launch announcement.** The
      announcement that will land best is one that quotes specific
      tester feedback and lists what changed because of it. A
      copywriter writes generic. The signal is in the specifics.

---

## Day-of-launch sequence

When the Chrome Web Store appeal lands:

1. **Hour 0** - verify the listing renders correctly and the privacy
   URL works. Test install from a fresh profile.
2. **Hour 1** - push any final hot-fixes; tag a release; deploy.
3. **Hour 2** - final smoke test: PIN sign-in, one PDF audit, one Web
   audit, one AI call. If anything fails, **stop and fix** - don't send
   outreach until green.
4. **Hour 3** - send first wave of warm-channel emails (Templates 1
   and 5). 5–10 emails, hand-customised. Do NOT bulk-send.
5. **Hour 4–24** - monitor inbox; reply within 4 hours to every
   inbound. Schedule sessions.
6. **Day 2** - Templates 2 and 4 (organisations + Reddit).
7. **Days 3–5** - Template 3 (paid experts) one at a time.
8. **Day 7** - first review: how many tests scheduled, how many
   completed, what's the early signal? Re-tune outreach if needed.
9. **Day 14** - send "what changed because of your feedback" follow-up
   to everyone who tested. Close out the gift-card spreadsheet.
10. **Day 21** - write the public soft-launch post on LinkedIn.
   Quote at least two named (with permission) tester observations and
   what shipped because of them. **This post is your real launch.**

---

- Akhilesh Malani
