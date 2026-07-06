/**
 * AMASAMYA Extension - Background Service Worker v4.3.0
 *
 * Orchestrates:
 *   A. WCAG Audit  - injects content-script.js, relays findings to side panel + platform
 *   B. Focus Narrator (Module 2) - screenshots + Vision LLM per focused element
 *   C. Visual Layout Auditor (Module 1) - debugger-based multi-breakpoint screenshots + Vision LLM
 *   D. State Change Watchdog (Module 3) - MutationObserver + live region / focus management checks
 */

'use strict';

const PLATFORM_URL = 'https://amasamya.akhileshmalani.com';

/* ════════════════════════════════════════════════════════
   FEATURE FLAGS
   ────────────────────────────────────────────────────────
   Off-by-default booleans that let in-development features
   ship code to users without changing what those users
   actually see. Flip to true only on the release commit that
   ships the feature.

   SITE_CRAWL_ENABLED gates v4.2.0 Site Crawl. While false, no
   crawl UI is exposed in the side panel, no crawl messages
   are routed, and the new modules (engines/site-crawler.js,
   engines/sitemap-parser.js) are dead code from the user's
   perspective. Their tests still run on Playwright because
   tests load the modules directly.
   ──────────────────────────────────────────────────────── */
const SITE_CRAWL_ENABLED = true; /* v4.2.0 release - flag flipped at commit L */

/* Pull the crawler + sitemap parser into the service worker
   scope. importScripts is the only way to share code between
   files in an MV3 classic service worker; module-type SWs
   would allow ESM imports but we have not migrated. The
   modules guard their exports behind `self.AMASAMYA*` globals,
   so this is safe to evaluate even while the feature flag is
   off (they just sit dormant). */
try {
  if (typeof self.importScripts === 'function') {
    self.importScripts(
      'engines/site-crawler.js',
      'engines/sitemap-parser.js',
      /* v4.3.0: Audit history + diff. History storage runs on every
         audit; the diff engine is called from the side panel when a
         previous audit exists for the current URL. */
      'engines/audit-history.js',
      'engines/audit-diff.js'
    );
  }
} catch (e) {
  console.warn('AMASAMYA: engine modules not loaded:', e && e.message);
}

/* ════════════════════════════════════════════════════════
   A. WCAG AUDIT - existing behaviour (unchanged)
════════════════════════════════════════════════════════ */

/* Chrome forbids extensions from injecting scripts into a handful
   of "restricted" URLs: browser-internal pages, the Chrome Web
   Store gallery (both old and new domains), the view-source
   scheme, and other extension pages. Trying anyway surfaces an
   unhelpful raw error like "The extensions gallery cannot be
   scripted." For a screen-reader user that error is doubly
   disorienting because it gives no hint about what to do next.
   Centralise the detection here and return a clear plain-English
   reason that both background.js and panel.js can show. */
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

/* v4.3.0: persist a completed audit into the on-device history store
   so subsequent audits of the same URL can be diffed. Silent on
   failure (history is nice-to-have, not required for correctness). */
async function persistAuditToHistory(message) {
  if (typeof self.AMASAMYAAuditHistory === 'undefined') return;
  const url = message.pageUrl || message.url;
  if (!url) return;
  const deps = self.AMASAMYAAuditHistory.makeChromeStorageDeps();
  await self.AMASAMYAAuditHistory.saveAudit(url, message.findings || [], {
    timestamp: message.timestamp || new Date().toISOString(),
    pageTitle: message.pageTitle || message.title || '',
    pageUrl:   url
  }, deps);
}

chrome.action.onClicked.addListener(async (tab) => {
  try { await chrome.sidePanel.open({ windowId: tab.windowId }); } catch (_) {}
  const reason = restrictedUrlReason(tab && tab.url);
  if (reason) {
    /* Surface the reason to the side panel so a screen-reader
       user hears it through the polite live region. Fall back to
       session storage if the panel is not yet listening. */
    const msg = { type: 'audit-error', error: reason };
    chrome.runtime.sendMessage(msg).catch(() => {
      chrome.storage.session.set({ lastAudit: msg }).catch(() => {});
    });
    return;
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-script.js'] });
  } catch (err) {
    console.error('AMASAMYA injection error:', err);
    const msg = { type: 'audit-error', error: 'AMASAMYA could not run on this tab: ' + err.message };
    chrome.runtime.sendMessage(msg).catch(() => {
      chrome.storage.session.set({ lastAudit: msg }).catch(() => {});
    });
  }
});

/* ════════════════════════════════════════════════════════
   SITE CRAWL ORCHESTRATOR (v4.2.0)
   ────────────────────────────────────────────────────────
   Lives in the service worker. Receives `site-crawl-start`
   from the side panel, resolves the URL list (via the
   sitemap parser if requested), constructs SiteCrawler with
   chrome deps + an awaitAuditResults implementation that
   intercepts the standard `audit-results` message bus, runs
   the crawl, broadcasts `site-crawl-ui` phase updates back
   to the panel, and forwards each page's findings to the
   platform tab via a new `AMASAMYA_crawl_page_result`
   message.

   All access is gated by SITE_CRAWL_ENABLED. If the flag is
   off the message handlers are still registered but reject
   immediately with a clear reason.
═════════════════════════════════════════════════════════ */

let __crawlCurrent  = null; /* { crawler, waiters: Map<tabId, resolve>, pending: Map<tabId, findings[]> } */
const CRAWL_WAIT_TIMEOUT = 25000; /* match the per-page audit budget */

