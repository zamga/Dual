// #issue-YYYY-MM-DD: one daily issue, exactly as published at 14:00 Ljubljana time, pick or not.
// An empty issue reads "No quorum today" with the stocks scored and the closest agreement. Shows the
// picks and exits, the texts that went out in both locales, that day's ledger records with their
// hashes and anchor, the approver's removals, and previous/next navigation.
//
// SL: first draft, needs native review.
import { h } from '../dom.js';
import { href } from '../router.js';
import { hashChip, timestamp, sectionHead, signed, quorumBadge } from '../ui.js';
import { ruleLabels } from '../rule.js';
import { indexPicks, isSealedFor, prevNextIssue, nearestIssue, entriesOn, issueTexts, resultOf } from './_records.js';
import { chainRow, anchorLine } from '../charts/chain.js';
import { analyze } from '../core/gsm7.js';
import { formatInZone, LJUBLJANA, isTradingDay, holidayName, weekday } from '../core/calendar.js';
import { fmtUsd } from '../core/format.js';

const DAYS = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  sl: ['nedelja', 'ponedeljek', 'torek', 'sreda', 'četrtek', 'petek', 'sobota'],
};

export async function render(ctx) {
  const { L, fmt, locale } = ctx;
  const date = ctx.params.date;
  const [issues, picks, ledger, meta] = await Promise.all([ctx.data('issues'), ctx.data('picks'), ctx.data('ledger').catch(() => null), ctx.data('meta').catch(() => null)]);
  const byNo = indexPicks(picks);
  const R = ruleLabels(meta, locale);
  const { prev, next, index } = prevNextIssue(issues, date);
  if (index < 0) return noIssue(ctx, date, issues);
  const iss = issues[index];
  const lj = formatInZone(new Date(iss.publishAt), LJUBLJANA);
  const day = DAYS[locale]?.[weekday(date)] ?? DAYS.en[weekday(date)];
  const quorum = !!(iss.buys?.length || iss.renews?.length);
  const nPicks = (iss.buys?.length ?? 0) + (iss.renews?.length ?? 0);
  const title = quorum
    ? nPicks === 1
      ? L('Quorum: 1 pick.', 'Kvorum: 1 izbira.')
      : L(`Quorum: ${nPicks} picks.`, `Kvorum: ${nPicks} ${nPicks === 2 ? 'izbiri' : nPicks < 5 ? 'izbire' : 'izbir'}.`)
    : L('No quorum today.', 'Danes brez kvoruma.');
  const approver = meta?.persons?.find((p) => p.id === iss.approver);
  // what stopped the candidates on a day without a pick, from the counts the issue publishes
  const stoppedBy = (loc) => {
    const v = iss.vetoes ?? {};
    const en = [v.rule || v.llm ? 'vetoes' : null, v.human ? 'the approver' : null, v.capped ? 'the caps' : null].filter(Boolean);
    const sl = [v.rule || v.llm ? 'veti' : null, v.human ? 'odobriteljica' : null, v.capped ? 'omejitve' : null].filter(Boolean);
    const list = loc === 'sl' ? sl : en;
    if (!list.length) return loc === 'sl' ? 'odprte pozicije in premori po zaprtju' : 'open positions and cooldowns';
    const and = loc === 'sl' ? ' in ' : ' and ';
    return list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')}${and}${list.at(-1)}`;
  };
  let secN = 0;
  const idx = () => String(++secN).padStart(2, '0');

  const navLinks = (cls) =>
    h(
      'p',
      { class: ['is-nav', cls] },
      prev ? h('a', { class: 'arrow-link', href: href('issue', prev.date), rel: 'prev' }, h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '←'), L(`#${prev.issueNo} · ${fmt.date(prev.date)}`, `#${prev.issueNo} · ${fmt.date(prev.date)}`)) : h('span', { class: 'muted small' }, L('First issue', 'Prva izdaja')),
      next ? h('a', { class: 'arrow-link', href: href('issue', next.date), rel: 'next' }, L(`#${next.issueNo} · ${fmt.date(next.date)}`, `#${next.issueNo} · ${fmt.date(next.date)}`), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')) : h('span', { class: 'muted small' }, L('Latest issue', 'Zadnja izdaja')),
    );

  // ---- masthead: the issue as published ------------------------------------------------------------------
  const head = h(
    'header',
    { class: 'grid page-masthead is-head' },
    h('p', { class: 'label c-head' }, L(`Issue #${iss.issueNo} · ${day} ${fmt.date(date)} · 14:00 ${iss.tz}`, `Izdaja #${iss.issueNo} · ${day} ${fmt.date(date)} · 14:00 ${iss.tz}`)),
    h('h1', { class: 'display d1 c-head' }, title),
    h(
      'p',
      { class: 'lede c-body masthead__lede' },
      quorum
        ? L(
            `${fmt.int(iss.nScored)} stocks scored. ${nPicks === 1 ? 'One stood' : `${nPicks} stood`} on at least three of the four columns${iss.closest === 4 ? ', the strongest on all four' : ''}, and no veto fired. ${iss.closes?.length ? `${iss.closes.length === 1 ? 'One pick' : `${iss.closes.length} picks`} also closed at the US open.` : ''}`,
            `${fmt.int(iss.nScored)} ocenjenih delnic. ${nPicks === 1 ? 'Ena je stala' : `${nPicks} jih je stalo`} na vsaj treh od štirih stebrov${iss.closest === 4 ? ', najmočnejša na vseh štirih' : ''}, in noben veto se ni sprožil. ${iss.closes?.length ? `${iss.closes.length === 1 ? 'Ena izbira se je' : `${iss.closes.length} izbir se je`} tudi zaprla ob odprtju ameriškega trga.` : ''}`,
          )
        : L(
            `${fmt.int(iss.nScored)} stocks scored. The closest agreement was ${iss.closest}/4${iss.closest >= 3 ? `, but ${stoppedBy('en')} stopped every candidate` : ''}. The issue was published anyway, as every trading day.${iss.closes?.length ? ` ${iss.closes.length === 1 ? 'One pick' : `${iss.closes.length} picks`} closed at the US open, so an exit was texted.` : ' No text went out.'}`,
            `${fmt.int(iss.nScored)} ocenjenih delnic. Največje soglasje je bilo ${iss.closest}/4${iss.closest >= 3 ? `, a ${stoppedBy('sl')} so ustavili vse kandidatke` : ''}. Izdaja je vseeno izšla, kot vsak dan trgovanja.${iss.closes?.length ? ` ${iss.closes.length === 1 ? 'Ena izbira se je' : `${iss.closes.length} izbir se je`} zaprla ob odprtju ameriškega trga, zato je bil poslan izstop.` : ' SMS ni bil poslan.'}`,
          ),
    ),
    h(
      'div',
      { class: 'c-meta masthead__meta is-meta' },
      h(
        'dl',
        { class: 'dl is-dl' },
        h('div', {}, h('dt', {}, L('Published', 'Objavljeno')), h('dd', {}, timestamp([{ at: iss.publishAt, kind: 'published' }], { t: ctx.t, display: `${fmt.date(lj.date)} ${lj.time.slice(0, 5)} ${iss.tz}` }))),
        h('div', {}, h('dt', {}, L('Methodology', 'Metodologija')), h('dd', {}, h('a', { href: href('methodology-changelog') }, `v${iss.methodology ?? meta?.methodology?.at(-1)?.version ?? '1.0'}`))),
        h('div', {}, h('dt', {}, L('Approver', 'Odobritelj')), h('dd', {}, approver ? `${approver.name} · ${L('fictional', 'izmišljeno')}` : L('none: nothing could be issued', 'nihče: ničesar ni bilo mogoče izdati'))),
        h('div', {}, h('dt', {}, L('Ledger record', 'Zapis v knjigi')), h('dd', {}, h('a', { href: href('issue', date, `r${iss.seq}`) }, `#${iss.seq}`), ' ', hashChip(iss.hash, { t: ctx.t }))),
      ),
      navLinks('is-nav--top'),
    ),
  );

  // ---- the day in numbers: four columns and how close they came ------------------------------------------
  const v = iss.vetoes ?? {};
  const funnel = [
    [L('Stocks scored', 'Ocenjenih delnic'), fmt.int(iss.nScored)],
    [L('Closest agreement', 'Največje soglasje'), `${iss.closest}/4`],
    [L(`Candidates past the vetoes`, 'Kandidatk po vetih'), fmt.int(iss.reached ?? 0)],
    [L('Rule vetoes', 'Veti pravil'), fmt.int(v.rule ?? 0)],
    [L('News vetoes', 'Veti novic'), fmt.int(v.llm ?? 0)],
    [L('Removed by the approver', 'Odstranila odobriteljica'), fmt.int(v.human ?? 0)],
    [L('Capped', 'Omejenih'), fmt.int(v.capped ?? 0)],
    [L('Issued', 'Izdanih'), fmt.int(nPicks)],
  ];
  // The columns are the families on the four rules. On a quorum day they show the first pick's real
  // percentiles (unless that pick is still sealed for this viewer); otherwise nothing is implied about
  // which families came close: four hollow columns and no lintel.
  const lead = [...(iss.buys ?? []), ...(iss.renews ?? [])].map((n) => byNo.get(n)).find(Boolean);
  const leadOpen = lead && !isSealedFor(lead, ctx.tier, byNo);
  const agreeSet = new Set(leadOpen ? lead.agreeing : []);
  const colEls = [0, 1, 2, 3].map((k) => {
    const f = 'ABCD'[k];
    const pct = leadOpen ? lead.families?.[f]?.pct : null;
    const reach = leadOpen ? agreeSet.has(f) : false;
    const col = h('span', { class: ['is-col', reach ? 'is-reach' : 'is-short'] }, leadOpen && Number.isFinite(pct) ? h('b', { class: 'is-col__v' }, `${f} ${fmt.rank(pct)}`) : h('b', { class: 'is-col__v' }, f));
    col.style.setProperty('--k', String(k));
    col.style.setProperty('--h', String(leadOpen && Number.isFinite(pct) ? Math.max(0.02, pct) : quorum ? 0.62 : 0.5));
    return col;
  });
  let lintel = null;
  if (quorum) {
    lintel = h('span', { class: 'is-lintel' });
    const ks = [...agreeSet].map((f) => 'ABCD'.indexOf(f));
    lintel.style.setProperty('--from', String(ks.length ? Math.min(...ks) : 0));
    lintel.style.setProperty('--to', String(ks.length ? Math.max(...ks) : 3));
  } else lintel = h('span', { class: 'is-nolintel' });
  const cols = h('div', { class: ['is-cols', quorum && !leadOpen && 'is-sealed'], 'aria-hidden': 'true' }, colEls, lintel);
  const figText = quorum
    ? leadOpen
      ? L(
          `#${lead.no} ${lead.ticker}: ${lead.agreeing.join(', ')} placed it ${R.inTop}${lead.agreeing.length < 4 ? `; ${'ABCD'.split('').filter((f) => !agreeSet.has(f)).map((f) => `${f} at ${fmt.rank(lead.families?.[f]?.pct)}`).join(', ')}` : ''}. The lintel rests on the columns that qualified.`,
          `#${lead.no} ${lead.ticker}: ${lead.agreeing.join(', ')} so jo uvrstile ${R.inTop}${lead.agreeing.length < 4 ? `; ${'ABCD'.split('').filter((f) => !agreeSet.has(f)).map((f) => `${f} na ${fmt.rank(lead.families?.[f]?.pct)}`).join(', ')}` : ''}. Preklada leži na stebrih, ki so se uvrstili.`,
        )
      : L(`At least three families placed a stock ${R.inTop}. Which ones stays sealed until the pick closes.`, `Vsaj tri družine so delnico uvrstile ${R.inTop}. Katere, ostane zapečateno do zaprtja izbire.`)
    : L(`The strongest stock reached ${iss.closest} of the four columns. No lintel, no text. Which families came close is not published for non-picks.`, `Najmočnejša delnica je dosegla ${iss.closest} od štirih stebrov. Brez preklade ni SMS. Katere družine so bile blizu, za neizbrane delnice ne objavljamo.`);
  if (R.topPct) cols.style.setProperty('--thr', String(R.topPct));
  const daySec = h(
    'section',
    { class: 'section grid rec-sec is-day', 'aria-labelledby': 'is-day-h' },
    ...sectionHead({ index: idx(), kicker: L('The day', 'Dan'), title: quorum ? L('The columns met.', 'Stebri so se srečali.') : L(`Closest: ${iss.closest}/4.`, `Največ: ${iss.closest}/4.`), id: 'is-day-h', size: 'd3' }),
    h(
      'figure',
      { class: 'c-full flush is-fig' },
      cols,
      h(
        'figcaption',
        { class: 'is-figcap' },
        figText,
      ),
    ),
    h('dl', { class: 'c-wide stats boxed is-funnel' }, funnel.map(([k, val]) => h('div', { class: 'stat' }, h('dt', { class: 'stat__k' }, k), h('dd', { class: 'stat__v' }, val)))),
    iss.crashSwitch ? h('p', { class: 'c-body rec-note' }, L('Crash switch on: trend was suspended; the other three families all had to agree.', 'Stikalo za zlom je vklopljeno: trend je bil izključen; strinjati so se morale vse tri druge družine.')) : null,
  );

  // ---- picks and exits ---------------------------------------------------------------------------------------
  const pickNos = [...(iss.buys ?? []), ...(iss.renews ?? [])];
  const card = (p, role) => {
    const sealed = isSealedFor(p, ctx.tier, byNo);
    const kindW = role === 'close' ? L('CLOSE', 'ZAPRTJE') : p.kind === 'RENEW' ? L('RENEW', 'PODALJŠANJE') : L('BUY', 'NAKUP');
    const res = resultOf(p);
    return h(
      'li',
      { class: ['is-card', `is-card--${role}`, sealed && 'is-sealed'] },
      h('p', { class: 'is-card__top' }, h('span', { class: 'label' }, `${kindW} · #${p.no}`), role !== 'close' ? quorumBadge(p.agreement, { t: ctx.t }) : null),
      sealed
        ? h('p', { class: 'is-card__stock' }, h('span', { class: 'tag' }, ctx.t('common.sealed')), ' ', hashChip(p.commit, { t: ctx.t }))
        : h('p', { class: 'is-card__stock' }, h('span', { class: 'ticker is-card__t' }, p.ticker), h('span', { class: 'small muted' }, ` ${p.name}`)),
      role === 'close'
        ? h(
            'p',
            { class: 'is-card__res' },
            h('span', { class: 'label' }, L('Excess vs S&P 500 TR', 'Presežek nad S&P 500 TR')),
            signed(p.outcome?.excess, { fmt }),
            h('span', { class: 'small muted' }, L(`net ${fmt.pct(p.outcome?.net, { sign: true })} · exit ${fmtUsd(p.exit?.open, { locale })}`, `neto ${fmt.pct(p.outcome?.net, { sign: true })} · izstop ${fmtUsd(p.exit?.open, { locale })}`)),
          )
        : h(
            'p',
            { class: 'small is-card__plan' },
            L(`Entry: US open ${fmt.date(p.entry?.date)}${sealed ? '' : ` · ${fmtUsd(p.entry?.open, { locale })}`}. Exit: US open ${fmt.date(p.exitPlanned)}.`, `Vstop: odprtje ZDA ${fmt.date(p.entry?.date)}${sealed ? '' : ` · ${fmtUsd(p.entry?.open, { locale })}`}. Izstop: odprtje ZDA ${fmt.date(p.exitPlanned)}.`),
            !sealed && res && !res.final ? h('span', { class: 'muted' }, L(` Marked ${fmt.date(res.date)}: `, ` Vrednoteno ${fmt.date(res.date)}: `), signed(res.excess, { fmt })) : null,
          ),
      h('a', { class: 'arrow-link', href: href('pick', p.no) }, sealed ? L('The sealed record', 'Zapečaten zapis') : L('Research note', 'Raziskovalni zapis'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')),
    );
  };
  const picksList = pickNos.map((n) => byNo.get(n)).filter(Boolean);
  const closesList = (iss.closes ?? []).map((n) => byNo.get(n)).filter(Boolean);
  const pickSec =
    picksList.length || closesList.length
      ? h(
          'section',
          { class: 'section grid rec-sec is-picks', 'aria-labelledby': 'is-pk-h' },
          ...sectionHead({ index: idx(), kicker: L('In this issue', 'V tej izdaji'), title: picksList.length ? L('Picks and exits.', 'Izbire in izstopi.') : L('An exit, no pick.', 'Izstop, brez izbire.'), id: 'is-pk-h', size: 'd3' }),
          picksList.length ? h('ul', { class: 'c-wide is-cards' }, picksList.map((p) => card(p, 'pick'))) : null,
          closesList.length ? h('div', { class: 'c-wide' }, h('p', { class: 'label is-sub' }, L('Closed at the US open today', 'Zaprto ob današnjem odprtju ZDA')), h('ul', { class: 'is-cards' }, closesList.map((p) => card(p, 'close')))) : null,
          h('p', { class: 'c-body rec-note' }, ctx.t('common.notAdvice')),
        )
      : null;

  // ---- the texts ----------------------------------------------------------------------------------------------
  const texts = issueTexts(iss, byNo);
  const textSec = h(
    'section',
    { class: 'section grid rec-sec is-texts', 'aria-labelledby': 'is-tx-h' },
    ...sectionHead({ index: idx(), kicker: L('The texts', 'Sporočila SMS'), title: texts.length ? L(`${texts.length === 1 ? 'One text' : `${texts.length} texts`} at 14:00.`, `${texts.length === 1 ? 'En SMS' : `${texts.length} SMS`} ob 14:00.`) : L('Nobody’s phone moved.', 'Noben telefon se ni zganil.'), id: 'is-tx-h', size: 'd3' }),
    texts.length
      ? h(
          'div',
          { class: 'c-wide is-textlist' },
          texts.map((tx) => {
            const sealed = tx.kind !== 'CLOSE' && isSealedFor(tx.pick, ctx.tier, byNo);
            return h(
              'div',
              { class: 'is-textrow' },
              h('p', { class: 'label is-textrow__k' }, `${tx.kind === 'CLOSE' ? L('CLOSE', 'ZAPRTJE') : tx.kind === 'RENEW' ? L('RENEW', 'PODALJŠANJE') : L('BUY', 'NAKUP')} · #${tx.no}`),
              ['en', 'sl'].map((loc) => {
                const text = tx.text?.[loc];
                if (!text) return null;
                if (sealed) return h('p', { class: 'is-sms is-sms--sealed small', lang: loc }, h('span', { class: 'label' }, loc.toUpperCase()), L(' Sent to subscribers at 14:00; the text names the ticker, so it stays sealed until the pick closes.', ' Poslano naročnikom ob 14:00; sporočilo vsebuje oznako, zato ostane zapečateno do zaprtja.'));
                const a = analyze(text);
                return h(
                  'figure',
                  { class: 'is-sms', lang: loc },
                  h('p', { class: 'sms-plain' }, text),
                  h('figcaption', { class: 'mono is-sms__n' }, `${loc.toUpperCase()} · ${a.encoding === 'GSM-7' ? L(`${a.septets}/160 GSM-7 · ${a.segments} segment`, `${a.septets}/160 GSM-7 · ${a.segments} segment`) : `${a.units}/70 UCS-2`}`),
                );
              }),
            );
          }),
        )
      : h('p', { class: 'c-body lede is-silent' }, L('No BUY, CLOSE or RENEW in this issue, so no SMS. The web issue, the weekly email and this page are the whole record of the day.', 'V tej izdaji ni bilo NAKUPA, ZAPRTJA ali PODALJŠANJA, zato ni bilo SMS. Spletna izdaja, tedenska e-pošta in ta stran so celoten zapis dneva.')),
  );

  // ---- human removals -----------------------------------------------------------------------------------------
  const humans = iss.humanVetoes ?? [];
  const humanSec = humans.length
    ? h(
        'section',
        { class: 'section grid rec-sec is-human', 'aria-labelledby': 'is-hv-h' },
        ...sectionHead({ index: idx(), kicker: L('The approver', 'Odobriteljica'), title: L('Removed, with a reason.', 'Odstranjeno, z razlogom.'), id: 'is-hv-h', size: 'd3' }),
        h(
          'ul',
          { class: 'c-body boxed is-hv' },
          humans.map((hv) => {
            const who = meta?.persons?.find((p) => p.id === hv.by);
            return h('li', {}, h('p', {}, hv.reason?.[locale] ?? hv.reason?.en ?? ''), h('p', { class: 'small muted' }, `${who ? `${who.name} (${L('fictional', 'izmišljeno')})` : hv.by} · ${hv.code ?? ''}`));
          }),
        ),
        h('p', { class: 'c-meta rec-note' }, L('The approver can remove a candidate, never add or substitute one. Removals are counted in the ledger. The removed stock is not named.', 'Odobritelj lahko kandidatko odstrani, nikoli pa doda ali zamenja. Odstranitve so štete v knjigi. Odstranjena delnica ni imenovana.')),
      )
    : null;

  // ---- the ledger records of the day ----------------------------------------------------------------------------
  const dayEntries = entriesOn(ledger?.entries, date);
  const sealedNos = new Set(picks.filter((p) => isSealedFor(p, 'free', byNo)).map((p) => p.no));
  const anchor = ledger?.anchors?.find((a) => a.date === date);
  const ledgerSec = h(
    'section',
    { class: 'section grid chamber ruled rec-sec is-ledger', id: 'records', 'aria-labelledby': 'is-lg-h' },
    ...sectionHead({ index: idx(), kicker: L('The ledger', 'Knjiga'), title: L('This day’s records.', 'Zapisi tega dne.'), id: 'is-lg-h', size: 'd3' }),
    h(
      'p',
      { class: 'lede c-body' },
      L(
        `${dayEntries.length === 1 ? 'One record' : `${dayEntries.length} records`}, each chained to the one before. Sealed records carry only a commitment; a CLOSE reveals what was sealed. Verify the whole chain on the ledger.`,
        `${dayEntries.length === 1 ? 'En zapis' : `${dayEntries.length} zapisov`}, vsak povezan s prejšnjim. Zapečateni zapisi nosijo samo zavezo; ZAPRTJE razkrije, kar je bilo zapečateno. Celotno verigo preverite v knjigi.`,
      ),
    ),
    h('div', { class: 'c-meta is-anchor' }, anchorLine(anchor, ctx)),
    h('ol', { class: 'chain c-full flush is-chain' }, dayEntries.map((e) => chainRow(e, ctx, { sealedNos, highlight: ctx.route.section ? Number(ctx.route.section.replace(/^r/, '')) : null }))),
    h('p', { class: 'c-body' }, h('a', { class: 'arrow-link', href: href('ledger', null, 'chain') }, L('Verify every hash in your browser', 'Preverite vse vrednosti v brskalniku'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'))),
  );

  const node = h(
    'div',
    { class: 'page issue' },
    head,
    daySec,
    pickSec,
    textSec,
    humanSec,
    ledgerSec,
    h('nav', { class: 'grid is-bottomnav', 'aria-label': L('Neighbouring issues', 'Sosednje izdaje') }, h('div', { class: 'c-wide' }, navLinks('is-nav--bottom'))),
  );
  return { title: L(`Issue #${iss.issueNo} · ${fmt.date(date)}`, `Izdaja #${iss.issueNo} · ${fmt.date(date)}`), node };
}

// A date with no issue: a weekend, a US holiday, or outside the record.
function noIssue(ctx, date, issues) {
  const { L, fmt } = ctx;
  const near = nearestIssue(issues, date);
  const first = issues[0]?.date;
  const last = issues.at(-1)?.date;
  const holiday = holidayName(date);
  const reason =
    first && date < first
      ? L(`The sealed record starts on ${fmt.date(first)}.`, `Zapečaten zapis se začne ${fmt.date(first)}.`)
      : last && date > last
        ? L(`The latest issue is ${fmt.date(last)}. Issues publish at 14:00 Ljubljana time on US trading days.`, `Zadnja izdaja je ${fmt.date(last)}. Izdaje izidejo ob 14:00 po ljubljanskem času na dneve trgovanja v ZDA.`)
        : holiday
          ? L(`US markets were closed (${holiday}), so there was no issue.`, `Ameriški trgi so bili zaprti (${holiday}), zato izdaje ni bilo.`)
          : !isTradingDay(date)
            ? L('Not a US trading day, so there was no issue.', 'To ni bil dan trgovanja v ZDA, zato izdaje ni bilo.')
            : L('There is no issue for this date.', 'Za ta datum ni izdaje.');
  const node = h(
    'section',
    { class: 'grid state' },
    h('p', { class: 'label c-head' }, L(`Issue · ${fmt.date(date)}`, `Izdaja · ${fmt.date(date)}`)),
    h('h1', { class: 'display d2 c-head' }, L('No issue on this date.', 'Na ta datum ni izdaje.')),
    h('p', { class: 'lede c-body' }, reason),
    near ? h('p', { class: 'c-body' }, h('a', { class: 'arrow-link', href: href('issue', near.date) }, L(`The nearest issue: #${near.issueNo}, ${fmt.date(near.date)}`, `Najbližja izdaja: #${near.issueNo}, ${fmt.date(near.date)}`), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'))) : null,
  );
  return { title: L('No issue', 'Ni izdaje'), node };
}
