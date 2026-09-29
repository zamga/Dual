// The only SMS texts Quorum ever sends. Every one is GSM-7 basic set and a single segment
// at worst-case lengths (5-char ticker, 5-digit number), which scripts/check-sms-templates.js proves.
import { analyze, isGsm7Basic } from './gsm7.js';
import { issueSlot, fmtDDMMYY, fmtDDMM, fmtDM } from './calendar.js';

export const LINK_DOMAIN = 'qrm.si';
export const SENDER_ID = 'QUORUM';
export const MAX_MONTHLY_MESSAGES = 16;
export const KINDS = ['BUY', 'CLOSE', 'RENEW', 'OPT_IN', 'OPT_OUT'];
export const LOCALES = ['en', 'sl'];

const L = LINK_DOMAIN;

// The Slovene CLOSE, RENEW and OPT_OUT texts are ASCII transliterations
// (ZAPRTJE, PODALJSANJE, Se vedno, Ni vec, Narocnina) and need review by a native speaker.
const TEMPLATES = {
  BUY: {
    en: (d) =>
      `QUORUM #${d.no} BUY ${d.ticker} ${fmtDDMMYY(d.issueDate)} 14:00 ${d.tz}. ` +
      `Entry: US open ${fmtDDMM(d.entryDate)} Exit: US open ${fmtDDMM(d.exitDate)} ` +
      `${d.agreement}/4 models. Not personal advice: ${L}/p/${d.no} Stop: ${L}/u/${d.token}`,
    sl: (d) =>
      `QUORUM #${d.no} NAKUP ${d.ticker} ${fmtDDMMYY(d.issueDate)} 14:00 ${d.tz}. ` +
      `Vstop: odprtje ZDA ${fmtDM(d.entryDate)} Izstop: ${fmtDM(d.exitDate)} ` +
      `${d.agreement}/4 modelov. Ni osebni nasvet: ${L}/p/${d.no} Odjava: ${L}/u/${d.token}`,
  },
  CLOSE: {
    en: (d) =>
      `QUORUM #${d.no} CLOSE ${d.ticker} at US open ${fmtDDMMYY(d.issueDate)} (21-day rule set at entry). ` +
      `Result: ${L}/p/${d.no} Not personal advice. Stop: ${L}/u/${d.token}`,
    sl: (d) =>
      `QUORUM #${d.no} ZAPRTJE ${d.ticker} ob odprtju ZDA ${fmtDDMMYY(d.issueDate)} (pravilo 21 dni ob vstopu). ` +
      `Rezultat: ${L}/p/${d.no} Ni osebni nasvet. Odjava: ${L}/u/${d.token}`,
  },
  RENEW: {
    en: (d) =>
      `QUORUM #${d.no} RENEW ${d.ticker} ${fmtDDMMYY(d.issueDate)} 14:00 ${d.tz}. ` +
      `Still ${d.agreement}/4 models. New exit: US open ${fmtDDMM(d.exitDate)} ` +
      `Not personal advice: ${L}/p/${d.no} Stop: ${L}/u/${d.token}`,
    sl: (d) =>
      `QUORUM #${d.no} PODALJSANJE ${d.ticker} ${fmtDDMMYY(d.issueDate)} 14:00 ${d.tz}. ` +
      `Se vedno ${d.agreement}/4 modelov. Nov izstop: ${fmtDM(d.exitDate)} ` +
      `Ni osebni nasvet: ${L}/p/${d.no} Odjava: ${L}/u/${d.token}`,
  },
  OPT_IN: {
    en: (d) =>
      `QUORUM: SMS alerts ON. Max 16 msgs/month (picks + exits), 14:00 Ljubljana time on US trading days. ` +
      `Replies not read. Stop: ${L}/u/${d.token} Help: ${L}/help`,
    sl: (d) =>
      `QUORUM: SMS obvestila VKLOPLJENA. Najvec 16 SMS/mesec (izbire in izhodi), ob 14:00 na dneve trgovanja v ZDA. ` +
      `Odgovorov ne beremo. Odjava: ${L}/u/${d.token}`,
  },
  OPT_OUT: {
    en: () => `QUORUM: SMS alerts OFF. No more texts. Your subscription is unchanged: ${L}/account`,
    sl: () => `QUORUM: SMS obvestila IZKLOPLJENA. Ni vec SMS. Narocnina ostaja nespremenjena: ${L}/account`,
  },
};

