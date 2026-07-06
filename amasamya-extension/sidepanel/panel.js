/**
 * AMASAMYA Extension - Side Panel v4.3.0
 *
 * Panels:
 *   1. WCAG Audit      - 24 engines + v4.3.0 Audit Diff and History
 *   2. Visual Audit    - Focus Narrator (Module 2) + Visual Layout (Module 1)
 *   3. Settings        - Vision AI API keys
 *   4. Site Crawl      - v4.2.0
 */

(function () {
  'use strict';

  /* ================================================================
     UTILITIES
  ================================================================ */

  const liveRegionPolite    = document.getElementById('live-region-polite');
  const liveRegionAssertive = document.getElementById('live-region-assertive');

  /*
    announce(text)               -> polite (default, status messages).
    announce(text, 'assertive')  -> interrupts current screen-reader speech,
                                    use only for errors and security alerts.
    The empty-string-then-setTimeout dance forces re-announcement when the
    same message arrives twice in a row.
  */
  function announce(text, urgency) {
    const region = (urgency === 'assertive') ? liveRegionAssertive : liveRegionPolite;
    region.textContent = '';
    setTimeout(() => { region.textContent = text; }, 50);
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

  /*
    Render the keyboard shortcut hint using the chord that is
    actually bound on the user's machine, not the manifest's
    suggested default. Chrome leaves shortcuts unbound at install
    time more often than the docs admit, especially for unpacked
    extensions and for chords that look like they might conflict
    with the host OS (Ctrl+Shift+U on ChromeOS/Linux being the
    canonical example).

    chrome.commands.getAll() returns the current bound shortcut
    for every registered command. If the action is unbound we
    tell the user how to bind one rather than promising a chord
    that does nothing.

    The manifest suggests Alt+Shift+1 as the default. Moved from
    Alt+Shift+Period after Akhilesh reported that JAWS reserves
    Alt+Shift+. for "read column header" in tables. Alt+Shift+,
    is also a JAWS reserved chord (read row header), so both
    punctuation keys Chrome allows are JAWS-conflicted. Digits
    with Alt+Shift are free in NVDA, JAWS, VoiceOver, every
    desktop OS, and every major browser. Users on machines where
    Alt+Shift+1 still clashes can remap via
    chrome://extensions/shortcuts.
  */
  function platformShortcutFallback() {
    let isMac = false;
    const uaData = navigator.userAgentData;
    if (uaData && typeof uaData.platform === 'string') {
      isMac = uaData.platform.toLowerCase() === 'macos';
    } else if (typeof navigator.platform === 'string') {
      isMac = /mac/i.test(navigator.platform);
    }
    /* Alt is "Option" on Mac. Render with the on-platform name so a
       Mac user is not searching the keyboard for a key labelled Alt. */
    return isMac ? 'Option+Shift+1' : 'Alt+Shift+1';
  }

  function updateShortcutHint() {
    const empty = $('empty-state-row');
    if (!empty) return;
    /* Try the live binding first. If chrome.commands is unavailable
       (e.g. running the panel as a file:// preview), fall back to
       the platform-aware suggested chord. */
    try {
      if (chrome.commands && typeof chrome.commands.getAll === 'function') {
        chrome.commands.getAll().then((cmds) => {
          const cmd = (cmds || []).find(c => c.name === '_execute_action');
          if (cmd && cmd.shortcut) {
            empty.textContent = `Press ${cmd.shortcut} on any page to run an audit. You can change this at chrome://extensions/shortcuts.`;
          } else {
            empty.textContent = `No keyboard shortcut is set. Click the AMASAMYA toolbar icon, or assign a shortcut at chrome://extensions/shortcuts. The suggested default is ${platformShortcutFallback()}.`;
          }
        }).catch(() => {
          empty.textContent = `Press ${platformShortcutFallback()} on any page to run an audit, or click the AMASAMYA toolbar icon. You can change the shortcut at chrome://extensions/shortcuts.`;
        });
        return;
      }
    } catch (_) { /* chrome.commands might throw in unusual contexts */ }
    empty.textContent = `Press ${platformShortcutFallback()} on any page to run an audit, or click the AMASAMYA toolbar icon. You can change the shortcut at chrome://extensions/shortcuts.`;
  }

  document.addEventListener('DOMContentLoaded', updateShortcutHint);

  /* ================================================================
     PANEL TABS - WAI-ARIA Tabs Pattern (horizontal)
  ================================================================ */

  /*
    v4.2.0 feature flag for Site Crawl. Mirrors the same constant in
    background.js. When false (default in v4.0.x) the Site Crawl tab
    is hidden from the tab list, removed from PANEL_TABS so arrow-key
    navigation skips it, and the panel content stays display:none.
    Single-source-of-truth is enforced at release time by flipping
    both occurrences together; commit L of the v4.2.0 plan does this.
  */
  const SITE_CRAWL_ENABLED = true; /* v4.2.0 K calibration in progress */
  const PANEL_TABS = SITE_CRAWL_ENABLED
    ? ['wcag', 'visual', 'settings', 'crawl']
    : ['wcag', 'visual', 'settings'];

  /* Hide the Site Crawl tab list item, the tab button itself, and
     the tabpanel while the flag is off. Hiding only the parent <li>
     would still leave the .panel-tab button discoverable by
     document.querySelectorAll, which would distort the arrow-key
     navigation cycle (ArrowLeft from WCAG would wrap to the hidden
     Site Crawl tab instead of Settings). Setting `hidden` on the
     button itself lets the keyboard handler filter cleanly. */
  if (!SITE_CRAWL_ENABLED) {
    const crawlItem  = $('ptab-crawl-item');
    const crawlBtn   = $('ptab-crawl');
    const crawlPanel = $('ppanel-crawl');
    if (crawlItem)  crawlItem.hidden = true;
    if (crawlBtn)   crawlBtn.hidden  = true;
    if (crawlPanel) crawlPanel.hidden = true;
  } else {
    const crawlItem = $('ptab-crawl-item');
    const crawlBtn  = $('ptab-crawl');
    if (crawlItem) crawlItem.hidden = false;
    if (crawlBtn)  crawlBtn.hidden  = false;
  }

  function switchPanel(name) {
    PANEL_TABS.forEach(p => {
      const tab   = $('ptab-' + p);
      const panel = $('ppanel-' + p);
      const active = (p === name);
      if (tab)   { tab.setAttribute('aria-selected', String(active)); tab.setAttribute('tabindex', active ? '0' : '-1'); }
      if (panel) { panel.hidden = !active; }
    });
    /* Screen reader announces the tab button naturally on focus - no announce() needed */
  }

  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => switchPanel(tab.id.replace('ptab-', '')));
    tab.addEventListener('keydown', e => {
      /* Filter to currently-visible tabs only so the Site Crawl tab
         is not in the arrow-key cycle while its feature flag is off. */
      const all = Array.from(document.querySelectorAll('.panel-tab')).filter(t => !t.hidden);
      const cur = all.indexOf(tab);
      if (cur < 0) return;
      let next  = null;
      if (e.key === 'ArrowRight') next = all[(cur + 1) % all.length];
      if (e.key === 'ArrowLeft')  next = all[(cur - 1 + all.length) % all.length];
      if (e.key === 'Home')       next = all[0];
      if (e.key === 'End')        next = all[all.length - 1];
      if (next) { e.preventDefault(); switchPanel(next.id.replace('ptab-','')); next.focus(); }
    });
  });

  /* ================================================================
     CLOSE BUTTON + ESCAPE-KEY FOCUS TRAP
     ----------------------------------------------------------------
     Two related concerns for screen-reader users:

     1. Chrome's default behaviour when Escape is pressed inside a
        side panel is to keep the panel visible but yank keyboard
        focus back to the underlying page tab. For an NVDA/JAWS user
        navigating the findings table this is disorienting: the
        panel is still there but their reading cursor has jumped to
        a completely different document. Suppress the default and
        keep focus inside the panel.

     2. There was no explicit way to close the panel from inside
        it. Add a visible "Close" button in the header that calls
        window.close() - this is the supported MV3 side-panel close
        path. ========================================================= */

  /* ================================================================
     v4.2.1 - Close-confirmation dialog, focus-into, and Tab trap.
     ----------------------------------------------------------------
     Three related concerns for screen-reader users:

     1. Focus-into: activating the toolbar icon opens the side panel
        but leaves keyboard focus on the toolbar. The user's next Tab
        moves through browser chrome instead of into the panel.
        Fixed by focusing the currently-selected tab as soon as the
        panel's DOM is ready.

     2. Focus trap: Chrome side panels do not naturally trap Tab.
        After the last focusable element in the panel, Tab moves to
        browser chrome and the user is stranded. Intercept Tab /
        Shift+Tab at the document level and wrap within the panel's
        own focusable set.

     3. Close confirmation: Escape is a common finger-slip when
        clearing JAWS speech. Both the Close button and Escape now
        raise a confirm dialog. Focus starts on Cancel so a stray
        Enter after triggering close does not confirm.
  ================================================================ */

  const closeBtn        = $('close-panel-btn');
  const confirmDialog   = $('close-confirm-dialog');
  const confirmYesBtn   = $('close-confirm-yes');
  const confirmNoBtn    = $('close-confirm-cancel');
  let   focusBeforeDialog = null;

  function panelFocusables() {
    /* All visible, non-disabled focusables inside the panel, EXCLUDING
       elements inside the close-confirm dialog (that is a separate
       trap while it is open). Filters offsetParent to catch things
       hidden by an ancestor's `hidden` attribute or `display:none`. */
    const nodes = document.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), ' +
      'select:not([disabled]), textarea:not([disabled]), ' +
      '[tabindex]:not([tabindex="-1"])'
    );
    const list = [];
    for (const el of nodes) {
      if (confirmDialog && confirmDialog.contains(el)) continue;
      if (el.offsetParent === null && el !== document.activeElement) continue;
      list.push(el);
    }
    return list;
  }

  function dialogFocusables() {
    return [confirmNoBtn, confirmYesBtn].filter(Boolean);
  }

  function dialogIsOpen() {
    return confirmDialog && !confirmDialog.hasAttribute('hidden');
  }

  function openConfirmDialog() {
    if (!confirmDialog || dialogIsOpen()) return;
    focusBeforeDialog = document.activeElement;
    confirmDialog.removeAttribute('hidden');
    /* Announce the confirmation politely; assertive would step on
       whatever the user was reading and this action is not urgent. */
    announce('Close AMASAMYA panel? Choose Cancel to keep the panel open, or Yes to close it.');
    /* Default focus goes to Cancel (safer default). */
    if (confirmNoBtn) confirmNoBtn.focus();
  }

  function closeConfirmDialog(restoreFocus) {
    if (!confirmDialog) return;
    confirmDialog.setAttribute('hidden', '');
    if (restoreFocus && focusBeforeDialog && typeof focusBeforeDialog.focus === 'function') {
      try { focusBeforeDialog.focus(); } catch (_) { /* stale */ }
    }
    focusBeforeDialog = null;
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', openConfirmDialog);
  }
  if (confirmYesBtn) {
    confirmYesBtn.addEventListener('click', () => {
      try { window.close(); } catch (_) { /* nothing to do */ }
    });
  }
  if (confirmNoBtn) {
    confirmNoBtn.addEventListener('click', () => {
      closeConfirmDialog(true);
      announce('Panel kept open.');
    });
  }

  /* Escape + Tab trap. Both share the same document-level keydown
     listener so their interactions with the dialog stay coherent. */
  document.addEventListener('keydown', (e) => {

    /* Escape handling. */
    if (e.key === 'Escape') {
      /* If the confirm dialog is open, Escape cancels it (equivalent
         to pressing Cancel). This is the standard modal pattern. */
      if (dialogIsOpen()) {
        e.preventDefault();
        e.stopPropagation();
        closeConfirmDialog(true);
        announce('Close cancelled. Panel kept open.');
        return;
      }
      /* Do not interfere with native Escape behaviour on editable
         form controls (closing a native <select> dropdown, etc.). */
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toUpperCase() : '';
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable);
      if (editable) return;
      /* Otherwise Escape is treated as a close request: raise the
         confirmation dialog. User's explicit request 2026-07-01:
         every close path must confirm, to guard against accidental
         Escape presses. */
      e.preventDefault();
      e.stopPropagation();
      openConfirmDialog();
      return;
    }

    /* Tab focus trap. Applied to the whole document while the panel
       is open. When the confirm dialog is up, trap inside the dialog;
       otherwise trap inside the panel as a whole. */
    if (e.key !== 'Tab') return;
    const list = dialogIsOpen() ? dialogFocusables() : panelFocusables();
    if (list.length === 0) return;
    const first = list[0];
    const last  = list[list.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !list.includes(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last || !list.includes(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  }, true);

  /* Focus-into. Move focus to the currently-selected panel tab as
     soon as the DOM is ready, so the user's first Tab press moves
     through the panel, not back to the toolbar. Wrapped in a
     requestAnimationFrame + setTimeout so we run after Chrome has
     fully attached the side-panel iframe; without the small delay
     Chrome sometimes reclaims focus for the toolbar after we set it.
     Announces the current tab so JAWS / NVDA users hear where focus
     landed. */
  function focusIntoPanel() {
    const selectedTab = document.querySelector('.panel-tab[aria-selected="true"]');
    if (!selectedTab) return;
    try { selectedTab.focus(); } catch (_) { /* stale */ }
  }
  window.requestAnimationFrame(() => setTimeout(focusIntoPanel, 30));

  /* ================================================================
     SETTINGS - load / save API keys
  ================================================================ */

  /* v3.4.0 - Gemini added as a third provider option. Default for new
     installs is gemini (free-tier, easiest first-time setup). Existing
     installs preserve their prior provider choice. */
  const anthropicKeyInput = $('anthropic-key');
  const openaiKeyInput    = $('openai-key');
  const geminiKeyInput    = $('gemini-key');
  const settingsStatus    = $('settings-status');

  /* Load saved keys on open */
  chrome.storage.local.get(
    ['AMASAMYA_anthropic_key', 'AMASAMYA_openai_key', 'AMASAMYA_gemini_key', 'AMASAMYA_vision_provider'],
    (data) => {
      if (data.AMASAMYA_anthropic_key) anthropicKeyInput.value = data.AMASAMYA_anthropic_key;
      if (data.AMASAMYA_openai_key)    openaiKeyInput.value    = data.AMASAMYA_openai_key;
      if (data.AMASAMYA_gemini_key)    geminiKeyInput.value    = data.AMASAMYA_gemini_key;
      /* Default to gemini for new installs; preserve prior choice otherwise. */
      const provider = data.AMASAMYA_vision_provider || 'gemini';
      const radio = document.querySelector(`input[name="vision-provider"][value="${provider}"]`);
      if (radio) radio.checked = true;
    }
  );

  $('save-settings-btn').addEventListener('click', () => {
    const provider = document.querySelector('input[name="vision-provider"]:checked')?.value || 'gemini';
    chrome.storage.local.set({
      AMASAMYA_anthropic_key:   anthropicKeyInput.value.trim(),
      AMASAMYA_openai_key:      openaiKeyInput.value.trim(),
      AMASAMYA_gemini_key:      geminiKeyInput.value.trim(),
      AMASAMYA_vision_provider: provider
    }, () => {
      /* v4.2.1 K8: leave the confirmation on screen persistently. The
         previous 3 s clear was too short for JAWS / NVDA users who
         tab away from the button and back to verify the save landed;
         by the time they reached the status line it was already
         wiped. The live-region announce() still fires immediately,
         but the text stays so a later visit can re-read it. */
      settingsStatus.textContent = 'Settings saved.';
      announce('Settings saved successfully.');
    });
  });

  $('clear-settings-btn').addEventListener('click', () => {
    chrome.storage.local.remove(
      ['AMASAMYA_anthropic_key', 'AMASAMYA_openai_key', 'AMASAMYA_gemini_key', 'AMASAMYA_vision_provider'],
      () => {
        anthropicKeyInput.value = '';
        openaiKeyInput.value    = '';
        geminiKeyInput.value    = '';
        /* v4.2.1 K8: same rationale as Save above - keep the text. */
        settingsStatus.textContent = 'Keys cleared.';
        announce('API keys cleared.');
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
      announce(`AMASAMYA audit error: ${message.error}`, 'assertive');
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

    /* Annotated Screenshot */
    } else if (message.type === 'annotated-screenshot-ready') {
      downloadFile(message.dataUrl, 'AMASAMYA-annotated.png', 'image/png');
      $('export-annotated').disabled = false;
      $('export-annotated').textContent = 'Annotated screenshot';
      announce(`Annotated screenshot exported (${message.count} issues marked).`);
    } else if (message.type === 'annotated-screenshot-error') {
      $('export-annotated').disabled = false;
      $('export-annotated').textContent = 'Annotated screenshot';
      announce('Screenshot failed: ' + message.message, 'assertive');
    }
  });

  /* ================================================================
     WCAG AUDIT - existing logic (unchanged)
  ================================================================ */

  let allFindings      = [];
  let filteredFindings = [];
  let auditMeta        = { pageTitle: '', pageUrl: '', timestamp: '' };

  /* v4.3.0: Audit Diff and History state.
     diffTagged[]      - findings augmented with diffVerdict, or [] when
                         no comparison audit is available.
     diffSummary       - { new, regressed, unchanged, resolved } or null.
     diffAgainst       - the previous audit record we compared against,
                         or null.
     historyList[]     - the full history for the current URL, sorted
                         newest first. Used by renderHistoryTable().
     historyLoadingUrl - URL for which the last history fetch was
                         requested; guards against race conditions when
                         the user switches URLs rapidly. */
  let diffTagged        = [];
  let diffSummary       = null;
  let diffAgainst       = null;
  let historyList       = [];
  let historyLoadingUrl = '';

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
      } else if (data?.lastAudit?.type === 'audit-error') {
        /* Surface restricted-URL or injection errors that were
           dispatched by background.js before the side panel had
           a chance to subscribe to chrome.runtime messages. */
        announce(`AMASAMYA audit error: ${data.lastAudit.error}`, 'assertive');
        $('page-info').textContent = 'Error: ' + data.lastAudit.error;
        chrome.storage.session.remove('lastAudit');
      }
    });
  });

  function onAuditComplete() {
    $('page-info').textContent = `${auditMeta.pageTitle} - ${auditMeta.pageUrl}`;

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
    /* Keep the focusable card's aria-label in sync so a screen-reader
       Tab announces e.g. "Failures: 3" rather than just the number. */
    $('card-fail').setAttribute('aria-label',  `Failures: ${fail}`);
    $('card-warn').setAttribute('aria-label',  `Warnings: ${warn}`);
    $('card-pass').setAttribute('aria-label',  `Passes: ${pass}`);
    $('card-info').setAttribute('aria-label',  `Info: ${info}`);
    $('card-total').setAttribute('aria-label', `Total: ${allFindings.length}`);
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

    $('export-json').disabled      = false;
    $('export-html').disabled      = false;
    $('export-csv').disabled       = false;
    $('export-text').disabled      = false;
    $('export-sarif').disabled     = false;
    $('export-annotated').disabled = false;
    $('save-baseline-btn').disabled = false;
    baselineLoadAndCompare();

    $('filter-engine').value   = 'all';
    $('filter-verdict').value  = 'all';
    $('filter-severity').value = 'all';

    /* v4.3.0: fetch history and diff BEFORE applyFilters so the first
       render already includes the Change column badges. */
    loadHistoryAndDiff().then(() => {
      applyFilters();
      announce(diffSummaryAnnouncement(fail, warn, pass, allFindings.length));
    }).catch(() => {
      /* If history is unavailable for any reason, still render the audit. */
      applyFilters();
      announce(`Audit complete. ${fail} failures, ${warn} warnings, ${pass} passes. ${allFindings.length} total findings.`);
    });
  }

  /* v4.3.0: sentence that both the polite live region reads out and
     the diff-summary card renders visually. Reads as normal English
     when a diff exists ("...Compared to your last audit on
     6 July 2026: 3 new, 1 regressed, 2 resolved.") and as the plain
     audit sentence when it does not. */
  function diffSummaryAnnouncement(fail, warn, pass, total) {
    const base = `Audit complete. ${fail} failures, ${warn} warnings, ${pass} passes. ${total} total findings.`;
    if (!diffSummary || !diffAgainst) return base;
    const when = new Date(diffAgainst.timestamp).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    return base + ` Compared to your last audit on ${when}: ${diffSummary.new} new, ${diffSummary.regressed} regressed, ${diffSummary.resolved} resolved.`;
  }

  /* v4.3.0: history + diff coordination.
     - Queries the background service worker (which owns the storage
       APIs) rather than reading chrome.storage.local directly, so the
       side panel does not need to duplicate storage schema knowledge.
     - Rebuilds the diff view AND the History section as a single
       coordinated step to avoid intermediate flicker.
     - Guards against races: if the user runs a second audit while the
       first history fetch is still pending, historyLoadingUrl acts as
       a version check. */
  function loadHistoryAndDiff() {
    /* Reset. */
    diffTagged  = [];
    diffSummary = null;
    diffAgainst = null;
    historyList = [];
    const url   = auditMeta.pageUrl || '';
    if (!url || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      hideDiffAndHistoryUi();
      return Promise.resolve();
    }
    historyLoadingUrl = url;
    return Promise.all([
      askBackground({ type: 'history-request', action: 'list',     url: url }),
      askBackground({ type: 'history-request', action: 'previous', url: url, timestamp: auditMeta.timestamp })
    ]).then(([listRes, prevRes]) => {
      /* Race guard. */
      if (historyLoadingUrl !== url) return;
      historyList = (listRes && Array.isArray(listRes.list)) ? listRes.list : [];
      const previous = (prevRes && prevRes.audit) || null;
      if (previous && Array.isArray(previous.findings) && window.AMASAMYAAuditDiff) {
        const result = window.AMASAMYAAuditDiff.diffAudits(allFindings, previous.findings);
        diffTagged  = result.tagged;
        diffSummary = result.summary;
        diffAgainst = previous;
      }
      renderDiffSummary();
      renderHistoryTable();
      toggleChangeColumn(!!diffAgainst);
    }).catch(() => {
      hideDiffAndHistoryUi();
    });
  }

  function askBackground(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (resp) => {
          if (chrome.runtime.lastError) return resolve(null);
          resolve(resp || null);
        });
      } catch (_) { resolve(null); }
    });
  }

  function hideDiffAndHistoryUi() {
    const ds = $('diff-summary');
    if (ds) { ds.hidden = true; ds.textContent = ''; }
    const hs = $('history-section');
    if (hs) hs.hidden = true;
    toggleChangeColumn(false);
  }

  function renderDiffSummary() {
    const ds = $('diff-summary');
    if (!ds) return;
    if (!diffSummary || !diffAgainst) {
      ds.hidden = true; ds.textContent = ''; return;
    }
    const when = new Date(diffAgainst.timestamp).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    ds.textContent = `Compared to your last audit on ${when}: ${diffSummary.new} new, ${diffSummary.regressed} regressed, ${diffSummary.unchanged} unchanged, ${diffSummary.resolved} resolved.`;
    ds.hidden = false;
  }

  function renderHistoryTable() {
    const section = $('history-section');
    const body    = $('history-body');
    if (!section || !body) return;
    if (!historyList.length) { section.hidden = true; return; }
    section.hidden = false;
    body.innerHTML = '';
    historyList.forEach((entry) => {
      const tr    = document.createElement('tr');
      const tdWhen = document.createElement('td');
      const when   = new Date(entry.timestamp).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      tdWhen.textContent = when;
      const tdCount = document.createElement('td');
      tdCount.textContent = String((entry.counts && entry.counts.total) || (entry.findings ? entry.findings.length : 0));
      const tdAction = document.createElement('td');
      const isCurrent = entry.timestamp === auditMeta.timestamp;
      if (isCurrent) {
        tr.classList.add('history-row-current');
        tdAction.textContent = 'Current';
        tr.setAttribute('aria-label', `Audit from ${when}, ${tdCount.textContent} findings, currently loaded.`);
      } else {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-small';
        btn.textContent = 'Load';
        btn.setAttribute('aria-label', `Load audit from ${when} with ${tdCount.textContent} findings, and compare with what came before it.`);
        btn.addEventListener('click', () => loadHistoricalAudit(entry));
        tdAction.appendChild(btn);
        tr.setAttribute('aria-label', `Audit from ${when}, ${tdCount.textContent} findings. Press the Load button in this row to open it.`);
      }
      tr.appendChild(tdWhen);
      tr.appendChild(tdCount);
      tr.appendChild(tdAction);
      body.appendChild(tr);
    });
  }

  function toggleChangeColumn(showColumn) {
    const table = $('findings-table');
    if (!table) return;
    const th = table.querySelector('th.col-change');
    if (th) th.hidden = !showColumn;
    /* The Diff CSV button belongs to the export toolbar; toggle it in
       lockstep with the column. Only meaningful when we actually have
       a diff to export. */
    const diffBtn = $('export-diff-csv');
    if (diffBtn) diffBtn.hidden = !showColumn;
  }

  /* v4.3.0: load a specific historical audit into the current view.
     Sets allFindings to the historical audit's findings, remembers
     auditMeta as the historical audit's meta, and re-runs the diff
     against whatever came BEFORE it in history. This means the
     Change column always answers "how did this audit differ from
     the previous run?", not "how does this compare to today?". That
     matches how developers actually think about regression tracking. */
  function loadHistoricalAudit(entry) {
    if (!entry || !Array.isArray(entry.findings)) return;
    allFindings = entry.findings;
    auditMeta = {
      pageTitle: entry.pageTitle || '',
      pageUrl:   entry.pageUrl   || auditMeta.pageUrl,
      timestamp: entry.timestamp || new Date().toISOString()
    };
    /* Re-run the counts and card labels for the historical audit. */
    const fail = allFindings.filter(f => f.verdict === 'Fail').length;
    const warn = allFindings.filter(f => f.verdict === 'Warning').length;
    const pass = allFindings.filter(f => f.verdict === 'Pass').length;
    const info = allFindings.filter(f => f.verdict === 'Info').length;
    $('count-fail').textContent  = fail;
    $('count-warn').textContent  = warn;
    $('count-pass').textContent  = pass;
    $('count-info').textContent  = info;
    $('count-total').textContent = allFindings.length;
    $('card-fail').setAttribute('aria-label',  `Failures: ${fail}`);
    $('card-warn').setAttribute('aria-label',  `Warnings: ${warn}`);
    $('card-pass').setAttribute('aria-label',  `Passes: ${pass}`);
    $('card-info').setAttribute('aria-label',  `Info: ${info}`);
    $('card-total').setAttribute('aria-label', `Total: ${allFindings.length}`);
    $('page-info').textContent = `${auditMeta.pageTitle} - ${auditMeta.pageUrl}`;
    loadHistoryAndDiff().then(() => {
      applyFilters();
      announce(`Loaded audit from ${new Date(entry.timestamp).toLocaleString()}. ${fail} failures, ${warn} warnings, ${pass} passes. ${allFindings.length} total. ${diffSummary ? `Compared to the previous audit: ${diffSummary.new} new, ${diffSummary.regressed} regressed, ${diffSummary.resolved} resolved.` : 'No prior audit to compare against.'}`);
    });
  }

  /* Clear history buttons. */
  document.addEventListener('DOMContentLoaded', () => {
    const clearUrlBtn = $('history-clear-url-btn');
    const clearAllBtn = $('history-clear-all-btn');
    if (clearUrlBtn) clearUrlBtn.addEventListener('click', () => {
      if (!auditMeta.pageUrl) { announce('No URL loaded to clear.', 'assertive'); return; }
      askBackground({ type: 'history-request', action: 'clear-url', url: auditMeta.pageUrl })
        .then(() => { loadHistoryAndDiff().then(applyFilters); announce('History for this URL cleared.'); });
    });
    if (clearAllBtn) clearAllBtn.addEventListener('click', () => {
      askBackground({ type: 'history-request', action: 'clear-all' })
        .then(() => { loadHistoryAndDiff().then(applyFilters); announce('All AMASAMYA history cleared.'); });
    });
  });

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
    const showDiff = !!diffAgainst && diffTagged.length > 0;
    const colspan  = showDiff ? 6 : 5;
    if (!filteredFindings.length) {
      tbody.innerHTML = `<tr><td colspan="${colspan}" class="empty-state">No findings match the current filters.</td></tr>`;
      return;
    }
    tbody.innerHTML = '';

    /* v4.3.0: when a diff view is active, build a fast lookup so we
       can annotate each visible row with its diff verdict without
       re-running the identity key. Diff view also implicitly appends
       resolved rows (which are not in filteredFindings by design);
       we splice them in at the bottom for the sighted user and add
       an aria-label prefix for the SR user. */
    const diffByIdKey = new Map();
    if (showDiff && window.AMASAMYAAuditDiff) {
      diffTagged.forEach((row) => {
        const k = window.AMASAMYAAuditDiff.identityKey(row);
        if (k) diffByIdKey.set(k, row.diffVerdict);
      });
    }

    filteredFindings.forEach((f, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.findingId = f.id; // used by baseline diff colouring

      /* v4.3.0: Change column cell. Only added when a diff is active. */
      let diffVerdict = '';
      if (showDiff && window.AMASAMYAAuditDiff) {
        const k = window.AMASAMYAAuditDiff.identityKey(f);
        diffVerdict = diffByIdKey.get(k) || '';
        if (diffVerdict) {
          const tdChange = document.createElement('td');
          tdChange.className = 'col-change';
          const badge = document.createElement('span');
          badge.className = `change-badge change-badge--${diffVerdict}`;
          badge.textContent = diffVerdict.charAt(0).toUpperCase() + diffVerdict.slice(1);
          tdChange.appendChild(badge);
          tr.appendChild(tdChange);
          if (diffVerdict === 'resolved') tr.classList.add('diff-resolved');
          /* SR: prepend the diff verdict word to the row's aria-label
             so it lands before the ID/engine/etc columns are read. */
          tr.setAttribute('aria-label', `${badge.textContent}. ${f.id}. ${f.engine}. ${f.verdict}. ${f.severity}. ${f.issue}.`);
        }
      }

      const tdId  = document.createElement('td'); tdId.textContent = f.id;
      const tdEng = document.createElement('td'); tdEng.textContent = f.engine;
      const tdVer = document.createElement('td'); tdVer.textContent = f.verdict; tdVer.className = `verdict-${(f.verdict||'').toLowerCase()}`;
      const tdSev = document.createElement('td'); tdSev.textContent = f.severity; tdSev.className = `severity-${(f.severity||'').toLowerCase()}`;

      const tdIss   = document.createElement('td');
      const toggle  = document.createElement('button');
      toggle.className = 'finding-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', `detail-${idx}`);
      toggle.textContent = f.issue;
      toggle.addEventListener('click', () => {
        const d = $(`detail-${idx}`);
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        const nowExpanded = !expanded;
        toggle.setAttribute('aria-expanded', String(nowExpanded));
        d.classList.toggle('expanded');
        /* v4.2.1 K7: NVDA / JAWS announce the new aria-expanded state
           when the user re-reads the button, but not on the click that
           caused the change. Push a polite announcement so the user
           gets immediate feedback that the toggle did something. */
        announce(nowExpanded ? 'Finding detail expanded.' : 'Finding detail collapsed.');
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

    /* v4.3.0: append Resolved rows at the bottom of the table when a
       diff is active. These rows are informational only (the finding
       is gone from the current audit); we render them so the reader
       can see what fixes were shipped since the previous audit. */
    if (showDiff) {
      diffTagged.filter(r => r.diffVerdict === 'resolved').forEach((f, i) => {
        const tr = document.createElement('tr');
        tr.classList.add('diff-resolved');
        const tdChange = document.createElement('td');
        tdChange.className = 'col-change';
        const badge = document.createElement('span');
        badge.className = 'change-badge change-badge--resolved';
        badge.textContent = 'Resolved';
        tdChange.appendChild(badge);
        tr.appendChild(tdChange);
        const tdId  = document.createElement('td'); tdId.textContent = f.id  || '';
        const tdEng = document.createElement('td'); tdEng.textContent = f.engine || '';
        const tdVer = document.createElement('td'); tdVer.textContent = f.verdict || '';
        const tdSev = document.createElement('td'); tdSev.textContent = f.severity || '';
        const tdIss = document.createElement('td'); tdIss.textContent = f.issue || '';
        tr.setAttribute('aria-label', `Resolved. Previously ${f.verdict} at ${f.severity}. ${f.issue}. Element ${f.element || f.selector || ''}.`);
        [tdId, tdEng, tdVer, tdSev, tdIss].forEach(td => tr.appendChild(td));
        tbody.appendChild(tr);
      });
    }
  }

  /* Export */
  $('export-json').addEventListener('click', () => {
    downloadFile(JSON.stringify({
      tool: 'AMASAMYA', version: '4.3.0', page: auditMeta.pageTitle,
      url: auditMeta.pageUrl, timestamp: auditMeta.timestamp,
      summary: { total: allFindings.length, fail: allFindings.filter(f=>f.verdict==='Fail').length,
        warning: allFindings.filter(f=>f.verdict==='Warning').length,
        pass: allFindings.filter(f=>f.verdict==='Pass').length,
        info: allFindings.filter(f=>f.verdict==='Info').length },
      /* v4.3.0: include diff meta when a comparison was available. */
      diff: (diffSummary && diffAgainst) ? {
        against: { timestamp: diffAgainst.timestamp, pageTitle: diffAgainst.pageTitle },
        summary: diffSummary
      } : null,
      findings: filteredFindings
    }, null, 2), 'AMASAMYA-audit.json', 'application/json');
    announce('JSON exported.');
  });

  /* v4.3.0: Diff CSV export. Writes only the actionable rows (new +
     regressed) against the previous audit for this URL. Filename
     encodes the compared-to timestamp so multiple exports do not
     overwrite each other in Downloads. */
  const diffCsvBtn = $('export-diff-csv');
  if (diffCsvBtn) diffCsvBtn.addEventListener('click', () => {
    if (!diffAgainst || !window.AMASAMYAAuditDiff) {
      announce('No diff view active; cannot export Diff CSV.', 'assertive');
      return;
    }
    const rows = window.AMASAMYAAuditDiff.actionableRows(diffTagged);
    const headers = ['Change','ID','Engine','Element','Selector','Criterion','Issue','Computed','Required','Verdict','Severity','How to Fix'];
    const body = rows.map(f => [
      (f.diffVerdict || '').charAt(0).toUpperCase() + (f.diffVerdict || '').slice(1),
      f.id || '', f.engine || '', f.element || '', f.selector || '',
      f.criterion || '', f.issue || '', f.computed || '', f.required || '',
      f.verdict || '', f.severity || '', f.howToFix || ''
    ].map(csvEscape));
    const filenameTs = (diffAgainst.timestamp || '').replace(/[:.]/g, '-');
    downloadFile(
      [headers.join(','), ...body.map(r => r.join(','))].join('\r\n'),
      `AMASAMYA-diff-vs-${filenameTs}.csv`,
      'text/csv'
    );
    announce(`Diff CSV exported. ${rows.length} actionable rows.`);
  });

  $('export-html').addEventListener('click', () => {
    downloadFile(generateHtmlReport(), 'AMASAMYA-report.html', 'text/html');
    announce('HTML report exported.');
  });

  $('export-csv').addEventListener('click', () => {
    const headers = ['ID','Engine','Element','Criterion','Issue','Computed','Required','Verdict','Severity','How to Fix'];
    const rows    = filteredFindings.map(f =>
      [f.id, f.engine, f.element, f.criterion, f.issue, f.computed, f.required, f.verdict, f.severity, f.howToFix].map(csvEscape));
    downloadFile([headers.join(','), ...rows.map(r => r.join(','))].join('\r\n'), 'AMASAMYA-audit.csv', 'text/csv');
    announce('CSV exported.');
  });

  $('export-text').addEventListener('click', () => {
    const lines = [
      'AMASAMYA Accessibility Audit Report', '='.repeat(40),
      `Page: ${auditMeta.pageTitle}`, `URL: ${auditMeta.pageUrl}`, `Date: ${auditMeta.timestamp}`, '',
      `Summary: ${allFindings.filter(f=>f.verdict==='Fail').length} Failures, ${allFindings.filter(f=>f.verdict==='Warning').length} Warnings, ${allFindings.length} Total`, '', '-'.repeat(40), ''
    ];
    filteredFindings.forEach(f => {
      lines.push(`${f.id} [${f.verdict}] [${f.severity}] ${f.engine}`);
      lines.push(`  Issue: ${f.issue}`); lines.push(`  Element: ${f.element}`);
      lines.push(`  Criterion: ${f.criterion}`); lines.push(`  Fix: ${f.howToFix}`); lines.push('');
    });
    downloadFile(lines.join('\n'), 'AMASAMYA-audit.txt', 'text/plain');
    announce('Text exported.');
  });

  /* ── SARIF 2.1.0 Export ── */
  $('export-sarif').addEventListener('click', () => {
    const rules = [];
    const ruleIds = new Set();
    const results = [];

    filteredFindings.forEach(f => {
      const ruleId = f.criterion
        ? f.criterion.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 64)
        : f.engine.replace(/\s+/g, '_');

      if (!ruleIds.has(ruleId)) {
        ruleIds.add(ruleId);
        rules.push({
          id: ruleId,
          name: f.engine.replace(/\s+/g, ''),
          shortDescription: { text: f.criterion || f.engine },
          helpUri: 'https://www.w3.org/TR/WCAG22/',
          properties: { tags: ['accessibility', 'wcag'] }
        });
      }

      const levelMap = {
        Fail: f.severity === 'Critical' || f.severity === 'Serious' ? 'error' : 'warning',
        Warning: 'warning',
        Info: 'note',
        Pass: 'none'
      };

      results.push({
        ruleId,
        level: levelMap[f.verdict] || 'note',
        message: { text: `${f.issue} ${f.howToFix || ''}`.trim() },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri: auditMeta.pageUrl || 'unknown' },
            region: { snippet: { text: f.element || '' } }
          }
        }],
        properties: {
          engine: f.engine,
          computed: f.computed,
          required: f.required,
          severity: f.severity,
          verdict: f.verdict
        }
      });
    });

    const sarif = {
      version: '2.1.0',
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      runs: [{
        tool: {
          driver: {
            name: 'AMASAMYA',
            version: '4.2.0',
            informationUri: 'https://amasamya.akhileshmalani.com',
            rules
          }
        },
        results,
        artifacts: [{ location: { uri: auditMeta.pageUrl || 'unknown' } }],
        invocations: [{
          executionSuccessful: true,
          startTimeUtc: auditMeta.timestamp
        }]
      }]
    };

    downloadFile(JSON.stringify(sarif, null, 2), 'AMASAMYA-audit.sarif', 'application/json');
    announce('SARIF exported.');
  });

  /* ── Annotated Screenshot ── */
  $('export-annotated').addEventListener('click', () => {
    const failFindings = filteredFindings
      .filter(f => f.verdict === 'Fail' || f.verdict === 'Warning')
      .slice(0, 50); // cap at 50 boxes for readability

    if (!failFindings.length) {
      announce('No failures or warnings to annotate.');
      return;
    }

    // Attach CSS selector to each finding for background rect lookup
    // Selectors were not stored - derive a rough one from the element description
    const withSelectors = failFindings.map((f, i) => {
      // Try to extract an id selector if the element description contains #id
      const idMatch = f.element && f.element.match(/#([\w-]+)/);
      const selector = idMatch ? `#${idMatch[1]}` : null;
      return { ...f, selector, _localIndex: i };
    });

    $('export-annotated').disabled = true;
    $('export-annotated').textContent = '⏳ Capturing…';
    chrome.runtime.sendMessage({ type: 'annotated-screenshot-run', findings: withSelectors });
    announce('Capturing annotated screenshot…');
  });

  /* ── Baseline Save / Clear / Compare ── */

  function baselineKey() {
    return 'AMASAMYA_baseline_' + btoa(encodeURIComponent(auditMeta.pageUrl)).slice(0, 60);
  }

  function baselineFingerprint(f) {
    // Stable identity: engine + criterion + first 80 chars of element description
    return `${f.engine}|${f.criterion}|${(f.element || '').slice(0, 80)}`;
  }

  async function baselineLoadAndCompare() {
    const key = baselineKey();
    const stored = await chrome.storage.local.get(key);
    const baseline = stored[key];

    $('clear-baseline-btn').disabled = !baseline;

    if (!baseline) {
      $('baseline-status').textContent = 'No baseline saved for this URL.';
      $('regression-banner').hidden = true;
      // Reset any previous diff colouring
      document.querySelectorAll('.finding-row-new, .finding-row-fixed').forEach(r => {
        r.classList.remove('finding-row-new', 'finding-row-fixed');
      });
      return;
    }

    const baseDate = new Date(baseline.timestamp).toLocaleDateString();
    $('baseline-status').textContent = `Baseline: ${baseline.summary.fail}F / ${baseline.summary.warn}W - saved ${baseDate}`;

    // Build fingerprint sets
    const baseSet = new Set((baseline.findings || []).map(baselineFingerprint));
    const currSet = new Set(allFindings.map(baselineFingerprint));

    const newCount   = allFindings.filter(f => f.verdict === 'Fail' && !baseSet.has(baselineFingerprint(f))).length;
    const fixedCount = (baseline.findings || []).filter(f => f.verdict === 'Fail' && !currSet.has(baselineFingerprint(f))).length;

    // Show regression banner
    const banner = $('regression-banner');
    banner.hidden = false;
    /* Plain text rather than ▲ / ✔ glyphs so NVDA and JAWS read the
       intent rather than "black up-pointing triangle" and "heavy
       check mark". CSS .reg-new and .reg-fixed still colour-code
       sighted users via the class names. */
    const sameCount = allFindings.filter(f => f.verdict === 'Fail').length - newCount;
    banner.innerHTML =
      `<span class="reg-new">New: ${newCount} failure${newCount !== 1 ? 's' : ''}</span> &nbsp;` +
      `<span class="reg-fixed">Fixed: ${fixedCount}</span> &nbsp;` +
      `<span class="reg-same">Unchanged: ${sameCount}</span>`;

    // Colour rows - wait for renderFindings to complete via setTimeout(0)
    setTimeout(() => {
      const rows = document.querySelectorAll('#findings-body tr[data-finding-id]');
      rows.forEach(row => {
        const fid = row.dataset.findingId;
        const f   = allFindings.find(x => x.id === fid);
        if (!f) return;
        if (f.verdict === 'Fail' && !baseSet.has(baselineFingerprint(f))) {
          row.classList.add('finding-row-new');
        }
      });
    }, 0);
  }

  $('save-baseline-btn').addEventListener('click', async () => {
    const key = baselineKey();
    await chrome.storage.local.set({
      [key]: {
        url:       auditMeta.pageUrl,
        pageTitle: auditMeta.pageTitle,
        timestamp: new Date().toISOString(),
        summary: {
          fail: allFindings.filter(f => f.verdict === 'Fail').length,
          warn: allFindings.filter(f => f.verdict === 'Warning').length,
          pass: allFindings.filter(f => f.verdict === 'Pass').length
        },
        findings: allFindings
      }
    });
    $('clear-baseline-btn').disabled = false;
    $('baseline-status').textContent = `Baseline saved - ${new Date().toLocaleTimeString()}`;
    announce('Baseline saved for this URL.');
  });

  $('clear-baseline-btn').addEventListener('click', async () => {
    await chrome.storage.local.remove(baselineKey());
    $('clear-baseline-btn').disabled = true;
    $('baseline-status').textContent = 'Baseline cleared.';
    $('regression-banner').hidden = true;
    document.querySelectorAll('.finding-row-new, .finding-row-fixed').forEach(r => {
      r.classList.remove('finding-row-new', 'finding-row-fixed');
    });
    announce('Baseline cleared.');
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

  /* Mirror of background.js restrictedUrlReason(). Kept in sync
     so the panel's "Re-run Audit" button shows the same screen-
     reader-friendly explanation as the keyboard-shortcut path. */
  function restrictedUrlReason(url) {
    if (!url) return 'No active tab URL is available.';
    const u = url.toLowerCase();
    if (u.startsWith('chrome://') || u.startsWith('chrome-extension://') ||
        u.startsWith('edge://')   || u.startsWith('about:') ||
        u.startsWith('view-source:') || u.startsWith('chrome-search://') ||
        u.startsWith('devtools://')) {
      return 'AMASAMYA cannot audit browser internal pages. Switch to a regular http or https tab and try again.';
    }
    if (u.startsWith('https://chromewebstore.google.com/') ||
        u.startsWith('https://chrome.google.com/webstore')) {
      return 'AMASAMYA cannot audit the Chrome Web Store gallery. Chrome blocks all extensions from scripting that domain. Switch to a regular site and try again.';
    }
    if (u.startsWith('file://')) {
      return 'AMASAMYA cannot audit local file:// pages by default. Enable "Allow access to file URLs" for AMASAMYA in chrome://extensions and reload the tab.';
    }
    return null;
  }

  $('reaudit-btn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) { announce('No active tab found.', 'assertive'); return; }
    const reason = restrictedUrlReason(tab.url);
    if (reason) {
      announce(reason, 'assertive');
      $('page-info').textContent = reason;
      return;
    }
    announce('Running audit…');
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-script.js'] });
    } catch (err) {
      announce('AMASAMYA could not run on this tab: ' + err.message, 'assertive');
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
<title>AMASAMYA Audit - ${escHtml(auditMeta.pageTitle)}</title>
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
<header><h1>AMASAMYA Accessibility Audit</h1>
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
<footer>Generated by AMASAMYA v4.2.0 - AMASAMYA.akhileshmalani.com - Akhilesh Malani</footer>
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
      announce('Focus Narrator error: ' + msg.message, 'assertive');
    }
  }

  function fnAppendRow(el, finding, rowNum) {
    const tbody = $('fn-results-body');
    const tr    = document.createElement('tr');

    const verdict    = finding?.verdict || (finding?.hasIndicator === false ? 'FAIL' : finding?.hasIndicator === true ? 'PASS' : '-');
    const hasFocus   = finding?.hasIndicator;
    const passes247  = finding?.passes_2_4_7;
    const passes2411 = finding?.passes_2_4_11;
    const description = finding?.description || finding?.note || (finding?.error ? 'Error - check API key in Settings.' : '-');
    const indicator  = finding?.indicatorType || (hasFocus ? 'present' : 'none');
    const color      = finding?.color || '';
    const thickness  = finding?.thicknessPx ? finding.thicknessPx + 'px' : '';
    const indicatorText = hasFocus ? `${indicator}${color ? ' ' + color : ''}${thickness ? ' ' + thickness : ''}` : 'None';

    const verdictClass = verdict === 'PASS' ? 'verdict-pass' : verdict === 'FAIL' ? 'verdict-fail' : 'verdict-warn';
    const scToText = v => v === true ? 'Pass' : v === false ? 'Fail' : 'Unknown';

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
      'AMASAMYA-focus-narrator.csv', 'text/csv');
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
      announce('Visual Layout Audit error: ' + msg.message, 'assertive');
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
          ${hasIssues ? issues.length + ' issue' + (issues.length !== 1 ? 's' : '') : 'No issues'}
        </span>
      </h4>
      ${finding?.summary ? `<p class="vla-summary">${escHtml(finding.summary)}</p>` : ''}
      ${screenshot ? `
        <details class="vla-screenshot-details">
          <summary>View screenshot at ${escHtml(bp.label)}</summary>
          <img src="${escHtml(screenshot)}" alt="Screenshot of page at ${escHtml(bp.label)}" class="vla-screenshot"
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
    const lines = ['AMASAMYA Visual Layout Audit Report', '='.repeat(50), ''];
    vlaFindings.forEach(r => {
      lines.push(`Breakpoint: ${r.breakpoint.label}`);
      lines.push(`Summary: ${r.finding?.summary || 'N/A'}`);
      (r.finding?.issues || []).forEach(iss => {
        lines.push(`  [${iss.severity}] ${iss.type} - ${iss.location}`);
        lines.push(`    ${iss.description} (WCAG ${iss.wcag || 'N/A'})`);
      });
      lines.push('');
    });
    downloadFile(lines.join('\n'), 'AMASAMYA-visual-layout.txt', 'text/plain');
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
      'AMASAMYA-state-watchdog.csv', 'text/csv'
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
      announce('State Change Watchdog error: ' + msg.message, 'assertive');
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
      <td>${escHtml(String(ev.id))}</td>
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


  /* ════════════════════════════════════════════════════════
     SITE CRAWL (v4.2.0)
     ────────────────────────────────────────────────────────
     Source-toggle, validation, start, cancel, progress, results.
     The actual crawl is driven by background.js using the
     site-crawler module; this panel only sends a "site-crawl-start"
     message and listens for status updates.

     Wiring runs unconditionally so the listener is present even
     while the flag is off (so a developer can flip the flag at
     runtime without reloading the panel). The user-visible
     elements remain hidden via the flag block at the top of this
     file.
  ════════════════════════════════════════════════════════ */

  const crawlSrcSitemap = $('crawl-src-sitemap');
  const crawlSrcList    = $('crawl-src-list');
  if (crawlSrcSitemap && crawlSrcList) {
    function syncCrawlSourceUi() {
      const useSitemap = crawlSrcSitemap.checked;
      $('crawl-sitemap-wrap').hidden = !useSitemap;
      $('crawl-list-wrap').hidden    =  useSitemap;
    }
    crawlSrcSitemap.addEventListener('change', syncCrawlSourceUi);
    crawlSrcList.addEventListener('change',    syncCrawlSourceUi);
    syncCrawlSourceUi();
  }

  let crawlRunning = false;
  let crawlResults = [];

  function crawlReadInputs() {
    const useSitemap = $('crawl-src-sitemap')?.checked;
    if (useSitemap) {
      const root = ($('crawl-sitemap-url')?.value || '').trim();
      if (!root) return { error: 'Enter a site root URL (for example https://example.com).' };
      if (!/^https?:\/\//i.test(root)) return { error: 'URL must start with http:// or https://' };
      return { source: 'sitemap', root: root };
    } else {
      const raw = ($('crawl-url-list')?.value || '').trim();
      if (!raw) return { error: 'Paste at least one URL.' };
      const urls = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (urls.length === 0) return { error: 'Paste at least one URL.' };
      const bad = urls.find(u => !/^https?:\/\//i.test(u));
      if (bad) return { error: 'Every URL must start with http:// or https://. First bad line: ' + bad };
      return { source: 'list', urls: urls };
    }
  }

  function crawlSetRunningUi(running) {
    crawlRunning = running;
    if ($('crawl-start-btn'))  $('crawl-start-btn').hidden  =  running;
    if ($('crawl-cancel-btn')) $('crawl-cancel-btn').hidden = !running;
    if ($('crawl-progress-wrap')) $('crawl-progress-wrap').hidden = !running;
  }

  function crawlResetSummary() {
    crawlResults = [];
    if ($('crawl-results-wrap')) $('crawl-results-wrap').hidden = true;
    if ($('crawl-results-body')) $('crawl-results-body').innerHTML = '';
    if ($('crawl-pages-completed')) $('crawl-pages-completed').textContent = '0';
    if ($('crawl-pages-total'))     $('crawl-pages-total').textContent     = '0';
    ['audited', 'auth', 'timeout', 'error'].forEach(k => {
      const el = $('crawl-count-' + k);
      if (el) el.textContent = '0 ' + (k === 'audited' ? 'Audited' : k === 'auth' ? 'Auth wall' : k === 'timeout' ? 'Timed out' : 'Errors');
    });
    if ($('crawl-progress-fill')) {
      $('crawl-progress-fill').style.width = '0%';
      $('crawl-progress-bar').setAttribute('aria-valuenow', '0');
    }
    if ($('crawl-progress-label')) $('crawl-progress-label').textContent = 'Starting...';
  }

  if ($('crawl-start-btn')) {
    $('crawl-start-btn').addEventListener('click', () => {
      if (!SITE_CRAWL_ENABLED) {
        announce('Site Crawl is disabled in this build.', 'assertive');
        return;
      }
      const input = crawlReadInputs();
      if (input.error) {
        $('crawl-status').textContent = input.error;
        announce(input.error, 'assertive');
        return;
      }
      crawlResetSummary();
      crawlSetRunningUi(true);
      $('crawl-status').textContent = 'Starting crawl...';
      announce('Site Crawl starting.');
      /* Hand off to background.js. Implementation lands in commit F.
         Until then the message is dispatched but the runner does not
         yet exist, so we surface a clear progress message rather
         than silently doing nothing. */
      try {
        chrome.runtime.sendMessage({ type: 'site-crawl-start', input: input }).catch(() => {});
      } catch (_) { /* extension context disconnected */ }
    });
  }

  if ($('crawl-cancel-btn')) {
    $('crawl-cancel-btn').addEventListener('click', () => {
      if (!crawlRunning) return;
      announce('Cancelling crawl.');
      try {
        chrome.runtime.sendMessage({ type: 'site-crawl-cancel' }).catch(() => {});
      } catch (_) {}
    });
  }

  /*
    Crawl status messages from background.js. The phase vocabulary
    mirrors the existing focus-narrator-ui and visual-layout-ui
    message patterns so the side panel uses one consistent shape.
  */
  /*
    v4.2.0 K calibration accessibility pass:

    Real-world test 1 surfaced two failures:

      1. Audit numbers were silent. The progress label updated, but
         crawl-progress-wrap had no aria-live, so screen readers
         never announced "Auditing 3 of 5". Fixed in panel.html by
         moving aria-live="polite" + aria-atomic="true" onto the
         label itself.

      2. Per-page completion was silent. New rows were appended to
         the results table, but table-row insertion is not
         announced by NVDA / JAWS unless the user is actively
         table-navigating. Fixed here by emitting a short polite
         announcement on every page completion that includes the
         URL path so pages can be told apart by ear.

    Phrasing is short and verb-first to keep the live-region queue
    flowing on fast crawls. URL is reduced to its path so two-second
    intervals can carry the spoken sentence without backing up.
  */

  /* Strip protocol + host so the announcement is short and the
     audible difference between adjacent pages is the path. Falls
     back to the full URL if parsing fails. */
  function crawlPathOnly(rawUrl) {
    if (!rawUrl) return '';
    try {
      const u = new URL(rawUrl);
      let path = u.pathname || '/';
      if (u.search) path += u.search;
      return path;
    } catch (_) { return String(rawUrl); }
  }

  /* Short human label for status, used in both the polite live
     announcement and the aria-label on each results-table row so
     the row reads as a single sentence when reviewed later. */
  function crawlStatusSentence(status) {
    return ({
      'audited':    'Audited successfully',
      'auth-wall':  'Skipped, page is behind a sign in',
      'timeout':    'Timed out',
      'load-error': 'Load error',
      'cancelled':  'Cancelled',
      'skipped':    'Skipped'
    })[status] || (status || 'Unknown');
  }

  function handleCrawlUi(msg) {
    if (msg.phase === 'queued') {
      $('crawl-pages-total').textContent = String(msg.total);
      $('crawl-results-wrap').hidden = false;
      $('crawl-progress-label').textContent = `${msg.total} page${msg.total === 1 ? '' : 's'} queued. Crawl starting now.`;
      $('crawl-progress-bar').setAttribute('aria-valuetext', `0 of ${msg.total} pages audited.`);
      announce(`Crawl queued. ${msg.total} page${msg.total === 1 ? '' : 's'} will be audited.`);

    } else if (msg.phase === 'progress') {
      const pct = msg.total ? Math.round((msg.index / msg.total) * 100) : 0;
      const oneBased = (msg.index | 0) + 1;
      const path     = crawlPathOnly(msg.url);
      $('crawl-progress-fill').style.width = pct + '%';
      $('crawl-progress-bar').setAttribute('aria-valuenow',  String(pct));
      /* aria-valuetext overrides the bare percent reading so users
         landing on the progress bar hear context, not just "23 %". */
      $('crawl-progress-bar').setAttribute('aria-valuetext',
        `Page ${oneBased} of ${msg.total}, ${pct} percent complete.`);
      /* Label is on a polite live region (see panel.html) so this
         assignment is what the user hears mid-crawl. */
      $('crawl-progress-label').textContent =
        `Auditing page ${oneBased} of ${msg.total}. ${path}`;

    } else if (msg.phase === 'pageComplete') {
      crawlResults.push(msg.record);
      crawlAppendRow(msg.record);
      crawlUpdateSummary();
      $('crawl-pages-completed').textContent = String(crawlResults.length);
      /* Polite per-page announcement. Short enough to drain before
         the next page completes on a typical 2-to-4-second cadence. */
      const rec = msg.record || {};
      const oneBased = (rec.index | 0) + 1;
      const path     = crawlPathOnly(rec.url);
      const status   = crawlStatusSentence(rec.status);
      const findings = Array.isArray(rec.findings) ? rec.findings.length : 0;
      const seconds  = ((rec.durationMs | 0) / 1000).toFixed(1);
      const findingsClause = rec.status === 'audited'
        ? `${findings} finding${findings === 1 ? '' : 's'}. `
        : '';
      announce(`Page ${oneBased} complete. ${path}. ${status}. ${findingsClause}${seconds} seconds.`);

    } else if (msg.phase === 'complete') {
      crawlSetRunningUi(false);
      const summary = crawlBuildSummarySentence();
      $('crawl-status').textContent = `Crawl complete. ${summary}`;
      $('crawl-progress-fill').style.width = '100%';
      $('crawl-progress-bar').setAttribute('aria-valuenow', '100');
      $('crawl-progress-bar').setAttribute('aria-valuetext',
        `Crawl complete. ${summary}`);
      $('crawl-progress-label').textContent = `Crawl complete. ${summary}`;
      announce(`Crawl complete. ${summary}`);

    } else if (msg.phase === 'cancelled') {
      crawlSetRunningUi(false);
      const summary = crawlBuildSummarySentence();
      $('crawl-status').textContent = `Crawl cancelled after ${crawlResults.length} page${crawlResults.length === 1 ? '' : 's'}. ${summary}`;
      $('crawl-progress-label').textContent = `Crawl cancelled.`;
      announce(`Crawl cancelled. ${summary}`, 'assertive');

    } else if (msg.phase === 'error') {
      crawlSetRunningUi(false);
      const message = msg.message || 'unknown error';
      $('crawl-status').textContent = `Crawl error: ${message}`;
      $('crawl-progress-label').textContent = `Crawl stopped because of an error.`;
      announce(`Crawl error: ${message}`, 'assertive');
    }
  }

  /* Build a single sentence summary of the current results buffer.
     Used by complete / cancelled phases so the user hears one
     consolidated count rather than four badge values in a row. */
  function crawlBuildSummarySentence() {
    let audited = 0, auth = 0, timeout = 0, errors = 0;
    crawlResults.forEach(r => {
      if (r.status === 'audited')        audited++;
      else if (r.status === 'auth-wall') auth++;
      else if (r.status === 'timeout')   timeout++;
      else                                errors++;
    });
    const parts = [];
    parts.push(`${audited} audited`);
    if (auth)    parts.push(`${auth} skipped at sign in`);
    if (timeout) parts.push(`${timeout} timed out`);
    if (errors)  parts.push(`${errors} error${errors === 1 ? '' : 's'}`);
    return parts.join(', ') + '.';
  }

  function crawlAppendRow(rec) {
    const tbody = $('crawl-results-body');
    if (!tbody) return;
    const tr = document.createElement('tr');
    const statusLabel = ({
      'audited':    'Audited',
      'auth-wall':  'Auth wall',
      'timeout':    'Timed out',
      'load-error': 'Load error',
      'cancelled':  'Cancelled',
      'skipped':    'Skipped'
    })[rec.status] || rec.status;
    const verdictClass =
      rec.status === 'audited'   ? 'verdict-pass' :
      rec.status === 'auth-wall' ? 'verdict-warning' :
                                   'verdict-fail';
    const oneBased   = (rec.index | 0) + 1;
    const seconds    = ((rec.durationMs | 0) / 1000).toFixed(1);
    const findings   = Array.isArray(rec.findings) ? rec.findings.length : 0;
    const statusSent = crawlStatusSentence(rec.status);
    /* Row-level aria-label so NVDA / JAWS "read current row" speaks
       the full record in one breath instead of cell-by-cell. Cell
       navigation still works for users who prefer it because the
       individual <td> contents are unchanged. */
    tr.setAttribute('aria-label',
      `Row ${oneBased}. ${rec.url}. ${statusSent}. ` +
      (rec.status === 'audited' ? `${findings} finding${findings === 1 ? '' : 's'}. ` : '') +
      `${seconds} seconds.`);
    tr.innerHTML = `
      <td>${escHtml(String(oneBased))}</td>
      <td><code>${escHtml(rec.url)}</code></td>
      <td class="${verdictClass}">${escHtml(statusLabel)}</td>
      <td>${escHtml(seconds)} s</td>
    `;
    tbody.appendChild(tr);
  }

  function crawlUpdateSummary() {
    const counts = { 'audited': 0, 'auth-wall': 0, 'timeout': 0, 'error': 0 };
    crawlResults.forEach(r => {
      if (r.status === 'audited')        counts.audited++;
      else if (r.status === 'auth-wall') counts['auth-wall']++;
      else if (r.status === 'timeout')   counts.timeout++;
      else                                counts.error++;
    });
    $('crawl-count-audited').textContent = counts.audited  + ' Audited';
    $('crawl-count-auth').textContent    = counts['auth-wall'] + ' Auth wall';
    $('crawl-count-timeout').textContent = counts.timeout  + ' Timed out';
    $('crawl-count-error').textContent   = counts.error    + ' Errors';
  }

  if ($('crawl-export-btn')) {
    $('crawl-export-btn').addEventListener('click', () => {
      if (crawlResults.length === 0) {
        announce('No crawl results yet to export.', 'assertive');
        return;
      }
      const payload = {
        tool:    'AMASAMYA',
        version: '4.2.0',
        kind:    'site-crawl-report',
        taken:   new Date().toISOString(),
        results: crawlResults
      };
      downloadFile(JSON.stringify(payload, null, 2), 'AMASAMYA-site-crawl.json', 'application/json');
      announce('Crawl report exported.');
    });
  }

  /* Plug crawl status messages into the global runtime onMessage
     listener. The listener already routes by message.type, so add
     a branch for site-crawl-ui. */
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'site-crawl-ui') {
      try { handleCrawlUi(message); } catch (_) {}
    }
    return false;
  });

})();
