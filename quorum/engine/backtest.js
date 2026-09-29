// The daily quorum run over any date range, plus the comparison sets and full-universe statistics
// the scoreboard, the backtest page and the ship gates are built from.
//
// Timing (engine/model.js): family percentiles at model day s are as of the US close of dates[s].
// The issue that uses them is dated dates[s + 1] (14:00 Ljubljana, before the open), so an issue on
// model day t reads signals at s = t - 1, enters at open[t] and exits at open[t + 21]. At that exit
// slot (the issue on day t + 21, reading signals at t + 20) a pick is RENEWED (a new record, a new
// number, a new 21-day window, the position continues) if it still meets the rule and no veto fires,
// otherwise it is CLOSED at that day's open.
//
// Costs: 10 bps one way above $10B market cap, 25 bps for $2-10B (model.oneWayCost, on the market cap
// at the signal close). Net = (1 + gross) * (1 - c) / (1 + c) - 1: bought at open * (1 + c), sold at
// the exit open * (1 - c). Excess = net - benchmark total return over the same open-to-open window.
import { applyQuorum, meetsRule, agreement, combinedScore, DEFAULT_RULE } from '../core/quorum-rule.js';
import { MAX_MONTHLY_MESSAGES } from '../core/sms-templates.js';
import { addTradingDays } from '../core/calendar.js';
import { mean, median, wilsonCI, bootstrapCI, spearman } from '../core/stats.js';

export const FAMS = ['A', 'B', 'C', 'D'];
export const HORIZON = 21;
export const VETO_KEYS = ['days_to_cover', 'idio_vol', 'earnings_within_3d', 'pending_ma', 'llm_48h'];
const VETO_BIT = { days_to_cover: 2, idio_vol: 4, earnings_within_3d: 8, pending_ma: 16, llm_48h: 32 };

// ---- small helpers ----------------------------------------------------------------------------------

export const round = (x, d = 6) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

/**
 * A family percentile as published (4 decimals), truncated rather than rounded so that a published
 * value is at or above the rule's topPct exactly when the family votes: 0.94996 is published as 0.9499,
 * never as 0.95. Null when the family does not score the stock.
 */
export const floorPct = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.floor(x * 1e4) / 1e4 : null);

/** A percentile as the integer permille of hero.json (0-999), truncated like floorPct; -1 when not scored. */
export const permille = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(999, Math.floor(x * 1000))) : -1);

/** Model day index of a date (exact match), or -1. */
export function dayIndex(model, date) {
  const { dates } = model;
  let lo = 0;
  let hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] < date) lo = mid + 1;
    else hi = mid;
  }
  return lo < dates.length && dates[lo] === date ? lo : -1;
}

/** First model day on or after `date` (T when none). */
export function firstOnOrAfter(model, date) {
  const { dates } = model;
  let lo = 0;
  let hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] < date) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Last model day on or before `date` (-1 when none). */
export function lastOnOrBefore(model, date) {
  const k = firstOnOrAfter(model, date);
  return k < model.T && model.dates[k] === date ? k : k - 1;
}

/** Issue-day index range [from, to] of a named period ('research' | 'holdout' | 'sealed'). */
export function periodRange(model, name) {
  const [a, b] = model.periods[name];
  const from = Math.max(1, firstOnOrAfter(model, a)); // the first issue needs one signal day before it
  let to = firstOnOrAfter(model, b);
  if (to >= model.T || model.dates[to] !== b) to -= 1;
  return [from, Math.min(to, model.T - 1)];
}

// ---- vetoes -------------------------------------------------------------------------------------------
//
// The LLM 48-hour news veto (llm_48h; in the simulation a deterministic stand-in) is never backtested
// (brief §3.3): LLM components are validated only on dates after the model's training cutoff, so the
// veto is validated live, from the first issue of the sealed record on. vetoBits() therefore masks it
// for every issue day before model.periods.sealed[0]: the research window, the calibration, the variant
// matrix, the holdout and every comparison set run without it. rawVetoBits() keeps it, for the
// would-be blocks published beside the backtest (llmVetoShadow).

