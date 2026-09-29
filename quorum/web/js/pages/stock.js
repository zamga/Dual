// #s-TICKER: every recommendation on one stock in the last 12 months (MAR), RENEW chains together, and
// its latest row of the daily universe for Research viewers. Free viewers see revealed records only,
// and nothing on this page tells them whether a sealed pick exists.
//
// SL: first draft, needs native review.
import { h } from '../dom.js';
import { href } from '../router.js';
import { sectionHead, signed, quorumBadge, familyName } from '../ui.js';
import { ruleLabels } from '../rule.js';
import { indexPicks, isSealedFor, stockHistory, resultOf, venueL } from './_records.js';
import { fmtUsd } from '../core/format.js';

export async function render(ctx) {
  const { L, fmt, locale } = ctx;
  const ticker = ctx.params.ticker;
  const [picks, meta] = await Promise.all([ctx.data('picks'), ctx.data('meta').catch(() => null)]);
  const universe = ctx.tier === 'research' ? await ctx.data('universe').catch(() => null) : null;
  const R = ruleLabels(meta, locale);
  const byNo = indexPicks(picks);
  const asOf = meta?.asOf ?? picks.at(-1)?.issueDate;
  const all = stockHistory(picks, ticker, asOf);
  const visible = all.filter((p) => !isSealedFor(p, ctx.tier, byNo));
  const row = universe ? universeRow(universe, ticker) : null;
  const info = visible[0] ?? (ctx.tier === 'free' ? null : all[0]) ?? null;
  const name = info?.name ?? row?.name ?? null;
  if (!info && !row && ctx.tier !== 'free') return unknown(ctx, ticker);

  const head = h(
    'header',
    { class: 'grid page-masthead st-head' },
    h('p', { class: 'label c-head' }, info ? `${L('Stock', 'Delnica')} · ${venueL(info.venue, locale)} · ${locale === 'sl' ? info.sectorSl ?? info.sector : info.sector}` : L('Stock', 'Delnica')),
    h('h1', { class: 'display d1 c-head st-h1' }, ticker, name ? h('span', { class: 'visually-hidden' }, `, ${name}`) : null),
    h(
      'p',
      { class: 'lede c-body masthead__lede' },
      name ? [name, ' ', h('span', { class: 'tag' }, ctx.t('common.fictional'))] : L('Recommendations on this ticker, last 12 months.', 'Priporočila za to oznako, zadnjih 12 mesecev.'),
    ),
    info
      ? h(
          'dl',
          { class: 'c-meta dl boxed st-dl' },
          h('div', {}, h('dt', {}, 'ISIN'), h('dd', {}, info.isin)),
          h('div', {}, h('dt', {}, 'FIGI'), h('dd', {}, info.figi)),
          h('div', {}, h('dt', {}, L('Venue', 'Trg')), h('dd', {}, venueL(info.venue, locale))),
          h('div', {}, h('dt', {}, L('Sector', 'Sektor')), h('dd', {}, locale === 'sl' ? info.sectorSl ?? info.sector : info.sector)),
        )
      : null,
  );

  // ---- 01 the 12-month history ----------------------------------------------------------------------------
  const chains = [];
  for (const p of visible) {
    const last = chains.at(-1);
    if (last && p.priorNo && last.at(-1).no === p.priorNo) last.push(p);
    else chains.push([p]);
  }
  const closedResults = visible.filter((p) => p.outcome).map((p) => p.outcome.excess);
  const histRows = visible.map((p) => {
    const res = resultOf(p);
    const td = (label, cls, content) => h('td', { role: 'cell', class: cls, dataset: { label } }, content);
    return h(
      'tr',
      { role: 'row', class: ['st-row', p.priorNo && visible.some((q) => q.no === p.priorNo) && 'is-renew'] },
      h('th', { scope: 'row', role: 'rowheader', class: 'st-c-no' }, h('a', { class: 'mono', href: href('pick', p.no) }, `#${p.no}`)),
      td(L('Record', 'Zapis'), 'st-c-kind', p.kind === 'RENEW' ? L(`RENEW of #${p.priorNo}`, `PODALJŠANJE #${p.priorNo}`) : L('BUY', 'NAKUP')),
      td(L('Issued', 'Izdano'), 'num st-c-issued', h('a', { href: href('issue', p.issueDate) }, fmt.date(p.issueDate))),
      td(L('Models', 'Modeli'), 'num st-c-models', quorumBadge(p.agreement, { t: ctx.t })),
      td(L('Entry', 'Vstop'), 'num st-c-entry', fmtUsd(p.entry?.open, { locale })),
      td(L('Exit', 'Izstop'), 'num st-c-exit', fmt.date(p.exit?.date ?? p.exitPlanned)),
      td(L('Net', 'Neto'), 'num st-c-net', res ? h('span', { class: res.final ? '' : 'muted' }, fmt.pct(res.net, { sign: true })) : '–'),
      td(L('Excess', 'Presežek'), 'num st-c-excess', res ? h('span', { class: res.final ? '' : 'lg-mtm' }, signed(res.excess, { fmt })) : '–'),
      td(L('Status', 'Stanje'), 'st-c-status', p.status === 'open' ? L('open', 'odprta') : p.status === 'renewed' ? L('renewed', 'podaljšana') : L('closed', 'zaprta')),
    );
  });
  const summary = visible.length
    ? L(
        `${visible.length === 1 ? 'One recommendation' : `${visible.length} recommendations`} in ${chains.length === 1 ? 'one chain' : `${chains.length} chains`} since ${fmt.date(visible[0].issueDate)}. ${closedResults.length ? `${closedResults.filter((x) => x > 0).length} of ${closedResults.length} measured windows beat the benchmark.` : 'None measured yet.'} Every one was a BUY or its renewal.`,
        `${visible.length === 1 ? 'Eno priporočilo' : `${visible.length} priporočil`} v ${chains.length === 1 ? 'eni verigi' : `${chains.length} verigah`} od ${fmt.date(visible[0].issueDate)}. ${closedResults.length ? `${closedResults.filter((x) => x > 0).length} od ${closedResults.length} izmerjenih obdobij je premagalo merilo.` : 'Nobeno še ni izmerjeno.'} Vsako je bilo NAKUP ali njegovo podaljšanje.`,
      )
    : ctx.tier === 'free'
      ? L('No recommendation on this ticker has been revealed in the last 12 months. Open picks stay sealed until they close.', 'V zadnjih 12 mesecih ni bilo razkrito nobeno priporočilo za to oznako. Odprte izbire ostanejo zapečatene do zaprtja.')
      : L('No recommendation on this stock in the last 12 months.', 'V zadnjih 12 mesecih ni bilo priporočila za to delnico.');
  const histSec = h(
    'section',
    { class: 'section grid rec-sec st-hist', 'aria-labelledby': 'st-h-h' },
    ...sectionHead({ index: '01', kicker: L('MAR · previous recommendations', 'MAR · prejšnja priporočila'), title: L('Twelve months on this stock.', 'Dvanajst mesecev te delnice.'), id: 'st-h-h', size: 'd3' }),
    h('p', { class: 'lede c-body' }, summary),
    visible.length
      ? h(
          'div',
          { class: 'c-wide table-wrap st-table' },
          h(
            'table',
            { class: 'table st-list', role: 'table' },
            h('caption', {}, L('Measured from the US open on the issue day to the open 21 trading days later, after costs. Open picks are marked to the latest close.', 'Merjeno od odprtja ameriškega trga na dan izdaje do odprtja 21 trgovalnih dni pozneje, po stroških. Odprte izbire so vrednotene ob zadnjem zaprtju.')),
            h(
              'thead',
              { role: 'rowgroup' },
              h(
                'tr',
                { role: 'row' },
                [L('No.', 'Št.'), L('Record', 'Zapis'), L('Issued', 'Izdano'), L('Models', 'Modeli'), L('Entry', 'Vstop'), L('Exit', 'Izstop'), L('Net', 'Neto'), L('Excess', 'Presežek'), L('Status', 'Stanje')].map((x, i) =>
                  h('th', { scope: 'col', role: 'columnheader', class: [2, 3, 4, 5, 6, 7].includes(i) && 'num' }, x),
                ),
              ),
            ),
            h('tbody', { role: 'rowgroup' }, histRows),
          ),
        )
      : null,
    h('p', { class: 'c-body rec-note' }, ctx.t('common.notAdvice')),
  );

  // ---- 02 the latest universe row (Research) ------------------------------------------------------------
  const uniSec = h(
    'section',
    { class: 'section grid rec-sec st-uni', 'aria-labelledby': 'st-u-h' },
    ...sectionHead({ index: '02', kicker: L('The daily dataset · Research', 'Dnevni nabor podatkov · Research'), title: L('Latest scores.', 'Zadnje ocene.'), id: 'st-u-h', size: 'd3' }),
    row ? uniBlock(ctx, row, universe, meta, R) : uniGate(ctx, universe === null && ctx.tier === 'research'),
  );

  const node = h('div', { class: 'page stock' }, head, histSec, uniSec);
  return { title: L(`${ticker} · recommendations`, `${ticker} · priporočila`), node };
}

