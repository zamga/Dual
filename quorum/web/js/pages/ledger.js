// #ledger: the public proof. Headline statistics in the brief's fixed order (§2.8) with the track-record
// label, the full record table (sortable, filterable; sealed rows for Free viewers), the Ledger Chain on
// Chamber with in-browser verification and a tamper demo, two labelled copies ("Copy the hash chain (CSV)"
// with a raw view, "Copy the picks table (CSV)"), the per-model scoreboard (sealed and holdout), the decile staircase with the monthly IC, the Silence Calendar and
// the MAR lists. Nothing here animates a number.
//
// SL: first draft, needs native review.
import { h, announce, copyText, digits } from '../dom.js';
import { href } from '../router.js';
import { trackRecordLabel, sectionHead, signed, hashChip, familyName, recordCounts } from '../ui.js';
import { toc } from './_content.js';
import { ruleLabels } from '../rule.js';
import { recordRows, recordsCsv, sortRows, filterRows, indexPicks, isRevealed, issueBlocks, tamperTarget, tamperCopy } from './_records.js';
import { verifyLedger, verifyInSlices, verifyReveals, rehashAt } from './_verify.js';
import { chainBlocks } from '../charts/chain.js';
import { dotPlot, HIT_DOMAIN, IC_DOMAIN } from '../charts/scoreboard.js';
import { staircase, icSparklines } from '../charts/deciles.js';
import { lineChart, hatchLayer } from '../charts/equity.js';
import { silenceCalendar } from '../charts/silence-calendar.js';
import { ledgerCsv } from '../core/ledger.js';
import { fmtUsd } from '../core/format.js';

const PAGE = 40;

export async function render(ctx) {
  const { L, fmt, locale } = ctx;
  const [summary, picks, ledger, issues, meta, scoreboard, deciles, launch] = await Promise.all([
    ctx.data('summary'),
    ctx.data('picks'),
    ctx.data('ledger'),
    ctx.data('issues'),
    ctx.data('meta').catch(() => null),
    ctx.data('scoreboard').catch(() => null),
    ctx.data('deciles').catch(() => null),
    ctx.launch(),
  ]);
  const R = ruleLabels(meta ?? scoreboard, locale);
  const byNo = indexPicks(picks);
  const sections = [
    { id: 'statistics', title: L('Statistics', 'Podatki') },
    { id: 'record', title: L('Every pick', 'Vse izbire') },
    { id: 'chain', title: L('The chain', 'Veriga') },
    { id: 'scoreboard', title: L('Scoreboard', 'Modeli') },
    { id: 'deciles', title: L('Deciles and IC', 'Decili in IC') },
    { id: 'calendar', title: L('Every issue', 'Vse izdaje') },
    { id: 'lists', title: L('MAR lists', 'Seznami MAR') },
  ];
  const nOpen = picks.filter((p) => p.status === 'open').length;
  const head = recordWall(ctx, summary, meta, picks, nOpen, toc(ctx, sections, L('On this page', 'Na tej strani')));

  const node = h(
    'div',
    { class: 'page ledger' },
    head,
    statsSection(ctx, summary, meta),
    recordSection(ctx, picks, ledger, meta),
    chainSection(ctx, ledger, picks, byNo),
    scoreboardSection(ctx, scoreboard, meta, R),
    decilesSection(ctx, deciles, scoreboard, meta, R),
    calendarSection(ctx, issues, launch),
    listsSection(ctx),
  );
  return { title: L('Ledger', 'Knjiga'), node };
}

// ---- the record wall (DESIGN-V2 §5): "The ledger." and five record figures, one per bay, in the brief's
// order (recommendations, hit rate with its 95% CI, median excess, the worst pick, the drawdown); the mean and
// the alert gap follow in the sixth cell, so all seven stay in order. The figures are the headline here, and
// they arrive as a digit reveal (no intermediate values).
// the record's label never breaks inside its first word ("Pre-launch" split at the hyphen on phones)
function kickerWords(label) {
  const [first, ...rest] = String(label).split(' ');
  return [h('span', { class: 'nowrap' }, first), rest.length ? ` ${rest.join(' ')}` : ''];
}

function recordWall(ctx, summary, meta, picks, nOpen, tocNode) {
  const { L, fmt, locale } = ctx;
  const rc = recordCounts(summary, meta?.counts);
  const sgn = (x) => {
    const s = fmt.signed(x);
    const m = /^([+−-])(.*)$/.exec(s.text);
    return h('span', { class: ['signed', s.cls] }, h('span', { class: 'signed__arrow', 'aria-hidden': 'true' }, s.arrow), m ? digits(m[2], { sign: m[1] }) : digits(s.text));
  };
  const pctOf = (v) => `${Math.max(0, Math.min(100, v * 100)).toFixed(1)}%`;
  // the 95% CI on a 0–100% scale as wide as the cell; its ends are labelled (the rate is the tick)
  const ci = h(
    'span',
    { class: 'wall__ci', 'aria-hidden': 'true' },
    h('span', { class: 'wall__citrack' }),
    summary.hitCI ? [h('span', { class: 'wall__cit wall__cit--lo' }, fmt.pct0(summary.hitCI[0])), h('span', { class: 'wall__cit wall__cit--hi' }, fmt.pct0(summary.hitCI[1]))] : null,
  );
  if (summary.hitCI) {
    ci.style.setProperty('--lo', pctOf(summary.hitCI[0]));
    ci.style.setProperty('--hi', pctOf(summary.hitCI[1]));
  }
  ci.style.setProperty('--pt', pctOf(summary.hitRate));
  const worst = summary.worstPick;
  const split = Number.isFinite(rc.picks) ? L(`${fmt.int(rc.picks)} new picks, ${fmt.int(rc.renews)} renewals · `, `${fmt.int(rc.picks)} novih izbir, ${fmt.int(rc.renews)} podaljšanj · `) : '';
  // the CI bar sits under its figure, as wide as the cell (0–100%)
  const fig = (k, v, s, extra) =>
    h(
      'div',
      { class: 'wall__fig' },
      h('span', { class: 'label wall__k' }, k),
      extra ? h('span', { class: 'wall__vci' }, h('span', { class: 'fig-xl wall__v' }, v), extra) : h('span', { class: 'fig-xl wall__v' }, v),
      h('span', { class: 'wall__s' }, s),
    );
  const hitCi = summary.hitCI ? `${ctx.t('common.ci')} ${fmt.pct0(summary.hitCI[0])}–${fmt.pct0(summary.hitCI[1])}` : '';
  return h(
    'header',
    { class: 'wall grid' },
    h('p', { class: 'label c-wide' }, L('Did it work?', 'Je delovalo?'), ' · ', ...kickerWords(summary.label?.[locale] ?? summary.label?.en ?? '')),
    h('h1', { class: 'display d1 wall__title', id: 'page-h' }, L('The ledger.', 'Knjiga.')),
    h(
      'p',
      { class: 'lede c-body wall__lede' },
      L(
        `Every pick since ${fmt.date(summary.liveSince)}: sealed before anyone saw it, scored from the next US open, kept whatever happened. ${fmt.int(picks.length)} records, ${fmt.int(nOpen)} still open. Anyone can recompute every hash.`,
        `Vsaka izbira od ${fmt.date(summary.liveSince)}: zapečatena, preden jo je kdor koli videl, merjena od naslednjega odprtja ameriškega trga, ohranjena ne glede na izid. ${fmt.int(picks.length)} zapisov, ${fmt.int(nOpen)} še odprtih. Vsako zgoščeno vrednost lahko kdor koli ponovno izračuna.`,
      ),
    ),
    h(
      'div',
      { class: 'wall__figs', role: 'group', 'aria-label': L('Headline statistics, in the fixed order', 'Ključni podatki v stalnem vrstnem redu') },
      fig(L('Recommendations', 'Priporočila'), digits(fmt.int(rc.records)), `${L('since', 'od')} ${fmt.date(summary.liveSince)} · ${split}${L(`${fmt.int(summary.nClosed)} closed`, `${fmt.int(summary.nClosed)} zaprtih`)}`),
      fig(L('Hit rate vs benchmark', 'Delež uspešnih proti merilu'), digits(fmt.pct0(summary.hitRate)), `${hitCi} · ${L('the bar is 0–100%, the tick the rate', 'črta je 0–100 %, oznaka delež')}`, ci),
      fig(L('Median excess return', 'Mediana presežnega donosa'), sgn(summary.medianExcess), L('per pick, 21 trading days, net of costs', 'na izbiro, 21 trgovalnih dni, po stroških')),
      fig(
        L('Worst pick', 'Najslabša izbira'),
        worst ? sgn(worst.excess) : '–',
        worst ? h('span', {}, `#${worst.no} · `, h('a', { href: href('pick', worst.no) }, worst.ticker), L(' · shown always', ' · vedno prikazana')) : '',
      ),
      // a drawdown is a loss: it carries the arrow and the loss colour like the worst pick (never a bare minus)
      fig(L('Max drawdown', 'Največji padec'), sgn(-Math.abs(summary.maxDrawdown)), L('follow every pick, paper portfolio, net; peak to trough', 'vse izbire, papirni portfelj, neto; od vrha do dna')),
      h(
        'div',
        { class: 'wall__aside' },
        h('span', { class: 'label wall__k' }, L('Then, in order', 'Nato, po vrsti')),
        h(
          'dl',
          { class: 'wall__more' },
          h('div', {}, h('dt', {}, L('Mean excess return', 'Povprečni presežni donos')), h('dd', { class: 'mono' }, signed(summary.meanExcess, { fmt, digits: 2 }))),
          h('div', {}, h('dt', {}, L('Median alert gap', 'Mediana razlike ob obvestilu')), h('dd', { class: 'mono' }, fmt.bps(summary.medianAlertGapBps))),
        ),
        h('span', { class: 'wall__s' }, trackRecordLabel(locale)),
      ),
    ),
    h('div', { class: 'wall__toc' }, tocNode),
  );
}

