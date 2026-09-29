// The export end to end on the small test universe: contract shapes, the hash chain, commit-reveal,
// SMS rules, thesis numbers, internal consistency and byte-identical output across two runs.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildModel } from '../../engine/model.js';
import { validate } from '../../engine/validate.js';
import { buildRecord } from '../../engine/record.js';
import { buildAll, writeAll, FILES } from '../../engine/export.js';
import { verifyChain, verifyReveal, merkleRoot, GENESIS_HASH } from '../../core/ledger.js';
import { validateSms } from '../../core/sms-templates.js';
import { validateNumbers } from '../../core/numeric-validator.js';
import { issueSlot, fmtLong, addTradingDays } from '../../core/calendar.js';
import { checkContract } from './contract.js';
import { deflatedSharpe, mean, std, skewness, kurtosis } from '../../core/stats.js';
import { REASON_CODES } from '../../engine/record.js';
import { isRealTicker } from '../../engine/sim/blocklist.js';
import { pctRank } from '../../core/format.js';

const dirs = [];
let files; // parsed JSON of run 1
let bytes; // raw text of both runs
let run1; // model and validation of run 1

async function runOnce() {
  const model = await buildModel({ universe: 'small', cache: false });
  const validation = validate(model);
  const record = await buildRecord(model, validation.rule);
  const dir = mkdtempSync(join(tmpdir(), 'quorum-export-'));
  dirs.push(dir);
  writeAll(buildAll(model, validation, record), dir);
  run1 ??= { model, validation };
  return Object.fromEntries(FILES.map((f) => [f, readFileSync(join(dir, `${f}.json`), 'utf8')]));
}

before(async () => {
  const a = await runOnce();
  const b = await runOnce();
  bytes = [a, b];
  files = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, JSON.parse(v)]));
});

/** Every string anywhere in a JSON value. */
function strings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out);
  return out;
}

test.after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

test('every file matches the data contract shapes', () => {
  assert.deepEqual(checkContract(files), {});
  for (const f of FILES) {
    const v = files[f];
    if (Array.isArray(v)) assert.ok(v.every((row) => row.simulated === true), `${f} rows are marked simulated`);
    else assert.equal(v.simulated, true, f);
  }
  for (const p of files.meta.persons) assert.equal(p.fictional, true);
  assert.ok(files.meta.persons.some((p) => p.role === 'approver'));
  assert.ok(files.meta.persons.some((p) => p.role === 'deputy_approver'));
  assert.ok(files.meta.persons.some((p) => p.role === 'model_lead'));
});

test('the export is byte-identical across two independent runs and carries no wall-clock time', () => {
  for (const f of FILES) assert.equal(bytes[0][f], bytes[1][f], `${f}.json differs between runs`);
  const today = new Date().toISOString().slice(0, 10);
  for (const f of FILES) assert.ok(!bytes[0][f].includes(`${today}T`), `${f}.json contains today's instant`);
});

test('the exported ledger verifies end to end and its anchors match', async () => {
  const L = files.ledger;
  assert.equal(L.genesis, GENESIS_HASH);
  const res = await verifyChain(L.entries);
  assert.deepEqual(res, { ok: true, checked: L.entries.length, firstBad: null, reason: null });
  assert.equal(L.entries[0].seq, 0);
  assert.equal(L.entries[0].type, 'METHODOLOGY');
  assert.equal(L.entries[0].body.version, '1.0');
  const meth = L.entries.filter((e) => e.type === 'METHODOLOGY');
  assert.equal(meth.length, 2, 'v1.0 and one methodology change');
  assert.equal(meth[1].body.version, '1.1');
  // one ISSUE per trading day, and anchors over each day's entries
  const dates = files.issues.map((x) => x.date);
  assert.deepEqual(L.entries.filter((e) => e.type === 'ISSUE').map((e) => e.issueDate), dates);
  assert.equal(L.anchors.length, dates.length);
  for (const a of L.anchors) {
    const hs = L.entries.filter((e) => e.issueDate === a.date).map((e) => e.hash);
    assert.equal(a.rowCount, hs.length);
    assert.equal(a.merkleRoot, await merkleRoot(hs));
  }
  assert.deepEqual(L.anchors.map((a) => a.ots).slice(-3), ['confirmed', 'pending', 'pending']);
  // timestamps: BUY/RENEW sealed at 13:45, ISSUE at 14:00, CLOSE after the US open
  for (const e of L.entries) {
    const slot = issueSlot(e.issueDate);
    if (e.type === 'BUY' || e.type === 'RENEW') assert.equal(e.at, slot.sealAt);
    if (e.type === 'ISSUE') assert.equal(e.at, slot.publishAt);
    if (e.type === 'CLOSE') assert.ok(Date.parse(e.at) > Date.parse(slot.usOpenAt));
  }
  // issues.json points at the ISSUE entries
  for (const x of files.issues) {
    const e = L.entries[x.seq];
    assert.equal(e.type, 'ISSUE');
    assert.equal(e.hash, x.hash);
    assert.deepEqual(e.body.buys, x.buys);
    assert.deepEqual(e.body.closes, x.closes);
  }
});

