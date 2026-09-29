// The sealed pre-launch record: one issue per US trading day from the sealed start (2025-10-01) to the
// last data day (2026-09-28), run with the frozen models and the calibrated rule, hash-chained through
// core/ledger.js.
//
// Ledger order within one issue date:
//   METHODOLOGY (only on the day a version takes effect, 08:00 Ljubljana)
//   RENEW and BUY entries, sealed at 13:45 (at = sealAt)
//   ISSUE entry, published at 14:00 (at = publishAt)
//   CLOSE entries, written one minute after that day's US open (the exit price exists only then)
// The CLOSE decision itself is part of the 14:00 issue (ISSUE.closes) and of the CLOSE SMS; the CLOSE
// ledger entry carries the reveal and the realised result, so it cannot be sealed before the open.
//
// The approver (Head of Research, or the deputy on her away days) can only remove picks, with a
// logged reason; on one day neither is available and the day's would-be picks are not issued.
// Removal reasons are simulated deterministically. Some are read from data known at the signal close
// (sector concentration, earnings just outside the veto window, high short interest, a sharp run-up,
// a fresh filing whose figures need reconciling); the process failures (a thesis draft that fails the
// numeric validator twice, an 8-K after the data cut-off) are drawn from a hash of the seed, the date
// and the stock. None of them looks at prices after the signal close, so removals carry no hindsight.
import { createEntry, merkleRoot, commitment } from '../core/ledger.js';
import { issueSlot, zonedToInstant, formatInZone, addTradingDays, countTradingDays, fmtLong, LJUBLJANA, NEW_YORK } from '../core/calendar.js';
import { sensitivity } from '../core/quorum-rule.js';
import { renderSms } from '../core/sms-templates.js';
import { randomToken } from '../core/hash.js';
import { mulberry32, hashSeed } from '../core/random.js';
import { quantile } from '../core/stats.js';
import { runQuorum, periodRange, firstOnOrAfter, FAMS, round, floorPct, HORIZON } from './backtest.js';
import { writeThesis } from './thesis.js';

export const MODEL_VERSION = 'ensemble 1.0.0';
// the demo stop-link token; real tokens are 8 base62 characters
export const SMS_TOKEN = '7Kq2xZ4m';

// Fictional people (the site says so; names are invented for the simulation).
export const PERSONS = Object.freeze([
  { id: 'p1', name: 'Maja Vrhovnik', title: { en: 'Head of Research', sl: 'Vodja raziskav' }, role: 'approver', fictional: true },
  { id: 'p2', name: 'Luka Ferjančič', title: { en: 'Model Lead', sl: 'Vodja modelov' }, role: 'model_lead', fictional: true },
  { id: 'p3', name: 'Nina Kosmač', title: { en: 'Deputy Head of Research', sl: 'Namestnica vodje raziskav' }, role: 'deputy_approver', fictional: true },
]);

// Days the Head of Research is away and the deputy approves (month-day ranges, inclusive).
const DEPUTY_WINDOWS = [
  ['12-22', '12-31'],
  ['01-01', '01-02'],
  ['07-20', '07-31'],
];

const pad4 = (n) => String(n).padStart(4, '0');
const pad2 = (n) => String(n).padStart(2, '0');
const r2 = (x) => round(x, 2);
const r4 = (x) => round(x, 4);
const r6 = (x) => round(x, 6);

function addMonths(date, n) {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - 1 + n;
  return `${y + Math.floor(m / 12)}-${pad2((m % 12) + 1)}-01`;
}

function localIso(date, time, zone = LJUBLJANA) {
  return formatInZone(zonedToInstant(date, time, zone), zone).iso;
}

/**
 * Display scale for prices. The simulation compounds total-return prices without share splits, so a
 * stock can reach five-figure prices. Published prices are divided by each company's cumulative
 * simulated 2-for-1 splits: one split each time the last price exceeds a company-specific level
 * between $150 and $600, all dated before the sealed record (so the scale is constant within it).
 * Returns are ratios and do not change.
 */
export function splitFactor(model, i, seed = model.seed ?? 20260928) {
  const { N, T } = model;
  let last = NaN;
  for (let t = T - 1; t >= 0 && !(last === last); t--) last = model.close[t * N + i];
  if (!(last > 0)) return 1;
  const level = 150 + 450 * mulberry32(hashSeed(seed, 'split', model.companies[i].figi))();
  let f = 1;
  while (last / f > level) f *= 2;
  return f;
}