export const VETO_BIT_LLM = VETO_BIT.llm_48h;
const vetoMemo = new WeakMap();
const llmFromMemo = new WeakMap();

/** Veto bit mask for stock i at signal day s with every veto, the LLM stand-in included (bit 0 = computed). */
export function rawVetoBits(model, s, i) {
  let arr = vetoMemo.get(model);
  if (!arr) {
    arr = new Uint8Array(model.T * model.N);
    vetoMemo.set(model, arr);
  }
  const k = s * model.N + i;
  let b = arr[k];
  if (!b) {
    const f = model.vetoFlags(s, i);
    b = 1 | (f.dtcTopDecile ? 2 : 0) | (f.ivolTopDecile ? 4 : 0) | (f.earningsWithin3d ? 8 : 0) | (f.pendingMA ? 16 : 0) | (f.newsNegative48h ? 32 : 0);
    arr[k] = b;
  }
  return b;
}

/**
 * First signal day on which the LLM veto applies: the day before the first issue of the sealed record
 * (model.periods.sealed[0]); signal day s feeds the issue on day s + 1. Memoised per model.
 */
export function llmVetoFromSignal(model) {
  let s0 = llmFromMemo.get(model);
  if (s0 === undefined) {
    const live = model.periods?.sealed?.[0];
    s0 = live ? Math.max(0, firstOnOrAfter(model, live) - 1) : 0;
    llmFromMemo.set(model, s0);
  }
  return s0;
}

/** Veto bit mask that applies at signal day s: rawVetoBits without the LLM stand-in before the sealed record. */
export function vetoBits(model, s, i) {
  const b = rawVetoBits(model, s, i);
  return s < llmVetoFromSignal(model) ? b & ~VETO_BIT_LLM : b;
}

export function vetoKeysOf(bits) {
  return VETO_KEYS.filter((k) => bits & VETO_BIT[k]);
}

export function pctOf(model, s, i) {
  const o = {};
  for (const f of FAMS) {
    const v = model.pct[f][s * model.N + i];
    o[f] = v === v ? v : null;
  }
  return o;
}

function isScored(model, s, i) {
  if (!model.eligible[s * model.N + i]) return false;
  const k = s * model.N + i;
  return model.pct.A[k] === model.pct.A[k] || model.pct.B[k] === model.pct.B[k] || model.pct.C[k] === model.pct.C[k] || model.pct.D[k] === model.pct.D[k];
}

/** Stocks scored at signal day s (eligible, at least one family). */
export function scoredCount(model, s) {
  let n = 0;
  for (let i = 0; i < model.N; i++) if (isScored(model, s, i)) n++;
  return n;
}

// ---- outcomes -----------------------------------------------------------------------------------------

/**
 * Outcome of holding stock i from the open of tEntry to the open of tExit (model days).
 * Returns null when the exit lies beyond the data. `full` adds EUR, alert gap and the 5/63-day outcomes.
 */
export function measure(model, i, tEntry, tExit, { full = false } = {}) {
  const { N, T } = model;
  const gross = model.holdReturn(i, tEntry, tExit);
  if (!Number.isFinite(gross)) return null;
  const s = tEntry - 1;
  const c = model.oneWayCost(s, i);
  const net = ((1 + gross) * (1 - c)) / (1 + c) - 1;
  const bench = model.benchReturn(tEntry, tExit);
  if (!Number.isFinite(bench)) return null;
  const out = { gross, net, bench, excess: net - bench, cost: c };
  if (!full) return out;
  const entryOpen = model.open[tEntry * N + i];
  const prevClose = model.close[s * N + i];
  out.entryOpen = entryOpen;
  out.prevClose = prevClose;
  out.exitOpen = entryOpen * (1 + gross);
  const dl = model.companies[i].delistDate;
  out.delisted = dl && dl < model.dates[Math.min(tExit, T - 1)] ? { date: dl, reason: model.companies[i].delistReason } : null;
  out.alertGapBps = (entryOpen / prevClose - 1) * 1e4;
  out.eurNet = ((1 + net) * model.eurusd[s]) / model.eurusd[tExit - 1] - 1;
  const at = (h) => {
    if (tEntry + h > T - 1) return null;
    const r = model.holdReturn(i, tEntry, tEntry + h);
    const b = model.benchReturn(tEntry, tEntry + h);
    return Number.isFinite(r) && Number.isFinite(b) ? ((1 + r) * (1 - c)) / (1 + c) - 1 - b : null;
  };
  out.d5 = at(5);
  out.d63 = at(63);
  return out;
}

