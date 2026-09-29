// #backtest: the backtest, kept on its own page and labelled HYPOTHETICAL (brief §2.8 and §7). The whole
// page sits on a shaded, hatched surface with a sticky flag, so it cannot be mistaken for the live
// record: equity curves (quorum vs benchmark vs the 2/4 set vs each family, log scale, crash-switch
// periods marked), the annual table, the ship gates (a)–(e), the launch block (amendment A-1, the
// pooled deflated Sharpe with raw and clustered deflation, what remains), and DSR and PBO in plain words.
// The quorum curve is Graphite, not ultramarine: a hypothetical series is not a quorum mark.
//
// SL: first draft, needs native review.
import { h } from '../dom.js';
import { href } from '../router.js';
import { sectionHead, signed } from '../ui.js';
import { masthead, toc } from './_content.js';
import { ruleLabels } from '../rule.js';
import { lineChart, hatchLayer } from '../charts/equity.js';
import { variantHistogram } from '../charts/variants.js';

const yearsOf = (w) => (w ? `${w.from.slice(0, 4)}–${w.to.slice(0, 4)}` : '');

export async function render(ctx) {
  const { L, fmt, locale } = ctx;
  const [bt, meta] = await Promise.all([ctx.data('backtest'), ctx.data('meta').catch(() => null)]);
  const R = ruleLabels(meta ?? bt, locale);
  const window = yearsOf(bt.window);
  const nVar = fmt.int(bt.variantsTried ?? 0);
  const banner = L(
    `BACKTESTED – HYPOTHETICAL. Generated with hindsight on data from ${window}. May suffer from look-ahead, survivorship and overfitting bias. We tried ${nVar} model variants. These are not live results.`,
    `POVRATNI TEST – HIPOTETIČNO. Ustvarjeno za nazaj na podatkih iz obdobja ${window}. Lahko je obremenjeno s pristranskostjo zaradi vpogleda v prihodnost, preživetja in prekomernega prilagajanja. Preizkusili smo ${nVar} različic modela. To niso rezultati v živo.`,
  );
  const sections = [
    { id: 'equity', title: L('Equity curves', 'Krivulje vrednosti') },
    { id: 'annual', title: L('Year by year', 'Po letih') },
    { id: 'gates', title: L('Ship gates', 'Pogoji za zagon') },
    { id: 'launch', title: L('Launch test', 'Preizkus za zagon') },
    { id: 'overfitting', title: L('DSR and PBO', 'DSR in PBO') },
    { id: 'crash', title: L('Crash switch', 'Stikalo za zlom') },
  ];
  const head = masthead({
    kicker: L('Did it work? · the backtest', 'Je delovalo? · povratni test'),
    title: L('Hypothetical.', 'Hipotetično.'),
    lede: L(
      `How the frozen rules would have done on history, before any of it was sealed. Kept on this page only: never on the home page, in an ad or in a text. The live proof is the ledger.`,
      `Kako bi se zamrznjena pravila odrezala na zgodovini, preden je bilo kar koli zapečateno. Samo na tej strani: nikoli na naslovnici, v oglasu ali v SMS. Dokaz v živo je knjiga.`,
    ),
    meta: toc(ctx, sections, L('On this page', 'Na tej strani')),
  });
  const flag = h('div', { class: 'bt-flag', role: 'note' }, h('p', { class: 'label' }, L('Hypothetical backtest · not live results', 'Hipotetični povratni test · ni rezultatov v živo')));
  // the brief's exact banner wording; its first sentence set as the heading of the box
  const cut = banner.indexOf('. ') + 1;
  const bannerEl = h('div', { class: 'grid bt-banner-row' }, h('p', { class: 'c-wide bt-banner', role: 'note' }, h('span', { class: 'bt-banner__k' }, banner.slice(0, cut)), h('span', {}, banner.slice(cut + 1))));

  const node = h(
    'div',
    { class: 'page bt' },
    flag,
    head,
    bannerEl,
    h(
      'div',
      { class: 'bt-body' },
      h('div', { class: 'bt-hatch bt-hatch--l', 'aria-hidden': 'true' }, hatchLayer('bt-hatch__svg')),
      h('div', { class: 'bt-hatch bt-hatch--r', 'aria-hidden': 'true' }, hatchLayer('bt-hatch__svg')),
      equitySection(ctx, bt, R),
      annualSection(ctx, bt),
      gatesSection(ctx, bt, R),
      launchSection(ctx, bt),
      overfitSection(ctx, bt),
      crashSection(ctx, bt),
      h('section', { class: 'grid rec-sec bt-end' }, h('p', { class: 'c-body' }, h('a', { class: 'arrow-link', href: href('ledger') }, L('The live, sealed record is the ledger', 'Živi, zapečateni zapis je knjiga'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')))),
    ),
  );
  return { title: L('Backtest (hypothetical)', 'Povratni test (hipotetično)'), node };
}

const xFmt = (v, fmt) => (v >= 10 ? `${fmt.num(v, 0)}×` : `${fmt.num(v, v >= 2 ? 1 : 2)}×`);

function equitySection(ctx, bt, R) {
  const { L, fmt } = ctx;
  const eq = bt.equity ?? [];
  const cols = bt.equityCols ?? ['quorum', 'bench', 'twoOfFour', 'A', 'B', 'C', 'D'];
  const labels = {
    quorum: L('Quorum picks', 'Izbire s kvorumom'),
    bench: L('S&P 500 TR', 'S&P 500 TR'),
    twoOfFour: L('2/4 shadow set', 'Senčni niz 2/4'),
    A: 'A',
    B: 'B',
    C: 'C',
    D: 'D',
  };
  const style = { quorum: 'main', bench: 'bench', twoOfFour: 'shadow' };
  const shorts = { quorum: L('Quorum', 'Kvorum'), bench: 'S&P 500', twoOfFour: '2/4' };
  const series = cols.map((c, i) => ({
    key: c,
    label: labels[c] ?? c,
    short: shorts[c] ?? c,
    values: eq.map((r) => r[i + 1]),
    style: style[c] ?? 'fam',
    end: xFmt(eq.at(-1)?.[i + 1] ?? 1, fmt),
  }));
  const bands = [
    ...(bt.crashSwitchPeriods ?? []).map(([from, to]) => ({ from, to, cls: 'is-crash', legend: L('Crash switch on: trend suspended', 'Stikalo za zlom: trend izključen') })),
    bt.holdout ? { from: bt.holdout.from, to: bt.holdout.to, cls: 'is-holdout', label: L('Holdout, opened once', 'Preizkus, odprt enkrat') } : null,
  ].filter(Boolean);
  const chart = eq.length
    ? lineChart({
        dates: eq.map((r) => r[0]),
        series,
        log: true,
        bands,
        hatch: true,
        yLabel: (v) => xFmt(v, fmt),
        label: L('Hypothetical growth of 1, month by month: use the arrow keys to read each month.', 'Hipotetična rast 1, mesec za mesecem: s puščicami preberete vsak mesec.'),
        legendLabel: L('Series', 'Serije'),
        readout: (i) => `${eq[i][0].slice(0, 7)} · ${series.map((s) => `${s.label} ${xFmt(s.values[i], fmt)}`).join(' · ')}`,
        valueLabel: (v) => xFmt(v, fmt),
        altCaption: L('Hypothetical growth of 1 at each year end, by series', 'Hipotetična rast 1 ob koncu vsakega leta, po serijah'),
        dateLabel: L('Month', 'Mesec'),
        className: 'eq--bt',
      })
    : null;
  const st = bt.stats ?? {};
  const sh = bt.statsHoldout ?? {};
  const row = (k, a, b) => h('tr', {}, h('th', { scope: 'row' }, k), h('td', { class: 'num' }, a), h('td', { class: 'num' }, b));
  const statsTable = h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: 'table bt-stats' },
      h('caption', {}, L('Follow-every-pick paper portfolio, net of costs. Sharpe from monthly excess returns, annualised.', 'Papirni portfelj vseh izbir, po stroških. Sharpe iz mesečnih presežnih donosov, letno.')),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, L('Measure', 'Mera'))), h('th', { scope: 'col', class: 'num' }, L(`Research ${yearsOf(bt.window)}`, `Raziskava ${yearsOf(bt.window)}`)), h('th', { scope: 'col', class: 'num' }, L(`Holdout ${yearsOf(bt.holdout)}`, `Preizkus ${yearsOf(bt.holdout)}`)))),
      h(
        'tbody',
        {},
        row(L('New picks a month', 'Novih izbir na mesec'), fmt.num(st.picksPerMonth, 1), fmt.num(sh.picksPerMonth, 1)),
        row(L('Hit rate vs benchmark', 'Delež uspešnih'), fmt.pct(st.hitRate), fmt.pct(sh.hitRate)),
        row(L('Median excess per pick', 'Mediana presežka'), fmt.pct(st.medianExcess, { sign: true }), fmt.pct(sh.medianExcess, { sign: true })),
        row(L('Mean excess per pick', 'Povprečni presežek'), fmt.pct(st.meanExcess, { sign: true }), fmt.pct(sh.meanExcess, { sign: true })),
        row(L('Sharpe of excess', 'Sharpe presežka'), fmt.num(st.sharpe, 2), fmt.num(sh.sharpe, 2)),
        row(L('Max drawdown', 'Največji padec'), fmt.pct(st.maxDrawdown), fmt.pct(sh.maxDrawdown)),
      ),
    ),
  );
  return h(
    'section',
    { class: 'section grid rec-sec bt-sec', id: 'equity', 'aria-labelledby': 'bt-eq-h' },
    ...sectionHead({ index: '01', kicker: L('Hypothetical · log scale', 'Hipotetično · logaritemska lestvica'), title: L('Growth of 1, if every pick had been followed.', 'Rast 1, če bi sledili vsem izbiram.'), id: 'bt-eq-h', size: 'd3' }),
    h(
      'p',
      { class: 'lede c-body' },
      L(
        `Monthly, net of costs, against the benchmark, the 2/4 shadow set and each family’s own ${R.top}. The dashed line marks where the holdout begins: it was opened once, after the engine froze on ${ctx.fmt.date(bt.holdout?.to ?? '2025-09-30')}.`,
        `Mesečno, po stroških, proti merilu, senčnemu nizu 2/4 in lastnim ${R.top} vsake družine. Črtkana črta označuje začetek preizkusnega obdobja: odprto je bilo enkrat, po zamrznitvi modela ${ctx.fmt.date(bt.holdout?.to ?? '2025-09-30')}.`,
      ),
    ),
    h('div', { class: 'c-meta bt-aside' }, statsTable),
    chart,
  );
}

