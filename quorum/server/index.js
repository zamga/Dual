// The Quorum server: node:http + node:sqlite, no framework.
//   createApp({ db, config, transports, clock, fetch, log, sleep }) -> { server, ctx, router, handle, listen, close }
//     transports: { sms, email, stripe, push, pager, anthropic (explainer client), engineSource }
//   node server/index.js   starts it with the configuration from the environment (server/config.js)
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import {
  createRouter,
  readBody,
  parseBody,
  sendJson,
  redirect,
  securityHeaders,
  clientIp,
  createRateLimiter,
  HttpError,
} from './http.js';
import { createTwilio, createConsoleSms } from './vendors/twilio.js';
import { createStripe } from './vendors/stripe.js';
import { makeEmail } from './vendors/email.js';
import { createWebPush, createConsolePush } from './vendors/push.js';
import { createAlerts, createConsolePager, createWebhookPager } from './alerts.js';
import { createExplainer } from './explainer.js';
import { createAnchorer } from './anchor.js';
import { createNotifier, registerPushRoutes, realSleep } from './notifier.js';
import { createPublisher } from './publisher.js';
import { createReceipts } from './receipts.js';
import { createScheduler, createDirSource } from './scheduler.js';
import { registerAdminRoutes } from './admin.js';
import { registerStatusRoute } from './status.js';
import { createMessaging } from './messaging.js';
import { createOptOut, registerOptOutRoutes } from './optout.js';
import { createAuth, registerAuthRoutes } from './auth.js';
import { createBilling, registerBillingRoutes } from './billing.js';
import { registerConsentRoutes } from './consent.js';
import { registerJoinRoutes } from './join.js';
import { registerAccountRoutes } from './account.js';
import { registerDataRoutes } from './data.js';
import { registerTwilioStatusRoute } from './twilio-status.js';
import { createStatic } from './static.js';
import { createLogger } from './util.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_WEB_ROOT = join(HERE, '..', 'web');

// makeTransports(config, { fetch, log, clock }) -> { sms, email, stripe, push } from the configuration.
export function makeTransports(config, { fetch = globalThis.fetch, log, clock } = {}) {
  const sms =
    config.smsTransport === 'twilio'
      ? createTwilio({
          accountSid: config.twilio.accountSid,
          authToken: config.twilio.authToken,
          messagingServiceSid: config.twilio.messagingServiceSid,
          verifyServiceSid: config.twilio.verifyServiceSid,
          fetch,
        })
      : createConsoleSms({ log, clock, authToken: config.twilio.authToken || 'console-auth-token' });
  const email = makeEmail(config, { fetch, log, clock });
  const push =
    config.pushTransport === 'webpush'
      ? createWebPush({ vapid: config.vapid, fetch, clock })
      : createConsolePush({ log, clock, publicKey: config.vapid.publicKey || null });
  const stripe = createStripe({
    secretKey: config.stripe.secretKey,
    webhookSecret: config.stripe.webhookSecret,
    apiVersion: config.stripe.apiVersion,
    toleranceSec: config.stripe.toleranceSec,
    fetch,
  });
  return { sms, email, stripe, push };
}

