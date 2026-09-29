import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { slotsFor, createDirSource } from '../../server/scheduler.js';
import { pipelineApp, subscriber } from './pipeline.js';

const utc = (date, slot) => slotsFor(date).find((s) => s.slot === slot)?.at.toISOString();

test('slots: Europe/Ljubljana on US trading days, DST-correct in both zones', () => {
  // CEST, US on EDT: publish 12:00Z, US open 15:30 local
  assert.equal(utc('2026-09-28', 'publish'), '2026-09-28T12:00:00.000Z');
  assert.equal(utc('2026-09-28', 'seal'), '2026-09-28T11:45:00.000Z');
  assert.equal(utc('2026-09-28', 'candidates'), '2026-09-28T04:00:00.000Z');
  assert.equal(utc('2026-09-28', 'marks'), '2026-09-28T13:31:00.000Z');
  // EU back on CET (25.10.2026), US still on EDT until 01.11.2026: US open 14:30 local
  assert.equal(utc('2026-10-27', 'publish'), '2026-10-27T13:00:00.000Z');
  assert.equal(utc('2026-10-27', 'marks'), '2026-10-27T13:31:00.000Z');
  // both on standard time
  assert.equal(utc('2026-11-02', 'publish'), '2026-11-02T13:00:00.000Z');
  assert.equal(utc('2026-11-02', 'marks'), '2026-11-02T14:31:00.000Z');
  // US on EDT from 08.03.2026, EU still on CET until 29.03.2026
  assert.equal(utc('2026-03-10', 'marks'), '2026-03-10T13:31:00.000Z');
  assert.equal(utc('2026-03-10', 'publish'), '2026-03-10T13:00:00.000Z');
  assert.equal(utc('2026-09-28', 'anchor'), '2026-09-28T23:59:00.000Z');
  // no slots on weekends or NYSE holidays; the weekly email on Sundays
  assert.deepEqual(slotsFor('2026-10-24'), []);
  assert.deepEqual(slotsFor('2026-11-26'), [], 'Thanksgiving');
  assert.deepEqual(slotsFor('2026-10-25').map((s) => [s.slot, s.at.toISOString()]), [['weekly', '2026-10-25T17:00:00.000Z']], 'Sunday of the EU clock change: 18:00 CET');
  assert.deepEqual(slotsFor('2026-09-27').map((s) => [s.slot, s.at.toISOString()]), [['weekly', '2026-09-27T16:00:00.000Z']]);
});

test('scheduler: a whole day runs each slot once, in order, with the injected clock', async () => {
  const t = await pipelineApp({ config: { fanout: { smsPerSecond: 5 } } });
  const date = t.input.date;
  try {
    t.local('19:00', '2025-11-03');
    await subscriber(t, { email: 'a@example.si', e164: '+38641000001' });
    t.local('05:59');
    assert.deepEqual(await t.ctx.scheduler.tick(), [], 'first tick sets the epoch; nothing earlier is due');
    const ran = [];
    for (const time of ['06:00', '11:30', '12:10', '13:40', '13:45', '14:00', '15:31']) {
      t.local(time);
      if (time === '12:10') {
        t.pub.signOff(date, { personId: 'p1' });
        continue;
      }
      for (const r of await t.ctx.scheduler.tick()) ran.push(`${r.slot}:${r.status}`);
    }
    t.setNow('2025-11-04T23:59:30Z');
    for (const r of await t.ctx.scheduler.tick()) ran.push(`${r.slot}:${r.status}`);
    assert.deepEqual(ran, ['candidates:ok', 'explain:ok', 'review:ok', 'seal:ok', 'publish:ok', 'marks:ok', 'anchor:ok']);
    assert.deepEqual(await t.ctx.scheduler.tick(), [], 'nothing runs twice');
    const issue = t.pub.ledger().find((e) => e.type === 'ISSUE' && e.issueDate === date);
    assert.equal(issue.at, '2025-11-04T14:00:00+01:00');
    assert.equal(t.sms.outbox.filter((m) => m.body.startsWith('QUORUM #')).length, 4);
    assert.equal(t.pub.run(date).stage, 'anchored');
    assert.equal(t.ctx.scheduler.nextAt(new Date('2025-11-04T14:00:30Z')).toISOString(), '2025-11-04T14:31:00.000Z');
    assert.equal(t.ctx.scheduler.nextAt(new Date('2025-11-07T23:59:30Z')).toISOString(), '2025-11-09T17:00:00.000Z', 'Friday night -> the Sunday email');
  } finally {
    await t.close();
  }
});

