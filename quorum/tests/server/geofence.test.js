import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGeo, checkLookup, countryFromE164, normalizeE164, normalizeCountry, reason, EEA, EXCLUDED, DEFAULT_SMS_COUNTRIES } from '../../server/geofence.js';
import { makeApp, signIn, passGeo } from './helpers.js';

const SMS = DEFAULT_SMS_COUNTRIES;
const codes = (r) => r.reasons.map((x) => x.code);

test('launch lists: EU/EEA, the four excluded countries, five SMS countries', () => {
  assert.equal(EEA.length, 30);
  assert.deepEqual(EXCLUDED, ['US', 'GB', 'AU', 'CA']);
  assert.deepEqual(SMS, ['SI', 'AT', 'DE', 'HR', 'IT']);
  for (const c of SMS) assert.ok(EEA.includes(c));
});

test('all four signals agree in an SMS country: ok, SMS eligible', () => {
  const r = evaluateGeo({ ipCountry: 'SI', declaredCountry: 'SI', phoneCountry: 'SI', cardCountry: 'SI' }, { smsCountries: SMS, requireIp: true });
  assert.equal(r.ok, true);
  assert.equal(r.country, 'SI');
  assert.equal(r.smsEligible, true);
  assert.deepEqual(r.reasons, []);
});

test('EEA but not an SMS country: allowed without SMS, with a plain note', () => {
  const r = evaluateGeo({ ipCountry: 'FR', declaredCountry: 'FR' }, { smsCountries: SMS });
  assert.equal(r.ok, true);
  assert.equal(r.smsEligible, false);
  assert.equal(r.notes[0].code, 'sms_unavailable');
  assert.match(r.notes[0].en, /Slovenia, Austria, Germany, Croatia and Italy|Slovenia, Austria, Germany, Croatia, Italy/);
  assert.match(r.notes[0].sl, /Slovenija/);
});

test('excluded countries get their own reason, in English and Slovene', () => {
  for (const cc of EXCLUDED) {
    const r = evaluateGeo({ ipCountry: cc, declaredCountry: cc }, { smsCountries: SMS });
    assert.equal(r.ok, false, cc);
    assert.deepEqual(codes(r), [`excluded_${cc}`]);
    assert.ok(r.reasons[0].en.length > 20 && r.reasons[0].sl.length > 20);
  }
  assert.match(evaluateGeo({ declaredCountry: 'GB' }).reasons[0].en, /United Kingdom/);
  assert.match(evaluateGeo({ declaredCountry: 'US' }).reasons[0].sl, /Združenih držav/);
  assert.equal(normalizeCountry('uk'), 'GB');
});

test('outside the EEA (Switzerland, Serbia) is refused', () => {
  assert.deepEqual(codes(evaluateGeo({ ipCountry: 'CH', declaredCountry: 'CH' })), ['not_eea']);
  assert.deepEqual(codes(evaluateGeo({ ipCountry: 'RS', declaredCountry: 'RS' })), ['not_eea']);
});

test('any disagreement fails: IP, phone, card', () => {
  assert.deepEqual(codes(evaluateGeo({ ipCountry: 'AT', declaredCountry: 'SI' })), ['ip_mismatch']);
  assert.deepEqual(codes(evaluateGeo({ ipCountry: 'US', declaredCountry: 'SI' })), ['ip_mismatch']);
  assert.deepEqual(codes(evaluateGeo({ ipCountry: 'SI', declaredCountry: 'SI', phoneCountry: 'HR' })), ['phone_mismatch']);
  assert.deepEqual(codes(evaluateGeo({ ipCountry: 'SI', declaredCountry: 'SI', cardCountry: 'GB' })), ['card_mismatch']);
  const all = evaluateGeo({ ipCountry: 'DE', declaredCountry: 'SI', phoneCountry: 'AT', cardCountry: 'IT' });
  assert.deepEqual(codes(all), ['ip_mismatch', 'phone_mismatch', 'card_mismatch']);
  assert.match(all.reasons[0].en, /Slovenia.*Germany/);
  assert.match(all.reasons[0].sl, /Slovenija.*Nemčija/);
});

