// Fictional company names, tickers and identifiers. Names are built from invented or landscape
// words plus a sector word, so they read like listed companies without being any real one.
import { REAL_TICKER_SET, REAL_NAME_WORDS } from './blocklist.js';

const HEADS = ['Kar', 'Tal', 'Bren', 'Osk', 'Veld', 'Quil', 'Nor', 'Tes', 'Hal', 'Mer', 'Cal', 'Dra', 'Fen', 'Gal',
  'Ist', 'Jor', 'Lum', 'Mar', 'Ost', 'Pel', 'Ras', 'Sel', 'Tor', 'Ul', 'Var', 'Wen', 'Yar', 'Zel', 'Ard', 'Bel',
  'Cor', 'Dun', 'El', 'Fal', 'Gor', 'Hes', 'Ir', 'Kel', 'Lor', 'Mon', 'Nev', 'Or', 'Pra', 'Rho', 'Sil', 'Tam',
  'Vor', 'Wyn', 'Ask', 'Brae', 'Cald', 'Dav', 'Ev', 'Frey', 'Gra', 'Hollis', 'Ivel', 'Kess', 'Lind', 'Myr'];
const TAILS = ['st', 'vik', 'moor', 'erry', 'mar', 'lon', 'row', 'sary', 'den', 'ric', 'ven', 'ith', 'wick',
  'gate', 'holt', 'mere', 'dale', 'ford', 'ley', 'ton', 'wyn', 'dor', 'ra', 'ix', 'ane', 'ova', 'ent', 'ara',
  'ium', 'eon', 'is', 'ay', 'brook', 'field', 'haven', 'more', 'croft', 'shaw', 'by', 'thorne'];
const PLAIN = ['Karst', 'Talus', 'Scree', 'Cairn', 'Moraine', 'Loess', 'Tarn', 'Esker', 'Drumlin', 'Fell',
  'Harbor', 'Ridge', 'Cedar', 'Granite', 'Lantern', 'Sable', 'Osprey', 'Heron', 'Kestrel', 'Tamarack', 'Birch',
  'Linden', 'Cobalt', 'Basalt', 'Quarry', 'Northwind', 'Larkspur', 'Fjord', 'Glacier', 'Mesa', 'Canyon',
  'Prairie', 'Orchard', 'Bramble', 'Thistle', 'Ember', 'Halcyon', 'Solstice', 'Zephyr', 'Wren', 'Alder',
  'Hawthorn', 'Marram', 'Shale', 'Flint', 'Quartz', 'Tidemark', 'Saltmarsh', 'Bluestem', 'Ironwood', 'Silverleaf',
  'Stonecrop', 'Driftwood', 'Longreach', 'Highmoor', 'Westerly', 'Easterling', 'Brightwell', 'Coldspring', 'Redfern'];

export const SECTOR_WORDS = [
  ['Software', 'Systems', 'Semiconductor', 'Microdevices', 'Networks', 'Data', 'Robotics', 'Photonics', 'Analytics',
    'Computing', 'Instruments', 'Digital', 'Cyber', 'Sensors', 'Circuits'],
  ['Biologics', 'Therapeutics', 'Pharma', 'Medical', 'Health', 'Diagnostics', 'Genomics', 'Biosciences',
    'Surgical', 'Life Sciences', 'Labs', 'Biotherapies', 'Care'],
  ['Bancorp', 'Financial', 'Capital', 'Insurance', 'Trust', 'Asset Management', 'Credit', 'Payments', 'Re',
    'Savings', 'Assurance', 'Lending'],
  ['Brands', 'Retail', 'Apparel', 'Motors', 'Leisure', 'Hospitality', 'Outfitters', 'Auto Parts', 'Resorts',
    'Stores', 'Footwear', 'Living', 'Outdoor'],
  ['Media', 'Broadcasting', 'Communications', 'Telecom', 'Interactive', 'Studios', 'Publishing', 'Wireless',
    'Entertainment'],
  ['Industries', 'Aerospace', 'Logistics', 'Machinery', 'Freight', 'Engineering', 'Controls', 'Rail', 'Defense',
    'Tools', 'Air Systems', 'Construction', 'Fluid Power', 'Marine'],
  ['Foods', 'Beverages', 'Farms', 'Household', 'Grocers', 'Provisions', 'Nutrition', 'Consumer', 'Dairy',
    'Bakeries'],
  ['Energy', 'Petroleum', 'Resources', 'Midstream', 'Drilling', 'Oil & Gas', 'Offshore', 'Pipeline',
    'Exploration', 'Hydrocarbons'],
  ['Power', 'Utilities', 'Electric', 'Water', 'Gas & Electric', 'Energy Services', 'Grid'],
  ['Properties', 'REIT', 'Residential', 'Land', 'Office Trust', 'Storage', 'Realty Trust', 'Logistics Parks',
    'Towers'],
  ['Materials', 'Chemicals', 'Minerals', 'Mining', 'Metals', 'Steel', 'Packaging', 'Paper', 'Coatings',
    'Polymers', 'Aggregates'],
];

