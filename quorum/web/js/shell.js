// The persistent shell: demo bar, header (mark, three-question nav, issue pill, locale), the menu
// sheet, the footer, and the labels of the four column rules. Rendered once, re-rendered only on a
// locale change. The rules themselves live in index.html and are never touched.
import { h, qs, qsa, focusEl, setNumber } from './dom.js';
import { t, tp, pickL, formatters } from './i18n.js';
import { pillState, msToNextMinute, clockMode } from './clock.js';
import { formatInZone, LJUBLJANA } from './core/calendar.js';
import { href, routeOfHref } from './router.js';

const GROUPS = [
  { id: 'how', q: 'nav.q.how', links: [[href('how-it-works'), 'nav.howItWorks'], [href('methodology'), 'nav.methodology']] },
  { id: 'proof', q: 'nav.q.proof', links: [[href('ledger'), 'nav.ledger'], [href('backtest'), 'nav.backtest']] },
  { id: 'get', q: 'nav.q.get', links: [[href('pricing'), 'nav.pricing'], [href('join'), 'nav.join']] },
];

export function markGlyph() {
  // The lintel mark: four columns, three reach the top, the lintel rests on them.
  return h(
    'svg',
    { class: 'mark__glyph', viewBox: '0 0 22 22', 'aria-hidden': 'true', focusable: 'false' },
    h('rect', { x: '1', y: '2', width: '20', height: '3', fill: 'currentColor' }),
    h('rect', { x: '2', y: '7', width: '2', height: '14', fill: 'currentColor' }),
    h('rect', { x: '8', y: '11', width: '2', height: '10', fill: 'currentColor' }),
    h('rect', { x: '12', y: '7', width: '2', height: '14', fill: 'currentColor' }),
    h('rect', { x: '18', y: '7', width: '2', height: '14', fill: 'currentColor' }),
  );
}

function mark() {
  return h('a', { class: 'mark', href: href('home'), 'aria-label': t('nav.home') }, markGlyph(), h('span', { class: 'mark__word', 'aria-hidden': 'true' }, 'Quorum'));
}

