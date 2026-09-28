// Boot: locale, view-as tier, demo clock, data loader, hash router with View Transitions.
// Page modules live in js/pages/<module>.js and follow the contract in docs/DESIGN.md §9:
//   export async function render(ctx) -> { title, node, cleanup?, top?, afterMount? }
import { matchRoute, isRouteHash } from './router.js';
import { setLocale, t, tp, formatters, LOCALES } from './i18n.js';
import { h, announce, focusEl, store, prefersReducedMotion, qs } from './dom.js';
import { createClock } from './clock.js';
import { createShell } from './shell.js';

const root = document.documentElement;
const view = qs('#view');
const flags = Object.fromEntries(new URLSearchParams(location.search));
const TIERS = ['free', 'signal', 'research'];

if (flags.motion === 'reduce') root.dataset.motion = 'reduce';
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// ---- data loader with cache -----------------------------------------------------------------------
const cache = new Map();
export function loadData(name) {
  if (!cache.has(name)) {
    const file = `${name}.json`;
    const p = fetch(`data/${file}`, { credentials: 'same-origin' })
      .then((r) => {
        if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status} for ${file}`), { file });
        return r.json();
      })
      .catch((e) => {
        cache.delete(name);
        e.file ??= file;
        throw e;
      });
    cache.set(name, p);
  }
  return cache.get(name);
}
loadData.peek = (name) => cache.get(name);
loadData.clear = () => cache.clear();

// ---- app state --------------------------------------------------------------------------------------
function initialLocale() {
  const fromFlag = flags.locale;
  if (LOCALES.includes(fromFlag)) return fromFlag;
  const saved = store('quorum.locale');
  if (LOCALES.includes(saved)) return saved;
  return (navigator.language || 'en').toLowerCase().startsWith('sl') ? 'sl' : 'en';
}

function initialTier() {
  if (TIERS.includes(flags.tier)) return flags.tier;
  const saved = store('quorum.tier');
  return TIERS.includes(saved) ? saved : 'signal';
}

const app = {
  mode: qs('meta[name="quorum-mode"]')?.content === 'live' ? 'live' : 'demo',
  locale: setLocale(initialLocale()),
  tier: initialTier(),
  flags,
  clock: null,
  meta: null,
  issues: null,
  route: null,
  started: false,
  setLocale(locale) {
    if (!LOCALES.includes(locale) || locale === app.locale) return;
    app.locale = setLocale(locale);
    store('quorum.locale', locale);
    root.lang = locale;
    shell.renderAll();
    renderRoute({ transition: false, keepScroll: true, keepFocus: false }).then(() => announce(t('locale.changed')));
  },
  setTier(tier) {
    if (!TIERS.includes(tier) || tier === app.tier) return;
    app.tier = tier;
    store('quorum.tier', tier);
    if (app.mode === 'live') loadData.clear();
    shell.renderAll();
    renderRoute({ transition: false, keepScroll: true, keepFocus: true }).then(() => announce(t('tier.changed', { tier: t(`tier.${tier}`) })));
  },
};
root.lang = app.locale;

const shell = createShell(app);
shell.renderAll();

// Kick off shared data early; the home page's hero data too, so its SVG paints fast.
const metaP = loadData('meta').catch(() => null);
const issuesP = loadData('issues').catch(() => null);
if (matchRoute(location.hash).module === 'home') loadData('hero').catch(() => null);

Promise.all([metaP, issuesP]).then(([meta, issues]) => {
  app.meta = meta;
  app.issues = Array.isArray(issues) ? issues : null;
  if (meta?.asOf) app.clock = createClock({ asOf: meta.asOf, flagsNow: flags.now });
  shell.renderFooter();
  shell.updatePill();
});

// ---- router -----------------------------------------------------------------------------------------
let navSeq = 0;
let current = null;

function makeCtx(route, signal) {
  const fmt = formatters(app.locale);
  return {
    route,
    params: route.params,
    query: route.query,
    locale: app.locale,
    t: (k, v) => t(k, v, app.locale),
    tp: (k, n, v) => tp(k, n, v, app.locale),
    L: (en, sl) => (app.locale === 'sl' ? sl : en),
    fmt,
    tier: app.tier,
    mode: app.mode,
    flags,
    clock: app.clock,
    now: () => (app.clock ? app.clock.now() : new Date()),
    data: loadData,
    signal,
    navigate: (hash) => {
      location.hash = hash.startsWith('#') ? hash : `#${hash}`;
    },
    announce,
    reload: () => renderRoute({ transition: false, keepScroll: true }),
    reducedMotion: prefersReducedMotion(),
  };
}

