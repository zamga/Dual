// One-tap SMS opt-out (brief §2.7, §4.4). GET /u/:token shows a confirmation page and changes
// nothing (link scanners and previews fetch it). POST /u/:token opts the user out of all SMS at
// once: a consent revoke event, an opt_outs row, the SMS channel off, and exactly one OPT_OUT
// confirmation text. Our database is the source of truth; Twilio's opt-out list cannot be queried.
import { renderSms } from '../core/sms-templates.js';
import { latestConsent, recordConsent } from './consent.js';
import { userForToken, TOKEN_RE } from './tokens.js';
import { sendHtml, sendJson, mediaType } from './http.js';
import { escapeHtml, iso } from './util.js';

export function createOptOut(ctx) {
  const { db } = ctx;

  // optOutSms(userId, { source, channel, ip, userAgent, pageUrl, locale, confirm = true })
  //   -> { changed, alreadyOff, confirmationQueued }
  async function optOutSms(userId, { source, channel = 'web', ip = null, userAgent = null, pageUrl = null, locale = null, token = null, confirm = true } = {}) {
    const now = ctx.now();
    let result = { changed: false, alreadyOff: true, confirmationQueued: false };
    let dispatchId = null;
    db.tx(() => {
      const user = db.get('SELECT id, locale FROM users WHERE id = ?', userId);
      if (!user) return;
      const grant = latestConsent(db, userId, 'sms');
      const prefs = db.get('SELECT sms FROM channel_prefs WHERE user_id = ?', userId);
      db.run(
        `INSERT INTO channel_prefs (user_id, sms, updated_at) VALUES (?, 0, ?)
         ON CONFLICT(user_id) DO UPDATE SET sms = 0, updated_at = excluded.updated_at`,
        userId,
        iso(now),
      );
      if (token) db.run('UPDATE unsubscribe_tokens SET used_at = COALESCE(used_at, ?) WHERE token = ?', iso(now), token);
      if (grant?.action !== 'grant' && !prefs?.sms) return; // already off: nothing to record, nothing to send

      recordConsent(db, {
        userId,
        kind: 'sms',
        action: 'revoke',
        version: grant?.text_version ?? null,
        sha256: grant?.text_sha256 ?? null,
        ip,
        userAgent,
        pageUrl,
        locale: locale ?? user.locale,
        channel,
        now,
      });
      db.run('INSERT INTO opt_outs (user_id, channel, source, created_at) VALUES (?, ?, ?, ?)', userId, 'sms', source, iso(now));
      result = { changed: true, alreadyOff: false, confirmationQueued: false };

      // One confirmation per opt-out of a grant, only to a reachable number that has had texts from
      // us before, and never when the carrier told us the person blocked us.
      const phone = db.get('SELECT e164, country, verified_at, invalid_at FROM phone_numbers WHERE user_id = ?', userId);
      const everTexted = db.get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND channel = 'sms' AND status IN ('sent', 'delivered') LIMIT 1", userId);
      if (confirm && source !== 'twilio' && source !== 'deletion' && phone?.verified_at && !phone.invalid_at && everTexted) {
        const q = ctx.messaging.queue({
          userId,
          channel: 'sms',
          kind: 'OPT_OUT',
          to: phone.e164,
          body: renderSms('OPT_OUT', user.locale === 'sl' ? 'sl' : 'en', {}),
          idemKey: `OPT_OUT:${userId}:${grant?.id ?? 'none'}`,
          country: phone.country,
        });
        if (q.created) {
          dispatchId = q.id;
          result.confirmationQueued = true;
        }
      }
    });
    if (dispatchId != null) await ctx.messaging.dispatch([dispatchId]);
    return result;
  }

  return { optOutSms };
}

// ------------------------------------------------------------------ pages
const COPY = {
  en: {
    title: 'Stop text alerts',
    ask: 'Stop all Quorum text alerts to this phone?',
    detail: 'One tap switches off every SMS from Quorum. Your subscription, email and push notifications stay as they are.',
    button: 'Stop text alerts',
    doneTitle: 'Text alerts are off',
    done: 'We will not text this number again. You get one text confirming this. Your subscription is unchanged.',
    already: 'Text alerts for this number are already off. Your subscription is unchanged.',
    account: 'Manage your account',
    notFoundTitle: 'Link not recognised',
    notFound: 'This stop link is not valid. If you still get texts, write to',
  },
  sl: {
    title: 'Odjava od SMS-obvestil',
    ask: 'Želite izklopiti vsa SMS-obvestila Quorum na ta telefon?',
    detail: 'En dotik izklopi vse SMS-e Quoruma. Naročnina, e-pošta in potisna obvestila ostanejo nespremenjeni.',
    button: 'Izklopi SMS-obvestila',
    doneTitle: 'SMS-obvestila so izklopljena',
    done: 'Na to številko vam ne bomo več pošiljali SMS-ov. Prejeli boste en SMS s potrditvijo. Naročnina ostaja nespremenjena.',
    already: 'SMS-obvestila za to številko so že izklopljena. Naročnina ostaja nespremenjena.',
    account: 'Upravljanje računa',
    notFoundTitle: 'Povezava ni prepoznana',
    notFound: 'Ta povezava za odjavo ni veljavna. Če še vedno prejemate SMS-e, pišite na',
  },
};

