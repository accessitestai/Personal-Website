/**
 * AMASAMYA Sitemap Parser (v4.2.0)
 *
 * Resolves a site root to a list of crawlable URLs by reading the
 * standard /sitemap.xml. Handles both flat sitemaps and sitemap-index
 * files (which point to other sitemaps and need recursive resolution).
 *
 * Why this module exists separately from site-crawler.js:
 *
 *   - URL acquisition is the part most likely to evolve. Today it is
 *     sitemap-driven; in v4.2.1 we add recursive link-following; in
 *     v4.3 we may add Google Search Console import. Keeping the
 *     acquisition layer isolated means none of those changes touch
 *     the runner.
 *
 *   - It is unit-testable in plain Node without any chrome.* surface.
 *
 *   - The 200-page cap is enforced here as a defence-in-depth check,
 *     in addition to the runner's own cap. A user pasting a 10,000-
 *     URL sitemap-index should never be able to overflow the runner
 *     no matter what they do.
 *
 * What it does not do:
 *
 *   - Does not respect robots.txt. The crawler is auditing pages the
 *     user owns or has been authorised to audit. We are not a search
 *     engine and the user's choice to audit their own pages is not
 *     subject to robots.txt. If a future deployment needs robots.txt
 *     compliance (e.g. third-party-targeted audits) it is added at
 *     this layer.
 *
 *   - Does not follow non-XML sitemap formats (sitemap.txt, RSS,
 *     Atom). Those represent <5% of real-world sitemaps and are
 *     better handled by user-pasted lists.
 */

(function (global) {
  'use strict';

  const HARD_CAP = 200;

  /*
    Default fetcher uses the standard global fetch. Tests pass their
    own fetcher that returns hardcoded XML strings. Dependency
    injection avoids monkey-patching globalThis.fetch in tests.
  */
  function makeDefaultDeps() {
    return {
      fetch: (url) => (typeof fetch === 'function')
                        ? fetch(url, { credentials: 'same-origin' })
                        : Promise.reject(new Error('fetch unavailable'))
    };
  }

  /*
    Discover the sitemap URL for a given site root. Tries the common
    locations in order: /sitemap.xml, /sitemap_index.xml,
    /sitemap-index.xml. Returns the first that responds 200.
    Throws if none responds.
  */
  async function discoverSitemap(siteRoot, deps) {
    const candidates = [
      '/sitemap.xml',
      '/sitemap_index.xml',
      '/sitemap-index.xml'
    ];
    const root = stripTrailingSlash(siteRoot);
    for (const path of candidates) {
      const url = root + path;
      try {
        const res = await deps.fetch(url);
        if (res && res.ok) return { url: url, response: res };
      } catch (_) { /* try next */ }
    }
    throw new Error('No sitemap found at ' + root + '/sitemap.xml or sitemap_index.xml or sitemap-index.xml');
  }

  /*
    Parse a single sitemap-XML string into an array of URL records.
    Records have the shape { loc, lastmod, priority }. lastmod and
    priority are optional and may be undefined.

    Uses regex extraction rather than DOMParser because this module
    runs in the background service worker, which has no DOMParser.
    Sitemap XML is simple enough that regex is reliable.
  */
  function parseSitemapXml(xml) {
    const isIndex = /<sitemapindex[\s>]/i.test(xml);
    const out = [];
    /* Pull every <url>...</url> or <sitemap>...</sitemap> block. */
    const blockRe = isIndex
      ? /<sitemap\b[\s\S]*?<\/sitemap>/gi
      : /<url\b[\s\S]*?<\/url>/gi;
    const blocks = xml.match(blockRe) || [];
    for (const block of blocks) {
      const loc = matchTag(block, 'loc');
      if (!loc) continue;
      out.push({
        loc:       loc.trim(),
        lastmod:   matchTag(block, 'lastmod'),
        priority:  matchTag(block, 'priority')
      });
    }
    return { isIndex: isIndex, entries: out };
  }

  function matchTag(block, tag) {
    const re = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i');
    const m = block.match(re);
    if (!m) return undefined;
    return m[1].replace(/<!\[CDATA\[/i, '').replace(/]]>/, '').trim();
  }

  function stripTrailingSlash(s) {
    return String(s || '').replace(/\/+$/, '');
  }

  /*
    Resolve a site root to its full list of crawlable URLs. Returns
    an array of { loc, priority, lastmod } records, sorted by priority
    descending (so when the 200-page cap kicks in, we take the highest-
    priority pages first).

    Recurses into sitemap-index files up to a small depth limit to
    avoid pathological recursion.
  */
  async function resolveSiteUrls(siteRoot, options) {
    const deps = (options && options.deps) || makeDefaultDeps();
    const maxPages = (options && typeof options.maxPages === 'number') ? options.maxPages : HARD_CAP;
    const maxIndexDepth = 3;

    const discovered = await discoverSitemap(siteRoot, deps);
    const xml = await discovered.response.text();

    const collected = [];
    await collectFromXml(xml, deps, maxIndexDepth, collected);

    /* Cap, dedup, sort. */
    const seen = new Set();
    const unique = [];
    for (const rec of collected) {
      if (!rec.loc || seen.has(rec.loc)) continue;
      seen.add(rec.loc);
      unique.push(rec);
    }
    unique.sort((a, b) => {
      const pa = parseFloat(a.priority);
      const pb = parseFloat(b.priority);
      const fa = Number.isFinite(pa) ? pa : 0.5;
      const fb = Number.isFinite(pb) ? pb : 0.5;
      return fb - fa;
    });
    return {
      sourceSitemap: discovered.url,
      total:         unique.length,
      capped:        unique.length > maxPages,
      urls:          unique.slice(0, Math.min(maxPages, HARD_CAP))
    };
  }

  async function collectFromXml(xml, deps, depthRemaining, out) {
    const parsed = parseSitemapXml(xml);
    if (!parsed.isIndex) {
      for (const e of parsed.entries) out.push(e);
      return;
    }
    if (depthRemaining <= 0) return; /* avoid pathological recursion */
    for (const e of parsed.entries) {
      if (!e.loc) continue;
      try {
        const res = await deps.fetch(e.loc);
        if (!res || !res.ok) continue;
        const childXml = await res.text();
        await collectFromXml(childXml, deps, depthRemaining - 1, out);
        if (out.length >= HARD_CAP * 5) return; /* generous early exit */
      } catch (_) { /* skip this sub-sitemap, continue */ }
    }
  }

  const api = {
    resolveSiteUrls:  resolveSiteUrls,
    parseSitemapXml:  parseSitemapXml,
    discoverSitemap:  discoverSitemap,
    HARD_CAP:         HARD_CAP,
    _internal:        { matchTag: matchTag, stripTrailingSlash: stripTrailingSlash }
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.AMASAMYASitemapParser = api;
  }
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
