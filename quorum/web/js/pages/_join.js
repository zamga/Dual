// Pure helpers for the join flow (#join) and the member pages (#app, #account, #u-TOKEN): countries and
// the geofence in the browser, phone-number reading, the demo stand-in for the phone lookup, prices, the
// launch line from backtest.json, the SMS preview model and the live-mode step from /api/me.
// No DOM: tested in Node (tests/web/join.test.js).
//
// The geofence copy mirrors the server's reasons (server/geofence.js); in live mode the server's own
// reasons[{code, en, sl}] are shown instead. SL: first draft, needs native (and legal) review.
import { analyze, isGsm7Basic } from '../core/gsm7.js';
import { renderSms } from '../core/sms-templates.js';
import { formatInZone, zonedToInstant, addDays, addTradingDays, LJUBLJANA } from '../core/calendar.js';

export const STEPS = ['tier', 'account', 'country', 'phone', 'code', 'consent', 'checkout'];
export const PAID_TIERS = ['signal', 'research'];
export const INTERVALS = ['month', 'year'];
// Brief §6: EUR, VAT included; annual billing costs 10 months' price.
export const PRICES = { signal: { month: 19, year: 190 }, research: { month: 39, year: 390 } };
export const SI_VAT = 0.22;

export const SMS_COUNTRIES = ['SI', 'AT', 'DE', 'HR', 'IT'];
export const EU = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
export const EEA = [...EU, 'IS', 'LI', 'NO'];
export const EXCLUDED = ['US', 'GB', 'AU', 'CA'];
// 'ZZ' stands for "somewhere else" in the country list.
export const ELSEWHERE = 'ZZ';

const NAMES = {
  AT: ['Austria', 'Avstrija'], BE: ['Belgium', 'Belgija'], BG: ['Bulgaria', 'Bolgarija'], HR: ['Croatia', 'Hrvaška'],
  CY: ['Cyprus', 'Ciper'], CZ: ['Czechia', 'Češka'], DK: ['Denmark', 'Danska'], EE: ['Estonia', 'Estonija'],
  FI: ['Finland', 'Finska'], FR: ['France', 'Francija'], DE: ['Germany', 'Nemčija'], GR: ['Greece', 'Grčija'],
  HU: ['Hungary', 'Madžarska'], IE: ['Ireland', 'Irska'], IT: ['Italy', 'Italija'], LV: ['Latvia', 'Latvija'],
  LT: ['Lithuania', 'Litva'], LU: ['Luxembourg', 'Luksemburg'], MT: ['Malta', 'Malta'], NL: ['Netherlands', 'Nizozemska'],
  PL: ['Poland', 'Poljska'], PT: ['Portugal', 'Portugalska'], RO: ['Romania', 'Romunija'], SK: ['Slovakia', 'Slovaška'],
  SI: ['Slovenia', 'Slovenija'], ES: ['Spain', 'Španija'], SE: ['Sweden', 'Švedska'], IS: ['Iceland', 'Islandija'],
  LI: ['Liechtenstein', 'Lihtenštajn'], NO: ['Norway', 'Norveška'], US: ['the United States', 'Združene države Amerike'],
  GB: ['the United Kingdom', 'Združeno kraljestvo'], AU: ['Australia', 'Avstralija'], CA: ['Canada', 'Kanada'],
  ZZ: ['somewhere else', 'drugje'],
};
// Names as a list item (no leading article).
const LIST_NAMES = { US: ['United States', 'Združene države Amerike'], GB: ['United Kingdom', 'Združeno kraljestvo'], ZZ: ['Somewhere else', 'Drugje'] };

export function countryName(cc, locale = 'en', { list = false } = {}) {
  const n = (list && LIST_NAMES[cc]) || NAMES[cc];
  if (!n) return cc || '';
  return locale === 'sl' ? n[1] : n[0];
}