function annualSection(ctx, bt) {
  const { L, fmt } = ctx;
  const crashYears = new Set((bt.crashSwitchPeriods ?? []).flatMap(([a, b]) => [Number(a.slice(0, 4)), Number(b.slice(0, 4))]));
  const holdFrom = bt.holdout?.from ?? '9999';
  const rows = (bt.annual ?? []).map((r) => {
    const ex = r.quorum - r.bench;
    const bar = h('span', { class: ['bt-exbar', ex >= 0 ? 'is-pos' : 'is-neg'] });
    bar.style.setProperty('--w', `${Math.min(1, Math.abs(ex) / 0.6) * 50}%`);
    return h(
      'tr',
      { class: [`${r.year}` >= holdFrom.slice(0, 4) && 'is-holdout'] },
      h('th', { scope: 'row', class: 'mono' }, `${r.year}${r.partial ? '*' : ''}`),
      h('td', { class: 'num' }, fmt.pct(r.quorum, { sign: true })),
      h('td', { class: 'num' }, fmt.pct(r.bench, { sign: true })),
      h('td', { class: 'num' }, signed(ex, { fmt })),
      h('td', { class: 'bt-excell', 'aria-hidden': 'true' }, h('span', { class: 'bt-extrack' }, bar)),
      h('td', { class: 'num' }, fmt.int(r.n)),
      h('td', { class: 'small muted' }, [crashYears.has(r.year) ? L('crash switch', 'stikalo za zlom') : null, String(r.year) === holdFrom.slice(0, 4) ? L('holdout from Oct', 'preizkus od okt.') : Number(r.year) > Number(holdFrom.slice(0, 4)) ? L('holdout', 'preizkus') : null].filter(Boolean).join(' · ')),
    );
  });
  return h(
    'section',
    { class: 'section grid rec-sec bt-sec', id: 'annual', 'aria-labelledby': 'bt-an-h' },
    ...sectionHead({ index: '02', kicker: L('Hypothetical · calendar years', 'Hipotetično · koledarska leta'), title: L('Year by year, bad years included.', 'Po letih, slaba leta vključena.'), id: 'bt-an-h', size: 'd3' }),
    h(
      'div',
      { class: 'c-wide table-wrap bt-annual' },
      h(
        'table',
        { class: 'table' },
        h('caption', {}, L('Compounded returns of the follow-every-pick paper portfolio and the benchmark total return; n = picks entered that year. * part year.', 'Sestavljeni donosi papirnega portfelja vseh izbir in skupni donos merila; n = izbire, vstopljene v letu. * del leta.')),
        h(
          'thead',
          {},
          h('tr', {}, [L('Year', 'Leto'), L('Quorum', 'Kvorum'), L('S&P 500 TR', 'S&P 500 TR'), L('Difference', 'Razlika'), null, 'n', L('Note', 'Opomba')].map((x, i) => h('th', { scope: 'col', class: [1, 2, 3, 5].includes(i) && 'num' }, x ?? h('span', { class: 'visually-hidden' }, L('Difference, drawn', 'Razlika, narisano'))))),
        ),
        h('tbody', {}, rows),
      ),
    ),
  );
}

