// A multi-series line chart over dates (backtest equity curves, the ledger's follow-every-pick index).
// Series are told apart by stroke (solid, dashed, dotted, thin), never by a new colour; each is labelled
// at its end and in a legend. Shaded bands mark periods (crash switch, holdout). One axis only.
// The crosshair (keyboard too) reads every series on a date.
import { h, svg } from '../dom.js';
import { linear, logScale, extent, ticks as linTicks, logTicks, pointsAttr } from './scale.js';
import { crosshair } from './hover.js';

// Pure: thin a long series to at most n points (keeps the first and the last).
export function thin(n, len) {
  if (len <= n) return Array.from({ length: len }, (_, i) => i);
  const out = [];
  for (let k = 0; k < n; k++) out.push(Math.round((k * (len - 1)) / (n - 1)));
  return [...new Set(out)];
}

// Pure: the y domain and ticks for a set of series (log for growth over many years).
export function yAxis(values, { log = false, pad = 0.06 } = {}) {
  let [lo, hi] = extent(values);
  if (log) {
    lo = Math.max(1e-3, lo) / (1 + pad);
    hi *= 1 + pad;
    return { lo, hi, ticks: logTicks(lo, hi), scale: logScale(lo, hi, 1000, 0) };
  }
  const span = hi - lo || 0.01;
  lo -= span * pad;
  hi += span * pad;
  return { lo, hi, ticks: linTicks(lo, hi, 5), scale: linear(lo, hi, 1000, 0) };
}