// The country select, grouped: text alerts available / EU and EEA (email and push) / not available.
export function countryGroups(locale = 'en') {
  const by = (list) => [...list].sort((a, b) => countryName(a, locale, { list: true }).localeCompare(countryName(b, locale, { list: true }), locale === 'sl' ? 'sl' : 'en'));
  const sl = locale === 'sl';
  return [
    { id: 'sms', label: sl ? 'SMS-obvestila na voljo' : 'Text alerts available', countries: by(SMS_COUNTRIES) },
    { id: 'eea', label: sl ? 'EU in EGP: e-pošta in potisna obvestila' : 'EU and EEA: email and push', countries: by(EEA.filter((c) => !SMS_COUNTRIES.includes(c))) },
    { id: 'no', label: sl ? 'Ni na voljo' : 'Not available', countries: [...by(EXCLUDED), ELSEWHERE] },
  ];
}

const smsList = (locale) => SMS_COUNTRIES.map((c) => countryName(c, locale)).join(', ');

const REASONS = {
  declared_missing: () => ({ en: 'Tell us the country where you live.', sl: 'Navedite državo, v kateri živite.' }),
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
  sms_unavailable: () => ({
    en: `Text alerts are available in ${smsList('en')}. You still get every pick and exit by email and push.`,
    sl: `SMS-obvestila so na voljo v teh državah: ${smsList('sl')}. Vse izbire in izhode še vedno prejmete po e-pošti in s potisnimi obvestili.`,
  }),
  invalid_number: () => ({
    en: 'This is not a valid mobile number. Include the country code, for example +386 41 234 545.',
    sl: 'To ni veljavna mobilna številka. Vključite klicno kodo države, na primer +386 41 234 545.',
  }),
  landline: () => ({ en: 'This looks like a landline. Text alerts need a mobile number.', sl: 'To je videti kot stacionarna številka. Za SMS-obvestila potrebujete mobilno številko.' }),
  voip: () => ({
    en: 'This looks like an internet (VoIP) number. Text alerts need a number from a mobile network.',
    sl: 'To je videti kot internetna (VoIP) številka. Za SMS-obvestila potrebujete številko mobilnega omrežja.',
  }),
  high_risk: () => ({
    en: 'Our SMS provider flags this number as high risk for SMS fraud, so we cannot text it. Try another mobile number or write to support.',
    sl: 'Naš ponudnik SMS to številko označuje kot zelo tvegano za SMS-prevare, zato nanjo ne moremo pošiljati sporočil. Poskusite z drugo mobilno številko ali pišite podpori.',
  }),
  phone_mismatch: ({ declared, phone }) => ({
    en: `This phone number is registered in ${countryName(phone, 'en')}, but the country you gave is ${countryName(declared, 'en')}. Use a mobile number from the country where you live.`,
    sl: `Država te telefonske številke (${countryName(phone, 'sl')}) se ne ujema z državo, ki ste jo navedli (${countryName(declared, 'sl')}). Uporabite mobilno številko iz države, v kateri živite.`,
  }),
};

export function reason(code, vars = {}) {
  const f = REASONS[code];
  if (!f) return { code, en: code, sl: code };
  return { code, ...f(vars) };
}

// The browser's view of the geofence on the declared country (the server adds IP, phone and card).
//   -> { ok, country, smsEligible, reasons: [{code,en,sl}], notes: [{code,en,sl}] }
export function geoVerdict(declared) {
  const cc = String(declared ?? '').toUpperCase();
  if (!cc) return { ok: false, country: null, smsEligible: false, reasons: [reason('declared_missing')], notes: [] };
  if (EXCLUDED.includes(cc)) return { ok: false, country: cc, smsEligible: false, reasons: [reason(`excluded_${cc}`)], notes: [] };
  if (!EEA.includes(cc)) return { ok: false, country: cc, smsEligible: false, reasons: [reason('not_eea', { declared: cc })], notes: [] };
  const smsEligible = SMS_COUNTRIES.includes(cc);
  return { ok: true, country: cc, smsEligible, reasons: [], notes: smsEligible ? [] : [reason('sms_unavailable')] };
}

