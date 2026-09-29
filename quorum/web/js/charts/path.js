// The pick's path (pick note): net return vs the benchmark total return, day 0 (entry at the US open)
// to day 21 (exit at the open). 21 trading days across rules 1–4, seven a bay, so days 7 and 14 sit on
// rules 2 and 3. An open pick draws what has happened so far and the planned exit on rule 4.
import { h, svg } from '../dom.js';
import { linear, domainWithZero, ticks, pointsAttr } from './scale.js';
import { crosshair } from './hover.js';
import { signed } from '../ui.js';
import { addTradingDays } from '../core/calendar.js';
import { fmtUsd } from '../core/format.js';

export const HORIZON = 21;

// Pure (tested): where the two end labels go, in plot units (0–1000, top to bottom). Each starts at its
// series' last value, keeps clear of the zero line (the label goes to the side of zero its value is on)
// and of the other label, and stays inside the plot. gap is about one label height at the usual sizes.
export function endLabelYs(m, net, bench, { gap = 110, zeroGap = 60 } = {}) {
  const clampY = (y) => Math.min(1000 - gap / 2, Math.max(gap / 2, y));
  const off = (v) => {
    let y = m.y(v);
    if (Math.abs(y - m.zero) < zeroGap) y = v >= 0 ? m.zero - zeroGap : m.zero + zeroGap;
    return clampY(y);
  };
  let a = off(net);
  let b = off(bench);
  if (Math.abs(a - b) < gap) {
    const mid = (a + b) / 2;
    const netUp = a < b || (a === b && net >= bench);
    const up = clampY(mid - gap / 2);
    const down = clampY(up + gap);
    [a, b] = netUp ? [up, down] : [down, up];
    if (Math.abs(a - b) < gap) [a, b] = netUp ? [down - gap, down] : [down, down - gap];
  }
  return [a, b];
}

// Pure (tested): what row i of a path is. The published path opens with two day-0 rows, the entry at the
// US open (net of costs) and then that day's close; an older one-row day 0 is just "day 0".
export function pathStep(rows, i) {
  const d = rows[i]?.[0];
  if (d !== 0) return 'day';
  if (i === 0) return rows[1]?.[0] === 0 ? 'entry' : 'day';
  return 'close0';
}

// Pure geometry (tested): x of a day on 0–1000, y domain with zero, and the points of both series.
export function pathModel(path, horizon = HORIZON) {
  const rows = (path ?? []).filter((r) => Array.isArray(r) && Number.isFinite(r[0]));
  const [lo, hi] = domainWithZero(
    rows.flatMap((r) => [r[1], r[2]]),
    0.12,
  );
  const x = linear(0, horizon, 0, 1000);
  const y = linear(lo, hi, 1000, 0);
  return {
    rows,
    x,
    y,
    lo,
    hi,
    net: rows.map((r) => [x(r[0]), y(r[1])]),
    bench: rows.map((r) => [x(r[0]), y(r[2])]),
    zero: y(0),
    last: rows[rows.length - 1] ?? [0, 0, 0],
  };
}

