/**
 * ai-explain.js — AMASAMYA AI Explainer
 *
 * Takes a raw accessibility issue (rule ID, WCAG criterion, and an
 * optional HTML snippet) and returns a plain-language explanation
 * plus a suggested fix.
 *
 * Routing order (cheapest first — most calls should never touch AI):
 *   1. Rule-based canned answers  (zero cost, instant)
 *   2. In-memory warm cache       (zero cost, lasts per Lambda instance)
 *   3. Gemini 1.5 Flash           (free tier, generous daily quota)
 *   4. Groq (Llama 3.1 8B)        (free tier, fallback if Gemini fails)
 *
 * Endpoint:   POST /.netlify/functions/ai-explain
 * Body:       { ruleId, wcag, nodeHtml, message }
 * Response:   { source, explanation, fix }
 *
 * Env vars (set in Netlify UI — Site settings → Environment variables):
 *   GEMINI_API_KEY   (required for Gemini — get it free at https://aistudio.google.com/)
 *   GROQ_API_KEY     (optional fallback — https://console.groq.com/)
 *
 * Notes:
 *   - Warm cache lives for the lifetime of the Lambda instance
 *     (~minutes to hours). Netlify reuses instances, so repeat
 *     queries within that window are free.
 *   - Every AI call's result is cached by the hash of its inputs,
 *     so two users asking about the same "image-alt on <img src=x>"
 *     only cost 1 call.
 *   - Prompts are capped to keep latency low and free quota healthy.
 */

'use strict';

const crypto = require('crypto');

