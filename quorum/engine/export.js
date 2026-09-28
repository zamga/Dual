// Writes the data contract of docs/ARCHITECTURE.md §3 to web/data/*.json. Deterministic: the same
// model, validation and record give byte-identical files (no wall-clock time anywhere).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zonedToInstant, formatInZone, NEW_YORK } from '../core/calendar.js';
import { mean, median, wilsonCI, bootstrapCI, maxDrawdown } from '../core/stats.js';
import {
  FAMS, round, periodRange, episodeSets, outcomeStats, followEquity, monthEnds, monthEndSignals, universeStats, vetoBits, vetoKeysOf,
} from './backtest.js';
import { MODEL_VERSION, PERSONS } from './record.js';

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'data');
export const FILES = ['meta', 'summary', 'issues', 'ledger', 'picks', 'scoreboard', 'deciles', 'hero', 'universe', 'backtest'];

const r2 = (x) => round(x, 2);
const r3 = (x) => round(x, 3);
const r4 = (x) => round(x, 4);
const r6 = (x) => round(x, 6);
const ci4 = (c) => (c ? c.map((x) => r4(x)) : null);
const ci6 = (c) => (c ? c.map((x) => r6(x)) : null);

function nyClose(date) {
  return formatInZone(zonedToInstant(date, '16:00:00', NEW_YORK), NEW_YORK).iso;
}

/** Stable JSON: rounding is done by the builders; NaN/undefined never reach the file. */
function stringify(value) {
  return `${JSON.stringify(value, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v))}\n`;
}

// ---- builders -------------------------------------------------------------------------------------------

function familiesMeta(model) {
  const nF = model.dModel?.features?.length;
  return FAMS.map((f) => {
    const m = model.families[f];
    const def = { ...m.def };
    if (f === 'D' && nF) {
      def.en = def.en.replace(/on \d+ rank-transformed/, `on ${nF} rank-transformed`);
      def.sl = def.sl.replace(/na \d+ rangiranih/, `na ${nF} rangiranih`);
    }
    return { id: f, name: m.name, def };
  });
}

export function buildMeta(model, rec, validation) {
  const T = model.T;
  const picks = rec.picks;
  return {
    simulated: true,
    seed: model.seed,
    asOf: model.dates[T - 1],
    dataThrough: nyClose(model.dates[T - 1]),
    sealedSince: model.periods.sealed[0],
    holdout: { from: model.periods.holdout[0], to: model.periods.holdout[1] },
    engineFrozen: model.periods.freeze,
    methodology: rec.methodology,
    modelVersion: MODEL_VERSION,
    families: familiesMeta(model),
    persons: PERSONS,
    universe: { scoredToday: rec.issues[rec.issues.length - 1].nScored, eligibleRule: { minPrice: 5, minMcap: 2e9, minAdv: 25e6 } },
    counts: {
      issues: rec.issues.length,
      quorumDays: rec.issues.filter((x) => x.quorum).length,
      picks: picks.filter((p) => p.kind === 'BUY').length,
      renews: picks.filter((p) => p.kind === 'RENEW').length,
      closed: picks.filter((p) => p.outcome).length,
      open: picks.filter((p) => p.status === 'open').length,
    },
    rule: {
      topPct: validation.rule.topPct,
      minAgree: validation.rule.minAgree,
      maxPerIssue: validation.rule.maxPerIssue,
      maxPerMonth: validation.rule.maxPerMonth,
      maxPerSector: validation.rule.maxPerSector,
      cooldownDays: validation.rule.cooldownDays,
      horizon: 21,
      costs: { above10B: 0.001, from2to10B: 0.0025 },
    },
    notes: {
      llmVeto: 'stand-in',
      counting: 'picks = BUY records, renews = RENEW records; closed = records whose 21-day window has ended (closed or renewed); open = records still inside their window',
      prices: 'Simulated prices, adjusted for simulated 2-for-1 share splits dated before the sealed record; returns are unaffected',
    },
  };
}

function followFor(model, picks, from, to) {
  const pos = picks.map((p) => ({ i: p._i, t: p._t, tExit: p._closeT ?? p._t + 21, cost: p.costOneWay }));
  return followEquity(model, pos, from, to);
}

