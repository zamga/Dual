import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createDecipheriv, createHmac } from 'node:crypto';
import { encryptPayload, deriveKeys, b64u, vapidHeaders, verifyVapidJwt, generateVapidKeys, createWebPush, vapidKeyObjects } from '../../server/vendors/push.js';
import { createPostmarkEmail, EmailError } from '../../server/vendors/email.js';

// RFC 8291 appendix A: every intermediate value and the final message.
const V = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  ecdhSecret: 'kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs',
  prkKey: 'Snr3JMxaHVDXHWJn5wdC52WjpCtd2EIEGBykDcZW32k',
  ikm: 'S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg',
  prk: '09_eUZGrsvxChDCGRCdkLiDXrReGOEVeSCdCcPBSJSc',
  cek: 'oIhVW04MRdy2XN9CiKLxTg',
  nonce: '4h_95klXJ5E_qnoN',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

test('aes128gcm (RFC 8291 / RFC 8188): the RFC 8291 appendix A test vector, byte for byte', () => {
  const k = deriveKeys({ uaPublic: b64u.dec(V.uaPublic), authSecret: b64u.dec(V.auth), asPrivate: b64u.dec(V.asPrivate), salt: b64u.dec(V.salt) });
  assert.equal(b64u.enc(k.asPublic), V.asPublic);
  for (const x of ['ecdhSecret', 'prkKey', 'ikm', 'prk', 'cek', 'nonce']) assert.equal(b64u.enc(k[x]), V[x], x);
  const body = encryptPayload(V.plaintext, { p256dh: V.uaPublic, auth: V.auth }, { asPrivate: V.asPrivate, salt: V.salt });
  assert.equal(b64u.enc(body), V.body);
  assert.equal(body.readUInt32BE(16), 4096, 'rs');
  assert.equal(body[20], 65, 'idlen');
});

// The user agent's side (RFC 8291 §3.4 from the receiver) proves a fresh encryption round-trips.
test('aes128gcm: a fresh message (random key and salt) decrypts on the receiver side', () => {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = Buffer.alloc(16, 7);
  const payload = JSON.stringify({ title: 'Quorum #0011 BUY KRST', body: 'Not personal advice.', simulated: true });
  const body = encryptPayload(payload, { p256dh: b64u.enc(ua.getPublicKey()), auth: b64u.enc(auth) });
  const salt = body.subarray(0, 16);
  const asPublic = body.subarray(21, 86);
  // receiver: ecdh(ua_private, as_public) and the same key schedule
  const h = (key, data) => createHmac('sha256', key).update(data).digest();
  const secret = ua.computeSecret(asPublic);
  const prkKey = h(auth, secret);
  const ikm = h(prkKey, Buffer.concat([Buffer.from('WebPush: info\0', 'latin1'), ua.getPublicKey(), asPublic, Buffer.from([1])]));
  const prk = h(salt, ikm);
  const cek = h(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'latin1')).subarray(0, 16);
  const nonce = h(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'latin1')).subarray(0, 12);
  const ct = body.subarray(86);
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2, 'last-record delimiter');
  assert.equal(plain.subarray(0, -1).toString('utf8'), payload);
});

