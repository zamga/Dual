// Launch status (backtest.json "launch", docs/ARCHITECTURE.md §3) and amendment A-1.
//
// Launch gate E of the brief needs the five holdout ship gates. Gate (d) as written (DSR >= 0.95 and
// PBO < 0.3 on the 36-month holdout) is still computed and published unchanged. Amendment A-1, dated
// at the engine freeze (after the holdout had been opened) and disclosed, adds a monthly re-test of
// gate (d) on the pooled out-of-sample record: the holdout plus the sealed forward record, as monthly
// excess returns of the follow-every-pick paper portfolio net of costs, with the same clustered
// deflation and the same PBO bound. SMS alerts launch only when it passes. Nothing here is typed in:
// every status, number and sentence is computed from the validation and the sealed record.
import { mean, std, skewness, kurtosis, deflatedSharpe } from '../core/stats.js';
import { nextTradingDay, fmtLong } from '../core/calendar.js';
import { followEquity, monthlyReturns, round } from './backtest.js';
import { DSR_MIN, PBO_MAX } from './validate.js';

export const AMENDMENT_ID = 'A-1';
// A-1 is dated at the engine freeze (2025-09-30 in the full run): model.periods.freeze.

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// genitive, as in "ob koncu novembra 2027"
const MONTHS_SL_GEN = ['januarja', 'februarja', 'marca', 'aprila', 'maja', 'junija', 'julija', 'avgusta', 'septembra', 'oktobra', 'novembra', 'decembra'];

const num = (x, d, locale) => {
  const s = x.toFixed(d);
  return locale === 'sl' ? s.replace('.', ',') : s;
};

