// Home (#, empty hash): The Assembly (hero), the Silence Calendar, how a pick happens, the sealed ledger with in-browser
// verification and the headline statistics, the scoreboard teaser, the pricing teaser.
import { h, announce, setNumber, digits, playDigits, prefersReducedMotion } from '../dom.js';
import { href } from '../router.js';
import { createAssembly } from '../hero/assembly.js';
import { silenceCalendar } from '../charts/silence-calendar.js';
import { hashChip, timestamp, statStrip, trackRecordLabel, sectionHead, familyName, familyDef, launchNote } from '../ui.js';
import { ruleLabels } from '../rule.js';
import { issueCounts } from './_records.js';
import { axisTicks, HIT_DOMAIN } from '../charts/scoreboard.js';
import { quorumExample } from '../charts/quorum-example.js';
import { lowerTheBar } from '../charts/lower-the-bar.js';
import { launchCopy } from '../launch.js';

const T = {
  en: {
    title: 'We only text when the models agree',
    cal: {
      kicker: 'The daily issue',
      title: 'Most days: no new pick.',
      lede: (x) => `An issue is published at 14:00 Ljubljana time on every US trading day, pick or not. Since the sealed record began on ${x.since}: ${x.issues} issues, ${x.q} with a new pick or a renewal.`,
      more: (x) =>
        `${x.metAll ? 'On every issue at least one stock met the rule' : `On ${x.met} issues at least one stock met the rule`}; on the days without a new pick, those stocks were already open picks, capped or cooling down. ${x.pre ? x.texts : `Texts went out on ${x.texted} days; on the other ${x.silent}, nobody’s phone moved.`}`,
      legend: (pre) => ['No new pick', 'New pick or renewal', pre ? 'Exit, text due' : 'Exit texted'],
      readout: 'Selected issue',
      how: 'Arrow keys move through the issues; Enter opens one.',
      caption: (x) => `Every issue from ${x.from} to ${x.to}. Each cell links to that day’s issue.`,
      browse: 'Browse every issue in the ledger',
      head: (x) => `${x.issues} issues. ${x.q} picks.`,
    },
    how: {
      kicker: 'How a pick happens',
      title: 'Four columns. One lintel.',
      lede: 'Each family ranks every stock on its own evidence. A pick needs three of them to agree, no veto to fire, and a named person who may only say no. Then it is sealed before anyone sees it.',
      steps: [
        {
          time: '06:00',
          title: 'Four independent families score every stock.',
          body: 'About 1,300 liquid US stocks: price above $5, market value above $2B, daily trading above $25M. Each family ranks all of them from 0 to 100.',
        },
        {
          time: '06:00',
          title: 'Three of four must put it in their {top}.',
          body: 'That is the quorum. Two agreeing families is not enough, however high they rank it. Conviction is only ever shown as 3/4 or 4/4.',
        },
        {
          time: '11:30',
          title: 'Five vetoes can still stop it.',
          body: 'Heavily shorted (top days-to-cover decile), unusually volatile on its own (top idiosyncratic-volatility decile), earnings within three trading days, a pending merger or split, or material negative news in the last 48 hours.',
        },
        {
          time: '12:00',
          title: 'A named approver may remove a pick. Never add one.',
          body: 'Every removal is logged with a reason and counted in public. No approver, no pick.',
        },
        {
          time: '13:45',
          title: 'Sealed.',
          body: 'The record is written as canonical JSON, hashed with SHA-256 and chained to the previous record. The ticker stays hidden behind a commitment hash until the pick closes.',
        },
        {
          time: '14:00',
          title: 'The issue is published. Every trading day.',
          body: 'With a pick or without one. An issue without a new pick says so, how many stocks were scored, and what held back the ones that met the rule: picks already open, the caps or a cooldown.',
        },
        {
          time: '14:00',
          title: 'A text goes out only for BUY, CLOSE or RENEW.',
          body: 'One message, one segment, the same second for every subscriber once SMS alerts launch. No prices, no urgency, and a stop link in every one.',
        },
        {
          time: '15:30',
          title: 'Scored from the US open, 90 minutes later.',
          body: 'Entry is the next regular-session open, a price a subscriber could actually get. The exit is fixed at entry: the open 21 trading days later. No stop-losses, no price targets.',
        },
      ],
      vetoAside: (v) => `Sealed record so far: ${v.rule} rule vetoes, ${v.llm} news vetoes, ${v.human} human removals, ${v.capped} capped.`,
      sealAside: 'The latest commitment in the chain',
      smsAside: ['BUY', 'CLOSE', 'RENEW', 'No quorum: no text'],
      scoreAside: (n, no, latest) => `${n} scored in ${latest ? 'the latest issue, ' : 'issue '}#${no}`,
      exampleLabel: 'Example: our latest closed pick',
      link: 'Read how it works',
      linkM: 'Methodology',
    },
    ledger: {
      kicker: 'The sealed ledger',
      title: 'Every record, chained.',
      lede: 'Anyone can recompute every hash. A record cannot change without breaking every link after it, and each day’s records are anchored to a public timestamp.',
      verify: 'Verify in your browser',
      verifying: (n, m) => `Checking ${n} of ${m} records…`,
      ok: (x) => `Verified ${x.n} records in ${x.ms} ms with WebCrypto. The chain is intact.`,
      bad: (x) => `Chain broken at record #${x.seq}: ${x.reason}.`,
      noCrypto: 'This browser context has no WebCrypto (it needs HTTPS). Download the CSV from the ledger and check it offline.',
      noModule: 'The verifier did not load. Try again in a moment.',
      prev: 'prev',
      anchor: { confirmed: 'Anchored', pending: 'Anchor pending' },
      types: { ISSUE: 'Issue', BUY: 'Buy, sealed', RENEW: 'Renew, sealed', CLOSE: 'Close, revealed', METHODOLOGY: 'Methodology', CORRECTION: 'Correction' },
      head: ['Record', 'Type', 'Time', 'Hash, previous'],
      statsTitle: 'Headline statistics',
      statsNote: 'In the fixed order we always use. Median before mean; the worst pick is always shown.',
      open: 'Open the full ledger',
      caption: 'The six newest records. Open picks show only their commitment hash until they close.',
      line: (x) => `#${x.seq} · ${x.type} #${x.no} · ${x.hash} ✓`,
      done: (x) => `${x.n}/${x.n} recommendations match.`,
    },
    score: {
      kicker: 'Does the gate work?',
      title: 'Is agreement worth waiting for?',
      lede: 'The 2/4 shadow set is every stock exactly two families liked: published after close as the control. If quorum picks do not beat it, the gate adds nothing.',
      verdict: (x) =>
        `On the holdout the gate ${x.fail ? 'failed' : 'passed'} its test (quorum ${x.hq} a pick against ${x.h2} for the 2/4 set), and in the sealed record the two are ${x.level ? 'level' : x.ahead ? 'apart, quorum ahead' : 'apart, quorum behind'} (${x.sq} against ${x.s2} beating the benchmark).`,
      answer: (x) => (x.mixed ? 'So far, mixed.' : x.fail ? 'So far, it does not.' : 'So far, it does.'),
      gateLink: 'The gate test (b)',
      axis: 'Share of picks that beat the benchmark over 21 trading days',
      coin: 'coin flip',
      rows: { '4/4': 'Four of four', '3/4': 'Three of four', '2/4 shadow': 'Two of four (shadow, not picks)' },
      n: (n) => `n = ${n}`,
      caption: 'Dots: hit rate in the sealed record. Lines: 95% confidence intervals. Small samples give wide intervals; we show them anyway.',
      link: 'The full scoreboard',
    },
    price: {
      kicker: 'What do I get?',
      title: 'One price for everyone.',
      lede: 'The paid tiers differ in data breadth, never in pick timing: every subscriber gets the same text in the same second. On the free tier open picks stay sealed until they close.',
      honest: 'Expect picks to beat the benchmark 53–58% of the time. A sustained live rate above 60% is treated as a bug until proven otherwise.',
      tiers: [
        { name: 'Ledger', price: '€0', per: 'always free', items: ['The public ledger and the daily issue', 'Closed picks revealed; open picks sealed', 'Per-model scoreboard and methodology', 'Weekly Sunday email'], cta: 'Open the ledger', href: href('ledger') },
        { name: 'Signal', price: '€19', per: 'a month · €190 a year', items: ['Every BUY, CLOSE and RENEW at 14:00 by SMS, push and email', 'Full pick notes: thesis, colonnade chart, sensitivity', 'Full ledger CSV'], cta: 'Join Signal', href: href('join', 'signal') },
        { name: 'Research', price: '€39', per: 'a month · €390 a year', items: ['Everything in Signal', 'The daily full-universe dataset: about 1,300 stocks', 'Screener, decile and IC dashboards, weekly factor report'], cta: 'Join Research', href: href('join', 'research'), note: 'Launch depends on counsel review.' },
      ],
      policies: 'No trial · 14-day refund · one-click cancellation · prices include VAT',
      link: 'Pricing and policies',
    },
  },
  sl: {
    title: 'SMS pošljemo samo, ko se modeli strinjajo',
    cal: {
      kicker: 'Dnevna izdaja',
      title: 'Večino dni: brez nove izbire.',
      lede: (x) => `Izdaja izide ob 14:00 po ljubljanskem času vsak dan trgovanja v ZDA, z izbiro ali brez nje. Od začetka zapečatenega zapisa ${x.since}: ${x.issues} izdaj, ${x.q} z novo izbiro ali podaljšanjem.`,
      more: (x) =>
        `${x.metAll ? 'V vsaki izdaji je vsaj ena delnica izpolnila pravilo' : `V ${x.met} izdajah je vsaj ena delnica izpolnila pravilo`}; na dneve brez nove izbire so bile te delnice že odprte izbire, omejene ali v premoru. ${x.pre ? x.texts : `SMS je šel ven ${x.texted} dni; ostalih ${x.silent} se ni zganil noben telefon.`}`,
      legend: (pre) => ['Brez nove izbire', 'Nova izbira ali podaljšanje', pre ? 'Izstop, predviden SMS' : 'Poslan izstop'],
      readout: 'Izbrana izdaja',
      how: 'S puščicami se premikate med izdajami; Enter jo odpre.',
      caption: (x) => `Vse izdaje od ${x.from} do ${x.to}. Vsaka celica vodi do izdaje tistega dne.`,
      browse: 'Vse izdaje v knjigi',
      head: (x) => `${x.issues} izdaj. ${x.q} izbir.`,
    },
    how: {
      kicker: 'Kako nastane izbira',
      title: 'Štirje stebri. Ena preklada.',
      lede: 'Vsaka družina rangira vse delnice na podlagi svojih dokazov. Izbira potrebuje soglasje treh, noben veto se ne sme sprožiti, imenovana oseba pa lahko reče samo ne. Nato se zapečati, preden jo kdor koli vidi.',
      steps: [
        { time: '06:00', title: 'Štiri neodvisne družine ocenijo vsako delnico.', body: 'Približno 1.300 likvidnih ameriških delnic: cena nad 5 $, tržna vrednost nad 2 mrd $, dnevni promet nad 25 mio $. Vsaka družina jih rangira od 0 do 100.' },
        { time: '06:00', title: 'Tri od štirih jo morajo uvrstiti med {top}.', body: 'To je kvorum. Dve družini nista dovolj, ne glede na to, kako visoko jo uvrstita. Prepričanje prikažemo samo kot 3/4 ali 4/4.' },
        { time: '11:30', title: 'Pet vetov jo lahko še ustavi.', body: 'Močno kratko prodana (zgornji decil dni pokritja), nenavadno volatilna sama po sebi (zgornji decil idiosinkratske volatilnosti), rezultati v treh trgovalnih dneh, napovedana združitev ali razdelitev ali pomembna negativna novica v zadnjih 48 urah.' },
        { time: '12:00', title: 'Imenovana odobriteljica lahko izbiro odstrani. Nikoli doda.', body: 'Vsaka odstranitev je zabeležena z razlogom in javno šteta. Brez odobritelja ni izbire.' },
        { time: '13:45', title: 'Zapečateno.', body: 'Zapis je kanoničen JSON, zgoščen s SHA-256 in povezan s prejšnjim zapisom. Oznaka ostane skrita za zgoščeno zavezo, dokler se izbira ne zapre.' },
        { time: '14:00', title: 'Izdaja izide. Vsak dan trgovanja.', body: 'Z izbiro ali brez. Izdaja brez nove izbire to pove, koliko delnic je bilo ocenjenih in kaj je zadržalo tiste, ki so izpolnile pravilo: že odprte izbire, omejitve ali premor.' },
        { time: '14:00', title: 'SMS gre ven samo za NAKUP, ZAPRTJE ali PODALJŠANJE.', body: 'Eno sporočilo, en segment, ista sekunda za vse naročnike. Brez cen, brez pritiska in s povezavo za odjavo v vsakem.' },
        { time: '15:30', title: 'Merjeno od odprtja ameriškega trga, 90 minut pozneje.', body: 'Vstop je naslednje redno odprtje, cena, ki jo naročnik dejansko lahko dobi. Izstop je določen ob vstopu: odprtje 21 trgovalnih dni pozneje. Brez stop-loss naročil in ciljnih cen.' },
      ],
      vetoAside: (v) => `Zapečaten zapis doslej: ${v.rule} vetov pravil, ${v.llm} vetov novic, ${v.human} človeških odstranitev, ${v.capped} omejenih.`,
      sealAside: 'Zadnja zaveza v verigi',
      smsAside: ['NAKUP', 'ZAPRTJE', 'PODALJŠANJE', 'Brez kvoruma: brez SMS'],
      scoreAside: (n, no, latest) => `${n} ocenjenih v ${latest ? 'zadnji izdaji, ' : 'izdaji '}#${no}`,
      exampleLabel: 'Primer: naša zadnja zaprta izbira',
      link: 'Kako deluje',
      linkM: 'Metodologija',
    },
    ledger: {
      kicker: 'Zapečatena knjiga',
      title: 'Vsak zapis, v verigi.',
      lede: 'Vsako zgoščeno vrednost lahko kdor koli ponovno izračuna. Zapisa ni mogoče spremeniti, ne da bi se pretrgale vse povezave za njim, zapisi vsakega dne pa so zasidrani v javnem časovnem žigu.',
      verify: 'Preveri v brskalniku',
      verifying: (n, m) => `Preverjam ${n} od ${m} zapisov…`,
      ok: (x) => `Preverjenih ${x.n} zapisov v ${x.ms} ms z WebCrypto. Veriga je nepoškodovana.`,
      bad: (x) => `Veriga je pretrgana pri zapisu #${x.seq}: ${x.reason}.`,
      noCrypto: 'Ta brskalnik tu nima WebCrypto (potreben je HTTPS). Iz knjige prenesite CSV in ga preverite brez povezave.',
      noModule: 'Preverjalnik se ni naložil. Poskusite znova čez trenutek.',
      prev: 'prej',
      anchor: { confirmed: 'Zasidrano', pending: 'Sidranje v teku' },
      types: { ISSUE: 'Izdaja', BUY: 'Nakup, zapečaten', RENEW: 'Podaljšanje, zapečateno', CLOSE: 'Zaprtje, razkrito', METHODOLOGY: 'Metodologija', CORRECTION: 'Popravek' },
      head: ['Zapis', 'Vrsta', 'Čas', 'Zgoščena vrednost, prejšnja'],
      statsTitle: 'Ključni podatki',
      statsNote: 'V stalnem vrstnem redu. Mediana pred povprečjem; najslabša izbira je vedno prikazana.',
      open: 'Odpri celotno knjigo',
      caption: 'Šest najnovejših zapisov. Odprte izbire kažejo samo zgoščeno zavezo, dokler se ne zaprejo.',
      line: (x) => `#${x.seq} · ${x.type} #${x.no} · ${x.hash} ✓`,
      done: (x) => `${x.n}/${x.n} priporočil se ujema.`,
    },
    score: {
      kicker: 'Ali pravilo deluje?',
      title: 'Se soglasje splača počakati?',
      lede: 'Senčni niz 2/4 so vse delnice, ki sta jih izbrali natanko dve družini: objavimo ga po zaprtju kot kontrolo. Če izbire s kvorumom ne premagajo tega niza, pravilo ne doda ničesar.',
      verdict: (x) =>
        `Na preizkusnem obdobju pravilo preizkusa ${x.fail ? 'ni prestalo' : 'je prestalo'} (kvorum ${x.hq} na izbiro proti ${x.h2} za niz 2/4), v zapečatenem zapisu pa sta ${x.level ? 'izenačena' : x.ahead ? 'narazen, kvorum spredaj' : 'narazen, kvorum zadaj'} (${x.sq} proti ${x.s2} nad merilom).`,
      answer: (x) => (x.mixed ? 'Doslej mešano.' : x.fail ? 'Doslej ne.' : 'Doslej da.'),
      gateLink: 'Preizkus pravila (b)',
      axis: 'Delež izbir, ki so v 21 trgovalnih dneh premagale merilo',
      coin: 'met kovanca',
      rows: { '4/4': 'Štiri od štirih', '3/4': 'Tri od štirih', '2/4 shadow': 'Dve od štirih (senčni niz, ne izbire)' },
      n: (n) => `n = ${n}`,
      caption: 'Pike: delež uspešnih v zapečatenem zapisu. Črte: 95-odstotni intervali zaupanja. Majhni vzorci dajo široke intervale; vseeno jih pokažemo.',
      link: 'Celotna preglednica modelov',
    },
    price: {
      kicker: 'Kaj dobim?',
      title: 'Ena cena za vse.',
      lede: 'Plačljiva paketa se razlikujeta po obsegu podatkov, nikoli po času izbir: vsak naročnik prejme isti SMS v isti sekundi. V brezplačnem paketu ostanejo odprte izbire zapečatene do zaprtja.',
      honest: 'Pričakujte, da bodo izbire premagale merilo v 53–58 % primerov. Trajen delež nad 60 % obravnavamo kot napako, dokler se ne dokaže drugače.',
      tiers: [
        { name: 'Ledger', price: '0 €', per: 'vedno brezplačno', items: ['Javna knjiga in dnevna izdaja', 'Zaprte izbire razkrite, odprte zapečatene', 'Preglednica modelov in metodologija', 'Tedenska nedeljska e-pošta'], cta: 'Odpri knjigo', href: href('ledger') },
        { name: 'Signal', price: '19 €', per: 'na mesec · 190 € na leto', items: ['Vsak NAKUP, ZAPRTJE in PODALJŠANJE ob 14:00 po SMS, potisnih obvestilih in e-pošti', 'Celotni zapiski izbir: teza, graf stebrov, občutljivost', 'Celotna knjiga v CSV'], cta: 'Naroči Signal', href: href('join', 'signal') },
        { name: 'Research', price: '39 €', per: 'na mesec · 390 € na leto', items: ['Vse iz paketa Signal', 'Dnevni nabor podatkov celotnega univerzuma: približno 1.300 delnic', 'Iskalnik, nadzorne plošče decilov in IC, tedensko poročilo o faktorjih'], cta: 'Naroči Research', href: href('join', 'research'), note: 'Začetek je odvisen od pravnega pregleda.' },
      ],
      policies: 'Brez preizkusa · vračilo v 14 dneh · odpoved z enim klikom · cene vključujejo DDV',
      link: 'Cene in pravila',
    },
  },
};

