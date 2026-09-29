import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { merkleRoot } from '../../core/ledger.js';
import { timeStampReq, parseTimeStampResp, rfc3161Submit, otsSubmit, otsFile, OTS_HEADER_MAGIC } from '../../server/anchor.js';
import { pipelineApp, sealDay } from './pipeline.js';

const FIX = join(import.meta.dirname, 'fixtures');
// A real RFC 3161 exchange produced offline with `openssl ts` and a fictional test TSA (no network):
// the query for this digest with nonce 0xdfefb99877b7eb7c, and the TSA's granted reply.
const ROOT = 'ea985e9f7ec582fff12604d2dfa4b7bfed5488bf24022d56c2a9b3b4132fdb5a';
const NONCE = Buffer.from('dfefb99877b7eb7c', 'hex');
const QUERY = readFileSync(join(FIX, 'rfc3161-query.tsq'));
const REPLY = readFileSync(join(FIX, 'rfc3161-reply.tsr'));

test('RFC 3161: the DER TimeStampReq matches what openssl ts -query produces', () => {
  assert.equal(
    timeStampReq(ROOT, { nonce: null, certReq: true }).toString('hex'),
    '30390201013031300d060960864801650304020105000420' + ROOT + '0101ff',
    'openssl ts -query -digest <root> -sha256 -cert -no_nonce',
  );
  assert.equal(timeStampReq(ROOT, { nonce: null, certReq: false }).toString('hex'), '30360201013031300d060960864801650304020105000420' + ROOT);
  assert.deepEqual(timeStampReq(ROOT, { nonce: NONCE, certReq: true }), QUERY, 'with a nonce whose high bit is set (leading zero byte)');
  assert.throws(() => timeStampReq('abcd'), /SHA-256/);
});

test('RFC 3161: the TSA reply is parsed (status, imprint, genTime, nonce) and checked against the request', async () => {
  const p = parseTimeStampResp(REPLY);
  assert.equal(p.status, 'granted');
  assert.deepEqual(p.tst, { policy: '1.2.3.4.1', imprintAlg: '2.16.840.1.101.3.4.2.1', imprint: ROOT, serial: '2', genTime: '2026-09-29T00:33:31Z', nonce: 'dfefb99877b7eb7c' });
  const seen = [];
  const fetch = async (url, init) => {
    seen.push({ url, init });
    return new Response(REPLY, { status: 200, headers: { 'content-type': 'application/timestamp-reply' } });
  };
  const ok = await rfc3161Submit(ROOT, { url: 'https://tsa.example.test/tsr', fetch, nonce: NONCE });
  assert.deepEqual([ok.ok, ok.genTime, ok.error], [true, '2026-09-29T00:33:31Z', null]);
  assert.equal(seen[0].init.headers['content-type'], 'application/timestamp-query');
  assert.deepEqual(Buffer.from(seen[0].init.body), QUERY);
  const other = await rfc3161Submit('00'.repeat(32), { url: 'https://tsa.example.test/tsr', fetch, nonce: NONCE });
  assert.equal(other.error, 'TSA token is for a different digest');
  const wrongNonce = await rfc3161Submit(ROOT, { url: 'https://tsa.example.test/tsr', fetch, nonce: Buffer.from('0102030405060708', 'hex') });
  assert.equal(wrongNonce.error, 'TSA nonce mismatch');
  assert.throws(() => parseTimeStampResp(Buffer.from('3003020102', 'hex')), /PKIStatusInfo/, 'a bare INTEGER is not a status');
  assert.throws(() => parseTimeStampResp(Buffer.from('3005300302', 'hex')), /DER/, 'truncated');
  const rejection = Buffer.from('30053003020102', 'hex');
  assert.deepEqual(parseTimeStampResp(rejection), { status: 'rejection', granted: false, tst: null });
  const down = await rfc3161Submit(ROOT, { url: 'https://tsa.example.test/tsr', fetch: async () => new Response('busy', { status: 503 }), nonce: NONCE });
  assert.deepEqual([down.ok, down.error], [false, 'HTTP 503']);
});