// ---- 01 headline statistics (fixed order, never animated, never the largest element) ---------------------
// Whole calendar months from one ISO date to another (2025-10-01 -> 2026-09-28 is 11).
function monthsBetween(from, to) {
  if (!from || !to) return 0;
  const [y0, m0, d0] = from.split('-').map(Number);
  const [y1, m1, d1] = to.split('-').map(Number);
  return (y1 - y0) * 12 + (m1 - m0) - (d1 < d0 ? 1 : 0);
}

function statsSection(ctx, summary, meta) {
  const { L, fmt, locale } = ctx;
  const eq = summary.equity ?? [];
  const note = summary.alertGapNote?.[locale] ?? summary.alertGapNote?.en ?? null;
  // The sentence reads the same last point as the chart's end labels (summary.cumulative is rounded to 4
  // decimals, so 0.183474 -> 0.1835 would print +18.4% beside a chart ending at +18.3%).
  const cum = eq.length ? { follow: eq.at(-1)[1] - 1, bench: eq.at(-1)[2] - 1 } : summary.cumulative;
  const young = !eq.length || monthsBetween(summary.liveSince, eq.at(-1)[0]) < 12;
  const rc = recordCounts(summary, meta?.counts);
  const chart = eq.length
    ? lineChart({
        dates: eq.map((r) => r[0]),
        series: [
          { key: 'follow', label: L('Follow every pick', 'Vse izbire'), short: L('Picks', 'Izbire'), values: eq.map((r) => r[1]), style: 'main', end: fmt.pct(eq.at(-1)[1] - 1, { sign: true }) },
          { key: 'bench', label: ctx.t('common.benchmark'), short: 'S&P 500', values: eq.map((r) => r[2]), style: 'bench', end: fmt.pct(eq.at(-1)[2] - 1, { sign: true }) },
        ],
        yLabel: (v) => fmt.pct(v - 1, { digits: 0, sign: true }),
        label: L('Follow-every-pick paper portfolio vs the benchmark: use the arrow keys to read each day.', 'Papirni portfelj vseh izbir proti merilu: s puščicami preberete vsak dan.'),
        legendLabel: L('Series', 'Serije'),
        readout: (i) => `${fmt.date(eq[i][0])} · ${L('follow every pick', 'vse izbire')} ${fmt.pct(eq[i][1] - 1, { sign: true })} · ${L('benchmark', 'merilo')} ${fmt.pct(eq[i][2] - 1, { sign: true })}`,
        valueLabel: (v) => fmt.pct(v - 1, { sign: true }),
        altCaption: L('Cumulative return at each month end: follow every pick vs the benchmark', 'Skupni donos ob koncu vsakega meseca: vse izbire proti merilu'),
        dateLabel: L('Date', 'Datum'),
        className: 'eq--ledger',
      })
    : null;
  return h(
    'section',
    { class: 'section grid rec-sec lg-stats', id: 'statistics', 'aria-labelledby': 'lg-st-h' },
    ...sectionHead({ index: '01', kicker: summary.label?.[locale] ?? summary.label?.en ?? '', title: L('Follow every pick.', 'Sledite vsaki izbiri.'), id: 'lg-st-h', size: 'd3' }),
    h(
      'p',
      { class: 'c-meta small muted lg-stats__order' },
      L('The figures above are always in this order: recommendations, hit rate, median before mean, the worst pick, the drawdown, the alert gap.', 'Številke zgoraj so vedno v tem vrstnem redu: priporočila, delež uspešnih, mediana pred povprečjem, najslabša izbira, padec, razlika ob obvestilu.'),
    ),
    cum
      ? h(
          'p',
          { class: 'c-meta rec-note' },
          L(
            `Cumulative since ${fmt.date(summary.liveSince)}, ${fmt.int(rc.records)} recommendations${Number.isFinite(rc.picks) ? ` (${fmt.int(rc.picks)} new picks, ${fmt.int(rc.renews)} renewals)` : ''}: follow every pick ${fmt.pct(cum.follow, { sign: true })}, benchmark ${fmt.pct(cum.bench, { sign: true })}. ${young ? 'Not annualised: the record is under twelve months old.' : 'Not annualised.'}`,
            `Skupaj od ${fmt.date(summary.liveSince)}, ${fmt.int(rc.records)} priporočil${Number.isFinite(rc.picks) ? ` (${fmt.int(rc.picks)} novih izbir, ${fmt.int(rc.renews)} podaljšanj)` : ''}: vse izbire ${fmt.pct(cum.follow, { sign: true })}, merilo ${fmt.pct(cum.bench, { sign: true })}. ${young ? 'Brez anualizacije: zapis je mlajši od dvanajstih mesecev.' : 'Brez anualizacije.'}`,
          ),
        )
      : null,
    note ? h('div', { class: 'c-body lg-gap' }, h('p', { class: 'label' }, L('About the alert gap', 'O razliki ob obvestilu')), h('p', { class: 'rec-note' }, note)) : null,
    chart,
  );
}

