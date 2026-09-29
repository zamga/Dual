// The Colonnade chart (pick note, brief §5): four columns of family percentiles standing on the four
// rules, the rule band from meta.rule.topPct to 100 shaded, the ultramarine lintel resting across the
// qualifying columns, the factor drivers hanging under each column (bars diverge from the rule: the
// rule is z = 0), then the sensitivity line. HTML columns over a 0–100 plot; text alternative included.
import { h } from '../dom.js';
import { familyName, familyDef } from '../ui.js';
import { normInv } from '../core/stats.js';

const FAMS = ['A', 'B', 'C', 'D'];
const Z_MAX = 3; // bars saturate at |z| = 3

// Pure: the geometry the chart draws (tested). pct is 0–1; returns percent heights and the lintel span.
export function colonnadeModel(pick, topPct) {
  const agreeing = new Set(pick.agreeing ?? []);
  const cols = FAMS.map((f, k) => {
    const pct = pick.families?.[f]?.pct;
    const scored = Number.isFinite(pct);
    return {
      id: f,
      k,
      pct: scored ? pct : null,
      height: scored ? Math.max(0, Math.min(1, pct)) : 0,
      agree: agreeing.has(f),
      suspended: !!pick.crashSwitch && f === 'A',
      clears: scored && Number.isFinite(topPct) ? pct >= topPct : false,
    };
  });
  const ks = cols.filter((c) => c.agree).map((c) => c.k);
  const lintel = ks.length ? { from: Math.min(...ks), to: Math.max(...ks) } : null;
  return { cols, lintel, topPct };
}

// The sensitivity sentence's numbers: how far the weakest qualifying family sat above the threshold,
// in percentile points and in standard deviations of a normal score.
export function sensitivityModel(pick, topPct) {
  const s = pick.sensitivity;
  if (!s?.family || !Number.isFinite(s.pct) || !Number.isFinite(topPct)) return null;
  const margin = Number.isFinite(s.margin) ? s.margin : s.pct - topPct;
  const clamp = (p) => Math.min(0.99999, Math.max(0.00001, p));
  const sd = normInv(clamp(s.pct)) - normInv(clamp(topPct));
  return { family: s.family, pct: s.pct, margin, points: margin * 100, sd };
}

function driverValue(d, fmt, L) {
  const raw = d.raw;
  if (!raw || !Number.isFinite(raw.value)) return '';
  if (raw.evEbit) return `EV/EBIT ${fmt.num(raw.evEbit, 1)}`;
  if (d.key === 'bm_adj') return `B/M ${fmt.num(raw.value, 2)}`;
  if (d.key === 'gp_chg') return L(`${fmt.num(raw.value * 100, 1)} pp`, `${fmt.num(raw.value * 100, 1)} o. t.`);
  switch (raw.unit) {
    case 'ratio':
      return fmt.pct(raw.value);
    case 't':
      return `t ${fmt.num(raw.value, 1)}`;
    case 'sd':
      return L(`${fmt.num(raw.value, 1)} sd`, `${fmt.num(raw.value, 1)} SO`);
    case 'x':
      return `${fmt.num(raw.value, 2)}×`;
    default:
      return fmt.num(raw.value, 2);
  }
}

