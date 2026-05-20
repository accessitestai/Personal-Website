# AMASAMYA Beta - Document Index

This folder contains everything you need for the AMASAMYA closed-beta
launch. Every plan document is published in two formats:

- **`.docx`** - accessible Word document, semantic headings, real
  lists, real tables, document title set in core properties so JAWS
  and NVDA announce the document name on open. **This is the format
  to use for reading and printing.**
- **`.md`** - same content as plain Markdown for developers, GitHub
  rendering, and version control. Edit only the `.md` and re-run
  `python beta/md_to_docx.py` to regenerate the `.docx` versions.

## Read in this order

| # | File | Why |
|---|---|---|
| 1 | `funding/strategy.docx` | Frames the funding ask honestly - read this **before** writing any email. |
| 2 | `funding/week-one-action-plan.docx` | Day-by-day actions for the next 7 days. ~6–8 hours of work. |
| 3 | `funding/one-pager.docx` | The single-page brief you attach to every funding email. **Customise the bracketed fields before sending.** |
| 4 | `funding/email-templates.docx` | Six templates: warm angel, cold angel, grant cover letter, pilot customer, friends-and-family, accelerator. |
| 5 | `tester-brief.docx` | The brief beta testers themselves will read once funding lands. |
| 6 | `feedback-form.docx` | Question set to paste into Google Forms (or similar) once you're ready to invite testers. |
| 7 | `outreach-emails.docx` | Templates for inviting beta testers (separate from the funding emails). |
| 8 | `pre-flight-checklist.docx` | Final verification before launch. Run through this the day before sending the first tester invite. |

## Files in repo root

- `../CONTRIBUTORS.docx` - public credit page for beta testers and
  code contributors. Publish at `/amasamya/credits.html` or as a
  `CONTRIBUTORS` page on the site so testers see the credit policy
  before they fill the feedback form.

## Reading these on Windows with JAWS / NVDA

1. Open Word (or LibreOffice Writer / Google Docs - all three handle
   the .docx files correctly).
2. Press `Ctrl+O`, navigate to this folder, open the .docx you want.
3. JAWS / NVDA announces the document title on open.
4. Press `H` to jump heading-by-heading.
5. Press `T` to jump table-by-table (the funding one-pager has two
   tables - Use of Funds and Milestones).
6. Press `L` to jump to the next list.
7. Press `K` to jump to the next link.

## Reading on macOS with VoiceOver

1. Open the .docx in Pages or Word for Mac.
2. VoiceOver announces the document title on open.
3. Use `VO+Cmd+H` to navigate by heading.
4. Use `VO+Cmd+L` to navigate by link.

## Regenerating .docx after editing the .md

```
python beta/md_to_docx.py
```

Requires `python-docx`:

```
pip install python-docx
```

The conversion sets:
- Document title in `docProps/core.xml` (so AT announces it on open).
- Default language `en-US` on the document defaults.
- `Heading 1`/`Heading 2`/`Heading 3` Word styles for `#`/`##`/`###`.
- `List Bullet` / `List Number` Word styles for `-` / `1.` lines.
- `☐` / `☒` checkboxes for GFM task-list items, in a list bullet style.
- Real tables (with first row marked as `tblHeader` so it repeats on
  page breaks) for GFM tables.
- Word `Hyperlink` style for `[text](url)` markdown links - clickable,
  AT-announced as links.
- `Inline Code` character style for inline `` `code` `` - Consolas
  font, AT can announce as code where the screen reader supports it.

## What's deliberately not auto-generated

- **Cover image / logo** - keep these documents plain so AT users
  don't waste time on decorative images. Add only if a sighted
  reviewer specifically asks.
- **Page numbers / footer** - Word's defaults are accessible enough.
  Adding a custom footer in python-docx is fiddly; do it manually in
  Word for any document you'll print.
- **Watermarks** - never add. Watermarks are read out by AT as
  literal text on every page.