test('every CLOSE reveal matches the commit of the record it closes (and of the renewed records before it)', async () => {
  const L = files.ledger;
  const sealed = new Map(L.entries.filter((e) => e.type === 'BUY' || e.type === 'RENEW').map((e) => [e.body.no, e]));
  const closes = L.entries.filter((e) => e.type === 'CLOSE');
  assert.ok(closes.length > 5);
  let prior = 0;
  for (const c of closes) {
    const rec = sealed.get(c.body.no);
    assert.ok(rec, `CLOSE ${c.body.no} has a sealed record`);
    assert.ok(rec.seq < c.seq);
    assert.equal(await verifyReveal(rec.body.commit, c.body.reveal), true, `reveal of ${c.body.no}`);
    for (const r of c.body.priorReveals) {
      assert.equal(await verifyReveal(sealed.get(r.no).body.commit, r), true, `prior reveal ${r.no}`);
      prior++;
    }
    const pick = files.picks.find((p) => p.no === c.body.no);
    assert.equal(pick.status, 'closed');
    assert.equal(pick.closeSeq, c.seq);
    assert.equal(c.body.reveal.ticker, pick.ticker);
    assert.equal(c.body.exit.open, pick.exit.open);
  }
  assert.ok(prior > 0, 'renewed chains reveal their earlier records');
  // BUY bodies never carry the ticker
  for (const e of sealed.values()) assert.ok(!JSON.stringify(e.body).includes(`"${files.picks.find((p) => p.no === e.body.no).ticker}"`));
});

test('every exported SMS passes validateSms and names the pick', () => {
  let n = 0;
  for (const p of files.picks) {
    for (const loc of ['en', 'sl']) {
      const texts = [p.sms[loc], ...(p.closeSms ? [p.closeSms[loc]] : [])];
      for (const t of texts) {
        const v = validateSms(t);
        assert.equal(v.ok, true, `${t}: ${v.errors.join('; ')}`);
        assert.ok(t.includes(`#${p.no} `) && t.includes(` ${p.ticker} `));
        assert.ok(t.includes('/u/7Kq2xZ'));
        n++;
      }
    }
    assert.ok(p.sms.en.includes(p.kind === 'BUY' ? ' BUY ' : ' RENEW '));
  }
  assert.equal(validateSms(files.hero.sms).ok, true);
  assert.ok(n > 50);
});

test('theses are validated: every number in the text is one of the stored thesis numbers', () => {
  for (const p of files.picks) {
    assert.equal(p.validator, 'passed');
    assert.equal(p.drafter, 'template');
    const labels = Object.values(p.families).flatMap((f) => f.drivers.flatMap((d) => [d.label.en, d.label.en.charAt(0).toLowerCase() + d.label.en.slice(1), `»${d.label.sl}«`]));
    const nextEarn = p.vetoChecks.find((c) => c.key === 'earnings_within_3d').next;
    for (const loc of ['en', 'sl']) {
      const lits = [p.no, p.priorNo, p.ticker, p.name, p.sector, p.sectorSl, ...labels, fmtLong(p.exitPlanned, loc), nextEarn ? fmtLong(nextEarn, loc) : null].filter(Boolean);
      const res = validateNumbers(p.thesis[loc], p.thesisNumbers, { locale: loc, allowStrings: lits });
      assert.deepEqual(res.unknown, [], `${p.no} ${loc}`);
      assert.equal(p.thesis[loc].split('\n\n').length, 3, 'three paragraphs');
    }
    assert.ok(!/\byou\b/i.test(p.thesis.en), 'no "you"');
  }
});

