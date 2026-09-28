// #/methodology: versions, the named models behind every "AI" claim, validation, ship gates,
// look-ahead controls, measurement and the retirement rule. SL: first draft, needs native review.
import { h } from '../dom.js';
import { masthead, contentSections, toc, page, table } from './_content.js';
import { familyName } from '../ui.js';

const LLM_ID = 'Claude (Anthropic)';

const COPY = {
  en: {
    title: 'Methodology',
    kicker: 'How does a pick happen?',
    h1: 'The method, frozen and versioned.',
    lede: 'The models were frozen before the sealed record began. Every change since is a new version with a public changelog entry and a ledger record. This page names the model behind every claim we make.',
    toc: 'On this page',
    version: (x) => `Methodology v${x.v} · effective ${x.eff} · ${x.model} · engine frozen ${x.frozen}`,
    changelog: 'Changelog',
    ai: {
      title: 'Every “AI” claim, mapped to a named model',
      short: 'Named models',
      intro: `<p>We say “statistical and machine-learning models” and “drafted with AI”. Here is exactly what those words refer to. <strong>The language model never picks.</strong> It can only remove a candidate (the news veto), and it drafts text that a validator and a named person check.</p>`,
      head: ['Claim on this site', 'Named model', 'What it does', 'What it never does'],
      rows: (x) => [
        ['Machine-learning ranker', `Family D: GBDT ranker in ${x.model} (histogram gradient-boosted trees, depth 3–6, averaged over seeds, retrained once a year)`, 'Ranks every eligible stock by its expected 21-day sector-relative return. One vote of four.', 'Issue a pick on its own; see data after its training cutoff.'],
        ['Statistical models', `Families A ${x.A}, B ${x.B}, C ${x.C}: published factor formulas, no learning`, 'Rank every eligible stock on one kind of evidence each.', 'Change between versions without a changelog entry.'],
        ['Drafted with AI', `Explainer LLM, model id pinned per methodology version (production: ${LLM_ID}, exact version recorded with every draft). In this demo: the template writer, recorded as drafter “template”.`, 'Drafts the English and Slovene thesis from the factor data. A numeric validator checks every number against the source; one regeneration, then the approver writes it.', 'Choose, rank or alter a pick, or introduce a number that is not in the data.'],
        ['AI news screen', `The same pinned LLM, as a 48-hour negative-news classifier. In this demo: a deterministic stand-in, labelled as such.`, 'Can veto a candidate for material negative news or filings.', 'Add a candidate, or pick.'],
        ['Named approver', x.approver, 'Reviews candidates between 12:00 and 13:40 and may remove one, with a logged reason.', 'Add or substitute a pick.'],
      ],
      aside: `<p class="small muted">LLM components are validated only on dates after the model’s training cutoff, with anonymised inputs. Every prompt and output is logged with its SHA-256.</p>`,
    },
    universe: {
      title: 'Universe',
      short: 'Universe',
      body: (x) =>
        `<p>US common stocks with a price above $${x.minPrice}, market value above $${x.minMcap}B and 60-day average daily trading above $${x.minAdv}M: about 1,300 names on a typical day (${x.today} in the latest issue). The trading floor rises with subscriber count, so subscriber buying stays at or below 2% of daily volume; if the median alert gap exceeds 30 bps over 20 picks, the floor doubles.</p><p>Everything is keyed on permanent identifiers, never on tickers. Delisted companies stay in the history with their delisting returns.</p>`,
    },
    validation: {
      title: 'Validation, and the gates we had to pass',
      short: 'Validation',
      body: (x) =>
        `<ol><li><strong>Walk-forward.</strong> An expanding training window, retrained once a year. Every prediction uses only data from before its training cutoff.</li><li><strong>Hyperparameters</strong> by purged k-fold cross-validation with a 21-day purge and a one-month embargo.</li><li><strong>Every configuration tried is logged:</strong> ${x.variants} variants. We report the Deflated Sharpe Ratio (${x.dsr}) and the Probability of Backtest Overfitting (${x.pbo}).</li><li><strong>An untouched holdout</strong> from ${x.hFrom} to ${x.hTo}, opened once, after the engine was frozen.</li></ol><p>All five ship gates had to pass on that holdout, net of costs:</p>`,
      head: ['Gate', 'Test', 'Holdout result', 'Pass'],
      pass: 'pass',
      fail: 'fail',
      aside: `<p class="small muted">Backtests are hypothetical and live on their own page. They never appear in the hero, in ads or in a text.</p>`,
      backtest: 'The backtest page',
    },
    controls: {
      title: 'Look-ahead and survivorship controls',
      short: 'Controls',
      body: `<ul><li>Fundamentals enter only after the filing’s public acceptance time, as first reported.</li><li>Historical index membership, not today’s.</li><li>Delisted stocks included, with their delisting returns (about −30% where missing).</li><li>Everything keyed on permanent identifiers, never tickers.</li><li>Short interest only from the date it was published.</li></ul>`,
    },
    expect: {
      title: 'What to expect',
      short: 'Expectations',
      body: `<p>Consensus picks should beat the benchmark about <strong>53–58%</strong> of the time. <strong>A sustained live rate above 60% is treated as a bug</strong> (leakage) until proven otherwise. Published signals decay: research on hundreds of anomalies finds returns fall by roughly half after publication, and we budget for that.</p><p>Proving a 55% hit rate against 50% at two standard errors needs about 400 picks, which takes years at our cadence. That is why the full-universe decile returns and monthly rank IC are published too: they give evidence faster than the picks alone.</p>`,
    },
    retire: {
      title: 'The retirement rule',
      short: 'Retirement',
      body: `<p>Pre-registered and public: <strong>a family whose 24-month live rank IC is at or below zero is retired.</strong> If the fundamental momentum family’s holdout IC net of costs is not positive, it is replaced by an insider-cluster family.</p>`,
    },
  },
  sl: {
    title: 'Metodologija',
    kicker: 'Kako nastane izbira?',
    h1: 'Metoda, zamrznjena in z različicami.',
    lede: 'Modele smo zamrznili, preden se je začel zapečaten zapis. Vsaka poznejša sprememba je nova različica z javnim zapisom v dnevniku sprememb in zapisom v knjigi. Ta stran poimenuje model za vsako našo trditev.',
    toc: 'Na tej strani',
    version: (x) => `Metodologija v${x.v} · velja od ${x.eff} · ${x.model} · pogon zamrznjen ${x.frozen}`,
    changelog: 'Dnevnik sprememb',
    ai: {
      title: 'Vsaka trditev o »UI«, povezana s poimenovanim modelom',
      short: 'Poimenovani modeli',
      intro: `<p>Pravimo »statistični modeli in modeli strojnega učenja« in »pripravljeno z UI«. Tukaj je natančno, na kaj se te besede nanašajo. <strong>Jezikovni model nikoli ne izbira.</strong> Kandidatko lahko samo odstrani (veto novic) in pripravi besedilo, ki ga preverita validator in imenovana oseba.</p>`,
      head: ['Trditev na strani', 'Poimenovani model', 'Kaj počne', 'Česa nikoli ne počne'],
      rows: (x) => [
        ['Rangirnik strojnega učenja', `Družina D: rangirnik GBDT v ${x.model} (histogramska gradientno ojačana drevesa, globina 3–6, povprečje več semen, enkrat letno ponovno naučen)`, 'Rangira vse primerne delnice po pričakovanem 21-dnevnem donosu glede na sektor. En glas od štirih.', 'Sam izdati izbire; videti podatkov po mejnem datumu učenja.'],
        ['Statistični modeli', `Družine A ${x.A}, B ${x.B}, C ${x.C}: objavljene faktorske formule, brez učenja`, 'Vsaka rangira vse primerne delnice po eni vrsti dokazov.', 'Spremeniti se med različicami brez zapisa v dnevniku.'],
        ['Pripravljeno z UI', `Pojasnjevalni LLM, ID modela je določen za vsako različico metodologije (v produkciji: ${LLM_ID}, točna različica je zabeležena ob vsakem osnutku). V tem demu: predložni pisec, zabeležen kot drafter »template«.`, 'Pripravi angleško in slovensko tezo iz faktorskih podatkov. Številčni validator preveri vsako število glede na vir; ena ponovitev, nato tezo napiše odobriteljica.', 'Izbrati, rangirati ali spremeniti izbire ali uvesti število, ki ga ni v podatkih.'],
        ['Pregled novic z UI', `Isti določeni LLM kot 48-urni klasifikator negativnih novic. V tem demu: determinističen nadomestek, tako tudi označen.`, 'Lahko vloži veto na kandidatko zaradi pomembnih negativnih novic ali poročil.', 'Dodati kandidatke ali izbirati.'],
        ['Imenovana odobriteljica', x.approver, 'Med 12:00 in 13:40 pregleda kandidatke in lahko eno odstrani z zabeleženim razlogom.', 'Dodati ali zamenjati izbire.'],
      ],
      aside: `<p class="small muted">Komponente LLM preverjamo samo na datumih po mejnem datumu učenja modela in z anonimiziranimi vhodi. Vsak poziv in odgovor sta zabeležena s SHA-256.</p>`,
    },
    universe: {
      title: 'Univerzum',
      short: 'Univerzum',
      body: (x) =>
        `<p>Ameriške navadne delnice s ceno nad ${x.minPrice} $, tržno vrednostjo nad ${x.minMcap} mrd $ in 60-dnevnim povprečnim dnevnim prometom nad ${x.minAdv} mio $: na običajen dan približno 1.300 imen (${x.today} v zadnji izdaji). Prag prometa raste s številom naročnikov, tako da nakupi naročnikov ostanejo pod 2 % dnevnega prometa; če mediana razlike ob obvestilu v 20 izbirah preseže 30 b.t., se prag podvoji.</p><p>Vse je vezano na trajne identifikatorje, nikoli na oznake. Umaknjena podjetja ostanejo v zgodovini z donosi ob umiku.</p>`,
    },
    validation: {
      title: 'Validacija in pogoji, ki smo jih morali izpolniti',
      short: 'Validacija',
      body: (x) =>
        `<ol><li><strong>Drseče okno.</strong> Razširjajoče se učno okno, enkrat letno ponovno naučeno. Vsaka napoved uporablja samo podatke pred mejnim datumom učenja.</li><li><strong>Hiperparametri</strong> s prečiščeno k-kratno navzkrižno validacijo z 21-dnevnim čiščenjem in enomesečnim embargom.</li><li><strong>Vsaka preizkušena nastavitev je zabeležena:</strong> ${x.variants} različic. Poročamo deflacionirano Sharpovo razmerje (${x.dsr}) in verjetnost prekomernega prilagajanja (${x.pbo}).</li><li><strong>Nedotaknjeno preizkusno obdobje</strong> od ${x.hFrom} do ${x.hTo}, odprto enkrat, po zamrznitvi pogona.</li></ol><p>Vseh pet pogojev za zagon je moralo biti izpolnjenih v tem obdobju, po stroških:</p>`,
      head: ['Pogoj', 'Preizkus', 'Rezultat', 'Izpolnjen'],
      pass: 'da',
      fail: 'ne',
      aside: `<p class="small muted">Povratni testi so hipotetični in imajo svojo stran. Nikoli se ne pojavijo v glavnem prizoru, v oglasih ali v SMS.</p>`,
      backtest: 'Stran s povratnim testom',
    },
    controls: {
      title: 'Nadzor nad vpogledom v prihodnost in preživetveno pristranskostjo',
      short: 'Nadzor',
      body: `<ul><li>Temeljni podatki vstopijo šele po času javne potrditve poročila, kot so bili prvič objavljeni.</li><li>Zgodovinska sestava indeksa, ne današnja.</li><li>Umaknjene delnice so vključene z donosi ob umiku (približno −30 %, kjer manjkajo).</li><li>Vse je vezano na trajne identifikatorje, nikoli na oznake.</li><li>Kratka prodaja šele od datuma objave.</li></ul>`,
    },
    expect: {
      title: 'Kaj pričakovati',
      short: 'Pričakovanja',
      body: `<p>Izbire s soglasjem naj bi merilo premagale v približno <strong>53–58 %</strong> primerov. <strong>Trajen delež nad 60 % obravnavamo kot napako</strong> (uhajanje podatkov), dokler se ne dokaže drugače. Objavljeni signali slabijo: raziskave stotin anomalij kažejo, da donosi po objavi padejo približno za polovico, in to upoštevamo.</p><p>Za dokaz 55-odstotnega deleža proti 50 % pri dveh standardnih napakah je potrebnih približno 400 izbir, kar pri našem ritmu traja leta. Zato objavljamo tudi decilne donose celotnega univerzuma in mesečni rangovni IC: ti dajo dokaze hitreje kot same izbire.</p>`,
    },
    retire: {
      title: 'Pravilo upokojitve',
      short: 'Upokojitev',
      body: `<p>Vnaprej zabeleženo in javno: <strong>družino, katere 24-mesečni živi rangovni IC je enak ali manjši od nič, upokojimo.</strong> Če IC družine temeljnega momenta v preizkusnem obdobju po stroških ni pozitiven, jo zamenja družina skupinskih nakupov notranjih oseb.</p>`,
    },
  },
};

