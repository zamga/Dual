// #p-NNNN: the pick research note (brief §7 and §5). Summary box at the top, the colonnade (data), the
// thesis (opinion), the checks, the path and the outcome or mark-to-market, the texts as written (sent
// to subscribers only once SMS alerts launch: ctx.launch()),
// commit–reveal with in-browser verification, the RENEW chain and earlier picks on the stock, and the
// full MAR disclosure block at the bottom. Free viewers of an open pick see the sealed record only.
//
// SL: first draft, needs native review (and counsel review for the disclosure text).
import { h, svg, announce } from '../dom.js';
import { href } from '../router.js';
import { hashChip, timestamp, signed, quorumBadge, sectionHead, familyName, colPickLabel, colNoVoteLabel } from '../ui.js';
import { ruleLabels } from '../rule.js';
import { indexPicks, isSealedFor, chainOf, resultOf, isRevealed, venueL } from './_records.js';
import { colonnadeChart, sensitivityModel } from '../charts/colonnade.js';
import { pathChart } from '../charts/path.js';
import { createAssembly } from '../hero/assembly.js';
import { canonicalize } from '../core/canonical-json.js';
import { analyze } from '../core/gsm7.js';
import { formatInZone, LJUBLJANA, NEW_YORK } from '../core/calendar.js';
import { fmtUsd } from '../core/format.js';

const VETO = {
  days_to_cover: { en: 'Days to cover', sl: 'Dnevi za pokritje', rule: { en: 'veto: top decile', sl: 'veto: zgornji decil' } },
  idio_vol: { en: 'Idiosyncratic volatility', sl: 'Idiosinkratična volatilnost', rule: { en: 'veto: top decile', sl: 'veto: zgornji decil' } },
  earnings_within_3d: {
    en: 'Earnings within 3 trading days',
    sl: 'Rezultati v 3 trgovalnih dneh',
    rule: { en: 'veto: a report is due', sl: 'veto: objava rezultatov' },
  },
  pending_ma: { en: 'Pending merger or split', sl: 'Napovedana združitev ali delitev', rule: { en: 'veto: pending', sl: 'veto: v teku' } },
  llm_48h: {
    en: 'Material negative news, 48 hours',
    sl: 'Pomembna negativna novica, 48 ur',
    rule: { en: 'news veto (stand-in)', sl: 'veto novic (nadomestek)' },
  },
};

function localTime(iso, tz = LJUBLJANA) {
  const z = formatInZone(new Date(iso), tz);
  const lab = { '+02:00': 'CEST', '+01:00': 'CET', '-04:00': 'EDT', '-05:00': 'EST' }[z.offset] ?? z.offset;
  return { date: z.date, time: z.time.slice(0, 5), tz: lab };
}

function person(meta, id) {
  return meta?.persons?.find((p) => p.id === id) ?? null;
}

