import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize } from '../../core/canonical-json.js';
import { sha256Hex, hashCanonical, randomToken, shortHash } from '../../core/hash.js';
import { mulberry32 } from '../../core/random.js';

test('JCS sorts keys by UTF-16 code units (RFC 8785 §3.2.3 example)', () => {
  const obj = { '€': 'Euro Sign', '\r': 'Carriage Return', 'דּ': 'Hebrew Letter Dalet With Dagesh', '1': 'One', '😀': 'Emoji: Grinning Face', '\u0080': 'Control', 'ö': 'Latin Small Letter O With Diaeresis' };
  const keys = JSON.parse(canonicalize(obj));
  assert.deepEqual(Object.keys(JSON.parse(canonicalize(obj))), Object.keys(keys));
  const order = canonicalize(obj).match(/"([^"]|\\.)*":/g).map((k) => JSON.parse(k.slice(0, -1)));
  assert.deepEqual(order, ['\r', '1', '\u0080', 'ö', '€', '😀', 'דּ']);
});

test('JCS numbers, nesting and whitespace', () => {
  assert.equal(canonicalize({ b: [1, 2.5, -0, 1e21, 1e-7], a: { d: null, c: true } }), '{"a":{"c":true,"d":null},"b":[1,2.5,0,1e+21,1e-7]}');
  assert.equal(canonicalize('a"b\n'), '"a\\"b\\n"');
  assert.throws(() => canonicalize({ x: undefined }));
  assert.throws(() => canonicalize([NaN]));
  assert.throws(() => canonicalize(Infinity));
});

test('sha256 known vectors', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(await hashCanonical({ b: 1, a: 2 }), await sha256Hex('{"a":2,"b":1}'));
  assert.equal(shortHash('abcdef0123456789'), 'abcdef01');
});

test('tokens are base62 and deterministic with an rng', () => {
  assert.match(randomToken(6), /^[0-9A-Za-z]{6}$/);
  assert.equal(randomToken(8, mulberry32(1)), randomToken(8, mulberry32(1)));
});