export function approverFor(date) {
  const md = date.slice(5);
  return DEPUTY_WINDOWS.some(([a, b]) => md >= a && md <= b) ? 'p3' : 'p1';
}

/** Methodology versions of the sealed record (v1.1 takes effect five months in: 2026-03-02). */
export function methodologyVersions(model, rule) {
  const [from] = periodRange(model, 'sealed');
  const start = model.dates[from];
  const v11 = model.dates[Math.min(model.T - 1, firstOnOrAfter(model, addMonths(start, 5)))];
  const top = Math.round((1 - rule.topPct) * 100);
  const years = `${model.periods.research[0].slice(0, 4)}-${model.periods.research[1].slice(0, 4)}`;
  const topEn = top === 10 ? 'top decile' : `top ${top}%`;
  const topSl = top === 10 ? 'zgornjem decilu' : `zgornjih ${top} %`;
  return [
    {
      version: '1.0',
      effective: start,
      summary: {
        en:
          `Frozen engine (ensemble 1.0.0). A pick needs at least 3 of the 4 model families (trend, fundamental momentum, quality/value, ML ranker) to place the stock in their ${topEn} on the issue date (calibrated on ${years} to 3-6 picks a month) and no veto: top days-to-cover decile, top idiosyncratic-volatility decile, earnings within 3 trading days, pending merger or split, material negative news in the last 48 hours (a stand-in classifier in this simulation). ` +
          'Caps: 2 new picks per issue, 8 per month, 3 open per sector, no re-issue within 10 trading days of a close except by RENEW, and no new pick that would take the month past 16 alert messages (picks plus exits). Entry at the US open on the issue day, exit at the open 21 trading days later; RENEW if the rule still holds. After bear-market rebounds the crash switch suspends trend and all three other families must agree. ' +
          `Launch protocol amendment A-1 (${fmtLong(model.periods.freeze, 'en')}): ship gate (d) splits into (d1), a deflated Sharpe probability of at least 0.95 on the research window with PBO below 0.3, and (d2), a probabilistic Sharpe ratio (Sharpe above zero) of at least 0.95 on the holdout plus this sealed record, re-tested at every month-end; SMS alerts wait until both pass.`,
        sl:
          `Zamrznjen model (ansambel 1.0.0). Za izbiro morajo vsaj 3 od 4 modelskih družin (trend, fundamentalni momentum, kakovost/vrednost, rangirnik ML) uvrstiti delnico med ${topSl} na dan izdaje (umerjeno na obdobju ${years} na 3-6 izbir na mesec), in noben veto ne velja: zgornji decil dni za pokritje, zgornji decil idiosinkratične volatilnosti, rezultati v 3 dneh trgovanja, čakajoča združitev ali delitev, pomembna negativna novica v zadnjih 48 urah (v tej simulaciji nadomestni klasifikator). ` +
          'Omejitve: 2 novi izbiri na izdajo, 8 na mesec, 3 odprte na sektor, brez ponovne izdaje v 10 dneh trgovanja po zaprtju, razen s podaljšanjem, in nobene nove izbire, ki bi v mesecu presegla 16 sporočil (izbire in izhodi). Vstop ob odprtju borze v ZDA na dan izdaje, izstop ob odprtju 21 dni trgovanja pozneje; podaljšanje, če pravilo še velja. Po odboju iz medvedjega trga stikalo za zlom momentuma izključi trend in se morajo strinjati vse tri druge družine. ' +
          `Dopolnilo zagonskega protokola A-1 (${fmtLong(model.periods.freeze, 'sl')}): pogoj (d) se razdeli na (d1), verjetnost deflacioniranega Sharpovega razmerja vsaj 0,95 v raziskovalnem obdobju in PBO pod 0,3, ter (d2), verjetnostno Sharpovo razmerje (Sharpe nad nič) vsaj 0,95 na preizkusnem obdobju skupaj s tem zapečatenim zapisom, ki se znova preveri ob koncu vsakega meseca; obvestila SMS čakajo, dokler nista izpolnjena oba.`,
      },
      modelVersion: MODEL_VERSION,
    },
    {
      version: '1.1',
      effective: v11,
      summary: {
        en:
          'Capacity floor written into the eligibility rule: ADV floor = max($25M, 50 x expected subscriber flow), reviewed quarterly. With no subscribers during the sealed record the floor stays at $25M, so eligibility is unchanged. ' +
          'LLM veto prompt v2: clearer definitions of guidance cuts, auditor changes and regulatory probes. In this simulation the news veto is a deterministic stand-in and its keyword list is unchanged. Models, thresholds, caps and the exit rule are unchanged.',
        sl:
          'Prag zmogljivosti je zapisan v pravilo upravičenosti: prag povprečnega dnevnega prometa = max(25 mio USD, 50 x pričakovani tok naročnikov), pregled vsako četrtletje. Ker v zapečatenem zapisu ni naročnikov, prag ostane 25 mio USD in upravičenost se ne spremeni. ' +
          'Poziv LLM za veto v2: jasnejše opredelitve znižanj napovedi, menjav revizorja in regulatornih preiskav. V tej simulaciji je veto na novice deterministični nadomestek in njegov seznam ključnih besed se ne spremeni. Modeli, pragovi, omejitve in pravilo izstopa ostanejo nespremenjeni.',
      },
      modelVersion: MODEL_VERSION,
    },
  ];
}

