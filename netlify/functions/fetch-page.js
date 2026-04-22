/**
 * fetch-page.js — AMASAMYA URL Proxy
 *
 * Fetches a remote URL on behalf of the browser-side checker,
 * bypassing CORS restrictions that would otherwise block the request.
 *
 * Endpoint: GET /.netlify/functions/fetch-page?url=https%3A%2F%2F...
 *
 * Security:
 *  - Only fetches HTTP/HTTPS URLs (no file://, ftp://, etc.)
 *  - 10 second timeout
 *  - Returns 400 if URL is missing or non-HTTP
 *  - Returns 502 if the upstream request fails
 *
 * Environment: Netlify Functions (Node.js 18+)
 */

const ALLOWED_SCHEMES = ['http:', 'https:'];
const TIMEOUT_MS = 10000;

exports.handler = async function (event) {
  /* ── CORS preflight ── */
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: '',
    };
  }

  /* ── Only accept GET ── */
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed. Use GET.' });
  }

  /* ── Validate the URL parameter ── */
  const rawUrl = (event.queryStringParameters || {}).url;
  if (!rawUrl) {
    return json(400, { error: 'Missing required query parameter: url' });
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return json(400, { error: 'Invalid URL: ' + rawUrl });
  }

  if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
    return json(400, { error: 'Only http:// and https:// URLs are supported.' });
  }

  /* ── Block private/internal IPs (SSRF protection) ── */
  const hostname = parsed.hostname;
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('172.16.') ||
    hostname.endsWith('.local')
  ) {
    return json(403, { error: 'Internal/private addresses are not supported.' });
  }

  /* ── Fetch with timeout ── */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(rawUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AMASAMYA-Checker/3.1.0 (Accessibility Auditor; +https://amasamya.akhileshmalani.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en',
      },
      redirect: 'follow',
    });

    const contentType = upstream.headers.get('content-type') || 'text/html';
    const body = await upstream.text();

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders(),
        'Content-Type': contentType.includes('text/') ? 'text/html; charset=utf-8' : contentType,
        'X-Upstream-Status': String(upstream.status),
        'X-Fetched-URL': upstream.url,
        'Cache-Control': 'no-store',
      },
      body,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return json(504, { error: 'Request timed out after ' + (TIMEOUT_MS / 1000) + 's. The page may be too slow or unreachable.' });
    }
    return json(502, { error: 'Failed to fetch page: ' + err.message });
  } finally {
    clearTimeout(timer);
  }
};

/* ── Helpers ── */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
