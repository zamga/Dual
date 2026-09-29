// Daily anchoring of the ledger (brief §2.8, §4.3 "23:59 UTC"): the Merkle root of one issue date's
// ledger entries is submitted to OpenTimestamps calendars and to an RFC 3161 time-stamping
// authority. Everything network-facing takes an injectable fetch; tests use fixture responses.
//
//   otsSubmit(rootHex, { calendars, fetch })       -> [{ url, ok, status, proof (base64) | null, error }]
//   otsFile(rootHex, proofs)                        -> Buffer: a detached .ots file (python-opentimestamps layout)
//   timeStampReq(rootHex, { nonce, certReq })       -> Buffer: DER TimeStampReq (RFC 3161 §2.4.1)
//   parseTimeStampResp(der)                         -> { status, granted, tst: { imprint, genTime, nonce, serial, policy } | null }
//   rfc3161Submit(rootHex, { url, fetch, nonce })   -> { ok, status, request, response, genTime, error }
//   createAnchorer(ctx) -> { anchorDay(date) }      writes ledger_anchors (one row per issue date)
import { randomBytes } from 'node:crypto';
import { merkleRoot } from '../core/ledger.js';
import { iso } from './util.js';

export const DEFAULT_OTS_CALENDARS = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://a.pool.eternitywall.com',
];

// ------------------------------------------------------------------ OpenTimestamps
export const OTS_HEADER_MAGIC = Buffer.from('004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294', 'hex');
const OTS_OP_SHA256 = 0x08;

