// Launch status (backtest.json "launch", docs/ARCHITECTURE.md §3) and amendment A-1.
//
// Launch gate E of the brief needs the five holdout ship gates. Gate (d) as first written (DSR >= 0.95
// and PBO < 0.3 on the 36-month holdout) is still computed and published unchanged as
// `launch.original`. Amendment A-1, dated at the engine freeze (after the holdout had been opened) and
// disclosed, splits gate (d) in two:
//   (d1) clustered DSR >= 0.95 on the RESEARCH window, where the variants were tried, and PBO < 0.3
//        across the variants;
//   (d2) probabilistic Sharpe ratio PSR(SR > 0) >= 0.95 on the pooled out-of-sample record (the
//        holdout plus the sealed forward record, monthly excess returns of the follow-every-pick
//        paper portfolio net of costs), re-tested at every month-end.
// SMS alerts launch only when (a), (b), (c) and (e) passed on the holdout and d1 and d2 both pass. The
// deflated pooled figures stay published in `launch.pooled`. Nothing here is typed in: every status,
// number and sentence is computed from the validation and the sealed record.
import { mean, std, skewness, kurtosis, deflatedSharpe, normCdf } from '../core/stats.js';
import { nextTradingDay, fmtLong } from '../core/calendar.js';
import { followEquity, monthlyReturns, round } from './backtest.js';
import { DSR_MIN, PBO_MAX } from './validate.js';

export const AMENDMENT_ID = 'A-1';
// A-1 is dated at the engine freeze (2025-09-30 in the full run): model.periods.freeze.
export const PSR_MIN = 0.95;

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

/**
 * Probabilistic Sharpe ratio PSR(SR > sr0) of series statistics {sr, months, skew, kurt}: the same
 * skew- and kurtosis-adjusted formula as core/stats deflatedSharpe, with the benchmark Sharpe sr0
 * (0 for A-1 gate d2) in place of the expected best of the trials. Null below 3 months.
 */
export function psrFor(st, months = st.months, sr0 = 0) {
  if (!Number.isFinite(st.sr) || months < 3) return null;
  const denom = Math.sqrt(Math.max(1e-12, 1 - st.skew * st.sr + ((st.kurt - 1) / 4) * st.sr * st.sr));
  return normCdf(((st.sr - sr0) * Math.sqrt(months - 1)) / denom);
}

/**
 * Months that must be added to a record of `st.months` months, at the same monthly Sharpe, skew and
 * kurtosis, before its PSR(SR > 0) reaches `target`. 0 when it already does; null when it never can
 * (the Sharpe is not above 0) or not within `max` months.
 */
export function psrMonthsToPass(st, { target = PSR_MIN, max = 1200 } = {}) {
  const now = psrFor(st);
  if (now === null) return null;
  if (now >= target) return 0;
  if (!(st.sr > 0)) return null;
  for (let m = 1; m <= max; m++) if (psrFor(st, st.months + m) >= target) return m;
  return null;
}

/**
 * Amendment A-1 in plain words. Every number is the holdout's or the research window's, fixed at the
 * freeze: the original wording's DSR on the holdout, the holdout's Sharpe and PSR, the effective trials.
 */