export function universeRow(universe, ticker) {
  const cols = universe?.cols ?? [];
  const r = (universe?.rows ?? []).find((x) => x[cols.indexOf('ticker')] === ticker);
  if (!r) return null;
  return Object.fromEntries(cols.map((c, i) => [c, r[i]]));
}

function uniBlock(ctx, row, universe, meta, R) {
  const { L, fmt, locale } = ctx;
  const fams = ['A', 'B', 'C', 'D'];
  const cols = h(
    'div',
    { class: 'st-cols', 'aria-hidden': 'true' },
    fams.map((f, k) => {
      const v = row[f];
      const on = Number.isFinite(v) && R.topPct && v >= R.topPct;
      const col = h('span', { class: ['st-col', on ? 'is-in' : 'is-out'] }, h('b', {}, `${f} ${Number.isFinite(v) ? fmt.rank(v) : '–'}`));
      col.style.setProperty('--k', String(k));
      col.style.setProperty('--h', String(Number.isFinite(v) ? Math.max(0.02, v) : 0));
      return col;
    }),
  );
  if (R.topPct) cols.style.setProperty('--thr', String(R.topPct));
  const vetoKey = row.veto;
  return [
    h(
      'p',
      { class: 'lede c-body' },
      L(
        `Scores as of ${fmt.date(universe.scoresAsOf ?? universe.date)}: ${row.agree ?? 0} of 4 families ${R.inTop}${vetoKey ? `; veto: ${vetoKey}` : ''}. Descriptive data, not a recommendation: only a pick in the ledger is one.`,
        `Ocene na dan ${fmt.date(universe.scoresAsOf ?? universe.date)}: ${row.agree ?? 0} od 4 družin ${R.inTop}${vetoKey ? `; veto: ${vetoKey}` : ''}. Opisni podatki, ne priporočilo: priporočilo je samo izbira v knjigi.`,
      ),
    ),
    h('figure', { class: 'c-full flush st-fig' }, cols, h('figcaption', { class: 'figcaption st-figcap' }, fams.map((f) => `${f} ${familyName(f, meta, locale)} ${Number.isFinite(row[f]) ? fmt.rank(row[f]) : '–'}`).join(' · '))),
    h(
      'dl',
      { class: 'c-wide stats boxed st-stats' },
      [
        [L('Market value', 'Tržna vrednost'), compactUsd(row.mcap, fmt, locale)],
        [L('Daily trading, 60 days', 'Dnevni promet, 60 dni'), compactUsd(row.adv60, fmt, locale)],
        [L('Return, trailing 21 days', 'Donos, zadnjih 21 dni'), Number.isFinite(row.ret21) ? signed(row.ret21, { fmt }) : '–'],
        [L('Families in the top slice', 'Družine v zgornjem delu'), `${row.agree ?? 0}/4`],
      ].map(([k, v]) => h('div', { class: 'stat' }, h('dt', { class: 'stat__k' }, k), h('dd', { class: 'stat__v' }, v))),
    ),
  ];
}

