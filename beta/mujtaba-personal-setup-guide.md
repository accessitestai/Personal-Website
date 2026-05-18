# AMASAMYA — Personal Setup Guide

Prepared for Mujtaba, May 2026.

This guide gets the AMASAMYA Chrome extension working in your personal Chrome on your own laptop, with the free Google Gemini option so the Vision AI features cost nothing. It assumes you use NVDA on Windows. Steps that mention specific NVDA hotkeys are flagged. Total time: about fifteen minutes.

## What you will end up with

After completing this guide you will have:

- The AMASAMYA extension installed in Chrome on your personal laptop.
- A free Google Gemini API key configured inside the extension's Settings tab.
- One successful audit completed, with the report visible in the Chrome side panel and exported to a CSV file on your desktop.

You will not have anything installed on a work machine yet. This is deliberate. Once you are confident with the tool in your personal environment, you can decide separately whether to take it to your IT infrastructure team.

## Step one — install the extension

1. In Chrome, address bar: `https://chromewebstore.google.com/detail/blnfmiipkccpggpinjofhhglfcgglbif`. Press Enter.
2. The AMASAMYA listing page loads. Press the H key in NVDA browse mode until you reach the page heading.
3. Press the B key to navigate to the next button until NVDA announces a button labelled "Add to Chrome". Press Enter.
4. Chrome shows a "Proceed with caution" dialog because AMASAMYA is a newly approved extension. This is normal and not a security warning about anything wrong with the extension itself. Tab to the button labelled "Continue to install" and press Enter.
5. Chrome then shows a permission confirmation dialog titled "Add AMASAMYA — Accessibility Audit Tool?". Tab to the button labelled "Add extension" and press Enter.
6. NVDA announces that the extension has been added. You can hear this announcement in the system notification area as well.

The extension is now installed. There is nothing visible on the page; the icon lives in Chrome's extension menu.

## Step two — get a free Google Gemini API key

You only need to do this once. The key is yours and stays on your machine.

1. Address bar: `https://aistudio.google.com/app/apikey`. Press Enter.
2. Sign in with your personal Google account if prompted.
3. Navigate by heading (H key) to the section labelled "API keys".
4. Press B repeatedly until NVDA announces a button labelled "Create API key" or "Get API key". Press Enter.
5. A dialog opens asking which Google Cloud project to use. If you do not have one, Google Studio offers a default option labelled "Create API key in new project". Pick that and press Enter.
6. The page now shows your new API key as a long string of letters and numbers. Press Tab until NVDA announces the key value. Use NVDA + F10 (review cursor copy) or the on-screen copy button to copy the key to your clipboard. **Important: copy this key now and paste it somewhere safe (a password manager, or a temporary file). Google only shows the full key once.**

You now have a free Gemini API key. The free tier covers about 1500 requests per day — enough for many full AMASAMYA audits, easily enough for a single team's work.

## Step three — paste the key into AMASAMYA

1. Open any web page in Chrome (this site, a news site, your bank — anything).
2. Press Ctrl + Shift + U. The AMASAMYA side panel opens on the right edge of Chrome.
3. If your screen reader does not automatically move focus to the side panel, press F6 to cycle Chrome's focus through its regions until NVDA announces a region inside the AMASAMYA side panel. F6 may need to be pressed three or four times.
4. Inside the panel, press the H key to navigate by heading. There are four tabs: WCAG Audit, Visual Audit, Settings, and a few others. Navigate to the one labelled "Settings".
5. Activate it. Inside the Settings panel, press B until NVDA announces an edit field labelled "Google Gemini API key" or similar. Tab to it and paste your key with Ctrl + V.
6. Press Tab again until NVDA announces a "Save settings" button. Press Enter or Space. NVDA announces "Settings saved".

The Vision AI features now have what they need. You will not have to do this again — the key is stored locally in your Chrome profile.

## Step four — run your first audit

1. Open any web page you want to audit. Wait for NVDA to announce that the page has finished loading.
2. Press Ctrl + Shift + U. The side panel opens; the audit runs automatically.
3. After about five seconds, NVDA announces that findings are loading. The first time you may want to wait a few more seconds for everything to finalise.
4. Press F6 to move focus into the side panel.
5. Press H to navigate from finding to finding. Each finding is a heading, so the H key takes you from one to the next in a clean rhythm.
6. Inside each finding, NVDA announces the engine name, the WCAG criterion, the severity, the issue, and a one-line fix hint.

If you press Ctrl + Shift + U and nothing happens, the most common cause is that Windows has reserved that key combination for Unicode input. The fix is to assign a different shortcut: go to `chrome://extensions/shortcuts`, find AMASAMYA in the list, navigate to its shortcut field, and bind any combination that is free. Alt + Shift + A is usually safe.

## Step five — export the report

While in the side panel:

1. Press B until you reach a button labelled "Export" or "Export findings". Press Enter.
2. A submenu opens with options: CSV, JSON, HTML, plain text. Tab to the format you want and press Enter.
3. Chrome's download dialog opens. Choose where to save the file. The file lands in your Downloads folder.

For sharing with engineers, the CSV is the most useful format. Open it in Excel or LibreOffice Calc to see the table structure with one row per finding.

## A note on what the report will look like for the first few audits

The first audit you run will produce a finding count that may look alarming — twenty, fifty, a hundred findings is normal for a real-world web page. This is not unusual; it is what every WCAG audit of every modern site looks like. The point is not to be discouraged by the count. The point is to find the patterns: which engine flags the most issues, which severity dominates, which areas of the page are weakest.

We will go through this together on the call. There is no homework attached to this setup guide. If you complete all five steps before we speak, that is helpful. If you do not have time, we can do the setup live during the call.

## If anything fails

Reply to my email with the exact text NVDA announced at the failing step, and which step number. The setup steps above have specific named buttons and named menu items at each stage, so I can usually identify the exact failure mode from one sentence of description.

— Akhilesh Malani
