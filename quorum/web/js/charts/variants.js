// The distribution of every variant's Sharpe ratio (backtest page), with reference lines: what the best
// of that many zero-skill variants would show by luck (raw and clustered), and the holdout's Sharpe.
// Bars are hollow Graphite: this is a backtest, and nothing here is a quorum mark.
import { h } from '../dom.js';
import { histogram, extent, linear, ticks } from './scale.js';

export function variantHistogram(values, { markers = [], fmt, L, bins = 28 }) {
  const [lo0, hi0] = extent([...values, ...markers.map((m) => m.value)]);
  const pad = (hi0 - lo0) * 0.04;
  const lo = Math.floor((lo0 - pad) * 10) / 10;
  const hi = Math.ceil((hi0 + pad) * 10) / 10;
  const hist = histogram(values, lo, hi, bins);
  const maxN = Math.max(1, ...hist.map((b) => b.n));
  const x = linear(lo, hi, 0, 100);
  const plot = h('div', { class: 'vh-plot', 'aria-hidden': 'true' });
  for (const b of hist) {
    const bar = h('span', { class: 'vh-bar' });
    bar.style.setProperty('--x', `${x(b.x0)}%`);
    bar.style.setProperty('--w', `${x(b.x1) - x(b.x0)}%`);
    bar.style.setProperty('--h', `${(b.n / maxN) * 100}%`);
    plot.append(bar);
  }
  markers.forEach((m, i) => {
    const el = h('span', { class: ['vh-mark', m.cls] }, h('span', { class: 'vh-mark__l' }, h('span', { class: 'label' }, m.label), h('span', { class: 'mono' }, fmt.num(m.value, 2))));
    el.style.setProperty('--x', `${x(m.value)}%`);
    el.style.setProperty('--row', String(i));
    if (x(m.value) > 62) el.classList.add('is-left');
    plot.append(el);
  });
  const axis = h(
    'div',
    { class: 'vh-axis', 'aria-hidden': 'true' },
    ticks(lo, hi, 6).map((v) => {
      const t = h('span', {}, fmt.num(v, 1));
      t.style.setProperty('--x', `${x(v)}%`);
      return t;
    }),
  );
  const alt = h(
    'div',
    { class: 'visually-hidden' },
    h(
      'table',
      {},
      h('caption', {}, L('Number of variants by annualised Sharpe ratio', 'Število različic po letnem Sharpovem razmerju')),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, L('Sharpe from', 'Sharpe od')), h('th', { scope: 'col' }, L('to', 'do')), h('th', { scope: 'col' }, L('Variants', 'Različic')))),
      h('tbody', {}, hist.filter((b) => b.n).map((b) => h('tr', {}, h('td', {}, fmt.num(b.x0, 2)), h('td', {}, fmt.num(b.x1, 2)), h('td', {}, String(b.n))))),
    ),
  );
  return h('div', { class: 'vh c-full flush' }, plot, axis, h('p', { class: 'vh-axislabel label' }, L('Annualised Sharpe ratio of each variant, research window', 'Letno Sharpovo razmerje vsake različice, raziskovalno obdobje')), alt);
}
