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
  // percentile ordinals are truncated ranks: 0.9486 may be written as the 94th (or, rounded, the 95th)
  assert.equal(validateNumbers('Fundamental momentum ranks it at the 94th percentile.', [0.9486]).ok, true);
  assert.equal(validateNumbers('Pri družini B je delnica na 94. percentilu.', [0.9486], { locale: 'sl' }).ok, true);
  assert.equal(validateNumbers('It ranks at the 93rd percentile.', [0.9486]).ok, false);
  assert.equal(validateNumbers('Margins rose 94%.', [0.9486]).ok, false, 'only ordinals truncate; a percentage rounds');
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
  // truncated, never rounded across the 0.95 rule line: a displayed 95 always qualifies
  assert.equal(f.fmtPctRank(0.9486), '94');
  assert.equal(f.fmtPctRank(0.9499), '94');
  assert.equal(f.fmtPctRank(0.95), '95');
  assert.equal(f.fmtPctRank(0.29), '29', 'decimal-grid values are not pushed down by float error');
  assert.equal(f.fmtPctRank(Math.fround(0.95)), '94', 'a float32 score just under the line stays under it');
  assert.equal(f.fmtPctRank(0.9996), '99');
  assert.equal(f.fmtPctRank(1), '99');
  assert.equal(f.fmtPctRank(0), '0');
  assert.equal(f.fmtPctRank(NaN), '–');
  assert.equal(f.pctRank(0.6247), 62);
  assert.equal(f.arrow(-0.1), '↓');
  assert.equal(f.signClass(0.1), 'gain');
  assert.equal(f.signClass(0.000061), 'flat', 'prints as 0.0%');
  assert.equal(f.arrow(0.000061), '→');
  assert.equal(f.arrow(-0.0006), '↓', 'prints as -0.1%');
  assert.equal(f.signClass(0.00004, { digits: 2 }), 'flat');
  assert.equal(f.signClass(0.00006, { digits: 2 }), 'gain');
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

test('allowed literals are removed only where they stand on their own', () => {
  // a unit string such as "t" (a t-statistic) must not eat the "t" of "95th" and hide the ordinal
  assert.deepEqual(extractNumbers('trend at the 95th percentile', { allowStrings: ['t'] }).map((t) => [t.value, t.unit]), [[95, 'ord']]);
  assert.equal(validateNumbers('Trend at the 95th percentile.', [0.9588], { allowStrings: ['t', 'z'] }).ok, true);
  // a literal number never hides part of a longer one
  assert.deepEqual(validateNumbers('Filed in 2012.', [], { allowStrings: ['12'] }).unknown, ['2012']);
  // literals next to punctuation are still removed
  assert.equal(validateNumbers('#0417 (3/4 models), exit 27 Oct 2026.', [], { allowStrings: ['0417', '3/4', '27 Oct 2026'] }).ok, true);
  assert.equal(validateNumbers('Na »Rezidualni donos 12-1« in čez.', [], { locale: 'sl', allowStrings: ['»Rezidualni donos 12-1«'] }).ok, true);
});
