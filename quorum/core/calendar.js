// The NYSE trading calendar and the two clocks Quorum lives on:
// issues publish at 14:00 Europe/Ljubljana, entries fill at the 09:30 New York open.
// Dates are 'YYYY-MM-DD' strings throughout; instants are Date objects or ISO strings with an offset.

export const LJUBLJANA = 'Europe/Ljubljana';
export const NEW_YORK = 'America/New_York';

const DAY_MS = 86400000;

// Unscheduled closures (national mourning, weather). Early closes do not matter to an open-to-open book.
const SPECIAL_CLOSURES = {
  '2001-09-11': 'Markets closed (September 11)',
  '2001-09-12': 'Markets closed (September 11)',
  '2001-09-13': 'Markets closed (September 11)',
  '2001-09-14': 'Markets closed (September 11)',
  '2004-06-11': 'National Day of Mourning (Reagan)',
  '2007-01-02': 'National Day of Mourning (Ford)',
  '2012-10-29': 'Hurricane Sandy',
  '2012-10-30': 'Hurricane Sandy',
  '2018-12-05': 'National Day of Mourning (G. H. W. Bush)',
  '2025-01-09': 'National Day of Mourning (Carter)',
};

// ---- date helpers ------------------------------------------------------------------------------

function pad(n, w = 2) {
  return String(n).padStart(w, '0');
}

export function toUTCDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fromUTCDate(dt) {
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addDays(date, n) {
  return fromUTCDate(new Date(toUTCDate(date).getTime() + n * DAY_MS));
}

// 0 = Sunday … 6 = Saturday
export function weekday(date) {
  return toUTCDate(date).getUTCDay();
}

export function monthKey(date) {
  return date.slice(0, 7);
}

function ymd(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

// n-th given weekday of a month (n = 1..5), or the last one when n = -1.
function nthWeekday(y, m, dow, n) {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const day = 1 + ((dow - first + 7) % 7) + (n - 1) * 7;
    return ymd(y, m, day);
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lastDow = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay();
  return ymd(y, m, lastDay - ((lastDow - dow + 7) % 7));
}

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
function easterSunday(y) {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(y, month, day);
}

// NYSE Rule 7.2 observance: Saturday moves to the Friday before, Sunday to the Monday after.
function observed(date) {
  const dow = weekday(date);
  if (dow === 6) return addDays(date, -1);
  if (dow === 0) return addDays(date, 1);
  return date;
}

const holidayCache = new Map();

function holidaysOf(y) {
  if (holidayCache.has(y)) return holidayCache.get(y);
  const map = new Map();
  // New Year's Day on a Saturday is not observed on 31 Dec (end of the accounting year).
  const ny = ymd(y, 1, 1);
  if (weekday(ny) === 0) map.set(ymd(y, 1, 2), "New Year's Day (observed)");
  else if (weekday(ny) !== 6) map.set(ny, "New Year's Day");
  if (y >= 1998) map.set(nthWeekday(y, 1, 1, 3), 'Martin Luther King Jr. Day');
  map.set(nthWeekday(y, 2, 1, 3), "Washington's Birthday");
  map.set(addDays(easterSunday(y), -2), 'Good Friday');
  map.set(nthWeekday(y, 5, 1, -1), 'Memorial Day');
  if (y >= 2022) {
    const j = ymd(y, 6, 19);
    map.set(observed(j), observed(j) === j ? 'Juneteenth' : 'Juneteenth (observed)');
  }
  const jul4 = ymd(y, 7, 4);
  map.set(observed(jul4), observed(jul4) === jul4 ? 'Independence Day' : 'Independence Day (observed)');
  map.set(nthWeekday(y, 9, 1, 1), 'Labor Day');
  map.set(nthWeekday(y, 11, 4, 4), 'Thanksgiving Day');
  const xmas = ymd(y, 12, 25);
  map.set(observed(xmas), observed(xmas) === xmas ? 'Christmas Day' : 'Christmas Day (observed)');
  for (const [d, name] of Object.entries(SPECIAL_CLOSURES)) {
    if (d.startsWith(`${y}-`)) map.set(d, name);
  }
  holidayCache.set(y, map);
  return map;
}

export function holidayName(date) {
  return holidaysOf(Number(date.slice(0, 4))).get(date) ?? null;
}

export function isHoliday(date) {
  return holidayName(date) !== null;
}

export function isTradingDay(date) {
  const dow = weekday(date);
  return dow !== 0 && dow !== 6 && !isHoliday(date);
}

export function nextTradingDay(date) {
  let d = addDays(date, 1);
  while (!isTradingDay(d)) d = addDays(d, 1);
  return d;
}

export function prevTradingDay(date) {
  let d = addDays(date, -1);
  while (!isTradingDay(d)) d = addDays(d, -1);
  return d;
}

// n trading days after (n > 0) or before (n < 0) the given date.
// n = 0 returns the date itself when it trades, else the next trading day.
export function addTradingDays(date, n) {
  if (n === 0) return isTradingDay(date) ? date : nextTradingDay(date);
  let d = date;
  const step = n > 0 ? nextTradingDay : prevTradingDay;
  for (let i = 0; i < Math.abs(n); i++) d = step(d);
  return d;
}

// Inclusive list of trading days from `from` to `to`.
export function tradingDaysBetween(from, to) {
  const out = [];
  let d = isTradingDay(from) ? from : nextTradingDay(from);
  while (d <= to) {
    out.push(d);
    d = nextTradingDay(d);
  }
  return out;
}

// Trading days in the half-open interval (from, to].
export function countTradingDays(from, to) {
  if (to <= from) return 0;
  let n = 0;
  let d = nextTradingDay(from);
  while (d <= to) {
    n++;
    d = nextTradingDay(d);
  }
  return n;
}

// ---- time zones --------------------------------------------------------------------------------

const fmtCache = new Map();

function zoneFormatter(timeZone) {
  if (!fmtCache.has(timeZone)) {
    fmtCache.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    );
  }
  return fmtCache.get(timeZone);
}

function zoneParts(instant, timeZone) {
  const parts = {};
  for (const p of zoneFormatter(timeZone).formatToParts(instant)) parts[p.type] = p.value;
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    hh: Number(parts.hour),
    mm: Number(parts.minute),
    ss: Number(parts.second),
  };
}

