// Shared UI components with behaviour. Every page builds from these so the system stays one system.
// All take the page ctx (or its t/fmt/locale) and return DOM nodes.
import { h, copyText, announce } from './dom.js';
import { href } from './router.js';
import { t as tGlobal, formatters, pickL } from './i18n.js';
import { formatInZone, LJUBLJANA } from './core/calendar.js';
import { launchCopy } from './launch.js';

let uid = 0;
export const nextId = (p = 'q') => `${p}-${++uid}`;

// ---- hash chip: 8 characters shown, the full hash copied on click ------------------------------
export function hashChip(hash, { n = 8, t = tGlobal, label } = {}) {
  const short = String(hash ?? '').slice(0, n);
  const done = h('span', { class: 'hash__done', 'aria-hidden': 'true' }, 'copied');
  const btn = h(
    'button',
    {
      type: 'button',
      class: 'hash',
      'aria-label': label ?? t('hash.copy', { hash }),
      title: hash,
      dataset: { hash },
    },
    h('span', { class: 'hash__v' }, short),
    done,
  );
  let timer = 0;
  btn.addEventListener('click', async () => {
    const ok = await copyText(hash);
    announce(ok ? t('hash.copied', { short }) : t('hash.copyFailed', { hash }));
    if (!ok) return;
    done.textContent = t('hash.done');
    btn.classList.add('is-copied');
    clearTimeout(timer);
    timer = setTimeout(() => btn.classList.remove('is-copied'), 1400);
  });
  return btn;
}

// ---- timestamp with ISO-8601, UTC and what the instant means ------------------------------------
// rows: [{ at: ISO, kind: 'produced'|'disseminated'|'sealed'|'published' }]; the first row is shown.
export function timestamp(rows, { t = tGlobal, display, align = 'left', tz = LJUBLJANA } = {}) {
  const list = (Array.isArray(rows) ? rows : [rows]).filter((r) => r && r.at);
  if (!list.length) return h('span', {}, '–');
  const first = list[0];
  const inst = new Date(first.at);
  const local = formatInZone(inst, tz);
  const tzLabel = tzAbbrev(local.offset);
  const shown = display ?? `${local.time.slice(0, 5)} ${tzLabel}`;
  const popId = nextId('ts');
  const pop = h(
    'span',
    { class: 'ts__pop', role: 'tooltip', id: popId },
    list.map((r) => {
      const d = new Date(r.at);
      const utc = d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
      return h(
        'span',
        { class: 'ts__row' },
        h('span', { class: 'ts__k' }, t(`ts.${r.kind ?? 'published'}`)),
        h('span', {}, r.at),
        h('span', {}, utc),
      );
    }),
  );
  return h(
    'span',
    { class: ['ts', align === 'right' && 'ts--right'], tabindex: '0', 'aria-describedby': popId },
    h('time', { datetime: first.at }, shown),
    pop,
  );
}

function tzAbbrev(offset) {
  if (offset === '+02:00') return 'CEST';
  if (offset === '+01:00') return 'CET';
  if (offset === '-04:00') return 'EDT';
  if (offset === '-05:00') return 'EST';
  return offset;
}

// ---- signed values: Gain/Loss only with a sign and an arrow -------------------------------------
export function signed(x, { fmt = formatters(), digits = 1, suffix } = {}) {
  const s = fmt.signed(x, { digits });
  return h(
    'span',
    { class: ['signed', s.cls] },
    h('span', { class: 'signed__arrow', 'aria-hidden': 'true' }, s.arrow),
    h('span', {}, s.text),
    suffix ? h('span', { class: 'muted' }, ` ${suffix}`) : null,
  );
}

export function quorumBadge(n, { t = tGlobal } = {}) {
  return h('span', { class: 'badge-quorum', title: t('common.models', { n }) }, `${n}/4`);
}

// ---- section heads: index in the left margin, label + display headline hanging from rule 1 ------
export function sectionHead({ index, kicker, title, lede, level = 2, size = 'd2', id }) {
  const heading = h(`h${level}`, { class: ['display', size], id }, title);
  return [
    index ? h('p', { class: 'sec-index c-margin', 'aria-hidden': 'true' }, index) : null,
    h(
      'div',
      { class: 'sec-head c-head' },
      kicker ? h('p', { class: 'label' }, kicker) : null,
      heading,
    ),
    lede ? h('p', { class: 'lede c-body' }, lede) : null,
  ];
}

