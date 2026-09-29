// #disclosures: generated from the ledger (brief §2.8, §2.9, §7). The MAR 12-month list of every
// recommendation, the quarterly rating distribution (100% BUY, said plainly), conflicts and the
// trading policy, the responsible persons (fictional), methodology versions and the disclosed amendment.
// Sections are deep-linkable: #disclosures~list · ~ratings · ~conflicts · ~persons · ~methodology.
//
// SL: first draft, needs native review and counsel review.
import { h } from '../dom.js';
import { href } from '../router.js';
import { masthead, contentSections, toc } from './_content.js';
import { timestamp, quorumBadge, signed } from '../ui.js';
import { ruleLabels } from '../rule.js';
import { indexPicks, isSealedFor, twelveMonths, ratingDistribution, resultOf } from './_records.js';
import { formatInZone, LJUBLJANA } from '../core/calendar.js';

export async function render(ctx) {
  const { L, fmt, locale } = ctx;
  const [picks, meta, backtest] = await Promise.all([ctx.data('picks'), ctx.data('meta').catch(() => null), ctx.data('backtest').catch(() => null)]);
  const R = ruleLabels(meta, locale);
  const byNo = indexPicks(picks);
  const asOf = meta?.asOf ?? picks.at(-1)?.issueDate;
  const list = twelveMonths(picks, asOf);
  const dist = ratingDistribution(picks);
  const total = dist.reduce((a, r) => a + r.total, 0);

  // ---- 01 the 12-month list -------------------------------------------------------------------------------
  const rows = list.map((p) => {
    const sealed = isSealedFor(p, ctx.tier, byNo);
    const res = resultOf(p);
    const z = formatInZone(new Date(p.disseminatedAt), LJUBLJANA);
    // explicit roles keep the table a table when phones lay each row out as a card
    const td = (label, cls, content) => h('td', { role: 'cell', class: cls, dataset: { label } }, content);
    return h(
      'tr',
      { role: 'row', class: 'dc-row' },
      h('th', { scope: 'row', role: 'rowheader', class: 'dc-c-no' }, h('a', { class: 'mono', href: href('pick', p.no) }, `#${p.no}`)),
      td(L('Disseminated', 'Objavljeno'), 'num dc-c-at', timestamp([{ at: p.disseminatedAt, kind: 'disseminated' }, { at: p.producedAt, kind: 'produced' }], { t: ctx.t, display: `${fmt.date(z.date)} ${z.time.slice(0, 5)}` })),
      td(L('Rating', 'Ocena'), 'dc-c-rating', p.kind === 'RENEW' ? L('BUY (renewed)', 'NAKUP (podaljšan)') : L('BUY', 'NAKUP')),
      td(L('Stock', 'Delnica'), 'dc-c-stock', sealed ? h('span', { class: 'tag' }, ctx.t('common.sealed')) : h('span', {}, h('a', { class: 'ticker', href: href('stock', p.ticker) }, p.ticker), h('span', { class: 'small muted ds-name' }, ` ${p.name}`))),
      td(L('Models', 'Modeli'), 'num dc-c-models', quorumBadge(p.agreement, { t: ctx.t })),
      td(L('Exit', 'Izstop'), 'num dc-c-exit', fmt.date(p.exit?.date ?? p.exitPlanned)),
      td(L('Excess', 'Presežek'), 'num dc-c-excess', sealed || !res ? '–' : h('span', { class: res.final ? '' : 'lg-mtm' }, signed(res.excess, { fmt }))),
    );
  });
  const listBody = [
    h(
      'p',
      {},
      L(
        `Every recommendation we disseminated in the twelve months to ${fmt.date(asOf)}: ${fmt.int(list.length)}, generated from the sealed ledger. Times are Ljubljana time; focus a time for ISO 8601 with the offset, UTC, and production versus dissemination.`,
        `Vsa priporočila, objavljena v dvanajstih mesecih do ${fmt.date(asOf)}: ${fmt.int(list.length)}, ustvarjena iz zapečatene knjige. Časi so po ljubljanskem času; ob fokusu na čas se pokaže ISO 8601 z zamikom, UTC ter čas izdelave in objave.`,
      ),
    ),
    ctx.tier === 'free' ? h('p', { class: 'small muted' }, L('Viewing as Free: open recommendations show as sealed until they close.', 'Pogled Brezplačno: odprta priporočila so zapečatena do zaprtja.')) : null,
    h(
      'div',
      { class: 'table-wrap dc-table' },
      h(
        'table',
        { class: 'table dc-list', role: 'table' },
        h('caption', {}, L('Excess return vs the S&P 500 total return (simulated), 21 trading days, after costs; open recommendations marked to the latest close.', 'Presežni donos nad skupnim donosom S&P 500 (simulirano), 21 trgovalnih dni, po stroških; odprta priporočila vrednotena ob zadnjem zaprtju.')),
        h(
          'thead',
          { role: 'rowgroup' },
          h('tr', { role: 'row' }, [L('No.', 'Št.'), L('Disseminated', 'Objavljeno'), L('Rating', 'Ocena'), L('Stock', 'Delnica'), L('Models', 'Modeli'), L('Exit', 'Izstop'), L('Excess', 'Presežek')].map((x, i) => h('th', { scope: 'col', role: 'columnheader', class: [1, 4, 5, 6].includes(i) && 'num' }, x))),
        ),
        h('tbody', { role: 'rowgroup' }, rows),
      ),
    ),
  ];

  // ---- 02 the quarterly rating distribution ----------------------------------------------------------------
  const ratingsBody = [
    h('p', { class: 'dc-plain' }, h('b', {}, L('100% BUY. Every recommendation we have issued is a BUY: the service is long-only and has no HOLD or SELL rating.', '100 % NAKUP. Vsako priporočilo, ki smo ga izdali, je NAKUP: storitev je samo dolga in nima ocen DRŽI ali PRODAJ.'))),
    h('p', {}, L('A RENEW is the same BUY carried into a new 21-day window, so it is counted as a BUY. An exit (CLOSE) is not a rating: it ends the window set at entry.', 'PODALJŠANJE je isti NAKUP, prenesen v novo 21-dnevno obdobje, zato se šteje kot NAKUP. Izstop (ZAPRTJE) ni ocena: konča obdobje, določeno ob vstopu.')),
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'table dc-dist' },
        h('caption', {}, L(`${fmt.int(total)} recommendations since the sealed record began.`, `${fmt.int(total)} priporočil od začetka zapečatenega zapisa.`)),
        h('thead', {}, h('tr', {}, [L('Quarter', 'Četrtletje'), L('BUY', 'NAKUP'), L('of which renewed', 'od tega podaljšanih'), L('HOLD', 'DRŽI'), L('SELL', 'PRODAJ'), L('BUY share', 'Delež NAKUP')].map((x, i) => h('th', { scope: 'col', class: i > 0 && 'num' }, x)))),
        h(
          'tbody',
          {},
          dist.map((r) =>
            h(
              'tr',
              {},
              h('th', { scope: 'row', class: 'mono' }, r.quarter.replace('-', ' ')),
              h('td', { class: 'num' }, fmt.int(r.buy + r.renew)),
              h('td', { class: 'num' }, fmt.int(r.renew)),
              h('td', { class: 'num' }, '0'),
              h('td', { class: 'num' }, '0'),
              h('td', { class: 'num' }, h('span', { class: 'dc-bar', style: { '--p': String(r.buyShare) } }, fmt.pct0(r.buyShare))),
            ),
          ),
        ),
      ),
    ),
  ];

  // ---- 03 conflicts and trading policy (brief §2.9) --------------------------------------------------------
  const conflicts = L(
    `<p>We are a publisher, not an adviser. These rules hold for every tier and every person.</p>
<ul>
<li><strong>Identical content for every tier.</strong> Tiers differ in data breadth, never in pick timing: every subscriber gets the same text in the same second, and the web issue publishes at 14:00:00 for everyone.</li>
<li><strong>No personal recommendations.</strong> No suitability quiz, no portfolio import, no “picks for you”, no position sizing and no watchlist-triggered alerts.</li>
<li><strong>No execution.</strong> No auto-trading, copy-trading or broker links.</li>
<li><strong>No seat caps,</strong> invite-only rooms or private chats with staff.</li>
<li><strong>Staff, founders and their families trade funds and ETFs only,</strong> never single stocks. The firm holds no single stocks. Nobody ever trades against a recommendation.</li>
<li><strong>Pre-release candidates are access-controlled</strong> and every access is logged.</li>
<li><strong>No issuer payments,</strong> and no affiliate or broker referral revenue. No recommendation is shown to its issuer before publication.</li>
<li><strong>Support and any AI assistant explain published data only</strong>, refuse “should I buy or sell?”, are labelled as AI and are logged.</li>
<li><strong>Social media:</strong> founders and staff carry MAR expert disclosures and never preview picks.</li>
</ul>`,
    `<p>Smo založnik, ne svetovalec. Ta pravila veljajo za vse pakete in vse osebe.</p>
<ul>
<li><strong>Enaka vsebina za vse pakete.</strong> Paketi se razlikujejo po obsegu podatkov, nikoli po času izbir: vsi naročniki prejmejo isti SMS v isti sekundi, spletna izdaja pa izide ob 14:00:00 za vse.</li>
<li><strong>Brez osebnih priporočil.</strong> Brez vprašalnika o primernosti, uvoza portfelja, »izbir za vas«, določanja velikosti pozicij ali obvestil na podlagi seznamov spremljanja.</li>
<li><strong>Brez izvrševanja.</strong> Brez samodejnega trgovanja, kopiranja poslov ali povezav do borznih posrednikov.</li>
<li><strong>Brez omejitev števila mest,</strong> zaprtih sob ali zasebnih klepetov z zaposlenimi.</li>
<li><strong>Zaposleni, ustanovitelji in njihove družine trgujejo samo s skladi in ETF-ji,</strong> nikoli s posameznimi delnicami. Družba nima posameznih delnic. Nihče nikoli ne trguje proti priporočilu.</li>
<li><strong>Dostop do kandidatk pred objavo je omejen</strong>, vsak dostop je zabeležen.</li>
<li><strong>Brez plačil izdajateljev</strong> in brez provizij za napotitve ali partnerstva. Nobeno priporočilo pred objavo ni pokazano izdajatelju.</li>
<li><strong>Podpora in morebitni pomočnik z umetno inteligenco pojasnjujeta samo objavljene podatke</strong>, zavrneta vprašanje »ali naj kupim ali prodam?«, sta označena kot UI in zabeležena.</li>
<li><strong>Družbena omrežja:</strong> ustanovitelji in zaposleni navajajo strokovna razkritja po MAR in nikoli ne napovedujejo izbir.</li>
</ul>`,
  );

  // ---- 04 responsible persons -------------------------------------------------------------------------------
  const roleText = (r) =>
    ({
      approver: L('Approver: may remove a pick with a logged reason, never add one', 'Odobriteljica: izbiro lahko odstrani z zabeleženim razlogom, nikoli je ne doda'),
      model_lead: L('Model lead: the families, validation and the frozen engine', 'Vodja modelov: družine, validacija in zamrznjen model'),
      deputy_approver: L('Deputy approver: acts when the approver is away; no approver, no pick', 'Namestnica odobriteljice: nadomešča odobriteljico; brez odobritelja ni izbire'),
    })[r] ?? r;
  const persons = h(
    'ul',
    { class: 'dc-persons' },
    (meta?.persons ?? []).map((p) =>
      h(
        'li',
        { class: 'dc-person' },
        h('p', { class: 'dc-person__name' }, p.name, ' ', h('span', { class: 'tag' }, p.fictional ? ctx.t('common.fictional') : '')),
        h('p', { class: 'small' }, p.title?.[locale] ?? p.title?.en ?? ''),
        h('p', { class: 'small muted' }, roleText(p.role)),
      ),
    ),
  );

  // ---- 05 methodology versions and the amendment ---------------------------------------------------------------
  const amend = backtest?.launch?.amendment;
  const methBody = [
    h('p', {}, L(`A pick needs at least 3 of 4 families ${R.inTop} and no veto. The threshold is calibrated on the research window and frozen per methodology version; any change is a new version with a changelog entry and a ledger record.`, `Izbira potrebuje vsaj 3 od 4 družin ${R.inTop} in noben veto. Prag je umerjen na raziskovalnem obdobju in zamrznjen za vsako različico metodologije; vsaka sprememba je nova različica z vnosom v dnevnik sprememb in zapisom v knjigi.`)),
    h(
      'ol',
      { class: 'dc-versions' },
      (meta?.methodology ?? []).map((m) =>
        h(
          'li',
          {},
          h('p', {}, h('b', {}, `v${m.version}`), ` · ${L('effective', 'velja od')} ${fmt.date(m.effective)} · `, Number.isInteger(m.seq) ? h('a', { href: href('issue', m.effective, `r${m.seq}`) }, L(`ledger record #${m.seq}`, `zapis v knjigi #${m.seq}`)) : null),
          h('p', { class: 'small' }, m.summary?.[locale] ?? m.summary?.en ?? ''),
        ),
      ),
    ),
    amend
      ? h(
          'div',
          { class: 'note-box dc-amend', id: 'amendment' },
          h('p', { class: 'label' }, L(`Amendment ${amend.id} · ${fmt.date(amend.date)} · disclosed`, `Dopolnilo ${amend.id} · ${fmt.date(amend.date)} · razkrito`)),
          h('p', {}, amend.text?.[locale] ?? amend.text?.en ?? ''),
          h('p', {}, h('a', { href: href('backtest', null, 'launch') }, L('Where the launch test stands', 'Kje je preizkus za zagon'))),
        )
      : null,
  ];

  const sections = [
    { id: 'list', title: L('All recommendations, last 12 months', 'Vsa priporočila, zadnjih 12 mesecev'), short: L('12-month list', 'Seznam 12 mesecev'), body: listBody, aside: `<p class="small muted">${L('Required by MAR Art. 20 and Delegated Regulation 2016/958 Art. 4. Generated from the append-only ledger; nothing here is typed by hand.', 'Zahteva MAR čl. 20 in Delegirana uredba 2016/958 čl. 4. Ustvarjeno iz knjige, v katero se samo dodaja; nič tu ni vpisano ročno.')}</p>` },
    { id: 'ratings', title: L('Quarterly rating distribution', 'Četrtletna porazdelitev ocen'), short: L('Ratings', 'Ocene'), body: ratingsBody },
    { id: 'conflicts', title: L('Conflicts and trading policy', 'Nasprotja interesov in pravila trgovanja'), short: L('Conflicts', 'Nasprotja'), body: conflicts, aside: `<p class="small muted">${L('The company holds no position in any issuer, above or below 0.5%.', 'Družba nima pozicije v nobenem izdajatelju, ne nad ne pod 0,5 %.')}</p>` },
    { id: 'persons', title: L('Responsible persons', 'Odgovorne osebe'), short: L('Persons', 'Osebe'), body: [h('p', {}, L('Named on every pick. In this demonstration every person is fictional.', 'Imenovane na vsaki izbiri. V tej predstavitvi so vse osebe izmišljene.')), persons] },
    { id: 'methodology', title: L('Methodology versions and amendments', 'Različice metodologije in dopolnila'), short: L('Versions', 'Različice'), body: methBody, aside: h('p', {}, h('a', { class: 'arrow-link', href: href('methodology-changelog') }, L('Changelog', 'Dnevnik sprememb'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'))) },
  ];

  const node = h(
    'div',
    { class: 'page disc' },
    masthead({
      kicker: L('Did it work? · generated from the ledger', 'Je delovalo? · ustvarjeno iz knjige'),
      title: L('Disclosures.', 'Razkritja.'),
      lede: L('What we recommended, how often, who is responsible, what we may not do, and every change to the rules. In a simulated market of fictional companies.', 'Kaj smo priporočili, kako pogosto, kdo je odgovoren, česa ne smemo početi, in vsaka sprememba pravil. Na simuliranem trgu izmišljenih podjetij.'),
      meta: toc(ctx, sections, L('On this page', 'Na tej strani')),
      draft: { label: ctx.t('common.draft'), text: L('Company in formation; texts to be approved by counsel.', 'Družba v ustanavljanju; besedila mora odobriti odvetnik.') },
    }),
    ...contentSections(sections),
  );
  return { title: L('Disclosures', 'Razkritja'), node };
}
