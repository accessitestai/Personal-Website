/**
 * AMASAMYA Audit History (v4.3.0)
 *
 * Persists the last N audits per URL to chrome.storage.local so the
 * user can look back at any earlier run and (via engines/audit-diff.js)
 * compare it against the current one.
 *
 * Design notes:
 *
 *   - Per-URL keys under a single top-level record. The record has
 *     the shape:
 *
 *       {
 *         urls: {
 *           "<normalisedUrl>": [
 *             { timestamp, pageTitle, findings, counts },
 *             ...
 *           ],
 *           ...
 *         }
 *       }
 *
 *     A single storage key ("AMASAMYA_history") keeps read/write
 *     atomic and lets the total-byte quota check run in one shot.
 *     Storing per-URL keys would fragment writes and complicate the
 *     eviction algorithm.
 *
 *   - URL normalisation. Fragment (#foo) is dropped. Query params
 *     whose names begin with "utm_" or that match the common tracker
 *     names ("gclid", "fbclid", "mc_cid", "mc_eid", "ref") are also
 *     dropped. Trailing slash on the path is preserved on the root
 *     path only; on non-root paths a trailing slash is stripped. This
 *     matches the sitemap-parser normaliser for the crawler so
 *     history buckets align with crawl aggregation buckets.
 *
 *   - Per-URL cap. HARD_LIMIT_PER_URL = 10. Newest first; on save the
 *     oldest audit past the cap is evicted.
 *
 *   - Total-byte guard. TOTAL_QUOTA_BYTES = 8 * 1024 * 1024 (8 MB).
 *     chrome.storage.local's documented ceiling is 10 MB (subject to
 *     the QUOTA_BYTES quota that varies by Chrome version). We keep
 *     a 2 MB safety margin. When over quota we evict oldest across
 *     all URLs one by one until under EVICT_TARGET_BYTES (6 MB).
 *
 *   - No dependency on chrome.* at import time. The module accepts a
 *     `deps` object with the minimal storage surface it needs. Tests
 *     pass a fake; production passes a chrome.storage.local wrapper.
 *
 *   - Dep-injected exports live behind global.AMASAMYAAuditHistory
 *     under `self` (service worker context) or `window` (side panel /
 *     tests). The Node test harness reads module.exports.
 */