// ---- 02 the record table ------------------------------------------------------------------------------------
function recordSection(ctx, picks, ledger, meta) {
  const { L, fmt, locale } = ctx;
  const rows = recordRows(picks, ctx.tier);
  const phone = typeof matchMedia === 'function' && matchMedia('(max-width: 639.98px)').matches;
  const page = phone ? 20 : PAGE;
  const state = { status: 'all', kind: 'all', agreement: 'all', q: '', sort: 'no', dir: 'desc', limit: page };
  const cols = [
    { key: 'no', label: L('No.', 'Št.'), sort: 'no' },
    { key: 'issueDate', label: L('Issued', 'Izdano'), sort: 'issueDate' },
    { key: 'ticker', label: L('Stock', 'Delnica'), sort: 'ticker' },
    { key: 'agreement', label: L('Models', 'Modeli'), sort: 'agreement', num: true },
    { key: 'entryOpen', label: L('Entry', 'Vstop'), sort: 'entryOpen', num: true },
    { key: 'exitDate', label: L('Exit', 'Izstop'), sort: 'exitDate', num: true },
    { key: 'net', label: L('Net', 'Neto'), sort: 'net', num: true },
    { key: 'bench', label: L('S&P 500 TR', 'S&P 500 TR'), sort: 'bench', num: true },
    { key: 'excess', label: L('Excess', 'Presežek'), sort: 'excess', num: true },
    { key: 'status', label: L('Status', 'Stanje'), sort: 'status' },
  ];
  const statusWord = (r) =>
    r.status === 'open' ? L('open', 'odprta') : r.status === 'renewed' ? L(`renewed → #${r.renewedAs}`, `podaljšana → #${r.renewedAs}`) : L('closed', 'zaprta');
  const count = h('p', { class: 'lg-count mono', role: 'status' });
  const tbody = h('tbody', {});
  const moreBtn = h('button', { type: 'button', class: 'btn btn--ghost lg-more' });
  const headCells = cols.map((c) => {
    const btn = h('button', { type: 'button', class: 'lg-sort' }, c.label, h('span', { class: 'lg-sort__i', 'aria-hidden': 'true' }));
    btn.addEventListener('click', () => {
      if (state.sort === c.sort) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      else {
        state.sort = c.sort;
        state.dir = c.sort === 'ticker' || c.sort === 'status' ? 'asc' : 'desc';
      }
      draw();
      announce(L(`Sorted by ${c.label}, ${state.dir === 'asc' ? 'ascending' : 'descending'}.`, `Razvrščeno po stolpcu ${c.label}, ${state.dir === 'asc' ? 'naraščajoče' : 'padajoče'}.`));
    });
    return h('th', { scope: 'col', role: 'columnheader', class: [c.num && 'num', `lg-c-${c.key}`], dataset: { sort: c.sort } }, btn);
  });

  const cell = (c, r) => {
    const td = (content, extra = {}) => h('td', { role: 'cell', class: [c.num && 'num', `lg-c-${c.key}`], dataset: { label: c.label }, ...extra }, content);
    switch (c.key) {
      case 'no':
        return h('th', { scope: 'row', role: 'rowheader', class: 'lg-c-no' }, h('a', { class: 'mono lg-no', href: href('pick', r.no) }, `#${r.no}`), h('span', { class: 'lg-kind label' }, r.kind === 'RENEW' ? L('renew', 'podalj.') : L('buy', 'nakup')));
      case 'issueDate':
        return td(h('a', { class: 'mono', href: href('issue', r.issueDate) }, fmt.date(r.issueDate)));
      case 'ticker':
        return td(
          r.sealed
            ? h('span', { class: 'lg-sealed' }, h('span', { class: 'tag' }, ctx.t('common.sealed')), hashChip(r.commit, { t: ctx.t }))
            : h('span', { class: 'lg-stock' }, h('a', { class: 'ticker', href: href('stock', r.ticker) }, r.ticker), h('span', { class: 'lg-name small muted' }, r.name)),
        );
      case 'agreement':
        // the pick's lintel over its badge: the shared element of the sweep (pick-<no>)
        return td(h('span', { class: 'lg-lintel', dataset: { vtPick: r.no } }, h('span', { class: 'row-lintel', 'aria-hidden': 'true' }), h('span', { class: 'badge-quorum lg-q' }, `${r.agreement}/4`)));
      case 'entryOpen':
        return td(r.entryOpen == null ? '–' : fmtUsd(r.entryOpen, { locale }));
      case 'exitDate':
        return td(h('span', { class: r.final ? '' : 'muted' }, fmt.date(r.exitDate)));
      case 'net':
        return td(r.net == null ? '–' : h('span', { class: r.final ? '' : 'muted' }, fmt.pct(r.net, { sign: true })));
      case 'bench':
        return td(r.bench == null ? '–' : h('span', { class: r.final ? '' : 'muted' }, fmt.pct(r.bench, { sign: true })));
      case 'excess':
        return td(r.excess == null ? '–' : h('span', { class: r.final ? '' : 'lg-mtm' }, signed(r.excess, { fmt })));
      case 'status':
        return td(h('span', { class: ['lg-status', `is-${r.status}`] }, statusWord(r), r.sealed ? h('span', { class: 'visually-hidden' }, `, ${ctx.t('common.sealed')}`) : null));
      default:
        return td('');
    }
  };

  function draw() {
    const filtered = sortRows(filterRows(rows, state), state.sort, state.dir);
    const shown = filtered.slice(0, state.limit);
    tbody.replaceChildren(
      ...(shown.length
        ? shown.map((r) => h('tr', { role: 'row', class: ['lg-row', r.sealed && 'is-sealed', !r.final && 'is-open'] }, cols.map((c) => cell(c, r))))
        : [h('tr', { role: 'row' }, h('td', { role: 'cell', colspan: String(cols.length), class: 'lg-empty' }, L('No record matches these filters.', 'Noben zapis ne ustreza filtrom.')))]),
    );
    for (const th of headCells) {
      const on = th.dataset.sort === state.sort;
      if (on) th.setAttribute('aria-sort', state.dir === 'asc' ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
      th.querySelector('.lg-sort__i').textContent = on ? (state.dir === 'asc' ? '↑' : '↓') : '';
    }
    count.textContent = L(`${fmt.int(filtered.length)} of ${fmt.int(rows.length)} records`, `${fmt.int(filtered.length)} od ${fmt.int(rows.length)} zapisov`);
    moreBtn.hidden = filtered.length <= state.limit;
    moreBtn.textContent = L(`Show all ${fmt.int(filtered.length)}`, `Pokaži vseh ${fmt.int(filtered.length)}`);
  }
  moreBtn.addEventListener('click', () => {
    state.limit = Infinity;
    draw();
  });

  const seg = (label, key, options) => {
    const buttons = options.map(([v, text]) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(state[key] === v),
          onclick: (e) => {
            state[key] = v;
            state.limit = page;
            for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
            draw();
          },
        },
        text,
      ),
    );
    const id = `lg-f-${key}`;
    return h('div', { class: 'lg-filter' }, h('span', { class: 'label', id }, label), h('div', { class: 'seg seg--light', role: 'group', 'aria-labelledby': id }, buttons));
  };
  const search = h('input', { type: 'search', class: 'lg-search', placeholder: L('Ticker, name or number', 'Oznaka, ime ali številka'), 'aria-label': L('Search the record', 'Iskanje po zapisu'), autocomplete: 'off', spellcheck: 'false' });
  search.addEventListener('input', () => {
    state.q = search.value;
    state.limit = page;
    draw();
  });
  const controls = h(
    'div',
    { class: 'c-wide lg-controls' },
    seg(L('Status', 'Stanje'), 'status', [
      ['all', L('All', 'Vse')],
      ['open', L('Open', 'Odprte')],
      ['closed', L('Closed', 'Zaprte')],
      ['renewed', L('Renewed', 'Podaljšane')],
    ]),
    seg(L('Models', 'Modeli'), 'agreement', [
      ['all', L('All', 'Vse')],
      ['3', '3/4'],
      ['4', '4/4'],
    ]),
    seg(L('Record', 'Zapis'), 'kind', [
      ['all', L('All', 'Vse')],
      ['BUY', L('Buy', 'Nakup')],
      ['RENEW', L('Renew', 'Podaljšanje')],
    ]),
    h('div', { class: 'lg-filter lg-filter--search' }, h('span', { class: 'label', 'aria-hidden': 'true' }, L('Find', 'Išči')), search),
  );
  const table = h(
    'div',
    { class: 'c-wide lg-table-wrap' },
    h(
      'table',
      { class: 'table table--on-rules lg-table', role: 'table', 'aria-label': L('Every BUY and RENEW record', 'Vsi zapisi NAKUP in PODALJŠANJE') },
      h('thead', { role: 'rowgroup' }, h('tr', { role: 'row' }, headCells)),
      tbody,
    ),
  );
  draw();

  // Two copies, labelled apart (the viewer blocks downloads): the hash chain as CSV (every ledger record
  // with its hashes, to verify offline) and the picks table as CSV (one row per pick, as this viewer sees it)
  const csv = ledgerCsv(ledger.entries);
  const copyStatus = h('span', { class: 'small muted lg-csv__status', role: 'status' });
  const raw = h('textarea', { class: 'lg-raw mono', readonly: true, rows: '12', spellcheck: 'false', 'aria-label': L('The hash chain as CSV', 'Veriga zgoščenih vrednosti v obliki CSV'), wrap: 'off' });
  raw.value = csv;
  const copyBtn = h('button', { type: 'button', class: 'btn' }, L('Copy the hash chain (CSV)', 'Kopiraj verigo zgoščenih vrednosti (CSV)'));
  copyBtn.addEventListener('click', async () => {
    const ok = await copyText(csv);
    const lines = csv.trim().split('\n').length - 1;
    copyStatus.textContent = ok
      ? L(`Hash chain copied: ${fmt.int(lines)} records, ${fmt.int(csv.length)} characters.`, `Veriga kopirana: ${fmt.int(lines)} zapisov, ${fmt.int(csv.length)} znakov.`)
      : L('Copy was blocked here. Open the hash chain CSV below and select it.', 'Kopiranje je tu onemogočeno. Odprite CSV verige spodaj in ga izberite.');
    if (!ok) {
      details.open = true;
      raw.focus();
      raw.select();
    }
    announce(copyStatus.textContent);
  });
  const details = h(
    'details',
    { class: 'lg-rawbox' },
    h('summary', {}, L(`View the hash chain CSV (${fmt.int(ledger.entries.length)} records)`, `Pokaži CSV verige zgoščenih vrednosti (${fmt.int(ledger.entries.length)} zapisov)`)),
    h('p', { class: 'small muted' }, L('One row per ledger record: seq, type, issue date, time, previous hash, hash, and the body as canonical JSON. Hash a row’s fields yourself to check it.', 'Ena vrstica na zapis: zaporedna številka, vrsta, datum izdaje, čas, prejšnja zgoščena vrednost, zgoščena vrednost in vsebina kot kanonični JSON. Polja vrstice lahko zgostite sami.')),
    raw,
  );
  const live = ctx.mode === 'live' ? h('a', { class: 'arrow-link', href: '/api/ledger.csv' }, L('ledger.csv from the server', 'ledger.csv s strežnika')) : null;
  // The picks themselves as CSV, as this viewer sees them (open tickers for Signal and Research only)
  const picksCsv = recordsCsv(rows);
  const picksBtn = h('button', { type: 'button', class: 'btn btn--ghost' }, L('Copy the picks table (CSV)', 'Kopiraj tabelo izbir (CSV)'));
  picksBtn.addEventListener('click', async () => {
    const ok = await copyText(picksCsv);
    const n = rows.length;
    const sealedN = rows.filter((r) => r.sealed).length;
    copyStatus.textContent = ok
      ? L(`Picks table copied: ${fmt.int(n)} rows${sealedN ? `, ${fmt.int(sealedN)} of them sealed` : ''}.`, `Tabela izbir kopirana: ${fmt.int(n)} vrstic${sealedN ? `, od tega ${fmt.int(sealedN)} zapečatenih` : ''}.`)
      : L('Copy was blocked here. Select the table instead.', 'Kopiranje je tu onemogočeno. Namesto tega izberite tabelo.');
    announce(copyStatus.textContent);
  });

  return h(
    'section',
    { class: 'section grid rec-sec lg-record', id: 'record', 'aria-labelledby': 'lg-rc-h' },
    ...sectionHead({ index: '02', kicker: L('The record', 'Zapis'), title: L('Every pick, win or lose.', 'Vsaka izbira, dobra ali slaba.'), id: 'lg-rc-h', size: 'd3' }),
    h(
      'p',
      { class: 'lede c-body' },
      L(
        `Every BUY and RENEW, measured from the US open on the issue day to the open 21 trading days later, after costs. Open picks are marked to the latest close (shown lighter).${ctx.tier === 'free' ? (ctx.mode === 'live' ? ' Open picks stay sealed until they close.' : ' You are viewing as Free: open picks stay sealed until they close.') : ''}`,
        `Vsak NAKUP in PODALJŠANJE, merjeno od odprtja ameriškega trga na dan izdaje do odprtja 21 trgovalnih dni pozneje, po stroških. Odprte izbire so vrednotene ob zadnjem zaprtju (svetlejše).${ctx.tier === 'free' ? (ctx.mode === 'live' ? ' Odprte izbire ostanejo zapečatene do zaprtja.' : ' Gledate kot Brezplačno: odprte izbire ostanejo zapečatene do zaprtja.') : ''}`,
      ),
    ),
    h(
      'div',
      { class: 'c-meta lg-csv' },
      h('p', { class: 'label' }, L('Take it with you', 'Vzemite s seboj')),
      h('div', { class: 'lg-csv__item' }, copyBtn, h('p', { class: 'small muted' }, L('Every ledger record with its previous hash and hash, to check the chain offline.', 'Vsak zapis knjige s prejšnjo in lastno zgoščeno vrednostjo, za preverjanje verige brez povezave.'))),
      h('div', { class: 'lg-csv__item' }, picksBtn, h('p', { class: 'small muted' }, L('One row per pick (BUY or RENEW), as the table shows it to you.', 'Ena vrstica na izbiro (NAKUP ali PODALJŠANJE), kot vam jo kaže tabela.'))),
      live,
      copyStatus,
    ),
    controls,
    h('div', { class: 'c-wide lg-count-row' }, count),
    table,
    h('p', { class: 'c-wide lg-more-row' }, moreBtn),
    h('div', { class: 'c-body' }, details),
  );
}

