import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock, pillState, remaining, clockMode, msToNextMinute } from '../../web/js/clock.js';

const issues = [
  { date: '2026-09-25', quorum: false, buys: [], renews: [], closes: [] },
  { date: '2026-09-28', quorum: true, buys: ['0062'], renews: [], closes: ['0041'] },
];

test('live before the next slot after asOf, pinned after it, override from ?now=', () => {
  const live = createClock({ asOf: '2026-09-28', realNow: () => new Date('2026-09-28T20:36:00Z') });
  assert.equal(live.mode, 'live');
  const pinned = createClock({ asOf: '2026-09-28', realNow: () => new Date('2026-10-05T10:00:00Z') });
  assert.equal(pinned.mode, 'pinned');
  assert.equal(pinned.now().toISOString(), '2026-09-28T20:30:00.000Z'); // 22:30 CEST
  const o = createClock({ asOf: '2026-09-28', flagsNow: '2026-09-28T13:50:00+02:00' });
  assert.equal(o.mode, 'override');
  assert.equal(clockMode(live), 'live');
});

test('"Next issue 14:00 · 15h 24m" at 22:36 CEST on the day of the last issue', () => {
  const st = pillState(new Date('2026-09-28T20:36:00Z'), issues);
  assert.equal(st.kind, 'countdown');
  assert.equal(st.slot.issueDate, '2026-09-29');
  assert.equal(st.left.text, '15h 24m');
});

test('switches state at 14:00: the result of today’s issue until 22:15', () => {
  const before = pillState(new Date('2026-09-28T11:59:00Z'), issues);
  assert.equal(before.kind, 'countdown');
  assert.equal(before.left.text, '1m');
  const at = pillState(new Date('2026-09-28T12:00:00Z'), issues);
  assert.equal(at.kind, 'result');
  assert.equal(at.quorum, true);
  assert.equal(at.picks, 1);
  const late = pillState(new Date('2026-09-28T20:14:00Z'), issues);
  assert.equal(late.kind, 'result');
  assert.equal(pillState(new Date('2026-09-28T20:16:00Z'), issues).kind, 'countdown');
});

test('never reports a result the data does not contain', () => {
  const st = pillState(new Date('2026-09-29T12:30:00Z'), issues); // 14:30 on 29.09, not in data
  assert.equal(st.kind, 'countdown');
  assert.equal(st.slot.issueDate, '2026-09-30');
});

test('weekend countdown runs to Monday, in days and hours', () => {
  const st = pillState(new Date('2026-09-26T10:00:00Z'), issues); // Saturday 12:00 CEST
  assert.equal(st.slot.issueDate, '2026-09-28');
  assert.equal(st.left.text, '2d 2h');
});

test('remaining() and minute alignment', () => {
  assert.equal(remaining(59 * 60000).text, '59m');
  assert.equal(remaining(61 * 60000).text, '1h 1m');
  assert.ok(msToNextMinute(Date.UTC(2026, 8, 28, 12, 0, 30)) <= 30020);
});