export function tzOffsetMinutes(instant, timeZone) {
  const t = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
  const whole = Math.floor(t / 1000) * 1000;
  const p = zoneParts(new Date(whole), timeZone);
  const asUTC = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return Math.round((asUTC - whole) / 60000);
}

// The instant at which the wall clock in `timeZone` reads `date time`.
export function zonedToInstant(date, time, timeZone) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm, ss = 0] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  const off1 = tzOffsetMinutes(new Date(guess), timeZone);
  let t = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(new Date(t), timeZone);
  if (off2 !== off1) t = guess - off2 * 60000;
  return new Date(t);
}

function offsetString(minutes) {
  const sign = minutes < 0 ? '-' : '+';
  const a = Math.abs(minutes);
  return `${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export function formatInZone(instant, timeZone) {
  const dt = instant instanceof Date ? instant : new Date(instant);
  const p = zoneParts(dt, timeZone);
  const offset = offsetString(tzOffsetMinutes(dt, timeZone));
  const date = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  const time = `${pad(p.hh)}:${pad(p.mm)}:${pad(p.ss)}`;
  return { date, time, offset, iso: `${date}T${time}${offset}` };
}

export function toUtcIso(instant) {
  return new Date(instant).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// ---- the issue slot ----------------------------------------------------------------------------

export function issueSlot(date) {
  const publish = zonedToInstant(date, '14:00:00', LJUBLJANA);
  const seal = zonedToInstant(date, '13:45:00', LJUBLJANA);
  const usOpen = zonedToInstant(date, '09:30:00', NEW_YORK);
  const ljOffset = tzOffsetMinutes(publish, LJUBLJANA);
  return {
    issueDate: date,
    publishAt: formatInZone(publish, LJUBLJANA).iso,
    publishAtUtc: toUtcIso(publish),
    sealAt: formatInZone(seal, LJUBLJANA).iso,
    tzLabel: ljOffset === 120 ? 'CEST' : 'CET',
    usOpenAt: formatInZone(usOpen, NEW_YORK).iso,
    usOpenLocal: formatInZone(usOpen, LJUBLJANA).time.slice(0, 5),
    minutesToOpen: Math.round((usOpen.getTime() - publish.getTime()) / 60000),
  };
}

// The first issue slot strictly after `now`.
export function nextIssueSlot(now) {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  let d = formatInZone(new Date(t), LJUBLJANA).date;
  if (!isTradingDay(d)) d = nextTradingDay(d);
  for (;;) {
    const slot = issueSlot(d);
    if (new Date(slot.publishAtUtc).getTime() > t) return slot;
    d = nextTradingDay(d);
  }
}

// ---- formatting --------------------------------------------------------------------------------

export function fmtDDMMYY(date) {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(2, 4)}`;
}

export function fmtDDMM(date) {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.`;
}

export function fmtDM(date) {
  return `${Number(date.slice(8, 10))}.${Number(date.slice(5, 7))}.`;
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_SL = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'avg.', 'sep.', 'okt.', 'nov.', 'dec.'];

export function fmtLong(date, locale = 'en') {
  const y = date.slice(0, 4);
  const m = Number(date.slice(5, 7)) - 1;
  const d = Number(date.slice(8, 10));
  return locale === 'sl' ? `${d}. ${MONTHS_SL[m]} ${y}` : `${d} ${MONTHS_EN[m]} ${y}`;
}