// ---- the daily quorum run -------------------------------------------------------------------------------

/**
 * Run the quorum rule day by day.
 * @param {object} model
 * @param {object} o
 *   from, to        first and last ISSUE day (model indices, from >= 1)
 *   rule            core/quorum-rule rule (topPct, minAgree, caps)
 *   exitLimit       records whose planned exit lies after this model day stay open (unmeasured)
 *   review(ctx)     optional approver hook, called with {t, s, date, buys (core candidates), renews,
 *                   closes} -> { approver, remove: [{i, by, reason}], unissued: bool }. It can only remove.
 *   maxMessages     monthly SMS budget (default core MAX_MONTHLY_MESSAGES = 16; null switches it off)
 *   keepCandidates  keep the candidate list of every issue (for the record and the export)
 * @returns {{ rule, from, to, records, issues }}
 *   records[k]: { k, kind: 'BUY'|'RENEW', i, s, t, tExit, prior, next, agreement, agreeing, combined,
 *                 crashSwitch, pct, sector, status: 'open'|'closed'|'renewed', outcome, closeT }
 *   issues[]:   { t, s, date, nScored, closest, required, reached, crashSwitch, buys, renews, closes,
 *                 vetoes: {rule, llm, human, capped}, human: [...], approver, unissued, candidates?,
 *                 llmShadow: {candidates, renewals} (before the sealed record only: what the LLM
 *                 stand-in, which is not backtested, would have blocked) }
 */
