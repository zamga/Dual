import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRouter,
  parseCookies,
  serializeCookie,
  signValue,
  verifySignedValue,
  createRateLimiter,
  clientIp,
  parseBody,
  CSP,
} from '../../server/http.js';
import { makeApp, signIn } from './helpers.js';

test('router matches params, reports 405 for a known path with the wrong method', () => {
  const r = createRouter();
  r.add('GET', '/u/:token', () => 'get');
  r.add('POST', '/api/consent', () => 'post');
  assert.deepEqual(r.match('GET', '/u/7Kq2xZ').params, { token: '7Kq2xZ' });
  assert.equal(r.match('GET', '/u/7Kq2xZ/extra'), null);
  assert.equal(r.match('HEAD', '/u/abc123').route.method, 'GET');
  assert.deepEqual(r.match('GET', '/api/consent'), { methodNotAllowed: true });
  assert.equal(r.match('GET', '/nope'), null);
});

test('cookies parse and serialize with the security attributes', () => {
  assert.deepEqual(parseCookies('a=1; b=hello%20world; a=2'), { a: '1', b: 'hello world' });
  const c = serializeCookie('qrm_session', 'v', { maxAge: 60, secure: true });
  assert.match(c, /HttpOnly/);
  assert.match(c, /Secure/);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /Max-Age=60/);
});

test('signed session values: valid, tampered, wrong secret, expired', () => {
  const tok = signValue({ sid: 's1', uid: 'u1', exp: 2_000 }, 'secret');
  assert.deepEqual(verifySignedValue(tok, 'secret', 1_000), { sid: 's1', uid: 'u1', exp: 2_000 });
  const [v, body, mac] = tok.split('.');
  const forged = Buffer.from(JSON.stringify({ sid: 's1', uid: 'admin', exp: 2_000 })).toString('base64url');
  assert.equal(verifySignedValue(`${v}.${forged}.${mac}`, 'secret', 1_000), null);
  assert.equal(verifySignedValue(`${v}.${body}.${mac.slice(0, -2)}xx`, 'secret', 1_000), null);
  assert.equal(verifySignedValue(tok, 'other', 1_000), null);
  assert.equal(verifySignedValue(tok, 'secret', 2_000), null);
  assert.equal(verifySignedValue('garbage', 'secret', 1_000), null);
});

test('rate limiter: token bucket refills over the window', () => {
  let t = 0;
  const rl = createRateLimiter({ clock: () => new Date(t) });
  const lim = { capacity: 3, windowMs: 3000 };
  assert.ok(rl.take('b', 'ip', lim).ok);
  assert.ok(rl.take('b', 'ip', lim).ok);
  assert.ok(rl.take('b', 'ip', lim).ok);
  const no = rl.take('b', 'ip', lim);
  assert.equal(no.ok, false);
  assert.equal(no.retryAfterSec, 1);
  assert.ok(rl.take('b', 'other-ip', lim).ok, 'buckets are per key');
  t = 1000;
  assert.ok(rl.take('b', 'ip', lim).ok, 'one token back after a third of the window');
  assert.equal(rl.take('b', 'ip', lim).ok, false);
});

