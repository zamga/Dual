// Pure helpers for #status: the demo status derived honestly from the published data (pre-launch, no
// subscribers, every channel ready), the live /api/status body normalised to the same shape, and the
// day's timetable (brief §4.3) with each slot done / next / later against the clock.
// No DOM: tested in Node (tests/web/status.test.js).
import { issueSlot, zonedToInstant, prevTradingDay, isTradingDay, formatInZone, nextIssueSlot, LJUBLJANA } from '../core/calendar.js';

export const CHANNELS = ['sms', 'push', 'email'];
export const DELIVERY = ['queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'cancelled'];

const zeros = () => Object.fromEntries(DELIVERY.map((k) => [k, 0]));

function issueOf(row) {
  if (!row) return null;
  return {
    date: row.date,
    issueNo: row.issueNo ?? null,
    publishedAt: row.publishAt ?? null,
    late: false,
    quorum: !!row.quorum,
    items: { buys: row.buys?.length ?? 0, renews: row.renews?.length ?? 0, closes: row.closes?.length ?? 0 },
    nScored: row.nScored ?? null,
    closest: row.closest ?? null,
    seq: row.seq ?? null,
    hash: row.hash ?? null,
  };
}

// The latest issue published at or before now.
export function latestIssue(issues, now) {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  let best = null;
  for (const r of issues ?? []) if (r?.publishAt && new Date(r.publishAt).getTime() <= t) best = r;
  return best;
}

// Demo: nothing is sent because nobody is subscribed. Counts are zero because they are zero.
export function demoStatus({ issues, ledger, now, prelaunch = true }) {
  const t = now instanceof Date ? now : new Date(now);
  const row = latestIssue(issues, t);
  const anchors = ledger?.anchors ?? [];
  const a = anchors.length ? anchors[anchors.length - 1] : null;
  return {
    simulated: true,
    mode: 'demo',
    prelaunch,
    now: t.toISOString(),
    issue: issueOf(row),
    nextIssueAt: nextIssueSlot(t).publishAt,
    delivery: Object.fromEntries(CHANNELS.map((c) => [c, zeros()])),
    recipients: { sms: 0, push: 0, email: 0 },
    fanout: null,
    smsChannel: { paused: false },
    anchor: a ? { date: a.date, merkleRoot: a.merkleRoot ?? null, rows: a.rowCount ?? null, ots: a.ots ?? null, rfc3161: a.rfc3161 ?? null } : null,
  };
}

// Live: /api/status as the page reads it (missing parts become nulls and zeros).
export function liveStatus(body, { prelaunch = false } = {}) {
  const b = body ?? {};
  const delivery = Object.fromEntries(CHANNELS.map((c) => [c, { ...zeros(), ...(b.delivery?.[c] ?? {}) }]));
  return {
    simulated: b.simulated ?? true,
    mode: 'live',
    prelaunch,
    now: b.now ?? null,
    issue: b.issue ? { seq: null, hash: null, ...b.issue } : null,
    nextIssueAt: b.nextIssueAt ?? null,
    delivery,
    recipients: null,
    fanout: b.fanout ?? null,
    smsChannel: { paused: !!b.smsChannel?.paused },
    anchor: b.anchor ?? null,
  };
}

export function total(counts) {
  return DELIVERY.reduce((s, k) => s + (counts?.[k] ?? 0), 0);
}

// The state of one channel in words the board prints: 'paused' | 'failing' | 'delivered' | 'sending' | 'ready'
export function channelState(status, ch) {
  if (ch === 'sms' && status?.smsChannel?.paused) return 'paused';
  const c = status?.delivery?.[ch] ?? {};
  const n = total(c);
  if (!n) return 'ready';
  if ((c.failed ?? 0) + (c.undelivered ?? 0) > 0 && (c.delivered ?? 0) + (c.sent ?? 0) === 0) return 'failing';
  if ((c.queued ?? 0) + (c.sending ?? 0) > 0) return 'sending';
  return 'delivered';
}

// The day's timetable in Ljubljana time (brief §4.3), each slot against `now`.
//   -> [{ id, at: ISO instant, local: 'HH:MM', state: 'done'|'next'|'later' }]
export function timetable(date, now) {
  if (!isTradingDay(date)) return [];
  const slot = issueSlot(date);
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const at = (d, hm) => zonedToInstant(d, hm, LJUBLJANA);
  const prev = prevTradingDay(date);
  const utcAnchor = new Date(`${date}T23:59:00Z`);
  const rows = [
    { id: 'ingest', at: at(prev, '22:15') },
    { id: 'filings', at: at(date, '01:00') },
    { id: 'universe', at: at(date, '05:30') },
    { id: 'score', at: at(date, '06:00') },
    { id: 'explain', at: at(date, '11:30') },
    { id: 'review', at: at(date, '12:00') },
    { id: 'seal', at: new Date(slot.sealAt) },
    { id: 'publish', at: new Date(slot.publishAt) },
    { id: 'fanout', at: new Date(new Date(slot.publishAt).getTime() + 10 * 60000) },
    { id: 'entry', at: new Date(slot.usOpenAt) },
    { id: 'anchor', at: utcAnchor },
  ];
  let seenNext = false;
  return rows.map((r) => {
    const done = r.at.getTime() <= t;
    let state = done ? 'done' : 'later';
    if (!done && !seenNext) {
      state = 'next';
      seenNext = true;
    }
    const lj = formatInZone(r.at, LJUBLJANA);
    return { id: r.id, at: r.at.toISOString(), local: lj.time.slice(0, 5), date: lj.date, state };
  });
}
