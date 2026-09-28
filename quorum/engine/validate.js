// Validation (brief §3.4): calibrate the thresholds on the research window only, log every variant
// tried (thresholds x the GBDT configurations of the D search), compute the Deflated Sharpe Ratio and
// the Probability of Backtest Overfitting over them, then open the holdout once and compute the five
// ship gates. Nothing here is typed in: every gate value is computed from the runs.
//
// Variant matrix. Every GBDT configuration tried (model.experiments, purged k-fold CV inside the
// research window) left out-of-fold D predictions on the CV grid (every 20th trading day). For each
// configuration and each threshold variant (topPct x minAgree), a CV date's return is the mean 21-day
// open-to-open excess return, net of costs, of every stock that meets the variant's rule that day
// (A, B, C from the families, D from that configuration's out-of-fold ranks, crash switch and vetoes
// applied; 0 when no stock qualifies). Rows are CV dates (about one a month), columns are variants.
import { deflatedSharpe, expectedMaxSharpe, pbo, mean, std, skewness, kurtosis, sharpe, maxDrawdown, spearman } from '../core/stats.js';
import { DEFAULT_RULE } from '../core/quorum-rule.js';
import {
  runQuorum, periodRange, picksPerMonth, outcomeStats, lastOnOrBefore, vetoBits, measure, episodeSets,
  compositeABC, followEquity, monthlyReturns, monthEndSignals, universeStats, FAMS, round,
} from './backtest.js';

export const THRESHOLD_GRID = Object.freeze({
  topPct: [0.9, 0.91, 0.92, 0.93, 0.94, 0.95, 0.96, 0.97],
  minAgree: [3, 4],
});
export const TARGET_PICKS = Object.freeze({ min: 3, max: 6 });

// ---- calibration on the research window ------------------------------------------------------------------

/**
 * Daily capped quorum run on the research window for every threshold variant. The chosen variant keeps
 * the product's "3 of 4" gate (minAgree 3) and the topPct closest to the default 0.9 whose research
 * pick rate (new BUYs per calendar month) lies in 3-6. 4-of-4 variants are run and logged (they count
 * as trials) but are not eligible: conviction is shown as 3/4 or 4/4 (brief §2.3.6).
 */
export function calibrate(model, { grid = THRESHOLD_GRID, target = TARGET_PICKS } = {}) {
  const [from, to] = periodRange(model, 'research');
  const exitLimit = lastOnOrBefore(model, model.periods.research[1]);
  const log = [];
  for (const minAgree of grid.minAgree) {
    for (const topPct of grid.topPct) {
      // thresholds are tuned against the §2.3 caps only; the 16-message SMS budget is a backstop that
      // the product runs apply on top (logged here as picksPerMonthWithSmsBudget)
      const run = runQuorum(model, { from, to, rule: { topPct, minAgree }, exitLimit, maxMessages: null });
      const ppm = picksPerMonth(model, run);
      const measured = run.records.filter((r) => r.outcome);
      const st = outcomeStats(measured.map((r) => r.outcome), { ci: false });
      const withBudget = runQuorum(model, { from, to, rule: { topPct, minAgree }, exitLimit });
      const ppmB = picksPerMonth(model, withBudget);
      log.push({
        id: `T-${String(log.length + 1).padStart(2, '0')}`,
        topPct,
        minAgree,
        picksPerMonth: round(ppm.mean, 3),
        renewsPerMonth: round(picksPerMonth(model, run, { kinds: ['RENEW'] }).mean, 3),
        picksPerMonthWithSmsBudget: round(ppmB.mean, 3),
        monthsAtSmsBudget: withBudget.issues.filter((x) => x.smsBudgetCapped).map((x) => x.date.slice(0, 7)).filter((m, k, a) => a.indexOf(m) === k).length,
        records: run.records.length,
        measured: st.n,
        hit: round(st.hit, 4),
        meanExcess: round(st.meanExcess, 6),
        medianExcess: round(st.medianExcess, 6),
      });
    }
  }
  const eligible = log.filter((v) => v.minAgree === DEFAULT_RULE.minAgree && v.picksPerMonth >= target.min && v.picksPerMonth <= target.max);
  let chosen;
  if (eligible.length) {
    chosen = eligible.reduce((a, b) => (Math.abs(b.topPct - DEFAULT_RULE.topPct) < Math.abs(a.topPct - DEFAULT_RULE.topPct) ? b : a));
  } else {
    const mid = (target.min + target.max) / 2;
    chosen = log.filter((v) => v.minAgree === DEFAULT_RULE.minAgree).reduce((a, b) => (Math.abs(b.picksPerMonth - mid) < Math.abs(a.picksPerMonth - mid) ? b : a));
  }
  return {
    window: [model.dates[from], model.dates[to]],
    target,
    selection: `minAgree ${DEFAULT_RULE.minAgree}; the topPct closest to ${DEFAULT_RULE.topPct} whose research pick rate (new BUYs a month under the §2.3 caps) is ${target.min}-${target.max}`,
    variants: log,
    chosen: chosen.id,
    rule: { ...DEFAULT_RULE, topPct: chosen.topPct, minAgree: chosen.minAgree },
  };
}

