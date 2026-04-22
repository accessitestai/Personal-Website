/**
 * AMASAMYA Extension — Side Panel Logic
 * Receives audit results, renders accessible UI, handles filtering and export.
 */

(function () {
  'use strict';

  let allFindings = [];
  let filteredFindings = [];
  let auditMeta = { pageTitle: '', pageUrl: '', timestamp: '' };

  // DOM references
  const liveRegion     = document.getElementById('live-region');
  const pageInfo       = document.getElementById('page-info');
  const countFail      = document.getElementById('count-fail');
  const countWarn      = document.getElementById('count-warn');
  const countPass      = document.getElementById('count-pass');
  const countInfo      = document.getElementById('count-info');
  const countTotal     = document.getElementById('count-total');
  const sevCritical    = document.getElementById('sev-critical');
  const sevSerious     = document.getElementById('sev-serious');
  const sevModerate    = document.getElementById('sev-moderate');
  const sevMinor       = document.getElementById('sev-minor');
  const filterEngine   = document.getElementById('filter-engine');
  const filterVerdict  = document.getElementById('filter-verdict');
  const filterSeverity = document.getElementById('filter-severity');
  const clearFiltersBtn = document.getElementById('clear-filters');
  const filterStatus   = document.getElementById('filter-status');
  const findingsCount  = document.getElementById('findings-count');
  const findingsBody   = document.getElementById('findings-body');
  const exportJson     = document.getElementById('export-json');
  const exportHtml     = document.getElementById('export-html');
  const exportCsv      = document.getElementById('export-csv');
  const exportText     = document.getElementById('export-text');
  const reauditBtn     = document.getElementById('reaudit-btn');

  /* ================================================================
     MESSAGE LISTENER
  ================================================================ */

  browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'audit-results') {
      allFindings = message.findings;
      auditMeta = {
        pageTitle: message.pageTitle || 'Unknown',
        pageUrl: message.pageUrl || '',
        timestamp: message.timestamp || new Date().toISOString()
      };
      onAuditComplete();
    } else if (message.type === 'audit-error') {
      announce(`AMASAMYA audit error: ${message.error}`);
      pageInfo.textContent = `Error: ${message.error}`;
    }
  });

  /* ================================================================
     AUDIT COMPLETE — RENDER RESULTS
  ================================================================ */

  function onAuditComplete() {
    // Update page info
    pageInfo.textContent = `${auditMeta.pageTitle} — ${auditMeta.pageUrl}`;

    // Update summary counts
    const fail = allFindings.filter(f => f.verdict === 'Fail').length;
    const warn = allFindings.filter(f => f.verdict === 'Warning').length;
    const pass = allFindings.filter(f => f.verdict === 'Pass').length;
    const info = allFindings.filter(f => f.verdict === 'Info').length;
    const critical = allFindings.filter(f => f.severity === 'Critical' && f.verdict === 'Fail').length;
    const serious  = allFindings.filter(f => f.severity === 'Serious' && f.verdict === 'Fail').length;
    const moderate = allFindings.filter(f => f.severity === 'Moderate' && f.verdict !== 'Pass').length;
    const minor    = allFindings.filter(f => f.severity === 'Minor').length;

    countFail.textContent = fail;
    countWarn.textContent = warn;
    countPass.textContent = pass;
    countInfo.textContent = info;
    countTotal.textContent = allFindings.length;
    sevCritical.textContent = critical;
    sevSerious.textContent = serious;
    sevModerate.textContent = moderate;
    sevMinor.textContent = minor;

    // Populate engine filter
    const engines = [...new Set(allFindings.map(f => f.engine))].sort();
    filterEngine.innerHTML = '<option value="all">All Engines</option>';
    engines.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e;
      opt.textContent = e;
      filterEngine.appendChild(opt);
    });

    // Enable export buttons
    exportJson.disabled = false;
    exportHtml.disabled = false;
    exportCsv.disabled = false;
    exportText.disabled = false;

    // Reset filters and render
    filterEngine.value = 'all';
    filterVerdict.value = 'all';
    filterSeverity.value = 'all';
    applyFilters();

    // Announce to screen reader
    announce(`AMASAMYA audit complete. ${fail} failures, ${warn} warnings, ${pass} passes found. ${allFindings.length} total findings across 13 engines.`);
  }

  /* ================================================================
     FILTERING
  ================================================================ */

  function applyFilters() {
    const eng = filterEngine.value;
    const ver = filterVerdict.value;
    const sev = filterSeverity.value;

    filteredFindings = allFindings.filter(f => {
      if (eng !== 'all' && f.engine !== eng) return false;
      if (ver !== 'all' && f.verdict !== ver) return false;
      if (sev !== 'all' && f.severity !== sev) return false;
      return true;
    });

    renderFindings();

    const isFiltered = eng !== 'all' || ver !== 'all' || sev !== 'all';
    findingsCount.textContent = `(${filteredFindings.length}${isFiltered ? ' filtered' : ''})`;

    if (isFiltered) {
      filterStatus.textContent = `Showing ${filteredFindings.length} of ${allFindings.length} findings.`;
    } else {
      filterStatus.textContent = '';
    }
  }

  filterEngine.addEventListener('change', applyFilters);
  filterVerdict.addEventListener('change', applyFilters);
  filterSeverity.addEventListener('change', applyFilters);

  clearFiltersBtn.addEventListener('click', () => {
    filterEngine.value = 'all';
    filterVerdict.value = 'all';
    filterSeverity.value = 'all';
    applyFilters();
    announce('Filters cleared.');
  });

  /* ================================================================
     RENDER FINDINGS TABLE
  ================================================================ */

  function renderFindings() {
    if (filteredFindings.length === 0) {
      findingsBody.innerHTML = '<tr><td colspan="5" class="empty-state">No findings match the current filters.</td></tr>';
      return;
    }

    findingsBody.innerHTML = '';
    filteredFindings.forEach((f, idx) => {
      const tr = document.createElement('tr');

      // ID cell
      const tdId = document.createElement('td');
      tdId.textContent = f.id;
      tr.appendChild(tdId);

      // Engine cell
      const tdEngine = document.createElement('td');
      tdEngine.textContent = f.engine;
      tr.appendChild(tdEngine);

      // Verdict cell
      const tdVerdict = document.createElement('td');
      tdVerdict.textContent = f.verdict;
      tdVerdict.className = `verdict-${f.verdict.toLowerCase()}`;
      tr.appendChild(tdVerdict);

      // Severity cell
      const tdSev = document.createElement('td');
      tdSev.textContent = f.severity;
      tdSev.className = `severity-${f.severity.toLowerCase()}`;
      tr.appendChild(tdSev);

      // Issue cell with expandable detail
      const tdIssue = document.createElement('td');
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'finding-toggle';
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.setAttribute('aria-controls', `detail-${idx}`);
      toggleBtn.textContent = f.issue;
      toggleBtn.addEventListener('click', () => toggleDetail(toggleBtn, idx));
      toggleBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleDetail(toggleBtn, idx);
        }
      });
      tdIssue.appendChild(toggleBtn);

      const detail = document.createElement('div');
      detail.id = `detail-${idx}`;
      detail.className = 'finding-detail';
      detail.setAttribute('role', 'region');
      detail.setAttribute('aria-label', `Detail for ${f.id}`);
      detail.innerHTML = `
        <dl>
          <dt>Element</dt>
          <dd><code>${escHtml(f.element)}</code></dd>
          <dt>Criterion</dt>
          <dd>${escHtml(f.criterion)}</dd>
          <dt>Computed</dt>
          <dd><code>${escHtml(f.computed)}</code></dd>
          <dt>Required</dt>
          <dd>${escHtml(f.required)}</dd>
          <dt>How to Fix</dt>
          <dd>${escHtml(f.howToFix)}</dd>
        </dl>
      `;
      tdIssue.appendChild(detail);
      tr.appendChild(tdIssue);

      findingsBody.appendChild(tr);
    });
  }

  function toggleDetail(btn, idx) {
    const detail = document.getElementById(`detail-${idx}`);
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    detail.classList.toggle('expanded');
  }

  /* ================================================================
     EXPORT FUNCTIONS
  ================================================================ */

  exportJson.addEventListener('click', () => {
    const data = {
      tool: 'AMASAMYA',
      version: '2.0.0',
      page: auditMeta.pageTitle,
      url: auditMeta.pageUrl,
      timestamp: auditMeta.timestamp,
      summary: {
        total: allFindings.length,
        fail: allFindings.filter(f => f.verdict === 'Fail').length,
        warning: allFindings.filter(f => f.verdict === 'Warning').length,
        pass: allFindings.filter(f => f.verdict === 'Pass').length,
        info: allFindings.filter(f => f.verdict === 'Info').length
      },
      findings: filteredFindings
    };
    downloadFile(JSON.stringify(data, null, 2), 'AMASAMYA-audit.json', 'application/json');
    announce('JSON exported.');
  });

  exportHtml.addEventListener('click', () => {
    const html = generateHtmlReport();
    downloadFile(html, 'AMASAMYA-report.html', 'text/html');
    announce('HTML report exported.');
  });

  exportCsv.addEventListener('click', () => {
    const headers = ['ID','Engine','Element','Criterion','Issue','Computed','Required','Verdict','Severity','How to Fix'];
    const rows = filteredFindings.map(f => [f.id, f.engine, f.element, f.criterion, f.issue, f.computed, f.required, f.verdict, f.severity, f.howToFix].map(csvEscape));
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    downloadFile(csv, 'AMASAMYA-audit.csv', 'text/csv');
    announce('CSV exported.');
  });

  exportText.addEventListener('click', () => {
    const lines = [
      'AMASAMYA Accessibility Audit Report',
      '='.repeat(40),
      `Page: ${auditMeta.pageTitle}`,
      `URL: ${auditMeta.pageUrl}`,
      `Date: ${auditMeta.timestamp}`,
      `Tool: AMASAMYA v2.0.0`,
      '',
      `Summary: ${allFindings.filter(f => f.verdict === 'Fail').length} Failures, ${allFindings.filter(f => f.verdict === 'Warning').length} Warnings, ${allFindings.filter(f => f.verdict === 'Pass').length} Passes, ${allFindings.length} Total`,
      '',
      '-'.repeat(40),
      ''
    ];
    filteredFindings.forEach(f => {
      lines.push(`${f.id} [${f.verdict}] [${f.severity}] ${f.engine}`);
      lines.push(`  Issue: ${f.issue}`);
      lines.push(`  Element: ${f.element}`);
      lines.push(`  Criterion: ${f.criterion}`);
      lines.push(`  Computed: ${f.computed}`);
      lines.push(`  Required: ${f.required}`);
      lines.push(`  Fix: ${f.howToFix}`);
      lines.push('');
    });
    lines.push('-'.repeat(40));
    lines.push('Generated by AMASAMYA v2.0.0 — Private and Confidential');
    downloadFile(lines.join('\n'), 'AMASAMYA-audit.txt', 'text/plain');
    announce('Plain text exported.');
  });

  /* ================================================================
     HTML REPORT GENERATOR
  ================================================================ */

  function generateHtmlReport() {
    const fail = filteredFindings.filter(f => f.verdict === 'Fail').length;
    const warn = filteredFindings.filter(f => f.verdict === 'Warning').length;
    const pass = filteredFindings.filter(f => f.verdict === 'Pass').length;
    const crit = filteredFindings.filter(f => f.severity === 'Critical' && f.verdict === 'Fail').length;
    const ser  = filteredFindings.filter(f => f.severity === 'Serious' && f.verdict === 'Fail').length;

    const rows = filteredFindings.map(f => `<tr>
      <td>${escHtml(f.id)}</td>
      <td>${escHtml(f.engine)}</td>
      <td>${escHtml(f.element)}</td>
      <td>${escHtml(f.criterion)}</td>
      <td>${escHtml(f.severity)}</td>
      <td>${escHtml(f.verdict)}</td>
      <td>
        <p>${escHtml(f.issue)}</p>
        <p><strong>Computed:</strong> <code>${escHtml(f.computed)}</code></p>
        <p><strong>Required:</strong> ${escHtml(f.required)}</p>
        <p><strong>How to fix:</strong> ${escHtml(f.howToFix)}</p>
      </td>
    </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AMASAMYA Audit Report — ${escHtml(auditMeta.pageTitle)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Segoe UI',system-ui,sans-serif;color:#1a1a1a;background:#fff;}
  .skip{position:absolute;top:-999px;left:-999px;background:#003366;color:#fff;padding:8px 16px;}
  .skip:focus{top:0;left:0;}
  header{background:#003366;color:#fff;padding:24px 32px;}
  header h1{font-size:1.6rem;margin-bottom:4px;}
  header p{font-size:.9rem;opacity:.8;}
  main{max-width:1200px;margin:0 auto;padding:32px;}
  h2{font-size:1.2rem;color:#003366;margin:24px 0 12px;border-bottom:2px solid #e0e8f0;padding-bottom:6px;}
  .summary{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0 24px;}
  .card{background:#f0f5fa;border-radius:6px;padding:16px 20px;min-width:110px;text-align:center;border:1px solid #cde;}
  .card .n{font-size:1.8rem;font-weight:700;}
  .card .l{font-size:.75rem;color:#555;text-transform:uppercase;letter-spacing:.05em;margin-top:2px;}
  .n-fail{color:#c0392b;} .n-warn{color:#d68910;} .n-pass{color:#1e8449;}
  table{width:100%;border-collapse:collapse;font-size:.82rem;}
  th{background:#003366;color:#fff;padding:10px 12px;text-align:left;font-size:.75rem;text-transform:uppercase;}
  td{padding:10px 12px;border-bottom:1px solid #e8eef5;vertical-align:top;line-height:1.5;}
  tr:nth-child(even) td{background:#f8fafc;}
  code{font-family:'Cascadia Code',Consolas,monospace;font-size:.8rem;background:#eef2f7;padding:1px 5px;border-radius:2px;}
  footer{background:#f0f5fa;padding:16px 32px;font-size:.8rem;color:#555;border-top:1px solid #dde;}
</style>
</head>
<body>
<a class="skip" href="#main-content">Skip to main content</a>
<header role="banner">
  <h1>AMASAMYA Accessibility Audit Report</h1>
  <p>Page: ${escHtml(auditMeta.pageTitle)} | URL: ${escHtml(auditMeta.pageUrl)} | Date: ${escHtml(auditMeta.timestamp)} | Tool: AMASAMYA v2.0.0</p>
</header>
<main id="main-content">
  <h2>Summary</h2>
  <div class="summary" role="region" aria-label="Finding counts">
    <div class="card"><div class="n n-fail">${fail}</div><div class="l">Failures</div></div>
    <div class="card"><div class="n n-warn">${warn}</div><div class="l">Warnings</div></div>
    <div class="card"><div class="n n-pass">${pass}</div><div class="l">Passes</div></div>
    <div class="card"><div class="n">${filteredFindings.length}</div><div class="l">Total</div></div>
  </div>
  <h2 id="findings-heading">All Findings (${filteredFindings.length})</h2>
  <div role="region" aria-labelledby="findings-heading" style="overflow-x:auto;">
    <table aria-label="Accessibility audit findings">
      <thead><tr>
        <th scope="col">ID</th><th scope="col">Engine</th><th scope="col">Element</th>
        <th scope="col">Criterion</th><th scope="col">Severity</th><th scope="col">Verdict</th>
        <th scope="col">Detail and Remediation</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</main>
<footer role="contentinfo">
  <p>Generated by AMASAMYA v2.0.0 — AMASAMYA.akhileshmalani.com — Private and Confidential — Akhilesh Malani</p>
</footer>
</body>
</html>`;
  }

  /* ================================================================
     RE-AUDIT
  ================================================================ */

  reauditBtn.addEventListener('click', async () => {
    announce('Running audit...');
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      try {
        await browser.tabs.executeScript(tab.id, {
          file: 'content-script.js'
        });
      } catch (err) {
        announce(`Re-audit error: ${err.message}`);
      }
    }
  });

  /* ================================================================
     EXPORT TOOLBAR ARROW KEY NAVIGATION
  ================================================================ */

  const toolbar = document.getElementById('export-toolbar');
  toolbar.addEventListener('keydown', (e) => {
    const buttons = Array.from(toolbar.querySelectorAll('button:not([disabled])'));
    const idx = buttons.indexOf(document.activeElement);
    if (idx === -1) return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[(idx + 1) % buttons.length].focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(idx - 1 + buttons.length) % buttons.length].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      buttons[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      buttons[buttons.length - 1].focus();
    }
  });

  /* ================================================================
     UTILITIES
  ================================================================ */

  function announce(text) {
    liveRegion.textContent = '';
    setTimeout(() => { liveRegion.textContent = text; }, 50);
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function csvEscape(val) {
    const s = String(val || '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

})();
