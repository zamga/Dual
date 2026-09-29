// Launch status and amendment A-1: computed from the gates and the pooled record, never typed in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedMaxSharpe } from '../../core/stats.js';
import { launchStatus, monthsToPass, dsrFor, seriesStats, addMonths } from '../../engine/launch.js';
import { DSR_MIN } from '../../engine/validate.js';

const gates = (over = {}) => ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, pass: over[id] ?? true }));

test('status is ready only when (a), (b), (c), (e) passed on the holdout and pooled (d) passes', () => {
  assert.equal(launchStatus(gates(), true), 'ready');
  assert.equal(launchStatus(gates({ d: false }), true), 'ready', 'holdout (d) alone does not decide the launch (A-1)');
  assert.equal(launchStatus(gates(), false), 'pre-launch');
  for (const id of ['a', 'b', 'c', 'e']) {
    assert.equal(launchStatus(gates({ [id]: false }), true), 'pre-launch', `holdout gate ${id}`);
  }
  assert.equal(launchStatus(gates().filter((g) => g.id !== 'c'), true), 'pre-launch', 'a missing gate never counts as passed');
});

test('months to pass: the first month count at which the DSR reaches 0.95 at the same Sharpe', () => {
  const varSR = 0.026;
  const trials = { nTrials: 5, varSR, sr0: expectedMaxSharpe(5, varSR) };
  const st = { sr: 0.3, months: 48, skew: -0.3, kurt: 3.5 };
  const m = monthsToPass(st, trials);
  assert.ok(Number.isInteger(m) && m > 0);
  assert.ok(dsrFor(st, trials, st.months + m) >= DSR_MIN);
  assert.ok(dsrFor(st, trials, st.months + m - 1) < DSR_MIN);
  // a Sharpe that already passes needs 0 more months
  assert.equal(monthsToPass({ ...st, sr: 0.6 }, trials), 0);
  // a Sharpe at or below SR0 never passes
  assert.equal(monthsToPass({ ...st, sr: trials.sr0 * 0.99 }, trials), null);
  // the DSR rises with the record length at a Sharpe above SR0
  assert.ok(dsrFor(st, trials, 120) > dsrFor(st, trials, 48));
});

test('series statistics and month arithmetic', () => {
  const st = seriesStats([0.01, 0.02, -0.01, 0.03, 0.0]);
  assert.equal(st.months, 5);
  assert.ok(st.sr > 0);
  assert.equal(addMonths('2026-09', 1), '2026-10');
  assert.equal(addMonths('2026-09', 4), '2027-01');
  assert.equal(addMonths('2026-09', 631), '2079-04');
});
