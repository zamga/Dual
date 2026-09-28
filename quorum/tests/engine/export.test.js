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

const dirs = [];
let files; // parsed JSON of run 1
let bytes; // raw text of both runs

async function runOnce() {
  const model = await buildModel({ universe: 'small', cache: false });
  const validation = validate(model);
  const record = await buildRecord(model, validation.rule);
  const dir = mkdtempSync(join(tmpdir(), 'quorum-export-'));
  dirs.push(dir);
  writeAll(buildAll(model, validation, record), dir);
  return Object.fromEntries(FILES.map((f) => [f, readFileSync(join(dir, `${f}.json`), 'utf8')]));
}

before(async () => {
  const a = await runOnce();
  const b = await runOnce();
  bytes = [a, b];
  files = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, JSON.parse(v)]));
});

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
      assert.equal(p.path.length, 22);
      assert.deepEqual(p.path[21], [21, p.outcome.net, p.outcome.bench]);
    } else {
      assert.equal(p.status, 'open');
    }
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
  assert.equal(files.summary.nPicks, files.picks.length);
  assert.equal(files.summary.nClosed, c.closed);
  assert.equal(c.issues, files.issues.length);
  for (const x of files.issues) for (const no of [...x.buys, ...x.renews, ...x.closes]) assert.ok(byNo.has(no));
  // human vetoes and the unissued day are logged with reasons
  const human = files.issues.flatMap((x) => x.humanVetoes);
  assert.equal(human.length, files.summary.vetoes.human);
  for (const h of human) assert.ok(h.reason.en.length > 20 && h.reason.sl.length > 20);
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
  assert.ok(h.p.every((v) => Number.isInteger(v) && v >= -1 && v <= 1000));
  const row = h.p.slice(h.pick.index * 4, h.pick.index * 4 + 4);
  ['A', 'B', 'C', 'D'].forEach((f, k) => assert.ok(Math.abs(row[k] - last.families[f].pct * 1000) <= 1, f));
  assert.deepEqual(h.outcome, { excess: last.outcome.excess, net: last.outcome.net, bench: last.outcome.bench, exitDate: last.outcome.exitDate });
  assert.equal(h.smsAt, last.disseminatedAt);
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
});
