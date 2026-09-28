// Versioned legal texts shared by the web form and the server. The server stores the SHA-256
// of the exact template the user saw; a change here is a new version, never an edit in place.
// Slovene texts need review by counsel and a native speaker before launch.
import { sha256Hex } from './hash.js';

export const CONSENT_TEXTS = {
  sms: {
    version: 'v3',
    en:
      'Send me Quorum picks and exits by SMS to {phone}. Up to 16 messages a month, at 14:00 Ljubljana time ' +
      'on US trading days. You can switch this off at any time with the link in every message or in your ' +
      'account. SMS is not a condition of your subscription; you also get picks by email and push.',
    sl:
      'Pošiljajte mi Quorumove izbire in izhode po SMS na {phone}. Največ 16 sporočil na mesec, ob 14:00 po ' +
      'ljubljanskem času na dneve trgovanja v ZDA. Kadar koli jih lahko izklopite s povezavo v vsakem ' +
      'sporočilu ali v svojem računu. SMS ni pogoj za naročnino; izbire prejemate tudi po e-pošti in s ' +
      'potisnimi obvestili.',
  },
  terms: {
    version: 'v1',
    en:
      'I agree to the Terms of Service (v1) and have read the Privacy Notice (v1). Quorum publishes general ' +
      'research to the public. It is not personal investment advice and does not take my situation into account.',
    sl:
      'Strinjam se s Pogoji uporabe (v1) in sem prebral(a) Obvestilo o zasebnosti (v1). Quorum javnosti ' +
      'objavlja splošne raziskave. To ni osebno investicijsko svetovanje in ne upošteva mojih okoliščin.',
  },
  immediate_performance: {
    version: 'v1',
    en:
      'Start my subscription immediately. I understand that I can withdraw within 14 days with the withdrawal ' +
      'button in my account and receive a full refund of my first payment.',
    sl:
      'Naročnino začnite takoj. Razumem, da lahko v 14 dneh odstopim z gumbom za odstop v svojem računu in ' +
      'prejmem celotno vračilo prvega plačila.',
  },
};

export const CONSENT_KINDS = Object.keys(CONSENT_TEXTS);

export function consentTemplate(kind, locale) {
  const entry = CONSENT_TEXTS[kind];
  if (!entry) throw new Error(`consent: unknown kind ${kind}`);
  const text = entry[locale];
  if (!text) throw new Error(`consent: unknown locale ${locale}`);
  return text;
}

export function consentVersion(kind) {
  const entry = CONSENT_TEXTS[kind];
  if (!entry) throw new Error(`consent: unknown kind ${kind}`);
  return entry.version;
}

export function consentText(kind, locale, vars = {}) {
  return consentTemplate(kind, locale).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// Hash of the template (placeholders unfilled), so it is stable per kind, version and locale.
export async function consentHash(kind, locale) {
  return sha256Hex(consentTemplate(kind, locale));
}

// Country calling codes we sell in (and a few we refuse), longest first so +385 never reads as +38.
const CALLING_CODES = ['386', '385', '420', '421', '353', '358', '43', '49', '39', '33', '34', '31', '32', '45', '46', '47', '48', '30', '36', '40', '44', '61', '1'];

// "+38641234545" -> "+386 •• ••• 45"
export function maskPhone(e164) {
  const digits = String(e164).replace(/[\s()-]/g, '');
  if (!/^\+\d{6,15}$/.test(digits)) return '';
  const body = digits.slice(1);
  const cc = CALLING_CODES.find((c) => body.startsWith(c)) ?? body.slice(0, 3);
  return `+${cc} •• ••• ${body.slice(-2)}`;
}