export function createApp({ db, config, transports = {}, clock, fetch = globalThis.fetch, log, webRoot, sleep } = {}) {
  config ??= loadConfig();
  log ??= createLogger();
  db ??= openDb(config.dbPath);
  const now = clock ?? (() => new Date());
  const made = makeTransports(config, { fetch, log, clock: now });

  const ctx = {
    db,
    config,
    log,
    now,
    sms: transports.sms ?? made.sms,
    email: transports.email ?? made.email,
    stripe: transports.stripe ?? made.stripe,
    push: transports.push ?? made.push,
    fetch,
    sleep: sleep ?? realSleep,
    rateLimiter: createRateLimiter({ clock: now }),
    hooks: {},
  };
  ctx.alerts = createAlerts(ctx, {
    pager: transports.pager ?? (config.pagerWebhookUrl ? createWebhookPager({ url: config.pagerWebhookUrl, fetch, log }) : createConsolePager({ log })),
  });
  ctx.messaging = createMessaging(ctx);
  ctx.optout = createOptOut(ctx);
  ctx.auth = createAuth(ctx);
  ctx.billing = createBilling(ctx);
  // Part 2: the daily pipeline and everything around it.
  ctx.explainer = createExplainer({ config, db, log, now, client: transports.anthropic ?? null });
  ctx.anchorer = createAnchorer(ctx);
  ctx.notifier = createNotifier(ctx);
  ctx.publisher = createPublisher(ctx, { explainer: ctx.explainer, anchorer: ctx.anchorer, notifier: ctx.notifier });
  ctx.receipts = createReceipts(ctx);
  ctx.engineSource = transports.engineSource ?? (config.engineDayDir ? createDirSource(config.engineDayDir) : null);
  ctx.scheduler = createScheduler(ctx, { publisher: ctx.publisher, notifier: ctx.notifier, source: ctx.engineSource });
  ctx.hooks.onTwilioStatus = (e) => ctx.receipts.onStatus(e);
  // runIssueDay({ date, input?, approve?, marketData? }) runs one whole issue day (tests, demo).
  ctx.hooks.runIssueDay = async ({ date, input = null, approve = null, marketData = null, anchor = true } = {}) => {
    const day = input ?? (ctx.engineSource ? await ctx.engineSource.getDay(date) : null);
    if (!day) throw new Error(`runIssueDay: no engine output for ${date}`);
    return ctx.publisher.runDay(day, { approve, marketData, anchor });
  };

  const root = webRoot ?? config.webRoot ?? DEFAULT_WEB_ROOT;
  const router = createRouter();
  registerAccountRoutes(router, ctx);
  registerAuthRoutes(router, ctx);
  registerJoinRoutes(router, ctx);
  registerConsentRoutes(router, ctx);
  registerBillingRoutes(router, ctx);
  registerTwilioStatusRoute(router, ctx);
  registerOptOutRoutes(router, ctx);
  registerPushRoutes(router, ctx);
  registerAdminRoutes(router, ctx);
  registerStatusRoute(router, ctx);
  ctx.data = registerDataRoutes(router, ctx, join(root, 'data'));
  // Short links used in texts and emails (qrm.si/p/0417, qrm.si/help, qrm.si/account) land on the
  // hash routes of the single-page site.
  router.add('GET', '/p/:no', async (req, res, { params }) =>
    /^\d{4,5}$/.test(params.no) ? redirect(res, `/#p-${params.no}`, 302) : sendJson(res, 404, { error: 'not_found' }),
  );
  for (const route of ['help', 'account', 'join', 'pricing', 'ledger', 'status']) {
    router.add('GET', `/${route}`, async (req, res) => redirect(res, `/#${route}`, 302));
  }
  const statics = createStatic(root, { live: true });
  const https = config.publicBaseUrl.startsWith('https://');
  const baseOrigin = new URL(config.publicBaseUrl).origin;
  const headers = securityHeaders({ https });

  async function handle(req, res) {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return sendJson(res, 400, { error: 'bad_request' });
    }
    const ip = clientIp(req, config.trustProxy);
    const isApi = url.pathname.startsWith('/api/');
    try {
      const match = router.match(req.method, url.pathname);
      if (!match) {
        if ((req.method === 'GET' || req.method === 'HEAD') && !isApi && (await statics.serve(req, res, url.pathname))) return;
        throw new HttpError(404, 'not_found', 'Not found');
      }
      if (match.methodNotAllowed) throw new HttpError(405, 'method_not_allowed', 'Method not allowed');
      const { route, params } = match;
      const opts = route.opts;

      // Rate limits: the route's own bucket, plus the general API bucket.
      const buckets = new Set();
      if (opts.rate) buckets.add(opts.rate);
      if (isApi && opts.rate !== 'webhook') buckets.add('api');
      for (const bucket of buckets) {
        const r = ctx.rateLimiter.take(bucket, ip, config.rateLimits[bucket]);
        if (!r.ok) throw new HttpError(429, 'rate_limited', 'Too many requests. Try again shortly.', { retryAfterSec: r.retryAfterSec });
      }

      let raw = Buffer.alloc(0);
      let body = {};
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') {
        if (opts.csrf !== false) checkOrigin(req, baseOrigin);
        raw = await readBody(req, config.bodyLimits[opts.limit || 'json']);
        body = opts.raw ? {} : parseBody(req, raw, opts.accepts || ['json']);
      }
      const auth = ctx.auth.loadSession(req);
      if (opts.auth && !auth) throw new HttpError(401, 'unauthenticated', 'Sign in first.');
      const result = await route.handler(req, res, {
        params,
        query: url.searchParams,
        body,
        raw,
        ip,
        user: auth?.user ?? null,
        session: auth?.session ?? null,
      });
      if (!res.headersSent && !res.writableEnded) sendJson(res, opts.status || 200, result ?? { ok: true });
    } catch (e) {
      if (res.headersSent) {
        log.error(`[http] ${req.method} ${url.pathname} failed after headers: ${e.stack || e.message}`);
        res.destroy();
        return;
      }
      if (e instanceof HttpError) {
        const extra = { ...e.extra };
        const h = {};
        if (extra.retryAfterSec) h['retry-after'] = String(extra.retryAfterSec);
        return sendJson(res, e.status, { error: e.code, message: e.message, ...extra }, h);
      }
      log.error(`[http] ${req.method} ${url.pathname}: ${e.stack || e.message}`);
      return sendJson(res, 500, { error: 'internal', message: 'Something went wrong on our side.' });
    }
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      log.error(`[http] unhandled: ${e.stack || e.message}`);
      if (!res.headersSent) sendJson(res, 500, { error: 'internal' });
    });
  });
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;

  let timer = null;
  function startOutbox() {
    if (timer || !config.outboxIntervalMs) return;
    timer = setInterval(() => {
      ctx.messaging.dispatchDue().catch((e) => log.error(`[outbox] ${e.message}`));
    }, config.outboxIntervalMs);
    timer.unref();
  }

  return {
    server,
    ctx,
    router,
    handle,
    // listen(port = config.port, host = config.host) -> Promise<baseUrl>
    listen(port = config.port, host = config.host) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          startOutbox();
          ctx.scheduler.start();
          const a = server.address();
          resolve(`http://${a.family === 'IPv6' ? `[${a.address}]` : a.address}:${a.port}`);
        });
      });
    },
    async close({ closeDb = true } = {}) {
      if (timer) clearInterval(timer);
      timer = null;
      ctx.scheduler.stop();
      if (server.listening) {
        server.closeAllConnections?.();
        await new Promise((r) => server.close(() => r()));
      }
      if (closeDb) db.close();
    },
  };
}

