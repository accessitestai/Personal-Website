/* ═══════════════════════════════════════════════════════════════
   AMASAMYA Public Checker (checker.js)
   14 structural WCAG 2.2 checks, DOM-based, no getComputedStyle.
   Fetches pages via /.netlify/functions/fetch-page (CORS proxy).
   No login required.
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Config ── */
  var FETCH_PROXY = '/.netlify/functions/fetch-page';

  /* ── State ── */
  var allFindings = [];
  var auditedURL  = '';

  /* ════════════════════════════════════════════════════
     UTILITIES
  ════════════════════════════════════════════════════ */
  function $ (id) { return document.getElementById(id); }

  function announce(msg) {
    var el = $('sr-live');
    if (!el) return;
    el.textContent = '';
    window.requestAnimationFrame(function () { el.textContent = msg; });
  }

  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function setProgress(pct, label) {
    var fill  = $('progress-fill');
    var bar   = $('progress-bar');
    var lbl   = $('progress-label');
    var wrap  = $('progress-wrap');
    if (wrap)  wrap.classList.toggle('active', pct >= 0 && pct <= 100);
    if (fill)  fill.style.width = Math.min(100, Math.max(0, pct)) + '%';
    if (bar)   bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    if (lbl)   lbl.textContent = label || '';
  }

  function hideProgress() {
    var wrap = $('progress-wrap');
    if (wrap) wrap.classList.remove('active');
  }

  function setStatus(msg, isError) {
    var el = $('audit-status');
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
    el.className = 'audit-status' + (isError ? ' error' : '');
    if (msg) announce(msg);
  }

  /* ════════════════════════════════════════════════════
     FORM HANDLER
  ════════════════════════════════════════════════════ */
  var form   = $('checker-form');
  var runBtn = $('run-btn');

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var raw = $('url-input').value.trim();
      if (!raw) {
        setStatus('Please enter a URL to audit.', true);
        $('url-input').focus();
        return;
      }

      /* Normalise URL */
      if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
      var urlObj;
      try { urlObj = new URL(raw); } catch (_) {
        setStatus('That doesn\u2019t look like a valid URL. Example: https://example.com', true);
        return;
      }

      runAudit(urlObj.href);
    });
  }

  /* ════════════════════════════════════════════════════
     MAIN AUDIT FLOW
  ════════════════════════════════════════════════════ */
  function runAudit(url) {
    auditedURL  = url;
    allFindings = [];

    /* UI reset */
    runBtn.disabled = true;
    setStatus('', false);
    $('results-section').hidden = true;
    setProgress(5, 'Fetching page\u2026');
    announce('Audit started for ' + url + '. Please wait.');

    /* Step 1: fetch via proxy */
    var proxyUrl = FETCH_PROXY + '?url=' + encodeURIComponent(url);

    fetch(proxyUrl)
      .then(function (res) {
        setProgress(40, 'Page fetched. Parsing HTML\u2026');
        if (!res.ok) return res.json().then(function (j) { throw new Error(j.error || 'HTTP ' + res.status); });
        return res.text();
      })
      .then(function (html) {
        setProgress(60, 'Running 14 audit checks\u2026');
        return runChecks(html, url);
      })
      .then(function (findings) {
        allFindings = findings;
        setProgress(90, 'Rendering results\u2026');
        setTimeout(function () {
          hideProgress();
          renderResults(findings, url);
          runBtn.disabled = false;
          announce('Audit complete. ' + findings.filter(function(f){return f.verdict==='Fail';}).length + ' failures, ' +
            findings.filter(function(f){return f.verdict==='Warning';}).length + ' warnings. Results displayed below.');
        }, 200);
      })
      .catch(function (err) {
        hideProgress();
        runBtn.disabled = false;
        setStatus('\u26A0 Could not audit this page: ' + err.message +
          '. The page may block server-side fetching (CSP / bot protection). Try the AMASAMYA Chrome Extension instead.', true);
      });
  }

  /* ════════════════════════════════════════════════════
     PARSE HTML INTO SANDBOXED IFRAME DOCUMENT
  ════════════════════════════════════════════════════ */
  function parseHTML(html) {
    /* Use a detached DOMParser — no scripts execute, fully sandboxed */
    var parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }

  /* ════════════════════════════════════════════════════
     14 STRUCTURAL AUDIT CHECKS
  ════════════════════════════════════════════════════ */
  function runChecks(html, pageUrl) {
    var doc = parseHTML(html);
    var findings = [];
    var id = 0;
    function gid() { return 'CHK-' + String(++id).padStart(4, '0'); }

    function describeEl(el) {
      var tag  = el.tagName.toLowerCase();
      var idStr = el.id ? '#' + el.id.slice(0, 30) : '';
      var cls  = typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      var text = (el.textContent || '').trim().slice(0, 50);
      var label = text ? ' \u201c' + text + '\u201d' : '';
      return '<' + tag + idStr + cls + '>' + label;
    }

    function getAccName(el) {
      var lb = el.getAttribute('aria-labelledby');
      if (lb) {
        var names = lb.split(/\s+/).map(function (rid) {
          var ref = doc.getElementById(rid);
          return ref ? ref.textContent.trim() : '';
        }).filter(Boolean);
        if (names.length) return names.join(' ');
      }
      var al = el.getAttribute('aria-label');
      if (al && al.trim()) return al.trim();
      if (el.id) {
        var lbl = doc.querySelector('label[for="' + el.id.replace(/"/g, '\\"') + '"]');
        if (lbl) return lbl.textContent.trim();
      }
      var wl = el.closest('label');
      if (wl) return wl.textContent.trim();
      if (el.tagName === 'IMG') return el.getAttribute('alt') || '';
      var t = el.getAttribute('title');
      if (t && t.trim()) return t.trim();
      return (el.textContent || '').trim().slice(0, 120);
    }

    /* ── 1. Page Title (SC 2.4.2) ── */
    (function checkTitle() {
      var titleEl = doc.querySelector('title');
      var title   = titleEl ? titleEl.textContent.trim() : '';
      if (!title) {
        findings.push({ id: gid(), engine: 'Page Title', verdict: 'Fail',
          criterion: 'WCAG 2.2 SC 2.4.2 (Level A)',
          issue: 'No <title> element found.',
          element: '<head>' });
      } else if (title.length < 4) {
        findings.push({ id: gid(), engine: 'Page Title', verdict: 'Warning',
          criterion: 'WCAG 2.2 SC 2.4.2 (Level A)',
          issue: 'Page title is too short: "' + title + '".',
          element: '<title>' });
      } else {
        findings.push({ id: gid(), engine: 'Page Title', verdict: 'Pass',
          criterion: 'WCAG 2.2 SC 2.4.2 (Level A)',
          issue: 'Page title: "' + title.slice(0, 80) + '".',
          element: '<title>' });
      }
    })();

    /* ── 2. Language of Page (SC 3.1.1) ── */
    (function checkLang() {
      var lang = doc.documentElement.getAttribute('lang');
      if (!lang || !lang.trim()) {
        findings.push({ id: gid(), engine: 'Language', verdict: 'Fail',
          criterion: 'WCAG 2.2 SC 3.1.1 (Level A)',
          issue: 'Missing lang attribute on <html>.',
          element: '<html>' });
      } else {
        findings.push({ id: gid(), engine: 'Language', verdict: 'Pass',
          criterion: 'WCAG 2.2 SC 3.1.1 (Level A)',
          issue: 'lang="' + lang + '" declared.',
          element: '<html lang="' + lang + '">' });
      }
    })();

    /* ── 3. Viewport zoom (SC 1.4.4) ── */
    (function checkViewport() {
      var meta = doc.querySelector('meta[name="viewport"]');
      if (!meta) {
        findings.push({ id: gid(), engine: 'Viewport', verdict: 'Info',
          criterion: 'WCAG 2.2 SC 1.4.4 (Level AA)',
          issue: 'No viewport meta tag found.',
          element: '<head>' });
        return;
      }
      var content = (meta.getAttribute('content') || '').toLowerCase();
      var disabledZoom = /user-scalable\s*=\s*no/.test(content) ||
        /maximum-scale\s*=\s*1(?:[^.0-9]|$)/.test(content);
      if (disabledZoom) {
        findings.push({ id: gid(), engine: 'Viewport', verdict: 'Fail',
          criterion: 'WCAG 2.2 SC 1.4.4 (Level AA)',
          issue: 'Viewport disables user zoom: ' + content,
          element: '<meta name="viewport">' });
      } else {
        findings.push({ id: gid(), engine: 'Viewport', verdict: 'Pass',
          criterion: 'WCAG 2.2 SC 1.4.4 (Level AA)',
          issue: 'Viewport allows user scaling.',
          element: '<meta name="viewport">' });
      }
    })();

    /* ── 4. Heading Structure (SC 2.4.6, 1.3.1) ── */
    (function checkHeadings() {
      var headings = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]'));
      if (!headings.length) {
        findings.push({ id: gid(), engine: 'Headings', verdict: 'Fail',
          criterion: 'WCAG 2.2 SC 2.4.6 (Level AA)',
          issue: 'No heading tags (H1–H6) found.',
          element: 'Page' });
        return;
      }
      var h1s = headings.filter(function (h) {
        return h.tagName === 'H1' || (h.getAttribute('role') === 'heading' && h.getAttribute('aria-level') === '1');
      });
      if (!h1s.length) {
        findings.push({ id: gid(), engine: 'Headings', verdict: 'Fail',
          criterion: 'WCAG 2.2 SC 2.4.6 (Level AA)',
          issue: 'No H1 heading found. Every page needs one primary heading.',
          element: 'Page' });
      } else if (h1s.length > 1) {
        findings.push({ id: gid(), engine: 'Headings', verdict: 'Warning',
          criterion: 'WCAG 2.2 SC 2.4.6 (Level AA)',
          issue: h1s.length + ' H1 headings found. Prefer one H1 per page.',
          element: 'Page' });
      } else {
        findings.push({ id: gid(), engine: 'Headings', verdict: 'Pass',
          criterion: 'WCAG 2.2 SC 2.4.6 (Level AA)',
          issue: 'One H1 found: "' + (h1s[0].textContent || '').trim().slice(0, 60) + '".',
          element: describeEl(h1s[0]) });
      }
      /* Check for skipped levels */
      var prev = 0;
      headings.forEach(function (h) {
        var level = h.tagName && /^H[1-6]$/.test(h.tagName) ? parseInt(h.tagName[1])
          : (parseInt(h.getAttribute('aria-level')) || 2);
        if (prev > 0 && level > prev + 1) {
          findings.push({ id: gid(), engine: 'Headings', verdict: 'Fail',
            criterion: 'WCAG 2.2 SC 1.3.1 (Level A)',
            issue: 'Heading level skipped: H' + prev + ' \u2192 H' + level + '.',
            element: describeEl(h) });
        }
        if (!(h.textContent || '').trim()) {
          findings.push({ id: gid(), engine: 'Headings', verdict: 'Fail',
            criterion: 'WCAG 2.2 SC 2.4.6 (Level AA)',
            issue: 'Empty heading element.',
            element: describeEl(h) });
        }
        prev = level;
      });
    })();

    /* ── 5. Landmark Regions (SC 2.4.1, 1.3.1) ── */
    (function checkLandmarks() {
      var hasMain = doc.querySelector('main,[role="main"]');
      var hasNav  = doc.querySelector('nav,[role="navigation"]');
      if (!hasMain) {
        findings.push({ id: gid(), engine: 'Landmarks', verdict: 'Fail',
          criterion: 'WCAG 2.2 SC 2.4.1 / 1.3.1 (Level A)',
          issue: 'No <main> landmark found. Page content is not programmatically identified.',
          element: 'Page' });
      } else {
        findings.push({ id: gid(), engine: 'Landmarks', verdict: 'Pass',
          criterion: 'WCAG 2.2 SC 2.4.1 (Level A)',
          issue: '<main> landmark present.',
          element: '<main>' });
      }
      if (!hasNav) {
        findings.push({ id: gid(), engine: 'Landmarks', verdict: 'Info',
          criterion: 'WCAG 2.2 SC 2.4.1 (Level A)',
          issue: 'No <nav> landmark found. If this page has navigation, wrap it in <nav>.',
          element: 'Page' });
      }
      /* Multiple mains */
      var mains = Array.from(doc.querySelectorAll('main,[role="main"]'));
      if (mains.length > 1) {
        findings.push({ id: gid(), engine: 'Landmarks', verdict: 'Fail',
          criterion: 'WCAG 2.2 SC 1.3.1 (Level A)',
          issue: mains.length + ' <main> landmarks found. Only one is allowed.',
          element: 'Page' });
      }
    })();

    /* ── 6. Skip Navigation Link (SC 2.4.1) ── */
    (function checkSkipLink() {
      var links = Array.from(doc.querySelectorAll('a[href]'));
      var skipLink = links.find(function (a) {
        var href = a.getAttribute('href') || '';
        var text = (a.textContent || '').toLowerCase().trim();
        return href.startsWith('#') && (
          text.includes('skip') || text.includes('jump') || text.includes('bypass') || text.includes('main content')
        );
      });
      if (!skipLink) {
        findings.push({ id: gid(), engine: 'Skip Link', verdict: 'Warning',
          criterion: 'WCAG 2.2 SC 2.4.1 (Level A)',
          issue: 'No skip navigation link found. Keyboard users must tab through all nav items on every page.',
          element: 'Page' });
      } else {
        findings.push({ id: gid(), engine: 'Skip Link', verdict: 'Pass',
          criterion: 'WCAG 2.2 SC 2.4.1 (Level A)',
          issue: 'Skip link found: "' + (skipLink.textContent || '').trim().slice(0, 60) + '".',
          element: describeEl(skipLink) });
      }
    })();

    /* ── 7. Images: alt text (SC 1.1.1) ── */
    (function checkImages() {
      var imgs = Array.from(doc.querySelectorAll('img'));
      var fails = 0, decorative = 0, described = 0;
      imgs.forEach(function (img) {
        var alt = img.getAttribute('alt');
        if (alt === null) {
          fails++;
          findings.push({ id: gid(), engine: 'Images', verdict: 'Fail',
            criterion: 'WCAG 2.2 SC 1.1.1 (Level A)',
            issue: 'Image missing alt attribute.',
            element: '<img src="' + (img.getAttribute('src') || '').split('/').pop().split('?')[0].slice(0, 40) + '">' });
        } else if (alt.trim() === '') {
          decorative++;
        } else {
          var badAlt = ['image','photo','picture','graphic','icon','img','.png','.jpg','.gif','.svg','.webp'];
          if (badAlt.some(function (p) { return alt.toLowerCase() === p || alt.toLowerCase().endsWith(p); })) {
            findings.push({ id: gid(), engine: 'Images', verdict: 'Fail',
              criterion: 'WCAG 2.2 SC 1.1.1 (Level A)',
              issue: 'Generic alt text: "' + alt + '". Use a meaningful description.',
              element: describeEl(img) });
          } else {
            described++;
          }
        }
      });
      if (!imgs.length) {
        findings.push({ id: gid(), engine: 'Images', verdict: 'Info',
          criterion: 'WCAG 2.2 SC 1.1.1 (Level A)',
          issue: 'No <img> elements found.',
          element: 'Page' });
      } else if (!fails) {
        findings.push({ id: gid(), engine: 'Images', verdict: 'Pass',
          criterion: 'WCAG 2.2 SC 1.1.1 (Level A)',
          issue: imgs.length + ' images checked — ' + described + ' described, ' + decorative + ' decorative (alt="").',
          element: 'Page' });
      }
      /* SVG without accessible name */
      Array.from(doc.querySelectorAll('svg')).forEach(function (svg) {
        if (svg.getAttribute('aria-hidden') === 'true') return;
        if (!getAccName(svg) && !svg.querySelector('title')) {
          findings.push({ id: gid(), engine: 'Images', verdict: 'Fail',
            criterion: 'WCAG 2.2 SC 1.1.1 (Level A)',
            issue: 'SVG has no accessible name (no <title>, aria-label, or aria-hidden).',
            element: describeEl(svg) });
        }
      });
    })();

    /* ── 8. Form Controls: Labels (SC 1.3.1, 3.3.2) ── */
    (function checkForms() {
      var controls = Array.from(doc.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="reset"]):not([type="button"]),' +
        'select,textarea,[role="textbox"],[role="combobox"],[role="checkbox"],[role="radio"],[role="switch"],[role="spinbutton"]'
      ));
      var unlabelled = 0;
      controls.forEach(function (el) {
        var name = getAccName(el);
        if (!name || !name.trim()) {
          unlabelled++;
          findings.push({ id: gid(), engine: 'Forms', verdict: 'Fail',
            criterion: 'WCAG 2.2 SC 1.3.1 / 3.3.2 (Level A)',
            issue: 'Form control has no accessible label.',
            element: describeEl(el) });
        }
      });
      if (controls.length && !unlabelled) {
        findings.push({ id: gid(), engine: 'Forms', verdict: 'Pass',
          criterion: 'WCAG 2.2 SC 1.3.1 / 3.3.2 (Level A)',
          issue: controls.length + ' form controls checked — all labelled.',
          element: 'Page' });
      }
      if (!controls.length) {
        findings.push({ id: gid(), engine: 'Forms', verdict: 'Info',
          criterion: 'WCAG 2.2 SC 1.3.1 / 3.3.2 (Level A)',
          issue: 'No form controls found.',
          element: 'Page' });
      }
    })();

    /* ── 9. Links and Buttons: Accessible Names (SC 2.4.4, 4.1.2) ── */
    (function checkLinksButtons() {
      var genericTerms = ['click here','read more','learn more','here','more','link','button',
        'continue','go','visit','see more','view more','details','click','tap'];
      /* Links */
      var links = Array.from(doc.querySelectorAll('a[href],[role="link"]'));
      links.forEach(function (el) {
        var name = getAccName(el).toLowerCase().trim();
        if (!name) {
          findings.push({ id: gid(), engine: 'Links & Buttons', verdict: 'Fail',
            criterion: 'WCAG 2.2 SC 2.4.4 / 4.1.2 (Level A)',
            issue: 'Link has no accessible name.',
            element: describeEl(el) });
        } else if (genericTerms.includes(name)) {
          findings.push({ id: gid(), engine: 'Links & Buttons', verdict: 'Fail',
            criterion: 'WCAG 2.2 SC 2.4.4 (Level A)',
            issue: 'Generic link text: "' + name + '". Use a descriptive label.',
            element: describeEl(el) });
        }
      });
      /* Buttons */
      var btns = Array.from(doc.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]'));
      btns.forEach(function (el) {
        if (!getAccName(el).trim()) {
          findings.push({ id: gid(), engine: 'Links & Buttons', verdict: 'Fail',
            criterion: 'WCAG 2.2 SC 4.1.2 (Level A)',
            issue: 'Button has no accessible name.',
            element: describeEl(el) });
        }
      });
    })();

    /* ── 10. Focus Order: Positive tabindex (SC 2.4.3) ── */
    (function checkTabindex() {
      var positives = Array.from(doc.querySelectorAll('[tabindex]')).filter(function (el) {
        var ti = parseInt(el.getAttribute('tabindex'));
        return !isNaN(ti) && ti > 0;
      });
      if (positives.length) {
        positives.slice(0, 10).forEach(function (el) {
          findings.push({ id: gid(), engine: 'Focus Order', verdict: 'Fail',
            criterion: 'WCAG 2.2 SC 2.4.3 (Level A)',
            issue: 'Positive tabindex="' + el.getAttribute('tabindex') + '" disrupts natural focus order.',
            element: describeEl(el) });
        });
        if (positives.length > 10) {
          findings.push({ id: gid(), engine: 'Focus Order', verdict: 'Fail',
            criterion: 'WCAG 2.2 SC 2.4.3 (Level A)',
            issue: (positives.length - 10) + ' more elements with positive tabindex (showing first 10).',
            element: 'Page' });
        }
      } else {
        findings.push({ id: gid(), engine: 'Focus Order', verdict: 'Pass',
          criterion: 'WCAG 2.2 SC 2.4.3 (Level A)',
          issue: 'No positive tabindex values found.',
          element: 'Page' });
      }
    })();

    /* ── 11. Iframes: title attribute (SC 4.1.2) ── */
    (function checkIframes() {
      var iframes = Array.from(doc.querySelectorAll('iframe'));
      if (!iframes.length) return;
      var fails = 0;
      iframes.forEach(function (fr) {
        var title = (fr.getAttribute('title') || '').trim();
        if (!title) {
          fails++;
          findings.push({ id: gid(), engine: 'Iframes', verdict: 'Fail',
            criterion: 'WCAG 2.2 SC 4.1.2 (Level A)',
            issue: 'iframe missing title attribute.',
            element: '<iframe src="' + (fr.getAttribute('src') || '').slice(0, 40) + '">' });
        }
      });
      if (!fails) {
        findings.push({ id: gid(), engine: 'Iframes', verdict: 'Pass',
          criterion: 'WCAG 2.2 SC 4.1.2 (Level A)',
          issue: iframes.length + ' iframe(s) all have title attributes.',
          element: 'Page' });
      }
    })();

    /* ── 12. Tables: header cells (SC 1.3.1) ── */
    (function checkTables() {
      var tables = Array.from(doc.querySelectorAll('table'));
      if (!tables.length) return;
      var noHeaders = tables.filter(function (t) {
        return !t.querySelector('th,[scope],[role="columnheader"],[role="rowheader"]');
      });
      if (noHeaders.length) {
        noHeaders.slice(0, 5).forEach(function (t) {
          findings.push({ id: gid(), engine: 'Tables', verdict: 'Fail',
            criterion: 'WCAG 2.2 SC 1.3.1 (Level A)',
            issue: 'Table has no header cells (<th> or scope attribute).',
            element: describeEl(t) });
        });
      } else {
        findings.push({ id: gid(), engine: 'Tables', verdict: 'Pass',
          criterion: 'WCAG 2.2 SC 1.3.1 (Level A)',
          issue: tables.length + ' table(s) checked — all have header cells.',
          element: 'Page' });
      }
    })();

    /* ── 13. ARIA Roles: validity (SC 4.1.2) ── */
    (function checkARIA() {
      var VALID_ROLES = new Set([
        'alert','alertdialog','application','article','banner','button','cell','checkbox',
        'columnheader','combobox','complementary','contentinfo','definition','dialog',
        'directory','document','feed','figure','form','grid','gridcell','group',
        'heading','img','link','list','listbox','listitem','log','main','marquee',
        'math','menu','menubar','menuitem','menuitemcheckbox','menuitemradio','navigation',
        'none','note','option','presentation','progressbar','radio','radiogroup',
        'region','row','rowgroup','rowheader','scrollbar','search','searchbox',
        'separator','slider','spinbutton','status','switch','tab','table','tablist',
        'tabpanel','term','textbox','timer','toolbar','tooltip','tree','treegrid','treeitem',
      ]);
      var ariaEls = Array.from(doc.querySelectorAll('[role]'));
      var invalid = ariaEls.filter(function (el) {
        var roles = (el.getAttribute('role') || '').split(/\s+/).filter(Boolean);
        return roles.some(function (r) { return !VALID_ROLES.has(r); });
      });
      if (invalid.length) {
        invalid.slice(0, 5).forEach(function (el) {
          findings.push({ id: gid(), engine: 'ARIA', verdict: 'Fail',
            criterion: 'WCAG 2.2 SC 4.1.2 (Level A)',
            issue: 'Invalid ARIA role: role="' + el.getAttribute('role') + '".',
            element: describeEl(el) });
        });
      } else if (ariaEls.length) {
        findings.push({ id: gid(), engine: 'ARIA', verdict: 'Pass',
          criterion: 'WCAG 2.2 SC 4.1.2 (Level A)',
          issue: ariaEls.length + ' ARIA role(s) are all valid.',
          element: 'Page' });
      }
    })();

    /* ── 14. Duplicate IDs on interactive elements (SC 4.1.1) ── */
    (function checkDuplicateIds() {
      var interactive = Array.from(doc.querySelectorAll(
        'a[id],button[id],input[id],select[id],textarea[id],[role][id]'
      ));
      var seen  = {};
      var dupes = {};
      interactive.forEach(function (el) {
        var id = el.id;
        if (!id) return;
        if (seen[id]) { dupes[id] = true; }
        seen[id] = true;
      });
      var dupeIds = Object.keys(dupes);
      if (dupeIds.length) {
        dupeIds.slice(0, 10).forEach(function (dupeId) {
          findings.push({ id: gid(), engine: 'Duplicate IDs', verdict: 'Fail',
            criterion: 'WCAG 2.2 SC 4.1.1 (Level A)',
            issue: 'Duplicate id="' + dupeId + '" on multiple interactive elements.',
            element: 'id="' + dupeId + '"' });
        });
      } else {
        findings.push({ id: gid(), engine: 'Duplicate IDs', verdict: 'Pass',
          criterion: 'WCAG 2.2 SC 4.1.1 (Level A)',
          issue: 'No duplicate IDs on interactive elements.',
          element: 'Page' });
      }
    })();

    return Promise.resolve(findings);
  }

  /* ════════════════════════════════════════════════════
     RENDER RESULTS
  ════════════════════════════════════════════════════ */
  function renderResults(findings, url) {
    var fail = findings.filter(function (f) { return f.verdict === 'Fail'; }).length;
    var warn = findings.filter(function (f) { return f.verdict === 'Warning'; }).length;
    var pass = findings.filter(function (f) { return f.verdict === 'Pass'; }).length;
    var info = findings.filter(function (f) { return f.verdict === 'Info'; }).length;

    /* Summary */
    var grid = $('summary-grid');
    grid.innerHTML = '';
    [
      { n: fail, l: 'Failures', cls: 'n-fail' },
      { n: warn, l: 'Warnings', cls: 'n-warn' },
      { n: pass, l: 'Passes',   cls: 'n-pass' },
      { n: info, l: 'Info',     cls: 'n-info' },
      { n: findings.length, l: 'Total', cls: 'n-info' },
    ].forEach(function (s) {
      var card = document.createElement('div');
      card.className = 'summary-card';
      card.setAttribute('aria-label', s.n + ' ' + s.l);
      card.innerHTML = '<div class="summary-n ' + s.cls + '" aria-hidden="true">' + s.n + '</div>' +
        '<div class="summary-l">' + s.l + '</div>';
      grid.appendChild(card);
    });

    /* Engine filter */
    var ef = $('filter-engine');
    ef.innerHTML = '<option value="All">All checks</option>';
    var engines = Array.from(new Set(findings.map(function (f) { return f.engine; })));
    engines.forEach(function (e) {
      var opt = document.createElement('option');
      opt.value = e; opt.textContent = e;
      ef.appendChild(opt);
    });

    /* Table */
    renderTable(findings);

    /* Show section */
    var section = $('results-section');
    section.hidden = false;
    var heading = $('results-heading');
    if (heading) {
      heading.textContent = 'Audit Results — ' + new URL(url).hostname;
      heading.focus();
    }
  }

  function renderTable(findings) {
    var tbody = $('findings-tbody');
    tbody.innerHTML = '';

    if (!findings.length) {
      var empty = document.createElement('tr');
      empty.innerHTML = '<td colspan="5" style="text-align:center;padding:24px;color:var(--text-3);">No findings match the current filter.</td>';
      tbody.appendChild(empty);
      return;
    }

    findings.forEach(function (f) {
      var tr = document.createElement('tr');
      var verdictClass = {
        'Fail':    'badge-fail',
        'Warning': 'badge-warn',
        'Pass':    'badge-pass',
        'Info':    'badge-info',
      }[f.verdict] || 'badge-info';

      tr.innerHTML =
        '<td><span class="badge ' + verdictClass + '">' + esc(f.verdict) + '</span></td>' +
        '<td>' + esc(f.engine) + '</td>' +
        '<td>' + esc(f.issue) + '</td>' +
        '<td><code>' + esc((f.element || '').slice(0, 80)) + '</code></td>' +
        '<td style="font-family:var(--mono);font-size:11px;">' + esc(f.criterion) + '</td>';
      tbody.appendChild(tr);
    });
  }

  /* ════════════════════════════════════════════════════
     FILTERS
  ════════════════════════════════════════════════════ */
  ['filter-verdict', 'filter-engine'].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('change', applyFilters);
  });

  function applyFilters() {
    var v = ($('filter-verdict').value);
    var e = ($('filter-engine').value);
    var filtered = allFindings.filter(function (f) {
      return (v === 'All' || f.verdict === v) && (e === 'All' || f.engine === e);
    });
    renderTable(filtered);
    announce('Filter applied. ' + filtered.length + ' findings shown.');
  }

})();
