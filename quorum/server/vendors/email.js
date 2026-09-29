// Email transports. Interface: send({ to, subject, text, tag, link? }) -> Promise<{ id }>.
//   createConsoleEmail({ log, clock })     logs every message (sign-in links included) and keeps a
//                                          bounded outbox for tests and scripts/demo-day.js
//   createPostmarkEmail({ serverToken, from, messageStream, fetch, baseUrl })
//                                          Postmark-style REST (POST /email, JSON, server token header)
// makeEmail(config, { fetch, log, clock }) picks one from EMAIL_TRANSPORT.

export const POSTMARK_BASE = 'https://api.postmarkapp.com';

export class EmailError extends Error {
  constructor(status, body) {
    super(body?.Message || `Email HTTP ${status}`);
    this.name = 'EmailError';
    this.status = status;
    this.code = body?.ErrorCode ?? null;
    this.body = body;
  }
}

export function createConsoleEmail({ log = console, max = 500, clock = () => new Date() } = {}) {
  const outbox = [];
  let n = 0;
  const say = (msg) => (log.info ? log.info(msg) : log.log?.(msg));
  return {
    kind: 'console',
    outbox,
    async send({ to, subject, text, tag = null, link = null }) {
      const id = `EMconsole${String(++n).padStart(6, '0')}`;
      outbox.push({ id, to, subject, text, tag, link, at: clock().toISOString() });
      if (outbox.length > max) outbox.splice(0, outbox.length - max);
      say(`[email:console] ${id} to ${to}: ${subject}${link ? `\n  link: ${link}` : ''}`);
      return { id };
    },
  };
}

// Postmark-style transport. Plain text only (no tracking pixels, no link rewriting: TrackOpens
// false, TrackLinks None). 4xx answers are permanent (EmailError with the provider's ErrorCode);
// 429 and 5xx are retried by the outbox.
export function createPostmarkEmail({ serverToken, from, messageStream = 'outbound', fetch = globalThis.fetch, baseUrl = POSTMARK_BASE } = {}) {
  if (!serverToken) throw new Error('email: POSTMARK_SERVER_TOKEN is required for EMAIL_TRANSPORT=postmark');
  if (!from) throw new Error('email: EMAIL_FROM is required');
  return {
    kind: 'postmark',
    async send({ to, subject, text, tag = null }) {
      const res = await fetch(`${baseUrl}/email`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'x-postmark-server-token': serverToken },
        body: JSON.stringify({
          From: from,
          To: to,
          Subject: subject,
          TextBody: text,
          Tag: tag ?? undefined,
          MessageStream: messageStream,
          TrackOpens: false,
          TrackLinks: 'None',
        }),
      });
      const raw = await res.text();
      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = { Message: raw };
      }
      if (!res.ok || (body && body.ErrorCode)) throw new EmailError(res.ok ? 422 : res.status, body);
      return { id: body?.MessageID ?? null };
    },
  };
}

export function makeEmail(config, { fetch = globalThis.fetch, log, clock } = {}) {
  if (config.emailTransport === 'postmark') {
    return createPostmarkEmail({ serverToken: config.postmark?.serverToken, from: config.emailFrom, messageStream: config.postmark?.messageStream, baseUrl: config.postmark?.baseUrl, fetch });
  }
  return createConsoleEmail({ log, clock });
}
