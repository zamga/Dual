// Number formatting shared by the web and the engine. Values are fractions (0.018 = 1.8 %).
// Plain functions use the ASCII hyphen for negatives (safe for SMS and CSV);
// the *Html variants use the true minus sign U+2212 for typeset pages.

const MINUS = '−';

function localise(s, locale) {
  if (locale !== 'sl') return s;
  // swap separators: 1,384.5 -> 1.384,5
  return s.replace(/[,.]/g, (c) => (c === ',' ? '.' : ','));
}

export function fmtNum(x, digits = 0, locale = 'en') {
  if (!Number.isFinite(x)) return '–';
  const s = Math.abs(x).toFixed(digits);
  const [i, f] = s.split('.');
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = localise(f ? `${grouped}.${f}` : grouped, locale);
  return `${x < 0 && Number(s) !== 0 ? '-' : ''}${body}`;
}

export function fmtInt(n, locale = 'en') {
  return fmtNum(Math.round(n), 0, locale);
}

export function fmtPct(x, { sign = false, digits = 1, locale = 'en' } = {}) {
  if (!Number.isFinite(x)) return '–';
  const v = x * 100;
  const body = fmtNum(Math.abs(v), digits, locale);
  const zero = Number(Math.abs(v).toFixed(digits)) === 0;
  const s = zero ? '' : v < 0 ? '-' : sign ? '+' : '';
  return `${s}${body}${locale === 'sl' ? ' %' : '%'}`;
}

export function fmtPctHtml(x, opts = {}) {
  return fmtPct(x, opts).replace(/^-/, MINUS);
}

export function fmtBps(bps, { sign = false, locale = 'en' } = {}) {
  if (!Number.isFinite(bps)) return '–';
  const r = Math.round(bps);
  const s = r < 0 ? '-' : sign && r > 0 ? '+' : '';
  return `${s}${fmtNum(Math.abs(r), 0, locale)}${locale === 'sl' ? ' b.t.' : ' bps'}`;
}

export function fmtUsd(x, { digits = 2, locale = 'en' } = {}) {
  if (!Number.isFinite(x)) return '–';
  const body = fmtNum(Math.abs(x), digits, locale);
  const s = x < 0 ? '-' : '';
  return locale === 'sl' ? `${s}${body} $` : `${s}$${body}`;
}

export function fmtEur(x, { digits = 0, locale = 'en' } = {}) {
  if (!Number.isFinite(x)) return '–';
  const body = fmtNum(Math.abs(x), digits, locale);
  const s = x < 0 ? '-' : '';
  return locale === 'sl' ? `${s}${body} €` : `${s}€${body}`;
}

// 0.962 -> "96" (the percentile a family gave a stock)
export function fmtPctRank(p) {
  if (!Number.isFinite(p)) return '–';
  return String(Math.min(100, Math.max(0, Math.round(p * 100))));
}

export function arrow(x) {
  if (!Number.isFinite(x) || x === 0) return '→';
  return x > 0 ? '↑' : '↓';
}

export function signClass(x) {
  if (!Number.isFinite(x) || x === 0) return 'flat';
  return x > 0 ? 'gain' : 'loss';
}
