// #how-it-works: the families, the quorum rule (with a real quorum, drawn), the vetoes (with the sealed
// record's funnel from issues.json), the daily cadence as a timetable on rule 1, why many days are silent.
// SL copy: first draft, needs native review.
import { h } from '../dom.js';
import { href } from '../router.js';
import { ruleLabels } from '../rule.js';
import { masthead, contentSections, toc, page, table } from './_content.js';
import { familyName, familyDef } from '../ui.js';
import { quorumExample } from '../charts/quorum-example.js';
import { issueCounts } from './_records.js';
import { lowerTheBar } from '../charts/lower-the-bar.js';

const COPY = {
  en: {
    title: 'How it works',
    kicker: 'How does a pick happen?',
    h1: 'Four families. Three must agree.',
    lede: 'Every US trading day we score about 1,300 liquid US stocks with four independent model families. A stock meets the rule only when at least three of them put it {inTop} and no veto fires; the caps and cooldowns then decide whether it becomes a new pick. Every issue says which, pick or not.',
    toc: 'On this page',
    families: {
      title: 'Four independent families',
      short: 'Families',
      intro: 'Each family looks at different evidence and is built, validated and scored on its own. They are deliberately partly independent: two families that always agree would add picks without adding precision.',
      rows: {
        A: 'Stocks that have outperformed their industry and the market over the past year, skipping the last month, scaled by their volatility. Suspended by the crash switch in rebounds after a bear market, when momentum historically breaks.',
        B: 'Earnings surprises keyed to the date the filing became public, and the year-on-year change in gross profitability. Expected to be the weakest family; if its holdout record is not positive after costs, it is replaced.',
        C: 'Profitable, cash-generative companies at reasonable prices: gross profits to assets, EV/EBIT, free-cash-flow yield and intangibles-adjusted book-to-market.',
        D: 'A gradient-boosted tree ranker trained to order stocks by their 21-day return relative to their sector. It is retrained once a year on data before its cutoff, never after.',
      },
      head: ['Family', 'What it measures'],
      aside: 'Rank correlations between the families are published every month on the ledger. If the ML ranker correlates above 0.5 with another family in validation, it is retrained without that family’s inputs.',
    },
    rule: {
      title: 'The quorum rule',
      short: 'Quorum',
      body: `<p>A stock becomes a candidate when <strong>at least three of the four families rank it {inTop}</strong> ({pctile} or higher) on the issue date. Conviction is only ever shown as <strong>3/4</strong> or <strong>4/4</strong>. There is no other score and no probability.</p>
<p>Then the caps apply, in this order:</p>
<ul><li>At most <strong>2 new picks per issue</strong>, ranked by the average percentile across the families.</li><li>At most <strong>8 new picks per calendar month</strong>.</li><li>At most <strong>3 open picks per sector</strong>.</li><li>No re-issue of a stock within <strong>10 trading days</strong> of its close, except as a RENEW.</li></ul>
<p>When the crash switch suspends the trend family, the rule becomes all three of the remaining three. It is still displayed as 3/4, with the suspension noted on the pick.</p>`,
      aside: 'Thresholds were tuned on the research window to average 3–6 picks a month, then frozen. Any change is a new methodology version with a public changelog entry.',
    },
    vetoes: {
      title: 'Five vetoes',
      short: 'Vetoes',
      body: `<p>A candidate that passes the quorum is still dropped if any of these fires:</p>
<ol><li><strong>Heavily shorted:</strong> in the top decile of days-to-cover. Heavily shorted stocks tend to underperform over about 20 days.</li><li><strong>Unusually volatile on its own:</strong> in the top decile of idiosyncratic volatility.</li><li><strong>Earnings imminent:</strong> results due within the next 3 trading days.</li><li><strong>Corporate action pending:</strong> a merger, acquisition or split.</li><li><strong>Material negative news:</strong> news or filings in the last 48 hours flagged by a language model that only screens; it never picks. In this demo a deterministic stand-in plays that role.</li></ol>
<p>After the vetoes, a named approver reviews the candidates. The approver can remove a pick with a logged reason, and can never add or substitute one. With no approver and no deputy available, the candidate is logged “unissued (no approver)”.</p>`,
    },
    cadence: {
      title: 'The daily cadence',
      short: 'Cadence',
      intro: 'Every time below is Ljubljana time. The issue publishes on a calendar; texts go out only on conviction.',
      head: ['Time', 'Step'],
      rows: [
        ['22:15', 'The previous US session’s prices arrive; open picks are marked to market.'],
        ['06:00', 'The four families score every eligible stock. Rule vetoes and the quorum check run.'],
        ['11:30', 'The 48-hour news veto scan; the theses are drafted and checked number by number.'],
        ['12:00–13:40', 'The named approver reviews. Remove only.'],
        ['13:45', 'Seal: canonical JSON, SHA-256, chained to the previous record. The commitment hash is public.'],
        ['14:00:00', 'The issue is published on the web, with a pick or without. Texts go out only for BUY, CLOSE or RENEW.'],
        ['15:30', 'The US open (14:30 in the weeks when EU and US clocks change on different dates). This price is the entry.'],
        ['Day 21', 'At the 14:00 slot the pick is renewed if it still meets the rule, otherwise closed. Either one sends a text. Exit is the open that day.'],
        ['Sunday 18:00', 'The weekly Ledger email: open picks, closes and statistics. No SMS.'],
      ],
    },
    silence: {
      title: 'Why many days are silent',
      short: 'Silence',
      body: (x) =>
        `<p>Three families agreeing is not rare: ${x.metAll ? 'on every issue in the sealed record' : `on ${x.met} of ${x.n} issues`} at least one stock met the rule, three or four families and no veto. What keeps most days quiet is what comes after the rule: a stock already open is not issued again (it can only be renewed on day 21), a closed one waits 10 trading days, and the caps allow at most 2 new picks an issue, 8 a month and 3 open per sector, within 16 texts a month. In the sealed record <strong>${x.q} of ${x.n} issues</strong> carried a new pick or a renewal, and a text was due on ${x.texted}. On the other days the issue said “No new pick today” and what held the candidates back.</p><p>We think that silence is the product. A service that texts every day is either lowering its bar or selling activity. Ours texts only for a BUY, a RENEW or a CLOSE, and the rule is published.</p>`,
      head: ['Closest agreement on the day', 'Issues'],
    },
    measure: {
      title: 'How results are measured',
      short: 'Measurement',
      body: `<ul><li><strong>Entry</strong> at the US regular-session open on the issue day, 90 minutes after the text: a price a subscriber could actually get.</li><li><strong>Exit</strong> at the open 21 trading days later. No stop-losses and no discretionary exits.</li><li><strong>Costs</strong> of 10 bps each way for companies above $10B and 25 bps for $2–10B.</li><li><strong>Benchmark:</strong> the S&amp;P 500 total return (simulated here) and the sector.</li><li>The <strong>alert gap</strong>, the difference between the price at dissemination and the entry open, is published for every pick.</li><li>Results in USD and EUR. Annualised figures appear only for complete 12-month periods.</li></ul>`,
      aside: 'Everything here is a hypothetical paper portfolio in a simulated market. No account achieved these results.',
    },
    sms: {
      title: 'What a text looks like',
      short: 'The text',
      body: `<p>Every text is plain GSM-7, one segment, the same second for every subscriber. It carries the pick number, the action and ticker, the time with its zone, the entry and exit rule, the model agreement, “Not personal advice”, a link to the pick page with the full disclosures, and your own stop link. It never carries a price, a target or an urgent word.</p>`,
      example: 'QUORUM #0417 BUY ACME 28.09.26 14:00 CEST. Entry: US open 28.09. Exit: US open 27.10. 3/4 models. Not personal advice: qrm.si/p/0417 Stop: qrm.si/u/7Kq2xZ4m',
      exampleLabel: 'Template, with the placeholder ticker ACME. 156 of 160 characters.',
    },
    next: 'Read the methodology',
  },
  sl: {
    title: 'Kako deluje',
    kicker: 'Kako nastane izbira?',
    h1: 'Štiri družine. Tri se morajo strinjati.',
    lede: 'Vsak dan trgovanja v ZDA s štirimi neodvisnimi družinami modelov ocenimo približno 1.300 likvidnih ameriških delnic. Delnica izpolni pravilo samo, ko jo vsaj tri uvrstijo {inTop} in se ne sproži noben veto; omejitve in premori nato odločijo, ali postane nova izbira. Vsaka izdaja to pove, z izbiro ali brez.',
    toc: 'Na tej strani',
    families: {
      title: 'Štiri neodvisne družine',
      short: 'Družine',
      intro: 'Vsaka družina gleda drugačne dokaze in je zgrajena, preverjena in ocenjena sama zase. Namenoma so delno neodvisne: dve družini, ki se vedno strinjata, bi dodali izbire, ne pa natančnosti.',
      rows: {
        A: 'Delnice, ki so v zadnjem letu (brez zadnjega meseca) prehitele svojo panogo in trg, prilagojeno njihovi volatilnosti. Stikalo za zlom jo izklopi v odbojih po medvedjem trgu, ko moment zgodovinsko odpove.',
        B: 'Presenečenja pri dobičku, vezana na datum javne objave poročila, in medletna sprememba bruto donosnosti. Pričakujemo, da bo najšibkejša družina; če njen rezultat v preizkusnem obdobju po stroških ni pozitiven, jo zamenjamo.',
        C: 'Dobičkonosna podjetja z dobrim denarnim tokom po razumni ceni: bruto dobiček na sredstva, EV/EBIT, donos prostega denarnega toka in knjigovodska vrednost, prilagojena za neopredmetena sredstva.',
        D: 'Rangirnik z gradientno ojačanimi drevesi, naučen razvrščati delnice po 21-dnevnem donosu glede na sektor. Enkrat letno ga ponovno naučimo na podatkih pred mejnim datumom, nikoli po njem.',
      },
      head: ['Družina', 'Kaj meri'],
      aside: 'Korelacije rangov med družinami vsak mesec objavimo v knjigi. Če rangirnik ML v validaciji korelira z drugo družino nad 0,5, ga naučimo brez vhodov te družine.',
    },
    rule: {
      title: 'Pravilo kvoruma',
      short: 'Kvorum',
      body: `<p>Delnica postane kandidatka, ko jo <strong>vsaj tri od štirih družin na dan izdaje uvrstijo {inTop}</strong> ({pctile} ali več). Prepričanje prikažemo samo kot <strong>3/4</strong> ali <strong>4/4</strong>. Drugih ocen in verjetnosti ni.</p>
<p>Nato veljajo omejitve, v tem vrstnem redu:</p>
<ul><li>Največ <strong>2 novi izbiri na izdajo</strong>, razvrščeni po povprečnem percentilu družin.</li><li>Največ <strong>8 novih izbir na koledarski mesec</strong>.</li><li>Največ <strong>3 odprte izbire na sektor</strong>.</li><li>Iste delnice ne izdamo znova v <strong>10 trgovalnih dneh</strong> po zaprtju, razen kot PODALJŠANJE.</li></ul>
<p>Ko stikalo za zlom izklopi družino trenda, pravilo zahteva vse tri preostale. Še vedno je prikazano kot 3/4, izklop pa je označen pri izbiri.</p>`,
      aside: 'Pragove smo v raziskovalnem obdobju nastavili na povprečno 3–6 izbir na mesec in jih nato zamrznili. Vsaka sprememba je nova različica metodologije z javnim zapisom v dnevniku sprememb.',
    },
    vetoes: {
      title: 'Pet vetov',
      short: 'Veti',
      body: `<p>Kandidatko, ki izpolni kvorum, vseeno izločimo, če se sproži kateri od teh vetov:</p>
<ol><li><strong>Močno kratko prodana:</strong> v zgornjem decilu dni pokritja. Takšne delnice v približno 20 dneh praviloma zaostajajo.</li><li><strong>Nenavadno volatilna sama po sebi:</strong> v zgornjem decilu idiosinkratske volatilnosti.</li><li><strong>Bližnji rezultati:</strong> poročilo v naslednjih 3 trgovalnih dneh.</li><li><strong>Napovedano korporativno dejanje:</strong> združitev, prevzem ali razdelitev delnic.</li><li><strong>Pomembna negativna novica:</strong> novice ali poročila v zadnjih 48 urah, ki jih označi jezikovni model, ki samo pregleduje; nikoli ne izbira. V tem demu to vlogo opravlja determinističen nadomestek.</li></ol>
<p>Po vetih kandidatke pregleda imenovana odobriteljica. Izbiro lahko odstrani z zabeleženim razlogom, nikoli pa je ne more dodati ali zamenjati. Če ni na voljo ne odobritelja ne namestnika, je kandidatka zabeležena kot »neizdana (ni odobritelja)«.</p>`,
    },
    cadence: {
      title: 'Dnevni ritem',
      short: 'Ritem',
      intro: 'Vsi časi so po ljubljanskem času. Izdaja izhaja po koledarju; SMS gre ven samo ob prepričanju.',
      head: ['Čas', 'Korak'],
      rows: [
        ['22:15', 'Prispejo cene prejšnje ameriške seje; odprte izbire se ovrednotijo po trgu.'],
        ['06:00', 'Štiri družine ocenijo vse primerne delnice. Tečejo veti pravil in preverjanje kvoruma.'],
        ['11:30', 'Pregled novic za 48-urni veto; osnutki tez se pripravijo in preverijo število za številom.'],
        ['12:00–13:40', 'Pregled imenovane odobriteljice. Samo odstranitev.'],
        ['13:45', 'Pečat: kanonični JSON, SHA-256, povezan s prejšnjim zapisom. Zgoščena zaveza je javna.'],
        ['14:00:00', 'Izdaja izide na spletu, z izbiro ali brez. SMS gre ven samo za NAKUP, ZAPRTJE ali PODALJŠANJE.'],
        ['15:30', 'Odprtje ameriškega trga (14:30 v tednih, ko EU in ZDA premikata uro na različna dneva). Ta cena je vstop.'],
        ['21. dan', 'Ob izdaji ob 14:00 se izbira podaljša, če še izpolnjuje pravilo, sicer se zapre. Oboje pošljemo po SMS. Izstop je odprtje tistega dne.'],
        ['Nedelja 18:00', 'Tedenska e-pošta Ledger: odprte izbire, zaprtja in statistika. Brez SMS.'],
      ],
    },
    silence: {
      title: 'Zakaj je veliko dni tiho',
      short: 'Tišina',
      body: (x) =>
        `<p>Soglasje treh družin ni redko: ${x.metAll ? 'v vsaki izdaji zapečatenega zapisa' : `v ${x.met} od ${x.n} izdaj`} je vsaj ena delnica izpolnila pravilo, tri ali štiri družine in brez veta. Večino dni utiša tisto, kar pride po pravilu: že odprte delnice ne izdamo znova (lahko jo le podaljšamo 21. dan), zaprta počaka 10 trgovalnih dni, omejitve pa dopuščajo največ 2 novi izbiri na izdajo, 8 na mesec in 3 odprte na sektor, v okviru 16 SMS na mesec. V zapečatenem zapisu je <strong>${x.q} od ${x.n} izdaj</strong> prineslo novo izbiro ali podaljšanje, SMS pa je bil predviden ${x.texted} dni. Ob drugih dneh je izdaja sporočila »Danes brez nove izbire« in kaj je zadržalo kandidatke.</p><p>Menimo, da je ta tišina izdelek. Storitev, ki pošilja SMS vsak dan, bodisi znižuje merila bodisi prodaja aktivnost. Naša pošlje SMS samo za NAKUP, PODALJŠANJE ali ZAPRTJE, pravilo pa je javno.</p>`,
      head: ['Največje soglasje tistega dne', 'Izdaje'],
    },
    measure: {
      title: 'Kako merimo rezultate',
      short: 'Merjenje',
      body: `<ul><li><strong>Vstop</strong> ob rednem odprtju ameriškega trga na dan izdaje, 90 minut po SMS: cena, ki jo naročnik dejansko lahko dobi.</li><li><strong>Izstop</strong> ob odprtju 21 trgovalnih dni pozneje. Brez stop-loss naročil in brez diskrecijskih izstopov.</li><li><strong>Stroški</strong> 10 b.t. v vsako smer za podjetja nad 10 mrd $ in 25 b.t. za 2–10 mrd $.</li><li><strong>Merilo:</strong> skupni donos S&amp;P 500 (tu simuliran) in sektor.</li><li><strong>Razlika ob obvestilu</strong>, razlika med ceno ob objavi in vstopno ceno, je objavljena za vsako izbiro.</li><li>Rezultati v USD in EUR. Letni podatki samo za zaključena 12-mesečna obdobja.</li></ul>`,
      aside: 'Vse tukaj je hipotetični papirni portfelj na simuliranem trgu. Noben račun ni dosegel teh rezultatov.',
    },
    sms: {
      title: 'Kako je videti SMS',
      short: 'SMS',
      body: `<p>Vsak SMS je navaden GSM-7, en segment, ista sekunda za vse naročnike. Vsebuje številko izbire, dejanje in oznako, čas s časovnim pasom, pravilo vstopa in izstopa, soglasje modelov, »Ni osebni nasvet«, povezavo do strani izbire s celotnimi razkritji in vašo povezavo za odjavo. Nikoli ne vsebuje cene, cilja ali nujne besede.</p>`,
      example: 'QUORUM #0417 NAKUP ACME 28.09.26 14:00 CEST. Vstop: odprtje ZDA 28.9. Izstop: 27.10. 3/4 modelov. Ni osebni nasvet: qrm.si/p/0417 Odjava: qrm.si/u/7Kq2xZ4m',
      exampleLabel: 'Predloga z nadomestno oznako ACME. 155 od 160 znakov.',
    },
    next: 'Preberite metodologijo',
  },
};