function gatesSection(ctx, bt, R) {
  const { L, locale } = ctx;
  const gates = bt.gates ?? [];
  const passN = gates.filter((g) => g.pass).length;
  return h(
    'section',
    { class: 'section grid rec-sec bt-sec', id: 'gates', 'aria-labelledby': 'bt-g-h' },
    ...sectionHead({ index: '03', kicker: L('Ship gates · measured once on the holdout', 'Pogoji · izmerjeni enkrat na preizkusu'), title: L(`${passN} of ${gates.length} passed.`, `${passN} od ${gates.length} izpolnjenih.`), id: 'bt-g-h', size: 'd3' }),
    h(
      'p',
      { class: 'lede c-body' },
      L(
        'All five must pass, net of costs, before SMS alerts launch. They were written before the holdout was opened and are published unchanged, including the one that failed.',
        'Vseh pet mora biti izpolnjenih, po stroških, preden se zaženejo obvestila SMS. Zapisani so bili, preden je bilo preizkusno obdobje odprto, in so objavljeni nespremenjeni, tudi tisti, ki ni bil izpolnjen.',
      ),
    ),
    h(
      'ol',
      { class: 'c-wide boxed bt-gates' },
      gates.map((g) =>
        h(
          'li',
          { class: ['bt-gate', g.pass ? 'is-pass' : 'is-fail'] },
          h('span', { class: 'bt-gate__id mono' }, `(${g.id})`),
          h('div', { class: 'bt-gate__body' }, h('p', { class: 'bt-gate__label' }, g.label?.[locale] ?? g.label?.en ?? ''), h('p', { class: 'small bt-gate__detail' }, g.detail?.[locale] ?? g.detail?.en ?? '')),
          h('span', { class: ['bt-verdict', g.pass ? 'is-pass' : 'is-fail'] }, h('span', { 'aria-hidden': 'true' }, g.pass ? '✓ ' : '× '), g.pass ? L('Pass', 'Izpolnjen') : L('Fail', 'Ni izpolnjen')),
        ),
      ),
    ),
    h('p', { class: 'c-body rec-note' }, L(`Rule tested: at least ${bt.rule?.minAgree ?? 3} of 4 families ${R.inTop}, calibrated to 3–6 new picks a month on the research window.`, `Preizkušeno pravilo: vsaj ${bt.rule?.minAgree ?? 3} od 4 družin ${R.inTop}, umerjeno na 3–6 novih izbir na mesec v raziskovalnem obdobju.`)),
  );
}

