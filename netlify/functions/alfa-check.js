/**
 * alfa-check.js — Siteimprove Alfa accessibility engine (server-side).
 *
 * Alfa is ESM-only and depends on a real DOM, so it doesn't fit in the
 * browser bundle the way axe-core, HTML_CodeSniffer and IBM Equal Access
 * do. This Netlify Function wraps it up:
 *
 *   POST /.netlify/functions/alfa-check
 *   body: { html: "<!doctype html>..." }   ← full page source
 *   200:  { violations: [...], passes: [...] }
 *
 * The output is normalised into the same shape the rest of the checker
 * UI already understands (axe-style issue objects with id / engine /
 * impact / help / description / tags / helpUrl / nodes[]), so no
 * front-end plumbing has to know this engine is special.
 *
 * On any failure (Alfa not installed, parse error, rule crash) we
 * return { violations: [], passes: [] } with a 200 so the rest of the
 * scan still completes. The failure reason goes to the Netlify log.
 *
 * Dependencies (added in package.json):
 *   - @siteimprove/alfa-act       (audit runner)
 *   - @siteimprove/alfa-rules     (WCAG rule bundle)
 *   - @siteimprove/alfa-dom       (Alfa's DOM model)
 *   - jsdom                       (HTML -> native DOM)
 */

'use strict';

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

/* Alfa exposes an Outcome "Passed" / "Failed" / "CantTell" / "Inapplicable".
   We surface only Failed (real violations) and CantTell (needs-review), and
   map severities to the four-step scale the rest of the UI uses. */
function outcomeImpact(outcomeName) {
  if (outcomeName === 'Failed') return 'serious';
  if (outcomeName === 'CantTell') return 'minor';
  return 'minor';
}

/* Alfa rules carry WCAG tags in a structured way. Extract them as the
   "wcagNNN" strings the checker already uses for grouping. */
function extractWcagTags(rule) {
  var tags = [];
  try {
    var requirements = rule.requirements ? Array.from(rule.requirements) : [];
    requirements.forEach(function (req) {
      if (!req || !req.uri) return;
      /* Alfa WCAG URIs look like https://www.w3.org/TR/WCAG/#non-text-content
         — convert the last segment to a tag if it maps to a known SC number. */
      var m = String(req.uri).match(/#([\w-]+)/);
      if (m) tags.push(m[1]);
    });
  } catch (e) { /* non-fatal */ }
  return tags.length ? tags : ['wcag2aa'];
}

function snippetFromTarget(target) {
  try {
    if (!target) return '';
    if (typeof target.toString === 'function') {
      var s = target.toString();
      if (s && s !== '[object Object]') return s.substring(0, 400);
    }
    if (target.node && target.node.toString) {
      return target.node.toString().substring(0, 400);
    }
  } catch (e) { /* non-fatal */ }
  return '';
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST')    return json(405, { error: 'Use POST' });

  var input;
  try { input = JSON.parse(event.body || '{}'); }
  catch (e) { return json(400, { error: 'Invalid JSON body' }); }

  var html = String(input.html || '').trim();
  if (!html || html.length < 20) {
    return json(400, { error: 'Provide an "html" string of the page source.' });
  }
  /* Cap payload to keep the function fast and avoid abusive inputs. */
  if (html.length > 600000) html = html.substring(0, 600000);

  try {
    /* Dynamic imports because all Alfa packages are ESM-only. */
    var actMod   = await import('@siteimprove/alfa-act');
    var rulesMod = await import('@siteimprove/alfa-rules');
    var nativeMod = await import('@siteimprove/alfa-dom/native');
    var jsdomMod = await import('jsdom');

    var JSDOM = jsdomMod.JSDOM;
    var Audit = actMod.Audit;
    var defaultRules = rulesMod.default || rulesMod.Rules || rulesMod;
    var Native = nativeMod.Native || nativeMod.default;

    if (!JSDOM || !Audit || !defaultRules || !Native) {
      throw new Error('Alfa entry points not found — check dep versions.');
    }

    /* Parse the HTML into a native DOM, then convert to Alfa's DOM. */
    var dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
    var alfaDoc = Native.fromNode(dom.window.document);

    /* Some Native.fromNode implementations return an Iterable<Node> — take the first. */
    if (alfaDoc && typeof alfaDoc[Symbol.iterator] === 'function' && !alfaDoc.type) {
      alfaDoc = alfaDoc[Symbol.iterator]().next().value;
    }
    /* Or a Thenable — await it. */
    if (alfaDoc && typeof alfaDoc.then === 'function') {
      alfaDoc = await alfaDoc;
    }

    /* Run the audit with the full WCAG rule bundle. */
    var rules = Array.isArray(defaultRules) ? defaultRules
              : (defaultRules && defaultRules.default) ? defaultRules.default
              : Object.values(defaultRules || {});

    var audit = Audit.of(alfaDoc, rules);
    var outcomes = await audit.evaluate();

    var violations = [];
    var passCount = 0;

    /* Alfa outcomes is typically an Iterable — convert to array and walk. */
    var list = [];
    if (outcomes && typeof outcomes[Symbol.iterator] === 'function') {
      list = Array.from(outcomes);
    } else if (outcomes && outcomes.values) {
      list = Array.from(outcomes.values());
    }

    list.forEach(function (outcome) {
      try {
        var name = outcome && outcome.constructor && outcome.constructor.name
                 ? outcome.constructor.name
                 : (outcome.type || '');
        if (name === 'Passed') { passCount++; return; }
        if (name === 'Inapplicable') return;

        var rule = outcome.rule || {};
        var ruleId = (rule.uri || '').split('/').pop() || rule.name || 'alfa-rule';
        var help = '';
        if (outcome.message) {
          help = String(outcome.message);
        } else if (rule.name) {
          help = 'Alfa rule: ' + rule.name;
        } else {
          help = 'Accessibility rule failure detected by Alfa.';
        }

        var snippet = '';
        if (outcome.target) snippet = snippetFromTarget(outcome.target);

        violations.push({
          id: ruleId,
          engine: 'alfa',
          impact: outcomeImpact(name),
          help: help,
          description: help,
          tags: extractWcagTags(rule),
          helpUrl: rule.uri || '',
          nodes: snippet ? [{ html: snippet, failureSummary: help }] : []
        });
      } catch (perOutcomeErr) {
        console.warn('[alfa-check] skipped outcome:', perOutcomeErr.message);
      }
    });

    return json(200, {
      violations: violations,
      passes: new Array(passCount).fill({ id: 'alfa-pass', description: 'Alfa check passed' })
    });
  } catch (err) {
    console.warn('[alfa-check] engine failed:', err && err.message ? err.message : err);
    /* Soft-fail: return empty results so the rest of the scan still completes. */
    return json(200, { violations: [], passes: [], warning: 'Alfa engine unavailable: ' + (err && err.message ? err.message : 'unknown error') });
  }
};
