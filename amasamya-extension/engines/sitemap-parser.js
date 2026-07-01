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

  const HARD_CAP        = 200;
  const FETCH_TIMEOUT_MS = 10000;  /* v4.2.1: 10 s cap so Amazon-style hangs never freeze the crawler */

  /*
    Default fetcher uses the standard global fetch. Tests pass their
    own fetcher that returns hardcoded XML strings. Dependency
    injection avoids monkey-patching globalThis.fetch in tests.

    v4.2.1: wrap every real fetch in an AbortController-driven
    timeout. Without this, a hostile CDN can hold the socket open
    indefinitely and the crawler UI reports nothing.
  */
  function makeDefaultDeps() {
    return {
      fetch: (url) => {
        if (typeof fetch !== 'function') return Promise.reject(new Error('fetch unavailable'));
        if (typeof AbortController === 'undefined') return fetch(url, { credentials: 'same-origin' });
        const ctrl  = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
        return fetch(url, { credentials: 'same-origin', signal: ctrl.signal })
          .finally(() => clearTimeout(timer));
      }
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
    // v4.2.1: friendlier wording. Many large sites (Amazon, most
    // banks, sites behind a CDN that blocks bots) return 403 / 404
    // for /sitemap.xml even when one exists internally. Tell the
    // user what to do next instead of just naming the URLs we tried.
    throw new Error(
      'Could not find a public sitemap for ' + root + '. ' +
      'Some sites (large stores, banks, sites behind a bot filter) ' +
      'block sitemap access on purpose. To audit this site, go back ' +
      'to the Site Crawl tab, choose "I will paste the page addresses ' +
      'myself", and paste the addresses you want to check, one per line.'
    );
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
    const maxIndexDepth = 5;  /* v4.2.1: was 3, too shallow for real e-commerce sitemap-indexes */

    const discovered = await discoverSitemap(siteRoot, deps);
    const xml = await discovered.response.text();

    /* v4.2.1: reject empty / whitespace-only 200 responses. This is
       the root cause of the amazon.in 1-page bug: Amazon's edge
       returned 200 OK with no XML body, we parsed zero URLs, and the
       UI silently completed with total=0. */
    if (!xml || xml.trim().length === 0) {
      throw new Error(
        'Sitemap at ' + discovered.url + ' returned an empty body. ' +
        'Large sites (Amazon, banks, sites behind a bot filter) do ' +
        'this on purpose. Switch to the "paste page addresses" mode ' +
        'on the Site Crawl tab and paste the URLs you want to check.'
      );
    }

    const collected = [];
    await collectFromXml(xml, deps, maxIndexDepth, collected);

    /* v4.2.1: also surface the case where the sitemap parsed cleanly
       but contained zero <url> entries (empty sitemap-index, malformed
       tags). Silent zero-URL completion is never useful to the user. */
    if (collected.length === 0) {
      throw new Error(
        'Sitemap at ' + discovered.url + ' contained no page addresses. ' +
        'Switch to the "paste page addresses" mode on the Site Crawl ' +
        'tab and paste the URLs you want to check.'
      );
    }

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
        if (out.length >= HARD_CAP * 10) return; /* v4.2.1: bumped 5x → 10x so hierarchical sitemaps do not truncate early */
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