// ---- thresholds x GBDT configurations ------------------------------------------------------------------------

/**
 * The T x N variant matrix on the CV grid of the research window.
 * @returns { rows: [{date, s}], cols: [{id, topPct, minAgree, experiment}], matrix: number[T][N], sharpes }
 */
export function variantMatrix(model, { grid = THRESHOLD_GRID } = {}) {
  const cv = model.cvOof;
  if (!cv) throw new Error('validate: the model carries no out-of-fold CV predictions (rebuild without the old cache)');
  const { N } = model;
  const researchEnd = lastOnOrBefore(model, model.periods.research[1]);
  const thresholds = [];
  for (const minAgree of grid.minAgree) for (const topPct of grid.topPct) thresholds.push({ topPct, minAgree });
  const nExp = cv.nExp;
  const cols = [];
  for (let e = 0; e < nExp; e++) {
    for (const th of thresholds) cols.push({ id: `V-${String(cols.length + 1).padStart(3, '0')}`, topPct: th.topPct, minAgree: th.minAgree, experiment: model.experiments[e]?.id ?? `exp${e}` });
  }
  const rows = [];
  const matrix = [];
  let r = 0;
  const n = cv.n;
  while (r < n) {
    const tSim = cv.t[r];
    let e2 = r;
    while (e2 < n && cv.t[e2] === tSim) e2++;
    const s = tSim - cv.simOffset;
    if (s >= 0 && s + 1 + 21 <= researchEnd) {
      // stocks of this CV date with A/B/C scores, their forward outcome and veto state
      const idx = [];
      for (let z = r; z < e2; z++) {
        const i = cv.stock[z];
        if (!model.eligible[s * N + i]) continue;
        idx.push(z);
      }
      const m = idx.length;
      const ex = new Float64Array(m).fill(NaN);
      const ok = new Uint8Array(m);
      const pa = new Float64Array(m);
      const pb = new Float64Array(m);
      const pc = new Float64Array(m);
      for (let z = 0; z < m; z++) {
        const i = cv.stock[idx[z]];
        const q = s * N + i;
        pa[z] = model.pct.A[q];
        pb[z] = model.pct.B[q];
        pc[z] = model.pct.C[q];
        const out = measure(model, i, s + 1, s + 22);
        if (out) ex[z] = out.excess;
        ok[z] = out && vetoBits(model, s, i) <= 1 ? 1 : 0;
      }
      const cs = model.crashSwitch[s] === 1;
      const row = new Array(cols.length);
      const pd = new Float64Array(m);
      const order = new Array(m);
      for (let e = 0; e < nExp; e++) {
        // D percentile of this configuration: rank of its out-of-fold prediction within the date
        const base = e * n;
        for (let z = 0; z < m; z++) order[z] = z;
        order.sort((x, y) => cv.preds[base + idx[x]] - cv.preds[base + idx[y]] || x - y);
        for (let k = 0; k < m; k++) pd[order[k]] = (k + 0.5) / m;
        thresholds.forEach((th, h) => {
          const need = Math.min(th.minAgree, cs ? 3 : 4);
          let sum = 0;
          let cnt = 0;
          for (let z = 0; z < m; z++) {
            if (!ok[z]) continue;
            const c = (cs ? 0 : pa[z] >= th.topPct) + (pb[z] >= th.topPct) + (pc[z] >= th.topPct) + (pd[z] >= th.topPct);
            if (c >= need) {
              sum += ex[z];
              cnt++;
            }
          }
          row[e * thresholds.length + h] = cnt ? sum / cnt : 0;
        });
      }
      rows.push({ date: model.dates[s], s });
      matrix.push(row);
    }
    r = e2;
  }
  // per-period Sharpe of each variant; CV dates are 20 trading days apart
  const sharpes = cols.map((_, j) => {
    const col = matrix.map((row) => row[j]);
    const sd = std(col);
    return sd > 0 ? mean(col) / sd : 0;
  });
  return { rows, cols, matrix, sharpes, periodDays: 20, thresholds, nExp };
}