test('unknown IP country: refused when required, tolerated otherwise; declared is always required', () => {
  assert.deepEqual(codes(evaluateGeo({ declaredCountry: 'SI' }, { requireIp: true })), ['ip_unknown']);
  assert.deepEqual(codes(evaluateGeo({ ipCountry: 'XX', declaredCountry: 'SI' }, { requireIp: true })), ['ip_unknown']);
  assert.deepEqual(codes(evaluateGeo({ ipCountry: 'T1', declaredCountry: 'SI' }, { requireIp: true })), ['ip_unknown']);
  assert.equal(evaluateGeo({ declaredCountry: 'SI' }, { requireIp: false }).ok, true);
  assert.deepEqual(codes(evaluateGeo({ ipCountry: 'SI' })), ['declared_missing']);
});

test('phone numbers: E.164 normalisation and calling-code hints', () => {
  assert.equal(normalizeE164(' +386 41 234-545 '), '+38641234545');
  assert.equal(normalizeE164('0038641234545'), '+38641234545');
  assert.equal(normalizeE164('041 234 545'), null);
  assert.equal(countryFromE164('+38641234545'), 'SI');
  assert.equal(countryFromE164('+385911234567'), 'HR');
  assert.equal(countryFromE164('+4366412345678'), 'AT');
  assert.equal(countryFromE164('+393331234567'), 'IT');
  assert.equal(countryFromE164('+447700900123'), 'GB');
  assert.equal(countryFromE164('+12025550123'), 'US');
});

test('Lookup checks: mobile only, pumping risk, phone country', () => {
  const base = { valid: true, countryCode: 'SI', lineType: 'mobile', smsPumpingRisk: { score: 5, category: 'low', blocked: false } };
  const opts = { declaredCountry: 'SI', smsCountries: SMS, pumpingRiskMax: 75 };
  assert.equal(checkLookup(base, opts).ok, true);
  assert.deepEqual(codes(checkLookup({ ...base, valid: false }, opts)), ['invalid_number']);
  assert.deepEqual(codes(checkLookup({ ...base, lineType: 'landline' }, opts)), ['landline']);
  assert.deepEqual(codes(checkLookup({ ...base, lineType: 'fixedVoip' }, opts)), ['voip']);
  assert.deepEqual(codes(checkLookup({ ...base, lineType: 'nonFixedVoip' }, opts)), ['voip']);
  assert.deepEqual(codes(checkLookup({ ...base, lineType: 'tollFree' }, opts)), ['line_type_unsupported']);
  assert.deepEqual(codes(checkLookup({ ...base, smsPumpingRisk: { category: 'high' } }, opts)), ['high_risk']);
  assert.deepEqual(codes(checkLookup({ ...base, smsPumpingRisk: { score: 80, category: 'moderate' } }, opts)), ['high_risk']);
  assert.deepEqual(codes(checkLookup({ ...base, smsPumpingRisk: { blocked: true } }, opts)), ['high_risk']);
  assert.deepEqual(codes(checkLookup({ ...base, countryCode: 'AT' }, opts)), ['phone_mismatch']);
  assert.deepEqual(codes(checkLookup({ ...base, countryCode: 'FR' }, { ...opts, declaredCountry: 'FR' })), ['sms_unavailable']);
});

test('every reason has non-empty English and Slovene text', () => {
  for (const code of ['declared_missing', 'excluded_US', 'excluded_GB', 'excluded_AU', 'excluded_CA', 'ip_unknown', 'invalid_number', 'landline', 'voip', 'line_type_unsupported', 'high_risk', 'phone_in_use']) {
    const r = reason(code);
    assert.ok(r.en && r.sl && r.en !== r.sl, code);
  }
});