const NO_RE = /^\d{4,5}$/;
const TICKER_RE = /^[A-Z]{1,5}$/;
const TOKEN_RE = /^[0-9A-Za-z]{6,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function renderSms(kind, locale, data = {}) {
  const byLocale = TEMPLATES[kind];
  if (!byLocale) throw new Error(`renderSms: unknown kind ${kind}`);
  const tpl = byLocale[locale];
  if (!tpl) throw new Error(`renderSms: unknown locale ${locale}`);
  const d = { ...data };
  if (kind === 'BUY' || kind === 'CLOSE' || kind === 'RENEW') {
    if (!NO_RE.test(String(d.no))) throw new Error(`renderSms: pick number must be 4-5 digits, got ${d.no}`);
    if (!TICKER_RE.test(String(d.ticker))) throw new Error(`renderSms: ticker must be 1-5 capital letters, got ${d.ticker}`);
    if (!DATE_RE.test(String(d.issueDate))) throw new Error('renderSms: issueDate must be YYYY-MM-DD');
    d.tz = issueSlot(d.issueDate).tzLabel;
    d.entryDate = d.entryDate ?? d.issueDate;
    if ((kind === 'BUY' || kind === 'RENEW') && !DATE_RE.test(String(d.exitDate))) {
      throw new Error('renderSms: exitDate must be YYYY-MM-DD');
    }
    if ((kind === 'BUY' || kind === 'RENEW') && ![3, 4].includes(d.agreement)) {
      throw new Error('renderSms: agreement must be 3 or 4');
    }
  }
  if (kind !== 'OPT_OUT' && !TOKEN_RE.test(String(d.token))) {
    throw new Error('renderSms: token must be at least 6 base62 characters');
  }
  return tpl(d);
}

const FORBIDDEN = [
  'now',
  'act',
  'hurry',
  'urgent',
  'last chance',
  'guaranteed',
  'for you',
  'today only',
  'limited',
  // Slovene equivalents (ASCII, as they would appear in an SMS)
  'zdaj',
  'takoj',
  'hitro',
  'zadnja priloznost',
  'zagotovljeno',
  'za vas',
  'omejeno',
];

// Price targets, return claims and urgency (brief §2.5: no prices or targets, no return claims, no
// urgency). Whole words, any case; a trailing "s" (plural) is covered where it reads naturally.
const CLAIM_WORDS = [
  ['target', 'targets?'],
  ['upside', 'upside'],
  ['return', 'returns?'],
  ['gain', 'gains?'],
  ['profit', 'profits?|profitable'],
  ['sure', 'sure|surely'],
  ['immediately', 'immediately'],
  ['today', 'today'],
  ['fast', 'fast'],
  // Slovene (ASCII, as it would appear in an SMS)
  ['cilj', 'cilj|cilja|ciljna|ciljno'],
  ['donos', 'donos|donosa|donosi'],
  ['dobicek', 'dobicek|dobicka'],
  ['zasluzek', 'zasluzek|zasluzka'],
  ['zanesljivo', 'zanesljivo|gotovo'],
  ['danes', 'danes'],
];

const CURRENCY_RE = /[$€£¥¤]|\b(?:USD|EUR|GBP)\b/;
const LINKISH_RE = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?$/i;
// Dates as the templates write them: 28.09.26, 28.09. and 28.9. (day 1-31, month 1-12).
const DATE_TOKEN_RE = /(?<![\d.,])(?:0?[1-9]|[12]\d|3[01])\.(?:0?[1-9]|1[0-2])\.(?:\d{2}(?![\d.,]*\d))?/g;
// A number with a decimal part (123.45, 12,5): a price, a target or a return once dates are removed.
const DECIMAL_RE = /\d[.,]\d/;

/** The text without its link-like tokens and dates: what is left must carry no price-like number. */
function numbersOutsideDatesAndLinks(text) {
  const words = text.split(/\s+/).filter((raw) => !LINKISH_RE.test(raw.replace(/[),.;:!?]+$/, '').replace(/^[(]+/, '')));
  return words.join(' ').replace(DATE_TOKEN_RE, ' ');
}

export function validateSms(text) {
  const errors = [];
  const analysis = analyze(text);
  if (!isGsm7Basic(text)) {
    const bad = analysis.nonGsm.concat(analysis.extChars).map((c) => JSON.stringify(c.char));
    errors.push(`outside the GSM-7 basic set: ${[...new Set(bad)].join(' ')}`);
  }
  if (analysis.encoding !== 'GSM-7' || analysis.septets > 160) {
    errors.push(`longer than one segment (${analysis.septets ?? analysis.units} ${analysis.encoding === 'GSM-7' ? 'septets' : 'UCS-2 units'})`);
  }
  const lower = text.toLowerCase();
  for (const w of FORBIDDEN) {
    const re = new RegExp(`(^|[^a-z0-9])${w.replace(/ /g, '\\s+')}($|[^a-z0-9])`, 'i');
    if (re.test(lower)) errors.push(`forbidden word: "${w}"`);
  }
  for (const [label, pattern] of CLAIM_WORDS) {
    if (new RegExp(`(^|[^a-z0-9])(?:${pattern})($|[^a-z0-9])`, 'i').test(lower)) errors.push(`forbidden word: "${label}" (targets, return claims and urgency are not allowed)`);
  }
  if (CURRENCY_RE.test(text)) errors.push('contains a currency sign or code (no prices in SMS)');
  if (DECIMAL_RE.test(numbersOutsideDatesAndLinks(text))) errors.push('contains a price-like decimal number (no prices, targets or returns in SMS)');
  if (text.includes('%')) errors.push('contains a percent sign (no return claims in SMS)');
  if (text.includes('!')) errors.push('contains an exclamation mark (no urgency in SMS)');
  if (/\p{Extended_Pictographic}/u.test(text)) errors.push('contains an emoji');
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/[),.;:!?]+$/, '').replace(/^[(]+/, '');
    if (!LINKISH_RE.test(token)) continue;
    const host = token.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
    if (host !== LINK_DOMAIN) errors.push(`link outside ${LINK_DOMAIN}: ${token}`);
  }
  return { ok: errors.length === 0, errors, analysis };
}

// The longest text each template can produce: 5-digit number, 5-letter ticker,
// two-digit day and month everywhere, the CEST label, an 8-character token.
export function worstCase(kind, locale) {
  return renderSms(kind, locale, {
    no: '99999',
    ticker: 'WWWWW',
    issueDate: '2026-10-23',
    entryDate: '2026-10-23',
    exitDate: '2026-11-23',
    agreement: 4,
    token: 'ZZZZZZZZ',
  });
}