// ---- ship gates on the holdout ------------------------------------------------------------------------------

function fmtP(x, d = 1, locale = 'en') {
  if (x === null || !Number.isFinite(x)) return 'n/a';
  const s = `${x > 0 ? '+' : x < 0 ? '-' : ''}${Math.abs(x * 100).toFixed(d)}`;
  return locale === 'sl' ? `${s.replace('.', ',')} %` : `${s}%`;
}
function fmtN(x, d = 2, locale = 'en') {
  if (x === null || !Number.isFinite(x)) return 'n/a';
  const s = x.toFixed(d);
  return locale === 'sl' ? s.replace('.', ',') : s;
}
function fmtH(x, locale = 'en') {
  const s = (x * 100).toFixed(1);
  return locale === 'sl' ? `${s.replace('.', ',')} %` : `${s}%`;
}

/**
 * Evaluate a period (holdout or research) of the chosen rule: the capped daily run, the comparison
 * sets measured like picks, the follow-every-pick portfolio, and the universe statistics.
 */
export function evaluatePeriod(model, rule, period, { composite } = {}) {
  const [from, to] = periodRange(model, period);
  const exitLimit = period === 'research' ? lastOnOrBefore(model, model.periods.research[1]) : model.T - 1;
  const run = runQuorum(model, { from, to, rule, exitLimit });
  const measured = run.records.filter((r) => r.outcome);
  const top = rule.topPct;
  const comp = composite || compositeABC(model);
  const sets = episodeSets(model, {
    from,
    to,
    exitLimit,
    topPct: top,
    extra: { comp, N: model.N },
    sets: {
      A: (q) => model.pct.A[q] >= top,
      B: (q) => model.pct.B[q] >= top,
      C: (q) => model.pct.C[q] >= top,
      D: (q) => model.pct.D[q] >= top,
      twoOfFour: (q, n2) => n2 === 2,
      compositeABC: (q, n2, x) => x.comp[q] >= top,
    },
  });
  const quorum = outcomeStats(measured.map((r) => r.outcome));
  const byAgreement = {
    '4/4': outcomeStats(measured.filter((r) => r.agreement === 4).map((r) => r.outcome)),
    '3/4': outcomeStats(measured.filter((r) => r.agreement === 3).map((r) => r.outcome)),
    '2/4 shadow': outcomeStats(sets.twoOfFour),
  };
  const setStats = Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, outcomeStats(v)]));
  // follow-every-pick portfolio (and the comparison sets) from the first issue to the last exit
  const end = Math.min(model.T - 1, Math.max(to, ...measured.map((r) => r.closeT ?? to)));
  const eq = followEquity(model, measured.map((r) => ({ i: r.i, t: r.t, tExit: r.closeT, cost: r.outcome.cost })), from, end);
  const eqSets = Object.fromEntries(['twoOfFour', 'A', 'B', 'C', 'D'].map((k) => [k, followEquity(model, sets[k], from, end)]));
  // monthly excess of the follow portfolio over the benchmark, for the months of the period
  const lastDate = model.dates[to];
  const mq = monthlyReturns(eq.dates, eq.idx).filter(([m]) => m <= lastDate.slice(0, 7));
  const mb = monthlyReturns(eq.dates, eq.bench).filter(([m]) => m <= lastDate.slice(0, 7));
  const monthlyExcess = mq.map(([m, r], k) => [m, r - mb[k][1]]);
  const ex = monthlyExcess.map((x) => x[1]);
  const signals = monthEndSignals(model, from - 1, to - 1);
  const uni = universeStats(model, signals);
  const icMean = Object.fromEntries(FAMS.map((f) => [f, mean(uni.ic.map((r) => r[f]).filter(Number.isFinite))]));
  // composite A-C monthly IC (for gate c)
  const compIC = [];
  for (const s of signals) {
    const xs = [];
    const ys = [];
    for (let i = 0; i < model.N; i++) {
      const q = s * model.N + i;
      if (!model.eligible[q] || !(comp[q] === comp[q])) continue;
      const r = model.holdReturn(i, s + 1, s + 22);
      if (!Number.isFinite(r)) continue;
      xs.push(comp[q]);
      ys.push(r);
    }
    compIC.push(spearman(xs, ys));
  }
  return {
    period,
    from: model.dates[from],
    to: model.dates[to],
    run,
    quorum,
    byAgreement,
    sets: setStats,
    setsRaw: sets,
    picksPerMonth: picksPerMonth(model, run).mean,
    renewsPerMonth: picksPerMonth(model, run, { kinds: ['RENEW'] }).mean,
    equity: eq,
    equitySets: eqSets,
    monthlyExcess,
    monthlySharpe: ex.length > 1 ? mean(ex) / std(ex) : null,
    annualisedSharpe: ex.length > 1 ? sharpe(ex, 12) : null,
    skew: skewness(ex),
    kurt: kurtosis(ex),
    maxDrawdown: maxDrawdown(Array.from(eq.idx)),
    universe: uni,
    icMean,
    compositeIC: mean(compIC.filter(Number.isFinite)),
  };
}

