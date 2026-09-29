// #status: today's delivery status per channel, and the day's timetable against the clock.
// Demo: derived honestly from the published data: the web issue is real, and before launch there are
// no subscribers, so every channel is ready and every count is zero because it is zero. Live: GET
// /api/status (counts only: no tickers of open picks, nothing about any person).
//
// SL: first draft, needs native review.
import { h } from '../dom.js';
import { href } from '../router.js';
import { masthead } from './_content.js';
import { hashChip, timestamp } from '../ui.js';
import { api, errorText } from './_api.js';
import { demoStatus, liveStatus, channelState, timetable, total, CHANNELS } from './_status.js';
import { launchInfo } from './_join.js';
import { modeNote } from './_member.js';
import { formatInZone, LJUBLJANA, issueSlot, nextIssueSlot } from '../core/calendar.js';
import { createClock, remaining } from '../clock.js';

export async function render(ctx) {
  const { L, locale, fmt } = ctx;
  const [issues, ledger, meta, backtest] = await Promise.all([
    ctx.data('issues'),
    ctx.data('ledger').catch(() => null),
    ctx.data('meta').catch(() => null),
    ctx.data('backtest').catch(() => null),
  ]);
  const launch = launchInfo(backtest);
  const clock = ctx.clock ?? (meta?.asOf ? createClock({ asOf: meta.asOf, flagsNow: ctx.flags?.now }) : null);
  const now = clock ? clock.now() : new Date();
  const live = ctx.mode === 'live';
  let st;
  let liveErr = null;
  if (live) {
    try {
      st = liveStatus(await api('/api/status', { signal: ctx.signal }), { prelaunch: !launch.ready });
    } catch (e) {
      liveErr = e;
      st = demoStatus({ issues, ledger, now, prelaunch: !launch.ready });
    }
  } else st = demoStatus({ issues, ledger, now, prelaunch: !launch.ready });

  const issue = st.issue;
  const row = issue ? issues.find((r) => r.date === issue.date) : null;
  const today = formatInZone(now, LJUBLJANA).date;
  const isToday = issue?.date === today;
  const items = issue ? issue.items.buys + issue.items.renews + issue.items.closes : 0;
  const itemWords = issue
    ? [
        issue.items.buys && L(`${issue.items.buys} ${issue.items.buys === 1 ? 'buy' : 'buys'}`, `${issue.items.buys} ${issue.items.buys === 1 ? 'nakup' : 'nakupi'}`),
        issue.items.renews && L(`${issue.items.renews} ${issue.items.renews === 1 ? 'renewal' : 'renewals'}`, `${issue.items.renews} ${issue.items.renews === 1 ? 'podaljšanje' : 'podaljšanja'}`),
        issue.items.closes && L(`${issue.items.closes} ${issue.items.closes === 1 ? 'close' : 'closes'}`, `${issue.items.closes} ${issue.items.closes === 1 ? 'zaprtje' : 'zaprtja'}`),
      ].filter(Boolean)
    : [];
  const sent = CHANNELS.reduce((s, c) => s + total(st.delivery[c]), 0);
  const paused = st.smsChannel.paused;
  const failing = CHANNELS.some((c) => channelState(st, c) === 'failing');

  const title = liveErr
    ? L('Status could not be read.', 'Stanja ni bilo mogoče prebrati.')
    : paused
      ? L('Texts are paused. Push and email continue.', 'SMS je začasno ustavljen. Potisna obvestila in e-pošta tečejo.')
      : failing
        ? L('Some deliveries are failing.', 'Nekatere dostave ne uspevajo.')
        : st.prelaunch && !sent
          ? L('Every channel ready. Nobody to send to yet.', 'Vsi kanali pripravljeni. Še nikogar za pošiljanje.')
          : L('Every channel delivering.', 'Vsi kanali dostavljajo.');

  const lede = issue
    ? L(
        `${isToday ? 'Today’s' : 'The latest'} issue, #${issue.issueNo} of ${fmt.date(issue.date)}, was published on the web at 14:00:00 ${row?.tz ?? issueSlot(issue.date).tzLabel}${items ? ` with ${itemWords.join(' and ')}` : ' with no quorum'}. ${st.prelaunch ? 'The sealed record runs before launch with no subscribers, so no text, push or email went out: the counts below are zero because they are zero.' : ''}`,
        `${isToday ? 'Današnja' : 'Zadnja'} izdaja, #${issue.issueNo} z dne ${fmt.date(issue.date)}, je bila na spletu objavljena ob 14:00:00 ${row?.tz ?? issueSlot(issue.date).tzLabel}${items ? `: ${itemWords.join(' in ')}` : ', brez kvoruma'}. ${st.prelaunch ? 'Zapečateni zapis pred zagonom teče brez naročnikov, zato ni bil poslan noben SMS, potisno obvestilo ali e-pošta: spodnja števila so nič, ker so nič.' : ''}`,
      )
    : L('No issue has been published yet.', 'Nobena izdaja še ni bila objavljena.');

  // ---- next issue (live countdown, or pinned) ---------------------------------------------------------------
  const next = nextIssueSlot(now);
  const left = h('span', { class: 'mono' });
  const drawLeft = () => {
    const t = clock ? clock.now() : new Date();
    const ms = new Date(next.publishAtUtc).getTime() - t.getTime();
    left.textContent = ms > 0 ? L(`in ${remaining(ms).text}`, `čez ${remaining(ms).text}`) : L('now', 'zdaj');
  };
  drawLeft();
  const timer = clock?.mode === 'live' || clock?.mode === 'override' ? setInterval(drawLeft, 20000) : 0;

  const anchor = st.anchor;
  const metaBox = h(
    'div',
    { class: 'st-meta' },
    h(
      'div',
      { class: 'st-meta__b' },
      h('p', { class: 'label' }, L('Next issue', 'Naslednja izdaja')),
      h('p', { class: 'st-next' }, h('span', { class: 'mono' }, `${fmt.date(next.issueDate)} · 14:00 ${next.tzLabel}`), ' ', left),
      clock?.mode === 'pinned' ? h('p', { class: 'small muted' }, L('Demo clock: pinned to the end of the data.', 'Demo ura: ustavljena ob koncu podatkov.')) : null,
    ),
    anchor
      ? h(
          'div',
          { class: 'st-meta__b' },
          h('p', { class: 'label' }, L('Latest anchor', 'Zadnje sidro')),
          h('p', { class: 'st-anchor' }, h('span', { class: 'mono' }, fmt.date(anchor.date)), ' ', anchor.merkleRoot ? hashChip(anchor.merkleRoot, { t: ctx.t }) : null),
          h('p', { class: 'small muted' }, `OpenTimestamps ${anchor.ots ?? '–'} · RFC 3161 ${anchor.rfc3161 ?? '–'}`),
        )
      : null,
    modeNote(ctx, live ? (liveErr ? errorText(liveErr, locale) : L('Counts from the server, refreshed on each visit.', 'Števila s strežnika, osvežena ob vsakem obisku.')) : L('Demo: derived from the published data.', 'Demo: izpeljano iz objavljenih podatkov.')),
  );

  // ---- 01 per channel -------------------------------------------------------------------------------------
  const STATE = {
    ready: L('ready', 'pripravljen'),
    delivered: L('delivered', 'dostavljeno'),
    sending: L('sending', 'pošiljanje'),
    failing: L('failing', 'napake'),
    paused: L('paused', 'ustavljeno'),
    published: L('published', 'objavljeno'),
  };
  const chName = { web: L('Web issue', 'Spletna izdaja'), sms: 'SMS', push: L('Push', 'Potisna obvestila'), email: L('Email', 'E-pošta') };
  const note = {
    web: issue ? L(`${fmt.int(issue.nScored ?? 0)} scored · closest ${issue.closest ?? 0}/4 · ${items ? itemWords.join(', ') : 'no quorum'}`, `${fmt.int(issue.nScored ?? 0)} ocenjenih · največ ${issue.closest ?? 0}/4 · ${items ? itemWords.join(', ') : 'brez kvoruma'}`) : '–',
    sms: paused
      ? L('Paused by the 30007 guard; queued texts wait, pick texts expire at the US open.', 'Ustavljeno zaradi varovala 30007; SMS-i čakajo, SMS z izbiro poteče ob odprtju ZDA.')
      : st.prelaunch && launch.research
        ? L('Not launching: the engine is back in research. Sender QUORUM, SI AT DE HR IT.', 'Brez zagona: pogon je spet v raziskavah. Pošiljatelj QUORUM, SI AT DE HR IT.')
        : st.prelaunch
        ? L('Paid SMS opens at launch. Sender QUORUM, SI AT DE HR IT.', 'Plačljivi SMS se odpre ob zagonu. Pošiljatelj QUORUM, SI AT DE HR IT.')
        : L('Sender QUORUM, 08:00–21:00 recipient time.', 'Pošiljatelj QUORUM, 08:00–21:00 po času prejemnika.'),
    push: L('Every issue item, alongside texts.', 'Vsaka postavka izdaje, ob SMS.'),
    email: L('Every issue item; the Ledger email on Sundays at 18:00.', 'Vsaka postavka izdaje; e-pošta Ledger ob nedeljah ob 18:00.'),
  };
  const head = [L('Channel', 'Kanal'), L('State', 'Stanje'), L('Recipients', 'Prejemniki'), L('Queued', 'V vrsti'), L('Sent', 'Poslano'), L('Delivered', 'Dostavljeno'), L('Failed', 'Neuspešno'), L('Note', 'Opomba')];
  const n = (v) => (v == null ? '–' : fmt.int(v));
  const rows = [
    {
      id: 'web',
      state: issue ? 'published' : 'ready',
      cells: ['–', '–', '–', '–', '–'],
      when: issue?.publishedAt ? timestamp([{ at: issue.publishedAt, kind: 'published' }], { t: ctx.t }) : null,
    },
    ...CHANNELS.map((c) => {
      const d = st.delivery[c];
      return {
        id: c,
        state: channelState(st, c),
        cells: [n(st.recipients ? st.recipients[c] : null), n((d.queued ?? 0) + (d.sending ?? 0)), n(d.sent), n(d.delivered), n((d.failed ?? 0) + (d.undelivered ?? 0))],
      };
    }),
  ];
  const board = h(
    'div',
    { class: 'c-wide st-board-wrap' },
    h(
      'table',
      { class: 'table st-board' },
      h('caption', {}, L(`Delivery of issue #${issue?.issueNo ?? '–'} by channel. Recipients, queued, sent, delivered and failed are message counts.`, `Dostava izdaje #${issue?.issueNo ?? '–'} po kanalih. Prejemniki, v vrsti, poslano, dostavljeno in neuspešno so števila sporočil.`)),
      h('thead', {}, h('tr', {}, head.map((x, i) => h('th', { scope: 'col', class: i >= 2 && i <= 6 ? 'num' : null }, x)))),
      h(
        'tbody',
        {},
        rows.map((r) =>
          h(
            'tr',
            { class: ['st-row', `is-${r.state}`] },
            h('th', { scope: 'row', class: 'st-c-name' }, chName[r.id], r.when ? h('span', { class: 'st-when' }, r.when) : null),
            h('td', { class: 'st-c-state', dataset: { label: head[1] } }, h('span', { class: ['st-state', `is-${r.state}`] }, h('i', { 'aria-hidden': 'true' }), STATE[r.state])),
            ...r.cells.map((c, i) => h('td', { class: 'num st-c-n', dataset: { label: head[i + 2] } }, c)),
            h('td', { class: 'st-c-note small', dataset: { label: head[7] } }, note[r.id]),
          ),
        ),
      ),
    ),
  );

  // ---- 02 the day's timetable ---------------------------------------------------------------------------------
  const tdate = issue?.date ?? today;
  const slots = timetable(tdate, now);
  const persons = meta?.persons ?? [];
  const approver = persons.find((p) => p.id === row?.approver) ?? persons.find((p) => p.role === 'approver');
  const pickNos = [...(row?.buys ?? []), ...(row?.renews ?? [])];
  const sealed = ledger?.entries?.filter((e) => e.issueDate === tdate && (e.type === 'BUY' || e.type === 'RENEW')) ?? [];
  const issueEntry = ledger?.entries?.find((e) => e.issueDate === tdate && e.type === 'ISSUE');
  const dayAnchor = ledger?.anchors?.find((a) => a.date === tdate) ?? (anchor?.date === tdate ? anchor : null);
  const openPicks = meta?.counts?.open ?? 0;
  const LABEL = {
    ingest: [L('End-of-day prices in; open picks marked', 'Cene ob koncu dneva; odprte izbire ovrednotene'), null],
    filings: [L('Filings, insider forms, consensus', 'Poročila, obrazci notranjih oseb, konsenz'), null],
    universe: [L('Universe and capacity floor', 'Univerzum in spodnja meja kapacitete'), issue?.nScored ? L(`${fmt.int(issue.nScored)} eligible`, `${fmt.int(issue.nScored)} upravičenih`) : null],
    score: [L('Four families score; rule vetoes; the quorum check', 'Štiri družine ocenijo; veta; preverjanje kvoruma'), row ? L(`closest agreement ${row.closest}/4`, `največje soglasje ${row.closest}/4`) : null],
    explain: [L('48-hour news scan and theses (stand-in in the demo)', '48-urni pregled novic in teze (v demu nadomestek)'), null],
    review: [L('Named approver reviews: remove only, never add', 'Imenovani odobritelj pregleda: samo odstrani, nikoli ne doda'), approver ? `${approver.name} (${L('fictional', 'izmišljeno')})` : null],
    seal: [L('Seal: canonical JSON, SHA-256, chained', 'Pečat: kanonični JSON, SHA-256, veriga'), sealed.length ? h('span', {}, L(`${sealed.length} ${sealed.length === 1 ? 'record' : 'records'} `, `${sealed.length} ${sealed.length === 1 ? 'zapis' : 'zapisov'} `), hashChip(sealed[0].hash, { t: ctx.t })) : L('nothing to seal', 'ničesar za pečatenje')],
    publish: [L('Issue published on the web', 'Izdaja objavljena na spletu'), issueEntry ? h('span', {}, `#${issueEntry.body?.issueNo ?? issue?.issueNo} `, hashChip(issueEntry.hash, { t: ctx.t })) : null],
    fanout: [L('Fan-out ends: SMS paced, push and email in parallel', 'Konec razpošiljanja: SMS v ritmu, potisna obvestila in e-pošta vzporedno'), st.prelaunch && !sent ? L('0 messages: no subscribers', '0 sporočil: ni naročnikov') : st.fanout?.seconds != null ? L(`${fmt.int(st.fanout.seconds)} s`, `${fmt.int(st.fanout.seconds)} s`) : null],
    entry: [L('US open: entry prices recorded', 'Odprtje ZDA: vstopne cene zapisane'), pickNos.length ? L(`${pickNos.map((x) => `#${x}`).join(', ')} entered · ${openPicks} open`, `${pickNos.map((x) => `#${x}`).join(', ')} vstop · ${openPicks} odprtih`) : L(`${openPicks} open picks marked`, `${openPicks} odprtih izbir ovrednotenih`)],
    anchor: [L('Merkle root anchored (23:59 UTC)', 'Merklov koren zasidran (23:59 UTC)'), dayAnchor ? h('span', {}, hashChip(dayAnchor.merkleRoot, { t: ctx.t }), ` ${L(`${dayAnchor.rowCount ?? dayAnchor.rows} rows`, `${dayAnchor.rowCount ?? dayAnchor.rows} vrstic`)}`) : null],
  };
  const stateWord = { done: L('done', 'opravljeno'), next: L('next', 'naslednje'), later: L('later', 'pozneje') };
  const tt = h(
    'ol',
    { class: 'c-full flush st-tt' },
    slots.map((s) => {
      const [what, detail] = LABEL[s.id] ?? [s.id, null];
      const done = s.state === 'done' || (s.id === 'anchor' && dayAnchor);
      const state = done ? 'done' : s.state;
      const day = s.date !== tdate ? ` ${fmt.dm(s.date)}` : '';
      return h(
        'li',
        { class: ['grid', 'st-slot', `is-${state}`] },
        h('p', { class: 'st-slot__t c-margin mono' }, h('time', { datetime: s.at }, `${s.local}${day}`)),
        h('p', { class: 'st-slot__w c-body' }, h('span', { class: 'st-slot__dot', 'aria-hidden': 'true' }), what),
        h('p', { class: 'st-slot__d c-meta small' }, h('span', { class: 'label st-slot__s' }, stateWord[state]), detail ? h('span', { class: 'st-slot__x' }, detail) : null),
      );
    }),
  );

  // ---- 03 the rules the channels keep -----------------------------------------------------------------------
  const rules = [
    [L('Quiet hours', 'Mirne ure'), L('Texts only 08:00–21:00 where the recipient is. The 14:00 slot always falls inside; the check stays in the code.', 'SMS samo 08:00–21:00 po času prejemnika. Termin ob 14:00 je vedno znotraj; preverjanje ostaja v kodi.')],
    [L('Never late', 'Nikoli pozno'), L('A pick text still queued at the US open is cancelled, never sent late. A missed 14:00 slot sends nothing.', 'SMS z izbiro, ki ob odprtju ZDA še čaka, se prekliče, nikoli ne pošlje pozno. Zamujen termin ob 14:00 ne pošlje ničesar.')],
    [L('Carrier filtering', 'Filtriranje operaterjev'), L('If more than 2% of texts in 10 minutes are filtered as spam (error 30007), SMS pauses itself and on-call is paged. Push and email continue.', 'Če je v 10 minutah več kot 2 % SMS-ov filtriranih kot neželenih (napaka 30007), se SMS sam ustavi in obvesti dežurnega. Potisna obvestila in e-pošta tečejo.')],
    [L('Same content, same second', 'Ista vsebina, ista sekunda'), L('Every tier gets identical content with the same publish time. Entry is at the US open, so the order of sends cannot affect results.', 'Vsak paket dobi enako vsebino z istim časom objave. Vstop je ob odprtju ZDA, zato vrstni red pošiljanja ne vpliva na rezultate.')],
  ];

  const node = h(
    'div',
    { class: 'page st' },
    masthead({
      kicker: L(`Status · ${isToday ? 'today' : 'latest issue'}, ${issue ? fmt.date(issue.date) : '–'}`, `Stanje · ${isToday ? 'danes' : 'zadnja izdaja'}, ${issue ? fmt.date(issue.date) : '–'}`),
      title,
      lede,
      meta: metaBox,
    }),
    h(
      'section',
      { class: 'grid rec-sec st-sec', id: 'channels', 'aria-labelledby': 'st-ch-h' },
      h('p', { class: 'sec-index c-margin', 'aria-hidden': 'true' }, '01'),
      h('div', { class: 'sec-head c-head' }, h('p', { class: 'label' }, L('Per channel', 'Po kanalih')), h('h2', { class: 'display d3', id: 'st-ch-h' }, L('Where the issue went.', 'Kam je šla izdaja.'))),
      board,
    ),
    h(
      'section',
      { class: 'grid rec-sec st-sec st-tt-sec', id: 'timetable', 'aria-labelledby': 'st-tt-h' },
      h('p', { class: 'sec-index c-margin', 'aria-hidden': 'true' }, '02'),
      h(
        'div',
        { class: 'sec-head c-head' },
        h('p', { class: 'label' }, L(`The day, Ljubljana time · ${fmt.date(tdate)}`, `Dan po ljubljanskem času · ${fmt.date(tdate)}`)),
        h('h2', { class: 'display d3', id: 'st-tt-h' }, L('From the close to the anchor.', 'Od zaprtja do sidra.')),
      ),
      h('p', { class: 'c-body lede' }, L('Each slot runs once a day. Times move with the clocks: when Europe and the US change on different dates, the US open is at 14:30, not 15:30.', 'Vsak termin teče enkrat na dan. Časi sledijo uram: ko Evropa in ZDA premakneta uro na različna datuma, je odprtje ZDA ob 14:30 in ne ob 15:30.')),
      tt,
    ),
    h(
      'section',
      { class: 'grid rec-sec st-sec', id: 'rules', 'aria-labelledby': 'st-r-h' },
      h('p', { class: 'sec-index c-margin', 'aria-hidden': 'true' }, '03'),
      h('div', { class: 'sec-head c-head' }, h('p', { class: 'label' }, L('What every channel keeps to', 'Česa se drži vsak kanal')), h('h2', { class: 'display d3', id: 'st-r-h' }, L('Rules in the code.', 'Pravila v kodi.'))),
      h('dl', { class: 'c-wide boxed st-rules' }, rules.map(([k, v]) => h('div', { class: 'st-rule' }, h('dt', {}, k), h('dd', {}, v)))),
      h('p', { class: 'c-body small muted' }, L('Texts, help and the stop link: ', 'SMS, pomoč in povezava za odjavo: '), h('a', { href: href('help') }, L('Help', 'Pomoč')), ' · ', h('a', { href: href('legal', 'sms') }, L('SMS terms', 'Pogoji SMS'))),
    ),
  );
  return {
    title: L('Status', 'Stanje'),
    node,
    cleanup() {
      if (timer) clearInterval(timer);
    },
  };
}
