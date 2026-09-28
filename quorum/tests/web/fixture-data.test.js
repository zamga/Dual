import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFixtures, writeFixtures, isFixtureDoc, FILES } from '../../scripts/fixture-data.js';
import { verifyChain, commitment } from '../../core/ledger.js';
import { addTradingDays } from '../../core/calendar.js';
import { validateSms } from '../../core/sms-templates.js';

const data = await buildFixtures();

test('writes every file of the data contract, each marked simulated and fixture', () => {
  assert.deepEqual(FILES.sort(), ['backtest', 'deciles', 'hero', 'issues', 'ledger', 'meta', 'picks', 'scoreboard', 'summary', 'universe'].sort());
  for (const f of FILES) {
    const d = data[f];
    if (Array.isArray(d)) assert.ok(d.every((r) => r.fixture === true), f);
    else {
      assert.equal(d.simulated, true, f);
      assert.equal(d.fixture, true, f);
    }
  }
});

test('meta, summary and issues have the contract fields', () => {
  for (const k of ['seed', 'asOf', 'dataThrough', 'sealedSince', 'holdout', 'engineFrozen', 'methodology', 'modelVersion', 'families', 'persons', 'universe', 'counts']) assert.ok(k in data.meta, k);
  assert.ok(data.meta.persons.every((p) => p.fictional === true));
  for (const k of ['liveSince', 'label', 'nPicks', 'nClosed', 'hitRate', 'hitCI', 'medianExcess', 'meanExcess', 'worstPick', 'maxDrawdown', 'medianAlertGapBps', 'cumulative', 'vetoes', 'equity']) assert.ok(k in data.summary, k);
  const r = data.issues.at(-1);
  for (const k of ['date', 'issueNo', 'publishAt', 'tz', 'nScored', 'closest', 'quorum', 'buys', 'renews', 'closes', 'vetoes', 'seq', 'hash']) assert.ok(k in r, k);
  assert.equal(r.date, '2026-09-28');
  assert.ok(data.issues.some((x) => !x.quorum));
});

test('the ledger chain verifies, anchors cover every issue, commitments match reveals', async () => {
  const res = await verifyChain(data.ledger.entries);
  assert.equal(res.ok, true, res.reason);
  assert.equal(data.ledger.anchors.length, data.issues.length);
  const p = data.picks[0];
  assert.equal(await commitment(p.reveal), p.commit);
});

test('picks: exit 21 trading days after entry, valid one-segment SMS, open picks have no outcome', () => {
  for (const p of data.picks) {
    assert.equal(p.exitPlanned, addTradingDays(p.issueDate, 21));
    assert.match(p.no, /^\d{4}$/);
    assert.ok([3, 4].includes(p.agreement));
    assert.equal(validateSms(p.sms.en).ok, true, p.sms.en);
    assert.equal(validateSms(p.sms.sl).ok, true, p.sms.sl);
    if (p.status === 'open') assert.equal(p.outcome, null);
    else assert.ok(p.outcome && Number.isFinite(p.outcome.excess));
  }
  assert.ok(data.picks.some((p) => p.status === 'open'));
});

test('hero: flat percentiles, the pick row agrees in its families, path of 21 days', () => {
  const h = data.hero;
  assert.equal(h.p.length % 4, 0);
  assert.equal(h.p.length / 4, h.nScored);
  const row = h.p.slice(h.pick.index * 4, h.pick.index * 4 + 4);
  for (const f of h.pick.agreeing) assert.ok(row['ABCD'.indexOf(f)] >= 900);
  assert.equal(h.path.at(-1)[0], 21);
  assert.ok(h.outcome.exitDate <= data.meta.asOf);
});

test('tickers are fictional-looking and never on the blocklist sample', () => {
  const block = ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'ACME', 'KO', 'F', 'GE'];
  for (const p of data.picks) assert.ok(!block.includes(p.ticker));
});

test('never overwrites a file that lacks the fixture marker', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quorum-fx-'));
  try {
    const real = JSON.stringify({ simulated: true, asOf: '2026-09-28' });
    await writeFile(join(dir, 'meta.json'), real);
    await writeFile(join(dir, 'issues.json'), '[{"date":"2026-09-28"}]');
    await writeFile(join(dir, 'hero.json'), '{"simulated":true,"fixture":true}');
    const { written, kept } = await writeFixtures(dir, { log: () => {} });
    assert.deepEqual(kept.sort(), ['issues', 'meta']);
    assert.ok(written.includes('hero'));
    assert.equal(await readFile(join(dir, 'meta.json'), 'utf8'), real);
    assert.equal(isFixtureDoc(JSON.parse(await readFile(join(dir, 'hero.json'), 'utf8'))), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('isFixtureDoc', () => {
  assert.equal(isFixtureDoc({ fixture: true }), true);
  assert.equal(isFixtureDoc({ simulated: true }), false);
  assert.equal(isFixtureDoc([]), false);
  assert.equal(isFixtureDoc([{ fixture: true }, { fixture: true }]), true);
  assert.equal(isFixtureDoc(null), false);
});
