# Chrome Web Store Resubmission Checklist - AMASAMYA v3.4.0

This is the complete list of things to do to clear the rejection that
came after the AMA11Y → AMASAMYA rename. The repo side is already
done (icons regenerated, screenshots regenerated, ZIP built clean).
The remaining items are all on the **Chrome Web Store Developer
Dashboard** - you have to do them by hand in the browser.

Estimated time: **45–60 minutes**.

---

## What was actually broken

The rejection was almost certainly caused by **brand inconsistency
across the listing**, not by a code problem. Specifically:

1. **Extension runtime icons** (the small icon Chrome shows in the
   toolbar and on the listing tile) still said **"A11Y"** - they were
   never updated when the brand changed. ✅ Fixed in this commit.
2. **All 9 store-assets PNGs** (icons, marquee, small promo, 5
   screenshots) were rendered **before** the AMA11Y → AMASAMYA HTML
   rebrand, so they all visibly said "AMA11Y" on screen even though
   the manifest, listing name, and folder name all said AMASAMYA.
   ✅ Regenerated in this commit.
3. **The Dashboard's listing fields** (display name, description,
   privacy URL, screenshot uploads, marquee, small promo) need to be
   re-saved by you. Chrome doesn't pick those up from the ZIP - they
   live on the Dashboard.

---

## Step 1 - Upload the new ZIP

1. Sign in to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/).
2. Open the AMASAMYA item.
3. Click **Package** in the left sidebar.
4. Click **Upload new package**.
5. Pick `AMASAMYA-extension-v3.1.0.zip` from the repo root.
6. Wait for the validator to finish. Expected: green check, no warnings.

If you see a validator error:

- *"Manifest description too long"* - already verified at 131 chars
  (limit 132). If this fires, the validator counts something
  differently; trim one character.
- *"Icon dimensions don't match"* - the new PNGs are exactly 16×16,
  32×32, 48×48, 128×128. If the validator complains, re-render with
  `node amasamya-extension/icons/render-icons.js` and re-zip.

## Step 2 - Update Store Listing fields

Click **Store listing** in the left sidebar.

### Item details

| Field | Value to paste |
|---|---|
| **Item name** | `AMASAMYA - Accessibility Audit Tool` |
| **Summary** (short description, 132 char max) | `Blind-first WCAG 2.2 audit tool with Vision AI modules: Focus Indicator Narrator, Visual Layout Auditor, and State Change Watchdog.` |
| **Description** (long description, 16 000 char max) | See `cws-listing-description.md` (next file in this folder). Paste the whole thing. |
| **Category** | `Developer Tools` |
| **Language** | `English (United States)` |

### Graphic assets

Upload all five from `store-assets/` (use the new files dated April 28
or later - verify in Explorer that the file modified date is recent):

| Slot | File to upload | Size | What it is |
|---|---|---|---|
| **Store icon** | `store-assets/icon-128.png` | 128 × 128 | Listing tile icon |
| **Marquee** | `store-assets/marquee.png` | 1400 × 560 | Featured-tile banner |
| **Small promotional tile** | `store-assets/small-promo.png` | 440 × 280 | Search-results card |
| **Screenshot 1** | `store-assets/ss1-wcag.png` | 1280 × 800 | WCAG audit on a banking site |
| **Screenshot 2** | `store-assets/ss2-focus.png` | 1280 × 800 | Focus Indicator Narrator |
| **Screenshot 3** | `store-assets/ss3-layout.png` | 1280 × 800 | Visual Layout Auditor |
| **Screenshot 4** | `store-assets/ss4-watchdog.png` | 1280 × 800 | State Change Watchdog |
| **Screenshot 5** | `store-assets/ss5-settings.png` | 1280 × 800 | Settings & Vision AI configuration |

**Critical**: delete any old screenshots in the slots first. The
Dashboard does not auto-replace - uploading a new file with the same
slot number adds it; you'll have two of the same slot if you don't
delete first.

## Step 3 - Privacy practices

Click **Privacy practices** in the left sidebar.

### Single purpose

```
AMASAMYA audits web pages, uploaded documents, and mobile apps for
WCAG 2.2 accessibility compliance and reports findings to the user.
```

### Permissions justifications

Each entry below pastes into the corresponding "Why this permission?"
text box. Copy the whole block for that permission - reviewers want
specific use-case sentences, not generic ones.

**`activeTab`**

```
Used to read the DOM of the page the user is currently viewing when
they click the AMASAMYA toolbar button or press Ctrl+Shift+U. This is
the only mechanism by which AMASAMYA accesses page content. The
extension does not run on tabs the user has not explicitly invoked it
on.
```

**`scripting`**

```
Used to inject the locally-bundled WCAG audit scripts into the active
tab on user invocation. All audit logic ships inside the extension -
no remote code is fetched or executed. Required because Manifest V3
removed the ability for content_scripts alone to do dynamic injection.
```

**`sidePanel`**

```
Used to display the audit results panel in the Chrome side panel
instead of opening a new window. The side panel keeps results visible
while the user inspects the audited page in the main viewport - a
key affordance for blind users who need a stable focus context.
```

**`tabs`**

```
Used to read the URL and title of the active tab so that audit
reports can be labelled with the page they came from. The extension
does not enumerate, modify, or interact with tabs other than the one
the user has invoked it on.
```

**`storage`**

```
Used to persist the user's optional Vision AI provider choice
(Anthropic, OpenAI, or none) and any API key the user enters for the
Focus Indicator Narrator and Visual Layout Auditor modules. Keys are
stored in chrome.storage.local on the user's device only and are
never transmitted to AMASAMYA servers. The encryption-at-rest scheme
is described in the linked privacy policy.
```

