// Entitlements: which features a user may use, and until when. Written only by billing.js
// (from re-fetched Stripe state) and by withdrawal, dispute and deletion; read everywhere.
import { iso } from './util.js';

export const FEATURES = ['picks', 'research_data'];
export const TIER_FEATURES = { signal: ['picks'], research: ['picks', 'research_data'] };

// entitlementsFor(db, userId, now) -> { picks: {active, until, source}, research_data: {...} }
export function entitlementsFor(db, userId, now = new Date()) {
  const out = {};
  for (const f of FEATURES) out[f] = { active: false, until: null, source: null };
  if (!userId) return out;
  const rows = db.all('SELECT feature, active_until, source FROM entitlements WHERE user_id = ?', userId);
  const t = now.getTime();
  for (const r of rows) {
    out[r.feature] = {
      active: Boolean(r.active_until) && new Date(r.active_until).getTime() > t,
      until: r.active_until,
      source: r.source,
    };
  }
  return out;
}

export function isEntitled(db, userId, feature, now = new Date()) {
  return entitlementsFor(db, userId, now)[feature]?.active === true;
}

// setEntitlement(db, userId, feature, activeUntil: Date|string|null, source, now)
export function setEntitlement(db, userId, feature, activeUntil, source, now = new Date()) {
  const until = activeUntil ? iso(activeUntil) : null;
  db.run(
    `INSERT INTO entitlements (user_id, feature, active_until, source, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, feature) DO UPDATE SET active_until = excluded.active_until, source = excluded.source, updated_at = excluded.updated_at`,
    userId,
    feature,
    until,
    source,
    iso(now),
  );
}

// revokeAll(db, userId, source, now): every feature ends now.
export function revokeAll(db, userId, source, now = new Date()) {
  for (const f of FEATURES) {
    const row = db.get('SELECT active_until FROM entitlements WHERE user_id = ? AND feature = ?', userId, f);
    if (!row) continue;
    const ends = row.active_until && new Date(row.active_until) < now ? row.active_until : iso(now);
    setEntitlement(db, userId, f, ends, source, now);
  }
}