export function pathChart(pick, { fmt, L, final, locale = 'en' }) {
  const usd = (v) => (Number.isFinite(v) ? fmtUsd(v, { locale }) : '–');
  const m = pathModel(pick.path);
  if (m.rows.length < 2) return pathPending(pick, { fmt, L, usd });
  const entryDate = pick.entry?.date ?? pick.issueDate;
  const exitDate = pick.exit?.date ?? pick.exitPlanned;
  const yTicks = ticks(m.lo, m.hi, 4);

  const plot = h('div', { class: 'path-plot' });
  const s = svg(
    'svg',
    { class: 'path-svg', viewBox: '0 0 1000 1000', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
    ...yTicks.map((v) => svg('line', { class: v === 0 ? 'path-zero' : 'path-grid', x1: 0, x2: 1000, y1: m.y(v), y2: m.y(v) })),
    final ? null : svg('line', { class: 'path-rest', x1: m.x(m.last[0]), x2: 1000, y1: m.y(m.last[1]), y2: m.y(m.last[1]) }),
    svg('polyline', { class: 'path-bench', points: pointsAttr(m.bench) }),
    svg('polyline', { class: 'path-net', points: pointsAttr(m.net) }),
  );
  plot.append(s);
  for (const v of yTicks) {
    // below 1024 the ticks sit inside the plot, just above their line (just below it near the top edge)
    const tk = h('span', { class: ['path-tick', v === 0 && 'is-zero', m.y(v) < 90 && 'is-top'] }, v === 0 ? '0' : fmt.pct(v, { digits: Math.abs(v) < 0.1 ? 1 : 0, sign: true }));
    tk.style.setProperty('--y', `${m.y(v) / 10}%`);
    plot.append(tk);
  }
  // markers: entry on rule 1, exit (or the planned exit) on rule 4, the latest mark for open picks
  const marker = (cls, xPos, top, bottom) => {
    const el = h('span', { class: ['path-mark', cls] }, h('span', { class: 'path-mark__k label' }, top), h('span', { class: 'path-mark__v mono' }, bottom));
    el.style.setProperty('--x', `${xPos / 10}%`);
    return el;
  };
  plot.append(marker('is-entry', 0, L('Entry · US open', 'Vstop · odprtje ZDA'), `${fmt.date(entryDate)} · ${usd(pick.entry?.open)}`));
  plot.append(
    marker(
      final ? 'is-exit' : 'is-planned',
      1000,
      final ? L('Exit · US open', 'Izstop · odprtje ZDA') : L('Planned exit · US open', 'Načrtovan izstop · odprtje ZDA'),
      final ? `${fmt.date(exitDate)} · ${usd(pick.exit?.open)}` : fmt.date(exitDate),
    ),
  );
  // end labels (text wears text tokens; the signed value carries sign and arrow)
  const endNet = h('span', { class: 'path-end is-net' }, h('span', { class: 'label' }, L('Net', 'Neto')), ' ', signed(m.last[1], { fmt }));
  const endBench = h('span', { class: 'path-end is-bench' }, h('span', { class: 'label' }, L('S&P 500 TR', 'S&P 500 TR')), ' ', signed(m.last[2], { fmt }));
  const [yNet, yBench] = endLabelYs(m, m.last[1], m.last[2]);
  endNet.style.setProperty('--y', `${yNet / 10}%`);
  endBench.style.setProperty('--y', `${yBench / 10}%`);
  endNet.style.setProperty('--x', `${m.x(m.last[0]) / 10}%`);
  endBench.style.setProperty('--x', `${m.x(m.last[0]) / 10}%`);
  plot.append(endNet, endBench);

  const readout = h('p', { class: 'path-readout mono' });
  const xs = m.rows.map((r) => m.x(r[0]));
  const dayLabel = (d) => fmt.date(addTradingDays(entryDate, d));
  const stepName = (i, d, cap) => {
    const k = pathStep(m.rows, i);
    const en = k === 'entry' ? 'entry · US open' : k === 'close0' ? 'day-0 close' : `day ${d}`;
    const sl = k === 'entry' ? 'vstop · odprtje ZDA' : k === 'close0' ? 'zaprtje dneva 0' : `dan ${d}`;
    const up = (t) => (cap ? t[0].toUpperCase() + t.slice(1) : t);
    return { en: up(en), sl: up(sl) };
  };
  crosshair(plot, {
    xs,
    readout,
    label: L('Path of the pick: use the arrow keys to read each trading day.', 'Pot izbire: s puščicami preberete vsak trgovalni dan.'),
    render: (i) => {
      const [d, net, bench] = m.rows[i];
      const what = stepName(i, d, true);
      return L(
        `${what.en} · ${dayLabel(d)} · net ${fmt.pct(net, { sign: true })} · benchmark ${fmt.pct(bench, { sign: true })} · excess ${fmt.pct(net - bench, { sign: true })}`,
        `${what.sl} · ${dayLabel(d)} · neto ${fmt.pct(net, { sign: true })} · merilo ${fmt.pct(bench, { sign: true })} · presežek ${fmt.pct(net - bench, { sign: true })}`,
      );
    },
  });

  const days = h(
    'div',
    { class: 'path-days', 'aria-hidden': 'true' },
    [0, 7, 14, 21].map((d) => {
      const el = h('span', { class: 'path-day' }, d === 0 ? L('day 0', 'dan 0') : String(d));
      el.style.setProperty('--x', `${(d / HORIZON) * 100}%`);
      return el;
    }),
  );

  const alt = h(
    'div',
    { class: 'visually-hidden' },
    h(
      'table',
      {},
      h('caption', {}, L('Net return and benchmark return by trading day since entry', 'Neto donos in donos merila po trgovalnih dneh od vstopa')),
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          [L('Day', 'Dan'), L('Date', 'Datum'), L('Net', 'Neto'), L('Benchmark', 'Merilo')].map((x) => h('th', { scope: 'col' }, x)),
        ),
      ),
      h(
        'tbody',
        {},
        m.rows.map(([d, n, b], i) =>
          h(
            'tr',
            {},
            h('th', { scope: 'row' }, pathStep(m.rows, i) === 'day' ? String(d) : L(stepName(i, d).en, stepName(i, d).sl)),
            h('td', {}, dayLabel(d)),
            h('td', {}, fmt.pct(n, { sign: true })),
            h('td', {}, fmt.pct(b, { sign: true })),
          ),
        ),
      ),
    ),
  );

  const legend = h(
    'ul',
    { class: 'path-legend', 'aria-hidden': 'true' },
    h('li', {}, h('span', { class: 'key key--net' }), L('Net of costs', 'Po stroških')),
    h('li', {}, h('span', { class: 'key key--bench' }), L('S&P 500 TR (simulated)', 'S&P 500 TR (simulirano)')),
  );

  return h('figure', { class: 'path-fig c-full flush' }, legend, plot, days, readout, alt);
}