**`debugger`**

```
Used by the Visual Layout Auditor module only, to emulate four
viewport sizes (320 × 568 mobile, 768 × 1024 tablet, 1024 × 768
laptop, 1920 × 1080 desktop) via the Chrome DevTools Protocol's
Emulation domain. This is the only way to capture identical
screenshots at non-current viewport sizes for layout-shift analysis.
The debugger session is opened only when the user explicitly triggers
the Visual Layout Auditor and is closed immediately when the analysis
completes. The user must dismiss the "is being debugged" banner Chrome
shows during the session, providing visible consent for every use.
```

**`host_permissions: <all_urls>`**

```
The whole purpose of an accessibility audit tool is that the user
chooses which page to audit. Restricting host permissions to a fixed
list would defeat the tool. The extension only ever reads or modifies
the active tab on user invocation - no automated scraping, no
background reading, no cross-origin data leakage. The privacy policy
documents this scope precisely.
```

### Data disclosure

Tick:

- [ ] *No, this extension does NOT collect or use the following
      personally identifiable information.*

Tick under "Data usage":

- [ ] *I certify that the following disclosures are true: this
      developer's use of any data is consistent with the developer's
      Privacy Policy.*
- [ ] *This developer does not sell user data to third parties,
      outside of the approved use cases.*
- [ ] *This developer does not transfer user data to third parties
      outside of the approved use cases.*

(All three are accurate for AMASAMYA.)

### Privacy policy URL

```
https://amasamya.akhileshmalani.com/privacy
```

This URL is alive and accessible (verified by us - there are 200-OK
redirects from every plausible variant including the legacy
`/AMA11Y/privacy*` paths in netlify.toml).

If the reviewer reports the URL as broken anyway, the issue is
usually case-sensitivity. Try saving the field as exactly:

```
https://amasamya.akhileshmalani.com/amasamya/privacy.html
```

That hits the canonical file with no redirect needed.

## Step 4 - Distribution

Click **Distribution** in the left sidebar.

- Visibility: **Public** (or **Unlisted** if you want to soft-launch
  with only the people you share the direct URL with - recommended
  for the first 1–2 weeks of beta).
- Regions: pick the regions you want; default is "All regions".
- Pricing: **Free**.

## Step 5 - Submit for review

1. Top-right of any page in the Dashboard, click **Submit for review**.
2. Confirm the submission summary (Chrome shows a diff of what
   changed since the last review - this should highlight the new ZIP
   version, the new screenshots, and the new icon).
3. Submit.

Typical first-review SLA: **1–3 business days**.
Resubmission after fixes: **same or faster**, since reviewers see the
delta and can compare against the prior rejection note.

## Step 6 - While you wait

- Watch your developer email - that's where rejection / approval
  notes land. They do not appear in the Dashboard until ~2 hours
  after the email.
- Don't make further changes until the review completes. Re-uploading
  while a review is in flight resets the queue position.
- If approved: the listing goes live within 30 minutes of the
  approval email.
- If rejected: the email cites the specific policy section. Reply to
  it (do not just resubmit) - appeals get faster turnaround than
  silent fixes-and-resubmits.

---

## Things I deliberately did NOT change in the manifest

For transparency, here's what the manifest still requests and why
each is justified - useful if a reviewer asks you to defend any of
these in a follow-up:

- **`<all_urls>` host permissions**: An accessibility audit tool that
  can only audit a fixed list of sites is not an accessibility audit
  tool. The user is the one who chooses which page is audited.
- **`debugger` permission**: The Visual Layout Auditor genuinely
  needs DevTools Protocol viewport emulation to capture screenshots
  at non-current sizes. It's the only API that does this; without it
  the feature can't ship. Chrome's mandatory "is being debugged"
  banner gives visible consent every time it's used, which is the
  correct UX safeguard for this permission.
- **Manifest description at 131/132 chars**: One char under the
  limit. Tight, but accurate - every word in the description names a
  shipped feature, no marketing fluff.

---

## What's in this submission that wasn't in the previous one

For your own reference (and if a reviewer asks "what changed since
the rejection?"):

| Change | Why |
|---|---|
| Extension runtime icons (16/32/48/128) re-rendered from new SVG sources that say "AMASAMYA" instead of "A11Y". | The old icons were never updated when the brand changed - this was almost certainly the inconsistency the reviewer flagged. |
| All 9 store-asset PNGs re-rendered from the AMASAMYA-era HTML (which already said "AMASAMYA" but the PNGs were rendered before that change). | Same root cause as above for the listing-side assets. |
| Folder renamed `ama11y-extension/` → `amasamya-extension/`. | Internal cleanliness. Web Store doesn't see folder names but it eliminates a potential reviewer-confusing breadcrumb if they pull the source ZIP. |
| Privacy policy URL handling tightened on the Netlify side: redirects added for every plausible URL variant (`/privacy`, `/privacy.html`, `/amasamya/privacy`, plus legacy `/ama11y/privacy*` and case-variant `/AMA11Y/*`). | Eliminates the "privacy URL inaccessible" rejection class entirely. |
| AI API key storage now encrypted at rest with a non-extractable WebCrypto key. | Strengthens the privacy story documented in the policy; reviewer-visible improvement if they read the policy carefully. |
| Document audit timeout, error toast, ZIP-bomb guards, postMessage origin tightening, PIN PBKDF2. | Production-hardening done during the same period. Not extension changes per se, but the linked AMASAMYA web app is the homepage_url, and a reviewer who clicks through gets a sturdier impression. |

---

- Akhilesh Malani
