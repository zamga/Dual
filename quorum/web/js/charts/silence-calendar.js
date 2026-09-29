// The Silence Calendar: one cell per issue since the sealed record began.
// Hollow = an issue published with no quorum. Ultramarine = a quorum (a pick).
// A small base tick marks days with an exit (CLOSE, a text-worthy item) and no new pick.
// Desktop: 12 months across rules 1–4, four months per bay; each month is weeks × weekdays.
// Below 1024 px: one row per month. Cells are links to #issue-DATE with a roving tabindex.
import { h } from '../dom.js';
import { href } from '../router.js';
import { weekday } from '../core/calendar.js';

// Pure layout: month groups with week and day indices (tested in tests/web).
export function calendarLayout(issues) {
  const months = [];
  let cur = null;
  for (const row of issues) {
    const key = row.date.slice(0, 7);
    if (!cur || cur.key !== key) {
      cur = { key, days: [] };
      months.push(cur);
    }
    cur.days.push(row);
  }
  for (const m of months) {
    const first = `${m.key}-01`;
    // Monday-based week index from the first calendar day of the month
    const firstDow = (weekday(first) + 6) % 7; // 0 = Monday
    m.cells = m.days.map((row, i) => {
      const dom = Number(row.date.slice(8, 10));
      const wd = (weekday(row.date) + 6) % 7; // 0..4 on trading days
      const wk = Math.floor((dom - 1 + firstDow) / 7);
      return { row, wd, wk, di: i };
    });
    m.weeks = Math.max(...m.cells.map((c) => c.wk)) + 1;
  }
  return months;
}

export function cellText(row, { fmt, L }) {
  const base = `${fmt.date(row.date)} · ${L(`${fmt.int(row.nScored)} scored`, `${fmt.int(row.nScored)} ocenjenih`)}`;
  if (row.quorum) {
    const nos = [...(row.buys ?? []), ...(row.renews ?? [])].map((n) => `#${n}`).join(', ');
    return `${base} · ${L('quorum', 'kvorum')} ${row.closest}/4 · ${nos}`;
  }
  const exits = row.closes?.length ? ` · ${L('exit', 'izstop')} ${row.closes.map((n) => `#${n}`).join(', ')}` : '';
  // a day whose qualifying stocks were all held, capped or cooling down is "no new pick", not "no quorum"
  const met = (row.closest ?? 0) >= (row.required ?? 3) && (row.reached ?? 0) > 0;
  return `${base} · ${met ? L(`${row.closest}/4 met, no new pick`, `${row.closest}/4 izpolnjeno, brez nove izbire`) : `${L('closest', 'največ')} ${row.closest}/4`}${exits}`;
}

const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  sl: ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec'],
};

export function silenceCalendar(issues, { fmt, L, locale, onReadout }) {
  const months = calendarLayout(issues);
  const all = [];
  const monthEls = months.map((m, mi) => {
    const [y, mo] = m.key.split('-').map(Number);
    const showYear = mi === 0 || mo === 1;
    const cells = m.cells.map((c) => {
      const r = c.row;
      const kind = r.quorum ? 'q' : r.closes?.length ? 'x' : 'n';
      const text = cellText(r, { fmt, L });
      const a = h('a', {
        class: `sc-cell sc-${kind}`,
        href: href('issue', r.date),
        tabindex: '-1',
        'aria-label': text,
        dataset: { date: r.date },
      });
      a.style.setProperty('--wd', String(c.wd + 1));
      a.style.setProperty('--wk', String(c.wk + 1));
      a.style.setProperty('--di', String(c.di + 1));
      all.push({ el: a, row: r, text, mi, wd: c.wd });
      return a;
    });
    return h(
      'li',
      { class: 'sc-month' },
      h('span', { class: 'sc-mlabel', 'aria-hidden': 'true' }, `${MONTHS[locale]?.[mo - 1] ?? MONTHS.en[mo - 1]}`, showYear ? h('span', { class: 'sc-year' }, ` ${String(y).slice(2)}`) : null),
      h('div', { class: 'sc-days' }, cells),
    );
  });

  let active = all.length - 1;
  const setActive = (i, focus = true) => {
    i = Math.max(0, Math.min(all.length - 1, i));
    all[active].el.tabIndex = -1;
    active = i;
    all[active].el.tabIndex = 0;
    if (focus) all[active].el.focus();
    onReadout?.(all[active]);
  };
  if (all.length) all[active].el.tabIndex = 0;

  const list = h('ol', { class: 'sc-months', role: 'list' }, monthEls);
  list.addEventListener('keydown', (e) => {
    const idx = all.findIndex((x) => x.el === document.activeElement);
    if (idx < 0) return;
    const d = all[idx].row.date;
    const findByDate = (target, dir) => {
      // nearest issue on or beyond target in direction dir
      if (dir > 0) {
        const j = all.findIndex((x) => x.row.date >= target);
        return j < 0 ? all.length - 1 : j;
      }
      for (let j = all.length - 1; j >= 0; j--) if (all[j].row.date <= target) return j;
      return 0;
    };
    const shift = (days) => {
      const t = new Date(`${d}T12:00:00Z`);
      t.setUTCDate(t.getUTCDate() + days);
      return t.toISOString().slice(0, 10);
    };
    let next = null;
    switch (e.key) {
      case 'ArrowRight':
        next = idx + 1;
        break;
      case 'ArrowLeft':
        next = idx - 1;
        break;
      case 'ArrowDown':
        next = findByDate(shift(7), 1);
        break;
      case 'ArrowUp':
        next = findByDate(shift(-7), -1);
        break;
      case 'PageDown':
        next = all.findIndex((x) => x.mi === all[idx].mi + 1);
        if (next < 0) next = all.length - 1;
        break;
      case 'PageUp':
        next = all.findIndex((x) => x.mi === all[idx].mi - 1);
        if (next < 0) next = 0;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = all.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    setActive(next);
  });
  list.addEventListener('focusin', (e) => {
    const i = all.findIndex((x) => x.el === e.target);
    if (i >= 0) setActive(i, false);
  });
  list.addEventListener('pointerover', (e) => {
    const i = all.findIndex((x) => x.el === e.target);
    if (i >= 0) onReadout?.(all[i]);
  });

  onReadout?.(all[active]);
  return { el: list, cells: all, months };
}
