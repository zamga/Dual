// #app-research: the Research-tier explorer, on Chamber. The full universe behind the latest issue
// (universe.json, about 1,400 rows) in a virtualised grid laid on the rules: the stock in bay 1, the four
// family percentiles as four columns in bay 2, agreement, veto and size in bay 3. Sorting, search,
// filters (sector, agreement, each family's percentile range, vetoes), presets, a screener summary, the
// decile and IC widgets, and "Copy CSV" for personal use (the viewer blocks downloads).
//
// Free and Signal viewers get an honest preview: what the table holds, column by column, and no rows
// (no blurred teaser). Every row is labelled fictional; the whole market is simulated.
//
// SL: first draft, needs native review.
import { h, announce, setNumber } from '../dom.js';
import { href } from '../router.js';
import { masthead } from './_content.js';
import { signed, familyName } from '../ui.js';
import { ruleLabels } from '../rule.js';
import { staircase, icSparklines } from '../charts/deciles.js';
import { loadMe, tierOf, modeNote, copyPanel } from './_member.js';
import { price } from './_join.js';
import {
  FAMILIES,
  VETOES,
  VETO_LABEL,
  universeRows,
  filterUniverse,
  sortUniverse,
  summarize,
  universeCsv,
  visibleRange,
  defaultFilters,
  isDefault,
  preset,
  pctl,
  money,
  sectorL,
  meetsRule,
} from './_universe.js';

// The explorer's state lives in memory, so a language or view-as switch keeps the screen.
const state = { filters: defaultFilters(), sort: 'agree', dir: 'desc', active: 0 };