export async function render(ctx) {
  const { L, fmt, locale } = ctx;
  const no = ctx.params.no;
  const [picks, meta, ledger, launch, hero, issues] = await Promise.all([
    ctx.data('picks'),
    ctx.data('meta').catch(() => null),
    ctx.data('ledger').catch(() => null),
    ctx.launch(),
    ctx.data('hero').catch(() => null),
    ctx.data('issues').catch(() => null),
  ]);
  const pre = launch.prelaunch;
  const byNo = indexPicks(picks);
  const pick = byNo.get(no);
  if (!pick) return missing(ctx, no);
  const R = ruleLabels(meta, locale);
  if (isSealedFor(pick, ctx.tier, byNo)) return sealedNote(ctx, pick, { meta, byNo, R, pre });

  const final = !!pick.outcome;
  const res = resultOf(pick);
  const approver = person(meta, pick.approver);
  const lead = person(meta, pick.modelLead);
  const kindWord = pick.kind === 'RENEW' ? L('RENEW', 'PODALJŠANJE') : L('BUY', 'NAKUP');
  const dis = localTime(pick.disseminatedAt);
  const sealAt = localTime(pick.producedAt);
  const priceAt = localTime(pick.dissemination?.at ?? pick.disseminatedAt, NEW_YORK);
  const mVer = meta?.methodology?.find((m) => m.version === pick.methodology);
  const chain = chainOf(pick, byNo);
  const statusText = pick.status === 'open' ? L('Open', 'Odprta') : pick.status === 'renewed' ? L('Renewed', 'Podaljšana') : L('Closed', 'Zaprta');

  // ---- the stage (DESIGN-V2 §5): night, the ticker in --t-hero, the strip under it. When hero.json holds
  // this pick's issue the stage is the Assembly frozen at the quorum; otherwise a plain colonnade of the
  // four family percentiles with the lintel over the columns that agreed. The note rises over it.
  const inHero = hero?.pick?.no === pick.no && hero?.issueDate === pick.issueDate;
  const kicker = h('p', { class: 'label stage-screen__kicker' }, L(`Research note · #${pick.no} · issue #${pick.issueNo}`, `Raziskovalni zapis · #${pick.no} · izdaja #${pick.issueNo}`));
  const asm = inHero ? createAssembly(ctx, hero, { meta, prelaunch: pre, freeze: 'quorum', clearOf: () => kicker }) : null;
  if (asm) {
    // the frozen scene keeps its caption for assistive tech, but the page has one h1: the ticker
    const hh = asm.node.querySelector('h1');
    if (hh) hh.replaceWith(h('p', { class: hh.className, id: hh.id }, ...hh.childNodes));
  }
  const badge = h('span', { class: 'badge-quorum pk-badge', dataset: { vtPick: pick.no } }, `${kindWord} · ${pick.agreement}/4`);
  const head = h(
    'header',
    { class: ['grid stage-screen night ruled pk-stage', asm && 'has-scene'] },
    asm ? h('div', { class: 'pk-scene flush' }, asm.node) : stageColumns(pick, { meta, R, locale, issue: (issues?.issues ?? issues ?? []).find?.((x) => x.date === pick.issueDate) }),
    kicker,
    h('h1', { class: 'display d-hero stage-screen__title display--open pk-h1' }, h('span', { class: 'pk-h1__t' }, pick.ticker), h('span', { class: 'visually-hidden' }, `, ${pick.name}`)),
    h(
      'div',
      { class: 'stage-screen__strip' },
      h('span', { class: 't-lintel pk-name' }, pick.name),
      h('span', { class: 'tag' }, ctx.t('common.fictional')),
      badge,
      h('span', { class: ['tag', `is-${pick.status}`] }, statusText),
      h(
        'span',
        { class: 'small pk-when' },
        `${fmt.date(pick.issueDate)} · ${dis.time} ${dis.tz} · `,
        h('a', { href: href('issue', pick.issueDate) }, L(`Issue #${pick.issueNo}`, `Izdaja #${pick.issueNo}`)),
      ),
      h('span', { class: 'pk-idline mono' }, `${locale === 'sl' ? (pick.sectorSl ?? pick.sector) : pick.sector} · ${venueL(pick.venue, locale)} · ${pick.isin}`),
    ),
  );

  // ---- summary box (brief §7, at the top) ------------------------------------------------------------
  const summary = h(
    'section',
    { class: 'grid pk-summary paper ruled', 'aria-labelledby': 'pk-sum-h' },
    h('h2', { class: 'visually-hidden', id: 'pk-sum-h' }, L('Summary', 'Povzetek')),
    h(
      'div',
      { class: 'c-body pk-sum__main' },
      h('p', { class: 'pk-sum__what' }, h('b', {}, `${kindWord} ${pick.name}, ${pick.isin}, ${pick.ticker}, ${venueL(pick.venue, locale)}`)),
      h(
        'p',
        {},
        h('span', { class: 'label' }, L('Meaning', 'Pomen')),
        ' ',
        L(
          `We expect it to beat the S&P 500 total return over 21 trading days, measured from the next US open. No price target. Exit at the US open on ${fmt.date(pick.exitPlanned)}.`,
          `Pričakujemo, da bo v 21 trgovalnih dneh premagala skupni donos indeksa S&P 500, merjeno od naslednjega odprtja ameriškega trga. Brez ciljne cene. Izstop ob odprtju ameriškega trga ${fmt.date(pick.exitPlanned)}.`,
        ),
        pick.kind === 'RENEW' && pick.priorNo ? L(` Renews #${pick.priorNo} for a new window.`, ` Podaljša #${pick.priorNo} za novo obdobje.`) : null,
      ),
      h(
        'p',
        {},
        h('span', { class: 'label' }, L('Prepared by', 'Pripravila')),
        ' ',
        approver ? `${approver.name}, ${approver.title?.[locale] ?? approver.title?.en} (${L('approver', 'odobriteljica')})` : '–',
        L(', and ', ' in '),
        lead ? `${lead.name}, ${lead.title?.[locale] ?? lead.title?.en}` : '–',
        '. ',
        h('span', { class: 'tag' }, L('fictional persons', 'izmišljeni osebi')),
      ),
      h(
        'p',
        {},
        h('span', { class: 'label' }, L('Models', 'Modeli')),
        ' ',
        `${pick.modelVersion}; ${L('methodology', 'metodologija')} ${pick.methodology} (`,
        h('a', { href: href('methodology-changelog') }, L('summary of changes', 'povzetek sprememb')),
        ').',
      ),
      h('p', { class: 'pk-sum__advice' }, h('b', {}, ctx.t('common.notAdvice'))),
    ),
    h(
      'dl',
      { class: 'c-meta dl boxed pk-sum__times' },
      h(
        'div',
        {},
        h('dt', {}, L('Production completed', 'Izdelava zaključena')),
        h(
          'dd',
          {},
          timestamp(
            [
              { at: pick.producedAt, kind: 'produced' },
              { at: pick.disseminatedAt, kind: 'disseminated' },
            ],
            { t: ctx.t, display: `${fmt.date(sealAt.date)} ${sealAt.time} ${sealAt.tz}` },
          ),
        ),
      ),
      h(
        'div',
        {},
        h('dt', {}, L('First disseminated', 'Prvič objavljeno')),
        h(
          'dd',
          {},
          timestamp(
            [
              { at: pick.disseminatedAt, kind: 'disseminated' },
              { at: pick.producedAt, kind: 'produced' },
            ],
            { t: ctx.t, display: `${fmt.date(dis.date)} ${dis.time} ${dis.tz}` },
          ),
        ),
      ),
      h(
        'div',
        {},
        h('dt', {}, L('Price at dissemination', 'Cena ob objavi')),
        h(
          'dd',
          {},
          fmtUsd(pick.dissemination?.price, { locale }),
          h(
            'span',
            { class: 'pk-src' },
            `${pick.dissemination?.source ?? ''} · `,
            h('time', { datetime: pick.dissemination?.at }, `${fmt.date(priceAt.date)} ${priceAt.time} ${priceAt.tz}`),
          ),
        ),
      ),
      h(
        'div',
        {},
        h('dt', {}, L('Entry, US open', 'Vstop, odprtje ZDA')),
        h('dd', {}, `${fmtUsd(pick.entry?.open, { locale })} · ${fmt.date(pick.entry?.date)}`),
      ),
    ),
  );

  // ---- result strip ------------------------------------------------------------------------------------
  const out = pick.outcome;
  const resultItems = final
    ? [
        [
          L('Excess vs S&P 500 TR', 'Presežek nad S&P 500 TR'),
          signed(out.excess, { fmt }),
          L(`at the US open ${fmt.date(out.exitDate)}`, `ob odprtju ZDA ${fmt.date(out.exitDate)}`),
        ],
        [L('Net return', 'Neto donos'), signed(out.net, { fmt }), L('after costs, USD', 'po stroških, USD')],
        [L('Benchmark', 'Merilo'), signed(out.bench, { fmt }), ctx.t('common.benchmark')],
        [L('Net in euro', 'Neto v evrih'), signed(out.eurNet, { fmt }), L('includes currency', 'vključuje tečaj')],
        [L('Alert gap', 'Razlika ob obvestilu'), fmt.bps(out.alertGapBps), L('dissemination price vs entry open', 'cena ob objavi proti vstopni')],
        // d5 and d63 are open-to-open excess over the benchmark, after costs (engine/backtest.js measure())
        [
          L('Excess at 63 trading days', 'Presežek po 63 trgovalnih dneh'),
          out.d63 != null ? signed(out.d63, { fmt }) : h('span', { class: 'muted' }, L('not yet', 'še ne')),
          h('span', {}, L('at 5 days ', 'po 5 dneh '), signed(out.d5, { fmt }), L(' · excess vs S&P 500 TR, context only', ' · presežek nad S&P 500 TR, samo kontekst')),
        ],
      ]
    : [
        [
          L('Excess so far', 'Presežek doslej'),
          signed(res?.excess, { fmt }),
          L(`marked to the ${fmt.date(res?.date)} close`, `vrednoteno ob zaprtju ${fmt.date(res?.date)}`),
        ],
        [L('Net so far', 'Neto doslej'), signed(res?.net, { fmt }), L('after entry costs', 'po vstopnih stroških')],
        [L('Benchmark so far', 'Merilo doslej'), signed(res?.bench, { fmt }), ctx.t('common.benchmark')],
        [L('Exit', 'Izstop'), h('span', { class: 'mono' }, fmt.date(pick.exitPlanned)), L('US open, set at entry', 'odprtje ZDA, določeno ob vstopu')],
      ];
  const resultStrip = h(
    'dl',
    { class: 'stats pk-stats', style: { '--n': String(resultItems.length) } },
    resultItems.map(([k, v, s]) =>
      h('div', { class: 'stat' }, h('dt', { class: 'stat__k' }, k), h('dd', { class: 'stat__v' }, v), h('dd', { class: 'stat__s' }, s)),
    ),
  );

  // ---- 01 data: the colonnade -----------------------------------------------------------------------
  const agreeWord = pick.agreement === 4 ? L('Four of four columns.', 'Štirje od štirih stebrov.') : L('Three of four columns.', 'Trije od štirih stebrov.');
  const colSec = h(
    'section',
    { class: 'section grid paper ruled pk-sec pk-col', id: 'data', 'aria-labelledby': 'pk-col-h' },
    ...sectionHead({ index: '01', kicker: L('Data · why it qualified', 'Podatki · zakaj se je uvrstila'), title: agreeWord, id: 'pk-col-h', size: 'd3' }),
    h(
      'p',
      { class: 'lede c-body' },
      L(
        `On ${fmt.date(pick.issueDate)} ${pick.agreement} of the four model families placed ${pick.ticker} ${R.inTop}. The lintel rests on the columns that qualified; the drivers under each column are the factors behind its score, in standard deviations from the universe; each bar starts at zero (z = 0), which on wide screens is the column’s own rule.`,
        `${fmt.date(pick.issueDate)} so ${pick.agreement} od štirih družin modelov uvrstile ${pick.ticker} ${R.inTop}. Preklada leži na stebrih, ki so se uvrstili; dejavniki pod vsakim stebrom so razlogi za oceno, v standardnih odklonih od univerzuma; vsak stolpec se začne pri nič (z = 0), kar je na širokih zaslonih črta stebra.`,
      ),
    ),
    h(
      'p',
      { class: 'c-meta small muted' },
      pick.crashSwitch
        ? L(
            'Crash switch on: trend (A) was suspended and all three other families had to agree.',
            'Stikalo za zlom je vklopljeno: trend (A) je bil izključen, strinjati so se morale vse tri druge družine.',
          )
        : L(`Rule: at least 3 of 4 families at the ${R.pctile} or higher, no veto.`, `Pravilo: vsaj 3 od 4 družin na ${R.pctile} ali višje, brez veta.`),
    ),
    colonnadeChart(pick, { meta, R, fmt, L, locale, t: ctx.t }),
  );

  // ---- 02 opinion: the thesis, the checks, insider confirmation -------------------------------------
  const paras = String(pick.thesis?.[locale] ?? pick.thesis?.en ?? '')
    .split(/\n\n+/)
    .filter(Boolean);
  const drafted = draftedBy(ctx, pick, approver);
  const checks = h(
    'ul',
    { class: 'pk-checks' },
    (pick.vetoChecks ?? []).map((v) => {
      const d = VETO[v.key] ?? { en: v.key, sl: v.key, rule: { en: '', sl: '' } };
      const val =
        v.key === 'days_to_cover' && Number.isFinite(v.value)
          ? fmt.num(v.value, 1)
          : v.key === 'idio_vol' && Number.isFinite(v.value)
            ? fmt.pct(v.value)
            : v.key === 'earnings_within_3d' && v.next
              ? L(`next ${fmt.date(v.next)}`, `naslednji ${fmt.date(v.next)}`)
              : v.key === 'llm_48h'
                ? L(`${v.headlines ?? 0} flagged`, `${v.headlines ?? 0} označenih`)
                : v.pass
                  ? L('none', 'ni')
                  : '';
      return h(
        'li',
        { class: ['pk-check', v.pass ? 'is-pass' : 'is-fail'] },
        h('span', { class: 'pk-check__mark', 'aria-hidden': 'true' }, v.pass ? '✓' : '×'),
        h(
          'span',
          { class: 'pk-check__k' },
          d[locale] ?? d.en,
          h('span', { class: 'visually-hidden' }, v.pass ? L(': passed', ': opravljeno') : L(': failed', ': ni opravljeno')),
        ),
        h('span', { class: 'pk-check__v mono' }, val),
        h('span', { class: 'pk-check__r small muted' }, d.rule[locale] ?? d.rule.en),
      );
    }),
  );
  const ins = pick.insider;
  const insider = ins
    ? h(
        'div',
        { class: 'pk-insider' },
        h('p', { class: 'label' }, L('Insider confirmation (no vote)', 'Potrditev notranjih kupcev (brez glasu)')),
        h(
          'p',
          { class: 'small' },
          ins.cluster
            ? L(
                `Cluster buying: ${ins.buyers} insiders bought in the ${ins.windowDays} days before the issue${ins.lastBuy ? `, the latest on ${fmt.date(ins.lastBuy)}` : ''}${ins.opportunisticOnly ? ' (opportunistic trades only)' : ''}. Shown for context; it has no vote.`,
                `Skupinski nakupi: ${ins.buyers} notranjih kupcev je kupovalo v ${ins.windowDays} dneh pred izdajo${ins.lastBuy ? `, zadnji ${fmt.date(ins.lastBuy)}` : ''}${ins.opportunisticOnly ? ' (samo oportunistični posli)' : ''}. Prikazano za kontekst; nima glasu.`,
              )
            : L(
                `No insider cluster in the ${ins.windowDays ?? 63} days before the issue.`,
                `V ${ins.windowDays ?? 63} dneh pred izdajo ni bilo skupinskih nakupov notranjih kupcev.`,
              ),
        ),
      )
    : null;
  const thesisSec = h(
    'section',
    { class: 'section grid paper ruled pk-sec pk-thesis', id: 'thesis', 'aria-labelledby': 'pk-th-h' },
    ...sectionHead({
      index: '02',
      kicker: L('Thesis · our opinion', 'Teza · naše mnenje'),
      title: L('Why the models agree.', 'Zakaj se modeli strinjajo.'),
      id: 'pk-th-h',
      size: 'd3',
    }),
    h(
      'div',
      { class: 'c-body prose prose--serif pk-thesis__text' },
      paras.map((p) => h('p', {}, p)),
    ),
    h('aside', { class: 'c-meta pk-aside' }, h('p', { class: 'label' }, L('Veto checks', 'Preverjanje vetov')), checks, insider),
    h('p', { class: 'c-body pk-drafted small' }, drafted),
  );

  // ---- 03 the path --------------------------------------------------------------------------------------
  const pathSec = h(
    'section',
    { class: 'section grid paper ruled pk-sec pk-path', id: 'path', 'aria-labelledby': 'pk-path-h' },
    ...sectionHead({
      index: '03',
      kicker: final ? L('Outcome · 21 trading days', 'Izid · 21 trgovalnih dni') : L('Mark to market · open', 'Vrednotenje · odprta'),
      title: final ? L('Whatever happened.', 'Ne glede na izid.') : L('So far.', 'Doslej.'),
      id: 'pk-path-h',
      size: 'd3',
    }),
    h(
      'p',
      { class: 'lede c-body' },
      final
        ? L(
            `Bought at the US open on ${fmt.date(pick.entry?.date)}, sold at the open on ${fmt.date(pick.exit?.date)}, 21 trading days later, after costs. ${pick.status === 'renewed' ? `The rule still held on day 21, so it was renewed as #${pick.renewedAs}; this window is measured on its own.` : 'No stop-loss, no discretionary exit.'}`,
            `Kupljeno ob odprtju ameriškega trga ${fmt.date(pick.entry?.date)}, prodano ob odprtju ${fmt.date(pick.exit?.date)}, 21 trgovalnih dni pozneje, po stroških. ${pick.status === 'renewed' ? `Pravilo je 21. dan še veljalo, zato je bila podaljšana kot #${pick.renewedAs}; to obdobje se meri posebej.` : 'Brez stop-loss naročil in brez diskrecijskih izstopov.'}`,
          )
        : L(
            `Entered at the US open on ${fmt.date(pick.entry?.date)}. Marked to the close of ${fmt.date(res?.date)}. The exit is fixed: the US open on ${fmt.date(pick.exitPlanned)}.`,
            `Vstop ob odprtju ameriškega trga ${fmt.date(pick.entry?.date)}. Vrednoteno ob zaprtju ${fmt.date(res?.date)}. Izstop je določen: odprtje ameriškega trga ${fmt.date(pick.exitPlanned)}.`,
          ),
    ),
    resultStripWrap(resultStrip),
    pathChart(pick, { fmt, L, final, locale }),
  );

  // ---- 04 the texts (as sent once launched; as written before) ------------------------------------------
  const smsSec = h(
    'section',
    { class: 'section grid paper ruled pk-sec pk-sms', id: 'texts', 'aria-labelledby': 'pk-sms-h' },
    ...sectionHead({
      index: '04',
      kicker: pre ? L('The texts · pre-launch, not sent', 'Sporočila SMS · pred zagonom, niso poslana') : L('The texts', 'Sporočila SMS'),
      title: pre ? L('As written for 14:00.', 'Kot so pripravljena za 14:00.') : L('Exactly as sent.', 'Natanko tako, kot so bila poslana.'),
      id: 'pk-sms-h',
      size: 'd3',
    }),
    h(
      'p',
      { class: 'lede c-body' },
      pre
        ? L(
            `One GSM-7 segment each, rendered for this record at ${dis.time} ${dis.tz}. Once SMS alerts launch, every subscriber gets the text in the same second; before launch there are no subscribers and nothing was sent. No price, no target, no urgency; the link leads here.`,
            `Vsako en segment GSM-7, pripravljeno za ta zapis ob ${dis.time} ${dis.tz}. Ko se obvestila SMS zaženejo, vsi naročniki SMS prejmejo v isti sekundi; pred zagonom naročnikov ni in nič ni bilo poslano. Brez cene, cilja in pritiska; povezava vodi sem.`,
          )
        : L(
            `One GSM-7 segment each, sent at ${dis.time} ${dis.tz} to every subscriber in the same second. No price, no target, no urgency; the link leads here.`,
            `Vsako en segment GSM-7, poslano ob ${dis.time} ${dis.tz} vsem naročnikom v isti sekundi. Brez cene, cilja in pritiska; povezava vodi sem.`,
          ),
    ),
    h(
      'div',
      { class: 'c-wide pk-texts' },
      smsCard(ctx, pick.sms?.en, 'en', pick.kind, pick.disseminatedAt),
      smsCard(ctx, pick.sms?.sl, 'sl', pick.kind, pick.disseminatedAt),
      pick.closeSms ? smsCard(ctx, pick.closeSms.en, 'en', 'CLOSE', closeAt(pick)) : null,
      pick.closeSms ? smsCard(ctx, pick.closeSms.sl, 'sl', 'CLOSE', closeAt(pick)) : null,
    ),
  );

  // ---- 05 commit–reveal ----------------------------------------------------------------------------------
  const revealSec = revealSection(ctx, pick, { ledger, byNo });

  // ---- 06 the chain and earlier picks on this stock ------------------------------------------------------
  const hist = (pick.history12m ?? []).map((n) => byNo.get(n)).filter(Boolean);
  const chainSec = h(
    'section',
    { class: 'section grid paper ruled pk-sec pk-chain', id: 'history', 'aria-labelledby': 'pk-ch-h' },
    ...sectionHead({
      index: '06',
      kicker: L('History', 'Zgodovina'),
      title: L(`${pick.ticker} in the record.`, `${pick.ticker} v zapisu.`),
      id: 'pk-ch-h',
      size: 'd3',
    }),
    chain.length > 1
      ? h(
          'div',
          { class: 'c-wide' },
          h('p', { class: 'label pk-chain__label' }, L('RENEW chain', 'Veriga podaljšanj')),
          h(
            'ol',
            { class: 'pk-renew' },
            chain.map((c) =>
              h(
                'li',
                { class: ['pk-renew__item', c.no === pick.no && 'is-current'] },
                c.no === pick.no
                  ? h('span', { class: 'pk-renew__no mono', 'aria-current': 'page' }, `#${c.no}`)
                  : h('a', { class: 'pk-renew__no mono', href: href('pick', c.no) }, `#${c.no}`),
                h('span', { class: 'small' }, `${c.kind === 'RENEW' ? L('RENEW', 'PODALJŠANJE') : L('BUY', 'NAKUP')} · ${fmt.date(c.issueDate)}`),
                h('span', { class: 'small' }, c.outcome ? signed(c.outcome.excess, { fmt }) : h('span', { class: 'muted' }, L('open', 'odprta'))),
              ),
            ),
          ),
        )
      : null,
    h(
      'div',
      { class: 'c-body' },
      h('p', { class: 'label' }, L('Previous recommendations on this stock, 12 months', 'Prejšnja priporočila za to delnico, 12 mesecev')),
      hist.length
        ? h(
            'ul',
            { class: 'pk-prev' },
            hist.map((p) =>
              h(
                'li',
                {},
                h('a', { href: href('pick', p.no) }, `#${p.no}`),
                ` · ${p.kind === 'RENEW' ? L('RENEW', 'PODALJŠANJE') : L('BUY', 'NAKUP')} · ${fmt.date(p.issueDate)} · `,
                p.outcome ? signed(p.outcome.excess, { fmt }) : L('open', 'odprta'),
              ),
            ),
          )
        : h('p', {}, L('None.', 'Nobenega.')),
      h(
        'p',
        {},
        h(
          'a',
          { class: 'arrow-link', href: href('stock', pick.ticker) },
          L(`Every recommendation on ${pick.ticker}`, `Vsa priporočila za ${pick.ticker}`),
          h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'),
        ),
      ),
    ),
  );

  // ---- 07 the full MAR disclosure block ---------------------------------------------------------------
  const mar = marBlock(ctx, pick, { meta, R, approver, hist, mVer });

  const node = h(
    'article',
    { class: 'pk', 'aria-labelledby': 'pk-h1' },
    head,
    h(
      'div',
      { class: 'note-sheet paper' },
      summary,
    colSec,
    thesisSec,
    pathSec,
    smsSec,
    revealSec,
    chainSec,
    mar,
    h(
      'nav',
      { class: 'grid pk-nav', 'aria-label': L('Neighbouring picks', 'Sosednje izbire') },
      h('p', { class: 'c-body pk-nav__links' }, ...neighbours(ctx, pick, picks, byNo)),
    ),
    ),
  );
  node.querySelector('h1').id = 'pk-h1';
  return {
    title: L(`#${pick.no} ${pick.ticker}`, `#${pick.no} ${pick.ticker}`),
    node,
    top: 'chamber',
    afterMount: asm ? () => asm.mount() : undefined,
    cleanup: asm ? () => asm.destroy() : undefined,
  };
}

