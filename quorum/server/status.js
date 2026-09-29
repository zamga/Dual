// GET /api/status — today's issue and its delivery status per channel. Counts only: no tickers of
// open picks, no numbers, no addresses, nothing about any person.
//   { simulated, now, issue: { date, issueNo, publishedAt, late, quorum, items: {buys, renews, closes},
//     nScored, closest } | null, nextIssueAt, delivery: { sms, push, email } (counts by status),
//     fanout: { startedAt, finishedAt, seconds } | null, smsChannel: { paused }, anchor }
import { nextIssueSlot } from '../core/calendar.js';
import { iso } from './util.js';

const STATUSES = ['queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'cancelled'];

export function statusFor(ctx, now = ctx.now()) {
  const { db } = ctx;
  const nowIso = iso(now);
  const run = db
    .all("SELECT * FROM issue_runs WHERE published_at IS NOT NULL ORDER BY issue_date DESC LIMIT 5")
    .find((r) => new Date(r.published_at) <= now);
  let issue = null;
  const delivery = { sms: {}, push: {}, email: {} };
  for (const ch of Object.keys(delivery)) for (const st of STATUSES) delivery[ch][st] = 0;
  let fanout = null;
  if (run) {
    const items = safe(run.items_json) ?? {};
    const body = safe(db.get("SELECT body_json FROM ledger_entries WHERE type = 'ISSUE' AND issue_date = ? ORDER BY seq DESC LIMIT 1", run.issue_date)?.body_json) ?? {};
    issue = {
      date: run.issue_date,
      issueNo: items.issueNo ?? body.issueNo ?? null,
      publishedAt: run.published_at,
      late: Boolean(run.late),
      quorum: (body.buys?.length ?? 0) + (body.renews?.length ?? 0) > 0,
      items: { buys: body.buys?.length ?? 0, renews: body.renews?.length ?? 0, closes: body.closes?.length ?? 0 },
      nScored: body.nScored ?? null,
      closest: body.closest ?? null,
    };
    const recIds = (items.items ?? []).map((x) => x.recId).filter((x) => x != null);
    if (recIds.length) {
      for (const r of db.all(`SELECT channel, status, COUNT(*) AS n FROM notifications WHERE rec_id IN (${recIds.map(() => '?').join(',')}) GROUP BY channel, status`, ...recIds)) {
        if (delivery[r.channel]) delivery[r.channel][r.status] = r.n;
      }
    }
    const d = safe(run.delivery_json);
    if (d) fanout = { startedAt: d.startedAt, finishedAt: d.finishedAt, seconds: d.seconds };
  }
  const a = db.get('SELECT date, merkle_root, ots_proof, rfc3161_token, row_count FROM ledger_anchors ORDER BY date DESC LIMIT 1');
  return {
    simulated: true,
    now: nowIso,
    issue,
    nextIssueAt: nextIssueSlot(now).publishAt,
    delivery,
    fanout,
    smsChannel: { paused: db.getSetting('sms_paused') === '1' },
    anchor: a ? { date: a.date, merkleRoot: a.merkle_root, rows: a.row_count, ots: safe(a.ots_proof)?.status ?? null, rfc3161: safe(a.rfc3161_token)?.status ?? null } : null,
  };
}

function safe(s) {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function registerStatusRoute(router, ctx) {
  router.add('GET', '/api/status', async () => statusFor(ctx), { rate: 'status' });
}