function errorResult(ctx, err) {
  const isData = !!err?.file;
  const node = h(
    'section',
    { class: 'grid state' },
    h('p', { class: 'label c-head' }, isData ? 'Data' : 'Error'),
    h('h1', { class: 'display d2 c-head' }, isData ? ctx.t('error.data.title') : ctx.t('error.page.title')),
    h('p', { class: 'lede c-body' }, isData ? ctx.t('error.data.body', { file: err.file }) : String(err?.message ?? err)),
    h('p', { class: 'c-body' }, h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => ctx.reload() }, ctx.t('common.retry'))),
  );
  return { title: isData ? ctx.t('error.data.title') : ctx.t('error.page.title'), node };
}

async function loadPage(module) {
  try {
    return await import(`./pages/${module}.js`);
  } catch (e) {
    console.warn(`Quorum: page module ${module} failed to load`, e);
    return import('./pages/not-found.js');
  }
}

async function renderRoute({ transition = true, keepScroll = false, keepFocus = false } = {}) {
  const hash = location.hash;
  if (!isRouteHash(hash)) return;
  const seq = ++navSeq;
  const route = matchRoute(hash);
  const controller = new AbortController();
  root.dataset.busy = 'true';
  const mod = await loadPage(route.module);
  if (seq !== navSeq) return;
  const ctx = makeCtx(route, controller.signal);
  let result;
  try {
    result = await mod.render(ctx);
  } catch (err) {
    if (!err?.file) console.error(err);
    result = errorResult(ctx, err);
  }
  if (seq !== navSeq) {
    result?.cleanup?.();
    return;
  }
  const y = window.scrollY;
  const first = !app.started;
  const swap = () => {
    try {
      current?.cleanup?.();
    } catch (e) {
      console.warn(e);
    }
    current?.controller.abort();
    app.route = route;
    view.replaceChildren(result.node);
    document.title = result.title ? `${result.title} · Quorum` : `Quorum · ${t('site.tagline')}`;
    root.dataset.top = result.top ?? 'karst';
    root.dataset.route = route.module;
    current = { cleanup: result.cleanup, controller };
    if (keepScroll) window.scrollTo(0, y);
    else {
      const target = route.query.s ? document.getElementById(route.query.s) : null;
      if (target) target.scrollIntoView();
      else window.scrollTo(0, 0);
    }
    shell.markCurrent();
    shell.updateSurfaces();
  };
  const canVT = !first && transition && typeof document.startViewTransition === 'function' && !prefersReducedMotion();
  if (canVT) {
    const vt = document.startViewTransition(swap);
    try {
      await vt.updateCallbackDone;
    } catch (e) {
      console.warn(e);
    }
  } else {
    swap();
  }
  app.started = true;
  if (seq === navSeq) delete root.dataset.busy;
  if (!first && !keepFocus) {
    const target = route.query.s ? document.getElementById(route.query.s) : null;
    focusEl(target ?? qs('h1', view) ?? view);
    announce(t('announce.page', { title: result.title ?? 'Quorum' }));
  }
  requestAnimationFrame(() => result.afterMount?.());
}

window.addEventListener('hashchange', () => renderRoute());

// Skip link: the hash is the router's, so move focus by hand.
qs('.skip-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  focusEl(qs('h1', view) ?? view);
  qs('h1', view)?.scrollIntoView({ block: 'start' });
});

// Warm the next page module on hover or focus (it is a dynamic import, so it is cached).
const warmed = new Set();
function warm(e) {
  const a = e.target.closest?.('a[href^="#/"]');
  if (!a) return;
  const m = matchRoute(a.getAttribute('href')).module;
  if (warmed.has(m)) return;
  warmed.add(m);
  import(`./pages/${m}.js`).catch(() => {});
}
document.addEventListener('pointerover', warm, { passive: true });
document.addEventListener('focusin', warm);

// First render waits briefly for the display face so headlines do not reflow (no layout shift).
const fontsReady = document.fonts?.load
  ? Promise.race([
      Promise.all([document.fonts.load('600 16px Archivo'), document.fonts.load('400 12px "Martian Mono"')]).catch(() => null),
      new Promise((r) => setTimeout(r, 700)),
    ])
  : Promise.resolve();

fontsReady.then(() => renderRoute({ transition: false }));

export { app };