// The stage for a pick the hero data does not hold: the Assembly's stone vocabulary, drawn in DOM and SVG
// from the pick and its issue. Four fluted columns stand on the rules; on each, the issue's top band
// (91–100) holds that family's top 9% of the scored stocks (percentile ranks are uniform, so the band holds
// 9% of them, spread evenly in rank); everything else has fallen into the sediment on the floor, one grain
// per stock that did not reach the rule. The pick's own grain sits at its percentile on every column, and
// the lintel of quorum light is laid across the columns that agreed. Decoration only (aria-hidden): the
// numbers are in the note's colonnade (01).
function stageColumns(pick, { R, locale, issue }) {
  const th = R.topPct ?? 0.91;
  const agree = new Set(pick.agreeing ?? []);
  const ks = ['A', 'B', 'C', 'D'];
  const on = ks.map((f, k) => (agree.has(f) ? k : -1)).filter((k) => k >= 0);
  // a small seeded generator: the same pick always draws the same stone
  let seed = (Number(pick.no) || 1) * 2654435761;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const n = Number.isFinite(issue?.nScored) ? issue.nScored : null;
  const band = n ? Math.round(n * (1 - th)) : 0;
  const cols = ks.map((f, k) => {
    const pct = pick.families?.[f]?.pct;
    const v = Number.isFinite(pct) ? Math.max(0, Math.min(1, pct)) : 0;
    // the band's grains: `band` stocks evenly in rank from the rule to 100, jittered across the column
    let d = '';
    for (let i = 0; i < band; i++) {
      const y = Math.round(1000 - (th + ((i + rnd()) / band) * (1 - th)) * 1000);
      const x = Math.round(30 + (rnd() - 0.5) * (8 + 34 * rnd()));
      d += `M${x} ${y}h0`;
    }
    const grains = band ? svg('svg', { class: 'pk-st__band', viewBox: '0 0 60 1000', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' }, svg('path', { d })) : null;
    const el = h(
      'span',
      { class: ['pk-st', agree.has(f) && 'is-agree'] },
      h('span', { class: 'pk-st__stone' }, h('i'), h('i'), h('i')),
      grains,
      h('span', { class: 'pk-st__mote' }),
      agree.has(f) ? null : colNoVoteLabel(f, Number.isFinite(pct) ? pct * 100 : NaN, locale, 'pk-st__k', 'span'),
    );
    el.style.setProperty('--h', String(v));
    return el;
  });
  // the sediment: one grain per stock that did not reach the rule, in a band on the floor
  let sediment = null;
  if (n) {
    const fallen = Math.max(0, n - (Number.isFinite(issue.reached) ? issue.reached : 0));
    const ds = ['', '', ''];
    for (let i = 0; i < fallen; i++) {
      const x = Math.round(rnd() * 2000);
      const y = Math.round(40 - Math.pow(rnd(), 1.8) * 34);
      ds[Math.min(2, Math.floor(rnd() * 3))] += `M${x} ${y}h0`;
    }
    sediment = svg('svg', { class: 'pk-sediment', viewBox: '0 0 2000 44', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' }, ds.map((d, i) => svg('path', { class: `pk-sediment__g${i}`, d })));
  }
  const lintel = on.length >= 2 ? h('span', { class: 'pk-cols__lintel' }, colPickLabel(pick.ticker, on.length, 'pk-cols__pick')) : null;
  if (lintel) lintel.style.gridColumn = `r${on[0] + 1} / r${on[on.length - 1] + 1}`;
  const slab = h('span', { class: 'pk-cols__slab' });
  const node = h('div', { class: ['pk-cols', n && 'has-floor'], 'aria-hidden': 'true' }, slab, cols, lintel, sediment);
  node.style.setProperty('--t', String(th));
  return node;
}

function resultStripWrap(strip) {
  return h('div', { class: 'c-wide pk-result' }, strip);
}

function closeAt(pick) {
  // CLOSE texts go out with the 14:00 issue on the exit day
  const d = pick.exit?.date ?? pick.exitPlanned;
  const z = formatInZone(new Date(`${d}T12:00:00Z`), LJUBLJANA);
  return `${d}T14:00:00${z.offset}`;
}

function smsCard(ctx, text, locale, kind, at) {
  const { L } = ctx;
  if (!text) return null;
  const a = analyze(text);
  const lj = localTime(at);
  const kindL = { BUY: L('BUY', 'NAKUP'), RENEW: L('RENEW', 'PODALJŠANJE'), CLOSE: L('CLOSE', 'ZAPRTJE') }[kind] ?? kind;
  return h(
    'figure',
    { class: 'pk-text', lang: locale },
    h(
      'figcaption',
      { class: 'pk-text__cap' },
      h('span', { class: 'label' }, `${kindL} · ${locale.toUpperCase()}`),
      h('span', { class: 'label' }, `${ctx.fmt.date(lj.date)} ${lj.time} ${lj.tz}`),
    ),
    h('p', { class: 'sms pk-text__sms' }, ...smsParts(text)),
    h(
      'p',
      { class: 'pk-text__count mono' },
      a.encoding === 'GSM-7'
        ? L(`${a.septets}/160 GSM-7 septets · ${a.segments} segment`, `${a.septets}/160 znakov GSM-7 · ${a.segments} segment`)
        : L(`${a.units}/70 UCS-2 units · ${a.segments} segments`, `${a.units}/70 enot UCS-2 · ${a.segments} segmentov`),
    ),
  );
}

function smsParts(text) {
  return String(text)
    .split(/(qrm\.si\/\S+)/g)
    .map((p) => (/^qrm\.si\//.test(p) ? h('u', {}, p) : p));
}

function draftedBy(ctx, pick, approver) {
  const { L } = ctx;
  const who = approver ? `${approver.name} (${L('fictional', 'izmišljeno')})` : L('the approver', 'odobritelj');
  if (pick.drafter === 'template') {
    return L(
      `Drafted by the template writer from the factor data (the AI drafter, Claude (Anthropic), is off in this demo). Every number was checked against the source data by the numeric validator: ${pick.validator ?? 'passed'}. Approved by ${who}.`,
      `Pripravil predložni pisec iz podatkov o dejavnikih (pisec z umetno inteligenco, Claude (Anthropic), je v tem demu izklopljen). Vsako število je numerični preverjevalnik primerjal z izvornimi podatki: ${pick.validator === 'passed' ? 'opravljeno' : (pick.validator ?? 'opravljeno')}. Odobrila ${who}.`,
    );
  }
  return L(
    `Drafted with AI (Claude, Anthropic) from our model data; every number checked by the numeric validator (${pick.validator}); approved by ${who}.`,
    `Pripravljeno z umetno inteligenco (Claude, Anthropic) iz podatkov modelov; vsako število preveril numerični preverjevalnik (${pick.validator}); odobrila ${who}.`,
  );
}

function revealSection(ctx, pick, { ledger, byNo }) {
  const { L, fmt } = ctx;
  const buyEntry = ledger?.entries?.find((e) => e.seq === pick.seq);
  const closeEntry = pick.closeSeq != null ? ledger?.entries?.find((e) => e.seq === pick.closeSeq) : null;
  const finalNo = chainOf(pick, byNo).at(-1);
  const revealedIn = closeEntry ?? (finalNo?.closeSeq != null ? ledger?.entries?.find((e) => e.seq === finalNo.closeSeq) : null);
  const revealed = isRevealed(pick, byNo);
  const sealAt = localTime(buyEntry?.at ?? pick.producedAt);
  const reveal = pick.reveal;
  const json = reveal ? canonicalize(reveal) : '';
  const status = h('p', { class: 'verify__status pk-verify__status', role: 'status' });
  const btn = h('button', { type: 'button', class: 'btn verify__btn' }, L('Verify reveal', 'Preveri razkritje'));
  btn.addEventListener('click', async () => {
    if (!globalThis.crypto?.subtle) {
      status.textContent = L('This browser context has no WebCrypto (it needs HTTPS).', 'Ta brskalnik tu nima WebCrypto (potreben je HTTPS).');
      return;
    }
    btn.disabled = true;
    status.dataset.state = 'run';
    status.textContent = L('Hashing the canonical reveal…', 'Računam zgoščeno vrednost kanoničnega razkritja…');
    const { commitment } = await import('../core/ledger.js');
    const got = await commitment(reveal);
    const ok = got === pick.commit;
    btn.disabled = false;
    status.dataset.state = ok ? 'ok' : 'bad';
    status.textContent = ok
      ? L(
          `sha256 = ${got.slice(0, 16)}… It matches the commitment sealed at ${sealAt.time} ${sealAt.tz} on ${fmt.date(sealAt.date)} in record #${pick.seq}.`,
          `sha256 = ${got.slice(0, 16)}… Ujema se z zavezo, zapečateno ob ${sealAt.time} ${sealAt.tz} ${fmt.date(sealAt.date)} v zapisu #${pick.seq}.`,
        )
      : L(
          `sha256 = ${got.slice(0, 16)}… It does not match the commitment ${pick.commit.slice(0, 16)}…`,
          `sha256 = ${got.slice(0, 16)}… Ne ujema se z zavezo ${pick.commit.slice(0, 16)}…`,
        );
    announce(status.textContent);
  });
  return h(
    'section',
    { class: 'section grid chamber ruled pk-sec pk-reveal', id: 'reveal', 'aria-labelledby': 'pk-rv-h' },
    ...sectionHead({
      index: '05',
      kicker: L('Commit–reveal', 'Zaveza in razkritje'),
      title: L('Sealed before anyone saw it.', 'Zapečateno, preden jo je kdor koli videl.'),
      id: 'pk-rv-h',
      size: 'd3',
    }),
    h(
      'p',
      { class: 'lede c-body' },
      L(
        `At 13:45 only a commitment went into the public chain: the SHA-256 of the canonical reveal below, salted so the ticker cannot be guessed. ${revealed ? 'The reveal was published with the close; anyone can hash it again.' : 'The reveal is published at the close. In this demo, subscribers see it now.'}`,
        `Ob 13:45 je v javno verigo šla samo zaveza: SHA-256 kanoničnega razkritja spodaj, s soljo, da oznake ni mogoče uganiti. ${revealed ? 'Razkritje je bilo objavljeno ob zaprtju; kdor koli ga lahko znova zgosti.' : 'Razkritje se objavi ob zaprtju. V tem demu ga naročniki vidijo že zdaj.'}`,
      ),
    ),
    h(
      'dl',
      { class: 'c-meta dl boxed pk-rv__dl' },
      h('div', {}, h('dt', {}, L('Commitment', 'Zaveza')), h('dd', {}, hashChip(pick.commit, { t: ctx.t }))),
      h(
        'div',
        {},
        h('dt', {}, L('Sealed in record', 'Zapečateno v zapisu')),
        h('dd', {}, h('a', { href: href('issue', pick.issueDate, `r${pick.seq}`) }, `#${pick.seq}`), ` · ${sealAt.time} ${sealAt.tz}`),
      ),
      h(
        'div',
        {},
        h('dt', {}, L('Revealed in record', 'Razkrito v zapisu')),
        h(
          'dd',
          {},
          revealedIn ? h('a', { href: href('issue', revealedIn.issueDate, `r${revealedIn.seq}`) }, `#${revealedIn.seq}`) : L('at close', 'ob zaprtju'),
        ),
      ),
    ),
    h(
      'pre',
      { class: 'c-body pk-json mono', tabindex: '0', 'aria-label': L('The canonical reveal (RFC 8785 JSON)', 'Kanonično razkritje (JSON po RFC 8785)') },
      json,
    ),
    h('div', { class: 'c-body verify pk-verify' }, btn, status),
  );
}

function marBlock(ctx, pick, { meta, R, approver, hist, mVer }) {
  const { L, fmt, locale } = ctx;
  const sens = sensitivityModel(pick, R.topPct);
  const famName = sens ? familyName(sens.family, meta, locale) : '';
  const facts = localTime(pick.dissemination?.at ?? pick.disseminatedAt, NEW_YORK);
  const who = approver ? `${approver.name} (${L('fictional', 'izmišljeno')})` : L('the approver', 'odobritelj');
  const item = (k, body) => h('div', { class: 'pk-mar__item' }, h('dt', {}, k), h('dd', {}, ...[].concat(body)));
  return h(
    'section',
    { class: 'section grid paper ruled pk-sec pk-mar', id: 'disclosures', 'aria-labelledby': 'pk-mar-h' },
    ...sectionHead({
      index: '07',
      kicker: L('MAR Art. 20 · Delegated Reg. 2016/958 Arts 2–6', 'MAR čl. 20 · Delegirana uredba 2016/958, čl. 2–6'),
      title: L('Disclosures.', 'Razkritja.'),
      id: 'pk-mar-h',
      size: 'd3',
    }),
    h(
      'p',
      { class: 'draft-banner c-body' },
      h('span', { class: 'label' }, ctx.t('common.draft')),
      h('span', {}, L('Company in formation; wording to be approved by counsel.', 'Družba v ustanavljanju; besedilo mora odobriti odvetnik.')),
    ),
    // The demo is not a service and a fictional company's record is not a recommendation: say so first.
    ctx.mode === 'live'
      ? null
      : h(
          'p',
          { class: 'c-body pk-mar__sample' },
          h('b', {}, L('Sample disclosure.', 'Vzorec razkritja.')),
          ' ',
          L(
            'In production this block reads as follows. In this demo the company and the issuer are fictional, and nothing on this page is a recommendation.',
            'V produkciji se ta del glasi tako, kot sledi. V tem demu sta podjetje in izdajatelj izmišljena in nič na tej strani ni priporočilo.',
          ),
        ),
    h(
      'dl',
      { class: 'c-body boxed pk-mar__list' },
      item(
        L('Status.', 'Status.'),
        L(
          'This is an investment recommendation under Art. 3(1)(35) of Regulation (EU) 596/2014. It is issued exclusively to the public. It is not a personal recommendation or investment advice under Directive 2014/65/EU. Quorum Research d.o.o. (in formation) is not an investment firm and is not authorised by ATVP.',
          'To je investicijsko priporočilo po čl. 3(1)(35) Uredbe (EU) 596/2014. Izdano je izključno javnosti. Ni osebno priporočilo ali investicijsko svetovanje po Direktivi 2014/65/EU. Quorum Research d.o.o. (v ustanavljanju) ni investicijsko podjetje in nima dovoljenja ATVP.',
        ),
      ),
      item(
        L('Facts and opinion.', 'Dejstva in mnenje.'),
        L(
          `The “Data” section is facts from the simulated market (fictional filings, prices and short interest standing in for SEC EDGAR, Sharadar and FINRA) as of ${fmt.date(facts.date)} ${facts.time} ${facts.tz}. The “Thesis” section is our opinion. Model scores are forecasts, not facts.`,
          `Razdelek »Podatki« so dejstva iz simuliranega trga (izmišljene objave, cene in kratke prodaje namesto SEC EDGAR, Sharadar in FINRA) na dan ${fmt.date(facts.date)} ${facts.time} ${facts.tz}. Razdelek »Teza« je naše mnenje. Ocene modelov so napovedi, ne dejstva.`,
        ),
      ),
      item(L('Method.', 'Metoda.'), [
        L(
          `A pick is issued only when at least 3 of our 4 model families rank the stock ${R.inTop} and no veto applies. `,
          `Izbira je izdana samo, ko vsaj 3 od naših 4 družin modelov uvrstijo delnico ${R.inTop} in ne velja noben veto. `,
        ),
        h('a', { href: href('methodology') }, L('Full methodology', 'Celotna metodologija')),
        '. ',
        h(
          'a',
          { href: href('methodology-changelog') },
          L(`Changes since the last version${mVer ? ` (v${mVer.version})` : ''}`, `Spremembe od zadnje različice${mVer ? ` (v${mVer.version})` : ''}`),
        ),
        '.',
      ]),
      item(
        L('Risk and sensitivity.', 'Tveganje in občutljivost.'),
        L(
          `${sens ? `This recommendation would not have been issued if family ${sens.family}’s (${famName}) percentile had been below ${R.pctileNum}, about ${fmt.num(Math.abs(sens.sd), 2)} standard deviations lower. ` : ''}Momentum-based signals can suffer sharp losses after market rebounds. Currency moves affect euro returns.`,
          `${sens ? `To priporočilo ne bi bilo izdano, če bi bil percentil družine ${sens.family} (${famName}) pod ${R.pctileNum}, približno ${fmt.num(Math.abs(sens.sd), 2)} standardnega odklona nižje. ` : ''}Signali na podlagi momenta lahko po odbojih trga utrpijo velike izgube. Gibanje tečajev vpliva na donose v evrih.`,
        ),
      ),
      item(
        L('Previous recommendations on this stock (12 months).', 'Prejšnja priporočila za to delnico (12 mesecev).'),
        hist.length
          ? hist.flatMap((p, i) => [i ? ', ' : '', h('a', { href: href('pick', p.no) }, `#${p.no}`), ` ${fmt.date(p.issueDate)}`]).concat('.')
          : L('None.', 'Nobenega.'),
      ),
      item(
        L('Conflicts.', 'Nasprotja interesov.'),
        L(
          'The company holds no position in this issuer, above or below 0.5%. Staff and founders may hold funds only, never individual shares, and never trade against a recommendation. We have no relationship with, and receive no payment from, the issuer. We earn no referral or affiliate fees. This recommendation was not shown to the issuer before publication.',
          'Družba nima pozicije v tem izdajatelju, ne nad ne pod 0,5 %. Zaposleni in ustanovitelji smejo imeti samo sklade, nikoli posameznih delnic, in nikoli ne trgujejo proti priporočilu. Z izdajateljem nimamo razmerja in od njega ne prejemamo plačil. Ne zaslužimo provizij za napotitve ali partnerstva. Priporočilo pred objavo ni bilo pokazano izdajatelju.',
        ),
      ),
      item(
        L('Updates.', 'Posodobitve.'),
        L('Reviewed on every US trading day. The exit is set at entry.', 'Pregledano vsak dan trgovanja v ZDA. Izstop je določen ob vstopu.'),
      ),
    ),
    h(
      'p',
      { class: 'c-body pk-mar__links small' },
      h('a', { href: href('disclosures', null, 'list') }, L('12-month list of all our recommendations', '12-mesečni seznam vseh naših priporočil')),
      ' · ',
      h('a', { href: href('disclosures', null, 'ratings') }, L('Quarterly rating distribution: 100% BUY', 'Četrtletna porazdelitev priporočil: 100 % NAKUP')),
    ),
    h(
      'p',
      { class: 'c-body pk-mar__ai' },
      h(
        'b',
        {},
        pick.drafter === 'template'
          ? L(
              `This explanation was drafted by our template writer from our model data (in production: an AI model, Claude by Anthropic) and checked and approved by ${who}.`,
              `To razlago je iz podatkov naših modelov pripravil predložni pisec (v produkciji: model umetne inteligence Claude podjetja Anthropic), preveril in odobril pa jo je ${who}.`,
            )
          : L(
              `This explanation was drafted by an AI model (Claude, Anthropic) from our model data and checked and approved by ${who}.`,
              `To razlago je iz podatkov naših modelov pripravil model umetne inteligence (Claude, Anthropic), preveril in odobril pa jo je ${who}.`,
            ),
      ),
    ),
  );
}

function neighbours(ctx, pick, picks, byNo) {
  const { L } = ctx;
  const i = picks.findIndex((p) => p.no === pick.no);
  const prev = picks[i - 1];
  const next = picks[i + 1];
  const label = (p) => (isSealedFor(p, ctx.tier, byNo) ? `#${p.no} · ${ctx.t('common.sealed')}` : `#${p.no} ${p.ticker}`);
  return [
    prev
      ? h('a', { class: 'arrow-link pk-nav__prev', href: href('pick', prev.no) }, h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '←'), label(prev))
      : h('span'),
    h('a', { class: 'arrow-link', href: href('ledger', null, 'record') }, L('All picks in the ledger', 'Vse izbire v knjigi')),
    next
      ? h('a', { class: 'arrow-link pk-nav__next', href: href('pick', next.no) }, label(next), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'))
      : h('span'),
  ];
}

// ---- the sealed record (Free viewers, open pick) ----------------------------------------------------------
function sealedNote(ctx, pick, { byNo, pre = true }) {
  const { L, fmt } = ctx;
  const sealAt = localTime(pick.producedAt);
  const dis = localTime(pick.disseminatedAt);
  const chainFinal = chainOf(pick, byNo).at(-1);
  const closeDate = chainFinal?.exitPlanned ?? pick.exitPlanned;
  const node = h(
    'article',
    { class: 'pk pk--sealed' },
    h(
      'header',
      { class: 'grid stage-screen night ruled pk-stage pk-stage--sealed' },
      h(
        'p',
        { class: 'label stage-screen__kicker' },
        L(`Research note · #${pick.no} · issue #${pick.issueNo}`, `Raziskovalni zapis · #${pick.no} · izdaja #${pick.issueNo}`),
      ),
      h('h1', { class: 'display d1 stage-screen__title pk-h1' }, L(`#${pick.no} is sealed.`, `#${pick.no} je zapečatena.`)),
      h(
        'p',
        { class: 'lede c-body' },
        L(
          `Sealed at ${sealAt.time} ${sealAt.tz} and published at ${dis.time} ${dis.tz} on ${fmt.date(pick.issueDate)}. The ticker, the thesis and the chart are revealed to everyone when the pick closes${pick.status === 'renewed' || chainFinal !== pick ? ' (it was renewed; the chain closes last)' : ''}. On the free Ledger tier an open pick stays sealed (number, time, hash) until then; the paid tiers see it from 14:00${pre ? ' once SMS alerts launch (there are no subscribers before launch)' : ''}.`,
          `Zapečateno ob ${sealAt.time} ${sealAt.tz} in objavljeno ob ${dis.time} ${dis.tz} ${fmt.date(pick.issueDate)}. Oznaka, teza in graf se vsem razkrijejo ob zaprtju izbire${pick.status === 'renewed' || chainFinal !== pick ? ' (bila je podaljšana; veriga se zapre zadnja)' : ''}. V brezplačnem paketu Ledger ostane odprta izbira do takrat zapečatena (številka, čas, zgoščena vrednost); plačljiva paketa jo vidita od 14:00${pre ? ', ko se obvestila SMS zaženejo (pred zagonom naročnikov ni)' : ''}.`,
        ),
      ),
      h(
        'div',
        { class: 'stage-screen__strip' },
        h('p', { class: 'pk-badges' }, quorumBadge(pick.agreement, { t: ctx.t }), h('span', { class: 'tag' }, ctx.t('common.sealed'))),
      ),
    ),
    h(
      'section',
      { class: 'section grid paper ruled note-sheet pk-sec pk-sealed', 'aria-labelledby': 'pk-sl-h' },
      ...sectionHead({
        index: '01',
        kicker: L('What the public chain shows', 'Kaj kaže javna veriga'),
        title: L('Number, time, hash.', 'Številka, čas, zgoščena vrednost.'),
        id: 'pk-sl-h',
        size: 'd3',
      }),
      h(
        'dl',
        { class: 'c-wide dl boxed pk-sealed__dl' },
        h(
          'div',
          {},
          h('dt', {}, L('Record', 'Zapis')),
          h('dd', {}, `#${pick.no} · ${pick.kind === 'RENEW' ? L(`RENEW of #${pick.priorNo}`, `PODALJŠANJE #${pick.priorNo}`) : L('BUY', 'NAKUP')}`),
        ),
        h(
          'div',
          {},
          h('dt', {}, L('Sealed', 'Zapečateno')),
          h(
            'dd',
            {},
            timestamp(
              [
                { at: pick.producedAt, kind: 'sealed' },
                { at: pick.disseminatedAt, kind: 'disseminated' },
              ],
              { t: ctx.t, display: `${fmt.date(sealAt.date)} ${sealAt.time} ${sealAt.tz}` },
            ),
          ),
        ),
        h('div', {}, h('dt', {}, L('Commitment', 'Zaveza')), h('dd', {}, hashChip(pick.commit, { t: ctx.t }))),
        h('div', {}, h('dt', {}, L('Models', 'Modeli')), h('dd', {}, `${pick.agreement}/4`)),
        h('div', {}, h('dt', {}, L('Exit', 'Izstop')), h('dd', {}, L(`US open ${fmt.date(pick.exitPlanned)}`, `odprtje ZDA ${fmt.date(pick.exitPlanned)}`))),
        h(
          'div',
          {},
          h('dt', {}, L('Revealed', 'Razkritje')),
          h('dd', {}, L(`at the close, planned ${fmt.date(closeDate)}`, `ob zaprtju, predvidoma ${fmt.date(closeDate)}`)),
        ),
        h(
          'div',
          {},
          h('dt', {}, L('Ledger record', 'Zapis v knjigi')),
          h('dd', {}, h('a', { href: href('issue', pick.issueDate, `r${pick.seq}`) }, `#${pick.seq}`)),
        ),
      ),
      h(
        'p',
        { class: 'c-body pk-sealed__cta' },
        h(
          'a',
          { class: 'btn', href: href('pricing') },
          L('See picks at 14:00: Signal', 'Izbire ob 14:00: Signal'),
          h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'),
        ),
        ' ',
        h('a', { class: 'arrow-link', href: href('ledger', null, 'record') }, L('Closed picks are open to all', 'Zaprte izbire so vidne vsem')),
      ),
    ),
  );
  return { title: L(`#${pick.no} · sealed`, `#${pick.no} · zapečateno`), node, top: 'chamber' };
}

function missing(ctx, no) {
  const { L } = ctx;
  const node = h(
    'section',
    { class: 'grid state' },
    h('p', { class: 'label c-head' }, L(`Research note · #${no}`, `Raziskovalni zapis · #${no}`)),
    h('h1', { class: 'display d2 c-head' }, L(`No pick #${no}.`, `Izbire #${no} ni.`)),
    h(
      'p',
      { class: 'lede c-body' },
      L(
        'The record has no pick with this number. Numbers are issued in order, so it has not happened yet.',
        'Zapis nima izbire s to številko. Številke se dodeljujejo po vrsti, zato je še ni bilo.',
      ),
    ),
    h(
      'p',
      { class: 'c-body' },
      h(
        'a',
        { class: 'arrow-link', href: href('ledger', null, 'record') },
        L('Every pick in the ledger', 'Vse izbire v knjigi'),
        h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'),
      ),
    ),
  );
  return { title: L(`No pick #${no}`, `Ni izbire #${no}`), node };
}