export function buildSummary(model, rec) {
  const measured = rec.picks.filter((p) => p.outcome);
  const ex = measured.map((p) => p.outcome.excess);
  const wins = ex.filter((x) => x > 0).length;
  const revealed = (p) => {
    let q = p;
    for (let d = 0; q && d < 50; d++) {
      if (q.status === 'closed') return true;
      if (q.status !== 'renewed') return false;
      q = rec.picks.find((x) => x.no === q.renewedAs);
    }
    return false;
  };
  const pickRef = (p) => (p ? { no: p.no, ticker: revealed(p) ? p.ticker : null, excess: p.outcome.excess, ...(revealed(p) ? {} : { sealed: true }) } : null);
  const worst = measured.reduce((a, b) => (!a || b.outcome.excess < a.outcome.excess ? b : a), null);
  const best = measured.reduce((a, b) => (!a || b.outcome.excess > a.outcome.excess ? b : a), null);
  const eq = followFor(model, rec.picks, rec.from, model.T - 1);
  const vetoes = { rule: 0, llm: 0, human: 0, capped: 0 };
  for (const iss of rec.issues) for (const k of Object.keys(vetoes)) vetoes[k] += iss.vetoes[k];
  return {
    simulated: true,
    liveSince: model.periods.sealed[0],
    label: { en: 'Pre-launch sealed record (no subscribers)', sl: 'Zapečaten zapis pred zagonom (brez naročnikov)' },
    nPicks: rec.picks.length,
    nClosed: measured.length,
    hitRate: r4(wins / measured.length),
    hitCI: ci4(wilsonCI(wins, measured.length)),
    medianExcess: r6(median(ex)),
    meanExcess: r6(mean(ex)),
    worstPick: pickRef(worst),
    bestPick: pickRef(best),
    maxDrawdown: r4(maxDrawdown(Array.from(eq.idx))),
    medianAlertGapBps: round(median(rec.picks.map((p) => (p.entry.open / p.dissemination.price - 1) * 1e4)), 1),
    cumulative: { follow: r4(eq.idx[eq.idx.length - 1] - 1), bench: r4(eq.bench[eq.bench.length - 1] - 1) },
    vetoes,
    equity: eq.dates.map((d, k) => [d, r6(eq.idx[k]), r6(eq.bench[k])]),
    meanEurNet: r6(mean(measured.map((p) => p.outcome.eurNet))),
    unissued: rec.issues.reduce((a, x) => a + x.unissued, 0),
  };
}

// issues.json and picks.json are arrays, so every row carries "simulated": true
export function buildIssues(rec) {
  return rec.issues.map((x) => ({
    simulated: true,
    date: x.date,
    issueNo: x.issueNo,
    publishAt: x.publishAt,
    tz: x.tz,
    nScored: x.nScored,
    closest: x.closest,
    quorum: x.quorum,
    buys: x.buys,
    renews: x.renews,
    closes: x.closes,
    vetoes: x.vetoes,
    seq: x.seq,
    hash: x.hash,
    reached: x.reached,
    crashSwitch: x.crashSwitch,
    approver: x.approver,
    humanVetoes: x.humanVetoes,
    unissued: x.unissued,
    methodology: x.methodology,
  }));
}

export function buildLedger(rec) {
  return { simulated: true, genesis: '0'.repeat(64), entries: rec.ledger.entries, anchors: rec.ledger.anchors };
}

export function buildPicks(rec) {
  return rec.picks.map((p) => {
    const out = { simulated: true };
    for (const [k, v] of Object.entries(p)) if (!k.startsWith('_') && k !== 'costOneWay' && k !== 'splitFactor') out[k] = v;
    return out;
  });
}

// ---- scoreboard and deciles: sealed record plus holdout --------------------------------------------------

function periodSetStats(model, rule, period) {
  const [from, to] = periodRange(model, period);
  const top = rule.topPct;
  const sets = episodeSets(model, {
    from,
    to,
    topPct: top,
    sets: {
      A: (q) => model.pct.A[q] >= top,
      B: (q) => model.pct.B[q] >= top,
      C: (q) => model.pct.C[q] >= top,
      D: (q) => model.pct.D[q] >= top,
      twoOfFour: (q, n2) => n2 === 2,
    },
  });
  return Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, outcomeStats(v)]));
}

function familyBlock(st, icRows, f) {
  const ics = icRows.map((r) => r[f]).filter(Number.isFinite);
  return {
    hit: r4(st.hit),
    hitCI: ci4(st.hitCI),
    ic: r4(mean(ics)),
    icCI: ci4(ics.length > 1 ? bootstrapCI(ics, mean, { n: 2000 }) : null),
    meanExcess: r6(st.meanExcess),
    medianExcess: r6(st.medianExcess),
    n: st.n,
    icMonths: ics.length,
  };
}

