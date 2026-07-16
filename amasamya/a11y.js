/*
 * AMASAMYA platform - Accessibility Preferences Panel logic
 *
 * Shared across all AMASAMYA subdomain pages. Loads once, wires the
 * toggle, panel open/close, focus trap, Escape-to-close, keyboard
 * shortcuts on the size buttons, and localStorage persistence for
 * every preference.
 *
 * Uses the same localStorage keys as the portfolio so a user who
 * switches between akhileshmalani.com and amasamya.akhileshmalani.com
 * carries the same preferences (localStorage is per-origin, so this
 * gives cross-page-within-subdomain persistence only; portfolio and
 * platform each maintain their own copy under the same key names).
 *
 * v4.3.1 - 2026-07-08
 */
(function () {
  'use strict';

  /* Apply saved preferences to <html> before paint. If the caller
     already ran an inline snippet in <head>, this call is idempotent. */
  applySavedPrefsToHtml();

  document.addEventListener('DOMContentLoaded', wire);

  function wire() {
    var html      = document.documentElement;
    var toggleBtn = document.getElementById('a11y-toggle');
    var panel     = document.getElementById('a11y-panel');
    var backdrop  = document.getElementById('a11y-backdrop');
    var closeBtn  = document.getElementById('a11y-panel-close');
    var resetBtn  = document.getElementById('a11y-reset');
    var title     = document.getElementById('a11y-panel-title');
    if (!toggleBtn || !panel) return;

    var sizeBtns    = panel.querySelectorAll('.a11y-size-btn');
    var contrastSw  = document.getElementById('a11y-contrast');
    var dyslexiaSw  = document.getElementById('a11y-dyslexia');
    var motionSw    = document.getElementById('a11y-motion');

    /* Restore UI state from stored prefs. */
    reflectStateFromHtml(sizeBtns, contrastSw, dyslexiaSw, motionSw);

    /* Panel open / close. */
    toggleBtn.addEventListener('click', function () {
      if (panel.classList.contains('open')) closePanel(); else openPanel();
    });
    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    if (backdrop) backdrop.addEventListener('click', closePanel);

    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); closePanel(); return; }
      if (e.key === 'Tab')    { trapTab(e, panel); }
    });

    /* Text-size buttons. */
    sizeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var size = btn.getAttribute('data-size') || 'normal';
        localStorage.setItem('a11y-text-size', size);
        applyTextSize(size);
        markSize(sizeBtns, size);
        announce('Text size set to ' + size + '.');
      });
    });

    /* Switches. */
    bindSwitch(contrastSw, 'a11y-high-contrast', 'data-high-contrast', 'High contrast');
    bindSwitch(dyslexiaSw, 'a11y-dyslexia-font', 'data-dyslexia-font', 'Dyslexia font');
    bindSwitch(motionSw,   'a11y-reduce-motion', 'data-reduce-motion', 'Reduce motion');

    /* v5.1: Read Aloud. Ported from the portfolio's read-aloud.js so
       the platform surfaces the same text-to-speech feature. Uses
       the browser's default voice per Akhilesh, 2026-07-10. */
    const readAloudSw = document.getElementById('a11y-read-aloud');
    bindReadAloud(readAloudSw);

    /* Reset. */
    if (resetBtn) resetBtn.addEventListener('click', function () {
      ['a11y-text-size', 'a11y-high-contrast', 'a11y-dyslexia-font', 'a11y-reduce-motion', 'a11y-read-aloud'].forEach(function (k) {
        try { localStorage.removeItem(k); } catch (_) {}
      });
      html.removeAttribute('data-text-size');
      html.removeAttribute('data-high-contrast');
      html.removeAttribute('data-dyslexia-font');
      html.removeAttribute('data-reduce-motion');
      if (readAloudSw) {
        readAloudSw.setAttribute('aria-checked', 'false');
        try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (_) {}
      }
      reflectStateFromHtml(sizeBtns, contrastSw, dyslexiaSw, motionSw);
      announce('All accessibility preferences reset.');
    });

    /* ── helpers ───────────────────────────────────────────── */
    function openPanel() {
      panel.classList.add('open');
      panel.removeAttribute('hidden');
      if (backdrop) backdrop.classList.add('open');
      if (title) { title.setAttribute('tabindex', '-1'); title.focus(); }
    }
    function closePanel() {
      panel.classList.remove('open');
      if (backdrop) backdrop.classList.remove('open');
      toggleBtn.focus();
      setTimeout(function () {
        if (!panel.classList.contains('open')) panel.setAttribute('hidden', '');
      }, 300);
      announce('Accessibility settings closed.');
    }
  }

  /* Public: apply saved prefs to <html> as data-* attributes. Safe to
     call before DOMContentLoaded (it does not touch panel DOM). */
  function applySavedPrefsToHtml() {
    var html = document.documentElement;
    try {
      var size = localStorage.getItem('a11y-text-size');
      if (size && size !== 'normal') html.setAttribute('data-text-size', size);
      if (localStorage.getItem('a11y-high-contrast') === 'true') html.setAttribute('data-high-contrast', 'true');
      if (localStorage.getItem('a11y-dyslexia-font') === 'true') html.setAttribute('data-dyslexia-font', 'true');
      if (localStorage.getItem('a11y-reduce-motion') === 'true') html.setAttribute('data-reduce-motion', 'true');
    } catch (_) { /* localStorage may be blocked in some browsers */ }
  }

  function applyTextSize(size) {
    var html = document.documentElement;
    if (size && size !== 'normal') html.setAttribute('data-text-size', size);
    else html.removeAttribute('data-text-size');
  }

  function markSize(btns, size) {
    btns.forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-size') === (size || 'normal') ? 'true' : 'false');
    });
  }

  /* v5.1 Read Aloud helper. Same TTS contract as the portfolio's
     read-aloud.js: activate reads the page's main content aloud with
     the browser default voice; deactivate cancels immediately.
     Preserves aria-checked, localStorage, keyboard support for Space,
     and cancels speech on beforeunload so pages do not inherit
     queued utterances. */
  function bindReadAloud(sw) {
    if (!sw || !window.speechSynthesis) return;
    var synth = window.speechSynthesis;

    function collectText() {
      var root = document.getElementById('main-content') || document.querySelector('main') || document.body;
      if (!root) return '';
      var clone = root.cloneNode(true);
      ['nav', 'header', 'footer', '#a11y-backdrop', '#a11y-panel',
       '.skip-link', 'script', 'style', 'noscript', '.a11y-toggle',
       '.theme-toggle', '.platform-nav'].forEach(function (sel) {
        clone.querySelectorAll(sel).forEach(function (el) { el.remove(); });
      });
      return (clone.textContent || '').replace(/\s+/g, ' ').trim();
    }
    function speak(text) {
      if (!text) return;
      synth.cancel();
      var chunks = text.match(/[^.!?]+[.!?]?/g) || [text];
      chunks.forEach(function (chunk) {
        var u = new SpeechSynthesisUtterance(chunk.trim());
        u.rate  = 1; u.pitch = 1;
        u.lang  = document.documentElement.lang || 'en';
        synth.speak(u);
      });
    }
    function activate() {
      var text = collectText();
      speak(text || 'Read Aloud is on but no readable content was found on this page.');
    }
    function deactivate() {
      try { synth.cancel(); } catch (_) {}
    }

    /* Restore saved state on load. */
    try {
      if (localStorage.getItem('a11y-read-aloud') === 'true') {
        sw.setAttribute('aria-checked', 'true');
        activate();
      }
    } catch (_) {}

    sw.addEventListener('click', function () {
      var next = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(next));
      try { localStorage.setItem('a11y-read-aloud', String(next)); } catch (_) {}
      if (next) { activate(); announce('Read Aloud on.'); }
      else      { deactivate(); announce('Read Aloud off.'); }
    });
    sw.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); sw.click(); }
    });

    window.addEventListener('beforeunload', deactivate);
  }

  function bindSwitch(sw, storageKey, htmlAttr, label) {
    if (!sw) return;
    var html = document.documentElement;
    sw.addEventListener('click', function () {
      var isOn = sw.getAttribute('aria-checked') === 'true';
      var next = !isOn;
      sw.setAttribute('aria-checked', String(next));
      if (next) { html.setAttribute(htmlAttr, 'true'); }
      else      { html.removeAttribute(htmlAttr); }
      try { localStorage.setItem(storageKey, String(next)); } catch (_) {}
      announce(label + (next ? ' on.' : ' off.'));
    });
    /* Keyboard: Space also toggles (browsers do this for role="switch"
       automatically but only when the element is a native button; add
       it explicitly for defence in depth). */
    sw.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); sw.click(); }
    });
  }

  function reflectStateFromHtml(sizeBtns, contrastSw, dyslexiaSw, motionSw) {
    var html = document.documentElement;
    markSize(sizeBtns, html.getAttribute('data-text-size') || 'normal');
    if (contrastSw) contrastSw.setAttribute('aria-checked', html.hasAttribute('data-high-contrast') ? 'true' : 'false');
    if (dyslexiaSw) dyslexiaSw.setAttribute('aria-checked', html.hasAttribute('data-dyslexia-font') ? 'true' : 'false');
    if (motionSw)   motionSw.setAttribute('aria-checked',   html.hasAttribute('data-reduce-motion') ? 'true' : 'false');
  }

  function trapTab(e, container) {
    var focusable = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    var first = focusable[0];
    var last  = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* Best-effort polite announcement. Uses an existing site-wide live
     region if present, otherwise creates and reuses a shared one. */
  function announce(msg) {
    var region = document.getElementById('a11y-panel-live');
    if (!region) {
      region = document.createElement('div');
      region.id = 'a11y-panel-live';
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('aria-atomic', 'true');
      region.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;';
      document.body.appendChild(region);
    }
    region.textContent = '';
    setTimeout(function () { region.textContent = msg; }, 50);
  }
})();
