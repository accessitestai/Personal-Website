/**
 * AMASAMYA v4.3.0 - Audit History unit tests.
 *
 * Pure logic tests: no chrome.* needed. We construct fake deps that
 * expose { getRecord, setRecord } backed by an in-memory object. The
 * module never touches globalThis.chrome.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');

const H = require(path.resolve(__dirname, '..', '..', 'amasamya-extension', 'engines', 'audit-history.js'));

function makeFakeDeps() {
  let record = null;
  return {
    getRecord: async () => record,
    setRecord: async (r) => { record = r; },
    _peek: () => record
  };
}

function makeFinding(id, engine, criterion, selector, verdict, severity) {
  return {
    id: id, engine: engine, criterion: criterion, selector: selector,
    element: `<div id="${id}">`, issue: `Issue ${id}`, computed: '', required: '',
    verdict: verdict || 'Fail', severity: severity || 'Critical', howToFix: 'Fix it'
  };
}

test.describe('Audit history', () => {

  test('exports the expected API surface', () => {
    ['saveAudit', 'getHistory', 'getAudit', 'getPreviousAudit', 'clearHistory', 'clearAllHistory', 'getAllUrls', 'normalizeUrl'].forEach((fn) => {
      expect(typeof H[fn]).toBe('function');
    });
  });

  test('normalizeUrl strips fragments', () => {
    expect(H.normalizeUrl('https://example.com/a#top')).toBe('https://example.com/a');
  });

  test('normalizeUrl strips utm_ and common tracker params', () => {
    const cleaned = H.normalizeUrl('https://example.com/a?utm_source=x&utm_medium=y&id=1&gclid=abc');
    expect(cleaned).toContain('id=1');
    expect(cleaned).not.toContain('utm_source');
    expect(cleaned).not.toContain('utm_medium');
    expect(cleaned).not.toContain('gclid');
  });

  test('normalizeUrl preserves non-tracker query params so distinct pages stay separate', () => {
    const a = H.normalizeUrl('https://example.com/product?id=1');
    const b = H.normalizeUrl('https://example.com/product?id=2');
    expect(a).not.toBe(b);
  });

  test('normalizeUrl strips trailing slash on non-root paths', () => {
    expect(H.normalizeUrl('https://example.com/blog/')).toBe('https://example.com/blog');
  });

  test('normalizeUrl preserves root trailing slash', () => {
    expect(H.normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  test('normalizeUrl returns empty string for empty input', () => {
    expect(H.normalizeUrl('')).toBe('');
    expect(H.normalizeUrl(null)).toBe('');
    expect(H.normalizeUrl(undefined)).toBe('');
  });

  test('saveAudit persists the audit and returns the normalised url', async () => {
    const deps = makeFakeDeps();
    const result = await H.saveAudit('https://example.com/a#foo', [makeFinding('F1','Colour','1.4.3','.x','Fail','Critical')], { pageTitle: 'A', timestamp: '2026-07-01T10:00:00Z' }, deps);
    expect(result.normUrl).toBe('https://example.com/a');
    const history = await H.getHistory('https://example.com/a', deps);
    expect(history.length).toBe(1);
    expect(history[0].pageTitle).toBe('A');
    expect(history[0].findings[0].id).toBe('F1');
  });

  test('saveAudit caps history at 10 entries per URL, oldest evicted first', async () => {
    const deps = makeFakeDeps();
    const url = 'https://example.com/cap';
    for (let i = 0; i < 12; i++) {
      await H.saveAudit(url, [makeFinding(`F${i}`,'E','C','.x','Fail','Critical')], {
        pageTitle: 'T', timestamp: new Date(2026, 0, 1 + i).toISOString()
      }, deps);
    }
    const history = await H.getHistory(url, deps);
    expect(history.length).toBe(10);
    /* Newest first: F11 through F2 kept; F0 and F1 evicted. */
    expect(history[0].findings[0].id).toBe('F11');
    expect(history[9].findings[0].id).toBe('F2');
  });

  test('getHistory returns newest first regardless of insert order', async () => {
    const deps = makeFakeDeps();
    const url = 'https://example.com/order';
    await H.saveAudit(url, [], { timestamp: '2026-01-05T00:00:00Z' }, deps);
    await H.saveAudit(url, [], { timestamp: '2026-01-01T00:00:00Z' }, deps);
    await H.saveAudit(url, [], { timestamp: '2026-01-03T00:00:00Z' }, deps);
    const history = await H.getHistory(url, deps);
    expect(history.map(a => a.timestamp)).toEqual([
      '2026-01-05T00:00:00Z', '2026-01-03T00:00:00Z', '2026-01-01T00:00:00Z'
    ]);
  });

  test('getHistory respects the limit argument', async () => {
    const deps = makeFakeDeps();
    const url = 'https://example.com/limit';
    for (let i = 0; i < 5; i++) {
      await H.saveAudit(url, [], { timestamp: new Date(2026, 0, 1 + i).toISOString() }, deps);
    }
    expect((await H.getHistory(url, deps, 2)).length).toBe(2);
  });

  test('getAudit returns the exact audit by timestamp', async () => {
    const deps = makeFakeDeps();
    const url = 'https://example.com/exact';
    await H.saveAudit(url, [makeFinding('X','E','C','.x','Fail','Critical')], { timestamp: '2026-07-01T09:00:00Z' }, deps);
    await H.saveAudit(url, [makeFinding('Y','E','C','.y','Fail','Critical')], { timestamp: '2026-07-01T10:00:00Z' }, deps);
    const got = await H.getAudit(url, '2026-07-01T09:00:00Z', deps);
    expect(got.findings[0].id).toBe('X');
  });

  test('getPreviousAudit returns the most recent audit strictly older than a given timestamp', async () => {
    const deps = makeFakeDeps();
    const url = 'https://example.com/prev';
    await H.saveAudit(url, [], { timestamp: '2026-07-01T09:00:00Z' }, deps);
    await H.saveAudit(url, [], { timestamp: '2026-07-01T10:00:00Z' }, deps);
    await H.saveAudit(url, [], { timestamp: '2026-07-01T11:00:00Z' }, deps);
    const prev = await H.getPreviousAudit(url, '2026-07-01T11:00:00Z', deps);
    expect(prev.timestamp).toBe('2026-07-01T10:00:00Z');
  });

  test('getPreviousAudit returns null when nothing older exists', async () => {
    const deps = makeFakeDeps();
    const url = 'https://example.com/first';
    await H.saveAudit(url, [], { timestamp: '2026-07-01T10:00:00Z' }, deps);
    const prev = await H.getPreviousAudit(url, '2026-07-01T10:00:00Z', deps);
    expect(prev).toBeNull();
  });

  test('clearHistory removes only the target URL', async () => {
    const deps = makeFakeDeps();
    await H.saveAudit('https://example.com/a', [], { timestamp: '2026-01-01T00:00:00Z' }, deps);
    await H.saveAudit('https://example.com/b', [], { timestamp: '2026-01-01T00:00:00Z' }, deps);
    await H.clearHistory('https://example.com/a', deps);
    expect((await H.getHistory('https://example.com/a', deps)).length).toBe(0);
    expect((await H.getHistory('https://example.com/b', deps)).length).toBe(1);
  });

  test('clearAllHistory wipes every URL', async () => {
    const deps = makeFakeDeps();
    await H.saveAudit('https://a.example.com/', [], { timestamp: '2026-01-01T00:00:00Z' }, deps);
    await H.saveAudit('https://b.example.com/', [], { timestamp: '2026-01-01T00:00:00Z' }, deps);
    await H.clearAllHistory(deps);
    expect(await H.getAllUrls(deps)).toEqual([]);
  });

  test('saveAudit trims heavy finding fields but keeps the diff-identity fields', async () => {
    const deps = makeFakeDeps();
    /* We don't emit heavy fields in the trimmedFindings map, so a
       synthetic "screenshot" field on input should not survive to
       storage. Verifies the storage layer never accidentally grows
       unbounded. */
    const finding = Object.assign(
      makeFinding('S1','E','C','.x','Fail','Critical'),
      { screenshot: 'x'.repeat(10000), domSnapshot: 'y'.repeat(10000) }
    );
    await H.saveAudit('https://example.com/trim', [finding], { timestamp: '2026-07-01T10:00:00Z' }, deps);
    const stored = (await H.getHistory('https://example.com/trim', deps))[0].findings[0];
    expect(stored.screenshot).toBeUndefined();
    expect(stored.domSnapshot).toBeUndefined();
    expect(stored.engine).toBe('E');
    expect(stored.selector).toBe('.x');
    expect(stored.criterion).toBe('C');
  });
});
