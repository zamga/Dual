// Launch status and amendment A-1: computed from the gates and the pooled record, never typed in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedMaxSharpe, deflatedSharpe, normCdf } from '../../core/stats.js';
import { launchStatus, monthsToPass, dsrFor, seriesStats, addMonths, psrFor, psrMonthsToPass, amendmentText, buildLaunch, PSR_MIN } from '../../engine/launch.js';
import { DSR_MIN } from '../../engine/validate.js';
import { fakeMarket } from './fake-market.js';
import { tradingDaysBetween } from '../../core/calendar.js';

const gates = (over = {}) => ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, pass: over[id] ?? true }));

test('status is ready only when (a), (b), (c), (e) passed on the holdout and both (d1) and (d2) pass', () => {
  assert.equal(launchStatus(gates(), { d1: true, d2: true }), 'ready');
  assert.equal(launchStatus(gates({ d: false }), { d1: true, d2: true }), 'ready', 'the original wording of (d) on the holdout does not decide the launch (A-1)');
  assert.equal(launchStatus(gates(), { d1: false, d2: true }), 'pre-launch', 'd1');
  assert.equal(launchStatus(gates(), { d1: true, d2: false }), 'pre-launch', 'd2');
  assert.equal(launchStatus(gates(), {}), 'pre-launch', 'missing d1/d2 never count as passed');
  for (const id of ['a', 'b', 'c', 'e']) {
    assert.equal(launchStatus(gates({ [id]: false }), { d1: true, d2: true }), 'pre-launch', `holdout gate ${id}`);
  }
  assert.equal(launchStatus(gates().filter((g) => g.id !== 'c'), { d1: true, d2: true }), 'pre-launch', 'a missing gate never counts as passed');
});

test('PSR(SR > 0) is the deflatedSharpe formula with SR0 = 0', () => {
  const st = { sr: 0.26, months: 48, skew: -0.37, kurt: 3.6 };
  // one trial with no Sharpe variance deflates to SR0 = 0 in core/stats
  const viaCore = deflatedSharpe({ sr: st.sr, nTrials: 1, varSR: 0, T: st.months, skew: st.skew, kurt: st.kurt });
  assert.ok(Math.abs(psrFor(st) - viaCore) < 1e-12);
  // by hand: normCdf(SR * sqrt(T - 1) / sqrt(1 - skew * SR + (kurt - 1) / 4 * SR^2))
  const hand = normCdf((0.26 * Math.sqrt(47)) / Math.sqrt(1 + 0.37 * 0.26 + (2.6 / 4) * 0.26 ** 2));
  assert.ok(Math.abs(psrFor(st) - hand) < 1e-12);
  // more months at the same Sharpe raise it; a zero or negative Sharpe stays at or below one half
  assert.ok(psrFor(st, 120) > psrFor(st));
  assert.ok(Math.abs(psrFor({ ...st, sr: 0 }) - 0.5) < 1e-6);
  assert.ok(psrFor({ ...st, sr: -0.1 }) < 0.5);
  assert.equal(psrFor({ ...st, sr: NaN }), null);
  assert.equal(psrFor(st, 2), null);
});

test('PSR months to pass: the first month count at which PSR reaches 0.95 at the same Sharpe', () => {
  const st = { sr: 0.2, months: 40, skew: -0.2, kurt: 3.4 };
  const m = psrMonthsToPass(st);
  assert.ok(Number.isInteger(m) && m > 0);
  assert.ok(psrFor(st, st.months + m) >= PSR_MIN);
  assert.ok(psrFor(st, st.months + m - 1) < PSR_MIN);
  assert.equal(psrMonthsToPass({ ...st, sr: 0.6 }), 0);
  assert.equal(psrMonthsToPass({ ...st, sr: -0.05 }), null, 'a Sharpe at or below zero never passes');
});

test('DSR months to pass: the first month count at which the DSR reaches 0.95 at the same Sharpe', () => {
  const varSR = 0.026;
  const trials = { nTrials: 5, varSR, sr0: expectedMaxSharpe(5, varSR) };
  const st = { sr: 0.3, months: 48, skew: -0.3, kurt: 3.5 };
  const m = monthsToPass(st, trials);
  assert.ok(Number.isInteger(m) && m > 0);
  assert.ok(dsrFor(st, trials, st.months + m) >= DSR_MIN);
  assert.ok(dsrFor(st, trials, st.months + m - 1) < DSR_MIN);
  assert.equal(monthsToPass({ ...st, sr: 0.6 }, trials), 0);
  assert.equal(monthsToPass({ ...st, sr: trials.sr0 * 0.99 }, trials), null);
  assert.ok(dsrFor(st, trials, 120) > dsrFor(st, trials, 48));
});