export function addMonths(ym, n) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7)) - 1 + n;
  return `${y + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;
}

function monthName(ym, locale) {
  const m = Number(ym.slice(5, 7)) - 1;
  return locale === 'sl' ? `${MONTHS_SL_GEN[m]} ${ym.slice(0, 4)}` : `${MONTHS_EN[m]} ${ym.slice(0, 4)}`;
}

/** Positions of the sealed record's follow-every-pick paper portfolio (open picks run to today). */
export function sealedPositions(rec) {
  return rec.picks.map((p) => ({ i: p._i, t: p._t, tExit: p._closeT ?? p._t + 21, cost: p.costOneWay }));
}

/** Daily follow-every-pick equity of the sealed record, from its first issue to the last data day. */
export function sealedEquity(model, rec) {
  return followEquity(model, sealedPositions(rec), rec.from, model.T - 1);
}

/** Calendar-month excess returns of the sealed follow portfolio over the benchmark: [[YYYY-MM, x]]. */
export function sealedMonthlyExcess(model, rec) {
  const eq = sealedEquity(model, rec);
  const mq = monthlyReturns(eq.dates, eq.idx);
  const mb = monthlyReturns(eq.dates, eq.bench);
  return mq.map(([m, r], k) => [m, r - mb[k][1]]);
}

/** Monthly Sharpe, skew and kurtosis of a list of monthly excess returns. */
export function seriesStats(ex) {
  const sd = std(ex);
  const sk = skewness(ex);
  const ku = kurtosis(ex);
  return {
    months: ex.length,
    sr: sd > 0 ? mean(ex) / sd : NaN,
    skew: Number.isFinite(sk) ? sk : 0,
    kurt: Number.isFinite(ku) ? ku : 3,
  };
}

/** DSR of series statistics {sr, months, skew, kurt} under a deflation setting {nTrials, varSR}. */
export function dsrFor(st, trials, months = st.months) {
  if (!Number.isFinite(st.sr) || months < 3) return null;
  return deflatedSharpe({ sr: st.sr, nTrials: trials.nTrials, varSR: trials.varSR, T: months, skew: st.skew, kurt: st.kurt });
}

/**
 * Months that must be added to a record of `st.months` months, at the same monthly Sharpe, skew and
 * kurtosis, before its DSR reaches `target`. 0 when it already does; null when it never can (the
 * Sharpe is not above SR0, the best Sharpe the trials would show by luck) or not within `max` months.
 */
export function monthsToPass(st, trials, { target = DSR_MIN, max = 1200 } = {}) {
  const now = dsrFor(st, trials);
  if (now === null) return null;
  if (now >= target) return 0;
  if (!(st.sr > (trials.sr0 ?? 0))) return null;
  for (let m = 1; m <= max; m++) if (dsrFor(st, trials, st.months + m) >= target) return m;
  return null;
}

function amendmentText(date, holdoutMonths, holdoutSharpe, psrHoldout) {
  const [y, m, d] = date.split('-').map(Number);
  return {
    en:
      `Amendment A-1 (${fmtLong(date, 'en')}, at the engine freeze, after the holdout had been opened; disclosed). Gate (d) as the brief wrote it is measured on the ${holdoutMonths}-month holdout alone, which at the expected edge cannot reach a deflated Sharpe probability of 0.95: the holdout's own Sharpe of ${num(holdoutSharpe, 2, 'en')} gives a probabilistic Sharpe of ${num(psrHoldout, 2, 'en')} before any deflation. ` +
      'Gate (d) on the holdout stays published unchanged, and gate (d) is also re-tested at every month-end on the pooled out-of-sample record (the holdout plus the sealed forward record: monthly excess returns of the follow-every-pick paper portfolio, net of costs), with the same deflation for the effective number of variants tried and the same PBO bound of 0.3. ' +
      'SMS alerts launch only when that pooled test passes. Gates (a), (b), (c) and (e) are unchanged and are measured on the holdout.',
    sl:
      `Dopolnilo A-1 (${d}. ${m}. ${y}, ob zamrznitvi pogona, potem ko je bilo preizkusno obdobje že odprto; javno razkrito). Pogoj (d) v izvirni obliki se meri le na ${holdoutMonths}-mesečnem preizkusnem obdobju, ki pri pričakovani prednosti ne more doseči verjetnosti deflacioniranega Sharpovega razmerja 0,95: Sharpovo razmerje preizkusnega obdobja ${num(holdoutSharpe, 2, 'sl')} že pred deflacijo da verjetnost ${num(psrHoldout, 2, 'sl')}. ` +
      'Pogoj (d) za preizkusno obdobje ostaja objavljen nespremenjen, poleg tega pa se ob koncu vsakega meseca znova preveri na združenem zapisu zunaj vzorca (preizkusno obdobje skupaj z zapečatenim zapisom: mesečni presežni donosi papirnatega portfelja, ki sledi vsem izbiram, po stroških), z enako deflacijo za dejansko število preizkušenih različic in z enako mejo PBO 0,3. ' +
      'Obvestila SMS se zaženejo šele, ko je ta združeni preizkus izpolnjen. Pogoji (a), (b), (c) in (e) so nespremenjeni in se merijo na preizkusnem obdobju.',
  };
}

