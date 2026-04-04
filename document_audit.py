#!/usr/bin/env python3
"""
AMA11Y Document Accessibility Audit — Command Line Tool
========================================================

Audits PDF and DOCX documents for accessibility issues.
Performs the same checks as the AMA11Y Platform Document Audit tab.

Usage:
    python document_audit.py document.pdf
    python document_audit.py document.docx
    python document_audit.py document.pdf --format json --output results.json
    python document_audit.py *.pdf *.docx --format csv --output batch-results.csv

Author: Akhilesh Malani
Tool:   AMA11Y — Accessibility Management and Audit Layer
"""

import argparse
import csv
import glob
import json
import os
import re
import sys
import zipfile
from datetime import datetime


TOOL_VERSION = '1.0.0'
TOOL_NAME = 'AMA11Y Document Audit CLI'


# ============================================================
# PDF Audit
# ============================================================

def audit_pdf(filepath):
    """Audit a PDF file for accessibility structure."""
    findings = []
    filename = os.path.basename(filepath)

    try:
        with open(filepath, 'rb') as f:
            raw = f.read()
    except Exception as e:
        findings.append({
            'status': 'FAIL',
            'title': 'Could not read file',
            'detail': f'Error reading {filename}: {e}',
            'check': 'File Access'
        })
        return findings

    # Decode as latin-1 for PDF byte stream analysis
    text = raw.decode('latin-1', errors='replace')

    # 1. Tagged status
    if '/MarkInfo' in text and '/Marked true' in text.lower().replace(' ', ''):
        findings.append({
            'status': 'PASS',
            'title': 'PDF is tagged',
            'detail': 'MarkInfo dictionary with Marked true found. The document has a tag structure.',
            'check': 'Tagged Status'
        })
    else:
        findings.append({
            'status': 'FAIL',
            'title': 'PDF is not tagged',
            'detail': 'No MarkInfo dictionary with Marked true found. This PDF has no tag structure '
                       'and is not accessible to screen readers. WCAG SC 1.3.1 / PDF/UA-1 requirement.',
            'check': 'Tagged Status'
        })

    # 2. Language declaration
    lang_match = re.search(r'/Lang\s*\(([^)]+)\)', text)
    if lang_match:
        findings.append({
            'status': 'PASS',
            'title': f'Document language declared: {lang_match.group(1)}',
            'detail': 'Language entry found in the document catalog.',
            'check': 'Language'
        })
    else:
        findings.append({
            'status': 'FAIL',
            'title': 'Document language not declared',
            'detail': 'No /Lang entry found in the document catalog. Screen readers cannot determine '
                       'the document language. WCAG SC 3.1.1 / PDF/UA-1 requirement.',
            'check': 'Language'
        })

    # 3. Title
    title_match = re.search(r'/Title\s*\(([^)]*)\)', text)
    if title_match and title_match.group(1).strip():
        findings.append({
            'status': 'PASS',
            'title': f'Document title present: {title_match.group(1)[:60]}',
            'detail': 'Title found in the document information dictionary.',
            'check': 'Title'
        })
    else:
        findings.append({
            'status': 'FAIL',
            'title': 'Document title missing or empty',
            'detail': 'No /Title entry found or the title is empty. Screen readers announce the '
                       'document title when the file is opened. WCAG SC 2.4.2.',
            'check': 'Title'
        })

    # 4. Heading tags
    heading_count = len(re.findall(r'/(?:H[1-6]|H)\b', text))
    if heading_count > 0:
        findings.append({
            'status': 'PASS',
            'title': f'{heading_count} heading tags found',
            'detail': 'Heading tag elements detected in the structure tree.',
            'check': 'Headings'
        })
    else:
        findings.append({
            'status': 'FAIL',
            'title': 'No heading tags detected',
            'detail': 'No H1 through H6 heading tags detected in the tag tree. Documents without '
                       'headings cannot be navigated by heading in screen readers. WCAG SC 1.3.1 / PDF/UA.',
            'check': 'Headings'
        })

    # 5. Figure alt text
    figure_count = len(re.findall(r'/Figure\b', text))
    alt_count = len(re.findall(r'/Alt\s*\(', text))
    if figure_count > 0:
        if alt_count >= figure_count:
            findings.append({
                'status': 'PASS',
                'title': f'{figure_count} figures, {alt_count} alt text entries',
                'detail': 'Alt text entries detected for figure elements.',
                'check': 'Image Alt Text'
            })
        else:
            findings.append({
                'status': 'FAIL',
                'title': f'{figure_count} figures but only {alt_count} alt text entries',
                'detail': f'{figure_count - alt_count} figures may be missing alternative text. '
                           'WCAG SC 1.1.1 / PDF/UA-1.',
                'check': 'Image Alt Text'
            })
    else:
        findings.append({
            'status': 'INFO',
            'title': 'No figure elements detected',
            'detail': 'No /Figure tags found in the structure tree.',
            'check': 'Image Alt Text'
        })

    # 6. Table headers
    table_count = len(re.findall(r'/Table\b', text))
    th_count = len(re.findall(r'/TH\b', text))
    if table_count > 0:
        if th_count > 0:
            findings.append({
                'status': 'PASS',
                'title': f'{table_count} tables, {th_count} header cells found',
                'detail': 'Table header cells (TH) detected.',
                'check': 'Table Headers'
            })
        else:
            findings.append({
                'status': 'FAIL',
                'title': f'{table_count} tables but no header cells (TH)',
                'detail': 'Tables found without TH header cells. Screen readers cannot identify '
                           'column or row headers. WCAG SC 1.3.1.',
                'check': 'Table Headers'
            })
    else:
        findings.append({
            'status': 'INFO',
            'title': 'No tables detected',
            'detail': 'No /Table tags found in the structure tree.',
            'check': 'Table Headers'
        })

    # 7. Bookmarks
    if '/Outlines' in text:
        findings.append({
            'status': 'PASS',
            'title': 'Bookmark outline present',
            'detail': 'Document outline (bookmarks) detected.',
            'check': 'Bookmarks'
        })
    else:
        findings.append({
            'status': 'WARN',
            'title': 'No bookmarks found',
            'detail': 'No /Outlines tree detected. Long documents should have bookmarks '
                       'for screen reader navigation.',
            'check': 'Bookmarks'
        })

    # 8. Structure tree
    if '/StructTreeRoot' in text:
        findings.append({
            'status': 'PASS',
            'title': 'Structure tree present',
            'detail': 'StructTreeRoot entry found. The document has a structure hierarchy.',
            'check': 'Structure Tree'
        })
    else:
        findings.append({
            'status': 'FAIL',
            'title': 'No structure tree',
            'detail': 'No /StructTreeRoot found. The document has no semantic structure '
                       'and is not accessible. PDF/UA-1 requires a complete structure tree.',
            'check': 'Structure Tree'
        })

    return findings


