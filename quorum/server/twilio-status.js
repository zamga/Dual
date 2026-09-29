// POST /api/webhooks/twilio/status — Twilio delivery receipts (status callbacks).
// This file validates X-Twilio-Signature and persists the callback, append-only; then
// ctx.hooks.onTwilioStatus (server/receipts.js) moves the status forward, handles 21610 (opted
// out), 30003/30005/30006 (invalid number) and 30007 spikes.
//
// What is stored is the delivery facts only (message SID, status, error code, service): never the
// phone numbers. A hash of a phone number is no protection (every mobile range of a country is a few
// million numbers, enumerated in seconds), and the number is known through the SID's notification
// row for as long as the account exists. Without a configured TWILIO_AUTH_TOKEN every callback is
// refused: there is no default key anyone could sign with.
import { sendJson } from './http.js';
import { redactTwilioCallback } from './privacy.js';
import { iso } from './util.js';

// redactCallback(params) -> the kept parameters only (server/privacy.js: no To, From or any address)
export const redactCallback = redactTwilioCallback;

export function registerTwilioStatusRoute(router, ctx) {
  router.add(
    'POST',
    '/api/webhooks/twilio/status',
    async (req, res, { body }) => {
      const url = `${ctx.config.publicBaseUrl}${req.url}`;
      if (!ctx.config.twilio.authToken || !ctx.sms.validateSignature(url, body, req.headers['x-twilio-signature'])) {
        return sendJson(res, 403, { error: 'invalid_signature' });
      }
      const sid = body.MessageSid || body.SmsSid || null;
      const status = body.MessageStatus || body.SmsStatus || null;
      const errorCode = body.ErrorCode || null;
      // A repeated callback (same message, status and error) is stored once; the hook is idempotent
      // and runs again (a retry after a failed first attempt must still be processed).
      const seen = ctx.db.get(
        'SELECT 1 AS x FROM delivery_events WHERE provider = ? AND provider_sid IS ? AND status IS ? AND error_code IS ? LIMIT 1',
        'twilio',
        sid,
        status,
        errorCode,
      );
      if (!seen) {
        ctx.db.run(
          'INSERT INTO delivery_events (provider, provider_sid, status, error_code, payload, received_at) VALUES (?, ?, ?, ?, ?, ?)',
          'twilio',
          sid,
          status,
          errorCode,
          JSON.stringify(redactCallback(body)),
          iso(ctx.now()),
        );
      }
      if (typeof ctx.hooks.onTwilioStatus === 'function') await ctx.hooks.onTwilioStatus({ sid, status, errorCode, params: body });
      res.writeHead(204, { 'cache-control': 'no-store' });
      res.end();
      return undefined;
    },
    { accepts: ['form'], limit: 'twilio', rate: 'webhook', csrf: false },
  );
}