function page({ locale, title, body }) {
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · Quorum Research</title>
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap">
<style>
:root{color-scheme:light;--karst:#e3e6e4;--paper:#f4f5f3;--graphite:#111418;--slate:#545c63;--hairline:#aeb6b9}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:var(--karst);color:var(--graphite);font:400 1.0625rem/1.5 'Archivo',ui-sans-serif,system-ui,sans-serif;display:grid;place-items:center;padding:24px 16px}
main{max-width:34rem;width:100%;background:var(--paper);border:1px solid var(--hairline);padding:32px 24px}
.brand{font-weight:700;letter-spacing:.08em;font-size:.8125rem;margin:0 0 24px}
h1{font-stretch:70%;font-weight:700;font-size:2.25rem;line-height:1.05;margin:0 0 16px}
p{margin:0 0 16px;color:var(--graphite)}
.muted{color:var(--slate);font-size:.9375rem}
button{font:inherit;font-weight:600;background:var(--graphite);color:var(--karst);border:0;padding:14px 20px;min-height:48px;width:100%;cursor:pointer}
button:focus-visible,a:focus-visible{outline:2px solid var(--graphite);outline-offset:2px}
a{color:var(--graphite)}
hr{border:0;border-top:1px solid var(--hairline);margin:24px 0}
</style>
</head>
<body>
<main>
<p class="brand">QUORUM</p>
${body}
</main>
</body>
</html>`;
}

const HEADERS = { 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex' };

function renderNotFound(ctx) {
  const support = escapeHtml(ctx.config.supportEmail);
  return page({
    locale: 'en',
    title: COPY.en.notFoundTitle,
    body: `<h1>${COPY.en.notFoundTitle}</h1><p>${COPY.en.notFound} <span>${support}</span>.</p><hr><h1 lang="sl">${COPY.sl.notFoundTitle}</h1><p lang="sl">${COPY.sl.notFound} <span>${support}</span>.</p>`,
  });
}

function wantsJson(req) {
  return mediaType(req) === 'application/json' || /application\/json/.test(String(req.headers.accept || ''));
}

// Routes: GET /u/:token (no state change) and POST /u/:token (one-tap opt-out)
export function registerOptOutRoutes(router, ctx) {
  router.add(
    'GET',
    '/u/:token',
    async (req, res, { params }) => {
      const row = TOKEN_RE.test(params.token) ? userForToken(ctx.db, params.token) : null;
      if (!row || row.status === 'deleted') return sendHtml(res, 404, renderNotFound(ctx), HEADERS);
      const locale = row.locale === 'sl' ? 'sl' : 'en';
      const c = COPY[locale];
      const on = ctx.messaging.smsState(row.id).allowed || latestConsent(ctx.db, row.id, 'sms')?.action === 'grant';
      const body = on
        ? `<h1>${c.ask}</h1><p class="muted">${c.detail}</p><form method="post" action="/u/${escapeHtml(params.token)}"><button type="submit">${c.button}</button></form>`
        : `<h1>${c.doneTitle}</h1><p>${c.already}</p><p><a href="/#account">${c.account}</a></p>`;
      return sendHtml(res, 200, page({ locale, title: c.title, body }), HEADERS);
    },
    { rate: 'optout' },
  );

  router.add(
    'POST',
    '/u/:token',
    async (req, res, { params, ip }) => {
      const row = TOKEN_RE.test(params.token) ? userForToken(ctx.db, params.token) : null;
      if (!row || row.status === 'deleted') {
        if (wantsJson(req)) return sendJson(res, 404, { error: 'not_found', message: 'Unknown link' }, HEADERS);
        return sendHtml(res, 404, renderNotFound(ctx), HEADERS);
      }
      const r = await ctx.optout.optOutSms(row.id, {
        source: 'link',
        channel: 'sms_link',
        ip,
        userAgent: req.headers['user-agent'],
        pageUrl: `${ctx.config.linkBase}/u/${params.token}`,
        token: params.token,
      });
      if (wantsJson(req)) return sendJson(res, 200, { ok: true, smsOff: true, changed: r.changed }, HEADERS);
      const locale = row.locale === 'sl' ? 'sl' : 'en';
      const c = COPY[locale];
      const body = `<h1>${c.doneTitle}</h1><p>${r.changed ? c.done : c.already}</p><p><a href="/#account">${c.account}</a></p>`;
      return sendHtml(res, 200, page({ locale, title: c.doneTitle, body }), HEADERS);
    },
    { accepts: ['form', 'json', 'empty'], limit: 'form', rate: 'optout', csrf: false },
  );
}