test('the amendment text says when A-1 was adopted, and gives the original wording and its computed result', () => {
  const base = { date: '2025-09-30', holdoutMonths: 36, holdoutSharpe: 0.94, psrHoldout: 0.931, K: 5 };
  const fail = amendmentText({ ...base, original: { dsr: 0.6643, pbo: 0.0725, pass: false } });
  assert.match(fail.en, /after the holdout had already been opened/);
  assert.match(fail.en, /gives 0\.66, below 0\.95, so the original wording fails/);
  assert.match(fail.en, /\(d1\).*research window.*0\.95.*PBO.*0\.3/);
  assert.match(fail.en, /\(d2\).*pooled out-of-sample record.*above zero.*0\.95.*every month-end/);
  assert.match(fail.en, /5 effective independent variants/);
  assert.match(fail.en, /probabilistic Sharpe of only 0\.93/);
  assert.match(fail.sl, /potem ko je bilo preizkusno obdobje že odprto/);
  assert.match(fail.sl, /znaša 0,66, kar je pod 0,95/);
  // the text follows the numbers: an original that passes is not described as failing
  const pass = amendmentText({ ...base, original: { dsr: 0.97, pbo: 0.1, pass: true } });
  assert.match(pass.en, /original wording passes as well/);
  assert.doesNotMatch(pass.en, /fails/);
  const pbo = amendmentText({ ...base, original: { dsr: 0.96, pbo: 0.35, pass: false } });
  assert.match(pbo.en, /PBO of 0\.35 is not below 0\.3/);
  const long = amendmentText({ ...base, psrHoldout: 0.97, original: { dsr: 0.5, pbo: 0.1, pass: false } });
  assert.doesNotMatch(long.en, /too short/);
  for (const t of [fail, pass, pbo, long]) for (const loc of ['en', 'sl']) assert.ok(!/NaN|undefined|null/.test(t[loc]));
});

test('series statistics and month arithmetic', () => {
  const st = seriesStats([0.01, 0.02, -0.01, 0.03, 0.0]);
  assert.equal(st.months, 5);
  assert.ok(st.sr > 0);
  assert.equal(addMonths('2026-09', 1), '2026-10');
  assert.equal(addMonths('2026-09', 4), '2027-01');
  assert.equal(addMonths('2026-09', 631), '2079-04');
});

// A sealed record on a hand-built market that starts in June 2026, after a synthetic 36-month holdout.
function launchOn(days) {
  const m = fakeMarket({ start: '2026-06-01', days, stocks: [{ ticker: 'UPA', drift: 0.003 }, { ticker: 'UPB', drift: 0.001 }] });
  const model = { ...m.model, periods: { ...m.model.periods, freeze: '2025-09-30' } };
  const holdoutMonthly = [];
  for (let k = 0; k < 36; k++) holdoutMonthly.push([addMonths('2022-10', k), 0.004 + 0.01 * Math.sin(k * 1.7)]);
  const trials = { K: 5, nTrials: 5, varSR: 0.02, sr0: expectedMaxSharpe(5, 0.02) };
  const g = (id) => ({ id, pass: true, values: {} });
  const validation = {
    holdout: { from: '2022-10-03', monthlyExcess: holdoutMonthly, annualisedSharpe: 1.2 },
    research: { from: '2009-01-02', to: '2022-09-30', monthlyExcess: holdoutMonthly, annualisedSharpe: 0.9 },
    deflation: { clustered: trials, raw: { ...trials, nTrials: 40 } },
    pbo: 0.1, dsr: 0.9, dsrRaw: 0.5, dsrResearch: 0.97, dsrResearchRaw: 0.6,
    gates: ['a', 'b', 'c', 'd', 'e'].map(g),
  };
  // one record a month, each held 21 trading days
  const picks = [1, 22, 43, 64].filter((t) => t < model.T - 1).map((t, k) => ({ _i: k % 2, _t: t, _closeT: t + 21 <= model.T - 1 ? t + 21 : null, costOneWay: 0.001 }));
  return { model, L: buildLaunch(model, validation, { from: 1, picks }) };
}

test('d2 is re-tested on complete months only; the month to date is published apart', () => {
  // data through Tuesday 15 September 2026: September is a month to date
  const { model, L } = launchOn(75);
  assert.equal(model.dates[model.T - 1].slice(0, 7), '2026-09');
  assert.equal(L.d2.monthToDate.month, '2026-09');
  assert.equal(L.pooled.monthToDate.month, '2026-09');
  assert.equal(L.d2.months, 36 + 3, 'June, July and August 2026 are complete; September is not counted');
  assert.equal(L.pooled.months, L.d2.months);
  assert.equal(L.pooled.monthly.at(-1)[0], '2026-08');
  assert.equal(L.pooled.to, model.dates.filter((d) => d.startsWith('2026-08')).at(-1));
  assert.equal(L.d2.history.at(-1).month, '2026-08');
  assert.ok(L.d2.history.every((h) => h.month < '2026-09'));
  const st = seriesStats(L.pooled.monthly.map((x) => x[1]));
  assert.ok(Math.abs(psrFor(st) - L.d2.psr) < 1e-4);
  assert.equal(L.d2.months + 1, L.d2.monthToDate.months);
  // once the month is complete it counts
  const done = launchOn(tradingDaysBetween('2026-06-01', '2026-09-30').length);
  assert.equal(done.model.dates[done.model.T - 1], '2026-09-30');
  assert.equal(done.L.d2.monthToDate, null);
  assert.equal(done.L.d2.months, 36 + 4);
  assert.equal(done.L.pooled.to, '2026-09-30');
});
