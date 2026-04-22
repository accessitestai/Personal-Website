/**
 * AMASAMYA Extension — Background Service Worker v3.0
 *
 * Orchestrates:
 *   A. WCAG Audit  — injects content-script.js, relays findings to side panel + platform
 *   B. Focus Narrator (Module 2) — screenshots + Vision LLM per focused element
 *   C. Visual Layout Auditor (Module 1) — debugger-based multi-breakpoint screenshots + Vision LLM
 *   D. State Change Watchdog (Module 3) — MutationObserver + live region / focus management checks
 */

'use strict';

const PLATFORM_URL = 'https://amasamya.akhileshmalani.com';

/* ════════════════════════════════════════════════════════
   A. WCAG AUDIT — existing behaviour (unchanged)
════════════════════════════════════════════════════════ */

chrome.action.onClicked.addListener(async (tab) => {
  try { await chrome.sidePanel.open({ windowId: tab.windowId }); } catch (_) {}
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-script.js'] });
  } catch (err) {
    console.error('AMASAMYA injection error:', err);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  /* ── WCAG audit results → side panel + platform ── */
  if (message.type === 'audit-results' || message.type === 'audit-error') {
    chrome.runtime.sendMessage(message).catch(() => {
      chrome.storage.session.set({ lastAudit: message }).catch(() => {});
    });
    if (message.type === 'audit-results') sendResultsToPlatform(message);
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
    /* Run async — cannot return a promise directly from onMessage */
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
   B. FOCUS NARRATOR — Module 2
════════════════════════════════════════════════════════ */

async function startFocusNarrator() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) { notifyPanelError('No active tab found.'); return; }
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      notifyPanelError('Cannot audit browser internal pages.'); return;
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files:  ['engines/focus-narrator-inject.js']
    });
  } catch (err) {
    notifyPanelError('Focus Narrator failed to start: ' + err.message);
  }
}

async function handleFocusElement(elementInfo, tabId) {
  /* Brief additional delay so the browser renders the focus ring */
  await delay(200);

  let finding;

  try {
    /* 1. Capture what is currently visible in the tab */
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

    /* 2. Get API credentials from extension storage */
    const store = await chrome.storage.local.get([
      'AMASAMYA_vision_provider',
      'AMASAMYA_anthropic_key',
      'AMASAMYA_openai_key'
    ]);

    const provider = store.AMASAMYA_vision_provider || 'anthropic';

    if (provider === 'openai' && store.AMASAMYA_openai_key) {
      finding = await callOpenAIVision(dataUrl, elementInfo, store.AMASAMYA_openai_key);
    } else if (store.AMASAMYA_anthropic_key) {
      finding = await callAnthropicVision(dataUrl, elementInfo, store.AMASAMYA_anthropic_key);
    } else {
      finding = {
        hasIndicator: null,
        description:  'No Vision AI key configured. Add your Anthropic or OpenAI key in Settings.',
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
2. If yes — what type, colour, approximate thickness in pixels?
3. Estimate the contrast ratio of the indicator against its immediate background.
4. Does it appear to meet WCAG 2.4.7 Focus Visible (AA) — any visible indicator?
5. Does it appear to meet WCAG 2.4.11 Focus Appearance (AA) — ≥2px, ≥3:1 contrast?
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
   C. VISUAL LAYOUT AUDITOR — Module 1
   Uses Chrome DevTools Protocol via chrome.debugger to emulate
   different viewport widths, captures screenshots at each,
   and sends them to Vision LLM for spatial analysis.
════════════════════════════════════════════════════════ */

const BREAKPOINTS = [
  { label: '320px  — Mobile S',  width: 320,  height: 568  },
  { label: '375px  — Mobile M',  width: 375,  height: 812  },
  { label: '768px  — Tablet',    width: 768,  height: 1024 },
  { label: '1280px — Desktop',   width: 1280, height: 900  }
];

async function startVisualLayoutAudit() {
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) { notifyPanelError('No active tab found.'); return; }
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      notifyPanelError('Cannot audit browser internal pages.'); return;
    }

    chrome.runtime.sendMessage({
      type: 'visual-layout-ui', phase: 'started',
      total: BREAKPOINTS.length, url: tab.url, title: tab.title
    }).catch(() => {});

    /* Attach debugger to the tab for DevTools Protocol access */
    await chrome.debugger.attach({ tabId: tab.id }, '1.3');

    const store = await chrome.storage.local.get([
      'AMASAMYA_vision_provider', 'AMASAMYA_anthropic_key', 'AMASAMYA_openai_key'
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
        const provider = store.AMASAMYA_vision_provider || 'anthropic';
        if (provider === 'openai' && store.AMASAMYA_openai_key) {
          finding = await callOpenAILayoutVision(dataUrl, bp, store.AMASAMYA_openai_key);
        } else if (store.AMASAMYA_anthropic_key) {
          finding = await callAnthropicLayoutVision(dataUrl, bp, store.AMASAMYA_anthropic_key);
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

function buildLayoutPrompt(bp) {
  return `You are an accessibility auditor conducting a visual layout audit at ${bp.label} viewport.

The screenshot shows a web page rendered at exactly ${bp.width}×${bp.height}px.

Identify ALL of the following visual accessibility issues:
1. Overlapping elements (text on top of text, buttons covering checkboxes, etc.)
2. Content cut off or hidden by overflow (text truncated, buttons partially hidden)
3. Horizontal scrollbar present (WCAG 1.4.10 Reflow failure)
4. Touch targets below 44×44px (WCAG 2.5.5) — estimated from visual size
5. Text too small to read comfortably (below 12px equivalent)
6. Insufficient spacing between interactive elements
7. Any layout "breakage" — components that look visually broken or misaligned

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
   D. STATE CHANGE WATCHDOG — Module 3
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
        /* Tab may have closed — send stopped signal anyway */
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
      reason:  'Page navigated away — watchdog detached.'
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
  const payload = {
    type:      'AMASAMYA_platform_results',
    findings:  message.findings  || [],
    pageTitle: message.title     || message.pageTitle || 'Untitled Page',
    pageUrl:   message.url       || message.pageUrl   || '',
    timestamp: message.timestamp || new Date().toISOString()
  };

  try {
    const existingTabs = await chrome.tabs.query({ url: PLATFORM_URL + '/*' });
    if (existingTabs.length > 0) {
      const platformTab = existingTabs[0];
      await chrome.tabs.update(platformTab.id, { active: true });
      try { await chrome.windows.update(platformTab.windowId, { focused: true }); } catch (_) {}
      await delay(150);
      await chrome.tabs.sendMessage(platformTab.id, payload);
    } else {
      const newTab = await chrome.tabs.create({ url: PLATFORM_URL, active: true });
      await waitForTabLoad(newTab.id);
      await delay(500);
      await chrome.tabs.sendMessage(newTab.id, payload);
    }
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
