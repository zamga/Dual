// Boot: locale, view-as tier, demo clock, data loader, hash router with View Transitions.
// Page modules live in js/pages/<module>.js and follow the contract in docs/DESIGN.md §9:
//   export async function render(ctx) -> { title, node, cleanup?, top?, afterMount? }
import { matchRoute, isRouteHash, routeOfHref, href } from './router.js';
import { setLocale, t, tp, formatters, LOCALES } from './i18n.js';
import { h, announce, focusEl, store, prefersReducedMotion, qs, qsa, copyText, reveal, playDigits, sweepLine, sweep, groundDisplays } from './dom.js';
import { createClock } from './clock.js';
import { createShell } from './shell.js';
import { launchInfo } from './launch.js';

const root = document.documentElement;
const view = qs('#view');
// headlines a page adds after its first render (tabs, late data) get their per-line ground too
if ('MutationObserver' in window) {
  new MutationObserver((recs) => {
    for (const r of recs) for (const n of r.addedNodes) if (n.nodeType === 1 && !n.classList.contains('display__gl') && !n.classList.contains('display__t') && !n.closest('.display__gl')) groundDisplays(n);
  }).observe(view, { childList: true, subtree: true });
}
const flags = Object.fromEntries(new URLSearchParams(location.search));
const TIERS = ['free', 'signal', 'research'];
const NOOP = () => {};

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

const MODE = qs('meta[name="quorum-mode"]')?.content === 'live' ? 'live' : 'demo';

// Demo: the "view as" tier (flag, saved choice, else Signal). Live: never the demo switch; the tier comes
// from the viewer's entitlements (GET /api/me) and is 'free' until that answers, so the pages never treat
// the server's sealed (redacted) picks as revealed.
function initialTier() {
  if (MODE === 'live') return 'free';
  if (TIERS.includes(flags.tier)) return flags.tier;
  const saved = store('quorum.tier');
  return TIERS.includes(saved) ? saved : 'signal';
}

// The same mapping as _member.js tierOf(): research_data -> research, picks -> signal, else free.
export function tierFromMe(me) {
  if (me?.entitlements?.research_data?.active) return 'research';
  if (me?.entitlements?.picks?.active) return 'signal';
  return 'free';
}

const app = {
  mode: MODE,
  locale: setLocale(initialLocale()),
  tier: initialTier(),
  me: null,
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
    const back = focusMemo();
    const kept = back !== NOOP;
    shell.renderAll();
    back();
    renderRoute({ transition: false, keepScroll: true, keepFocus: kept, force: true }).then(() => announce(t('locale.changed')));
  },
  setTier(tier) {
    if (app.mode === 'live' || !TIERS.includes(tier) || tier === app.tier) return;
    app.tier = tier;
    store('quorum.tier', tier);
    const back = focusMemo();
    shell.renderAll();
    back();
    renderRoute({ transition: false, keepScroll: true, keepFocus: true, force: true }).then(() => announce(t('tier.changed', { tier: t(`tier.${tier}`) })));
  },
  // Live mode: ask the server who is viewing. A changed entitlement drops the cached data files, since
  // picks.json and universe.json are redacted per viewer.
  async refreshViewer() {
    if (app.mode !== 'live') return false;
    let me = null;
    try {
      const r = await fetch('/api/me', { credentials: 'same-origin', headers: { accept: 'application/json' } });
      me = r.ok ? await r.json() : null;
    } catch {
      me = null;
    }
    const tier = tierFromMe(me);
    const changed = tier !== app.tier || !!me?.authenticated !== !!app.me?.authenticated;
    app.me = me;
    app.tier = tier;
    if (changed) {
      loadData.clear();
      shell.renderAll();
    }
    return changed;
  },
};

// The pill saw the demo clock pin itself (the next issue slot passed with the page open): pages that
// read ctx.now() re-render once, in place.
app.onClockPinned = () => {
  if (app.started) renderRoute({ transition: false, keepScroll: true, keepFocus: true, force: true });
};

