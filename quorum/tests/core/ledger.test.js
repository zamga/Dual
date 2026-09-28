import test from 'node:test';
import assert from 'node:assert/strict';
import { createEntry, verifyChain, verifyEntry, merkleRoot, commitment, verifyReveal, GENESIS_HASH, ledgerCsv } from '../../core/ledger.js';
import { sha256Hex } from '../../core/hash.js';

async function chain() {
  const out = [];
  let prev = null;
  const rows = [
    { type: 'METHODOLOGY', issueDate: '2025-10-01', at: '2025-10-01T13:00:00+02:00', body: { version: '1.0' } },
    { type: 'BUY', issueDate: '2025-10-01', at: '2025-10-01T13:45:00+02:00', body: { no: '0001', commit: 'a'.repeat(64) } },
    { type: 'ISSUE', issueDate: '2025-10-01', at: '2025-10-01T14:00:00+02:00', body: { issueNo: 1, buys: ['0001'] } },
  ];
  for (const r of rows) {
    prev = await createEntry(prev, r);
    out.push(prev);
  }
  return out;
}

test('a fresh chain verifies and links to genesis', async () => {
  const c = await chain();
  assert.equal(c[0].prevHash, GENESIS_HASH);
  assert.equal(c[1].prevHash, c[0].hash);
  assert.deepEqual(await verifyChain(c), { ok: true, checked: 3, firstBad: null, reason: null });
  assert.equal(await verifyEntry(c[2]), true);
});

test('tampering is located', async () => {
  const c = await chain();
  const edited = structuredClone(c);
  edited[1].body.no = '0002';
  const r = await verifyChain(edited);
  assert.equal(r.ok, false);
  assert.equal(r.firstBad, 1);
  const relinked = structuredClone(c);
  relinked[2].prevHash = 'f'.repeat(64);
  assert.equal((await verifyChain(relinked)).firstBad, 2);
  const gap = [c[0], c[2]];
  assert.match((await verifyChain(gap)).reason, /sequence gap/);
});

test('entries reject bad input', async () => {
  await assert.rejects(createEntry(null, { type: 'TIP', issueDate: '2025-10-01', at: '2025-10-01T14:00:00+02:00', body: {} }));
  await assert.rejects(createEntry(null, { type: 'ISSUE', issueDate: '1.10.2025', at: '2025-10-01T14:00:00+02:00', body: {} }));
});

test('merkle root pairs hex strings and duplicates an odd leaf', async () => {
  const a = 'a'.repeat(64);
  const b = 'b'.repeat(64);
  const c = 'c'.repeat(64);
  assert.equal(await merkleRoot([]), null);
  assert.equal(await merkleRoot([a]), a);
  assert.equal(await merkleRoot([a, b]), await sha256Hex(a + b));
  const ab = await sha256Hex(a + b);
  const cc = await sha256Hex(c + c);
  assert.equal(await merkleRoot([a, b, c]), await sha256Hex(ab + cc));
});

test('commit-reveal', async () => {
  const reveal = { no: '0001', ticker: 'KRST', figi: 'SIM000000001', issueDate: '2025-10-01', agreeing: ['A', 'B', 'D'], salt: 'q9Z3xL0pT7mW2vY8' };
  const commit = await commitment(reveal);
  assert.equal(await verifyReveal(commit, reveal), true);
  assert.equal(await verifyReveal(commit, { ...reveal, ticker: 'KRSU' }), false);
});

test('csv export has one row per entry', async () => {
  const csv = ledgerCsv(await chain());
  assert.equal(csv.trim().split('\n').length, 4);
  assert.match(csv, /^seq,type,issue_date,at,prev_hash,hash,body_jcs\n0,METHODOLOGY,/);
});
