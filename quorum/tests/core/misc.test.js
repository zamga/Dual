import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extractNumbers, validateNumbers } from '../../core/numeric-validator.js';
import * as f from '../../core/format.js';
import { consentText, consentHash, maskPhone, CONSENT_TEXTS } from '../../core/consent-texts.js';
import { sha256Hex } from '../../core/hash.js';
import { mulberry32, hashSeed, seededShuffle } from '../../core/random.js';

test('numeric validator accepts sourced numbers and flags invented ones', () => {
  const src = [0.962, 0.018, -0.023, 1.8, 0.5];
  const text = 'Family A ranks it in the 96th percentile. Residual momentum is 1.8 standard deviations above its sector, and gross margin rose +1.8% while leverage fell 2.3%.';
  assert.deepEqual(validateNumbers(text, src), { ok: true, unknown: [] });
  const bad = validateNumbers('It should rise 12% by November.', src);
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.unknown, ['12']);
  assert.equal(validateNumbers('Exit on 2026-10-27, after 21 trading days (3/4 models).', src, { allowStrings: ['2026-10-27', '21 trading days', '3/4'] }).ok, true);
  assert.equal(validateNumbers('Marža je zrasla za 1,8 % in padla za 2,3 %.', src, { locale: 'sl' }).ok, true);
  assert.equal(validateNumbers('Growth of +2.3%.', src).ok, false, 'written sign must match the data');
  assert.deepEqual(extractNumbers('1,384 stocks').map((t) => t.value), [1384]);
});

test('formatting', () => {
  assert.equal(f.fmtPct(0.0184, { sign: true }), '+1.8%');
  assert.equal(f.fmtPct(-0.143), '-14.3%');
  assert.equal(f.fmtPctHtml(-0.143), '−14.3%');
  assert.equal(f.fmtPct(0.0184, { locale: 'sl' }), '1,8 %');
  assert.equal(f.fmtPct(-0.00001), '0.0%');
  assert.equal(f.fmtInt(1384), '1,384');
  assert.equal(f.fmtInt(1384, 'sl'), '1.384');
  assert.equal(f.fmtBps(11.4), '11 bps');
  assert.equal(f.fmtUsd(123.456), '$123.46');
  assert.equal(f.fmtEur(19), '€19');
  assert.equal(f.fmtEur(19, { locale: 'sl' }), '19 €');
  assert.equal(f.fmtPctRank(0.962), '96');
  assert.equal(f.arrow(-0.1), '↓');
  assert.equal(f.signClass(0.1), 'gain');
});

test('consent texts are versioned and hashed as templates', async () => {
  assert.match(consentText('sms', 'en', { phone: '+386 •• ••• 45' }), /by SMS to \+386 •• ••• 45\. Up to 16 messages a month/);
  assert.equal(await consentHash('sms', 'en'), await sha256Hex(CONSENT_TEXTS.sms.en));
  assert.notEqual(await consentHash('sms', 'en'), await consentHash('sms', 'sl'));
  assert.equal(maskPhone('+38641234545'), '+386 •• ••• 45');
  assert.equal(maskPhone('+4915112345678'), '+49 •• ••• 78');
  assert.equal(maskPhone('nonsense'), '');
});

test('random helpers are deterministic', () => {
  assert.equal(mulberry32(5)(), mulberry32(5)());
  assert.equal(hashSeed('a', 1), hashSeed('a', 1));
  assert.notEqual(hashSeed('a', 1), hashSeed('a', 2));
  assert.deepEqual(seededShuffle([1, 2, 3, 4, 5], mulberry32(2)).sort(), [1, 2, 3, 4, 5]);
});

test('core modules are isomorphic (no node: imports, no Buffer/process)', () => {
  const dir = new URL('../../core/', import.meta.url);
  for (const file of readdirSync(dir)) {
    const src = readFileSync(new URL(file, dir), 'utf8');
    assert.doesNotMatch(src, /from ['"]node:|require\(|\bBuffer\b|\bprocess\./, file);
  }
});

test('web/js/core is an exact copy of core/ (run npm run build:web)', () => {
  const dir = new URL('../../core/', import.meta.url);
  const web = new URL('../../web/js/core/', import.meta.url);
  for (const file of readdirSync(dir)) {
    assert.equal(readFileSync(new URL(file, web), 'utf8'), readFileSync(new URL(file, dir), 'utf8'), file);
  }
});
