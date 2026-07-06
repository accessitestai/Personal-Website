/**
 * AMASAMYA v4.3.0 - Audit Diff engine unit tests.
 *
 * Pure logic; no browser or chrome APIs.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');

const D = require(path.resolve(__dirname, '..', '..', 'amasamya-extension', 'engines', 'audit-diff.js'));

function f(engine, criterion, selector, verdict, extras) {
  return Object.assign({
    engine: engine, criterion: criterion, selector: selector,
    element: selector, verdict: verdict || 'Fail', severity: 'Critical',
    id: `${engine}|${criterion}|${selector}|${verdict}`.replace(/\s/g,''),
    issue: 'x', computed: '', required: '', howToFix: ''
  }, extras || {});
}

test.describe('Audit diff', () => {

  test('exports the expected API surface', () => {
    ['diffAudits', 'identityKey', 'pairVerdict', 'actionableRows', 'VERDICTS'].forEach((k) => {
      expect(D[k]).toBeDefined();
    });
    expect(D.VERDICTS.NEW).toBe('new');
    expect(D.VERDICTS.RESOLVED).toBe('resolved');
    expect(D.VERDICTS.REGRESSED).toBe('regressed');
    expect(D.VERDICTS.UNCHANGED).toBe('unchanged');
  });

  test('identityKey concatenates engine, criterion, selector', () => {
    expect(D.identityKey({ engine: 'Colour', criterion: '1.4.3', selector: '.x' })).toBe('Colour|1.4.3|.x');
  });

  test('identityKey falls back to element when selector is empty', () => {
    expect(D.identityKey({ engine: 'E', criterion: 'C', element: 'el' })).toBe('E|C|el');
  });

  test('diffAudits: everything in current, nothing in previous, all rows are "new"', () => {
    const cur = [f('E','C','.a','Fail'), f('E','C','.b','Fail')];
    const { tagged, summary } = D.diffAudits(cur, []);
    expect(summary).toEqual({ new: 2, regressed: 0, unchanged: 0, resolved: 0 });
    tagged.forEach(t => expect(t.diffVerdict).toBe('new'));
  });

  test('diffAudits: identical previous and current is all "unchanged"', () => {
    const rows = [f('E','C','.a','Fail'), f('E','C','.b','Fail')];
    const { summary } = D.diffAudits(rows, rows);
    expect(summary).toEqual({ new: 0, regressed: 0, unchanged: 2, resolved: 0 });
  });

  test('diffAudits: pass previously → fail now is "regressed"', () => {
    const prev = [f('E','C','.a','Pass')];
    const cur  = [f('E','C','.a','Fail')];
    const { tagged, summary } = D.diffAudits(cur, prev);
    expect(summary.regressed).toBe(1);
    expect(tagged[0].diffVerdict).toBe('regressed');
  });

  test('diffAudits: warning previously → fail now is also "regressed"', () => {
    const prev = [f('E','C','.a','Warning')];
    const cur  = [f('E','C','.a','Fail')];
    const { summary } = D.diffAudits(cur, prev);
    expect(summary.regressed).toBe(1);
  });

  test('diffAudits: fail previously → fail now is "unchanged" (still fail, not a regression)', () => {
    const prev = [f('E','C','.a','Fail')];
    const cur  = [f('E','C','.a','Fail')];
    const { summary } = D.diffAudits(cur, prev);
    expect(summary.unchanged).toBe(1);
    expect(summary.regressed).toBe(0);
  });

  test('diffAudits: fail previously → pass now is "resolved" (moved out of the fail set)', () => {
    /* "Resolved" is set-membership: identity exists in previous but not
       in current findings. If the same identity still surfaces with a
       Pass verdict, the audit engine did emit it; that becomes an
       unchanged row. Real engines only emit Fails/Warnings on most
       rules, so a fixed rule genuinely disappears. This test uses the
       disappearance case which is the realistic path. */
    const prev = [f('E','C','.a','Fail')];
    const cur  = [];
    const { tagged, summary } = D.diffAudits(cur, prev);
    expect(summary.resolved).toBe(1);
    expect(tagged.length).toBe(1);
    expect(tagged[0].diffVerdict).toBe('resolved');
  });

  test('diffAudits: rows appear in the correct order (current findings first, resolved appended)', () => {
    const prev = [f('E','C','.a','Fail'), f('E','C','.b','Fail')];
    const cur  = [f('E','C','.a','Fail'), f('E','C','.c','Fail')];
    const { tagged } = D.diffAudits(cur, prev);
    /* Current findings in their original order, then resolved. */
    expect(tagged[0].selector).toBe('.a');
    expect(tagged[0].diffVerdict).toBe('unchanged');
    expect(tagged[1].selector).toBe('.c');
    expect(tagged[1].diffVerdict).toBe('new');
    expect(tagged[2].selector).toBe('.b');
    expect(tagged[2].diffVerdict).toBe('resolved');
  });

  test('diffAudits: handles null / non-array inputs without throwing', () => {
    expect(() => D.diffAudits(null, null)).not.toThrow();
    expect(() => D.diffAudits(undefined, [])).not.toThrow();
    const { summary } = D.diffAudits(null, null);
    expect(summary).toEqual({ new: 0, regressed: 0, unchanged: 0, resolved: 0 });
  });

  test('diffAudits: mixed case with all four verdicts', () => {
    const prev = [
      f('E','C','.a','Fail'),      /* stays fail: unchanged */
      f('E','C','.b','Pass'),      /* becomes fail: regressed */
      f('E','C','.c','Fail')       /* disappears: resolved */
    ];
    const cur = [
      f('E','C','.a','Fail'),
      f('E','C','.b','Fail'),
      f('E','C','.d','Fail')       /* not in prev: new */
    ];
    const { tagged, summary } = D.diffAudits(cur, prev);
    expect(summary).toEqual({ new: 1, regressed: 1, unchanged: 1, resolved: 1 });
    /* Verdicts on the tagged array. */
    const byKey = new Map(tagged.map(t => [t.selector, t.diffVerdict]));
    expect(byKey.get('.a')).toBe('unchanged');
    expect(byKey.get('.b')).toBe('regressed');
    expect(byKey.get('.c')).toBe('resolved');
    expect(byKey.get('.d')).toBe('new');
  });

  test('actionableRows returns only new + regressed rows', () => {
    const prev = [f('E','C','.a','Pass'), f('E','C','.c','Fail')];
    const cur  = [f('E','C','.a','Fail'), f('E','C','.b','Fail')];
    const { tagged } = D.diffAudits(cur, prev);
    const rows = D.actionableRows(tagged);
    expect(rows.length).toBe(2);
    rows.forEach(r => expect(['new','regressed']).toContain(r.diffVerdict));
  });

  test('identityKey treats findings with different engines as distinct', () => {
    /* Contrast at 1.4.3 on .x from the Colour engine is a different
       finding from a hypothetical Layout engine also flagging .x for
       1.4.3. Do not collapse them. */
    const cur  = [f('Colour','1.4.3','.x','Fail'), f('Layout','1.4.3','.x','Fail')];
    const prev = [f('Colour','1.4.3','.x','Fail')];
    const { summary } = D.diffAudits(cur, prev);
    expect(summary.new).toBe(1);
    expect(summary.unchanged).toBe(1);
  });

  test('actionableRows on an empty tagged array returns empty', () => {
    expect(D.actionableRows([])).toEqual([]);
    expect(D.actionableRows(null)).toEqual([]);
  });
});