export function runQuorum(model, o) {
  const rule = { ...DEFAULT_RULE, ...(o.rule || {}) };
  const { N, T, dates } = model;
  const from = Math.max(1, o.from);
  const to = Math.min(T - 1, o.to);
  const exitLimit = o.exitLimit ?? T - 1;
  const horizon = o.horizon ?? HORIZON;
  // SMS budget (consent text): at most 16 messages a calendar month, picks plus exits. Every record
  // sends one message when issued (BUY) and one at its exit slot (RENEW or CLOSE), so new BUYs are
  // trimmed when the month's sent plus already-scheduled messages would pass the budget.
  const maxMessages = o.maxMessages === undefined ? MAX_MONTHLY_MESSAGES : o.maxMessages;
  const dateAt = (k) => (k <= T - 1 ? dates[k] : addTradingDays(dates[T - 1], k - (T - 1)));
  const sectorOf = model.companies.map((c) => c.sector);
  const tickerOf = model.companies.map((c) => c.ticker);
  const records = [];
  const issues = [];
  const open = []; // record indices currently open
  const lastClosedOn = new Map(); // stock -> date of its latest CLOSE (pruned once past the cooldown)
  const closedAt = new Map(); // stock -> model day of that CLOSE
  let month = '';
  let monthCount = 0;
  let sentThisMonth = 0;
  const pA = model.pct.A;
  const pB = model.pct.B;
  const pC = model.pct.C;
  const pD = model.pct.D;
  const top = rule.topPct;
  const llmFrom = llmVetoFromSignal(model);
  // before the sealed record the LLM stand-in does not veto; count what it would have blocked
  const llmWouldBlock = (s, i) => s < llmFrom && (rawVetoBits(model, s, i) & VETO_BIT_LLM) !== 0;

  const stockAt = (s, i) => ({ id: i, ticker: tickerOf[i], sector: sectorOf[i], pct: pctOf(model, s, i), vetoes: vetoKeysOf(vetoBits(model, s, i)) });

  const closeRecord = (rec, t, status) => {
    rec.status = status;
    rec.closeT = t;
    rec.outcome = measure(model, rec.i, rec.t, t, { full: true });
  };

  for (let t = from; t <= to; t++) {
    const s = t - 1;
    const date = dates[t];
    const cs = model.crashSwitch[s] === 1;
    if (date.slice(0, 7) !== month) {
      month = date.slice(0, 7);
      monthCount = 0;
      sentThisMonth = 0;
    }
    const issue = { t, s, date, crashSwitch: cs, buys: [], renews: [], closes: [], vetoes: { rule: 0, llm: 0, human: 0, capped: 0 }, human: [], approver: null, unissued: 0, llmShadow: { candidates: 0, renewals: 0 } };

    // 1. the day-21 slot: RENEW or CLOSE every record whose window ends at today's open
    const due = open.filter((k) => records[k].tExit === t).sort((a, b) => a - b);
    for (const k of due) {
      const rec = records[k];
      open.splice(open.indexOf(k), 1);
      const st = stockAt(s, rec.i);
      if (isScored(model, s, rec.i) && meetsRule(st, { rule, crashSwitch: cs })) {
        closeRecord(rec, t, 'renewed');
        const a = agreement(st.pct, { topPct: top, suspended: cs ? ['A'] : [], families: rule.families });
        const nk = records.length;
        records.push({
          k: nk, kind: 'RENEW', i: rec.i, s, t, tExit: t + horizon, prior: k, next: null,
          agreement: a.count, agreeing: a.agreeing, combined: combinedScore(st.pct, a.eligibleFamilies),
          crashSwitch: cs, pct: st.pct, sector: sectorOf[rec.i], status: 'open', outcome: null, closeT: null,
        });
        rec.next = nk;
        open.push(nk);
        issue.renews.push(nk);
        if (llmWouldBlock(s, rec.i)) issue.llmShadow.renewals++;
      } else {
        closeRecord(rec, t, 'closed');
        issue.closes.push(k);
        lastClosedOn.set(rec.i, date);
        closedAt.set(rec.i, t);
      }
    }

    // 2. the gate: stocks with at least two families in the top slice are enough to rank candidates
    //    and to find the closest agreement (a day where no stock reaches 2 is handled below)
    const stocks = [];
    let nScored = 0;
    for (let i = 0; i < N; i++) {
      const q = s * N + i;
      if (!model.eligible[q]) continue;
      const a = pA[q];
      const b = pB[q];
      const c = pC[q];
      const d = pD[q];
      if (!(a === a || b === b || c === c || d === d)) continue;
      nScored++;
      const n = (a >= top) + (b >= top) + (c >= top) + (d >= top);
      if (n >= 2) stocks.push(stockAt(s, i));
    }
    // closes older than the cooldown can no longer block anything; pruning keeps the core rule's
    // trading-day count short
    for (const [i, tc] of closedAt) {
      if (t - tc > rule.cooldownDays) {
        closedAt.delete(i);
        lastClosedOn.delete(i);
      }
    }
    const openPositions = open.map((k) => ({ id: records[k].i, sector: records[k].sector }));
    const res = applyQuorum({ date, stocks, rule, crashSwitch: cs, openPositions, monthCount, lastClosedOn });
    let closest = res.closest;
    if (closest < 2) {
      // exact closest over every scored, non-vetoed stock
      for (let i = 0; i < N; i++) {
        if (!isScored(model, s, i)) continue;
        const st = stockAt(s, i);
        if (st.vetoes.length) continue;
        const a = agreement(st.pct, { topPct: top, suspended: cs ? ['A'] : [], families: rule.families });
        if (a.count > closest) closest = a.count;
      }
    }
    for (const c of res.candidates) {
      if (c.status === 'vetoed_rule') issue.vetoes.rule++;
      else if (c.status === 'vetoed_llm') issue.vetoes.llm++;
      else if (c.status.startsWith('capped') || c.status === 'cooldown') issue.vetoes.capped++;
      if (c.status !== 'vetoed_rule' && c.status !== 'already_open' && llmWouldBlock(s, c.id)) issue.llmShadow.candidates++;
    }

    sentThisMonth += issue.renews.length + issue.closes.length;
    let buys = res.buys;
    const statusOf = new Map(); // candidate status after the SMS budget and the approver
    if (maxMessages !== null && buys.length) {
      let pending = 0;
      for (const k of open) if (records[k].tExit > t && dateAt(records[k].tExit).slice(0, 7) === month) pending++;
      const exitsThisMonth = dateAt(t + horizon).slice(0, 7) === month ? 1 : 0;
      const kept = [];
      let used = 0;
      for (const b of buys) {
        if (sentThisMonth + pending + used + 1 + exitsThisMonth <= maxMessages) {
          kept.push(b);
          used += 1 + exitsThisMonth;
        } else {
          issue.vetoes.capped++;
          issue.smsBudgetCapped = (issue.smsBudgetCapped ?? 0) + 1;
          statusOf.set(b.id, 'capped_sms');
        }
      }
      buys = kept;
    }

    // 3. the approver may remove (never add or substitute)
    if (o.review) {
      const rv = o.review({ t, s, date, buys, renews: issue.renews.map((k) => records[k]), closes: issue.closes.map((k) => records[k]) }) || {};
      issue.approver = rv.approver ?? null;
      if (rv.unissued && buys.length) {
        issue.unissued = buys.length;
        issue.unissuedTickers = buys.map((b) => b.ticker);
        for (const b of buys) statusOf.set(b.id, 'unissued_no_approver');
        buys = [];
      } else if (rv.remove && rv.remove.length) {
        const rm = new Map(rv.remove.map((x) => [x.i, x]));
        for (const b of buys) {
          if (!rm.has(b.id)) continue;
          issue.vetoes.human++;
          issue.human.push({ i: b.id, ticker: b.ticker, by: rm.get(b.id).by ?? issue.approver, reason: rm.get(b.id).reason });
          statusOf.set(b.id, 'vetoed_human');
        }
        buys = buys.filter((b) => !rm.has(b.id));
      }
    }

    // 4. new BUY records
    for (const b of buys) {
      const nk = records.length;
      records.push({
        k: nk, kind: 'BUY', i: b.id, s, t, tExit: t + horizon, prior: null, next: null,
        agreement: b.agreement, agreeing: b.agreeing, combined: b.combined, crashSwitch: cs,
        pct: pctOf(model, s, b.id), sector: b.sector, status: 'open', outcome: null, closeT: null,
      });
      open.push(nk);
      issue.buys.push(nk);
      monthCount++;
      sentThisMonth++;
    }
    issue.nScored = nScored;
    issue.closest = closest;
    issue.required = res.required;
    issue.reached = res.candidates.filter((c) => !c.status.startsWith('vetoed')).length;
    if (o.keepCandidates) issue.candidates = res.candidates.map((c) => ({ i: c.id, ticker: c.ticker, agreement: c.agreement, agreeing: c.agreeing, combined: c.combined, status: statusOf.get(c.id) ?? c.status, vetoes: c.vetoes }));
    issues.push(issue);
  }

  // records still open after the last issue: closed at their planned exit when the data reaches it
  // (no RENEW is evaluated after the run ends); later exits stay open
  for (const k of open.slice()) {
    const rec = records[k];
    if (rec.tExit <= exitLimit && rec.tExit <= T - 1) {
      closeRecord(rec, rec.tExit, 'closed');
      rec.closedAfterRun = true;
      open.splice(open.indexOf(k), 1);
    }
  }
  return { rule, from, to, records, issues, open };
}

