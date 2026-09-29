#!/usr/bin/env node
// Contract-shaped PLACEHOLDER data for web/data/*.json (docs/ARCHITECTURE.md §3), so the web can be
// built before the engine export exists. Deterministic from a seed; hashes are real (core/ledger.js)
// so "Verify in your browser" works against it.
//
// Safety: every file written here carries "fixture": true (top level, or on every row for the two
// array files). An existing file WITHOUT that marker is the engine's real export and is never
// overwritten. Run: node scripts/fixture-data.js [--out dir] [--force-fixture-only]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32, normal, hashSeed, seededShuffle } from '../core/random.js';
import {
  tradingDaysBetween, addTradingDays, issueSlot, countTradingDays, prevTradingDay, formatInZone, zonedToInstant, NEW_YORK,
} from '../core/calendar.js';
import { createEntry, merkleRoot, commitment, GENESIS_HASH } from '../core/ledger.js';
import { renderSms } from '../core/sms-templates.js';
import { isRealTicker } from '../engine/sim/blocklist.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = 20260928;
const AS_OF = '2026-09-28';
const SEALED_FROM = '2025-10-01';
const HOLDOUT = { from: '2022-10-03', to: '2025-09-30' };
const SMS_TOKEN = '7Kq2xZ';
const FAMS = ['A', 'B', 'C', 'D'];
const FORCE_QUORUM = new Set(['2026-09-02', '2026-09-09', '2026-09-16', '2026-09-22', '2026-09-28']);

export const FILES = ['meta', 'summary', 'issues', 'ledger', 'picks', 'scoreboard', 'deciles', 'hero', 'universe', 'backtest'];

// ---- helpers -------------------------------------------------------------------------------------

const r4 = (x) => Math.round(x * 1e4) / 1e4;
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const pad4 = (n) => String(n).padStart(4, '0');

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function median(v) {
  return quantile([...v].sort((a, b) => a - b), 0.5);
}

function mean(v) {
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

function wilson(k, n) {
  if (!n) return [0, 0];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [r4(clamp(c - h, 0, 1)), r4(clamp(c + h, 0, 1))];
}

// Real tickers the generator must never produce: the engine's blocklist and the list of real US symbols.
const BLOCK = { has: isRealTicker };

// Invented company roots (syllable + ending). Checked by eye against well-known issuers.
const ROOT_A = ['Al', 'Bran', 'Cor', 'Del', 'Es', 'Fen', 'Gar', 'Hal', 'Is', 'Jor', 'Kes', 'Lar', 'Mor', 'Net', 'Or', 'Pel', 'Quil', 'Ros', 'Sel', 'Thorn', 'Ul', 'Var', 'Wex', 'Yar', 'Zen', 'Brek', 'Cal', 'Dun', 'Ember', 'Grey'];
const ROOT_B = ['dale', 'ford', 'mere', 'wick', 'ton', 'ridge', 'holt', 'bury', 'vard', 'ven', 'ane', 'ock', 'ion', 'edo', 'sin', 'row', 'vin', 'kar', 'mont', 'stead'];
const SUFFIX = {
  Industrials: ['Instruments', 'Industrial', 'Machine Works', 'Logistics', 'Rail Systems', 'Aerostructures'],
  'Information Technology': ['Systems', 'Semiconductor', 'Software', 'Networks', 'Photonics', 'Data'],
  'Health Care': ['Biosciences', 'Medical', 'Therapeutics', 'Diagnostics', 'Health'],
  Financials: ['Financial', 'Bancorp', 'Capital', 'Insurance Group', 'Trust'],
  'Consumer Discretionary': ['Brands', 'Outfitters', 'Hospitality', 'Motor Works', 'Home'],
  'Consumer Staples': ['Foods', 'Provisions', 'Household', 'Beverage'],
  Energy: ['Energy', 'Midstream', 'Petroleum', 'Resources'],
  Materials: ['Materials', 'Chemical', 'Minerals', 'Packaging'],
  Utilities: ['Power', 'Utilities', 'Water', 'Electric'],
  'Real Estate': ['Realty', 'Properties', 'Residential Trust'],
  'Communication Services': ['Media', 'Communications', 'Interactive', 'Broadcasting'],
};
const SECTORS = Object.keys(SUFFIX);
const VENUES = ['NASDAQ (simulated)', 'NYSE (simulated)'];

function isinCheckDigit(body) {
  // ISO 6166: letters to numbers (A=10), Luhn over the digit string.
  const digits = body.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let sum = 0;
  let dbl = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return String((10 - (sum % 10)) % 10);
}

function makeUniverse(rng, n) {
  const used = new Set();
  const names = new Set();
  const out = [];
  const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < n; i++) {
    const sector = SECTORS[Math.floor(rng() * SECTORS.length)];
    let root;
    let name;
    do {
      root = pick(rng, ROOT_A) + pick(rng, ROOT_B);
      name = `${root} ${pick(rng, SUFFIX[sector])}`;
    } while (names.has(name));
    names.add(name);
    // Tickers are derived from the name the way listings usually are, then made unique.
    const R = root.toUpperCase().replace(/[^A-Z]/g, '');
    const S = name.split(' ')[1].toUpperCase().replace(/[^A-Z]/g, '');
    const cands = [R.slice(0, 4), R.slice(0, 3) + S[0], R.slice(0, 2) + S.slice(0, 2), R[0] + R.slice(2, 4) + S[0], R.slice(0, 3)];
    let ticker = cands.find((c) => c.length >= 3 && !used.has(c) && !BLOCK.has(c));
    while (!ticker || used.has(ticker) || BLOCK.has(ticker)) ticker = R.slice(0, 2) + L[Math.floor(rng() * 26)] + L[Math.floor(rng() * 26)];
    used.add(ticker);
    const body = `ZZ${String(Math.floor(rng() * 1e9)).padStart(9, '0')}`;
    const isin = body + isinCheckDigit(body);
    const figi = `SIM${Array.from({ length: 9 }, () => 'BCDFGHJKLMNPQRSTVWXYZ0123456789'[Math.floor(rng() * 31)]).join('')}`;
    const mcap = Math.exp(Math.log(2.2e9) + rng() * Math.log(400));
    const adv60 = Math.max(26e6, mcap * (0.004 + rng() * 0.01));
    out.push({ id: i, ticker, name, sector, isin, figi, mcap, adv60, venue: pick(rng, VENUES) });
  }
  return out;
}

