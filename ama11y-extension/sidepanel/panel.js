/**
 * AMA11Y Extension — Side Panel v3.0
 *
 * Panels:
 *   1. WCAG Audit      — existing 13-engine results
 *   2. Visual Audit    — Focus Narrator (Module 2) + Visual Layout (Module 1)
 *   3. Settings        — Vision AI API keys
 */

(function () {
  'use strict';

  /* ================================================================
     UTILITIES
  ================================================================ */

  const liveRegion = document.getElementById('live-region');

  function announce(text) {
    liveRegion.textContent = '';
    setTimeout(() => { liveRegion.textContent = text; }, 50);
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function csvEscape(val) {
    const s = String(val || '');
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function $(id) { return document.getElementById(id); }

  /* ================================================================
     PANEL TABS — WAI-ARIA Tabs Pattern (horizontal)
  ================================================================ */

  const PANEL_TABS = ['wcag', 'visual', 'settings'];

  function switchPanel(name) {
    PANEL_TABS.forEach(p => {
      const tab   = $('ptab-' + p);
      const panel = $('ppanel-' + p);
      const active = (p === name);
      if (tab)   { tab.setAttribute('aria-selected', String(active)); tab.setAttribute('tabindex', active ? '0' : '-1'); }
      if (panel) { panel.hidden = !active; }
    });
    /* Screen reader announces the tab button naturally on focus — no announce() needed */
  }

  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => switchPanel(tab.id.replace('ptab-', '')));
    tab.addEventListener('keydown', e => {
      const all = Array.from(document.querySelectorAll('.panel-tab'));
      const cur = all.indexOf(tab);
      let next  = null;
      if (e.key === 'ArrowRight') next = all[(cur + 1) % all.length];
      if (e.key === 'ArrowLeft')  next = all[(cur - 1 + all.length) % all.length];
      if (e.key === 'Home')       next = all[0];
      if (e.key === 'End')        next = all[all.length - 1];
      if (next) { e.preventDefault(); switchPanel(next.id.replace('ptab-','')); next.focus(); }
    });
  });

  /* ================================================================
     SETTINGS — load / save API keys
  ================================================================ */

  const anthropicKeyInput = $('anthropic-key');
  const openaiKeyInput    = $('openai-key');
  const settingsStatus    = $('settings-status');

  /* Load saved keys on open */
  chrome.storage.local.get(
    ['ama11y_anthropic_key', 'ama11y_openai_key', 'ama11y_vision_provider'],
    (data) => {
      if (data.ama11y_anthropic_key) anthropicKeyInput.value = data.ama11y_anthropic_key;
      if (data.ama11y_openai_key)    openaiKeyInput.value    = data.ama11y_openai_key;
      const provider = data.ama11y_vision_provider || 'anthropic';
      const radio = document.querySelector(`input[name="vision-provider"][value="${provider}"]`);
      if (radio) radio.checked = true;
    }
  );

  $('save-settings-btn').addEventListener('click', () => {
    const provider = document.querySelector('input[name="vision-provider"]:checked')?.value || 'anthropic';
    chrome.storage.local.set({
      ama11y_anthropic_key:   anthropicKeyInput.value.trim(),
      ama11y_openai_key:      openaiKeyInput.value.trim(),
      ama11y_vision_provider: provider
    }, () => {
      settingsStatus.textContent = 'Settings saved.';
      announce('Settings saved successfully.');
      setTimeout(() => { settingsStatus.textContent = ''; }, 3000);
    });
  });

  $('clear-settings-btn').addEventListener('click', () => {
    chrome.storage.local.remove(
      ['ama11y_anthropic_key', 'ama11y_openai_key', 'ama11y_vision_provider'],
      () => {
        anthropicKeyInput.value = '';
        openaiKeyInput.value    = '';
        settingsStatus.textContent = 'Keys cleared.';
        announce('API keys cleared.');
        setTimeout(() => { settingsStatus.textContent = ''; }, 3000);
      }
    );
  });

  /* ================================================================
     GLOBAL MESSAGE LISTENER
  ================================================================ */

  chrome.runtime.onMessage.addListener((message) => {
    /* WCAG audit */
    if (message.type === 'audit-results') {
      allFindings = message.findings;
      auditMeta   = {
        pageTitle: message.pageTitle || 'Unknown',
        pageUrl:   message.pageUrl   || '',
        timestamp: message.timestamp || new Date().toISOString()
      };
      onAuditComplete();
    } else if (message.type === 'audit-error') {
      announce(`AMA11Y audit error: ${message.error}`);
      $('page-info').textContent = 'Error: ' + message.error;

    /* Focus Narrator */
    } else if (message.type === 'focus-narrator-ui') {
      handleFocusNarratorUI(message);

    /* Visual Layout */
    } else if (message.type === 'visual-layout-ui') {
      handleVisualLayoutUI(message);

    /* State Change Watchdog */
    } else if (message.type === 'state-watchdog-ui') {
      handleStateWatchdogUI(message);
    }
  });

  /* ================================================================
     WCAG AUDIT — existing logic (unchanged)
  ================================================================ */

  let allFindings      = [];
  let filteredFindings = [];
  let auditMeta        = { pageTitle: '', pageUrl: '', timestamp: '' };

  /* Recover last audit from session storage */
  document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.session.get('lastAudit', (data) => {
      if (data?.lastAudit?.type === 'audit-results') {
        allFindings = data.lastAudit.findings;
        auditMeta   = {
          pageTitle: data.lastAudit.pageTitle || 'Unknown',
          pageUrl:   data.lastAudit.pageUrl   || '',
          timestamp: data.lastAudit.timestamp || new Date().toISOString()
        };
        onAuditComplete();
        chrome.storage.session.remove('lastAudit');
      }
    });
  });

  function onAuditComplete() {
    $('page-info').textContent = `${auditMeta.pageTitle} — ${auditMeta.pageUrl}`;

    const fail     = allFindings.filter(f => f.verdict   === 'Fail').length;
    const warn     = allFindings.filter(f => f.verdict   === 'Warning').length;
    const pass     = allFindings.filter(f => f.verdict   === 'Pass').length;
    const info     = allFindings.filter(f => f.verdict   === 'Info').length;
    const critical = allFindings.filter(f => f.severity  === 'Critical' && f.verdict === 'Fail').length;
    const serious  = allFindings.filter(f => f.severity  === 'Serious'  && f.verdict === 'Fail').length;
    const moderate = allFindings.filter(f => f.severity  === 'Moderate' && f.verdict !== 'Pass').length;
    const minor    = allFindings.filter(f => f.severity  === 'Minor').length;

    $('count-fail').textContent  = fail;
    $('count-warn').textContent  = warn;
    $('count-pass').textContent  = pass;
    $('count-info').textContent  = info;
    $('count-total').textContent = allFindings.length;
    $('sev-critical').textContent = critical;
    $('sev-serious').textContent  = serious;
    $('sev-moderate').textContent = moderate;
    $('sev-minor').textContent    = minor;

    const engines = [...new Set(allFindings.map(f => f.engine))].sort();
    $('filter-engine').innerHTML = '<option value="all">All Engines</option>';
    engines.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e; opt.textContent = e;
      $('filter-engine').appendChild(opt);
    });

    $('export-json').disabled = false;
    $('export-html').disabled = false;
    $('export-csv').disabled  = false;
    $('export-text').disabled = false;

    $('filter-engine').value   = 'all';
    $('filter-verdict').value  = 'all';
    $('filter-severity').value = 'all';
    applyFilters();

    announce(`Audit complete. ${fail} failures, ${warn} warnings, ${pass} passes. ${allFindings.length} total findings.`);
  }

  function applyFilters() {
    const eng = $('filter-engine').value;
    const ver = $('filter-verdict').value;
    const sev = $('filter-severity').value;

    filteredFindings = allFindings.filter(f => {
      if (eng !== 'all' && f.engine  !== eng) return false;
      if (ver !== 'all' && f.verdict !== ver) return false;
      if (sev !== 'all' && f.severity !== sev) return false;
      return true;
    });

    renderFindings();

    const isFiltered = eng !== 'all' || ver !== 'all' || sev !== 'all';
    $('findings-count').textContent = `(${filteredFindings.length}${isFiltered ? ' filtered' : ''})`;
    $('filter-status').textContent  = isFiltered ? `Showing ${filteredFindings.length} of ${allFindings.length}.` : '';
  }

  $('filter-engine').addEventListener('change', applyFilters);
  $('filter-verdict').addEventListener('change', applyFilters);
  $('filter-severity').addEventListener('change', applyFilters);

  $('clear-filters').addEventListener('click', () => {
    $('filter-engine').value = 'all'; $('filter-verdict').value = 'all'; $('filter-severity').value = 'all';
    applyFilters(); announce('Filters cleared.');
  });

  function renderFindings() {
    const tbody = $('findings-body');
    if (!filteredFindings.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No findings match the current filters.</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    filteredFindings.forEach((f, idx) => {
      const tr = document.createElement('tr');

      const tdId  = document.createElement('td'); tdId.textContent = f.id;
      const tdEng = document.createElement('td'); tdEng.textContent = f.engine;
      const tdVer = document.createElement('td'); tdVer.textContent = f.verdict; tdVer.className = `verdict-${f.verdict.toLowerCase()}`;
      const tdSev = document.createElement('td'); tdSev.textContent = f.severity; tdSev.className = `severity-${f.severity.toLowerCase()}`;

      const tdIss   = document.createElement('td');
      const toggle  = document.createElement('button');
      toggle.className = 'finding-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', `detail-${idx}`);
      toggle.textContent = f.issue;
      toggle.addEventListener('click', () => {
        const d = $(`detail-${idx}`);
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!expanded));
        d.classList.toggle('expanded');
      });

      const detail = document.createElement('div');
      detail.id = `detail-${idx}`; detail.className = 'finding-detail';
      detail.setAttribute('role', 'region');
      detail.setAttribute('aria-label', `Detail for ${f.id}`);
      detail.innerHTML = `<dl>
        <dt>Element</dt><dd><code>${escHtml(f.element)}</code></dd>
        <dt>Criterion</dt><dd>${escHtml(f.criterion)}</dd>
        <dt>Computed</dt><dd><code>${escHtml(f.computed)}</code></dd>
        <dt>Required</dt><dd>${escHtml(f.required)}</dd>
        <dt>How to Fix</dt><dd>${escHtml(f.howToFix)}</dd>
      </dl>`;

      tdIss.appendChild(toggle); tdIss.appendChild(detail);
      [tdId, tdEng, tdVer, tdSev, tdIss].forEach(td => tr.appendChild(td));
      tbody.appendChild(tr);
    });
  }

  /* Export */
  $('export-json').addEventListener('click', () => {
    downloadFile(JSON.stringify({
      tool: 'AMA11Y', version: '3.0.0', page: auditMeta.pageTitle,
      url: auditMeta.pageUrl, timestamp: auditMeta.timestamp,
      summary: { total: allFindings.length, fail: allFindings.filter(f=>f.verdict==='Fail').length,
        warning: allFindings.filter(f=>f.verdict==='Warning').length,
        pass: allFindings.filter(f=>f.verdict==='Pass').length,
        info: allFindings.filter(f=>f.verdict==='Info').length },
      findings: filteredFindings
    }, null, 2), 'ama11y-audit.json', 'application/json');
    announce('JSON exported.');
  });

  $('export-html').addEventListener('click', () => {
    downloadFile(generateHtmlReport(), 'ama11y-report.html', 'text/html');
    announce('HTML report exported.');
  });

  $('export-csv').addEventListener('click', () => {
    const headers = ['ID','Engine','Element','Criterion','Issue','Computed','Required','Verdict','Severity','How to Fix'];
    const rows    = filteredFindings.map(f =>
      [f.id, f.engine, f.element, f.criterion, f.issue, f.computed, f.required, f.verdict, f.severity, f.howToFix].map(csvEscape));
    downloadFile([headers.join(','), ...rows.map(r => r.join(','))].join('\r\n'), 'ama11y-audit.csv', 'text/csv');
    announce('CSV exported.');
  });

  $('export-text').addEventListener('click', () => {
    const lines = [
      'AMA11Y Accessibility Audit Report', '='.repeat(40),
      `Page: ${auditMeta.pageTitle}`, `URL: ${auditMeta.pageUrl}`, `Date: ${auditMeta.timestamp}`, '',
      `Summary: ${allFindings.filter(f=>f.verdict==='Fail').length} Failures, ${allFindings.filter(f=>f.verdict==='Warning').length} Warnings, ${allFindings.length} Total`, '', '-'.repeat(40), ''
    ];
    filteredFindings.forEach(f => {
      lines.push(`${f.id} [${f.verdict}] [${f.severity}] ${f.engine}`);
      lines.push(`  Issue: ${f.issue}`); lines.push(`  Element: ${f.element}`);
      lines.push(`  Criterion: ${f.criterion}`); lines.push(`  Fix: ${f.howToFix}`); lines.push('');
    });
    downloadFile(lines.join('\n'), 'ama11y-audit.txt', 'text/plain');
    announce('Text exported.');
  });

  /* Export toolbar arrow-key navigation */
  $('export-toolbar').addEventListener('keydown', e => {
    const btns = Array.from($('export-toolbar').querySelectorAll('button:not([disabled])'));
    const idx  = btns.indexOf(document.activeElement);
    if (idx === -1) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown')  { e.preventDefault(); btns[(idx+1) % btns.length].focus(); }
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')    { e.preventDefault(); btns[(idx-1+btns.length) % btns.length].focus(); }
    if (e.key === 'Home') { e.preventDefault(); btns[0].focus(); }
    if (e.key === 'End')  { e.preventDefault(); btns[btns.length-1].focus(); }
  });

  $('reaudit-btn').addEventListener('click', async () => {
    announce('Running audit…');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-script.js'] }); }
      catch (err) { announce('Re-audit error: ' + err.message); }
    }
  });

  function generateHtmlReport() {
    const fail = filteredFindings.filter(f => f.verdict === 'Fail').length;
    const warn = filteredFindings.filter(f => f.verdict === 'Warning').length;
    const pass = filteredFindings.filter(f => f.verdict === 'Pass').length;
    const rows = filteredFindings.map(f => `<tr>
      <td>${escHtml(f.id)}</td><td>${escHtml(f.engine)}</td><td>${escHtml(f.element)}</td>
      <td>${escHtml(f.criterion)}</td><td>${escHtml(f.severity)}</td><td>${escHtml(f.verdict)}</td>
      <td><p>${escHtml(f.issue)}</p><p><strong>Computed:</strong> <code>${escHtml(f.computed)}</code></p>
          <p><strong>Required:</strong> ${escHtml(f.required)}</p>
          <p><strong>Fix:</strong> ${escHtml(f.howToFix)}</p></td></tr>`).join('');
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AMA11Y Audit — ${escHtml(auditMeta.pageTitle)}</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:system-ui,sans-serif;color:#111;background:#fff;}
.skip{position:absolute;top:-999px;left:-999px;background:#003366;color:#fff;padding:8px 16px;}.skip:focus{top:0;left:0;}
header{background:#003366;color:#fff;padding:24px 32px;}header h1{font-size:1.5rem;margin-bottom:4px;}
main{max-width:1200px;margin:0 auto;padding:32px;}h2{color:#003366;margin:24px 0 12px;}
.summary{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0 24px;}
.card{background:#f0f5fa;border:1px solid #cde;border-radius:6px;padding:16px 20px;text-align:center;}
.card .n{font-size:1.8rem;font-weight:700;}.card .l{font-size:.75rem;color:#555;text-transform:uppercase;}
.n-fail{color:#991B1B;}.n-warn{color:#92400E;}.n-pass{color:#065F46;}
table{width:100%;border-collapse:collapse;font-size:.82rem;}
th{background:#003366;color:#fff;padding:10px 12px;text-align:left;}
td{padding:10px 12px;border-bottom:1px solid #e8eef5;vertical-align:top;line-height:1.5;}
tr:nth-child(even)td{background:#f8fafc;}code{font-family:monospace;background:#eef2f7;padding:1px 5px;border-radius:2px;}
footer{background:#f0f5fa;padding:16px 32px;font-size:.8rem;color:#555;border-top:1px solid #dde;}</style>
</head><body><a class="skip" href="#main">Skip to main content</a>
<header><h1>AMA11Y Accessibility Audit</h1>
<p>Page: ${escHtml(auditMeta.pageTitle)} | URL: ${escHtml(auditMeta.pageUrl)} | Date: ${escHtml(auditMeta.timestamp)}</p></header>
<main id="main"><h2>Summary</h2>
<div class="summary">
  <div class="card"><div class="n n-fail">${fail}</div><div class="l">Failures</div></div>
  <div class="card"><div class="n n-warn">${warn}</div><div class="l">Warnings</div></div>
  <div class="card"><div class="n n-pass">${pass}</div><div class="l">Passes</div></div>
  <div class="card"><div class="n">${filteredFindings.length}</div><div class="l">Total</div></div>
</div>
<h2>Findings (${filteredFindings.length})</h2>
<div style="overflow-x:auto;"><table aria-label="Findings">
<thead><tr><th>ID</th><th>Engine</th><th>Element</th><th>Criterion</th><th>Severity</th><th>Verdict</th><th>Detail</th></tr></thead>
<tbody>${rows}</tbody></table></div></main>
<footer>Generated by AMA11Y v3.0.0 — ama11y.akhileshmalani.com — Akhilesh Malani</footer>
</body></html>`;
  }

  /* ================================================================
     MODULE 2: FOCUS INDICATOR NARRATOR
  ================================================================ */

  let fnFindings  = [];
  let fnTotal     = 0;
  let fnRunning   = false;

  $('fn-run-btn').addEventListener('click', () => {
    if (fnRunning) return;
    fnStartUI();
    chrome.runtime.sendMessage({ type: 'focus-narrator-run' });
  });

  function fnStartUI() {
    fnFindings = []; fnTotal = 0; fnRunning = true;
    $('fn-run-btn').disabled = true;
    $('fn-export-btn').disabled = true;
    $('fn-results-wrap').hidden = true;
    $('fn-progress-wrap').hidden = false;
    $('fn-progress-fill').style.width = '0%';
    $('fn-progress-bar').setAttribute('aria-valuenow', '0');
    $('fn-progress-label').textContent = 'Injecting focus narrator…';
    $('fn-results-body').innerHTML = '';
    announce('Focus Indicator Narrator started. Auditing focus states on the active page.');
  }

  function handleFocusNarratorUI(msg) {
    if (msg.phase === 'started') {
      fnTotal = msg.total;
      $('fn-page-title').textContent = msg.title || msg.url || 'Page';
      $('fn-progress-label').textContent = `Checking ${fnTotal} interactive elements…`;
      announce(`Focus Narrator started. ${fnTotal} interactive elements found.`);

    } else if (msg.phase === 'finding') {
      const pct = Math.round(((msg.element.index + 1) / msg.element.total) * 100);
      $('fn-progress-fill').style.width = pct + '%';
      $('fn-progress-bar').setAttribute('aria-valuenow', String(pct));
      $('fn-progress-label').textContent = `Checking element ${msg.element.index + 1} of ${msg.element.total}: ${msg.element.selector}`;

      fnFindings.push({ element: msg.element, finding: msg.finding });
      fnAppendRow(msg.element, msg.finding, fnFindings.length);

      if (!$('fn-results-wrap').hidden === false) {
        $('fn-results-wrap').hidden = false;
      }
      $('fn-results-wrap').hidden = false;

    } else if (msg.phase === 'done') {
      fnRunning = false;
      $('fn-run-btn').disabled = false;
      $('fn-progress-wrap').hidden = true;
      $('fn-export-btn').disabled = false;
      fnUpdateSummary();
      const fails = fnFindings.filter(r => r.finding?.verdict === 'FAIL' || r.finding?.hasIndicator === false).length;
      announce(`Focus Narrator complete. ${fnFindings.length} elements checked. ${fails} focus indicator failures found.`);

    } else if (msg.phase === 'error') {
      fnRunning = false;
      $('fn-run-btn').disabled = false;
      $('fn-progress-wrap').hidden = true;
      $('fn-progress-label').textContent = 'Error: ' + msg.message;
      announce('Focus Narrator error: ' + msg.message);
    }
  }

  function fnAppendRow(el, finding, rowNum) {
    const tbody = $('fn-results-body');
    const tr    = document.createElement('tr');

    const verdict    = finding?.verdict || (finding?.hasIndicator === false ? 'FAIL' : finding?.hasIndicator === true ? 'PASS' : '—');
    const hasFocus   = finding?.hasIndicator;
    const passes247  = finding?.passes_2_4_7;
    const passes2411 = finding?.passes_2_4_11;
    const description = finding?.description || finding?.note || (finding?.error ? 'Error — check API key in Settings.' : '—');
    const indicator  = finding?.indicatorType || (hasFocus ? 'present' : 'none');
    const color      = finding?.color || '';
    const thickness  = finding?.thicknessPx ? finding.thicknessPx + 'px' : '';
    const indicatorText = hasFocus ? `${indicator}${color ? ' ' + color : ''}${thickness ? ' ' + thickness : ''}` : 'None';

    const verdictClass = verdict === 'PASS' ? 'verdict-pass' : verdict === 'FAIL' ? 'verdict-fail' : 'verdict-warn';
    const scToText = v => v === true ? '✓ Pass' : v === false ? '✗ Fail' : '?';

    tr.innerHTML = `
      <td>${rowNum}</td>
      <td><code>${escHtml(el.selector)}</code></td>
      <td>${escHtml(el.label || el.tag)}</td>
      <td class="${verdictClass}">${escHtml(verdict)}</td>
      <td>${escHtml(indicatorText)}</td>
      <td class="${passes247 === true ? 'verdict-pass' : passes247 === false ? 'verdict-fail' : ''}">${scToText(passes247)}</td>
      <td class="${passes2411 === true ? 'verdict-pass' : passes2411 === false ? 'verdict-fail' : ''}">${scToText(passes2411)}</td>
      <td>${escHtml(description)}</td>
    `;
    tbody.appendChild(tr);
  }

  function fnUpdateSummary() {
    const pass  = fnFindings.filter(r => r.finding?.hasIndicator === true  && r.finding?.passes_2_4_7 !== false).length;
    const fail  = fnFindings.filter(r => r.finding?.hasIndicator === false || r.finding?.passes_2_4_7 === false).length;
    const warn  = fnFindings.filter(r => r.finding?.hasIndicator === null  || r.finding?.error).length;
    $('fn-count-pass').textContent  = `${pass} Pass`;
    $('fn-count-fail').textContent  = `${fail} Fail`;
    $('fn-count-warn').textContent  = `${warn} Warning`;
    $('fn-count-total').textContent = `${fnFindings.length} Checked`;
  }

  $('fn-export-btn').addEventListener('click', () => {
    const headers = ['#','Selector','Label','Tag','Verdict','Indicator Type','Color','Thickness','Contrast','SC 2.4.7','SC 2.4.11','Description'];
    const rows = fnFindings.map((r, i) => [
      i + 1,
      r.element.selector,
      r.element.label,
      r.element.tag,
      r.finding?.verdict || (r.finding?.hasIndicator === false ? 'FAIL' : 'PASS'),
      r.finding?.indicatorType || '',
      r.finding?.color || '',
      r.finding?.thicknessPx ? r.finding.thicknessPx + 'px' : '',
      r.finding?.contrastRatio || '',
      r.finding?.passes_2_4_7  === true ? 'Pass' : r.finding?.passes_2_4_7  === false ? 'Fail' : 'Unknown',
      r.finding?.passes_2_4_11 === true ? 'Pass' : r.finding?.passes_2_4_11 === false ? 'Fail' : 'Unknown',
      r.finding?.description || ''
    ].map(csvEscape));
    downloadFile([headers.join(','), ...rows.map(r => r.join(','))].join('\r\n'),
      'ama11y-focus-narrator.csv', 'text/csv');
    announce('Focus Narrator CSV exported.');
  });

  /* ================================================================
     MODULE 1: VISUAL LAYOUT AUDITOR
  ================================================================ */

  let vlaFindings = [];
  let vlaRunning  = false;

  $('vla-run-btn').addEventListener('click', () => {
    if (vlaRunning) return;
    vlaStartUI();
    chrome.runtime.sendMessage({ type: 'visual-layout-run' });
  });

  function vlaStartUI() {
    vlaFindings = []; vlaRunning = true;
    $('vla-run-btn').disabled = true;
    $('vla-export-btn').disabled = true;
    $('vla-results-wrap').hidden = true;
    $('vla-progress-wrap').hidden = false;
    $('vla-progress-fill').style.width = '0%';
    $('vla-progress-bar').setAttribute('aria-valuenow', '0');
    $('vla-progress-label').textContent = 'Attaching debugger…';
    $('vla-breakpoints-container').innerHTML = '';
    announce('Visual Layout Audit started. Checking 4 viewport breakpoints.');
  }

  function handleVisualLayoutUI(msg) {
    if (msg.phase === 'started') {
      $('vla-page-title').textContent = msg.title || msg.url || 'Page';

    } else if (msg.phase === 'breakpoint') {
      const pct = Math.round(((msg.index) / msg.total) * 100);
      $('vla-progress-fill').style.width = pct + '%';
      $('vla-progress-bar').setAttribute('aria-valuenow', String(pct));
      $('vla-progress-label').textContent = `Auditing ${msg.label}…`;

    } else if (msg.phase === 'finding') {
      const pct = Math.round(((msg.index + 1) / msg.total) * 100);
      $('vla-progress-fill').style.width = pct + '%';
      $('vla-progress-bar').setAttribute('aria-valuenow', String(pct));
      vlaFindings.push({ breakpoint: msg.breakpoint, finding: msg.finding, screenshot: msg.screenshot });
      vlaAppendBreakpointCard(msg.breakpoint, msg.finding, msg.screenshot);
      $('vla-results-wrap').hidden = false;

    } else if (msg.phase === 'done') {
      vlaRunning = false;
      $('vla-run-btn').disabled = false;
      $('vla-progress-wrap').hidden = true;
      $('vla-export-btn').disabled = false;
      const totalIssues = vlaFindings.reduce((n, r) => n + (r.finding?.issues?.length || 0), 0);
      announce(`Visual Layout Audit complete. ${totalIssues} visual issues found across 4 breakpoints.`);

    } else if (msg.phase === 'error') {
      vlaRunning = false;
      $('vla-run-btn').disabled = false;
      $('vla-progress-wrap').hidden = true;
      $('vla-progress-label').textContent = 'Error: ' + msg.message;
      announce('Visual Layout Audit error: ' + msg.message);
    }
  }

  function vlaAppendBreakpointCard(bp, finding, screenshot) {
    const container = $('vla-breakpoints-container');
    const hasIssues = finding?.hasIssues && finding?.issues?.length > 0;
    const issues    = finding?.issues || [];

    const card = document.createElement('div');
    card.className = 'vla-bp-card';
    card.setAttribute('aria-label', bp.label + ' breakpoint results');

    const issueRows = issues.map((iss, i) => `
      <tr>
        <td class="severity-${iss.severity}">${escHtml(iss.severity)}</td>
        <td>${escHtml(iss.type)}</td>
        <td>${escHtml(iss.location)}</td>
        <td>${escHtml(iss.description)}</td>
        <td>${escHtml(iss.wcag || '')}</td>
      </tr>`).join('');

    card.innerHTML = `
      <h4 class="vla-bp-label">${escHtml(bp.label)}
        <span class="vla-issue-count ${hasIssues ? 'has-issues' : 'no-issues'}">
          ${hasIssues ? issues.length + ' issue' + (issues.length !== 1 ? 's' : '') : '✓ No issues'}
        </span>
      </h4>
      ${finding?.summary ? `<p class="vla-summary">${escHtml(finding.summary)}</p>` : ''}
      ${screenshot ? `
        <details class="vla-screenshot-details">
          <summary>View screenshot at ${escHtml(bp.label)}</summary>
          <img src="${screenshot}" alt="Screenshot of page at ${escHtml(bp.label)}" class="vla-screenshot"
               style="max-width:100%;margin-top:8px;border:1px solid #ccc;border-radius:4px;">
        </details>` : ''}
      ${hasIssues ? `
        <div style="overflow-x:auto;margin-top:10px;">
          <table class="findings-table" aria-label="Layout issues at ${escHtml(bp.label)}">
            <thead><tr>
              <th scope="col">Severity</th>
              <th scope="col">Type</th>
              <th scope="col">Location</th>
              <th scope="col">Description</th>
              <th scope="col">WCAG</th>
            </tr></thead>
            <tbody>${issueRows}</tbody>
          </table>
        </div>` : ''}
    `;
    container.appendChild(card);
  }

  $('vla-export-btn').addEventListener('click', () => {
    const lines = ['AMA11Y Visual Layout Audit Report', '='.repeat(50), ''];
    vlaFindings.forEach(r => {
      lines.push(`Breakpoint: ${r.breakpoint.label}`);
      lines.push(`Summary: ${r.finding?.summary || 'N/A'}`);
      (r.finding?.issues || []).forEach(iss => {
        lines.push(`  [${iss.severity}] ${iss.type} — ${iss.location}`);
        lines.push(`    ${iss.description} (WCAG ${iss.wcag || 'N/A'})`);
      });
      lines.push('');
    });
    downloadFile(lines.join('\n'), 'ama11y-visual-layout.txt', 'text/plain');
    announce('Visual Layout report exported.');
  });

  /* ================================================================
     MODULE 3: STATE CHANGE WATCHDOG
  ================================================================ */

  let scwEvents  = [];
  let scwRunning = false;

  /* ── Start ── */
  $('scw-start-btn').addEventListener('click', () => {
    if (scwRunning) return;
    scwStartUI();
    chrome.runtime.sendMessage({ type: 'state-watchdog-run' });
  });

  /* ── Stop ── */
  $('scw-stop-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'state-watchdog-stop-request' });
    /* UI update happens when 'stopped' phase arrives */
  });

  /* ── Clear ── */
  $('scw-clear-btn').addEventListener('click', () => {
    scwEvents = [];
    $('scw-results-body').innerHTML = '';
    $('scw-event-count').textContent = '0';
    scwUpdateSummary();
    $('scw-results-wrap').hidden = true;
    $('scw-export-btn').disabled = true;
    $('scw-clear-btn').disabled  = true;
    $('scw-status').textContent = 'Events cleared.';
    announce('State Change Watchdog events cleared.');
    setTimeout(() => { $('scw-status').textContent = scwRunning ? 'Monitoring…' : ''; }, 2000);
  });

  /* ── Export CSV ── */
  $('scw-export-btn').addEventListener('click', () => {
    const headers = ['#', 'Time', 'Verdict', 'Type', 'Element', 'WCAG SC', 'Description'];
    const rows = scwEvents.map(ev => [
      ev.id, ev.time, ev.verdict, ev.eventType,
      ev.selector, ev.wcag, ev.description
    ].map(csvEscape));
    downloadFile(
      [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n'),
      'ama11y-state-watchdog.csv', 'text/csv'
    );
    announce('State Change Watchdog CSV exported.');
  });

  /* ── UI helpers ── */

  function scwStartUI() {
    scwEvents  = [];
    scwRunning = true;
    $('scw-start-btn').disabled = true;
    $('scw-stop-btn').disabled  = false;
    $('scw-clear-btn').disabled = false;
    $('scw-results-body').innerHTML = '';
    $('scw-event-count').textContent = '0';
    scwUpdateSummary();
    $('scw-results-wrap').hidden = true;
    $('scw-export-btn').disabled = true;
    $('scw-status').textContent  = 'Injecting watchdog…';
    announce('State Change Watchdog started. Monitoring the active page for state changes.');
  }

  function scwStopUI(reason) {
    scwRunning = false;
    $('scw-start-btn').disabled = false;
    $('scw-stop-btn').disabled  = true;
    $('scw-status').textContent =
      reason || `Monitoring stopped. ${scwEvents.length} events captured.`;
    $('scw-export-btn').disabled = scwEvents.length === 0;
    announce(`State Change Watchdog stopped. ${scwEvents.length} events recorded.`);
  }

  /* ── Message handler ── */

  function handleStateWatchdogUI(msg) {
    if (msg.phase === 'started') {
      $('scw-status').textContent =
        `Monitoring ${msg.title || msg.url || 'page'}…`;
      announce(`State Change Watchdog active on ${msg.title || 'the page'}.`);

    } else if (msg.phase === 'event') {
      const ev = msg.event;
      scwEvents.push(ev);
      scwAppendRow(ev);
      $('scw-event-count').textContent = scwEvents.length;
      scwUpdateSummary();
      $('scw-results-wrap').hidden = false;
      $('scw-export-btn').disabled = false;

    } else if (msg.phase === 'stopped') {
      scwStopUI(msg.reason || null);

    } else if (msg.phase === 'error') {
      scwRunning = false;
      $('scw-start-btn').disabled = false;
      $('scw-stop-btn').disabled  = true;
      $('scw-status').textContent = 'Error: ' + msg.message;
      announce('State Change Watchdog error: ' + msg.message);
    }
  }

  /* ── Append a row to the results table ── */

  function scwAppendRow(ev) {
    const tbody = $('scw-results-body');
    const tr    = document.createElement('tr');

    const verdictClass =
      ev.verdict === 'Fail'    ? 'verdict-fail'    :
      ev.verdict === 'Warning' ? 'verdict-warning'  :
                                  'verdict-info';

    tr.innerHTML = `
      <td>${ev.id}</td>
      <td>${escHtml(ev.time)}</td>
      <td class="${verdictClass}">${escHtml(ev.verdict)}</td>
      <td>${escHtml(ev.eventType)}</td>
      <td><code>${escHtml(ev.selector)}</code></td>
      <td>${escHtml(ev.wcag)}</td>
      <td>${escHtml(ev.description)}</td>
    `;
    tbody.appendChild(tr);
  }

  /* ── Update summary badge counts ── */

  function scwUpdateSummary() {
    const fail = scwEvents.filter(e => e.verdict === 'Fail').length;
    const warn = scwEvents.filter(e => e.verdict === 'Warning').length;
    const info = scwEvents.filter(e => e.verdict === 'Info').length;
    $('scw-count-fail').textContent = `${fail} Fail`;
    $('scw-count-warn').textContent = `${warn} Warning`;
    $('scw-count-info').textContent = `${info} Info`;
  }

  /* ── Route state-watchdog-ui messages ── */
  /* (Wired into the global message listener above) */

})();
