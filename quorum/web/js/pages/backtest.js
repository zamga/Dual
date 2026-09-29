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
import { sectionHead, signed, simulationNote } from '../ui.js';
import { masthead, toc } from './_content.js';
import { ruleLabels } from '../rule.js';
import { lineChart, hatchLayer } from '../charts/equity.js';
import { variantHistogram } from '../charts/variants.js';
import { launchInfo, launchCopy } from '../launch.js';

// A month as the site writes it on every time axis (MM.YY, like dates 28.09.26): '2025-10' -> '10.25'.
const monthOf = (m) => (m ? `${m.slice(5, 7)}.${m.slice(2, 4)}` : '');
const yearsOf = (w) => (w ? `${w.from.slice(0, 4)}–${w.to.slice(0, 4)}` : '');

export async function render(ctx) {
  const { L, fmt, locale } = ctx;
  const [bt, meta] = await Promise.all([ctx.data('backtest'), ctx.data('meta').catch(() => null)]);
  const R = ruleLabels(meta ?? bt, locale);
  // The hindsight span the banner discloses runs from the research window to the end of the holdout.
  const window = yearsOf({ from: bt.window?.from ?? bt.holdout?.from ?? '', to: bt.holdout?.to ?? bt.window?.to ?? '' });
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
    simulationNote(meta, locale),
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
// Axis ticks are round multiples (0.5, 1, 2, 5, 10 …): one format, no trailing decimals.
const xTick = (v, fmt) => `${fmt.num(v, Number.isInteger(v) ? 0 : 1)}×`;

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
        yLabel: (v) => xTick(v, fmt),
        label: L('Hypothetical growth of 1, month by month: use the arrow keys to read each month.', 'Hipotetična rast 1, mesec za mesecem: s puščicami preberete vsak mesec.'),
        legendLabel: L('Series', 'Serije'),
        readout: (i) => `${monthOf(eq[i][0].slice(0, 7))} · ${series.map((s) => `${s.label} ${xFmt(s.values[i], fmt)}`).join(' · ')}`,
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
    h('div', { class: 'c-meta bt-aside' }, statsTable, hitWarning(ctx, sh)),
    chart,
  );
}

