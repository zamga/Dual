import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateMarket } from '../../engine/sim/market.js';
import { crashSwitchSeries, crashPeriods, CRASH_RULE } from '../../engine/families/trend.js';

// The benchmark path does not depend on the number of companies, so a tiny universe is enough.
const m = simulateMarket({ nInitial: 10, ipoScale: 0.01 });
const cs = crashSwitchSeries(m.bench.close);
const on = (from, to) => m.dates.some((d, t) => d >= from && d <= to && cs[t]);
const allOn = (from, to) => m.dates.every((d, t) => d < from || d > to || cs[t]);

test('the crash switch fires in the spring-2009 and spring-2020 rebounds', () => {
  assert.ok(allOn('2009-03-16', '2009-06-12'), 'on through the 2009 rebound');
  assert.ok(allOn('2020-04-06', '2020-06-05'), 'on through the 2020 rebound');
});

test('the crash switch stays off in ordinary drawdowns and bull markets', () => {
  for (const [a, b] of [
    ['2011-01-01', '2011-12-31'],
    ['2012-06-01', '2019-12-31'],
    ['2021-01-01', '2026-09-28'],
  ]) assert.ok(!on(a, b), `${a}..${b}`);
  const periods = crashPeriods(cs.subarray(m.s0), m.dates.slice(m.s0));
  assert.ok(periods.length >= 2 && periods.length <= 4, JSON.stringify(periods));
});

test('the rule is ex-ante: it only reads closes up to t', () => {
  const t0 = m.dates.indexOf('2009-04-01');
  const scrambled = m.bench.close.slice();
  for (let t = t0 + 1; t < scrambled.length; t++) scrambled[t] = scrambled[t0] * (0.5 + (t % 7) / 5);
  assert.deepEqual(crashSwitchSeries(scrambled).subarray(0, t0 + 1), cs.subarray(0, t0 + 1));
  assert.equal(CRASH_RULE.bearLookback, 504);
});

test('market regimes rhyme with history: 2008-09 bear, 2020 crash, 2022 bear, spring-2025 shock', () => {
  const lvl = (d) => m.bench.close[m.dates.indexOf(d)];
  assert.ok(lvl('2009-03-05') / lvl('2007-10-09') < 0.6);
  assert.ok(lvl('2009-06-11') / lvl('2009-03-05') > 1.25);
  assert.ok(lvl('2020-03-20') / lvl('2020-02-19') < 0.72);
  assert.ok(lvl('2020-06-05') / lvl('2020-03-20') > 1.3);
  assert.ok(lvl('2022-10-13') / lvl('2021-12-31') < 0.82);
  assert.ok(lvl('2025-04-08') / lvl('2025-02-18') < 0.85);
  assert.ok(lvl('2026-09-28') > lvl('2023-01-03'));
});