/* ============================================================
   1. RULE-BASED CANNED ANSWERS
   The 20 most-common axe-core / HTMLCS rule IDs. Add more as
   real-world usage reveals the long tail.
============================================================ */
const RULE_LIBRARY = {
  'image-alt': {
    explanation: 'Images without alternative text are invisible to screen-reader users. An empty or missing alt attribute means the image has no accessible name, so assistive tech has nothing to announce.',
    fix: 'Add an alt attribute that describes the image\'s purpose. If the image is purely decorative, use alt="" so screen readers skip it. Never use the filename.'
  },
  'color-contrast': {
    explanation: 'Text that does not have at least 4.5:1 contrast against its background (3:1 for large text) is unreadable for many low-vision users and in bright sunlight.',
    fix: 'Darken the text or lighten the background until a contrast checker shows at least 4.5:1. WebAIM\'s contrast checker is a quick sanity check.'
  },
  'label': {
    explanation: 'Form inputs without a visible or programmatic label force screen-reader users to guess what to type. The field is announced as "edit" with no hint of what it means.',
    fix: 'Associate a <label for="id"> with the input, or wrap the input inside the <label>. An aria-label is an acceptable fallback but a visible label is better.'
  },
  'heading-order': {
    explanation: 'Skipping heading levels (e.g. <h1> then <h3>) breaks the document outline. Screen-reader users navigate by headings and expect a logical hierarchy.',
    fix: 'Use heading levels in order — h1, h2, h3 — without jumping. Use CSS for visual size, not a different heading level.'
  },
  'link-name': {
    explanation: 'Links without accessible text (empty links or links containing only an icon) are announced as "link" or "link, image" with no destination.',
    fix: 'Add visible link text, or an aria-label, or an sr-only span inside the link describing where it goes.'
  },
  'button-name': {
    explanation: 'Buttons without accessible text are announced as just "button" — users have no idea what pressing it will do.',
    fix: 'Put text inside the button, or add aria-label, or include an sr-only span. Icon-only buttons must still announce their action.'
  },
  'html-has-lang': {
    explanation: 'Without a lang attribute on <html>, screen readers may read content in the wrong language — an English page read with Spanish pronunciation is painful.',
    fix: 'Add lang="en" (or the relevant BCP-47 language code) to the <html> element.'
  },
  'document-title': {
    explanation: 'Pages without a <title> leave users with no way to identify the tab or bookmark. Screen readers announce the title when the page loads.',
    fix: 'Add a meaningful <title> inside <head>. Describe what the page is about, not just the site name.'
  },
  'landmark-one-main': {
    explanation: 'A page without a <main> landmark forces screen-reader users to scan the whole page to find primary content. Landmarks enable jump navigation.',
    fix: 'Wrap your primary page content in a <main> element. There should be exactly one per page.'
  },
  'region': {
    explanation: 'Content sitting outside landmarks (header, main, nav, aside, footer) is harder for screen-reader users to reach with landmark navigation.',
    fix: 'Move the content inside an appropriate semantic region, or add role="region" with an aria-label on a wrapper.'
  },
  'duplicate-id': {
    explanation: 'Two elements sharing the same id break label-for associations and aria-describedby references. Screen readers may announce the wrong element.',
    fix: 'Make every id on the page unique. If you need a shared hook, use a class instead.'
  },
  'aria-required-attr': {
    explanation: 'Certain ARIA roles require specific attributes — e.g. role="checkbox" must have aria-checked. Without them, assistive tech can\'t communicate state.',
    fix: 'Either add the required ARIA attributes or switch to a native HTML element (which already provides the semantics for free).'
  },
  'aria-valid-attr-value': {
    explanation: 'ARIA attributes with invalid values are silently ignored by screen readers, so the semantics you intended never reach the user.',
    fix: 'Check the ARIA spec for the allowed values of the attribute. Remove the attribute if you can\'t set a valid value.'
  },
  'bypass': {
    explanation: 'Pages without a skip link or heading structure force keyboard users to tab through every menu item on every page.',
    fix: 'Add a "Skip to main content" link as the first focusable element on the page, pointing at #main-content.'
  },
  'list': {
    explanation: 'Items styled as a list but not in <ul>/<ol>/<dl> are not announced as a list by screen readers, so users lose the count and structure.',
    fix: 'Wrap the items in <ul> or <ol>, with each item in an <li>. If you need custom styling, use CSS — don\'t remove the semantics.'
  },
  'frame-title': {
    explanation: 'An <iframe> without a title is announced as just "frame" — users can\'t tell what\'s inside without entering it.',
    fix: 'Add a title attribute to every <iframe> that describes its content or purpose.'
  },
  'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37': { /* HTMLCS alias for image-alt */
    explanation: 'Images without alternative text are invisible to screen-reader users. An empty or missing alt attribute means the image has no accessible name.',
    fix: 'Add an alt attribute that describes the image\'s purpose. Decorative images should use alt="".'
  },
  'WCAG2AA.Principle1.Guideline1_3.1_3_1.F68': { /* HTMLCS alias for label */
    explanation: 'Form inputs without a label force screen-reader users to guess what to type.',
    fix: 'Add a <label for="id"> associated with the input.'
  }
};

/* ============================================================
   2. WARM CACHE
   Lives inside the Lambda instance's memory. Netlify reuses
   instances, so this is effectively a free best-effort cache.
============================================================ */
const WARM_CACHE = new Map();
const WARM_CACHE_MAX = 500;
const WARM_CACHE_TTL_MS = 24 * 60 * 60 * 1000; /* 24 hours */

function cacheKey(input) {
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify(input));
  return h.digest('hex');
}
function cacheGet(key) {
  const entry = WARM_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.t > WARM_CACHE_TTL_MS) {
    WARM_CACHE.delete(key);
    return null;
  }
  return entry.v;
}
function cacheSet(key, value) {
  if (WARM_CACHE.size >= WARM_CACHE_MAX) {
    /* Evict oldest entry (first key — Map preserves insertion order). */
    const firstKey = WARM_CACHE.keys().next().value;
    if (firstKey) WARM_CACHE.delete(firstKey);
  }
  WARM_CACHE.set(key, { t: Date.now(), v: value });
}

/* ============================================================
   3. PROVIDERS
============================================================ */
const PROMPT_SYSTEM = [
  'You explain web accessibility (WCAG 2.2) issues to developers.',
  'Reply in strict JSON with exactly two string fields: "explanation" and "fix".',
  '"explanation" must be 1-2 plain-English sentences, under 60 words, no jargon.',
  '"fix" must be a concrete code-level action under 40 words. No markdown, no code fences.'
].join(' ');

