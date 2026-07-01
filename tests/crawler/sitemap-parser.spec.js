/**
 * Sitemap parser unit tests.
 *
 * Tests fixture XML strings via dependency-injected fetcher so we
 * never hit the network. Covers flat sitemaps, sitemap-index
 * recursion, mixed valid/invalid entries, lastmod and priority
 * extraction, the 200-page cap, and dedup.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');

const sp = require(
  path.resolve(__dirname, '..', '..', 'amasamya-extension', 'engines', 'sitemap-parser.js')
);

/* Build a fake fetch keyed by URL. Each entry is either a string
   (interpreted as XML body, ok=true) or { status, body }. */
function makeFakeFetch(mapping) {
  return function fakeFetch(url) {
    const v = mapping[url];
    if (v === undefined) return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
    if (typeof v === 'string') return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(v) });
    return Promise.resolve({ ok: v.status === 200, status: v.status, text: () => Promise.resolve(v.body || '') });
  };
}

const FLAT_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2026-05-01</lastmod>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://example.com/about</loc>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://example.com/contact</loc>
  </url>
</urlset>`;

const SITEMAP_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-posts.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
</sitemapindex>`;

const POSTS_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/post-1</loc><priority>0.6</priority></url>
  <url><loc>https://example.com/post-2</loc><priority>0.5</priority></url>
</urlset>`;

const PAGES_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page-1</loc><priority>0.9</priority></url>
</urlset>`;

const CDATA_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc><![CDATA[https://example.com/cdata-page]]></loc></url>
</urlset>`;

test.describe('Sitemap parser', () => {
  test('exports the expected shape', () => {
    expect(typeof sp.resolveSiteUrls).toBe('function');
    expect(typeof sp.parseSitemapXml).toBe('function');
    expect(typeof sp.discoverSitemap).toBe('function');
    expect(sp.HARD_CAP).toBe(200);
  });

  test('parses a flat sitemap with priority and lastmod', () => {
    const parsed = sp.parseSitemapXml(FLAT_SITEMAP);
    expect(parsed.isIndex).toBe(false);
    expect(parsed.entries.length).toBe(3);
    expect(parsed.entries[0].loc).toBe('https://example.com/');
    expect(parsed.entries[0].priority).toBe('1.0');
    expect(parsed.entries[0].lastmod).toBe('2026-05-01');
    expect(parsed.entries[1].priority).toBe('0.8');
    expect(parsed.entries[2].priority).toBeUndefined();
  });

  test('detects a sitemap-index', () => {
    const parsed = sp.parseSitemapXml(SITEMAP_INDEX);
    expect(parsed.isIndex).toBe(true);
    expect(parsed.entries.length).toBe(2);
    expect(parsed.entries[0].loc).toBe('https://example.com/sitemap-posts.xml');
  });

  test('unwraps CDATA-wrapped loc values', () => {
    const parsed = sp.parseSitemapXml(CDATA_SITEMAP);
    expect(parsed.entries[0].loc).toBe('https://example.com/cdata-page');
  });

  test('resolveSiteUrls returns the flat sitemap URLs sorted by priority', async () => {
    const fetch = makeFakeFetch({ 'https://example.com/sitemap.xml': FLAT_SITEMAP });
    const result = await sp.resolveSiteUrls('https://example.com', { deps: { fetch } });
    expect(result.urls.length).toBe(3);
    /* Sorted by priority desc. Missing priority defaults to 0.5. */
    expect(result.urls[0].loc).toBe('https://example.com/');         /* 1.0 */
    expect(result.urls[1].loc).toBe('https://example.com/about');    /* 0.8 */
    expect(result.urls[2].loc).toBe('https://example.com/contact');  /* default 0.5 */
    expect(result.capped).toBe(false);
  });

  test('resolveSiteUrls recurses into sitemap-index files', async () => {
    const fetch = makeFakeFetch({
      'https://example.com/sitemap.xml':       SITEMAP_INDEX,
      'https://example.com/sitemap-posts.xml': POSTS_SITEMAP,
      'https://example.com/sitemap-pages.xml': PAGES_SITEMAP
    });
    const result = await sp.resolveSiteUrls('https://example.com', { deps: { fetch } });
    expect(result.urls.length).toBe(3);
    /* Sorted by priority desc: 0.9, 0.6, 0.5 */
    expect(result.urls[0].loc).toBe('https://example.com/page-1');
    expect(result.urls[1].loc).toBe('https://example.com/post-1');
    expect(result.urls[2].loc).toBe('https://example.com/post-2');
  });

  test('caps the URL count at maxPages', async () => {
    const lots = ['<?xml version="1.0"?><urlset>'];
    for (let i = 0; i < 250; i++) lots.push(`<url><loc>https://example.com/p${i}</loc></url>`);
    lots.push('</urlset>');
    const xml = lots.join('');
    const fetch = makeFakeFetch({ 'https://example.com/sitemap.xml': xml });
    const result = await sp.resolveSiteUrls('https://example.com', { deps: { fetch }, maxPages: 50 });
    expect(result.total).toBe(250);
    expect(result.urls.length).toBe(50);
    expect(result.capped).toBe(true);
  });

  test('falls back to sitemap_index.xml when sitemap.xml is 404', async () => {
    const fetch = makeFakeFetch({
      'https://example.com/sitemap.xml':       { status: 404 },
      'https://example.com/sitemap_index.xml': FLAT_SITEMAP
    });
    const result = await sp.resolveSiteUrls('https://example.com', { deps: { fetch } });
    expect(result.sourceSitemap).toBe('https://example.com/sitemap_index.xml');
    expect(result.urls.length).toBe(3);
  });

  test('throws when no sitemap exists', async () => {
    /* v4.2.1: error wording rewritten to tell the user what to do
       next (switch to paste-list mode). Assertion now matches the
       stable stem of the new message. */
    const fetch = makeFakeFetch({});
    await expect(sp.resolveSiteUrls('https://example.com', { deps: { fetch } })).rejects.toThrow(/[Cc]ould not find a public sitemap/);
  });

  test('handles trailing slash on site root', async () => {
    const fetch = makeFakeFetch({ 'https://example.com/sitemap.xml': FLAT_SITEMAP });
    const result = await sp.resolveSiteUrls('https://example.com/', { deps: { fetch } });
    expect(result.urls.length).toBe(3);
  });

  test('dedups identical URLs across sub-sitemaps', async () => {
    const duplicateChild = `<?xml version="1.0"?><urlset>
      <url><loc>https://example.com/shared</loc></url>
    </urlset>`;
    const indexXml = `<?xml version="1.0"?><sitemapindex>
      <sitemap><loc>https://example.com/sm-a.xml</loc></sitemap>
      <sitemap><loc>https://example.com/sm-b.xml</loc></sitemap>
    </sitemapindex>`;
    const fetch = makeFakeFetch({
      'https://example.com/sitemap.xml': indexXml,
      'https://example.com/sm-a.xml':    duplicateChild,
      'https://example.com/sm-b.xml':    duplicateChild
    });
    const result = await sp.resolveSiteUrls('https://example.com', { deps: { fetch } });
    expect(result.urls.length).toBe(1);
  });
});
