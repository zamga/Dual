import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICTS, t, tp, formatters, pickL, setLocale } from '../../web/js/i18n.js';

test('EN and SL dictionaries have the same keys (plural forms aside)', () => {
  const strip = (k) => k.replace(/\.(one|two|few|other)$/, '');
  const en = new Set(Object.keys(DICTS.en).map(strip));
  const sl = new Set(Object.keys(DICTS.sl).map(strip));
  assert.deepEqual([...en].filter((k) => !sl.has(k)), []);
  assert.deepEqual([...sl].filter((k) => !en.has(k)), []);
});

test('no SL string is left in English by accident (spot check of shell strings)', () => {
  for (const k of ['skip', 'nav.q.how', 'nav.q.proof', 'nav.q.get', 'pill.next', 'footer.p1', 'notFound.title']) {
    assert.notEqual(DICTS.sl[k], DICTS.en[k], k);
  }
});

test('t() fills variables and falls back to EN, then to the key', () => {
  assert.equal(t('common.models', { n: 3 }, 'en'), '3/4 models');
  assert.equal(t('common.models', { n: 3 }, 'sl'), '3/4 modelov');
  assert.equal(t('no.such.key', null, 'sl'), 'no.such.key');
});

test('tp() uses Slovene plural categories', () => {
  assert.equal(tp('pill.quorum', 1, {}, 'sl'), 'Kvorum: 1 izbira');
  assert.equal(tp('pill.quorum', 2, {}, 'sl'), 'Kvorum: 2 izbiri');
  assert.equal(tp('pill.quorum', 3, {}, 'sl'), 'Kvorum: 3 izbire');
  assert.equal(tp('pill.quorum', 5, {}, 'sl'), 'Kvorum: 5 izbir');
  assert.equal(tp('pill.quorum', 2, {}, 'en'), 'Quorum: 2 picks');
});

test('formatters: true minus sign, sign + arrow + class, locale separators', () => {
  const en = formatters('en');
  const sl = formatters('sl');
  assert.equal(en.pct(-0.143), '−14.3%');
  assert.match(sl.pct(-0.143), /^−14,3\s%$/u);
  assert.equal(en.int(1384), '1,384');
  assert.equal(sl.int(1384), '1.384');
  assert.deepEqual(en.signed(0.034), { text: '+3.4%', arrow: '↑', cls: 'gain' });
  assert.deepEqual(en.signed(-0.02), { text: '−2.0%', arrow: '↓', cls: 'loss' });
  assert.equal(en.signed(0).cls, 'flat');
  // classified on the value as printed: 0.000061 prints 0.0%, so no arrow and no Gain colour
  assert.deepEqual(en.signed(0.000061), { text: '0.0%', arrow: '→', cls: 'flat' });
  assert.deepEqual(en.signed(-0.00049), { text: '0.0%', arrow: '→', cls: 'flat' });
  assert.equal(en.signed(0.0005).cls, 'gain');
  assert.equal(en.signed(0.000061, { digits: 3 }).cls, 'gain');
  assert.equal(sl.signed(0.000061).cls, 'flat');
  assert.equal(en.date('2026-09-28'), '28.09.26');
  assert.equal(sl.long('2026-09-28'), '28. sep. 2026');
});

test('pickL picks the locale and falls back to EN', () => {
  setLocale('sl');
  assert.equal(pickL({ en: 'a', sl: 'b' }), 'b');
  assert.equal(pickL({ en: 'a' }), 'a');
  setLocale('en');
});