/**
 * The full validation: calibrate on research, variant matrix, DSR/PBO, then the holdout (opened once)
 * and the five gates. Returns everything export.js needs for backtest.json and the scoreboard.
 */
export function validate(model, { log = () => {} } = {}) {
  const t0 = Date.now();
  const calibration = calibrate(model);
  const rule = calibration.rule;
  log(`calibration: ${calibration.variants.length} threshold variants, chosen topPct ${rule.topPct} minAgree ${rule.minAgree} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  const t1 = Date.now();
  const vm = variantMatrix(model);
  const cvRatio = Math.sqrt(21 / vm.periodDays); // per-CV-period Sharpe -> monthly Sharpe
  const monthlySharpes = vm.sharpes.map((x) => x * cvRatio);
  const varSR = std(monthlySharpes) ** 2;
  const nTrials = vm.cols.length;
  const P = pbo(vm.matrix, 16);
  log(`variants: ${nTrials} (${vm.thresholds.length} thresholds x ${vm.nExp} GBDT configurations) over ${vm.rows.length} CV dates; PBO ${P.pbo.toFixed(3)} (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
  const t2 = Date.now();
  const composite = compositeABC(model);
  const research = evaluatePeriod(model, rule, 'research', { composite });
  // ---- the holdout is opened here, once, with the frozen rule ----
  const holdout = evaluatePeriod(model, rule, 'holdout', { composite });
  log(`research + holdout evaluated (${((Date.now() - t2) / 1000).toFixed(1)}s)`);
  const dsr = (ev) =>
    deflatedSharpe({ sr: ev.monthlySharpe, nTrials, varSR, T: ev.monthlyExcess.length, skew: Number.isFinite(ev.skew) ? ev.skew : 0, kurt: Number.isFinite(ev.kurt) ? ev.kurt : 3 });
  const dsrHoldout = dsr(holdout);
  const dsrResearch = dsr(research);
  const gates = shipGates({ holdout, dsr: dsrHoldout, pbo: P.pbo, nTrials, varSR });
  return {
    calibration,
    rule,
    variants: {
      n: nTrials,
      thresholds: vm.thresholds,
      nExperiments: vm.nExp,
      rows: vm.rows.length,
      rowsFrom: vm.rows[0]?.date,
      rowsTo: vm.rows[vm.rows.length - 1]?.date,
      cols: vm.cols,
      sharpesAnnual: monthlySharpes.map((x) => x * Math.sqrt(12)),
      varSRMonthly: varSR,
      expectedMaxSharpeMonthly: expectedMaxSharpe(nTrials, varSR),
    },
    pbo: P.pbo,
    dsr: dsrHoldout,
    dsrResearch,
    research,
    holdout,
    gates,
    composite,
  };
}

/** Brief §3.4.6 gates (a)-(e) on the holdout, net of costs. */
export function shipGates({ holdout, dsr, pbo: pboValue, nTrials }) {
  const q = holdout.quorum;
  const sets = holdout.sets;
  const gates = [];
  // (a) positive mean and median excess, hit rate >= 53%
  {
    const pass = q.meanExcess > 0 && q.medianExcess > 0 && q.hit >= 0.53;
    gates.push({
      id: 'a',
      pass,
      label: { en: 'Positive mean and median excess return, hit rate at least 53%', sl: 'Pozitiven povprečni in mediani presežni donos, delež zadetkov vsaj 53 %' },
      detail: {
        en: `Holdout, ${q.n} picks: hit rate ${fmtH(q.hit)}, median excess ${fmtP(q.medianExcess, 2)}, mean excess ${fmtP(q.meanExcess, 2)} vs the S&P 500 TR (simulated), net of costs.`,
        sl: `Preizkusno obdobje, ${q.n} izbir: delež zadetkov ${fmtH(q.hit, 'sl')}, mediana presežka ${fmtP(q.medianExcess, 2, 'sl')}, povprečje ${fmtP(q.meanExcess, 2, 'sl')} glede na S&P 500 TR (simulirano), po stroških.`,
      },
      values: { n: q.n, hit: round(q.hit, 4), hitCI: q.hitCI.map((x) => round(x, 4)), median: round(q.medianExcess, 6), mean: round(q.meanExcess, 6), threshold: 0.53 },
    });
  }
  // (b) quorum picks beat the 2/4 shadow set and every family's own top slice (mean net excess)
  {
    const fam = Object.fromEntries(FAMS.map((f) => [f, sets[f].meanExcess]));
    const best = FAMS.reduce((a, b) => (fam[b] > fam[a] ? b : a));
    const pass = q.meanExcess > sets.twoOfFour.meanExcess && FAMS.every((f) => q.meanExcess > fam[f]);
    gates.push({
      id: 'b',
      pass,
      label: { en: 'Quorum picks beat the 2/4 set and every single family', sl: 'Izbire kvoruma premagajo niz 2/4 in vsako posamezno družino' },
      detail: {
        en: `Mean excess per position, net: quorum ${fmtP(q.meanExcess, 2)}; 2/4 shadow set ${fmtP(sets.twoOfFour.meanExcess, 2)}; best single family (${best}) ${fmtP(fam[best], 2)}. All measured like picks: same vetoes, same 21-day open-to-open window, same costs.`,
        sl: `Povprečni presežek na pozicijo po stroških: kvorum ${fmtP(q.meanExcess, 2, 'sl')}; kontrolni niz 2/4 ${fmtP(sets.twoOfFour.meanExcess, 2, 'sl')}; najboljša posamezna družina (${best}) ${fmtP(fam[best], 2, 'sl')}. Vse merjeno kot izbire: enaki veti, enako 21-dnevno okno od odprtja do odprtja, enaki stroški.`,
      },
      values: {
        quorum: round(q.meanExcess, 6),
        twoOfFour: round(sets.twoOfFour.meanExcess, 6),
        A: round(fam.A, 6),
        B: round(fam.B, 6),
        C: round(fam.C, 6),
        D: round(fam.D, 6),
        bestFamily: round(fam[best], 6),
        bestFamilyId: best,
        hits: { quorum: round(q.hit, 4), twoOfFour: round(sets.twoOfFour.hit, 4), A: round(sets.A.hit, 4), B: round(sets.B.hit, 4), C: round(sets.C.hit, 4), D: round(sets.D.hit, 4) },
        n: { quorum: q.n, twoOfFour: sets.twoOfFour.n, A: sets.A.n, B: sets.B.n, C: sets.C.n, D: sets.D.n },
      },
    });
  }
  // (c) D beats an equal-weight composite of A-C (top-slice mean net excess and mean monthly rank IC)
  {
    const d = sets.D.meanExcess;
    const c = sets.compositeABC.meanExcess;
    const pass = d > c && holdout.icMean.D > holdout.compositeIC;
    gates.push({
      id: 'c',
      pass,
      label: { en: 'D beats an equal-weight composite of A-C', sl: 'D premaga enakovredno sestavljeno oceno A-C' },
      detail: {
        en: `Top-slice mean excess, net: D ${fmtP(d, 2)} vs composite ${fmtP(c, 2)}. Mean monthly rank IC: D ${fmtN(holdout.icMean.D, 3)} vs composite ${fmtN(holdout.compositeIC, 3)}.`,
        sl: `Povprečni presežek zgornjega dela po stroških: D ${fmtP(d, 2, 'sl')} proti sestavljeni oceni ${fmtP(c, 2, 'sl')}. Povprečni mesečni rangovni IC: D ${fmtN(holdout.icMean.D, 3, 'sl')} proti ${fmtN(holdout.compositeIC, 3, 'sl')}.`,
      },
      values: { dExcess: round(d, 6), compositeExcess: round(c, 6), dIC: round(holdout.icMean.D, 4), compositeIC: round(holdout.compositeIC, 4), n: { D: sets.D.n, composite: sets.compositeABC.n } },
    });
  }
  // (d) DSR >= 0.95 and PBO < 0.3
  {
    const pass = dsr >= 0.95 && pboValue < 0.3;
    gates.push({
      id: 'd',
      pass,
      label: { en: 'Deflated Sharpe probability at least 0.95 and PBO below 0.3', sl: 'Verjetnost deflacioniranega Sharpovega razmerja vsaj 0,95 in PBO pod 0,3' },
      detail: {
        en: `DSR ${fmtN(dsr, 3)} for the holdout's monthly excess returns (Sharpe ${fmtN(holdout.annualisedSharpe, 2)} annualised, ${holdout.monthlyExcess.length} months), deflated for ${nTrials} variants. PBO ${fmtN(pboValue, 3)} (CSCV, 16 blocks) over the research-window variant matrix.`,
        sl: `DSR ${fmtN(dsr, 3, 'sl')} za mesečne presežne donose preizkusnega obdobja (Sharpe ${fmtN(holdout.annualisedSharpe, 2, 'sl')} letno, ${holdout.monthlyExcess.length} mesecev), deflacionirano za ${nTrials} različic. PBO ${fmtN(pboValue, 3, 'sl')} (CSCV, 16 blokov) na matriki različic raziskovalnega obdobja.`,
      },
      values: { dsr: round(dsr, 4), pbo: round(pboValue, 4), nTrials, sharpeAnnual: round(holdout.annualisedSharpe, 4), months: holdout.monthlyExcess.length, dsrThreshold: 0.95, pboThreshold: 0.3 },
    });
  }
  // (e) pick frequency 3-8 a month
  {
    const ppm = holdout.picksPerMonth;
    const pass = ppm >= 3 && ppm <= 8;
    gates.push({
      id: 'e',
      pass,
      label: { en: 'Pick frequency of 3-8 a month', sl: 'Pogostost izbir 3-8 na mesec' },
      detail: {
        en: `${fmtN(ppm, 1)} new picks a month on the holdout (plus ${fmtN(holdout.renewsPerMonth, 1)} renewals a month).`,
        sl: `${fmtN(ppm, 1, 'sl')} novih izbir na mesec v preizkusnem obdobju (in ${fmtN(holdout.renewsPerMonth, 1, 'sl')} podaljšanj na mesec).`,
      },
      values: { picksPerMonth: round(ppm, 3), renewsPerMonth: round(holdout.renewsPerMonth, 3), min: 3, max: 8 },
    });
  }
  return gates;
}