// ---- 03 the chain, verification and the tamper demo ----------------------------------------------------------
function chainSection(ctx, ledger, picks, byNo) {
  const { L, fmt } = ctx;
  const entries = ledger.entries;
  const sealedNos = new Set(picks.filter((p) => !isRevealed(p, byNo)).map((p) => p.no));
  const blocks = issueBlocks(entries, ledger.anchors);
  const chain = chainBlocks(blocks, ctx, { sealedNos });
  const moreBtn = h('button', { type: 'button', class: 'btn btn--ghost cb-more' });
  const setMore = () => {
    moreBtn.hidden = chain.shown >= blocks.length;
    moreBtn.textContent = L(`Show older issues (${fmt.int(blocks.length - chain.shown)} more)`, `Pokaži starejše izdaje (še ${fmt.int(blocks.length - chain.shown)})`);
  };
  moreBtn.addEventListener('click', () => {
    chain.more(20);
    setMore();
  });
  setMore();

  // verification
  const bar = h('span', { class: 'vp__fill' });
  const prog = h('div', { class: 'vp', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-label': L('Verification progress', 'Napredek preverjanja') }, bar);
  const phase = h('p', { class: 'vp__phase mono' }, L(`${fmt.int(entries.length)} records · ${fmt.int(ledger.anchors?.length ?? 0)} daily anchors · ready`, `${fmt.int(entries.length)} zapisov · ${fmt.int(ledger.anchors?.length ?? 0)} dnevnih sider · pripravljeno`));
  const results = h('ul', { class: 'vr', 'aria-live': 'polite' });
  const btn = h('button', { type: 'button', class: 'btn verify__btn' }, L('Verify in your browser', 'Preveri v brskalniku'));
  const setProg = (p) => {
    const v = Math.round(p * 100);
    bar.style.setProperty('--p', String(p));
    prog.setAttribute('aria-valuenow', String(v));
  };
  const line = (ok, text) => h('li', { class: ['vr__line', ok ? 'is-ok' : 'is-bad'] }, h('span', { class: 'vr__mark', 'aria-hidden': 'true' }, ok ? '✓' : '×'), h('span', {}, text));
  btn.addEventListener('click', async () => {
    if (!globalThis.crypto?.subtle) {
      phase.textContent = L('This browser context has no WebCrypto (it needs HTTPS). Copy the CSV and check it offline.', 'Ta brskalnik tu nima WebCrypto (potreben je HTTPS). Kopirajte CSV in ga preverite brez povezave.');
      return;
    }
    btn.disabled = true;
    results.replaceChildren();
    setProg(0);
    const total = entries.length + (ledger.anchors?.length ?? 0) + 1;
    const res = await verifyLedger(ledger, {
      onProgress: ({ phase: ph, done, total: t }) => {
        const base = ph === 'chain' ? 0 : ph === 'reveals' ? entries.length : entries.length + 1;
        const frac = ph === 'reveals' ? done / Math.max(1, t) : done;
        setProg(Math.min(1, (base + frac) / total));
        phase.textContent =
          ph === 'chain'
            ? L(`Hashing record ${fmt.int(done)} of ${fmt.int(t)}…`, `Zgoščujem zapis ${fmt.int(done)} od ${fmt.int(t)}…`)
            : ph === 'reveals'
              ? L(`Checking reveal ${fmt.int(done)} of ${fmt.int(t)}…`, `Preverjam razkritje ${fmt.int(done)} od ${fmt.int(t)}…`)
              : L(`Recomputing Merkle root ${fmt.int(done)} of ${fmt.int(t)}…`, `Računam Merklov koren ${fmt.int(done)} od ${fmt.int(t)}…`);
      },
    });
    setProg(1);
    btn.disabled = false;
    const c = res.chain;
    // replaceChildren() would print a null child as the text "null": drop the lines that do not apply
    results.replaceChildren(
      ...[
      c.ok
        ? line(true, L(`${fmt.int(c.checked)} record hashes recomputed: SHA-256 of canonical JSON.`, `${fmt.int(c.checked)} zgoščenih vrednosti zapisov ponovno izračunanih: SHA-256 kanoničnega JSON.`))
        : line(false, L(`Chain broken at record #${c.firstBad}: ${c.reason}.`, `Veriga je pretrgana pri zapisu #${c.firstBad}: ${c.reason}.`)),
      c.ok ? line(true, L(`${fmt.int(Math.max(0, c.checked - 1))} previous-hash links match, back to the zero hash.`, `${fmt.int(Math.max(0, c.checked - 1))} povezav na prejšnjo vrednost se ujema, vse do ničelne.`)) : null,
      res.reveals.ok
        ? line(true, L(`${fmt.int(res.reveals.checked)} reveals hash to their commitments (${fmt.int(res.reveals.checked - res.reveals.prior)} at close, ${fmt.int(res.reveals.prior)} earlier records of renewed chains).`, `${fmt.int(res.reveals.checked)} razkritij se ujema z zavezami (${fmt.int(res.reveals.checked - res.reveals.prior)} ob zaprtju, ${fmt.int(res.reveals.prior)} prejšnjih zapisov podaljšanih verig).`))
        : line(false, L(`Reveal of #${res.reveals.bad[0].no} does not match: ${res.reveals.bad[0].reason}.`, `Razkritje #${res.reveals.bad[0].no} se ne ujema: ${res.reveals.bad[0].reason}.`)),
      res.anchors.ok
        ? line(true, L(`${fmt.int(res.anchors.checked)} daily Merkle roots recomputed and matched.`, `${fmt.int(res.anchors.checked)} dnevnih Merklovih korenov ponovno izračunanih in ujemajočih.`))
        : line(false, L(`Anchor of ${fmt.date(res.anchors.bad[0].date)}: ${res.anchors.bad[0].reason}.`, `Sidro ${fmt.date(res.anchors.bad[0].date)}: ${res.anchors.bad[0].reason}.`)),
      ].filter(Boolean),
    );
    phase.textContent = res.ok
      ? L(`Verified in ${fmt.int(res.ms)} ms with WebCrypto, in this tab. The chain is intact.`, `Preverjeno v ${fmt.int(res.ms)} ms z WebCrypto, v tem zavihku. Veriga je nepoškodovana.`)
      : L('Verification failed. See the first failure above.', 'Preverjanje ni uspelo. Glejte prvo napako zgoraj.');
    announce(phase.textContent);
  });

  const verify = h(
    'div',
    { class: 'c-meta verify lg-verify' },
    h('p', { class: 'label' }, L('Check it yourself', 'Preverite sami')),
    btn,
    prog,
    phase,
    results,
    h('p', { class: 'small lg-ots' }, L('Daily roots are anchored with OpenTimestamps (opentimestamps.org) and an RFC 3161 timestamp; in this demo the anchors are simulated.', 'Dnevni koreni so zasidrani z OpenTimestamps (opentimestamps.org) in časovnim žigom RFC 3161; v tem demu so sidra simulirana.')),
  );

  return h(
    'section',
    { class: 'section grid chamber ruled rec-sec lg-chain', id: 'chain', 'aria-labelledby': 'lg-ch-h' },
    ...sectionHead({ index: '03', kicker: L('The sealed ledger', 'Zapečatena knjiga'), title: L('Every record, chained.', 'Vsak zapis, v verigi.'), id: 'lg-ch-h', size: 'd3' }),
    h(
      'p',
      { class: 'lede c-body' },
      L(
        'Each record is canonical JSON hashed with SHA-256, and each hash includes the one before it. Change one character anywhere and every later link breaks. Each day’s records are rolled into a Merkle root and anchored to a public timestamp.',
        'Vsak zapis je kanonični JSON, zgoščen s SHA-256, in vsaka zgoščena vrednost vključuje prejšnjo. Spremenite en znak kjer koli in vse poznejše povezave se pretrgajo. Zapisi vsakega dne se združijo v Merklov koren in zasidrajo v javni časovni žig.',
      ),
    ),
    verify,
    tamperDemo(ctx, entries),
    chain.el,
    h('p', { class: 'c-wide cb-more-row' }, moreBtn),
  );
}

function tamperDemo(ctx, entries) {
  const { L, fmt } = ctx;
  const presets = [
    ['reveal', L('Swap a ticker', 'Zamenjaj oznako')],
    ['result', L('Improve a result', 'Olepšaj izid')],
    ['scored', L('Edit a count', 'Popravi število')],
  ];
  let preset = 'reveal';
  let forged = null;
  const out = h('div', { class: 'td__out', 'aria-live': 'polite' });
  const run = h('button', { type: 'button', class: 'btn btn--ghost' }, L('Forge a copy and verify', 'Ponaredi kopijo in preveri'));
  const rehash = h('button', { type: 'button', class: 'btn btn--ghost', hidden: true }, L('Also recompute the forged hash', 'Ponovno izračunaj še ponarejeno vrednost'));
  const seg = h(
    'div',
    { class: 'seg td__seg', role: 'group', 'aria-label': L('What to forge', 'Kaj ponarediti') },
    presets.map(([id, text]) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(id === preset),
          onclick: (e) => {
            preset = id;
            for (const b of seg.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
            forged = null;
            rehash.hidden = true;
            out.replaceChildren();
          },
        },
        text,
      ),
    ),
  );
  const diff = (before, after, at) =>
    h('code', { class: 'td__diff mono' }, h('span', { class: 'td__was' }, before), h('span', { 'aria-hidden': 'true' }, '  →  '), after.slice(0, at), h('mark', {}, after[at] ?? ''), after.slice(at + 1));
  run.addEventListener('click', async () => {
    if (!globalThis.crypto?.subtle) return;
    const target = tamperTarget(entries, preset);
    if (!target) return;
    run.disabled = true;
    forged = tamperCopy(entries, target);
    const res = await verifyInSlices(forged.entries, { yieldEvery: false });
    const rev = preset === 'reveal' ? await verifyReveals(forged.entries) : null;
    run.disabled = false;
    out.replaceChildren(
      ...[
      h('p', { class: 'td__what' }, h('span', { class: 'label' }, L(`Record #${target.seq} · ${target.label}`, `Zapis #${target.seq} · ${target.label}`)), diff(forged.before, forged.after, forged.at)),
      h(
        'p',
        { class: 'vr__line is-bad' },
        h('span', { class: 'vr__mark', 'aria-hidden': 'true' }, '×'),
        h('span', {}, L(`Verification fails at record #${res.firstBad}: ${res.reason}. The ${fmt.int(res.checked)} records before it still check.`, `Preverjanje odpove pri zapisu #${res.firstBad}: ${res.reason}. ${fmt.int(res.checked)} zapisov pred njim je še v redu.`)),
      ),
      rev && !rev.ok
        ? h(
            'p',
            { class: 'vr__line is-bad' },
            h('span', { class: 'vr__mark', 'aria-hidden': 'true' }, '×'),
            h('span', {}, L(`And the forged reveal of #${rev.bad[0].no} no longer hashes to the commitment sealed in record #${rev.bad[0].commitSeq}.`, `Ponarejeno razkritje #${rev.bad[0].no} se ne ujema več z zavezo, zapečateno v zapisu #${rev.bad[0].commitSeq}.`)),
          )
        : null,
      ].filter(Boolean),
    );
    rehash.hidden = false;
  });
  rehash.addEventListener('click', async () => {
    if (!forged) return;
    await rehashAt(forged.entries, forged.index);
    const res = await verifyInSlices(forged.entries, { yieldEvery: false });
    rehash.hidden = true;
    out.append(
      h(
        'p',
        { class: 'vr__line is-bad' },
        h('span', { class: 'vr__mark', 'aria-hidden': 'true' }, '×'),
        h('span', {}, L(`With its hash recomputed, record #${forged.seq} checks on its own, so the break moves to record #${res.firstBad}: ${res.reason}. Hiding it means rewriting every later record and the anchored daily roots.`, `Ko je njegova vrednost ponovno izračunana, je zapis #${forged.seq} sam zase v redu, zato se prelom premakne na zapis #${res.firstBad}: ${res.reason}. Prikrivanje bi zahtevalo prepis vseh poznejših zapisov in zasidranih dnevnih korenov.`)),
      ),
    );
  });
  return h(
    'div',
    { class: 'c-body td' },
    h('p', { class: 'label' }, L('Tamper demo · a local copy', 'Poskus ponaredbe · lokalna kopija')),
    h('p', { class: 'small td__intro' }, L('Pick a forgery. We flip one character in a copy held by this tab, never in the ledger, and run the same check.', 'Izberite ponaredbo. En znak spremenimo v kopiji v tem zavihku, nikoli v knjigi, in poženemo isto preverjanje.')),
    seg,
    h('p', { class: 'td__actions' }, run, rehash),
    out,
  );
}

// ---- 04 the per-model scoreboard ------------------------------------------------------------------------------
function scoreboardSection(ctx, sb, meta, R) {
  const { L, fmt, locale } = ctx;
  if (!sb) return null;
  let period = 'sealed';
  const plotWrap = h('div', { class: 'c-full flush lg-sb' });
  const icWrap = h('div', { class: 'c-full flush lg-sb' });
  const corrWrap = h('div', { class: 'c-meta lg-corr' });
  const periodText = h('p', { class: 'c-body small muted lg-period' });
  const R2 = ruleLabels({ rule: { topPct: sb.topPct ?? R.topPct } }, locale);
  const draw = () => {
    const p = sb.periods?.[period];
    // The holdout is backtest output (ARCHITECTURE.md §0): labelled HYPOTHETICAL, hatched, and its quorum
    // dots drawn in Graphite, because only the sealed record's picks are quorum marks.
    const hypo = period === 'holdout';
    periodText.textContent = p
      ? hypo
        ? L(`Hypothetical backtest · holdout (opened once, after the freeze): ${fmt.date(p.from)} to ${fmt.date(p.to)}. Not live results; the full backtest is on its own page.`, `Hipotetični povratni test · preizkusno obdobje (odprto enkrat, po zamrznitvi): ${fmt.date(p.from)} do ${fmt.date(p.to)}. Niso rezultati v živo; celoten povratni test je na svoji strani.`)
        : L(`Sealed record: ${fmt.date(p.from)} to ${fmt.date(p.to)}.`, `Zapečaten zapis: ${fmt.date(p.from)} do ${fmt.date(p.to)}.`)
      : '';
    periodText.classList.toggle('is-hypothetical', hypo);
    for (const w of [plotWrap, icWrap]) w.classList.toggle('is-hypothetical', hypo);
    const famRows = (sb.families ?? []).map((f) => ({
      key: f.id,
      title: f.id,
      sub: L(`${familyName(f.id, meta, locale)} · its ${R2.top}`, `${familyName(f.id, meta, locale)} · njenih ${R2.top}`),
      v: f[period]?.hit,
      ci: f[period]?.hitCI,
      n: f[period]?.n,
      kind: 'family',
    }));
    const agRows = (sb.agreement ?? []).map((a) => ({
      key: a.k,
      title: a.k.replace(' shadow', ''),
      sub: a.k === '4/4' ? L('Four of four · picks', 'Štiri od štirih · izbire') : a.k === '3/4' ? L('Three of four · picks', 'Tri od štirih · izbire') : L('Two of four · shadow, not picks', 'Dve od štirih · senčni niz, ne izbire'),
      v: a[period]?.hit,
      ci: a[period]?.hitCI,
      n: a[period]?.n,
      kind: a.k === '2/4 shadow' ? 'shadow' : hypo ? 'hypo' : 'quorum',
      note: Number.isFinite(a[period]?.medianExcess) ? L(`median excess ${fmt.pct(a[period].medianExcess, { sign: true })}`, `mediana presežka ${fmt.pct(a[period].medianExcess, { sign: true })}`) : null,
    }));
    plotWrap.replaceChildren(
      dotPlot([...agRows, ...famRows], {
        domain: HIT_DOMAIN,
        ticks: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
        tickLabel: (v) => fmt.pct0(v),
        axisLabel: L('Share that beat the benchmark over 21 trading days', 'Delež, ki je v 21 trgovalnih dneh premagal merilo'),
        valueLabel: (v) => fmt.pct0(v),
        ciLabel: ctx.t('common.ci'),
        nLabel: (n) => `n = ${fmt.int(n)}`,
        coin: L('coin flip', 'met kovanca'),
        caption: { row: L('Set', 'Niz'), value: L('Hit rate', 'Delež uspešnih') },
      }),
    );
    icWrap.replaceChildren(
      dotPlot(
        (sb.families ?? []).map((f) => ({ key: f.id, title: f.id, sub: familyName(f.id, meta, locale), v: f[period]?.ic, ci: f[period]?.icCI, n: f[period]?.icMonths, kind: 'family' })),
        {
          domain: IC_DOMAIN,
          ticks: [-0.1, -0.05, 0, 0.05, 0.1],
          tickLabel: (v) => fmt.num(v, 2),
          axisLabel: L('Mean monthly rank IC with the next 21 days', 'Povprečni mesečni rangovni IC z naslednjimi 21 dnevi'),
          valueLabel: (v) => fmt.num(v, 3),
          ciLabel: ctx.t('common.ci'),
          nLabel: (n) => L(`${fmt.int(n)} months`, `${fmt.int(n)} mesecev`),
          coin: L('no skill', 'brez znanja'),
          caption: { row: L('Family', 'Družina'), value: L('Rank IC', 'Rangovni IC') },
        },
      ),
    );
    if (hypo) for (const w of [plotWrap, icWrap]) w.prepend(hatchLayer());
  };
  const seg = h(
    'div',
    { class: 'seg seg--light lg-tabs', role: 'group', 'aria-label': L('Period', 'Obdobje') },
    [
      ['sealed', L('Sealed record', 'Zapečaten zapis')],
      ['holdout', L('Holdout 2022–2025', 'Preizkus 2022–2025')],
    ].map(([id, text]) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(id === period),
          onclick: (e) => {
            period = id;
            for (const b of seg.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
            draw();
            announce(text);
          },
        },
        text,
      ),
    ),
  );
  const corr = sb.correlations;
  if (corr?.matrix) {
    // The retrain rule (brief §3.2) applies on validation data at the annual retrain; the sealed-record
    // matrix is monitored. Cells above 0.5 are flagged and named, so the caption never contradicts them.
    const dIdx = corr.order.indexOf('D');
    const over = [];
    corr.matrix.forEach((row, i) => row.forEach((v, j) => j > i && v > 0.5 && over.push(`${corr.order[i]}–${corr.order[j]} ${fmt.num(v, 2)}`)));
    const dOver = dIdx >= 0 && corr.matrix[dIdx].some((v, j) => j !== dIdx && v > 0.5);
    const val = corr.validation?.maxD ?? corr.validationMaxD ?? null;
    const capEn = `Mean monthly cross-sectional Spearman, ${corr.period === 'holdout' ? 'holdout' : 'sealed record'}. The retrain rule applies to validation data at the annual retrain: if the ML ranker (D) correlates above 0.5 with another family there, it is retrained without that family’s inputs${Number.isFinite(val) ? ` (latest validation: highest D correlation ${fmt.num(val, 3)})` : ''}. In the sealed record the matrix is monitored, and D stays frozen until the retrain.${over.length ? ` Above 0.5 here: ${over.join(', ')}${dOver ? ', reviewed at the next annual retrain' : ''}.` : ''}`;
    const capSl = `Povprečni mesečni presečni Spearman, ${corr.period === 'holdout' ? 'preizkusno obdobje' : 'zapečaten zapis'}. Pravilo ponovnega učenja velja za validacijske podatke ob letnem ponovnem učenju: če rangirnik ML (D) tam z drugo družino korelira nad 0,5, ga naučimo brez vhodov te družine${Number.isFinite(val) ? ` (zadnja validacija: največja korelacija D ${fmt.num(val, 3)})` : ''}. V zapečatenem zapisu matriko spremljamo, D pa ostane zamrznjen do ponovnega učenja.${over.length ? ` Nad 0,5 tukaj: ${over.join(', ')}${dOver ? ', pregled ob naslednjem letnem ponovnem učenju' : ''}.` : ''}`;
    corrWrap.append(
      h('p', { class: 'label' }, L('Rank correlation between families', 'Rangovna korelacija med družinami')),
      h(
        'table',
        { class: 'table lg-corr__t' },
        h('caption', {}, L(capEn, capSl)),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, L('Family', 'Družina'))), corr.order.map((f) => h('th', { scope: 'col', class: 'num' }, f)))),
        h(
          'tbody',
          {},
          corr.order.map((f, i) =>
            h(
              'tr',
              {},
              h('th', { scope: 'row' }, f),
              corr.matrix[i].map((v, j) =>
                h('td', { class: ['num', i === j && 'muted', i !== j && v > 0.5 && 'is-over'] }, i === j ? '–' : fmt.num(v, 2), i !== j && v > 0.5 ? h('span', { class: 'visually-hidden' }, L(' (above 0.5)', ' (nad 0,5)')) : null),
              ),
            ),
          ),
        ),
      ),
    );
  }
  draw();
  return h(
    'section',
    { class: 'section grid rec-sec lg-score', id: 'scoreboard', 'aria-labelledby': 'lg-sb-h' },
    ...sectionHead({ index: '04', kicker: L('Per-model scoreboard', 'Preglednica modelov'), title: L('Is agreement worth waiting for?', 'Se soglasje splača počakati?'), id: 'lg-sb-h', size: 'd3' }),
    h(
      'p',
      { class: 'lede c-body' },
      L(
        `Each family’s own ${R2.top}, measured like picks, against the quorum picks and the 2/4 shadow set: every stock exactly two families liked, published after close as the control. If the quorum does not beat it, the gate adds nothing and this chart says so.`,
        `Lastnih ${R2.top} vsake družine, merjeno kot izbire, proti izbiram s kvorumom in senčnemu nizu 2/4: vse delnice, ki sta jih izbrali natanko dve družini, objavljene po zaprtju kot kontrola. Če kvorum tega niza ne premaga, pravilo ne doda ničesar in ta graf bi to pokazal.`,
      ),
    ),
    h('div', { class: 'c-meta lg-tabs-wrap' }, h('p', { class: 'label' }, L('Period', 'Obdobje')), seg),
    periodText,
    plotWrap,
    h('p', { class: 'c-body figcaption' }, L('Dots: hit rate. Lines: 95% confidence intervals. Small samples give wide intervals; we show them anyway. Only quorum picks are drawn in ultramarine.', 'Pike: delež uspešnih. Črte: 95-odstotni intervali zaupanja. Majhni vzorci dajo široke intervale; vseeno jih pokažemo. Samo izbire s kvorumom so ultramarin.')),
    h('h3', { class: 'd4 c-head lg-sub' }, L('Rank IC of each family', 'Rangovni IC vsake družine')),
    icWrap,
    corrWrap,
    sb.method ? h('p', { class: 'c-body rec-note' }, sb.method[locale] ?? sb.method.en) : null,
  );
}

