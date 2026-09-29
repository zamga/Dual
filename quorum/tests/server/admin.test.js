import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenMatches } from '../../server/admin.js';
import { pipelineApp, sealDay, subscriber, ADMIN } from './pipeline.js';
import { makeApp } from './helpers.js';

const bearer = { authorization: `Bearer ${ADMIN}` };

async function ready(t) {
  t.local('06:00');
  t.pub.writeCandidates(t.input);
  t.local('11:30');
  await t.pub.explain(t.input.date);
  t.local('12:05');
}

test('admin token: constant-time compare; no token configured means no console at all', async () => {
  assert.equal(tokenMatches('abc', 'abc'), true);
  assert.equal(tokenMatches('abd', 'abc'), false);
  assert.equal(tokenMatches('abc-longer', 'abc'), false);
  assert.equal(tokenMatches('', 'abc'), false);
  assert.equal(tokenMatches('abc', ''), false);
  const t = await makeApp();
  try {
    const c = t.client();
    assert.equal((await c.get('/admin')).status, 404);
    assert.equal((await c.get('/api/admin/candidates', { headers: { authorization: 'Bearer anything' } })).status, 404);
  } finally {
    await t.close();
  }
});

test('JSON API: candidates behind the token, every access logged; veto with a reason; sign-off; no add', async () => {
  const t = await pipelineApp();
  try {
    await ready(t);
    const c = t.client();
    assert.equal((await c.get('/api/admin/candidates')).status, 401);
    assert.equal((await c.get('/api/admin/candidates', { headers: { authorization: 'Bearer wrong' } })).status, 401);
    const before = t.db.get("SELECT COUNT(*) AS n FROM access_log WHERE object_type = 'candidates'").n;
    const list = await c.get('/api/admin/candidates?person=p1', { headers: bearer });
    assert.equal(list.status, 200);
    assert.equal(list.body.date, '2025-11-04');
    assert.equal(list.body.reviewClosesAt, '2025-11-04T13:40:00+01:00');
    assert.deepEqual(list.body.candidates.map((x) => [x.ticker, x.status, x.thesisStatus, x.vetoScan]), [['LUMX', 'candidate', 'drafted', 'clear'], ['KRST', 'candidate', 'drafted', 'clear'], ['VLMA', 'candidate', 'drafted', 'clear']]);
    assert.ok(list.body.candidates[1].thesis.en.includes('KRST'));
    const log = t.db.all("SELECT actor, action, object_id FROM access_log WHERE object_type = 'candidates' ORDER BY id").slice(before);
    assert.deepEqual(log, [{ actor: 'person:p1', action: 'admin_view', object_id: '2025-11-04' }]);
    const vlma = list.body.candidates[2];
    const noReason = await c.post('/api/admin/veto', { candidateId: vlma.id, personId: 'p1', reason: '' }, { headers: bearer });
    assert.deepEqual([noReason.status, noReason.body.error], [400, 'reason_required']);
    const notApprover = await c.post('/api/admin/veto', { candidateId: vlma.id, personId: 'p2', reason: 'The model lead tries to veto.' }, { headers: bearer });
    assert.deepEqual([notApprover.status, notApprover.body.error], [403, 'not_an_approver']);
    const ok = await c.post('/api/admin/veto', { candidateId: vlma.id, personId: 'p1', reason: 'Third consumer name this month; waiting for the filing reconciliation.' }, { headers: bearer });
    assert.deepEqual([ok.status, ok.body.status], [200, 'vetoed_human']);
    const twice = await c.post('/api/admin/veto', { candidateId: vlma.id, personId: 'p1', reason: 'Trying the same veto again.' }, { headers: bearer });
    assert.equal(twice.status, 409);
    assert.equal((await c.post('/api/admin/add', { ticker: 'ZNTH' }, { headers: bearer })).status, 404, 'there is no add');
    const so = await c.post('/api/admin/signoff', { personId: 'p1' }, { headers: bearer });
    assert.equal(so.status, 200);
    t.local('13:41');
    const late = await c.post('/api/admin/veto', { candidateId: list.body.candidates[1].id, personId: 'p1', reason: 'After the window closed.' }, { headers: bearer });
    assert.deepEqual([late.status, late.body.error], [409, 'review_closed']);
    t.pub.closeReview(t.input.date);
    t.local('13:45');
    await t.pub.seal(t.input.date);
    t.local('14:00');
    const p = await t.pub.publish(t.input.date);
    assert.equal(p.body.vetoes.human, 1);
    assert.equal(p.body.humanVetoes[0].by, 'p1');
    const al = await c.get('/api/admin/access-log?limit=5', { headers: bearer });
    assert.equal(al.status, 200);
    assert.equal(al.body.entries[0].object_type, 'access_log', 'reading the log is itself logged');
  } finally {
    await t.close();
  }
});

