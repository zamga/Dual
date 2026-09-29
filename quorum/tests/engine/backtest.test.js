// Backtest mechanics on a tiny hand-built market (tests/engine/fake-market.js): entry and exit dates,
// costs, the caps, the cooldown, vetoes, the crash switch, RENEW vs CLOSE and the approver hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTradingDays, countTradingDays } from '../../core/calendar.js';
import { runQuorum, measure, vetoBits, rawVetoBits, llmVetoFromSignal, episodeSets, followEquity } from '../../engine/backtest.js';
import { followPositions } from '../../engine/validate.js';
import { fakeMarket } from './fake-market.js';

const RULE = { topPct: 0.9 };
const close = (a, b) => Math.abs(a - b) < 1e-12;

function run(model, extra = {}) {
  return runQuorum(model, { from: 1, to: model.T - 1, rule: RULE, keepCandidates: true, ...extra });
}

test('a pick enters at the issue-day open and exits at the open 21 trading days later, net of costs', () => {
  const m = fakeMarket({ stocks: [{ ticker: 'LRG', mcap: 20e9, drift: 0.001 }, { ticker: 'MID', mcap: 5e9, drift: -0.001 }] });
  m.qualify(0, 0);
  m.qualify(1, 0);
  const r = run(m.model);
  assert.equal(r.records.length, 2);
  const [a, b] = r.records;
  const { dates, open } = m.model;
  // signals at the close of day 0, issue and entry on day 1, exit at the open of day 22
  assert.equal(a.s, 0);
  assert.equal(a.t, 1);
  assert.equal(a.tExit, 22);
  assert.equal(dates[a.tExit], addTradingDays(dates[a.t], 21));
  assert.equal(countTradingDays(dates[a.t], dates[a.tExit]), 21);
  assert.equal(a.status, 'closed');
  assert.equal(a.closeT, 22);
  assert.deepEqual(r.issues.find((x) => x.t === 22).closes, [0, 1]);
  // costs: 10 bps each way above $10B, 25 bps for $2-10B
  const gA = open[22 * 2] / open[1 * 2] - 1;
  assert.ok(close(a.outcome.gross, gA));
  assert.ok(close(a.outcome.net, ((1 + gA) * 0.999) / 1.001 - 1));
  const gB = open[22 * 2 + 1] / open[1 * 2 + 1] - 1;
  assert.ok(close(b.outcome.net, ((1 + gB) * 0.9975) / 1.0025 - 1));
  const bench = m.model.benchmark.open[22] / m.model.benchmark.open[1] - 1;
  assert.ok(close(a.outcome.bench, bench));
  assert.ok(close(a.outcome.excess, a.outcome.net - bench));
  // alert gap: entry open vs the previous close (the dissemination price)
  const gap = (open[1 * 2] / m.model.close[0] - 1) * 1e4;
  assert.ok(close(a.outcome.alertGapBps, gap));
  // 5-day outcome is the same measurement over 5 trading days
  const d5 = measure(m.model, 0, 1, 6);
  assert.ok(close(a.outcome.d5, d5.excess));
  assert.ok(close(a.outcome.d63, measure(m.model, 0, 1, 64).excess));
  // a window that runs past the data has no outcome, and no 63-day outcome when the data ends first
  assert.equal(measure(m.model, 0, 70, 91), null);
  assert.equal(measure(m.model, 0, 40, 61, { full: true }).d63, null);
});

test('at the day-21 slot a pick that still meets the rule is RENEWED, otherwise CLOSED', () => {
  const m = fakeMarket({ stocks: [{ ticker: 'RNW' }, { ticker: 'VET' }] });
  m.qualify(0, 0);
  m.qualify(0, 21); // still qualifies at the slot's signal day
  m.qualify(1, 0);
  m.qualify(1, 21);
  m.veto(1, 21, 'earnings_within_3d'); // qualifies but a veto fires at the slot: CLOSE
  const r = run(m.model);
  const buyR = r.records.find((x) => x.i === 0 && x.kind === 'BUY');
  const renew = r.records.find((x) => x.i === 0 && x.kind === 'RENEW');
  assert.equal(buyR.status, 'renewed');
  assert.equal(buyR.next, renew.k);
  assert.equal(renew.prior, buyR.k);
  assert.equal(renew.t, 22, 'the renewal starts at the old exit open: the position is continuous');
  assert.equal(renew.tExit, 43);
  assert.equal(renew.status, 'closed', 'no longer qualifies at the next slot');
  assert.equal(renew.closeT, 43);
  assert.ok(buyR.outcome, 'the renewed record is measured over its own window');
  const vet = r.records.filter((x) => x.i === 1);
  assert.equal(vet.length, 1);
  assert.equal(vet[0].status, 'closed');
  const slot = r.issues.find((x) => x.t === 22);
  assert.deepEqual(slot.renews, [renew.k]);
  assert.deepEqual(slot.closes, [vet[0].k]);
  assert.deepEqual(r.issues.find((x) => x.t === 43).closes, [renew.k]);
});

