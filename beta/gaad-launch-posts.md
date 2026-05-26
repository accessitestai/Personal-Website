# AMASAMYA - GAAD 2026 Launch Post Pack

Three paste-ready drafts to use on launch day, 21 May 2026.
All three are Yellow-Argon safe (no comma-separated keyword piles).
None of them references "SEBI" or any other regulation incorrectly.
Each one names a different posture and tone for the medium.

| When | What | Where |
|---|---|---|
| 8:30 am IST | Long-form launch post | LinkedIn |
| 10:00 am IST | Plain-text launch post | WebAIM / DAISY / a11y mailing lists |
| 11:00 am – 2:00 pm IST | One-to-one DMs / emails | Personal outreach to 5–10 named people |

---

## 1. LinkedIn launch post (long-form)

Copy the section between `=== BEGIN ===` and `=== END ===` and paste
into LinkedIn as a single post. Do not include any of the
explanatory text outside the markers. After publishing, immediately
post the **first comment** below the markers - LinkedIn down-ranks
posts with outbound links in the body, but it is fine in the first
comment.

=== BEGIN ===

Today is Global Accessibility Awareness Day.

I am a screen reader user. I have spent over a decade in digital accessibility, and every audit tool I have tried to use was built on the assumption that the person running the audit can see. The findings are dense visual descriptions. The dashboards are designed to be scanned with eyes. The workflows assume the auditor can point at a screen.

I cannot point at a screen.

So I built AMASAMYA. Today, on GAAD 2026, I am releasing it to the community as a free Chrome extension on the Web Store, a free web platform, and open source under the MIT licence on GitHub.

What it does:

The Chrome extension runs nineteen WCAG 2.2 audit engines on any open tab in roughly five seconds. Press Ctrl + Shift + U on any page, and findings appear in the Chrome side panel - navigable by heading with a screen reader's H key. No mouse required, ever.

The web platform extends the same engines to uploaded documents - PDF, Microsoft Office, EPUB, OpenDocument - and to a structured mobile-app accessibility checklist.

The source code is fully readable and forkable. README, contributing guide, and inline comments mapping every engine to its WCAG criterion.

What is different about it:

The interface is operable with a screen reader from the first commit, not as a retrofit. Each finding announces its role, severity, and remediation in a logical reading order. Reports export in formats that respect the auditor's workflow rather than forcing a specific tool.

The tool is honest about its limits. Automated audits see roughly 30 to 40 per cent of accessibility issues. AMASAMYA is a complement to manual testing by a person with a disability, not a replacement.

There is no paywall. No signup. No telemetry. No proprietary black box. The reason I can give it away is that the cost of building it was my time, and I built it because I needed it.

If you find the tool useful, an honest review on the Chrome Web Store listing helps reduce the install-time warning for the next person who tries it. A critical review is as useful as a positive one.

I am also open to honest feedback by reply or DM. Critical feedback is the most valuable contribution at this stage.

Full launch post with links, source code, and the three release surfaces is in the first comment.

#GAAD #Accessibility #WCAG #DigitalInclusion #InclusiveDesign #RPwDAct

=== END ===

### First comment to post immediately after the main post

> Links to everything released today:
>
> Chrome extension: https://chromewebstore.google.com/detail/blnfmiipkccpggpinjofhhglfcgglbif
> Web platform: https://amasamya.akhileshmalani.com
> Source code on GitHub: https://github.com/accessitestai/AMASAMYA
> Full launch story: https://akhileshmalani.com/blog/gaad-2026-launching-amasamya.html

---

## 2. Mailing list post (plain text)

Best lists to send to:

- WebAIM Discussion List - `webaim-forum@list.webaim.org` (must be subscribed first)
- DAISY-FORUM - `daisy-forum@listserv.daisy.org`
- Any India-specific a11y list you are on

One list per day for three days. Do not cross-post the same day.
Plain text only, no HTML, no attachments.

### Subject line

> AMASAMYA - blind-first WCAG 2.2 audit tools released today on GAAD 2026

### Body - paste verbatim

> Hello list,
>
> Today is Global Accessibility Awareness Day, and I am releasing AMASAMYA - a set of accessibility audit tools I have been building over the last several months. I want this community to see them on the day they go public.
>
> Three things released today, all free, all open-source, all designed for screen-reader use:
>
> The AMASAMYA Chrome extension. Audits any web page for WCAG 2.2 compliance in about five seconds. Seventeen audit engines including 200 percent zoom verification, dark-mode palette contrast, focus management, and target size at both AA and AAA. Optional Vision AI integration uses the user's own API key, never AMASAMYA servers. Free on the Chrome Web Store: https://chromewebstore.google.com/detail/blnfmiipkccpggpinjofhhglfcgglbif
>
> The AMASAMYA web platform at https://amasamya.akhileshmalani.com - extends the same engines to documents in eight formats (PDF, Microsoft Office, EPUB, OpenDocument), plus a structured mobile-app accessibility checklist for iOS, Android, and WearOS. Exports CSV, JSON, or HTML.
>
> The source code, MIT licensed, at https://github.com/accessitestai/AMASAMYA - extension code, README, CONTRIBUTING, privacy policy, all readable and forkable.
>
> The whole point of the project is that the interface is operable with a screen reader from the first commit, and findings are written to be actionable by non-sighted developers. I am a screen reader user myself. The honest gap between what most automated tools see (around 30 to 40 per cent of WCAG criteria) and what manual testing catches is well understood here - AMASAMYA is designed to handle the mechanical part so manual testing time can go to the journey work tools cannot do.
>
> What I would value back: honest feedback, critical especially. If the side panel becomes unusable with your assistive technology, or if a finding's wording confuses rather than clarifies, please open an issue on the repository or reply privately to akhilesh.malani@gmail.com.
>
> Full launch story with the reasoning and limitations is on my blog: https://akhileshmalani.com/blog/gaad-2026-launching-amasamya.html
>
> Thank you for your time.
>
> Akhilesh Malani
> https://akhileshmalani.com

