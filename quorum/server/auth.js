// Accounts by email magic link. The link carries a 32-byte random token; only its SHA-256 is
// stored, it expires after 15 minutes and works once. Sessions are HMAC-signed cookies that name
// a `sessions` row, so logout and account deletion revoke them server-side.
//
// A link signs in only the browser that asked for it: POST /api/auth/magic sets a short-lived
// HttpOnly `qrm_login` cookie whose hash is stored with the link, and GET /api/auth/callback signs in
// directly only when that cookie comes back. Any other browser (a second device, a mail scanner, or
// a victim sent someone else's link: login CSRF) gets a page that changes nothing and names the
// account, "Sign in as a***@example.si?", whose button POSTs the token (same-origin only).
import { randomBytes } from 'node:crypto';
import { HttpError, signValue, verifySignedValue, parseCookies, serializeCookie, appendHeader, redirect, sendHtml } from './http.js';
import { FONT_STYLESHEET } from './fonts.js';
import { newId, sha256, iso, addMs, isEmail, normEmail, normLocale, escapeHtml } from './util.js';

export const SESSION_COOKIE = 'qrm_session';
export const LOGIN_COOKIE = 'qrm_login';
const NONCE_RE = /^[A-Za-z0-9_-]{32,64}$/;

// maskEmail('ana.kovac@example.si') -> 'a***@example.si'
export function maskEmail(email) {
  const [local, domain] = String(email ?? '').split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

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

  // requestMagicLink({ email, locale, ip, browser }) -> { userId }. Creates the account on first use.
  // browser: the requesting browser's qrm_login nonce (only its SHA-256 is stored).
  async function requestMagicLink({ email, locale, ip, browser = null }) {
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
        'INSERT INTO magic_links (token_sha256, user_id, locale, created_at, expires_at, ip, browser_sha256) VALUES (?, ?, ?, ?, ?, ?, ?)',
        sha256(token),
        user.id,
        locale,
        iso(now),
        iso(addMs(now, config.magicLinkTtlMs)),
        ip,
        browser ? sha256(browser) : null,
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

  // peekMagicLink(token) -> { link, user } | null, without using the link up
  function peekMagicLink(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
    const link = db.get('SELECT * FROM magic_links WHERE token_sha256 = ?', sha256(token));
    if (!link || link.used_at || new Date(link.expires_at) <= ctx.now()) return null;
    const user = db.get('SELECT * FROM users WHERE id = ?', link.user_id);
    if (!user || user.status === 'deleted') return null;
    return { link, user };
  }

  // sameBrowser(link, req) -> true when the request carries the qrm_login cookie the link was asked with
  function sameBrowser(link, req) {
    const nonce = parseCookies(req.headers.cookie)[LOGIN_COOKIE];
    return Boolean(link.browser_sha256 && typeof nonce === 'string' && NONCE_RE.test(nonce) && sha256(nonce) === link.browser_sha256);
  }

  // loginNonce(req, res) -> the browser's qrm_login nonce (reused while valid), (re)set as a cookie
  // for the lifetime of a link, readable only by /api/auth.
  function loginNonce(req, res) {
    const have = parseCookies(req.headers.cookie)[LOGIN_COOKIE];
    const nonce = typeof have === 'string' && NONCE_RE.test(have) ? have : randomBytes(32).toString('base64url');
    appendHeader(res, 'set-cookie', serializeCookie(LOGIN_COOKIE, nonce, { maxAge: config.magicLinkTtlMs / 1000, secure, path: '/api/auth' }));
    return nonce;
  }
  function clearLoginNonce(res) {
    appendHeader(res, 'set-cookie', serializeCookie(LOGIN_COOKIE, '', { maxAge: 0, secure, path: '/api/auth' }));
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

  return { createSession, loadSession, clearCookie, revokeSessions, requestMagicLink, peekMagicLink, sameBrowser, loginNonce, clearLoginNonce, consumeMagicLink };
}

// ------------------------------------------------------------------ the confirmation page
const CONFIRM = {
  en: { title: 'Sign in to Quorum', ask: (who) => `Sign in as ${who}?`, detail: 'This link was opened in a different browser from the one that asked for it. Continue only if you asked for this link and this is your email address.', button: 'Sign in', cancel: 'Not me: back to Quorum' },
  sl: { title: 'Prijava v Quorum', ask: (who) => `Prijava kot ${who}?`, detail: 'Povezava je odprta v drugem brskalniku kot tistem, ki jo je zahteval. Nadaljujte le, če ste povezavo zahtevali sami in je to vaš e-poštni naslov.', button: 'Prijava', cancel: 'To nisem jaz: nazaj na Quorum' },
};

export function confirmSignInPage({ token, email, locale }) {
  const c = CONFIRM[locale === 'sl' ? 'sl' : 'en'];
  const who = escapeHtml(maskEmail(email));
  return `<!doctype html>
<html lang="${locale === 'sl' ? 'sl' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(c.title)} · Quorum Research</title>
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${FONT_STYLESHEET}">
<style>
:root{color-scheme:light;--karst:#e3e6e4;--paper:#f4f5f3;--graphite:#111418;--slate:#545c63;--hairline:#aeb6b9}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:var(--karst);color:var(--graphite);font:400 1.0625rem/1.5 'Archivo',ui-sans-serif,system-ui,sans-serif;display:grid;place-items:center;padding:24px 16px}
main{max-width:34rem;width:100%;background:var(--paper);border:1px solid var(--hairline);padding:32px 24px}
.brand{font-weight:700;letter-spacing:.08em;font-size:.8125rem;margin:0 0 24px}
h1{font-stretch:70%;font-weight:700;font-size:2.25rem;line-height:1.05;margin:0 0 16px;overflow-wrap:anywhere}
.mono{font-family:'Martian Mono',ui-monospace,monospace;font-size:.8em}
p{margin:0 0 16px}.muted{color:var(--slate);font-size:.9375rem}
button{font:inherit;font-weight:600;background:var(--graphite);color:var(--karst);border:0;padding:14px 20px;min-height:48px;width:100%;cursor:pointer}
button:focus-visible,a:focus-visible{outline:2px solid var(--graphite);outline-offset:2px}
a{color:var(--graphite)}
</style>
</head>
<body>
<main>
<p class="brand">QUORUM</p>
<h1>${c.ask(`<span class="mono">${who}</span>`)}</h1>
<p class="muted">${c.detail}</p>
<form method="post" action="/api/auth/callback"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">${c.button}</button></form>
<p class="muted" style="margin-top:16px"><a href="/">${c.cancel}</a></p>
</main>
</body>
</html>`;
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
      // All sign-in emails together have a budget (config.globalLimits.authEmails): past it, refuse
      // and page on-call (an address flood from many clients).
      const budget = ctx.budget('authEmails');
      if (!budget.ok) throw new HttpError(429, 'rate_limited', 'We are sending a lot of sign-in links right now. Try again in a minute.', { retryAfterSec: budget.retryAfterSec });
      // The cookie is set whatever happens next: the answer is the same with or without an account.
      const browser = ctx.auth.loginNonce(req, res);
      const existing = ctx.db.get('SELECT status FROM users WHERE email = ?', email);
      if (existing?.status !== 'deleted') await ctx.auth.requestMagicLink({ email, locale, ip, browser });
      return { ok: true, sent: true };
    },
    { accepts: ['json'], rate: 'authMagic', status: 202 },
  );

  const NO_REFERRER = { 'referrer-policy': 'no-referrer' };
  function signIn(req, res, token, ip) {
    const user = ctx.auth.consumeMagicLink(token);
    if (!user) return redirect(res, '/#join', 303, NO_REFERRER);
    const s = ctx.auth.createSession(user.id, { ip, userAgent: req.headers['user-agent'] });
    appendHeader(res, 'set-cookie', s.cookie);
    ctx.auth.clearLoginNonce(res);
    const entitled = ctx.db.get("SELECT 1 AS x FROM entitlements WHERE user_id = ? AND active_until > ?", user.id, iso(ctx.now()));
    return redirect(res, entitled ? '/#account' : '/#join', 303, NO_REFERRER);
  }

  // GET: signs in only the browser that asked for the link; anywhere else it shows the confirmation
  // page and changes nothing (so a mail scanner does not use the link up either).
  router.add(
    'GET',
    '/api/auth/callback',
    async (req, res, { query, ip }) => {
      const token = query.get('token');
      const found = ctx.auth.peekMagicLink(token);
      if (!found) return redirect(res, '/#join', 303, NO_REFERRER);
      if (req.method === 'GET' && ctx.auth.sameBrowser(found.link, req)) return signIn(req, res, token, ip);
      return sendHtml(res, 200, confirmSignInPage({ token, email: found.user.email, locale: found.link.locale }), { ...NO_REFERRER, 'x-robots-tag': 'noindex' });
    },
    { rate: 'authCallback' },
  );

  // POST (the confirmation page's button; same-origin only, like every cookie-setting POST)
  router.add(
    'POST',
    '/api/auth/callback',
    async (req, res, { body, ip }) => signIn(req, res, typeof body.token === 'string' ? body.token : '', ip),
    { accepts: ['form'], limit: 'form', rate: 'authCallback' },
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