export async function render(ctx) {
  const C = COPY[ctx.locale] ?? COPY.en;
  const { L, fmt } = { L: (en, sl) => (ctx.locale === 'sl' ? sl : en), fmt: ctx.fmt };
  const [meta, issues, hero] = await Promise.all([ctx.data('meta').catch(() => null), ctx.data('issues').catch(() => []), ctx.data('hero').catch(() => null)]);
  const q = issues.filter((r) => r.quorum).length;
  const met = issues.filter((r) => issueCounts(r).quorumMet).length;
  const texted = issues.filter((r) => r.buys?.length || r.renews?.length || r.closes?.length).length;
  // The rule threshold is data (meta.rule.topPct), never copy.
  const R = ruleLabels(meta, ctx.locale);
  const fill = (str) => str.replace(/\{inTop\}/g, R.inTop).replace(/\{pctile\}/g, R.pctile);
  const dist = [4, 3, 2, 1, 0].map((k) => [k, issues.filter((r) => r.closest === k).length]).filter(([, n]) => n > 0);

  // "Lower the bar" (DESIGN-V2 §4.8): the silence explained by letting the reader break it
  const ltb = hero?.p ? lowerTheBar(hero, { meta, locale: ctx.locale, fmt }) : null;
  if (ltb) ltb.el.classList.add('how-ltb');

  const famTable = table({
    head: C.families.head,
    rows: ['A', 'B', 'C', 'D'].map((f) => [
      h('span', { class: 'fam-cell' }, h('b', { class: 'fam-cell__id' }, f), h('span', {}, familyName(f, meta, ctx.locale))),
      h('span', {}, h('span', { class: 'fam-cell__def' }, familyDef(f, meta, ctx.locale)), h('br'), C.families.rows[f]),
    ]),
    className: 'table--fams',
  });

  const sections = [
    { id: 'families', title: C.families.title, short: C.families.short, body: [h('p', {}, C.families.intro), famTable], aside: `<p class="small muted">${C.families.aside}</p>` },
    {
      id: 'quorum',
      title: C.rule.title,
      short: C.rule.short,
      body: fill(C.rule.body),
      aside: `<p class="small muted">${C.rule.aside}</p>`,
      figure: hero?.pick ? quorumExample(hero, { meta, locale: ctx.locale, label: L('A real quorum: our latest closed pick', 'Pravi kvorum: naša zadnja zaprta izbira') }) : null,
    },
    { id: 'vetoes', title: C.vetoes.title, short: C.vetoes.short, body: C.vetoes.body, figure: issues.length ? vetoFunnel(ctx, issues) : null },
    {
      id: 'cadence',
      title: C.cadence.title,
      short: C.cadence.short,
      body: [h('p', {}, C.cadence.intro)],
      figure: timetable(C.cadence),
    },
    {
      id: 'silence',
      title: C.silence.title,
      short: C.silence.short,
      body: C.silence.body({ q: fmt.int(q), n: fmt.int(issues.length), met: fmt.int(met), metAll: issues.length > 0 && met === issues.length, texted: fmt.int(texted) }),
      aside: dist.length
        ? table({ head: C.silence.head, rows: dist.map(([k, n]) => [h('span', { class: 'mono' }, `${k}/4`), fmt.int(n)]), numCols: [1], className: 'table--compact' })
        : null,
      wide: ltb?.el ?? null,
    },
    { id: 'measurement', title: C.measure.title, short: C.measure.short, body: C.measure.body, aside: `<p class="small muted">${C.measure.aside}</p>` },
    {
      id: 'text',
      title: C.sms.title,
      short: C.sms.short,
      body: [h('div', {}, ...toParas(C.sms.body)), h('figure', { class: 'figure' }, h('p', { class: 'sms-plain' }, C.sms.example), h('figcaption', { class: 'figcaption' }, C.sms.exampleLabel))],
    },
  ];

  const node = page(
    masthead({ kicker: C.kicker, title: C.h1, lede: fill(C.lede), meta: toc(ctx, sections, C.toc) }),
    ...contentSections(sections),
    h('div', { class: 'grid page-next' }, h('p', { class: 'c-body' }, h('a', { class: 'arrow-link', href: href('methodology') }, C.next, h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')))),
  );
  return { title: C.title, node, afterMount: ltb ? () => ltb.mount() : undefined, cleanup: ltb ? () => ltb.destroy() : undefined };
}

// The daily cadence as a timetable on rule 1 (the home page's how-step rows): times in the margin, a tick
// on the rule, the step beside it.
function timetable(C) {
  return h(
    'ol',
    { class: 'how-steps hw-times c-full flush', 'aria-label': C.title },
    C.rows.map(([time, text]) =>
      h(
        'li',
        { class: 'how-step grid' },
        h('span', { class: 'how-step__time c-margin' }, h('time', {}, time)),
        h('span', { class: 'how-step__tick', 'aria-hidden': 'true' }),
        h('div', { class: 'how-step__body c-body' }, h('p', { class: 'hw-times__text' }, text)),
      ),
    ),
  );
}

// The sealed record as a funnel, from the counts every issue publishes (issues.json; _records.js
// issueCounts): stock-days scored, stocks at 3/4 or 4/4, the vetoes, those that met the rule, what held
// them back, and the new picks. Bars are Graphite and hollow; only the last row (the picks) is a quorum mark.
function vetoFunnel(ctx, issues) {
  const { fmt } = ctx;
  const L = (en, sl) => (ctx.locale === 'sl' ? sl : en);
  const sum = (f) => issues.reduce((a, r) => a + f(r), 0);
  const k = issues.map((r) => issueCounts(r));
  const tot = (key) => k.reduce((a, c) => a + (c[key] ?? 0), 0);
  const rows = [
    { label: L('Stock-days scored', 'Ocenjenih delnic po dnevih'), n: sum((r) => r.nScored ?? 0), bar: false },
    { label: L('At 3/4 or 4/4 before the vetoes', 'S 3/4 ali 4/4 pred veti'), n: tot('reached') + tot('rule') + tot('llm') },
    { label: L('Stopped by a rule veto', 'Ustavil veto pravila'), n: tot('rule'), minus: true },
    { label: L('Stopped by the news veto (stand-in)', 'Ustavil veto novic (nadomestek)'), n: tot('llm'), minus: true },
    { label: L('Met the rule, no veto', 'Izpolnilo pravilo, brez veta'), n: tot('reached') },
    { label: L('Already an open pick (renewals come from these)', 'Že odprta izbira (od tod podaljšanja)'), n: tot('held'), minus: true },
    { label: L('Capped or cooling down', 'Omejenih ali v premoru'), n: tot('capped'), minus: true },
    { label: L('Removed by the approver, or no approver', 'Odstranila odobriteljica ali ni odobritelja'), n: tot('human') + tot('unissued'), minus: true },
    { label: L('New picks (BUY)', 'Nove izbire (NAKUP)'), n: tot('buys'), quorum: true },
  ];
  const max = Math.max(1, ...rows.filter((r) => r.bar !== false).map((r) => r.n));
  const from = issues[0]?.date;
  const to = issues.at(-1)?.date;
  return h(
    'figure',
    { class: 'hw-funnel' },
    h(
      'ol',
      { class: 'hw-funnel__list' },
      rows.map((r) => {
        const bar = h('span', { class: ['hw-funnel__bar', r.minus && 'is-minus', r.quorum && 'is-quorum'] });
        bar.style.setProperty('--w', `${r.bar === false || !r.n ? 0 : Math.max(0.4, (r.n / max) * 100)}%`);
        return h(
          'li',
          { class: 'hw-funnel__row' },
          h('span', { class: 'hw-funnel__k' }, r.minus ? `− ${r.label}` : r.label),
          h('span', { class: 'hw-funnel__track', 'aria-hidden': 'true' }, r.bar === false ? null : bar),
          h('span', { class: 'hw-funnel__v mono' }, fmt.int(r.n)),
        );
      }),
    ),
    h(
      'figcaption',
      { class: 'figcaption' },
      L(
        `Every issue of the sealed record, ${fmt.date(from)} to ${fmt.date(to)} (${fmt.int(issues.length)} issues), summed. Renewals (${fmt.int(tot('renews'))}) are open picks that still met the rule on day 21. An open pick that carries a veto on a given day is left out of that day’s counts.`,
        `Vse izdaje zapečatenega zapisa, ${fmt.date(from)} do ${fmt.date(to)} (${fmt.int(issues.length)} izdaj), sešteto. Podaljšanja (${fmt.int(tot('renews'))}) so odprte izbire, ki so 21. dan še izpolnjevale pravilo. Odprta izbira, ki ima na neki dan veto, v štetju tistega dne ni zajeta.`,
      ),
    ),
  );
}

function toParas(htmlStr) {
  const t = document.createElement('template');
  t.innerHTML = htmlStr;
  return [...t.content.childNodes];
}