function agreementBlock(st) {
  return { n: st.n, hit: r4(st.hit), hitCI: ci4(st.hitCI), medianExcess: r6(st.medianExcess), meanExcess: r6(st.meanExcess) };
}

export function buildScoreboardAndDeciles(model, rec, validation) {
  const rule = validation.rule;
  const sealedSets = periodSetStats(model, rule, 'sealed');
  const holdout = validation.holdout;
  const [sf, st] = periodRange(model, 'sealed');
  const sealedUni = universeStats(model, monthEndSignals(model, sf - 1, st - 1));
  const measured = rec.picks.filter((p) => p.outcome);
  const sealedAgree = {
    '4/4': outcomeStats(measured.filter((p) => p.agreement === 4).map((p) => p.outcome)),
    '3/4': outcomeStats(measured.filter((p) => p.agreement === 3).map((p) => p.outcome)),
    '2/4 shadow': sealedSets.twoOfFour,
  };
  const order = ['A', 'B', 'C', 'D'];
  const pairs = sealedUni.correlations;
  const matrix = order.map((a) => order.map((b) => (a === b ? 1 : r3(pairs[a < b ? a + b : b + a]))));
  const scoreboard = {
    simulated: true,
    periods: { sealed: { from: model.periods.sealed[0], to: model.periods.sealed[1] }, holdout: { from: model.periods.holdout[0], to: model.periods.holdout[1] } },
    topPct: rule.topPct,
    method: {
      en: `Each family's top ${Math.round((1 - rule.topPct) * 100)}% and the 2/4 shadow set are measured like picks: same vetoes, 21-day open-to-open windows, same costs, excess vs the S&P 500 TR (simulated). IC: month-end scores vs the next 21-day open-to-open return (Spearman).`,
      sl: `Zgornjih ${Math.round((1 - rule.topPct) * 100)} % vsake družine in kontrolni niz 2/4 sta merjena kot izbire: enaki veti, 21-dnevna okna od odprtja do odprtja, enaki stroški, presežek glede na S&P 500 TR (simulirano). IC: ocene ob koncu meseca proti naslednjemu 21-dnevnemu donosu (Spearman).`,
    },
    families: FAMS.map((f) => ({ id: f, sealed: familyBlock(sealedSets[f], sealedUni.ic, f), holdout: familyBlock(holdout.sets[f], holdout.universe.ic, f) })),
    agreement: ['4/4', '3/4', '2/4 shadow'].map((k) => ({ k, sealed: agreementBlock(sealedAgree[k]), holdout: agreementBlock(holdout.byAgreement[k]) })),
    correlations: { order, matrix, period: 'sealed', basis: 'mean monthly cross-sectional Spearman' },
    icMonthly: sealedUni.ic.map((r) => [r.month, Object.fromEntries(FAMS.map((f) => [f, r4(r[f])]))]),
  };
  const dec = (u) => Object.fromEntries(['combined', ...FAMS].map((k) => [k, u.deciles[k].map((d) => ({ d: d.d, excess: r6(d.excess), ci: ci6(d.ci) }))]));
  const deciles = {
    simulated: true,
    basis: { en: 'Full universe, month-end deciles, next 21-day open-to-open return minus the benchmark, before costs; 95% bootstrap intervals over months', sl: 'Celoten univerzum, decili ob koncu meseca, naslednji 21-dnevni donos od odprtja do odprtja minus primerjalni indeks, pred stroški; 95-odstotni intervali (bootstrap po mesecih)' },
    months: { sealed: sealedUni.months, holdout: holdout.universe.months },
    sealed: dec(sealedUni),
    holdout: dec(holdout.universe),
  };
  return { scoreboard, deciles };
}

// ---- hero and universe ----------------------------------------------------------------------------------