// ---- approver decisions ---------------------------------------------------------------------------------

// Share of BUY candidates on which each process failure is simulated (hash draw per date and stock).
export const PROCESS_FAILURE_RATES = Object.freeze({ validator_failed: 0.06, late_8k: 0.05, source_mismatch: 0.35 });
// Order in which reasons are preferred when several apply to one candidate.
export const REASON_CODES = Object.freeze(['validator_failed', 'late_8k', 'source_mismatch', 'sector_concentration', 'earnings_soon', 'short_interest', 'data_check']);

function draw(seed, code, date, figi) {
  return mulberry32(hashSeed(seed, 'approver', code, date, figi))();
}

/** The latest 10-Q or 10-K filed in the 10 trading days up to the signal close, or null. */
function freshFiling(model, i, s) {
  const m = model.internals?.market;
  const fl = m?.filings;
  if (!fl) return null;
  const ts = s + (model.internals.simOffset ?? 0);
  let best = null;
  for (let f = fl.start[i]; f < fl.end[i]; f++) {
    const fi = fl.filingIdx[f];
    if (fi <= ts && fi > ts - 10) best = f;
  }
  if (best === null) return null;
  return { date: m.dates[fl.filingIdx[best]], form: fl.fiscalQ[best] === 4 ? '10-K' : '10-Q' };
}