export function createShell(app) {
  const header = qs('#site-header');
  const demo = qs('#demo-bar');
  const footer = qs('#site-footer');
  const sheet = qs('#sheet');
  const plinths = qs('#plinths');
  const tip = qs('#rule-tip');
  const rules = qsa('.rules > i');
  let pillEl = null;
  let pillTimer = 0;
  let lastFocus = null;

  // ---- demo bar -----------------------------------------------------------------------------------
  function renderDemo() {
    const tiers = ['free', 'signal', 'research'];
    const seg = h(
      'div',
      { class: 'seg', role: 'group', 'aria-labelledby': 'viewas-label' },
      tiers.map((id) =>
        h('button', { type: 'button', 'aria-pressed': String(app.tier === id), onclick: () => app.setTier(id), title: t('demo.viewAsHint') }, t(`tier.${id}`)),
      ),
    );
    const sel = h(
      'select',
      { class: 'demo-bar__select', 'aria-label': t('demo.viewAs'), onchange: (e) => app.setTier(e.target.value) },
      tiers.map((id) => h('option', { value: id, selected: app.tier === id }, `${t(`tier.${id}`)} ▾`)),
    );
    demo.replaceChildren(
      h(
        'p',
        { class: 'demo-bar__text label' },
        h('span', { class: 'demo-bar__long' }, t('demo.notice')),
        h('span', { class: 'demo-bar__short' }, t('demo.short')),
      ),
      h('div', { class: 'demo-bar__tier' }, h('span', { class: 'label', id: 'viewas-label' }, t('demo.viewAs')), seg, sel, localeButton()),
    );
  }

  // ---- header ----------------------------------------------------------------------------------------
  function renderHeader() {
    pillEl = h('a', { class: 'pill', href: href('ledger'), dataset: { state: 'countdown' } });
    const menuBtn = h(
      'button',
      { type: 'button', class: 'menu-btn', 'aria-expanded': 'false', 'aria-controls': 'sheet', onclick: () => openSheet(menuBtn) },
      h('span', { class: 'menu-btn__icon', 'aria-hidden': 'true' }, h('i'), h('i')),
      h('span', {}, t('nav.menu')),
    );
    header.replaceChildren(
      h('div', { class: 'site-header__mark' }, mark()),
      h(
        'nav',
        { class: 'nav', 'aria-label': t('nav.label') },
        GROUPS.map((g) =>
          h(
            'div',
            { class: 'nav__group' },
            h('span', { class: 'nav__q', id: `nq-${g.id}` }, t(g.q)),
            h('ul', { class: 'nav__links', 'aria-labelledby': `nq-${g.id}` }, g.links.map(([href, key]) => h('li', {}, h('a', { href }, t(key))))),
          ),
        ),
      ),
      h('div', { class: 'site-header__tools' }, pillEl, menuBtn),
    );
    updatePill();
    markCurrent();
  }

  function localeButton() {
    const other = app.locale === 'en' ? 'sl' : 'en';
    return h(
      'button',
      { type: 'button', class: 'locale-btn', lang: other, 'aria-label': t('locale.switchTo'), onclick: () => app.setLocale(other) },
      h('b', { 'aria-hidden': 'true' }, app.locale.toUpperCase()),
      h('span', { 'aria-hidden': 'true' }, '/'),
      h('span', { 'aria-hidden': 'true' }, other.toUpperCase()),
    );
  }

  // ---- the pill ----------------------------------------------------------------------------------------
  function updatePill() {
    if (!pillEl || !app.clock) return;
    const now = app.clock.now();
    const mode = clockMode(app.clock);
    const st = pillState(now, app.issues ?? []);
    const fmt = formatters(app.locale);
    const last = app.issues?.length ? app.issues[app.issues.length - 1] : null;
    let state;
    let parts;
    let title;
    if (st.kind === 'result') {
      state = st.quorum ? 'quorum' : 'none';
      parts = [h('span', { class: 'pill__main' }, st.quorum ? tp('pill.quorum', st.picks) : t('pill.noQuorum'))];
      title = t('pill.title.result', { tz: st.tz });
      pillEl.href = href('issue', st.date);
    } else {
      state = 'countdown';
      parts = [
        h('span', { class: 'pill__top' }, t('pill.next'), mode === 'pinned' ? h('span', { class: 'pill__pin' }, ` · ${t('pill.pinned')}`) : null),
        h('span', { class: 'pill__main' }, '14:00', h('span', { class: 'pill__sep', 'aria-hidden': 'true' }, ' · '), h('span', { class: 'pill__left' }, st.left.text)),
      ];
      const p = formatInZone(app.clock.pinnedInstant, LJUBLJANA);
      title =
        mode === 'pinned'
          ? t('pill.title.pinned', { date: fmt.date(p.date), time: p.time.slice(0, 5), tz: p.offset === '+02:00' ? 'CEST' : 'CET' })
          : mode === 'override'
            ? t('pill.title.override')
            : t('pill.title.live', { tz: st.tz });
      pillEl.href = last ? href('issue', last.date) : href('ledger');
    }
    const leftEl = qs('.pill__left', pillEl);
    const sameShape = pillEl.dataset.state === state && pillEl.dataset.mode === mode && leftEl && st.kind === 'countdown';
    if (sameShape) {
      setNumber(leftEl, st.left.text);
    } else {
      pillEl.replaceChildren(h('span', { class: 'pill__dot', 'aria-hidden': 'true' }), h('span', { class: 'pill__text' }, ...parts));
    }
    pillEl.dataset.state = state;
    pillEl.dataset.mode = mode;
    pillEl.title = title;
    pillEl.setAttribute('aria-label', `${pillEl.textContent.replace(/\s+/g, ' ').trim()}. ${title}`);
    clearTimeout(pillTimer);
    pillTimer = setTimeout(updatePill, msToNextMinute(now));
  }

  // ---- menu sheet ----------------------------------------------------------------------------------------
  function renderSheet() {
    const closeBtn = h(
      'button',
      { type: 'button', class: 'menu-btn', 'aria-expanded': 'true', onclick: () => closeSheet() },
      h('span', { class: 'menu-btn__icon', 'aria-hidden': 'true' }, h('i'), h('i')),
      h('span', {}, t('nav.close')),
    );
    const extra = [
      [href('help'), 'nav.help'],
      [href('about'), 'nav.about'],
      [href('disclosures'), 'nav.disclosures'],
      [href('methodology-changelog'), 'nav.changelog'],
      [href('status'), 'nav.status'],
    ];
    sheet.replaceChildren(
      h('div', { class: 'sheet__top' }, mark(), closeBtn),
      h(
        'nav',
        { class: 'sheet__body', 'aria-label': t('nav.label') },
        GROUPS.map((g) =>
          h('div', { class: 'sheet__q' }, h('h2', { id: `sq-${g.id}` }, t(g.q)), h('ul', { 'aria-labelledby': `sq-${g.id}` }, g.links.map(([href, key]) => h('li', {}, h('a', { href }, t(key)))))),
        ),
      ),
      h(
        'div',
        { class: 'sheet__foot' },
        h('ul', { class: 'sheet__links' }, extra.map(([href, key]) => h('li', {}, h('a', { href }, t(key))))),
        localeButton(),
      ),
    );
    sheet.setAttribute('aria-label', t('nav.sheet'));
  }

  function openSheet(btn) {
    lastFocus = btn;
    renderSheet();
    sheet.hidden = false;
    requestAnimationFrame(() => {
      sheet.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      document.documentElement.classList.add('has-sheet');
      focusEl(qs('.sheet__body a', sheet));
    });
  }

  function closeSheet({ restore = true } = {}) {
    if (!sheet.classList.contains('is-open')) return;
    sheet.classList.remove('is-open');
    document.documentElement.classList.remove('has-sheet');
    qsa('.menu-btn', header).forEach((b) => b.setAttribute('aria-expanded', 'false'));
    setTimeout(() => {
      if (!sheet.classList.contains('is-open')) sheet.hidden = true;
    }, 260);
    if (restore && lastFocus?.isConnected) lastFocus.focus();
  }

  sheet.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSheet();
      return;
    }
    if (e.key !== 'Tab') return;
    const f = qsa('a[href], button:not([disabled]), select', sheet).filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  sheet.addEventListener('click', (e) => {
    if (e.target.closest('a[href]')) closeSheet({ restore: false });
  });

  // ---- footer ----------------------------------------------------------------------------------------
  function renderFooter() {
    const fmt = formatters(app.locale);
    const col = (label, links) =>
      h('div', { class: 'footer-col' }, h('p', { class: 'label' }, label), links.map(([href, text]) => h('a', { href }, text)));
    const meta = app.meta;
    const lastM = meta?.methodology?.[meta.methodology.length - 1];
    footer.replaceChildren(
      h(
        'nav',
        { class: 'footer-nav', 'aria-label': 'Footer' },
        col(t('nav.q.how'), [[href('how-it-works'), t('nav.howItWorks')], [href('methodology'), t('nav.methodology')], [href('methodology-changelog'), t('nav.changelog')]]),
        col(t('nav.q.proof'), [[href('ledger'), t('nav.ledger')], [href('backtest'), t('nav.backtest')], [href('disclosures'), t('nav.disclosures')], [href('disclosures', null, 'list'), t('footer.all12m')]]),
        col(t('nav.q.get'), [[href('pricing'), t('nav.pricing')], [href('join'), t('nav.join')], [href('help'), t('nav.help')], [href('status'), t('nav.status')]]),
        col(t('footer.legal'), [
          [href('legal', 'terms'), t('footer.terms')],
          [href('legal', 'privacy'), t('footer.privacy')],
          [href('legal', 'sms'), t('footer.sms')],
          [href('legal', 'imprint'), t('footer.imprint')],
          [href('legal', 'cookies'), t('footer.cookies')],
          [href('disclosures', null, 'conflicts'), t('footer.conflicts')],
          [href('about'), t('nav.about')],
        ]),
      ),
      h(
        'div',
        { class: 'footer-disclosure' },
        h('p', {}, t('footer.company')),
        h('p', {}, t('footer.p1')),
        h('p', {}, t('footer.p2')),
        h('p', {}, t('footer.p3')),
        h('p', {}, t('footer.p4')),
      ),
      h(
        'div',
        { class: 'footer-meta' },
        h('p', { class: 'label' }, meta ? t('footer.data', { date: fmt.date(meta.asOf), model: meta.modelVersion, version: lastM?.version ?? '1.0' }) : ''),
        h('p', { class: 'small muted' }, t('footer.demo')),
      ),
      h(
        'div',
        { class: 'footer-mark' },
        h('p', { class: 'd-foot', 'aria-hidden': 'true' }, 'Quorum'),
        h('p', { class: 'label' }, app.locale === 'sl' ? 'Brez kvoruma ni SMS.' : 'No quorum, no text.'),
      ),
    );
  }

  // ---- current route marking --------------------------------------------------------------------------
  function markCurrent() {
    const cur = app.route;
    const group = cur?.group;
    for (const a of qsa('a[href^="#"]', header).concat(qsa('a[href^="#"]', sheet))) {
      const target = routeOfHref(a.getAttribute('href'));
      const on = !!cur && !!target && target.name !== 'home' && !target.section && (target.name === cur.name || target.name === cur.parent);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    header.dataset.group = group ?? '';
  }

  // ---- rule labels: hover a rule (after a short dwell), or focus a plinth ------------------------
  function ruleInfo(i) {
    const id = 'ABCD'[i];
    return { id, name: familyLabel(id, 'name'), def: familyLabel(id, 'def') };
  }

  function familyLabel(id, which) {
    const f = app.meta?.families?.find((x) => x.id === id);
    if (f) return pickL(f[which], app.locale);
    return t(which === 'name' ? `family.${id}` : `familyDef.${id}`);
  }

  function renderPlinths() {
    plinths.replaceChildren(
      ...[0, 1, 2, 3].map((i) => {
        const info = ruleInfo(i);
        const b = h('button', { type: 'button', class: 'plinth', 'aria-label': `${t('rules.label', { id: info.id })}: ${info.name}. ${info.def}` }, info.id);
        const on = () => showTip(i, null, b);
        b.addEventListener('mouseenter', on);
        b.addEventListener('focus', on);
        b.addEventListener('mouseleave', hideTip);
        b.addEventListener('blur', hideTip);
        return b;
      }),
    );
  }

  let tipFor = -1;
  function showTip(i, pointerY, plinth) {
    const r = rules[i].getBoundingClientRect();
    const info = ruleInfo(i);
    tip.replaceChildren(
      h('span', { class: 'rule-tip__id' }, t('rules.label', { id: info.id })),
      h('span', { class: 'rule-tip__name' }, info.name),
      h('span', { class: 'rule-tip__def' }, info.def),
    );
    tip.hidden = false;
    const w = tip.offsetWidth;
    const hgt = tip.offsetHeight;
    let x = r.left + 10;
    if (x + w > window.innerWidth - 12) x = r.left - w - 10;
    let y = pointerY != null ? pointerY + 14 : plinth.getBoundingClientRect().top - hgt - 10;
    y = Math.max(12, Math.min(window.innerHeight - hgt - 12, y));
    tip.style.setProperty('--x', `${Math.round(x)}px`);
    tip.style.setProperty('--y', `${Math.round(y)}px`);
    tip.dataset.surface = plinths.dataset.surface ?? 'karst';
    tip.classList.add('is-on');
    rules.forEach((el, k) => el.classList.toggle('is-lit', k === i));
    qsa('.plinth', plinths).forEach((el, k) => el.classList.toggle('is-lit', k === i));
    tipFor = i;
  }

  function hideTip() {
    tip.classList.remove('is-on');
    rules.forEach((el) => el.classList.remove('is-lit'));
    qsa('.plinth', plinths).forEach((el) => el.classList.remove('is-lit'));
    tipFor = -1;
  }

  let ruleXs = [];
  const measureRules = () => {
    ruleXs = rules.map((el) => el.getBoundingClientRect().left);
  };
  let dwell = 0;
  let near = -1;
  let raf = 0;
  let lastEv = null;
  document.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      lastEv = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const ev = lastEv;
        if (!ruleXs.length) measureRules();
        const i = ruleXs.findIndex((x) => Math.abs(ev.clientX - x) <= 5);
        const onUi = ev.target.closest?.('a, button, input, select, textarea, summary, .ts, .hash, canvas, .no-rule-tip');
        if (i === -1 || onUi) {
          clearTimeout(dwell);
          near = -1;
          if (tipFor !== -1 && !qs('.plinth:hover, .plinth:focus', plinths)) hideTip();
          return;
        }
        if (i !== near) {
          near = i;
          clearTimeout(dwell);
          const y = ev.clientY;
          dwell = setTimeout(() => showTip(i, y), 220);
        } else if (tipFor === i) {
          showTip(i, ev.clientY);
        }
      });
    },
    { passive: true },
  );
  window.addEventListener('resize', () => {
    measureRules();
    hideTip();
  });

  // ---- header behaviour: surface under it, hide on scroll down, show on scroll up ---------------
  let lastY = window.scrollY;
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY;
      const hh = header.offsetHeight;
      const demoH = demo.offsetHeight;
      const stuck = y > demoH + 2;
      header.classList.toggle('is-stuck', stuck);
      const focusInside = header.contains(document.activeElement);
      if (stuck && y > lastY + 6 && y > demoH + hh * 2 && !focusInside) header.classList.add('is-hidden');
      else if (y < lastY - 6 || !stuck) header.classList.remove('is-hidden');
      lastY = y;
      updateSurfaces();
    });
  }

  function surfaceAt(x, y, exclude) {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      if (exclude.some((ex) => ex.contains(el))) continue;
      if (el.closest('.lv')) return 'hero';
      if (el.closest('.chamber')) return 'chamber';
      if (el.closest('#view, .site-footer, .demo-bar')) return 'karst';
    }
    return 'karst';
  }

  function updateSurfaces() {
    const x = Math.round(window.innerWidth / 2);
    const stuck = header.classList.contains('is-stuck');
    const top = document.documentElement.dataset.top ?? 'karst';
    const hb = header.getBoundingClientRect();
    let surf = !stuck ? top : surfaceAt(x, Math.max(1, hb.bottom - 2), [header, sheet, plinths, tip]);
    if (surf === 'hero') surf = 'chamber';
    if (header.dataset.surface !== surf) header.dataset.surface = surf;
    const py = window.innerHeight - 18;
    const ps = surfaceAt(x, py, [header, sheet, plinths, tip]);
    if (plinths.dataset.surface !== ps) plinths.dataset.surface = ps;
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener(
    'scroll',
    () => {
      if (tipFor !== -1 && !plinths.contains(document.activeElement)) hideTip();
      clearTimeout(dwell);
      near = -1;
    },
    { passive: true },
  );
  header.addEventListener('focusin', () => header.classList.remove('is-hidden'));

  // The hero pulls up under the demo bar and header; it needs their combined height.
  const setChrome = () => {
    const hgt = Math.round(demo.offsetHeight + header.offsetHeight);
    document.documentElement.style.setProperty('--chrome-h', `${hgt}px`);
  };
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(setChrome);
    ro.observe(demo);
    ro.observe(header);
  }
  window.addEventListener('resize', setChrome);

  function renderAll() {
    renderDemo();
    renderHeader();
    renderFooter();
    renderPlinths();
    measureRules();
    setChrome();
  }

  return {
    renderAll,
    renderFooter,
    updatePill,
    markCurrent,
    closeSheet,
    updateSurfaces: () => requestAnimationFrame(updateSurfaces),
  };
}