# ============================================================
# DOCX Audit
# ============================================================

def audit_docx(filepath):
    """Audit a DOCX file for accessibility structure."""
    findings = []
    filename = os.path.basename(filepath)

    try:
        z = zipfile.ZipFile(filepath)
    except Exception as e:
        findings.append({
            'status': 'FAIL',
            'title': 'Could not read file',
            'detail': f'Error reading {filename}: {e}. The file may be corrupted or password-protected.',
            'check': 'File Access'
        })
        return findings

    def read_xml(name):
        try:
            return z.read(name).decode('utf-8', errors='replace')
        except KeyError:
            return ''

    doc_xml = read_xml('word/document.xml')
    sty_xml = read_xml('word/styles.xml')
    set_xml = read_xml('word/settings.xml')

    if not doc_xml:
        findings.append({
            'status': 'FAIL',
            'title': 'Could not read document XML',
            'detail': 'The file does not appear to be a valid DOCX file or it may be password protected.',
            'check': 'File Access'
        })
        return findings

    # 1. Heading styles
    styled_headings = len(re.findall(r'w:styleId="Heading[1-6]"|w:val="Heading [1-6]"', doc_xml))
    if styled_headings == 0:
        findings.append({
            'status': 'FAIL',
            'title': 'No Word heading styles detected',
            'detail': 'No paragraphs using built-in Heading 1 through Heading 6 styles were found. '
                       'Screen readers navigate documents by heading styles. WCAG SC 1.3.1 / PDF/UA.',
            'check': 'Heading Styles'
        })
    else:
        findings.append({
            'status': 'PASS',
            'title': f'{styled_headings} heading style paragraphs found',
            'detail': 'Built-in heading styles detected. Verify the heading hierarchy is logical.',
            'check': 'Heading Styles'
        })

    # 2. Alt text on images
    drawing_count = len(re.findall(r'<w:drawing>', doc_xml))
    alt_attr_count = len([m for m in re.findall(r'descr="([^"]*)"', doc_xml) if m])
    empty_alt = len(re.findall(r'descr=""', doc_xml))

    if drawing_count > 0:
        if alt_attr_count == 0 and empty_alt == 0:
            findings.append({
                'status': 'FAIL',
                'title': f'{drawing_count} images found with no alt text',
                'detail': f'{drawing_count} drawing objects found but no description attributes. '
                           'WCAG SC 1.1.1.',
                'check': 'Image Alt Text'
            })
        elif empty_alt > 0 and alt_attr_count == 0:
            findings.append({
                'status': 'WARN',
                'title': f'{empty_alt} of {drawing_count} images have empty alt text',
                'detail': 'Verify these are intentionally decorative.',
                'check': 'Image Alt Text'
            })
        elif empty_alt > 0:
            findings.append({
                'status': 'WARN',
                'title': f'{empty_alt} images empty alt, {alt_attr_count} have descriptions',
                'detail': 'Verify images marked decorative truly convey no information.',
                'check': 'Image Alt Text'
            })
        else:
            findings.append({
                'status': 'PASS',
                'title': f'{alt_attr_count} of {drawing_count} images have alt text',
                'detail': 'All detected images have description attributes.',
                'check': 'Image Alt Text'
            })
    else:
        findings.append({
            'status': 'INFO',
            'title': 'No image objects detected',
            'detail': 'No drawing elements found in the document.',
            'check': 'Image Alt Text'
        })

    # 3. Table header rows
    table_count = len(re.findall(r'<w:tbl>', doc_xml))
    tbl_header_count = len(re.findall(r'w:tblHeader', doc_xml))
    if table_count > 0 and tbl_header_count == 0:
        findings.append({
            'status': 'FAIL',
            'title': f'{table_count} tables with no header rows marked',
            'detail': 'No rows marked as header rows using Repeat Header Row. WCAG SC 1.3.1.',
            'check': 'Table Headers'
        })
    elif table_count > 0:
        findings.append({
            'status': 'PASS',
            'title': f'{table_count} tables, {tbl_header_count} header rows marked',
            'detail': 'Table header rows detected.',
            'check': 'Table Headers'
        })
    else:
        findings.append({
            'status': 'INFO',
            'title': 'No tables found',
            'detail': 'No table structures detected.',
            'check': 'Table Headers'
        })

    # 4. Document language
    lang_match = re.search(r'w:lang w:val="([^"]+)"', doc_xml)
    lang_set = re.search(r'w:lang w:val="([^"]+)"', set_xml)
    if lang_match:
        findings.append({
            'status': 'PASS',
            'title': f'Document language declared: {lang_match.group(1)}',
            'detail': 'Language attribute found in document content.',
            'check': 'Language'
        })
    elif lang_set:
        findings.append({
            'status': 'PASS',
            'title': f'Document language in settings: {lang_set.group(1)}',
            'detail': 'Language set in document settings.',
            'check': 'Language'
        })
    else:
        findings.append({
            'status': 'FAIL',
            'title': 'Document language not declared',
            'detail': 'No language attribute detected. WCAG SC 3.1.1.',
            'check': 'Language'
        })

    # 5. Lists
    list_count = len(re.findall(r'w:numId', doc_xml))
    manual_bullets = len(re.findall(r'[\u2022\u00b7\u2010\u2011\u2013\u2014]', doc_xml))
    if manual_bullets > 3:
        findings.append({
            'status': 'WARN',
            'title': f'{manual_bullets} possible manual bullet characters',
            'detail': 'Bullet or dash characters found that may be manually typed. WCAG SC 1.3.1.',
            'check': 'Lists'
        })
    if list_count > 0:
        findings.append({
            'status': 'PASS',
            'title': f'{list_count} list style references found',
            'detail': 'Numbered/bulleted list style references detected.',
            'check': 'Lists'
        })
    elif list_count == 0 and manual_bullets <= 3:
        findings.append({
            'status': 'INFO',
            'title': 'No list style references detected',
            'detail': 'No Word list numbering definitions found.',
            'check': 'Lists'
        })

    # 6. Text boxes
    text_box_count = len(re.findall(r'w:txbxContent', doc_xml))
    if text_box_count > 0:
        findings.append({
            'status': 'FAIL',
            'title': f'{text_box_count} text boxes found',
            'detail': 'Text boxes are read in unpredictable order by screen readers. '
                       'Replace with inline content. WCAG SC 1.3.2.',
            'check': 'Text Boxes'
        })
    else:
        findings.append({
            'status': 'PASS',
            'title': 'No text boxes found',
            'detail': 'Content appears to be in the main document flow.',
            'check': 'Text Boxes'
        })

    # 7. Bookmarks
    bookmark_count = len(re.findall(r'<w:bookmarkStart', doc_xml))
    if styled_headings > 3 and bookmark_count < 3:
        findings.append({
            'status': 'WARN',
            'title': 'Document has headings but few bookmarks',
            'detail': 'Long documents with headings should have a table of contents.',
            'check': 'Bookmarks'
        })
    elif bookmark_count > 0:
        findings.append({
            'status': 'PASS',
            'title': f'{bookmark_count} bookmarks found',
            'detail': 'Bookmark elements present for navigation.',
            'check': 'Bookmarks'
        })
    else:
        findings.append({
            'status': 'INFO',
            'title': 'No bookmarks detected',
            'detail': 'Consider adding a table of contents for long documents.',
            'check': 'Bookmarks'
        })

    # 8. Colour contrast
    color_count = len(re.findall(r'w:color w:val="(?!auto|000000)[^"]+"', doc_xml))
    highlight_count = len(re.findall(r'w:highlight', doc_xml))
    if color_count > 0:
        findings.append({
            'status': 'WARN',
            'title': f'{color_count} custom text colour instances',
            'detail': 'Custom colours may fail contrast. Verify 4.5:1 ratio. WCAG SC 1.4.3.',
            'check': 'Colour Contrast'
        })
    else:
        findings.append({
            'status': 'PASS',
            'title': 'No custom text colours detected',
            'detail': 'Text uses default colours.',
            'check': 'Colour Contrast'
        })
    if highlight_count > 0:
        findings.append({
            'status': 'WARN',
            'title': f'{highlight_count} highlighted text instances',
            'detail': 'Ensure information conveyed by highlighting is also in text. WCAG SC 1.4.1.',
            'check': 'Colour Contrast'
        })

    z.close()
    return findings


