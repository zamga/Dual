// Web Push with node:crypto only: VAPID (RFC 8292, an ES256 JWT) and aes128gcm payload encryption
// (RFC 8291 message encryption over the RFC 8188 content coding, one record).
//   createWebPush({ vapid: { publicKey, privateKey, subject }, fetch, clock, timeoutMs, resolveHost })
//     -> { kind, publicKey, send }
//   createConsolePush({ log, clock }) -> the same interface; records what it would send
// send(subscription, payload, { ttl, urgency, topic }) -> { ok, status, gone, id }
//   subscription = { endpoint, keys: { p256dh, auth } } (base64url, as the browser's PushSubscription gives them)
//   gone = true on 404/410: the subscription no longer exists and should be revoked.
// Every request has a deadline (timeoutMs, headers and body), and the endpoint's host must resolve
// to public addresses only: a push endpoint can never make the server call itself or its network.
import { createECDH, createHmac, createCipheriv, createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

export const b64u = {
  enc: (buf) => Buffer.from(buf).toString('base64url'),
  dec: (s) => Buffer.from(String(s), 'base64url'),
};

const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
const bytes = (v) => (typeof v === 'string' ? b64u.dec(v) : Buffer.from(v));

export class PushError extends Error {
  constructor(status, body) {
    super(`Web Push HTTP ${status}${body ? `: ${String(body).slice(0, 200)}` : ''}`);
    this.name = 'PushError';
    this.status = status;
  }
}

// Loopback, private, link-local, shared (CGNAT), documentation, benchmarking, multicast and reserved
// ranges: never a push service.
const NON_PUBLIC = new BlockList();
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]) {
  NON_PUBLIC.addSubnet(a, p, 'ipv4');
}
// (IPv4-mapped IPv6 addresses are checked as the IPv4 address they carry, below.)
for (const [a, p] of [['::', 127], ['100::', 64], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) NON_PUBLIC.addSubnet(a, p, 'ipv6');

// isPublicAddress('10.0.0.5') -> false; isPublicAddress('142.250.1.1') -> true
export function isPublicAddress(ip) {
  const s = String(ip).toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (mapped) return isPublicAddress(mapped[1]);
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(s)) return false; // mapped, hex form: refuse rather than decode
  const v = isIP(s);
  return v !== 0 && !NON_PUBLIC.check(s, v === 4 ? 'ipv4' : 'ipv6');
}

const defaultResolve = async (hostname) => (await dnsLookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

// assertPublicHost(hostname, resolveHost) -> the addresses; throws a permanent PushError when any is not public.
export async function assertPublicHost(hostname, resolveHost = defaultResolve) {
  const host = String(hostname).replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [host] : await resolveHost(host);
  if (!addrs?.length || addrs.some((a) => !isPublicAddress(a))) {
    const e = new PushError(403, `endpoint host ${host} does not resolve to public addresses only`);
    e.permanent = true;
    throw e;
  }
  return addrs;
}

// deriveKeys(...) exposes the RFC 8291 §3.3-§3.4 intermediate values (tests compare them with the
// RFC 8291 appendix A vector).
export function deriveKeys({ uaPublic, authSecret, asPrivate, salt }) {
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(asPrivate);
  const asPublic = ecdh.getPublicKey(); // 65 bytes, uncompressed
  const ecdhSecret = ecdh.computeSecret(uaPublic);
  // HKDF-Extract(auth_secret, ecdh_secret), then HKDF-Expand(PRK_key, key_info, 32)
  const prkKey = hmac(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'latin1'), uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));
  // RFC 8188: PRK = HKDF-Extract(salt, IKM); CEK and NONCE from their info strings
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'latin1')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'latin1')).subarray(0, 12);
  return { asPublic, ecdhSecret, prkKey, keyInfo, ikm, prk, cek, nonce };
}