/* v4.2.1: findings-shape validator. The platform's aggregated
   report renders each finding's selector + verdict; a finding with
   missing fields drops out silently in the export. Reject at the
   bridge so malformed page-side output never crosses the wire. */
function validCrawlFinding(f) {
  return f && typeof f === 'object'
       && typeof f.selector === 'string' && f.selector.length > 0
       && typeof f.verdict  === 'string' && f.verdict.length > 0;
}

function broadcastCrawlUi(message) {
  /* The side panel may not be open. Swallow disconnected-port errors. */
  chrome.runtime.sendMessage(Object.assign({ type: 'site-crawl-ui' }, message)).catch(() => {});
}

async function sendCrawlPageToPlatform(record) {
  /* Forward a single page's findings to the AMASAMYA platform tab if
     one is open. Mirrors the silent-when-absent behaviour of
     sendResultsToPlatform: we never auto-open the platform; if it is
     not already in a tab, the crawl results stay on-device for
     export. */
  try {
    const existingTabs = await chrome.tabs.query({ url: PLATFORM_URL + '/*' });
    if (existingTabs.length === 0) return;
    const platformTab = existingTabs[0];
    /* v4.2.1: guard findings shape before crossing the platform bridge. */
    const cleanFindings = Array.isArray(record.findings)
      ? record.findings.filter(validCrawlFinding)
      : [];
    await chrome.tabs.sendMessage(platformTab.id, {
      type:      'AMASAMYA_crawl_page_result',
      url:       record.url,
      finalUrl:  record.finalUrl,
      title:     record.finalTitle,
      status:    record.status,
      index:     record.index,
      findings:  cleanFindings,
      durationMs: record.durationMs,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.warn('AMASAMYA platform crawl bridge:', err && err.message);
  }
}

async function startSiteCrawl(input) {
  if (!SITE_CRAWL_ENABLED) {
    broadcastCrawlUi({ phase: 'error', message: 'Site Crawl is disabled in this build.' });
    return;
  }
  if (__crawlCurrent) {
    broadcastCrawlUi({ phase: 'error', message: 'A crawl is already running.' });
    return;
  }
  if (typeof self.AMASAMYASiteCrawler === 'undefined') {
    broadcastCrawlUi({ phase: 'error', message: 'Site Crawl modules failed to load.' });
    return;
  }

  /* Resolve the URL list. */
  let urls = [];
  try {
    if (input && input.source === 'sitemap') {
      const parsed = await self.AMASAMYASitemapParser.resolveSiteUrls(input.root, {});
      urls = parsed.urls.map(u => u.loc);
      if (parsed.capped) {
        broadcastCrawlUi({ phase: 'progress', index: 0, total: urls.length,
          url: `Sitemap had ${parsed.total} URLs; crawling top ${urls.length} by priority.` });
      }
    } else if (input && input.source === 'list') {
      urls = Array.isArray(input.urls) ? input.urls : [];
    } else {
      broadcastCrawlUi({ phase: 'error', message: 'No URL source provided.' });
      return;
    }
  } catch (err) {
    broadcastCrawlUi({ phase: 'error', message: 'URL resolution failed: ' + (err && err.message ? err.message : String(err)) });
    return;
  }

  if (!urls.length) {
    broadcastCrawlUi({ phase: 'error', message: 'No URLs to crawl after resolution.' });
    return;
  }

  /* Construct crawler with real chrome deps + an awaitAuditResults
     impl that intercepts the standard audit-results message for the
     specific tab id we just injected.

     v4.2.1: added a `pending` buffer keyed by tabId. The race is:
     content-script.js can post audit-results before the crawler
     has installed its waiter (fast-loading pages, or the
     awaitAuditResults call being scheduled a microtask after
     executeScript resolves). Previously that message escaped through
     the standalone-audit branch and the crawler timed out with null.
     Now: if we see audit-results with no waiter yet, we stash it in
     `pending`. When the waiter arrives, it drains the buffer first. */
  const waiters = new Map(); /* tabId -> { resolve, timer } */
  const pending = new Map(); /* tabId -> findings[] */
  const crawler = new self.AMASAMYASiteCrawler.SiteCrawler({
    createTab:        (url) => chrome.tabs.create({ url: url, active: false }),
    removeTab:        (tabId) => chrome.tabs.remove(tabId),
    getTab:           (tabId) => chrome.tabs.get(tabId),
    executeScript:    (tabId, files) => chrome.scripting.executeScript({ target: { tabId: tabId }, files: files }),
    onTabUpdated:     chrome.tabs && chrome.tabs.onUpdated,
    onAuditMessage:   chrome.runtime && chrome.runtime.onMessage,
    awaitAuditResults: (tabId, timeoutMs) => new Promise((resolve) => {
      /* Drain the buffer first: if audit-results already landed, resolve immediately. */
      if (pending.has(tabId)) {
        const findings = pending.get(tabId);
        pending.delete(tabId);
        resolve(findings);
        return;
      }
      const ms = (typeof timeoutMs === 'number' ? timeoutMs : CRAWL_WAIT_TIMEOUT);
      const timer = setTimeout(() => { waiters.delete(tabId); resolve(null); }, ms);
      waiters.set(tabId, { resolve: resolve, timer: timer });
    }),
    delay:            (ms) => new Promise((r) => setTimeout(r, ms)),
    now:              () => Date.now()
  });

  __crawlCurrent = { crawler: crawler, waiters: waiters, pending: pending };

  crawler
    .on('progress',     (p) => broadcastCrawlUi({ phase: 'progress', index: p.index, total: p.total, url: p.url }))
    .on('pageComplete', async (rec) => {
      broadcastCrawlUi({ phase: 'pageComplete', record: rec });
      if (rec.status === 'audited' && Array.isArray(rec.findings) && rec.findings.length > 0) {
        await sendCrawlPageToPlatform(rec);
      }
    })
    .on('complete',     (summary) => {
      broadcastCrawlUi({ phase: 'complete', summary: summary });
      /* v4.2.1: drop any leftover pending buffer so it cannot leak
         into the next crawl. Waiters map should already be empty. */
      pending.clear();
      waiters.clear();
      __crawlCurrent = null;
    });

  broadcastCrawlUi({ phase: 'queued', total: urls.length });
  await crawler.start(urls);
}

function cancelSiteCrawl() {
  if (__crawlCurrent && __crawlCurrent.crawler) {
    __crawlCurrent.crawler.cancel();
    /* v4.2.1: pre-empt any waiter that is currently blocked on
       audit-results. Without this, cancel appears to hang for up
       to 25 seconds (the per-page timeout) before the loop notices
       the state change. Resolve with null so the current page ends
       as NO_RESPONSE and the loop breaks on its next iteration. */
    if (__crawlCurrent.waiters) {
      __crawlCurrent.waiters.forEach((w) => {
        clearTimeout(w.timer);
        w.resolve(null);
      });
      __crawlCurrent.waiters.clear();
    }
    broadcastCrawlUi({ phase: 'cancelled' });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  /* v4.3.0 ── Audit History requests from the side panel ── */
  if (message && message.type === 'history-request') {
    (async () => {
      if (typeof self.AMASAMYAAuditHistory === 'undefined') {
        sendResponse({ error: 'History module not loaded' });
        return;
      }
      const deps = self.AMASAMYAAuditHistory.makeChromeStorageDeps();
      try {
        if (message.action === 'list') {
          const list = await self.AMASAMYAAuditHistory.getHistory(message.url, deps);
          sendResponse({ list: list });
        } else if (message.action === 'get') {
          const audit = await self.AMASAMYAAuditHistory.getAudit(message.url, message.timestamp, deps);
          sendResponse({ audit: audit });
        } else if (message.action === 'previous') {
          const audit = await self.AMASAMYAAuditHistory.getPreviousAudit(message.url, message.timestamp, deps);
          sendResponse({ audit: audit });
        } else if (message.action === 'clear-url') {
          await self.AMASAMYAAuditHistory.clearHistory(message.url, deps);
          sendResponse({ ok: true });
        } else if (message.action === 'clear-all') {
          await self.AMASAMYAAuditHistory.clearAllHistory(deps);
          sendResponse({ ok: true });
        } else {
          sendResponse({ error: 'Unknown history action' });
        }
      } catch (err) {
        sendResponse({ error: (err && err.message) || String(err) });
      }
    })();
    return true; /* async sendResponse */
  }

  /* ── Site Crawl control ── */
  if (message && message.type === 'site-crawl-start') {
    startSiteCrawl(message.input);
    return false;
  }
  if (message && message.type === 'site-crawl-cancel') {
    cancelSiteCrawl();
    return false;
  }

  /* ── Crawl-internal: an audit-results message that arrives from a
        crawler-managed tab should be routed to the waiter that the
        crawler installed, NOT broadcast to the side panel as a
        standalone audit result.

        v4.2.1: race fix. Previously we only intercepted when a
        waiter was already installed. If audit-results arrived first
        (fast pages, cached content), it fell through to the
        standalone-audit branch, the crawler's later awaitAuditResults
        got null on timeout, and the page was recorded as PASS with
        empty findings. Now we recognise a crawler-managed tab by
        two channels: an installed waiter (fast path), OR a tab that
        this crawler has ever asked about (we track by leaving an
        entry in the pending map when we see the first message).
        For robustness against orphan messages after the crawl ends,
        we only buffer when __crawlCurrent exists. ─────────────── */
  if (message && message.type === 'audit-results' && __crawlCurrent && sender && sender.tab) {
    const tabId    = sender.tab.id;
    const findings = Array.isArray(message.findings) ? message.findings : [];
    if (__crawlCurrent.waiters.has(tabId)) {
      const w = __crawlCurrent.waiters.get(tabId);
      __crawlCurrent.waiters.delete(tabId);
      clearTimeout(w.timer);
      w.resolve(findings);
      return false;
    }
    /* No waiter yet. Is this tab one the crawler opened? Only the
       crawler creates background tabs while __crawlCurrent is set,
       so any audit-results whose sender tab we did not open must
       have come from a real user-driven audit. Distinguish by tab
       activeness: crawler-opened tabs have active=false. */
    if (sender.tab.active === false) {
      __crawlCurrent.pending.set(tabId, findings);
      return false;
    }
    /* Foreground tab; fall through to the standalone-audit branch. */
  }

  /* ── WCAG audit results → side panel + platform + history ── */
  if (message.type === 'audit-results' || message.type === 'audit-error') {
    chrome.runtime.sendMessage(message).catch(() => {
      chrome.storage.session.set({ lastAudit: message }).catch(() => {});
    });
    if (message.type === 'audit-results') {
      sendResultsToPlatform(message);
      /* v4.3.0: persist to history so future audits of the same URL
         can be diffed against this one. Fire-and-forget: history
         failure must not block the audit results reaching the side
         panel or the platform. */
      persistAuditToHistory(message).catch((err) => {
        console.warn('AMASAMYA history save failed:', err && err.message);
      });
    }
    return false;
  }

  /* ── Focus Narrator messages ── */
  if (message.type === 'focus-narrator-start') {
    chrome.runtime.sendMessage({
      type: 'focus-narrator-ui',
      phase: 'started',
      total: message.total,
      url:   message.url,
      title: message.title
    }).catch(() => {});
    return false;
  }

  if (message.type === 'focus-narrator-element-ready') {
    /* Run async - cannot return a promise directly from onMessage */
    handleFocusElement(message.element, sender.tab?.id);
    return false;
  }

  if (message.type === 'focus-narrator-complete') {
    chrome.runtime.sendMessage({ type: 'focus-narrator-ui', phase: 'done' }).catch(() => {});
    return false;
  }

  /* ── Side panel triggers a Focus Narrator run ── */
  if (message.type === 'focus-narrator-run') {
    startFocusNarrator();
    return false;
  }

  /* ── Side panel triggers a Visual Layout Audit run ── */
  if (message.type === 'visual-layout-run') {
    startVisualLayoutAudit();
    return false;
  }

  /* ── State Change Watchdog ── */
  if (message.type === 'state-watchdog-run') {
    startStateWatchdog(sender);
    return false;
  }

  /* ── Annotated Screenshot ── */
  if (message.type === 'annotated-screenshot-run') {
    captureAnnotatedScreenshot(message.findings);
    return false;
  }

  if (message.type === 'state-watchdog-stop-request') {
    stopStateWatchdog();
    return false;
  }

  if (message.type === 'state-watchdog-started') {
    chrome.runtime.sendMessage({
      type:  'state-watchdog-ui',
      phase: 'started',
      url:   message.url,
      title: message.title
    }).catch(() => {});
    return false;
  }

  if (message.type === 'state-watchdog-event') {
    chrome.runtime.sendMessage({
      type:  'state-watchdog-ui',
      phase: 'event',
      event: message.event
    }).catch(() => {});
    return false;
  }

  if (message.type === 'state-watchdog-stopped') {
    chrome.runtime.sendMessage({
      type:  'state-watchdog-ui',
      phase: 'stopped'
    }).catch(() => {});
    return false;
  }

  return false;
});

/* ════════════════════════════════════════════════════════
   B. FOCUS NARRATOR - Module 2
════════════════════════════════════════════════════════ */

/* v3.3.0 - Check that the user has a Vision AI key configured BEFORE
   we walk a page, capture screenshots, and produce empty findings.
   Bug surfaced by Mujtaba's IOB audit, May 2026: the Focus Narrator
   was generating 12-element reports where every row said "No Vision
   AI key configured" - the tool was wasting the user's time. */
async function hasVisionAiKeyConfigured() {
  const store = await chrome.storage.local.get([
    'AMASAMYA_vision_provider',
    'AMASAMYA_anthropic_key',
    'AMASAMYA_openai_key',
    'AMASAMYA_gemini_key'
  ]);
  const provider = store.AMASAMYA_vision_provider || 'anthropic';
  if (provider === 'openai'    && store.AMASAMYA_openai_key)    return true;
  if (provider === 'anthropic' && store.AMASAMYA_anthropic_key) return true;
  if (provider === 'gemini'    && store.AMASAMYA_gemini_key)    return true;
  /* Cross-provider fallback - if any key exists, treat as configured. */
  return !!(store.AMASAMYA_openai_key || store.AMASAMYA_anthropic_key || store.AMASAMYA_gemini_key);
}

async function startFocusNarrator() {
  try {
    /* Gate: require a configured Vision AI key BEFORE doing any work. */
    if (!(await hasVisionAiKeyConfigured())) {
      chrome.runtime.sendMessage({
        type: 'focus-narrator-ui',
        phase: 'error',
        message: 'No Vision AI key configured. Open the Settings tab in the AMASAMYA side panel, add an API key from one of the supported providers (Anthropic Claude, OpenAI GPT-4o, or Google Gemini), and try the Focus Narrator again. Tip: Google Gemini has a generous free tier and is the easiest provider to set up if you do not already have a paid key.'
      }).catch(() => {});
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) { notifyPanelError('No active tab found.'); return; }
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      notifyPanelError('Cannot audit browser internal pages.'); return;
    }
    /* Guard against running on the AMASAMYA platform itself or the side-panel
       extension page - common mistake when users have the AMASAMYA tab focused
       and the bank/audit-target tab in the background. */
    if (tab.url.startsWith('https://amasamya.akhileshmalani.com') ||
        tab.url.startsWith('http://localhost:3000/amasamya')) {
      chrome.runtime.sendMessage({
        type: 'focus-narrator-ui',
        phase: 'error',
        message: 'You are running the Focus Narrator on the AMASAMYA platform itself. Switch to the tab containing the page you actually want to audit, then run the Focus Narrator again.'
      }).catch(() => {});
      return;
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files:  ['engines/focus-narrator-inject.js']
    });
  } catch (err) {
    notifyPanelError('Focus Narrator failed to start: ' + err.message);
  }
}

