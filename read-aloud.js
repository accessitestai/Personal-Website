/*
  Read Aloud - browser-native text-to-speech for akhileshmalani.com

  Replaces the read-aloud logic that previously lived inside the
  deprecated screen-reader.js emulator. Purely uses the standard
  window.speechSynthesis API.

  What it does when the user flips the Read Aloud switch to on:
    - Collects readable text from the page's main-content region.
    - Speaks it aloud with the browser's default voice.
    - On switch-off: cancels current speech immediately.

  What it does not do:
    - No voice picker. Uses the browser's default voice per the
      user's explicit preference (Akhilesh, 2026-07-10).
    - No progress highlighting on the page. Sighted users watching
      the highlight was never the point; blind users hearing it
      was. Real screen-reader users will not use this feature; low-
      vision, dyslexia, ADHD, and cognitive-load users just want
      the words spoken.
    - No pause/resume UI in v1. Toggling off stops. If a user asks
      for pause/resume later, add it then.

  API (compatible with the legacy hook in script.js so existing
  Reset / keyboard-shortcut wiring keeps working):
    window._wsrReadAloud = {
      active:   Boolean,
      activate: fn,
      deactivate: fn
    };
*/
(function () {
  'use strict';
  if (!window.speechSynthesis) return; // graceful no-op on unsupported browsers.

  var synth = window.speechSynthesis;

  function collectText() {
    var root = document.getElementById('main-content') || document.querySelector('main') || document.body;
    if (!root) return '';
    /* Clone so we can strip navigation, headers, footers, and the
       a11y panel itself without mutating the live page. */
    var clone = root.cloneNode(true);
    ['nav', 'header', 'footer', '#a11y-backdrop', '#a11y-panel',
     '.skip-link', 'script', 'style', 'noscript', '.a11y-toggle',
     '.theme-toggle', '.translate-wrapper'].forEach(function (sel) {
      clone.querySelectorAll(sel).forEach(function (el) { el.remove(); });
    });
    /* Collapse whitespace so speech synthesizers do not stall on
       long runs of blank space. */
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function speak(text) {
    if (!text) return;
    synth.cancel(); // clear anything queued
    /* Long strings can exceed some engines' per-utterance limit,
       so break at sentence boundaries. */
    var chunks = text.match(/[^.!?]+[.!?]?/g) || [text];
    chunks.forEach(function (chunk) {
      var u = new SpeechSynthesisUtterance(chunk.trim());
      u.rate  = 1;
      u.pitch = 1;
      u.lang  = document.documentElement.lang || 'en';
      synth.speak(u);
    });
  }

  var ReadAloud = {
    active: false,
    activate: function () {
      this.active = true;
      var text = collectText();
      speak(text || 'Read Aloud is on but no readable content was found on this page.');
    },
    deactivate: function () {
      this.active = false;
      try { synth.cancel(); } catch (e) { /* ignore */ }
    }
  };

  window._wsrReadAloud = ReadAloud;

  /* Wire the switch if it already exists in the DOM. script.js flips
     aria-checked and calls localStorage.setItem, but the visible-on/
     off toggle logic that used to live in screen-reader.js is now
     implemented here. */
  document.addEventListener('DOMContentLoaded', function () {
    var sw = document.getElementById('a11y-read-aloud');
    if (!sw) return;

    /* If a persisted preference says on, activate immediately. */
    try {
      if (localStorage.getItem('a11y-read-aloud') === 'true') {
        sw.setAttribute('aria-checked', 'true');
        ReadAloud.activate();
      }
    } catch (_) { /* localStorage blocked */ }

    sw.addEventListener('click', function () {
      var next = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(next));
      try { localStorage.setItem('a11y-read-aloud', String(next)); } catch (_) {}
      if (next) ReadAloud.activate(); else ReadAloud.deactivate();
    });
    sw.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); sw.click(); }
    });
  });

  /* Alt+Shift+A - alternate hotkey wired in script.js's help
     dialog. That handler calls sw.click(), which we already wired
     above, so no extra work needed here. */

  /* When the user navigates away, stop speaking so the next page
     does not inherit a queued utterance. */
  window.addEventListener('beforeunload', function () {
    try { synth.cancel(); } catch (e) { /* ignore */ }
  });
})();
