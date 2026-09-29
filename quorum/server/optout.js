// One-tap SMS opt-out (brief §2.7, §4.4). GET /u/:token shows a confirmation page and changes
// nothing (link scanners and previews fetch it). POST /u/:token opts the user out of all SMS at
// once: a consent revoke event, an opt_outs row, the SMS channel off, and exactly one OPT_OUT
// confirmation text. Our database is the source of truth; Twilio's opt-out list cannot be queried.
//
// The pages are no validity oracle: GET answers the same bilingual page for every token, and POST
// answers an unknown token exactly as it answers a known one whose texts are already off (only a
// POST that really switched texts off says so, and that one has already done its work). Unknown
// tokens count against a global budget that pages on-call when someone scans for valid ones.
import { renderSms } from '../core/sms-templates.js';
import { latestConsent, recordConsent } from './consent.js';
import { userForToken, TOKEN_RE } from './tokens.js';
import { sendHtml, sendJson, mediaType } from './http.js';
import { FONT_STYLESHEET } from './fonts.js';
import { escapeHtml, iso } from './util.js';

export function createOptOut(ctx) {
  const { db } = ctx;

  // optOutSms(userId, { source, channel, ip, userAgent, pageUrl, locale, confirm = true, background = false })
  //   -> { changed, alreadyOff, confirmationQueued }
  // background: the confirmation text is sent without waiting for the provider (the link page
  // answers in the same time whatever the token was).
  async function optOutSms(userId, { source, channel = 'web', ip = null, userAgent = null, pageUrl = null, locale = null, token = null, confirm = true, background = false } = {}) {
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
    if (dispatchId != null) {
      const sent = ctx.messaging.dispatch([dispatchId]);
      if (background) sent.catch((e) => ctx.log.error(`[optout] confirmation ${dispatchId}: ${e.message}`));
      else await sent;
    }
    return result;
  }

  return { optOutSms };
}

// ------------------------------------------------------------------ pages
// Every page is bilingual (EN, then SL): the language must not depend on whose token it is.
const COPY = {
  en: {
    title: 'Stop text alerts',
    ask: 'Stop all Quorum text alerts to this phone?',
    detail: 'One tap switches off every SMS from Quorum. Your subscription, email and push notifications stay as they are.',
    button: 'Stop text alerts',
    doneTitle: 'Text alerts are off',
    done: 'We will not text this number again. One text confirms it, then nothing. Your subscription is unchanged.',
    already: 'Nothing more to do: Quorum sends no text alerts for this link. Your subscription is unchanged.',
    account: 'Manage your account',
    help: 'Still getting texts? Write to',
  },
  sl: {
    title: 'Odjava od SMS-obvestil',
    ask: 'Želite izklopiti vsa SMS-obvestila Quorum na ta telefon?',
    detail: 'En dotik izklopi vse SMS-e Quoruma. Naročnina, e-pošta in potisna obvestila ostanejo nespremenjeni.',
    button: 'Izklopi SMS-obvestila',
    doneTitle: 'SMS-obvestila so izklopljena',
    done: 'Na to številko ne bomo več pošiljali SMS-ov. En SMS to potrdi, nato nič več. Naročnina ostaja nespremenjena.',
    already: 'Ničesar več ni treba storiti: Quorum za to povezavo ne pošilja SMS-obvestil. Naročnina ostaja nespremenjena.',
    account: 'Upravljanje računa',
    help: 'Še vedno prejemate SMS-e? Pišite na',
  },
};

function page({ title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · Quorum Research</title>
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${FONT_STYLESHEET}">
<style>
:root{color-scheme:light;--karst:#e3e6e4;--paper:#f4f5f3;--graphite:#111418;--slate:#545c63;--hairline:#aeb6b9}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:var(--karst);color:var(--graphite);font:400 1.0625rem/1.5 'Archivo',ui-sans-serif,system-ui,sans-serif;display:grid;place-items:center;padding:24px 16px}
main{max-width:34rem;width:100%;background:var(--paper);border:1px solid var(--hairline);padding:32px 24px}
.brand{font-weight:700;letter-spacing:.08em;font-size:.8125rem;margin:0 0 24px}
h1{font-stretch:70%;font-weight:700;font-size:2.25rem;line-height:1.05;margin:0 0 16px}
h2{font-stretch:70%;font-weight:700;font-size:1.5rem;line-height:1.1;margin:0 0 12px}
p{margin:0 0 16px;color:var(--graphite)}
.muted{color:var(--slate);font-size:.9375rem}
button{font:inherit;font-weight:600;background:var(--graphite);color:var(--karst);border:0;padding:14px 20px;min-height:48px;width:100%;cursor:pointer}
button span{display:block}button span+span{font-weight:400;font-size:.9375rem}
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

// The confirmation page (GET): the same for every token.
function renderAsk(token) {
  const { en, sl } = COPY;
  return page({
    title: `${en.title} · ${sl.title}`,
    body: `<h1>${en.ask}</h1><p class="muted">${en.detail}</p>
<h2 lang="sl">${sl.ask}</h2><p class="muted" lang="sl">${sl.detail}</p>
<form method="post" action="/u/${escapeHtml(token)}"><button type="submit"><span>${en.button}</span><span lang="sl">${sl.button}</span></button></form>`,
  });
}

// The result page (POST): `changed` only when this request switched texts off.
function renderDone(ctx, changed) {
  const { en, sl } = COPY;
  const support = escapeHtml(ctx.config.supportEmail);
  return page({
    title: `${en.doneTitle} · ${sl.doneTitle}`,
    body: `<h1>${en.doneTitle}</h1><p>${changed ? en.done : en.already}</p>
<h2 lang="sl">${sl.doneTitle}</h2><p lang="sl">${changed ? sl.done : sl.already}</p>
<hr><p class="muted"><a href="/#account">${en.account}</a> · <a href="/#account" lang="sl">${sl.account}</a></p>
<p class="muted">${en.help} <span>${support}</span>. <span lang="sl">${sl.help} ${support}.</span></p>`,
  });
}

function wantsJson(req) {
  return mediaType(req) === 'application/json' || /application\/json/.test(String(req.headers.accept || ''));
}

// Routes: GET /u/:token (no state change) and POST /u/:token (one-tap opt-out)
export function registerOptOutRoutes(router, ctx) {
  // known(token) -> the user row, or null (counted against the global budget for unknown tokens)
  function known(token) {
    const row = TOKEN_RE.test(token) ? userForToken(ctx.db, token) : null;
    if (row && row.status !== 'deleted') return row;
    ctx.budget?.('unknownOptOutTokens');
    return null;
  }

  router.add(
    'GET',
    '/u/:token',
    async (req, res, { params }) => {
      known(params.token);
      return sendHtml(res, 200, renderAsk(params.token), HEADERS);
    },
    { rate: 'optout' },
  );

  router.add(
    'POST',
    '/u/:token',
    async (req, res, { params, ip }) => {
      const row = known(params.token);
      let changed = false;
      if (row) {
        const r = await ctx.optout.optOutSms(row.id, {
          source: 'link',
          channel: 'sms_link',
          ip,
          userAgent: req.headers['user-agent'],
          pageUrl: `${ctx.config.linkBase}/u/${params.token}`,
          token: params.token,
          background: true,
        });
        changed = r.changed;
      }
      if (wantsJson(req)) return sendJson(res, 200, { ok: true, smsOff: true, changed }, HEADERS);
      return sendHtml(res, 200, renderDone(ctx, changed), HEADERS);
    },
    { accepts: ['form', 'json', 'empty'], limit: 'form', rate: 'optout', csrf: false },
  );
}