test('at most 2 new picks per issue, ranked by the combined score', () => {
  const m = fakeMarket({ stocks: [{ ticker: 'AAA' }, { ticker: 'BBB' }, { ticker: 'CCC' }] });
  m.qualify(0, 0, ['A', 'B', 'D'], 0.95);
  m.qualify(1, 0, ['A', 'B', 'D'], 0.99);
  m.qualify(2, 0, ['A', 'B', 'D'], 0.97);
  const r = run(m.model);
  const iss = r.issues[0];
  assert.deepEqual(iss.buys.map((k) => r.records[k].i), [1, 2]);
  assert.equal(iss.candidates.find((c) => c.i === 0).status, 'capped_issue');
  assert.equal(iss.vetoes.capped, 1);
});

test('at most 3 open picks per sector', () => {
  const m = fakeMarket({ stocks: ['S1', 'S2', 'S3', 'S4'].map((t) => ({ ticker: t, sector: 'Energy' })) });
  for (let i = 0; i < 4; i++) m.qualify(i, i);
  const r = run(m.model);
  assert.equal(r.records.filter((x) => x.kind === 'BUY').length, 3);
  const c = r.issues[3].candidates.find((x) => x.i === 3);
  assert.equal(c.status, 'capped_sector');
});

test('at most 8 new picks per calendar month', () => {
  const sectors = ['Industrials', 'Health Care', 'Energy', 'Utilities'];
  const m = fakeMarket({ start: '2026-01-02', stocks: Array.from({ length: 10 }, (_, i) => ({ ticker: `M${String.fromCharCode(65 + i)}`, sector: sectors[i % 4] })) });
  for (let i = 0; i < 10; i++) m.qualify(i, i);
  const r = run(m.model, { maxMessages: null });
  const jan = r.records.filter((x) => m.model.dates[x.t].startsWith('2026-01'));
  assert.equal(jan.length, 8);
  const capped = r.issues.flatMap((x) => x.candidates ?? []).filter((c) => c.status === 'capped_month');
  assert.equal(capped.length, 2);
});

test('no re-issue within 10 trading days of a close, except by RENEW', () => {
  const m = fakeMarket({ stocks: [{ ticker: 'CDN' }] });
  m.qualify(0, 0); // BUY on day 1, CLOSE on day 22 (not qualifying at signal day 21)
  m.qualifyRange(0, 25, 40);
  const r = run(m.model);
  const recs = r.records;
  assert.equal(recs[0].closeT, 22);
  // issues on days 26..32 are within 10 trading days of the close on day 22
  for (let t = 26; t <= 32; t++) {
    const c = r.issues.find((x) => x.t === t).candidates.find((x) => x.i === 0);
    assert.equal(c.status, 'cooldown', `day ${t}`);
  }
  assert.equal(recs[1].kind, 'BUY');
  assert.equal(recs[1].t, 33, 'issued 11 trading days after the close');
});

test('vetoes remove candidates and are counted as rule or LLM vetoes', () => {
  const m = fakeMarket({ stocks: [{ ticker: 'DTC' }, { ticker: 'NWS' }, { ticker: 'OK' }] });
  m.qualify(0, 0);
  m.veto(0, 0, 'days_to_cover');
  m.qualify(1, 0);
  m.veto(1, 0, 'llm_48h');
  m.qualify(2, 0);
  const r = run(m.model);
  const iss = r.issues[0];
  assert.deepEqual(iss.buys.map((k) => r.records[k].i), [2]);
  assert.equal(iss.vetoes.rule, 1);
  assert.equal(iss.vetoes.llm, 1);
  assert.equal(iss.candidates.find((c) => c.i === 0).status, 'vetoed_rule');
  assert.equal(iss.candidates.find((c) => c.i === 1).status, 'vetoed_llm');
});