// ---- summaries -----------------------------------------------------------------------------------------------

/** Headline statistics of a list of outcomes (objects with .excess). */
export function outcomeStats(outcomes, { ci = true } = {}) {
  const ex = outcomes.map((x) => x.excess);
  const n = ex.length;
  const wins = ex.filter((x) => x > 0).length;
  return {
    n,
    hit: n ? wins / n : null,
    hitCI: ci && n ? wilsonCI(wins, n) : null,
    meanExcess: n ? mean(ex) : null,
    medianExcess: n ? median(ex) : null,
    meanCI: ci && n > 1 ? bootstrapCI(ex, mean, { n: 1000 }) : null,
  };
}

/** Picks per calendar month over the issue days [from, to]. */
export function picksPerMonth(model, run, { from = run.from, to = run.to, kinds = ['BUY'] } = {}) {
  const months = new Map();
  for (let t = from; t <= to; t++) months.set(model.dates[t].slice(0, 7), 0);
  for (const r of run.records) {
    if (!kinds.includes(r.kind) || r.t < from || r.t > to) continue;
    const m = model.dates[r.t].slice(0, 7);
    months.set(m, months.get(m) + 1);
  }
  const counts = [...months.values()];
  return { mean: counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0, months: [...months.entries()] };
}

// ---- comparison sets: family top deciles, the 2/4 shadow set, the A-C composite -------------------------------