export async function otsSubmit(rootHex, { calendars = DEFAULT_OTS_CALENDARS, fetch = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  const digest = Buffer.from(rootHex, 'hex');
  if (digest.length !== 32) throw new Error('anchor: Merkle root must be 32 bytes of hex');
  return Promise.all(
    calendars.map(async (url) => {
      try {
        const res = await fetch(`${url.replace(/\/+$/, '')}/digest`, {
          method: 'POST',
          headers: { accept: 'application/vnd.opentimestamps.v1', 'content-type': 'application/octet-stream', 'user-agent': 'quorum-anchor/1' },
          body: digest,
          signal: AbortSignal.timeout(timeoutMs),
        });
        const buf = Buffer.from(await res.arrayBuffer());
        if (!res.ok) return { url, ok: false, status: res.status, proof: null, error: `HTTP ${res.status}` };
        if (!buf.length) return { url, ok: false, status: res.status, proof: null, error: 'empty response' };
        return { url, ok: true, status: res.status, proof: buf.toString('base64'), error: null };
      } catch (e) {
        return { url, ok: false, status: null, proof: null, error: e.message };
      }
    }),
  );
}

// A calendar answers with a serialized timestamp on our digest. Several answers are merged as
// branches of one timestamp: every branch but the last is prefixed with the fork marker 0xff. An
// answer that itself starts with a fork cannot be nested this way and is kept on its own row only.
export function otsFile(rootHex, proofs) {
  const digest = Buffer.from(rootHex, 'hex');
  const branches = proofs.filter(Boolean).map((p) => Buffer.from(p, 'base64')).filter((b) => b.length && b[0] !== 0xff);
  if (!branches.length) return null;
  const parts = [OTS_HEADER_MAGIC, Buffer.from([0x01, OTS_OP_SHA256]), digest];
  branches.forEach((b, i) => {
    if (i < branches.length - 1) parts.push(Buffer.from([0xff]));
    parts.push(b);
  });
  return Buffer.concat(parts);
}

// ------------------------------------------------------------------ DER (just enough for RFC 3161)
function derLength(n) {
  if (n < 0x80) return Buffer.from([n]);
  const out = [];
  while (n > 0) {
    out.unshift(n & 0xff);
    n >>>= 8;
  }
  return Buffer.from([0x80 | out.length, ...out]);
}
const tlv = (tag, content) => Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
const seq = (...items) => tlv(0x30, Buffer.concat(items));
function derInteger(bytes) {
  let b = Buffer.from(bytes);
  while (b.length > 1 && b[0] === 0 && !(b[1] & 0x80)) b = b.subarray(1);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
  return tlv(0x02, b);
}
const OID_SHA256 = Buffer.from('0609608648016503040201', 'hex');
const DER_NULL = Buffer.from('0500', 'hex');

// readTlv(buf, offset) -> { tag, start, end, next }
function readTlv(buf, off) {
  const tag = buf[off];
  let len = buf[off + 1];
  let p = off + 2;
  if (len & 0x80) {
    const k = len & 0x7f;
    if (k === 0 || k > 4) throw new Error('DER: unsupported length');
    len = 0;
    for (let i = 0; i < k; i++) len = len * 256 + buf[p + i];
    p += k;
  }
  if (tag === undefined || Number.isNaN(len) || p + len > buf.length) throw new Error('DER: truncated');
  return { tag, start: p, end: p + len, next: p + len };
}
function children(buf, node) {
  const out = [];
  let p = node.start;
  while (p < node.end) {
    const c = readTlv(buf, p);
    out.push(c);
    p = c.next;
  }
  return out;
}
const intValue = (buf, n) => {
  let v = 0n;
  for (let i = n.start; i < n.end; i++) v = (v << 8n) | BigInt(buf[i]);
  return v;
};
function oidString(buf, n) {
  const b = buf.subarray(n.start, n.end);
  const parts = [Math.floor(b[0] / 40), b[0] % 40];
  let v = 0;
  for (let i = 1; i < b.length; i++) {
    v = v * 128 + (b[i] & 0x7f);
    if (!(b[i] & 0x80)) {
      parts.push(v);
      v = 0;
    }
  }
  return parts.join('.');
}

// timeStampReq(rootHex, { nonce: Buffer|null, certReq }) -> DER TimeStampReq, version 1, SHA-256 imprint.
export function timeStampReq(rootHex, { nonce = null, certReq = true } = {}) {
  const hash = Buffer.from(rootHex, 'hex');
  if (hash.length !== 32) throw new Error('anchor: imprint must be a SHA-256 digest');
  const items = [derInteger([1]), seq(seq(OID_SHA256, DER_NULL), tlv(0x04, hash))];
  if (nonce) items.push(derInteger(nonce));
  if (certReq) items.push(Buffer.from('0101ff', 'hex'));
  return seq(...items);
}

const PKI_STATUS = ['granted', 'grantedWithMods', 'rejection', 'waiting', 'revocationWarning', 'revocationNotification'];

// parseTimeStampResp(der) -> { status, granted, tst } ; tst is read from
// ContentInfo(signedData) -> encapContentInfo(id-ct-TSTInfo) -> TSTInfo. The CMS signature itself is
// not checked here (verify offline with the TSA certificate: openssl ts -verify).
export function parseTimeStampResp(der) {
  const buf = Buffer.from(der);
  const top = readTlv(buf, 0);
  if (top.tag !== 0x30) throw new Error('RFC 3161: response is not a SEQUENCE');
  const [statusInfo, token] = children(buf, top);
  const statusNode = statusInfo?.tag === 0x30 ? children(buf, statusInfo)[0] : null;
  if (statusNode?.tag !== 0x02) throw new Error('RFC 3161: no PKIStatusInfo in the response');
  const st = Number(intValue(buf, statusNode));
  const status = PKI_STATUS[st] ?? `status_${st}`;
  const granted = st === 0 || st === 1;
  if (!token) return { status, granted, tst: null };
  const [ctype, explicit] = children(buf, token);
  if (oidString(buf, ctype) !== '1.2.840.113549.1.7.2') throw new Error('RFC 3161: token is not CMS SignedData');
  const signedData = children(buf, explicit)[0];
  const encap = children(buf, signedData).find((n) => n.tag === 0x30 && children(buf, n)[0]?.tag === 0x06 && oidString(buf, children(buf, n)[0]) === '1.2.840.113549.1.9.16.1.4');
  if (!encap) throw new Error('RFC 3161: no TSTInfo in the token');
  const octet = children(buf, children(buf, encap)[1])[0];
  const tstBuf = buf.subarray(octet.start, octet.end);
  const tstSeq = readTlv(tstBuf, 0);
  const f = children(tstBuf, tstSeq);
  const imprint = children(tstBuf, f[2]);
  const genTimeRaw = tstBuf.subarray(f[4].start, f[4].end).toString('latin1');
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(genTimeRaw);
  const genTime = m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ''}Z` : genTimeRaw;
  const nonceNode = f.slice(5).find((n) => n.tag === 0x02);
  return {
    status,
    granted,
    tst: {
      policy: oidString(tstBuf, f[1]),
      imprintAlg: oidString(tstBuf, children(tstBuf, imprint[0])[0]),
      imprint: tstBuf.subarray(imprint[1].start, imprint[1].end).toString('hex'),
      serial: intValue(tstBuf, f[3]).toString(16),
      genTime,
      nonce: nonceNode ? intValue(tstBuf, nonceNode).toString(16).padStart(2, '0') : null,
    },
  };
}

export async function rfc3161Submit(rootHex, { url, fetch = globalThis.fetch, nonce = randomBytes(8), timeoutMs = 10_000 } = {}) {
  const request = timeStampReq(rootHex, { nonce, certReq: true });
  const out = { ok: false, status: null, url, request: request.toString('base64'), response: null, genTime: null, error: null };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/timestamp-query', accept: 'application/timestamp-reply' },
      body: request,
      signal: AbortSignal.timeout(timeoutMs),
    });
    out.status = res.status;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok) return { ...out, error: `HTTP ${res.status}` };
    const parsed = parseTimeStampResp(buf);
    out.response = buf.toString('base64');
    if (!parsed.granted) return { ...out, error: `TSA status ${parsed.status}` };
    if (parsed.tst?.imprint !== rootHex) return { ...out, error: 'TSA token is for a different digest' };
    const want = BigInt(`0x${Buffer.from(nonce).toString('hex')}`).toString(16).padStart(2, '0');
    if (parsed.tst.nonce !== want) return { ...out, error: 'TSA nonce mismatch' };
    return { ...out, ok: true, genTime: parsed.tst.genTime };
  } catch (e) {
    return { ...out, error: e.message };
  }
}

// ------------------------------------------------------------------ the daily anchor
export function createAnchorer(ctx) {
  const { db, config } = ctx;
  const fetch = ctx.fetch ?? globalThis.fetch;

  // anchorDay(date, { submit = true }) -> { date, merkleRoot, rowCount, ots, rfc3161, created }
  async function anchorDay(date, { submit = true } = {}) {
    const rows = db.all('SELECT seq, hash FROM ledger_entries WHERE issue_date = ? ORDER BY seq', date);
    if (!rows.length) return { date, merkleRoot: null, rowCount: 0, created: false, reason: 'no_entries' };
    const root = await merkleRoot(rows.map((r) => r.hash));
    const existing = db.get('SELECT * FROM ledger_anchors WHERE date = ?', date);
    if (existing && existing.merkle_root === root && existing.row_count === rows.length) {
      return { date, merkleRoot: root, rowCount: rows.length, created: false, ots: safe(existing.ots_proof), rfc3161: safe(existing.rfc3161_token) };
    }
    let ots = { status: 'not_submitted', calendars: [] };
    let tsa = { status: 'not_configured' };
    if (submit) {
      const calendars = config.anchor?.otsCalendars ?? [];
      if (calendars.length) {
        const answers = await otsSubmit(root, { calendars, fetch });
        const file = otsFile(root, answers.map((a) => a.proof));
        ots = {
          status: answers.some((a) => a.ok) ? 'pending' : 'failed',
          calendars: answers.map(({ url, ok, status, error, proof }) => ({ url, ok, status, error, proof })),
          ots: file ? file.toString('base64') : null,
        };
      } else {
        ots = { status: 'not_configured', calendars: [] };
      }
      if (config.anchor?.rfc3161Url) {
        const r = await rfc3161Submit(root, { url: config.anchor.rfc3161Url, fetch });
        tsa = { status: r.ok ? 'granted' : 'failed', url: r.url, genTime: r.genTime, request: r.request, response: r.response, error: r.error };
      }
      if (ots.status === 'failed' || tsa.status === 'failed') {
        ctx.alerts?.raise('anchor_failed', `Anchoring ${date} failed (OTS ${ots.status}, RFC 3161 ${tsa.status})`, { severity: 'warn', dedupeKey: `anchor:${date}` });
      }
    }
    db.run(
      `INSERT INTO ledger_anchors (date, merkle_root, ots_proof, rfc3161_token, row_count, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET merkle_root = excluded.merkle_root, ots_proof = excluded.ots_proof, rfc3161_token = excluded.rfc3161_token, row_count = excluded.row_count, created_at = excluded.created_at`,
      date,
      root,
      JSON.stringify(ots),
      JSON.stringify(tsa),
      rows.length,
      iso(ctx.now()),
    );
    return { date, merkleRoot: root, rowCount: rows.length, created: true, ots, rfc3161: tsa };
  }

  return { anchorDay };
}

function safe(s) {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
