import test from 'node:test';
import assert from 'node:assert/strict';
import { agreement, applyQuorum, meetsRule, sensitivity, required, DEFAULT_RULE } from '../../core/quorum-rule.js';

const s = (id, A, B, C, D, extra = {}) => ({ id, ticker: id, sector: extra.sector ?? 'Industrials', pct: { A, B, C, D }, vetoes: extra.vetoes ?? [] });

test('agreement counts families at or above the top-decile line', () => {
  assert.deepEqual(agreement({ A: 0.95, B: 0.9, C: 0.2, D: null }).agreeing, ['A', 'B']);
  assert.equal(agreement({ A: 0.95, B: 0.91, C: 0.93, D: 0.99 }).count, 4);
  assert.equal(agreement({ A: 0.95, B: 0.91, C: 0.93, D: 0.99 }, { suspended: ['A'] }).count, 3);
  assert.equal(required(DEFAULT_RULE, false), 3);
  assert.equal(required(DEFAULT_RULE, true), 3);
});

test('3 of 4 issues, 2 of 4 does not; closest is reported', () => {
  const r = applyQuorum({ date: '2026-09-28', stocks: [s('X', 0.95, 0.92, 0.91, 0.1), s('Y', 0.99, 0.99, 0.2, 0.2)] });
  assert.deepEqual(r.buys.map((b) => b.id), ['X']);
  assert.equal(r.buys[0].agreement, 3);
  assert.equal(r.closest, 3);
  const none = applyQuorum({ date: '2026-09-28', stocks: [s('Y', 0.99, 0.99, 0.2, 0.2)] });
  assert.equal(none.buys.length, 0);
  assert.equal(none.closest, 2);
});

test('crash switch suspends A and needs all of B, C, D', () => {
  const stocks = [s('X', 0.99, 0.95, 0.95, 0.5), s('Z', 0.1, 0.95, 0.92, 0.91)];
  const r = applyQuorum({ date: '2009-04-01', stocks, crashSwitch: true });
  assert.deepEqual(r.buys.map((b) => b.id), ['Z']);
  assert.deepEqual(r.buys[0].agreeing, ['B', 'C', 'D']);
});

test('vetoes, open positions and cooldown', () => {
  const stocks = [
    s('V', 0.99, 0.99, 0.99, 0.99, { vetoes: ['days_to_cover'] }),
    s('L', 0.98, 0.98, 0.98, 0.98, { vetoes: ['llm_48h'] }),
    s('O', 0.97, 0.97, 0.97, 0.97),
    s('C', 0.96, 0.96, 0.96, 0.96),
    s('K', 0.95, 0.95, 0.95, 0.95),
  ];
  const r = applyQuorum({ date: '2026-09-28', stocks, openPositions: [{ id: 'O', sector: 'Energy' }], lastClosedOn: { C: '2026-09-21' } });
  const st = Object.fromEntries(r.candidates.map((c) => [c.id, c.status]));
  assert.deepEqual(st, { V: 'vetoed_rule', L: 'vetoed_llm', O: 'already_open', C: 'cooldown', K: 'issued' });
  assert.equal(r.closest, 4, 'closest ignores vetoed stocks but counts open ones');
  const later = applyQuorum({ date: '2026-10-06', stocks: [s('C', 0.96, 0.96, 0.96, 0.96)], lastClosedOn: { C: '2026-09-21' } });
  assert.equal(later.candidates[0].status, 'issued', '11 trading days after the close');
});

test('caps: 2 per issue, 8 per month, 3 per sector, ranked by combined score', () => {
  const stocks = [s('A1', 0.91, 0.91, 0.91, 0.91), s('A2', 0.99, 0.99, 0.99, 0.99), s('A3', 0.95, 0.95, 0.95, 0.95)];
  const r = applyQuorum({ date: '2026-09-28', stocks });
  assert.deepEqual(r.buys.map((b) => b.id), ['A2', 'A3']);
  assert.equal(r.candidates.find((c) => c.id === 'A1').status, 'capped_issue');
  const month = applyQuorum({ date: '2026-09-28', stocks, monthCount: 7 });
  assert.deepEqual(month.buys.map((b) => b.id), ['A2']);
  assert.equal(month.candidates.find((c) => c.id === 'A3').status, 'capped_month');
  const open = [1, 2].map((i) => ({ id: `o${i}`, sector: 'Industrials' }));
  const sector = applyQuorum({ date: '2026-09-28', stocks, openPositions: open });
  assert.deepEqual(sector.buys.map((b) => b.id), ['A2']);
  assert.equal(sector.candidates.find((c) => c.id === 'A3').status, 'capped_sector');
});

test('meetsRule and sensitivity', () => {
  assert.equal(meetsRule(s('X', 0.95, 0.92, 0.91, 0.1)), true);
  assert.equal(meetsRule(s('X', 0.95, 0.92, 0.91, 0.1, { vetoes: ['pending_ma'] })), false);
  assert.equal(meetsRule(s('X', 0.95, 0.92, 0.91, 0.1), { crashSwitch: true }), false);
  const sens = sensitivity({ A: 0.95, B: 0.92, C: 0.91, D: 0.1 }, ['A', 'B', 'C']);
  assert.equal(sens.family, 'C');
  assert.ok(Math.abs(sens.margin - 0.01) < 1e-12);
});