function launchSection(ctx, bt) {
  const { L, fmt, locale } = ctx;
  const ln = bt.launch;
  if (!ln) {
    return h(
      'section',
      { class: 'section grid rec-sec bt-sec', id: 'launch', 'aria-labelledby': 'bt-l-h' },
      ...sectionHead({ index: '04', kicker: L('Launch gate E', 'Pogoj za zagon E'), title: L('Launch test not published yet.', 'Preizkus za zagon še ni objavljen.'), id: 'bt-l-h', size: 'd3' }),
      h('p', { class: 'lede c-body' }, L('The launch assessment is not in this export. SMS alerts stay off until every gate passes.', 'Ocena za zagon ni v tem izvozu. Obvestila SMS ostanejo izklopljena, dokler niso izpolnjeni vsi pogoji.')),
    );
  }
  const p = ln.pooled ?? {};
  const ready = ln.status === 'ready';
  const meter = (v, thr, label) => {
    const m = h('div', { class: 'bt-meter', role: 'img', 'aria-label': `${label}: ${fmt.num(v, 3)} ${L('of the required', 'od zahtevanih')} ${fmt.num(thr, 2)}` });
    const fill = h('span', { class: 'bt-meter__fill' });
    fill.style.setProperty('--v', String(Math.max(0, Math.min(1, v))));
    const t = h('span', { class: 'bt-meter__thr' }, h('span', { class: 'label' }, `${L('needs', 'potrebno')} ${fmt.num(thr, 2)}`));
    t.style.setProperty('--t', String(thr));
    m.append(fill, t);
    return m;
  };
  const hist = p.history ?? [];
  const histChart = hist.length
    ? lineChart({
        dates: hist.map((r) => r.month),
        series: [
          { key: 'dsr', label: L('Deflated Sharpe, clustered', 'Deflacionirani Sharpe, skupine'), short: L('Clustered', 'Skupine'), values: hist.map((r) => r.dsr), style: 'main', end: fmt.num(hist.at(-1).dsr, 2) },
          { key: 'raw', label: L('Raw count of variants', 'Surovo število različic'), short: L('Raw', 'Surovo'), values: hist.map((r) => r.dsrRaw), style: 'bench', end: fmt.num(hist.at(-1).dsrRaw, 2) },
        ],
        yLabel: (v) => fmt.num(v, 1),
        label: L('Pooled deflated Sharpe probability at each month-end: use the arrow keys.', 'Združena verjetnost deflacioniranega Sharpa ob vsakem koncu meseca: uporabite puščice.'),
        legendLabel: L('Series', 'Serije'),
        readout: (i) => `${hist[i].month} · ${L('months', 'mesecev')} ${hist[i].months} · DSR ${fmt.num(hist[i].dsr, 3)} · ${L('raw', 'surovo')} ${fmt.num(hist[i].dsrRaw, 3)} · Sharpe ${fmt.num(hist[i].sharpe, 2)}${hist[i].monthToDate ? L(' · month to date', ' · mesec do danes') : ''}`,
        valueLabel: (v) => fmt.num(v, 3),
        altCaption: L('Pooled deflated Sharpe probability at each month end', 'Združena verjetnost deflacioniranega Sharpa ob koncu vsakega meseca'),
        dateLabel: L('Month', 'Mesec'),
        className: 'eq--dsr',
      })
    : null;
  return h(
    'section',
    { class: 'section grid rec-sec bt-sec bt-launch', id: 'launch', 'aria-labelledby': 'bt-l-h' },
    ...sectionHead({
      index: '04',
      kicker: L(`Launch gate E · as of ${fmt.date(ln.asOf)}`, `Pogoj za zagon E · na dan ${fmt.date(ln.asOf)}`),
      title: ready ? L('Ready: every gate has passed.', 'Pripravljeno: vsi pogoji so izpolnjeni.') : L('Pre-launch. SMS alerts stay off.', 'Pred zagonom. Obvestila SMS ostajajo izklopljena.'),
      id: 'bt-l-h',
      size: 'd3',
    }),
    h('p', { class: 'lede c-body' }, ln.remaining?.[locale] ?? ln.remaining?.en ?? ''),
    h(
      'dl',
      { class: 'c-meta dl boxed bt-launch__gates' },
      (ln.holdoutGates ?? []).map((g) => h('div', {}, h('dt', {}, L(`Gate (${g.id}) on the holdout`, `Pogoj (${g.id}) na preizkusu`)), h('dd', {}, g.pass ? L('✓ pass', '✓ izpolnjen') : L('× fail', '× ni izpolnjen')))),
      h('div', {}, h('dt', {}, L('Gate (d) on the pooled record', 'Pogoj (d) na združenem zapisu')), h('dd', {}, p.pass ? L('✓ pass', '✓ izpolnjen') : L('× not yet', '× še ne'))),
    ),
    ln.amendment
      ? h(
          'div',
          { class: 'c-body bt-amend' },
          h('p', { class: 'label' }, L(`Amendment ${ln.amendment.id} · ${fmt.date(ln.amendment.date)} · disclosed in full`, `Dopolnilo ${ln.amendment.id} · ${fmt.date(ln.amendment.date)} · razkrito v celoti`)),
          h('p', { class: 'bt-amend__text' }, ln.amendment.text?.[locale] ?? ln.amendment.text?.en ?? ''),
          Number.isFinite(ln.amendment.psrHoldout) ? h('p', { class: 'small muted' }, L(`Probabilistic Sharpe of the holdout before any deflation: ${fmt.num(ln.amendment.psrHoldout, 3)}.`, `Verjetnostni Sharpe preizkusnega obdobja pred deflacijo: ${fmt.num(ln.amendment.psrHoldout, 3)}.`)) : null,
        )
      : null,
    h(
      'div',
      { class: 'c-wide bt-pooled' },
      h('p', { class: 'label' }, L(`Pooled out-of-sample record · ${fmt.date(p.from)} to ${fmt.date(p.to)} · ${p.months} months (${p.holdoutMonths} holdout + ${p.sealedMonths} sealed)`, `Združen zapis zunaj vzorca · ${fmt.date(p.from)} do ${fmt.date(p.to)} · ${p.months} mesecev (${p.holdoutMonths} preizkus + ${p.sealedMonths} zapečaten)`)),
      h(
        'div',
        { class: 'bt-pooled__grid' },
        h(
          'div',
          { class: 'bt-pooled__m' },
          h('p', { class: 'bt-big mono' }, fmt.num(p.dsr, 3)),
          h('p', { class: 'small' }, L(`Deflated Sharpe probability, deflated for ${p.nTrialsEff} effective independent trials (clusters of the ${fmt.int(p.nTrialsRaw)} variants).`, `Verjetnost deflacioniranega Sharpa, deflacionirano za ${p.nTrialsEff} dejansko neodvisnih poskusov (skupin izmed ${fmt.int(p.nTrialsRaw)} različic).`)),
          meter(p.dsr, p.dsrThreshold ?? 0.95, L('Clustered DSR', 'DSR s skupinami')),
        ),
        h(
          'div',
          { class: 'bt-pooled__m' },
          h('p', { class: 'bt-big mono' }, fmt.num(p.dsrRaw, 3)),
          h('p', { class: 'small' }, L(`The same test counting all ${fmt.int(p.nTrialsRaw)} variants as independent. Published beside it: the stricter reading.`, `Isti preizkus, če vseh ${fmt.int(p.nTrialsRaw)} različic štejemo kot neodvisne. Objavljeno ob strani: strožje branje.`)),
          meter(p.dsrRaw, p.dsrThreshold ?? 0.95, L('Raw DSR', 'Surovi DSR')),
        ),
        h(
          'dl',
          { class: 'dl bt-pooled__dl' },
          h('div', {}, h('dt', {}, L('Sharpe, annualised', 'Sharpe, letno')), h('dd', {}, fmt.num(p.sharpe, 2))),
          h('div', {}, h('dt', {}, L('Luck bar, clustered', 'Meja sreče, skupine')), h('dd', {}, L(`${fmt.num(p.sr0Monthly * Math.sqrt(12), 2)} a year`, `${fmt.num(p.sr0Monthly * Math.sqrt(12), 2)} letno`))),
          h('div', {}, h('dt', {}, L('Luck bar, raw', 'Meja sreče, surovo')), h('dd', {}, L(`${fmt.num(p.sr0MonthlyRaw * Math.sqrt(12), 2)} a year`, `${fmt.num(p.sr0MonthlyRaw * Math.sqrt(12), 2)} letno`))),
          h('div', {}, h('dt', {}, 'PBO'), h('dd', {}, `${fmt.num(p.pbo, 3)} (${L('bound', 'meja')} ${fmt.num(p.pboThreshold ?? 0.3, 1)})`)),
          p.passAt ? h('div', {}, h('dt', {}, L('At this pace, passes', 'Pri tem tempu izpolnjen')), h('dd', {}, `${p.passAt} · ${L(`${fmt.int(p.monthsToPass)} months`, `${fmt.int(p.monthsToPass)} mesecev`)}`)) : null,
        ),
      ),
    ),
    histChart,
    h(
      'p',
      { class: 'c-body rec-note' },
      L(
        `Monthly excess returns of the follow-every-pick paper portfolio over the benchmark, net of costs: the holdout backtest from ${fmt.date(p.from)}, then the sealed record; the current month runs to ${fmt.date(p.to)}. Re-tested at every month-end with the same deflation and the same PBO bound.`,
        `Mesečni presežni donosi papirnega portfelja vseh izbir nad merilom, po stroških: povratni test preizkusnega obdobja od ${fmt.date(p.from)}, nato zapečaten zapis; tekoči mesec teče do ${fmt.date(p.to)}. Preverjeno ob vsakem koncu meseca z enako deflacijo in enako mejo PBO.`,
      ),
    ),
  );
}

