// The decile staircase (ledger): full-universe 21-day excess return by decile of a score, with 95%
// intervals, plus the monthly rank-IC sparklines of the four families. Positive steps are Graphite,
// negative steps hollow; the numbers carry their own sign. Text alternative: a hidden table.
import { h, svg } from '../dom.js';
import { linear, pointsAttr } from './scale.js';

// Pure: a symmetric y domain around zero that holds every interval.
export function stairDomain(rows) {
  let m = 0;
  for (const r of rows ?? []) for (const v of [r.excess, ...(r.ci ?? [])]) if (Number.isFinite(v)) m = Math.max(m, Math.abs(v));
  const top = m ? m * 1.12 : 0.01;
  return [-top, top];
}

export function staircase(rows, { fmt, L, title }) {
  const [lo, hi] = stairDomain(rows);
  const y = linear(lo, hi, 100, 0); // percent from the top
  const plot = h('div', { class: 'ds-plot', 'aria-hidden': 'true' });
  const zero = h('span', { class: 'ds-zero' });
  zero.style.setProperty('--y', `${y(0)}%`);
  plot.append(zero);
  rows.forEach((r, i) => {
    const pos = r.excess >= 0;
    const bar = h('span', { class: ['ds-bar', pos ? 'is-pos' : 'is-neg'] });
    bar.style.setProperty('--top', `${Math.min(y(r.excess), y(0))}%`);
    bar.style.setProperty('--h', `${Math.abs(y(r.excess) - y(0))}%`);
    const whisk = h('span', { class: 'ds-ci' });
    if (r.ci?.every(Number.isFinite)) {
      whisk.style.setProperty('--top', `${y(r.ci[1])}%`);
      whisk.style.setProperty('--h', `${y(r.ci[0]) - y(r.ci[1])}%`);
    }
    const val = h('span', { class: ['ds-val', pos ? 'is-pos' : 'is-neg'] }, fmt.pct(r.excess, { sign: true }));
    val.style.setProperty('--y', `${pos ? y(Math.max(r.excess, r.ci?.[1] ?? r.excess)) : y(Math.min(r.excess, r.ci?.[0] ?? r.excess))}%`);
    const slot = h('span', { class: 'ds-slot' }, whisk, bar, val);
    slot.style.setProperty('--i', String(i));
    plot.append(slot);
  });
  const axis = h(
    'div',
    { class: 'ds-axis', 'aria-hidden': 'true' },
    rows.map((r, i) => {
      const t = h('span', { class: 'ds-d' }, String(r.d));
      t.style.setProperty('--i', String(i));
      return t;
    }),
  );
  const alt = h(
    'div',
    { class: 'visually-hidden' },
    h(
      'table',
      {},
      h('caption', {}, title),
      h('thead', {}, h('tr', {}, [L('Decile', 'Decil'), L('Excess, 21 days', 'Presežek, 21 dni'), L('95% interval', '95-odstotni interval')].map((x) => h('th', { scope: 'col' }, x)))),
      h(
        'tbody',
        {},
        rows.map((r) =>
          h('tr', {}, h('th', { scope: 'row' }, String(r.d)), h('td', {}, fmt.pct(r.excess, { sign: true })), h('td', {}, r.ci ? `${fmt.pct(r.ci[0], { sign: true })} to ${fmt.pct(r.ci[1], { sign: true })}` : '–')),
        ),
      ),
    ),
  );
  return h(
    'div',
    { class: 'ds c-full flush' },
    plot,
    axis,
    h('p', { class: 'ds-axislabel label' }, h('span', {}, L('Decile 1 · lowest score', 'Decil 1 · najnižja ocena')), h('span', {}, L('Decile 10 · highest', 'Decil 10 · najvišja'))),
    alt,
  );
}

// Monthly rank IC per family: one row per family, a sparkline across rules 2–4 with zero marked.
export function icSparklines(icMonthly, { families, fmt, L, name }) {
  const months = (icMonthly ?? []).map((r) => r[0]);
  const all = (icMonthly ?? []).flatMap((r) => families.map((f) => r[1]?.[f])).filter(Number.isFinite);
  const m = Math.max(0.05, ...all.map(Math.abs)) * 1.1;
  const y = linear(-m, m, 1000, 0);
  const x = linear(0, Math.max(1, months.length - 1), 20, 980);
  const rows = families.map((f) => {
    const vals = (icMonthly ?? []).map((r) => r[1]?.[f]);
    const pts = vals.map((v, i) => [x(i), y(Number.isFinite(v) ? v : 0)]);
    const mean = vals.filter(Number.isFinite).reduce((a, b) => a + b, 0) / Math.max(1, vals.filter(Number.isFinite).length);
    const pos = vals.filter((v) => v > 0).length;
    const line = svg(
      'svg',
      { class: 'ic-svg', viewBox: '0 0 1000 1000', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
      svg('line', { class: 'ic-zero', x1: 0, x2: 1000, y1: y(0), y2: y(0) }),
      svg('line', { class: 'ic-mean', x1: 0, x2: 1000, y1: y(mean), y2: y(mean) }),
      svg('polyline', { class: 'ic-line', points: pointsAttr(pts) }),
    );
    const dots = h(
      'span',
      { class: 'ic-dots', 'aria-hidden': 'true' },
      pts.map(([px, py], i) => {
        const d = h('span', { class: ['ic-dot', vals[i] < 0 && 'is-neg'] });
        d.style.setProperty('--x', `${px / 10}%`);
        d.style.setProperty('--y', `${py / 10}%`);
        return d;
      }),
    );
    return h(
      'div',
      { class: 'ic-row', role: 'row' },
      h('span', { class: 'ic-k', role: 'rowheader' }, h('b', { class: 'mono' }, f), ` ${name(f)}`),
      h('span', { class: 'ic-plot', role: 'cell', 'aria-label': L(`${name(f)}: monthly rank IC ${vals.map((v, i) => `${months[i]} ${fmt.num(v, 3)}`).join(', ')}`, `${name(f)}: mesečni rangovni IC ${vals.map((v, i) => `${months[i]} ${fmt.num(v, 3)}`).join(', ')}`) }, line, dots),
      h('span', { class: 'ic-v', role: 'cell' }, h('b', { class: 'mono' }, fmt.num(mean, 3)), h('span', { class: 'muted' }, L(`mean · ${pos} of ${vals.length} months above 0`, `povprečje · ${pos} od ${vals.length} mesecev nad 0`))),
    );
  });
  // months as every time axis writes them (MM.YY, like the equity curves): '2025-09' -> '09.25'
  const mmyy = (m) => (m ? `${m.slice(5, 7)}.${m.slice(2, 4)}` : '');
  const first = mmyy(months[0]);
  const last = mmyy(months[months.length - 1]);
  return h(
    'div',
    { class: 'ic c-full flush', role: 'table', 'aria-label': L('Monthly rank IC by family', 'Mesečni rangovni IC po družinah') },
    rows,
    h('div', { class: 'ic-axis', 'aria-hidden': 'true' }, h('span', {}, first ?? ''), h('span', {}, last ?? '')),
  );
}