// The brief treats a hit rate above 60% as a sign of look-ahead leakage until proven otherwise.
// A holdout at or near that line gets said out loud, next to the number.
function hitWarning(ctx, sh) {
  const { L, fmt } = ctx;
  if (!(Number.isFinite(sh.hitRate) && sh.hitRate >= 0.595)) return null;
  const hit = fmt.pct(sh.hitRate);
  return h(
    'p',
    { class: 'rec-note bt-hitnote' },
    L(
      `The holdout hit rate of ${hit} sits at the 60% line our protocol treats as a warning sign of look-ahead leakage when it is sustained in live results. The look-ahead tests pass (fundamentals only after their filing date, short interest only after publication, news only after release); the sealed forward record is the check that counts.`,
      `Delež uspešnih v preizkusnem obdobju, ${hit}, je na meji 60 %, ki jo naš protokol obravnava kot opozorilo na uhajanje prihodnjih podatkov, če se ohrani v živih rezultatih. Preizkusi prihodnjih podatkov so uspešni (temeljni podatki šele po datumu objave poročila, kratka prodaja šele po objavi, novice šele po izidu); šteje zapečateni zapis naprej.`,
    ),
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
  const failIds = gates.filter((g) => !g.pass).map((g) => `(${g.id})`);
  const join = (ids, and) => (ids.length < 2 ? ids.join('') : `${ids.slice(0, -1).join(', ')} ${and} ${ids.at(-1)}`);
  const amended = bt.launch?.amendment;
  const failEn = failIds.length === 0 ? 'All five passed.' : failIds.length === 1 ? `They were written before the holdout was opened and are published with their results, including the one that failed: ${failIds[0]}.` : `They were written before the holdout was opened and are published with their results, including the ${failIds.length} that failed: ${join(failIds, 'and')}.`;
  const failSl = failIds.length === 0 ? 'Vseh pet je izpolnjenih.' : failIds.length === 1 ? `Zapisani so bili, preden je bilo preizkusno obdobje odprto, in so objavljeni z rezultati, tudi tisti, ki ni bil izpolnjen: ${failIds[0]}.` : `Zapisani so bili, preden je bilo preizkusno obdobje odprto, in so objavljeni z rezultati, tudi ${failIds.length === 2 ? 'dva, ki nista bila izpolnjena' : `${failIds.length}, ki niso bili izpolnjeni`}: ${join(failIds, 'in')}.`;
  const amendEn = amended ? ` Gate (d) was amended after the holdout was opened (${amended.id}, disclosed in full below); the original wording’s result is kept.` : '';
  const amendSl = amended ? ` Pogoj (d) je bil spremenjen, potem ko je bilo preizkusno obdobje odprto (${amended.id}, v celoti razkrito spodaj); rezultat prvotnega besedila ostane objavljen.` : '';
  return h(
    'section',
    { class: 'section grid rec-sec bt-sec', id: 'gates', 'aria-labelledby': 'bt-g-h' },
    ...sectionHead({ index: '03', kicker: L('Ship gates · measured once on the holdout', 'Pogoji · izmerjeni enkrat na preizkusu'), title: L(`${passN} of ${gates.length} passed.`, `${passN} od ${gates.length} izpolnjenih.`), id: 'bt-g-h', size: 'd3' }),
    h(
      'p',
      { class: 'lede c-body' },
      L(`All five must pass, net of costs, for the engine launch gate; launch also needs the brief’s legal, data and SMS approvals. ${failEn}${amendEn}`, `Vseh pet mora biti izpolnjenih, po stroških, za pogoj pogona za zagon; zagon potrebuje še pravne, podatkovne in SMS odobritve iz izhodišč. ${failSl}${amendSl}`),
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

// The launch block under amendment A-1 (ARCHITECTURE.md §3): the gates that decide are (a), (b), (c), (e)
// on the holdout, (d1) on the research window and (d2) on the pooled record. Gate (d) as first written is
// published beside them with its result. The deflated pooled figures (launch.pooled, gate === false) are
// comparison only: shown folded, never as a gate, never with a pass date.
function launchSection(ctx, bt) {
  const { L, fmt, locale } = ctx;
  const ln = bt.launch;
  if (!ln) {
    return h(
      'section',
      { class: 'section grid rec-sec bt-sec', id: 'launch', 'aria-labelledby': 'bt-l-h' },
      ...sectionHead({ index: '04', kicker: L('Engine launch gate', 'Pogoj pogona za zagon'), title: L('Launch test not published yet.', 'Preizkus za zagon še ni objavljen.'), id: 'bt-l-h', size: 'd3' }),
      h('p', { class: 'lede c-body' }, L('The launch assessment is not in this export. SMS alerts stay off until every gate passes.', 'Ocena za zagon ni v tem izvozu. Obvestila SMS ostanejo izklopljena, dokler niso izpolnjeni vsi pogoji.')),
    );
  }
  const info = launchInfo(bt);
  const LC = launchCopy(info, locale);
  const p = ln.pooled ?? {};
  const d1 = ln.d1 ?? null;
  const d2 = ln.d2 ?? null;
  const mtd = d2?.monthToDate && typeof d2.monthToDate === 'object' && d2.monthToDate.through ? d2.monthToDate : null;
  const orig = ln.original ?? null;
  const verdict = (pass, words) => h('dd', { class: ['bt-lv', pass ? 'is-pass' : 'is-fail'] }, h('span', { 'aria-hidden': 'true' }, pass ? '✓ ' : '× '), words ?? (pass ? L('pass', 'izpolnjen') : L('fail', 'ni izpolnjen')));
  const meter = (v, thr, label) => {
    const m = h('div', { class: 'bt-meter', role: 'img', 'aria-label': `${label}: ${fmt.num(v, 3)} ${L('of the required', 'od zahtevanih')} ${fmt.num(thr, 2)}` });
    const fill = h('span', { class: 'bt-meter__fill' });
    fill.style.setProperty('--v', String(Math.max(0, Math.min(1, v))));
    const t = h('span', { class: 'bt-meter__thr' }, h('span', { class: 'label' }, `${L('needs', 'potrebno')} ${fmt.num(thr, 2)}`));
    t.style.setProperty('--t', String(thr));
    m.append(fill, t);
    return m;
  };
  const labelOf = (id) => bt.gates?.find((g) => g.id === id)?.label?.[locale] ?? '';
  const rows = [
    ...(ln.holdoutGates ?? []).filter((g) => g.id !== 'd').map((g) => h('div', {}, h('dt', {}, L(`(${g.id}) on the holdout`, `(${g.id}) na preizkusu`), h('span', { class: 'bt-lv__k small' }, labelOf(g.id))), verdict(g.pass))),
    d1
      ? h(
          'div',
          {},
          h('dt', {}, L('(d1) on the research window', '(d1) v raziskovalnem obdobju'), h('span', { class: 'bt-lv__k small' }, L(`DSR ${fmt.num(d1.dsrResearch, 3)}, needs ${fmt.num(d1.dsrThreshold ?? 0.95, 2)} (raw count ${fmt.num(d1.dsrResearchRaw, 3)}) · PBO ${fmt.num(d1.pbo, 3)}, bound ${fmt.num(d1.pboThreshold ?? 0.3, 1)}`, `DSR ${fmt.num(d1.dsrResearch, 3)}, potrebno ${fmt.num(d1.dsrThreshold ?? 0.95, 2)} (surovo ${fmt.num(d1.dsrResearchRaw, 3)}) · PBO ${fmt.num(d1.pbo, 3)}, meja ${fmt.num(d1.pboThreshold ?? 0.3, 1)}`))),
          verdict(d1.pass),
        )
      : null,
    d2
      ? h(
          'div',
          {},
          h('dt', {}, L('(d2) on the pooled record', '(d2) na združenem zapisu'), h('span', { class: 'bt-lv__k small' }, L(`PSR ${fmt.num(d2.psr, 3)}, needs ${fmt.num(d2.threshold ?? 0.95, 2)} · re-tested monthly`, `PSR ${fmt.num(d2.psr, 3)}, potrebno ${fmt.num(d2.threshold ?? 0.95, 2)} · preverja se mesečno`))),
          verdict(d2.pass, d2.pass ? L(`pass${d2.firstPass ? ` since ${monthOf(d2.firstPass)}` : ''}`, `izpolnjen${d2.firstPass ? ` od ${monthOf(d2.firstPass)}` : ''}`) : L('not yet', 'še ne')),
        )
      : null,
    orig
      ? h(
          'div',
          { class: 'bt-lv--orig' },
          h('dt', {}, L('(d) as first written, on the holdout', '(d) v prvotnem besedilu, na preizkusu'), h('span', { class: 'bt-lv__k small' }, L(`DSR ${fmt.num(orig.dsr, 3)}, needs 0.95 · superseded by ${ln.amendment?.id ?? 'A-1'}, result kept`, `DSR ${fmt.num(orig.dsr, 3)}, potrebno 0,95 · nadomeščeno z ${ln.amendment?.id ?? 'A-1'}, rezultat ostane objavljen`))),
          verdict(orig.pass),
        )
      : null,
  ].filter(Boolean);

  const title = LC.title;

  // (d1) and (d2): the two halves of the amended gate, side by side
  const hist = d2?.history ?? [];
  const d2Chart = hist.length
    ? lineChart({
        dates: hist.map((r) => r.month),
        series: [
          { key: 'psr', label: L('Probabilistic Sharpe, pooled record (d2)', 'Verjetnostni Sharpe, združen zapis (d2)'), short: 'PSR', values: hist.map((r) => r.psr), style: 'main', end: fmt.num(hist.at(-1).psr, 3) },
          { key: 'need', label: L(`Needs ${fmt.num(d2.threshold ?? 0.95, 2)}`, `Potrebno ${fmt.num(d2.threshold ?? 0.95, 2)}`), short: L('needs', 'potrebno'), values: hist.map(() => d2.threshold ?? 0.95), style: 'bench', end: fmt.num(d2.threshold ?? 0.95, 2) },
        ],
        yLabel: (v) => fmt.num(v, 2),
        label: L('Gate (d2) at each month-end, pooled probabilistic Sharpe: use the arrow keys.', 'Pogoj (d2) ob vsakem koncu meseca, združeni verjetnostni Sharpe: uporabite puščice.'),
        legendLabel: L('Series', 'Serije'),
        readout: (i) => `${monthOf(hist[i].month)} · ${L('months', 'mesecev')} ${hist[i].months} · PSR ${fmt.num(hist[i].psr, 4)} · Sharpe ${fmt.num(hist[i].sharpe, 2)} · ${hist[i].pass ? L('pass', 'izpolnjen') : L('not yet', 'še ne')}`,
        valueLabel: (v) => fmt.num(v, 4),
        altCaption: L('Gate (d2): pooled probabilistic Sharpe at each month end', 'Pogoj (d2): združeni verjetnostni Sharpe ob koncu vsakega meseca'),
        dateLabel: L('Month', 'Mesec'),
        className: 'eq--dsr',
      })
    : null;
  const dBlock = h(
    'div',
    { class: 'c-wide bt-pooled bt-dgates' },
    h('p', { class: 'label' }, L(`Gate (d) as amended by ${ln.amendment?.id ?? 'A-1'}: both halves must pass`, `Pogoj (d) po dopolnilu ${ln.amendment?.id ?? 'A-1'}: izpolnjena morata biti oba dela`)),
    h(
      'div',
      { class: 'bt-pooled__grid' },
      d1
        ? h(
            'div',
            { class: 'bt-pooled__m' },
            h('p', { class: 'label' }, L(`(d1) · research window ${d1.from?.slice(0, 4) ?? ''}–${d1.to?.slice(0, 4) ?? ''} · ${d1.months} months`, `(d1) · raziskovalno obdobje ${d1.from?.slice(0, 4) ?? ''}–${d1.to?.slice(0, 4) ?? ''} · ${d1.months} mesecev`)),
            h('p', { class: 'bt-big mono' }, fmt.num(d1.dsrResearch, 3)),
            h('p', { class: 'small' }, L(`Deflated Sharpe probability of the research window (Sharpe ${fmt.num(d1.sharpe, 2)}), deflated for ${d1.nTrialsEff} effective independent variants. Counting all ${fmt.int(d1.nTrialsRaw)} variants as independent: ${fmt.num(d1.dsrResearchRaw, 3)}. PBO ${fmt.num(d1.pbo, 3)} (bound ${fmt.num(d1.pboThreshold ?? 0.3, 1)}).`, `Verjetnost deflacioniranega Sharpa raziskovalnega obdobja (Sharpe ${fmt.num(d1.sharpe, 2)}), deflacionirano za ${d1.nTrialsEff} dejansko neodvisnih različic. Če vseh ${fmt.int(d1.nTrialsRaw)} različic štejemo kot neodvisne: ${fmt.num(d1.dsrResearchRaw, 3)}. PBO ${fmt.num(d1.pbo, 3)} (meja ${fmt.num(d1.pboThreshold ?? 0.3, 1)}).`)),
            meter(d1.dsrResearch, d1.dsrThreshold ?? 0.95, L('Gate (d1), research-window DSR', 'Pogoj (d1), DSR raziskovalnega obdobja')),
            h('p', { class: ['bt-lv', d1.pass ? 'is-pass' : 'is-fail'] }, h('span', { 'aria-hidden': 'true' }, d1.pass ? '✓ ' : '× '), d1.pass ? L('Pass', 'Izpolnjen') : L('Fail: the research window is closed, so this cannot change.', 'Ni izpolnjen: raziskovalno obdobje je zaprto, zato se to ne more spremeniti.')),
          )
        : null,
      d2
        ? h(
            'div',
            { class: 'bt-pooled__m' },
            h('p', { class: 'label' }, L(`(d2) · pooled ${fmt.date(p.from ?? ln.asOf)} to ${fmt.date(p.to ?? ln.asOf)} · ${d2.months} months (${d2.holdoutMonths} holdout + ${d2.sealedMonths} sealed)`, `(d2) · združeno ${fmt.date(p.from ?? ln.asOf)} do ${fmt.date(p.to ?? ln.asOf)} · ${d2.months} mesecev (${d2.holdoutMonths} preizkus + ${d2.sealedMonths} zapečaten)`)),
            h('p', { class: 'bt-big mono' }, fmt.num(d2.psr, 3)),
            h('p', { class: 'small' }, L(`Probabilistic Sharpe ratio: the probability that the true Sharpe of the pooled monthly excess returns is above zero (Sharpe ${fmt.num(d2.sharpe, 2)} a year). Re-tested at every month-end.`, `Verjetnostno Sharpovo razmerje: verjetnost, da je pravi Sharpe združenih mesečnih presežnih donosov nad nič (Sharpe ${fmt.num(d2.sharpe, 2)} letno). Preverja se ob koncu vsakega meseca.`)),
            meter(d2.psr, d2.threshold ?? 0.95, L('Gate (d2), pooled PSR', 'Pogoj (d2), združeni PSR')),
            h('p', { class: ['bt-lv', d2.pass ? 'is-pass' : 'is-fail'] }, h('span', { 'aria-hidden': 'true' }, d2.pass ? '✓ ' : '× '), d2.pass ? L(`Pass${d2.firstPass ? ` at every month-end since ${monthOf(d2.firstPass)}` : ''}.${info.research ? ` It cannot make up for ${info.failed.filter((id) => id !== 'd2').map((id) => `(${id})`).join(' or ')}.` : ''}`, `Izpolnjen${d2.firstPass ? ` ob vsakem koncu meseca od ${monthOf(d2.firstPass)}` : ''}.${info.research ? ` Ne more nadomestiti ${info.failed.filter((id) => id !== 'd2').map((id) => `(${id})`).join(' ali ')}.` : ''}`) : L('Not yet.', 'Še ne.')),
          )
        : null,
    ),
  );

  const compare = Number.isFinite(p.dsr)
    ? h(
        'div',
        { class: 'c-wide faq bt-compare' },
        h(
          'details',
          {},
          h('summary', {}, L('Deflated pooled figures, for comparison: not a gate', 'Deflacionirane združene številke, za primerjavo: ni pogoj')),
          h(
          'div',
          { class: 'prose' },
          h(
            'p',
            {},
            L(
              `The same pooled monthly series, deflated as gate (d) was first written: ${fmt.num(p.dsr, 3)} deflated for ${p.nTrialsEff} effective variants, ${fmt.num(p.dsrRaw, 3)} counting all ${fmt.int(p.nTrialsRaw)} (luck bars ${fmt.num(p.sr0Monthly * Math.sqrt(12), 2)} and ${fmt.num(p.sr0MonthlyRaw * Math.sqrt(12), 2)} a year; PBO ${fmt.num(p.pbo, 3)}). Under ${ln.amendment?.id ?? 'A-1'} this is published for comparison and decides nothing.`,
              `Enaka združena mesečna serija, deflacionirana po prvotnem besedilu pogoja (d): ${fmt.num(p.dsr, 3)} ob ${p.nTrialsEff} dejansko neodvisnih različicah, ${fmt.num(p.dsrRaw, 3)} ob vseh ${fmt.int(p.nTrialsRaw)} (meji sreče ${fmt.num(p.sr0Monthly * Math.sqrt(12), 2)} in ${fmt.num(p.sr0MonthlyRaw * Math.sqrt(12), 2)} letno; PBO ${fmt.num(p.pbo, 3)}). Po ${ln.amendment?.id ?? 'A-1'} je objavljeno za primerjavo in ne odloča o ničemer.`,
            ),
          ),
          ),
        ),
      )
    : null;

  return h(
    'section',
    { class: ['section grid rec-sec bt-sec bt-launch', info.research && 'is-research', info.ready && 'is-ready'], id: 'launch', 'aria-labelledby': 'bt-l-h' },
    ...sectionHead({
      index: '04',
      kicker: L(`${LC.kicker} · as of ${fmt.date(ln.asOf)}`, `${LC.kicker} · na dan ${fmt.date(ln.asOf)}`),
      title,
      id: 'bt-l-h',
      size: 'd3',
    }),
    // the lede, then what the engine gate does not cover (the brief's other launch gates, §8), in every state
    h(
      'div',
      { class: 'c-body bt-launch__text' },
      h('p', { class: 'lede' }, ln.remaining?.[locale] ?? ln.remaining?.en ?? info.text[locale] ?? ''),
      h('p', { class: 'rec-note bt-launch__others' }, LC.others),
    ),
    h('dl', { class: 'c-meta dl boxed bt-launch__gates', 'aria-label': L('The gates that decide the engine launch gate', 'Pogoji, ki odločajo o pogoju pogona za zagon') }, rows),
    ln.amendment
      ? h(
          'div',
          { class: 'c-body bt-amend' },
          h('p', { class: 'label' }, L(`Amendment ${ln.amendment.id} · ${fmt.date(ln.amendment.date)} · disclosed in full`, `Dopolnilo ${ln.amendment.id} · ${fmt.date(ln.amendment.date)} · razkrito v celoti`)),
          h('p', { class: 'bt-amend__text' }, ln.amendment.text?.[locale] ?? ln.amendment.text?.en ?? ''),
          Number.isFinite(ln.amendment.psrHoldout) ? h('p', { class: 'small muted' }, L(`Probabilistic Sharpe of the holdout before any deflation: ${fmt.num(ln.amendment.psrHoldout, 3)}.`, `Verjetnostni Sharpe preizkusnega obdobja pred deflacijo: ${fmt.num(ln.amendment.psrHoldout, 3)}.`)) : null,
        )
      : null,
    dBlock,
    d2Chart,
    d2
      ? h(
          'p',
          { class: 'c-body rec-note' },
          L(
            `Gate (d2) uses monthly excess returns of the follow-every-pick paper portfolio over the benchmark, net of costs: the holdout backtest from ${fmt.date(p.from ?? bt.holdout?.from)}, then the sealed record after ${fmt.date(bt.holdout?.to)}, complete months only, through ${fmt.date(p.to ?? d2.through ?? ln.asOf)}.${mtd ? ` The month to date (to ${fmt.date(mtd.through)}, probabilistic Sharpe ${fmt.num(mtd.psr, 3)}) is not a test result; it enters the test at its month-end.` : ''}`,
            `Pogoj (d2) uporablja mesečne presežne donose papirnega portfelja vseh izbir nad merilom, po stroških: povratni test preizkusnega obdobja od ${fmt.date(p.from ?? bt.holdout?.from)}, nato zapečaten zapis po ${fmt.date(bt.holdout?.to)}, samo celi meseci, do ${fmt.date(p.to ?? d2.through ?? ln.asOf)}.${mtd ? ` Tekoči mesec (do ${fmt.date(mtd.through)}, verjetnostni Sharpe ${fmt.num(mtd.psr, 3)}) ni rezultat preizkusa; v preizkus vstopi ob koncu meseca.` : ''}`,
          ),
        )
      : null,
    compare,
  );
}

function overfitSection(ctx, bt) {
  const { L, fmt, locale } = ctx;
  const d = bt.dsrDetail ?? {};
  const raw = d.raw ?? {};
  const k12 = Math.sqrt(12);
  const dR = d.dsrResearch ?? bt.launch?.d1?.dsrResearch;
  // how the four deflated figures sit against 0.95, computed (never a fixed sentence: the export may change)
  const dsrs = [bt.dsr, raw.dsr, dR, raw.dsrResearch].filter(Number.isFinite);
  const nAbove = dsrs.filter((v) => v >= 0.95).length;
  const belowEn = !dsrs.length ? '' : nAbove === 0 ? 'All of them are below 0.95.' : nAbove === dsrs.length ? 'All of them reach 0.95.' : `${nAbove} of the ${dsrs.length} reach 0.95.`;
  const belowSl = !dsrs.length ? '' : nAbove === 0 ? 'Vse so pod 0,95.' : nAbove === dsrs.length ? 'Vse dosežejo 0,95.' : `${nAbove} od ${dsrs.length} doseže 0,95.`;
  const markers = [
    Number.isFinite(d.expectedMaxSharpeMonthly) ? { value: d.expectedMaxSharpeMonthly * k12, label: L(`Best of ${d.nTrials ?? '?'} clusters by luck`, `Najboljša od ${d.nTrials ?? '?'} skupin po naključju`), cls: 'is-luck' } : null,
    Number.isFinite(raw.expectedMaxSharpeMonthly) ? { value: raw.expectedMaxSharpeMonthly * k12, label: L(`Best of ${fmt.int(raw.nTrials ?? bt.variantsTried)} variants by luck`, `Najboljša od ${fmt.int(raw.nTrials ?? bt.variantsTried)} različic po naključju`), cls: 'is-luckraw' } : null,
    Number.isFinite(bt.stats?.sharpe) ? { value: bt.stats.sharpe, label: L('Research Sharpe (d1)', 'Sharpe raziskave (d1)'), cls: 'is-research' } : null,
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
          `The probability that the real edge is above zero after allowing for the best-of-many luck, for short samples and for fat tails. We require at least 0.95. Gate (d) as first written applied it to the holdout: ${fmt.num(bt.dsr, 3)} when similar variants are grouped into ${d.nTrials ?? '?'} independent clusters, ${fmt.num(raw.dsr, 3)} if all ${fmt.int(raw.nTrials ?? bt.variantsTried)} count separately. ${Number.isFinite(dR) ? `Amendment A-1 moved the test to the research window, where the variants were tried (gate d1): ${fmt.num(dR, 3)} with the clusters, ${fmt.num(raw.dsrResearch, 3)} counting every variant. ${belowEn}` : ''}`,
          `Verjetnost, da je resnična prednost nad nič, ko upoštevamo srečo najboljšega izmed mnogih, kratke vzorce in debele repe. Zahtevamo vsaj 0,95. Pogoj (d) v prvotnem besedilu jo je uporabil na preizkusnem obdobju: ${fmt.num(bt.dsr, 3)}, ko podobne različice združimo v ${d.nTrials ?? '?'} neodvisnih skupin, ${fmt.num(raw.dsr, 3)}, če vseh ${fmt.int(raw.nTrials ?? bt.variantsTried)} štejemo posebej. ${Number.isFinite(dR) ? `Dopolnilo A-1 je preizkus prestavilo v raziskovalno obdobje, kjer so bile različice preizkušene (pogoj d1): ${fmt.num(dR, 3)} s skupinami, ${fmt.num(raw.dsrResearch, 3)}, če štejemo vsako različico. ${belowSl}` : ''}`,
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
        [L('DSR, holdout', 'DSR, preizkus'), fmt.num(bt.dsr, 3), L(`${d.nTrials ?? '?'} clusters · raw ${fmt.num(raw.dsr, 3)} · gate (d) as first written`, `${d.nTrials ?? '?'} skupin · surovo ${fmt.num(raw.dsr, 3)} · pogoj (d) v prvotnem besedilu`)],
        Number.isFinite(dR) ? [L('DSR, research window', 'DSR, raziskovalno obdobje'), fmt.num(dR, 3), L(`${d.nTrials ?? '?'} clusters · raw ${fmt.num(raw.dsrResearch, 3)} · gate (d1), needs 0.95`, `${d.nTrials ?? '?'} skupin · surovo ${fmt.num(raw.dsrResearch, 3)} · pogoj (d1), potrebno 0,95`)] : null,
        ['PBO', fmt.num(bt.pbo, 3), L('CSCV, 16 blocks · bound 0.3', 'CSCV, 16 blokov · meja 0,3')],
      ].filter(Boolean).map(([k, v, s]) => h('div', { class: 'stat' }, h('dt', { class: 'stat__k' }, k), h('dd', { class: 'stat__v' }, v), h('dd', { class: 'stat__s' }, s))),
    ),
    (bt.variantSharpes ?? []).length ? variantHistogram(bt.variantSharpes, { markers, fmt, L }) : null,
    h(
      'p',
      { class: 'c-body figcaption' },
      L(
        `Each bar counts variants by their annualised Sharpe ratio on the research window. The lines show what the best one would reach by luck alone, what the chosen rule did on the research window (the figure gate d1 deflates) and what it did on the untouched holdout. Clusters group variants whose returns move together; the number of clusters is chosen by how cleanly they separate.`,
        `Vsak stolpec šteje različice po letnem Sharpovem razmerju v raziskovalnem obdobju. Črte kažejo, kaj bi najboljša dosegla zgolj po naključju, kaj je izbrano pravilo doseglo v raziskovalnem obdobju (številka, ki jo deflacionira pogoj d1) in kaj na nedotaknjenem preizkusu. Skupine združujejo različice, katerih donosi se gibljejo skupaj; število skupin je izbrano po tem, kako čisto se ločijo.`,
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

