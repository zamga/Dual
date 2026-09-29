// #app: the subscriber's desk. Today's issue (or the latest) with the texts it sent, the open picks
// (sealed for Free viewers, revealed for Signal and Research: tiers differ in breadth, never in timing),
// the channel settings (demo: in memory), and the next issue with a live countdown.
//
// Demo: the viewer is a fictional reader of the "view as" tier; before launch there are no subscribers,
// and the page says so. Live: GET /api/me decides the tier; picks.json arrives redacted by the server.
//
// SL: first draft, needs native review.
import { h } from '../dom.js';
import { href } from '../router.js';
import { masthead } from './_content.js';
import { quorumBadge, hashChip, signed, timestamp, smsBody } from '../ui.js';
import { indexPicks, isSealedFor, issueCounts } from './_records.js';
import { loadMe, tierOf, channelsPanel, modeNote, signInPanel } from './_member.js';
import { launchInfo, smsModel } from './_join.js';
import { analyze } from '../core/gsm7.js';
import { fmtUsd } from '../core/format.js';
import { formatInZone, LJUBLJANA, nextIssueSlot, issueSlot, countTradingDays } from '../core/calendar.js';
import { createClock, remaining, clockMode } from '../clock.js';

const WEEKDAY = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  sl: ['Nedelja', 'Ponedeljek', 'Torek', 'Sreda', 'Četrtek', 'Petek', 'Sobota'],
};