test('the crash switch suspends trend: all three of B, C and D must agree', () => {
  const m = fakeMarket({ stocks: [{ ticker: 'ABD' }, { ticker: 'BCD' }] });
  m.qualify(0, 0, ['A', 'B', 'D']);
  m.qualify(1, 0, ['B', 'C', 'D']);
  m.setCrash(0);
  const r = run(m.model);
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].i, 1);
  assert.equal(r.records[0].crashSwitch, true);
  assert.deepEqual(r.records[0].agreeing, ['B', 'C', 'D']);
  assert.equal(r.records[0].agreement, 3);
});

test('the approver can only remove: a removal is counted and never replaced', () => {
  const m = fakeMarket({ stocks: [{ ticker: 'KEEP' }, { ticker: 'DROP' }, { ticker: 'NEXT' }] });
  m.qualify(0, 0, ['A', 'B', 'D'], 0.99);
  m.qualify(1, 0, ['A', 'B', 'D'], 0.98);
  m.qualify(2, 0, ['A', 'B', 'D'], 0.95); // third by rank: capped by the 2-per-issue cap, not promoted
  const review = (ctx) => ({ approver: 'p1', remove: ctx.t === 1 ? [{ i: 1, reason: { code: 'test', en: 'x', sl: 'x' } }] : [] });
  const r = run(m.model, { review });
  const iss = r.issues[0];
  assert.deepEqual(iss.buys.map((k) => r.records[k].i), [0]);
  assert.equal(iss.vetoes.human, 1);
  assert.equal(iss.human[0].ticker, 'DROP');
  // a day without an approver issues nothing
  const r2 = run(m.model, { review: (ctx) => (ctx.t === 1 ? { approver: null, unissued: true } : { approver: 'p1' }) });
  assert.equal(r2.issues[0].buys.length, 0);
  assert.equal(r2.issues[0].unissued, 2);
});

test('the monthly SMS budget trims new picks, picks plus exits', () => {
  const m = fakeMarket({ start: '2026-01-02', stocks: [{ ticker: 'SA', sector: 'Energy' }, { ticker: 'SB', sector: 'Utilities' }, { ticker: 'SC', sector: 'Health Care' }] });
  m.qualify(0, 0);
  m.qualify(1, 1);
  m.qualify(2, 2);
  const r = run(m.model, { maxMessages: 2 });
  assert.equal(r.records.filter((x) => x.kind === 'BUY').length, 2);
  assert.equal(r.issues[2].smsBudgetCapped, 1);
});

test('the LLM stand-in veto is not backtested: it applies only from the first issue of the sealed record', () => {
  const m = fakeMarket({ stocks: [{ ticker: 'NWS' }, { ticker: 'DTC' }, { ticker: 'LIV' }] });
  const { dates } = m.model;
  // the sealed record starts with the issue on day 30 (signals at the close of day 29)
  m.model.periods = { ...m.model.periods, sealed: [dates[30], dates[m.model.T - 1]] };
  assert.equal(llmVetoFromSignal(m.model), 29);
  m.qualify(0, 0);
  m.veto(0, 0, 'llm_48h'); // before the sealed record: not applied, counted apart
  m.qualify(1, 0);
  m.veto(1, 0, 'days_to_cover'); // the other vetoes are backtested as always
  m.qualify(2, 29);
  m.veto(2, 29, 'llm_48h'); // the first sealed issue: applied
  assert.equal(vetoBits(m.model, 0, 0), 1);
  assert.equal(rawVetoBits(m.model, 0, 0), 1 | 32);
  assert.equal(vetoBits(m.model, 29, 2), 1 | 32);
  const r = run(m.model);
  const first = r.issues[0];
  assert.deepEqual(first.buys.map((k) => r.records[k].i), [0]);
  assert.equal(first.vetoes.llm, 0);
  assert.equal(first.vetoes.rule, 1);
  assert.deepEqual(first.llmShadow, { candidates: 1, renewals: 0 });
  const sealed = r.issues.find((x) => x.t === 30);
  assert.equal(sealed.vetoes.llm, 1);
  assert.equal(sealed.candidates.find((c) => c.i === 2).status, 'vetoed_llm');
  assert.deepEqual(sealed.llmShadow, { candidates: 0, renewals: 0 });
  // the comparison sets follow the same rule
  const sets = episodeSets(m.model, { from: 1, to: 1, topPct: 0.9, sets: { all: (q, n2) => n2 >= 3 } });
  assert.deepEqual(sets.all.map((p) => p.i), [0]);
});

