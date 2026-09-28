// Accounts by email magic link. The link carries a 32-byte random token; only its SHA-256 is
// stored, it expires after 15 minutes and works once. Sessions are HMAC-signed cookies that name
// a `sessions` row, so logout and account deletion revoke them server-side.
import { randomBytes } from 'node:crypto';
import { HttpError, signValue, verifySignedValue, parseCookies, serializeCookie, appendHeader, redirect } from './http.js';
import { newId, sha256, iso, addMs, isEmail, normEmail, normLocale } from './util.js';

export const SESSION_COOKIE = 'qrm_session';

export function createAuth(ctx) {
  const { db, config } = ctx;
  const secure = config.publicBaseUrl.startsWith('https://');

  function createSession(userId, { ip = null, userAgent = null } = {}) {
    const now = ctx.now();
    const id = newId('ses');
    const expires = addMs(now, config.sessionTtlMs);
    db.run(
      'INSERT INTO sessions (id, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      userId,
      iso(now),
      iso(expires),
      ip,
      userAgent ? String(userAgent).slice(0, 512) : null,
    );
    const token = signValue({ sid: id, uid: userId, exp: expires.getTime() }, config.sessionSecret);
    return { id, token, cookie: serializeCookie(SESSION_COOKIE, token, { maxAge: config.sessionTtlMs / 1000, secure }) };
  }

  // loadSession(req) -> { session, user } | null
  function loadSession(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const now = ctx.now();
    const payload = verifySignedValue(token, config.sessionSecret, now.getTime());
    if (!payload?.sid) return null;
    const session = db.get('SELECT * FROM sessions WHERE id = ?', payload.sid);
    if (!session || session.revoked_at || session.user_id !== payload.uid || new Date(session.expires_at) <= now) return null;
    const user = db.get('SELECT * FROM users WHERE id = ?', session.user_id);
    if (!user || user.status === 'deleted') return null;
    return { session, user };
  }

  function clearCookie() {
    return serializeCookie(SESSION_COOKIE, '', { maxAge: 0, secure });
  }

  function revokeSessions(userId) {
    db.run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', iso(ctx.now()), userId);
  }

  // requestMagicLink({ email, locale, ip }) -> { userId }. Creates the account on first use.
  async function requestMagicLink({ email, locale, ip }) {
    const now = ctx.now();
    const token = randomBytes(32).toString('base64url');
    const userId = db.tx(() => {
      let user = db.get('SELECT id, status FROM users WHERE email = ?', email);
      if (!user) {
        const id = newId('usr');
        db.run('INSERT INTO users (id, email, locale, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', id, email, locale, 'pending', iso(now), iso(now));
        user = { id };
      }
      db.run(
        'INSERT INTO magic_links (token_sha256, user_id, locale, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?, ?)',
        sha256(token),
        user.id,
        locale,
        iso(now),
        iso(addMs(now, config.magicLinkTtlMs)),
        ip,
      );
      return user.id;
    });
    const link = `${config.publicBaseUrl}/api/auth/callback?token=${token}`;
    const minutes = Math.round(config.magicLinkTtlMs / 60000);
    const subject = locale === 'sl' ? 'Vaša povezava za prijavo v Quorum' : 'Your Quorum sign-in link';
    const text =
      locale === 'sl'
        ? `Za prijavo v Quorum odprite to povezavo:\n\n${link}\n\nPovezava velja ${minutes} minut in deluje enkrat. Če prijave niste zahtevali, to sporočilo prezrite.`
        : `Open this link to sign in to Quorum:\n\n${link}\n\nThe link works once and expires in ${minutes} minutes. If you did not ask to sign in, ignore this email.`;
    // Sent directly, never stored: the body holds a live credential.
    await ctx.email.send({ to: email, subject, text, tag: 'MAGIC_LINK', link });
    return { userId };
  }

  // consumeMagicLink(token) -> user | null
  function consumeMagicLink(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
    const now = ctx.now();
    return db.tx(() => {
      const row = db.get('SELECT * FROM magic_links WHERE token_sha256 = ?', sha256(token));
      if (!row || row.used_at || new Date(row.expires_at) <= now) return null;
      db.run('UPDATE magic_links SET used_at = ? WHERE token_sha256 = ? AND used_at IS NULL', iso(now), row.token_sha256);
      const user = db.get('SELECT * FROM users WHERE id = ?', row.user_id);
      if (!user || user.status === 'deleted') return null;
      if (!user.email_verified_at) db.run('UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?', iso(now), iso(now), user.id);
      return user;
    });
  }

  return { createSession, loadSession, clearCookie, revokeSessions, requestMagicLink, consumeMagicLink };
}

// Routes: POST /api/auth/magic, GET /api/auth/callback, POST /api/auth/logout
export function registerAuthRoutes(router, ctx) {
  router.add(
    'POST',
    '/api/auth/magic',
    async (req, res, { body, ip }) => {
      const email = normEmail(body?.email);
      if (!isEmail(email)) throw new HttpError(400, 'invalid_email', 'Enter a valid email address.');
      const locale = normLocale(body?.locale);
      const perEmail = ctx.rateLimiter.take('authMagicEmail', email, ctx.config.rateLimits.authMagicEmail);
      if (!perEmail.ok) throw new HttpError(429, 'rate_limited', 'Too many sign-in links for this address. Try again later.', { retryAfterSec: perEmail.retryAfterSec });
      const existing = ctx.db.get('SELECT status FROM users WHERE email = ?', email);
      if (existing?.status !== 'deleted') await ctx.auth.requestMagicLink({ email, locale, ip });
      // Same answer whether or not the address has an account.
      return { ok: true, sent: true };
    },
    { accepts: ['json'], rate: 'authMagic', status: 202 },
  );

  router.add(
    'GET',
    '/api/auth/callback',
    async (req, res, { query, ip }) => {
      const user = ctx.auth.consumeMagicLink(query.get('token'));
      if (!user) return redirect(res, '/#join', 303, { 'referrer-policy': 'no-referrer' });
      const s = ctx.auth.createSession(user.id, { ip, userAgent: req.headers['user-agent'] });
      appendHeader(res, 'set-cookie', s.cookie);
      const entitled = ctx.db.get("SELECT 1 AS x FROM entitlements WHERE user_id = ? AND active_until > ?", user.id, iso(ctx.now()));
      return redirect(res, entitled ? '/#account' : '/#join', 303, { 'referrer-policy': 'no-referrer' });
    },
    { rate: 'authCallback' },
  );

  router.add(
    'POST',
    '/api/auth/logout',
    async (req, res, { session }) => {
      if (session) ctx.db.run('UPDATE sessions SET revoked_at = ? WHERE id = ?', iso(ctx.now()), session.id);
      appendHeader(res, 'set-cookie', ctx.auth.clearCookie());
      return { ok: true };
    },
    { accepts: ['json'] },
  );
}