# ============================================================
# Output Formatters
# ============================================================

def format_text(filepath, findings):
    """Format findings as plain text."""
    lines = [
        f'AMA11Y Document Accessibility Audit',
        '=' * 50,
        f'File:    {os.path.basename(filepath)}',
        f'Path:    {os.path.abspath(filepath)}',
        f'Date:    {datetime.now().strftime("%Y-%m-%d %H:%M")}',
        f'Tool:    {TOOL_NAME} v{TOOL_VERSION}',
        '',
    ]

    fail_count = sum(1 for f in findings if f['status'] == 'FAIL')
    warn_count = sum(1 for f in findings if f['status'] == 'WARN')
    pass_count = sum(1 for f in findings if f['status'] == 'PASS')

    lines.append(f'Summary: {fail_count} failures, {warn_count} warnings, {pass_count} passes')
    lines.append('')
    lines.append('-' * 50)

    for f in findings:
        lines.append(f'[{f["status"]}] {f["title"]}')
        lines.append(f'  Check:  {f["check"]}')
        lines.append(f'  Detail: {f["detail"]}')
        lines.append('')

    lines.append('-' * 50)
    lines.append(f'Generated by {TOOL_NAME} v{TOOL_VERSION}')
    lines.append('AMA11Y — ama11y.akhileshmalani.com — Akhilesh Malani')
    return '\n'.join(lines)


