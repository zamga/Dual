// Pure helpers for the Research explorer (#app-research): universe.json rows as objects, filtering,
// sorting (nulls last), the screener summary, the CSV for personal use and the virtual window.
// No DOM: tested in Node (tests/web/universe.test.js).
//
// SL: first draft, needs native review.

export const FAMILIES = ['A', 'B', 'C', 'D'];
export const VETOES = ['days_to_cover', 'idio_vol', 'earnings_within_3d', 'pending_ma', 'llm_48h'];

export const VETO_LABEL = {
  days_to_cover: { en: 'Days to cover', sl: 'Dnevi pokritja', short: { en: 'Short int.', sl: 'Pokritje' } },
  idio_vol: { en: 'Idiosyncratic volatility', sl: 'Idiosinkratska volatilnost', short: { en: 'Idio vol', sl: 'Volat.' } },
  earnings_within_3d: { en: 'Earnings within 3 days', sl: 'Rezultati v 3 dneh', short: { en: 'Earnings', sl: 'Rezult.' } },
  pending_ma: { en: 'Pending merger or acquisition', sl: 'Napovedana prevzem ali združitev', short: { en: 'M&A', sl: 'Prevzem' } },
  llm_48h: { en: 'Negative news, 48 hours (stand-in)', sl: 'Negativne novice, 48 ur (nadomestek)', short: { en: 'News*', sl: 'Novice*' } },
};

export const SECTOR_SL = {
  'Information Technology': 'Informacijska tehnologija',
  Industrials: 'Industrija',
  Financials: 'Finance',
  'Health Care': 'Zdravstvo',
  'Consumer Discretionary': 'Necikl. potrošnja',
  'Real Estate': 'Nepremičnine',
  Materials: 'Materiali',
  'Communication Services': 'Komunikacijske storitve',
  'Consumer Staples': 'Osnovna potrošnja',
  Energy: 'Energija',
  Utilities: 'Javne storitve',
};

export function sectorL(sector, locale) {
  return locale === 'sl' ? (SECTOR_SL[sector] ?? sector) : sector;
}

// universe.json -> [{ i, ticker, name, sector, A, B, C, D, agree, veto, mcap, adv60, ret21 }]
// Read by column name, so a reordered or extended export still works; missing columns are null.
export function universeRows(u) {
  const cols = Array.isArray(u?.cols) ? u.cols : [];
  const at = (name) => cols.indexOf(name);
  const idx = Object.fromEntries(['ticker', 'name', 'sector', ...FAMILIES, 'agree', 'veto', 'mcap', 'adv60', 'ret21'].map((k) => [k, at(k)]));
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return (Array.isArray(u?.rows) ? u.rows : []).map((r, i) => {
    const get = (k) => (idx[k] >= 0 ? r[idx[k]] : null);
    const o = { i, ticker: String(get('ticker') ?? ''), name: String(get('name') ?? ''), sector: String(get('sector') ?? '') };
    for (const f of FAMILIES) o[f] = num(get(f));
    const agree = num(get('agree'));
    o.agree = agree ?? null;
    o.veto = get('veto') || null;
    o.mcap = num(get('mcap'));
    o.adv60 = num(get('adv60'));
    o.ret21 = num(get('ret21'));
    return o;
  });
}

// Agreement recomputed from the percentiles when the export does not carry it.
export function agreementOf(row, topPct) {
  if (Number.isFinite(row.agree)) return row.agree;
  if (!Number.isFinite(topPct)) return null;
  return FAMILIES.filter((f) => Number.isFinite(row[f]) && row[f] >= topPct).length;
}

// A percentile as the page prints it: floored to one decimal, so "95.0" appears only at or above 0.95.
export function pctl(p) {
  if (!Number.isFinite(p)) return '–';
  return (Math.floor(p * 1000 + 1e-9) / 10).toFixed(1);
}

export function defaultFilters() {
  return { q: '', sector: 'all', agree: 'all', veto: 'all', ranges: Object.fromEntries(FAMILIES.map((f) => [f, [0, 100]])) };
}

