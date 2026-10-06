// @ts-check
/* =====================================================================
   JASNO · 02 RENTGEN · main.js
   The lens: CSS custom properties drive mask-image on the skeleton layer,
   updated in requestAnimationFrame with a lerp. Everything else is built
   from data so the page stays light and deterministic in capture mode.
   ===================================================================== */
(() => {
  'use strict';

  /** @type {any} */
  const W = window;
  const doc = document.documentElement;
  const params = new URLSearchParams(location.search);
  const CAPTURE = W.__CAPTURE__ === true || params.has('capture');
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STATIC = CAPTURE || REDUCED;
  const gsap = W.gsap;
  const ST = W.ScrollTrigger;
  const SplitText = W.SplitText;
  const HAS_GSAP = !!gsap;
  if (CAPTURE) doc.classList.add('is-capture');
  if (REDUCED) doc.classList.add('is-reduced');
  if (HAS_GSAP) gsap.registerPlugin(...[ST, SplitText, W.ScrambleTextPlugin].filter(Boolean));

  const NS = 'http://www.w3.org/2000/svg';
  const SCRAMBLE = '0123456789ABCDEFGHJKLMNPRSTUVZ#/<>+';

  /* ------------------------------------------------------------------ utils */
  /**
   * @param {Element} parent
   * @param {string} tag
   * @param {Record<string, string | number>} [attrs]
   * @returns {SVGElement}
   */
  function el(parent, tag, attrs = {}) {
    const node = /** @type {SVGElement} */ (document.createElementNS(NS, tag));
    for (const k in attrs) node.setAttribute(k, String(attrs[k]));
    parent.appendChild(node);
    return node;
  }
  /** @param {number} a @param {number} b @param {number} t */
  const mix = (a, b, t) => a + (b - a) * t;
  /** @param {number} v @param {number} lo @param {number} hi */
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  /** @param {number} e0 @param {number} e1 @param {number} x */
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  /** @param {number} t */
  const easeInOut = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  /** @param {number} n */
  const fmtInt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  /** @param {number} seed */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /** @param {string} s */
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  /** @param {[number, number][]} pts */
  const poly = (pts) => 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
  /** @param {number} r @param {number} deg  clockwise from 12 o'clock */
  const polar = (r, deg) => { const a = (deg * Math.PI) / 180; return [r * Math.sin(a), -r * Math.cos(a)]; };

  /* ================================================================= DATA */
  const COMPANIES = [
    { n: 'Kovač Gradnje d.o.o.', p: 'Maribor', s: 'gradbeništvo', i: 34, c: 'E', pd: '18,6 %', lim: '0 € · samo predplačilo', ids: '6123456000 12345678 SI12345678' },
    { n: 'Hribar Les d.o.o.', p: 'Škofja Loka', s: 'lesna industrija', i: 87, c: 'A', pd: '0,4 %', lim: '120.000 € · 60 dni', ids: '5874123000 87654321 SI87654321' },
    { n: 'Pekarna Zrno d.o.o.', p: 'Kranj', s: 'živilska industrija', i: 79, c: 'B', pd: '0,6 %', lim: '30.000 € · 45 dni', ids: '' },
    { n: 'Zupan Transport d.o.o.', p: 'Koper', s: 'logistika', i: 71, c: 'B', pd: '0,9 %', lim: '45.000 € · 45 dni', ids: '' },
    { n: 'Avtoservis Horvat s.p.', p: 'Murska Sobota', s: 'avtoservis', i: 63, c: 'C', pd: '1,6 %', lim: '8.000 € · 30 dni', ids: '' },
    { n: 'Novak Elektro d.o.o.', p: 'Celje', s: 'elektroinštalacije', i: 58, c: 'C', pd: '2,1 %', lim: '18.000 € · 30 dni', ids: '' },
    { n: 'Strojna Krajnc d.o.o.', p: 'Velenje', s: 'strojegradnja', i: 46, c: 'D', pd: '5,8 %', lim: '6.000 € · 15 dni', ids: '' },
    { n: 'Tiskarna Vidmar d.o.o.', p: 'Nova Gorica', s: 'tiskarstvo', i: 41, c: 'D', pd: '7,4 %', lim: '3.000 € · 15 dni', ids: '' },
  ];
  /** @type {Record<string, string>} */
  const CLASS_NAME = { A: 'odlično', B: 'dobro', C: 'zmerno', D: 'povišano', E: 'visoko tveganje' };
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec'];
  /** month label for index 0..23 starting nov 2024 @param {number} i */
  const monthLabel = (i) => { const m = (10 + i) % 12; const y = 24 + Math.floor((10 + i) / 12); return MONTHS[m] + ' ' + y; };

  /* ======================================================= LENIS + TRIGGERS */
  /** @type {any} */
  let lenis = null;
  if (!STATIC && W.Lenis && HAS_GSAP) {
    lenis = new W.Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 1 });
    if (ST) lenis.on('scroll', ST.update);
    gsap.ticker.add((/** @type {number} */ time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  /** smooth anchor navigation that also moves focus */
  document.addEventListener('click', (e) => {
    const a = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('a[href^="#"]'));
    if (!a) return;
    const id = a.getAttribute('href') || '';
    if (id.length < 2) return;
    const target = document.getElementById(id.slice(1));
    if (!target) return;
    e.preventDefault();
    closeMenu();
    if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.4 });
    else target.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
    history.replaceState(null, '', id);
    const focusable = target.matches('main, section') ? target : target;
    if (!focusable.hasAttribute('tabindex')) focusable.setAttribute('tabindex', '-1');
    setTimeout(() => /** @type {HTMLElement} */ (focusable).focus({ preventScroll: true }), lenis ? 900 : 0);
  });

  /* ================================================================ HEADER */
  const hdr = /** @type {HTMLElement} */ (document.querySelector('.hdr'));
  const menuBtn = /** @type {HTMLButtonElement} */ (document.querySelector('.menu-btn'));
  const menu = /** @type {HTMLElement} */ (document.getElementById('meni'));
  function closeMenu() {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    /** @type {HTMLElement} */ (menuBtn.querySelector('.menu-btn__txt')).textContent = 'Meni';
    if (lenis) lenis.start();
    document.body.style.overflow = '';
  }
  if (menuBtn && menu) {
    menuBtn.addEventListener('click', () => {
      const open = menu.hidden;
      if (!open) { closeMenu(); menuBtn.focus(); return; }
      menu.hidden = false;
      menuBtn.setAttribute('aria-expanded', 'true');
      /** @type {HTMLElement} */ (menuBtn.querySelector('.menu-btn__txt')).textContent = 'Zaprite';
      if (lenis) lenis.stop();
      document.body.style.overflow = 'hidden';
      const first = /** @type {HTMLElement | null} */ (menu.querySelector('a'));
      if (first) first.focus();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { closeMenu(); menuBtn.focus(); } });
    menu.addEventListener('click', (e) => { if (/** @type {HTMLElement} */ (e.target).closest('a')) closeMenu(); });
  }

  /** cream sections under the header switch the CTA pill style */
  const creamZones = new Set();
  let heroXray = false;
  function updateHeaderTheme() {
    let cream = false;
    creamZones.forEach((z) => { if (z === 'hero' ? !heroXray : true) cream = true; });
    hdr.classList.toggle('is-film', !cream);
  }
  if ('IntersectionObserver' in W) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const key = /** @type {HTMLElement} */ (en.target).classList.contains('hero') ? 'hero' : 'final';
        if (en.isIntersecting) creamZones.add(key); else creamZones.delete(key);
      }
      updateHeaderTheme();
    }, { rootMargin: '0px 0px -94% 0px' });
    document.querySelectorAll('.hero, .final').forEach((n) => io.observe(n));
  }
  let lastY = -1;
  function onScrollHeader() {
    const y = W.scrollY || 0;
    if (y === lastY) return;
    lastY = y;
    hdr.classList.toggle('is-condensed', y > 40);
  }
  W.addEventListener('scroll', onScrollHeader, { passive: true });
  onScrollHeader();

  /* ========================================================= HERO · LENS */
  const hero = /** @type {HTMLElement} */ (document.querySelector('.hero'));
  const skel = /** @type {HTMLElement} */ (hero.querySelector('[data-skeleton]'));
  const lens = /** @type {HTMLElement} */ (hero.querySelector('[data-lens]'));
  const lensSvg = /** @type {SVGSVGElement} */ (hero.querySelector('[data-lens-svg]'));
  const band = /** @type {HTMLElement} */ (hero.querySelector('[data-scanband]'));
  const grip = /** @type {HTMLElement} */ (hero.querySelector('[data-grip]'));
  const toggle = /** @type {HTMLButtonElement} */ (hero.querySelector('[data-xtoggle]'));
  const truths = /** @type {HTMLElement[]} */ ([...hero.querySelectorAll('.rows--skeleton .tm')]);
  const skelRows = /** @type {HTMLElement[]} */ ([...hero.querySelectorAll('.rows--skeleton .row')]);
  const facadeRows = /** @type {HTMLElement[]} */ ([...hero.querySelectorAll('.rows--facade .row')]);
  const colEls = /** @type {HTMLElement[]} */ ([...hero.querySelectorAll('.xr__cols i')]);
  const R0 = 200; // radius the chrome SVG is drawn at

  /** build lens chrome: bone edge, rim, 120 rotating ticks, crosshair, reticle, red arc */
  (function buildLens() {
    lensSvg.setAttribute('viewBox', '-270 -270 540 540');
    el(lensSvg, 'circle', { class: 'edge-glow', r: 197 });
    el(lensSvg, 'circle', { class: 'rim', r: 207 });
    const ticks = el(lensSvg, 'g', { class: 'ticks' });
    for (let i = 0; i < 120; i++) {
      const long = i % 10 === 0;
      const [x1, y1] = polar(210, i * 3);
      const [x2, y2] = polar(long ? 227 : 217, i * 3);
      el(ticks, 'line', { x1: x1.toFixed(2), y1: y1.toFixed(2), x2: x2.toFixed(2), y2: y2.toFixed(2), class: long ? 't t--l' : 't' });
    }
    el(lensSvg, 'path', { class: 'cross', d: 'M-199 0H-13M13 0H199M0 -199V-13M0 13V199' });
    el(lensSvg, 'path', { class: 'ret', d: 'M0 -200V-178M0 200V178M-200 0H-178M200 0H178' });
    el(lensSvg, 'circle', { class: 'pip', r: 4.5 });
    el(lensSvg, 'circle', { class: 'edge', r: 200 });
    const [ax1, ay1] = polar(214, 104);
    const [ax2, ay2] = polar(214, 150);
    const arc = el(lensSvg, 'path', { class: 'arc', d: `M${ax1.toFixed(2)} ${ay1.toFixed(2)} A214 214 0 0 1 ${ax2.toFixed(2)} ${ay2.toFixed(2)}` });
    const len = (214 * Math.PI * 46) / 180;
    arc.style.strokeDasharray = String(len);
    arc.style.setProperty('--al', String(len));
  })();

  /** lens state */
  const S = {
    x: 0, y: 0, tx: 0, ty: 0,
    base: 180, bump: 0, full: 0, scroll: 0, intro: STATIC ? 1 : 0,
    by: 0, bh: 140, follow: false, finding: -1,
  };
  /** @type {{ w: number, h: number, stageTop: number, hairline: number, bandH: number, rest: {x: number, y: number}, keyR: number, rects: {l: number, t: number, r: number, b: number}[], rows: number[] }} */
  const G = { w: 0, h: 0, stageTop: 0, hairline: 0, bandH: 202, rest: { x: 0, y: 0 }, keyR: 190, rects: [], rows: [], tagW: 260 };
  const lensTag = /** @type {HTMLElement} */ (lens.querySelector('.lens__tag'));
  let tagShift = 0;
  let MODE = 'lens';
  const scrambled = new Set();

  function decideMode() {
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    MODE = fine && W.innerWidth >= 768 ? 'lens' : 'band';
    hero.classList.toggle('is-band', MODE === 'band');
  }

  /** desktop: place each readout from the facade word boxes (label under word one, truth under the lie word) */
  function layoutSkeleton() {
    const desktop = W.innerWidth > 900;
    skelRows.forEach((row, i) => {
      const tl = /** @type {HTMLElement} */ (row.querySelector('.tl'));
      const tm = /** @type {HTMLElement} */ (row.querySelector('.tm'));
      const ta = /** @type {HTMLElement} */ (row.querySelector('.ta'));
      const lead = /** @type {HTMLElement} */ (row.querySelector('.lead'));
      for (const n of [tl, tm, ta, lead]) { n.style.left = ''; n.style.right = ''; n.style.width = ''; }
      if (!desktop) return;
      const fr = facadeRows[i];
      const rr = row.getBoundingClientRect();
      const a = /** @type {HTMLElement} */ (fr.querySelector('.claim__a')).getBoundingClientRect();
      const b = /** @type {HTMLElement} */ (fr.querySelector('.claim__b')).getBoundingClientRect();
      const tlL = a.left - rr.left;
      tl.style.left = tlL.toFixed(1) + 'px';
      const tlR = tlL + tl.offsetWidth;
      const tmW = tm.offsetWidth;
      let tmL = (b.left + b.right) / 2 - rr.left - tmW / 2;
      tmL = Math.max(tmL, tlR + 64);
      tm.style.left = tmL.toFixed(1) + 'px';
      const tmR = tmL + tmW;
      const col = colEls[clamp(Number(ta.dataset.col || 10), 1, 12) - 1];
      let taL = col.getBoundingClientRect().left - rr.left + Number(ta.dataset.nudge || 0);
      taL = Math.max(taL, tmR + 64);
      taL = Math.min(taL, rr.width - ta.offsetWidth);
      ta.style.left = taL.toFixed(1) + 'px';
      ta.style.right = 'auto';
      lead.style.left = (tmR + 18).toFixed(1) + 'px';
      lead.style.width = Math.max(0, taL - tmR - 36).toFixed(1) + 'px';
    });
  }

  /** hand-drawn ellipse around the measured ink box of each circled value (≈14 px padding, overshoot) */
  const measureCtx = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'));
  function fitRings() {
    document.querySelectorAll('.mk--circle').forEach((mkNode, k) => {
      const mk = /** @type {HTMLElement} */ (mkNode);
      const sx = /** @type {HTMLElement} */ (mk.querySelector('.sx') || mk);
      const ring = /** @type {SVGSVGElement | null} */ (mk.querySelector('.mk__ring'));
      if (!ring) return;
      const path = /** @type {SVGPathElement} */ (ring.querySelector('path') || el(ring, 'path'));
      const cs = getComputedStyle(sx);
      const fs = parseFloat(cs.fontSize);
      measureCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
      let text = '';
      sx.childNodes.forEach((n) => { if (n.nodeType === 3) text += n.textContent; });
      if (!text) text = sx.textContent || '';
      if (cs.textTransform === 'uppercase') text = text.toUpperCase();
      const m = measureCtx.measureText(text);
      const range = document.createRange();
      const tn = [...sx.childNodes].find((n) => n.nodeType === 3 && (n.textContent || '').trim());
      range.selectNodeContents(tn || sx);
      const rb = range.getBoundingClientRect();
      const mr = mk.getBoundingClientRect();
      if (!rb.width || !mr.width) return;
      const ls = parseFloat(cs.letterSpacing) || 0;
      const base = rb.top - mr.top + (m.fontBoundingBoxAscent || fs * 0.9);
      const inkT = base - m.actualBoundingBoxAscent;
      const inkB = base + Math.max(m.actualBoundingBoxDescent, 0);
      const inkL = rb.left - mr.left;
      const inkR = rb.right - mr.left - ls;
      const padX = mk.classList.contains('mk--lg') ? 16 : 14, padY = 11;
      const cx = (inkL + inkR) / 2, cy = (inkT + inkB) / 2;
      const rx = (inkR - inkL) / 2 + padX, ry = (inkB - inkT) / 2 + padY;
      const R = rng(31 + k * 7);
      const t0 = Math.PI * (0.92 + R() * 0.08);
      const span = Math.PI * 2 + 0.62;
      const tilt = -0.035;
      /** @type {[number, number][]} */ const pts = [];
      for (let i = 0; i <= 72; i++) {
        const u = i / 72, t = t0 + span * u;
        const wob = 1 + 0.035 * Math.sin(t * 2 + 0.7) + 0.05 * u;
        const ex = Math.cos(t) * rx * wob, ey = Math.sin(t) * ry * (wob + 0.03 * Math.cos(t * 3));
        pts.push([cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), cy + ex * Math.sin(tilt) + ey * Math.cos(tilt)]);
      }
      ring.style.width = Math.ceil(mr.width) + 'px';
      ring.style.height = Math.ceil(mr.height) + 'px';
      ring.setAttribute('viewBox', `0 0 ${Math.ceil(mr.width)} ${Math.ceil(mr.height)}`);
      path.setAttribute('d', poly(pts));
    });
  }

  function measure() {
    const hr = hero.getBoundingClientRect();
    const cs = getComputedStyle(hero);
    G.bandH = parseFloat(cs.getPropertyValue('--band-h')) || 202;
    const hh = /** @type {HTMLElement} */ (hero.querySelector('.rows--facade')).getBoundingClientRect().top - hr.top;
    G.w = hr.width; G.h = hr.height;
    G.stageTop = Math.max(60, hh - 30);
    G.hairline = G.h - G.bandH;
    G.rects = truths.map((t) => {
      const r = t.getBoundingClientRect();
      const n = /** @type {HTMLElement} */ (t.querySelector('.truth__n')).getBoundingClientRect();
      const l = Math.min(r.left, n.left) - hr.left, tt = Math.min(r.top, n.top) - hr.top;
      const rr = Math.max(r.right, n.right) - hr.left, b = Math.max(r.bottom, n.bottom) - hr.top;
      return { l, t: tt, r: rr, b };
    });
    G.rows = facadeRows.map((row) => { const r = row.getBoundingClientRect(); return (r.top + r.bottom) / 2 - hr.top; });
    G.tagW = lensTag ? lensTag.offsetWidth : 260;
    // rest: centred on the key finding's two text lines (row 4, under "pravočasno")
    const key = truths[3];
    const main = /** @type {HTMLElement} */ (key.querySelector('.truth__main')).getBoundingClientRect();
    const kr = key.getBoundingClientRect();
    const kn = /** @type {HTMLElement} */ (key.querySelector('.truth__n')).getBoundingClientRect();
    const kl = Math.min(kr.left, kn.left);
    G.rest = { x: (kl + kr.right) / 2 - hr.left, y: (main.top + main.bottom) / 2 - hr.top };
    const lr = parseFloat(cs.getPropertyValue('--lr')) || 190;
    S.base = clamp(G.w * 0.125, 118, lr - 10);
    G.keyR = Math.min(lr, Math.max(S.base + 10, G.hairline - 8 - G.rest.y));
    if (!S.follow) { S.x = S.tx = G.rest.x; S.y = S.ty = G.rest.y; }
    const rowH = facadeRows[0] ? facadeRows[0].getBoundingClientRect().height : 120;
    if (MODE === 'band') {
      S.bh = Math.round(Math.max(rowH * 1.16, 120));
      if (STATIC || !bandTimeline) S.by = G.rows[3];
    }
  }

  /** index of the finding under (x, y), or -1 @param {number} x @param {number} y */
  function findingAt(x, y) {
    for (let i = 0; i < G.rects.length; i++) {
      const r = G.rects[i];
      if (x > r.l - 28 && x < r.r + 28 && y > r.t - 28 && y < r.b + 28) return i;
    }
    return -1;
  }

  /** circle-rect intersection @param {number} cx @param {number} cy @param {number} rad @param {{l:number,t:number,r:number,b:number}} r */
  function circleHits(cx, cy, rad, r) {
    const nx = clamp(cx, r.l, r.r), ny = clamp(cy, r.t, r.b);
    return (cx - nx) ** 2 + (cy - ny) ** 2 < rad * rad;
  }

  /** scramble the truth lines once, the first time the lens reveals them @param {number} i */
  function scrambleTruth(i) {
    if (STATIC || scrambled.has(i) || !HAS_GSAP || !W.ScrambleTextPlugin) return;
    scrambled.add(i);
    truths[i].querySelectorAll('.sx').forEach((node, k) => {
      const text = node.textContent || '';
      gsap.to(node, { duration: 0.22 + k * 0.05, scrambleText: { text, chars: SCRAMBLE, speed: 1.6, revealDelay: 0.05 }, ease: 'none' });
    });
  }

  let lastWrite = '';
  /** paint one frame of lens state */
  function render() {
    const eFull = easeInOut(S.full), eScroll = easeInOut(S.scroll);
    const e = Math.max(eFull, eScroll);
    const clipb = G.bandH * (1 - smooth(0.04, 0.42, S.scroll));
    if (MODE === 'lens') {
      const r0 = (S.base + S.bump) * mix(0.6, 1, S.intro);
      const far = Math.hypot(Math.max(S.x, G.w - S.x), Math.max(S.y, G.h - S.y)) + 40;
      const r = mix(r0, far, e);
      const key = `${S.x.toFixed(1)}|${S.y.toFixed(1)}|${r.toFixed(1)}|${S.intro.toFixed(3)}|${clipb.toFixed(1)}`;
      if (key === lastWrite) return;
      lastWrite = key;
      skel.style.setProperty('--x', S.x.toFixed(1) + 'px');
      skel.style.setProperty('--y', S.y.toFixed(1) + 'px');
      skel.style.setProperty('--r', (S.intro <= 0.001 ? 0 : r).toFixed(1) + 'px');
      hero.style.setProperty('--clipb', clipb.toFixed(1) + 'px');
      lens.style.transform = `translate3d(${S.x.toFixed(1)}px, ${S.y.toFixed(1)}px, 0)`;
      lens.style.setProperty('--r', r.toFixed(1) + 'px');
      lensSvg.style.transform = `scale(${(r / R0).toFixed(4)})`;
      lens.style.opacity = String((1 - smooth(0, 0.22, e)) * S.intro);
      const over = Math.max(0, S.x + r * 0.62 + 26 + G.tagW - (G.w - 16));
      if (Math.abs(over - tagShift) > 0.5) {
        tagShift = over;
        lens.style.setProperty('--tagdx', (-over).toFixed(1) + 'px');
        lens.classList.toggle('tag-clamped', over > 2);
      }
      if (e > 0.02) G.rects.forEach((rc, i) => { if (circleHits(S.x, S.y, r, rc)) ping(i); });
    } else {
      const bh = mix(S.bh, G.h * 2.4, e);
      const key = `b${S.by.toFixed(1)}|${bh.toFixed(1)}|${clipb.toFixed(1)}`;
      if (key === lastWrite) return;
      lastWrite = key;
      for (const n of [skel, band, grip]) {
        n.style.setProperty('--by', S.by.toFixed(1) + 'px');
        n.style.setProperty('--bh', bh.toFixed(1) + 'px');
      }
      hero.style.setProperty('--clipb', clipb.toFixed(1) + 'px');
      if (e > 0.02) G.rects.forEach((rc, i) => { if (rc.t < S.by + bh / 2 && rc.b > S.by - bh / 2) ping(i); });
    }
    const xray = e > 0.55;
    if (xray !== heroXray) { heroXray = xray; hero.classList.toggle('is-xray', xray); updateHeaderTheme(); }
    hero.classList.toggle('is-xband', eScroll > 0.5);
  }

  const pinged = new Set();
  /** red marker pulse when the expanding lens reaches a finding @param {number} i */
  function ping(i) {
    if (STATIC || pinged.has(i) || !HAS_GSAP) return;
    pinged.add(i);
    const marks = truths[i].querySelectorAll('.mk__ring, .truth__n');
    gsap.fromTo(marks, { scale: 0.4, opacity: 0, transformOrigin: '50% 50%' }, { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(3)' });
    scrambleTruth(i);
  }

  /** set the finding-hover state @param {number} f */
  function setFinding(f) {
    if (f === S.finding) return;
    S.finding = f;
    lens.classList.toggle('is-on', f >= 0);
    const target = f < 0 ? 0 : f === 3 ? G.keyR - S.base : 10;
    if (HAS_GSAP && !STATIC) gsap.to(S, { bump: target, duration: 0.35, ease: 'power2.out', overwrite: 'auto', onUpdate: schedule });
    else S.bump = target;
    if (f >= 0) scrambleTruth(f);
  }

  /* ---- rAF loop (only while the hero is on screen and the tab is shown) */
  let raf = 0, last = 0, heroLimit = Infinity;
  /** the hero is on screen until the page scrolls past its (pin-spaced) bottom */
  function measureHeroLimit() {
    const box = hero.parentElement && hero.parentElement.classList.contains('pin-spacer') ? hero.parentElement : hero;
    heroLimit = box.getBoundingClientRect().bottom + (W.scrollY || 0);
  }
  /** @param {number} t */
  function frame(t) {
    raf = 0;
    const dt = last ? Math.min(64, t - last) / 16.667 : 1;
    last = t;
    let moving = false;
    if (MODE === 'lens') {
      const k = 1 - Math.pow(1 - 0.14, dt);
      const frozen = S.scroll > 0.002 || S.full > 0.002;
      if (!frozen) {
        S.x += (S.tx - S.x) * k; S.y += (S.ty - S.y) * k;
        moving = Math.abs(S.tx - S.x) > 0.15 || Math.abs(S.ty - S.y) > 0.15;
      }
      setFinding(findingAt(S.x, S.y));
      const rr = S.base + S.bump;
      if (S.intro > 0.9) G.rects.forEach((rc, i) => { if (circleHits(S.x, S.y, rr * 0.82, rc)) scrambleTruth(i); });
    }
    render();
    if (moving) schedule();
  }
  function schedule() {
    if (STATIC || raf || document.hidden || (W.scrollY || 0) > heroLimit) return;
    raf = requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = 0; schedule(); } });
  W.addEventListener('scroll', () => { if ((W.scrollY || 0) <= heroLimit) schedule(); }, { passive: true });

  /* ---- pointer (desktop lens) */
  hero.addEventListener('pointermove', (e) => {
    if (MODE !== 'lens' || REDUCED || e.pointerType === 'touch') return;
    const hr = hero.getBoundingClientRect();
    const x = e.clientX - hr.left, y = e.clientY - hr.top;
    const inStage = y > G.stageTop - 20 && y < G.hairline;
    if (inStage) {
      S.follow = true;
      S.tx = clamp(x, 24, G.w - 24);
      S.ty = clamp(y, G.stageTop + 40, G.hairline - 36);
      lens.classList.add('is-quiet');
    } else { S.follow = false; S.tx = G.rest.x; S.ty = G.rest.y; }
    schedule();
  });
  hero.addEventListener('pointerleave', () => { S.follow = false; S.tx = G.rest.x; S.ty = G.rest.y; schedule(); });

  /* ---- toggle: the whole brochure becomes the radiograph (band stays) */
  /** @param {boolean} on */
  function setFull(on) {
    toggle.classList.toggle('is-on', on);
    /** @type {HTMLElement} */ (toggle.querySelector('.xtoggle__txt')).textContent = on ? 'Pokažite fasado' : 'Pokažite skelet';
    if (on) lens.classList.add('is-quiet');
    if (HAS_GSAP && !REDUCED) gsap.to(S, { full: on ? 1 : 0, duration: 1.15, ease: 'power3.inOut', onUpdate: schedule, overwrite: 'auto' });
    else { S.full = on ? 1 : 0; lastWrite = ''; render(); }
    if (on) G.rects.forEach((_, i) => scrambleTruth(i));
    schedule();
  }
  toggle.addEventListener('click', () => setFull(!toggle.classList.contains('is-on')));

  /* ---- touch scan band: auto-sweep + drag + tap */
  /** @type {any} */
  let bandTimeline = null;
  let bandResume = 0;
  function startSweep() {
    if (STATIC || !HAS_GSAP || MODE !== 'band') return;
    if (bandTimeline) bandTimeline.kill();
    const order = [3, 2, 1, 0, 1, 2];
    const tl = gsap.timeline({ repeat: -1, onUpdate: schedule });
    let start = order.indexOf(nearestRow(S.by));
    if (start < 0) start = 0;
    for (let k = 1; k <= order.length; k++) {
      const row = order[(start + k) % order.length];
      tl.to(S, { by: () => G.rows[row], duration: 1.5, ease: 'power2.inOut' }, '+=1.7');
    }
    bandTimeline = tl;
  }
  /** @param {number} y */
  function nearestRow(y) {
    let best = 0, d = Infinity;
    G.rows.forEach((ry, i) => { const dd = Math.abs(ry - y); if (dd < d) { d = dd; best = i; } });
    return best;
  }
  /** @param {number} y */
  function bandTo(y) {
    if (bandTimeline) { bandTimeline.kill(); bandTimeline = null; }
    clearTimeout(bandResume);
    const lo = G.stageTop + 20, hi = G.hairline - S.bh / 2;
    if (HAS_GSAP && !REDUCED) gsap.to(S, { by: clamp(y, lo, hi), duration: 0.6, ease: 'power3.out', onUpdate: schedule, overwrite: 'auto' });
    else { S.by = clamp(y, lo, hi); render(); }
    bandResume = W.setTimeout(startSweep, 5200);
  }
  if (grip) {
    let dragging = false;
    grip.addEventListener('pointerdown', (e) => {
      if (MODE !== 'band') return;
      dragging = true; grip.setPointerCapture(e.pointerId);
      if (bandTimeline) { bandTimeline.kill(); bandTimeline = null; }
      clearTimeout(bandResume);
      if (HAS_GSAP) gsap.killTweensOf(S, 'by');
    });
    grip.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const hr = hero.getBoundingClientRect();
      S.by = clamp(e.clientY - hr.top + S.bh / 2, G.stageTop + 20, G.hairline - S.bh / 2);
      schedule();
    });
    const end = () => { if (!dragging) return; dragging = false; bandResume = W.setTimeout(startSweep, 5200); };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }
  hero.addEventListener('click', (e) => {
    if (MODE !== 'band') return;
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest('a, button, input, form, [data-grip]')) return;
    const hr = hero.getBoundingClientRect();
    const y = e.clientY - hr.top;
    if (y < G.stageTop || y > G.hairline) return;
    bandTo(G.rows[nearestRow(y)]);
  });

  /* ---- scroll: the lens swallows the page */
  function setupHeroScroll() {
    if (STATIC || !HAS_GSAP || !ST) return;
    if (MODE === 'lens') {
      gsap.timeline({
        scrollTrigger: { trigger: hero, start: 'top top', end: '+=85%', pin: true, scrub: 0.6, anticipatePin: 1, onUpdate: schedule, invalidateOnRefresh: true },
      }).to(S, { scroll: 1, ease: 'none', onUpdate: schedule });
    } else {
      gsap.timeline({
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom 35%', scrub: 0.5, onUpdate: schedule },
      }).to(S, { scroll: 1, ease: 'none', onUpdate: schedule });
    }
  }

  /* ---- intro */
  function heroIntro() {
    if (STATIC || !HAS_GSAP) { S.intro = 1; return; }
    const claims = hero.querySelectorAll('.rows--facade .claim__a, .rows--facade .claim__l2');
    facadeRows.forEach((r) => { r.style.clipPath = 'inset(-40% -6% -26% -6%)'; });
    const tl = gsap.timeline({ delay: 0.15, onComplete: () => facadeRows.forEach((r) => { r.style.clipPath = ''; }) });
    tl.from(claims, { yPercent: 135, duration: 1.05, ease: 'expo.out', stagger: 0.07 }, 0)
      .from('.brochure > *', { opacity: 0, y: 8, duration: 0.7, ease: 'power2.out', stagger: 0.05 }, 0.25)
      .from('.hero__t1, .hero__t2', { yPercent: 60, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.09, clearProps: 'transform,opacity,translate' }, 0.4)
      .from('.hero__sub, .hero__act', { y: 16, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, clearProps: 'transform,opacity,translate' }, 0.6)
      .to(S, { intro: 1, duration: 0.95, ease: 'expo.out', onUpdate: schedule }, 1.0)
      .from('.hdr__in > *', { opacity: 0, duration: 0.8, stagger: 0.06 }, 0.2);
    if (W.ScrambleTextPlugin) {
      hero.querySelectorAll('.dicom > span').forEach((sp, i) => {
        if (sp.children.length) return; // keep inline markup (e.g. the mobile-hidden prefix) intact
        const text = sp.textContent || '';
        tl.from(sp, { duration: 0.6, scrambleText: { text: '', chars: SCRAMBLE, speed: 0.9 } }, 0.5 + i * 0.06);
        tl.set(sp, { textContent: text }, '>');
      });
    }
    if (MODE === 'band') tl.call(startSweep, [], 2.2);
  }

  /* ============================================================ CHARTS */
  let PL = 50, PR = 586, VW = 600;
  const PT = 16, PB = 188;
  /** @param {number} i */
  const xi = (i) => PL + (i * (PR - PL)) / 23;

  /** @param {SVGElement} g @param {number[]} labelsAt */
  function monthAxis(g, labelsAt) {
    if (VW < 440) labelsAt = [0, 12, 23];
    el(g, 'line', { class: 'ch-axis', x1: PL, y1: PB + 10, x2: PR, y2: PB + 10 });
    for (let i = 0; i < 24; i++) el(g, 'line', { class: 'ch-axis', x1: xi(i), y1: PB + 10, x2: xi(i), y2: PB + (i % 6 === 0 || i === 23 ? 17 : 13) });
    labelsAt.forEach((i) => {
      const t = el(g, 'text', { class: 'ch-txt', x: xi(i), y: PB + 32, 'text-anchor': i === 0 ? 'start' : i === 23 ? 'end' : 'middle' });
      t.textContent = monthLabel(i).toUpperCase();
    });
  }

  /**
   * a chain of luminous bones with joints at data points; broken at `frac`
   * @param {SVGElement} g @param {[number, number][]} pts @param {number} frac segment index that breaks (between frac and frac+1)
   */
  function bone(g, pts, frac) {
    const a = pts[frac], b = pts[frac + 1];
    const m1 = [mix(a[0], b[0], 0.38), mix(a[1], b[1], 0.38)];
    const m2 = [mix(a[0], b[0], 0.62), mix(a[1], b[1], 0.62) + 3];
    /** @type {[number, number][]} */ const A = [...pts.slice(0, frac + 1), /** @type {[number, number]} */ (m1)];
    /** @type {[number, number][]} */ const B = [/** @type {[number, number]} */ (m2), ...pts.slice(frac + 1)];
    const grp = el(g, 'g', { class: 'b' });
    const sp = (PR - PL) / 23;
    const jr = clamp(sp * 0.23, 3, 5.4), wall = clamp(sp * 0.32, 4.6, 7.5);
    for (const seg of [A, B]) {
      const d = poly(seg);
      el(grp, 'path', { class: 'b-glow', d, 'stroke-width': (wall * 2.1).toFixed(1) });
      el(grp, 'path', { class: 'b-wall', d, 'data-draw': '', style: `stroke-width:${wall.toFixed(1)}` });
      el(grp, 'path', { class: 'b-core', d, 'data-draw': '', style: `stroke-width:${(wall * 0.37).toFixed(1)}` });
    }
    // jagged fracture edges
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    /** @param {number[]} c @param {number} dir */
    const crack = (c, dir) => {
      const pts2 = [-6, -2.5, 0, 2.5, 6].map((s, k) => [c[0] + nx * s + Math.cos(ang) * dir * (k % 2 ? 2.4 : -1), c[1] + ny * s + Math.sin(ang) * dir * (k % 2 ? 2.4 : -1)]);
      el(grp, 'path', { class: 'b-crack', d: 'M' + pts2.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') });
    };
    crack(m1, 1); crack(m2, -1);
    pts.forEach((p) => {
      el(grp, 'circle', { class: 'b-joint', cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: jr.toFixed(1), 'data-joint': '' });
      el(grp, 'circle', { class: 'b-hole', cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: (jr * 0.4).toFixed(1) });
    });
    return { m: [(m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2] };
  }

  /** hand-drawn red ellipse @param {SVGElement} g @param {number} cx @param {number} cy @param {number} rx @param {number} ry */
  function redRing(g, cx, cy, rx, ry) {
    const d = `M${cx - rx * 0.9} ${cy + ry * 0.2} C ${cx - rx * 1.02} ${cy - ry * 0.9}, ${cx + rx * 0.2} ${cy - ry * 1.12}, ${cx + rx * 0.72} ${cy - ry * 0.86} C ${cx + rx * 1.12} ${cy - ry * 0.55}, ${cx + rx * 1.06} ${cy + ry * 0.62}, ${cx + rx * 0.4} ${cy + ry * 0.98} C ${cx - rx * 0.3} ${cy + ry * 1.22}, ${cx - rx * 1.08} ${cy + ry * 0.66}, ${cx - rx * 0.86} ${cy - ry * 0.32} C ${cx - rx * 0.72} ${cy - ry * 0.7}, ${cx - rx * 0.4} ${cy - ry * 0.9}, ${cx - rx * 0.12} ${cy - ry * 0.98}`;
    return el(g, 'path', { class: 'm-ring', d, 'data-mark': '' });
  }

  /** vertical caliper with label @param {SVGElement} g @param {number} x @param {number} y1 @param {number} y2 @param {string} label @param {'r' | 'l'} side */
  function vCaliper(g, x, y1, y2, label, side) {
    const c = el(g, 'g', { 'data-mark': '' });
    el(c, 'path', { class: 'm-line', d: `M${x} ${y1}V${y2}M${x - 5} ${y1}H${x + 5}M${x - 5} ${y2}H${x + 5}` });
    const t = el(c, 'text', { class: 'ch-txt ch-txt--r', x: side === 'r' ? x + 10 : x - 10, y: (y1 + y2) / 2 + 4, 'text-anchor': side === 'r' ? 'start' : 'end' });
    t.textContent = label;
    return c;
  }

  const CHARTS = {
    /** @param {SVGSVGElement} s */
    liquidity(s) {
      const vals = [131, 129, 127, 128, 124, 123, 121, 119, 118, 115, 113, 112, 110, 107, 105, 104, 101, 98, 94, 87, 80, 71, 64, 58];
      const y = (/** @type {number} */ v) => PB - ((v - 40) / 100) * (PB - PT);
      const g = el(s, 'g', {});
      [60, 80, 120, 140].forEach((v) => el(g, 'line', { class: 'ch-grid', x1: PL, x2: PR, y1: y(v), y2: y(v) }));
      el(g, 'line', { class: 'ch-ref', x1: PL, x2: PR + 4, y1: y(100), y2: y(100) });
      [[140, '140 %'], [100, '100 %'], [60, '60 %']].forEach(([v, l]) => { const t = el(g, 'text', { class: v === 100 ? 'ch-txt ch-txt--b' : 'ch-txt', x: PL - 10, y: y(/** @type {number} */ (v)) + 3.5, 'text-anchor': 'end' }); t.textContent = String(l); });
      monthAxis(g, [0, 6, 12, 18, 23]);
      /** @type {[number, number][]} */ const pts = vals.map((v, i) => [xi(i), y(v)]);
      const { m } = bone(g, pts, 18);
      redRing(g, m[0], m[1], 22, 17);
      const last = pts[23];
      vCaliper(g, last[0] + 22, y(100), last[1], '58 %', 'r');
      el(g, 'path', { class: 'm-line', d: `M${last[0] + 8} ${last[1]}H${last[0] + 17}`, 'data-mark': '' });
    },
    /** @param {SVGSVGElement} s */
    discipline(s) {
      const vals = [6, 7, 5, 8, 7, 9, 8, 6, 9, 8, 7, 9, 10, 8, 9, 8, 10, 9, 15, 21, 28, 34, 41, 47];
      const y = (/** @type {number} */ v) => PB - (v / 55) * (PB - PT);
      const g = el(s, 'g', {});
      [10, 20, 30, 40, 50].forEach((v) => el(g, 'line', { class: 'ch-grid', x1: PL, x2: PR, y1: y(v), y2: y(v) }));
      [[50, '50 DNI'], [30, '30'], [10, '10']].forEach(([v, l]) => { const t = el(g, 'text', { class: 'ch-txt', x: PL - 10, y: y(/** @type {number} */ (v)) + 3.5, 'text-anchor': 'end' }); t.textContent = String(l); });
      monthAxis(g, [0, 6, 12, 17, 23]);
      el(g, 'line', { class: 'ch-ref', x1: xi(17), x2: xi(23) + 24, y1: y(9), y2: y(9) });
      /** @type {[number, number][]} */ const pts = vals.map((v, i) => [xi(i), y(v)]);
      const { m } = bone(g, pts, 17);
      redRing(g, m[0], m[1], 20, 18);
      vCaliper(g, xi(23) + 24, y(9), y(47), '+38 DNI', 'r');
      const t1 = el(g, 'text', { class: 'ch-txt ch-txt--b', x: xi(17) - 12, y: y(9) + 20, 'text-anchor': 'middle' }); t1.textContent = '9 DNI';
      const t2 = el(g, 'text', { class: 'ch-txt ch-txt--r', x: xi(23) - 14, y: y(47) - 12, 'text-anchor': 'end' }); t2.textContent = '47 DNI';
    },
    /** @param {SVGSVGElement} s */
    leverage(s) {
      const years = ['2021', '2022', '2023', '2024', '2025'];
      const vals = [1.4, 1.9, 2.6, 3.2, 4.1];
      const y = (/** @type {number} */ v) => PB - (v / 4.6) * (PB - PT);
      const g = el(s, 'g', {});
      [1, 2, 3, 4].forEach((v) => el(g, 'line', { class: 'ch-grid', x1: PL, x2: PR, y1: y(v), y2: y(v) }));
      el(g, 'line', { class: 'ch-ref', x1: PL, x2: PR, y1: y(3), y2: y(3) });
      const tr = el(g, 'text', { class: 'ch-txt ch-txt--b', x: PL - 10, y: y(3) + 3.5, 'text-anchor': 'end' }); tr.textContent = '3,0×';
      [[1, '1,0×'], [2, '2,0×'], [4, '4,0×']].forEach(([v, l]) => { const t = el(g, 'text', { class: 'ch-txt', x: PL - 10, y: y(/** @type {number} */ (v)) + 3.5, 'text-anchor': 'end' }); t.textContent = String(l); });
      el(g, 'line', { class: 'ch-axis', x1: PL, y1: PB + 10, x2: PR, y2: PB + 10 });
      const w = clamp((PR - PL) * 0.12, 30, 62), gap = (PR - PL - 40 - w * 5) / 4;
      vals.forEach((v, i) => {
        const x = PL + 20 + i * (w + gap), top = y(v), bot = PB + 2;
        const r = 9, waist = 5;
        const d = `M${x + r} ${top} H${x + w - r} Q${x + w} ${top} ${x + w} ${top + r} Q${x + w - waist} ${(top + bot) / 2} ${x + w} ${bot - r} Q${x + w} ${bot} ${x + w - r} ${bot} H${x + r} Q${x} ${bot} ${x} ${bot - r} Q${x + waist} ${(top + bot) / 2} ${x} ${top + r} Q${x} ${top} ${x + r} ${top} Z`;
        const vg = el(g, 'g', { 'data-vert': '' });
        el(vg, 'path', { class: 'v-body', d });
        el(vg, 'rect', { class: 'v-inner', x: x + 10, y: top + 9, width: w - 20, height: Math.max(4, bot - top - 18), rx: 5 });
        if (i < 4) el(g, 'rect', { class: 'v-disc', x: x + w + gap / 2 - 3, y: bot - 26, width: 6, height: 22, rx: 3 });
        const yl = el(g, 'text', { class: 'ch-txt', x: x + w / 2, y: PB + 30, 'text-anchor': 'middle' }); yl.textContent = years[i];
        const vl = el(g, 'text', { class: i === 4 ? 'ch-txt ch-txt--r' : 'ch-txt ch-txt--b', x: x + w / 2, y: top - (i === 4 ? 24 : 12), 'text-anchor': 'middle' });
        vl.textContent = String(v).replace('.', ',') + '×';
        if (i === 4) {
          el(g, 'path', { class: 'b-crack', d: `M${x + 6} ${top + 34} L${x + 22} ${top + 42} L${x + 30} ${top + 36} L${x + 44} ${top + 47} L${x + w - 6} ${top + 41}` });
          redRing(g, x + w / 2, (top + bot) / 2, w * 0.74, (bot - top) / 2 + 12);
        }
      });
    },
    /** @param {SVGSVGElement} s */
    legal(s) {
      const g = el(s, 'g', {});
      monthAxis(g, [0, 6, 12, 18, 23]);
      const cw = (PR - PL) / 24, top = 92, h = 58;
      for (let i = 0; i < 24; i++) {
        const cls = i === 23 ? 'ev-cell ev-cell--red' : i === 22 ? 'ev-cell ev-cell--on' : 'ev-cell';
        el(g, 'rect', { class: cls, x: (PL + i * cw + 1.5).toFixed(1), y: top, width: (cw - 3).toFixed(1), height: h, 'data-cell': '' });
        if (i < 22) el(g, 'line', { class: 'ch-grid', x1: PL + i * cw + cw / 2, x2: PL + i * cw + cw / 2, y1: top + h / 2 - 5, y2: top + h / 2 + 5 });
      }
      // 22 clean months: bracket below the strip
      const bx2 = PL + 22 * cw - 3, by = top + h + 16;
      const br = 'stroke:rgba(154,166,178,.6);stroke-dasharray:none';
      el(g, 'path', { class: 'ch-ref', d: `M${PL + 2} ${by}H${bx2}M${PL + 2} ${by - 5}V${by + 5}M${bx2} ${by - 5}V${by + 5}`, style: br });
      const tb = el(g, 'text', { class: 'ch-txt', x: PL + 2, y: by + 18, 'text-anchor': 'start' }); tb.textContent = '22 MESECEV BREZ DOGODKOV';
      // FURS event: leader up and left
      const fx = PL + 22 * cw + cw / 2;
      el(g, 'path', { class: 'm-line', d: `M${fx} ${top - 4}V${top - 22}H${fx - 64}`, style: 'stroke:rgba(236,230,217,.7)' });
      const tf = el(g, 'text', { class: 'ch-txt ch-txt--b', x: fx - 70, y: top - 18, 'text-anchor': 'end' }); tf.textContent = 'FURS · 18.420 €';
      // blockade event: ring + leader to the top line
      const bxx = PL + 23 * cw + cw / 2;
      redRing(g, bxx, top + h / 2, cw * 1.1, h * 0.7);
      el(g, 'path', { class: 'm-line', d: `M${bxx} ${top - 14}V${top - 52}H${bxx - 64}`, 'data-mark': '' });
      const tbk = el(g, 'text', { class: 'ch-txt ch-txt--r', x: bxx - 70, y: top - 48, 'text-anchor': 'end' }); tbk.textContent = 'BLOKADA TRR · 2. 10. 2026';
    },
  };
  /** @type {Record<string, (s: SVGSVGElement) => void>} */
  const CH = /** @type {any} */ (CHARTS);
  /** right-hand room each chart needs for its annotations */
  /** @type {Record<string, number>} */
  const ROOM = { liquidity: 64, discipline: 92, leverage: 16, legal: 18 };
  function drawCharts() {
    document.querySelectorAll('[data-chart]').forEach((node) => {
      const sv = /** @type {SVGSVGElement} */ (node);
      const kind = sv.dataset.chart || '';
      const fn = CH[kind];
      if (!fn) return;
      const w = Math.round(sv.getBoundingClientRect().width) || 600;
      if (Number(sv.dataset.w) === w) return;
      sv.dataset.w = String(w);
      while (sv.firstChild) sv.removeChild(sv.firstChild);
      VW = Math.max(280, w);
      PL = VW < 440 ? 38 : 50;
      PR = VW - (ROOM[kind] ?? 20);
      sv.setAttribute('viewBox', `0 0 ${VW} 230`);
      fn(sv);
    });
  }

  /* ---- report thumbnail: the four bones, tiny */
  (function thumb() {
    const s = document.querySelector('[data-thumb]');
    if (!s) return;
    const series = [[30, 29, 28, 27, 25, 22, 17, 13], [8, 9, 10, 12, 14, 17, 20, 24], [26, 26, 25, 26, 25, 18, 12, 6], [22, 22, 22, 22, 22, 22, 22, 22]];
    series.forEach((vals, k) => {
      const ox = (k % 2) * 80 + 6, oy = Math.floor(k / 2) * 30 + 4;
      /** @type {[number, number][]} */ const pts = vals.map((v, i) => [ox + i * 9.5, oy + (v / 32) * 22]);
      el(s, 'path', { d: poly(pts), fill: 'none', stroke: '#ECE6D9', 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: 0.9 });
      el(s, 'path', { d: poly(pts), fill: 'none', stroke: '#0B1015', 'stroke-width': 0.8 });
      if (k === 3) el(s, 'circle', { cx: ox + 66.5, cy: oy + 16.5, r: 5, fill: 'none', stroke: '#FF4B2B', 'stroke-width': 1.3 });
    });
  })();

  /* ---- enter ring (the lens, now 800 px, ticks only) */
  (function ring() {
    const s = document.querySelector('[data-ring]');
    if (!s) return;
    s.setAttribute('viewBox', '-420 -420 840 840');
    for (let i = 0; i < 180; i++) {
      const deg = i * 2, long = i % 15 === 0, mid = i % 5 === 0;
      const [x1, y1] = polar(long ? 372 : mid ? 384 : 390, deg);
      const [x2, y2] = polar(400, deg);
      el(s, 'line', { class: long ? 't t--l' : mid ? 't t--m' : 't', x1: x1.toFixed(1), y1: y1.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1) });
    }
    const f = el(s, 'text', { x: -356, y: 4, 'text-anchor': 'start' }); f.textContent = 'F';
    const sk = el(s, 'text', { x: 356, y: 4, 'text-anchor': 'end' }); sk.textContent = 'S';
  })();

  /* ---- CT slices */
  (function slices() {
    const R = rng(11);
    document.querySelectorAll('[data-slice]').forEach((node) => {
      const s = /** @type {SVGSVGElement} */ (node);
      const k = Number(s.dataset.slice);
      const st = { stroke: '#8FB3CF', 'stroke-width': 1, fill: 'none' };
      const bone = { stroke: '#ECE6D9', 'stroke-width': 1.4, fill: 'none' };
      if (k === 0) { // balance sheets
        for (let i = 0; i < 6; i++) el(s, 'line', { ...st, x1: 36, x2: 364, y1: 48 + i * 32, y2: 48 + i * 32, opacity: 0.6 });
        for (let i = 0; i < 9; i++) el(s, 'rect', { ...bone, x: 54 + i * 34, y: 210 - (40 + R() * 120), width: 16, height: 40 + R() * 120 - 8 });
      } else if (k === 1) { // accounts
        for (let r = 0; r < 5; r++) for (let c = 0; c < 9; c++) el(s, 'rect', { ...st, x: 40 + c * 36, y: 40 + r * 38, width: 26, height: 22, opacity: 0.7 });
        el(s, 'rect', { x: 40 + 6 * 36, y: 40 + 3 * 38, width: 26, height: 22, fill: 'rgba(255,75,43,.5)', stroke: '#FF4B2B', 'stroke-width': 1.5 });
      } else if (k === 2) { // FURS list
        for (let i = 0; i < 7; i++) {
          el(s, 'line', { ...bone, x1: 44, x2: 44 + 140 + R() * 120, y1: 50 + i * 26, y2: 50 + i * 26 });
          el(s, 'line', { ...bone, x1: 318, x2: 356, y1: 50 + i * 26, y2: 50 + i * 26 });
        }
        el(s, 'rect', { x: 36, y: 50 + 3 * 26 - 9, width: 328, height: 18, fill: 'none', stroke: '#FF4B2B', 'stroke-width': 1.6 });
      } else if (k === 3) { // proceedings
        for (let i = 0; i < 5; i++) el(s, 'circle', { ...st, cx: 200, cy: 130, r: 22 + i * 20, opacity: 0.75 - i * 0.1 });
        el(s, 'path', { ...bone, d: 'M120 200 L280 60' });
      } else if (k === 4) { // ownership graph
        /** @type {[number, number][]} */ const nodes = [[200, 130], [110, 70], [300, 66], [96, 196], [304, 198], [200, 40], [200, 222]];
        nodes.slice(1).forEach((n) => el(s, 'line', { ...st, x1: 200, y1: 130, x2: n[0], y2: n[1] }));
        nodes.forEach((n, i) => el(s, 'circle', { ...bone, cx: n[0], cy: n[1], r: i ? 9 : 15 }));
      } else { // payment experiences
        for (let i = 0; i < 220; i++) el(s, 'circle', { cx: (30 + R() * 340).toFixed(1), cy: (30 + R() * 200).toFixed(1), r: 1.6, fill: R() > 0.93 ? '#FF4B2B' : '#ECE6D9', opacity: 0.75 });
      }
    });
  })();

  /** CT label leaders: label column on the right, elbow lines to each slice's corner */
  function layoutCT() {
    const visual = /** @type {HTMLElement | null} */ (document.querySelector('.ct__visual'));
    const leaders = document.querySelector('[data-ct-leaders]');
    const labels = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('[data-ct-labels] li')]);
    if (!visual || !leaders) return;
    while (leaders.firstChild) leaders.removeChild(leaders.firstChild);
    if (getComputedStyle(leaders).display === 'none') return;
    const stack = /** @type {HTMLElement | null} */ (visual.querySelector('.ct__stack'));
    const scene = /** @type {HTMLElement | null} */ (visual.querySelector('.ct__scene'));
    if (stack && scene) {
      const k = clamp(scene.getBoundingClientRect().width / 470, 0.5, 1);
      stack.style.transform = `rotateX(58deg) rotateZ(-38deg) scale(${k.toFixed(3)})`;
    }
    const vr = visual.getBoundingClientRect();
    const pins = [...visual.querySelectorAll('.slice__pin')].map((p) => { const r = p.getBoundingClientRect(); return [r.left - vr.left, r.top - vr.top]; });
    const ys = pins.map((p) => p[1]);
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    const step = Math.max(52, (Math.max(...ys) - Math.min(...ys)) * 1.25 / 5);
    const lx = visual.querySelector('.ct__labels')?.getBoundingClientRect().left || 0;
    const labelX = lx - vr.left;
    labels.forEach((li, i) => {
      const ly = mid + (i - 2.5) * step;
      li.style.setProperty('--ly', ly.toFixed(1) + 'px');
      const [px, py] = pins[i];
      const hot = li.classList.contains('is-hot');
      const ex = labelX - 14;
      const kx = px + (ex - px) * 0.45;
      el(leaders, 'path', { d: `M${px.toFixed(1)} ${py.toFixed(1)} H${kx.toFixed(1)} L${(kx + 18).toFixed(1)} ${ly.toFixed(1)} H${ex.toFixed(1)}`, class: hot ? 'is-hot' : '', 'data-lead': i });
      el(leaders, 'circle', { cx: px.toFixed(1), cy: py.toFixed(1), r: 2.6, class: hot ? 'is-hot' : '', 'data-lead-dot': i });
    });
  }

  /** @param {number} idx */
  function setHotSlice(idx) {
    document.querySelectorAll('[data-ct-stack] .slice').forEach((s, i) => s.classList.toggle('is-hot', i === idx));
    document.querySelectorAll('[data-ct-labels] li').forEach((s, i) => s.classList.toggle('is-hot', i === idx));
    document.querySelectorAll('[data-lead]').forEach((s) => s.classList.toggle('is-hot', Number(/** @type {SVGElement} */ (s).dataset.lead) === idx));
    document.querySelectorAll('[data-lead-dot]').forEach((s) => s.classList.toggle('is-hot', Number(/** @type {SVGElement} */ (s).dataset.leadDot) === idx));
  }

  /* ---- monitor sparklines: ECG with the event segment marked */
  (function sparks() {
    /** @type {Record<string, {at: number, from: number, to: number, kind: string, amp: number}>} */
    const EV = {
      crit: { at: 158, from: 13, to: 33, kind: 'hit', amp: 1.15 },
      down2: { at: 132, from: 17, to: 27, kind: 'hit', amp: 0.8 },
      down3: { at: 170, from: 18, to: 26, kind: 'hit', amp: 0.75 },
      down4: { at: 96, from: 18, to: 25, kind: 'hit', amp: 0.7 },
      up1: { at: 176, from: 30, to: 15, kind: 'up', amp: 0.8 },
      up2: { at: 140, from: 19, to: 14, kind: 'up', amp: 0.7 },
    };
    document.querySelectorAll('[data-spark]').forEach((node) => {
      const s = /** @type {SVGSVGElement} */ (node);
      const ev = EV[s.dataset.spark || 'crit'];
      /** @param {number} x */
      const base = (x) => mix(ev.from, ev.to, smooth(ev.at - 6, ev.at + 10, x));
      /** @param {number} x */
      const beat = (x) => {
        const p = (x % 24) / 24;
        if (p > 0.3 && p < 0.34) return 2.5;
        if (p >= 0.34 && p < 0.39) return -10;
        if (p >= 0.39 && p < 0.44) return 5;
        if (p > 0.6 && p < 0.7) return -2.2;
        return 0;
      };
      /** @type {[number, number][]} */ const pre = [], post = [];
      for (let x = 0; x <= 220; x += 1.5) {
        const pt = /** @type {[number, number]} */ ([x, base(x) + beat(x) * ev.amp]);
        if (x <= ev.at - 6) pre.push(pt); else post.push(pt);
      }
      if (pre.length) post.unshift(pre[pre.length - 1]);
      el(s, 'path', { class: 'sp-base', d: poly(pre) });
      el(s, 'path', { class: ev.kind === 'up' ? 'sp-up' : 'sp-hit', d: poly(post) });
      el(s, 'circle', { class: ev.kind === 'up' ? 'sp-dot sp-dot--ok' : 'sp-dot', cx: ev.at - 6, cy: base(ev.at - 6), r: 2.6 });
    });
  })();

  /* ---- 365 daily frames */
  (function frames() {
    const host = document.querySelector('[data-frames]');
    if (!host) return;
    const R = rng(4);
    const frag = document.createDocumentFragment();
    for (let d = 0; d < 365; d++) {
      const t = d / 364;
      let idx = 68 - t * 9 + Math.sin(d / 9) * 2.5 + (R() - 0.5) * 3;
      if (d > 300) idx -= (d - 300) * 0.12;
      if (d >= 360) idx = 34;
      const i = document.createElement('i');
      if (d >= 360) i.className = d === 364 ? 'r now' : 'r';
      else i.style.setProperty('--a', (0.05 + Math.pow(clamp((idx - 34) / 38, 0, 1), 1.3) * 0.78).toFixed(3));
      frag.appendChild(i);
    }
    host.appendChild(frag);
  })();

  /* ---- the classic film: one blurry, overexposed exposure */
  (function oldFilm() {
    const s = document.querySelector('[data-oldfilm]');
    if (!s) return;
    el(s, 'path', { d: 'M150 30 C 190 60, 200 120, 180 170 C 160 220, 210 260, 200 330 L 110 340 C 100 270, 140 230, 120 170 C 100 110, 110 60, 150 30 Z', fill: '#59636C' });
    for (let i = 0; i < 6; i++) el(s, 'path', { d: `M60 ${120 + i * 34} Q 150 ${100 + i * 34} 240 ${124 + i * 34}`, stroke: '#5C666F', 'stroke-width': 9, fill: 'none', opacity: 0.6 });
    el(s, 'circle', { cx: 150, cy: 200, r: 60, fill: '#727C84', opacity: 0.5 });
  })();

  /* ====================================================== MINI LENS (final) */
  const mini = /** @type {HTMLElement | null} */ (document.querySelector('.mini'));
  const miniSk = /** @type {HTMLElement | null} */ (document.querySelector('[data-mini-skeleton]'));
  const miniLens = /** @type {HTMLElement | null} */ (document.querySelector('[data-mini-lens]'));
  const M = { x: 0, y: 0, tx: 0, ty: 0, r: 150, rest: { x: 0, y: 0 }, inset: { x: 0, y: 0 }, active: false };
  if (miniLens) {
    const s = /** @type {SVGSVGElement} */ (miniLens.querySelector('svg'));
    el(s, 'circle', { class: 'rim', r: 156 });
    for (let i = 0; i < 90; i++) {
      const long = i % 10 === 0;
      const [x1, y1] = polar(158, i * 4);
      const [x2, y2] = polar(long ? 170 : 163, i * 4);
      el(s, 'line', { class: 't', x1: x1.toFixed(2), y1: y1.toFixed(2), x2: x2.toFixed(2), y2: y2.toFixed(2), 'stroke-width': 1 });
    }
    el(s, 'circle', { class: 'edge', r: 150 });
    const [a1, b1] = polar(160, 128), [a2, b2] = polar(160, 166);
    el(s, 'path', { class: 'arc', d: `M${a1.toFixed(1)} ${b1.toFixed(1)} A160 160 0 0 1 ${a2.toFixed(1)} ${b2.toFixed(1)}` });
  }
  function measureMini() {
    if (!mini || !miniSk || !miniLens) return;
    const mr = mini.getBoundingClientRect();
    const sr = miniSk.getBoundingClientRect();
    const em = /** @type {HTMLElement} */ (mini.querySelector('.mini__facade em')).getBoundingClientRect();
    M.r = parseFloat(getComputedStyle(mini).getPropertyValue('--mr')) || 150;
    M.inset = { x: mr.left - sr.left, y: mr.top - sr.top };
    M.rest = { x: (em.left + em.right) / 2 - mr.left, y: (em.top + em.bottom) / 2 - mr.top + em.height * 0.04 };
    if (!M.active) { M.x = M.tx = M.rest.x; M.y = M.ty = M.rest.y; }
    miniSk.style.setProperty('--tx', (M.rest.x + M.inset.x).toFixed(1) + 'px');
    miniSk.style.setProperty('--ty', (M.rest.y + M.inset.y).toFixed(1) + 'px');
    renderMini();
  }
  function renderMini() {
    if (!miniSk || !miniLens) return;
    miniSk.style.setProperty('--mx', (M.x + M.inset.x).toFixed(1) + 'px');
    miniSk.style.setProperty('--my', (M.y + M.inset.y).toFixed(1) + 'px');
    miniLens.style.transform = `translate3d(${M.x.toFixed(1)}px, ${M.y.toFixed(1)}px, 0) scale(${(M.r / 150).toFixed(3)})`;
  }
  let miniRaf = 0;
  function miniLoop() {
    miniRaf = 0;
    M.x += (M.tx - M.x) * 0.14; M.y += (M.ty - M.y) * 0.14;
    renderMini();
    if (Math.abs(M.tx - M.x) > 0.2 || Math.abs(M.ty - M.y) > 0.2) miniRaf = requestAnimationFrame(miniLoop);
  }
  if (mini && !STATIC) {
    const demo = /** @type {HTMLElement} */ (document.querySelector('[data-mini]'));
    demo.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const mr = mini.getBoundingClientRect();
      M.active = true; M.tx = e.clientX - mr.left; M.ty = clamp(e.clientY - mr.top, -40, mr.height + 40);
      if (!miniRaf) miniRaf = requestAnimationFrame(miniLoop);
    });
    demo.addEventListener('pointerleave', () => { M.active = false; M.tx = M.rest.x; M.ty = M.rest.y; if (!miniRaf) miniRaf = requestAnimationFrame(miniLoop); });
  }

  /* ========================================================== FOOTER LENS */
  const ftrMark = /** @type {HTMLElement | null} */ (document.querySelector('.ftr__mark'));
  const F = { x: 0, y: 0, tx: 0, ty: 0, raf: 0 };
  function measureFooter() {
    if (!ftrMark) return;
    const r = ftrMark.getBoundingClientRect();
    const fr = clamp(r.height * 0.42, 70, 150);
    ftrMark.style.setProperty('--fr', fr.toFixed(0) + 'px');
    F.x = F.tx = r.width * 0.5; F.y = F.ty = r.height * 0.5;
    ftrMark.style.setProperty('--fx', F.x.toFixed(1) + 'px');
    ftrMark.style.setProperty('--fy', F.y.toFixed(1) + 'px');
  }
  if (ftrMark && !STATIC) {
    const loop = () => {
      F.raf = 0;
      F.x += (F.tx - F.x) * 0.12; F.y += (F.ty - F.y) * 0.12;
      ftrMark.style.setProperty('--fx', F.x.toFixed(1) + 'px');
      ftrMark.style.setProperty('--fy', F.y.toFixed(1) + 'px');
      if (Math.abs(F.tx - F.x) > 0.2 || Math.abs(F.ty - F.y) > 0.2) F.raf = requestAnimationFrame(loop);
    };
    ftrMark.addEventListener('pointermove', (e) => {
      const r = ftrMark.getBoundingClientRect();
      F.tx = e.clientX - r.left; F.ty = e.clientY - r.top;
      if (!F.raf) F.raf = requestAnimationFrame(loop);
    });
  }

  /* ================================================================ SEARCH */
  document.querySelectorAll('[data-search]').forEach((formNode) => {
    const form = /** @type {HTMLFormElement} */ (formNode);
    const input = /** @type {HTMLInputElement} */ (form.querySelector('input'));
    const list = /** @type {HTMLUListElement} */ (form.querySelector('[role="listbox"]'));
    const out = /** @type {HTMLElement} */ (form.querySelector('.search__result'));
    /** @type {typeof COMPANIES} */
    let matches = [];
    let active = -1;
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    /** @param {string} q */
    const find = (q) => {
      const n = norm(q.trim()).replace(/\s+/g, ' ');
      if (n.length < 2) return [];
      const digits = n.replace(/\D/g, '');
      return COMPANIES.filter((c) => norm(c.n + ' ' + c.p + ' ' + c.s).includes(n) || (digits.length >= 4 && c.ids.includes(digits)));
    };
    const paint = () => {
      list.textContent = '';
      matches.slice(0, 6).forEach((c, i) => {
        const li = document.createElement('li');
        li.className = 'search__opt';
        li.id = `${list.id}-${i}`;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === active));
        li.innerHTML = `<b></b><span class="ix"></span><small></small>`;
        /** @type {HTMLElement} */ (li.querySelector('b')).textContent = c.n;
        /** @type {HTMLElement} */ (li.querySelector('small')).textContent = `${c.p} · ${c.s}`;
        /** @type {HTMLElement} */ (li.querySelector('.ix')).textContent = `${c.i} · ${c.c}`;
        li.addEventListener('mousedown', (ev) => { ev.preventDefault(); choose(c); });
        list.appendChild(li);
      });
      const has = matches.length > 0;
      list.hidden = !has;
      input.setAttribute('aria-expanded', String(has));
      if (active >= 0) input.setAttribute('aria-activedescendant', `${list.id}-${active}`); else input.removeAttribute('aria-activedescendant');
    };
    /** @param {(typeof COMPANIES)[number]} c */
    const choose = (c) => {
      input.value = c.n;
      close();
      const report = c.c === 'E';
      out.textContent = '';
      /** @param {string} tag @param {string} cls @param {string} txt */
      const line = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; n.textContent = txt; out.appendChild(n); return n; };
      line('b', '', c.n);
      line('span', 'rx', `${c.p} · ${c.s}`);
      line('span', 'rx rx--b', `Jasno indeks ${c.i} · razred ${c.c} (${CLASS_NAME[c.c]})`);
      line('span', 'rx', `Verjetnost neplačila v 12 mesecih: ${c.pd}`);
      line('span', 'rx', `Priporočilo: ${c.lim}`);
      const a = /** @type {HTMLAnchorElement} */ (line('a', '', report ? 'Oglejte si primer poročila →' : 'Preizkusite brezplačno →'));
      a.href = report ? '#izvid' : '/registracija/';
    };
    input.addEventListener('input', () => { out.textContent = ''; matches = find(input.value); active = -1; paint(); });
    input.addEventListener('keydown', (e) => {
      if (list.hidden && e.key !== 'Escape') return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % Math.min(6, matches.length); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + Math.min(6, matches.length)) % Math.min(6, matches.length); paint(); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(matches[active]); }
      else if (e.key === 'Escape') { close(); out.textContent = ''; }
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
    form.addEventListener('submit', (e) => {
      const m = find(input.value);
      if (m.length) { e.preventDefault(); choose(m[0]); }
    });
  });

  /* ============================================================ MOTION */
  function motion() {
    if (STATIC || !HAS_GSAP || !ST) return;

    // statement: brochure dims, X-ray lights up (scrubbed)
    gsap.fromTo('.enter__b', { opacity: 0.12 }, { opacity: 1, ease: 'none', scrollTrigger: { trigger: '.enter', start: 'top 70%', end: 'center 50%', scrub: 0.6 } });
    gsap.fromTo('.enter__ring', { scale: 0.55, rotate: -40, opacity: 0 }, { scale: 1, rotate: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: '.enter', start: 'top bottom', end: 'center 55%', scrub: 0.8 } });

    // headings rise by line
    if (SplitText) {
      document.querySelectorAll('.h2, .insight__title, .final__title').forEach((h) => {
        SplitText.create(h, {
          type: 'lines', mask: 'lines', autoSplit: true,
          onSplit: (/** @type {any} */ self) => gsap.from(self.lines, { yPercent: 110, duration: 1.1, ease: 'expo.out', stagger: 0.08, scrollTrigger: { trigger: h, start: 'top 86%', once: true } }),
        });
      });
    }
    gsap.utils.toArray('.sec-head__intro, .insight__lead, .insight__body, .ct__intro, .monitor__copy, .points li, .step').forEach((n) => {
      gsap.from(/** @type {Element} */ (n), { y: 18, opacity: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: /** @type {Element} */ (n), start: 'top 90%', once: true } });
    });

    // invoice: X-ray exposure
    gsap.from('.invoice__sheet', { opacity: 0, filter: 'brightness(2.2) blur(6px)', duration: 1.3, ease: 'power2.out', scrollTrigger: { trigger: '.invoice', start: 'top 78%', once: true } });

    // bones: stroke draw + marker ping
    document.querySelectorAll('.bone').forEach((b) => {
      const paths = /** @type {SVGPathElement[]} */ ([...b.querySelectorAll('[data-draw]')]);
      const joints = b.querySelectorAll('[data-joint], .b-hole');
      const marks = b.querySelectorAll('[data-mark], .m-ring');
      const verts = b.querySelectorAll('[data-vert]');
      const cells = b.querySelectorAll('[data-cell]');
      const tl = gsap.timeline({ scrollTrigger: { trigger: b, start: 'top 78%', once: true } });
      paths.forEach((p) => { const L = p.getTotalLength(); p.style.strokeDasharray = `${L}`; p.style.strokeDashoffset = `${L}`; });
      if (paths.length) tl.to(paths, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut', stagger: 0.04, onComplete: () => paths.forEach((p) => { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; }) }, 0);
      if (joints.length) tl.from(joints, { opacity: 0, duration: 0.3, stagger: 0.012 }, 0.1);
      if (verts.length) tl.from(verts, { scaleY: 0, transformOrigin: '50% 100%', duration: 0.9, ease: 'expo.out', stagger: 0.1 }, 0);
      if (cells.length) tl.from(cells, { opacity: 0, duration: 0.25, stagger: 0.03 }, 0);
      if (marks.length) tl.from(marks, { scale: 0, opacity: 0, transformOrigin: '50% 50%', duration: 0.6, ease: 'back.out(3)', stagger: 0.08 }, 1.25);
      tl.from(b.querySelector('.dot'), { scale: 0, duration: 0.5, ease: 'back.out(3)' }, 1.3);
    });

    // CT: scrub which slice is lit; numbers count
    ST.create({
      trigger: '.ct__visual', start: 'top 70%', end: 'bottom 35%', scrub: true,
      onUpdate: (/** @type {any} */ self) => setHotSlice(Math.min(5, Math.floor(self.progress * 6))),
    });
    document.querySelectorAll('[data-count]').forEach((n) => {
      const node = /** @type {HTMLElement} */ (n);
      const to = Number(node.dataset.count);
      const o = { v: 0 };
      gsap.to(o, { v: to, duration: 1.2, ease: 'power2.out', scrollTrigger: { trigger: node, start: 'top 88%', once: true }, onUpdate: () => { node.textContent = fmtInt(o.v); } });
    });

    // lightbox: flicker on like a real viewer
    gsap.timeline({ scrollTrigger: { trigger: '.lightbox', start: 'top 72%', once: true } })
      .fromTo('.izvid', { opacity: 0 }, { opacity: 0.6, duration: 0.08 })
      .to('.izvid', { opacity: 0.3, duration: 0.07 })
      .to('.izvid', { opacity: 1, duration: 0.35, ease: 'power2.out' });

    // monitor rows + alarm
    gsap.from('.vt tbody tr', { opacity: 0, x: -12, duration: 0.6, ease: 'power3.out', stagger: 0.07, scrollTrigger: { trigger: '.vitals', start: 'top 80%', once: true } });
    document.querySelectorAll('.vt__spark svg path').forEach((p) => {
      const path = /** @type {SVGPathElement} */ (p);
      const L = path.getTotalLength();
      gsap.fromTo(path, { strokeDasharray: L, strokeDashoffset: L }, { strokeDashoffset: 0, duration: 1.3, ease: 'power1.inOut', scrollTrigger: { trigger: '.vitals', start: 'top 78%', once: true }, onComplete: () => { path.style.strokeDasharray = ''; path.style.strokeDashoffset = ''; } });
    });
    gsap.from('.alarm', { y: 40, opacity: 0, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: '.alarm', start: 'top 88%', once: true } });

    // comparison frames develop
    gsap.from('.frames i', { opacity: 0, duration: 0.02, stagger: { each: 0.004, from: 'start' }, scrollTrigger: { trigger: '.viewer', start: 'top 75%', once: true } });
    gsap.from('.cmp tbody tr', { opacity: 0, y: 12, duration: 0.6, stagger: 0.06, ease: 'power3.out', scrollTrigger: { trigger: '.cmp', start: 'top 85%', once: true } });

    // plans + quote
    gsap.from('.plan', { y: 30, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08, scrollTrigger: { trigger: '.plans', start: 'top 82%', once: true } });
    gsap.from('.quote__main blockquote', { opacity: 0, y: 24, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.quote__main', start: 'top 80%', once: true } });

    // footer wordmark slides up
    gsap.from('.ftr__word', { yPercent: 30, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.ftr', start: 'top 85%', once: true } });
  }

  /* ---- mobile dock (thumb-reach CTA once the hero is gone) */
  (function dock() {
    const d = document.querySelector('[data-dock]');
    if (!d || CAPTURE || !('IntersectionObserver' in W)) return;
    let heroIn = true, finalIn = false;
    const upd = () => d.classList.toggle('is-on', !heroIn && !finalIn);
    new IntersectionObserver((en) => {
      for (const e of en) {
        if (/** @type {HTMLElement} */ (e.target).classList.contains('hero')) heroIn = e.isIntersecting;
        else finalIn = e.isIntersecting;
      }
      upd();
    }).observe(hero);
    const fin = document.querySelector('.final');
    const ftr = document.querySelector('.ftr');
    const io2 = new IntersectionObserver((en) => { finalIn = en.some((x) => x.isIntersecting); upd(); });
    if (fin) io2.observe(fin);
    if (ftr) io2.observe(ftr);
  })();

  /* ============================================================== LAYOUT */
  function layoutAll() {
    drawCharts();
    decideMode();
    layoutSkeleton();
    fitRings();
    measure();
    lastWrite = '';
    render();
    layoutCT();
    measureMini();
    measureFooter();
  }

  let rzTimer = 0, lastW = W.innerWidth;
  W.addEventListener('resize', () => {
    clearTimeout(rzTimer);
    rzTimer = W.setTimeout(() => {
      const touchOnlyHeight = MODE === 'band' && W.innerWidth === lastW;
      lastW = W.innerWidth;
      if (touchOnlyHeight) return; // ignore mobile address-bar resizes
      layoutAll();
      if (ST) ST.refresh();
      schedule();
    }, 140);
  });

  /* ============================================================== BOOT */
  async function boot() {
    try { await document.fonts.ready; } catch (e) { /* fonts optional */ }
    layoutAll();
    if (CAPTURE) {
      // capture: the most telling state, composed by code
      S.intro = 1; S.full = 0; S.scroll = 0;
      S.x = S.tx = G.rest.x; S.y = S.ty = G.rest.y;
      setFinding(3);
      S.bump = G.keyR - S.base;
      if (MODE === 'band') S.by = G.rows[3];
      setHotSlice(2);
      lastWrite = '';
      render();
    } else {
      if (REDUCED) { setFinding(3); S.bump = G.keyR - S.base; S.intro = 1; lastWrite = ''; render(); }
      heroIntro();
      setupHeroScroll();
      motion();
      if (ST) { ST.addEventListener('refresh', measureHeroLimit); ST.refresh(); }
      measureHeroLimit();
      schedule();
      if (REDUCED) setHotSlice(2);
    }
    requestAnimationFrame(() => requestAnimationFrame(() => { W.__READY__ = true; }));
  }
  boot();
})();