def format_json(filepath, findings):
    """Format findings as JSON."""
    return json.dumps({
        'tool': TOOL_NAME,
        'version': TOOL_VERSION,
        'file': os.path.basename(filepath),
        'path': os.path.abspath(filepath),
        'date': datetime.now().isoformat(),
        'summary': {
            'fail': sum(1 for f in findings if f['status'] == 'FAIL'),
            'warn': sum(1 for f in findings if f['status'] == 'WARN'),
            'pass': sum(1 for f in findings if f['status'] == 'PASS'),
            'info': sum(1 for f in findings if f['status'] == 'INFO'),
            'total': len(findings)
        },
        'findings': findings
    }, indent=2)


def format_csv_rows(filepath, findings):
    """Return CSV rows for findings."""
    rows = []
    for f in findings:
        rows.append([
            os.path.basename(filepath),
            f['status'],
            f['check'],
            f['title'],
            f['detail']
        ])
    return rows


def format_html(filepath, findings):
    """Format findings as an accessible HTML report."""
    filename = os.path.basename(filepath)
    fail_count = sum(1 for f in findings if f['status'] == 'FAIL')
    warn_count = sum(1 for f in findings if f['status'] == 'WARN')
    pass_count = sum(1 for f in findings if f['status'] == 'PASS')

    def esc(s):
        return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')

    rows_html = ''
    for f in findings:
        status_class = f['status'].lower()
        rows_html += (
            f'<tr><td class="status-{status_class}">{esc(f["status"])}</td>'
            f'<td>{esc(f["check"])}</td>'
            f'<td>{esc(f["title"])}</td>'
            f'<td>{esc(f["detail"])}</td></tr>\n'
        )

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Document Audit — {esc(filename)}</title>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font-family:'Segoe UI',system-ui,sans-serif;color:#1a1a1a;background:#fff}}
  a.skip{{position:absolute;top:-999px;left:-999px;background:#003366;color:#fff;padding:8px 16px}}
  a.skip:focus{{top:0;left:0}}
  header{{background:#003366;color:#fff;padding:24px 32px}}
  header h1{{font-size:1.5rem;margin-bottom:4px}}
  header p{{font-size:.88rem;opacity:.85}}
  main{{max-width:1000px;margin:0 auto;padding:32px}}
  h2{{font-size:1.15rem;color:#003366;margin:24px 0 12px;border-bottom:2px solid #e0e8f0;padding-bottom:6px}}
  .summary{{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0 24px}}
  .card{{background:#f0f5fa;border-radius:6px;padding:14px 20px;min-width:100px;text-align:center;border:1px solid #cde}}
  .card .n{{font-size:1.6rem;font-weight:700}}
  .card .l{{font-size:.72rem;color:#555;text-transform:uppercase;letter-spacing:.05em;margin-top:2px}}
  .n-fail{{color:#c0392b}} .n-warn{{color:#d68910}} .n-pass{{color:#1e8449}}
  table{{width:100%;border-collapse:collapse;font-size:.84rem}}
  th{{background:#003366;color:#fff;padding:10px 12px;text-align:left;font-size:.74rem;text-transform:uppercase}}
  td{{padding:10px 12px;border-bottom:1px solid #e8eef5;vertical-align:top;line-height:1.5}}
  tr:nth-child(even) td{{background:#f8fafc}}
  .status-fail{{color:#c0392b;font-weight:700}}
  .status-warn{{color:#d68910;font-weight:700}}
  .status-pass{{color:#1e8449;font-weight:700}}
  .status-info{{color:#2980b9;font-weight:700}}
  footer{{background:#f0f5fa;padding:16px 32px;font-size:.8rem;color:#555;border-top:1px solid #dde}}
</style>
</head>
<body>
<a class="skip" href="#main">Skip to main content</a>
<header role="banner">
  <h1>AMA11Y Document Accessibility Audit</h1>
  <p>File: {esc(filename)} | Date: {datetime.now().strftime("%Y-%m-%d %H:%M")} | Tool: {TOOL_NAME} v{TOOL_VERSION}</p>
</header>
<main id="main">
  <h2>Summary</h2>
  <div class="summary" role="region" aria-label="Finding counts">
    <div class="card"><div class="n n-fail">{fail_count}</div><div class="l">Failures</div></div>
    <div class="card"><div class="n n-warn">{warn_count}</div><div class="l">Warnings</div></div>
    <div class="card"><div class="n n-pass">{pass_count}</div><div class="l">Passes</div></div>
    <div class="card"><div class="n">{len(findings)}</div><div class="l">Total</div></div>
  </div>
  <h2 id="findings-heading">All Findings ({len(findings)})</h2>
  <div role="region" aria-labelledby="findings-heading" style="overflow-x:auto">
    <table aria-label="Document audit findings">
      <thead><tr>
        <th scope="col">Status</th><th scope="col">Check</th>
        <th scope="col">Finding</th><th scope="col">Detail</th>
      </tr></thead>
      <tbody>{rows_html}</tbody>
    </table>
  </div>
</main>
<footer role="contentinfo">
  <p>Generated by {TOOL_NAME} v{TOOL_VERSION} — ama11y.akhileshmalani.com — Akhilesh Malani</p>
</footer>
</body>
</html>'''


# ============================================================
# Main
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description='AMA11Y Document Accessibility Audit — audit PDF and DOCX files for accessibility.',
        epilog='Examples:\n'
               '  python document_audit.py report.pdf\n'
               '  python document_audit.py *.docx --format json -o results.json\n'
               '  python document_audit.py docs/*.pdf docs/*.docx --format csv -o batch.csv',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument('files', nargs='+', help='PDF or DOCX files to audit (supports glob patterns)')
    parser.add_argument('--format', '-f', choices=['text', 'json', 'csv', 'html'],
                        default='text', help='Output format (default: text)')
    parser.add_argument('--output', '-o', help='Output file (default: stdout)')
    args = parser.parse_args()

    # Expand glob patterns
    all_files = []
    for pattern in args.files:
        expanded = glob.glob(pattern)
        if expanded:
            all_files.extend(expanded)
        elif os.path.exists(pattern):
            all_files.append(pattern)
        else:
            print(f'Warning: {pattern} not found, skipping.', file=sys.stderr)

    if not all_files:
        print('Error: No valid files found.', file=sys.stderr)
        sys.exit(1)

    all_results = []
    for filepath in all_files:
        ext = os.path.splitext(filepath)[1].lower()
        if ext == '.pdf':
            findings = audit_pdf(filepath)
        elif ext == '.docx':
            findings = audit_docx(filepath)
        else:
            print(f'Warning: Unsupported file type {ext} for {filepath}, skipping.', file=sys.stderr)
            continue
        all_results.append((filepath, findings))

    # Format output
    if args.format == 'text':
        output_parts = []
        for filepath, findings in all_results:
            output_parts.append(format_text(filepath, findings))
        output = '\n\n'.join(output_parts)

    elif args.format == 'json':
        if len(all_results) == 1:
            output = format_json(all_results[0][0], all_results[0][1])
        else:
            output = json.dumps({
                'tool': TOOL_NAME,
                'version': TOOL_VERSION,
                'date': datetime.now().isoformat(),
                'audits': [
                    json.loads(format_json(fp, fi))
                    for fp, fi in all_results
                ]
            }, indent=2)

    elif args.format == 'csv':
        import io
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(['File', 'Status', 'Check', 'Finding', 'Detail'])
        for filepath, findings in all_results:
            writer.writerows(format_csv_rows(filepath, findings))
        output = buf.getvalue()

    elif args.format == 'html':
        if len(all_results) == 1:
            output = format_html(all_results[0][0], all_results[0][1])
        else:
            # For multiple files, concatenate reports
            output = '\n'.join(format_html(fp, fi) for fp, fi in all_results)

    # Write output
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(output)
        print(f'Audit results written to {args.output}', file=sys.stderr)

        # Print summary to stderr
        for filepath, findings in all_results:
            fail_c = sum(1 for f in findings if f['status'] == 'FAIL')
            warn_c = sum(1 for f in findings if f['status'] == 'WARN')
            pass_c = sum(1 for f in findings if f['status'] == 'PASS')
            print(f'  {os.path.basename(filepath)}: {fail_c} fail, {warn_c} warn, {pass_c} pass',
                  file=sys.stderr)
    else:
        print(output)


if __name__ == '__main__':
    main()