test('client IP honours X-Forwarded-For only for trusted proxy hops', () => {
  const req = { socket: { remoteAddress: '::ffff:10.0.0.1' }, headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' } };
  assert.equal(clientIp(req, 0), '10.0.0.1');
  assert.equal(clientIp(req, 1), '203.0.113.9');
  assert.equal(clientIp(req, 2), '6.6.6.6');
});

test('parseBody enforces the content type', () => {
  const json = { headers: { 'content-type': 'application/json; charset=utf-8' } };
  assert.deepEqual(parseBody(json, Buffer.from('{"a":1}'), ['json']), { a: 1 });
  assert.throws(() => parseBody(json, Buffer.from('{bad'), ['json']), (e) => e.status === 400 && e.code === 'invalid_json');
  const text = { headers: { 'content-type': 'text/plain' } };
  assert.throws(() => parseBody(text, Buffer.from('{}'), ['json']), (e) => e.status === 415);
  const none = { headers: {} };
  assert.throws(() => parseBody(none, Buffer.from('{}'), ['json']), (e) => e.status === 415);
  const form = { headers: { 'content-type': 'application/x-www-form-urlencoded' } };
  assert.deepEqual(parseBody(form, Buffer.from('a=1&b=x'), ['form']), { a: '1', b: 'x' });
  assert.throws(() => parseBody(form, Buffer.from('a=1'), ['json']), (e) => e.status === 415);
});

test('server: security headers, CSP with nothing from third parties, HSTS on https', async () => {
  const t = await makeApp();
  try {
    const r = await t.client().get('/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    const csp = r.headers.get('content-security-policy');
    assert.equal(csp, CSP);
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
    assert.match(csp, /style-src 'self' 'unsafe-inline'(;|$)/);
    assert.match(csp, /font-src 'self'(;|$)/);
    assert.doesNotMatch(csp, /https:|googleapis|gstatic/, 'no font service: fonts come from this origin');
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(r.headers.get('referrer-policy'), 'same-origin');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.match(r.headers.get('strict-transport-security'), /max-age=\d+/);
    const page = await t.client().get('/');
    assert.equal(page.headers.get('content-security-policy'), CSP);
  } finally {
    await t.close();
  }
});

test('server: POST content-type checks, body limit, bad JSON, 401, 404, 405', async () => {
  const t = await makeApp();
  try {
    const c = t.client();
    const plain = await c.request('POST', '/api/auth/magic', { body: '{"email":"a@b.si"}', headers: { 'content-type': 'text/plain' } });
    assert.equal(plain.status, 415);
    assert.equal(plain.body.error, 'unsupported_media_type');
    const form = await c.request('POST', '/api/auth/magic', { form: { email: 'a@b.si' } });
    assert.equal(form.status, 415);
    const bad = await c.request('POST', '/api/auth/magic', { body: '{nope', headers: { 'content-type': 'application/json' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, 'invalid_json');
    const big = await c.post('/api/auth/magic', { email: 'a@b.si', pad: 'x'.repeat(20_000) });
    assert.equal(big.status, 413);
    const unauth = await c.post('/api/phone/start', { e164: '+38641234545' });
    assert.equal(unauth.status, 401);
    assert.equal((await c.get('/api/nope')).status, 404);
    assert.equal((await c.get('/api/consent')).status, 405);
  } finally {
    await t.close();
  }
});

test('server: cross-site POSTs are refused (Origin / Sec-Fetch-Site)', async () => {
  const t = await makeApp();
  try {
    const c = t.client();
    await signIn(t, c, 'origin@example.si');
    const evil = await c.post('/api/join/geo', { declaredCountry: 'SI' }, { headers: { origin: 'https://evil.example' } });
    assert.equal(evil.status, 403);
    assert.equal(evil.body.error, 'bad_origin');
    const site = await c.post('/api/join/geo', { declaredCountry: 'SI' }, { headers: { 'sec-fetch-site': 'cross-site' } });
    assert.equal(site.status, 403);
    const same = await c.post('/api/join/geo', { declaredCountry: 'SI' }, { headers: { origin: 'https://quorum.test' } });
    assert.equal(same.status, 200);
  } finally {
    await t.close();
  }
});

test('server: per-IP rate limits answer 429 with Retry-After', async () => {
  const t = await makeApp({ config: { rateLimits: { authMagic: { capacity: 2, windowMs: 60_000 } } } });
  try {
    const c = t.client();
    assert.equal((await c.post('/api/auth/magic', { email: 'r1@example.si' })).status, 202);
    assert.equal((await c.post('/api/auth/magic', { email: 'r2@example.si' })).status, 202);
    const third = await c.post('/api/auth/magic', { email: 'r3@example.si' });
    assert.equal(third.status, 429);
    assert.equal(third.body.error, 'rate_limited');
    assert.ok(Number(third.headers.get('retry-after')) >= 1);
    t.advance(60_000);
    assert.equal((await c.post('/api/auth/magic', { email: 'r4@example.si' })).status, 202, 'bucket refills');
  } finally {
    await t.close();
  }
});

test('server: per-email magic-link limit and no account enumeration', async () => {
  const t = await makeApp();
  try {
    const c = t.client();
    for (let i = 0; i < 3; i++) assert.equal((await c.post('/api/auth/magic', { email: 'same@example.si' })).status, 202);
    const r = await c.post('/api/auth/magic', { email: 'same@example.si' });
    assert.equal(r.status, 429);
    assert.equal((await c.post('/api/auth/magic', { email: 'not-an-email' })).status, 400);
  } finally {
    await t.close();
  }
});