const DRIVERS = {
  A: [
    ['resid_mom_12_1', 'Residual 12-1 momentum', 'Rezidualni moment 12-1', 'z'],
    ['vol_scaled_trend', 'Volatility-scaled trend', 'Trend, prilagojen volatilnosti', 'z'],
  ],
  B: [
    ['sue', 'Standardised earnings surprise', 'Standardizirano presenečenje dobička', 'z'],
    ['gp_yoy', 'Gross profitability, YoY change', 'Bruto donosnost, medletna sprememba', 'pp'],
  ],
  C: [
    ['gp_assets', 'Gross profits / assets', 'Bruto dobiček / sredstva', 'z'],
    ['fcf_yield', 'Free-cash-flow yield', 'Donos prostega denarnega toka', '%'],
    ['ev_ebit', 'EV / EBIT (inverted)', 'EV / EBIT (obrnjeno)', 'z'],
  ],
  D: [
    ['gbdt_score', 'GBDT ranker score', 'Ocena rangirnika GBDT', 'z'],
    ['liquidity_rank', 'Liquidity rank', 'Rang likvidnosti', 'pct'],
  ],
};

const FAMILY_META = [
  { id: 'A', name: { en: 'Trend', sl: 'Trend' }, def: { en: 'Residual 12-1 momentum, volatility-scaled', sl: 'Rezidualni moment 12-1, prilagojen volatilnosti' } },
  { id: 'B', name: { en: 'Fundamental momentum', sl: 'Temeljni moment' }, def: { en: 'Earnings surprise by filing date, change in gross profitability', sl: 'Presenečenje dobička po datumu vložitve, sprememba bruto donosnosti' } },
  { id: 'C', name: { en: 'Quality / value', sl: 'Kakovost / vrednost' }, def: { en: 'Gross profits to assets, EV/EBIT, free-cash-flow yield', sl: 'Bruto dobiček na sredstva, EV/EBIT, donos prostega denarnega toka' } },
  { id: 'D', name: { en: 'ML ranker', sl: 'Rangirnik ML' }, def: { en: 'Gradient-boosted trees ranking the 21-day sector-relative return', sl: 'Gradientno ojačana drevesa, ki rangirajo 21-dnevni donos glede na sektor' } },
];

const PERSONS = [
  { id: 'p1', name: 'Maja Vrhovnik', title: { en: 'Head of Research', sl: 'Vodja raziskav' }, role: 'approver', fictional: true },
  { id: 'p2', name: 'Luka Ferjančič', title: { en: 'Model Lead', sl: 'Vodja modelov' }, role: 'model_lead', fictional: true },
  { id: 'p3', name: 'Nina Kosmač', title: { en: 'Deputy Approver', sl: 'Namestnica odobriteljice' }, role: 'deputy_approver', fictional: true },
  { id: 'p4', name: 'Rok Zadravec', title: { en: 'Compliance Officer', sl: 'Pooblaščenec za skladnost' }, role: 'compliance', fictional: true },
];

const METHODOLOGY = [
  {
    version: '1.0', effective: '2025-10-01', modelVersion: 'ensemble 1.0.0',
    summary: {
      en: 'Initial frozen methodology: four families, quorum 3 of 4 in the top decile, five vetoes, 21-trading-day horizon, caps of 2 per issue and 8 per month.',
      sl: 'Prva zamrznjena metodologija: štiri družine, kvorum 3 od 4 v zgornjem decilu, pet vetov, 21 trgovalnih dni, omejitvi 2 na izdajo in 8 na mesec.',
    },
  },
  {
    version: '1.1', effective: '2026-03-02', modelVersion: 'ensemble 1.0.0',
    summary: {
      en: 'Capacity floor raised to $40M ADV; LLM veto prompt v2 (stand-in in the demo). Models unchanged.',
      sl: 'Prag zmogljivosti zvišan na 40 mio $ ADV; poziv za veto LLM v2 (v demu nadomestek). Modeli nespremenjeni.',
    },
  },
];

