// Guard for AI-drafted text: every number in a thesis must come from the model data behind it.
// A draft that fails is regenerated once; if it fails again a named person writes the thesis.

const NUM_RE = /[+\-−]?\d[\d.,]*/g;

function parseToken(raw, locale) {
  let body = raw.replace(/^[+\-−]/, '').replace(/[.,]+$/, '');
  const negative = /^[-−]/.test(raw);
  let decimals = 0;
  if (locale === 'sl') {
    // Slovene: "." groups thousands, "," is the decimal mark.
    const [intPart, frac] = body.split(',');
    body = intPart.replace(/\./g, '') + (frac !== undefined ? `.${frac}` : '');
    decimals = frac ? frac.length : 0;
  } else {
    const [intPart, frac] = body.split('.');
    body = intPart.replace(/,/g, '') + (frac !== undefined ? `.${frac}` : '');
    decimals = frac ? frac.length : 0;
  }
  const value = Number(body);
  return { value: negative ? -value : value, decimals, signed: /^[+\-−]/.test(raw) };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// An allowed literal is removed only where it stands on its own: a literal that starts or ends with a
// letter or digit must not continue a longer word or number (the unit "t" never eats the "t" of "95th",
// "12" never the "12" of "2012").
function literalRe(s) {
  const edge = /^[\p{L}\p{N}]/u;
  const head = edge.test(s) ? '(?<![\\p{L}\\p{N}])' : '';
  const tail = edge.test(s.slice(-1)) ? '(?![\\p{L}\\p{N}])' : '';
  return new RegExp(`${head}${escapeRe(s)}${tail}`, 'gu');
}

/**
 * Numeric tokens as written, after removing any allowed literal strings.
 * @returns {{raw: string, value: number, decimals: number, signed: boolean, unit: '%'|'bps'|'ord'|''}[]}
 */
export function extractNumbers(text, { locale = 'en', allowStrings = [] } = {}) {
  let rest = String(text);
  for (const s of [...allowStrings].sort((a, b) => b.length - a.length)) {
    if (s) rest = rest.replace(literalRe(String(s)), ' ');
  }
  const out = [];
  for (const m of rest.matchAll(NUM_RE)) {
    const raw = m[0];
    const trimmed = raw.replace(/[.,]+$/, '');
    // the unit follows the number itself, so the ordinal dot of "96. percentil" is part of it
    const after = rest.slice(m.index + trimmed.length, m.index + trimmed.length + 12);
    let unit = '';
    if (/^\s?%/.test(after) || /^\s?odstot/i.test(after)) unit = '%';
    else if (/^\s?(bps|bp\b|b\.t\.)/i.test(after)) unit = 'bps';
    else if (/^(th|st|nd|rd)\b/.test(after) || /^\.\s?percentil/i.test(after)) unit = 'ord';
    if (!/\d/.test(trimmed)) continue;
    out.push({ raw: trimmed, ...parseToken(trimmed, locale), unit });
  }
  return out;
}

function roundTo(x, d) {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

function matches(token, source) {
  if (typeof source !== 'number' || !Number.isFinite(source)) return false;
  // A percentile rank written as an ordinal ("94th", "94. percentil") is truncated, not rounded
  // (core/format.js pctRank): 0.9486 is written as the 94th percentile, never the 95th.
  if (token.unit === 'ord' && token.decimals === 0 && !token.signed && source >= 0 && source <= 1 && Math.min(99, Math.floor(source * 100 + 1e-9)) === token.value) return true;
  const scales = token.unit === 'bps' ? [1, 10000] : token.unit === '%' || token.unit === 'ord' ? [100, 1] : [1, 100];
  for (const k of scales) {
    const cand = roundTo(source * k, token.decimals);
    const eps = 0.5 * 10 ** -token.decimals + 1e-9;
    if (Math.abs(cand - token.value) < 1e-9 || Math.abs(Math.abs(cand) - Math.abs(token.value)) < 1e-9) {
      // Written sign must agree with the data when a sign is written.
      if (token.signed && Math.sign(cand) !== Math.sign(token.value) && cand !== 0) continue;
      return true;
    }
    if (Math.abs(source * k - token.value) <= eps && !token.signed) return true;
  }
  return false;
}

/**
 * @param {string} text
 * @param {Array<number|string>} sources numbers from the model data (fractions or raw values);
 *        strings are treated as allowed literals (dates, pick numbers, "3/4", "21").
 * @param {{locale?: 'en'|'sl', allowStrings?: string[]}} [opts]
 * @returns {{ok: boolean, unknown: string[]}}
 */
export function validateNumbers(text, sources, { locale = 'en', allowStrings = [] } = {}) {
  const nums = sources.filter((s) => typeof s === 'number');
  const literals = sources.filter((s) => typeof s === 'string').concat(allowStrings);
  const unknown = [];
  for (const tok of extractNumbers(text, { locale, allowStrings: literals })) {
    if (!nums.some((s) => matches(tok, s))) unknown.push(tok.raw);
  }
  return { ok: unknown.length === 0, unknown };
}