export function isDefault(f) {
  const d = defaultFilters();
  return (
    !String(f.q ?? '').trim() &&
    f.sector === d.sector &&
    String(f.agree) === d.agree &&
    f.veto === d.veto &&
    FAMILIES.every((k) => f.ranges?.[k]?.[0] === 0 && f.ranges?.[k]?.[1] === 100)
  );
}

// Presets: one click to a useful screen. Ranges in percentile points.
export function preset(id, topPct = 0.95) {
  const f = defaultFilters();
  const top = Math.round(topPct * 100);
  if (id === 'quorum') f.agree = '3';
  else if (id === 'near') {
    f.agree = '2';
    f.veto = 'none';
  } else if (id === 'vetoed') {
    f.agree = '2';
    f.veto = 'any';
  } else if (id === 'trend') f.ranges.A = [top, 100];
  return f;
}

// filters: { q, sector: 'all'|name, agree: 'all'|'0'..'4' (at least), veto: 'all'|'none'|'any'|key,
//            ranges: { A: [lo, hi] (0–100 inclusive) … } }
export function filterUniverse(rows, f = defaultFilters()) {
  const q = String(f.q ?? '').trim().toLowerCase();
  const minAgree = f.agree === 'all' || f.agree == null ? null : Number(f.agree);
  const ranges = FAMILIES.map((k) => [k, f.ranges?.[k] ?? [0, 100]]).filter(([, r]) => r[0] > 0 || r[1] < 100);
  return rows.filter((r) => {
    if (f.sector && f.sector !== 'all' && r.sector !== f.sector) return false;
    if (minAgree !== null && !((r.agree ?? 0) >= minAgree)) return false;
    if (f.veto === 'none' && r.veto) return false;
    if (f.veto === 'any' && !r.veto) return false;
    if (f.veto && !['all', 'none', 'any'].includes(f.veto) && r.veto !== f.veto) return false;
    for (const [k, [lo, hi]] of ranges) {
      const v = r[k];
      if (!Number.isFinite(v)) return false;
      const p = v * 100;
      if (p < lo - 1e-9 || p > hi + 1e-9) return false;
    }
    if (q) return r.ticker.toLowerCase().startsWith(q) || r.name.toLowerCase().includes(q);
    return true;
  });
}

const KEY = {
  ticker: (r) => r.ticker,
  name: (r) => r.name,
  sector: (r) => r.sector,
  A: (r) => r.A,
  B: (r) => r.B,
  C: (r) => r.C,
  D: (r) => r.D,
  agree: (r) => r.agree,
  veto: (r) => r.veto,
  mcap: (r) => r.mcap,
  adv60: (r) => r.adv60,
  ret21: (r) => r.ret21,
  combined: (r) => combined(r),
};
export const SORT_KEYS = Object.keys(KEY);

export function combined(r) {
  const v = FAMILIES.map((f) => r[f]).filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

// Nulls last in both directions; ties by ticker so the order is stable.
export function sortUniverse(rows, key = 'agree', dir = 'desc') {
  const get = KEY[key] ?? KEY.agree;
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    const na = va === null || va === undefined;
    const nb = vb === null || vb === undefined;
    if (na !== nb) return na ? 1 : -1;
    if (!na && va !== vb) return (va < vb ? -1 : 1) * sign;
    if (key === 'agree') {
      const ca = combined(a) ?? -1;
      const cb = combined(b) ?? -1;
      if (ca !== cb) return (ca < cb ? -1 : 1) * sign;
    }
    return a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0;
  });
}