test('POST /api/join/geo: IP from the trusted header, block with reasons, SMS eligibility', async () => {
  const t = await makeApp();
  try {
    const ok = t.client({ country: 'AT' });
    await signIn(t, ok, 'geo-at@example.at');
    const r = await passGeo(ok, 'AT');
    assert.deepEqual([r.ok, r.country, r.smsEligible], [true, 'AT', true]);

    const us = t.client({ country: 'US' });
    await signIn(t, us, 'geo-us@example.com');
    const b = await us.post('/api/join/geo', { declaredCountry: 'US' });
    assert.equal(b.status, 403);
    assert.equal(b.body.error, 'geofence');
    assert.equal(b.body.reasons[0].code, 'excluded_US');
    assert.ok(b.body.reasons[0].sl);
    const me = await us.get('/api/me');
    assert.equal(me.body.user.status, 'geo_blocked');
    // Blocked users cannot go on to the phone step or checkout.
    assert.equal((await us.post('/api/phone/start', { e164: '+38641234545' })).status, 409);
    assert.equal((await us.post('/api/checkout', { tier: 'signal', interval: 'month' })).status, 409);

    const vpn = t.client({ country: 'DE' });
    await signIn(t, vpn, 'geo-vpn@example.si');
    const m = await vpn.post('/api/join/geo', { declaredCountry: 'SI' });
    assert.equal(m.status, 403);
    assert.equal(m.body.reasons[0].code, 'ip_mismatch');

    const unknown = t.client({ country: null });
    await signIn(t, unknown, 'geo-unknown@example.si');
    const u = await unknown.post('/api/join/geo', { declaredCountry: 'SI' });
    assert.equal(u.status, 403);
    assert.equal(u.body.reasons[0].code, 'ip_unknown');

    const fr = t.client({ country: 'FR' });
    await signIn(t, fr, 'geo-fr@example.fr');
    const f = await passGeo(fr, 'FR');
    assert.equal(f.smsEligible, false);
    assert.equal(f.notes[0].code, 'sms_unavailable');

    const logged = t.db.all('SELECT stage, ok FROM geo_checks');
    assert.equal(logged.length, 5);
  } finally {
    await t.close();
  }
});

test('POST /api/phone/start: Lookup rejections with plain reasons; the phone country must match', async () => {
  const lim = { capacity: 20, windowMs: 3_600_000 };
  const t = await makeApp({ config: { rateLimits: { phoneStart: lim, phoneStartUser: lim } } });
  try {
    const c = t.client();
    await signIn(t, c, 'phone@example.si');
    await passGeo(c, 'SI');
    const cases = [
      ['+38612340000', 'landline'],
      ['+38641239999', 'voip'],
      ['+38641236666', 'high_risk'],
      ['+38641235555', 'invalid_number'],
      ['+385911234567', 'phone_mismatch'],
      ['not a number', 'invalid_number'],
    ];
    for (const [e164, code] of cases) {
      const r = await c.post('/api/phone/start', { e164, locale: 'sl' });
      assert.ok(r.status === 422 || r.status === 400, `${e164}: ${r.status}`);
      assert.equal(r.body.reasons[0].code, code, e164);
      assert.ok(r.body.reasons[0].sl, 'Slovene reason');
    }
    assert.equal(t.sms.lastCode('+38612340000'), null, 'no Verify code sent for a rejected number');
    const ok = await c.post('/api/phone/start', { e164: '+386 41 234 545', locale: 'sl' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.masked, '+386 •• ••• 45');
    assert.ok(t.sms.lastCode('+38641234545'));
    const wrong = await c.post('/api/phone/check', { e164: '+38641234545', code: '0000000' });
    assert.equal(wrong.status, 422);
    const right = await c.post('/api/phone/check', { e164: '+38641234545', code: t.sms.lastCode('+38641234545') });
    assert.equal(right.status, 200);
    assert.equal(right.body.verified, true);
    assert.ok(t.db.get('SELECT verified_at FROM phone_numbers').verified_at);
  } finally {
    await t.close();
  }
});

test('Verify errors from Twilio become plain answers (Fraud Guard block, too many sends, outage)', async () => {
  const { TwilioError } = await import('../../server/vendors/twilio.js');
  const t = await makeApp();
  try {
    const c = t.client();
    await signIn(t, c, 'verify-err@example.si');
    await passGeo(c, 'SI');
    const cases = [
      [new TwilioError(403, { code: 60410, message: 'blocked' }), 422],
      [new TwilioError(429, { code: 60203, message: 'Max send attempts reached' }), 429],
      [new TwilioError(503, { code: 20503, message: 'unavailable' }), 502],
    ];
    for (const [err, status] of cases) {
      t.ctx.sms.verifyStart = async () => {
        throw err;
      };
      const r = await c.post('/api/phone/start', { e164: '+38641234545' });
      assert.equal(r.status, status, String(err.code));
      assert.ok(r.body.message);
      t.ctx.rateLimiter.reset();
    }
  } finally {
    await t.close();
  }
});