// Brownian bridge from 0 to `end` over n steps.
function bridge(rng, n, end, vol) {
  const w = [0];
  for (let i = 1; i <= n; i++) w.push(w[i - 1] + normal(rng) * vol);
  return w.map((x, i) => x - (i / n) * (w[n] - end));
}

function nyClose(date) {
  return formatInZone(zonedToInstant(date, '16:00:00', NEW_YORK), NEW_YORK).iso;
}

function fmtThesis(locale, p, stock) {
  const fam = { en: { A: 'trend', B: 'fundamental momentum', C: 'quality/value', D: 'the ML ranker' }, sl: { A: 'trend', B: 'temeljni moment', C: 'kakovost/vrednost', D: 'rangirnik ML' } }[locale];
  const pc = (f) => Math.round(p.families[f].pct * 100);
  const ag = p.agreeing.map((f) => `${fam[f]} ${pc(f)}`).join(locale === 'en' ? ', ' : ', ');
  const miss = FAMS.filter((f) => !p.agreeing.includes(f));
  const d0 = p.families[p.agreeing[0]].drivers[0];
  if (locale === 'en') {
    return (
      `${p.agreement} of 4 families place ${stock.ticker} in their top decile (${ag}).` +
      (miss.length ? ` ${fam[miss[0]][0].toUpperCase()}${fam[miss[0]].slice(1)} did not agree (${pc(miss[0])}).` : '') +
      ` The strongest single driver is ${d0.label.en.toLowerCase()} at ${d0.value}. ` +
      `The exit is fixed at entry: the US open 21 trading days later. No price target.`
    );
  }
  return (
    `${p.agreement} od 4 družin uvršča ${stock.ticker} v svoj zgornji decil (${ag}).` +
    (miss.length ? ` ${fam[miss[0]][0].toUpperCase()}${fam[miss[0]].slice(1)} se ni strinjal (${pc(miss[0])}).` : '') +
    ` Najmočnejši posamezni dejavnik je ${d0.label.sl.toLowerCase()} pri ${d0.value}. ` +
    `Izstop je določen ob vstopu: odprtje ameriškega trga 21 trgovalnih dni pozneje. Brez ciljne cene.`
  );
}

// ---- the build -----------------------------------------------------------------------------------