// A demo-bar or locale control is rebuilt by shell.renderAll(); keyboard users keep their place on its
// replacement (the same tier button, the select, or the locale button).
function focusMemo() {
  const a = document.activeElement;
  if (!a || a === document.body) return NOOP;
  const bar = qs('#demo-bar');
  let sel = null;
  if (a.matches?.('.demo-bar__select')) sel = '.demo-bar__select';
  else if (a.dataset?.tier) sel = `.seg button[data-tier="${a.dataset.tier}"]`;
  else if (a.matches?.('.locale-btn')) sel = a.closest('#sheet') ? '#sheet .locale-btn' : '#demo-bar .locale-btn';
  if (!sel || !(bar.contains(a) || a.closest('#sheet'))) return NOOP;
  return () => {
    const next = qs(sel);
    if (next && next.offsetParent !== null) next.focus({ preventScroll: true });
  };
}
root.lang = app.locale;

const shell = createShell(app);
shell.renderAll();

// ---- the 14:00 boot (DESIGN-V2 §4.2) -------------------------------------------------------------------
// First visit per session only, never under reduced motion, skipped by any key, click, wheel or touch, and
// never longer than 1.4 s. It is added by script, so the page is complete without it. On night: the four
// rules rise, the day of the latest issue types itself in bay 1 (06:00 data in … 14:00 published), the
// readout fades, the cover lifts and the headline masks in. It hides the wait for the display face.
const boot = (() => {
  const t0 = performance.now();
  let seen = true;
  try {
    seen = sessionStorage.getItem('quorum.boot') === '1';
    sessionStorage.setItem('quorum.boot', '1');
  } catch {
    seen = true; // no storage: no way to show it once, so never show it
  }
  if (seen || prefersReducedMotion() || flags.boot === '0') return { active: false, fill: NOOP, headlineDelay: () => 120 };
  const lines = h('div', { class: 'boot__lines' });
  const el = h('div', { class: 'boot', 'aria-hidden': 'true' }, h('div', { class: 'boot__rules' }, h('i'), h('i'), h('i'), h('i')), lines);
  root.classList.add('is-boot');
  document.body.append(el);
  let ended = false;
  const EVENTS = ['keydown', 'pointerdown', 'wheel', 'touchstart'];
  const end = () => {
    if (ended) return;
    ended = true;
    EVENTS.forEach((e) => removeEventListener(e, skip, true));
    root.classList.remove('is-boot');
    el.remove();
  };
  function skip() {
    if (ended) return;
    EVENTS.forEach((e) => removeEventListener(e, skip, true));
    const a = el.animate?.([{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], { duration: 150, fill: 'forwards' });
    if (a) a.finished.then(end, end);
    else end();
  }
  EVENTS.forEach((e) => addEventListener(e, skip, { capture: true, passive: true }));
  setTimeout(end, 1400);
  return {
    active: true,
    // the four lines, from the real latest issue (issues.json), typed 120 ms apart from 200 ms
    fill(issues) {
      const last = Array.isArray(issues) ? issues[issues.length - 1] : null;
      const elapsed = performance.now() - t0;
      if (ended || !last || elapsed > 760) return;
      const fmt = formatters(app.locale);
      const sl = app.locale === 'sl';
      const v = last.vetoes ?? {};
      const met = (last.closest ?? 0) >= (last.required ?? 3) && (last.reached ?? 0) > 0;
      const n = (last.buys?.length ?? 0) + (last.renews?.length ?? 0);
      const outcome = last.quorum ? tp('pill.quorum', n).toLowerCase() : met ? (sl ? 'brez nove izbire' : 'no new pick') : sl ? 'brez kvoruma' : 'no quorum';
      const at = String(last.publishAt ?? '').slice(11, 16) || '14:00';
      const text = sl
        ? [`06:00 podatki · ${fmt.int(last.nScored)} delnic`, `11:30 veti · ${fmt.int(v.rule ?? 0)} pravila · ${fmt.int(v.llm ?? 0)} novice`, `13:45 zapečateno · sha256 ${String(last.hash).slice(0, 8)}`, `${at} objavljeno · izdaja #${last.issueNo} · ${outcome}`]
        : [`06:00 data in · ${fmt.int(last.nScored)} stocks`, `11:30 vetoes · ${fmt.int(v.rule ?? 0)} rule · ${fmt.int(v.llm ?? 0)} news`, `13:45 sealed · sha256 ${String(last.hash).slice(0, 8)}`, `${at} published · issue #${last.issueNo} · ${outcome}`];
      lines.replaceChildren(
        ...text.map((s, i) => {
          const p = h('p', { class: 'boot__line' }, s);
          p.style.animationDelay = `${Math.max(0, 200 + i * 120 - elapsed)}ms`;
          return p;
        }),
      );
    },
    headlineDelay: () => Math.max(120, 1000 - (performance.now() - t0)),
  };
})();

// Kick off shared data early; the home page's hero data too, so its SVG paints fast.
const metaP = loadData('meta').catch(() => null);
const issuesP = loadData('issues').catch(() => null);
if (matchRoute(location.hash).module === 'home') {
  loadData('hero').catch(() => null);
  loadData('backtest').catch(() => null); // the launch status the hero's copy reads
}

Promise.all([metaP, issuesP]).then(([meta, issues]) => {
  app.meta = meta;
  app.issues = Array.isArray(issues) ? issues : null;
  boot.fill(app.issues);
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
    // The launch status (web/js/launch.js) from backtest.json: pages ask it before they say a text was
    // sent. Unknown counts as pre-launch, so nothing claims a delivery that did not happen.
    launch: () => loadData('backtest').then(launchInfo, () => launchInfo(null)),
    me: app.me,
    signal,
    navigate: (hash) => {
      location.hash = hash.startsWith('#') ? hash : `#${hash}`;
    },
    announce,
    reload: async () => {
      if (app.mode === 'live') await app.refreshViewer();
      return renderRoute({ transition: false, keepScroll: true, force: true });
    },
    href,
    reducedMotion: prefersReducedMotion(),
  };
}

// A failed page never shows the raw exception to the reader (it is in the console for us).
function errorResult(ctx, err) {
  const isData = !!err?.file;
  const node = h(
    'section',
    { class: 'grid state' },
    h('p', { class: 'label c-head' }, isData ? ctx.t('error.data.kicker') : ctx.t('error.page.kicker')),
    h('h1', { class: 'display d2 c-head' }, isData ? ctx.t('error.data.title') : ctx.t('error.page.title')),
    h('p', { class: 'lede c-body' }, isData ? ctx.t('error.data.body', { file: err.file }) : ctx.t('error.page.body')),
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

// Legacy '#/p/0052' links are rewritten in place to the flat token ('#p-0052'); no extra history entry.
function normaliseLegacy(route) {
  if (!route.legacy || route.name === 'not-found') return;
  try {
    const hash = route.hash === '#' ? '' : route.hash;
    history.replaceState(history.state, '', `${location.pathname}${location.search}${hash}`);
  } catch {
    /* sandboxed history: the legacy form keeps working */
  }
}

// Scroll to a section of the current page (#ledger~scoreboard). Pages that fill in sections after
// their data arrives get two more chances to have the target in the document.
function scrollToSection(id, { focus = true } = {}) {
  const go = () => {
    const el = id ? document.getElementById(id) : null;
    if (!el) return false;
    el.scrollIntoView({ block: 'start' });
    if (focus) focusEl(el.querySelector('h2, h3') ?? el);
    return true;
  };
  if (go()) return true;
  setTimeout(() => go() || setTimeout(go, 900), 300);
  return false;
}

async function renderRoute({ transition = true, keepScroll = false, keepFocus = false, force = false } = {}) {
  const hash = location.hash;
  if (!isRouteHash(hash) && app.started) return;
  const route = matchRoute(isRouteHash(hash) ? hash : '');
  normaliseLegacy(route);
  // Same page, another section: scroll, do not re-render.
  if (!force && app.started && app.route && current && route.name === app.route.name && route.token === app.route.token && route.section !== app.route.section) {
    app.route = route;
    if (route.section) scrollToSection(route.section);
    else window.scrollTo(0, 0);
    return;
  }
  const seq = ++navSeq;
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
  const prevRoute = app.route;
  let sectionFound = false;
  // The shared element (DESIGN-V2 §4.4): a pick's lintel or badge carries view-transition-name pick-<no>
  // on both sides of the change, so it morphs. Named only for this one transition, and only when both the
  // old and the new page hold it (a name on one side only would fade, not morph).
  const pickNo = route.name === 'pick' ? route.params?.no : prevRoute?.name === 'pick' ? prevRoute.params?.no : null;
  const oldPick = pickNo ? qs(`[data-vt-pick="${pickNo}"]`, view) : null;
  const newPick = pickNo ? qs(`[data-vt-pick="${pickNo}"]`, result.node) : null;
  const morph = oldPick && newPick && !reduced();
  const swap = () => {
    try {
      current?.cleanup?.();
    } catch (e) {
      console.warn(e);
    }
    current?.controller.abort();
    app.route = route;
    root.classList.remove('is-leaving-stage');
    groundDisplays(result.node);
    view.replaceChildren(result.node);
    document.title = result.title ? `${result.title} · Quorum Research` : 'Quorum Research';
    root.dataset.top = result.top ?? 'karst';
    root.dataset.route = route.module;
    current = { cleanup: result.cleanup, controller };
    if (keepScroll) window.scrollTo(0, y);
    else {
      window.scrollTo(0, 0);
      if (route.section) sectionFound = scrollToSection(route.section, { focus: false });
    }
    if (oldPick) oldPick.style.viewTransitionName = '';
    if (morph) {
      newPick.style.viewTransitionName = `pick-${pickNo}`;
      newPick.classList.add('vt-pick');
    }
    shell.markCurrent();
    // the header switches its theme at the swap, not a frame later: the new snapshot never shows it mid-way
    if (shell.updateSurfacesNow) shell.updateSurfacesNow();
    else shell.updateSurfaces();
  };
  const moving = !first && transition;
  const canVT = moving && typeof document.startViewTransition === 'function';
  const line = pending.line;
  pending.line = null;
  if (canVT) {
    if (morph) {
      oldPick.style.viewTransitionName = `pick-${pickNo}`;
      oldPick.classList.add('vt-pick');
    }
    let vt;
    await stageFaded();
    if (seq !== navSeq) {
      result?.cleanup?.();
      return;
    }
    // the old main is cut away above the sweep line as the new one is revealed under it (playSweep)
    oldRect = view.getBoundingClientRect();
    root.classList.add('is-vt');
    try {
      vt = document.startViewTransition(swap);
    } catch (e) {
      console.warn(e);
      swap();
    }
    if (!vt) root.classList.remove('is-vt');
    if (vt) {
      vt.ready.then(() => playSweep(line, true), () => line?.remove());
      vt.finished.finally(() => {
        root.classList.remove('is-vt');
        line?.remove();
        if (newPick?.isConnected) newPick.style.viewTransitionName = '';
      });
      try {
        await vt.updateCallbackDone;
      } catch (e) {
        console.warn(e);
      }
    }
  } else {
    if (moving) await stageFaded();
    swap();
    if (moving) playSweep(line, false);
    else line?.remove();
  }
  app.started = true;
  if (seq === navSeq) delete root.dataset.busy;
  if (!first && !keepFocus) {
    const target = route.section && sectionFound ? document.getElementById(route.section) : null;
    focusEl(target?.querySelector('h2, h3') ?? target ?? qs('h1', view) ?? view);
    announce(t('announce.page', { title: result.title ?? 'Quorum' }));
  }
  if (moving || first) arrive(first ? boot.headlineDelay() : 120);
  requestAnimationFrame(() => result.afterMount?.());
}

const reduced = () => prefersReducedMotion();

// ---- the lintel sweep (DESIGN-V2 §4.4) ------------------------------------------------------------------
// A route change shows its first change at once: a 1 px line draws itself along the header's bottom edge
// (r1→r4) while the page loads. When the new page is in, the line travels to the bottom of the viewport on
// --e-io and the new main is wiped in behind it on the same curve; the old main has already lifted 16 px
// and faded (180 ms, CSS). The rules, the header and the stage never move.
const pending = { line: null };
let oldRect = null;
function headerEdge() {
  const hb = qs('#site-header').getBoundingClientRect();
  return Math.max(0, hb.bottom);
}
// Leaving a page with a scene on screen (the Assembly, a pick's colonnade): the scene fades to 0 over
// 180 ms first (CSS: html.is-leaving-stage), and the route change waits for it before the snapshot.
const stageFade = { until: 0 };
function fadeStage() {
  const scene = qs('.asm__stage, .pk-cols', view);
  if (!scene) return;
  const r = scene.getBoundingClientRect();
  if (r.bottom <= 0 || r.top >= window.innerHeight) return;
  root.classList.add('is-leaving-stage');
  stageFade.until = performance.now() + 180;
}
const stageFaded = () => new Promise((res) => setTimeout(res, Math.max(0, stageFade.until - performance.now())));

function startLine() {
  if (reduced() || !app.started) return;
  fadeStage();
  pending.line?.remove();
  const line = sweepLine(headerEdge());
  line.style.viewTransitionName = 'sweep';
  document.body.append(line);
  pending.line = line;
}
function playSweep(line, vt) {
  if (!line) return;
  if (reduced()) return line.remove();
  const from = headerEdge();
  const to = window.innerHeight;
  if (vt) {
    // the new main is revealed from the header edge down to the line, in px, so the two stay together
    const r = view.getBoundingClientRect();
    const hgt = Math.max(1, r.height);
    const cut = (yy) => `inset(0 0 ${Math.max(0, Math.round(hgt - (yy - r.top)))}px 0)`;
    try {
      document.documentElement.animate({ clipPath: [cut(from), cut(to)] }, { duration: 420, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'both', pseudoElement: '::view-transition-new(main)' });
    } catch {
      /* the CSS wipe stays */
    }
    // and the old main is cut away above the same line: no frame ever shows the two pages through each other
    if (oldRect) {
      const o = oldRect;
      // the group does not move (CSS), so the old image is put back where the old main stood
      const dy = `translate3d(0, ${Math.round(o.top - r.top)}px, 0)`;
      const top = (yy) => `inset(${Math.max(0, Math.round(yy - o.top))}px 0 0 0)`;
      try {
        document.documentElement.animate({ clipPath: [top(from), top(to)], transform: [dy, dy] }, { duration: 420, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'both', pseudoElement: '::view-transition-old(main)' });
      } catch {
        /* the old main stays opaque under the new one */
      }
    }
    sweep(line, from, to, { pseudo: '::view-transition-group(sweep)' }).then(() => line.remove());
  } else {
    sweep(line, from, to).then(() => line.remove());
  }
}

// Arrival: display lines mask in (the page headline at once, 120 ms into the sweep), body text marked
// .reveal-in fades up after 200 ms, and the figures in the first screen drop their digits.
function arrive(delay) {
  if (reduced()) return;
  view.classList.remove('vt-in');
  void view.offsetWidth;
  view.classList.add('vt-in');
  const go = () => {
    const h1 = qs('h1.display', view);
    if (h1 && !h1.closest('.asm, .lv')) reveal(h1, { delay: Math.max(0, delay) });
    // the home hero's headline lines (their own masks, .asm__ln) rise the same way, once, on arrival
    qsa('.asm__beat.is-on h1 .asm__li', view).forEach((li, i) =>
      li.animate?.([{ transform: 'translate3d(0, 140%, 0)' }, { transform: 'none' }], { duration: 700, delay: Math.max(0, delay) + i * 60, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }),
    );
    for (const d of qsa('.dg', view)) if (d.getBoundingClientRect().top < window.innerHeight) playDigits(d);
    // body text in the first screen fades up 12 px after the headline has started (CSS: .vt-in .reveal-in)
    for (const el of qsa('.lede, .stage-screen__strip, .wall__figs, .masthead__meta', view)) if (!el.closest('.asm') && el.getBoundingClientRect().top < window.innerHeight) el.classList.add('reveal-in');
  };
  if (document.fonts?.status === 'loaded') go();
  else fontWait.then(go);
}

window.addEventListener('hashchange', () => {
  startLine();
  renderRoute();
});


// Copy buttons rendered from copy strings (contact addresses: ui.js contactHtml): one delegated handler.
document.addEventListener('click', async (e) => {
  const b = e.target.closest?.('button[data-copy]');
  if (!b) return;
  const text = b.dataset.copy;
  const ok = await copyText(text);
  const was = b.textContent;
  b.textContent = ok ? (app.locale === 'sl' ? 'Kopirano' : 'Copied') : was;
  announce(ok ? (app.locale === 'sl' ? `Naslov kopiran: ${text}` : `Address copied: ${text}`) : app.locale === 'sl' ? `Izberite naslov: ${text}` : `Select the address: ${text}`);
  if (!ok) {
    const addr = b.parentElement?.querySelector('.contact__addr');
    if (addr) getSelection()?.selectAllChildren(addr);
  }
  setTimeout(() => {
    if (b.isConnected) b.textContent = was;
  }, 1600);
});

// Skip link: the hash is the router's, so move focus by hand.
qs('.skip-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  focusEl(qs('h1', view) ?? view);
  qs('h1', view)?.scrollIntoView({ block: 'start' });
});

// Warm the next page module on hover or focus (it is a dynamic import, so it is cached).
const warmed = new Set();
function warm(e) {
  const a = e.target.closest?.('a[href^="#"]');
  if (!a) return;
  const m = routeOfHref(a.getAttribute('href'))?.module;
  if (!m) return;
  if (warmed.has(m)) return;
  warmed.add(m);
  import(`./pages/${m}.js`).catch(() => {});
}
document.addEventListener('pointerover', warm, { passive: true });
document.addEventListener('focusin', warm);

// The first render waits briefly for the display face so headlines do not reflow (no layout shift); the
// boot (below) hides that wait on a first visit.
const fontWait = document.fonts?.load
  ? Promise.race([
      Promise.all([document.fonts.load('460 1em "Mona Sans"'), document.fonts.load('420 12px "Martian Mono"')]).catch(() => null),
      new Promise((r) => setTimeout(r, 1200)),
    ])
  : Promise.resolve();
const fontsReady = boot.active ? fontWait : Promise.race([fontWait, new Promise((r) => setTimeout(r, 700))]);
// html.fonts-mona: only once a Mona Sans face has really loaded (document.fonts.check() is true when the
// family is not declared at all, so it cannot tell a blocked stylesheet from a loaded font)
const markFonts = () => {
  try {
    if ([...document.fonts].some((f) => f.family.replace(/["']/g, '') === 'Mona Sans' && f.status === 'loaded')) root.classList.add('fonts-mona');
  } catch {
    /* no FontFaceSet: the fallback settings stay */
  }
};
fontsReady.then(markFonts);
document.fonts?.addEventListener?.('loadingdone', markFonts);

// Live mode renders the first page only once the server has said who is viewing.
const viewerReady = app.mode === 'live' ? app.refreshViewer().catch(() => false) : Promise.resolve();
Promise.all([fontsReady, viewerReady]).then(() => renderRoute({ transition: false }));

export { app };