/**
 * Per-day composite percentile of A, B and C (equal weight): the mean of the three percentiles,
 * re-ranked across the stocks that have all three. Float32Array(T*N), NaN when not scored.
 */
export function compositeABC(model) {
  const { T, N } = model;
  const out = new Float32Array(T * N).fill(NaN);
  const idx = [];
  const val = [];
  for (let s = 0; s < T; s++) {
    idx.length = 0;
    val.length = 0;
    for (let i = 0; i < N; i++) {
      const q = s * N + i;
      if (!model.eligible[q]) continue;
      const a = model.pct.A[q];
      const b = model.pct.B[q];
      const c = model.pct.C[q];
      if (a === a && b === b && c === c) {
        idx.push(i);
        val.push((a + b + c) / 3);
      }
    }
    const n = idx.length;
    const order = idx.map((_, z) => z).sort((x, y) => val[x] - val[y] || idx[x] - idx[y]);
    for (let r = 0; r < n; r++) out[s * N + idx[order[r]]] = (r + 0.5) / n;
  }
  return out;
}

/**
 * "Measured like picks": each set is a stream of 21-day positions. A stock enters on the first issue
 * day it qualifies (signals at s = t - 1, no veto firing), is held from open[t] to open[t + 21] and can
 * re-enter at that slot if it still qualifies. Same costs and benchmark as picks.
 * @param sets { name: (q, n2, ctx) => boolean } where q = s * N + i and n2 = families in the top slice
 * @param includeOpen  also return the positions whose exit lies after exitLimit, as { i, t, tExit, cost,
 *                     open: true } with no outcome (for the follow-every-position equity, which marks them
 *                     to the end of the period; outcome statistics must use only the measured ones)
 * @returns { name: [{ i, t, tExit, excess, net, bench, cost }] }
 */