function median(xs) {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// The screener summary of a set of rows.
//   -> { n, byAgree: [n0..n4], quorum, met, blocked, vetoed, byVeto: {key: n}, sectors: [[name, n]] (desc),
//        median: {A,B,C,D,ret21}, inTop: {A,B,C,D} }
// quorum counts every row at 3/4 or 4/4; met counts those with no veto (they met the rule: the only rows
// the explorer draws in the quorum colour); blocked counts those a veto kept out.
export function meetsRule(r) {
  return (r?.agree ?? 0) >= 3 && !r?.veto;
}

export function summarize(rows, topPct = 0.95) {
  const byAgree = [0, 0, 0, 0, 0];
  const byVeto = Object.fromEntries(VETOES.map((k) => [k, 0]));
  const sectors = new Map();
  const inTop = Object.fromEntries(FAMILIES.map((f) => [f, 0]));
  let vetoed = 0;
  for (const r of rows) {
    const a = Math.max(0, Math.min(4, r.agree ?? 0));
    byAgree[a]++;
    if (r.veto) {
      vetoed++;
      byVeto[r.veto] = (byVeto[r.veto] ?? 0) + 1;
    }
    sectors.set(r.sector, (sectors.get(r.sector) ?? 0) + 1);
    for (const f of FAMILIES) if (Number.isFinite(r[f]) && r[f] >= topPct) inTop[f]++;
  }
  const met = rows.filter(meetsRule).length;
  return {
    n: rows.length,
    byAgree,
    quorum: byAgree[3] + byAgree[4],
    met,
    blocked: byAgree[3] + byAgree[4] - met,
    vetoed,
    byVeto,
    sectors: [...sectors.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)),
    median: { ...Object.fromEntries(FAMILIES.map((f) => [f, median(rows.map((r) => r[f]))])), ret21: median(rows.map((r) => r.ret21)) },
    inTop,
  };
}

// CSV for personal use. RFC 4180 quoting; numbers as published (fractions); a first comment line says
// what the file is and that it may not be redistributed.
export function universeCsv(rows, { date = '', scoresAsOf = '' } = {}) {
  const q = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['date', 'ticker', 'name', 'sector', ...FAMILIES, 'agree', 'veto', 'mcap', 'adv60', 'ret21', 'simulated', 'fictional'];
  const lines = [
    `# Quorum Research universe ${date}${scoresAsOf ? ` (scores as of ${scoresAsOf})` : ''}. Simulated market, fictional companies. Personal use only; no redistribution.`,
    head.join(','),
  ];
  for (const r of rows) lines.push([date, r.ticker, r.name, r.sector, ...FAMILIES.map((f) => r[f]), r.agree, r.veto, r.mcap, r.adv60, r.ret21, 'true', 'true'].map(q).join(','));
  return `${lines.join('\n')}\n`;
}

// The virtual window: which rows to render for a scroll position. -> { start, end } (end exclusive)
export function visibleRange(scrollTop, viewH, rowH, n, overscan = 6) {
  if (!n || rowH <= 0) return { start: 0, end: 0 };
  const first = Math.floor(Math.max(0, scrollTop) / rowH);
  const count = Math.ceil(Math.max(0, viewH) / rowH) + 1;
  const start = Math.max(0, first - overscan);
  const end = Math.min(n, first + count + overscan);
  return { start: Math.min(start, end), end };
}

// Compact money: 5581029242 -> '$5.6B'; 1.67e12 -> '$1.7T'; 28969898 -> '$29M'.
export function money(x, locale = 'en') {
  if (!Number.isFinite(x)) return '–';
  const a = Math.abs(x);
  const [v, u] = a >= 1e12 ? [a / 1e12, 'T'] : a >= 1e9 ? [a / 1e9, 'B'] : a >= 1e6 ? [a / 1e6, 'M'] : [a / 1e3, 'K'];
  const s = (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(0) : v.toFixed(1)).replace(/\.0$/, '');
  const body = locale === 'sl' ? s.replace('.', ',') : s;
  // SL: the column heads say "($)", so a cell stays short enough for its column: "5,6 mrd".
  const unit = locale === 'sl' ? { T: '\u00a0bil.', B: '\u00a0mrd', M: '\u00a0mio', K: '\u00a0tis.' }[u] : u;
  return locale === 'sl' ? `${body}${unit}` : `$${body}${unit}`;
}
