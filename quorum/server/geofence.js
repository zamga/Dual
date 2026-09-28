// Who can subscribe (brief §2.1): EU/EEA consumers only; SMS in SI, AT, DE, HR, IT at launch;
// the US, UK, Australia and Canada are excluded. IP country, declared country, phone country
// (Lookup) and card billing country must all agree. Every refusal carries a plain-language
// reason in English and Slovene (Slovene: first draft, needs native and legal review).

export const EU = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
export const EEA = [...EU, 'IS', 'LI', 'NO'];
export const EXCLUDED = ['US', 'GB', 'AU', 'CA'];
export const DEFAULT_SMS_COUNTRIES = ['SI', 'AT', 'DE', 'HR', 'IT'];

// IANA zone per SMS country, for recipient-local quiet hours.
export const COUNTRY_TZ = {
  SI: 'Europe/Ljubljana',
  AT: 'Europe/Vienna',
  DE: 'Europe/Berlin',
  HR: 'Europe/Zagreb',
  IT: 'Europe/Rome',
};

export const COUNTRY_NAMES = {
  AT: ['Austria', 'Avstrija'], BE: ['Belgium', 'Belgija'], BG: ['Bulgaria', 'Bolgarija'], HR: ['Croatia', 'Hrvaška'],
  CY: ['Cyprus', 'Ciper'], CZ: ['Czechia', 'Češka'], DK: ['Denmark', 'Danska'], EE: ['Estonia', 'Estonija'],
  FI: ['Finland', 'Finska'], FR: ['France', 'Francija'], DE: ['Germany', 'Nemčija'], GR: ['Greece', 'Grčija'],
  HU: ['Hungary', 'Madžarska'], IE: ['Ireland', 'Irska'], IT: ['Italy', 'Italija'], LV: ['Latvia', 'Latvija'],
  LT: ['Lithuania', 'Litva'], LU: ['Luxembourg', 'Luksemburg'], MT: ['Malta', 'Malta'], NL: ['Netherlands', 'Nizozemska'],
  PL: ['Poland', 'Poljska'], PT: ['Portugal', 'Portugalska'], RO: ['Romania', 'Romunija'], SK: ['Slovakia', 'Slovaška'],
  SI: ['Slovenia', 'Slovenija'], ES: ['Spain', 'Španija'], SE: ['Sweden', 'Švedska'], IS: ['Iceland', 'Islandija'],
  LI: ['Liechtenstein', 'Lihtenštajn'], NO: ['Norway', 'Norveška'], US: ['the United States', 'Združene države Amerike'],
  GB: ['the United Kingdom', 'Združeno kraljestvo'], AU: ['Australia', 'Avstralija'], CA: ['Canada', 'Kanada'],
  CH: ['Switzerland', 'Švica'], RS: ['Serbia', 'Srbija'], BA: ['Bosnia and Herzegovina', 'Bosna in Hercegovina'],
};

export function countryName(cc, locale = 'en') {
  const n = COUNTRY_NAMES[cc];
  if (!n) return cc || (locale === 'sl' ? 'neznano' : 'unknown');
  return locale === 'sl' ? n[1] : n[0];
}

// Calling codes -> country, longest prefix first. +1 is NANP (US and Canada); both are excluded.
const CALLING = [
  ['386', 'SI'], ['385', 'HR'], ['420', 'CZ'], ['421', 'SK'], ['423', 'LI'], ['353', 'IE'], ['358', 'FI'], ['351', 'PT'],
  ['352', 'LU'], ['356', 'MT'], ['357', 'CY'], ['359', 'BG'], ['354', 'IS'], ['370', 'LT'], ['371', 'LV'], ['372', 'EE'],
  ['381', 'RS'], ['387', 'BA'], ['43', 'AT'], ['49', 'DE'], ['39', 'IT'], ['33', 'FR'], ['34', 'ES'], ['31', 'NL'],
  ['32', 'BE'], ['36', 'HU'], ['48', 'PL'], ['45', 'DK'], ['46', 'SE'], ['47', 'NO'], ['30', 'GR'], ['40', 'RO'],
  ['41', 'CH'], ['44', 'GB'], ['61', 'AU'], ['1', 'US'],
];

// countryFromE164('+38641234545') -> 'SI' (null when unknown). A hint only: Lookup is authoritative.
export function countryFromE164(e164) {
  const m = /^\+(\d{6,15})$/.exec(String(e164));
  if (!m) return null;
  for (const [code, cc] of CALLING) if (m[1].startsWith(code)) return cc;
  return null;
}

// normalizeE164(' +386 41 234-545 ') -> '+38641234545' | null
export function normalizeE164(input) {
  const s = String(input ?? '').replace(/[\s().-]/g, '');
  const withPlus = s.startsWith('00') ? `+${s.slice(2)}` : s;
  return /^\+[1-9]\d{6,14}$/.test(withPlus) ? withPlus : null;
}

