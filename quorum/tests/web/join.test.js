// The join flow's pure helpers (web/js/pages/_join.js) and the API client (_api.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  geoVerdict,
  countryGroups,
  countryName,
  readPhone,
  groupE164,
  demoLookup,
  phoneVerdict,
  countryFromE164,
  price,
  launchInfo,
  previewPick,
  previewFromHero,
  buySms,
  smsModel,
  stepFromMe,
  stepsFor,
  nextStep,
  isEmail,
  isCode,
  demoToken,
  quietHoursAt,
  SMS_COUNTRIES,
  EXCLUDED,
} from '../../web/js/pages/_join.js';
import { api, ApiError, errorText } from '../../web/js/pages/_api.js';
import { consentHash, consentText, maskPhone } from '../../web/js/core/consent-texts.js';
import { analyze } from '../../web/js/core/gsm7.js';

const data = (f) => JSON.parse(readFileSync(new URL(`../../web/data/${f}.json`, import.meta.url), 'utf8'));

test('geofence: EU/EEA only, texts in SI AT DE HR IT, plain refusals for US UK AU CA', () => {
  assert.deepEqual(SMS_COUNTRIES, ['SI', 'AT', 'DE', 'HR', 'IT']);
  for (const cc of SMS_COUNTRIES) {
    const v = geoVerdict(cc);
    assert.equal(v.ok, true, cc);
    assert.equal(v.smsEligible, true, cc);
  }
  const be = geoVerdict('BE');
  assert.equal(be.ok, true);
  assert.equal(be.smsEligible, false);
  assert.equal(be.notes[0].code, 'sms_unavailable');
  assert.match(be.notes[0].en, /email and push/);
  for (const cc of EXCLUDED) {
    const v = geoVerdict(cc);
    assert.equal(v.ok, false, cc);
    assert.equal(v.reasons[0].code, `excluded_${cc}`);
    assert.ok(v.reasons[0].en.length > 40 && v.reasons[0].sl.length > 40, cc);
  }
  assert.match(geoVerdict('GB').reasons[0].en, /United Kingdom/);
  assert.equal(geoVerdict('CH').reasons[0].code, 'not_eea');
  assert.equal(geoVerdict('ZZ').reasons[0].code, 'not_eea');
  assert.equal(geoVerdict('').reasons[0].code, 'declared_missing');
  assert.equal(geoVerdict('NO').ok, true); // EEA
});

test('the country list: three groups, every EU/EEA country once, sorted by the locale', () => {
  const g = countryGroups('en');
  assert.deepEqual(g.map((x) => x.id), ['sms', 'eea', 'no']);
  assert.deepEqual([...g[0].countries].sort(), [...SMS_COUNTRIES].sort());
  assert.equal(g[1].countries.length, 30 - 5);
  assert.ok(g[2].countries.includes('US') && g[2].countries.includes('ZZ'));
  const names = g[0].countries.map((c) => countryName(c, 'en', { list: true }));
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en')));
  assert.equal(countryName('SI', 'sl'), 'Slovenija');
  assert.equal(countryName('US', 'en', { list: true }), 'United States');
});

test('reading a pasted number: separators dropped, non-GSM characters flagged and ignored', () => {
  const r = readPhone('+386 41 234 545');
  assert.equal(r.e164, '+38641234545');
  assert.equal(r.flagged, 0);
  const nb = readPhone('+386 41‪234 545');
  assert.equal(nb.e164, '+38641234545');
  assert.equal(nb.nonGsm, 2);
  assert.deepEqual(nb.chars.filter((c) => c.kind === 'nongsm').map((c) => c.ch), [' ', '‪']);
  const letter = readPhone('+386 41 x34');
  assert.equal(letter.chars.find((c) => c.ch === 'x').kind, 'invalid');
  assert.equal(readPhone('0038641234545').e164, '+38641234545');
  assert.equal(readPhone('041 234 545').e164, null); // no country code
  assert.equal(readPhone('+0123').e164, null);
  assert.equal(groupE164('+38641234545'), '+386 41 234 545');
  assert.equal(countryFromE164('+4915112345678'), 'DE');
  assert.equal(countryFromE164('+385911234567'), 'HR'); // +385 before +38
});

test('the demo lookup mirrors the console transport test numbers', () => {
  assert.equal(demoLookup('+38641230000').lineType, 'landline');
  assert.equal(demoLookup('+38641239999').lineType, 'nonFixedVoip');
  assert.equal(demoLookup('+38641236666').risk, 'high');
  assert.equal(demoLookup('+38641235555').valid, false);
  assert.deepEqual(phoneVerdict(demoLookup('+38641234545'), 'SI'), { ok: true, reasons: [] });
  assert.equal(phoneVerdict(demoLookup('+38641230000'), 'SI').reasons[0].code, 'landline');
  assert.equal(phoneVerdict(demoLookup('+38641239999'), 'SI').reasons[0].code, 'voip');
  assert.equal(phoneVerdict(demoLookup('+38641236666'), 'SI').reasons[0].code, 'high_risk');
  const mismatch = phoneVerdict(demoLookup('+4915112345678'), 'SI');
  assert.equal(mismatch.reasons[0].code, 'phone_mismatch');
  assert.match(mismatch.reasons[0].en, /Germany.*Slovenia/);
  assert.equal(phoneVerdict(demoLookup('+38641235555'), 'SI').reasons[0].code, 'invalid_number');
});