(function (global) {
  'use strict';

  const HARD_LIMIT_PER_URL   = 10;
  const TOTAL_QUOTA_BYTES    = 8 * 1024 * 1024;  /* 8 MB soft cap */
  const EVICT_TARGET_BYTES   = 6 * 1024 * 1024;  /* trim down to 6 MB on eviction */
  const STORAGE_KEY          = 'AMASAMYA_history';

  /* Query-param names we strip during URL normalisation. Anything used
     purely for analytics tracking. Case-insensitive check. */
  const TRACKING_PARAMS = new Set([
    'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'ref', 'source',
    'yclid', 'msclkid', '_hsenc', '_hsmi', 'igshid'
  ]);

  function normalizeUrl(raw) {
    if (raw === null || raw === undefined) return '';
    let s = String(raw).trim();
    if (!s) return '';
    let u;
    try { u = new URL(s); }
    catch (_) { return s; /* not a valid URL; return as-is */ }
    /* Fragment: drop. */
    u.hash = '';
    /* Query: filter out trackers and utm_*. Preserve the rest so
       distinct query-driven pages remain distinct history buckets. */
    if (u.search) {
      const kept = [];
      u.searchParams.forEach((val, key) => {
        const k = key.toLowerCase();
        if (k.startsWith('utm_')) return;
        if (TRACKING_PARAMS.has(k)) return;
        kept.push([key, val]);
      });
      u.search = '';
      kept.forEach(([k, v]) => u.searchParams.append(k, v));
    }
    /* Trailing slash on non-root: strip. */
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    return u.toString();
  }

  /* Rough byte-count estimator. JSON.stringify().length approximates
     byte size for storage.local's purposes since values are stringified
     under the hood. Not exact but good enough for the quota heuristic. */
  function estimateBytes(record) {
    try { return JSON.stringify(record || {}).length; }
    catch (_) { return 0; }
  }

  /* Sort helper: newest audit first. */
  function byTimestampDesc(a, b) {
    const ta = a && a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b && b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  }

  /* Enforce the per-URL cap. Mutates the bucket in place. */
  function enforcePerUrlCap(bucket) {
    if (!Array.isArray(bucket)) return [];
    bucket.sort(byTimestampDesc);
    if (bucket.length > HARD_LIMIT_PER_URL) {
      bucket.length = HARD_LIMIT_PER_URL;
    }
    return bucket;
  }

  /* Enforce the total quota by evicting oldest audits across all URLs
     until the record is under EVICT_TARGET_BYTES. Returns the number
     of audits evicted, so callers can announce it. */
  function enforceTotalQuota(record) {
    if (!record || typeof record !== 'object' || !record.urls) return 0;
    let evicted = 0;
    if (estimateBytes(record) <= TOTAL_QUOTA_BYTES) return 0;
    /* Build a flat list of {url, index, timestamp} pointers, sort
       oldest first, and drop entries one at a time until under
       target. */
    const flat = [];
    for (const [url, bucket] of Object.entries(record.urls)) {
      if (!Array.isArray(bucket)) continue;
      bucket.forEach((audit, i) => {
        flat.push({ url: url, index: i, ts: audit && audit.timestamp ? new Date(audit.timestamp).getTime() : 0 });
      });
    }
    flat.sort((a, b) => a.ts - b.ts);
    for (const p of flat) {
      const bucket = record.urls[p.url];
      if (!Array.isArray(bucket)) continue;
      bucket.splice(p.index, 1);
      evicted++;
      if (bucket.length === 0) delete record.urls[p.url];
      if (estimateBytes(record) <= EVICT_TARGET_BYTES) break;
      /* Recompute later indices for this URL: the splice shifted them.
         Simpler: re-flatten. But we only need to break when under
         target; if not, we do one more iteration on stale indices,
         which will no-op or re-target. To keep correctness we exit
         and let the caller loop if still over. */
      break;
    }
    /* If a single-item eviction did not bring us under target,
       recurse. Guard with a hard cap on recursion depth so a
       pathological corrupt store cannot spin. */
    if (estimateBytes(record) > EVICT_TARGET_BYTES && evicted < 500) {
      evicted += enforceTotalQuota(record);
    }
    return evicted;
  }

  /* Public API. All methods are async and take an explicit `deps`
     object so unit tests do not need chrome.*. Production wires deps
     to a chrome.storage.local wrapper defined at the bottom of this
     file. */

  async function saveAudit(url, findings, meta, deps) {
    const normUrl = normalizeUrl(url);
    if (!normUrl) throw new Error('saveAudit: url is required');
    if (!Array.isArray(findings)) throw new TypeError('saveAudit: findings must be an array');

    const record = (await deps.getRecord()) || { urls: {} };
    if (!record.urls) record.urls = {};

    /* Store only the fields the diff engine and history UI need.
       Dropping heavy audit-only fields (raw DOM snapshots, screenshot
       data) is a defence-in-depth measure against unbounded finding
       payloads. */
    const trimmedFindings = findings.map((f) => ({
      id:        f.id || '',
      engine:    f.engine || '',
      element:   f.element || '',
      selector:  f.selector || '',
      criterion: f.criterion || '',
      issue:     f.issue || '',
      computed:  f.computed || '',
      required:  f.required || '',
      verdict:   f.verdict || '',
      severity:  f.severity || '',
      howToFix:  f.howToFix || ''
    }));

    const audit = {
      timestamp:  (meta && meta.timestamp) || new Date().toISOString(),
      pageTitle:  (meta && meta.pageTitle) || '',
      pageUrl:    (meta && meta.pageUrl)   || url,
      findings:   trimmedFindings,
      counts: {
        total:    trimmedFindings.length,
        fail:     trimmedFindings.filter(f => f.verdict === 'Fail').length,
        warning:  trimmedFindings.filter(f => f.verdict === 'Warning').length,
        pass:     trimmedFindings.filter(f => f.verdict === 'Pass').length,
        info:     trimmedFindings.filter(f => f.verdict === 'Info').length
      }
    };

    if (!Array.isArray(record.urls[normUrl])) record.urls[normUrl] = [];
    record.urls[normUrl].push(audit);
    enforcePerUrlCap(record.urls[normUrl]);
    const evicted = enforceTotalQuota(record);
    await deps.setRecord(record);
    return { normUrl: normUrl, evictedAcrossUrls: evicted };
  }

  async function getHistory(url, deps, limit) {
    const normUrl = normalizeUrl(url);
    const record  = (await deps.getRecord()) || { urls: {} };
    const bucket  = (record.urls && record.urls[normUrl]) || [];
    const sorted  = [...bucket].sort(byTimestampDesc);
    if (typeof limit === 'number' && limit > 0) return sorted.slice(0, limit);
    return sorted;
  }

  async function getAudit(url, timestamp, deps) {
    const normUrl = normalizeUrl(url);
    const record  = (await deps.getRecord()) || { urls: {} };
    const bucket  = (record.urls && record.urls[normUrl]) || [];
    return bucket.find(a => a.timestamp === timestamp) || null;
  }

  async function getPreviousAudit(url, currentTimestamp, deps) {
    /* Returns the most recent audit strictly older than currentTimestamp.
       Used by the panel to build the diff view without the user having
       to click a specific history row. */
    const history = await getHistory(url, deps);
    const cutoff  = currentTimestamp ? new Date(currentTimestamp).getTime() : Infinity;
    for (const audit of history) { /* history is newest-first */
      const t = new Date(audit.timestamp).getTime();
      if (t < cutoff) return audit;
    }
    return null;
  }

  async function clearHistory(url, deps) {
    const normUrl = normalizeUrl(url);
    const record  = (await deps.getRecord()) || { urls: {} };
    if (record.urls) delete record.urls[normUrl];
    await deps.setRecord(record);
  }

  async function clearAllHistory(deps) {
    await deps.setRecord({ urls: {} });
  }

  async function getAllUrls(deps) {
    const record = (await deps.getRecord()) || { urls: {} };
    return Object.keys(record.urls || {});
  }

  /* Production-side deps: chrome.storage.local wrapper. Guarded so
     the module still evaluates in Node under Playwright where chrome
     is undefined. */
  function makeChromeStorageDeps() {
    return {
      getRecord: () => new Promise((resolve) => {
        chrome.storage.local.get(STORAGE_KEY, (data) => {
          resolve((data && data[STORAGE_KEY]) || null);
        });
      }),
      setRecord: (record) => new Promise((resolve) => {
        const obj = {}; obj[STORAGE_KEY] = record;
        chrome.storage.local.set(obj, () => resolve());
      })
    };
  }

  const api = {
    saveAudit:         saveAudit,
    getHistory:        getHistory,
    getAudit:          getAudit,
    getPreviousAudit:  getPreviousAudit,
    clearHistory:      clearHistory,
    clearAllHistory:   clearAllHistory,
    getAllUrls:        getAllUrls,
    normalizeUrl:      normalizeUrl,
    makeChromeStorageDeps: makeChromeStorageDeps,
    _internal: {
      HARD_LIMIT_PER_URL: HARD_LIMIT_PER_URL,
      TOTAL_QUOTA_BYTES:  TOTAL_QUOTA_BYTES,
      EVICT_TARGET_BYTES: EVICT_TARGET_BYTES,
      STORAGE_KEY:        STORAGE_KEY,
      estimateBytes:      estimateBytes,
      enforcePerUrlCap:   enforcePerUrlCap,
      enforceTotalQuota:  enforceTotalQuota
    }
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.AMASAMYAAuditHistory = api;
  }
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