test('a missed publish slot is never caught up into texts: the web issue appears late, nothing is sent, on-call is paged', async () => {
  const t = await pipelineApp();
  const date = t.input.date;
  try {
    t.local('19:00', '2025-11-03');
    await subscriber(t, { email: 'a@example.si', e164: '+38641000001' });
    t.local('05:00');
    await t.ctx.scheduler.tick();
    for (const time of ['06:00', '11:30']) {
      t.local(time);
      await t.ctx.scheduler.tick();
    }
    t.pub.signOff(date, { personId: 'p1' });
    t.local('13:45');
    await t.ctx.scheduler.tick();
    const sentBefore = t.sms.outbox.length;
    const mailsBefore = t.email.outbox.length;
    t.local('14:25'); // the server was down from 13:50 to 14:25
    const ran = await t.ctx.scheduler.tick();
    assert.deepEqual(ran.map((r) => `${r.slot}:${r.status}`), ['publish:missed']);
    const issue = t.pub.ledger().find((e) => e.type === 'ISSUE' && e.issueDate === date);
    assert.equal(issue.at, '2025-11-04T14:25:00+01:00', 'the real publication time');
    assert.equal(issue.body.late, true);
    assert.equal(t.sms.outbox.length, sentBefore);
    assert.equal(t.email.outbox.length, mailsBefore);
    assert.equal(t.db.get('SELECT COUNT(*) AS n FROM notifications WHERE rec_id IS NOT NULL').n, 0);
    assert.ok(t.pager.pages.some((p) => p.kind === 'issue_late'));
  } finally {
    await t.close();
  }
});

test('a missed seal seals nothing afterwards; the issue still publishes at 14:00 without picks', async () => {
  const t = await pipelineApp();
  const date = t.input.date;
  try {
    t.local('05:00');
    await t.ctx.scheduler.tick();
    t.local('06:00');
    await t.ctx.scheduler.tick();
    t.pub.signOff(date, { personId: 'p1' });
    t.local('14:00'); // the explain, review and seal slots all passed while the process was down
    const ran = await t.ctx.scheduler.tick();
    assert.deepEqual(ran.map((r) => `${r.slot}:${r.status}`), ['explain:missed', 'review:missed', 'seal:missed', 'publish:ok']);
    const issue = t.pub.ledger().find((e) => e.type === 'ISSUE' && e.issueDate === date);
    assert.deepEqual([issue.body.buys, issue.body.renews, issue.body.closes], [[], [], ['0006', '0009']]);
    assert.deepEqual([issue.body.unissued, issue.body.vetoes.human], [3, 0], 'a process failure is not counted as an approver veto');
    assert.ok(t.pager.pages.some((p) => p.kind === 'seal_missed'));
  } finally {
    await t.close();
  }
});

test('engine output missing at 06:00: paged, retried every 5 minutes until the review closes', async () => {
  let ready = false;
  const t = await pipelineApp();
  try {
    const src = t.ctx.engineSource;
    t.ctx.scheduler = (await import('../../server/scheduler.js')).createScheduler(t.ctx, {
      publisher: t.pub,
      notifier: t.ctx.notifier,
      source: { getDay: async (d) => (ready ? src.getDay(d) : null), getMarketData: src.getMarketData },
    });
    t.local('05:00');
    await t.ctx.scheduler.tick();
    t.local('06:00');
    assert.deepEqual((await t.ctx.scheduler.tick()).map((r) => r.status), ['failed']);
    assert.ok(t.pager.pages.some((p) => p.kind === 'engine_output_missing'));
    t.local('06:03');
    assert.deepEqual(await t.ctx.scheduler.tick(), [], 'not before 5 minutes');
    ready = true;
    t.local('06:06');
    assert.deepEqual((await t.ctx.scheduler.tick()).map((r) => `${r.slot}:${r.status}`), ['candidates:ok']);
  } finally {
    await t.close();
  }
});

test('SCHEDULER=off does not start a timer; a directory source reads engine output files', async () => {
  const t = await pipelineApp();
  const dir = mkdtempSync(join(tmpdir(), 'quorum-engine-'));
  try {
    assert.equal(t.ctx.config.scheduler, 'off');
    assert.equal(t.ctx.scheduler.start(), false);
    writeFileSync(join(dir, '2025-11-04.json'), JSON.stringify({ issue: t.day.issue, picks: t.day.picks, persons: t.day.persons }));
    const src = createDirSource(dir);
    const day = await src.getDay('2025-11-04');
    assert.deepEqual(day.candidates.map((c) => c.ticker), ['LUMX', 'KRST', 'VLMA']);
    assert.equal((await src.getMarketData('2025-11-04')).exits['0006'].open, 50.6);
    assert.equal(await src.getDay('2025-11-05'), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await t.close();
  }
});
