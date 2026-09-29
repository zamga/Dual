// The long-form page template (DESIGN.md §10): a masthead hanging from rule 1, numbered sections
// with the heading on rule 1, the text between rules 1 and 3, and notes in the metadata strip.
import { h, html, raw } from '../dom.js';
import { href } from '../router.js';
import { CONTACT, contactHtml } from '../ui.js';

export function masthead({ kicker, title, lede, meta, draft, id = 'page-h', size = 'd1' }) {
  return h(
    'header',
    { class: 'grid masthead page-masthead' },
    h('p', { class: 'label c-head' }, kicker),
    h('h1', { class: `display ${size} c-head`, id }, title),
    lede ? h('p', { class: 'lede c-body masthead__lede' }, lede) : null,
    draft ? h('p', { class: 'draft-banner c-body' }, h('span', { class: 'label' }, draft.label), h('span', {}, draft.text)) : null,
    meta ? h('div', { class: 'c-meta masthead__meta' }, meta) : null,
  );
}

// sections: [{ id, title, body: Node|string(html), aside?: Node|string(html), figure?: Node }]
// A figure (a chart, a timetable) spans the page on the rules under the text (.content-fig, a subgrid).
export function contentSections(sections) {
  return sections.map((s, i) =>
    h(
      'section',
      { class: 'grid content-sec', id: s.id, 'aria-labelledby': `${s.id}-h` },
      h('p', { class: 'sec-index c-margin', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
      h('h2', { class: 'c-head', id: `${s.id}-h` }, s.title),
      h('div', { class: 'prose c-body' }, toNode(s.body)),
      s.aside ? h('aside', { class: 'c-meta content-aside' }, toNode(s.aside)) : null,
      s.figure ? h('div', { class: 'content-fig c-full flush' }, s.figure) : null,
      s.wide ?? null, // a block placed on the section's own grid (e.g. "Lower the bar", r1→r4 on the rules)
    ),
  );
}

// {{contact:support}} in copy becomes the shared address with its Copy button (ui.js CONTACT).
export function fillContacts(str, locale = globalThis.document?.documentElement?.lang) {
  return String(str).replace(/\{\{contact:(\w+)\}\}/g, (m, k) => (CONTACT[k] ? contactHtml(CONTACT[k], locale === 'sl' ? 'sl' : 'en') : m));
}

export function toNode(x) {
  if (x == null) return null;
  if (x instanceof Node) return x;
  if (Array.isArray(x)) return x.map(toNode);
  return html`${raw(fillContacts(x))}`;
}

// "On this page" links that scroll without re-rendering the route (#methodology~validation).
export function toc(ctx, sections, label) {
  const { name, params } = ctx.route;
  const param = params ? Object.values(params)[0] : undefined;
  const link = (id) => href(name, param, id);
  const nav = h(
    'nav',
    { class: 'toc', 'aria-label': label },
    h('p', { class: 'label' }, label),
    sections.map((s, i) =>
      h(
        'a',
        {
          href: link(s.id),
          onclick: (e) => {
            const el = document.getElementById(s.id);
            if (!el) return;
            e.preventDefault();
            try {
              history.replaceState(history.state, '', `${location.pathname}${location.search}${link(s.id)}`);
            } catch {
              /* sandboxed history: the section link still scrolls */
            }
            el.scrollIntoView({ behavior: ctx.reducedMotion ? 'auto' : 'smooth', block: 'start' });
            const hd = el.querySelector('h2');
            if (hd) {
              hd.setAttribute('tabindex', '-1');
              hd.focus({ preventScroll: true });
            }
          },
        },
        h('span', { 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
        s.short ?? s.title,
      ),
    ),
  );
  return nav;
}

export function page(...children) {
  return h('div', { class: 'page' }, ...children);
}

// A hairline table from rows of cells (strings or nodes). numCols: indexes of numeric columns.
export function table({ caption, head, rows, numCols = [], className = '' }) {
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      { class: `table ${className}` },
      caption ? h('caption', {}, caption) : null,
      h('thead', {}, h('tr', {}, head.map((c, i) => h('th', { scope: 'col', class: numCols.includes(i) ? 'num' : null }, c)))),
      h(
        'tbody',
        {},
        rows.map((r) => h('tr', {}, r.map((c, i) => (i === 0 ? h('th', { scope: 'row' }, c) : h('td', { class: numCols.includes(i) ? 'num' : null }, c))))),
      ),
    ),
  );
}
