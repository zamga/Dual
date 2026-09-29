// The designed 404: four columns, none of them reaching the lintel.
import { h } from '../dom.js';
import { href } from '../router.js';

export async function render(ctx, { pending = false } = {}) {
  const path = ctx.route?.pathname ?? '/';
  const heights = pending ? [0.62, 0.9, 0.4, 0.75] : [0.34, 0.52, 0.18, 0.41];
  const cols = heights.map((v) => {
    const i = h('i');
    i.style.setProperty('--h', String(v));
    return i;
  });
  const title = pending ? ctx.t('pending.title') : ctx.t('notFound.title');
  const node = h(
    'section',
    { class: 'grid nf', 'aria-labelledby': 'nf-h' },
    h('p', { class: 'nf__code c-head' }, pending ? 'UNDER CONSTRUCTION' : `404 · ${ctx.L('no route', 'ni poti')} · 0/4`),
    h('div', { class: 'nf__cols flush', 'aria-hidden': 'true' }, h('span', { class: 'nf__lintel' }), cols),
    h('h1', { class: 'display d1 c-head', id: 'nf-h' }, title),
    h('p', { class: 'lede c-body' }, pending ? ctx.t('pending.body', { path }) : ctx.t('notFound.body', { path })),
    h(
      'p',
      { class: 'nf__actions c-body' },
      h('a', { class: 'btn', href: href('home') }, ctx.t('notFound.home'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')),
      h('a', { class: 'arrow-link', href: href('ledger') }, ctx.t('notFound.ledger')),
    ),
  );
  return { title, node };
}