// CSRF defence for cookie-authenticated POSTs: JSON content type (checked by parseBody) plus a
// same-origin Origin / Sec-Fetch-Site when the browser sends them.
function checkOrigin(req, baseOrigin) {
  const site = req.headers['sec-fetch-site'];
  if (site === 'cross-site') throw new HttpError(403, 'cross_site', 'Cross-site request refused');
  const origin = req.headers.origin;
  if (origin == null) return;
  if (origin === 'null') throw new HttpError(403, 'bad_origin', 'Request origin refused');
  let o;
  try {
    o = new URL(origin);
  } catch {
    throw new HttpError(403, 'bad_origin', 'Request origin refused');
  }
  if (o.origin !== baseOrigin && o.host !== req.headers.host) throw new HttpError(403, 'bad_origin', 'Request origin refused');
}

async function main() {
  const config = loadConfig();
  const log = createLogger();
  if (config.production && config.sessionSecretGenerated) {
    log.error('SESSION_SECRET is required when NODE_ENV=production');
    process.exit(1);
  }
  if (config.smsTransport === 'twilio' && (!config.twilio.accountSid || !config.twilio.authToken)) {
    log.error('SMS_TRANSPORT=twilio needs TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
    process.exit(1);
  }
  if (config.pushTransport === 'webpush' && !config.vapid.privateKey) {
    log.error('PUSH_TRANSPORT=webpush needs VAPID_PRIVATE_KEY (and VAPID_SUBJECT)');
    process.exit(1);
  }
  const app = createApp({ config, log });
  const url = await app.listen();
  log.info(`Quorum server on ${url} (public ${config.publicBaseUrl}); db ${config.dbPath}; sms ${app.ctx.sms.kind}; email ${app.ctx.email.kind}; push ${app.ctx.push.kind}; scheduler ${config.scheduler}`);
  if (!app.ctx.explainer.enabled) log.warn(`${app.ctx.explainer.disabledReason}: every candidate goes to the approver to write`);
  if (!config.adminToken) log.warn('ADMIN_TOKEN not set: the approver console is off');
  if (config.sessionSecretGenerated) log.warn('SESSION_SECRET not set: using a per-process secret (sessions end on restart)');
  const stop = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
