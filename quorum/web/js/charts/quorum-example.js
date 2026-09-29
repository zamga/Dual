// A real quorum, drawn small: the latest closed pick's four family percentiles as four columns standing on
// the four rules, the ultramarine lintel resting at the rule threshold (meta.rule.topPct) across the
// columns that qualified. Data: hero.json only. Used by the home page (02 How a pick happens) and by
// #how-it-works (02 The quorum rule).
import { h } from '../dom.js';
import { href } from '../router.js';
import { ruleLabels } from '../rule.js';

export function quorumExample(hero, { meta = null, locale = 'en', label = '' } = {}) {
  const pick = hero.pick;
  const row = [0, 1, 2, 3].map((k) => hero.p[pick.index * 4 + k]);
  const agree = new Set(pick.agreeing);
  const R = ruleLabels(meta, locale);
  const thr = h('span', { class: 'how-quorum__thr' }, h('span', { class: 'label' }, R.pctileNum != null ? String(R.pctileNum) : ''));
  const colH = (v) => Math.max(0, v) / 10; // 0..100
  const fig = h(
    'figure',
    { class: 'how-quorum c-full flush', 'aria-label': `${label}: ${pick.ticker}, ${['A', 'B', 'C', 'D'].map((f, k) => `${f} ${Math.round(colH(row[k]))}`).join(', ')}` },
    h(
      'div',
      { class: 'how-quorum__plot', 'aria-hidden': 'true' },
      thr,
      h('span', { class: 'how-quorum__lintel' }),
      ['A', 'B', 'C', 'D'].map((f, k) => {
        const col = h('span', { class: ['how-col', agree.has(f) ? 'is-agree' : 'is-miss', k === 3 && 'is-last'] }, h('b', {}, String(Math.round(colH(row[k])))));
        col.style.setProperty('--h', String(colH(row[k]) / 100));
        col.style.setProperty('--i', String(k));
        return col;
      }),
    ),
    h('figcaption', { class: 'label how-quorum__cap' }, `${label} · `, h('a', { href: href('pick', pick.no) }, `#${pick.no} ${pick.ticker}`), ` · ${pick.agreeing.length}/4`),
  );
  if (R.topPct) fig.style.setProperty('--thr', String(R.topPct));
  return fig;
}