export async function render(ctx) {
  const { L, locale, fmt } = ctx;
  const [meta, deciles, scoreboard, issues] = await Promise.all([
    ctx.data('meta').catch(() => null),
    ctx.data('deciles').catch(() => null),
    ctx.data('scoreboard').catch(() => null),
    ctx.data('issues').catch(() => null),
  ]);
  let me = null;
  try {
    me = await loadMe(ctx);
  } catch {
    me = null;
  }
  const tier = me?.authenticated ? tierOf(ctx, me) : 'free';
  const universe = tier === 'research' ? await ctx.data('universe').catch(() => null) : null;
  const rows = universe && !universe.redacted ? universeRows(universe) : [];
  const gated = tier !== 'research' || !rows.length;
  const R = ruleLabels(meta, locale);
  const topPct = R.topPct ?? meta?.rule?.topPct ?? 0.95;
  const nScored = rows.length || meta?.universe?.scoredToday || issues?.at(-1)?.nScored || 0;
  const date = universe?.date ?? meta?.asOf ?? issues?.at(-1)?.date ?? '';
  const scoresAsOf = universe?.scoresAsOf ?? null;
  const name = (f) => familyName(f, meta, locale);

  const head = masthead({
    kicker: L(`Research · the universe · ${date ? fmt.date(date) : ''}${scoresAsOf ? ` · scores as of the ${fmt.date(scoresAsOf)} close` : ''}`, `Research · univerzum · ${date ? fmt.date(date) : ''}${scoresAsOf ? ` · ocene ob zaprtju ${fmt.date(scoresAsOf)}` : ''}`),
    title: L(`${fmt.int(nScored)} stocks, four columns.`, `${fmt.int(nScored)} delnic, štirje stebri.`),
    lede: gated
      ? L('The Research tier’s explorer: every eligible stock the four families scored for the latest issue, with each family’s percentile, the agreement and the veto that fired.', 'Raziskovalnik paketa Research: vsaka upravičena delnica, ki so jo štiri družine ocenile za zadnjo izdajo, s percentilom vsake družine, soglasjem in vetom, ki se je sprožil.')
      : L(`Every eligible stock the four families scored for the ${fmt.date(date)} issue: each family’s percentile, how many are in their ${R.top}, and the first veto that fired. Descriptive data, not recommendations: only a pick in the ledger is one.`, `Vsaka upravičena delnica, ki so jo štiri družine ocenile za izdajo ${fmt.date(date)}: percentil vsake družine, koliko jih je ${R.inTop}, in prvi veto, ki se je sprožil. Opisni podatki, ne priporočila: priporočilo je samo izbira v knjigi.`),
    meta: h(
      'div',
      { class: 'rx-meta' },
      h('p', { class: 'rx-meta__sim' }, h('span', { class: 'tag' }, ctx.t('common.simulated')), h('span', { class: 'small' }, L('A simulated market. Every company, ticker and figure below is fictional.', 'Simuliran trg. Vsa podjetja, oznake in številke spodaj so izmišljeni.'))),
      h('p', { class: 'small muted' }, L('Research launches after counsel review (Gate R): if daily per-stock scores count as recommendations, it opens with families A–C as descriptive percentiles only.', 'Research se odpre po pravnem pregledu (pogoj R): če dnevne ocene posameznih delnic štejejo za priporočila, se odpre samo z opisnimi percentili družin A–C.')),
      modeNote(ctx, ctx.mode === 'live' ? null : L(`Demo: viewing as ${tier === 'research' ? 'Research' : tier === 'signal' ? 'Signal' : 'Free'}.`, `Demo: pogled kot ${tier === 'research' ? 'Research' : tier === 'signal' ? 'Signal' : 'Brezplačno'}.`)),
    ),
  });

  head.classList.add('ruled');
  const widgets = decileSection(ctx, deciles, scoreboard, meta, gated ? '02' : '03', name);
  if (gated) {
    const node = h('div', { class: 'page rx chamber' }, head, gateSection(ctx, { tier, R, name, nScored, issue: issues?.at(-1) }), widgets);
    return { title: L('Research', 'Research'), node, top: 'chamber' };
  }

  // ---- the explorer -----------------------------------------------------------------------------------------
  const phoneMq = typeof matchMedia === 'function' ? matchMedia('(max-width: 639.98px)') : null;
  const tabletMq = typeof matchMedia === 'function' ? matchMedia('(max-width: 1023.98px)') : null;
  const sectors = [...new Set(rows.map((r) => r.sector))].sort((a, b) => sectorL(a, locale).localeCompare(sectorL(b, locale)));
  let view = [];
  const cleanups = [];

  const COLS = [
    { key: 'ticker', label: L('Stock', 'Delnica'), sort: 'ticker', cls: 'rx-c-stock' },
    ...FAMILIES.map((f) => ({ key: f, label: f, title: name(f), sort: f, cls: 'rx-c-fam', num: true })),
    { key: 'agree', label: L('Agree', 'Sogl.'), title: L('Families agreeing', 'Soglasje družin'), sort: 'agree', cls: 'rx-c-agree' },
    { key: 'veto', label: L('Veto', 'Veto'), sort: 'veto', cls: 'rx-c-veto' },
    { key: 'mcap', label: L('Cap', 'Kap. $'), title: L('Market capitalisation', 'Tržna kapitalizacija'), sort: 'mcap', cls: 'rx-c-mcap', num: true },
    { key: 'adv60', label: L('ADV', 'Prom. $'), title: L('Average daily dollar volume, 60 days', 'Povprečni dnevni promet v dolarjih, 60 dni'), sort: 'adv60', cls: 'rx-c-adv', num: true },
    { key: 'ret21', label: L('21d', '21 d'), title: L('Trailing 21-day return', 'Donos zadnjih 21 dni'), sort: 'ret21', cls: 'rx-c-ret', num: true },
  ];

  // header: sort buttons
  const headCells = COLS.map((c) => {
    const btn = h('button', { type: 'button', class: 'rx-sort', title: c.title ?? null }, h('span', {}, c.label), h('span', { class: 'rx-sort__i', 'aria-hidden': 'true' }));
    btn.addEventListener('click', () => {
      if (state.sort === c.sort) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      else {
        state.sort = c.sort;
        state.dir = ['ticker', 'veto'].includes(c.sort) ? 'asc' : 'desc';
      }
      apply({ keepScroll: false });
      announce(L(`Sorted by ${c.title ?? c.label}, ${state.dir === 'asc' ? 'ascending' : 'descending'}.`, `Razvrščeno po ${c.title ?? c.label}, ${state.dir === 'asc' ? 'naraščajoče' : 'padajoče'}.`));
    });
    return h('div', { class: ['rx-h', c.cls, c.num && 'is-num'], role: 'columnheader', dataset: { sort: c.sort } }, btn);
  });
  const headRow = h('div', { class: 'rx-row rx-headrow', role: 'row', 'aria-rowindex': '1' }, headCells);

  // family range filters, each above its column
  const rangeEls = {};
  const famFilters = FAMILIES.map((f) => {
    const r = rangeSlider(ctx, { fam: f, label: `${f} · ${name(f)}`, value: state.filters.ranges[f], gate: topPct, onChange: (lo, hi) => {
      state.filters.ranges[f] = [lo, hi];
      apply();
    } });
    rangeEls[f] = r;
    return r.node;
  });
  const filterRow = h(
    'div',
    { class: 'rx-row rx-filterrow', role: 'group', 'aria-label': L('Filter by each family’s percentile', 'Filter po percentilu vsake družine') },
    h('div', { class: 'rx-filterrow__k' }, h('span', { class: 'label' }, L('Percentile range', 'Razpon percentilov')), h('span', { class: 'small muted' }, L(`The tick marks the ${R.pctile}.`, `Oznaka kaže ${R.pctile}.`))),
    famFilters.map(() => h('div', { class: 'rx-f' })),
    h('div', { class: 'rx-filterrow__rest' }),
  );

  // body: the virtual window
  const body = h('div', { class: 'rx-body', role: 'rowgroup' });
  const scroller = h('div', { class: 'rx-scroll', role: 'presentation' }, body);
  // The grid itself is the one keyboard stop: it carries the name, aria-activedescendant and the keys,
  // so a screen reader announces "The universe, grid" and then the active row's stock cell.
  const grid = h(
    'div',
    {
      class: 'rx-grid',
      role: 'grid',
      tabindex: '0',
      'aria-label': L('The universe, one row per stock (simulated, fictional companies). Arrow keys move, Enter opens the stock.', 'Univerzum, ena vrstica na delnico (simulirano, izmišljena podjetja). Puščice premikajo, Enter odpre delnico.'),
      'aria-colcount': String(COLS.length),
    },
    h('div', { class: 'rx-headwrap', role: 'rowgroup' }, headRow),
    scroller,
  );
  const empty = h('p', { class: 'rx-empty', hidden: true }, L('No stock matches these filters. ', 'Nobena delnica ne ustreza filtrom. '), h('button', { type: 'button', class: 'rx-linkbtn', onclick: () => resetAll() }, L('Clear the filters', 'Počisti filtre')));

  const rowH = () => {
    const v = parseFloat(getComputedStyle(grid).getPropertyValue('--rx-h'));
    return Number.isFinite(v) && v > 0 ? v : 52;
  };
  const rendered = new Map();
  let H = 52;
  const vetoShort = (k) => (k ? VETO_LABEL[k]?.short?.[locale] ?? VETO_LABEL[k]?.short?.en ?? k : '–');

  function rowNode(r, i) {
    const cells = [];
    // the quorum colour only for stocks that met the rule (3 or 4 families and no veto); a vetoed 3/4 is
    // drawn hollow in Mist with its veto named, because it could not be a pick
    const agreeQ = meetsRule(r);
    const blocked = (r.agree ?? 0) >= 3 && !!r.veto;
    cells.push(
      h(
        'div',
        { class: 'rx-c rx-c-stock', role: 'rowheader', id: `rx-c-${i}` },
        h('a', { class: 'ticker rx-ticker', href: href('stock', r.ticker), tabindex: '-1' }, r.ticker),
        h('span', { class: 'rx-stock__t' }, h('span', { class: 'rx-name' }, r.name), h('span', { class: 'rx-sub' }, `${sectorL(r.sector, locale)} · ${L('fictional', 'izmišljeno')}`)),
      ),
    );
    for (const f of FAMILIES) {
      const v = r[f];
      const top = Number.isFinite(v) && v >= topPct;
      const cell = h(
        'div',
        { class: ['rx-c', 'rx-c-fam', 'is-num', top && 'is-top', top && agreeQ && 'is-agree'], role: 'gridcell', 'aria-label': `${f} ${name(f)}: ${pctl(v)}${top ? ` (${R.top})` : ''}` },
        h('span', { class: 'rx-p', 'aria-hidden': 'true' }, h('span', { class: 'rx-fk' }, f), pctl(v)),
        h('span', { class: 'rx-bar', 'aria-hidden': 'true' }, h('i')),
      );
      cell.style.setProperty('--v', Number.isFinite(v) ? String(v) : '0');
      cells.push(cell);
    }
    const dots = h('span', { class: ['rx-dots', agreeQ && 'is-quorum', blocked && 'is-blocked'], 'aria-hidden': 'true' }, [0, 1, 2, 3].map((k) => h('i', { class: k < (r.agree ?? 0) ? 'is-on' : null })));
    cells.push(h('div', { class: ['rx-c', 'rx-c-agree', agreeQ && 'is-quorum', blocked && 'is-blocked'], role: 'gridcell' }, dots, h('span', { class: 'rx-agree' }, `${r.agree ?? 0}/4`, blocked ? h('span', { class: 'visually-hidden' }, L(', vetoed', ', z vetom')) : null)));
    cells.push(h('div', { class: ['rx-c', 'rx-c-veto', r.veto && 'is-vetoed'], role: 'gridcell', title: r.veto ? VETO_LABEL[r.veto]?.[locale] ?? r.veto : null }, vetoShort(r.veto)));
    cells.push(h('div', { class: 'rx-c rx-c-mcap is-num', role: 'gridcell' }, money(r.mcap, locale)));
    cells.push(h('div', { class: 'rx-c rx-c-adv is-num', role: 'gridcell' }, money(r.adv60, locale)));
    cells.push(h('div', { class: 'rx-c rx-c-ret is-num', role: 'gridcell' }, Number.isFinite(r.ret21) ? signed(r.ret21, { fmt }) : '–'));
    const row = h('div', { class: ['rx-row', 'rx-datarow', agreeQ && 'is-quorum', r.veto && 'is-vetoed', i === state.active && 'is-active'], role: 'row', 'aria-rowindex': String(i + 2), dataset: { i: String(i) } }, cells);
    row.style.transform = `translateY(${i * H}px)`;
    return row;
  }

  function paint() {
    const n = view.length;
    const { start, end } = visibleRange(scroller.scrollTop, scroller.clientHeight, H, n, 8);
    for (const [i, el] of rendered) {
      if (i < start || i >= end) {
        el.remove();
        rendered.delete(i);
      }
    }
    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
      if (!rendered.has(i)) {
        const el = rowNode(view[i], i);
        rendered.set(i, el);
        frag.append(el);
      }
    }
    body.append(frag);
    syncActive();
  }

  function repaintAll() {
    for (const el of rendered.values()) el.remove();
    rendered.clear();
    H = rowH();
    body.style.height = `${view.length * H}px`;
    paint();
  }

  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      paint();
    });
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });

  // keyboard: one tab stop; arrows move the active row (aria-activedescendant), Enter opens the stock
  function syncActive() {
    for (const [i, el] of rendered) el.classList.toggle('is-active', i === state.active);
    if (view.length && rendered.has(state.active)) grid.setAttribute('aria-activedescendant', `rx-c-${state.active}`);
    else grid.removeAttribute('aria-activedescendant');
  }
  function moveTo(i) {
    if (!view.length) return;
    state.active = Math.max(0, Math.min(view.length - 1, i));
    const top = state.active * H;
    const vh = scroller.clientHeight;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (top + H > scroller.scrollTop + vh) scroller.scrollTop = top + H - vh;
    paint();
    const r = view[state.active];
    announce(`${r.ticker}, ${String(r.name).replace(/\.+$/, '')}. ${FAMILIES.map((f) => `${f} ${pctl(r[f])}`).join(', ')}. ${r.agree ?? 0}/4${r.veto ? `, ${VETO_LABEL[r.veto]?.[locale] ?? r.veto}` : ''}.`);
  }
  grid.addEventListener('keydown', (e) => {
    if (e.target !== grid) return; // the sort buttons in the header keep their own keys
    const page = Math.max(1, Math.floor(scroller.clientHeight / H) - 1);
    const map = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page };
    if (e.key in map) {
      e.preventDefault();
      moveTo(state.active + map[e.key]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      moveTo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      moveTo(view.length - 1);
    } else if (e.key === 'Enter' && view[state.active]) {
      e.preventDefault();
      ctx.navigate(href('stock', view[state.active].ticker));
    }
  });
  grid.addEventListener('focus', () => {
    if (!rendered.has(state.active)) {
      const { start } = visibleRange(scroller.scrollTop, scroller.clientHeight, H, view.length, 0);
      state.active = Math.min(start, Math.max(0, view.length - 1));
    }
    syncActive();
  });
  body.addEventListener('click', (e) => {
    const row = e.target.closest('.rx-datarow');
    if (!row) return;
    state.active = Number(row.dataset.i);
    syncActive();
  });

  // ---- controls ---------------------------------------------------------------------------------------------
  const search = h('input', { type: 'search', class: 'm-input rx-search', placeholder: L('Ticker or name', 'Oznaka ali ime'), autocomplete: 'off', spellcheck: 'false', 'aria-label': L('Search by ticker or name', 'Iskanje po oznaki ali imenu'), value: state.filters.q });
  search.addEventListener('input', () => {
    state.filters.q = search.value;
    apply({ keepScroll: false });
  });
  const sectorSel = h(
    'select',
    { class: 'm-input m-select rx-select', 'aria-label': L('Sector', 'Sektor') },
    h('option', { value: 'all' }, L('All sectors', 'Vsi sektorji')),
    sectors.map((s) => h('option', { value: s, selected: state.filters.sector === s }, sectorL(s, locale))),
  );
  sectorSel.addEventListener('change', () => {
    state.filters.sector = sectorSel.value;
    apply({ keepScroll: false });
  });
  const vetoSel = h(
    'select',
    { class: 'm-input m-select rx-select', 'aria-label': L('Vetoes', 'Veta') },
    h('option', { value: 'all', selected: state.filters.veto === 'all' }, L('Any veto state', 'Vsa veta')),
    h('option', { value: 'none', selected: state.filters.veto === 'none' }, L('No veto', 'Brez veta')),
    h('option', { value: 'any', selected: state.filters.veto === 'any' }, L('Any veto', 'Katerikoli veto')),
    VETOES.map((k) => h('option', { value: k, selected: state.filters.veto === k }, VETO_LABEL[k][locale] ?? VETO_LABEL[k].en)),
  );
  vetoSel.addEventListener('change', () => {
    state.filters.veto = vetoSel.value;
    apply({ keepScroll: false });
  });
  const agreeOpts = [
    ['all', L('Any', 'Vse')],
    ['1', '1+'],
    ['2', '2+'],
    ['3', '3+'],
    ['4', '4'],
  ];
  const agreeSeg = h(
    'div',
    { class: 'seg rx-seg', role: 'group', 'aria-labelledby': 'rx-agree-l' },
    agreeOpts.map(([v, t]) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(String(state.filters.agree) === v),
          dataset: { v },
          onclick: () => {
            state.filters.agree = v;
            apply({ keepScroll: false });
          },
        },
        t,
      ),
    ),
  );
  // mobile: sort as a select (the column heads are not shown on phones)
  const sortSel = h(
    'select',
    { class: 'm-input m-select rx-select rx-sortsel', 'aria-label': L('Sort by', 'Razvrsti po') },
    [
      ['agree:desc', L('Agreement, most first', 'Soglasje, največ najprej')],
      ...FAMILIES.map((f) => [`${f}:desc`, L(`${f} ${name(f)}, highest first`, `${f} ${name(f)}, najvišje najprej`)]),
      ['ret21:desc', L('21-day return, highest first', '21-dnevni donos, najvišji najprej')],
      ['ret21:asc', L('21-day return, lowest first', '21-dnevni donos, najnižji najprej')],
      ['mcap:desc', L('Market cap, largest first', 'Kapitalizacija, največja najprej')],
      ['ticker:asc', L('Ticker, A to Z', 'Oznaka, od A do Ž')],
    ].map(([v, t]) => h('option', { value: v, selected: `${state.sort}:${state.dir}` === v }, t)),
  );
  sortSel.addEventListener('change', () => {
    const [k, d] = sortSel.value.split(':');
    state.sort = k;
    state.dir = d;
    apply({ keepScroll: false });
  });
  const PRESETS = [
    ['quorum', L('3 or more agree', '3 ali več se strinja')],
    ['near', L('2+ and no veto', '2+ in brez veta')],
    ['vetoed', L('2+ but vetoed', '2+, a z vetom')],
    ['trend', L(`A in its ${R.top}`, `A ${R.inTop}`)],
  ];
  const presetBtns = PRESETS.map(([id, t]) =>
    h(
      'button',
      {
        type: 'button',
        class: 'rx-chip',
        'aria-pressed': 'false',
        dataset: { preset: id },
        onclick: () => {
          const p = preset(id, topPct);
          p.q = '';
          state.filters = p;
          syncControls();
          apply({ keepScroll: false });
          announce(L(`Screen: ${t}. ${view.length} stocks.`, `Filter: ${t}. ${view.length} delnic.`));
        },
      },
      t,
    ),
  );
  const resetBtn = h('button', { type: 'button', class: 'rx-linkbtn', onclick: () => resetAll() }, L('Reset', 'Ponastavi'));
  function resetAll() {
    state.filters = defaultFilters();
    state.sort = 'agree';
    state.dir = 'desc';
    syncControls();
    apply({ keepScroll: false });
    announce(L('Filters cleared.', 'Filtri počiščeni.'));
  }
  function syncControls() {
    search.value = state.filters.q ?? '';
    sectorSel.value = state.filters.sector;
    vetoSel.value = state.filters.veto;
    for (const b of agreeSeg.children) b.setAttribute('aria-pressed', String(b.dataset.v === String(state.filters.agree)));
    for (const f of FAMILIES) rangeEls[f].set(state.filters.ranges[f]);
    sortSel.value = `${state.sort}:${state.dir}`;
  }

  const controls = h(
    'div',
    { class: 'c-body rx-controls' },
    h('div', { class: 'rx-ctl rx-ctl--search' }, h('span', { class: 'label', 'aria-hidden': 'true' }, L('Find', 'Išči')), search),
    h('div', { class: 'rx-ctl' }, h('span', { class: 'label', 'aria-hidden': 'true' }, L('Sector', 'Sektor')), h('span', { class: 'm-select-wrap' }, sectorSel)),
    h('div', { class: 'rx-ctl' }, h('span', { class: 'label', id: 'rx-agree-l' }, L('Families agreeing', 'Soglasje družin')), agreeSeg),
    h('div', { class: 'rx-ctl' }, h('span', { class: 'label', 'aria-hidden': 'true' }, L('Vetoes', 'Veta')), h('span', { class: 'm-select-wrap' }, vetoSel)),
    h('div', { class: 'rx-ctl rx-ctl--sort' }, h('span', { class: 'label', 'aria-hidden': 'true' }, L('Sort', 'Razvrsti')), h('span', { class: 'm-select-wrap' }, sortSel)),
  );
  const presetsRow = h('div', { class: 'c-body rx-presets' }, h('span', { class: 'label' }, L('Screens', 'Filtri')), presetBtns, resetBtn);

  // phones: the four family ranges in a disclosure above the list
  const phoneRanges = h('details', { class: 'c-wide rx-phone-ranges' }, h('summary', {}, L('Family percentile ranges', 'Razponi percentilov družin')));

  // ---- the screener summary (updates with every filter) --------------------------------------------------------
  const countEl = h('span', { class: 'rx-sum__n' }, fmt.int(rows.length));
  const ofEl = h('span', { class: 'rx-sum__of small' });
  const hist = h('div', { class: 'rx-hist', role: 'img' });
  const sumFacts = h('dl', { class: 'rx-sum__facts' });
  const summary = h(
    'div',
    { class: 'c-meta boxed rx-sum', 'aria-live': 'polite', 'aria-atomic': 'false' },
    h('p', { class: 'label' }, L('Screener', 'Iskalnik')),
    h('p', { class: 'rx-sum__head' }, countEl, ofEl),
    hist,
    sumFacts,
  );
  function drawSummary() {
    const s = summarize(view, topPct);
    setNumber(countEl, fmt.int(s.n));
    ofEl.textContent = L(`of ${fmt.int(rows.length)} stocks${isDefault(state.filters) ? '' : ' match'}`, `od ${fmt.int(rows.length)} delnic${isDefault(state.filters) ? '' : ' ustreza'}`);
    const max = Math.max(1, ...s.byAgree);
    hist.setAttribute('aria-label', L(`Agreement: ${s.byAgree.map((n, k) => `${k} of 4: ${n}`).join(', ')}`, `Soglasje: ${s.byAgree.map((n, k) => `${k} od 4: ${n}`).join(', ')}`));
    hist.replaceChildren(
      ...s.byAgree.map((n, k) => {
        const bar = h('span', { class: 'rx-hist__bar' }, h('i'));
        bar.style.setProperty('--w', `${n ? Math.max(1.5, (n / max) * 100) : 0}%`);
        return h('div', { class: 'rx-hist__row', 'aria-hidden': 'true' }, h('span', { class: 'rx-hist__k mono' }, `${k}/4`), bar, h('span', { class: 'rx-hist__v mono' }, fmt.int(n)));
      }),
    );
    const topSector = s.sectors[0];
    sumFacts.replaceChildren(
      h('div', { class: 'rx-sum__quorum' }, h('dt', {}, L('3/4 or 4/4, no veto (met the rule)', '3/4 ali 4/4, brez veta (pravilo izpolnjeno)')), h('dd', { class: 'mono' }, fmt.int(s.met))),
      h('div', {}, h('dt', {}, L('3/4 or 4/4 but vetoed', '3/4 ali 4/4, a z vetom')), h('dd', { class: 'mono' }, fmt.int(s.blocked))),
      h('div', {}, h('dt', {}, L('Vetoed', 'Z vetom')), h('dd', { class: 'mono' }, `${fmt.int(s.vetoed)}`)),
      h('div', {}, h('dt', {}, L(`Median 21d return`, 'Mediana 21-dnevnega donosa')), h('dd', { class: 'mono' }, Number.isFinite(s.median.ret21) ? fmt.pct(s.median.ret21, { sign: true }) : '–')),
      h('div', {}, h('dt', {}, L('Largest sector', 'Največji sektor')), h('dd', {}, topSector ? `${sectorL(topSector[0], locale)} · ${fmt.int(topSector[1])}` : '–')),
    );
  }

  // ---- apply -------------------------------------------------------------------------------------------------
  const countLine = h('p', { class: 'c-wide rx-count mono', role: 'status' });
  function apply({ keepScroll = true } = {}) {
    view = sortUniverse(filterUniverse(rows, state.filters), state.sort, state.dir);
    if (!keepScroll) {
      scroller.scrollTop = 0;
      state.active = 0;
    }
    state.active = Math.min(state.active, Math.max(0, view.length - 1));
    empty.hidden = view.length > 0;
    scroller.hidden = view.length === 0;
    repaintAll();
    for (const c of headCells) {
      const on = c.dataset.sort === state.sort;
      if (on) c.setAttribute('aria-sort', state.dir === 'asc' ? 'ascending' : 'descending');
      else c.removeAttribute('aria-sort');
      c.querySelector('.rx-sort__i').textContent = on ? (state.dir === 'asc' ? '↑' : '↓') : '';
    }
    for (const b of presetBtns) {
      const p = preset(b.dataset.preset, topPct);
      b.setAttribute('aria-pressed', String(sameFilters(p, state.filters)));
    }
    grid.setAttribute('aria-rowcount', String(view.length + 1));
    const sortCol = COLS.find((c) => c.sort === state.sort);
    countLine.textContent = L(`${fmt.int(view.length)} rows · sorted by ${sortCol?.title ?? sortCol?.label ?? state.sort}, ${state.dir === 'asc' ? 'ascending' : 'descending'} · ↑↓ to move, Enter opens the stock`, `${fmt.int(view.length)} vrstic · razvrščeno po ${sortCol?.title ?? sortCol?.label ?? state.sort}, ${state.dir === 'asc' ? 'naraščajoče' : 'padajoče'} · ↑↓ premik, Enter odpre delnico`);
    drawSummary();
    csv.refresh();
  }

  const csv = copyPanel(ctx, {
    button: L('Copy CSV', 'Kopiraj CSV'),
    getText: () => universeCsv(view, { date, scoresAsOf }),
    rawLabel: L('View the raw CSV of these rows', 'Pokaži surovi CSV teh vrstic'),
    note: L('One row per stock, percentiles as fractions (0.9427 = 94.3), money in dollars. The first line says what the file is.', 'Ena vrstica na delnico, percentili kot deleži (0,9427 = 94,3), zneski v dolarjih. Prva vrstica pove, kaj je datoteka.'),
    summary: (t) => L(`Copied ${fmt.int(t.trim().split('\n').length - 2)} rows as CSV, for your personal use.`, `Kopiranih ${fmt.int(t.trim().split('\n').length - 2)} vrstic v CSV, za osebno rabo.`),
  });

  const gridwrap = h('div', { class: 'c-wide flush rx-gridwrap' }, h('div', { class: 'rx-filters-desk' }, filterRow), grid, empty);
  gridwrap.style.setProperty('--gate', String(topPct));
  const explorer = h(
    'section',
    { class: 'grid rec-sec ruled rx-sec rx-explorer', id: 'explorer', 'aria-labelledby': 'rx-ex-h' },
    h('p', { class: 'sec-index c-margin', 'aria-hidden': 'true' }, '01'),
    h('div', { class: 'sec-head c-body' }, h('p', { class: 'label' }, L('The explorer', 'Raziskovalnik')), h('h2', { class: 'display d3', id: 'rx-ex-h' }, L('Sort, filter, look closer.', 'Razvrstite, filtrirajte, poglejte od blizu.'))),
    summary,
    presetsRow,
    controls,
    phoneRanges,
    gridwrap,
    countLine,
    h(
      'p',
      { class: 'c-body small muted rx-legend' },
      L(`Percentiles run 0–100 within today’s universe; a family “agrees” at the ${R.pctile} or above (${R.plus}). Blue, the colour kept for a quorum, marks only stocks that met the rule: three or four agreeing families and no veto. They include the issue’s pick or renewal and picks already open; the caps (per issue, month and sector) and cooldowns decide which are issued, and only a record in the ledger is a pick. A 3/4 or 4/4 stopped by a veto is drawn hollow, with the veto named. News* is the simulation’s stand-in for the 48-hour news check. 21d is the trailing 21-day return to the score date.`, `Percentili so 0–100 znotraj današnjega univerzuma; družina se »strinja« pri ${R.pctile} ali več (${R.plus}). Modra, barva kvoruma, označuje samo delnice, ki so izpolnile pravilo: tri ali štiri družine v soglasju in brez veta. Med njimi so izbira ali podaljšanje izdaje in že odprte izbire; omejitve (na izdajo, mesec in sektor) in premori odločijo, katere so izdane, izbira pa je samo zapis v knjigi. Delnica s 3/4 ali 4/4, ki jo je ustavil veto, je narisana votlo, z imenom veta. Novice* je simulacijski nadomestek 48-urnega pregleda novic. 21 d je donos zadnjih 21 dni do datuma ocene.`),
    ),
  );

  const copySec = h(
    'section',
    { class: 'grid rec-sec ruled rx-sec rx-copy', id: 'copy', 'aria-labelledby': 'rx-cp-h' },
    h('p', { class: 'sec-index c-margin', 'aria-hidden': 'true' }, '02'),
    h('div', { class: 'sec-head c-body' }, h('p', { class: 'label' }, L('Take it with you', 'Vzemite s seboj')), h('h2', { class: 'display d3', id: 'rx-cp-h' }, L('The rows on screen, as CSV.', 'Vrstice na zaslonu v CSV.'))),
    h('div', { class: 'c-body rx-copy__body' }, h('p', {}, L('Copy CSV takes exactly the rows your filters show, in their sort order. It is for your personal use: the Research licence does not allow redistribution, publication or resale.', 'Kopiraj CSV vzame natanko vrstice, ki jih kažejo filtri, v njihovem vrstnem redu. Namenjen je osebni rabi: licenca Research ne dovoljuje nadaljnje distribucije, objave ali preprodaje.')), csv.node),
    h('aside', { class: 'c-meta small muted rx-copy__aside' }, L('Why copy, not download: this page cannot save files here. Paste into any spreadsheet or text file.', 'Zakaj kopiranje: ta stran tu ne more shranjevati datotek. Prilepite v katero koli preglednico ali besedilno datoteko.')),
  );

  // phones: the ranges live in the disclosure; desktop: above their columns
  const placeRanges = () => {
    const phone = !!phoneMq?.matches;
    if (phone) phoneRanges.append(...famFilters.map((n) => h('div', { class: 'rx-phone-range' }, n)));
    else filterRow.querySelectorAll('.rx-f').forEach((cell, k) => cell.append(famFilters[k]));
    phoneRanges.hidden = !phone;
    for (const d of phoneRanges.querySelectorAll('.rx-phone-range:empty')) d.remove();
  };
  const onMq = () => {
    placeRanges();
    repaintAll();
  };
  phoneMq?.addEventListener?.('change', onMq);
  tabletMq?.addEventListener?.('change', onMq);
  cleanups.push(() => {
    phoneMq?.removeEventListener?.('change', onMq);
    tabletMq?.removeEventListener?.('change', onMq);
    if (raf) cancelAnimationFrame(raf);
  });

  const node = h('div', { class: 'page rx chamber' }, head, explorer, copySec, widgets);
  view = sortUniverse(filterUniverse(rows, state.filters), state.sort, state.dir);
  return {
    title: L('Research', 'Research'),
    node,
    top: 'chamber',
    afterMount() {
      placeRanges();
      const sbw = scroller.offsetWidth - scroller.clientWidth;
      gridwrap.style.setProperty('--sbw', `${Math.max(0, sbw)}px`);
      apply();
    },
    cleanup() {
      for (const f of cleanups) f();
    },
  };
}