function overfitSection(ctx, bt) {
  const { L, fmt, locale } = ctx;
  const d = bt.dsrDetail ?? {};
  const raw = d.raw ?? {};
  const k12 = Math.sqrt(12);
  const markers = [
    Number.isFinite(d.expectedMaxSharpeMonthly) ? { value: d.expectedMaxSharpeMonthly * k12, label: L(`Best of ${d.nTrials ?? '?'} clusters by luck`, `Najboljša od ${d.nTrials ?? '?'} skupin po naključju`), cls: 'is-luck' } : null,
    Number.isFinite(raw.expectedMaxSharpeMonthly) ? { value: raw.expectedMaxSharpeMonthly * k12, label: L(`Best of ${fmt.int(raw.nTrials ?? bt.variantsTried)} variants by luck`, `Najboljša od ${fmt.int(raw.nTrials ?? bt.variantsTried)} različic po naključju`), cls: 'is-luckraw' } : null,
    Number.isFinite(bt.statsHoldout?.sharpe) ? { value: bt.statsHoldout.sharpe, label: L('Holdout Sharpe', 'Sharpe preizkusa'), cls: 'is-hold' } : null,
  ].filter(Boolean);
  return h(
    'section',
    { class: 'section grid rec-sec bt-sec', id: 'overfitting', 'aria-labelledby': 'bt-o-h' },
    ...sectionHead({ index: '05', kicker: L('Overfitting, in plain words', 'Prekomerno prilagajanje, preprosto'), title: L(`We tried ${fmt.int(bt.variantsTried)} variants. Here they all are.`, `Preizkusili smo ${fmt.int(bt.variantsTried)} različic. Tu so vse.`), id: 'bt-o-h', size: 'd3' }),
    h(
      'div',
      { class: 'c-body prose bt-plain' },
      h(
        'p',
        {},
        L(
          `Try enough versions of a strategy and one will look brilliant by luck. So every configuration we tried is logged and counted: ${fmt.int(bt.variantsTried)} variants (thresholds × machine-learning settings) on the research window.`,
          `Če preizkusite dovolj različic strategije, bo ena po naključju videti odlično. Zato je vsaka preizkušena konfiguracija zabeležena in šteta: ${fmt.int(bt.variantsTried)} različic (pragovi × nastavitve strojnega učenja) v raziskovalnem obdobju.`,
        ),
      ),
      h(
        'p',
        {},
        h('strong', {}, L('Deflated Sharpe ratio (DSR). ', 'Deflacionirano Sharpovo razmerje (DSR). ')),
        L(
          `The probability that the real edge is above zero after allowing for the best-of-many luck, for short samples and for fat tails. We require at least 0.95. The holdout scores ${fmt.num(bt.dsr, 3)} when similar variants are grouped into ${d.nTrials ?? '?'} independent clusters, and ${fmt.num(raw.dsr, 3)} if all ${fmt.int(raw.nTrials ?? bt.variantsTried)} count separately.`,
          `Verjetnost, da je resnična prednost nad nič, ko upoštevamo srečo najboljšega izmed mnogih, kratke vzorce in debele repe. Zahtevamo vsaj 0,95. Preizkusno obdobje doseže ${fmt.num(bt.dsr, 3)}, ko podobne različice združimo v ${d.nTrials ?? '?'} neodvisnih skupin, in ${fmt.num(raw.dsr, 3)}, če vseh ${fmt.int(raw.nTrials ?? bt.variantsTried)} štejemo posebej.`,
        ),
      ),
      h(
        'p',
        {},
        h('strong', {}, L('Probability of backtest overfitting (PBO). ', 'Verjetnost prekomernega prilagajanja (PBO). ')),
        L(
          `Split history into blocks, pick the best variant on half of them, and check how often it lands in the bottom half on the other half. ${fmt.num(bt.pbo, 3)} means that happened ${fmt.pct0(bt.pbo)} of the time; the bound is 0.3.`,
          `Zgodovino razdelimo na bloke, na polovici izberemo najboljšo različico in preverimo, kako pogosto na drugi polovici pristane v spodnji polovici. ${fmt.num(bt.pbo, 3)} pomeni, da se je to zgodilo v ${fmt.pct0(bt.pbo)} primerov; meja je 0,3.`,
        ),
      ),
    ),
    h(
      'dl',
      { class: 'c-meta stats boxed bt-od' },
      [
        ['DSR', fmt.num(bt.dsr, 3), L(`${d.nTrials ?? '?'} clusters · needs 0.95`, `${d.nTrials ?? '?'} skupin · potrebno 0,95`)],
        [L('DSR, raw count', 'DSR, surovo'), fmt.num(raw.dsr, 3), L(`${fmt.int(raw.nTrials ?? bt.variantsTried)} variants`, `${fmt.int(raw.nTrials ?? bt.variantsTried)} različic`)],
        ['PBO', fmt.num(bt.pbo, 3), L('CSCV, 16 blocks · bound 0.3', 'CSCV, 16 blokov · meja 0,3')],
      ].map(([k, v, s]) => h('div', { class: 'stat' }, h('dt', { class: 'stat__k' }, k), h('dd', { class: 'stat__v' }, v), h('dd', { class: 'stat__s' }, s))),
    ),
    (bt.variantSharpes ?? []).length ? variantHistogram(bt.variantSharpes, { markers, fmt, L }) : null,
    h(
      'p',
      { class: 'c-body figcaption' },
      L(
        `Each bar counts variants by their annualised Sharpe ratio on the research window. The lines show what the best one would reach by luck alone, and what the chosen rule did on the untouched holdout. Clusters group variants whose returns move together; the number of clusters is chosen by how cleanly they separate.`,
        `Vsak stolpec šteje različice po letnem Sharpovem razmerju v raziskovalnem obdobju. Črte kažejo, kaj bi najboljša dosegla zgolj po naključju, in kaj je izbrano pravilo doseglo na nedotaknjenem preizkusu. Skupine združujejo različice, katerih donosi se gibljejo skupaj; število skupin je izbrano po tem, kako čisto se ločijo.`,
      ),
    ),
  );
}