export function normalizeCountry(cc) {
  const s = String(cc ?? '').trim().toUpperCase();
  // XX (unknown) and T1 (Tor) are what edges such as Cloudflare send when they cannot tell.
  if (!/^[A-Z]{2}$/.test(s) || s === 'XX' || s === 'T1') return null;
  return s === 'UK' ? 'GB' : s;
}

// ------------------------------------------------------------------ reasons
const smsList = (cs, locale) => cs.map((c) => countryName(c, locale)).join(', ');

const REASONS = {
  declared_missing: () => ({
    en: 'Tell us the country where you live.',
    sl: 'Navedite državo, v kateri živite.',
  }),
  excluded_US: () => ({
    en: 'Quorum is not available to residents of the United States. US securities rules and US carrier rules on stock-alert texts mean we cannot offer the service there.',
    sl: 'Quorum ni na voljo prebivalcem Združenih držav Amerike. Zaradi ameriških pravil o vrednostnih papirjih in pravil operaterjev za borzna SMS-obvestila storitve tam ne moremo ponujati.',
  }),
  excluded_GB: () => ({
    en: 'Quorum is not available to residents of the United Kingdom. UK rules on publishing investment research would require an authorisation we do not have.',
    sl: 'Quorum ni na voljo prebivalcem Združenega kraljestva. Pravila Združenega kraljestva o objavi investicijskih raziskav bi zahtevala dovoljenje, ki ga nimamo.',
  }),
  excluded_AU: () => ({
    en: 'Quorum is not available to residents of Australia. Australian rules on financial advice would require a licence we do not have.',
    sl: 'Quorum ni na voljo prebivalcem Avstralije. Avstralska pravila o finančnem svetovanju bi zahtevala licenco, ki je nimamo.',
  }),
  excluded_CA: () => ({
    en: 'Quorum is not yet available in Canada while we review Canadian rules.',
    sl: 'Quorum v Kanadi še ni na voljo, dokler ne preučimo kanadskih pravil.',
  }),
  not_eea: ({ declared }) => ({
    en: `Quorum is available only to consumers who live in the EU or the European Economic Area. Country you gave: ${countryName(declared, 'en')}.`,
    sl: `Quorum je na voljo le potrošnikom, ki živijo v EU ali Evropskem gospodarskem prostoru. Država, ki ste jo navedli: ${countryName(declared, 'sl')}.`,
  }),
  ip_unknown: () => ({
    en: 'We could not tell which country you are connecting from. Switch off any VPN or proxy and try again.',
    sl: 'Ne moremo ugotoviti, iz katere države se povezujete. Izklopite VPN ali posredniški strežnik in poskusite znova.',
  }),
  ip_mismatch: ({ declared, ip }) => ({
    en: `The country you gave (${countryName(declared, 'en')}) and the country you are connecting from (${countryName(ip, 'en')}) do not match. Your country, your connection, your phone number and your card must all point to the same country. If you are travelling, try again from home.`,
    sl: `Država, ki ste jo navedli (${countryName(declared, 'sl')}), in država, iz katere se povezujete (${countryName(ip, 'sl')}), se ne ujemata. Vaša država, povezava, telefonska številka in kartica morajo kazati na isto državo. Če potujete, poskusite znova od doma.`,
  }),
  phone_mismatch: ({ declared, phone }) => ({
    en: `This phone number is registered in ${countryName(phone, 'en')}, but the country you gave is ${countryName(declared, 'en')}. Use a mobile number from the country where you live.`,
    sl: `Država te telefonske številke (${countryName(phone, 'sl')}) se ne ujema z državo, ki ste jo navedli (${countryName(declared, 'sl')}). Uporabite mobilno številko iz države, v kateri živite.`,
  }),
  card_mismatch: ({ declared, card }) => ({
    en: `Your card's billing country (${countryName(card, 'en')}) does not match the country you gave (${countryName(declared, 'en')}). We have cancelled the subscription and refunded the payment in full.`,
    sl: `Država za obračun vaše kartice (${countryName(card, 'sl')}) se ne ujema z državo, ki ste jo navedli (${countryName(declared, 'sl')}). Naročnino smo preklicali in plačilo v celoti vrnili.`,
  }),
  sms_unavailable: ({ smsCountries }) => ({
    en: `Text alerts are available in ${smsList(smsCountries, 'en')}. You still get every pick and exit by email and push.`,
    sl: `SMS-obvestila so na voljo v teh državah: ${smsList(smsCountries, 'sl')}. Vse izbire in izhode še vedno prejmete po e-pošti in s potisnimi obvestili.`,
  }),
  invalid_number: () => ({
    en: 'This is not a valid mobile number. Include the country code, for example +386 41 234 545.',
    sl: 'To ni veljavna mobilna številka. Vključite klicno kodo države, na primer +386 41 234 545.',
  }),
  landline: () => ({
    en: 'This looks like a landline. Text alerts need a mobile number.',
    sl: 'To je videti kot stacionarna številka. Za SMS-obvestila potrebujete mobilno številko.',
  }),
  voip: () => ({
    en: 'This looks like an internet (VoIP) number. Text alerts need a number from a mobile network.',
    sl: 'To je videti kot internetna (VoIP) številka. Za SMS-obvestila potrebujete številko mobilnega omrežja.',
  }),
  line_type_unsupported: () => ({
    en: 'We cannot send texts to this kind of number. Use a personal mobile number.',
    sl: 'Na to vrsto številke ne moremo pošiljati SMS-sporočil. Uporabite osebno mobilno številko.',
  }),
  high_risk: () => ({
    en: 'Our SMS provider flags this number as high risk for SMS fraud, so we cannot text it. Try another mobile number or write to support.',
    sl: 'Naš ponudnik SMS to številko označuje kot zelo tvegano za SMS-prevare, zato nanjo ne moremo pošiljati sporočil. Poskusite z drugo mobilno številko ali pišite podpori.',
  }),
  phone_in_use: () => ({
    en: 'This number is already verified on another Quorum account.',
    sl: 'Ta številka je že potrjena v drugem računu Quorum.',
  }),
};