function sameFilters(a, b) {
  return (
    String(a.agree) === String(b.agree) &&
    a.veto === b.veto &&
    a.sector === b.sector &&
    !String(b.q ?? '').trim() &&
    FAMILIES.every((f) => a.ranges[f][0] === b.ranges[f][0] && a.ranges[f][1] === b.ranges[f][1])
  );
}

// A two-thumb range on 0–100 with the rule threshold marked. -> { node, set([lo, hi]) }
function rangeSlider(ctx, { fam, label, value, gate, onChange }) {
  const { L } = ctx;
  const [lo0, hi0] = value;
  const lo = h('input', { type: 'range', min: '0', max: '100', step: '1', value: String(lo0), class: 'rx-range__in', 'aria-label': L(`${label}, lowest percentile`, `${label}, najnižji percentil`) });
  const hi = h('input', { type: 'range', min: '0', max: '100', step: '1', value: String(hi0), class: 'rx-range__in', 'aria-label': L(`${label}, highest percentile`, `${label}, najvišji percentil`) });
  const fill = h('span', { class: 'rx-range__fill', 'aria-hidden': 'true' });
  const tick = h('span', { class: 'rx-range__gate', 'aria-hidden': 'true' });
  tick.style.setProperty('--g', `${gate * 100}%`);
  const out = h('span', { class: 'rx-range__out mono', 'aria-hidden': 'true' });
  const node = h('div', { class: 'rx-range', dataset: { fam } }, h('span', { class: 'rx-range__k mono', 'aria-hidden': 'true' }, fam), h('span', { class: 'rx-range__track' }, fill, tick, lo, hi), out);
  const draw = () => {
    const a = Number(lo.value);
    const b = Number(hi.value);
    fill.style.setProperty('--a', `${a}%`);
    fill.style.setProperty('--b', `${b}%`);
    out.textContent = a === 0 && b === 100 ? L('all', 'vse') : `${a}–${b}`;
    node.classList.toggle('is-set', !(a === 0 && b === 100));
  };
  let t = 0;
  const on = (which) => () => {
    let a = Number(lo.value);
    let b = Number(hi.value);
    if (a > b) {
      if (which === 'lo') hi.value = String((b = a));
      else lo.value = String((a = b));
    }
    draw();
    clearTimeout(t);
    t = setTimeout(() => onChange(a, b), 40);
  };
  lo.addEventListener('input', on('lo'));
  hi.addEventListener('input', on('hi'));
  draw();
  return {
    node,
    set([a, b]) {
      lo.value = String(a);
      hi.value = String(b);
      draw();
    },
  };
}