/** Every reason the approver could log for removing this BUY candidate, in REASON_CODES order. */
export function reasonsFor(model, rec, dtcCache, records, seed = model.seed ?? 20260928) {
  const { s, i, t } = rec;
  const N = model.N;
  const date = model.dates[t];
  const c = model.companies[i];
  const f = model.vetoFlags(s, i);
  const out = [];
  // process: the thesis draft failed the numeric validator twice and the approver did not write it
  if (draw(seed, 'validator_failed', date, c.figi) < PROCESS_FAILURE_RATES.validator_failed) {
    out.push({
      code: 'validator_failed',
      en: 'The thesis draft failed the numeric validator twice (it quoted figures that are not in the source data); the approver declined to write it by hand before the 13:45 seal, so the pick was removed.',
      sl: 'Osnutek utemeljitve dvakrat ni prestal numeričnega preverjanja (navajal je številke, ki jih ni v izvornih podatkih); odobriteljica ga pred pečatenjem ob 13:45 ni želela napisati sama, zato je bila izbira odstranjena.',
    });
  }
  // process: a material 8-K after the 22:15 data cut-off
  if (draw(seed, 'late_8k', date, c.figi) < PROCESS_FAILURE_RATES.late_8k) {
    out.push({
      code: 'late_8k',
      en: 'A material 8-K arrived after the 22:15 data cut-off and is not yet in the model inputs; the approver removed the pick rather than publish it on stale data.',
      sl: 'Pomembno poročilo 8-K je prispelo po zajemu podatkov ob 22:15 in še ni med vhodnimi podatki modelov; odobriteljica je izbiro odstranila, namesto da bi jo objavila na zastarelih podatkih.',
    });
  }
  // data: a fresh filing whose figures differ between the two fundamentals sources
  const fresh = freshFiling(model, i, s);
  if (fresh && draw(seed, 'source_mismatch', date, c.figi) < PROCESS_FAILURE_RATES.source_mismatch) {
    out.push({
      code: 'source_mismatch',
      en: `Figures in the ${fresh.form} filed on ${fmtLong(fresh.date, 'en')} differ between our two fundamentals sources; the approver held the pick until they are reconciled.`,
      sl: `Podatki iz poročila ${fresh.form}, oddanega ${fmtLong(fresh.date, 'sl')}, se v naših dveh virih temeljnih podatkov razlikujejo; odobriteljica je izbiro zadržala, dokler ne bodo usklajeni.`,
    });
  }
  // sector concentration: the pick would be the third open pick in its sector (the cap allows it)
  const sameSector = records.filter((r) => r !== rec && r.sector === rec.sector && r.t <= t && (r.closeT === null || r.closeT > t) && (r.t < t || r.k < rec.k)).length;
  if (sameSector >= 2) {
    out.push({
      code: 'sector_concentration',
      en: `It would have been the third open pick in ${rec.sector}; the approver kept the sector at two open picks.`,
      sl: `Bila bi tretja odprta izbira v sektorju ${c.sectorSl}; odobriteljica je v sektorju obdržala dve odprti izbiri.`,
    });
  }
  // earnings just outside the 3-day veto window
  if (f.nextEarnings) {
    const k = countTradingDays(date, f.nextEarnings);
    if (k >= 3 && k <= 6) {
      out.push({
        code: 'earnings_soon',
        en: `Earnings are due on ${fmtLong(f.nextEarnings, 'en')}, ${k} trading days after entry and just outside the 3-day veto window; the approver declined to publish a pick into the report.`,
        sl: `Rezultati bodo objavljeni ${fmtLong(f.nextEarnings, 'sl')}, ${k} dni trgovanja po vstopu, tik zunaj 3-dnevnega okna veta; odobriteljica izbire ni želela objaviti tik pred poročilom.`,
      });
    }
  }
  // short interest high, though below the top-decile veto
  if (f.daysToCover !== null) {
    let q = dtcCache.get(s);
    if (!q) {
      const v = [];
      for (let j = 0; j < N; j++) if (model.eligible[s * N + j]) {
        const d = model.vetoFlags(s, j).daysToCover;
        if (d !== null) v.push(d);
      }
      q = { p80: quantile(v, 0.8), p90: quantile(v, 0.9) };
      dtcCache.set(s, q);
    }
    if (f.daysToCover >= q.p80 && !f.dtcTopDecile) {
      out.push({
        code: 'short_interest',
        en: `Days to cover ${f.daysToCover.toFixed(1)}, in the top fifth of the universe though below the veto cut-off of ${q.p90.toFixed(1)}; the approver judged the short interest too high.`,
        sl: `Dnevi za pokritje ${f.daysToCover.toFixed(1).replace('.', ',')}, v zgornji petini univerzuma, a pod mejo veta ${q.p90.toFixed(1).replace('.', ',')}; odobriteljica je ocenila, da je kratkih pozicij preveč.`,
      });
    }
  }
  // a sharp run-up before the issue: the price check did not complete before the seal
  if (s >= 5) {
    const r5 = model.close[s * N + i] / model.close[(s - 5) * N + i] - 1;
    if (r5 > 0.1) {
      out.push({
        code: 'data_check',
        en: `The stock rose ${(r5 * 100).toFixed(1)}% over the five sessions before the issue; the approver asked for a price-data check that did not complete before the 13:45 seal.`,
        sl: `Delnica se je v petih sejah pred izdajo podražila za ${(r5 * 100).toFixed(1).replace('.', ',')} %; odobriteljica je zahtevala preverjanje cenovnih podatkov, ki pred pečatenjem ob 13:45 ni bilo končano.`,
      });
    }
  }
  return out;
}

/**
 * Run the sealed period with the approver: deputy days, a few human removals and one day without an
 * approver, chosen deterministically. Each decision is taken at a date after all earlier decisions, so
 * adding it never changes the state an earlier decision saw.
 */
