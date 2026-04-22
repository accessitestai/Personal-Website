/**
 * subscribe.js — AMASAMYA email-capture
 *
 * Accepts an email address from the public checker's email form
 * and either forwards it to ConvertKit / Buttondown (if API env
 * vars are set) or just logs it to the Netlify function log so
 * you can harvest early signups manually until you pick a vendor.
 *
 * Endpoint:  POST /.netlify/functions/subscribe
 * Body:      { email, source }
 * Response:  { ok: true, provider }
 *
 * Env vars (all optional — first match wins):
 *   CONVERTKIT_API_KEY + CONVERTKIT_FORM_ID
 *     → subscribes to a ConvertKit form
 *       https://app.convertkit.com/account_settings/advanced_settings  (API key)
 *       Form ID is in the URL when you edit the form.
 *
 *   BUTTONDOWN_API_KEY
 *     → subscribes to Buttondown. Get it at https://buttondown.com/settings/programming
 *
 * If no env vars are set, the email is logged and a friendly "ok"
 * is returned — so the form is never broken in front of a user,
 * and you can retrieve the emails from Netlify's Function logs
 * until you decide on a vendor.
 */

'use strict';

/* Basic email sanity check — RFC-complete validation isn't worth
   it for a signup form. This catches the obvious typos. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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

/* ─── ConvertKit ─── */
async function sendToConvertKit(email, source) {
  const apiKey = process.env.CONVERTKIT_API_KEY;
  const formId = process.env.CONVERTKIT_FORM_ID;
  if (!apiKey || !formId) return null;
  const res = await fetch('https://api.convertkit.com/v3/forms/' + encodeURIComponent(formId) + '/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      email: email,
      tags: source ? [source] : undefined
    })
  });
  if (!res.ok) throw new Error('ConvertKit HTTP ' + res.status);
  return 'convertkit';
}

/* ─── Buttondown ─── */
async function sendToButtondown(email, source) {
  const apiKey = process.env.BUTTONDOWN_API_KEY;
  if (!apiKey) return null;
  const res = await fetch('https://api.buttondown.com/v1/subscribers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Token ' + apiKey
    },
    body: JSON.stringify({
      email_address: email,
      tags: source ? [source] : undefined
    })
  });
  /* Buttondown returns 201 on new, 400 if already subscribed — treat both as success. */
  if (!res.ok && res.status !== 400) throw new Error('Buttondown HTTP ' + res.status);
  return 'buttondown';
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(), body: '' };
  if (event.httpMethod !== 'POST')    return json(405, { error: 'Use POST' });

  let input;
  try { input = JSON.parse(event.body || '{}'); }
  catch (e) { return json(400, { error: 'Invalid JSON body' }); }

  const email = String(input.email || '').trim().toLowerCase();
  const source = String(input.source || 'checker').slice(0, 40);

  if (!email || !EMAIL_RE.test(email) || email.length > 200) {
    return json(400, { error: 'Please provide a valid email address.' });
  }

  /* Try each configured provider in order; return the first success. */
  for (const provider of [sendToConvertKit, sendToButtondown]) {
    try {
      const tag = await provider(email, source);
      if (tag) return json(200, { ok: true, provider: tag });
    } catch (err) {
      console.warn('[subscribe] provider failed:', err.message);
    }
  }

  /* Fallback: log and succeed. Emails visible in Netlify Function log. */
  console.log('[subscribe] No provider configured — captured email:', email, 'source:', source);
  return json(200, { ok: true, provider: 'log' });
};