/* v3.3.0 - Throttle chrome.tabs.captureVisibleTab() so successive
   calls stay under Chrome's MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND
   quota (effectively 2 calls/sec). Without this, the Focus Narrator
   on dense pages produced runs of "Error: quota exceeded" mixed in
   with successful captures - Mujtaba's IOB report showed three such
   errors. We keep a "last capture timestamp" and ensure 600 ms gap
   between consecutive calls. Retries once on quota error with
   additional backoff. */
let __lastCaptureMs = 0;
async function throttledCaptureVisibleTab() {
  const MIN_GAP_MS = 600;
  const elapsed = Date.now() - __lastCaptureMs;
  if (elapsed < MIN_GAP_MS) await delay(MIN_GAP_MS - elapsed);
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    __lastCaptureMs = Date.now();
    return dataUrl;
  } catch (err) {
    /* Quota errors look like "MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND". */
    if (/CAPTURE.*QUOTA|CALLS_PER_SECOND/i.test(err.message || '')) {
      await delay(1100);
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      __lastCaptureMs = Date.now();
      return dataUrl;
    }
    throw err;
  }
}

async function handleFocusElement(elementInfo, tabId) {
  /* Brief additional delay so the browser renders the focus ring */
  await delay(200);

  let finding;

  try {
    /* 1. Capture what is currently visible in the tab (throttled) */
    const dataUrl = await throttledCaptureVisibleTab();

    /* 2. Get API credentials from extension storage */
    const store = await chrome.storage.local.get([
      'AMASAMYA_vision_provider',
      'AMASAMYA_anthropic_key',
      'AMASAMYA_openai_key'
    ]);

    const provider = store.AMASAMYA_vision_provider || 'anthropic';

    /* v3.4.0 - Gemini support. Provider selection respects the user's
       explicit choice first, then falls back to whichever key happens
       to be configured. */
    if (provider === 'openai' && store.AMASAMYA_openai_key) {
      finding = await callOpenAIVision(dataUrl, elementInfo, store.AMASAMYA_openai_key);
    } else if (provider === 'anthropic' && store.AMASAMYA_anthropic_key) {
      finding = await callAnthropicVision(dataUrl, elementInfo, store.AMASAMYA_anthropic_key);
    } else if (provider === 'gemini' && store.AMASAMYA_gemini_key) {
      finding = await callGeminiVision(dataUrl, elementInfo, store.AMASAMYA_gemini_key);
    } else if (store.AMASAMYA_gemini_key) {
      finding = await callGeminiVision(dataUrl, elementInfo, store.AMASAMYA_gemini_key);
    } else if (store.AMASAMYA_anthropic_key) {
      finding = await callAnthropicVision(dataUrl, elementInfo, store.AMASAMYA_anthropic_key);
    } else if (store.AMASAMYA_openai_key) {
      finding = await callOpenAIVision(dataUrl, elementInfo, store.AMASAMYA_openai_key);
    } else {
      finding = {
        hasIndicator: null,
        description:  'No Vision AI key configured. Add your Google Gemini, Anthropic, or OpenAI key in Settings. Gemini has a free tier and is the easiest provider to set up.',
        error:        true
      };
    }

  } catch (err) {
    finding = { hasIndicator: null, description: 'Error: ' + err.message, error: true };
  }

  /* 3. Forward result to side panel */
  chrome.runtime.sendMessage({
    type:    'focus-narrator-ui',
    phase:   'finding',
    element: elementInfo,
    finding
  }).catch(() => {});

  /* 4. Tell the injected content script to move to the next element */
  if (tabId) {
    chrome.tabs.sendMessage(tabId, { type: 'focus-narrator-next' }).catch(() => {});
  }
}