export function sealedRun(model, rule, { maxRemovals = 5, gapDays = 35, seed = model.seed ?? 20260928 } = {}) {
  const [from, to] = periodRange(model, 'sealed');
  const start = model.dates[from];
  const unissuedTarget = firstOnOrAfter(model, addMonths(start, 7));
  const removals = []; // {t, i, by, reason}
  let unissuedT = -1;
  const dtcCache = new Map();
  const review = (ctx) => {
    if (ctx.t === unissuedT) return { approver: null, unissued: true };
    const approver = approverFor(ctx.date);
    const remove = removals.filter((r) => r.t === ctx.t).map((r) => ({ i: r.i, by: approver, reason: r.reason }));
    return { approver, remove };
  };
  let run;
  for (let guard = 0; guard < 12; guard++) {
    run = runQuorum(model, { from, to, rule, review, keepCandidates: true });
    const lastDecision = Math.max(unissuedT, ...removals.map((r) => r.t), from - 1);
    const options = [];
    if (unissuedT < 0) {
      const iss = run.issues.find((x) => x.t >= unissuedTarget && x.buys.length > 0 && x.renews.length === 0 && x.t > lastDecision);
      if (iss) options.push({ kind: 'unissued', t: iss.t });
    }
    if (removals.length < maxRemovals) {
      // the first eligible BUY with a reason not used yet (so the log is not one repeated judgement);
      // failing that, the first eligible BUY with any reason
      const lastRm = removals.length ? removals[removals.length - 1].t : from - gapDays;
      const used = new Set(removals.map((r) => r.reason.code));
      let fresh = null;
      let any = null;
      for (const rec of run.records) {
        if (rec.kind !== 'BUY' || rec.t <= lastDecision || rec.t < lastRm + gapDays || rec.t === unissuedT) continue;
        if (rec.t > to - 5) break;
        const all = reasonsFor(model, rec, dtcCache, run.records, seed);
        if (!all.length) continue;
        if (!any) any = { rec, reason: all[0] };
        const f = all.find((x) => !used.has(x.code));
        if (f) {
          fresh = { rec, reason: f };
          break;
        }
      }
      const pick = fresh ?? any;
      if (pick) options.push({ kind: 'remove', t: pick.rec.t, i: pick.rec.i, reason: pick.reason });
    }
    if (!options.length) break;
    const next = options.reduce((a, b) => (b.t < a.t ? b : a));
    if (next.kind === 'unissued') unissuedT = next.t;
    else removals.push({ t: next.t, i: next.i, reason: next.reason });
  }
  return { run, from, to, removals, unissuedT };
}

// ---- the record -----------------------------------------------------------------------------------------------

function vetoChecks(f) {
  return [
    { key: 'days_to_cover', pass: !f.dtcTopDecile, value: f.daysToCover },
    { key: 'idio_vol', pass: !f.ivolTopDecile, value: f.idioVol },
    { key: 'earnings_within_3d', pass: !f.earningsWithin3d, next: f.nextEarnings },
    { key: 'pending_ma', pass: !f.pendingMA },
    { key: 'llm_48h', pass: !f.newsNegative48h, note: 'stand-in', headlines: f.headlines.length },
  ];
}

function driverOut(d) {
  const o = { key: d.key, label: d.label, value: d.value, unit: 'z', raw: d.raw };
  if (d.context) o.context = true;
  if (d.weight !== undefined) o.weight = d.weight;
  return o;
}

function nyCloseIso(date) {
  return localIso(date, '16:00:00', NEW_YORK);
}

/**
 * Build the sealed record: picks, issues, the hash-chained ledger and its daily anchors.
 * @returns Promise<{ rule, persons, methodology, picks, issues, ledger: {entries, anchors}, run, from, to, decisions }>
 */