---

## 3. One-to-one DM / email templates

Use these for the 5 to 10 personal outreach contacts on launch day.
Pick the template that matches the relationship. Customise the
opening sentence every single time - never bulk-send.

### Template A - Someone you already know in the a11y community

> Hi [name],
>
> Quick note on GAAD: I am releasing AMASAMYA today - the blind-first WCAG audit tool I have mentioned to you. Three surfaces went live this morning: Chrome extension, web platform, and the source code on GitHub.
>
> If you have a few minutes today, I would value any reaction you have to the launch post: https://akhileshmalani.com/blog/gaad-2026-launching-amasamya.html
>
> No obligation, and no reply needed unless you want to engage. Just wanted you to see it directly rather than through a feed.
>
> Akhilesh

### Template B - Someone you have not spoken to recently, but who knows your work

> Hi [name],
>
> Today is GAAD, and I am releasing the accessibility audit toolkit I have been quietly building over the last several months. Three things shipped today, all free and open-source:
>
> - AMASAMYA Chrome extension (now on the Web Store)
> - AMASAMYA web platform (web + documents + mobile checklist)
> - The full extension source on GitHub, MIT licence
>
> The launch story explains the why and the honest limitations: https://akhileshmalani.com/blog/gaad-2026-launching-amasamya.html
>
> I thought of you because [one sentence on why - a specific past conversation, their published work, or a shared community connection].
>
> If anything in the launch is useful to your work, I would value your honest reaction. No obligation either way.
>
> Best,
> Akhilesh Malani
> https://akhileshmalani.com

### Template C - Someone at an org on the outreach list (cold but with a real reason)

> Hi [name],
>
> I noticed your work on [specific thing - a blog post, a conference talk, a public project - name it precisely].
>
> I am Akhilesh Malani, an accessibility architect and screen reader user. Today on Global Accessibility Awareness Day, I am releasing AMASAMYA - a WCAG 2.2 audit toolkit I have been building over the last several months. The interface and the audit findings are designed for screen-reader use from the first commit, which is unusual for tools in this space.
>
> Three surfaces released today, all free and open-source:
>
> Chrome extension: https://chromewebstore.google.com/detail/blnfmiipkccpggpinjofhhglfcgglbif
> Web platform: https://amasamya.akhileshmalani.com
> Source code: https://github.com/accessitestai/AMASAMYA
>
> Launch story with reasoning and limitations: https://akhileshmalani.com/blog/gaad-2026-launching-amasamya.html
>
> If any of this is relevant to [their org] or to the work you cover, I would value 15 minutes of honest reaction. No commercial pitch attached.
>
> Best,
> Akhilesh Malani

### Template D - Friends and family (low-formality, share-friendly)

> Hey [name],
>
> Today is Global Accessibility Awareness Day, and I am releasing AMASAMYA - the accessibility audit toolkit I have been working on.
>
> If you would be willing to share the post with anyone you think might care, that would help: https://akhileshmalani.com/blog/gaad-2026-launching-amasamya.html
>
> Thanks. More soon.
> A.

---

## Posting + sending sequence on the day

| Time (IST) | Action |
|---|---|
| 7:30 am | Blog post deploy goes live (Netlify auto-deploy from commit) |
| 8:30 am | LinkedIn main post published |
| 8:31 am | LinkedIn first comment with the four links posted |
| 10:00 am | Mailing list 1 sent (WebAIM, day 1) |
| 11:00 am – 12:30 pm | Five Template A or B messages sent to known contacts |
| 1:30 pm | Mailing list 2 sent (only if WebAIM has been queued long enough; otherwise wait for day 2) |
| 2:00 pm – 4:00 pm | Five Template C messages to organisation contacts |
| 7:00 pm | One pass through LinkedIn and email replies; respond to each |

## Replying rules for launch day

- Every reply within 90 minutes if you can. The first three hours after a post is when the algorithm decides if it propagates.
- If a reply asks a question, answer it. If a reply praises the tool, thank them by name and ask if they want to be on the contributors list.
- If a reply criticises, agree with the part that is true, fix what you can, and thank them publicly for the catch. Critical replies that get a good response from you compound trust enormously.
- Do not argue. Do not defend. Do not edit the original post after publishing unless there is a factual error.

## After GAAD

| Day | Action |
|---|---|
| +1 (Fri 22 May) | Single "thank you" follow-up post on LinkedIn, naming specific feedback received |
| +3 (Mon 25 May) | Audit post on a real site (resume the regular cadence) |
| +7 (Thu 28 May) | Review GAAD metrics; decide what to keep, what to drop |
| +14 (Thu 4 Jun) | First post-GAAD email to anyone who replied to the mailing list post with substantive feedback |