test('approver thesis through the API is validated like a draft', async () => {
  const t = await pipelineApp({ config: { explainerModel: '' } });
  try {
    await ready(t);
    const c = t.client();
    const list = await c.get('/api/admin/candidates', { headers: bearer });
    const krst = list.body.candidates.find((x) => x.ticker === 'KRST');
    assert.equal(krst.thesisStatus, 'handoff');
    const tpl = t.input.candidates.find((x) => x.ticker === 'KRST').templateThesis;
    const bad = await c.post('/api/admin/thesis', { candidateId: krst.id, personId: 'p3', en: `${tpl.en} You should buy it.`, sl: tpl.sl }, { headers: bearer });
    assert.deepEqual([bad.status, bad.body.error], [400, 'thesis_invalid']);
    const good = await c.post('/api/admin/thesis', { candidateId: krst.id, personId: 'p3', en: tpl.en, sl: tpl.sl }, { headers: bearer });
    assert.equal(good.status, 200);
    assert.equal((await c.get('/api/admin/candidates', { headers: bearer })).body.candidates.find((x) => x.id === krst.id).thesis.drafter, 'approver');
  } finally {
    await t.close();
  }
});

test('staff pre-clearance: funds and ETFs are cleared, single stocks refused, every request logged', async () => {
  const t = await pipelineApp();
  try {
    await ready(t);
    const c = t.client();
    const etf = await c.post('/api/admin/preclearance', { personId: 'p2', instrument: 'Fictional World Equity ETF', instrumentType: 'etf', side: 'buy' }, { headers: bearer });
    const fund = await c.post('/api/admin/preclearance', { personId: 'p1', instrument: 'Fictional Bond Fund', instrumentType: 'fund', side: 'sell' }, { headers: bearer });
    const stock = await c.post('/api/admin/preclearance', { personId: 'p2', instrument: 'KRST', instrumentType: 'stock', side: 'buy' }, { headers: bearer });
    assert.deepEqual([etf.body.decision, fund.body.decision, stock.body.decision], ['cleared', 'cleared', 'refused']);
    assert.match(stock.body.reason, /funds and ETFs only/);
    assert.equal((await c.post('/api/admin/preclearance', { personId: 'nobody', instrument: 'x', instrumentType: 'etf', side: 'buy' }, { headers: bearer })).status, 400);
    assert.equal((await c.post('/api/admin/preclearance', { personId: 'p2', instrument: 'x', instrumentType: 'crypto', side: 'buy' }, { headers: bearer })).status, 400);
    const list = await c.get('/api/admin/preclearance', { headers: bearer });
    assert.equal(list.body.requests.length, 3);
    assert.equal(t.db.get("SELECT COUNT(*) AS n FROM access_log WHERE action = 'preclearance'").n, 3);
  } finally {
    await t.close();
  }
});