export function episodeSets(model, { from, to, exitLimit = model.T - 1, topPct = 0.9, sets, vetoes = true, extra = {}, includeOpen = false }) {
  const { N, T } = model;
  const names = Object.keys(sets);
  const held = names.map(() => new Int32Array(N).fill(-1));
  const out = Object.fromEntries(names.map((n) => [n, []]));
  const P = FAMS.map((f) => model.pct[f]);
  for (let t = from; t <= Math.min(to, T - 1); t++) {
    const s = t - 1;
    for (let i = 0; i < N; i++) {
      const q = s * N + i;
      if (!model.eligible[q]) continue;
      let n = 0;
      for (let f = 0; f < 4; f++) if (P[f][q] >= topPct) n++;
      let vetoChecked = false;
      let vetoed = false;
      for (let k = 0; k < names.length; k++) {
        if (held[k][i] > t) continue;
        if (!sets[names[k]](q, n, extra)) continue;
        if (vetoes) {
          if (!vetoChecked) {
            vetoed = vetoBits(model, s, i) > 1;
            vetoChecked = true;
          }
          if (vetoed) continue;
        }
        const tExit = t + HORIZON;
        held[k][i] = tExit;
        if (tExit > exitLimit) {
          if (includeOpen) out[names[k]].push({ i, t, tExit, cost: model.oneWayCost(s, i), open: true });
          continue;
        }
        const m = measure(model, i, t, tExit);
        if (m) out[names[k]].push({ i, t, tExit, excess: m.excess, net: m.net, bench: m.bench, cost: m.cost });
      }
    }
  }
  return out;
}

// ---- equity of a "follow every position" paper portfolio -------------------------------------------------------

/**
 * Daily equal-weight index of every position active on a day (entry at the open, exit at the open,
 * costs on both legs, delisting proceeds on the delisting day), from the close of day start - 1 to
 * the close of day end. Returns { dates, idx: Float64Array, ret: Float64Array, bench: Float64Array }.
 */
export function followEquity(model, positions, start, end) {
  const { N, dates } = model;
  const L = end - start + 1;
  const sum = new Float64Array(L);
  const cnt = new Float64Array(L);
  const o = model.open;
  const c = model.close;
  for (const p of positions) {
    const { i, t } = p;
    const tExit = p.tExit;
    const cost = p.cost ?? model.oneWayCost(t - 1, i);
    const dlDate = model.companies[i].delistDate;
    const dl = dlDate ? firstOnOrAfter(model, dlDate) : Infinity;
    const dr = model.companies[i].delistReturn;
    for (let d = Math.max(t, start); d <= Math.min(tExit, end); d++) {
      if (d > dl) break;
      let r;
      if (d === t) r = c[d * N + i] / o[d * N + i] / (1 + cost) - 1;
      else if (d === tExit) r = (o[d * N + i] / c[(d - 1) * N + i]) * (1 - cost) - 1;
      else r = c[d * N + i] / c[(d - 1) * N + i] - 1;
      if (d === dl && dl < tExit) {
        const base = d === t ? o[d * N + i] * (1 + cost) : c[(d - 1) * N + i];
        r = (c[d * N + i] * (1 + (dr === dr && dr !== null ? dr : -0.3))) / base - 1;
      }
      if (!Number.isFinite(r)) continue;
      sum[d - start] += r;
      cnt[d - start]++;
    }
  }
  const idx = new Float64Array(L);
  const ret = new Float64Array(L);
  const bench = new Float64Array(L);
  let v = 1;
  const b0 = model.benchmark.close[start - 1];
  for (let k = 0; k < L; k++) {
    ret[k] = cnt[k] ? sum[k] / cnt[k] : 0;
    v *= 1 + ret[k];
    idx[k] = v;
    bench[k] = model.benchmark.close[start + k] / b0;
  }
  return { dates: dates.slice(start, end + 1), idx, ret, bench, active: cnt };
}

/** Month-end samples of one or more daily index series: [[date, ...values]]. */
export function monthEnds(datesArr, series) {
  const out = [];
  for (let k = 0; k < datesArr.length; k++) {
    if (k + 1 < datesArr.length && datesArr[k + 1].slice(0, 7) === datesArr[k].slice(0, 7)) continue;
    out.push([datesArr[k], ...series.map((s) => s[k])]);
  }
  return out;
}

