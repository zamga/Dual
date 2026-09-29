// The demo clock and the header issue pill (ARCHITECTURE.md §5). Pure functions of an instant,
// so tests pin every state. Rule: the site never shows a state that contradicts the data.
import { nextIssueSlot, issueSlot, isTradingDay, zonedToInstant, formatInZone, LJUBLJANA } from './core/calendar.js';

// After this Ljubljana time on an issue day the pill stops reporting that day's result
// and counts down to the next issue (the post-close ingest).
export const RESULT_UNTIL = '22:15:00';
export const PINNED_AT = '22:30:00';

// flagsNow: optional ISO instant from ?now= (testing); realNow: Date.
export function createClock({ asOf, flagsNow = null, realNow = () => new Date() }) {
  const pinnedInstant = zonedToInstant(asOf, PINNED_AT, LJUBLJANA);
  const horizon = new Date(nextIssueSlot(pinnedInstant).publishAtUtc);
  if (flagsNow) {
    const t = new Date(flagsNow);
    if (!Number.isNaN(t.getTime())) {
      const start = Date.now();
      return { mode: 'override', now: () => new Date(t.getTime() + (Date.now() - start)), pinnedInstant, horizon, asOf };
    }
  }
  const live = realNow().getTime() < horizon.getTime();
  // Live until the horizon; from then on the same clock reads the pinned instant, as a fresh load would.
  if (live) {
    const pinned = new Date(pinnedInstant);
    const now = () => {
      const r = realNow();
      return r.getTime() < horizon.getTime() ? r : new Date(pinned);
    };
    return { mode: 'live', now, passed: () => realNow().getTime() >= horizon.getTime(), pinnedInstant, horizon, asOf };
  }
  return { mode: 'pinned', now: () => new Date(pinnedInstant), pinnedInstant, horizon, asOf };
}

// A clock can go from live to pinned while the page is open (the next slot arrives); now() then returns
// the pinned instant, so the mode is read from the real passage of time.
export function clockMode(clock) {
  if (clock.mode !== 'live') return clock.mode;
  if (clock.passed) return clock.passed() ? 'pinned' : 'live';
  return clock.now().getTime() < clock.horizon.getTime() ? 'live' : 'pinned';
}

export function remaining(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  const d = Math.floor(m / 1440);
  const hh = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return { d, h: hh, m: mm, text: `${d}d ${hh}h` };
  if (hh > 0) return { d, h: hh, m: mm, text: `${hh}h ${mm}m` };
  return { d, h: 0, m: mm, text: `${mm}m` };
}

// issues: the ascending issues.json rows (only date, quorum, buys, renews, closes are read).
// Returns { kind: 'countdown' | 'result', ... }.
export function pillState(now, issues = []) {
  const t = now instanceof Date ? now : new Date(now);
  const lj = formatInZone(t, LJUBLJANA);
  const today = lj.date;
  const byDate = new Map(issues.map((r) => [r.date, r]));
  if (isTradingDay(today)) {
    const slot = issueSlot(today);
    const pub = new Date(slot.publishAtUtc).getTime();
    const until = zonedToInstant(today, RESULT_UNTIL, LJUBLJANA).getTime();
    const row = byDate.get(today);
    if (row && t.getTime() >= pub && t.getTime() < until) {
      return {
        kind: 'result',
        date: today,
        issue: row,
        quorum: !!row.quorum,
        picks: (row.buys?.length ?? 0) + (row.renews?.length ?? 0),
        tz: slot.tzLabel,
      };
    }
  }
  const next = nextIssueSlot(t);
  const ms = new Date(next.publishAtUtc).getTime() - t.getTime();
  const last = issues.length ? issues[issues.length - 1] : null;
  return { kind: 'countdown', slot: next, ms, left: remaining(ms), tz: next.tzLabel, last };
}

// Milliseconds until the pill text can next change (the next minute boundary).
export function msToNextMinute(now) {
  const t = now instanceof Date ? now.getTime() : now;
  return 60000 - (t % 60000) + 20;
}
