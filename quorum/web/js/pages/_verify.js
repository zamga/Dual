// In-browser verification of the sealed ledger, built on the core library (web/js/core/ledger.js):
// every record hash recomputed with verifyChain (in slices, so progress can be shown), every CLOSE
// reveal and prior reveal checked against its commitment, every daily Merkle root recomputed.
// Also the tamper demo: the same checks on a local copy with one character flipped.
// Pure (no DOM); runs in Node for the tests and in the browser with WebCrypto.
import { verifyChain, verifyReveal, merkleRoot, hashEntry, GENESIS_HASH } from '../core/ledger.js';

export const SLICE = 32;

// A commitment for every sealed record number, from the BUY and RENEW bodies.
export function commitIndex(entries) {
  const m = new Map();
  for (const e of entries ?? []) if ((e.type === 'BUY' || e.type === 'RENEW') && e.body?.commit) m.set(e.body.no, { commit: e.body.commit, seq: e.seq });
  return m;
}

// Every reveal published at a CLOSE (its own and the renewed chain's prior reveals).
export function revealsOf(entries) {
  const out = [];
  for (const e of entries ?? []) {
    if (e.type !== 'CLOSE') continue;
    if (e.body?.reveal) out.push({ closeSeq: e.seq, reveal: e.body.reveal, prior: false });
    for (const r of e.body?.priorReveals ?? []) out.push({ closeSeq: e.seq, reveal: r, prior: true });
  }
  return out;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

// Verify the chain in slices with core verifyChain; the links between slices are checked here.
export async function verifyInSlices(entries, { onProgress, slice = SLICE, yieldEvery = true } = {}) {
  const list = entries ?? [];
  let checked = 0;
  for (let i = 0; i < list.length; i += slice) {
    const part = list.slice(i, i + slice);
    if (i > 0) {
      const prev = list[i - 1];
      const first = part[0];
      if (first.seq !== prev.seq + 1) return { ok: false, checked, firstBad: first.seq, reason: `sequence gap: expected ${prev.seq + 1}` };
      if (first.prevHash !== prev.hash) return { ok: false, checked, firstBad: first.seq, reason: 'previous-hash link does not match' };
    } else if (part[0] && part[0].seq === 0 && part[0].prevHash !== GENESIS_HASH) {
      return { ok: false, checked, firstBad: 0, reason: 'genesis record does not point to the zero hash' };
    }
    const res = await verifyChain(part);
    if (!res.ok) return { ok: false, checked: checked + res.checked, firstBad: res.firstBad, reason: res.reason };
    checked += res.checked;
    onProgress?.({ phase: 'chain', done: checked, total: list.length });
    if (yieldEvery) await tick();
  }
  return { ok: true, checked, firstBad: null, reason: null };
}

export async function verifyReveals(entries, { onProgress } = {}) {
  const commits = commitIndex(entries);
  const reveals = revealsOf(entries);
  const bad = [];
  let done = 0;
  for (const r of reveals) {
    const c = commits.get(r.reveal.no);
    const ok = !!c && (await verifyReveal(c.commit, r.reveal));
    if (!ok)
      bad.push({
        no: r.reveal.no,
        closeSeq: r.closeSeq,
        commitSeq: c?.seq ?? null,
        reason: c ? 'reveal does not hash to its commitment' : 'no commitment for this number',
      });
    done++;
    if (done % 16 === 0) onProgress?.({ phase: 'reveals', done, total: reveals.length });
  }
  onProgress?.({ phase: 'reveals', done, total: reveals.length });
  return { ok: bad.length === 0, checked: reveals.length, prior: reveals.filter((r) => r.prior).length, bad };
}

export async function verifyAnchors(entries, anchors, { onProgress } = {}) {
  const byDate = new Map();
  for (const e of entries ?? []) {
    if (!byDate.has(e.issueDate)) byDate.set(e.issueDate, []);
    byDate.get(e.issueDate).push(e.hash);
  }
  const bad = [];
  let done = 0;
  for (const a of anchors ?? []) {
    const hashes = byDate.get(a.date) ?? [];
    const root = await merkleRoot(hashes);
    if (root !== a.merkleRoot || hashes.length !== a.rowCount)
      bad.push({ date: a.date, reason: root !== a.merkleRoot ? 'Merkle root does not match' : 'row count does not match' });
    done++;
    if (done % 32 === 0) onProgress?.({ phase: 'anchors', done, total: anchors.length });
  }
  onProgress?.({ phase: 'anchors', done, total: (anchors ?? []).length });
  return { ok: bad.length === 0, checked: (anchors ?? []).length, bad };
}

// Everything, in order. Returns per-part results and the elapsed time.
export async function verifyLedger(ledger, { onProgress, now = () => (globalThis.performance ?? Date).now() } = {}) {
  const t0 = now();
  const chain = await verifyInSlices(ledger.entries, { onProgress });
  const reveals = await verifyReveals(ledger.entries, { onProgress });
  const anchors = await verifyAnchors(ledger.entries, ledger.anchors, { onProgress });
  return { ok: chain.ok && reveals.ok && anchors.ok, chain, reveals, anchors, ms: Math.round(now() - t0) };
}

// The tamper demo's second act: the forger also recomputes the forged record's own hash. The record
// now checks out on its own, so the break moves to the next record's previous-hash link.
export async function rehashAt(entries, index) {
  const e = entries[index];
  e.hash = await hashEntry(e);
  return entries;
}