/* ── Vision LLM: Anthropic Claude ── */
async function callAnthropicVision(imageDataUrl, el, apiKey) {
  const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
  const prompt = buildFocusPrompt(el);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model:      'claude-opus-4-5',
      max_tokens: 600,
      messages: [{
        role:    'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
          { type: 'text',  text: prompt }
        ]
      }]
    })
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return parseLLMJson(data.content[0].text);
}

/* ── Vision LLM: OpenAI GPT-4o ── */
async function callOpenAIVision(imageDataUrl, el, apiKey) {
  const prompt = buildFocusPrompt(el);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({
      model:      'gpt-4o',
      max_tokens: 600,
      messages: [{
        role:    'user',
        content: [
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
          { type: 'text', text: prompt }
        ]
      }]
    })
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return parseLLMJson(data.choices[0].message.content);
}

/* ── Vision LLM: Google Gemini (v3.4.0) ──
   Gemini's generateContent endpoint accepts inline base64 image
   parts. Gemini 1.5 / 2.0 Flash has a free tier with 15 RPM and
   1500 RPD as of mid-2026 - generous enough for the kind of audit
   volume any individual tester will produce. The endpoint hosts
   the model name in the URL path. */
async function callGeminiVision(imageDataUrl, el, apiKey) {
  const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
  const prompt = buildFocusPrompt(el);

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(apiKey);

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/png', data: base64 } },
          { text: prompt }
        ]
      }],
      generationConfig: { maxOutputTokens: 600, temperature: 0.2 }
    })
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parseLLMJson(text);
}