// reason(code, vars) -> { code, en, sl }
export function reason(code, vars = {}) {
  const f = REASONS[code];
  if (!f) throw new Error(`geofence: unknown reason ${code}`);
  return { code, ...f(vars) };
}

// evaluateGeo({ ipCountry, declaredCountry, phoneCountry, cardCountry }, { smsCountries, requireIp })
//   -> { ok, country, smsEligible, reasons: [{code, en, sl}], notes: [{code, en, sl}] }
// A signal that is not known yet (null) is not a disagreement, except the IP country when requireIp.
export function evaluateGeo(signals = {}, { smsCountries = DEFAULT_SMS_COUNTRIES, requireIp = false } = {}) {
  const declared = normalizeCountry(signals.declaredCountry);
  const ip = normalizeCountry(signals.ipCountry);
  const phone = normalizeCountry(signals.phoneCountry);
  const card = normalizeCountry(signals.cardCountry);
  const reasons = [];
  const notes = [];

  if (!declared) {
    reasons.push(reason('declared_missing'));
    return { ok: false, country: null, smsEligible: false, reasons, notes };
  }
  if (EXCLUDED.includes(declared)) reasons.push(reason(`excluded_${declared}`));
  else if (!EEA.includes(declared)) reasons.push(reason('not_eea', { declared }));

  if (!ip) {
    if (requireIp) reasons.push(reason('ip_unknown'));
  } else if (ip !== declared) {
    reasons.push(reason('ip_mismatch', { declared, ip }));
  }
  if (phone && phone !== declared) reasons.push(reason('phone_mismatch', { declared, phone }));
  if (card && card !== declared) reasons.push(reason('card_mismatch', { declared, card }));

  const smsEligible = smsCountries.includes(declared) && (!phone || smsCountries.includes(phone));
  if (!smsEligible && reasons.length === 0) notes.push(reason('sms_unavailable', { smsCountries }));

  return { ok: reasons.length === 0, country: declared, smsEligible, reasons, notes };
}

// checkLookup(lookup, { declaredCountry, smsCountries, pumpingRiskMax }) -> { ok, reasons }
// lookup: the normalised result of transport.lookup(): { valid, countryCode, lineType, smsPumpingRisk: {score, category, blocked} }
export function checkLookup(lookup, { declaredCountry, smsCountries = DEFAULT_SMS_COUNTRIES, pumpingRiskMax = 75 } = {}) {
  const reasons = [];
  if (!lookup || !lookup.valid) return { ok: false, reasons: [reason('invalid_number')] };
  const type = String(lookup.lineType || '').toLowerCase();
  if (type === 'landline' || type === 'fixedline' || type === 'fixed') reasons.push(reason('landline'));
  else if (type === 'fixedvoip' || type === 'nonfixedvoip' || type === 'voip') reasons.push(reason('voip'));
  else if (type !== 'mobile') reasons.push(reason('line_type_unsupported'));
  const risk = lookup.smsPumpingRisk || {};
  if (risk.blocked || String(risk.category).toLowerCase() === 'high' || (Number.isFinite(risk.score) && risk.score >= pumpingRiskMax)) {
    reasons.push(reason('high_risk'));
  }
  const phone = normalizeCountry(lookup.countryCode);
  const declared = normalizeCountry(declaredCountry);
  if (phone && declared && phone !== declared) reasons.push(reason('phone_mismatch', { declared, phone }));
  else if (phone && !smsCountries.includes(phone)) reasons.push(reason('sms_unavailable', { smsCountries }));
  return { ok: reasons.length === 0, reasons };
}