test('OpenTimestamps: the root is POSTed to each calendar; answers become one detached .ots file', async () => {
  const seen = [];
  const pending = (tag) => Buffer.concat([Buffer.from([0xf0, 0x10]), Buffer.alloc(16, tag), Buffer.from([0x08, 0x00, 0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e])]);
  const fetch = async (url, init) => {
    seen.push({ url, init });
    if (url.startsWith('https://b.')) return new Response('down', { status: 500 });
    return new Response(pending(url.startsWith('https://a.') ? 1 : 2), { status: 200 });
  };
  const answers = await otsSubmit(ROOT, { calendars: ['https://a.cal.test', 'https://b.cal.test', 'https://c.cal.test'], fetch });
  assert.deepEqual(answers.map((a) => [a.url, a.ok, a.status]), [['https://a.cal.test', true, 200], ['https://b.cal.test', false, 500], ['https://c.cal.test', true, 200]]);
  assert.equal(seen[0].url, 'https://a.cal.test/digest');
  assert.equal(seen[0].init.headers.accept, 'application/vnd.opentimestamps.v1');
  assert.equal(Buffer.from(seen[0].init.body).toString('hex'), ROOT, 'the 32-byte root is the digest');
  const file = otsFile(ROOT, answers.map((a) => a.proof));
  assert.deepEqual(file.subarray(0, OTS_HEADER_MAGIC.length), OTS_HEADER_MAGIC);
  assert.deepEqual([...file.subarray(31, 33)], [0x01, 0x08], 'major version 1, file hash op SHA-256');
  assert.equal(file.subarray(33, 65).toString('hex'), ROOT);
  assert.equal(file[65], 0xff, 'two calendar branches: the first is a fork');
  assert.deepEqual(file.subarray(66, 66 + 28), pending(1));
  assert.deepEqual(file.subarray(66 + 28), pending(2));
  assert.equal(otsFile(ROOT, [null, null]), null);
});

test('the daily anchor: Merkle root of the day\'s entries into ledger_anchors, submitted with fixture answers', async () => {
  const fetch = async (url) => {
    if (url === 'https://tsa.example.test/tsr') return new Response(REPLY, { status: 200 });
    return new Response(Buffer.from([0xf0, 0x01, 0xaa, 0x00, 0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e]), { status: 200 });
  };
  const t = await pipelineApp({ fetch, config: { anchor: { otsCalendars: ['https://a.cal.test'], rfc3161Url: 'https://tsa.example.test/tsr' } } });
  try {
    await sealDay(t);
    t.local('14:00');
    await t.pub.publish(t.input.date);
    t.setNow('2025-11-04T23:59:00Z');
    const a = await t.pub.anchor(t.input.date);
    const hashes = t.db.all('SELECT hash FROM ledger_entries WHERE issue_date = ? ORDER BY seq', t.input.date).map((r) => r.hash);
    assert.equal(a.merkleRoot, await merkleRoot(hashes));
    assert.equal(a.ots.status, 'pending');
    assert.ok(a.ots.ots.length > 0);
    assert.equal(a.rfc3161.status, 'failed', 'the fixture token is for another digest, so it is refused, not stored as proof');
    const row = t.db.get('SELECT * FROM ledger_anchors WHERE date = ?', t.input.date);
    assert.equal(row.merkle_root, a.merkleRoot);
    assert.equal(row.row_count, hashes.length);
    assert.ok(t.db.get("SELECT 1 AS x FROM ops_alerts WHERE kind = 'anchor_failed'"), 'a failed anchor raises an alert');
    const again = await t.pub.anchor(t.input.date);
    assert.equal(again.created, false, 'idempotent while the day is unchanged');
    assert.equal((await t.pub.anchor('2025-11-08')).reason, 'no_entries');
  } finally {
    await t.close();
  }
});