export function amendmentText({ date, holdoutMonths, holdoutSharpe, psrHoldout, original, K }) {
  const [y, m, d] = date.split('-').map(Number);
  const fails = !original.pass;
  const dsrPart = original.dsr >= DSR_MIN;
  const why = {
    en: fails
      ? dsrPart
        ? `the deflated Sharpe probability is ${num(original.dsr, 2, 'en')}, but the PBO of ${num(original.pbo, 2, 'en')} is not below 0.3, so the original wording fails`
        : `it gives ${num(original.dsr, 2, 'en')}, below 0.95, so the original wording fails`
      : `it gives ${num(original.dsr, 2, 'en')}, so the original wording passes as well`,
    sl: fails
      ? dsrPart
        ? `verjetnost deflacioniranega Sharpovega razmerja je ${num(original.dsr, 2, 'sl')}, PBO ${num(original.pbo, 2, 'sl')} pa ni pod 0,3, zato prvotno besedilo pogoja ni izpolnjeno`
        : `znaša ${num(original.dsr, 2, 'sl')}, kar je pod 0,95, zato prvotno besedilo pogoja ni izpolnjeno`
      : `znaša ${num(original.dsr, 2, 'sl')}, zato je izpolnjeno tudi prvotno besedilo pogoja`,
  };
  const short = psrHoldout < PSR_MIN;
  const edge = {
    en: short
      ? ` And ${holdoutMonths} months are too short for 95% confidence at the edge our launch protocol expects: the holdout's Sharpe ratio of ${num(holdoutSharpe, 2, 'en')} gives a probabilistic Sharpe of only ${num(psrHoldout, 2, 'en')}, before any deflation.`
      : ` On its own the holdout's Sharpe ratio of ${num(holdoutSharpe, 2, 'en')} gives a probabilistic Sharpe of ${num(psrHoldout, 2, 'en')}, before any deflation.`,
    sl: short
      ? ` Poleg tega je ${holdoutMonths} mesecev prekratko obdobje za 95-odstotno zaupanje pri prednosti, ki jo pričakuje naš zagonski protokol: Sharpovo razmerje preizkusnega obdobja ${num(holdoutSharpe, 2, 'sl')} da pred kakršno koli deflacijo le verjetnostni Sharpe ${num(psrHoldout, 2, 'sl')}.`
      : ` Samo Sharpovo razmerje preizkusnega obdobja ${num(holdoutSharpe, 2, 'sl')} da pred kakršno koli deflacijo verjetnostni Sharpe ${num(psrHoldout, 2, 'sl')}.`,
  };
  const variantsEn = K === 1 ? '1 effective independent variant' : `${K} effective independent variants`;
  const variantsSl = K === 1 ? '1 dejansko neodvisni različici' : `${K} dejansko neodvisnih različicah`;
  return {
    en:
      `Amendment A-1 was adopted on ${fmtLong(date, 'en')}, at the engine freeze, after the holdout had already been opened, and is disclosed in full. ` +
      `Gate (d) as first written needed a deflated Sharpe probability of at least 0.95 on the ${holdoutMonths}-month holdout, with a PBO below 0.3: ${why.en}. That result stays published beside the amended test. ` +
      'The deflation corrects for trying many variants and keeping the best one. That selection happened in the research window, where the variants were run, not on the holdout, where one configuration fixed in advance was tested, so there is nothing to deflate there.' +
      `${edge.en} ` +
      `A-1 splits gate (d) in two. (d1): on the research window, the deflated Sharpe probability over the ${variantsEn} tried must be at least 0.95, and the probability of backtest overfitting (PBO) across the variants below 0.3. ` +
      '(d2): on the pooled out-of-sample record (the holdout plus the sealed forward record, as monthly excess returns of a paper portfolio that follows every pick, net of costs), the probability that the true Sharpe ratio is above zero (the probabilistic Sharpe ratio) must be at least 0.95. It is re-tested at every month-end. ' +
      'SMS alerts launch only when gates (a), (b), (c) and (e) have passed on the holdout and both (d1) and (d2) pass.',
    sl:
      `Dopolnilo A-1 je bilo sprejeto ${d}. ${m}. ${y} ob zamrznitvi pogona, potem ko je bilo preizkusno obdobje že odprto, in je v celoti javno razkrito. ` +
      `Pogoj (d) je v prvotnem besedilu zahteval verjetnost deflacioniranega Sharpovega razmerja vsaj 0,95 na ${holdoutMonths}-mesečnem preizkusnem obdobju in PBO pod 0,3: ${why.sl}. Ta rezultat ostaja objavljen ob spremenjenem preizkusu. ` +
      'Deflacija popravi učinek preizkušanja več različic in izbire najboljše. Ta izbira se je zgodila v raziskovalnem obdobju, kjer so bile različice preizkušene, ne v preizkusnem obdobju, kjer je bila preizkušena ena vnaprej določena konfiguracija, zato tam ni česa deflacionirati.' +
      `${edge.sl} ` +
      `A-1 pogoj (d) razdeli na dva dela. (d1): v raziskovalnem obdobju mora biti verjetnost deflacioniranega Sharpovega razmerja ob ${variantsSl} vsaj 0,95, verjetnost prekomernega prilagajanja (PBO) med različicami pa pod 0,3. ` +
      '(d2): na združenem zapisu zunaj vzorca (preizkusno obdobje in zapečateni zapis, kot mesečni presežni donosi papirnatega portfelja, ki sledi vsem izbiram, po stroških) mora biti verjetnost, da je pravo Sharpovo razmerje nad nič (verjetnostno Sharpovo razmerje), vsaj 0,95. Preverja se ob koncu vsakega meseca. ' +
      'Obvestila SMS se zaženejo šele, ko so pogoji (a), (b), (c) in (e) izpolnjeni na preizkusnem obdobju in sta izpolnjena oba pogoja (d1) in (d2).',
  };
}