test('published outcomes recompute from the published prices and the records link up', () => {
  const byNo = new Map(files.picks.map((p) => [p.no, p]));
  files.picks.forEach((p, k) => {
    assert.equal(p.no, String(k + 1).padStart(4, '0'), 'numbers are sequential 4-digit strings');
    assert.equal(p.exitPlanned, addTradingDays(p.issueDate, 21));
    assert.equal(p.entry.date, p.issueDate);
    if (p.outcome) {
      assert.ok(Math.abs(p.outcome.gross - (p.exit.open / p.entry.open - 1)) < 2e-6);
      assert.ok(Math.abs(p.outcome.excess - (p.outcome.net - p.outcome.bench)) < 2e-6);
      assert.ok(p.outcome.net < p.outcome.gross, 'costs are deducted');
      assert.equal(p.outcome.exitDate, p.exitPlanned, 'exits at the planned 21-day open');
      // entry at the open (net of both legs' costs), the closes of days 0-20, the exit at the open of day 21
      assert.equal(p.path.length, 23);
      assert.deepEqual(p.path.map((r) => r[0]), [0, ...Array.from({ length: 21 }, (_, d) => d), 21]);
      assert.deepEqual(p.path[22], [21, p.outcome.net, p.outcome.bench]);
    } else {
      assert.equal(p.status, 'open');
      assert.equal(p.path[1][0], 0, 'an open record is marked from its entry-day close on');
    }
    assert.equal(p.path[0][0], 0);
    assert.equal(p.path[0][2], 0);
    assert.ok(p.path[0][1] < 0 && p.path[0][1] > -0.006, 'day 0 at the open carries the entry and exit costs');
    if (p.kind === 'RENEW') {
      const prior = byNo.get(p.priorNo);
      assert.equal(prior.renewedAs, p.no);
      assert.equal(prior.status, 'renewed');
      assert.equal(prior.exit.date, p.entry.date, 'a renewal continues the position');
    }
    assert.ok(Math.abs(p.outcome ? p.outcome.alertGapBps - (p.entry.open / p.dissemination.price - 1) * 1e4 : 0) < 0.06);
  });
  const c = files.meta.counts;
  assert.equal(c.picks + c.renews, files.picks.length);
  assert.equal(c.closed + c.open, files.picks.length);
  // a pick is a BUY; RENEW records continue held positions and are counted apart
  assert.equal(files.summary.nPicks, c.picks);
  assert.equal(files.summary.nRenews, c.renews);
  assert.equal(files.summary.nRecords, files.picks.length);
  assert.equal(files.summary.nClosed, c.closed);
  assert.equal(c.issues, files.issues.length);
  for (const x of files.issues) for (const no of [...x.buys, ...x.renews, ...x.closes]) assert.ok(byNo.has(no));
  // human vetoes and the unissued day are logged with reasons; each removal logs a different reason
  const human = files.issues.flatMap((x) => x.humanVetoes);
  assert.equal(human.length, files.summary.vetoes.human);
  for (const h of human) {
    assert.ok(h.reason.en.length > 20 && h.reason.sl.length > 20);
    assert.ok(REASON_CODES.includes(h.code), h.code);
  }
  assert.equal(new Set(human.map((h) => h.code)).size, human.length, 'reasons are not one repeated judgement');
  assert.ok(files.issues.filter((x) => x.unissued > 0).every((x) => x.approver === null));
  // monthly SMS count (picks plus exits) stays within the consent text's 16
  const perMonth = {};
  for (const p of files.picks) {
    perMonth[p.issueDate.slice(0, 7)] = (perMonth[p.issueDate.slice(0, 7)] ?? 0) + 1;
    if (p.closeSms) perMonth[p.exit.date.slice(0, 7)] = (perMonth[p.exit.date.slice(0, 7)] ?? 0) + 1;
  }
  assert.ok(Math.max(...Object.values(perMonth)) <= 16);
});