// series: [{ key, label, values: number[], style: 'main'|'bench'|'shadow'|'fam', end?: string }]
// A diagonal hatch (an architect's section fill): marks a plot as hypothetical. Pixel pattern, not stretched.
let hatchN = 0;
export function hatchLayer(cls = 'hatch') {
  const id = `hatch-${++hatchN}`;
  return svg(
    'svg',
    { class: cls, 'aria-hidden': 'true', focusable: 'false' },
    svg('defs', {}, svg('pattern', { id, width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, svg('line', { class: 'hatch__l', x1: 0, y1: 0, x2: 0, y2: 7 }))),
    svg('rect', { width: '100%', height: '100%', fill: `url(#${id})` }),
  );
}

export function lineChart({ dates, series, log = false, bands = [], markers = [], yLabel, valueLabel, readout: renderReadout, label, legendLabel, altCaption, dateLabel, className = '', hatch = false }) {
  const n = dates.length;
  const x = linear(0, Math.max(1, n - 1), 0, 1000);
  const Y = yAxis(series.flatMap((s) => s.values), { log });
  const idx = thin(420, n);
  const dateIndex = (d) => {
    let best = 0;
    for (let i = 0; i < n; i++) if (dates[i] <= d) best = i;
    return best;
  };
  const plot = h('div', { class: 'eq-plot' });
  const bandEls = bands.map((b) => {
    const a = x(dateIndex(b.from));
    const z = x(dateIndex(b.to));
    const el = h('span', { class: ['eq-band', b.cls] }, b.label ? h('span', { class: 'eq-band__l label' }, b.label) : null);
    el.style.setProperty('--a', `${a / 10}%`);
    el.style.setProperty('--w', `${Math.max(0.3, (z - a) / 10)}%`);
    return el;
  });
  const s = svg(
    'svg',
    { class: 'eq-svg', viewBox: '0 0 1000 1000', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
    ...Y.ticks.map((v) => svg('line', { class: 'eq-grid', x1: 0, x2: 1000, y1: Y.scale(v), y2: Y.scale(v) })),
    ...[...series].reverse().map((ser) => svg('polyline', { class: `eq-line eq-line--${ser.style}`, points: pointsAttr(idx.map((i) => [x(i), Y.scale(ser.values[i])])) })),
  );
  if (hatch) plot.append(hatchLayer());
  plot.append(...bandEls, s);
  for (const v of Y.ticks) {
    const tk = h('span', { class: 'eq-tick' }, yLabel(v));
    tk.style.setProperty('--y', `${Y.scale(v) / 10}%`);
    plot.append(tk);
  }
  for (const m of markers) {
    const el = h('span', { class: 'eq-marker' }, h('span', { class: 'label' }, m.label));
    el.style.setProperty('--x', `${x(dateIndex(m.date)) / 10}%`);
    plot.append(el);
  }
  // end labels, nudged apart
  const ends = series
    .filter((ser) => ser.end)
    .map((ser) => ({ ser, y: Y.scale(ser.values[n - 1]) }))
    .sort((a, b) => a.y - b.y);
  const minGap = 40; // about 16 px at the usual plot heights
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < minGap) ends[i].y = ends[i - 1].y + minGap;
  for (const e of ends) {
    const el = h('span', { class: `eq-end eq-end--${e.ser.style}`, 'aria-hidden': 'true' }, h('span', { class: 'eq-end__k' }, e.ser.short ?? e.ser.label), ' ', h('span', { class: 'mono' }, e.ser.end));
    el.style.setProperty('--y', `${e.y / 10}%`);
    plot.append(el);
  }
  const readout = h('p', { class: 'eq-readout mono' });
  crosshair(plot, { xs: dates.map((_, i) => x(i)), readout, render: renderReadout, label });
  const legend = h(
    'ul',
    { class: 'eq-legend', 'aria-label': legendLabel },
    series.map((ser) => h('li', {}, h('span', { class: `key key--${ser.style === 'main' ? 'net' : ser.style}`, 'aria-hidden': 'true' }), ser.label)),
    bands.some((b) => b.cls === 'is-crash') ? h('li', {}, h('span', { class: 'key-band', 'aria-hidden': 'true' }), bands.find((b) => b.cls === 'is-crash').legend) : null,
  );
  const years = h(
    'div',
    { class: 'eq-years', 'aria-hidden': 'true' },
    yearTicks(dates).map(([i, yv]) => {
      const el = h('span', { class: 'eq-year' }, yv);
      el.style.setProperty('--x', `${x(i) / 10}%`);
      return el;
    }),
  );
  // text alternative: every series at each year end (or month end for short series)
  const long = n > 60;
  const picks = [];
  dates.forEach((d, i) => {
    const next = dates[i + 1];
    if (!next || (long ? next.slice(0, 4) !== d.slice(0, 4) : next.slice(0, 7) !== d.slice(0, 7))) picks.push(i);
  });
  const fmtV = valueLabel ?? yLabel;
  const alt = h(
    'div',
    { class: 'visually-hidden' },
    h(
      'table',
      {},
      h('caption', {}, altCaption ?? label ?? ''),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, dateLabel ?? 'Date'), series.map((ser) => h('th', { scope: 'col' }, ser.label)))),
      h('tbody', {}, picks.map((i) => h('tr', {}, h('th', { scope: 'row' }, dates[i]), series.map((ser) => h('td', {}, fmtV(ser.values[i])))))),
    ),
  );
  return h('figure', { class: `eq c-full flush ${className}` }, legend, plot, years, readout, alt);
}

function yearTicks(dates) {
  const out = [];
  let last = '';
  dates.forEach((d, i) => {
    const y = d.slice(0, 4);
    if (y !== last) {
      out.push([i, y]);
      last = y;
    }
  });
  if (out.length > 12) return out.filter((_, k) => k % 2 === 0);
  if (out.length <= 2) {
    // a short series: label months instead
    const m = [];
    let lm = '';
    dates.forEach((d, i) => {
      const k = d.slice(0, 7);
      if (k !== lm) {
        m.push([i, `${d.slice(5, 7)}.${d.slice(2, 4)}`]);
        lm = k;
      }
    });
    return m.filter((_, k) => k % 2 === 0);
  }
  return out;
}