export async function render(ctx) {
  const C = T[ctx.locale] ?? T.en;
  const [hero, meta, launch, issues] = await Promise.all([ctx.data('hero'), ctx.data('meta').catch(() => null), ctx.launch(), ctx.data('issues').catch(() => null)]);
  // ---- hero (WP-B): The Assembly, docs/DESIGN-V2.md §4.1 ----
  const level = createAssembly(ctx, hero, { meta, prelaunch: launch.prelaunch });
  const ltb = hero?.p ? lowerTheBar(hero, { meta, locale: ctx.locale, fmt: ctx.fmt }) : null;
  const how = howSection(ctx, C.how, hero, meta, issues);
  const node = h(
    'div',
    { class: 'home' },
    level.node,
    calendarSection(ctx, C.cal, launch, issues, ltb),
    how.node,
    ledgerSection(ctx, C.ledger, meta),
    scoreSection(ctx, C.score),
    priceSection(ctx, C.price, launch),
  );
  return {
    title: C.title,
    node,
    top: 'chamber',
    afterMount: () => {
      level.mount();
      ltb?.mount();
      how.mount();
    },
    cleanup: () => {
      level.destroy();
      ltb?.destroy();
      how.destroy();
    },
  };
}

// ---- 01 Silence Calendar ------------------------------------------------------------------------------
function calendarSection(ctx, C, launch, issues, ltb) {
  const { fmt, L } = ctx;
  const figure = h('div', { class: 'sc-figure c-wide flush' });
  const readout = h('p', { class: 'sc-readout mono', 'aria-hidden': 'true' });
  const lede = h('p', { class: 'lede c-body' });
  const more = h('p', { class: 'sc-more' });
  const caption = h('p', { class: 'figcaption c-body' });
  const legend = h(
    'ul',
    { class: 'sc-legend c-wide' },
    C.legend(launch.prelaunch).map((text, i) => h('li', {}, h('span', { class: `sc-key sc-${['n', 'q', 'x'][i]}`, 'aria-hidden': 'true' }), text)),
  );
  // §1 Silence (DESIGN-V2 §5): the headline is the record in two numbers, computed from issues.json.
  const list = Array.isArray(issues) ? issues : [];
  const q = list.filter((r) => r.quorum).length;
  const title = list.length ? C.head({ issues: fmt.int(list.length), q: fmt.int(q) }) : C.title;
  const section = h(
    'section',
    { class: 'section grid home-cal', 'aria-labelledby': 'h-cal' },
    ...sectionHead({ index: '01', kicker: `${C.kicker} · ${C.title}`, title, id: 'h-cal' }),
    lede,
    h('div', { class: 'c-meta sc-side' }, more),
    // the key stands over the calendar, so every mark is explained on the screen that shows it
    legend,
    figure,
    caption,
    h('div', { class: 'c-meta sc-meta' }, h('p', { class: 'label' }, C.readout), readout, h('p', { class: 'small muted' }, C.how)),
    h('p', { class: 'c-body' }, h('a', { class: 'arrow-link', href: href('ledger') }, C.browse, h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'))),
    ltb ? ltb.el : null,
  );
  if (!list.length) {
    lede.textContent = ctx.t('error.data.body', { file: 'issues.json' });
    return section;
  }
  const texted = list.filter((r) => r.buys?.length || r.renews?.length || r.closes?.length).length;
  const met = list.filter((r) => issueCounts(r).quorumMet).length;
  const lx = { since: fmt.date(list[0].date), issues: fmt.int(list.length), q: fmt.int(q), met: fmt.int(met), metAll: met === list.length, texted: fmt.int(texted), silent: fmt.int(list.length - texted), pre: launch.prelaunch, texts: launchCopy(launch, ctx.locale).homeTexts(fmt.int(texted)) };
  // two sentences at lede size under the headline; the rest at body size in bay 3, beside it
  lede.textContent = C.lede(lx);
  more.textContent = C.more(lx);
  caption.textContent = C.caption({ from: fmt.date(list[0].date), to: fmt.date(list[list.length - 1].date) });
  const cal = silenceCalendar(list, {
    fmt,
    L,
    locale: ctx.locale,
    onReadout: (c) => {
      readout.textContent = c.text;
      readout.dataset.kind = c.row.quorum ? 'q' : 'n';
    },
  });
  cal.el.setAttribute('aria-label', `${title} ${C.how}`);
  figure.replaceChildren(cal.el);
  return section;
}

// ---- 02 How a pick happens: a timeline on rule 1; the families on all four rules ---------------------
function howSection(ctx, C, hero, meta, issues) {
  const { fmt } = ctx;
  const R = ruleLabels(meta, ctx.locale);

  const famRow = h(
    'ol',
    { class: 'how-fams c-full flush' },
    ['A', 'B', 'C', 'D'].map((f) =>
      h(
        'li',
        { class: 'how-fam' },
        h('span', { class: 'how-fam__id', 'aria-hidden': 'true' }, f),
        h('span', { class: 'how-fam__name' }, h('span', { class: 'visually-hidden' }, `${f}: `), familyName(f, meta, ctx.locale)),
        h('span', { class: 'how-fam__def' }, familyDef(f, meta, ctx.locale)),
      ),
    ),
  );

  // the quorum example: columns at the four rules, the lintel at the rule threshold (meta.rule.topPct)
  const quorumFig = quorumExample(hero, { meta, locale: ctx.locale, label: C.exampleLabel });

  const vetoAside = h('p', { class: 'small muted' });
  const sealAside = h('div', { class: 'how-aside' });
  // the count of the latest issue in issues.json (hero.json is an older issue: the latest closed pick's)
  const lastIssue = Array.isArray(issues) && issues.length ? issues[issues.length - 1] : null;
  const scoreAside = h(
    'p',
    { class: 'small muted' },
    lastIssue ? C.scoreAside(fmt.int(lastIssue.nScored), lastIssue.issueNo, true) : C.scoreAside(fmt.int(hero.nScored), hero.issueNo, false),
  );

  const asides = [
    scoreAside,
    null,
    vetoAside,
    null,
    sealAside,
    null,
    h('ul', { class: 'how-sms' }, C.smsAside.map((s, i) => h('li', { class: i < 3 ? 'tag' : 'how-sms__none' }, s))),
    null,
  ];

  const items = C.steps.map((s, i) =>
    h(
      'li',
      { class: 'how-step grid reveal', dataset: { time: s.time } },
      h('span', { class: 'how-step__time c-margin' }, h('time', {}, s.time)),
      h('span', { class: 'how-step__tick', 'aria-hidden': 'true' }),
      h('div', { class: 'how-step__body c-body' }, h('h3', { class: 'how-step__title' }, s.title.replace('{top}', R.top)), h('p', {}, s.body)),
      asides[i] ? h('div', { class: 'how-step__aside c-meta' }, asides[i]) : null,
      i === 0 ? famRow : null,
      i === 1 ? quorumFig : null,
    ),
  );
  // §2 The day (DESIGN-V2 §5): a sticky Martian clock in the margin steps from 06:00 to 14:00 as the
  // timetable rows pass (the rows keep their own times for assistive tech and narrow screens).
  const clockTime = h('time', { class: 'fig-xl' }, C.steps[0].time);
  const clock = h('div', { class: 'how-rail', 'aria-hidden': 'true' }, h('div', { class: 'day-clock' }, clockTime, h('span', { class: 'label' }, 'CEST')));
  const steps = h('ol', { class: 'how-steps c-full flush' }, clock, items);
  // the clock shows the time of the last row whose top has passed the middle of the viewport
  let raf = 0;
  const tick = () => {
    raf = 0;
    const mid = window.innerHeight * 0.5;
    let t = C.steps[0].time;
    for (const li of items) {
      if (li.getBoundingClientRect().top > mid) break;
      t = li.dataset.time;
    }
    setNumber(clockTime, t);
  };
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };
  const mount = () => {
    window.addEventListener('scroll', onScroll, { passive: true });
    tick();
  };
  const destroy = () => {
    window.removeEventListener('scroll', onScroll);
    cancelAnimationFrame(raf);
  };

  Promise.all([ctx.data('summary'), ctx.data('ledger')])
    .then(([summary, ledger]) => {
      vetoAside.textContent = C.vetoAside(summary.vetoes);
      const lastBuy = [...ledger.entries].reverse().find((e) => e.type === 'BUY' || e.type === 'RENEW');
      if (lastBuy) {
        sealAside.replaceChildren(
          h('p', { class: 'label' }, C.sealAside),
          h('p', {}, hashChip(lastBuy.body.commit, { t: ctx.t }), ' ', timestamp([{ at: lastBuy.at, kind: 'sealed' }], { t: ctx.t })),
        );
      }
    })
    .catch(() => {});

  const node = h(
    'section',
    { class: 'section grid home-how', 'aria-labelledby': 'h-how' },
    ...sectionHead({ index: '02', kicker: C.kicker, title: C.title, id: 'h-how' }),
    h('p', { class: 'lede c-body' }, C.lede),
    steps,
    h(
      'p',
      { class: 'c-body how-links' },
      h('a', { class: 'arrow-link', href: href('how-it-works') }, C.link, h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')),
      h('a', { class: 'arrow-link', href: href('methodology') }, C.linkM, h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')),
    ),
  );
  return { node, mount, destroy };
}

// ---- 03 Ledger preview on Chamber, with in-browser verification and the headline statistics --------
function ledgerSection(ctx, C, meta) {
  const { fmt, L } = ctx;
  const chain = h('ol', { class: 'chain c-full flush', 'aria-label': C.caption });
  const status = h('p', { class: 'verify__status', role: 'status', 'aria-live': 'polite' });
  const btn = h('button', { type: 'button', class: 'btn verify__btn' }, C.verify);
  const stats = h('div', { class: 'c-wide ledger-stats' });
  const statsLabel = h('p', { class: 'label c-wide' });
  const track = h('p', { class: 'figcaption c-body' }, trackRecordLabel(ctx.locale));
  let entries = null;

  btn.addEventListener('click', async () => {
    if (!entries) return;
    if (!globalThis.crypto?.subtle) {
      status.textContent = C.noCrypto;
      return;
    }
    btn.disabled = true;
    status.dataset.state = 'run';
    status.textContent = C.verifying(0, fmt.int(entries.length));
    let mod;
    try {
      mod = await import('../core/ledger.js');
    } catch {
      status.textContent = C.noModule;
      btn.disabled = false;
      return;
    }
    const t0 = performance.now();
    const res = await mod.verifyChain(entries);
    const ms = Math.round(performance.now() - t0);
    // §3 (DESIGN-V2 §5): the check prints one line per recommendation (BUY and RENEW records), 30 ms apart,
    // then the count. Every line is the record's own hash, recomputed in this tab; a broken chain stops the
    // print at the first bad record and says so.
    const recs = entries.filter((e) => e.type === 'BUY' || e.type === 'RENEW');
    const okRecs = res.ok ? recs : recs.filter((e) => e.seq < res.firstBad);
    printer.replaceChildren();
    printer.hidden = false;
    const fast = prefersReducedMotion();
    for (let i = 0; i < okRecs.length; i++) {
      const e = okRecs[i];
      printer.append(h('li', {}, C.line({ seq: e.seq, type: e.type, no: e.body.no, hash: e.hash.slice(0, 8) })));
      printer.scrollTop = printer.scrollHeight;
      if (!fast && i < okRecs.length - 1) await new Promise((r) => setTimeout(r, 30));
      if (!printer.isConnected) return;
    }
    btn.disabled = false;
    status.dataset.state = res.ok ? 'ok' : 'bad';
    status.textContent = res.ok ? `${C.ok({ n: fmt.int(res.checked), ms: fmt.int(ms) })} ${C.done({ n: fmt.int(recs.length), all: fmt.int(res.checked), ms: fmt.int(ms) })}` : C.bad({ seq: res.firstBad, reason: res.reason });
    announce(status.textContent);
  });
  const printer = h('ol', { class: 'verify__print mono', 'aria-hidden': 'true', hidden: true });

  const section = h(
    'section',
    { class: 'section grid chamber ruled home-ledger', 'aria-labelledby': 'h-ledger' },
    ...sectionHead({ index: '03', kicker: C.kicker, title: C.title, id: 'h-ledger' }),
    h('p', { class: 'lede c-body' }, C.lede),
    h('div', { class: 'c-meta verify' }, btn, printer, status),
    chain,
    h('p', { class: 'figcaption c-body' }, C.caption),
    h('h3', { class: 'd4 c-head ledger-stats__title' }, C.statsTitle),
    statsLabel,
    stats,
    h('p', { class: 'figcaption c-body' }, C.statsNote),
    track,
    h('p', { class: 'c-body' }, h('a', { class: 'arrow-link', href: href('ledger') }, C.open, h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'))),
  );

  Promise.all([ctx.data('ledger'), ctx.data('summary')])
    .then(([ledger, summary]) => {
      entries = ledger.entries;
      const anchors = new Map((ledger.anchors ?? []).map((a) => [a.date, a]));
      const latest = entries.slice(-6).reverse();
      chain.replaceChildren(
        ...latest.map((e) => {
          const a = anchors.get(e.issueDate);
          const typeLabel = C.types[e.type] ?? e.type;
          const detail =
            e.type === 'ISSUE'
              ? `#${e.body.issueNo} · ${L(`${fmt.int(e.body.nScored)} scored`, `${fmt.int(e.body.nScored)} ocenjenih`)} · ${e.body.buys?.length ? L('quorum', 'kvorum') : L('no quorum', 'brez kvoruma')}`
              : e.type === 'BUY' || e.type === 'RENEW'
                ? `#${e.body.no} · ${ctx.t('common.sealed')} · ${e.body.agreement}/4`
                : e.type === 'CLOSE'
                  ? `#${e.body.no} · ${e.body.reveal?.ticker ?? ''}`
                  : e.body?.version
                    ? `v${e.body.version}`
                    : '';
          return h(
            'li',
            { class: 'chain__row grid' },
            h('span', { class: 'chain__seq c-margin mono' }, `#${e.seq}`),
            h('div', { class: 'chain__type c-b1' }, h('span', { class: ['chain__kind', (e.type === 'BUY' || e.type === 'RENEW') && 'is-quorum'] }, typeLabel), h('span', { class: 'chain__detail small' }, detail)),
            h('div', { class: 'chain__time c-b2' }, h('span', { class: 'mono chain__date' }, fmt.date(e.issueDate)), ' ', timestamp([{ at: e.at, kind: e.type === 'ISSUE' ? 'published' : 'sealed' }], { t: ctx.t })),
            h('div', { class: 'chain__hash c-b3' }, hashChip(e.hash, { t: ctx.t }), h('span', { class: 'chain__prev mono' }, `${C.prev} ${e.prevHash.slice(0, 8)}`)),
            h('div', { class: 'chain__anchor c-r4' }, h('span', { class: ['tag', a?.ots === 'confirmed' && 'is-ok'] }, a ? C.anchor[a.ots] ?? a.ots : '')),
          );
        }),
      );
      statsLabel.textContent = summary.label?.[ctx.locale] ?? summary.label?.en ?? '';
      stats.replaceChildren(statStrip(summary, { t: ctx.t, fmt, locale: ctx.locale, counts: meta?.counts }));
    })
    .catch(() => {
      chain.replaceChildren(h('li', { class: 'lede' }, ctx.t('error.data.body', { file: 'ledger.json' })));
    });

  return section;
}

// ---- 04 Scoreboard teaser: hit rate with 95% CI; 50% sits on rule 3 --------------------------------
function scoreSection(ctx, C) {
  const { fmt } = ctx;
  const plot = h('div', { class: 'sb c-full flush' });
  // the answer so far, computed: holdout gate (b) and the sealed record's hit rates side by side
  const verdict = h('p', { class: 'c-body home-score__verdict' });
  const answer = h('p', { class: 'voice verdict home-score__answer' });
  const section = h(
    'section',
    { class: 'section grid home-score', 'aria-labelledby': 'h-score' },
    ...sectionHead({ index: '04', kicker: C.kicker, title: C.title, id: 'h-score' }),
    h('p', { class: 'lede c-body' }, C.lede),
    answer,
    verdict,
    plot,
    h('p', { class: 'figcaption c-body' }, C.caption),
    h('p', { class: 'c-body' }, h('a', { class: 'arrow-link', href: href('ledger', null, 'scoreboard') }, C.link, h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'))),
  );
  Promise.all([ctx.data('scoreboard'), ctx.data('backtest').catch(() => null), ctx.data('summary').catch(() => null)])
    .then(([sb, bt, summary]) => {
      const gate = bt?.gates?.find((g) => g.id === 'b');
      const two = sb.agreement.find((a) => a.k === '2/4 shadow')?.sealed;
      const qHit = summary?.hitRate;
      if (gate?.values && two && Number.isFinite(qHit)) {
        const diff = qHit - two.hit;
        const level = Math.abs(diff) < 0.02;
        answer.textContent = C.answer({ fail: !gate.pass, mixed: level || gate.pass !== diff > 0 });
        verdict.replaceChildren(
          C.verdict({
            fail: !gate.pass,
            level,
            ahead: diff > 0,
            // the holdout test and the sealed record point the same way, or the headline says "mixed"
            mixed: level || gate.pass !== diff > 0,
            hq: fmt.pct(gate.values.quorum, { sign: true, digits: 2 }),
            h2: fmt.pct(gate.values.twoOfFour, { sign: true, digits: 2 }),
            sq: fmt.pct(qHit),
            s2: fmt.pct(two.hit),
          }),
          ' ',
          h('a', { class: 'nowrap', href: href('backtest', null, 'gates') }, `${C.gateLink} →`),
        );
      }
      // domain 10%..90% across rules 2..4, so 50% (a coin flip) is rule 3
      const X = (v) => ((Math.min(0.9, Math.max(0.1, v)) - 0.1) / 0.8) * 100;
      const rows = sb.agreement.map((a) => {
        const s = a.sealed;
        const quorum = a.k !== '2/4 shadow';
        const ci = s.hitCI ?? [s.hit, s.hit];
        const track = h(
          'div',
          { class: 'sb__track', 'aria-hidden': 'true' },
          h('span', { class: 'sb__ci' }),
          h('span', { class: ['sb__dot', quorum ? 'is-quorum' : 'is-shadow'] }),
        );
        track.style.setProperty('--lo', `${X(ci[0])}%`);
        track.style.setProperty('--hi', `${X(ci[1])}%`);
        track.style.setProperty('--v', `${X(s.hit)}%`);
        return h(
          'div',
          { class: 'sb__row', role: 'row' },
          h('span', { class: 'sb__k', role: 'rowheader' }, h('b', {}, a.k.replace(' shadow', '')), h('span', { class: 'small muted' }, C.rows[a.k] ?? a.k)),
          track,
          h(
            'span',
            { class: 'sb__v', role: 'cell' },
            h('b', { class: 'mono' }, fmt.pct0(s.hit)),
            h('span', { class: 'muted' }, `${ctx.t('common.ci')} ${fmt.pct0(ci[0])}–${fmt.pct0(ci[1])}`),
            h('span', { class: 'muted' }, C.n(fmt.int(s.n))),
          ),
        );
      });
      const ticks = axisTicks([0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], HIT_DOMAIN, { tickLabel: (v) => fmt.pct0(v), coin: C.coin });
      plot.replaceChildren(
        h('div', { class: 'sb__grid', role: 'table', 'aria-label': C.axis }, rows),
        h('div', { class: 'sb__axis', 'aria-hidden': 'true' }, h('span', { class: 'sb__axislabel label' }, C.axis), h('div', { class: 'sb__ticks' }, ticks)),
      );
    })
    .catch(() => {});
  return section;
}

// ---- 05 Pricing teaser: three tiers on three rules -----------------------------------------------------
function priceSection(ctx, C, launch) {
  // §5 (DESIGN-V2 §5): the three plinths on bays 1–3, none highlighted, no ultramarine; the launch note in bay 4.
  const tiers = C.tiers.map((tier, i) =>
    h(
      'article',
      { class: 'pl reveal', 'aria-labelledby': `tier-${i}` },
      h('h3', { class: 'label pl__name', id: `tier-${i}` }, tier.name),
      h('p', { class: 'fig-xl pl__price' }, digits(tier.price)),
      h('p', { class: 'pl__per' }, tier.per),
      h('ul', { class: 'pl__items' }, tier.items.map((it) => h('li', {}, it))),
      h(
        'div',
        { class: 'pl__cta' },
        tier.note ? h('p', { class: 'small muted pl__note' }, tier.note) : null,
        h('a', { class: ['btn', i === 0 && 'btn--ghost'], href: tier.href }, tier.cta, h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')),
      ),
    ),
  );
  const row = h('div', { class: 'pl-row' }, ...tiers, h('div', { class: 'pl-note' }, launchNote(launch, ctx.locale)));
  if ('IntersectionObserver' in window && !prefersReducedMotion()) {
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        playDigits(row);
        io.disconnect();
      }
    });
    io.observe(row);
  }
  return h(
    'section',
    { class: 'section grid home-price', 'aria-labelledby': 'h-price' },
    ...sectionHead({ index: '05', kicker: C.kicker, title: C.title, id: 'h-price' }),
    h('p', { class: 'lede c-body' }, C.lede),
    h('p', { class: 'c-meta honest' }, C.honest),
    row,
    h('p', { class: 'c-body small muted' }, C.policies),
    h('p', { class: 'c-body' }, h('a', { class: 'arrow-link', href: href('pricing') }, C.link, h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'))),
  );
}