/** Calendar-month returns of a daily index (first month measured from 1). */
export function monthlyReturns(datesArr, idx) {
  const out = [];
  let prev = 1;
  for (let k = 0; k < datesArr.length; k++) {
    if (k + 1 < datesArr.length && datesArr[k + 1].slice(0, 7) === datesArr[k].slice(0, 7)) continue;
    out.push([datesArr[k].slice(0, 7), idx[k] / prev - 1]);
    prev = idx[k];
  }
  return out;
}

// ---- full-universe statistics -----------------------------------------------------------------------------------

/** Month-end signal days s in [fromS, toS] with a complete 21-day forward window. */
export function monthEndSignals(model, fromS, toS) {
  const out = [];
  for (let s = Math.max(0, fromS); s <= Math.min(toS, model.T - 2); s++) {
    if (model.dates[s].slice(0, 7) === model.dates[s + 1].slice(0, 7)) continue;
    if (s + 1 + HORIZON > model.T - 1) continue;
    out.push(s);
  }
  return out;
}

/**
 * Month-end cross-sections over the signal days: rank IC per family (vs the gross 21-day forward
 * open-to-open return) and decile excess returns (gross, vs the benchmark) for each family and the
 * combined score (mean of the available family percentiles, re-ranked).
 */
export function universeStats(model, signals) {
  const { N } = model;
  const series = { A: [], B: [], C: [], D: [], combined: [] };
  const ic = [];
  const corr = { AB: [], AC: [], AD: [], BC: [], BD: [], CD: [] };
  for (const s of signals) {
    const b = model.benchReturn(s + 1, s + 1 + HORIZON);
    const ids = [];
    const fwd = [];
    const cols = { A: [], B: [], C: [], D: [], combined: [] };
    for (let i = 0; i < N; i++) {
      const q = s * N + i;
      if (!model.eligible[q]) continue;
      const r = model.holdReturn(i, s + 1, s + 1 + HORIZON);
      if (!Number.isFinite(r)) continue;
      const v = FAMS.map((f) => model.pct[f][q]);
      const ok = v.filter((x) => x === x);
      if (!ok.length) continue;
      ids.push(i);
      fwd.push(r);
      FAMS.forEach((f, z) => cols[f].push(v[z] === v[z] ? v[z] : NaN));
      cols.combined.push(ok.reduce((x, y) => x + y, 0) / ok.length);
    }
    const row = { month: model.dates[s].slice(0, 7), s };
    for (const f of FAMS) row[f] = spearman(cols[f], fwd);
    ic.push(row);
    const pairs = [['A', 'B'], ['A', 'C'], ['A', 'D'], ['B', 'C'], ['B', 'D'], ['C', 'D']];
    for (const [x, y] of pairs) corr[x + y].push(spearman(cols[x], cols[y]));
    for (const key of [...FAMS, 'combined']) {
      const zs = [];
      for (let z = 0; z < ids.length; z++) if (cols[key][z] === cols[key][z]) zs.push(z);
      zs.sort((x, y) => cols[key][x] - cols[key][y] || ids[x] - ids[y]);
      const n = zs.length;
      const sums = new Float64Array(10);
      const cnts = new Float64Array(10);
      for (let r = 0; r < n; r++) {
        const d = Math.min(9, Math.floor((r * 10) / n));
        sums[d] += fwd[zs[r]] - b;
        cnts[d]++;
      }
      series[key].push(Array.from(sums, (x, d) => (cnts[d] ? x / cnts[d] : NaN)));
    }
  }
  const deciles = {};
  for (const key of ['combined', ...FAMS]) {
    deciles[key] = [];
    for (let d = 0; d < 10; d++) {
      const v = series[key].map((m) => m[d]).filter((x) => Number.isFinite(x));
      deciles[key].push({ d: d + 1, excess: v.length ? mean(v) : null, ci: v.length > 1 ? bootstrapCI(v, mean, { n: 1000 }) : null, months: v.length });
    }
  }
  const correlations = {};
  for (const [k, v] of Object.entries(corr)) correlations[k] = mean(v.filter((x) => Number.isFinite(x)));
  return { ic, deciles, correlations, months: signals.length };
}