test('prices: brief §6, VAT included, annual is ten months', () => {
  assert.deepEqual([price('signal').amount, price('signal', 'year').amount, price('research').amount, price('research', 'year').amount], [19, 190, 39, 390]);
  assert.equal(price('signal', 'year').saving, 38);
  assert.equal(price('signal').vat, 3.43); // 19 - 19/1.22
  assert.equal(price('ledger'), null);
});

test('launch line: read from backtest.json launch, defensively', () => {
  const bt = data('backtest');
  const info = launchInfo(bt);
  if (bt.launch) {
    assert.equal(info.known, true);
    assert.equal(info.ready, bt.launch.status === 'ready');
    assert.equal(info.passed, bt.launch.holdoutGates.filter((g) => g.pass).length);
    assert.match(info.text.en, /Launch gate E/);
    assert.match(info.text.sl, /Pogoj za zagon E/);
  }
  const none = launchInfo({});
  assert.equal(none.known, false);
  assert.equal(none.ready, false);
  assert.equal(none.status, 'pre-launch');
  assert.equal(launchInfo(null).known, false);
  const ready = launchInfo({ launch: { status: 'ready', holdoutGates: [{ pass: true }], pooled: { dsr: 0.96, dsrThreshold: 0.95, pass: true } } });
  assert.equal(ready.ready, true);
  assert.match(ready.text.en, /has passed/);
});

test('the SMS preview: the exact BUY text from a revealed pick, one GSM-7 segment, counter label', () => {
  const picks = data('picks');
  const p = previewPick(picks);
  assert.ok(p, 'a BUY to preview');
  assert.equal(p.kind, 'BUY');
  assert.equal(p.status, 'closed', 'the preview never reveals an open pick');
  for (const loc of ['en', 'sl']) {
    const m = buySms(p, loc, '7Kq2xZ');
    assert.equal(m.encoding, 'GSM-7');
    assert.ok(m.used <= 160);
    assert.equal(m.label, `${m.used}/160 GSM-7`);
    assert.equal(m.used, analyze(m.text).septets);
    assert.ok(m.text.includes(`qrm.si/p/${p.no}`) && m.text.endsWith('qrm.si/u/7Kq2xZ'));
  }
  // with the token it went out with, the rebuilt text is the published one, byte for byte
  const m = buySms(p, 'en', '7Kq2xZ');
  if (p.sms?.en?.endsWith('7Kq2xZ')) assert.equal(m.text, p.sms.en);
  // the brief's own worked example: 154 septets
  const acme = smsModel('BUY', 'en', { no: '0417', ticker: 'ACME', issueDate: '2026-09-28', exitDate: '2026-10-27', agreement: 3, token: '7Kq2xZ' });
  assert.equal(acme.label, '154/160 GSM-7');
  assert.equal(smsModel('OPT_IN', 'en', { token: '7Kq2xZ' }).label, '156/160 GSM-7');
});

test('the preview from hero.json is the same text as the published one, without loading picks.json', () => {
  const hero = data('hero');
  const p = previewFromHero(hero);
  if (!p) return; // the hero pick may be a RENEW; the page then falls back to picks.json
  assert.equal(buySms(p, 'en', '7Kq2xZ').text, hero.sms);
  if (hero.smsSl) assert.equal(buySms(p, 'sl', '7Kq2xZ').text, hero.smsSl);
  const same = previewPick(data('picks'));
  assert.equal(p.no, same.no);
  assert.equal(p.exitPlanned, same.exitPlanned);
  assert.equal(previewFromHero({ ...hero, pick: { ...hero.pick, kind: 'RENEW' } }), null);
  assert.equal(previewFromHero(null), null);
});

test('the consent box shows the exact hashed text with the masked number', async () => {
  const masked = maskPhone('+38641234545');
  assert.equal(masked, '+386 •• ••• 45');
  assert.match(consentText('sms', 'en', { phone: masked }), /by SMS to \+386 •• ••• 45\. Up to 16 messages a month/);
  const hex = await consentHash('sms', 'en');
  assert.match(hex, /^[0-9a-f]{64}$/);
  assert.notEqual(hex, await consentHash('sms', 'sl'));
});