export async function render(ctx) {
  const { L, locale, fmt } = ctx;
  const [issues, picks, meta, backtest] = await Promise.all([ctx.data('issues'), ctx.data('picks'), ctx.data('meta').catch(() => null), ctx.data('backtest').catch(() => null)]);
  let me = null;
  let meErr = null;
  try {
    me = await loadMe(ctx);
  } catch (e) {
    meErr = e;
  }
  const live = ctx.mode === 'live';
  const signedIn = !!me?.authenticated;
  const tier = signedIn ? tierOf(ctx, me) : 'free';
  const launch = launchInfo(backtest);
  const byNo = indexPicks(picks);
  const clock = ctx.clock ?? (meta?.asOf ? createClock({ asOf: meta.asOf, flagsNow: ctx.flags?.now }) : null);
  const now = clock ? clock.now() : new Date();
  const today = formatInZone(now, LJUBLJANA).date;

  // Today's issue once it is out, else the latest one published.
  const published = issues.filter((r) => new Date(r.publishAt).getTime() <= now.getTime());
  const issue = published.at(-1) ?? issues.at(-1);
  const isToday = issue?.date === today;
  const day = issue ? WEEKDAY[locale === 'sl' ? 'sl' : 'en'][new Date(`${issue.date}T12:00:00Z`).getUTCDay()] : '';
  const nItems = issue ? (issue.buys?.length ?? 0) + (issue.renews?.length ?? 0) : 0;
  const nCloses = issue?.closes?.length ?? 0;
  const tierName = { free: 'Ledger', signal: 'Signal', research: 'Research' }[tier];

  const pre = !launch.ready; // before launch no text is sent
  const k = issue ? issueCounts(issue, meta?.rule?.minAgree ?? 3) : null;
  const h1Text = issue
    ? issue.quorum
      ? L(`${isToday ? 'Today' : day}: a quorum.`, `${isToday ? 'Danes' : day}: kvorum.`)
      : k.quorumMet
        ? L(`${isToday ? 'Today' : day}: no new pick.`, `${isToday ? 'Danes' : day}: brez nove izbire.`)
        : L(`${isToday ? 'Today' : day}: no quorum.`, `${isToday ? 'Danes' : day}: brez kvoruma.`)
    : L('No issue yet.', 'Še ni izdaje.');
  // a day without a new pick, in words: met the rule but held back, or short of the rule
  const quiet = (loc) =>
    k?.quorumMet
      ? loc === 'sl'
        ? `${fmt.int(k.reached)} jih je izpolnilo pravilo, a nobene ni bilo mogoče izdati (že odprte, omejene ali v premoru)`
        : `${fmt.int(k.reached)} met the rule, but none could be issued (already open, capped or cooling down)`
      : loc === 'sl'
        ? `največje soglasje je bilo ${issue?.closest ?? 0}/4`
        : `the closest reached ${issue?.closest ?? 0}/4`;

  const parts = [];
  if (issue?.buys?.length) parts.push(L(`${issue.buys.length} new ${issue.buys.length === 1 ? 'pick' : 'picks'}`, `${issue.buys.length} ${issue.buys.length === 1 ? 'nova izbira' : 'nove izbire'}`));
  if (issue?.renews?.length) parts.push(L(`${issue.renews.length} ${issue.renews.length === 1 ? 'renewal' : 'renewals'}`, `${issue.renews.length} ${issue.renews.length === 1 ? 'podaljšanje' : 'podaljšanja'}`));
  if (nCloses) parts.push(L(`${nCloses} ${nCloses === 1 ? 'close' : 'closes'}`, `${nCloses} ${nCloses === 1 ? 'zaprtje' : 'zaprtja'}`));
  const lede = issue
    ? L(
        `Issue #${issue.issueNo}, ${fmt.date(issue.date)}, published 14:00:00 ${issue.tz}. ${fmt.int(issue.nScored)} stocks scored; ${issue.quorum || nCloses ? `${parts.join(', ')}.` : `${quiet('en')}, so ${pre ? 'no text was due' : 'nothing was texted'}.`}`,
        `Izdaja #${issue.issueNo}, ${fmt.date(issue.date)}, objavljena ob 14:00:00 ${issue.tz}. Ocenjenih ${fmt.int(issue.nScored)} delnic; ${issue.quorum || nCloses ? `${parts.join(', ')}.` : `${quiet('sl')}, zato ${pre ? 'SMS ni bil predviden' : 'ni bilo SMS'}.`}`,
      )
    : '';

  // ---- the next issue, counting down (or pinned to the end of the data) --------------------------------------
  const next = nextIssueSlot(now);
  const leftEl = h('span', { class: 'app-next__left mono' });
  const drawLeft = () => {
    const t = clock ? clock.now() : new Date();
    const ms = new Date(next.publishAtUtc).getTime() - t.getTime();
    leftEl.textContent = ms > 0 ? L(`in ${remaining(ms).text}`, `čez ${remaining(ms).text}`) : L('publishing', 'objava');
  };
  drawLeft();
  const mode = clock ? clockMode(clock) : 'live';
  const timer = mode === 'live' || mode === 'override' ? setInterval(drawLeft, 20000) : 0;
  const nextBox = h(
    'div',
    { class: 'app-next' },
    h('p', { class: 'label' }, L('Next issue', 'Naslednja izdaja')),
    h('p', { class: 'app-next__when' }, h('span', { class: 'mono' }, `${WEEKDAY[locale === 'sl' ? 'sl' : 'en'][new Date(`${next.issueDate}T12:00:00Z`).getUTCDay()].slice(0, 3)} ${fmt.dm(next.issueDate)} · 14:00 ${next.tzLabel}`), leftEl),
    h('p', { class: 'small muted' }, mode === 'pinned' ? L('Demo clock: pinned to the end of the data.', 'Demo ura: ustavljena ob koncu podatkov.') : L(`US open ${next.usOpenLocal}, ${next.minutesToOpen} minutes later. Most days: no new pick, no text.`, `Odprtje ZDA ob ${next.usOpenLocal}, ${next.minutesToOpen} minut pozneje. Večino dni: brez nove izbire, brez SMS.`)),
  );

  const metaCol = h(
    'div',
    { class: 'app-meta' },
    nextBox,
    !live
      ? h(
          'div',
          { class: 'app-pre' },
          h('p', { class: 'label' }, launch.ready ? L('Demo reader', 'Demo bralec') : L('Pre-launch preview', 'Predogled pred zagonom')),
          h('p', { class: 'small' }, launch.ready ? L(`A fictional ${tierName} reader. Switch “View as” to see the other tiers.`, `Izmišljeni bralec paketa ${tierName}. Z »Pogled kot« vidite druge pakete.`) : L(`No subscriber exists yet. This is what a ${tierName} reader will see; switch “View as” for the other tiers.`, `Naročnikov še ni. Tako bo videl bralec paketa ${tierName}; z »Pogled kot« vidite druge pakete.`)),
        )
      : null,
  );

  const head = masthead({
    kicker: signedIn ? L(`Your issue desk · ${tierName}`, `Vaša izdaja · ${tierName}`) : L('Your issue desk', 'Vaša izdaja'),
    title: h1Text,
    lede,
    meta: metaCol,
  });

  // ---- 01 the issue: each record with the text it sent ------------------------------------------------------
  const recs = issue ? [...(issue.buys ?? []), ...(issue.renews ?? [])].map((no) => byNo.get(no)).filter(Boolean) : [];
  const closes = issue ? (issue.closes ?? []).map((no) => byNo.get(no)).filter(Boolean) : [];
  const smsLocale = locale;

  const itemRow = (p, kind) => {
    const sealed = kind !== 'CLOSE' && (isSealedFor(p, tier, byNo) || !p.ticker);
    const text = kind === 'CLOSE' ? p.closeSms?.[smsLocale] ?? p.closeSms?.en : p.sms?.[smsLocale] ?? p.sms?.en;
    const model = text ? smsModelOf(text) : null;
    const slot = issueSlot(issue.date);
    const kindWord = { BUY: L('Buy', 'Nakup'), RENEW: L('Renew', 'Podaljšanje'), CLOSE: L('Close', 'Zaprtje') }[kind];
    const who = sealed
      ? h('div', { class: 'app-item__who' }, h('span', { class: 'tag' }, ctx.t('common.sealed')), hashChip(p.commit, { t: ctx.t }))
      : h('div', { class: 'app-item__who' }, h('a', { class: 'ticker app-item__ticker', href: href('stock', p.ticker) }, p.ticker), h('span', { class: 'small muted' }, p.name));
    const res = p.outcome ?? p.mark;
    const facts =
      kind === 'CLOSE'
        ? [
            [L('Entry', 'Vstop'), `${fmt.date(p.entry?.date ?? p.issueDate)} · ${fmtUsd(p.entry?.open, { locale })}`],
            [L('Exit, US open', 'Izstop, odprtje ZDA'), `${fmt.date(p.outcome?.exitDate ?? p.exitPlanned)} · ${fmtUsd(p.outcome?.exitOpen, { locale })}`],
            [L('Excess vs S&P 500 TR', 'Presežek proti S&P 500 TR'), p.outcome ? signed(p.outcome.excess, { fmt }) : '–'],
          ]
        : [
            [L('Entry', 'Vstop'), L(`US open ${fmt.dm(p.entry?.date ?? issue.date)} (${slot.usOpenLocal} ${slot.tzLabel})`, `odprtje ZDA ${fmt.dm(p.entry?.date ?? issue.date)} (${slot.usOpenLocal} ${slot.tzLabel})`)],
            [L('Exit', 'Izstop'), L(`US open ${fmt.dm(p.exitPlanned)}, day 21`, `odprtje ZDA ${fmt.dm(p.exitPlanned)}, dan 21`)],
            sealed ? [L('Revealed', 'Razkrito'), L('when the pick closes', 'ob zaprtju izbire')] : [L(`Excess to ${fmt.dm(res?.date ?? issue.date)}`, `Presežek do ${fmt.dm(res?.date ?? issue.date)}`), res ? h('span', { class: 'lg-mtm' }, signed(res.excess, { fmt })) : '–'],
          ];
    const smsCol = sealed
      ? h(
          'p',
          { class: 'small muted app-item__nosms' },
          pre
            ? L('Signal and Research readers get this text at 14:00:00 once SMS alerts launch (none before). Free readers see the record sealed until it closes.', 'Bralci paketov Signal in Research ta SMS prejmejo ob 14:00:00, ko se obvestila SMS zaženejo (prej ne). Brezplačni bralci vidijo zapis zapečaten do zaprtja.')
            : L('Signal and Research readers got this text at 14:00:00. Free readers see the record sealed until it closes.', 'Bralci paketov Signal in Research so ta SMS dobili ob 14:00:00. Brezplačni bralci vidijo zapis zapečaten do zaprtja.'),
        )
      : text
        ? h('div', { class: 'app-item__sms' }, h('p', { class: 'sms' }, smsBody(text)), h('p', { class: 'app-item__smsmeta mono' }, `14:00:00 ${slot.tzLabel} · ${model.label}`))
        : null;
    return h(
      'article',
      { class: ['grid', 'app-item', sealed && 'is-sealed'], 'aria-label': `${kindWord} #${p.no}` },
      h(
        'div',
        { class: 'c-b1 app-item__id' },
        h('p', { class: 'app-item__no' }, h('a', { class: 'mono', href: href('pick', p.no) }, `#${p.no}`), h('span', { class: 'label' }, kindWord), kind === 'RENEW' && p.priorNo ? h('span', { class: 'small muted' }, L(`of #${p.priorNo}`, `od #${p.priorNo}`)) : null, kind !== 'CLOSE' ? quorumBadge(p.agreement, { t: ctx.t }) : null),
        who,
      ),
      h('dl', { class: 'c-b2 dl boxed app-item__facts' }, facts.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))),
      h('div', { class: 'c-b3 app-item__right' }, smsCol, h('a', { class: 'arrow-link', href: href('pick', p.no) }, L('The research note', 'Raziskovalni zapisek'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'))),
    );
  };

  const issueSec = h(
    'section',
    { class: 'grid rec-sec app-sec app-issue', id: 'issue', 'aria-labelledby': 'app-is-h' },
    h('p', { class: 'sec-index c-margin', 'aria-hidden': 'true' }, '01'),
    h(
      'div',
      { class: 'sec-head c-head' },
      h('p', { class: 'label' }, issue ? L(`Issue #${issue.issueNo} · ${fmt.date(issue.date)}`, `Izdaja #${issue.issueNo} · ${fmt.date(issue.date)}`) : ''),
      h(
        'h2',
        { class: 'display d3', id: 'app-is-h' },
        !(recs.length + closes.length)
          ? L('Nothing to text.', 'Nič za SMS.')
          : tier === 'free'
            ? L(`${recs.length + closes.length === 1 ? 'One record' : `${recs.length + closes.length} records`} at 14:00.`, `${recs.length + closes.length === 1 ? 'En zapis' : `${recs.length + closes.length} zapisi`} ob 14:00.`)
            : L(`${recs.length + closes.length === 1 ? 'One text' : `${recs.length + closes.length} texts`} ${pre ? 'due ' : ''}at 14:00.`, `${recs.length + closes.length === 1 ? 'En SMS' : `${recs.length + closes.length} SMS`} ${pre ? 'predviden ' : ''}ob 14:00.`),
      ),
    ),
    issue ? h('p', { class: 'c-meta app-issue__ts' }, timestamp([{ at: issue.publishAt, kind: 'published' }], { t: ctx.t }), ' ', h('a', { class: 'arrow-link', href: href('issue', issue.date) }, L('The full issue', 'Celotna izdaja'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'))) : null,
    recs.length + closes.length
      ? h('div', { class: 'c-full flush app-items' }, ...recs.map((p) => itemRow(p, p.kind)), ...closes.map((p) => itemRow(p, 'CLOSE')))
      : h(
          'div',
          { class: 'c-body app-empty' },
          h(
            'p',
            { class: 'lede' },
            L(
              `${k?.quorumMet ? 'No new pick' : 'No quorum'}: ${fmt.int(issue?.nScored ?? 0)} stocks scored; ${quiet('en')}. The issue was published anyway, and ${pre ? 'no text was due' : 'no text went out'}.`,
              `${k?.quorumMet ? 'Brez nove izbire' : 'Brez kvoruma'}: ocenjenih ${fmt.int(issue?.nScored ?? 0)} delnic; ${quiet('sl')}. Izdaja je vseeno izšla, ${pre ? 'SMS ni bil predviden' : 'SMS ni bil poslan'}.`,
            ),
          ),
        ),
  );

  // ---- 02 open picks, day x of 21 ----------------------------------------------------------------------------
  const open = picks.filter((p) => p.status === 'open').sort((a, b) => (a.no < b.no ? 1 : -1));
  const asOf = meta?.asOf ?? issue?.date ?? today;
  const track = (d) =>
    h(
      'span',
      { class: 'app-track', role: 'img', 'aria-label': L(`day ${d} of 21`, `dan ${d} od 21`) },
      Array.from({ length: 21 }, (_, i) => h('i', { class: [i < d && 'is-on', (i + 1) % 7 === 0 && 'is-wk'] })),
    );
  const openRows = open.map((p) => {
    const sealed = isSealedFor(p, tier, byNo) || !p.ticker;
    const d = Math.max(1, Math.min(21, countTradingDays(p.entry?.date ?? p.issueDate, asOf) + 1));
    return h(
      'tr',
      { class: ['app-row', sealed && 'is-sealed'] },
      h('th', { scope: 'row', class: 'app-c-no' }, h('a', { class: 'mono', href: href('pick', p.no) }, `#${p.no}`), h('span', { class: 'label' }, p.kind === 'RENEW' ? L('renew', 'podalj.') : L('buy', 'nakup'))),
      h('td', { class: 'app-c-stock', dataset: { label: L('Stock', 'Delnica') } }, sealed ? h('span', { class: 'app-sealed' }, h('span', { class: 'tag' }, ctx.t('common.sealed')), hashChip(p.commit, { t: ctx.t })) : h('span', { class: 'app-stock' }, h('a', { class: 'ticker', href: href('stock', p.ticker) }, p.ticker), h('span', { class: 'small muted app-name' }, p.name))),
      h('td', { class: 'app-c-q', dataset: { label: L('Models', 'Modeli') } }, quorumBadge(p.agreement, { t: ctx.t })),
      h('td', { class: 'app-c-day', dataset: { label: L('Day', 'Dan') } }, track(d), h('span', { class: 'mono app-day' }, `${d}/21`)),
      h('td', { class: 'num app-c-exit', dataset: { label: L('Exit', 'Izstop') } }, fmt.date(p.exitPlanned)),
      h('td', { class: 'num app-c-x', dataset: { label: L('Excess so far', 'Presežek doslej') } }, sealed || !p.mark ? h('span', { class: 'muted' }, '–') : h('span', { class: 'lg-mtm' }, signed(p.mark.excess, { fmt }))),
    );
  });
  const openSec = h(
    'section',
    { class: 'grid rec-sec app-sec app-open', id: 'open', 'aria-labelledby': 'app-op-h' },
    h('p', { class: 'sec-index c-margin', 'aria-hidden': 'true' }, '02'),
    h('div', { class: 'sec-head c-head' }, h('p', { class: 'label' }, L(`Marked to the ${fmt.date(asOf)} close`, `Vrednoteno ob zaprtju ${fmt.date(asOf)}`)), h('h2', { class: 'display d3', id: 'app-op-h' }, L(`${open.length} open ${open.length === 1 ? 'pick' : 'picks'}.`, `${open.length} ${open.length === 1 ? 'odprta izbira' : 'odprtih izbir'}.`))),
    h(
      'p',
      { class: 'c-body small muted' },
      tier === 'free'
        ? L('You are viewing as Free: open picks stay sealed until they close. Their number, time and commitment hash are public now; the ticker is revealed at close.', 'Gledate kot Brezplačno: odprte izbire ostanejo zapečatene do zaprtja. Številka, čas in zaveza so javni že zdaj; oznaka se razkrije ob zaprtju.')
        : L('Each pick runs 21 trading days from the US open on its issue day; the exit is set at entry. Excess so far is marked to the latest close and is not a result until day 21.', 'Vsaka izbira traja 21 trgovalnih dni od odprtja ZDA na dan izdaje; izstop je določen ob vstopu. Presežek doslej je vrednoten ob zadnjem zaprtju in ni rezultat do 21. dne.'),
    ),
    open.length
      ? h(
          'div',
          { class: 'c-wide app-table-wrap' },
          h(
            'table',
            { class: 'table app-table' },
            h('caption', { class: 'visually-hidden' }, L('Open picks', 'Odprte izbire')),
            h('thead', {}, h('tr', {}, [L('No.', 'Št.'), L('Stock', 'Delnica'), L('Models', 'Modeli'), L('Day of 21', 'Dan od 21'), L('Exit', 'Izstop'), L('Excess so far', 'Presežek doslej')].map((x, i) => h('th', { scope: 'col', class: i >= 4 ? 'num' : null }, x)))),
            h('tbody', {}, openRows),
          ),
        )
      : h('p', { class: 'c-body' }, L('No open picks.', 'Ni odprtih izbir.')),
  );

  // ---- 03 channels ---------------------------------------------------------------------------------------------
  const chWrap = h('div', { class: 'c-body app-ch' });
  chWrap.replaceChildren(signedIn ? channelsPanel(ctx, me, {}) : signInPanel(ctx, { lead: meErr ? L('The server did not answer; sign in again.', 'Strežnik se ni odzval; znova se prijavite.') : L('Sign in to see your channels.', 'Prijavite se za svoje kanale.') }));
  const optIn = me?.sms?.on ? smsModel('OPT_IN', locale, { token: 'Xy7Kq2Lm' }) : null;
  const chSec = h(
    'section',
    { class: 'grid rec-sec app-sec app-channels', id: 'channels', 'aria-labelledby': 'app-ch-h' },
    h('p', { class: 'sec-index c-margin', 'aria-hidden': 'true' }, '03'),
    h('div', { class: 'sec-head c-head' }, h('p', { class: 'label' }, L('Channels', 'Kanali')), h('h2', { class: 'display d3', id: 'app-ch-h' }, L('How the issue reaches you.', 'Kako vas doseže izdaja.'))),
    chWrap,
    h(
      'aside',
      { class: 'c-meta app-ch__aside' },
      h('p', { class: 'label' }, L('The rules', 'Pravila')),
      h('p', { class: 'small' }, L('Same content, same second, every tier. Texts only between 08:00 and 21:00 where you are; the 14:00 slot is always inside.', 'Ista vsebina, ista sekunda, vsak paket. SMS samo med 08:00 in 21:00 po vašem času; termin ob 14:00 je vedno znotraj.')),
      h('p', { class: 'small' }, L('Every text ends with your own stop link. One tap stops all of them.', 'Vsak SMS se konča z vašo povezavo za odjavo. En dotik ustavi vse.')),
      optIn ? h('p', { class: 'small muted' }, L(`Texts are single segments: at most 160 GSM-7 characters (the confirmation you got was ${optIn.used}).`, `SMS-i so en segment: največ 160 znakov GSM-7 (potrditev, ki ste jo dobili, jih je imela ${optIn.used}).`)) : null,
      h('a', { class: 'arrow-link', href: href('account') }, L('Your account', 'Vaš račun'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')),
      !live ? modeNote(ctx, L('Demo: switches change this tab only.', 'Demo: stikala spremenijo samo ta zavihek.')) : null,
    ),
  );

  // ---- 04 research ---------------------------------------------------------------------------------------------
  const rs = h(
    'section',
    { class: 'grid rec-sec app-sec app-research', 'aria-labelledby': 'app-rs-h' },
    h('p', { class: 'sec-index c-margin', 'aria-hidden': 'true' }, '04'),
    h(
      'div',
      { class: 'sec-head c-head' },
      h('p', { class: 'label' }, 'Research'),
      h('h2', { class: 'display d3', id: 'app-rs-h' }, tier === 'research' ? L(`${fmt.int(meta?.universe?.scoredToday ?? issue?.nScored ?? 0)} stocks, four columns.`, `${fmt.int(meta?.universe?.scoredToday ?? issue?.nScored ?? 0)} delnic, štirje stebri.`) : L('The data behind every pick.', 'Podatki za vsako izbiro.')),
    ),
    h(
      'p',
      { class: 'c-body lede' },
      tier === 'research'
        ? L('The full universe behind today’s issue: every family’s percentile, the agreement, the veto that fired. Sort, filter, copy as CSV for personal use.', 'Celoten univerzum za današnjo izdajo: percentil vsake družine, soglasje, veto, ki se je sprožil. Razvrščanje, filtri, kopiranje v CSV za osebno rabo.')
        : L('Research adds the daily universe of about 1,300 stocks with each family’s percentile, the screener, and the decile and IC dashboards. Same picks, same second; more data.', 'Research doda dnevni univerzum približno 1.300 delnic s percentili vsake družine, iskalnik ter nadzorni plošči decilov in IC. Iste izbire, ista sekunda; več podatkov.'),
    ),
    h(
      'p',
      { class: 'c-meta app-rs__cta' },
      tier === 'research'
        ? h('a', { class: 'btn', href: href('app-research') }, L('Open the explorer', 'Odpri raziskovalnik'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'))
        : h('a', { class: 'btn btn--ghost', href: href('app-research') }, L('See what Research holds', 'Kaj vsebuje Research'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')),
    ),
  );

  const node = h('div', { class: 'page app' }, head, issueSec, openSec, chSec, rs);
  return {
    title: L('Your issue', 'Vaša izdaja'),
    node,
    cleanup() {
      if (timer) clearInterval(timer);
    },
  };
}

// The septet count of a text as sent ("142/160 GSM-7").
function smsModelOf(text) {
  const a = analyze(text);
  const used = a.encoding === 'GSM-7' ? a.septets : a.units;
  return { used, label: `${used}/${a.encoding === 'GSM-7' ? 160 : 70} ${a.encoding}` };
}