const SUFFIXES = ['Inc.', 'Inc.', 'Inc.', 'Corp.', 'Corp.', 'Co.', 'Holdings Inc.', 'Group Inc.', 'Ltd.'];

function stem(rng) {
  if (rng.u() < 0.45) return rng.pick(PLAIN);
  return rng.pick(HEADS) + rng.pick(TAILS);
}

/** Generate a unique fictional company name for a sector. `used` is a Set of names already taken. */
export function makeName(rng, sector, used) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const s1 = stem(rng);
    if (REAL_NAME_WORDS.has(s1.toLowerCase())) continue;
    let second = '';
    if (rng.u() < 0.35) {
      const s2 = rng.pick(PLAIN);
      if (s2 === s1 || REAL_NAME_WORDS.has(s2.toLowerCase())) continue;
      second = ` ${s2}`;
    }
    const word = rng.pick(SECTOR_WORDS[sector]);
    const name = `${s1}${second} ${word} ${rng.pick(SUFFIXES)}`;
    const key = `${s1}${second} ${word}`;
    if (used.has(key)) continue;
    used.add(key);
    return { name, stems: [s1, second.trim()].filter(Boolean), word };
  }
  throw new Error('name space exhausted');
}

const CONS = /[^AEIOU]/;

/** Ticker candidates derived from a name, most natural first. */
function tickerCandidates({ stems, word }) {
  const a = stems[0].toUpperCase().replace(/[^A-Z]/g, '');
  const b = (stems[1] || '').toUpperCase().replace(/[^A-Z]/g, '');
  const w = word.toUpperCase().replace(/[^A-Z]/g, '');
  const skeleton = a[0] + a.slice(1).split('').filter((c) => CONS.test(c)).join('');
  const out = [];
  if (b) out.push(a[0] + b[0] + w[0], a.slice(0, 2) + b[0] + w[0], a[0] + b.slice(0, 2) + w[0]);
  out.push(a.slice(0, 4), skeleton.slice(0, 4), a.slice(0, 3), a.slice(0, 3) + w[0], skeleton.slice(0, 3) + w[0]);
  out.push(a.slice(0, 2) + w.slice(0, 2), a[0] + w.slice(0, 3), a.slice(0, 5), skeleton.slice(0, 5), a.slice(0, 2));
  return out.filter((t) => t.length >= 2 && t.length <= 5 && /^[A-Z]+$/.test(t));
}

export function isBlockedTicker(t) {
  return REAL_TICKER_SET.has(t);
}

/** Derive a unique ticker (2-5 letters) not on the real-ticker blocklist. */
export function makeTicker(rng, nameInfo, usedTickers) {
  for (const t of tickerCandidates(nameInfo)) {
    if (!usedTickers.has(t) && !isBlockedTicker(t)) {
      usedTickers.add(t);
      return t;
    }
  }
  const letters = (nameInfo.stems.join('') + nameInfo.word).toUpperCase().replace(/[^A-Z]/g, '');
  for (let attempt = 0; attempt < 500; attempt++) {
    const len = 3 + Math.floor(rng.u() * 2);
    let t = letters[0];
    while (t.length < len) t += rng.u() < 0.7 ? letters[Math.floor(rng.u() * letters.length)] : String.fromCharCode(65 + Math.floor(rng.u() * 26));
    if (!usedTickers.has(t) && !isBlockedTicker(t)) {
      usedTickers.add(t);
      return t;
    }
  }
  throw new Error('ticker space exhausted');
}

// ---- identifiers -------------------------------------------------------------------------------

const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const FIGI_CHARS = 'BCDFGHJKLMNPQRSTVWXYZ0123456789';

/** ISIN check digit (Luhn over the letters-to-digits expansion) for an 11-character body. */
export function isinCheckDigit(body) {
  let digits = '';
  for (const ch of body) digits += ch >= '0' && ch <= '9' ? ch : String(ch.charCodeAt(0) - 55);
  let sum = 0;
  let dbl = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidIsin(isin) {
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin) && isinCheckDigit(isin.slice(0, 11)) === Number(isin[11]);
}

/** 'ZZ' (user-assigned country code) + 9 alphanumerics + check digit. */
export function makeIsin(rng, used) {
  for (;;) {
    let body = 'ZZ';
    for (let k = 0; k < 9; k++) body += ALNUM[Math.floor(rng.u() * ALNUM.length)];
    const isin = body + isinCheckDigit(body);
    if (!used.has(isin)) {
      used.add(isin);
      return isin;
    }
  }
}

/** 'SIM' + 9 characters (consonants and digits, as FIGIs avoid vowels). */
export function makeFigi(rng, used) {
  for (;;) {
    let f = 'SIM';
    for (let k = 0; k < 9; k++) f += FIGI_CHARS[Math.floor(rng.u() * FIGI_CHARS.length)];
    if (!used.has(f)) {
      used.add(f);
      return f;
    }
  }
}