export function buildHero(model, rec) {
  const closed = rec.picks.filter((p) => p.status === 'closed');
  const last = closed.reduce((a, b) => (!a || b._closeT > a._closeT || (b._closeT === a._closeT && b.no > a.no) ? b : a), null);
  if (!last) return { simulated: true, issueDate: null, pick: null, p: [] };
  const t = last._t;
  const s = t - 1;
  const { N } = model;
  const iss = rec.issues.find((x) => x.date === last.issueDate);
  const p = [];
  let index = -1;
  let row = 0;
  for (let i = 0; i < N; i++) {
    const q = s * N + i;
    if (!model.eligible[q]) continue;
    const v = FAMS.map((f) => model.pct[f][q]);
    if (!v.some((x) => x === x)) continue;
    if (i === last._i) index = row;
    for (const x of v) p.push(x === x ? Math.max(0, Math.min(1000, Math.round(x * 1000))) : -1);
    row++;
  }
  return {
    simulated: true,
    issueDate: last.issueDate,
    issueNo: last.issueNo,
    nScored: iss.nScored,
    quorumCount: iss.buys.length + iss.renews.length,
    pick: { no: last.no, ticker: last.ticker, name: last.name, agreeing: last.agreeing, index, kind: last.kind },
    p,
    sms: last.sms.en,
    smsSl: last.sms.sl,
    smsAt: last.disseminatedAt,
    outcome: { excess: last.outcome.excess, net: last.outcome.net, bench: last.outcome.bench, exitDate: last.outcome.exitDate },
    path: last.path,
  };
}

export function buildUniverse(model, rule) {
  const { N, T } = model;
  const s = T - 2;
  const rows = [];
  for (let i = 0; i < N; i++) {
    const q = s * N + i;
    if (!model.eligible[q]) continue;
    const v = FAMS.map((f) => model.pct[f][q]);
    if (!v.some((x) => x === x)) continue;
    const c = model.companies[i];
    const keys = vetoKeysOf(vetoBits(model, s, i));
    const agree = v.filter((x) => x >= rule.topPct).length;
    const ret21 = s >= 21 ? model.close[q] / model.close[(s - 21) * N + i] - 1 : NaN;
    rows.push([c.ticker, c.name, c.sector, ...v.map((x) => (x === x ? r4(x) : null)), agree, keys[0] ?? null, Math.round(model.mcap[q]), Math.round(model.adv60[q]), r4(ret21)]);
  }
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return {
    simulated: true,
    date: model.dates[T - 1],
    scoresAsOf: model.dates[s],
    cols: ['ticker', 'name', 'sector', 'A', 'B', 'C', 'D', 'agree', 'veto', 'mcap', 'adv60', 'ret21'],
    notes: { agree: `families at or above the ${rule.topPct} percentile`, ret21: 'trailing 21-day close-to-close return to the score date', veto: 'first veto that fires (llm_48h is a stand-in)' },
    rows,
  };
}

// ---- backtest (HYPOTHETICAL) ------------------------------------------------------------------------------