// encryptPayload(plaintext, { p256dh, auth }, { asPrivate?, salt?, rs = 4096, padding = 0 }) -> Buffer
// The body is header (salt 16 | rs uint32 | idlen 1 | keyid = as_public 65) followed by one record:
// AES-128-GCM(plaintext | 0x02 | zero padding) with its 16-byte tag.
export function encryptPayload(plaintext, { p256dh, auth }, { asPrivate = null, salt = null, rs = 4096, padding = 0 } = {}) {
  const uaPublic = bytes(p256dh);
  const authSecret = bytes(auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('push: p256dh must be an uncompressed P-256 public key (65 bytes)');
  if (authSecret.length !== 16) throw new Error('push: auth must be 16 bytes');
  let priv = asPrivate ? bytes(asPrivate) : null;
  if (!priv) {
    const e = createECDH('prime256v1');
    e.generateKeys();
    priv = e.getPrivateKey();
  }
  const s = salt ? bytes(salt) : randomBytes(16);
  if (s.length !== 16) throw new Error('push: salt must be 16 bytes');
  const k = deriveKeys({ uaPublic, authSecret, asPrivate: priv, salt: s });
  const data = Buffer.concat([Buffer.from(plaintext), Buffer.from([2]), Buffer.alloc(padding)]);
  if (data.length + 16 > rs) throw new Error(`push: payload too large for one ${rs}-byte record`);
  const cipher = createCipheriv('aes-128-gcm', k.cek, k.nonce);
  const ct = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  s.copy(header, 0);
  header.writeUInt32BE(rs, 16);
  header[20] = k.asPublic.length;
  return Buffer.concat([header, k.asPublic, ct]);
}

// ------------------------------------------------------------------ VAPID (RFC 8292)
// generateVapidKeys() -> { publicKey, privateKey } base64url (65-byte point, 32-byte scalar)
export function generateVapidKeys() {
  const e = createECDH('prime256v1');
  e.generateKeys();
  return { publicKey: b64u.enc(e.getPublicKey()), privateKey: b64u.enc(e.getPrivateKey()) };
}

// vapidKeyObjects(privateKeyB64u) -> { publicKey (base64url), key: KeyObject, publicKeyObject }
export function vapidKeyObjects(privateKey) {
  const d = bytes(privateKey);
  if (d.length !== 32) throw new Error('push: VAPID private key must be 32 bytes (base64url)');
  const e = createECDH('prime256v1');
  e.setPrivateKey(d);
  const pub = e.getPublicKey();
  const jwk = { kty: 'EC', crv: 'P-256', x: b64u.enc(pub.subarray(1, 33)), y: b64u.enc(pub.subarray(33, 65)) };
  return {
    publicKey: b64u.enc(pub),
    key: createPrivateKey({ key: { ...jwk, d: b64u.enc(d) }, format: 'jwk' }),
    publicKeyObject: createPublicKey({ key: jwk, format: 'jwk' }),
  };
}

// vapidHeaders({ endpoint, subject, privateKey, nowSec, ttlSec = 12 h }) -> { authorization, jwt, claims }
// The JWT's aud is the push service origin, exp at most 24 hours ahead (RFC 8292 §2).
export function vapidHeaders({ endpoint, subject, privateKey, nowSec = Math.floor(Date.now() / 1000), ttlSec = 12 * 3600 }) {
  if (!/^(mailto:|https:)/.test(String(subject))) throw new Error('push: VAPID subject must be a mailto: or https: URI');
  const keys = vapidKeyObjects(privateKey);
  const claims = { aud: new URL(endpoint).origin, exp: nowSec + Math.min(ttlSec, 24 * 3600), sub: subject };
  const input = `${b64u.enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))}.${b64u.enc(JSON.stringify(claims))}`;
  const sig = sign('sha256', Buffer.from(input), { key: keys.key, dsaEncoding: 'ieee-p1363' });
  const jwt = `${input}.${b64u.enc(sig)}`;
  return { authorization: `vapid t=${jwt}, k=${keys.publicKey}`, jwt, claims, publicKey: keys.publicKey };
}

// verifyVapidJwt(jwt, publicKeyB64u) -> claims | null (for tests and diagnostics)
export function verifyVapidJwt(jwt, publicKey) {
  const [h, p, s] = String(jwt).split('.');
  if (!h || !p || !s) return null;
  const pub = bytes(publicKey);
  const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u.enc(pub.subarray(1, 33)), y: b64u.enc(pub.subarray(33, 65)) }, format: 'jwk' });
  const ok = verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, b64u.dec(s));
  return ok ? JSON.parse(b64u.dec(p).toString('utf8')) : null;
}

// ------------------------------------------------------------------ transports
export function createWebPush({ vapid, fetch = globalThis.fetch, clock = () => new Date(), timeoutMs = 10_000, resolveHost = defaultResolve } = {}) {
  if (!vapid?.privateKey || !vapid?.subject) throw new Error('push: VAPID_PRIVATE_KEY and VAPID_SUBJECT are required');
  const { publicKey } = vapidKeyObjects(vapid.privateKey);
  if (vapid.publicKey && vapid.publicKey !== publicKey) throw new Error('push: VAPID_PUBLIC_KEY does not belong to VAPID_PRIVATE_KEY');
  return {
    kind: 'webpush',
    publicKey,
    async send(subscription, payload, { ttl = 3600, urgency = 'normal', topic = null } = {}) {
      const body = encryptPayload(typeof payload === 'string' ? payload : JSON.stringify(payload), subscription.keys);
      const { authorization } = vapidHeaders({ endpoint: subscription.endpoint, subject: vapid.subject, privateKey: vapid.privateKey, nowSec: Math.floor(clock().getTime() / 1000) });
      const headers = {
        authorization,
        ttl: String(ttl),
        urgency,
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
      };
      if (topic) headers.topic = topic;
      await assertPublicHost(new URL(subscription.endpoint).hostname, resolveHost);
      const signal = AbortSignal.timeout(timeoutMs);
      const res = await fetch(subscription.endpoint, { method: 'POST', headers, body, signal, redirect: 'error' });
      const text = await res.text().catch(() => '');
      if (res.status === 404 || res.status === 410) return { ok: false, status: res.status, gone: true, id: null };
      if (!res.ok) throw new PushError(res.status, text);
      return { ok: true, status: res.status, gone: false, id: res.headers.get('location') };
    },
  };
}

// Console twin: records every push (payload in clear) and sends nothing.
export function createConsolePush({ log = console, clock = () => new Date(), publicKey = null, max = 2000 } = {}) {
  const outbox = [];
  let n = 0;
  const say = (msg) => (log.info ? log.info(msg) : log.log?.(msg));
  return {
    kind: 'console',
    publicKey,
    outbox,
    async send(subscription, payload, { ttl = 3600 } = {}) {
      const id = `PUconsole${String(++n).padStart(6, '0')}`;
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
      outbox.push({ id, endpoint: subscription.endpoint, payload: data, ttl, at: clock().toISOString() });
      if (outbox.length > max) outbox.splice(0, outbox.length - max);
      say(`[push:console] ${id} ${new URL(subscription.endpoint).host}: ${data.title}`);
      return { ok: true, status: 201, gone: false, id };
    },
  };
}