test('hero is the issue of the most recently closed pick, with integer percentiles for every scored stock', () => {
  const h = files.hero;
  const closed = files.picks.filter((p) => p.status === 'closed');
  const last = closed.reduce((a, b) => (b.exit.date > a.exit.date || (b.exit.date === a.exit.date && b.no > a.no) ? b : a));
  assert.equal(h.pick.no, last.no);
  assert.equal(h.issueDate, last.issueDate);
  assert.equal(h.p.length, h.nScored * 4);
  assert.ok(h.p.every((v) => Number.isInteger(v) && v >= -1 && v <= 999));
  const row = h.p.slice(h.pick.index * 4, h.pick.index * 4 + 4);
  ['A', 'B', 'C', 'D'].forEach((f, k) => assert.equal(row[k], last.families[f].pct === null ? -1 : Math.floor(last.families[f].pct * 1000 + 1e-9), f));
  assert.deepEqual(h.outcome, { excess: last.outcome.excess, net: last.outcome.net, bench: last.outcome.bench, exitDate: last.outcome.exitDate });
  assert.equal(h.smsAt, last.disseminatedAt);
  // a RENEW is labelled as one, with the pick it continues
  assert.equal(h.pick.kind, last.kind);
  assert.equal(h.pick.priorNo, last.priorNo);
  if (h.pick.kind === 'BUY') assert.equal(h.pick.priorNo, null);
  else assert.ok(files.picks.some((p) => p.no === h.pick.priorNo && p.renewedAs === h.pick.no));
});

test('the backtest carries computed gates, the variant count and the calibration log', () => {
  const b = files.backtest;
  assert.equal(b.variantSharpes.length, b.variantsTried);
  assert.ok(b.variantsTried >= 16);
  assert.equal(b.calibration.variants.length, 16);
  for (const g of b.gates) assert.equal(typeof g.pass, 'boolean');
  const d = b.gates.find((g) => g.id === 'd');
  assert.equal(d.pass, d.values.dsr >= 0.95 && d.values.pbo < 0.3);
  assert.equal(d.values.dsr, b.dsr);
  const a = b.gates.find((g) => g.id === 'a');
  assert.equal(a.pass, a.values.mean > 0 && a.values.median > 0 && a.values.hit >= 0.53);
  const e = b.gates.find((g) => g.id === 'e');
  assert.equal(e.pass, e.values.picksPerMonth >= 3 && e.values.picksPerMonth <= 8);
  // "dsr" is the clustered (effective-trials) value; the raw figure is published beside it
  const dd = b.dsrDetail;
  assert.equal(dd.clustered.dsr, b.dsr);
  assert.equal(dd.raw.nTrials, b.variantsTried);
  assert.equal(dd.clustered.labels.length, b.variantsTried);
  assert.equal(dd.clustered.sizes.reduce((x, y) => x + y, 0), b.variantsTried);
  assert.equal(dd.clustered.sizes.length, dd.clustered.K);
  assert.ok(dd.clustered.K >= 2 && dd.clustered.K <= Math.min(40, b.variantsTried - 1));
  assert.equal(dd.nTrials, dd.clustered.K);
  assert.equal(d.values.nTrialsEff, dd.clustered.K);
  assert.equal(d.values.nTrialsRaw, b.variantsTried);
  assert.equal(d.values.dsrRaw, dd.raw.dsr);
});