// Entered today: the path starts with the next close. The empty plot keeps its 21-day axis and says so.
function pathPending(pick, { fmt, L, usd }) {
  const days = h(
    'div',
    { class: 'path-days', 'aria-hidden': 'true' },
    [0, 7, 14, 21].map((d) => {
      const el = h('span', { class: 'path-day' }, d === 0 ? L('day 0', 'dan 0') : String(d));
      el.style.setProperty('--x', `${(d / HORIZON) * 100}%`);
      return el;
    }),
  );
  const mark = pick.mark;
  return h(
    'figure',
    { class: 'path-fig is-pending c-full flush' },
    h(
      'div',
      { class: 'path-plot path-plot--pending' },
      h('span', { class: 'path-start', 'aria-hidden': 'true' }),
      h(
        'p',
        { class: 'path-pending' },
        L(
          `Entered at the US open on ${fmt.date(pick.entry?.date)} at ${usd(pick.entry?.open)}. The path is drawn from the next trading day's close, one point a day, to the exit on ${fmt.date(pick.exitPlanned)}.`,
          `Vstop ob odprtju ameriškega trga ${fmt.date(pick.entry?.date)} po ${usd(pick.entry?.open)}. Pot se riše od zaprtja naslednjega trgovalnega dne, ena točka na dan, do izstopa ${fmt.date(pick.exitPlanned)}.`,
        ),
        mark ? h('span', { class: 'path-pending__mark' }, L(` Marked to the ${fmt.date(mark.date)} close: net ${fmt.pct(mark.net, { sign: true })}, benchmark ${fmt.pct(mark.bench, { sign: true })}.`, ` Vrednoteno ob zaprtju ${fmt.date(mark.date)}: neto ${fmt.pct(mark.net, { sign: true })}, merilo ${fmt.pct(mark.bench, { sign: true })}.`)) : null,
      ),
    ),
    days,
  );
}