export async function buildRecord(model, rule, { seed = model.seed ?? 20260928, token = SMS_TOKEN } = {}) {
  const { N, T, dates } = model;
  const { run, from, to, removals, unissuedT } = sealedRun(model, rule, { seed });
  const methodology = methodologyVersions(model, rule);
  const versionOn = (date) => (date >= methodology[1].effective ? methodology[1].version : methodology[0].version);
  const recs = run.records;
  const noOf = (k) => pad4(k + 1);
  const issueNoOf = new Map(run.issues.map((x, k) => [x.t, k + 1]));
  const issueByT = new Map(run.issues.map((x) => [x.t, x]));

  // ---- enriched picks ----
  const picks = [];
  const secondInDay = new Map();
  for (const rec of recs) {
    const c = model.companies[rec.i];
    const s = rec.s;
    const t = rec.t;
    const issueDate = dates[t];
    const slot = issueSlot(issueDate);
    const sec = (secondInDay.get(t) ?? 1) + 1;
    secondInDay.set(t, sec);
    const producedAt = slot.sealAt.replace('13:45:00', `13:45:${pad2(sec)}`);
    const no = noOf(rec.k);
    const priorNo = rec.prior !== null ? noOf(rec.prior) : null;
    const exitPlanned = rec.tExit <= T - 1 ? dates[rec.tExit] : addTradingDays(issueDate, HORIZON);
    const drivers = model.drivers(s, rec.i);
    const flags = model.vetoFlags(s, rec.i);
    const families = {};
    for (const f of FAMS) families[f] = { pct: floorPct(rec.pct[f]), drivers: (drivers[f] ?? []).map(driverOut) };
    const sens = sensitivity(rec.pct, rec.agreeing, rule.topPct);
    const split = splitFactor(model, rec.i, seed);
    const px = (x) => r2(x / split);
    const entryOpen = px(model.open[t * N + rec.i]);
    const prevClose = px(model.close[s * N + rec.i]);
    const checks = vetoChecks(flags);
    const thesis = writeThesis({
      kind: rec.kind, no, priorNo, ticker: c.ticker, name: c.name, sector: c.sector, sectorSl: c.sectorSl,
      agreement: rec.agreement, agreeing: rec.agreeing, crashSwitch: rec.crashSwitch, topPct: rule.topPct,
      families, drivers, vetoChecks: checks, exitPlanned,
    });
    const salt = randomToken(16, mulberry32(hashSeed(seed, 'salt', no)));
    const reveal = { no, ticker: c.ticker, figi: c.figi, issueDate, agreeing: rec.agreeing, salt };
    const commit = await commitment(reveal);
    const smsKind = rec.kind === 'BUY' ? 'BUY' : 'RENEW';
    const smsData = { no, ticker: c.ticker, issueDate, entryDate: issueDate, exitDate: exitPlanned, agreement: rec.agreement, token, priorNo: priorNo ?? undefined };
    const sms = { en: renderSms(smsKind, 'en', smsData), sl: renderSms(smsKind, 'sl', smsData) };
    // outcome from the published (rounded) prices, so anyone can recompute it
    let outcome = null;
    let exit = null;
    let mark = null;
    // path grid: [trading days after the entry date, net, bench]. The first row is the entry at the US
    // open (net = what a sale at that price would return after both legs' costs), then the close of
    // every trading day from the entry day (d = 0) to d = 20, and for a closed record the exit at the
    // open of d = 21. Every row's net is the round-trip return if sold at that price.
    const cost = model.oneWayCost(s, rec.i);
    const path = [[0, r6((1 - cost) / (1 + cost) - 1), 0]];
    const b0 = model.benchmark.open[t];
    if (rec.outcome) {
      const ce = rec.closeT;
      const raw = rec.outcome;
      const exitOpen = raw.delisted ? r2(entryOpen * (1 + raw.gross)) : px(model.open[ce * N + rec.i]);
      const gross = exitOpen / entryOpen - 1;
      const net = ((1 + gross) * (1 - cost)) / (1 + cost) - 1;
      const bench = raw.bench;
      outcome = {
        exitDate: dates[ce],
        exitOpen,
        gross: r6(gross),
        net: r6(net),
        bench: r6(bench),
        excess: r6(net - bench),
        eurNet: r6(((1 + net) * model.eurusd[s]) / model.eurusd[ce - 1] - 1),
        alertGapBps: round((entryOpen / prevClose - 1) * 1e4, 1),
        d5: r6(raw.d5),
        d63: r6(raw.d63),
      };
      if (raw.delisted) outcome.delisted = raw.delisted;
      exit = { date: dates[ce], open: exitOpen };
      mark = { date: dates[ce], close: px(model.close[ce * N + rec.i]), net: outcome.net, bench: outcome.bench, excess: outcome.excess };
      for (let d = 0; d < HORIZON; d++) {
        const x = t + d;
        const pn = ((px(model.close[x * N + rec.i]) / entryOpen) * (1 - cost)) / (1 + cost) - 1;
        path.push([d, r6(pn), r6(model.benchmark.close[x] / b0 - 1)]);
      }
      path.push([HORIZON, outcome.net, outcome.bench]);
    } else {
      const last = T - 1;
      for (let d = 0; t + d <= last && d < HORIZON; d++) {
        const x = t + d;
        const pn = ((px(model.close[x * N + rec.i]) / entryOpen) * (1 - cost)) / (1 + cost) - 1;
        path.push([d, r6(pn), r6(model.benchmark.close[x] / b0 - 1)]);
      }
      const closeNow = px(model.close[last * N + rec.i]);
      const net = ((closeNow / entryOpen) * (1 - cost)) / (1 + cost) - 1;
      const bench = model.benchmark.close[last] / b0 - 1;
      mark = { date: dates[last], close: closeNow, net: r6(net), bench: r6(bench), excess: r6(net - bench) };
    }
    const issue = issueByT.get(t);
    picks.push({
      no,
      kind: rec.kind,
      priorNo,
      renewedAs: rec.next !== null ? noOf(rec.next) : null,
      status: rec.status,
      ticker: c.ticker,
      name: c.name,
      isin: c.isin,
      figi: c.figi,
      sector: c.sector,
      sectorSl: c.sectorSl,
      venue: c.venue,
      issueDate,
      issueNo: issueNoOf.get(t),
      producedAt,
      disseminatedAt: slot.publishAt,
      dissemination: { price: prevClose, source: 'SIM last close', at: nyCloseIso(dates[s]) },
      entry: { date: issueDate, open: entryOpen },
      exitPlanned,
      exit,
      agreement: rec.agreement,
      agreeing: rec.agreeing,
      crashSwitch: rec.crashSwitch,
      combined: r4(rec.combined),
      families,
      sensitivity: sens ? { family: sens.family, pct: floorPct(sens.pct), margin: floorPct(sens.margin) } : null,
      vetoChecks: checks,
      insider: model.insider(s, rec.i),
      thesis: { en: thesis.en, sl: thesis.sl },
      thesisNumbers: thesis.numbers.map((x) => round(x, 6)),
      drafter: 'template',
      validator: thesis.validator,
      approver: issue.approver ?? approverFor(issueDate),
      modelLead: 'p2',
      modelVersion: MODEL_VERSION,
      methodology: versionOn(issueDate),
      outcome,
      mark,
      path,
      sms,
      closeSms: null,
      seq: null,
      closeSeq: null,
      commit,
      reveal,
      history12m: [],
      costOneWay: cost,
      splitFactor: split,
      _k: rec.k,
      _i: rec.i,
      _t: t,
      _closeT: rec.closeT,
    });
  }
  // CLOSE SMS, prior recommendations on the same stock within 12 months
  for (const p of picks) {
    if (p.status === 'closed') {
      const d = { no: p.no, ticker: p.ticker, issueDate: p.exit.date, token };
      p.closeSms = { en: renderSms('CLOSE', 'en', d), sl: renderSms('CLOSE', 'sl', d) };
    }
    const yearAgo = `${Number(p.issueDate.slice(0, 4)) - 1}${p.issueDate.slice(4)}`;
    p.history12m = picks.filter((q) => q._i === p._i && q.issueDate < p.issueDate && q.issueDate >= yearAgo).map((q) => q.no);
  }

  // ---- ledger ----
  const entries = [];
  let prev = null;
  const add = async (type, issueDate, at, body) => {
    prev = await createEntry(prev, { type, issueDate, at, body });
    entries.push(prev);
    return prev;
  };
  const methBody = (m) => ({ version: m.version, effective: m.effective, summary: m.summary, modelVersion: m.modelVersion });
  const methSeq = {};
  const pickByK = new Map(picks.map((p) => [p._k, p]));
  const issueRows = [];
  for (let n = 0; n < run.issues.length; n++) {
    const iss = run.issues[n];
    const date = iss.date;
    const slot = issueSlot(date);
    for (const m of methodology) {
      if (m.effective === date) {
        const e = await add('METHODOLOGY', date, localIso(date, '08:00:00'), methBody(m));
        methSeq[m.version] = e.seq;
      }
    }
    for (const k of [...iss.renews, ...iss.buys]) {
      const p = pickByK.get(k);
      const body = p.kind === 'BUY'
        ? { no: p.no, commit: p.commit, horizon: HORIZON, exitPlanned: p.exitPlanned, agreement: p.agreement, methodology: p.methodology, modelVersion: MODEL_VERSION, producedAt: p.producedAt }
        : { no: p.no, priorNo: p.priorNo, commit: p.commit, horizon: HORIZON, exitPlanned: p.exitPlanned, agreement: p.agreement, methodology: p.methodology, modelVersion: MODEL_VERSION, producedAt: p.producedAt };
      const e = await add(p.kind, date, slot.sealAt, body);
      p.seq = e.seq;
    }
    const human = iss.human.map((h) => ({ by: h.by, reason: { en: h.reason.en, sl: h.reason.sl }, code: h.reason.code }));
    const issueBody = {
      issueNo: n + 1,
      nScored: iss.nScored,
      closest: iss.closest,
      buys: iss.buys.map((k) => pickByK.get(k).no),
      renews: iss.renews.map((k) => pickByK.get(k).no),
      closes: iss.closes.map((k) => pickByK.get(k).no),
      vetoes: { ...iss.vetoes },
      methodology: versionOn(date),
      approver: iss.approver,
      humanVetoes: human,
      unissued: iss.unissued,
    };
    const issueEntry = await add('ISSUE', date, slot.publishAt, issueBody);
    const closeAt = formatInZone(new Date(Date.parse(slot.usOpenAt) + 60000), LJUBLJANA).iso;
    for (const k of iss.closes) {
      const p = pickByK.get(k);
      // every earlier record of a renewed chain is revealed with its final CLOSE
      const priorReveals = [];
      let q = p.priorNo ? picks.find((x) => x.no === p.priorNo) : null;
      while (q) {
        priorReveals.unshift(q.reveal);
        q = q.priorNo ? picks.find((x) => x.no === q.priorNo) : null;
      }
      const e = await add('CLOSE', date, closeAt, {
        no: p.no,
        reveal: p.reveal,
        entry: { date: p.entry.date, open: p.entry.open },
        exit: { date: p.exit.date, open: p.exit.open },
        net: p.outcome.net,
        bench: p.outcome.bench,
        excess: p.outcome.excess,
        priorReveals,
      });
      p.closeSeq = e.seq;
    }
    issueRows.push({
      date,
      issueNo: n + 1,
      publishAt: slot.publishAt,
      tz: slot.tzLabel,
      nScored: iss.nScored,
      closest: iss.closest,
      quorum: iss.buys.length + iss.renews.length > 0,
      buys: issueBody.buys,
      renews: issueBody.renews,
      closes: issueBody.closes,
      vetoes: { ...iss.vetoes },
      blocked: { ...iss.blocked },
      seq: issueEntry.seq,
      hash: issueEntry.hash,
      reached: iss.reached,
      crashSwitch: iss.crashSwitch,
      approver: iss.approver,
      humanVetoes: human,
      unissued: iss.unissued,
      methodology: versionOn(date),
    });
  }
  // daily anchors: Merkle root over each issue date's entry hashes
  const byDate = new Map();
  for (const e of entries) {
    if (!byDate.has(e.issueDate)) byDate.set(e.issueDate, []);
    byDate.get(e.issueDate).push(e.hash);
  }
  const anchorDates = [...byDate.keys()];
  const anchors = [];
  for (let k = 0; k < anchorDates.length; k++) {
    const d = anchorDates[k];
    anchors.push({ date: d, merkleRoot: await merkleRoot(byDate.get(d)), rowCount: byDate.get(d).length, ots: k >= anchorDates.length - 2 ? 'pending' : 'confirmed', rfc3161: 'demo' });
  }
  const methodologyOut = methodology.map((m) => ({ version: m.version, effective: m.effective, summary: m.summary, seq: methSeq[m.version] ?? null }));
  return {
    rule,
    persons: PERSONS,
    methodology: methodologyOut,
    picks,
    issues: issueRows,
    ledger: { entries, anchors },
    run,
    from,
    to,
    decisions: {
      removals: removals.map((r) => ({ date: dates[r.t], ticker: model.companies[r.i].ticker, code: r.reason.code, reason: r.reason.en })),
      unissued: unissuedT >= 0 ? { date: dates[unissuedT], tickers: run.issues.find((x) => x.t === unissuedT)?.unissuedTickers ?? [] } : null,
    },
  };
}