function buildUserPrompt(input) {
  const parts = [];
  if (input.ruleId)  parts.push('Rule ID: ' + input.ruleId);
  if (input.wcag)    parts.push('WCAG criterion: ' + input.wcag);
  if (input.message) parts.push('Engine message: ' + String(input.message).slice(0, 400));
  if (input.nodeHtml) parts.push('Offending HTML snippet: ' + String(input.nodeHtml).slice(0, 600));
  return parts.join('\n');
}

async function callGemini(input) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + encodeURIComponent(key);
  const body = {
    contents: [{ parts: [{ text: buildUserPrompt(input) }] }],
    systemInstruction: { parts: [{ text: PROMPT_SYSTEM }] },
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 220,
      responseMimeType: 'application/json'
    }
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('Gemini HTTP ' + res.status);
  const data = await res.json();
  const text = data && data.candidates && data.candidates[0] &&
               data.candidates[0].content && data.candidates[0].content.parts &&
               data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  if (!text) throw new Error('Gemini returned empty body');
  return parseModelJson(text);
}

async function callGroq(input) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + key
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      temperature: 0.3,
      max_tokens: 220,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PROMPT_SYSTEM },
        { role: 'user',   content: buildUserPrompt(input) }
      ]
    })
  });
  if (!res.ok) throw new Error('Groq HTTP ' + res.status);
  const data = await res.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error('Groq returned empty body');
  return parseModelJson(text);
}

function parseModelJson(text) {
  /* Strip code fences if a model added them despite instructions. */
  let cleaned = String(text).trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let obj;
  try { obj = JSON.parse(cleaned); }
  catch (e) { throw new Error('Model returned non-JSON: ' + cleaned.slice(0, 120)); }
  if (!obj || typeof obj.explanation !== 'string' || typeof obj.fix !== 'string') {
    throw new Error('Model JSON missing required fields');
  }
  return { explanation: obj.explanation.trim(), fix: obj.fix.trim() };
}

/* ============================================================
   4. HANDLER
============================================================ */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8'
  };
}
function json(statusCode, payload) {
  return { statusCode: statusCode, headers: corsHeaders(), body: JSON.stringify(payload) };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST')    return json(405, { error: 'Use POST' });

  /* Parse + validate input. */
  let input;
  try { input = JSON.parse(event.body || '{}'); }
  catch (e) { return json(400, { error: 'Invalid JSON body' }); }
  if (!input.ruleId && !input.message) {
    return json(400, { error: 'Provide at least ruleId or message' });
  }

  /* 1. Rule-based library. */
  if (input.ruleId && RULE_LIBRARY[input.ruleId]) {
    const canned = RULE_LIBRARY[input.ruleId];
    return json(200, { source: 'rule', explanation: canned.explanation, fix: canned.fix });
  }

  /* 2. Warm cache. */
  const key = cacheKey({ r: input.ruleId, w: input.wcag, m: input.message, n: input.nodeHtml });
  const hit = cacheGet(key);
  if (hit) return json(200, { source: 'cache', explanation: hit.explanation, fix: hit.fix });

  /* 3. Gemini Flash (primary). */
  try {
    const out = await callGemini(input);
    if (out) {
      cacheSet(key, out);
      return json(200, { source: 'gemini', explanation: out.explanation, fix: out.fix });
    }
  } catch (err) {
    console.warn('[ai-explain] Gemini failed:', err.message);
  }

  /* 4. Groq (fallback). */
  try {
    const out = await callGroq(input);
    if (out) {
      cacheSet(key, out);
      return json(200, { source: 'groq', explanation: out.explanation, fix: out.fix });
    }
  } catch (err) {
    console.warn('[ai-explain] Groq failed:', err.message);
  }

  /* Last-resort generic message — better than a 500. */
  return json(200, {
    source: 'fallback',
    explanation: 'This is an accessibility issue reported by the scanner. Review the rule and the offending element against WCAG 2.2 guidance.',
    fix: 'Consult the rule\'s documentation for the specific remediation. Common fixes involve adding missing attributes (alt, label, aria-*) or fixing semantic structure.'
  });
};
