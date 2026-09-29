// #methodology-changelog: every methodology version from meta.json, newest first, each tied to
// its METHODOLOGY record in the ledger. SL: first draft, needs native review.
import { h } from '../dom.js';
import { href } from '../router.js';
import { masthead, page } from './_content.js';

const COPY = {
  en: {
    title: 'Methodology changelog',
    kicker: 'Methodology',
    h1: 'Every change, dated and sealed.',
    lede: 'A methodology change is never an edit. It is a new version, effective from a stated issue, recorded in the ledger before it applies. Picks carry the version they were issued under.',
    effective: 'Effective',
    model: 'Models',
    record: 'Ledger record',
    current: 'current',
    back: 'Back to the methodology',
    note: 'Thresholds, vetoes and caps are frozen per version. Models were frozen on',
  },
  sl: {
    title: 'Dnevnik sprememb metodologije',
    kicker: 'Metodologija',
    h1: 'Vsaka sprememba, z datumom in pečatom.',
    lede: 'Sprememba metodologije ni nikoli popravek. Je nova različica, ki velja od navedene izdaje in je zapisana v knjigi, preden začne veljati. Izbire nosijo različico, po kateri so bile izdane.',
    effective: 'Velja od',
    model: 'Modeli',
    record: 'Zapis v knjigi',
    current: 'trenutna',
    back: 'Nazaj na metodologijo',
    note: 'Pragovi, veti in omejitve so zamrznjeni za vsako različico. Modeli so bili zamrznjeni',
  },
};

export async function render(ctx) {
  const C = COPY[ctx.locale] ?? COPY.en;
  const { fmt } = ctx;
  const meta = await ctx.data('meta');
  const list = [...(meta.methodology ?? [])].reverse();
  const node = page(
    masthead({
      kicker: C.kicker,
      title: C.h1,
      lede: C.lede,
      meta: h('p', { class: 'small muted' }, `${C.note} ${fmt.date(meta.engineFrozen)} (${meta.modelVersion}).`),
    }),
    h(
      'ol',
      { class: 'grid changelog', 'aria-label': C.title },
      list.map((m, i) =>
        h(
          'li',
          { class: 'changelog__item grid' },
          h('p', { class: 'changelog__v c-margin mono' }, `v${m.version}`),
          h(
            'div',
            { class: 'c-body changelog__body' },
            h('h2', { class: 'display d3' }, `${ctx.L('Version', 'Različica')} ${m.version}`, i === 0 ? h('span', { class: 'tag changelog__cur' }, C.current) : null),
            h('p', { class: 'lede' }, m.summary?.[ctx.locale] ?? m.summary?.en ?? ''),
          ),
          h(
            'dl',
            { class: 'c-meta dl' },
            h('div', {}, h('dt', {}, C.effective), h('dd', {}, h('time', { datetime: m.effective }, fmt.date(m.effective)))),
            h('div', {}, h('dt', {}, C.model), h('dd', {}, meta.modelVersion)),
            h('div', {}, h('dt', {}, C.record), h('dd', {}, Number.isInteger(m.seq) ? h('a', { href: href('issue', m.effective, `r${m.seq}`) }, `#${m.seq}`) : '–')),
          ),
        ),
      ),
    ),
    h('div', { class: 'grid page-next' }, h('p', { class: 'c-body' }, h('a', { class: 'arrow-link', href: href('methodology') }, `← ${C.back}`))),
  );
  return { title: C.title, node };
}