// ---- phone numbers ---------------------------------------------------------------------------------------
const CALLING = [
  ['386', 'SI'], ['385', 'HR'], ['420', 'CZ'], ['421', 'SK'], ['423', 'LI'], ['353', 'IE'], ['358', 'FI'], ['351', 'PT'],
  ['352', 'LU'], ['356', 'MT'], ['357', 'CY'], ['359', 'BG'], ['354', 'IS'], ['370', 'LT'], ['371', 'LV'], ['372', 'EE'],
  ['381', 'RS'], ['387', 'BA'], ['43', 'AT'], ['49', 'DE'], ['39', 'IT'], ['33', 'FR'], ['34', 'ES'], ['31', 'NL'],
  ['32', 'BE'], ['36', 'HU'], ['48', 'PL'], ['45', 'DK'], ['46', 'SE'], ['47', 'NO'], ['30', 'GR'], ['40', 'RO'],
  ['41', 'CH'], ['44', 'GB'], ['61', 'AU'], ['1', 'US'],
];
export const CALLING_CODE = { SI: '386', AT: '43', DE: '49', HR: '385', IT: '39' };

export function countryFromE164(e164) {
  const m = /^\+(\d{6,15})$/.exec(String(e164 ?? ''));
  if (!m) return null;
  for (const [code, cc] of CALLING) if (m[1].startsWith(code)) return cc;
  return null;
}

// What the number field reads: every character classified, so the page can highlight what it ignores.
//   kind 'ok' (digit, a leading +), 'sep' (space ( ) - . that the reader drops), 'nongsm' (outside the
//   GSM 03.38 alphabet: a non-breaking space or direction mark pasted from a contact card, a č),
//   'invalid' (a GSM character that is not part of a number: a letter).
// -> { chars: [{ch, kind}], e164: '+38641234545' | null, digits, flagged: n, nonGsm: n }
export function readPhone(input) {
  const chars = [];
  let digits = '';
  let plus = false;
  let started = false;
  for (const ch of Array.from(String(input ?? ''))) {
    let kind;
    if (/[0-9]/.test(ch)) {
      kind = 'ok';
      digits += ch;
      started = true;
    } else if (ch === '+' && !started && !plus) {
      kind = 'ok';
      plus = true;
      started = true;
    } else if (/[ ()\-.]/.test(ch)) kind = 'sep';
    else if (!isGsm7Basic(ch)) kind = 'nongsm';
    else kind = 'invalid';
    chars.push({ ch, kind });
  }
  let e164 = null;
  const raw = plus ? digits : digits.startsWith('00') ? digits.slice(2) : null;
  if (raw && /^[1-9]\d{6,14}$/.test(raw)) e164 = `+${raw}`;
  return {
    chars,
    e164,
    digits,
    flagged: chars.filter((c) => c.kind === 'nongsm' || c.kind === 'invalid').length,
    nonGsm: chars.filter((c) => c.kind === 'nongsm').length,
  };
}

// '+38641234545' -> '+386 41 234 545' (display grouping: country code, then 2-3-3…)
export function groupE164(e164) {
  const m = /^\+(\d+)$/.exec(String(e164 ?? ''));
  if (!m) return String(e164 ?? '');
  const cc = CALLING.find(([code]) => m[1].startsWith(code))?.[0] ?? m[1].slice(0, 3);
  const rest = m[1].slice(cc.length);
  const parts = [];
  let i = 0;
  const sizes = [2, 3, 3, 3, 3];
  for (const s of sizes) {
    if (i >= rest.length) break;
    parts.push(rest.slice(i, i + s));
    i += s;
  }
  if (i < rest.length) parts.push(rest.slice(i));
  return `+${cc} ${parts.join(' ')}`.trim();
}

// The demo's stand-in for the phone lookup, with the same test numbers as the server's console
// transport (docs/OPERATIONS.md §7): national numbers ending 0000 are landlines, 9999 VoIP, 6666 high
// pumping risk, 5555 invalid; everything else is a mobile.
export function demoLookup(e164) {
  const valid = /^\+[1-9]\d{6,14}$/.test(String(e164 ?? '')) && !String(e164).endsWith('5555');
  if (!valid) return { valid: false, countryCode: null, lineType: null, risk: null };
  const s = String(e164);
  return {
    valid: true,
    countryCode: countryFromE164(s),
    lineType: s.endsWith('0000') ? 'landline' : s.endsWith('9999') ? 'nonFixedVoip' : 'mobile',
    risk: s.endsWith('6666') ? 'high' : 'low',
  };
}

