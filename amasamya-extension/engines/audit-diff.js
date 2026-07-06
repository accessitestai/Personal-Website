/**
 * AMASAMYA Audit Diff (v4.3.0)
 *
 * Computes the delta between two audit findings arrays: what's new,
 * what regressed, what stayed the same, and what got resolved.
 *
 * Identity tuple: `${engine}|${criterion}|${selector}`.
 *   - Two findings from the same engine, checking the same WCAG
 *     criterion, against the same element selector, are the "same
 *     finding" across runs.
 *   - Exact string match. We do NOT normalise :nth-child indices in
 *     v4.3.0. If real-world crawls generate false pairs from
 *     :nth-child drift, add normalisation at identityKey() in v4.4.0.
 *
 * Verdict rules:
 *   - "new":       identity exists in current, not in previous.
 *   - "resolved":  identity exists in previous, not in current.
 *   - "regressed": identity exists in both; previous verdict was
 *                  Pass or Warning; current verdict is Fail.
 *   - "unchanged": identity exists in both; anything else.
 *
 * Return shape:
 *   {
 *     tagged: [
 *       ...currentFindings each with diffVerdict added,
 *       ...resolvedFindings (synthesised from previous), each with
 *          diffVerdict='resolved'
 *     ],
 *     summary: { new: N, regressed: N, unchanged: N, resolved: N }
 *   }
 *
 * The tagged array is ordered:
 *   1. All current findings in their original order.
 *   2. All resolved findings appended, marked accordingly.
 *
 * This ordering matches how the panel renders the diff view: current
 * audit rows first (with change badges), then a "resolved" section at
 * the bottom showing what got fixed.
 */

(function (global) {
  'use strict';

  const VERDICTS = Object.freeze({
    NEW:        'new',
    REGRESSED:  'regressed',
    UNCHANGED:  'unchanged',
    RESOLVED:   'resolved'
  });

  function identityKey(finding) {
    if (!finding || typeof finding !== 'object') return '';
    const engine    = String(finding.engine    || '');
    const criterion = String(finding.criterion || '');
    const selector  = String(finding.selector  || finding.element || '');
    return engine + '|' + criterion + '|' + selector;
  }

  /* Compare the pair (previous, current) for the same identity and
     return which of the four verdicts applies. Never returns 'new' or
     'resolved' because those are set-membership decisions handled at
     the outer diff level. */
  function pairVerdict(previous, current) {
    if (!previous || !current) return VERDICTS.UNCHANGED;
    const prevV = String(previous.verdict || '').toLowerCase();
    const currV = String(current.verdict  || '').toLowerCase();
    if (currV === 'fail' && (prevV === 'pass' || prevV === 'warning' || prevV === 'info')) {
      return VERDICTS.REGRESSED;
    }
    return VERDICTS.UNCHANGED;
  }

  function diffAudits(currentFindings, previousFindings) {
    const current  = Array.isArray(currentFindings)  ? currentFindings  : [];
    const previous = Array.isArray(previousFindings) ? previousFindings : [];

    const prevByKey = new Map();
    for (const f of previous) {
      const k = identityKey(f);
      if (k) prevByKey.set(k, f);
    }
    const currByKey = new Map();
    for (const f of current) {
      const k = identityKey(f);
      if (k) currByKey.set(k, f);
    }

    const tagged = [];
    let newCount = 0, regressedCount = 0, unchangedCount = 0, resolvedCount = 0;

    for (const f of current) {
      const k = identityKey(f);
      let verdict;
      if (!k || !prevByKey.has(k)) {
        verdict = VERDICTS.NEW;
        newCount++;
      } else {
        verdict = pairVerdict(prevByKey.get(k), f);
        if (verdict === VERDICTS.REGRESSED) regressedCount++;
        else unchangedCount++;
      }
      /* Only tag Fail/Warning findings as "new" in the count. A Pass
         appearing that wasn't there before is not user-actionable; it
         still gets diffVerdict='new' on the row so exports can filter
         but the summary card counts actionable rows. */
      /* Note: to keep the summary card meaningful, we already count
         all NEW/REGRESSED/UNCHANGED regardless of verdict. The diff
         CSV exporter can filter down to Fail-only if callers want. */
      tagged.push(Object.assign({}, f, { diffVerdict: verdict }));
    }

    /* Resolved: findings present in previous but not current.
       Synthesise as rows in the tagged output so the panel can list
       them separately. */
    for (const f of previous) {
      const k = identityKey(f);
      if (k && !currByKey.has(k)) {
        resolvedCount++;
        tagged.push(Object.assign({}, f, { diffVerdict: VERDICTS.RESOLVED }));
      }
    }

    return {
      tagged: tagged,
      summary: {
        new:        newCount,
        regressed:  regressedCount,
        unchanged:  unchangedCount,
        resolved:   resolvedCount
      }
    };
  }

  /* Convenience: extract only the actionable rows for CSV export.
     "Actionable" = new failures/warnings that the developer needs to
     look at, plus regressions. Resolved rows are excluded from a
     ticket-file export; unchanged rows are excluded because they were
     already in the previous report. */
  function actionableRows(taggedArray) {
    if (!Array.isArray(taggedArray)) return [];
    return taggedArray.filter((f) => {
      if (!f) return false;
      if (f.diffVerdict === VERDICTS.NEW || f.diffVerdict === VERDICTS.REGRESSED) return true;
      return false;
    });
  }

  const api = {
    diffAudits:      diffAudits,
    identityKey:     identityKey,
    pairVerdict:     pairVerdict,
    actionableRows:  actionableRows,
    VERDICTS:        VERDICTS
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.AMASAMYAAuditDiff = api;
  }
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