/* ── Prompt builder ── */
function buildFocusPrompt(el) {
  return `You are an accessibility auditor conducting a WCAG 2.2 focus visibility audit.

A screenshot of a web page is provided. A keyboard focus event has just been applied to:
  Element: <${el.tag}> ${el.role !== el.tag ? 'role="' + el.role + '"' : ''} "${el.label}"
  Selector: ${el.selector}
  Bounding box on screen: x=${el.rect.x}, y=${el.rect.y}, width=${el.rect.width}px, height=${el.rect.height}px

Look specifically at the element at those coordinates and the area immediately around it.

Determine:
1. Is there a VISIBLE focus indicator (outline, ring, border change, glow, underline, highlight)?
2. If yes - what type, colour, approximate thickness in pixels?
3. Estimate the contrast ratio of the indicator against its immediate background.
4. Does it appear to meet WCAG 2.4.7 Focus Visible (AA) - any visible indicator?
5. Does it appear to meet WCAG 2.4.11 Focus Appearance (AA) - ≥2px, ≥3:1 contrast?
6. One clear sentence a blind tester can act on.

Respond ONLY with this exact JSON (no markdown fences, no extra text):
{
  "hasIndicator": true,
  "indicatorType": "outline",
  "color": "#005FCC",
  "thicknessPx": 2,
  "contrastRatio": "4.6:1",
  "passes_2_4_7": true,
  "passes_2_4_11": true,
  "verdict": "PASS",
  "description": "Blue 2px outline visible around the button with adequate contrast."
}`;
}

