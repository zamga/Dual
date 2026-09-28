// Small server helpers shared by the route modules.
import { createHash } from 'node:crypto';
import { randomToken } from '../core/hash.js';
import { formatInZone, zonedToInstant, addDays } from '../core/calendar.js';

export const DAY_MS = 86_400_000;

// newId('usr') -> 'usr_' + 16 base62 characters (CSPRNG)
export function newId(prefix) {
  return `${prefix}_${randomToken(16)}`;
}

export function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

export function iso(d) {
  return (d instanceof Date ? d : new Date(d)).toISOString();
}

export function addMs(d, ms) {
  return new Date((d instanceof Date ? d : new Date(d)).getTime() + ms);
}

export function fromUnix(sec) {
  return sec == null ? null : new Date(sec * 1000).toISOString();
}

export function isEmail(s) {
  return typeof s === 'string' && s.length <= 254 && /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/.test(s);
}

export function normEmail(s) {
  return String(s ?? '').trim().toLowerCase();
}

export function normLocale(s) {
  return s === 'sl' ? 'sl' : 'en';
}

// quietHoursNextAllowed(now, timeZone, { start: '08:00', end: '21:00' }) -> null when sending is
// allowed now, else the Date of the next allowed instant (the next local `start`).
export function quietHoursNextAllowed(now, timeZone, { start = '08:00', end = '21:00' } = {}) {
  const local = formatInZone(now, timeZone);
  const hm = local.time.slice(0, 5);
  if (hm >= start && hm < end) return null;
  const day = hm < start ? local.date : addDays(local.date, 1);
  return zonedToInstant(day, start, timeZone);
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// A quiet logger for tests; the default logger writes one line per event to the console.
export function createLogger({ quiet = false } = {}) {
  if (quiet) return { info() {}, warn() {}, error() {} };
  return {
    info: (...a) => console.log(...a),
    warn: (...a) => console.warn(...a),
    error: (...a) => console.error(...a),
  };
}