test('launch: amendment A-1 splits gate (d) into d1 (research) and d2 (pooled PSR); status consistent with the gates', () => {
  const b = files.backtest;
  const L = b.launch;
  const P = L.pooled;
  const dd = b.dsrDetail;
  assert.equal(L.asOf, files.meta.asOf);
  assert.deepEqual(L.holdoutGates, b.gates.map((g) => ({ id: g.id, pass: g.pass })));
  // original wording: gate (d) on the holdout, published unchanged
  const d = b.gates.find((g) => g.id === 'd');
  assert.equal(L.original.dsr, d.values.dsr);
  assert.equal(L.original.pass, d.pass);
  assert.equal(L.original.dsr, b.dsr);
  // d1: clustered DSR on the research window and PBO across the variants
  assert.equal(L.d1.dsrResearch, dd.clustered.dsrResearch);
  assert.equal(L.d1.pbo, b.pbo);
  assert.equal(L.d1.pass, L.d1.dsrResearch >= 0.95 && L.d1.pbo < 0.3);
  // d2: PSR(SR > 0) of the pooled monthly series, recomputed from the published months
  const ex = P.monthly.map((m) => m[1]);
  const st = { sr: mean(ex) / std(ex), T: ex.length, skew: skewness(ex), kurt: kurtosis(ex) };
  const psr = deflatedSharpe({ ...st, nTrials: 1, varSR: 0 });
  assert.ok(Math.abs(psr - L.d2.psr) < 2e-3, `${psr} vs ${L.d2.psr}`);
  assert.equal(L.d2.months, P.months);
  assert.equal(L.d2.sharpe, P.sharpe);
  assert.equal(L.d2.pass, L.d2.psr >= 0.95);
  assert.equal(L.d2.history.length, P.sealedMonths, 're-tested at every month-end since the freeze');
  assert.equal(L.d2.history[L.d2.history.length - 1].psr, L.d2.psr);
  if (L.d2.pass) assert.equal(L.d2.monthsToPass, 0);
  // status: (a), (b), (c), (e) on the holdout and both halves of A-1
  const others = b.gates.filter((g) => g.id !== 'd').every((g) => g.pass);
  assert.equal(L.status, others && L.d1.pass && L.d2.pass ? 'ready' : 'pre-launch');
  // the amendment text: adopted after the holdout was opened, the original wording with its value
  assert.equal(L.amendment.id, 'A-1');
  assert.equal(L.amendment.date, files.meta.engineFrozen);
  assert.match(L.amendment.text.en, /after the holdout had already been opened/);
  assert.match(L.amendment.text.en, /pooled out-of-sample record/);
  assert.ok(L.amendment.text.en.includes(L.original.dsr.toFixed(2)), 'the original wording\'s value');
  assert.match(L.amendment.text.en, L.original.pass ? /original wording passes/ : /original wording fails/);
  // the pooled record (deflated figures kept for comparison) is the holdout months then the sealed months
  assert.equal(P.from, b.holdout.from);
  assert.equal(P.to, P.monthToDate ? files.issues.filter((x) => x.date.slice(0, 7) < P.monthToDate.month).at(-1).date : files.meta.asOf, 'complete months only');
  assert.equal(L.d2.monthToDate?.month ?? null, P.monthToDate?.month ?? null);
  if (P.monthToDate) assert.ok(P.monthly.every(([m]) => m < P.monthToDate.month), 'the month to date is not counted as a full month');
  assert.equal(P.holdoutMonths, d.values.months);
  assert.equal(P.months, P.holdoutMonths + P.sealedMonths);
  assert.equal(P.monthly.length, P.months);
  for (let k = 1; k < P.monthly.length; k++) assert.ok(P.monthly[k][0] > P.monthly[k - 1][0], 'months ascend without overlap');
  assert.equal(P.monthly[P.holdoutMonths][0], files.meta.sealedSince.slice(0, 7));
  assert.equal(P.nTrialsEff, dd.clustered.K);
  assert.equal(P.nTrialsRaw, b.variantsTried);
  assert.equal(P.pass, P.dsr >= 0.95 && b.pbo < 0.3);
  const again = deflatedSharpe({ ...st, nTrials: dd.clustered.K, varSR: dd.clustered.varSRMonthly });
  const againRaw = deflatedSharpe({ ...st, nTrials: dd.raw.nTrials, varSR: dd.raw.varSRMonthly });
  assert.ok(Math.abs(again - P.dsr) < 2e-3, `${again} vs ${P.dsr}`);
  assert.ok(Math.abs(againRaw - P.dsrRaw) < 2e-3, `${againRaw} vs ${P.dsrRaw}`);
  assert.ok(Math.abs(st.sr * Math.sqrt(12) - P.sharpe) < 1e-3);
  assert.equal(P.history.length, P.sealedMonths);
  assert.equal(P.history[P.history.length - 1].dsr, P.dsr);
  // remaining: one computed sentence per language
  for (const loc of ['en', 'sl']) assert.ok(L.remaining[loc].length > 40 && !/NaN|undefined|null/.test(L.remaining[loc]));
  if (others && L.d1.pass && !L.d2.pass && Number.isInteger(L.d2.monthsToPass)) assert.ok(L.remaining.en.includes(`${L.d2.monthsToPass} more month`));
  // the amendment is sealed in the genesis methodology entry
  assert.match(files.ledger.entries[0].body.summary.en, /amendment A-1/);
  assert.match(files.ledger.entries[0].body.summary.en, /\(d1\).*\(d2\)/);
});