// The lookup verdict (mirrors server checkLookup): -> { ok, reasons }
export function phoneVerdict(lookup, declared) {
  if (!lookup?.valid) return { ok: false, reasons: [reason('invalid_number')] };
  const reasons = [];
  const type = String(lookup.lineType ?? '').toLowerCase();
  if (type === 'landline') reasons.push(reason('landline'));
  else if (type.includes('voip')) reasons.push(reason('voip'));
  if (lookup.risk === 'high') reasons.push(reason('high_risk'));
  const phone = lookup.countryCode;
  if (phone && declared && phone !== declared) reasons.push(reason('phone_mismatch', { declared, phone }));
  else if (phone && !SMS_COUNTRIES.includes(phone)) reasons.push(reason('sms_unavailable'));
  return { ok: reasons.length === 0, reasons };
}

export function isEmail(s) {
  const v = String(s ?? '').trim();
  return v.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v);
}

export function isCode(s) {
  return /^\d{6}$/.test(String(s ?? '').replace(/\s/g, ''));
}

// ---- prices ------------------------------------------------------------------------------------------------
// -> { amount, vat, net, perMonth, months, saving }  (euros, VAT included)
export function price(tier, interval = 'month') {
  const p = PRICES[tier];
  if (!p) return null;
  const amount = interval === 'year' ? p.year : p.month;
  const vat = Math.round((amount - amount / (1 + SI_VAT)) * 100) / 100;
  return { amount, vat, net: Math.round((amount - vat) * 100) / 100, months: interval === 'year' ? 12 : 1, saving: interval === 'year' ? p.month * 12 - p.year : 0 };
}

// ---- launch status (backtest.json "launch", read defensively) ---------------------------------------------
// -> { known, ready, status, passed, total, gateD: {dsr, need, pass} | null, asOf, text: {en, sl} }
export function launchInfo(backtest) {
  const l = backtest?.launch;
  if (!l || typeof l !== 'object') {
    return {
      known: false,
      ready: false,
      status: 'pre-launch',
      passed: null,
      total: null,
      gateD: null,
      asOf: null,
      text: { en: 'Pre-launch: the sealed record has no subscribers yet.', sl: 'Pred zagonom: zapečateni zapis še nima naročnikov.' },
    };
  }
  const gates = Array.isArray(l.holdoutGates) ? l.holdoutGates : [];
  const passed = gates.filter((g) => g?.pass).length;
  const total = gates.length || 5;
  const p = l.pooled && Number.isFinite(l.pooled.dsr) ? { dsr: l.pooled.dsr, need: l.pooled.dsrThreshold ?? 0.95, pass: !!l.pooled.pass } : null;
  const ready = l.status === 'ready';
  const d2 = (x, sl) => (sl ? x.toFixed(2).replace('.', ',') : x.toFixed(2));
  const en = ready
    ? `Launch gate E has passed: all ${total} holdout gates, and gate (d) on the pooled record.`
    : `Launch gate E: ${passed} of ${total} holdout gates pass${p ? `; gate (d) is re-tested monthly on the pooled record: ${d2(p.dsr)}, needs ${d2(p.need)}` : ''}.`;
  const sl = ready
    ? `Pogoj za zagon E je izpolnjen: vseh ${total} pogojev preizkusa in pogoj (d) na združenem zapisu.`
    : `Pogoj za zagon E: izpolnjenih ${passed} od ${total} pogojev preizkusa${p ? `; pogoj (d) se mesečno preverja na združenem zapisu: ${d2(p.dsr, true)}, potrebno ${d2(p.need, true)}` : ''}.`;
  return { known: true, ready, status: ready ? 'ready' : 'pre-launch', passed, total, gateD: p, asOf: l.asOf ?? null, text: { en, sl } };
}

// ---- the SMS preview ---------------------------------------------------------------------------------------
// The pick the preview texts are rendered from: the latest closed BUY (revealed to everyone), else any BUY.
export function previewPick(picks) {
  const list = Array.isArray(picks) ? picks : [];
  const ok = (p) => p?.kind === 'BUY' && /^[A-Z]{1,5}$/.test(String(p.ticker ?? '')) && p.exitPlanned && (p.agreement === 3 || p.agreement === 4);
  return [...list].reverse().find((p) => ok(p) && p.status === 'closed') ?? [...list].reverse().find(ok) ?? null;
}