test('live resume: the step follows /api/me', () => {
  assert.equal(stepFromMe(null), 'account');
  assert.equal(stepFromMe({ authenticated: false }), 'account');
  const base = { authenticated: true, geo: { ok: false }, consents: {} };
  assert.equal(stepFromMe(base), 'country');
  assert.equal(stepFromMe({ ...base, geo: { ok: false, blocked: ['excluded_US'] } }), 'refused');
  const geo = { ...base, geo: { ok: true, smsEligible: true } };
  assert.equal(stepFromMe(geo), 'phone');
  assert.equal(stepFromMe({ ...geo, phone: { verified: true } }), 'consent');
  assert.equal(stepFromMe({ ...geo, geo: { ok: true, smsEligible: false } }), 'consent');
  const consents = { terms: { granted: true }, immediate_performance: { granted: true } };
  assert.equal(stepFromMe({ ...geo, phone: { verified: true }, consents }), 'checkout');
  assert.equal(stepFromMe({ ...geo, activation: 'pending' }), 'activating');
  assert.equal(stepFromMe({ ...geo, activation: 'active' }), 'done');
});

test('steps: phone and code apply only where texts are available', () => {
  assert.equal(stepsFor({ smsEligible: false }).filter((s) => s.applies).length, 5);
  assert.equal(stepsFor({ smsEligible: true }).filter((s) => s.applies).length, 7);
  assert.equal(nextStep('country', { smsEligible: false }), 'consent');
  assert.equal(nextStep('country', { smsEligible: true }), 'phone');
  assert.equal(nextStep('checkout', {}), 'done');
});

test('small validators and the demo token', () => {
  assert.equal(isEmail('you@example.com'), true);
  assert.equal(isEmail('you@example'), false);
  assert.equal(isEmail('a b@example.com'), false);
  assert.equal(isCode('123456'), true);
  assert.equal(isCode('12345'), false);
  let i = 0;
  const seq = [0, 0.5, 0.99, 0.1, 0.2, 0.3];
  const tok = demoToken(() => seq[i++]);
  assert.match(tok, /^[0-9A-Za-z]{6}$/);
  assert.match(demoToken(), /^[0-9A-Za-z]{6}$/);
});

test('quiet hours: texts only 08:00–21:00 Ljubljana; night texts wait for 08:00, across the clock change', () => {
  assert.equal(quietHoursAt(new Date('2026-09-28T12:00:00Z')).held, false);
  const night = quietHoursAt(new Date('2026-09-29T01:38:00Z'));
  assert.equal(night.held, true);
  assert.equal(night.at.toISOString(), '2026-09-29T06:00:00.000Z'); // 08:00 CEST
  assert.equal(quietHoursAt(new Date('2026-09-28T19:30:00Z')).at.toISOString(), '2026-09-29T06:00:00.000Z'); // 21:30 CEST
  assert.equal(quietHoursAt(new Date('2026-10-24T20:30:00Z')).at.toISOString(), '2026-10-25T07:00:00.000Z'); // 08:00 CET after the change
});

test('api(): JSON in and out; server errors become ApiError with reasons', async () => {
  const calls = [];
  const fake = (status, body) => async (path, init) => {
    calls.push({ path, init });
    return { ok: status < 400, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) };
  };
  const me = await api('/api/me', { fetchImpl: fake(200, { authenticated: false }) });
  assert.deepEqual(me, { authenticated: false });
  assert.equal(calls[0].init.credentials, 'same-origin');
  assert.equal(calls[0].init.body, undefined);
  await api('/api/consent', { method: 'POST', body: { kind: 'sms' }, fetchImpl: fake(200, { ok: true }) });
  assert.equal(calls[1].init.headers['content-type'], 'application/json');
  assert.equal(calls[1].init.body, '{"kind":"sms"}');
  const reasons = [{ code: 'excluded_US', en: 'Not in the US.', sl: 'Ne v ZDA.' }];
  await assert.rejects(api('/api/join/geo', { method: 'POST', body: {}, fetchImpl: fake(403, { error: 'geofence', message: 'x', reasons }) }), (e) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.status, 403);
    assert.equal(e.code, 'geofence');
    assert.equal(errorText(e, 'sl'), 'Ne v ZDA.');
    return true;
  });
  await assert.rejects(api('/api/phone/check', { fetchImpl: fake(422, { error: 'code_invalid', message: 'That code is not right.' }) }), (e) => {
    assert.match(errorText(e, 'sl'), /Koda ni pravilna/);
    assert.match(errorText(e, 'en'), /not right/);
    return true;
  });
  await assert.rejects(api('/api/me', { fetchImpl: async () => { throw new TypeError('offline'); } }), (e) => e.status === 0 && /connection/.test(errorText(e, 'en')));
  await assert.rejects(api('/api/me', { fetchImpl: fake(429, { error: 'rate_limited' }) }), (e) => /Too many/.test(errorText(e, 'en')));
});
