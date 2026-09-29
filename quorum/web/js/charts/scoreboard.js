// The per-model scoreboard (ledger): dot plots with 95% confidence intervals. The hit-rate axis runs
// 10%–90% across rules 2–4, so a coin flip (50%) sits on rule 3; the rank-IC axis runs −0.10 to +0.10
// with zero on rule 3. Quorum rows (3/4, 4/4) are the only ultramarine dots; single families are
// Graphite, the 2/4 shadow set is hollow. Built on the home teaser's .sb classes.
import { h } from '../dom.js';

export const HIT_DOMAIN = [0.1, 0.9];
export const IC_DOMAIN = [-0.1, 0.1];

// Pure: percent position of a value on an axis spanning rules 2–4 (clamped).
export function axisPos(v, [lo, hi]) {
  if (!Number.isFinite(v)) return null;
  return ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100;
}

// rows: [{ key, title, sub, v, ci: [lo, hi], n, kind: 'quorum'|'family'|'shadow', note }]
export function dotPlot(rows, { domain, ticks, tickLabel, axisLabel, valueLabel, ciLabel, nLabel, coin, caption }) {
  const grid = h(
    'div',
    { class: 'sb__grid', role: 'table', 'aria-label': axisLabel },
    h(
      'div',
      { class: 'visually-hidden', role: 'row' },
      h('span', { role: 'columnheader' }, caption?.row ?? 'Set'),
      h('span', { role: 'columnheader' }, caption?.value ?? 'Value'),
    ),
    rows.map((r) => {
      const ci = r.ci && r.ci.every(Number.isFinite) ? r.ci : null;
      const track = h('div', { class: 'sb__track', 'aria-hidden': 'true' }, ci ? h('span', { class: 'sb__ci' }) : null, h('span', { class: ['sb__dot', `is-${r.kind}`] }));
      if (ci) {
        track.style.setProperty('--lo', `${axisPos(ci[0], domain)}%`);
        track.style.setProperty('--hi', `${axisPos(ci[1], domain)}%`);
      }
      track.style.setProperty('--v', `${axisPos(r.v, domain) ?? 0}%`);
      if (!Number.isFinite(r.v)) track.classList.add('is-empty');
      return h(
        'div',
        { class: ['sb__row', `sb__row--${r.kind}`], role: 'row' },
        h('span', { class: 'sb__k', role: 'rowheader' }, h('b', {}, r.title), r.sub ? h('span', { class: 'small muted' }, r.sub) : null),
        track,
        h(
          'span',
          { class: 'sb__v', role: 'cell' },
          h('b', { class: 'mono' }, valueLabel(r.v)),
          ci ? h('span', { class: 'muted' }, `${ciLabel} ${valueLabel(ci[0])}–${valueLabel(ci[1])}`) : null,
          Number.isFinite(r.n) ? h('span', { class: 'muted' }, nLabel(r.n)) : null,
          r.note ? h('span', { class: 'muted' }, r.note) : null,
        ),
      );
    }),
  );
  const tickEls = ticks.map((v) => {
    const isMid = Math.abs(v - (domain[0] + domain[1]) / 2) < 1e-9;
    const tk = h('span', { class: ['sb__tick', isMid && 'is-coin'] }, isMid && coin ? `${tickLabel(v)} · ${coin}` : tickLabel(v));
    tk.style.setProperty('--x', `${axisPos(v, domain)}%`);
    return tk;
  });
  return h(
    'div',
    { class: 'sb sb--full c-full flush' },
    grid,
    h('div', { class: 'sb__axis', 'aria-hidden': 'true' }, h('span', { class: 'sb__axislabel label' }, axisLabel), h('div', { class: 'sb__ticks' }, tickEls)),
  );
}