function remainingText({ status, failedHoldout, pooled, pbo, need, lastMonth, K }) {
  const ids = (xs, locale) => {
    const parts = xs.map((g) => `(${g})`);
    if (parts.length === 1) return parts[0];
    return `${parts.slice(0, -1).join(', ')} ${locale === 'sl' ? 'in' : 'and'} ${parts[parts.length - 1]}`;
  };
  if (status === 'ready') {
    return {
      en: 'Nothing on the engine side: gates (a), (b), (c) and (e) passed on the holdout and gate (d) passes on the pooled record, so SMS alerts can launch once the legal, research-tier and data gates are met.',
      sl: 'S strani pogona nič: pogoji (a), (b), (c) in (e) so bili izpolnjeni v preizkusnem obdobju, pogoj (d) je izpolnjen na združenem zapisu, zato se obvestila SMS lahko zaženejo, ko bodo izpolnjeni še pravni, raziskovalni in podatkovni pogoji.',
    };
  }
  if (failedHoldout.length) {
    const many = failedHoldout.length > 1;
    return {
      en: `Holdout gate${many ? 's' : ''} ${ids(failedHoldout, 'en')} failed, which no number of further months can change, so under the brief the engine goes back to research and SMS alerts do not launch.`,
      sl: `${many ? 'Pogoji' : 'Pogoj'} ${ids(failedHoldout, 'sl')} v preizkusnem obdobju ${many ? 'niso bili izpolnjeni' : 'ni bil izpolnjen'}, kar nobeno število dodatnih mesecev ne more spremeniti, zato se po izhodiščih pogon vrne v raziskave in obvestila SMS se ne zaženejo.`,
    };
  }
  if (!(pbo < PBO_MAX)) {
    return {
      en: `The PBO of ${num(pbo, 3, 'en')} is not below 0.3 and more months of the record cannot change it, so under the brief the engine goes back to research and SMS alerts do not launch.`,
      sl: `PBO ${num(pbo, 3, 'sl')} ni pod 0,3 in dodatni meseci zapisa tega ne morejo spremeniti, zato se po izhodiščih pogon vrne v raziskave in obvestila SMS se ne zaženejo.`,
    };
  }
  if (need === null) {
    return {
      en: `At the pooled record's current Sharpe of ${num(pooled.sharpe, 2, 'en')} gate (d) would never reach a deflated Sharpe probability of 0.95, because that Sharpe is not above what the best of ${K} effective trials would show by luck, so SMS alerts stay off unless the sealed record improves.`,
      sl: `Pri sedanjem Sharpovem razmerju združenega zapisa ${num(pooled.sharpe, 2, 'sl')} pogoj (d) ne bi nikoli dosegel verjetnosti deflacioniranega Sharpovega razmerja 0,95, ker to razmerje ni višje od tistega, ki bi ga najboljši od ${K} dejansko neodvisnih poskusov pokazal po naključju, zato obvestila SMS ostanejo izklopljena, dokler se zapečateni zapis ne izboljša.`,
    };
  }
  const at = addMonths(lastMonth, need);
  const years = Math.round(need / 12);
  const yearsEn = need >= 24 ? `about ${years} years; ` : '';
  const yearsSl = need >= 24 ? `približno ${years} ${slPlural(years, ['leto', 'leti', 'leta', 'let'])}; ` : '';
  return {
    en: `Gate (d) needs a deflated Sharpe probability of 0.95 on the pooled record and stands at ${num(pooled.dsr, 2, 'en')}: if the sealed record keeps the pooled Sharpe of ${num(pooled.sharpe, 2, 'en')}, that takes ${need} more month${need === 1 ? '' : 's'} (${yearsEn}the re-test at the end of ${monthName(at, 'en')}), and SMS alerts stay off until then.`,
    sl: `Pogoj (d) zahteva verjetnost deflacioniranega Sharpovega razmerja 0,95 na združenem zapisu in je zdaj ${num(pooled.dsr, 2, 'sl')}: če zapečateni zapis ohrani Sharpovo razmerje združenega zapisa ${num(pooled.sharpe, 2, 'sl')}, je za to potrebnih še ${need} ${slPlural(need, ['mesec', 'meseca', 'meseci', 'mesecev'])} (${yearsSl}ponovni preizkus ob koncu ${monthName(at, 'sl')}), do takrat pa obvestila SMS ostanejo izklopljena.`,
  };
}

/** Slovene plural form by the last two digits: [1, 2, 3-4, other]. */
function slPlural(n, [one, two, few, many]) {
  const h = n % 100;
  if (h === 1) return one;
  if (h === 2) return two;
  if (h === 3 || h === 4) return few;
  return many;
}

/**
 * 'ready' only when gates (a), (b), (c) and (e) passed on the holdout and gate (d) passes on the pooled
 * record (amendment A-1); otherwise 'pre-launch'. Gate (d) on the holdout alone does not decide it.
 */
export function launchStatus(holdoutGates, pooledPass) {
  const need = ['a', 'b', 'c', 'e'];
  const byId = new Map(holdoutGates.map((g) => [g.id, g.pass]));
  return need.every((id) => byId.get(id) === true) && pooledPass === true ? 'ready' : 'pre-launch';
}

/**
 * The launch block of backtest.json.
 * @param validation engine/validate.js result (gates, holdout.monthlyExcess, deflation, pbo)
 * @param rec engine/record.js result (the sealed record)
 */
