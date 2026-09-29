import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, isGsm7Basic, GSM7_BASIC } from '../../core/gsm7.js';
import { renderSms, validateSms, worstCase, KINDS, LOCALES } from '../../core/sms-templates.js';

test('GSM-7 alphabet has 128 code points', () => {
  assert.equal(Array.from(GSM7_BASIC).length, 128);
});

test('septet counting and encodings', () => {
  assert.deepEqual(
    (({ encoding, septets, segments }) => ({ encoding, septets, segments }))(analyze('a'.repeat(160))),
    { encoding: 'GSM-7', septets: 160, segments: 1 },
  );
  assert.equal(analyze('a'.repeat(161)).segments, 2);
  assert.equal(analyze('a'.repeat(306)).segments, 2);
  assert.equal(analyze('a'.repeat(307)).segments, 3);
  assert.equal(analyze('€').septets, 2);
  const s = analyze('Ni osebni nasvet · č');
  assert.equal(s.encoding, 'UCS-2');
  assert.deepEqual(s.nonGsm.map((c) => c.char), ['·', 'č']);
  assert.equal(analyze('x'.repeat(71) + 'č').segments, 2);
  assert.equal(isGsm7Basic('QUORUM #0417'), true);
  assert.equal(isGsm7Basic('a–b'), false);
});

const BUY = { no: '0417', ticker: 'ACME', issueDate: '2026-09-28', exitDate: '2026-10-27', agreement: 3, token: '7Kq2xZ' };

test('templates reproduce the brief byte for byte', () => {
  assert.equal(renderSms('BUY', 'en', BUY), 'QUORUM #0417 BUY ACME 28.09.26 14:00 CEST. Entry: US open 28.09. Exit: US open 27.10. 3/4 models. Not personal advice: qrm.si/p/0417 Stop: qrm.si/u/7Kq2xZ');
  assert.equal(renderSms('BUY', 'sl', BUY), 'QUORUM #0417 NAKUP ACME 28.09.26 14:00 CEST. Vstop: odprtje ZDA 28.9. Izstop: 27.10. 3/4 modelov. Ni osebni nasvet: qrm.si/p/0417 Odjava: qrm.si/u/7Kq2xZ');
  assert.equal(renderSms('CLOSE', 'en', { no: '0417', ticker: 'ACME', issueDate: '2026-10-27', token: '7Kq2xZ' }), 'QUORUM #0417 CLOSE ACME at US open 27.10.26 (21-day rule set at entry). Result: qrm.si/p/0417 Not personal advice. Stop: qrm.si/u/7Kq2xZ');
  assert.equal(renderSms('RENEW', 'en', { no: '0431', ticker: 'ACME', issueDate: '2026-10-27', exitDate: '2026-11-25', agreement: 3, token: '7Kq2xZ' }), 'QUORUM #0431 RENEW ACME 27.10.26 14:00 CET. Still 3/4 models. New exit: US open 25.11. Not personal advice: qrm.si/p/0431 Stop: qrm.si/u/7Kq2xZ');
  assert.equal(renderSms('OPT_IN', 'en', { token: '7Kq2xZ' }), 'QUORUM: SMS alerts ON. Max 16 msgs/month (picks + exits), 14:00 Ljubljana time on US trading days. Replies not read. Stop: qrm.si/u/7Kq2xZ Help: qrm.si/help');
  assert.equal(renderSms('OPT_IN', 'sl', { token: '7Kq2xZ' }), 'QUORUM: SMS obvestila VKLOPLJENA. Najvec 16 SMS/mesec (izbire in izhodi), ob 14:00 na dneve trgovanja v ZDA. Odgovorov ne beremo. Odjava: qrm.si/u/7Kq2xZ');
  assert.equal(renderSms('OPT_OUT', 'en'), 'QUORUM: SMS alerts OFF. No more texts. Your subscription is unchanged: qrm.si/account');
  assert.equal(renderSms('BUY', 'en', BUY).length, 154);
});

test('every template is one clean segment at worst case', () => {
  for (const k of KINDS) for (const l of LOCALES) {
    const r = validateSms(worstCase(k, l));
    assert.ok(r.ok, `${k} ${l}: ${r.errors.join('; ')}`);
    assert.ok(r.analysis.septets <= 160);
  }
});

