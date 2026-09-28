import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../../core/calendar.js';

test('holding period examples from the brief', () => {
  assert.equal(c.addTradingDays('2026-09-28', 21), '2026-10-27');
  assert.equal(c.addTradingDays('2026-10-27', 21), '2026-11-25');
  assert.equal(c.addTradingDays('2026-10-27', -21), '2026-09-28');
  assert.equal(c.addTradingDays('2026-09-26', 0), '2026-09-28');
});

test('issue slot follows EU and US daylight saving', () => {
  const sep = c.issueSlot('2026-09-28');
  assert.equal(sep.publishAt, '2026-09-28T14:00:00+02:00');
  assert.equal(sep.publishAtUtc, '2026-09-28T12:00:00Z');
  assert.equal(sep.sealAt, '2026-09-28T13:45:00+02:00');
  assert.equal(sep.tzLabel, 'CEST');
  assert.equal(sep.usOpenAt, '2026-09-28T09:30:00-04:00');
  assert.equal(sep.usOpenLocal, '15:30');
  assert.equal(sep.minutesToOpen, 90);
  const gap = c.issueSlot('2026-10-27'); // EU on CET, US still on EDT
  assert.equal(gap.tzLabel, 'CET');
  assert.equal(gap.usOpenLocal, '14:30');
  assert.equal(gap.minutesToOpen, 30);
  const nov = c.issueSlot('2026-11-25');
  assert.equal(nov.usOpenLocal, '15:30');
  assert.equal(nov.publishAt, '2026-11-25T14:00:00+01:00');
  const mar = c.issueSlot('2026-03-16'); // US on EDT, EU still on CET
  assert.equal(mar.usOpenLocal, '14:30');
});

test('NYSE holidays and observance', () => {
  assert.equal(c.holidayName('2026-04-03'), 'Good Friday');
  assert.equal(c.holidayName('2026-07-03'), 'Independence Day (observed)');
  assert.equal(c.holidayName('2026-11-26'), 'Thanksgiving Day');
  assert.equal(c.holidayName('2021-12-24'), 'Christmas Day (observed)');
  assert.equal(c.holidayName('2021-12-31'), null, 'New Year on a Saturday is not observed on Friday');
  assert.equal(c.holidayName('2027-06-18'), 'Juneteenth (observed)');
  assert.equal(c.holidayName('2021-06-18'), null, 'Juneteenth only from 2022');
  assert.equal(c.holidayName('2025-01-09'), 'National Day of Mourning (Carter)');
  assert.equal(c.isTradingDay('2012-10-29'), false);
  assert.equal(c.isTradingDay('2026-10-12'), true, 'Columbus Day trades');
  assert.equal(c.isTradingDay('2026-11-11'), true, 'Veterans Day trades');
});

test('trading days per year match published NYSE counts', () => {
  const expected = { 2012: 250, 2015: 252, 2018: 251, 2020: 253, 2022: 251, 2023: 250, 2024: 252, 2025: 250 };
  for (const [y, n] of Object.entries(expected)) {
    assert.equal(c.tradingDaysBetween(`${y}-01-01`, `${y}-12-31`).length, n, y);
  }
  assert.equal(c.countTradingDays('2026-09-28', '2026-10-27'), 21);
  assert.equal(c.countTradingDays('2026-09-28', '2026-09-28'), 0);
});

test('next issue slot', () => {
  assert.equal(c.nextIssueSlot(new Date('2026-09-28T11:59:00Z')).issueDate, '2026-09-28');
  assert.equal(c.nextIssueSlot(new Date('2026-09-28T12:00:00Z')).issueDate, '2026-09-29');
  assert.equal(c.nextIssueSlot(new Date('2026-10-02T20:00:00Z')).issueDate, '2026-10-05');
  assert.equal(c.nextIssueSlot(new Date('2026-11-25T20:00:00Z')).issueDate, '2026-11-27');
});

test('formatting', () => {
  assert.equal(c.fmtDDMMYY('2026-09-28'), '28.09.26');
  assert.equal(c.fmtDDMM('2026-09-28'), '28.09.');
  assert.equal(c.fmtDM('2026-09-28'), '28.9.');
  assert.equal(c.fmtLong('2026-09-28', 'en'), '28 Sep 2026');
  assert.equal(c.fmtLong('2026-05-04', 'sl'), '4. maj 2026');
});