export async function buildFixtures() {
  const rng = mulberry32(hashSeed(SEED, 'fixture'));
  const stocks = makeUniverse(rng, 1460);
  const days = tradingDaysBetween(SEALED_FROM, AS_OF);

  // 1) Decide the issue days, picks, renews and closes.
  const picks = [];
  const open = [];
  const issues = [];
  const monthCount = new Map();
  const sectorOpen = new Map();
  let renewCount = 0;
  let scored = 1392;
  const lastClosed = new Map();
  const vetoTotals = { rule: 0, llm: 0, human: 0, capped: 0 };

  for (let i = 0; i < days.length; i++) {
    const date = days[i];
    const slot = issueSlot(date);
    scored = clamp(Math.round(scored + normal(rng) * 4), 1352, 1418);
    const buys = [];
    const renews = [];
    const closes = [];

    // Day-21 decisions for positions whose planned exit is today.
    for (const p of open.filter((x) => x.exitPlanned === date)) {
      open.splice(open.indexOf(p), 1);
      if (renewCount < 4 && rng() < 0.1) {
        renewCount++;
        p.status = 'renewed';
        const r = newPick({ date, i, stock: stocks[p.stockId], kind: 'RENEW', prior: p });
        p.renewedAs = r.no;
        renews.push(r.no);
        open.push(r);
      } else {
        p.status = 'closed';
        closes.push(p.no);
        lastClosed.set(p.stockId, date);
        sectorOpen.set(p.sector, (sectorOpen.get(p.sector) ?? 1) - 1);
      }
    }

    const mk = date.slice(0, 7);
    // Recent quorum days are pinned so the demo always has open picks, including one issued today.
    let quorum = FORCE_QUORUM.has(date) || (date < '2026-09-01' && rng() < 0.19);
    const vet = { rule: rng() < 0.16 ? 1 : 0, llm: rng() < 0.025 ? 1 : 0, human: rng() < 0.012 ? 1 : 0, capped: 0 };
    let closest = quorum ? (rng() < 0.2 ? 4 : 3) : rng() < 0.12 ? 1 : 2;
    // A would-be pick that a veto removed leaves the day at "closest 3/4".
    if (!quorum && (vet.rule || vet.llm || vet.human) && rng() < 0.5) closest = 3;
    if (quorum) {
      const want = rng() < 0.22 ? 2 : 1;
      for (let k = 0; k < want; k++) {
        if ((monthCount.get(mk) ?? 0) >= 8) {
          vet.capped++;
          continue;
        }
        let s;
        let guard = 0;
        do {
          s = stocks[Math.floor(rng() * stocks.length)];
          guard++;
        } while (
          guard < 200 &&
          (open.some((o) => o.stockId === s.id) ||
            (sectorOpen.get(s.sector) ?? 0) >= 3 ||
            (lastClosed.has(s.id) && countTradingDays(lastClosed.get(s.id), date) < 10))
        );
        const p = newPick({ date, i, stock: s, kind: 'BUY', agreement: k === 0 ? closest : 3 });
        buys.push(p.no);
        open.push(p);
        monthCount.set(mk, (monthCount.get(mk) ?? 0) + 1);
        sectorOpen.set(s.sector, (sectorOpen.get(s.sector) ?? 0) + 1);
      }
      if (!buys.length) quorum = false;
    }
    for (const k of Object.keys(vet)) vetoTotals[k] += vet[k];
    issues.push({
      date, issueNo: i + 1, publishAt: slot.publishAt, tz: slot.tzLabel, nScored: scored,
      closest: buys.length ? Math.max(3, closest) : closest,
      quorum: buys.length > 0, buys, renews, closes, vetoes: vet, seq: 0, hash: '', fixture: true,
    });
  }

  function newPick({ date, i, stock, kind, prior = null, agreement = 3 }) {
    const no = pad4(picks.length + 1);
    const agreeing = agreement === 4 ? [...FAMS] : seededShuffle(FAMS, rng).slice(0, 3).sort();
    const families = {};
    for (const f of FAMS) {
      const top = agreeing.includes(f);
      const pct = r4(top ? 0.9 + rng() * 0.095 : 0.35 + rng() * 0.53);
      families[f] = {
        pct,
        drivers: DRIVERS[f].slice(0, top ? 2 : 1).map(([key, en, sl, unit]) => ({
          key, label: { en, sl }, value: Math.round((top ? 1 + rng() * 1.4 : rng() * 0.9) * 10) / 10, unit,
        })),
      };
    }
    const margins = agreeing.map((f) => ({ family: f, pct: families[f].pct, margin: r4(families[f].pct - 0.9) }));
    margins.sort((a, b) => a.margin - b.margin);
    const slot = issueSlot(date);
    const exitPlanned = addTradingDays(date, 21);
    const prevClose = 20 + rng() * 280;
    const open0 = prevClose * (1 + normal(rng) * 0.004 + 0.0008);
    const sealSec = String(1 + Math.floor(rng() * 9)).padStart(2, '0');
    const p = {
      no, kind, priorNo: prior?.no ?? null, renewedAs: null, status: 'open',
      ticker: stock.ticker, name: stock.name, isin: stock.isin, figi: stock.figi, sector: stock.sector, venue: stock.venue,
      issueDate: date, issueNo: i + 1,
      producedAt: slot.sealAt.replace(':00+', `:${sealSec}+`), disseminatedAt: slot.publishAt,
      dissemination: { price: Math.round(prevClose * 100) / 100, source: 'SIM last close', at: nyClose(prevTradingDay(date)) },
      entry: { date, open: Math.round(open0 * 100) / 100 }, exitPlanned, exit: null,
      agreement: agreeing.length, agreeing, crashSwitch: false, combined: r4(mean(FAMS.map((f) => families[f].pct))),
      families, sensitivity: margins[0],
      vetoChecks: [
        { key: 'days_to_cover', pass: true, value: Math.round((0.8 + rng() * 3) * 10) / 10 },
        { key: 'idio_vol', pass: true, value: r4(0.12 + rng() * 0.2) },
        { key: 'earnings_within_3d', pass: true },
        { key: 'pending_ma', pass: true },
        { key: 'llm_48h', pass: true, note: 'stand-in' },
      ],
      insider: { cluster: rng() < 0.15, buyers: 0 },
      thesis: null, thesisNumbers: [], drafter: 'template', validator: 'passed',
      approver: 'p1', modelLead: 'p2', modelVersion: 'ensemble 1.0.0', methodology: date >= '2026-03-02' ? '1.1' : '1.0',
      outcome: null, mark: null, path: [], sms: null, closeSms: null, seq: 0, commit: '', reveal: null, history12m: [],
      stockId: stock.id, fixture: true,
    };
    if (p.insider.cluster) p.insider.buyers = 2 + Math.floor(rng() * 3);
    p.thesis = { en: fmtThesis('en', p, stock), sl: fmtThesis('sl', p, stock) };
    p.thesisNumbers = [...agreeing.map((f) => Math.round(families[f].pct * 100)), families[agreeing[0]].drivers[0].value];
    const smsData = { no, ticker: stock.ticker, issueDate: date, entryDate: date, exitDate: exitPlanned, agreement: p.agreement, token: SMS_TOKEN, priorNo: prior?.no };
    const kindSms = kind === 'RENEW' ? 'RENEW' : 'BUY';
    p.sms = { en: renderSms(kindSms, 'en', smsData), sl: renderSms(kindSms, 'sl', smsData) };
    const prevNos = picks.filter((q) => q.ticker === stock.ticker && q.issueDate >= addTradingDays(date, -252)).map((q) => q.no);
    p.history12m = prevNos;
    picks.push(p);
    return p;
  }

  // 2) Outcomes, marks and paths.
  const asOfIdx = days.length - 1;
  for (const p of picks) {
    const entryIdx = days.indexOf(p.issueDate);
    const exitIdx = days.indexOf(p.exitPlanned);
    const done = p.exitPlanned <= AS_OF;
    const n = done ? 21 : asOfIdx - entryIdx;
    const full = 21;
    const benchEnd = normal(rng) * 0.035 + 0.006;
    const skill = normal(rng) * 0.062 + 0.0045;
    const netEnd = benchEnd + skill;
    const nb = bridge(rng, full, benchEnd, 0.009);
    const nn = bridge(rng, full, netEnd, 0.017).map((x, k) => x + nb[k] * 0.6 - (k / full) * benchEnd * 0.6);
    nn[full] = netEnd;
    nb[full] = benchEnd;
    // Open picks only show the days that have happened.
    p.path = nn.slice(0, n + 1).map((x, k) => [k, r6(x), r6(nb[k])]);
    const cost = p.entry.open > 0 && stocksById(p.stockId).mcap > 1e10 ? 0.002 : 0.005;
    if (done && exitIdx >= 0) {
      const gross = netEnd + cost;
      const exitOpen = Math.round(p.entry.open * (1 + gross) * 100) / 100;
      const fx = normal(rng) * 0.012;
      p.exit = { date: p.exitPlanned, open: exitOpen };
      p.outcome = {
        exitDate: p.exitPlanned, exitOpen, gross: r6(gross), net: r6(netEnd), bench: r6(benchEnd), excess: r6(netEnd - benchEnd),
        eurNet: r6(netEnd + fx), alertGapBps: Math.round(normal(rng) * 18 + 11),
        d5: r6(p.path[Math.min(5, n)][1] - p.path[Math.min(5, n)][2]),
        d63: exitIdx + 42 <= asOfIdx ? r6(netEnd - benchEnd + normal(rng) * 0.04) : null,
      };
      if (p.status === 'closed') {
        const cs = { no: p.no, ticker: p.ticker, issueDate: p.exitPlanned, token: SMS_TOKEN };
        p.closeSms = { en: renderSms('CLOSE', 'en', cs), sl: renderSms('CLOSE', 'sl', cs) };
      }
    }
    const last = p.path[p.path.length - 1];
    p.mark = { date: done ? p.exitPlanned : AS_OF, close: Math.round(p.entry.open * (1 + last[1]) * 100) / 100, net: last[1], bench: last[2], excess: r6(last[1] - last[2]) };
  }
  function stocksById(id) {
    return stocks[id];
  }

  // 3) The ledger, day by day, with real hashes.
  const entries = [];
  const anchors = [];
  const push = async (e) => {
    const prev = entries[entries.length - 1] ?? null;
    const entry = await createEntry(prev, e);
    entries.push(entry);
    return entry;
  };
  const byNo = new Map(picks.map((p) => [p.no, p]));
  for (const iss of issues) {
    const slot = issueSlot(iss.date);
    const dayStart = entries.length;
    for (const m of METHODOLOGY.filter((x) => x.effective === iss.date)) {
      const e = await push({ type: 'METHODOLOGY', issueDate: iss.date, at: `${iss.date}T08:00:00${slot.publishAt.slice(-6)}`, body: { version: m.version, effective: m.effective, summary: m.summary, modelVersion: m.modelVersion } });
      m.seq = e.seq;
    }
    for (const no of [...iss.buys, ...iss.renews]) {
      const p = byNo.get(no);
      const salt = Array.from({ length: 16 }, () => '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'[Math.floor(rng() * 62)]).join('');
      p.reveal = { no, ticker: p.ticker, figi: p.figi, issueDate: p.issueDate, agreeing: p.agreeing, salt };
      p.commit = await commitment(p.reveal);
      const body = { no, commit: p.commit, horizon: 21, exitPlanned: p.exitPlanned, agreement: p.agreement, methodology: p.methodology, modelVersion: p.modelVersion, producedAt: p.producedAt };
      if (p.kind === 'RENEW') body.priorNo = p.priorNo;
      const e = await push({ type: p.kind, issueDate: iss.date, at: slot.sealAt, body });
      p.seq = e.seq;
    }
    for (const no of iss.closes) {
      const p = byNo.get(no);
      await push({
        type: 'CLOSE', issueDate: iss.date, at: slot.sealAt,
        body: { no, reveal: p.reveal, entry: p.entry, exit: p.exit, net: p.outcome.net, bench: p.outcome.bench, excess: p.outcome.excess },
      });
    }
    const e = await push({
      type: 'ISSUE', issueDate: iss.date, at: slot.publishAt,
      body: { issueNo: iss.issueNo, nScored: iss.nScored, closest: iss.closest, buys: iss.buys, renews: iss.renews, closes: iss.closes, vetoes: iss.vetoes, methodology: iss.date >= '2026-03-02' ? '1.1' : '1.0' },
    });
    iss.seq = e.seq;
    iss.hash = e.hash;
    const dayHashes = entries.slice(dayStart).map((x) => x.hash);
    anchors.push({ date: iss.date, merkleRoot: await merkleRoot(dayHashes), rowCount: dayHashes.length, ots: 'confirmed', rfc3161: 'demo' });
  }
  for (const a of anchors.slice(-2)) a.ots = 'pending';

  // 4) Summary (sealed record, fixed order in the web).
  const closed = picks.filter((p) => p.outcome);
  const ex = closed.map((p) => p.outcome.excess);
  const hits = ex.filter((x) => x > 0).length;
  const worst = closed.reduce((a, b) => (b.outcome.excess < a.outcome.excess ? b : a), closed[0]);
  const best = closed.reduce((a, b) => (b.outcome.excess > a.outcome.excess ? b : a), closed[0]);
  const equity = [];
  let eqF = 1;
  let eqB = 1;
  for (let i = 0; i < days.length; i++) {
    const active = picks.filter((p) => {
      const a = days.indexOf(p.issueDate);
      const b = p.outcome ? days.indexOf(p.exitPlanned) : asOfIdx;
      return i > a && i <= b;
    });
    const dayRet = (p) => {
      const a = days.indexOf(p.issueDate);
      const k = i - a;
      return (1 + p.path[k][1]) / (1 + p.path[k - 1][1]) - 1;
    };
    const benchDay = normal(rng) * 0.009 + 0.0004;
    const fRet = active.length ? mean(active.map(dayRet)) : 0;
    eqF *= 1 + fRet;
    eqB *= 1 + benchDay;
    equity.push([days[i], r6(eqF), r6(eqB)]);
  }
  let peak = 1;
  let mdd = 0;
  for (const [, f] of equity) {
    peak = Math.max(peak, f);
    mdd = Math.min(mdd, f / peak - 1);
  }
  const summary = {
    simulated: true, fixture: true, liveSince: SEALED_FROM,
    label: { en: 'Pre-launch sealed record (no subscribers)', sl: 'Zapečaten zapis pred lansiranjem (brez naročnikov)' },
    nPicks: picks.length, nClosed: closed.length, hitRate: r4(hits / closed.length), hitCI: wilson(hits, closed.length),
    medianExcess: r6(median(ex)), meanExcess: r6(mean(ex)),
    worstPick: { no: worst.no, ticker: worst.ticker, excess: worst.outcome.excess },
    bestPick: { no: best.no, ticker: best.ticker, excess: best.outcome.excess },
    maxDrawdown: r4(mdd), medianAlertGapBps: Math.round(median(closed.map((p) => p.outcome.alertGapBps))),
    cumulative: { follow: r4(equity[equity.length - 1][1] - 1), bench: r4(equity[equity.length - 1][2] - 1) },
    vetoes: vetoTotals, equity,
  };

  // 5) Hero: the most recently closed single-pick issue.
  const heroPick = [...closed].filter((p) => p.status === 'closed').sort((a, b) => (a.exitPlanned < b.exitPlanned ? 1 : a.exitPlanned > b.exitPlanned ? -1 : 0))
    .find((p) => issues.find((x) => x.date === p.issueDate).buys.length === 1);
  const heroIssue = issues.find((x) => x.date === heroPick.issueDate);
  const n = heroIssue.nScored;
  const hr = mulberry32(hashSeed(SEED, 'hero', heroIssue.date));
  const lat = [];
  for (let k = 0; k < n; k++) {
    const common = normal(hr);
    const ab = normal(hr);
    lat.push([0.45 * common + 0.35 * ab + 0.82 * normal(hr), 0.3 * common + 0.95 * normal(hr), 0.2 * common - 0.25 * ab + 0.94 * normal(hr), 0.55 * common + 0.3 * ab + 0.75 * normal(hr)]);
  }
  const pcts = lat.map(() => [0, 0, 0, 0]);
  for (let f = 0; f < 4; f++) {
    const order = lat.map((r, k) => [r[f], k]).sort((a, b) => a[0] - b[0]);
    order.forEach(([, k], rank) => {
      pcts[k][f] = Math.round((rank / (n - 1)) * 1000);
    });
  }
  const heroIndex = Math.floor(hr() * n);
  for (let k = 0; k < n; k++) {
    if (k === heroIndex) continue;
    let top = pcts[k].filter((v) => v >= 900).length;
    while (top >= 3) {
      const f = pcts[k].findIndex((v) => v >= 900);
      pcts[k][f] = 600 + Math.floor(hr() * 280);
      top--;
    }
    if (hr() < 0.03) pcts[k][1] = -1; // B missing (no fundamentals yet)
  }
  pcts[heroIndex] = FAMS.map((f) => Math.round(heroPick.families[f].pct * 1000));
  const hero = {
    simulated: true, fixture: true, issueDate: heroIssue.date, issueNo: heroIssue.issueNo, nScored: n, quorumCount: heroIssue.buys.length,
    pick: { no: heroPick.no, ticker: heroPick.ticker, name: heroPick.name, agreeing: heroPick.agreeing, index: heroIndex },
    p: pcts.flat(), sms: heroPick.sms.en, smsAt: heroPick.disseminatedAt,
    outcome: { excess: heroPick.outcome.excess, net: heroPick.outcome.net, bench: heroPick.outcome.bench, exitDate: heroPick.outcome.exitDate },
    path: heroPick.path,
  };

  // 6) Scoreboard, deciles, universe, backtest.
  const famStats = (base) => ({
    hit: r4(0.5 + base * 1.2 + normal(rng) * 0.01), ic: r4(base), meanExcess: r4(base * 0.12 + normal(rng) * 0.001),
  });
  const withCI = (s, n, icw) => ({ ...s, hitCI: [r4(s.hit - 1.96 * Math.sqrt(0.25 / n)), r4(s.hit + 1.96 * Math.sqrt(0.25 / n))], icCI: [r4(s.ic - icw), r4(s.ic + icw)], n });
  const famBase = { A: 0.031, B: 0.012, C: 0.024, D: 0.038 };
  const scoreboard = {
    simulated: true, fixture: true,
    periods: { sealed: { from: SEALED_FROM, to: AS_OF }, holdout: HOLDOUT },
    families: FAMS.map((f) => ({
      id: f,
      sealed: withCI(famStats(famBase[f] * (0.8 + rng() * 0.4)), 2900 + Math.floor(rng() * 200), 0.018),
      holdout: withCI(famStats(famBase[f]), 10400 + Math.floor(rng() * 400), 0.01),
    })),
    agreement: (() => {
      const k4 = closed.filter((p) => p.agreement === 4);
      const k3 = closed.filter((p) => p.agreement === 3);
      const row = (list) => {
        const e = list.map((p) => p.outcome.excess);
        const h = e.filter((x) => x > 0).length;
        return { n: list.length, hit: r4(list.length ? h / list.length : 0), hitCI: wilson(h, list.length), medianExcess: r6(median(e)) };
      };
      return [
        { k: '4/4', sealed: row(k4), holdout: { n: 41, hit: 0.61, hitCI: wilson(25, 41), medianExcess: 0.017 } },
        { k: '3/4', sealed: row(k3), holdout: { n: 118, hit: 0.56, hitCI: wilson(66, 118), medianExcess: 0.009 } },
        { k: '2/4 shadow', sealed: { n: 612, hit: 0.517, hitCI: wilson(316, 612), medianExcess: 0.002 }, holdout: { n: 2210, hit: 0.521, hitCI: wilson(1151, 2210), medianExcess: 0.003 } },
      ];
    })(),
    correlations: { order: FAMS, matrix: [[1, 0.21, -0.12, 0.38], [0.21, 1, 0.17, 0.29], [-0.12, 0.17, 1, 0.14], [0.38, 0.29, 0.14, 1]] },
    icMonthly: [...new Set(days.map((d) => d.slice(0, 7)))].map((m) => [m, Object.fromEntries(FAMS.map((f) => [f, r4(famBase[f] + normal(rng) * 0.035)]))]),
  };
  const decileSet = (slope) => {
    const mk = (s) => Array.from({ length: 10 }, (_, k) => {
      const e = r6((k - 4.5) * s * 0.0011 + normal(rng) * 0.0012);
      return { d: k + 1, excess: e, ci: [r6(e - 0.004), r6(e + 0.004)] };
    });
    return { combined: mk(slope * 1.3), A: mk(slope), B: mk(slope * 0.4), C: mk(slope * 0.8), D: mk(slope * 1.1) };
  };
  const deciles = { simulated: true, fixture: true, sealed: decileSet(1), holdout: decileSet(1.05) };

  const uni = mulberry32(hashSeed(SEED, 'universe'));
  const vetoKeys = ['days_to_cover', 'idio_vol', 'earnings_within_3d', 'pending_ma', 'llm_48h'];
  const universe = {
    simulated: true, fixture: true, date: AS_OF,
    cols: ['ticker', 'name', 'sector', 'A', 'B', 'C', 'D', 'agree', 'veto', 'mcap', 'adv60', 'ret21'],
    rows: stocks.slice(0, issues[issues.length - 1].nScored).map((s) => {
      const v = FAMS.map(() => r4(uni()));
      const agree = v.filter((x) => x >= 0.9).length;
      return [s.ticker, s.name, s.sector, ...v, agree, uni() < 0.08 ? pick(uni, vetoKeys) : null, Math.round(s.mcap), Math.round(s.adv60), r4(normal(uni) * 0.07)];
    }),
  };

  const bt = mulberry32(hashSeed(SEED, 'backtest'));
  const eq = [];
  const lv = [1, 1, 1, 1, 1, 1, 1];
  const drifts = [0.0105, 0.0078, 0.0086, 0.0089, 0.0081, 0.0085, 0.0092];
  let d = '2009-01-30';
  while (d <= HOLDOUT.to) {
    const mkt = normal(bt) * 0.042;
    for (let k = 0; k < 7; k++) lv[k] *= 1 + drifts[k] + mkt * (k === 1 ? 1 : 0.9) + normal(bt) * (k === 0 ? 0.03 : 0.018);
    eq.push([d, ...lv.map(r4)]);
    const [y, m] = d.split('-').map(Number);
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    const last = new Date(Date.UTC(ny, nm, 0)).toISOString().slice(0, 10);
    d = tradingDaysBetween(`${last.slice(0, 8)}01`, last).pop();
  }
  const annual = [];
  for (let y = 2009; y <= 2025; y++) {
    const rows = eq.filter((r) => r[0].startsWith(String(y)));
    if (!rows.length) continue;
    const prev = eq.filter((r) => r[0] < `${y}-01-01`).pop() ?? [null, 1, 1];
    const lastRow = rows[rows.length - 1];
    annual.push({ year: y, quorum: r4(lastRow[1] / prev[1] - 1), bench: r4(lastRow[2] / prev[2] - 1), n: 36 + Math.floor(bt() * 30) });
  }
  const gate = (id, pass, en, sl, den, dsl, values) => ({ id, pass, label: { en, sl }, detail: { en: den, sl: dsl }, values });
  const backtest = {
    simulated: true, fixture: true, label: 'HYPOTHETICAL', window: { from: '2009-01-02', to: '2022-09-30' }, holdout: HOLDOUT,
    variantsTried: 212, dsr: 0.97, pbo: 0.18,
    variantSharpes: Array.from({ length: 212 }, () => r4(0.55 + normal(bt) * 0.22)),
    gates: [
      gate('a', true, 'Positive mean and median excess, hit rate ≥ 53%', 'Pozitiven povprečni in mediani presežek, zadetki ≥ 53 %', 'Holdout: hit 56.1%, median +0.9%, mean +0.7%', 'Preizkusno obdobje: zadetki 56,1 %, mediana +0,9 %, povprečje +0,7 %', { hit: 0.561, median: 0.009, mean: 0.007 }),
      gate('b', true, 'Quorum beats 2/4 and every single family', 'Kvorum premaga 2/4 in vsako posamezno družino', 'Quorum +0.9% vs 2/4 +0.3% and best family +0.5%', 'Kvorum +0,9 % proti 2/4 +0,3 % in najboljši družini +0,5 %', { quorum: 0.009, twoOfFour: 0.003, bestFamily: 0.005 }),
      gate('c', true, 'D beats an equal-weight composite of A–C', 'D premaga enakovredno sestavo A–C', 'IC 0.038 vs 0.029', 'IC 0,038 proti 0,029', { d: 0.038, composite: 0.029 }),
      gate('d', true, 'DSR ≥ 0.95 and PBO < 0.3', 'DSR ≥ 0,95 in PBO < 0,3', 'DSR 0.97 · PBO 0.18', 'DSR 0,97 · PBO 0,18', { dsr: 0.97, pbo: 0.18 }),
      gate('e', true, '3–8 picks per month', '3–8 izbir na mesec', '4.4 per month', '4,4 na mesec', { perMonth: 4.4 }),
    ],
    equity: eq, equityCols: ['quorum', 'bench', 'twoOfFour', 'A', 'B', 'C', 'D'], annual,
    stats: { picksPerMonth: 4.4, hitRate: 0.561, medianExcess: 0.009, meanExcess: 0.007, sharpe: 0.84, maxDrawdown: -0.23 },
    crashSwitchPeriods: [['2009-03-09', '2009-06-30'], ['2020-04-01', '2020-06-30']],
  };

  // 7) Meta.
  const lastIssue = issues[issues.length - 1];
  const meta = {
    simulated: true, fixture: true, seed: SEED, asOf: AS_OF, dataThrough: `${AS_OF}T16:00:00-04:00`,
    sealedSince: SEALED_FROM, holdout: HOLDOUT, engineFrozen: '2025-09-30',
    methodology: METHODOLOGY.map(({ version, effective, summary, seq }) => ({ version, effective, summary, seq })),
    modelVersion: 'ensemble 1.0.0', families: FAMILY_META, persons: PERSONS,
    universe: { scoredToday: lastIssue.nScored, eligibleRule: { minPrice: 5, minMcap: 2e9, minAdv: 25e6 } },
    counts: {
      issues: issues.length, quorumDays: issues.filter((x) => x.quorum).length, picks: picks.filter((p) => p.kind === 'BUY').length,
      renews: picks.filter((p) => p.kind === 'RENEW').length, closed: picks.filter((p) => p.status === 'closed').length,
      open: picks.filter((p) => p.status === 'open').length,
    },
  };

  const cleanPicks = picks.map(({ stockId, ...rest }) => rest);
  const ledger = { simulated: true, fixture: true, genesis: GENESIS_HASH, entries, anchors };
  return { meta, summary, issues, ledger, picks: cleanPicks, scoreboard, deciles, hero, universe, backtest };
}