/* ── Parse JSON from LLM response (handles markdown fences) ── */
function parseLLMJson(text) {
  try {
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) return JSON.parse(match[0]);
  } catch (_) {}
  return { hasIndicator: null, description: text.slice(0, 300), raw: true };
}

/* ════════════════════════════════════════════════════════
   C. VISUAL LAYOUT AUDITOR - Module 1
   Uses Chrome DevTools Protocol via chrome.debugger to emulate
   different viewport widths, captures screenshots at each,
   and sends them to Vision LLM for spatial analysis.
════════════════════════════════════════════════════════ */

const BREAKPOINTS = [
  { label: '320px  - Mobile S',  width: 320,  height: 568  },
  { label: '375px  - Mobile M',  width: 375,  height: 812  },
  { label: '768px  - Tablet',    width: 768,  height: 1024 },
  { label: '1280px - Desktop',   width: 1280, height: 900  }
];

async function startVisualLayoutAudit() {
  let tab;
  try {
    /* v3.3.0 - gate on Vision AI key presence before any debugger
       attachment / DOM work. Mirrors the Focus Narrator gate. */
    if (!(await hasVisionAiKeyConfigured())) {
      chrome.runtime.sendMessage({
        type: 'visual-layout-ui',
        phase: 'error',
        message: 'No Vision AI key configured. Open the Settings tab in the AMASAMYA side panel, add an API key from one of the supported providers (Anthropic Claude, OpenAI GPT-4o, or Google Gemini), and try the Visual Layout Auditor again. Tip: Google Gemini has a generous free tier and is the easiest provider to set up if you do not already have a paid key.'
      }).catch(() => {});
      return;
    }

    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) { notifyPanelError('No active tab found.'); return; }
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      notifyPanelError('Cannot audit browser internal pages.'); return;
    }
    /* Same cross-tab guard as Focus Narrator. */
    if (tab.url.startsWith('https://amasamya.akhileshmalani.com') ||
        tab.url.startsWith('http://localhost:3000/amasamya')) {
      chrome.runtime.sendMessage({
        type: 'visual-layout-ui',
        phase: 'error',
        message: 'You are running the Visual Layout Auditor on the AMASAMYA platform itself. Switch to the tab containing the page you actually want to audit, then try again.'
      }).catch(() => {});
      return;
    }

    chrome.runtime.sendMessage({
      type: 'visual-layout-ui', phase: 'started',
      total: BREAKPOINTS.length, url: tab.url, title: tab.title
    }).catch(() => {});

    /* Attach debugger to the tab for DevTools Protocol access */
    await chrome.debugger.attach({ tabId: tab.id }, '1.3');

    const store = await chrome.storage.local.get([
      'AMASAMYA_vision_provider', 'AMASAMYA_anthropic_key', 'AMASAMYA_openai_key', 'AMASAMYA_gemini_key'
    ]);

    for (let i = 0; i < BREAKPOINTS.length; i++) {
      const bp = BREAKPOINTS[i];

      chrome.runtime.sendMessage({
        type: 'visual-layout-ui', phase: 'breakpoint',
        index: i, total: BREAKPOINTS.length, label: bp.label
      }).catch(() => {});

      /* Emulate the viewport dimensions */
      await chrome.debugger.sendCommand({ tabId: tab.id }, 'Emulation.setDeviceMetricsOverride', {
        width:             bp.width,
        height:            bp.height,
        deviceScaleFactor: 1,
        mobile:            bp.width <= 768
      });

      /* Wait for layout reflow */
      await delay(800);

      /* Capture a full-page screenshot (PNG) via DevTools Protocol */
      const result = await chrome.debugger.sendCommand({ tabId: tab.id }, 'Page.captureScreenshot', {
        format:      'png',
        fromSurface: true,
        captureBeyondViewport: true,
        clip: {
          x: 0, y: 0,
          width:  bp.width,
          height: bp.height,
          scale:  1
        }
      });

      const dataUrl = 'data:image/png;base64,' + result.data;

      /* Send to Vision LLM */
      let finding;
      try {
        const provider = store.AMASAMYA_vision_provider || 'gemini';
        if (provider === 'openai' && store.AMASAMYA_openai_key) {
          finding = await callOpenAILayoutVision(dataUrl, bp, store.AMASAMYA_openai_key);
        } else if (provider === 'anthropic' && store.AMASAMYA_anthropic_key) {
          finding = await callAnthropicLayoutVision(dataUrl, bp, store.AMASAMYA_anthropic_key);
        } else if (provider === 'gemini' && store.AMASAMYA_gemini_key) {
          finding = await callGeminiLayoutVision(dataUrl, bp, store.AMASAMYA_gemini_key);
        } else if (store.AMASAMYA_gemini_key) {
          finding = await callGeminiLayoutVision(dataUrl, bp, store.AMASAMYA_gemini_key);
        } else if (store.AMASAMYA_anthropic_key) {
          finding = await callAnthropicLayoutVision(dataUrl, bp, store.AMASAMYA_anthropic_key);
        } else if (store.AMASAMYA_openai_key) {
          finding = await callOpenAILayoutVision(dataUrl, bp, store.AMASAMYA_openai_key);
        } else {
          finding = { issues: [], note: 'No Vision AI key configured.', error: true };
        }
      } catch (err) {
        finding = { issues: [], note: 'LLM error: ' + err.message, error: true };
      }

      chrome.runtime.sendMessage({
        type: 'visual-layout-ui', phase: 'finding',
        index: i, total: BREAKPOINTS.length,
        breakpoint: bp, finding, screenshot: dataUrl
      }).catch(() => {});

      await delay(200);
    }

    /* Restore original viewport */
    await chrome.debugger.sendCommand({ tabId: tab.id }, 'Emulation.clearDeviceMetricsOverride', {});
    await chrome.debugger.detach({ tabId: tab.id });

    chrome.runtime.sendMessage({ type: 'visual-layout-ui', phase: 'done' }).catch(() => {});

  } catch (err) {
    if (tab) {
      try { await chrome.debugger.detach({ tabId: tab.id }); } catch (_) {}
    }
    notifyPanelError('Visual Layout Audit error: ' + err.message);
  }
}