export function colonnadeChart(pick, { meta, R, fmt, L, locale, t }) {
  const model = colonnadeModel(pick, R.topPct);
  const sens = sensitivityModel(pick, R.topPct);
  const name = (f) => familyName(f, meta, locale);
  const pctTxt = (p) => (p === null ? '–' : fmt.rank(p));

  // capitals: the family, its percentile and whether it voted, at each rule
  const caps = h(
    'ol',
    { class: 'col-caps', 'aria-hidden': 'true' },
    model.cols.map((c) =>
      h(
        'li',
        { class: ['col-cap', c.agree ? 'is-agree' : 'is-miss'] },
        h('span', { class: 'col-cap__id' }, c.id),
        h('span', { class: 'col-cap__name' }, name(c.id)),
        h('span', { class: 'col-cap__v' }, pctTxt(c.pct)),
        h('span', { class: 'col-cap__vote label' }, c.suspended ? L('suspended', 'izključena') : c.agree ? L('votes', 'glasuje') : L('no vote', 'ne glasuje')),
      ),
    ),
  );

  // the plot: band, threshold, gridlines, columns, lintel
  const plot = h('div', { class: 'col-plot', 'aria-hidden': 'true' });
  plot.style.setProperty('--thr', String(R.topPct ?? 1));
  plot.append(h('span', { class: 'col-band' }), h('span', { class: 'col-thr' }));
  for (const g of [0.25, 0.5, 0.75]) {
    const line = h('span', { class: 'col-grid' }, h('span', { class: 'col-grid__v' }, String(g * 100)));
    line.style.setProperty('--y', String(g));
    plot.append(line);
  }
  plot.append(h('span', { class: 'col-thrlabel label' }, R.band));
  for (const c of model.cols) {
    const col = h('span', { class: ['col-col', c.agree ? 'is-agree' : 'is-miss', c.suspended && 'is-suspended', sens?.family === c.id && 'is-sensitive'] });
    col.style.setProperty('--h', String(c.height));
    col.style.setProperty('--k', String(c.k));
    plot.append(col);
  }
  if (model.lintel) {
    const lintel = h('span', { class: 'col-lintel' });
    lintel.style.setProperty('--from', String(model.lintel.from));
    lintel.style.setProperty('--to', String(model.lintel.to));
    plot.append(lintel);
  }

  // the drivers under each column (the rule is z = 0)
  const drivers = h(
    'ol',
    { class: 'col-drivers' },
    model.cols.map((c) => {
      const fam = pick.families?.[c.id] ?? {};
      const list = (fam.drivers ?? []).slice(0, 3);
      return h(
        'li',
        { class: ['col-fam', c.agree ? 'is-agree' : 'is-miss'] },
        h('p', { class: 'col-fam__head' }, h('b', {}, c.id), ' ', h('span', {}, name(c.id)), h('span', { class: 'col-fam__pct mono' }, ` ${pctTxt(c.pct)}`)),
        h(
          'ul',
          { class: 'col-fam__list' },
          list.map((d) => {
            const z = Number.isFinite(d.value) ? d.value : 0;
            const bar = h('span', { class: ['col-bar', z >= 0 ? 'is-pos' : 'is-neg'] });
            bar.style.setProperty('--zf', String(Math.min(1, Math.abs(z) / Z_MAX)));
            const raw = driverValue(d, fmt, L);
            const extra = Number.isFinite(d.weight)
              ? L(`weight ${fmt.pct0(d.weight)}`, `utež ${fmt.pct0(d.weight)}`)
              : d.context
                ? L('context', 'kontekst')
                : null;
            return h(
              'li',
              { class: 'col-drv' },
              h('span', { class: 'col-drv__label' }, d.label?.[locale] ?? d.label?.en ?? d.key),
              h('span', { class: 'col-drv__track', 'aria-hidden': 'true' }, bar),
              h(
                'span',
                { class: 'col-drv__v mono' },
                `z ${fmt.num(z, 1)}`,
                raw ? h('span', { class: 'muted' }, ` · ${raw}`) : null,
                extra ? h('span', { class: 'muted' }, ` · ${extra}`) : null,
              ),
            );
          }),
        ),
        h('p', { class: 'col-fam__def small muted' }, familyDef(c.id, meta, locale)),
      );
    }),
  );

  const sensText = sens
    ? L(
        `Sensitivity: this pick would not have been issued if ${sens.family} (${name(sens.family)}) had ranked below the ${R.pctile}. It ranked at ${fmt.num(sens.pct * 100, 2)}, ${fmt.num(sens.points, 2)} points above the line, about ${fmt.num(Math.abs(sens.sd), 2)} standard deviations.`,
        `Občutljivost: izbira ne bi bila izdana, če bi družina ${sens.family} (${name(sens.family)}) delnico uvrstila pod ${R.pctile}. Uvrstila jo je na ${fmt.num(sens.pct * 100, 2)}, ${fmt.num(sens.points, 2)} točke nad mejo, približno ${fmt.num(Math.abs(sens.sd), 2)} standardnega odklona.`,
      )
    : '';

  // text alternative: one table with every number the chart shows
  const alt = h(
    'div',
    { class: 'visually-hidden' },
    h(
      'table',
      {},
      h(
        'caption',
        {},
        L(
          `Family percentiles for #${pick.no}; the rule is ${R.pctile} or higher in at least three families.`,
          `Percentili družin za #${pick.no}; pravilo je ${R.pctile} ali več v vsaj treh družinah.`,
        ),
      ),
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          [L('Family', 'Družina'), L('Percentile', 'Percentil'), L('Votes', 'Glasuje'), L('Drivers (z-score)', 'Dejavniki (z-vrednost)')].map((x) =>
            h('th', { scope: 'col' }, x),
          ),
        ),
      ),
      h(
        'tbody',
        {},
        model.cols.map((c) =>
          h(
            'tr',
            {},
            h('th', { scope: 'row' }, `${c.id} · ${name(c.id)}`),
            h('td', {}, pctTxt(c.pct)),
            h('td', {}, c.agree ? L('yes', 'da') : L('no', 'ne')),
            h('td', {}, (pick.families?.[c.id]?.drivers ?? []).map((d) => `${d.label?.[locale] ?? d.key}: ${fmt.num(d.value, 1)}`).join('; ')),
          ),
        ),
      ),
    ),
  );

  return h(
    'figure',
    { class: 'colonnade c-full flush', 'aria-labelledby': `col-cap-${pick.no}` },
    caps,
    plot,
    drivers,
    alt,
    h(
      'figcaption',
      { class: 'col-sens', id: `col-cap-${pick.no}` },
      h('span', { class: 'label' }, L('The colonnade', 'Stebrišče')),
      h(
        'span',
        {},
        sensText ||
          L(
            'Four columns: the percentile each family gave the stock on the issue date.',
            'Štirje stebri: percentil, ki ga je vsaka družina dala delnici na dan izdaje.',
          ),
      ),
    ),
  );
}