// A file may be replaced only when it is missing or is itself a fixture.
export function isFixtureDoc(doc) {
  if (Array.isArray(doc)) return doc.length > 0 && doc.every((r) => r && r.fixture === true);
  return !!doc && typeof doc === 'object' && doc.fixture === true;
}

export async function writeFixtures(outDir, { log = console.log } = {}) {
  await mkdir(outDir, { recursive: true });
  const data = await buildFixtures();
  const written = [];
  const kept = [];
  for (const name of FILES) {
    const file = join(outDir, `${name}.json`);
    if (existsSync(file)) {
      let doc = null;
      try {
        doc = JSON.parse(await readFile(file, 'utf8'));
      } catch {
        doc = null; // unreadable: may be mid-write by the engine; leave it alone
      }
      if (!isFixtureDoc(doc)) {
        kept.push(name);
        log(`keep   ${name}.json (engine export, not a fixture)`);
        continue;
      }
    }
    await writeFile(file, `${JSON.stringify(data[name])}\n`);
    written.push(name);
    log(`write  ${name}.json`);
  }
  return { written, kept };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? resolve(process.argv[i + 1]) : resolve(HERE, '../web/data');
  const t0 = performance.now();
  writeFixtures(out).then(({ written, kept }) => {
    console.log(`fixture data: ${written.length} written, ${kept.length} kept, ${Math.round(performance.now() - t0)} ms -> ${out}`);
  });
}