test('HTML console: sign in with the token (Strict cookie), see candidates, veto and sign off with forms', async () => {
  const t = await pipelineApp();
  try {
    await ready(t);
    const c = t.client();
    const login = await c.get('/admin');
    assert.equal(login.status, 200);
    assert.match(login.text, /Admin token/);
    assert.ok(!/<script/i.test(login.text), 'no script (the CSP forbids inline script)');
    const bad = await c.request('POST', '/admin/login', { form: { token: 'wrong' } });
    assert.equal(bad.headers.get('location'), '/admin?e=bad_token');
    const ok = await c.request('POST', '/admin/login', { form: { token: ADMIN } });
    assert.equal(ok.status, 303);
    assert.match(ok.headers.get('set-cookie'), /qadm=.*SameSite=Strict.*HttpOnly.*Secure/);
    const page = await c.get('/admin?person=p1');
    assert.equal(page.status, 200);
    assert.match(page.text, /KRST/);
    assert.match(page.text, /Remove \(veto\)/);
    assert.match(page.text, /fictional/);
    assert.equal(page.headers.get('x-robots-tag'), 'noindex');
    const vlma = t.pub.readCandidates(t.input.date, { actor: 'test' }).find((x) => x.payload.ticker === 'VLMA');
    const v = await c.request('POST', '/admin/veto', { form: { date: t.input.date, personId: 'p1', candidateId: String(vlma.id), reason: 'Removed from the console form with a reason.' } });
    assert.equal(v.status, 303);
    assert.match(v.headers.get('location'), /m=Candidate/);
    const e = await c.request('POST', '/admin/veto', { form: { date: t.input.date, personId: 'p1', candidateId: String(vlma.id), reason: 'Again, which is refused.' } });
    assert.match(decodeURIComponent(e.headers.get('location')), /e=This candidate is already vetoed_human/);
    const so = await c.request('POST', '/admin/signoff', { form: { date: t.input.date, personId: 'p1' } });
    assert.equal(so.status, 303);
    assert.ok(t.db.get('SELECT 1 AS x FROM approver_signoffs'));
    const cross = await c.request('POST', '/admin/signoff', { form: { date: t.input.date, personId: 'p1' }, headers: { 'sec-fetch-site': 'cross-site' } });
    assert.equal(cross.status, 403, 'cross-site form posts are refused');
    const out = await c.request('POST', '/admin/logout', { form: {} });
    assert.equal(out.status, 303);
    assert.match((await c.get('/admin')).text, /Admin token/);
  } finally {
    await t.close();
  }
});

test('SMS pause and resume from the console API; GET /api/status shows counts only', async () => {
  const t = await pipelineApp();
  try {
    t.local('19:00', '2025-11-03');
    await subscriber(t, { email: 'person@example.si', e164: '+38641000001' });
    const c = t.client();
    const empty = await c.get('/api/status');
    assert.equal(empty.status, 200);
    assert.equal(empty.body.issue, null);
    await sealDay(t);
    t.local('14:00');
    await t.pub.publish(t.input.date);
    await t.ctx.notifier.deliverIssue(t.input.date);
    const paused = await c.post('/api/admin/sms', { paused: true, personId: 'p1' }, { headers: bearer });
    assert.equal(paused.body.paused, true);
    const s = await c.get('/api/status');
    assert.deepEqual(s.body.issue, { date: '2025-11-04', issueNo: 8, publishedAt: '2025-11-04T14:00:00+01:00', late: false, quorum: true, items: { buys: 2, renews: 1, closes: 1 }, nScored: 1402, closest: 3 });
    assert.deepEqual(s.body.delivery.sms, { queued: 0, sending: 0, sent: 4, delivered: 0, undelivered: 0, failed: 0, cancelled: 0 });
    assert.equal(s.body.delivery.email.sent, 4);
    assert.equal(s.body.smsChannel.paused, true);
    assert.equal(s.body.nextIssueAt, '2025-11-05T14:00:00+01:00');
    const text = JSON.stringify(s.body);
    for (const secret of ['person@example.si', '+38641000001', 'KRST', 'LUMX', 'usr_']) assert.ok(!text.includes(secret), `no ${secret} in /api/status`);
    const resumed = await c.post('/api/admin/sms', { paused: false, personId: 'p1' }, { headers: bearer });
    assert.equal(resumed.body.paused, false);
    assert.equal((await c.get('/api/health')).body.smsPaused, false);
  } finally {
    await t.close();
  }
});
