// #pricing (brief §6): three tiers on three rules, honest expectations, the policies, availability, and the
// launch note (ui.js launchNote): before launch no paid tier is on sale, whatever the engine gate says.
// SL: first draft, needs native review.
import { h, setNumber } from '../dom.js';
import { href } from '../router.js';
import { masthead, contentSections, page } from './_content.js';
import { trackRecordLabel, launchNote } from '../ui.js';

const COPY = {
  en: {
    title: 'Pricing',
    kicker: 'What do I get?',
    h1: 'One price for everyone.',
    lede: 'Every paid tier gets the same issue at the same second; the paid tiers differ in how much data you get, never in when you get a pick. On the free Ledger tier an open pick stays sealed (number, time, hash) until it closes; its ticker is then revealed to everyone. Prices are in euros and include VAT.',
    billing: 'Billing',
    monthly: 'Monthly',
    annual: 'Annual',
    perMonth: 'a month',
    perYear: 'a year',
    annualNote: 'the price of 10 months',
    free: 'always free',
    tiers: [
      {
        id: 'ledger',
        name: 'Ledger',
        m: 0,
        y: 0,
        lead: 'For anyone who wants to check our work.',
        items: ['The public ledger: every record, hash-chained', 'The daily issue headline at 14:00', 'Open picks sealed (number, time, hash); tickers revealed at close', 'Methodology, backtest page and per-model scoreboard', 'The weekly Sunday email', 'No SMS'],
        cta: 'Open the ledger',
        href: href('ledger'),
      },
      {
        id: 'signal',
        name: 'Signal',
        m: 19,
        y: 190,
        lead: 'For investors who want the picks as they are issued.',
        items: ['Every BUY, CLOSE and RENEW at 14:00: SMS in SI, AT, DE, HR and IT, plus push and email', 'Full pick notes: thesis, colonnade chart, sensitivity, disclosures', 'The full record as CSV, open picks included (Copy on the ledger)', 'At most 16 texts a month; on many days, none'],
        cta: 'Join Signal',
        href: href('join', 'signal'),
      },
      {
        id: 'research',
        name: 'Research',
        m: 39,
        y: 390,
        lead: 'For people who want the data behind the picks.',
        items: ['Everything in Signal', 'The daily full-universe dataset: about 1,300 stocks with family percentiles, quorum status, vetoes and history', 'Screener, decile and IC dashboards, weekly factor report', 'CSV export for personal use (no redistribution)'],
        cta: 'Join Research',
        href: href('join', 'research'),
        note: 'Launch depends on counsel review. If daily per-stock scores count as recommendations, Research launches with families A–C as descriptive percentiles only.',
      },
    ],
    honestTitle: 'Honest expectations',
    honest: 'Expect picks to beat the benchmark 53–58% of the time. That is a real edge and it will still feel like losing about four times in ten. A sustained live rate above 60% is treated as a bug until proven otherwise.',
    record: (x) => `${x.label} so far: ${x.hit} of ${x.n} closed picks beat the benchmark (95% CI ${x.lo}–${x.hi}).`,
    recordLink: 'See every pick, including the losers',
    policies: {
      title: 'Policies',
      body: `<ul><li><strong>No trial.</strong> The free Ledger tier plays that role: everything we publish can be checked before you pay.</li><li><strong>14-day full refund</strong> on your first subscription, with the withdrawal button in your account.</li><li><strong>One-click cancellation.</strong> Access continues to the end of the period you paid for.</li><li><strong>A reminder 7 days before</strong> any annual renewal.</li><li><strong>No upsell emails</strong> in your first 30 days, and no marketing texts, ever.</li><li><strong>No seat caps, countdown timers or “limited” offers.</strong> One price for everyone.</li></ul>`,
      aside: `<p class="small muted">Prices include 22% Slovenian VAT; destination-country VAT applies once cross-border sales pass the EU threshold. Payments are processed by our payment provider; we never see your card.</p>`,
    },
    where: {
      title: 'Where it is available',
      body: `<p>For consumers in the EU and EEA. SMS alerts in <strong>Slovenia, Austria, Germany, Croatia and Italy</strong> at launch; everywhere else in the EU, the same picks arrive by push and email at the same second.</p><p><strong>Not available to residents of the US, UK or Australia</strong>, and Canada until reviewed. Your IP address, declared country, phone country and card country must agree.</p>`,
    },
    never: {
      title: 'What we will never sell',
      body: `<p>No personal advice, no “picks for you”, no portfolio import, no position sizing, no auto-trading or copy-trading, no private chat rooms with staff. We publish general research to the public; that is the whole product.</p>`,
    },
  },
  sl: {
    title: 'Cene',
    kicker: 'Kaj dobim?',
    h1: 'Ena cena za vse.',
    lede: 'Vsak plačljivi paket dobi isto izdajo v isti sekundi; plačljiva paketa se razlikujeta po količini podatkov, nikoli po tem, kdaj dobite izbiro. V brezplačnem paketu Ledger ostane odprta izbira zapečatena (številka, čas, zgoščena vrednost), dokler se ne zapre; takrat se njena oznaka razkrije vsem. Cene so v evrih in vključujejo DDV.',
    billing: 'Obračun',
    monthly: 'Mesečno',
    annual: 'Letno',
    perMonth: 'na mesec',
    perYear: 'na leto',
    annualNote: 'cena 10 mesecev',
    free: 'vedno brezplačno',
    tiers: [
      {
        id: 'ledger',
        name: 'Ledger',
        m: 0,
        y: 0,
        lead: 'Za vse, ki želijo preveriti naše delo.',
        items: ['Javna knjiga: vsak zapis, povezan z zgoščenimi vrednostmi', 'Naslov dnevne izdaje ob 14:00', 'Odprte izbire zapečatene (številka, čas, zgoščena vrednost); oznake razkrite ob zaprtju', 'Metodologija, stran s povratnim testom in preglednica modelov', 'Tedenska nedeljska e-pošta', 'Brez SMS'],
        cta: 'Odpri knjigo',
        href: href('ledger'),
      },
      {
        id: 'signal',
        name: 'Signal',
        m: 19,
        y: 190,
        lead: 'Za vlagatelje, ki želijo izbire ob izidu.',
        items: ['Vsak NAKUP, ZAPRTJE in PODALJŠANJE ob 14:00: SMS v SI, AT, DE, HR in IT ter potisna obvestila in e-pošta', 'Celotni zapiski izbir: teza, graf stebrov, občutljivost, razkritja', 'Celoten zapis v CSV, z odprtimi izbirami (Kopiraj v knjigi)', 'Največ 16 SMS na mesec; veliko dni nobenega'],
        cta: 'Naroči Signal',
        href: href('join', 'signal'),
      },
      {
        id: 'research',
        name: 'Research',
        m: 39,
        y: 390,
        lead: 'Za tiste, ki želijo podatke za izbirami.',
        items: ['Vse iz paketa Signal', 'Dnevni nabor podatkov celotnega univerzuma: približno 1.300 delnic s percentili družin, stanjem kvoruma, veti in zgodovino', 'Iskalnik, nadzorne plošče decilov in IC, tedensko poročilo o faktorjih', 'Izvoz CSV za osebno rabo (brez nadaljnje distribucije)'],
        cta: 'Naroči Research',
        href: href('join', 'research'),
        note: 'Začetek je odvisen od pravnega pregleda. Če dnevne ocene posameznih delnic štejejo za priporočila, Research začne samo z opisnimi percentili družin A–C.',
      },
    ],
    honestTitle: 'Iskrena pričakovanja',
    honest: 'Pričakujte, da bodo izbire merilo premagale v 53–58 % primerov. To je resnična prednost, pa bo še vedno delovala kot poraz približno štirikrat od desetih. Trajen delež nad 60 % obravnavamo kot napako, dokler se ne dokaže drugače.',
    record: (x) => `${x.label} doslej: ${x.hit} od ${x.n} zaprtih izbir je premagalo merilo (95 % IZ ${x.lo}–${x.hi}).`,
    recordLink: 'Oglejte si vse izbire, tudi neuspešne',
    policies: {
      title: 'Pravila',
      body: `<ul><li><strong>Brez preizkusnega obdobja.</strong> To vlogo ima brezplačni paket Ledger: vse, kar objavimo, lahko preverite, preden plačate.</li><li><strong>Celotno vračilo v 14 dneh</strong> za prvo naročnino, z gumbom za odstop v vašem računu.</li><li><strong>Odpoved z enim klikom.</strong> Dostop ostane do konca plačanega obdobja.</li><li><strong>Opomnik 7 dni pred</strong> vsako letno obnovitvijo.</li><li><strong>Brez prodajnih e-sporočil</strong> v prvih 30 dneh in nikoli trženjskih SMS.</li><li><strong>Brez omejitev mest, odštevalnikov ali »omejenih« ponudb.</strong> Ena cena za vse.</li></ul>`,
      aside: `<p class="small muted">Cene vključujejo 22 % slovenski DDV; DDV države prejemnika velja, ko čezmejna prodaja preseže prag EU. Plačila obdeluje naš ponudnik plačil; vaše kartice nikoli ne vidimo.</p>`,
    },
    where: {
      title: 'Kje je na voljo',
      body: `<p>Za potrošnike v EU in EGP. SMS obvestila ob zagonu v <strong>Sloveniji, Avstriji, Nemčiji, na Hrvaškem in v Italiji</strong>; drugod v EU iste izbire prispejo po potisnih obvestilih in e-pošti v isti sekundi.</p><p><strong>Ni na voljo prebivalcem ZDA, Združenega kraljestva ali Avstralije</strong>, Kanade pa do pregleda. Vaš naslov IP, navedena država, država telefona in države kartice se morajo ujemati.</p>`,
    },
    never: {
      title: 'Česa ne bomo nikoli prodajali',
      body: `<p>Brez osebnega svetovanja, brez »izbir za vas«, brez uvoza portfelja, brez določanja velikosti pozicij, brez samodejnega ali kopirnega trgovanja, brez zasebnih klepetalnic z zaposlenimi. Javnosti objavljamo splošne raziskave; to je ves izdelek.</p>`,
    },
  },
};