// The same pick from hero.json (22 KB, the latest closed pick), so #join and #u- need not load picks.json.
export function previewFromHero(hero) {
  const p = hero?.pick;
  if (!p || (p.kind && p.kind !== 'BUY') || !/^[A-Z]{1,5}$/.test(String(p.ticker ?? '')) || !hero.issueDate) return null;
  const agreement = Array.isArray(p.agreeing) ? p.agreeing.length : null;
  if (agreement !== 3 && agreement !== 4) return null;
  return {
    no: p.no,
    kind: 'BUY',
    status: 'closed',
    ticker: p.ticker,
    issueDate: hero.issueDate,
    entry: { date: hero.issueDate },
    exitPlanned: addTradingDays(hero.issueDate, 21),
    agreement,
    disseminatedAt: hero.smsAt ?? null,
    sms: { en: hero.sms ?? null, sl: hero.smsSl ?? null },
  };
}

// The exact text, its GSM-7 analysis and the counter label ("154/160 GSM-7").
export function smsModel(kind, locale, data) {
  const text = renderSms(kind, locale, data);
  const a = analyze(text);
  const used = a.encoding === 'GSM-7' ? a.septets : a.units;
  const max = a.encoding === 'GSM-7' ? 160 : 70;
  return { text, encoding: a.encoding, used, max, segments: a.segments, nonGsm: a.nonGsm, label: `${used}/${max} ${a.encoding}`, ok: a.encoding === 'GSM-7' && used <= 160 };
}

export function buySms(pick, locale, token) {
  if (!pick) return null;
  return smsModel('BUY', locale, {
    no: pick.no,
    ticker: pick.ticker,
    issueDate: pick.issueDate,
    entryDate: pick.entry?.date ?? pick.issueDate,
    exitDate: pick.exitPlanned,
    agreement: pick.agreement,
    token,
  });
}

// A stop-link token for the demo: 6 base62 characters from a seed (deterministic in tests).
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export function demoToken(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 6; i++) s += B62[Math.floor(rand() * 62) % 62];
  return s;
}

// ---- live mode: where to resume from /api/me ----------------------------------------------------------------
// -> 'account' | 'country' | 'refused' | 'phone' | 'consent' | 'checkout' | 'activating' | 'done'
export function stepFromMe(me) {
  if (!me?.authenticated) return 'account';
  if (me.activation === 'active') return 'done';
  if (me.activation === 'pending') return 'activating';
  if (me.geo?.blocked?.length) return 'refused';
  if (!me.geo?.ok) return 'country';
  if (me.geo.smsEligible && !me.phone?.verified) return 'phone';
  const c = me.consents ?? {};
  if (!c.terms?.granted || !c.immediate_performance?.granted) return 'consent';
  return 'checkout';
}

// Which steps apply: phone and code only where text alerts are available.
export function stepsFor({ smsEligible = null } = {}) {
  return STEPS.map((id) => ({ id, applies: smsEligible === false ? id !== 'phone' && id !== 'code' : true }));
}

export function nextStep(current, { smsEligible = null } = {}) {
  const list = stepsFor({ smsEligible }).filter((s) => s.applies).map((s) => s.id);
  const i = list.indexOf(current);
  return i >= 0 && i < list.length - 1 ? list[i + 1] : 'done';
}

// ---- quiet hours (brief §2.5): texts only 08:00–21:00 recipient-local ------------------------------------------
// When a text queued at `now` goes out in a zone: now, or the next 08:00 there. -> { at: Date, held: boolean }
export function quietHoursAt(now, { tz = LJUBLJANA, from = 8, to = 21 } = {}) {
  const t = now instanceof Date ? now : new Date(now);
  const lj = formatInZone(t, tz);
  const hour = Number(lj.time.slice(0, 2));
  if (hour >= from && hour < to) return { at: t, held: false };
  const day = hour < from ? lj.date : addDays(lj.date, 1);
  return { at: zonedToInstant(day, `${String(from).padStart(2, '0')}:00`, tz), held: true };
}
