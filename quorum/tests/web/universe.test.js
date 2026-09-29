// The Research explorer's pure helpers (web/js/pages/_universe.js) and the status page's (_status.js),
// against the published data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  universeRows,
  filterUniverse,
  sortUniverse,
  summarize,
  universeCsv,
  visibleRange,
  defaultFilters,
  isDefault,
  preset,
  pctl,
  money,
  agreementOf,
  FAMILIES,
} from '../../web/js/pages/_universe.js';
import { demoStatus, liveStatus, channelState, timetable, latestIssue, total } from '../../web/js/pages/_status.js';

const data = (f) => JSON.parse(readFileSync(new URL(`../../web/data/${f}.json`, import.meta.url), 'utf8'));
const universe = data('universe');
const meta = data('meta');
const topPct = meta.rule?.topPct ?? 0.95;
const rows = universeRows(universe);

test('universe rows are read by column name; every row is a fictional company with four percentiles', () => {
  assert.equal(rows.length, universe.rows.length);
  assert.ok(rows.length > 1000);
  for (const r of rows) {
    assert.match(r.ticker, /^[A-Z]{1,5}$/);
    for (const f of FAMILIES) assert.ok(r[f] === null || (r[f] >= 0 && r[f] <= 1), `${r.ticker} ${f}`);
  }
  // reordered columns give the same objects
  const cols = [...universe.cols].reverse();
  const flipped = { cols, rows: universe.rows.map((r) => [...r].reverse()) };
  assert.deepEqual(universeRows(flipped)[5], rows[5]);
  assert.deepEqual(universeRows({}), []);
});

test('agreement matches the threshold: agree = families at or above meta.rule.topPct', () => {
  for (const r of rows.slice(0, 400)) {
    const n = FAMILIES.filter((f) => Number.isFinite(r[f]) && r[f] >= topPct).length;
    assert.equal(r.agree, n, r.ticker);
    assert.equal(agreementOf({ ...r, agree: null }, topPct), n);
  }
});

test('filters: sector, at-least agreement, vetoes, family ranges, text', () => {
  const all = filterUniverse(rows, defaultFilters());
  assert.equal(all.length, rows.length);
  const q = filterUniverse(rows, preset('quorum', topPct));
  assert.ok(q.length > 0);
  assert.ok(q.every((r) => r.agree >= 3));
  const near = filterUniverse(rows, preset('near', topPct));
  assert.ok(near.every((r) => r.agree >= 2 && !r.veto));
  const vetoed = filterUniverse(rows, preset('vetoed', topPct));
  assert.ok(vetoed.every((r) => r.agree >= 2 && r.veto));
  assert.equal(near.length + vetoed.length, rows.filter((r) => r.agree >= 2).length);
  const trend = filterUniverse(rows, preset('trend', topPct));
  assert.ok(trend.length > 0 && trend.every((r) => r.A * 100 >= Math.round(topPct * 100) - 1e-9));
  const f = defaultFilters();
  f.ranges.C = [0, 10];
  assert.ok(filterUniverse(rows, f).every((r) => r.C <= 0.1 + 1e-9));
  const sector = rows[0].sector;
  f.ranges.C = [0, 100];
  f.sector = sector;
  assert.ok(filterUniverse(rows, f).every((r) => r.sector === sector));
  const one = filterUniverse(rows, { ...defaultFilters(), q: rows[10].ticker.toLowerCase() });
  assert.ok(one.some((r) => r.ticker === rows[10].ticker));
  assert.ok(filterUniverse(rows, { ...defaultFilters(), veto: 'days_to_cover' }).every((r) => r.veto === 'days_to_cover'));
  assert.equal(isDefault(defaultFilters()), true);
  assert.equal(isDefault(preset('quorum')), false);
});

test('sorting: by agreement then combined score; nulls last both ways; stable ties', () => {
  const s = sortUniverse(rows, 'agree', 'desc');
  for (let i = 1; i < s.length; i++) assert.ok(s[i - 1].agree >= s[i].agree);
  const byA = sortUniverse(rows, 'A', 'asc');
  const firstNull = byA.findIndex((r) => r.A === null);
  if (firstNull >= 0) assert.ok(byA.slice(firstNull).every((r) => r.A === null));
  const withNull = [{ ticker: 'ZZ', A: null }, { ticker: 'AA', A: 0.5 }, { ticker: 'BB', A: 0.5 }];
  assert.deepEqual(sortUniverse(withNull, 'A', 'desc').map((r) => r.ticker), ['AA', 'BB', 'ZZ']);
  assert.deepEqual(sortUniverse(withNull, 'A', 'asc').map((r) => r.ticker), ['AA', 'BB', 'ZZ']);
});

test('the screener summary adds up', () => {
  const s = summarize(rows, topPct);
  // only 3/4+ rows with no veto met the rule; the rest of the 3/4+ rows were vetoed
  assert.equal(s.met + s.blocked, s.quorum);
  assert.equal(s.met, rows.filter((r) => (r.agree ?? 0) >= 3 && !r.veto).length);
  assert.equal(s.n, rows.length);
  assert.equal(s.byAgree.reduce((a, b) => a + b, 0), rows.length);
  assert.equal(s.quorum, rows.filter((r) => r.agree >= 3).length);
  assert.equal(s.vetoed, rows.filter((r) => r.veto).length);
  assert.equal(Object.values(s.byVeto).reduce((a, b) => a + b, 0), s.vetoed);
  assert.equal(s.sectors.reduce((a, [, n]) => a + n, 0), rows.length);
  for (const f of FAMILIES) assert.equal(s.inTop[f], rows.filter((r) => r[f] >= topPct).length);
  assert.equal(summarize([], topPct).n, 0);
});