// ---- 05 deciles and monthly IC ---------------------------------------------------------------------------------
function decilesSection(ctx, deciles, sb, meta, R) {
  const { L, fmt, locale } = ctx;
  if (!deciles) return null;
  let period = 'sealed';
  let score = 'combined';
  const wrap = h('div', { class: 'c-full flush lg-ds' });
  const cap = h('p', { class: 'c-body figcaption' });
  const name = (f) => familyName(f, meta, locale);
  const draw = () => {
    const rows = deciles[period]?.[score] ?? [];
    const title = score === 'combined' ? L('Combined score', 'Skupna ocena') : `${score} · ${name(score)}`;
    wrap.replaceChildren(staircase(rows, { fmt, L, title }));
    const months = deciles.months?.[period];
    // the holdout is backtest output: labelled HYPOTHETICAL and hatched, as on #backtest
    const hypo = period === 'holdout';
    wrap.classList.toggle('is-hypothetical', hypo);
    if (hypo) wrap.prepend(hatchLayer());
    cap.classList.toggle('is-hypothetical', hypo);
    cap.textContent = L(
      `${hypo ? 'Hypothetical backtest · ' : ''}${title}, ${period === 'sealed' ? 'sealed record' : 'holdout, not live results'}${months ? `, ${months} month-ends` : ''}. Every eligible stock, not just picks: mean 21-day excess return by decile, before costs, with 95% intervals.`,
      `${hypo ? 'Hipotetični povratni test · ' : ''}${title}, ${period === 'sealed' ? 'zapečaten zapis' : 'preizkusno obdobje, ne rezultati v živo'}${months ? `, ${months} koncev mesecev` : ''}. Vse upravičene delnice, ne samo izbire: povprečni 21-dnevni presežni donos po decilih, pred stroški, s 95-odstotnimi intervali.`,
    );
  };
  const mkSeg = (label, options, get, set) => {
    const seg = h(
      'div',
      { class: 'seg seg--light', role: 'group', 'aria-label': label },
      options.map(([id, text]) =>
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(id === get()),
            onclick: (e) => {
              set(id);
              for (const b of seg.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
              draw();
            },
          },
          text,
        ),
      ),
    );
    return h('div', { class: 'lg-filter' }, h('span', { class: 'label', 'aria-hidden': 'true' }, label), seg);
  };
  draw();
  return h(
    'section',
    { class: 'section grid rec-sec lg-deciles', id: 'deciles', 'aria-labelledby': 'lg-ds-h' },
    ...sectionHead({ index: '05', kicker: L('Statistical breadth', 'Statistična širina'), title: L('The whole universe, by decile.', 'Celoten univerzum po decilih.'), id: 'lg-ds-h', size: 'd3' }),
    h(
      'p',
      { class: 'lede c-body' },
      L(
        `A few picks a month take years to prove anything. Every stock scored every month-end is faster evidence: if the scores work, the steps rise from decile 1 to decile 10.`,
        `Nekaj izbir na mesec potrebuje leta, da kaj dokaže. Vsaka delnica, ocenjena ob vsakem koncu meseca, je hitrejši dokaz: če ocene delujejo, stopnice rastejo od decila 1 do decila 10.`,
      ),
    ),
    h(
      'div',
      { class: 'c-meta lg-ds-controls' },
      mkSeg(L('Score', 'Ocena'), [['combined', L('Combined', 'Skupna')], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D']], () => score, (v) => (score = v)),
      mkSeg(L('Period', 'Obdobje'), [['sealed', L('Sealed', 'Zapečaten')], ['holdout', L('Holdout', 'Preizkus')]], () => period, (v) => (period = v)),
    ),
    wrap,
    cap,
    sb?.icMonthly?.length ? h('h3', { class: 'd4 c-head lg-sub' }, L('Monthly rank IC, sealed record', 'Mesečni rangovni IC, zapečaten zapis')) : null,
    sb?.icMonthly?.length ? icSparklines(sb.icMonthly, { families: ['A', 'B', 'C', 'D'], fmt, L, name }) : null,
    sb?.icMonthly?.length
      ? h('p', { class: 'c-body figcaption' }, L('Spearman correlation of each month-end score with the next 21-day return, across every eligible stock. Solid line: the month; dotted line: its mean. A family whose 24-month live IC is at or below zero is retired.', 'Spearmanova korelacija ocene ob koncu meseca z donosom naslednjih 21 dni, prek vseh upravičenih delnic. Polna črta: mesec; pikčasta: povprečje. Družina, katere 24-mesečni IC v živo je nič ali manj, se upokoji.'))
      : null,
  );
}

// ---- 06 the Silence Calendar ---------------------------------------------------------------------------------------
function calendarSection(ctx, issues, launch) {
  const { L, fmt, locale } = ctx;
  const readout = h('p', { class: 'sc-readout mono', 'aria-hidden': 'true' });
  const cal = silenceCalendar(issues, {
    fmt,
    L,
    locale,
    onReadout: (c) => {
      readout.textContent = c.text;
      readout.dataset.kind = c.row.quorum ? 'q' : 'n';
    },
  });
  const q = issues.filter((r) => r.quorum).length;
  cal.el.setAttribute('aria-label', L('Every issue. Arrow keys move through the issues; Enter opens one.', 'Vse izdaje. S puščicami se premikate med izdajami; Enter jo odpre.'));
  return h(
    'section',
    { class: 'section grid rec-sec home-cal lg-cal', id: 'calendar', 'aria-labelledby': 'lg-cal-h' },
    ...sectionHead({ index: '06', kicker: L('The Silence Calendar', 'Koledar tišine'), title: L('Most days: no new pick.', 'Večino dni: brez nove izbire.'), id: 'lg-cal-h', size: 'd3' }),
    h(
      'p',
      { class: 'lede c-body' },
      L(`${fmt.int(issues.length)} issues since ${fmt.date(issues[0]?.date)}, one every US trading day at 14:00; ${fmt.int(q)} carried a new pick or a renewal. On the others the stocks that met the rule were already open picks, capped or cooling down. Each cell opens that day’s issue.`, `${fmt.int(issues.length)} izdaj od ${fmt.date(issues[0]?.date)}, vsak dan trgovanja v ZDA ob 14:00; ${fmt.int(q)} z novo izbiro ali podaljšanjem. Ob drugih so bile delnice, ki so izpolnile pravilo, že odprte izbire, omejene ali v premoru. Vsaka celica odpre izdajo tistega dne.`),
    ),
    h(
      'div',
      { class: 'c-meta sc-meta' },
      h(
        'ul',
        { class: 'sc-legend' },
        [L('No new pick', 'Brez nove izbire'), L('Quorum: a pick', 'Kvorum: izbira'), launch?.prelaunch ? L('Exit, text due', 'Izstop, predviden SMS') : L('Exit texted', 'Poslan izstop')].map((text, i) =>
          h('li', {}, h('span', { class: `sc-key sc-${['n', 'q', 'x'][i]}`, 'aria-hidden': 'true' }), text),
        ),
      ),
      h('p', { class: 'label' }, L('Selected issue', 'Izbrana izdaja')),
      readout,
    ),
    h('div', { class: 'sc-figure c-wide flush' }, cal.el),
  );
}

// ---- 07 the MAR lists -------------------------------------------------------------------------------------------------
function listsSection(ctx) {
  const { L } = ctx;
  const link = (hr, text) => h('li', {}, h('a', { class: 'arrow-link', href: hr }, text, h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')));
  return h(
    'section',
    { class: 'section grid rec-sec lg-lists', id: 'lists', 'aria-labelledby': 'lg-ls-h' },
    ...sectionHead({ index: '07', kicker: L('Generated from the ledger', 'Ustvarjeno iz knjige'), title: L('Disclosures.', 'Razkritja.'), id: 'lg-ls-h', size: 'd3' }),
    h(
      'ul',
      { class: 'c-body lg-lists__list' },
      link(href('disclosures', null, 'list'), L('All recommendations, last 12 months', 'Vsa priporočila, zadnjih 12 mesecev')),
      link(href('disclosures', null, 'ratings'), L('Quarterly rating distribution: 100% BUY', 'Četrtletna porazdelitev: 100 % NAKUP')),
      link(href('disclosures', null, 'conflicts'), L('Conflicts and trading policy', 'Nasprotja interesov in pravila trgovanja')),
      link(href('backtest'), L('The backtest, kept separate and labelled hypothetical', 'Povratni test, ločen in označen kot hipotetičen')),
    ),
  );
}