async function callAnthropicLayoutVision(imageDataUrl, bp, apiKey) {
  const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
  const prompt  = buildLayoutPrompt(bp);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
          { type: 'text', text: prompt }
        ]
      }]
    })
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return parseLLMJson(data.content[0].text);
}

async function callOpenAILayoutVision(imageDataUrl, bp, apiKey) {
  const prompt = buildLayoutPrompt(bp);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
          { type: 'text', text: prompt }
        ]
      }]
    })
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return parseLLMJson(data.choices[0].message.content);
}

/* v3.4.0 - Gemini equivalent of the layout-vision call. Same prompt
   structure, same JSON output shape, different transport. */
async function callGeminiLayoutVision(imageDataUrl, bp, apiKey) {
  const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
  const prompt = buildLayoutPrompt(bp);

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(apiKey);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/png', data: base64 } },
          { text: prompt }
        ]
      }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.2 }
    })
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parseLLMJson(text);
}

function buildLayoutPrompt(bp) {
  return `You are an accessibility auditor conducting a visual layout audit at ${bp.label} viewport.

The screenshot shows a web page rendered at exactly ${bp.width}×${bp.height}px.

Identify ALL of the following visual accessibility issues:
1. Overlapping elements (text on top of text, buttons covering checkboxes, etc.)
2. Content cut off or hidden by overflow (text truncated, buttons partially hidden)
3. Horizontal scrollbar present (WCAG 1.4.10 Reflow failure)
4. Touch targets below 44×44px (WCAG 2.5.5) - estimated from visual size
5. Text too small to read comfortably (below 12px equivalent)
6. Insufficient spacing between interactive elements
7. Any layout "breakage" - components that look visually broken or misaligned

Respond ONLY with this exact JSON (no markdown, no extra text):
{
  "breakpoint": "${bp.label}",
  "hasIssues": true,
  "issues": [
    {
      "type": "overlap | overflow | reflow | target-size | text-size | spacing | breakage",
      "severity": "critical | serious | moderate | minor",
      "location": "describe where on screen",
      "description": "one actionable sentence for a blind auditor",
      "wcag": "1.4.10 | 2.5.5 | 1.4.4 | other"
    }
  ],
  "summary": "one sentence overall verdict for this breakpoint"
}`;
}

/* ════════════════════════════════════════════════════════
   D. STATE CHANGE WATCHDOG - Module 3
════════════════════════════════════════════════════════ */

let watchdogTabId  = null;
let watchdogActive = false;

async function startStateWatchdog() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    chrome.runtime.sendMessage({
      type:    'state-watchdog-ui',
      phase:   'error',
      message: 'No active tab found.'
    }).catch(() => {});
    return;
  }

  watchdogTabId  = tab.id;
  watchdogActive = true;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files:  ['engines/state-watchdog-inject.js']
    });
  } catch (err) {
    watchdogActive = false;
    watchdogTabId  = null;
    chrome.runtime.sendMessage({
      type:    'state-watchdog-ui',
      phase:   'error',
      message: err.message
    }).catch(() => {});
  }
}

function stopStateWatchdog() {
  if (watchdogTabId) {
    chrome.tabs.sendMessage(watchdogTabId, { type: 'state-watchdog-stop' })
      .catch(() => {
        /* Tab may have closed - send stopped signal anyway */
        chrome.runtime.sendMessage({ type: 'state-watchdog-ui', phase: 'stopped' }).catch(() => {});
      });
    watchdogTabId  = null;
    watchdogActive = false;
  }
}