export async function render(ctx) {
  const C = COPY[ctx.locale] ?? COPY.en;
  const { fmt } = ctx;
  const [summary, launch] = await Promise.all([ctx.data('summary').catch(() => null), ctx.launch()]);
  let interval = 'm';
  const amountEls = [];
  const perEls = [];
  const price = (v) => fmt.eur(v);

  const toggleBtns = ['m', 'y'].map((k) =>
    h('button', { type: 'button', 'aria-pressed': String(k === interval), onclick: () => setInterval(k) }, k === 'm' ? C.monthly : C.annual),
  );
  function setInterval(k) {
    interval = k;
    toggleBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(['m', 'y'][i] === k)));
    C.tiers.forEach((tier, i) => {
      const v = k === 'm' ? tier.m : tier.y;
      setNumber(amountEls[i], price(v));
      perEls[i].textContent = tier.m === 0 ? C.free : k === 'm' ? C.perMonth : `${C.perYear} · ${C.annualNote}`;
    });
  }

  const tiers = C.tiers.map((tier, i) => {
    const amount = h('span', { class: 'tier__amount' }, price(tier.m));
    const per = h('span', { class: 'tier__per small muted' }, tier.m === 0 ? C.free : C.perMonth);
    amountEls.push(amount);
    perEls.push(per);
    return h(
      'article',
      { class: `tier c-b${i + 1}`, 'aria-labelledby': `pt-${tier.id}` },
      h('h2', { class: 'tier__name label', id: `pt-${tier.id}` }, tier.name),
      h('p', { class: 'tier__price' }, amount, per),
      h('div', { class: 'tier__body' }, h('p', { class: 'tier__lead' }, tier.lead), h('ul', { class: 'tier__items' }, tier.items.map((it) => h('li', {}, it)))),
      h('p', { class: 'small muted tier__note' }, tier.note ?? ''),
      h('a', { class: ['btn', i === 0 && 'btn--ghost', 'tier__cta'], href: tier.href }, tier.cta, h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')),
    );
  });

  const toggle = h('div', { class: 'billing' }, h('p', { class: 'label', id: 'billing-l' }, C.billing), h('div', { class: 'seg seg--light', role: 'group', 'aria-labelledby': 'billing-l' }, toggleBtns));

  const record = summary
    ? h(
        'p',
        { class: 'small' },
        C.record({ label: summary.label?.[ctx.locale] ?? summary.label?.en ?? (ctx.locale === 'sl' ? 'Zapečaten zapis' : 'Sealed record'), hit: fmt.pct0(summary.hitRate), n: fmt.int(summary.nClosed), lo: fmt.pct0(summary.hitCI[0]), hi: fmt.pct0(summary.hitCI[1]) }),
        ' ',
        h('a', { href: href('ledger') }, C.recordLink),
      )
    : null;
  // the brief §7 track-record label goes with the figure, on the page where people decide to pay
  const recordLabel = summary ? h('p', { class: 'small muted pricing-track' }, trackRecordLabel(ctx.locale)) : null;

  const node = page(
    masthead({ kicker: C.kicker, title: C.h1, lede: C.lede, meta: h('div', { class: 'pricing-meta' }, toggle, launchNote(launch, ctx.locale)) }),
    h('section', { class: 'grid pricing-tiers', 'aria-label': C.title }, ...tiers),
    h(
      'section',
      { class: 'grid honest-block', 'aria-labelledby': 'honest-h' },
      h('h2', { class: 'label c-head', id: 'honest-h' }, C.honestTitle),
      h('blockquote', { class: 'c-body honest-quote serif' }, C.honest),
      h('div', { class: 'c-meta pricing-record' }, record, recordLabel),
    ),
    ...contentSections([
      { id: 'policies', title: C.policies.title, body: C.policies.body, aside: C.policies.aside },
      { id: 'where', title: C.where.title, body: C.where.body },
      { id: 'never', title: C.never.title, body: C.never.body },
    ]),
  );
  return { title: C.title, node };
}