function remainingText({ status, failedHoldout, d1, d2, lastMonth }) {
  const ids = (xs, locale) => {
    const parts = xs.map((g) => `(${g})`);
    if (parts.length === 1) return parts[0];
    return `${parts.slice(0, -1).join(', ')} ${locale === 'sl' ? 'in' : 'and'} ${parts[parts.length - 1]}`;
  };
  const monthsEn = (n) => `${n} month${n === 1 ? '' : 's'}`;
  // locative, as in "v 48 mesecih" / "po 1 mesecu"
  const monthsSlLoc = (n) => `${n} ${n % 100 === 1 ? 'mesecu' : 'mesecih'}`;
  if (status === 'ready') {
    return {
      en: `Nothing on the engine side: gates (a), (b), (c) and (e) passed on the holdout, (d1) passes on the research window (deflated Sharpe probability ${num(d1.dsrResearch, 3, 'en')}, PBO ${num(d1.pbo, 3, 'en')}) and (d2) passes on the pooled record (probabilistic Sharpe ${num(d2.psr, 3, 'en')} over ${monthsEn(d2.months)}), so SMS alerts can launch once the legal, research-tier and data gates are met.`,
      sl: `S strani pogona nič: pogoji (a), (b), (c) in (e) so bili izpolnjeni v preizkusnem obdobju, (d1) je izpolnjen v raziskovalnem obdobju (verjetnost deflacioniranega Sharpovega razmerja ${num(d1.dsrResearch, 3, 'sl')}, PBO ${num(d1.pbo, 3, 'sl')}) in (d2) na združenem zapisu (verjetnostni Sharpe ${num(d2.psr, 3, 'sl')} v ${monthsSlLoc(d2.months)}), zato se obvestila SMS lahko zaženejo, ko bodo izpolnjeni še pravni, raziskovalni in podatkovni pogoji.`,
    };
  }
  // failures that no number of further months can change: holdout gates, and d1 on the research window
  if (failedHoldout.length || !d1.pass) {
    const partsEn = [];
    const partsSl = [];
    if (failedHoldout.length) {
      const many = failedHoldout.length > 1;
      partsEn.push(`holdout gate${many ? 's' : ''} ${ids(failedHoldout, 'en')} failed`);
      partsSl.push(`${many ? 'pogoji' : 'pogoj'} ${ids(failedHoldout, 'sl')} v preizkusnem obdobju ${many ? 'niso bili izpolnjeni' : 'ni bil izpolnjen'}`);
    }
    if (!d1.pass) {
      const dsrLow = !(d1.dsrResearch >= DSR_MIN);
      const pboHigh = !(d1.pbo < PBO_MAX);
      const en = [dsrLow ? `the research window's deflated Sharpe probability is ${num(d1.dsrResearch, 2, 'en')}, below 0.95` : null, pboHigh ? `the PBO of ${num(d1.pbo, 2, 'en')} is not below 0.3` : null].filter(Boolean).join(' and ');
      const sl = [dsrLow ? `verjetnost deflacioniranega Sharpovega razmerja v raziskovalnem obdobju je ${num(d1.dsrResearch, 2, 'sl')}, kar je pod 0,95` : null, pboHigh ? `PBO ${num(d1.pbo, 2, 'sl')} ni pod 0,3` : null].filter(Boolean).join(' in ');
      partsEn.push(`gate (d1) fails (${en})`);
      partsSl.push(`pogoj (d1) ni izpolnjen (${sl})`);
    }
    const d2En = d2.pass ? `; (d2) passes on the pooled record (probabilistic Sharpe ${num(d2.psr, 3, 'en')}), but that cannot make up for ${partsEn.length > 1 ? 'them' : 'it'}` : '';
    const d2Sl = d2.pass ? `; (d2) je na združenem zapisu izpolnjen (verjetnostni Sharpe ${num(d2.psr, 3, 'sl')}), vendar tega ne more nadomestiti` : '';
    const first = partsEn.join(' and ');
    const firstSl = partsSl.join(' in ');
    return {
      en: `${first[0].toUpperCase()}${first.slice(1)}, which no number of further months can change${d2En}, so under our pre-registered launch protocol the engine goes back to research and SMS alerts do not launch.`,
      sl: `${firstSl[0].toUpperCase()}${firstSl.slice(1)}, česar nobeno število dodatnih mesecev ne more spremeniti${d2Sl}, zato se po našem vnaprej določenem zagonskem protokolu pogon vrne v raziskave in obvestila SMS se ne zaženejo.`,
    };
  }
  const need = d2.monthsToPass;
  if (need === null) {
    return {
      en: `Gate (d2) needs a probabilistic Sharpe of 0.95 on the pooled record and stands at ${num(d2.psr, 3, 'en')} after ${monthsEn(d2.months)}. At the pooled record's current Sharpe of ${num(d2.sharpe, 2, 'en')} it would never get there, because that Sharpe is not above zero, so SMS alerts stay off unless the sealed record improves.`,
      sl: `Pogoj (d2) zahteva verjetnostni Sharpe 0,95 na združenem zapisu in je po ${monthsSlLoc(d2.months)} ${num(d2.psr, 3, 'sl')}. Pri sedanjem Sharpovem razmerju združenega zapisa ${num(d2.sharpe, 2, 'sl')} ga ne bi nikoli dosegel, ker to razmerje ni nad nič, zato obvestila SMS ostanejo izklopljena, dokler se zapečateni zapis ne izboljša.`,
    };
  }
  const at = addMonths(lastMonth, need);
  const years = Math.round(need / 12);
  const yearsEn = need >= 24 ? `about ${years} years; ` : '';
  const yearsSl = need >= 24 ? `približno ${years} ${slPlural(years, ['leto', 'leti', 'leta', 'let'])}; ` : '';
  const afterSl = monthsSlLoc(d2.months);
  return {
    en: `Gate (d2) needs a probabilistic Sharpe of 0.95 on the pooled record and stands at ${num(d2.psr, 3, 'en')} after ${monthsEn(d2.months)}: if the sealed record keeps the pooled Sharpe of ${num(d2.sharpe, 2, 'en')}, that takes ${need} more month${need === 1 ? '' : 's'} (${yearsEn}the re-test at the end of ${monthName(at, 'en')}), and SMS alerts stay off until then.`,
    sl: `Pogoj (d2) zahteva verjetnostni Sharpe 0,95 na združenem zapisu in je po ${afterSl} ${num(d2.psr, 3, 'sl')}: če zapečateni zapis ohrani Sharpovo razmerje združenega zapisa ${num(d2.sharpe, 2, 'sl')}, je za to potrebnih še ${need} ${slPlural(need, ['mesec', 'meseca', 'meseci', 'mesecev'])} (${yearsSl}ponovni preizkus ob koncu ${monthName(at, 'sl')}), do takrat pa obvestila SMS ostanejo izklopljena.`,
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
 * 'ready' only when gates (a), (b), (c) and (e) passed on the holdout and both halves of amendment A-1
 * pass: (d1) on the research window and (d2) on the pooled record; otherwise 'pre-launch'. Gate (d) as
 * first written (on the holdout alone) does not decide it.
 */
export function launchStatus(holdoutGates, { d1, d2 } = {}) {
  const need = ['a', 'b', 'c', 'e'];
  const byId = new Map(holdoutGates.map((g) => [g.id, g.pass]));
  return need.every((id) => byId.get(id) === true) && d1 === true && d2 === true ? 'ready' : 'pre-launch';
}

/**
 * The launch block of backtest.json.
 * @param validation engine/validate.js result (gates, holdout/research monthly excess, deflation, pbo)
 * @param rec engine/record.js result (the sealed record)
 */
export function buildLaunch(model, validation, rec) {
  const H = validation.holdout;
  const R = validation.research;
  const defl = validation.deflation;
  const holdoutMonthly = H.monthlyExcess;
  const sealedMonthly = sealedMonthlyExcess(model, rec);
  const lastHoldout = holdoutMonthly[holdoutMonthly.length - 1][0];
  if (sealedMonthly.length && sealedMonthly[0][0] <= lastHoldout) throw new Error('launch: the sealed record overlaps the holdout months');
  // The re-test runs at month-ends, so the tests use complete months only. When the last data day is
  // not its month's last trading day, that month to date is published apart (monthToDate) and enters
  // the test at its month-end; it is never counted as a full month.
  const pooledAll = [...holdoutMonthly, ...sealedMonthly];
  const partial = !monthComplete(model);
  const pooledMonthly = partial ? pooledAll.slice(0, -1) : pooledAll;
  const ex = pooledMonthly.map((x) => x[1]);
  const st = seriesStats(ex);
  const dsr = dsrFor(st, defl.clustered);
  const dsrRaw = dsrFor(st, defl.raw);
  const pooledPass = dsr !== null && dsr >= DSR_MIN && validation.pbo < PBO_MAX;
  const asOf = model.dates[model.T - 1];
  const lastMonth = pooledMonthly[pooledMonthly.length - 1][0];
  const lastMonthEnd = model.dates.filter((d) => d.slice(0, 7) === lastMonth).pop() ?? asOf;
  const sealedComplete = sealedMonthly.length - (partial ? 1 : 0);
  // the month to date, as it stands (not a test result)
  let mtd = null;
  if (partial) {
    const [month, excess] = pooledAll[pooledAll.length - 1];
    const s = seriesStats(pooledAll.map((x) => x[1]));
    mtd = { month, through: asOf, excess: round(excess, 6), months: pooledAll.length, sharpe: round(s.sr * Math.sqrt(12), 4), psr: round(psrFor(s), 4), dsr: round(dsrFor(s, defl.clustered), 4), dsrRaw: round(dsrFor(s, defl.raw), 4) };
  }
  // the monthly re-test: the pooled record at each month-end since the freeze
  const history = [];
  const d2History = [];
  for (let n = holdoutMonthly.length + 1; n <= pooledMonthly.length; n++) {
    const s = seriesStats(ex.slice(0, n));
    const d = dsrFor(s, defl.clustered);
    const p = psrFor(s);
    history.push({
      month: pooledMonthly[n - 1][0],
      months: n,
      sharpe: round(s.sr * Math.sqrt(12), 4),
      dsr: round(d, 4),
      dsrRaw: round(dsrFor(s, defl.raw), 4),
      pass: d !== null && d >= DSR_MIN && validation.pbo < PBO_MAX,
    });
    d2History.push({ month: pooledMonthly[n - 1][0], months: n, sharpe: round(s.sr * Math.sqrt(12), 4), psr: round(p, 4), pass: p !== null && p >= PSR_MIN });
  }
  const holdoutGates = validation.gates.map((g) => ({ id: g.id, pass: g.pass }));
  const failedHoldout = holdoutGates.filter((g) => g.id !== 'd' && !g.pass).map((g) => g.id);
  const need = pooledPass ? 0 : monthsToPass(st, defl.clustered);
  const holdSt = seriesStats(holdoutMonthly.map((x) => x[1]));
  const psrHoldout = psrFor(holdSt);
  // the original wording of gate (d): DSR on the holdout alone, PBO across the variants
  const gd = validation.gates.find((g) => g.id === 'd');
  const original = {
    dsr: round(validation.dsr, 4),
    pass: gd.pass,
    pbo: round(validation.pbo, 4),
    months: holdoutMonthly.length,
    sharpe: round(H.annualisedSharpe, 4),
    nTrialsEff: defl.clustered.K,
    dsrRaw: round(validation.dsrRaw, 4),
    basis: 'gate (d) as first written: clustered DSR >= 0.95 on the holdout monthly excess returns and PBO < 0.3',
  };
  // (d1): clustered DSR on the research window, where the variants were tried, and PBO < 0.3
  const d1 = {
    dsrResearch: round(validation.dsrResearch, 4),
    pbo: round(validation.pbo, 4),
    pass: validation.dsrResearch !== null && validation.dsrResearch >= DSR_MIN && validation.pbo < PBO_MAX,
    from: R.from,
    to: R.to,
    months: R.monthlyExcess.length,
    sharpe: round(R.annualisedSharpe, 4),
    nTrialsEff: defl.clustered.K,
    nTrialsRaw: defl.raw.nTrials,
    dsrResearchRaw: round(validation.dsrResearchRaw, 4),
    dsrThreshold: DSR_MIN,
    pboThreshold: PBO_MAX,
    basis: 'research-window monthly excess returns of the follow-every-pick portfolio, net of costs, deflated for the effective (clustered) number of variants tried; PBO by CSCV over the research-window variant matrix',
  };
  // (d2): PSR(SR > 0) on the pooled out-of-sample record, re-tested monthly
  const psr = psrFor(st);
  const d2Pass = psr !== null && psr >= PSR_MIN;
  const d2Need = d2Pass ? 0 : psrMonthsToPass(st);
  const d2 = {
    psr: round(psr, 4),
    months: pooledMonthly.length,
    sharpe: round(st.sr * Math.sqrt(12), 4),
    pass: d2Pass,
    threshold: PSR_MIN,
    sr0: 0,
    holdoutMonths: holdoutMonthly.length,
    sealedMonths: sealedComplete,
    through: lastMonthEnd,
    monthToDate: mtd ? { month: mtd.month, through: mtd.through, months: mtd.months, sharpe: mtd.sharpe, psr: mtd.psr, note: 'month to date, not a test result: it enters the test at its month-end' } : null,
    srMonthly: round(st.sr, 4),
    skew: round(st.skew, 3),
    kurtosis: round(st.kurt, 3),
    monthsToPass: d2Need,
    passAt: d2Need === null ? null : d2Need === 0 ? lastMonth : addMonths(lastMonth, d2Need),
    firstPass: d2History.find((h) => h.pass)?.month ?? null,
    basis: 'probabilistic Sharpe ratio PSR(SR > 0) of the pooled monthly series of complete months (launch.pooled.monthly): the formula of core/stats deflatedSharpe with SR0 = 0; re-tested at each month-end',
    history: d2History,
  };
  const status = launchStatus(holdoutGates, { d1: d1.pass, d2: d2.pass });
  const pooled = {
    from: H.from,
    to: lastMonthEnd,
    months: pooledMonthly.length,
    holdoutMonths: holdoutMonthly.length,
    sealedMonths: sealedComplete,
    monthToDate: mtd ? { month: mtd.month, through: mtd.through, excess: mtd.excess, months: mtd.months, sharpe: mtd.sharpe, dsr: mtd.dsr, dsrRaw: mtd.dsrRaw } : null,
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
    pass: pooledPass,
    gate: false,
    note: 'Deflated pooled figures, published for comparison: under A-1 the launch uses d1 and d2, not this test',
    monthsToPass: need,
    passAt: need === null ? null : need === 0 ? lastMonth : addMonths(lastMonth, need),
    basis: `monthly excess returns over the S&P 500 TR (simulated) of the follow-every-pick paper portfolio, net of costs: the holdout backtest for ${holdoutMonthly[0][0]}..${lastHoldout}, the sealed record from ${sealedMonthly[0]?.[0] ?? 'n/a'} to ${lastMonth}, complete months only${partial ? `; ${mtd.month} to ${asOf} is the month to date (monthToDate)` : ''}`,
    monthly: pooledMonthly.map(([m, x]) => [m, round(x, 6)]),
    history,
  };
  return {
    status,
    asOf,
    holdoutGates,
    amendment: {
      id: AMENDMENT_ID,
      date: model.periods.freeze,
      text: amendmentText({ date: model.periods.freeze, holdoutMonths: holdoutMonthly.length, holdoutSharpe: H.annualisedSharpe, psrHoldout, original, K: defl.clustered.K }),
      psrHoldout: round(psrHoldout, 4),
    },
    original,
    d1,
    d2,
    pooled,
    remaining: remainingText({ status, failedHoldout, d1, d2, lastMonth }),
  };
}

/** True when the last data day is the last trading day of its month. */
function monthComplete(model) {
  const last = model.dates[model.T - 1];
  return nextTradingDay(last).slice(0, 7) !== last.slice(0, 7);
}
