// The daily timetable of brief §4.3 in Europe/Ljubljana, on US trading days only (core/calendar.js),
// DST-correct in both zones (the US open is 15:30 local, or 14:30 in the weeks when the EU and US
// clock changes differ). SCHEDULER=on starts it with the server; the clock is injected.
//
//   slot        local time        what                                   if the slot was missed
//   candidates  06:00             engine output -> candidates            runs late until 13:40
//   explain     11:30             Claude veto scan + thesis drafts       runs late until 13:40
//   review      13:40             approver window closes                 folded into the seal
//   seal        13:45             BUY/RENEW sealed into the ledger       after 13:59:59: nothing is sealed
//   publish     14:00:00          ISSUE published, fan-out (paced)       after 14:10: web issue only, no
//                                                                        texts, push or email (never caught up)
//   marks       US open + 1 min   entry and exit opens, CLOSE reveals    runs late
//   anchor      23:59 UTC         Merkle root, OpenTimestamps, RFC 3161  runs late
//   weekly      Sunday 18:00      weekly Ledger email (no SMS)           after 21:00: skipped
//
//   createScheduler(ctx, { publisher, notifier, source }) -> { tick(now?), start(), stop(), slotsFor, due }
//   source = { getDay(date) -> publisher input | null, getMarketData(date) -> { entryOpen, exits } | null }
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isTradingDay, issueSlot, zonedToInstant, formatInZone, addDays, weekday, LJUBLJANA } from '../core/calendar.js';
import { adaptEngineDay, PIPELINE_TIMES } from './publisher.js';
import { iso } from './util.js';

const at = (date, time) => zonedToInstant(date, time, LJUBLJANA);
const RETRY_MS = 5 * 60_000;

// slotsFor(date) -> the pipeline slots of one US trading day (empty on other days), plus the
// weekly email on Sundays. Each: { slot, date, at, deadline }.
export function slotsFor(date) {
  const out = [];
  if (isTradingDay(date)) {
    const usOpen = new Date(issueSlot(date).usOpenAt);
    const reviewCloses = at(date, PIPELINE_TIMES.reviewCloses);
    out.push(
      { slot: 'candidates', date, at: at(date, PIPELINE_TIMES.candidates), deadline: reviewCloses },
      { slot: 'explain', date, at: at(date, PIPELINE_TIMES.explain), deadline: reviewCloses },
      { slot: 'review', date, at: reviewCloses, deadline: at(date, PIPELINE_TIMES.seal) },
      { slot: 'seal', date, at: at(date, PIPELINE_TIMES.seal), deadline: at(date, '13:59:59') },
      { slot: 'publish', date, at: at(date, '14:00:00'), deadline: at(date, '14:10:00') },
      { slot: 'marks', date, at: new Date(usOpen.getTime() + 60_000), deadline: null },
      { slot: 'anchor', date, at: new Date(`${date}T23:59:00Z`), deadline: null },
    );
  }
  if (weekday(date) === 0) out.push({ slot: 'weekly', date, at: at(date, '18:00'), deadline: at(date, '21:00') });
  return out;
}