export function buildLaunch(model, validation, rec) {
  const H = validation.holdout;
  const defl = validation.deflation;
  const holdoutMonthly = H.monthlyExcess;
  const sealedMonthly = sealedMonthlyExcess(model, rec);
  const lastHoldout = holdoutMonthly[holdoutMonthly.length - 1][0];
  if (sealedMonthly.length && sealedMonthly[0][0] <= lastHoldout) throw new Error('launch: the sealed record overlaps the holdout months');
  const pooledMonthly = [...holdoutMonthly, ...sealedMonthly];
  const ex = pooledMonthly.map((x) => x[1]);
  const st = seriesStats(ex);
  const dsr = dsrFor(st, defl.clustered);
  const dsrRaw = dsrFor(st, defl.raw);
  const pass = dsr !== null && dsr >= DSR_MIN && validation.pbo < PBO_MAX;
  const asOf = model.dates[model.T - 1];
  const lastMonth = pooledMonthly[pooledMonthly.length - 1][0];
  // the monthly re-test: the pooled record at each month-end since the freeze
  const history = [];
  for (let n = holdoutMonthly.length + 1; n <= pooledMonthly.length; n++) {
    const s = seriesStats(ex.slice(0, n));
    const d = dsrFor(s, defl.clustered);
    history.push({
      month: pooledMonthly[n - 1][0],
      months: n,
      sharpe: round(s.sr * Math.sqrt(12), 4),
      dsr: round(d, 4),
      dsrRaw: round(dsrFor(s, defl.raw), 4),
      pass: d !== null && d >= DSR_MIN && validation.pbo < PBO_MAX,
      ...(n === pooledMonthly.length && !monthComplete(model) ? { monthToDate: true } : {}),
    });
  }
  const holdoutGates = validation.gates.map((g) => ({ id: g.id, pass: g.pass }));
  const failedHoldout = holdoutGates.filter((g) => g.id !== 'd' && !g.pass).map((g) => g.id);
  const status = launchStatus(holdoutGates, pass);
  const need = pass ? 0 : monthsToPass(st, defl.clustered);
  const holdSt = seriesStats(holdoutMonthly.map((x) => x[1]));
  const psrHoldout = dsrFor(holdSt, { nTrials: 1, varSR: 0 });
  const pooled = {
    from: H.from,
    to: asOf,
    months: pooledMonthly.length,
    holdoutMonths: holdoutMonthly.length,
    sealedMonths: sealedMonthly.length,
    monthToDate: !monthComplete(model) ? lastMonth : null,
    sharpe: round(st.sr * Math.sqrt(12), 4),
    srMonthly: round(st.sr, 4),
    skew: round(st.skew, 3),
    kurtosis: round(st.kurt, 3),
    dsr: round(dsr, 4),
    dsrRaw: round(dsrRaw, 4),
    nTrialsRaw: defl.raw.nTrials,
    nTrialsEff: defl.clustered.K,
    sr0Monthly: round(defl.clustered.sr0, 4),
    sr0MonthlyRaw: round(defl.raw.sr0, 4),
    pbo: round(validation.pbo, 4),
    dsrThreshold: DSR_MIN,
    pboThreshold: PBO_MAX,
    pass,
    monthsToPass: need,
    passAt: need === null ? null : need === 0 ? lastMonth : addMonths(lastMonth, need),
    basis: `monthly excess returns over the S&P 500 TR (simulated) of the follow-every-pick paper portfolio, net of costs: the holdout backtest for ${holdoutMonthly[0][0]}..${lastHoldout}, the sealed record from ${sealedMonthly[0]?.[0] ?? 'n/a'}${monthComplete(model) ? '' : '; the last month runs to asOf'}`,
    monthly: pooledMonthly.map(([m, x]) => [m, round(x, 6)]),
    history,
  };
  return {
    status,
    asOf,
    holdoutGates,
    amendment: { id: AMENDMENT_ID, date: model.periods.freeze, text: amendmentText(model.periods.freeze, holdoutMonthly.length, H.annualisedSharpe, psrHoldout), psrHoldout: round(psrHoldout, 4) },
    pooled,
    remaining: remainingText({ status, failedHoldout, pooled, pbo: validation.pbo, need, lastMonth, K: defl.clustered.K }),
  };
}

/** True when the last data day is the last trading day of its month. */
function monthComplete(model) {
  const last = model.dates[model.T - 1];
  return nextTradingDay(last).slice(0, 7) !== last.slice(0, 7);
}