// $19.1T · $54.6B · $449M (SL: 19,1 bil. $ · 54,6 mrd $ · 449 mio $)
export function compactUsd(x, fmt, locale) {
  if (!Number.isFinite(x)) return '–';
  const [div, en, sl, d] = x >= 1e12 ? [1e12, 'T', 'bil.', 1] : x >= 1e9 ? [1e9, 'B', 'mrd', 1] : [1e6, 'M', 'mio', 0];
  const v = fmt.num(x / div, d);
  return locale === 'sl' ? `${v} ${sl} $` : `$${v}${en}`;
}

function uniGate(ctx, failed) {
  const { L } = ctx;
  return h(
    'div',
    { class: 'c-body st-gate' },
    h(
      'p',
      { class: 'lede' },
      failed
        ? L('The daily dataset did not load.', 'Dnevni nabor podatkov se ni naložil.')
        : L('Daily family percentiles for every stock are part of the Research tier. Launch depends on counsel review.', 'Dnevni percentili družin za vsako delnico so del paketa Research. Začetek je odvisen od pravnega pregleda.'),
    ),
    h('p', {}, h('a', { class: 'arrow-link', href: href('pricing') }, L('Pricing and tiers', 'Cene in paketi'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'))),
  );
}

function unknown(ctx, ticker) {
  const { L } = ctx;
  const node = h(
    'section',
    { class: 'grid state' },
    h('p', { class: 'label c-head' }, L('Stock', 'Delnica')),
    h('h1', { class: 'display d2 c-head' }, L(`No ${ticker} in the record.`, `${ticker} ni v zapisu.`)),
    h('p', { class: 'lede c-body' }, L('No recommendation on this ticker in the last 12 months. Every company here is fictional.', 'V zadnjih 12 mesecih ni priporočila za to oznako. Vsa podjetja tukaj so izmišljena.')),
    h('p', { class: 'c-body' }, h('a', { class: 'arrow-link', href: href('ledger', null, 'record') }, L('Every pick in the ledger', 'Vse izbire v knjigi'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'))),
  );
  return { title: ticker, node };
}