test('VAPID (RFC 8292): ES256 JWT with aud = push origin, exp within 24 h, sub; header "vapid t=..., k=..."', () => {
  const keys = generateVapidKeys();
  assert.equal(b64u.dec(keys.publicKey).length, 65);
  assert.equal(vapidKeyObjects(keys.privateKey).publicKey, keys.publicKey, 'public key derived from the private one');
  const now = 1_762_261_200;
  const h = vapidHeaders({ endpoint: 'https://fcm.example.net/wp/abc?x=1', subject: 'mailto:ops@qrm.si', privateKey: keys.privateKey, nowSec: now });
  assert.match(h.authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
  const [hdr] = h.jwt.split('.');
  assert.deepEqual(JSON.parse(b64u.dec(hdr).toString()), { typ: 'JWT', alg: 'ES256' });
  const claims = verifyVapidJwt(h.jwt, keys.publicKey);
  assert.deepEqual(claims, { aud: 'https://fcm.example.net', exp: now + 12 * 3600, sub: 'mailto:ops@qrm.si' });
  assert.equal(b64u.dec(h.jwt.split('.')[2]).length, 64, 'raw r||s signature (JOSE), not DER');
  assert.equal(verifyVapidJwt(h.jwt, generateVapidKeys().publicKey), null, 'another key does not verify');
  const long = vapidHeaders({ endpoint: 'https://x.example.net/', subject: 'mailto:a@b.si', privateKey: keys.privateKey, nowSec: now, ttlSec: 7 * 86400 });
  assert.equal(long.claims.exp, now + 24 * 3600, 'never more than 24 hours');
  assert.throws(() => vapidHeaders({ endpoint: 'https://x.example.net/', subject: 'ops@qrm.si', privateKey: keys.privateKey }), /subject/);
});

test('web push transport: POST with TTL, aes128gcm and VAPID; 201 ok, 404/410 gone, 5xx throws', async () => {
  const keys = generateVapidKeys();
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const sub = { endpoint: 'https://push.example.net/wpush/abc', keys: { p256dh: b64u.enc(ua.getPublicKey()), auth: b64u.enc(Buffer.alloc(16, 1)) } };
  const seen = [];
  let status = 201;
  const fetch = async (url, init) => {
    seen.push({ url, init });
    return new Response(status === 201 ? '' : 'nope', { status, headers: status === 201 ? { location: 'https://push.example.net/m/1' } : {} });
  };
  const push = createWebPush({ vapid: { publicKey: keys.publicKey, privateKey: keys.privateKey, subject: 'mailto:ops@qrm.si' }, fetch, clock: () => new Date('2025-11-04T13:00:00Z') });
  const r = await push.send(sub, { title: 'Quorum #0011 BUY KRST' }, { ttl: 3600 });
  assert.deepEqual(r, { ok: true, status: 201, gone: false, id: 'https://push.example.net/m/1' });
  const h = seen[0].init.headers;
  assert.deepEqual([h.ttl, h['content-encoding'], h['content-type'], h.urgency], ['3600', 'aes128gcm', 'application/octet-stream', 'normal']);
  const jwt = /t=([^,]+)/.exec(h.authorization)[1];
  assert.equal(verifyVapidJwt(jwt, keys.publicKey).aud, 'https://push.example.net');
  assert.equal(seen[0].init.body.readUInt32BE(16), 4096);
  status = 410;
  assert.deepEqual(await push.send(sub, { title: 'x' }), { ok: false, status: 410, gone: true, id: null });
  status = 503;
  await assert.rejects(push.send(sub, { title: 'x' }), (e) => e.status === 503);
  assert.throws(() => createWebPush({ vapid: { publicKey: generateVapidKeys().publicKey, privateKey: keys.privateKey, subject: 'mailto:a@b.si' }, fetch }), /does not belong/);
});

test('email transport: Postmark-style REST through an injectable fetch', async () => {
  const seen = [];
  let answer = { status: 200, body: { To: 'a@example.si', SubmittedAt: 'x', MessageID: 'pm-1', ErrorCode: 0, Message: 'OK' } };
  const fetch = async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'content-type': 'application/json' } });
  };
  const email = createPostmarkEmail({ serverToken: 'pm-token', from: 'Quorum <hello@qrm.si>', fetch, baseUrl: 'https://api.postmark.test' });
  assert.deepEqual(await email.send({ to: 'a@example.si', subject: 'Hi', text: 'Body', tag: 'BUY' }), { id: 'pm-1' });
  assert.equal(seen[0].url, 'https://api.postmark.test/email');
  assert.equal(seen[0].init.headers['x-postmark-server-token'], 'pm-token');
  assert.deepEqual(JSON.parse(seen[0].init.body), { From: 'Quorum <hello@qrm.si>', To: 'a@example.si', Subject: 'Hi', TextBody: 'Body', Tag: 'BUY', MessageStream: 'outbound', TrackOpens: false, TrackLinks: 'None' });
  answer = { status: 422, body: { ErrorCode: 300, Message: 'Invalid email request' } };
  await assert.rejects(email.send({ to: 'bad', subject: 's', text: 't' }), (e) => e instanceof EmailError && e.status === 422 && e.code === 300);
  assert.throws(() => createPostmarkEmail({ serverToken: '', from: 'x' }), /POSTMARK_SERVER_TOKEN/);
});