export function buildBacktest(model, validation) {
  const R = validation.research;
  const H = validation.holdout;
  const [rf] = periodRange(model, 'research');
  const [, ht] = periodRange(model, 'holdout');
  const recs = [...R.run.records, ...H.run.records].filter((r) => r.outcome);
  const pos = recs.map((r) => ({ i: r.i, t: r.t, tExit: r.closeT, cost: r.outcome.cost }));
  const eqQ = followEquity(model, pos, rf, ht);
  const eqS = {};
  for (const k of ['twoOfFour', 'A', 'B', 'C', 'D']) eqS[k] = followEquity(model, [...R.setsRaw[k], ...H.setsRaw[k]], rf, ht);
  const series = [eqQ.idx, eqQ.bench, eqS.twoOfFour.idx, eqS.A.idx, eqS.B.idx, eqS.C.idx, eqS.D.idx];
  const equity = monthEnds(eqQ.dates, series).map(([d, ...v]) => [d, ...v.map((x) => r4(x))]);
  // calendar-year returns
  const annual = [];
  const years = [...new Set(eqQ.dates.map((d) => d.slice(0, 4)))];
  let prevQ = 1;
  let prevB = 1;
  for (const y of years) {
    let k = -1;
    for (let z = 0; z < eqQ.dates.length; z++) if (eqQ.dates[z].slice(0, 4) === y) k = z;
    const n = [...R.run.records, ...H.run.records].filter((r) => model.dates[r.t].slice(0, 4) === y).length;
    const row = { year: Number(y), quorum: r4(eqQ.idx[k] / prevQ - 1), bench: r4(eqQ.bench[k] / prevB - 1), n };
    if (eqQ.dates[k].slice(5) < '12-20' || (y === eqQ.dates[0].slice(0, 4) && eqQ.dates[0].slice(5) > '01-10')) row.partial = true;
    annual.push(row);
    prevQ = eqQ.idx[k];
    prevB = eqQ.bench[k];
  }
  const stats = (ev) => ({
    picksPerMonth: r3(ev.picksPerMonth),
    renewsPerMonth: r3(ev.renewsPerMonth),
    records: ev.quorum.n,
    hitRate: r4(ev.quorum.hit),
    hitCI: ci4(ev.quorum.hitCI),
    medianExcess: r6(ev.quorum.medianExcess),
    meanExcess: r6(ev.quorum.meanExcess),
    sharpe: r3(ev.annualisedSharpe),
    sharpeBasis: 'monthly excess return of the follow-every-pick portfolio over the benchmark, annualised',
    maxDrawdown: r4(ev.maxDrawdown),
  });
  const v = validation.variants;
  const dsrDetail = {
    basis: 'holdout monthly excess returns of the follow-every-pick portfolio, net of costs',
    srMonthly: r4(H.monthlySharpe),
    months: H.monthlyExcess.length,
    skew: r3(H.skew),
    kurtosis: r3(H.kurt),
    nTrials: v.n,
    varSRMonthly: round(v.varSRMonthly, 6),
    expectedMaxSharpeMonthly: r4(v.expectedMaxSharpeMonthly),
    dsrResearch: r4(validation.dsrResearch),
    researchSrMonthly: r4(R.monthlySharpe),
    researchMonths: R.monthlyExcess.length,
  };
  return {
    simulated: true,
    label: 'HYPOTHETICAL',
    window: { from: R.from, to: R.to },
    holdout: { from: H.from, to: H.to },
    variantsTried: v.n,
    dsr: r4(validation.dsr),
    pbo: r4(validation.pbo),
    variantSharpes: v.sharpesAnnual.map((x) => r3(x)),
    variantGrid: {
      thresholds: v.thresholds,
      gbdtConfigurations: model.experiments.map((e) => ({ id: e.id, params: e.params, features: e.features, cvIC: e.metric.value })),
      rows: v.rows,
      rowsFrom: v.rowsFrom,
      rowsTo: v.rowsTo,
      basis: 'every CV date (20 trading days apart) of the research window: mean 21-day net excess return of the stocks meeting each variant, with out-of-fold D ranks of each GBDT configuration',
      order: 'variantSharpes[k] is GBDT configuration gbdtConfigurations[floor(k / thresholds.length)] with thresholds[k % thresholds.length]; Sharpes are annualised',
    },
    dsrDetail,
    gates: validation.gates,
    equity,
    equityCols: ['quorum', 'bench', 'twoOfFour', 'A', 'B', 'C', 'D'],
    annual,
    stats: stats(R),
    statsHoldout: stats(H),
    rule: { topPct: validation.rule.topPct, minAgree: validation.rule.minAgree, maxPerIssue: validation.rule.maxPerIssue, maxPerMonth: validation.rule.maxPerMonth, maxPerSector: validation.rule.maxPerSector, cooldownDays: validation.rule.cooldownDays },
    calibration: {
      selection: validation.calibration.selection,
      chosen: validation.calibration.chosen,
      variants: validation.calibration.variants,
    },
    crashSwitchPeriods: model.crashPeriods.filter(([a]) => a <= H.to),
  };
}

// ---- write ------------------------------------------------------------------------------------------------

/** Build every file. Returns { name: object }. */
export function buildAll(model, validation, rec) {
  const { scoreboard, deciles } = buildScoreboardAndDeciles(model, rec, validation);
  return {
    meta: buildMeta(model, rec, validation),
    summary: buildSummary(model, rec),
    issues: buildIssues(rec),
    ledger: buildLedger(rec),
    picks: buildPicks(rec),
    scoreboard,
    deciles,
    hero: buildHero(model, rec),
    universe: buildUniverse(model, validation.rule),
    backtest: buildBacktest(model, validation),
  };
}

/** Write the files (overwrites any fixture placeholders). Returns [{file, bytes}]. */
export function writeAll(files, dir = DATA_DIR) {
  mkdirSync(dir, { recursive: true });
  const out = [];
  for (const name of FILES) {
    const text = stringify(files[name]);
    writeFileSync(join(dir, `${name}.json`), text);
    out.push({ file: `${name}.json`, bytes: Buffer.byteLength(text) });
  }
  return out;
}
