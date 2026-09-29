// The in-browser verifier (web/js/pages/_verify.js) on the real ledger: every hash, every reveal, every
// daily Merkle root; and the tamper demo's two acts fail exactly where they should.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifyLedger, verifyInSlices, verifyReveals, verifyAnchors, rehashAt, commitIndex, revealsOf } from '../../web/js/pages/_verify.js';
import { tamperTarget, tamperCopy } from '../../web/js/pages/_records.js';
import { verifyChain } from '../../web/js/core/ledger.js';

const ledger = JSON.parse(readFileSync(fileURLToPath(new URL('../../web/data/ledger.json', import.meta.url)), 'utf8'));

test('the published ledger verifies end to end, with progress', async () => {
  const seen = new Set();
  const res = await verifyLedger(ledger, { onProgress: (p) => seen.add(p.phase) });
  assert.equal(res.ok, true, JSON.stringify(res.chain));
  assert.equal(res.chain.checked, ledger.entries.length);
  assert.equal(res.reveals.checked, revealsOf(ledger.entries).length);
  assert.ok(res.reveals.prior > 0, 'renewed chains reveal their earlier records');
  assert.equal(res.anchors.checked, ledger.anchors.length);
  assert.deepEqual([...seen].sort(), ['anchors', 'chain', 'reveals']);
});

test('slicing agrees with core verifyChain on the whole chain', async () => {
  const a = await verifyChain(ledger.entries);
  const b = await verifyInSlices(ledger.entries, { yieldEvery: false, slice: 17 });
  assert.deepEqual(b, a);
});

test('every reveal has a commitment sealed earlier in the chain', () => {
  const commits = commitIndex(ledger.entries);
  for (const r of revealsOf(ledger.entries)) {
    const c = commits.get(r.reveal.no);
    assert.ok(c, r.reveal.no);
    assert.ok(c.seq < r.closeSeq, `#${r.reveal.no} committed before it was revealed`);
  }
});

test('tampering: the forged record fails; rehashing it moves the break to the next link', async () => {
  for (const preset of ['reveal', 'result', 'scored']) {
    const target = tamperTarget(ledger.entries, preset);
    const forged = tamperCopy(ledger.entries, target);
    const r1 = await verifyInSlices(forged.entries, { yieldEvery: false });
    assert.equal(r1.ok, false);
    assert.equal(r1.firstBad, target.seq, preset);
    assert.match(r1.reason, /record hash does not match/);
    assert.equal(r1.checked, forged.index);
    await rehashAt(forged.entries, forged.index);
    const r2 = await verifyInSlices(forged.entries, { yieldEvery: false });
    assert.equal(r2.firstBad, target.seq + 1, preset);
    assert.match(r2.reason, /previous-hash link/);
    if (preset === 'reveal') {
      const rv = await verifyReveals(forged.entries);
      assert.equal(rv.ok, false);
      assert.equal(rv.bad[0].no, forged.entries[forged.index].body.reveal.no);
    }
  }
});

test('a changed anchor or a dropped record is caught', async () => {
  const anchors = structuredClone(ledger.anchors);
  anchors[3].merkleRoot = anchors[3].merkleRoot.replace(/^./, (c) => (c === '0' ? '1' : '0'));
  const a = await verifyAnchors(ledger.entries, anchors);
  assert.equal(a.ok, false);
  assert.equal(a.bad[0].date, anchors[3].date);
  const gap = ledger.entries.filter((e) => e.seq !== 40);
  const g = await verifyInSlices(gap, { yieldEvery: false });
  assert.equal(g.firstBad, 41);
  assert.match(g.reason, /sequence gap/);
});