test('follow-every-pick positions keep records whose exit lies after the window, marked to its last day', () => {
  const m = fakeMarket({ stocks: [{ ticker: 'EARLY', drift: 0.002 }, { ticker: 'LATE', drift: 0.002 }] });
  m.qualify(0, 0);
  m.qualify(1, 30);
  const end = 40; // the window ends before LATE's exit (day 31 + 21 = 52)
  const r = run(m.model, { to: end, exitLimit: end });
  const late = r.records.find((x) => x.i === 1);
  assert.equal(late.outcome, null, 'unmeasured: its exit lies after exitLimit');
  const pos = followPositions(m.model, r.records);
  assert.deepEqual(pos.find((p) => p.i === 1), { i: 1, t: 31, tExit: 52, cost: m.model.oneWayCost(30, 1), open: true });
  const eq = followEquity(m.model, pos, 1, end);
  for (let d = 31; d <= end; d++) assert.equal(eq.active[d - 1], 1, `day ${d}: LATE is held, not cash`);
  // episodeSets can return the same open tails (never in the outcome statistics)
  const sets = episodeSets(m.model, { from: 31, to: 31, exitLimit: end, includeOpen: true, topPct: 0.9, sets: { q: (q, n2) => n2 >= 3 } });
  assert.deepEqual(sets.q.map((p) => [p.i, p.open === true, p.excess === undefined]), [[1, true, true]]);
  assert.deepEqual(episodeSets(m.model, { from: 31, to: 31, exitLimit: end, topPct: 0.9, sets: { q: (q, n2) => n2 >= 3 } }).q, []);
});

test('a stock whose last trading day is the signal day is never a new pick and is never renewed', () => {
  const m = fakeMarket({ stocks: [{ ticker: 'GONE' }, { ticker: 'STAY' }, { ticker: 'HELD' }, { ticker: 'KEEP' }] });
  const { dates } = m.model;
  // GONE is acquired at the close of day 5 (its last trading day) and still scores in the top slice
  m.model.companies[0].delistDate = dates[5];
  m.qualify(0, 5);
  m.qualify(1, 5);
  // HELD is bought on day 1 and delists at the close of day 21, the signal day of its day-21 slot
  m.model.companies[2].delistDate = dates[21];
  m.qualify(2, 0);
  m.qualify(2, 21);
  // KEEP is bought on day 1 and still qualifies at its slot: renewed
  m.qualify(3, 0);
  m.qualify(3, 21);
  const r = run(m.model);
  assert.ok(!r.records.some((x) => x.i === 0), 'no pick on a stock that no longer trades at the issue-day open');
  assert.ok(r.records.some((x) => x.i === 1 && x.t === 6));
  assert.equal(r.issues.find((x) => x.t === 6).reached, 1);
  const held = r.records.filter((x) => x.i === 2);
  assert.deepEqual(held.map((x) => [x.kind, x.status]), [['BUY', 'closed']]);
  const keep = r.records.filter((x) => x.i === 3);
  assert.deepEqual(keep.map((x) => x.kind), ['BUY', 'RENEW']);
});

test('an open pick that carries a veto that day is not counted as meeting the rule', () => {
  const m = fakeMarket({ stocks: [{ ticker: 'OPN' }, { ticker: 'VTO' }] });
  m.qualify(0, 0);
  m.qualify(1, 0);
  // both picks still qualify on day 5, while they are open; VTO also carries a veto that day
  m.qualify(0, 5);
  m.qualify(1, 5);
  m.veto(1, 5, 'earnings_within_3d');
  const r = run(m.model);
  const day = r.issues.find((x) => x.s === 5);
  assert.equal(day.reached, 1, 'only the open pick with no veto met the rule');
  assert.equal(day.blocked.alreadyOpen, 1);
  assert.equal(day.blocked.alreadyOpen, day.reached - day.buys.length - day.vetoes.capped - day.vetoes.human - (day.unissued ?? 0));
});