/* Clean up watchdog state when a monitored tab navigates away */
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === watchdogTabId && changeInfo.status === 'loading') {
    watchdogActive = false;
    watchdogTabId  = null;
    chrome.runtime.sendMessage({
      type:    'state-watchdog-ui',
      phase:   'stopped',
      reason:  'Page navigated away - watchdog detached.'
    }).catch(() => {});
  }
});

/* ════════════════════════════════════════════════════════
   E. ANNOTATED SCREENSHOT EXPORT
   Captures the visible viewport via CDP, then draws numbered
   bounding-box overlays for every failing finding using
   OffscreenCanvas. Returns a PNG data-URL to the panel.
════════════════════════════════════════════════════════ */

async function captureAnnotatedScreenshot(findings) {
  let tab = null;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab.');

    /* 1 ─ Resolve bounding rects for each finding's element selector */
    const selectors = findings.map(f => f.selector || '');
    const rectsResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sels) => {
        const DPR = window.devicePixelRatio || 1;
        return sels.map((sel, i) => {
          if (!sel) return null;
          try {
            const el = document.querySelector(sel);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { index: i, x: r.left * DPR, y: r.top * DPR, w: r.width * DPR, h: r.height * DPR };
          } catch (_) { return null; }
        });
      },
      args: [selectors]
    });
    const rects = (rectsResult[0]?.result || []).filter(Boolean);

    /* 2 ─ Capture viewport screenshot */
    await chrome.debugger.attach({ tabId: tab.id }, '1.3');
    const shot = await chrome.debugger.sendCommand(
      { tabId: tab.id }, 'Page.captureScreenshot',
      { format: 'png', quality: 90, fromSurface: true }
    );
    await chrome.debugger.detach({ tabId: tab.id });

    const imgDataUrl = `data:image/png;base64,${shot.data}`;

    /* 3 ─ Draw annotations on OffscreenCanvas */
    const img = await createImageBitmap(await (await fetch(imgDataUrl)).blob());
    const canvas = new OffscreenCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    /* Verdict → colour map */
    const COLOURS = { Fail: '#e74c3c', Warning: '#f39c12', Pass: '#2ecc71', Info: '#3498db' };

    rects.forEach(({ index, x, y, w, h }) => {
      const f = findings[index];
      const colour = COLOURS[f.verdict] || '#e74c3c';
      const alpha = colour + '55'; // ~33% opacity fill

      /* Box */
      ctx.strokeStyle = colour;
      ctx.lineWidth = 3;
      ctx.fillStyle = alpha;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);

      /* Number badge */
      const badgeR = 14;
      const bx = x + badgeR + 2, by = y - badgeR - 2 < 0 ? y + badgeR + 2 : y - badgeR - 2;
      ctx.beginPath();
      ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${badgeR}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(index + 1), bx, by);
    });

    /* 4 ─ Convert to PNG blob and send back */
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
      chrome.runtime.sendMessage({
        type: 'annotated-screenshot-ready',
        dataUrl: reader.result,
        count: rects.length
      }).catch(() => {});
    };

  } catch (err) {
    if (tab) { try { await chrome.debugger.detach({ tabId: tab.id }); } catch (_) {} }
    chrome.runtime.sendMessage({
      type: 'annotated-screenshot-error',
      message: err.message || String(err)
    }).catch(() => {});
  }
}

/* ════════════════════════════════════════════════════════
   WCAG PLATFORM BRIDGE (unchanged)
════════════════════════════════════════════════════════ */

async function sendResultsToPlatform(message) {
  /* v3.4.1 - platform-bridge behaviour change.
     Previously: every audit auto-created a new tab at PLATFORM_URL,
     pulling the user's focus away from the audit target tab and the
     Chrome side panel where findings actually live. Multiple testers
     (Mujtaba, Akhilesh) reported this as confusing - they ran an
     audit, expected to see findings, and instead got dropped on a
     marketing landing page.

     New behaviour: this function ONLY forwards results to an existing
     platform tab if the user already has one open. If no platform tab
     is open, it does nothing silently. The audit findings are
     ALWAYS available in the side panel; the platform tab is now
     opt-in (the user opens it themselves if they want the richer
     report viewer). */
  const payload = {
    type:      'AMASAMYA_platform_results',
    findings:  message.findings  || [],
    pageTitle: message.title     || message.pageTitle || 'Untitled Page',
    pageUrl:   message.url       || message.pageUrl   || '',
    timestamp: message.timestamp || new Date().toISOString()
  };

  try {
    const existingTabs = await chrome.tabs.query({ url: PLATFORM_URL + '/*' });
    if (existingTabs.length === 0) {
      /* No platform tab open - do nothing. Findings stay in the side
         panel; the user can open the platform manually if they want
         the richer viewer. */
      return;
    }
    /* Platform tab exists - forward results to it WITHOUT stealing
       focus. Previously we focused the platform tab on every audit;
       now we just send the payload silently. The user can switch to
       the platform tab themselves if they want to see the rich
       report. */
    const platformTab = existingTabs[0];
    await chrome.tabs.sendMessage(platformTab.id, payload);
  } catch (err) {
    console.warn('AMASAMYA platform bridge:', err.message);
  }
}

/* ── Utilities ── */

function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 12000);
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function notifyPanelError(msg) {
  chrome.runtime.sendMessage({ type: 'focus-narrator-ui', phase: 'error', message: msg }).catch(() => {});
}
