// Operational alerts: every alert is an ops_alerts row and a log line; severity 'page' also goes to
// on-call through the pager transport (a JSON POST to PAGER_WEBHOOK_URL, or the log only).
//   createAlerts(ctx, { pager }) -> { raise(kind, message, { severity, detail, dedupeKey, dedupeMs }), recent(limit) }
//   createWebhookPager({ url, fetch }) / createConsolePager({ log }) -> { kind, page(alert) }
import { iso } from './util.js';

export function createConsolePager({ log = console } = {}) {
  const pages = [];
  return {
    kind: 'console',
    pages,
    async page(alert) {
      pages.push(alert);
      (log.error ?? console.error)(`[page] ${alert.kind}: ${alert.message}`);
      return { ok: true };
    },
  };
}

export function createWebhookPager({ url, fetch = globalThis.fetch, log = console } = {}) {
  return {
    kind: 'webhook',
    async page(alert) {
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: 'quorum', ...alert }) });
        return { ok: res.ok };
      } catch (e) {
        (log.error ?? console.error)(`[page] webhook failed: ${e.message}`);
        return { ok: false };
      }
    },
  };
}

export function createAlerts(ctx, { pager } = {}) {
  const { db } = ctx;
  const sink = pager ?? createConsolePager({ log: ctx.log });

  // raise(...) -> { id, deduped }. Synchronous row write; the page itself is sent in the background
  // (it must never block a send loop or a status callback).
  function raise(kind, message, { severity = 'warn', detail = null, dedupeKey = null, dedupeMs = 30 * 60_000 } = {}) {
    const now = ctx.now();
    if (dedupeKey) {
      const since = iso(new Date(now.getTime() - dedupeMs));
      const hit = db.get('SELECT id FROM ops_alerts WHERE dedupe_key = ? AND created_at >= ? ORDER BY id DESC LIMIT 1', dedupeKey, since);
      if (hit) return { id: hit.id, deduped: true };
    }
    const id = db.run(
      'INSERT INTO ops_alerts (kind, severity, message, detail_json, dedupe_key, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      kind,
      severity,
      message,
      detail ? JSON.stringify(detail) : null,
      dedupeKey,
      iso(now),
    ).lastInsertRowid;
    const line = `[alert:${severity}] ${kind}: ${message}`;
    if (severity === 'info') ctx.log.info(line);
    else ctx.log.warn(line);
    if (severity === 'page') {
      const alert = { id, kind, severity, message, detail, at: iso(now) };
      Promise.resolve(sink.page(alert))
        .then(() => db.run('UPDATE ops_alerts SET paged_at = ? WHERE id = ?', iso(ctx.now()), id))
        .catch((e) => ctx.log.error(`[alert] page failed: ${e.message}`));
    }
    return { id, deduped: false };
  }

  function recent(limit = 50) {
    return db.all('SELECT id, kind, severity, message, created_at, paged_at, acknowledged_at FROM ops_alerts ORDER BY id DESC LIMIT ?', limit);
  }

  return { raise, recent, pager: sink };
}
