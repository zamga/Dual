// POST /api/webhooks/twilio/status — Twilio delivery receipts (status callbacks).
// Part 1 (this file): validate X-Twilio-Signature and persist the raw callback, append-only, with
// the phone numbers replaced by their SHA-256. Part 2 completes it through ctx.hooks.onTwilioStatus
// (forward-only status moves on `notifications`, 21610 -> opted out, 30003/30005/30006 -> invalid
// number, 30007 spike -> pause SMS).
import { sendJson } from './http.js';
import { iso, sha256 } from './util.js';

export function redactCallback(params) {
  const out = { ...params };
  for (const k of ['To', 'From']) if (out[k]) out[k] = `sha256:${sha256(out[k])}`;
  return out;
}

export function registerTwilioStatusRoute(router, ctx) {
  router.add(
    'POST',
    '/api/webhooks/twilio/status',
    async (req, res, { body }) => {
      const url = `${ctx.config.publicBaseUrl}${req.url}`;
      if (!ctx.sms.validateSignature(url, body, req.headers['x-twilio-signature'])) {
        return sendJson(res, 403, { error: 'invalid_signature' });
      }
      const sid = body.MessageSid || body.SmsSid || null;
      const status = body.MessageStatus || body.SmsStatus || null;
      const errorCode = body.ErrorCode || null;
      ctx.db.run(
        'INSERT INTO delivery_events (provider, provider_sid, status, error_code, payload, received_at) VALUES (?, ?, ?, ?, ?, ?)',
        'twilio',
        sid,
        status,
        errorCode,
        JSON.stringify(redactCallback(body)),
        iso(ctx.now()),
      );
      if (typeof ctx.hooks.onTwilioStatus === 'function') await ctx.hooks.onTwilioStatus({ sid, status, errorCode, params: body });
      res.writeHead(204, { 'cache-control': 'no-store' });
      res.end();
      return undefined;
    },
    { accepts: ['form'], limit: 'twilio', rate: 'webhook', csrf: false },
  );
}
