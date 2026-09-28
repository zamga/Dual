import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarLayout, cellText } from '../../web/js/charts/silence-calendar.js';
import { tradingDaysBetween } from '../../web/js/core/calendar.js';
import { formatters } from '../../web/js/i18n.js';

const days = tradingDaysBetween('2025-10-01', '2026-09-28');
const issues = days.map((date, i) => ({ date, nScored: 1400, closest: i % 5 === 0 ? 3 : 2, quorum: i % 5 === 0, buys: i % 5 === 0 ? ['0001'] : [], renews: [], closes: [] }));

test('one cell per issue, twelve months, weekdays Mon-Fri', () => {
  const months = calendarLayout(issues);
  assert.equal(months.length, 12);
  assert.equal(months.reduce((a, m) => a + m.cells.length, 0), issues.length);
  for (const m of months) for (const c of m.cells) assert.ok(c.wd >= 0 && c.wd <= 4);
  // 1 Oct 2025 is a Wednesday: weekday index 2 in week 0
  assert.equal(months[0].cells[0].wd, 2);
  assert.equal(months[0].cells[0].wk, 0);
  assert.ok(months.every((m) => m.weeks <= 6));
});

test('cell text matches the brief format', () => {
  const fmt = formatters('en');
  const L = (en) => en;
  assert.equal(cellText({ date: '2026-09-28', nScored: 1402, closest: 2, quorum: false, closes: [] }, { fmt, L }), '28.09.26 · 1,402 scored · closest 2/4');
  assert.match(cellText({ date: '2026-09-28', nScored: 1384, closest: 3, quorum: true, buys: ['0055'], renews: [] }, { fmt, L }), /quorum 3\/4 · #0055$/);
});