// ---- the launch note: one line wherever a paid tier is offered (#pricing, the home teaser) -------------
// The state label, the computed sentence for it (web/js/launch.js launchCopy: pre-launch, back in research,
// or the engine gate passed with launch still waiting on the brief's other gates) and the launch test.
export function launchNote(info, locale) {
  const c = launchCopy(info, locale);
  return h(
    'p',
    { class: ['launch-note', `is-${c.state}`] },
    h('span', { class: 'label launch-note__k' }, c.label),
    h('span', { class: 'launch-note__t' }, c.pricing, ' ', h('a', { class: 'nowrap', href: href('backtest', null, 'launch') }, c.testLink)),
  );
}

// ---- the simulation note: meta.notes.simulation {en, sl}, what the simulated market is -----------------
// Shown near the top of #methodology and #backtest (id "simulation", the target of the footer's demo line).
// Returns null when the export carries no note.
export function simulationText(meta, locale) {
  const n = meta?.notes?.simulation;
  if (!n) return null;
  if (typeof n === 'string') return n.trim() || null;
  const s = n[locale === 'sl' ? 'sl' : 'en'] ?? n.en;
  return typeof s === 'string' && s.trim() ? s.trim() : null;
}

export function simulationNote(meta, locale) {
  const text = simulationText(meta, locale);
  if (!text) return null;
  return h(
    'section',
    { class: 'grid sim-note', id: 'simulation', 'aria-labelledby': 'sim-note-h' },
    h('h2', { class: 'label c-head sim-note__k', id: 'sim-note-h' }, locale === 'sl' ? 'Simulirani trg' : 'The simulated market'),
    h('p', { class: 'c-body sim-note__t' }, text),
  );
}

// ---- headline statistics in the brief's fixed order (§2.8) --------------------------------------
// Every recommendation (BUY and RENEW records) and its split, from summary.json (nRecords, nPicks = BUY,
// nRenews) or, for an older export where nPicks counted every record, from meta.counts.
export function recordCounts(summary, counts = null) {
  if (Number.isFinite(summary?.nRecords)) return { records: summary.nRecords, picks: summary.nPicks, renews: summary.nRenews ?? summary.nRecords - summary.nPicks };
  if (counts && Number.isFinite(counts.picks) && Number.isFinite(counts.renews)) return { records: counts.picks + counts.renews, picks: counts.picks, renews: counts.renews };
  return { records: summary?.nPicks, picks: null, renews: null };
}

// The first figure says what it counts: every recommendation, split into new picks and renewals.
export function statStrip(summary, { t = tGlobal, fmt = formatters(), locale, counts = null } = {}) {
  const L = (en, sl) => (locale === 'sl' ? sl : en);
  const ci = summary.hitCI ? `${fmt.pct0(summary.hitCI[0])}–${fmt.pct0(summary.hitCI[1])}` : '';
  const worst = summary.worstPick;
  const { records, picks, renews } = recordCounts(summary, counts);
  const split = Number.isFinite(picks) && Number.isFinite(renews) ? L(`${fmt.int(picks)} new picks, ${fmt.int(renews)} renewals · `, `${fmt.int(picks)} novih izbir, ${fmt.int(renews)} podaljšanj · `) : '';
  const items = [
    [L('Recommendations since', 'Priporočila od'), `${fmt.int(records)}`, `${fmt.date(summary.liveSince)} · ${split}${L(`${summary.nClosed} closed`, `${summary.nClosed} zaprtih`)}`],
    [L('Hit rate vs benchmark', 'Delež uspešnih proti merilu'), fmt.pct0(summary.hitRate), `${t('common.ci')} ${ci}`],
    [L('Median excess return', 'Mediana presežnega donosa'), signed(summary.medianExcess, { fmt }), L('per pick, 21 trading days', 'na izbiro, 21 trgovalnih dni')],
    [L('Mean excess return', 'Povprečni presežni donos'), signed(summary.meanExcess, { fmt }), L('per pick, net of costs', 'na izbiro, po stroških')],
    [
      L('Worst pick', 'Najslabša izbira'),
      signed(worst?.excess, { fmt }),
      worst ? h('span', {}, `#${worst.no} · `, h('a', { href: href('pick', worst.no) }, worst.ticker)) : '',
    ],
    [L('Max drawdown, follow every pick', 'Največji padec, vse izbire'), fmt.pct(summary.maxDrawdown).replace(/^-/, '−'), L('paper portfolio, net', 'papirni portfelj, neto')],
    [L('Median alert gap', 'Mediana razlike ob obvestilu'), fmt.bps(summary.medianAlertGapBps), L('dissemination price vs entry open', 'cena ob objavi proti vstopni ceni')],
  ];
  return h(
    'dl',
    { class: 'stats' },
    items.map(([k, v, s]) =>
      h('div', { class: 'stat' }, h('dt', { class: 'stat__k' }, k), h('dd', { class: 'stat__v' }, v), h('dd', { class: 'stat__s' }, s)),
    ),
  );
}