test('the alert-gap note explains the gap against the 30 bps trigger with computed numbers', () => {
  const s = files.summary;
  const g = s.alertGap;
  assert.ok(s.alertGapNote.en.includes(`${Math.round(s.medianAlertGapBps)} bps`));
  assert.ok(s.alertGapNote.sl.includes(`${Math.round(s.medianAlertGapBps)} b.t.`));
  for (const loc of ['en', 'sl']) assert.ok(!/NaN|undefined|null/.test(s.alertGapNote[loc]));
  assert.match(s.alertGapNote.en, /no subscribers yet/);
  assert.equal(g.thresholdBps, 30);
  assert.equal(g.windows, Math.max(0, s.nRecords - g.window + 1));
  assert.ok(g.windowsAbove <= g.windows);
  assert.equal(files.meta.notes.stream.startsWith('EXPERIMENT'), false);
});

test('public copy never refers to "the brief", an internal document', () => {
  for (const f of FILES) {
    for (const t of strings(files[f])) {
      assert.ok(!/\bthe brief\b|\bbrief's\b/i.test(t), `${f}: ${t.slice(0, 120)}`);
      assert.ok(!/izhodišč/i.test(t), `${f}: ${t.slice(0, 120)}`);
    }
  }
});

test('no exported company uses a real US ticker', () => {
  const tickers = new Set([...files.picks.map((p) => p.ticker), ...files.universe.rows.map((r) => r[0]), files.hero.pick?.ticker].filter(Boolean));
  assert.ok(tickers.size > 20);
  for (const t of tickers) assert.equal(isRealTicker(t), false, t);
});

test('published percentiles never round across the rule line: at or above topPct exactly when the family votes', () => {
  const top = files.meta.rule.topPct;
  let checked = 0;
  for (const p of files.picks) {
    for (const f of ['A', 'B', 'C', 'D']) {
      const v = p.families[f].pct;
      if (v === null || (p.crashSwitch && f === 'A')) continue;
      assert.equal(v >= top, p.agreeing.includes(f), `#${p.no} ${f} ${v}`);
      assert.equal(pctRank(v) >= Math.round(top * 100), p.agreeing.includes(f), `#${p.no} ${f} shows as ${pctRank(v)}`);
      checked++;
    }
  }
  assert.ok(checked > 50);
  for (const r of files.universe.rows) assert.equal(r.slice(3, 7).filter((v) => v !== null && v >= top).length, r[7], r[0]);
  // hero permille: 950 or more exactly when the family votes (the pick's row), and the agreement count
  // of every row read from the permille values matches the rule
  const h = files.hero;
  const row = h.p.slice(h.pick.index * 4, h.pick.index * 4 + 4);
  const crash = files.picks.find((p) => p.no === h.pick.no).crashSwitch;
  ['A', 'B', 'C', 'D'].forEach((f, k) => {
    if (!(crash && f === 'A')) assert.equal(row[k] >= top * 1000, h.pick.agreeing.includes(f), f);
  });
  assert.equal(h.p.length, h.nScored * 4);
});

test('the LLM news-veto stand-in is not backtested: no veto before the sealed record, would-be blocks published apart', () => {
  const { model, validation } = run1;
  const sealedSince = files.meta.sealedSince;
  for (const period of ['research', 'holdout']) {
    const run = validation[period].run;
    for (const iss of run.issues) {
      assert.ok(iss.date < sealedSince);
      assert.equal(iss.vetoes.llm, 0, `${period} ${iss.date}`);
    }
    const shadow = run.issues.reduce((a, x) => a + x.llmShadow.candidates, 0);
    assert.equal(files.backtest.llmVetoShadow[period].candidates, shadow);
  }
  assert.equal(files.backtest.llmVetoShadow.appliedFrom, sealedSince);
  // the stand-in still fires in the sealed record, where it is validated live
  assert.equal(model.periods.sealed[0], sealedSince);
});

test('the research follow portfolio holds its last picks to the end of the window (no spurious cash at the seam)', () => {
  const R = run1.validation.research;
  const open = R.run.records.filter((r) => !r.outcome);
  assert.ok(open.length > 0, 'the research window ends with picks whose exits fall in the holdout');
  const eq = R.equity;
  const last = eq.active.length - 1;
  assert.ok(eq.active[last] >= open.length, 'every unmeasured record is still in the portfolio on the last day');
});
