// Email transports. Interface: send({ to, subject, text, tag, link? }) -> Promise<{ id }>.
// The console transport logs every message (sign-in links included) and keeps a bounded outbox
// for tests and scripts/demo-day.js. A production transport (Postmark, EU) plugs in here.

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
