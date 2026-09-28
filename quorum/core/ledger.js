// The sealed ledger: every record is canonical JSON, hashed with SHA-256 and chained to the
// previous record's hash. Open picks are committed (hash of a salted reveal) and revealed at close.
import { canonicalize } from './canonical-json.js';
import { sha256Hex, hashCanonical } from './hash.js';

export const GENESIS_HASH = '0'.repeat(64);
export const ENTRY_TYPES = ['METHODOLOGY', 'ISSUE', 'BUY', 'RENEW', 'CLOSE', 'CORRECTION'];

const HEX64 = /^[0-9a-f]{64}$/;

function hashable({ seq, type, issueDate, at, body, prevHash }) {
  return { seq, type, issueDate, at, body, prevHash };
}

export async function hashEntry(entry) {
  return sha256Hex(canonicalize(hashable(entry)));
}

export async function createEntry(prev, { type, issueDate, at, body }) {
  if (!ENTRY_TYPES.includes(type)) throw new Error(`ledger: unknown entry type ${type}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) throw new Error('ledger: issueDate must be YYYY-MM-DD');
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) throw new Error('ledger: at must be an ISO instant');
  const entry = {
    seq: prev ? prev.seq + 1 : 0,
    type,
    issueDate,
    at,
    body,
    prevHash: prev ? prev.hash : GENESIS_HASH,
  };
  entry.hash = await hashEntry(entry);
  return entry;
}

export async function verifyEntry(entry) {
  if (!entry || !HEX64.test(entry.hash ?? '')) return false;
  return (await hashEntry(entry)) === entry.hash;
}

export async function verifyChain(entries) {
  let prevHash = GENESIS_HASH;
  let checked = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const expectedSeq = i === 0 ? e.seq : entries[i - 1].seq + 1;
    if (i === 0 && e.seq === 0 && e.prevHash !== GENESIS_HASH) {
      return { ok: false, checked, firstBad: e.seq, reason: 'genesis record does not point to the zero hash' };
    }
    if (e.seq !== expectedSeq) {
      return { ok: false, checked, firstBad: e.seq, reason: `sequence gap: expected ${expectedSeq}` };
    }
    if (i > 0 && e.prevHash !== prevHash) {
      return { ok: false, checked, firstBad: e.seq, reason: 'previous-hash link does not match' };
    }
    if (!(await verifyEntry(e))) {
      return { ok: false, checked, firstBad: e.seq, reason: 'record hash does not match its contents' };
    }
    prevHash = e.hash;
    checked++;
  }
  return { ok: true, checked, firstBad: null, reason: null };
}

// Bitcoin-style Merkle root over hex strings: parent = sha256(leftHex + rightHex); an odd node is paired with itself.
export async function merkleRoot(hashes) {
  if (!hashes.length) return null;
  let level = hashes.slice();
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(await sha256Hex(left + right));
    }
    level = next;
  }
  return level[0];
}

export async function commitment(reveal) {
  return hashCanonical(reveal);
}

export async function verifyReveal(commit, reveal) {
  if (!reveal || !HEX64.test(commit ?? '')) return false;
  return (await commitment(reveal)) === commit;
}

// Plain CSV of the chain for download and offline checking.
export function ledgerCsv(entries) {
  const esc = (v) => {
    const s = typeof v === 'string' ? v : canonicalize(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [['seq', 'type', 'issue_date', 'at', 'prev_hash', 'hash', 'body_jcs'].join(',')];
  for (const e of entries) rows.push([e.seq, e.type, e.issueDate, e.at, e.prevHash, e.hash, e.body].map(esc).join(','));
  return `${rows.join('\n')}\n`;
}
