// The Ledger Chain (ledger page, Chamber): issue blocks newest first. Each block lists that day's
// records (sequence, type, time, SHA-256 prefix, the previous hash it links to) and the day's anchor
// (Merkle root, rows, OpenTimestamps and RFC 3161 status). Sealed BUY/RENEW records show only their
// commitment; CLOSE records show what they revealed. Rows reuse the home teaser's .chain__* classes.
import { h } from '../dom.js';
import { href } from '../router.js';
import { hashChip, timestamp } from '../ui.js';

const TYPES = {
  en: { ISSUE: 'Issue', BUY: 'Buy, sealed', RENEW: 'Renew, sealed', CLOSE: 'Close, revealed', METHODOLOGY: 'Methodology', CORRECTION: 'Correction' },
  sl: { ISSUE: 'Izdaja', BUY: 'Nakup, zapečaten', RENEW: 'Podaljšanje, zapečateno', CLOSE: 'Zaprtje, razkrito', METHODOLOGY: 'Metodologija', CORRECTION: 'Popravek' },
};

export function entryDetail(e, { fmt, L, t, sealedNos }) {
  const b = e.body ?? {};
  switch (e.type) {
    case 'ISSUE':
      return `#${b.issueNo} · ${L(`${fmt.int(b.nScored)} scored`, `${fmt.int(b.nScored)} ocenjenih`)} · ${b.buys?.length || b.renews?.length ? L('quorum', 'kvorum') : L(`no quorum, closest ${b.closest}/4`, `brez kvoruma, največ ${b.closest}/4`)}`;
    case 'BUY':
    case 'RENEW':
      return `#${b.no} · ${sealedNos?.has(b.no) ? t('common.sealed') : L('revealed at close', 'razkrito ob zaprtju')} · ${b.agreement}/4`;
    case 'CLOSE':
      return `#${b.no} · ${b.reveal?.ticker ?? ''}${b.priorReveals?.length ? L(` · +${b.priorReveals.length} earlier`, ` · +${b.priorReveals.length} prejšnjih`) : ''}`;
    case 'METHODOLOGY':
      return `v${b.version}`;
    case 'CORRECTION':
      return `#${b.refSeq} · ${b.field}`;
    default:
      return '';
  }
}

export function chainRow(e, ctx, { sealedNos, highlight }) {
  const { fmt, L, locale } = ctx;
  const types = TYPES[locale] ?? TYPES.en;
  const quorum = e.type === 'BUY' || e.type === 'RENEW';
  return h(
    'li',
    { class: ['chain__row grid', highlight === e.seq && 'is-target'], id: `r${e.seq}` },
    h('span', { class: 'chain__seq c-margin mono' }, `#${e.seq}`),
    h(
      'div',
      { class: 'chain__type c-b1' },
      h('span', { class: ['chain__kind', quorum && 'is-quorum'] }, types[e.type] ?? e.type),
      h('span', { class: 'chain__detail small' }, entryDetail(e, { fmt, L, t: ctx.t, sealedNos })),
    ),
    h(
      'div',
      { class: 'chain__time c-b2' },
      h('span', { class: 'mono chain__date' }, fmt.date(e.issueDate)),
      ' ',
      timestamp([{ at: e.at, kind: e.type === 'ISSUE' ? 'published' : 'sealed' }], { t: ctx.t }),
    ),
    h(
      'div',
      { class: 'chain__hash c-b3' },
      hashChip(e.hash, { t: ctx.t }),
      h('span', { class: 'chain__prev mono' }, h('span', { 'aria-hidden': 'true' }, '← '), `${L('prev', 'prej')} ${e.prevHash.slice(0, 8)}`),
    ),
  );
}

export function anchorLine(anchor, ctx) {
  const { L } = ctx;
  if (!anchor) return null;
  const ots = anchor.ots === 'confirmed' ? L('OpenTimestamps confirmed', 'OpenTimestamps potrjeno') : L('OpenTimestamps pending', 'OpenTimestamps v teku');
  return h(
    'div',
    { class: 'cb__anchor' },
    h('span', { class: 'label' }, L('Anchor', 'Sidro')),
    h('span', { class: 'mono cb__root', title: anchor.merkleRoot }, h('span', { class: 'visually-hidden' }, L('Merkle root ', 'Merklov koren ')), anchor.merkleRoot.slice(0, 12)),
    h('span', { class: 'small' }, anchor.rowCount === 1 ? L('1 row', '1 vrstica') : L(`${anchor.rowCount} rows`, `${anchor.rowCount} ${anchor.rowCount === 2 ? 'vrstici' : anchor.rowCount < 5 ? 'vrstice' : 'vrstic'}`)),
    h(
      'span',
      { class: 'cb__tags' },
      h('span', { class: ['tag', anchor.ots === 'confirmed' && 'is-ok'] }, ots),
      h('span', { class: 'tag' }, anchor.rfc3161 === 'demo' ? L('RFC 3161 · demo', 'RFC 3161 · demo') : `RFC 3161 · ${anchor.rfc3161}`),
    ),
  );
}

// blocks: from records issueBlocks(); returns the <ol> and a function to render more.
export function chainBlocks(blocks, ctx, { sealedNos, highlight, pageSize = 8 } = {}) {
  const { fmt, L } = ctx;
  const list = h('ol', { class: 'chain ledger-chain c-full flush', 'aria-label': L('Issue blocks, newest first', 'Bloki izdaj, najnovejši prvi') });
  let shown = 0;
  const block = (b) => {
    const issue = b.issue?.body;
    const quorum = !!(issue?.buys?.length || issue?.renews?.length);
    return h(
      'li',
      { class: ['cb', quorum && 'is-quorum'] },
      h(
        'div',
        { class: 'cb__head grid' },
        h('span', { class: 'cb__date c-margin mono' }, fmt.date(b.date)),
        h(
          'p',
          { class: 'cb__title' },
          h('a', { href: href('issue', b.date) }, issue ? L(`Issue #${issue.issueNo}`, `Izdaja #${issue.issueNo}`) : fmt.date(b.date)),
          h('span', { class: ['cb__q', quorum && 'is-quorum'] }, quorum ? L(`quorum · ${(issue.buys?.length ?? 0) + (issue.renews?.length ?? 0)} sealed`, `kvorum · ${(issue.buys?.length ?? 0) + (issue.renews?.length ?? 0)} zapečatenih`) : L('no quorum', 'brez kvoruma')),
        ),
        anchorLine(b.anchor, ctx),
      ),
      h('ol', { class: 'cb__rows' }, b.entries.map((e) => chainRow(e, ctx, { sealedNos, highlight }))),
    );
  };
  const more = (n = pageSize) => {
    const next = blocks.slice(shown, shown + n);
    list.append(...next.map(block));
    shown += next.length;
    return { shown, total: blocks.length };
  };
  more();
  return { el: list, more, get shown() {
    return shown;
  } };
}