// A directory source: ENGINE_DAY_DIR/<date>.json holds either the publisher input or the engine's
// raw day ({ issue, picks, candidates?, persons }); <date>.market.json optionally holds the opens.
export function createDirSource(dir) {
  const read = async (name) => {
    try {
      return JSON.parse(await readFile(join(dir, name), 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  };
  return {
    async getDay(date) {
      const j = await read(`${date}.json`);
      if (!j) return null;
      return Array.isArray(j.candidates) && j.date ? j : adaptEngineDay(j);
    },
    async getMarketData(date) {
      return (await read(`${date}.market.json`)) ?? (await this.getDay(date))?.marketData ?? null;
    },
  };
}

export function createScheduler(ctx, { publisher, notifier, source = null } = {}) {
  const { db } = ctx;
  let timer = null;
  let running = null;

  function row(date, slot) {
    return db.get('SELECT * FROM scheduler_runs WHERE issue_date = ? AND slot = ?', date, slot);
  }
  function epoch(now) {
    let e = db.getSetting('scheduler_epoch');
    if (!e) {
      e = iso(now);
      db.setSetting('scheduler_epoch', e, e);
    }
    return new Date(e);
  }

  // due(now) -> slots whose time has come and which have not run (or failed and may retry), oldest first.
  function due(now = ctx.now()) {
    const since = epoch(now);
    const today = formatInZone(now, LJUBLJANA).date;
    const dates = [addDays(today, -2), addDays(today, -1), today];
    const out = [];
    for (const d of dates) {
      for (const s of slotsFor(d)) {
        if (s.at > now || s.at < since) continue;
        const r = row(d, s.slot);
        if (!r) out.push(s);
        else if (r.status === 'failed' && (!s.deadline || now <= s.deadline) && now - new Date(r.started_at) >= RETRY_MS) out.push({ ...s, retry: true });
      }
    }
    return out.sort((a, b) => a.at - b.at);
  }

  function begin(s, now) {
    const r = db.run(
      `INSERT INTO scheduler_runs (issue_date, slot, due_at, status, started_at) VALUES (?, ?, ?, 'running', ?)
       ON CONFLICT(issue_date, slot) DO UPDATE SET status = 'running', started_at = excluded.started_at, finished_at = NULL
       WHERE scheduler_runs.status = 'failed'`,
      s.date,
      s.slot,
      iso(s.at),
      iso(now),
    );
    return r.changes === 1;
  }
  function end(s, status, detail) {
    db.run('UPDATE scheduler_runs SET status = ?, detail = ?, finished_at = ? WHERE issue_date = ? AND slot = ?', status, detail == null ? null : String(detail).slice(0, 4000), iso(ctx.now()), s.date, s.slot);
  }

  async function runSlot(s, now) {
    const late = s.deadline && now > s.deadline;
    const d = s.date;
    switch (s.slot) {
      case 'candidates': {
        if (late) return ['missed', 'engine output not loaded before the review closed'];
        const input = source ? await source.getDay(d) : null;
        if (!input) {
          ctx.alerts?.raise('engine_output_missing', `No engine output for ${d} at ${formatInZone(now, LJUBLJANA).time}`, { severity: 'page', dedupeKey: `engine:${d}` });
          return ['failed', 'engine output missing'];
        }
        return ['ok', publisher.writeCandidates(input)];
      }
      case 'explain':
        if (late) return ['missed', 'explainer did not run before the review closed; candidates go to the approver'];
        if (!publisher.run(d)) return ['skipped', 'no candidates'];
        return ['ok', await publisher.explain(d)];
      case 'review':
        if (!publisher.run(d)) return ['skipped', 'no candidates'];
        if (late) return ['missed', 'folded into the seal slot'];
        return ['ok', publisher.closeReview(d)];
      case 'seal':
        if (!publisher.run(d)) return ['skipped', 'no candidates'];
        if (late) {
          ctx.alerts?.raise('seal_missed', `The ${d} seal slot was missed: nothing is issued today`, { severity: 'page', dedupeKey: `seal:${d}` });
          return ['missed', publisher.skipSeal(d, 'seal slot missed')];
        }
        return ['ok', await publisher.seal(d)];
      case 'publish': {
        const r = publisher.run(d);
        if (r && !['sealed', 'published', 'marked', 'anchored'].includes(r.stage)) publisher.skipSeal(d, 'not sealed by 14:00');
        const res = await publisher.publish(d, { late: Boolean(late) });
        let delivery = null;
        if (!late && notifier && !res.skipped) delivery = await notifier.deliverIssue(d);
        return [late ? 'missed' : 'ok', { issueNo: res.issueNo, late: Boolean(late), items: res.items?.length ?? 0, delivery: delivery?.counts ?? null }];
      }
      case 'marks': {
        const r = publisher.run(d);
        if (!r || !['published'].includes(r.stage)) return ['skipped', `stage ${r?.stage ?? 'none'}`];
        const market = source ? await source.getMarketData(d) : null;
        return ['ok', await publisher.recordOpens(d, market ?? {})];
      }
      case 'anchor':
        return ['ok', await publisher.anchor(d)];
      case 'weekly':
        if (late) return ['missed', 'weekly email not sent by 21:00'];
        return ['ok', await notifier.weeklyLedger(d)];
      default:
        return ['skipped', 'unknown slot'];
    }
  }

  // tick(now) -> [{ slot, date, status }]. Runs every due slot once, in time order.
  async function tick(now = ctx.now()) {
    if (running) return running;
    running = (async () => {
      const done = [];
      for (const s of due(now)) {
        if (!begin(s, ctx.now())) continue;
        try {
          const [status, detail] = await runSlot(s, ctx.now());
          end(s, status, typeof detail === 'string' ? detail : JSON.stringify(detail));
          done.push({ slot: s.slot, date: s.date, status });
          if (status === 'missed') ctx.log.warn(`[scheduler] ${s.date} ${s.slot} missed`);
        } catch (e) {
          end(s, 'failed', e.message);
          ctx.alerts?.raise('slot_failed', `${s.date} ${s.slot} failed: ${e.message}`, { severity: 'page', dedupeKey: `slot:${s.date}:${s.slot}` });
          done.push({ slot: s.slot, date: s.date, status: 'failed', error: e.message });
        }
      }
      return done;
    })();
    try {
      return await running;
    } finally {
      running = null;
    }
  }

  // nextAt(now) -> the next instant a slot becomes due (for the timer).
  function nextAt(now = ctx.now()) {
    const today = formatInZone(now, LJUBLJANA).date;
    for (let k = 0; k < 10; k++) {
      const next = slotsFor(addDays(today, k)).map((s) => s.at).filter((t) => t > now).sort((a, b) => a - b)[0];
      if (next) return next;
    }
    return new Date(now.getTime() + 3600_000);
  }

  function start() {
    if (ctx.config.scheduler !== 'on' || timer) return false;
    const loop = async () => {
      try {
        await tick(ctx.now());
      } catch (e) {
        ctx.log.error(`[scheduler] ${e.message}`);
      }
      const wait = Math.max(250, Math.min(30_000, nextAt(ctx.now()).getTime() - ctx.now().getTime()));
      timer = setTimeout(loop, wait);
      timer.unref?.();
    };
    timer = setTimeout(loop, 0);
    timer.unref?.();
    return true;
  }

  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  return { tick, due, start, stop, slotsFor, nextAt };
}

// node server/scheduler.js 2026-10-26 2026-10-27 ...  prints each day's slots in Ljubljana and UTC
// (a quick check around the clock changes; see docs/OPERATIONS.md, "Clock and DST").
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dates = process.argv.slice(2);
  if (!dates.length) dates.push(formatInZone(new Date(), LJUBLJANA).date);
  for (const d of dates) {
    const slots = slotsFor(d);
    console.log(`${d}${slots.length ? '' : '  (no US trading day, no Sunday email)'}`);
    for (const s of slots) console.log(`  ${s.slot.padEnd(11)} ${formatInZone(s.at, LJUBLJANA).iso}  ${s.at.toISOString()}`);
  }
}
