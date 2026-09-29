// Shared harness for the stage 2 pipeline tests: an app with the fake Claude client, the synthetic
// engine day and its sealed chain imported, plus a local (Ljubljana) clock setter.
import { zonedToInstant, LJUBLJANA } from '../../core/calendar.js';
import { adaptEngineDay } from '../../server/publisher.js';
import { buildEngineDay, fakeClaude } from './fixtures/engine-day.js';
import { makeApp, readyUser, checkoutAndPay } from './helpers.js';

export const PINNED = 'pinned-model-under-test'; // not a model identifier: any non-empty value switches the explainer on
export const ADMIN = 'test-admin-token';

export async function pipelineApp({ now = '2025-11-03T18:00:00Z', script, config = {}, withLedger = true, fetch, mutate } = {}) {
  const day = await buildEngineDay();
  if (mutate) mutate(day);
  const client = fakeClaude({ picks: day.picks, script });
  const input = adaptEngineDay({ issue: day.issue, picks: day.picks, persons: day.persons, news: day.news });
  const engineSource = {
    getDay: async (d) => (d === input.date ? input : null),
    getMarketData: async (d) => (d === input.date ? input.marketData : null),
  };
  // Many subscribers join from one test address: per-IP join limits are raised here (tested elsewhere).
  const roomy = { capacity: 10_000, windowMs: 60_000 };
  const rateLimits = { authMagic: roomy, authMagicEmail: roomy, phoneStart: roomy, phoneStartUser: roomy, phoneCheck: roomy, api: roomy };
  const t = await makeApp({ now, anthropic: client, engineSource, fetch, config: { anthropicApiKey: 'test-key', explainerModel: PINNED, adminToken: ADMIN, rateLimits, ...config } });
  if (withLedger) await t.ctx.publisher.importLedger(day.ledger);
  return Object.assign(t, {
    day,
    input,
    claude: client,
    pub: t.ctx.publisher,
    // local('13:45') sets the clock to that Ljubljana time on the issue date (or another date)
    local(time, date = input.date) {
      t.setNow(zonedToInstant(date, time, LJUBLJANA).toISOString());
    },
  });
}

// A paying Signal subscriber with a verified SI number and SMS on (unless sms: false).
export async function subscriber(t, { email, e164, locale = 'en', sms = true, tier = 'signal' } = {}) {
  const { client, user } = await readyUser(t, { email, e164, locale, sms });
  await checkoutAndPay(t, client, { tier });
  return { client, user };
}

// Runs the review and seal the way the approver and scheduler would, signing off as p1.
export async function sealDay(t, { signOff = true, vetoTicker = null, reason = 'Removing this one for a documented reason.' } = {}) {
  const date = t.input.date;
  t.local('06:00');
  t.pub.writeCandidates(t.input);
  t.local('11:30');
  await t.pub.explain(date);
  t.local('12:10');
  if (vetoTicker) {
    const c = t.pub.readCandidates(date, { actor: 'test' }).find((x) => x.payload.ticker === vetoTicker);
    t.pub.veto(date, c.id, { personId: 'p1', reason });
  }
  if (signOff) t.pub.signOff(date, { personId: 'p1' });
  t.local('13:40');
  t.pub.closeReview(date);
  t.local('13:45');
  return t.pub.seal(date);
}
