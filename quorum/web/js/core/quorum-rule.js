// The conviction gate (brief §2.3): at least 3 of 4 model families in their top slice (percentile at or
// above rule.topPct, calibrated per methodology version and published as meta.rule.topPct),
// no veto, then the caps. Pure and deterministic, so the engine, the server and the tests
// all run exactly the same rule.
import { countTradingDays, monthKey } from './calendar.js';

export const FAMILIES = ['A', 'B', 'C', 'D'];

export const DEFAULT_RULE = Object.freeze({
  topPct: 0.9,
  minAgree: 3,
  maxPerIssue: 2,
  maxPerMonth: 8,
  maxPerSector: 3,
  cooldownDays: 10,
  families: FAMILIES,
});

const LLM_VETOES = new Set(['llm_48h']);

function isScore(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

export function agreement(pct, { topPct = DEFAULT_RULE.topPct, suspended = [], families = FAMILIES } = {}) {
  const eligibleFamilies = families.filter((f) => !suspended.includes(f));
  const agreeing = eligibleFamilies.filter((f) => isScore(pct?.[f]) && pct[f] >= topPct);
  return { count: agreeing.length, agreeing, eligibleFamilies };
}

// Votes needed: minAgree, or every remaining family when the crash switch suspends A (3 of 3).
export function required(rule = DEFAULT_RULE, crashSwitch = false) {
  const n = (rule.families ?? FAMILIES).length - (crashSwitch ? 1 : 0);
  return Math.min(rule.minAgree, n);
}

export function combinedScore(pct, eligibleFamilies) {
  const vals = eligibleFamilies.map((f) => pct?.[f]).filter(isScore);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

// Does a stock meet the rule today, ignoring caps? Used for the day-21 RENEW decision.
export function meetsRule(stock, { rule = DEFAULT_RULE, crashSwitch = false } = {}) {
  const suspended = crashSwitch ? ['A'] : [];
  const a = agreement(stock.pct, { topPct: rule.topPct, suspended, families: rule.families ?? FAMILIES });
  return a.count >= required(rule, crashSwitch) && !(stock.vetoes && stock.vetoes.length);
}

/**
 * @param {object} p
 * @param {string} p.date                 issue date
 * @param {Array}  p.stocks               [{id, ticker, sector, pct: {A,B,C,D}, vetoes: string[]}]
 * @param {object} [p.rule]
 * @param {boolean}[p.crashSwitch]        suspends family A
 * @param {Array}  [p.openPositions]      [{id, sector}] open after today's closes and renewals
 * @param {number} [p.monthCount]         new BUYs already issued this calendar month
 * @param {object|Map} [p.lastClosedOn]   id -> date of that stock's most recent CLOSE
 */
export function applyQuorum({
  date,
  stocks,
  rule = DEFAULT_RULE,
  crashSwitch = false,
  openPositions = [],
  monthCount = 0,
  lastClosedOn = {},
}) {
  const r = { ...DEFAULT_RULE, ...rule };
  const suspended = crashSwitch ? ['A'] : [];
  const need = required(r, crashSwitch);
  const openIds = new Set(openPositions.map((p) => p.id));
  const sectorOpen = new Map();
  for (const p of openPositions) sectorOpen.set(p.sector, (sectorOpen.get(p.sector) ?? 0) + 1);
  const closedOn = (id) => (lastClosedOn instanceof Map ? lastClosedOn.get(id) : lastClosedOn[id]);

  let closest = 0;
  const qualifying = [];
  for (const s of stocks) {
    const a = agreement(s.pct, { topPct: r.topPct, suspended, families: r.families });
    const vetoes = s.vetoes ?? [];
    if (!vetoes.length && a.count > closest) closest = a.count;
    if (a.count < need) continue;
    qualifying.push({
      id: s.id,
      ticker: s.ticker,
      sector: s.sector,
      agreement: a.count,
      agreeing: a.agreeing,
      combined: combinedScore(s.pct, a.eligibleFamilies),
      vetoes,
      status: null,
    });
  }

  qualifying.sort((x, y) => y.combined - x.combined || String(x.id).localeCompare(String(y.id)));

  let issuedToday = 0;
  const sectorToday = new Map();
  for (const c of qualifying) {
    if (openIds.has(c.id)) c.status = 'already_open';
    else if (c.vetoes.some((v) => !LLM_VETOES.has(v))) c.status = 'vetoed_rule';
    else if (c.vetoes.length) c.status = 'vetoed_llm';
    else if (closedOn(c.id) && countTradingDays(closedOn(c.id), date) <= r.cooldownDays) c.status = 'cooldown';
    else if (issuedToday >= r.maxPerIssue) c.status = 'capped_issue';
    else if (monthCount + issuedToday >= r.maxPerMonth) c.status = 'capped_month';
    else if ((sectorOpen.get(c.sector) ?? 0) + (sectorToday.get(c.sector) ?? 0) >= r.maxPerSector) c.status = 'capped_sector';
    else {
      c.status = 'issued';
      issuedToday++;
      sectorToday.set(c.sector, (sectorToday.get(c.sector) ?? 0) + 1);
    }
  }

  return { date, month: monthKey(date), required: need, candidates: qualifying, buys: qualifying.filter((c) => c.status === 'issued'), closest };
}

// The qualifying family closest to the threshold: "this would not have been issued if C were below 90".
export function sensitivity(pct, agreeing, topPct = DEFAULT_RULE.topPct) {
  let best = null;
  for (const f of agreeing) {
    const margin = pct[f] - topPct;
    if (best === null || margin < best.margin) best = { family: f, pct: pct[f], margin };
  }
  return best;
}