export async function render(ctx) {
  const C = COPY[ctx.locale] ?? COPY.en;
  const { fmt } = ctx;
  const [meta, bt] = await Promise.all([ctx.data('meta'), ctx.data('backtest').catch(() => null)]);
  const last = meta.methodology[meta.methodology.length - 1];
  const persons = meta.persons ?? [];
  const approver = persons.find((p) => p.role === 'approver');
  const deputy = persons.find((p) => p.role === 'deputy_approver');
  const personName = (p) => (p ? `${p.name} (${ctx.L('fictional', 'izmišljeno')}), ${p.title?.[ctx.locale] ?? p.title?.en ?? ''}` : '–');
  const x = {
    model: meta.modelVersion,
    A: familyName('A', meta, ctx.locale),
    B: familyName('B', meta, ctx.locale),
    C: familyName('C', meta, ctx.locale),
    approver: `${personName(approver)}${deputy ? `; ${ctx.L('deputy', 'namestnica')} ${personName(deputy)}` : ''}`,
  };
  const er = meta.universe?.eligibleRule ?? { minPrice: 5, minMcap: 2e9, minAdv: 25e6 };

  const aiTable = table({ head: C.ai.head, rows: C.ai.rows(x), className: 'table--ai' });
  const gates = bt?.gates ?? [];
  const gateTable = table({
    head: C.validation.head,
    rows: gates.map((g) => [
      h('span', { class: 'mono' }, `(${g.id})`),
      g.label?.[ctx.locale] ?? g.label?.en ?? '',
      g.detail?.[ctx.locale] ?? g.detail?.en ?? '',
      h('span', { class: ['tag', g.pass ? 'is-pass' : 'is-fail'] }, g.pass ? C.validation.pass : C.validation.fail),
    ]),
    className: 'table--gates',
  });

  const sections = [
    { id: 'models', title: C.ai.title, short: C.ai.short, body: [...frag(C.ai.intro), aiTable], aside: C.ai.aside },
    {
      id: 'universe',
      title: C.universe.title,
      short: C.universe.short,
      body: C.universe.body({ minPrice: er.minPrice, minMcap: fmt.int(er.minMcap / 1e9), minAdv: fmt.int(er.minAdv / 1e6), today: fmt.int(meta.universe?.scoredToday ?? 0) }),
    },
    {
      id: 'validation',
      title: C.validation.title,
      short: C.validation.short,
      body: [
        ...frag(
          C.validation.body({
            variants: fmt.int(bt?.variantsTried ?? 0),
            dsr: bt ? fmt.num(bt.dsr, 2) : '–',
            pbo: bt ? fmt.num(bt.pbo, 2) : '–',
            hFrom: fmt.date(meta.holdout.from),
            hTo: fmt.date(meta.holdout.to),
          }),
        ),
        gateTable,
        h('p', {}, h('a', { class: 'arrow-link', href: '#/backtest' }, C.validation.backtest, h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'))),
      ],
      aside: C.validation.aside,
    },
    { id: 'controls', title: C.controls.title, short: C.controls.short, body: C.controls.body },
    { id: 'expectations', title: C.expect.title, short: C.expect.short, body: C.expect.body },
    { id: 'retirement', title: C.retire.title, short: C.retire.short, body: C.retire.body },
  ];

  const metaBlock = h(
    'div',
    { class: 'masthead__stack' },
    h('p', { class: 'label' }, C.version({ v: last.version, eff: fmt.date(last.effective), model: meta.modelVersion, frozen: fmt.date(meta.engineFrozen) })),
    h('p', {}, h('a', { class: 'arrow-link', href: '#/methodology/changelog' }, C.changelog, h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'))),
    toc(ctx, sections, C.toc),
  );

  const node = page(masthead({ kicker: C.kicker, title: C.h1, lede: C.lede, meta: metaBlock }), ...contentSections(sections));
  return { title: C.title, node };
}

function frag(htmlStr) {
  const t = document.createElement('template');
  t.innerHTML = htmlStr;
  return [...t.content.childNodes];
}