test('CSV for personal use: a notice line, a header, one quoted row per stock', () => {
  const some = rows.slice(0, 20).concat([{ ...rows[0], name: 'Comma, "Quoted" Inc.' }]);
  const csv = universeCsv(some, { date: universe.date, scoresAsOf: universe.scoresAsOf });
  const lines = csv.trim().split('\n');
  assert.match(lines[0], /^# Quorum Research universe .*Simulated market, fictional companies\. Personal use only; no redistribution\.$/);
  assert.equal(lines[1], 'date,ticker,name,sector,A,B,C,D,agree,veto,mcap,adv60,ret21,simulated,fictional');
  assert.equal(lines.length, 2 + some.length);
  assert.ok(lines.at(-1).includes('"Comma, ""Quoted"" Inc."'));
  assert.ok(lines.slice(2).every((l) => l.endsWith(',true,true')));
});

test('the virtual window renders only what is visible, plus overscan', () => {
  assert.deepEqual(visibleRange(0, 520, 52, 1377, 0), { start: 0, end: 11 });
  assert.deepEqual(visibleRange(5200, 520, 52, 1377, 6), { start: 94, end: 117 });
  assert.deepEqual(visibleRange(1e9, 520, 52, 1377, 6), { start: 1377, end: 1377 });
  assert.deepEqual(visibleRange(0, 520, 52, 0), { start: 0, end: 0 });
  const r = visibleRange(52 * 1370, 520, 52, 1377, 6);
  assert.equal(r.end, 1377);
});

test('display helpers: floored percentiles never show 95.0 below the threshold; compact money', () => {
  assert.equal(pctl(0.94995), '94.9');
  assert.equal(pctl(0.95), '95.0');
  assert.equal(pctl(1), '100.0');
  assert.equal(pctl(null), '–');
  assert.equal(money(5581029242), '$5.6B');
  assert.equal(money(28969898), '$29M');
  assert.equal(money(1.67e12), '$1.7T');
  assert.equal(money(146104107466), '$146B');
  assert.equal(money(5581029242, 'sl'), '5,6\u00a0mrd');
});

test('status (demo): derived from the data; every count zero before launch, not invented', () => {
  const issues = data('issues');
  const ledger = data('ledger');
  const now = new Date('2026-09-28T20:30:00Z');
  const st = demoStatus({ issues, ledger, now });
  assert.equal(st.mode, 'demo');
  assert.equal(st.prelaunch, true);
  assert.equal(st.issue.date, issues.at(-1).date);
  assert.equal(st.issue.issueNo, issues.at(-1).issueNo);
  for (const c of ['sms', 'push', 'email']) {
    assert.equal(total(st.delivery[c]), 0);
    assert.equal(channelState(st, c), 'ready');
  }
  assert.equal(st.anchor.date, ledger.anchors.at(-1).date);
  // before 14:00 the latest issue is the previous one
  assert.equal(latestIssue(issues, new Date(`${issues.at(-1).date}T11:59:00Z`)).date, issues.at(-2).date);
});

test('status (live): the /api/status body normalised; paused and failing channels named', () => {
  const st = liveStatus({ issue: { date: '2026-09-28', issueNo: 249, items: { buys: 1, renews: 0, closes: 0 } }, delivery: { sms: { delivered: 10, failed: 1 } }, smsChannel: { paused: true } });
  assert.equal(st.delivery.sms.delivered, 10);
  assert.equal(st.delivery.push.queued, 0);
  assert.equal(channelState(st, 'sms'), 'paused');
  assert.equal(channelState(st, 'push'), 'ready');
  assert.equal(channelState(liveStatus({ delivery: { email: { failed: 3 } } }), 'email'), 'failing');
  assert.equal(channelState(liveStatus({ delivery: { email: { queued: 3, delivered: 1 } } }), 'email'), 'sending');
  assert.equal(liveStatus(null).issue, null);
});

test('the day’s timetable: brief §4.3 slots, done / next / later against the clock', () => {
  const tt = timetable('2026-09-28', new Date('2026-09-28T12:05:00Z')); // 14:05 CEST
  const by = Object.fromEntries(tt.map((s) => [s.id, s]));
  assert.equal(by.seal.local, '13:45');
  assert.equal(by.publish.local, '14:00');
  assert.equal(by.publish.state, 'done');
  assert.equal(by.fanout.state, 'next');
  assert.equal(by.entry.local, '15:30');
  assert.equal(by.anchor.state, 'later');
  assert.equal(by.ingest.date, '2026-09-25'); // the previous trading day, 22:15
  assert.equal(tt.filter((s) => s.state === 'next').length, 1);
  // when the EU has changed its clocks and the US has not, the open is 14:30
  assert.equal(Object.fromEntries(timetable('2026-10-27', new Date()).map((s) => [s.id, s])).entry.local, '14:30');
  assert.deepEqual(timetable('2026-09-27', new Date()), []); // a Sunday
});
