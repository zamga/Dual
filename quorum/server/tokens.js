// Per-user unsubscribe tokens for the qrm.si/u/<token> link in every SMS: base62, unique per user.
// New tokens have 8 characters (62^8, about 2.2e14: one valid token per 4e10 guesses at 5,000
// subscribers, against about 1e7 with 6 characters); every template stays one GSM-7 segment with
// them (BUY 159/160 at worst case). Tokens of 6 or 7 characters issued earlier stay valid: they are
// in texts already delivered, and a stop link must keep working.
import { randomToken } from '../core/hash.js';
import { iso } from './util.js';
import { isUniqueError } from './db.js';

export const TOKEN_LENGTH = 8;
export const TOKEN_RE = /^[0-9A-Za-z]{6,32}$/;

// ensureUnsubscribeToken(db, userId, now) -> token (creates one on first use)
export function ensureUnsubscribeToken(db, userId, now = new Date(), gen = () => randomToken(TOKEN_LENGTH)) {
  const existing = db.get('SELECT token FROM unsubscribe_tokens WHERE user_id = ?', userId);
  if (existing) return existing.token;
  for (let attempt = 0; attempt < 20; attempt++) {
    const token = gen();
    try {
      db.run('INSERT INTO unsubscribe_tokens (token, user_id, created_at) VALUES (?, ?, ?)', token, userId, iso(now));
      return token;
    } catch (e) {
      if (!isUniqueError(e)) throw e;
      const again = db.get('SELECT token FROM unsubscribe_tokens WHERE user_id = ?', userId);
      if (again) return again.token; // another path created it
      // token collision with another user: draw again
    }
  }
  throw new Error('tokens: could not allocate a unique unsubscribe token');
}

export function userForToken(db, token) {
  if (!TOKEN_RE.test(String(token))) return null;
  return db.get(
    `SELECT t.token, t.used_at, u.* FROM unsubscribe_tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?`,
    token,
  );
}
