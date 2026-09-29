// #legal-terms|privacy|sms|imprint|cookies. Every document is a draft for counsel review and
// says so at the top. Texts live in legal-copy.js (SL: first draft, needs native and legal review).
import { h } from '../dom.js';
import { href } from '../router.js';
import { masthead, contentSections, page, toc } from './_content.js';
import { LEGAL } from './legal-copy.js';

const DOCS = ['terms', 'privacy', 'sms', 'imprint', 'cookies'];

export async function render(ctx) {
  const doc = ctx.params.doc;
  const copy = LEGAL[doc]?.[ctx.locale] ?? LEGAL[doc]?.en;
  if (!copy) {
    const nf = await import('./not-found.js');
    return nf.render(ctx);
  }
  const sections = copy.sections.map(([id, title, body]) => ({ id, title, body }));
  const others = h(
    'nav',
    { class: 'legal-nav', 'aria-label': ctx.t('footer.legal') },
    h('p', { class: 'label' }, ctx.t('footer.legal')),
    h(
      'ul',
      {},
      DOCS.map((d) => {
        const c = LEGAL[d][ctx.locale] ?? LEGAL[d].en;
        return h('li', {}, h('a', { href: href('legal', d), 'aria-current': d === doc ? 'page' : null }, c.title));
      }),
    ),
  );
  const node = page(
    masthead({
      kicker: ctx.L('Legal · draft', 'Pravno · osnutek'),
      title: copy.title,
      lede: copy.lede,
      size: 'd2',
      meta: h('div', { class: 'masthead__stack' }, others, toc(ctx, sections, ctx.L('Sections', 'Poglavja'))),
      draft: {
        label: ctx.t('common.draft'),
        text: ctx.L(
          'This text has not been reviewed by a lawyer. Version: draft 0.1, 28.09.26. Placeholders in [brackets] are filled on registration.',
          'Tega besedila ni pregledal odvetnik. Različica: osnutek 0.1, 28.09.26. Oznake v [oklepajih] bodo izpolnjene ob vpisu.',
        ),
      },
    }),
    ...contentSections(sections),
  );
  return { title: copy.title, node };
}