test('renderSms rejects bad input', () => {
  assert.throws(() => renderSms('BUY', 'en', { ...BUY, ticker: 'TOOLONG' }));
  assert.throws(() => renderSms('BUY', 'en', { ...BUY, no: '12' }));
  assert.throws(() => renderSms('BUY', 'en', { ...BUY, agreement: 2 }));
  assert.throws(() => renderSms('BUY', 'en', { ...BUY, token: 'abc' }));
  assert.throws(() => renderSms('BUY', 'de', BUY));
});

test('validateSms enforces the content rules', () => {
  const bad = (t) => validateSms(t).errors;
  assert.match(bad('QUORUM BUY ACME now').join(), /now/);
  assert.match(bad('Act fast: QUORUM').join(), /act/);
  assert.equal(bad('QUORUM exact contact know').length, 0, 'whole words only');
  assert.match(bad('QUORUM ACME at $12.40').join(), /currency/);
  assert.match(bad('QUORUM ACME 12 EUR').join(), /currency/);
  assert.match(bad('QUORUM see bit.ly/x1').join(), /link outside/);
  assert.match(bad('QUORUM see https://example.com').join(), /link outside/);
  assert.equal(bad('QUORUM see qrm.si/p/0417.').length, 0);
  assert.match(bad('QUORUM 🚀').join(), /emoji|GSM-7/);
  assert.match(bad('QUORUM – dash').join(), /GSM-7/);
  assert.match(bad('x'.repeat(161)).join(), /segment/);
  assert.match(bad('QUORUM zadnja priloznost').join(), /zadnja/);
});

test('validateSms rejects price targets, return claims and urgency (brief §2.5)', () => {
  const bad = (t) => validateSms(t).errors.join('; ');
  const tail = 'Not personal advice: qrm.si/p/0417 Stop: qrm.si/u/7Kq2xZ';
  // the reviewer's cases, each of which used to pass
  assert.match(bad(`QUORUM #0417 BUY ACME. Target 145.20. Up 12% expected. ${tail}`), /target.*decimal.*percent/);
  assert.match(bad(`QUORUM #0417 BUY ACME at 123.45 ${tail}`), /price-like decimal/);
  assert.match(bad('Buy immediately before the open!'), /immediately.*exclamation/);
  // every claim word, whole words only
  for (const w of ['Target', 'targets', 'upside', 'return', 'returns', 'gain', 'gains', 'profit', 'profitable', 'sure', 'surely', 'immediately', 'today', 'fast', 'cilj', 'donos', 'dobicek', 'zasluzek', 'zanesljivo', 'gotovo', 'danes']) {
    assert.match(bad(`QUORUM ACME ${w}`), /forbidden word/, w);
  }
  assert.equal(bad('QUORUM again measure fastener returned'), '', 'whole words only');
  // decimals in any locale; a percent sign alone is a return claim
  assert.match(bad('QUORUM ACME 12,5'), /decimal/);
  assert.match(bad('QUORUM ACME up 12 %'), /percent/);
  // dates as the templates write them are not prices, and neither are links
  assert.equal(bad('QUORUM 28.09.26 14:00 CEST. US open 28.09. Izstop: 27.10. odprtje 28.9. qrm.si/p/0417.'), '');
  assert.match(bad('QUORUM ACME 12.50. x'), /decimal/, 'not a date: there is no month 50');
});

test('every template passes the stricter rules on every issue date of a year', () => {
  let d = '2026-01-02';
  for (let k = 0; k < 260; k++) {
    for (const kind of ['BUY', 'CLOSE', 'RENEW']) {
      for (const locale of LOCALES) {
        const t = renderSms(kind, locale, { no: String(k + 1).padStart(4, '0'), ticker: 'QRST', issueDate: d, exitDate: d, agreement: 4, token: 'a1B2c3' });
        const r = validateSms(t);
        assert.ok(r.ok, `${t}: ${r.errors.join('; ')}`);
      }
    }
    const [y, m, dd] = d.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, dd + 1));
    d = next.toISOString().slice(0, 10);
  }
});