// ---- the preview for Free and Signal viewers: what the table holds, and no rows --------------------------
function gateSection(ctx, { tier, R, name, nScored, issue }) {
  const { L, fmt } = ctx;
  const p = price('research', 'month');
  const cols = [
    [L('Stock', 'Delnica'), L('Ticker, name, sector. Every company is fictional.', 'Oznaka, ime, sektor. Vsa podjetja so izmišljena.')],
    ...FAMILIES.map((f) => [`${f} · ${name(f)}`, L(`The family’s percentile today, 0–100. “Agrees” at the ${R.pctile} or above.`, `Današnji percentil družine, 0–100. »Strinja se« pri ${R.pctile} ali več.`)]),
    [L('Agree', 'Soglasje'), L('How many families agree: 0 to 4. Three or four is a quorum, unless a veto fires.', 'Koliko družin se strinja: od 0 do 4. Tri ali štiri so kvorum, razen če se sproži veto.')],
    [L('Veto', 'Veto'), L('The first veto that fired: days to cover, idiosyncratic volatility, earnings within 3 days, pending M&A, 48-hour news.', 'Prvi veto, ki se je sprožil: dnevi pokritja, idiosinkratska volatilnost, rezultati v 3 dneh, napovedan prevzem, novice 48 ur.')],
    [L('Size and liquidity', 'Velikost in likvidnost'), L('Market cap and 60-day average dollar volume.', 'Tržna kapitalizacija in 60-dnevni povprečni promet v dolarjih.')],
    [L('21d', '21 d'), L('The trailing 21-day return to the score date.', 'Donos zadnjih 21 dni do datuma ocene.')],
  ];
  const vetoes = issue?.vetoes ?? {};
  return h(
    'section',
    { class: 'grid rec-sec ruled rx-sec rx-gate', id: 'explorer', 'aria-labelledby': 'rx-g-h' },
    h('p', { class: 'sec-index c-margin', 'aria-hidden': 'true' }, '01'),
    h('div', { class: 'sec-head c-body' }, h('p', { class: 'label' }, L('The Research tier', 'Paket Research')), h('h2', { class: 'display d3', id: 'rx-g-h' }, L('The rows are the product.', 'Vrstice so izdelek.'))),
    h(
      'div',
      { class: 'c-meta boxed rx-gate__cta' },
      h('p', { class: 'rx-gate__price' }, h('span', { class: 'rx-gate__amount' }, fmt.eur(p.amount)), h('span', { class: 'small muted' }, L('a month, VAT included · €390 a year', 'na mesec, z DDV · 390 € na leto'))),
      h('a', { class: 'btn', href: href('join', 'research') }, L('Join Research', 'Naroči Research'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')),
      // live mode has no "View as": the tier comes from the account, so the way in is to join or sign in
      ctx.mode === 'live'
        ? h(
            'p',
            { class: 'small muted' },
            tier === 'signal' ? L('Your Signal subscription has the same picks at the same second, without the universe. ', 'Vaša naročnina Signal ima iste izbire v isti sekundi, brez univerzuma. ') : L('The explorer opens with a Research subscription. ', 'Raziskovalnik se odpre z naročnino Research. '),
            h('a', { href: href('account') }, L('Already a member? Sign in', 'Že naročnik? Prijava')),
          )
        : h('p', { class: 'small muted' }, tier === 'signal' ? L('You are viewing as Signal: the same picks at the same second, without the universe.', 'Gledate kot Signal: iste izbire v isti sekundi, brez univerzuma.') : L('You are viewing as Free. Switch “View as” to Research to open the explorer.', 'Gledate kot Brezplačno. Za raziskovalnik preklopite »Pogled kot« na Research.')),
    ),
    h(
      'p',
      { class: 'c-body lede' },
      L(`Per-stock scores are what Research adds, so this page shows no rows: no blurred teaser, no sample. Here is exactly what the table holds, column by column, for ${fmt.int(nScored)} stocks every trading day.`, `Ocene posameznih delnic so tisto, kar doda Research, zato ta stran ne kaže vrstic: ni zamegljenega predogleda ne vzorca. Tu je natanko, kaj vsebuje tabela, stolpec za stolpcem, za ${fmt.int(nScored)} delnic vsak dan trgovanja.`),
    ),
    h('dl', { class: 'c-wide boxed rx-gate__cols' }, cols.map(([k, v]) => h('div', { class: 'rx-gate__col' }, h('dt', { class: 'mono' }, k), h('dd', {}, v)))),
    issue
      ? h(
          'p',
          { class: 'c-body small muted' },
          L(`Public for everyone: issue #${issue.issueNo} scored ${fmt.int(issue.nScored)} stocks; the closest agreement was ${issue.closest}/4; vetoes: ${vetoes.rule ?? 0} rule, ${vetoes.llm ?? 0} news, ${vetoes.human ?? 0} human, ${vetoes.capped ?? 0} capped. `, `Javno za vse: izdaja #${issue.issueNo} je ocenila ${fmt.int(issue.nScored)} delnic; največje soglasje je bilo ${issue.closest}/4; veta: ${vetoes.rule ?? 0} pravilo, ${vetoes.llm ?? 0} novice, ${vetoes.human ?? 0} človek, ${vetoes.capped ?? 0} omejitev. `),
          h('a', { href: href('issue', issue.date) }, L('The issue', 'Izdaja')),
        )
      : null,
  );
}

// ---- deciles and IC, on Chamber (public: the ledger shows them too) ------------------------------------------
function decileSection(ctx, deciles, sb, meta, index, name) {
  const { L, fmt } = ctx;
  if (!deciles) return null;
  let period = 'sealed';
  let score = 'combined';
  const wrap = h('div', { class: 'c-full flush lg-ds' });
  const cap = h('p', { class: 'c-body figcaption' });
  const draw = () => {
    const rows = deciles[period]?.[score] ?? [];
    const title = score === 'combined' ? L('Combined score', 'Skupna ocena') : `${score} · ${name(score)}`;
    wrap.replaceChildren(staircase(rows, { fmt, L, title }));
    const months = deciles.months?.[period];
    cap.textContent = L(
      `${title}, ${period === 'sealed' ? 'sealed record' : 'holdout'}${months ? `, ${months} month-ends` : ''}. Every eligible stock: mean 21-day excess return by decile, before costs, with 95% intervals.`,
      `${title}, ${period === 'sealed' ? 'zapečaten zapis' : 'preizkusno obdobje'}${months ? `, ${months} koncev mesecev` : ''}. Vse upravičene delnice: povprečni 21-dnevni presežni donos po decilih, pred stroški, s 95-odstotnimi intervali.`,
    );
  };
  const mkSeg = (label, options, get, set) => {
    const seg = h(
      'div',
      { class: 'seg rx-seg', role: 'group', 'aria-label': label },
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
    return h('div', { class: 'rx-ctl' }, h('span', { class: 'label', 'aria-hidden': 'true' }, label), seg);
  };
  draw();
  return h(
    'section',
    { class: 'grid rec-sec ruled rx-sec rx-deciles', id: 'deciles', 'aria-labelledby': 'rx-ds-h' },
    h('p', { class: 'sec-index c-margin', 'aria-hidden': 'true' }, index),
    h('div', { class: 'sec-head c-body' }, h('p', { class: 'label' }, L('Deciles and IC', 'Decili in IC')), h('h2', { class: 'display d3', id: 'rx-ds-h' }, L('Do the scores sort the market?', 'Ali ocene razvrstijo trg?'))),
    h(
      'div',
      { class: 'c-meta rx-ds-controls' },
      mkSeg(L('Score', 'Ocena'), [['combined', L('Combined', 'Skupna')], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D']], () => score, (v) => (score = v)),
      mkSeg(L('Period', 'Obdobje'), [['sealed', L('Sealed', 'Zapečaten')], ['holdout', L('Holdout', 'Preizkus')]], () => period, (v) => (period = v)),
    ),
    h('p', { class: 'c-body lede' }, L('If a score works, the steps rise from decile 1 to decile 10. A few picks a month take years to prove anything; every stock at every month-end is faster evidence.', 'Če ocena deluje, stopnice rastejo od decila 1 do decila 10. Nekaj izbir na mesec potrebuje leta, da kaj dokaže; vsaka delnica ob vsakem koncu meseca je hitrejši dokaz.')),
    wrap,
    cap,
    sb?.icMonthly?.length ? h('h3', { class: 'd4 c-head rx-subhead' }, L('Monthly rank IC, sealed record', 'Mesečni rangovni IC, zapečaten zapis')) : null,
    sb?.icMonthly?.length ? icSparklines(sb.icMonthly, { families: FAMILIES, fmt, L, name }) : null,
    sb?.icMonthly?.length ? h('p', { class: 'c-body figcaption' }, L('Spearman correlation of each month-end score with the next 21-day return across every eligible stock. Solid: the month; dotted: the mean.', 'Spearmanova korelacija ocene ob koncu meseca z donosom naslednjih 21 dni prek vseh upravičenih delnic. Polna: mesec; pikčasta: povprečje.')) : null,
    h('p', { class: 'c-body small muted' }, L('Also public on the ledger. ', 'Javno tudi v knjigi. '), h('a', { href: href('ledger', null, 'deciles') }, L('Ledger · deciles and IC', 'Knjiga · decili in IC'))),
  );
}