function crashSection(ctx, bt) {
  const { L, fmt } = ctx;
  const periods = bt.crashSwitchPeriods ?? [];
  return h(
    'section',
    { class: 'section grid rec-sec bt-sec', id: 'crash', 'aria-labelledby': 'bt-c-h' },
    ...sectionHead({ index: '06', kicker: L('The crash switch', 'Stikalo za zlom'), title: L('When momentum breaks, trend steps aside.', 'Ko se moment zlomi, se trend umakne.'), id: 'bt-c-h', size: 'd3' }),
    h(
      'p',
      { class: 'lede c-body' },
      L(
        'In rebounds after a bear market, momentum historically crashes. In those periods family A (trend) loses its vote and all three other families must agree. It is still shown as 3/4. The shaded bands in the curves above are these periods.',
        'Ob odbojih po medvedjem trgu se moment zgodovinsko zlomi. V teh obdobjih družina A (trend) izgubi glas in strinjati se morajo vse tri druge družine. Še vedno je prikazano kot 3/4. Osenčeni pasovi v krivuljah zgoraj so ta obdobja.',
      ),
    ),
    h(
      'ol',
      { class: 'c-meta boxed bt-crash' },
      periods.length
        ? periods.map(([a, b]) => h('li', { class: 'mono' }, `${fmt.date(a)} – ${fmt.date(b)}`))
        : h('li', {}, L('No crash-switch period in the backtest.', 'V povratnem testu ni obdobja stikala za zlom.')),
    ),
  );
}