// The track-record label from brief §7, adapted.
export function trackRecordLabel(locale) {
  return locale === 'sl'
    ? 'Hipotetični papirni portfelj. Donosi predpostavljajo nakup ob naslednjem rednem odprtju ameriškega trga po vsaki izbiri in prodajo ob odprtju 21 trgovalnih dni pozneje, po odbitku predpostavljenih stroškov 10–25 b.t. v vsako smer. Noben dejanski račun ni dosegel teh rezultatov. Brez davkov; zneski v evrih vključujejo tečajne učinke. Pretekla uspešnost ni zanesljiv kazalnik prihodnjih rezultatov.'
    : 'Hypothetical paper portfolio. Returns assume buying at the next US regular-session open after each pick and selling at the open 21 trading days later, minus assumed costs of 10–25 bps each way. No actual account achieved these results. Excludes taxes; euro figures include currency effects. Past performance is not a reliable indicator of future results.';
}

// ---- the SMS inside a phone ---------------------------------------------------------------------
export function phone({ text, at, locale = 'en', linkify = true }) {
  const d = new Date(at);
  const lj = formatInZone(d, LJUBLJANA);
  const when = `${lj.date.slice(8, 10)}.${lj.date.slice(5, 7)}.${lj.date.slice(2, 4)} ${lj.time.slice(0, 5)}`;
  const body = linkify ? smsBody(text) : text;
  return h(
    'div',
    { class: 'phone', role: 'img', 'aria-label': `${locale === 'sl' ? 'SMS od QUORUM' : 'SMS from QUORUM'}, ${when}: ${text}` },
    h(
      'div',
      { class: 'phone__screen' },
      h('div', { class: 'phone__bar', 'aria-hidden': 'true' }, h('span', {}, lj.time.slice(0, 5)), h('span', {}, '5G')),
      h('div', { class: 'phone__from', 'aria-hidden': 'true' }, h('b', {}, 'QUORUM'), h('span', { class: 'label' }, locale === 'sl' ? 'Samo za branje' : 'Read-only sender')),
      h('div', { class: 'phone__thread', 'aria-hidden': 'true' }, h('p', { class: 'phone__when' }, when), h('p', { class: 'sms' }, body)),
    ),
  );
}

export function smsBody(text) {
  const parts = String(text).split(/(qrm\.si\/\S+)/g);
  return parts.map((p) => (/^qrm\.si\//.test(p) ? h('u', {}, p) : p));
}

// ---- states --------------------------------------------------------------------------------------
export function dataError(ctx, err) {
  const file = err?.file ?? 'data';
  return h(
    'section',
    { class: 'grid state' },
    h('p', { class: 'label c-head' }, 'Error'),
    h('h1', { class: 'display d2 c-head', tabindex: '-1' }, ctx.t('error.data.title')),
    h('p', { class: 'lede c-body' }, ctx.t('error.data.body', { file })),
    h('p', { class: 'c-body' }, h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => ctx.reload() }, ctx.t('common.retry'))),
  );
}

export function familyName(id, meta, locale) {
  const f = meta?.families?.find((x) => x.id === id);
  return f ? pickL(f.name, locale) : tGlobal(`family.${id}`, null, locale);
}

export function familyDef(id, meta, locale) {
  const f = meta?.families?.find((x) => x.id === id);
  return f ? pickL(f.def, locale) : tGlobal(`familyDef.${id}`, null, locale);
}

// ---- contact addresses ---------------------------------------------------------------------------------
// One set of addresses for every page (OPERATIONS.md SUPPORT_EMAIL). mailto: is unreliable in the
// Artifact viewer (ARCHITECTURE.md §5), so an address is selectable text with a Copy button; the click is
// handled once for the whole app (app.js, [data-copy]).
export const CONTACT = { support: 'support@qrm.si', privacy: 'privacy@qrm.si', press: 'press@qrm.si', hello: 'hello@qrm.si' };

export function contactHtml(addr, locale = 'en') {
  const label = locale === 'sl' ? 'Kopiraj' : 'Copy';
  const aria = locale === 'sl' ? `Kopiraj naslov ${addr}` : `Copy the address ${addr}`;
  return `<span class="contact"><span class="mono contact__addr">${addr}</span> <button type="button" class="contact__copy" data-copy="${addr}" aria-label="${aria}">${label}</button></span>`;
}
