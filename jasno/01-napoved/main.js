// @ts-check
/**
 * Jasno · 01 NAPOVED — page orchestration.
 * Builds the charts and maps, runs the isobar fields, wires the search, tabs and sheet,
 * and drives motion (GSAP + ScrollTrigger + SplitText, Lenis). Capture mode renders
 * every section in its composed final state with a deterministic isobar frame.
 */
(function () {
  'use strict';

  /** @type {any} */ const W = window;
  const html = document.documentElement;
  const params = new URLSearchParams(location.search);
  const CAPTURE = W.__CAPTURE__ === true || params.has('capture');
  const SHOT = params.get('shot') || '';
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mqMobile = window.matchMedia('(max-width: 1023px)');
  const gsap = W.gsap, ScrollTrigger = W.ScrollTrigger, SplitText = W.SplitText, Lenis = W.Lenis;
  const ANIM = !CAPTURE && !REDUCED && !!gsap;
  const NS = 'http://www.w3.org/2000/svg';
  if (CAPTURE) html.classList.add('is-capture');
  if (REDUCED) html.classList.add('is-reduced');
  if (!ANIM) html.classList.add('intro-done');

  /** @param {string} s @param {ParentNode} [r] @returns {any} */
  const $ = (s, r = document) => r.querySelector(s);
  /** @param {string} s @param {ParentNode} [r] @returns {any[]} */
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  /** @param {number} a @param {number} b @param {number} t */
  const lerp = (a, b, t) => a + (b - a) * t;
  /** deterministic PRNG @param {number} seed */
  const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  /** @param {number} n @param {number} [dec] */
  const fmt = (n, dec = 0) => n.toLocaleString('sl-SI', { minimumFractionDigits: dec, maximumFractionDigits: dec }).replace(/ /g, '.');

  /* =================================================================== DATA */
  /**
   * @typedef {{ key: string, name: string, short: string, place: string, sector: string, ids?: string, index: number, delta: number,
   *   cls: string, clsName: string, state: string, glyph: string, pd: string, limit?: string, term?: string, alert?: boolean, ms?: string, ds?: string,
   *   months?: number[], dec?: number, glyphs?: string, reasons?: [string, string, number, boolean?][], events?: [string, string, string, string?][], tab?: boolean }} Company
   */
  /** @type {Record<string, Company>} */
  const COMPANIES = {
    hribar: {
      key: 'hribar', name: 'Hribar Les d.o.o.', short: 'Hribar Les', place: 'Škofja Loka', sector: 'lesna industrija',
      ids: 'MŠ 5874123000 · DŠ SI 87654321', index: 87, delta: 3, cls: 'A', clsName: 'Odlično', state: 'Jasno', glyph: 'a',
      pd: '0,4 %', limit: '120.000 €', term: 'do 60 dni', tab: true,
      months: [0.03, 0.07, 0.10, 0.13, 0.17, 0.20, 0.23, 0.27, 0.30, 0.33, 0.37, 0.40], dec: 2, glyphs: 'aaaaaaaaaaaa',
      reasons: [['+', 'Plačuje povprečno 2 dni pred rokom', 0.86], ['+', 'Kapital raste tretje leto zapored', 0.62], ['-', 'Velika odvisnost od enega kupca', 0.38]],
      events: [['2026-03-28', '28. 3. 2026', 'Oddano letno poročilo 2025'], ['2026-06-12', '12. 6. 2026', 'Nov prokurist'], ['2026-10-06', '6. 10. 2026', 'Ocena izboljšana na 87', 'latest']],
    },
    novak: {
      key: 'novak', name: 'Novak Elektro d.o.o.', short: 'Novak Elektro', place: 'Celje', sector: 'elektroinštalacije',
      ids: 'MŠ 6034871000 · DŠ SI 58273641', index: 58, delta: -6, cls: 'C', clsName: 'Zmerno', state: 'Delno oblačno', glyph: 'c',
      pd: '2,1 %', limit: '18.000 €', term: 'do 30 dni', tab: true,
      months: [0.2, 0.4, 0.5, 0.7, 0.9, 1.1, 1.2, 1.4, 1.6, 1.8, 1.9, 2.1], dec: 1, glyphs: 'cccccccccccc',
      reasons: [['-', 'Plačuje povprečno 12 dni po roku (pred pol leta: 3 dni)', 0.74], ['-', 'Zadolženost nad povprečjem panoge', 0.42], ['+', 'Brez blokad in davčnih dolgov', 0.5]],
      events: [['2026-03-30', '30. 3. 2026', 'Oddano letno poročilo 2025'], ['2026-08-18', '18. 8. 2026', 'Povprečna zamuda presegla 10 dni'], ['2026-10-06', '6. 10. 2026', 'Ocena znižana na 58', 'latest']],
    },
    kovac: {
      key: 'kovac', name: 'Kovač Gradnje d.o.o.', short: 'Kovač Gradnje', place: 'Maribor', sector: 'gradbeništvo (SKD F41.200)',
      ids: 'MŠ 6123456000 · DŠ SI 12345678', index: 34, delta: -29, cls: 'E', clsName: 'Visoko tveganje', state: 'Nevihta', glyph: 'e',
      pd: '18,6 %', limit: '0 €', term: 'samo predplačilo', alert: true, tab: true,
      months: [0.3, 0.6, 1.0, 1.6, 2.4, 3.3, 4.3, 6.4, 8.9, 11.7, 15.0, 18.6], dec: 1, glyphs: 'ccdddddeeeee',
      reasons: [['-', 'Transakcijski račun je blokiran od 2. 10. 2026', 0.96, true], ['-', 'Plačuje povprečno 47 dni po roku (pred pol leta: 9 dni)', 0.88, true], ['-', 'Na seznamu davčnih dolžnikov FURS (18.420 €)', 0.8, true], ['-', 'Kapital je negativen: −212.300 €', 0.7]],
      events: [['2026-09-25', '25. 9. 2026', 'Uvrstitev na seznam davčnih dolžnikov FURS'], ['2026-10-02', '2. 10. 2026', 'Blokada transakcijskega računa', 'alert'], ['2026-10-06', '6. 10. 2026', 'Ocena znižana na 34', 'alert']],
    },
    zupan: { key: 'zupan', name: 'Zupan Transport d.o.o.', short: 'Zupan Transport', place: 'Koper', sector: 'logistika', index: 71, delta: 0, cls: 'B', clsName: 'Dobro', state: 'Pretežno jasno', glyph: 'b', pd: '0,9 %', limit: '45.000 €', term: 'do 45 dni' },
    pekarna: { key: 'pekarna', name: 'Pekarna Zrno d.o.o.', short: 'Pekarna Zrno', place: 'Kranj', sector: 'živilska industrija', index: 79, delta: 11, cls: 'B', clsName: 'Dobro', state: 'Pretežno jasno', glyph: 'b', pd: '0,6 %', limit: '30.000 €', term: 'do 45 dni' },
    horvat: { key: 'horvat', name: 'Avtoservis Horvat s.p.', short: 'Avtoservis Horvat', place: 'Murska Sobota', sector: 'avtoservis', index: 63, delta: 8, cls: 'C', clsName: 'Zmerno', state: 'Delno oblačno', glyph: 'c', pd: '1,6 %', limit: '8.000 €', term: 'do 30 dni' },
    krajnc: { key: 'krajnc', name: 'Strojna Krajnc d.o.o.', short: 'Strojna Krajnc', place: 'Velenje', sector: 'strojegradnja', index: 46, delta: -7, cls: 'D', clsName: 'Povišano', state: 'Oblačno', glyph: 'd', pd: '5,8 %', limit: '6.000 €', term: 'do 15 dni' },
    vidmar: { key: 'vidmar', name: 'Tiskarna Vidmar d.o.o.', short: 'Tiskarna Vidmar', place: 'Nova Gorica', sector: 'tiskarstvo', index: 41, delta: -9, cls: 'D', clsName: 'Povišano', state: 'Oblačno', glyph: 'd', pd: '7,4 %', limit: '3.000 €', term: 'do 15 dni' },
  };
  COMPANIES.hribar.ms = '5874123000'; COMPANIES.hribar.ds = '87654321';
  COMPANIES.kovac.ms = '6123456000'; COMPANIES.kovac.ds = '12345678';

  const GLYPH_NAME = /** @type {Record<string, string>} */ ({ a: 'jasno', b: 'pretežno jasno', c: 'delno oblačno', d: 'oblačno', e: 'nevihta' });
  const MONTHS = ['nov', 'dec', 'jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt'];

  /** Regional average Jasno index, October 2026 (fictional) */
  const REGIONS = /** @type {Record<string, [number, number]>} */ ({
    SI031: [54, -2], SI032: [57, -3], SI033: [66, 0], SI034: [63, -1], SI035: [58, -2], SI036: [61, 1],
    SI037: [69, 2], SI038: [65, 1], SI041: [72, 1], SI042: [74, 2], SI043: [70, 0], SI044: [67, -1],
  });

  /* ================================================================ HELPERS */
  /** @param {string} tag @param {Record<string, string | number>} [attrs] @param {string} [inner] */
  function svgEl(tag, attrs = {}, inner) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    if (inner) el.innerHTML = inner;
    return el;
  }

  /** Catmull-Rom to cubic Bezier path through points. @param {number[][]} p @param {number} [k] */
  function smoothPath(p, k = 1) {
    if (p.length < 2) return '';
    let d = `M${p[0][0].toFixed(2)} ${p[0][1].toFixed(2)}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
      const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * k, p1[1] + ((p2[1] - p0[1]) / 6) * k];
      const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * k, p2[1] - ((p3[1] - p1[1]) / 6) * k];
      d += `C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    return d;
  }

  /** Run fn on element resize (width changes only by default). @param {Element} el @param {() => void} fn */
  function onResize(el, fn) {
    let lastW = -1, lastH = -1;
    const run = () => {
      const r = el.getBoundingClientRect();
      if (Math.abs(r.width - lastW) < 0.5 && Math.abs(r.height - lastH) < 0.5) return;
      lastW = r.width; lastH = r.height; fn();
    };
    if ('ResizeObserver' in window) new ResizeObserver(run).observe(el);
    else W.addEventListener('resize', run);
    run();
  }

  /** Slovenian typesetting: a one-letter word never ends a line. @param {string} s */
  const nb = (s) => s.replace(/(^|[\s(])([vVzZsSkKaAiIoOuU]) (?=\S)/g, '$1$2\u00a0').replace(/(\d) (?=[a-zčšžA-ZČŠŽ€%])/g, '$1\u00a0').replace(/ (d\.o\.o\.|s\.p\.)/g, '\u00a0$1');
  /** @param {string} s */
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  /* ================================================================== MAPS */
  /** @type {any} */ let heroMap = null;
  /** @type {any} */ let radarMap = null;

  function buildMaps() {
    const M = W.NapovedMaps;
    if (!M || !W.JASNO_GEO) return;
    const mobile = mqMobile.matches;
    const hb = $('[data-map="hero"]');
    if (hb) {
      heroMap = M.buildHero(hb, { mobile });
      onResize($('[data-hero]'), layoutHero);
    }
    const rb = $('[data-map="radar"]');
    if (rb) {
      radarMap = M.buildRadar(rb, { mobile });
      const fit = () => {
        const w = rb.clientWidth;
        radarMap.sweep.style.setProperty('--r2', (w * 1.15).toFixed(0) + 'px');
        const sec = $('.storm__inner').getBoundingClientRect(), br = rb.getBoundingClientRect();
        M.placeLabels(rb, radarMap.stations, {
          drop: 'label', weights: { kovac: 1000, krajnc: 400, novak: 400, pekarna: 300, hribar: 40, vidmar: 30, zupan: 20, horvat: 10 },
          bounds: mqMobile.matches ? { x: sec.left - br.left + 4, y: -6, w: sec.width - 8, h: br.height + 12 } : { x: -48, y: -6, w: br.width + 60, h: br.height + 12 },
        });
      };
      onResize(rb, fit);
      if (!CAPTURE && !REDUCED) radarMap.sweep.classList.add('is-spinning');
      else radarMap.sweep.style.setProperty('--a', '218deg');
    }
    const eb = $('[data-map="econ"]');
    if (eb) {
      /** @type {Record<string, number>} */ const values = {};
      for (const k in REGIONS) values[k] = REGIONS[k][0];
      const econ = M.buildEcon(eb, { values, mobile });
      buildEconTable(econ.ramp);
    }
    if (heroMap && !CAPTURE && !REDUCED) heroMap.halo.classList.add('halo--pulse');
  }

  /**
   * Dock the map above the card without letting the border touch the headline or copy, then place
   * every hero label clear of the border. On desktop a small solver finds the lowest map position that
   * keeps the whole outline above the card and below the text it shares columns with, shrinking the
   * map only when both cannot hold.
   */
  function layoutHero() {
    const hero = $('[data-hero]'), card = $('[data-fcard]'), box = $('[data-map="hero"]');
    if (!hero || !heroMap || !box) return;
    const mobile = mqMobile.matches;
    const css = getComputedStyle(html);
    const gut = parseFloat(css.getPropertyValue('--gutter')) || 20;
    const head = parseFloat(css.getPropertyValue('--header-h')) || 64;
    if (mobile) {
      box.style.cssText = '';
      hero.style.removeProperty('--card-h');
    } else {
      hero.style.setProperty('--card-h', card.offsetHeight + 'px');
      const hr = hero.getBoundingClientRect();
      const vw = window.innerWidth, u = Math.min(vw, 1440) / 100, x0 = Math.max(0, (vw - 1440) / 2);
      /** @param {Element} el @param {boolean} tight */
      const rectOf = (el, tight) => {
        const r = el.getBoundingClientRect();
        if (!tight) return r;
        const rg = document.createRange(); rg.selectNodeContents(el);
        const t = rg.getBoundingClientRect();
        return { left: t.left, right: t.right, top: r.top, bottom: r.bottom };
      };
      // the outline must stay below the eyebrow and the headline lines it shares columns with...
      /** @type {{ l: number, r: number, y: number }[]} */ const below = [];
      for (const el of [$('.hero__eyebrow'), ...$$('.hero__title .line__inner')]) {
        const r = rectOf(el, true);
        below.push({ l: r.left, r: r.right, y: r.bottom - hr.top });
      }
      // ...and above the copy, the search and the card
      /** @type {{ l: number, r: number, y: number }[]} */ const above = [];
      for (const el of [$('.hero__sub'), $('.hero__search'), $('.hero__micro'), card]) {
        const r = rectOf(el, el.classList.contains('hero__sub') || el.classList.contains('hero__micro'));
        above.push({ l: r.left, r: r.right, y: r.top - hr.top });
      }
      const pts = /** @type {number[][]} */ (W.NapovedMaps.outlinePts()).filter((/** @type {number[]} */ _, /** @type {number} */ i) => i % 2 === 0);
      const leftBase = x0 + 46.5 * u;
      let w = 48.6 * u, top = head, left = leftBase;
      search: for (let k = 0; k < 40; k++) {
        const sc = w / 1000;
        const leftMax = Math.max(leftBase, vw - x0 - gut - sc * 962);
        for (let L = leftBase; L <= leftMax + 0.1; L += 4) {
          let minTop = head + 36 - sc * 50, maxTop = Infinity;
          for (const p of pts) {
            const x = L + sc * p[0];
            for (const B of below) if (x > B.l - 10 && x < B.r + 10) { const v = B.y + 10 - sc * p[1]; if (v > minTop) minTop = v; }
            for (const B of above) if (x > B.l - 10 && x < B.r + 10) { const v = B.y - 16 - sc * p[1]; if (v < maxTop) maxTop = v; }
          }
          if (minTop <= maxTop) { top = Math.min(maxTop, Math.max(minTop, maxTop)); left = L; break search; }
        }
        w *= 0.97;
      }
      box.style.left = left.toFixed(1) + 'px';
      box.style.top = top.toFixed(1) + 'px';
      box.style.bottom = 'auto';
      box.style.width = w.toFixed(1) + 'px';
    }
    const br = box.getBoundingClientRect(), hr = hero.getBoundingClientRect();
    const obstacles = mobile ? [$('.hero__title'), $('.hero__sub')] : [$('.hero__title'), $('.hero__sub'), $('.hero__search'), card];
    W.NapovedMaps.placeLabels(box, heroMap.stations, {
      obstacles, drop: true,
      weights: { kovac: 1000, hribar: 400, novak: 400, zupan: 60, krajnc: 30, vidmar: 20, pekarna: 10 },
      fixed: [...heroMap.centres, ...heroMap.countries],
      bounds: { x: gut - br.left, y: hr.top + head + 6 - br.top, w: window.innerWidth - gut * 2, h: hr.height - head - 12 },
    });
  }

  /** @param {(v: number) => string} ramp */
  function buildEconTable(ramp) {
    const tb = $('[data-econ-table]');
    if (!tb) return;
    const geo = W.JASNO_GEO.frames.country.regions;
    const rows = geo.map((/** @type {any} */ r) => ({ name: r.name, v: REGIONS[r.id][0], d: REGIONS[r.id][1] }))
      .sort((/** @type {any} */ a, /** @type {any} */ b) => b.v - a.v || a.name.localeCompare(b.name, 'sl'));
    tb.innerHTML = rows.map((/** @type {any} */ r) => {
      const cls = r.d > 0 ? 'up' : r.d < 0 ? 'down' : 'flat';
      const icon = r.d > 0 ? '<svg class="trend-icon" aria-hidden="true"><use href="#i-up"/></svg>' : r.d < 0 ? '<svg class="trend-icon" aria-hidden="true"><use href="#i-down"/></svg>' : '';
      const sr = r.d > 0 ? `zvišanje za ${r.d}` : r.d < 0 ? `znižanje za ${-r.d}` : 'brez spremembe';
      const vis = r.d === 0 ? '±0' : String(Math.abs(r.d));
      return `<tr><td><span class="econ__reg"><span class="econ__sw" style="background:${ramp(r.v)}" aria-hidden="true"></span>${r.name}</span></td><td>${r.v}</td><td><span class="trend trend--${cls}">${icon}<span aria-hidden="true">${vis}</span><span class="sr-only">${sr}</span></span></td></tr>`;
    }).join('');
  }

  /* ================================================================ FRONTS */
  /** @param {HTMLElement} el */
  function buildFront(el) {
    const type = el.dataset.front;
    const svg = $('[data-front-svg]', el);
    const cap = $('.front__caption', el);
    const draw = () => {
      const w = svg.clientWidth, h = svg.clientHeight;
      if (!w || !h) return;
      const mobile = mqMobile.matches;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const base = type === 'cold' ? (mobile ? h * 0.58 : h * 0.6) : h * 0.5;
      const A = Math.min(10, h * 0.06);
      const lam = Math.max(1100, w * 0.85);
      /** @param {number} x */
      const fy = (x) => base + A * Math.sin((x / lam) * Math.PI * 2 + 0.9) + A * 0.35 * Math.sin((x / lam) * Math.PI * 5.2 + 0.2);
      /** @type {number[][]} */ const pts = [];
      for (let x = 0; x <= w + 4; x += 4) pts.push([x, fy(x)]);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      /** @param {number} s */
      const at = (s) => {
        let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
        const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
        const x = lerp(pts[i - 1][0], pts[i][0], t), y = lerp(pts[i - 1][1], pts[i][1], t);
        const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], len = Math.hypot(dx, dy) || 1;
        return { x, y, tx: dx / len, ty: dy / len };
      };
      let d = '';
      const total = cum[cum.length - 1];
      for (let s = 24; s < total - 8; s += 48) {
        const p = at(s), nx = -p.ty, ny = p.tx, b = 8;
        if (type === 'cold') {
          d += `M${(p.x - p.tx * b).toFixed(2)} ${(p.y - p.ty * b).toFixed(2)}L${(p.x + p.tx * b).toFixed(2)} ${(p.y + p.ty * b).toFixed(2)}L${(p.x + nx * 11).toFixed(2)} ${(p.y + ny * 11).toFixed(2)}Z`;
        } else {
          d += `M${(p.x - p.tx * b).toFixed(2)} ${(p.y - p.ty * b).toFixed(2)}A${b} ${b} 0 0 0 ${(p.x + p.tx * b).toFixed(2)} ${(p.y + p.ty * b).toFixed(2)}Z`;
        }
      }
      svg.innerHTML = `<path class="fline" d="${smoothPath(pts.filter((_, i) => i % 3 === 0))}"/><path class="fmark" d="${d}"/>`;
      // caption sits just above the line, at the left gutter
      const capLeft = cap.getBoundingClientRect().left - svg.getBoundingClientRect().left;
      const ly = fy(Math.max(0, capLeft + 60));
      if (!(mobile && type === 'cold')) cap.style.top = (ly - 40).toFixed(1) + 'px';
    };
    onResize(el, draw);
  }

  /* ======================================================= H1 UNDERLINE */
  function buildUnderline() {
    const svg = $('[data-front-underline]');
    if (!svg) return;
    const word = svg.parentElement;
    const draw = () => {
      const fs = parseFloat(getComputedStyle(word).fontSize);
      const w = svg.clientWidth, h = svg.clientHeight;
      if (!w || !h) return;
      // place the svg just under the baseline
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      word.insertBefore(probe, svg);
      const baseline = probe.offsetTop;
      probe.remove();
      svg.style.top = (baseline + fs * 0.075).toFixed(1) + 'px';
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const sw = Math.max(1.6, fs * 0.03);
      const y0 = sw;
      const r = rng(7);
      /** @type {number[][]} */ const pts = [];
      const n = 9;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push([lerp(sw, w - sw, t), y0 + Math.sin(t * Math.PI * 1.6 + 0.4) * fs * 0.012 + (r() - 0.5) * fs * 0.008 + t * fs * 0.006]);
      }
      const dPath = smoothPath(pts);
      const tmp = svgEl('path', { d: dPath });
      svg.innerHTML = '';
      svg.appendChild(tmp);
      const L = /** @type {SVGPathElement} */ (/** @type {unknown} */ (tmp)).getTotalLength();
      const gap = fs * 0.36, b = fs * 0.06, th = fs * 0.085;
      let tris = '';
      for (let s = gap * 0.55; s < L - gap * 0.3; s += gap) {
        const p = /** @type {SVGPathElement} */ (/** @type {unknown} */ (tmp)).getPointAtLength(s);
        const q = /** @type {SVGPathElement} */ (/** @type {unknown} */ (tmp)).getPointAtLength(Math.min(L, s + 1));
        const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1, tx = dx / len, ty = dy / len, nx = -ty, ny = tx;
        tris += `<path class="tri" d="M${(p.x - tx * b).toFixed(2)} ${(p.y - ty * b + sw * 0.3).toFixed(2)}L${(p.x + tx * b).toFixed(2)} ${(p.y + ty * b + sw * 0.3).toFixed(2)}L${(p.x + nx * th).toFixed(2)} ${(p.y + ny * th + sw * 0.3).toFixed(2)}Z"/>`;
      }
      svg.innerHTML = `<path class="uline" d="${dPath}" stroke-width="${sw.toFixed(2)}" pathLength="1"/>${tris}`;
    };
    onResize(word, draw);
  }

  /* ======================================================== INVOICE CHART */
  function buildInvoiceChart() {
    const box = $('[data-invoice-chart]');
    if (!box) return;
    const VW = 640, VH = 380;
    const x0 = 58, x1 = 528, yT = 26, yB = 290, pMax = 100, pMin = 76;
    /** @param {number} d */ const X = (d) => x0 + (d / 60) * (x1 - x0);
    /** @param {number} p */ const Y = (p) => yT + ((pMax - p) / (pMax - pMin)) * (yB - yT);
    /** @param {number} d */ const risky = (d) => 99 - 18 * Math.pow(d / 60, 1.5);
    const rk = [];
    for (let d = 0; d <= 60; d += 2) rk.push([X(d), Y(risky(d))]);
    const rkPath = smoothPath(rk);
    let grid = '', ticks = '';
    for (const p of [100, 95, 90, 85, 80]) grid += `<line class="ic-grid" x1="${x0}" x2="${x1}" y1="${Y(p)}" y2="${Y(p)}"/>`;
    for (let d = 0; d <= 60; d++) {
      const big = d % 10 === 0;
      ticks += `<line class="ic-tick" x1="${X(d)}" x2="${X(d)}" y1="${yB}" y2="${yB + (big ? 9 : 4)}"${big ? ' style="stroke:#0F1720"' : ''}/>`;
    }
    const area = `${rkPath}L${X(60)} ${yB}L${X(0)} ${yB}Z`;
    const cone = (() => {
      const up = [], dn = [];
      for (let d = 0; d <= 60; d += 2) { const s = 2.4 * Math.pow(d / 60, 1.2); up.push([X(d), Y(risky(d) + s)]); dn.push([X(d), Y(risky(d) - s)]); }
      return smoothPath(up) + 'L' + dn.reverse().map((p) => p.join(' ')).join('L') + 'Z';
    })();
    box.innerHTML = `
      <svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
        <defs><linearGradient id="ic-band-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F47C20" stop-opacity=".26"/><stop offset="1" stop-color="#F47C20" stop-opacity=".04"/></linearGradient></defs>
        ${grid}
        <path class="ic-band" d="${area}"/>
        <path class="ic-cone" d="${cone}"/>
        <line class="ic-axis" x1="${x0}" x2="${x1}" y1="${yB}" y2="${yB}"/>
        ${ticks}
        <line x1="${X(60)}" x2="${X(60)}" y1="${yT - 6}" y2="${yB}" stroke="#0F1720" stroke-width="1" stroke-dasharray="2 4"/>
        <path class="ic-risky" d="${rkPath}" pathLength="1"/>
        <line class="ic-safe" x1="${X(0)}" x2="${X(60)}" y1="${Y(99.6)}" y2="${Y(99.6)}" pathLength="1"/>
        <circle cx="${X(60)}" cy="${Y(99.6)}" r="4" fill="#0F1720"/>
        <circle cx="${X(60)}" cy="${Y(81)}" r="4.5" fill="#fff" stroke="#F47C20" stroke-width="2"/>
        <circle cx="${X(0)}" cy="${Y(99)}" r="3.5" fill="#fff" stroke="#0F1720" stroke-width="1.5"/>
      </svg>`;
    /** @param {number} x @param {number} y */
    const pos = (x, y) => `left:${((x / VW) * 100).toFixed(2)}%;top:${((y / VH) * 100).toFixed(2)}%`;
    let labels = '';
    for (const p of [100, 90, 80]) labels += `<span class="ic-lbl ic-lbl--l" style="${pos(0, Y(p))}">${p} %</span>`;
    for (let d = 0; d <= 60; d += 10) labels += `<span class="ic-lbl" style="${pos(X(d), yB + 24)}">${d}</span>`;
    labels += `<span class="ic-flag ic-flag--start" style="${pos(X(0), yB + 40)}">Izdaja računa</span>`;
    labels += `<span class="ic-flag ic-flag--end" style="${pos(X(60), yB + 40)}">Rok plačila</span>`;
    labels += `<span class="ic-lbl" style="${pos(X(30), yB + 54)};color:#4B5967">dnevi</span>`;
    labels += `<span class="ic-val" style="${pos(X(60), Y(99.6) - 2)}">99,6&nbsp;%<small>zanesljiv kupec</small></span>`;
    labels += `<span class="ic-val ic-val--o" style="${pos(X(60), Y(81) + 4)}">81&nbsp;%<small>tvegan kupec</small></span>`;
    labels += `<span class="ic-lbl" style="${pos(X(33), Y(84.5))};color:#9C4A0A">verjetnost plačila</span>`;
    box.insertAdjacentHTML('beforeend', labels);
  }

  /* =========================================================== LAYER VIZ */
  function buildLayerViz() {
    $$('[data-viz]').forEach((/** @type {HTMLElement} */ box) => {
      const kind = box.dataset.viz;
      const draw = () => {
        const w = box.clientWidth, h = box.clientHeight;
        if (!w || !h) return;
        let s = `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">`;
        if (kind === 'climate') {
          const years = ['2021', '2022', '2023', '2024', '2025'], vals = [0.4, 0.48, 0.57, 0.7, 0.88];
          const base = h - 24, top = 18, slot = w / 5, bw = Math.min(slot * 0.58, 92);
          for (let i = 0; i < 5; i++) {
            const x = slot * i + (slot - bw) / 2, bh = (base - top) * vals[i];
            s += `<rect class="vz-col${i === 4 ? ' vz-col--last' : ''}" x="${x.toFixed(1)}" y="${(base - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2"/>`;
            s += `<text class="vz-lbl" x="${(x + bw / 2).toFixed(1)}" y="${h - 4}" text-anchor="middle">${years[i]}</text>`;
          }
          const tx = slot * 4 + slot / 2, ty = base - (base - top) * vals[4];
          s += `<line class="vz-guide" x1="${slot / 2}" x2="${tx}" y1="${(base - (base - top) * vals[0]).toFixed(1)}" y2="${ty.toFixed(1)}"/>`;
          s += `<line class="vz-base" x1="0" x2="${w}" y1="${base}" y2="${base}"/>`;
          s += `<text class="vz-lbl" x="0" y="10">kapital · letna poročila</text>`;
        } else if (kind === 'weather') {
          const base = h - 30, r = rng(11);
          const days = ['sre', 'čet', 'pet', 'sob', 'ned', 'pon', 'tor'];
          const dens = [0.3, 0.45, 1, 0.2, 0.15, 0.7, 0.9];
          for (let i = 0; i < 7; i++) {
            const cx = (w / 7) * (i + 0.5);
            const n = Math.round(4 + dens[i] * 16);
            for (let k = 0; k < n; k++) {
              const x = cx + (r() - 0.5) * (w / 7) * 0.9, y = 14 + r() * (base - 46);
              const len = 8 + r() * 10;
              s += `<line class="vz-rain" x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x - len * 0.32).toFixed(1)}" y2="${(y + len).toFixed(1)}"/>`;
            }
            s += `<line class="vz-base" x1="${cx}" x2="${cx}" y1="${base}" y2="${base + 5}"/>`;
            s += `<text class="vz-lbl" x="${cx}" y="${h - 6}" text-anchor="middle">${days[i]}</text>`;
          }
          s += `<line class="vz-base" x1="0" x2="${w}" y1="${base}" y2="${base}"/>`;
          const ev = [
            { d: 2, t: 'blokada TRR', c: 'vz-ev--r', y: 20 },
            { d: 5, t: 'izvršba', c: 'vz-ev--o', y: 44 },
            { d: 6, t: 'FURS', c: 'vz-ev--o', y: 16 },
            { d: 0, t: 'nov direktor', c: '', y: 50 },
          ];
          for (const e of ev) {
            const x = (w / 7) * (e.d + 0.5);
            s += `<line class="vz-evline" x1="${x}" x2="${x}" y1="${e.y + 6}" y2="${base}"/>`;
            s += `<circle class="vz-ev ${e.c}" cx="${x}" cy="${base}" r="4.5"/>`;
            s += `<text class="vz-lbl" x="${x + (e.d === 6 ? -6 : 6)}" y="${e.y + 3}" text-anchor="${e.d === 6 ? 'end' : 'start'}" style="fill:#0F1720">${e.t}</text>`;
          }
        } else {
          const n = 9, r = rng(5), cy = h / 2;
          for (let i = 0; i < n; i++) {
            const y0 = 14 + ((h - 28) * i) / (n - 1);
            const A = 6 + r() * 7, f = 1.1 + r() * 0.8, ph = r() * 6;
            /** @type {number[][]} */ const pts = [];
            const end = w - 14 - Math.abs(i - (n - 1) / 2) * 9;
            for (let x = 0; x <= end; x += 10) {
              const t = x / end;
              const yy = lerp(y0 + A * Math.sin(t * Math.PI * 2 * f + ph) * (1 - t * 0.7), cy + (y0 - cy) * 0.5, t * t);
              pts.push([x, yy]);
            }
            const flow = i % 2 === 0 && !CAPTURE && !REDUCED ? ' vz-stream--flow' : '';
            s += `<path class="vz-stream${flow}" d="${smoothPath(pts)}"/>`;
            const a = pts[pts.length - 1], b = pts[pts.length - 2];
            const ang = Math.atan2(a[1] - b[1], a[0] - b[0]);
            const ax = a[0] + Math.cos(ang) * 6.5, ay = a[1] + Math.sin(ang) * 6.5;
            s += `<path class="vz-arrow" d="M${ax.toFixed(1)} ${ay.toFixed(1)}L${(a[0] + Math.cos(ang + 2.4) * 4).toFixed(1)} ${(a[1] + Math.sin(ang + 2.4) * 4).toFixed(1)}L${(a[0] + Math.cos(ang - 2.4) * 4).toFixed(1)} ${(a[1] + Math.sin(ang - 2.4) * 4).toFixed(1)}Z"/>`;
          }
          s += `<text class="vz-lbl" x="0" y="8">4,2 mio plačilnih izkušenj</text>`;
        }
        box.innerHTML = s + '</svg>';
      };
      onResize(box, draw);
    });
  }

  function buildConverge() {
    const sec = $('[data-xsection]');
    const svg = $('[data-converge]');
    const out = $('.output', sec);
    if (!sec || !svg || !out) return;
    const draw = () => {
      if (mqMobile.matches) { svg.innerHTML = ''; return; }
      const sr = sec.getBoundingClientRect();
      const or = out.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${sr.width} ${sr.height}`);
      let s = '';
      $$('.band__viz', sec).forEach((/** @type {HTMLElement} */ v, i) => {
        const r = v.getBoundingClientRect();
        const x0 = r.right - sr.left + 10, y0 = r.top - sr.top + r.height / 2;
        const x1 = or.left - sr.left - 2, y1 = or.top - sr.top + or.height * (0.3 + i * 0.2);
        const mx = (x0 + x1) / 2;
        s += `<path d="M${x0} ${y0}C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}"/><circle cx="${x0}" cy="${y0}" r="3"/><circle cx="${x1}" cy="${y1}" r="3"/>`;
      });
      svg.innerHTML = s;
    };
    onResize(sec, draw);
    window.addEventListener('load', draw);
  }

  /* ============================================================ CADENCE */
  function buildCadence() {
    const box = $('[data-cadence]');
    if (!box) return;
    const r = rng(23);
    let d = '', warn = '';
    for (let i = 0; i < 365; i++) {
      const last = i >= 361;
      let hgt = 7 + Math.pow(r(), 3) * 16;
      if (i % 91 === 40) hgt = 26;
      if (last) hgt = 30 + (i - 361) * 2;
      const seg = `M${i + 0.5} 40V${(40 - hgt).toFixed(1)}`;
      if (last) warn += seg; else d += seg;
    }
    box.innerHTML = `<svg viewBox="0 0 365 40" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="cd-tick" d="${d}" vector-effect="non-scaling-stroke"/><path class="cd-tick cd-tick--warn" d="${warn}" vector-effect="non-scaling-stroke"/></svg>`;
  }

  /* ======================================================= QUOTE ISOBARS */
  function buildQuoteIsobars() {
    const svg = $('[data-quote-isobars]');
    if (!svg) return;
    const Wd = 1600, Hd = 900, cx = 520, cy = 330;
    svg.setAttribute('viewBox', `0 0 ${Wd} ${Hd}`);
    let s = '';
    for (let k = 0; k < 13; k++) {
      const R = 60 + k * 52;
      /** @type {number[][]} */ const pts = [];
      for (let a = 0; a <= 64; a++) {
        const th = (a / 64) * Math.PI * 2;
        const rr = R * (1 + 0.16 * Math.sin(2 * th + 0.6 + k * 0.05) + 0.07 * Math.sin(3 * th - 0.4 + k * 0.11)) * (1 + k * 0.012);
        pts.push([cx + Math.cos(th) * rr * 1.45, cy + Math.sin(th) * rr * 0.8]);
      }
      s += `<path class="${k % 5 === 0 ? 'major' : ''}" d="${smoothPath(pts)}Z"/>`;
    }
    svg.innerHTML = s;
  }

  /* ================================================================= SUN */
  function buildSun() {
    const svg = $('[data-sun]');
    if (!svg) return;
    const draw = () => {
      const w = svg.clientWidth, h = svg.clientHeight;
      if (!w || !h) return;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const cx = w / 2, cy = h, R = Math.min(w * 0.12, h * 0.42, 150);
      let rays = '';
      for (let i = 0; i <= 16; i++) {
        const a = Math.PI + (i / 16) * Math.PI;
        const r0 = R + 18, r1 = R + (i % 2 === 0 ? 58 : 34);
        rays += `<line class="sun-ray" x1="${(cx + Math.cos(a) * r0).toFixed(1)}" y1="${(cy + Math.sin(a) * r0).toFixed(1)}" x2="${(cx + Math.cos(a) * r1).toFixed(1)}" y2="${(cy + Math.sin(a) * r1).toFixed(1)}"/>`;
      }
      svg.innerHTML = `<defs><radialGradient id="sun-glow"><stop offset="0" stop-color="#F7DCC8" stop-opacity=".95"/><stop offset=".55" stop-color="#F7DCC8" stop-opacity=".35"/><stop offset="1" stop-color="#F7DCC8" stop-opacity="0"/></radialGradient>
        <linearGradient id="horizon-grad" gradientUnits="userSpaceOnUse" x1="0" x2="${w}" y1="0" y2="0"><stop offset="0" stop-color="#0F1720" stop-opacity="0"/><stop offset=".25" stop-color="#0F1720" stop-opacity=".45"/><stop offset=".75" stop-color="#0F1720" stop-opacity=".45"/><stop offset="1" stop-color="#0F1720" stop-opacity="0"/></linearGradient></defs>
        <circle class="sun-glow" cx="${cx}" cy="${cy}" r="${R * 2.6}"/>
        <path class="sun-arc" d="M${cx - R} ${cy}A${R} ${R} 0 0 1 ${cx + R} ${cy}"/>
        <g class="sun-rays">${rays}</g>
        <line class="sun-horizon" x1="0" x2="${w}" y1="${cy - 0.5}" y2="${cy - 0.5}"/>`;
    };
    onResize(svg, draw);
  }

  /* ============================================================== FIELDS */
  /** @type {any[]} */ const fields = [];
  const T0 = 23.4;

  function initFields() {
    const IB = W.NapovedIsobars;
    if (!IB) return;
    const mobile = mqMobile.matches;
    const ink = IB.rgb(0x0F1720);

    // ---- hero
    const hc = $('[data-field="hero"]');
    if (hc && heroMap) {
      const labelsLayer = $('[data-isolabels]');
      const ANG = [-0.95, -0.55, -1.35, -0.15, -1.8, 0.3, -2.3, 0.8, -2.75, 1.3, 3.1, 1.8, 2.6, 2.2];
      /** @type {{ value: number, from: string, angles: number[], angle: number, el: HTMLElement, w: number }[]} */
      const specs = (mobile
        ? [{ value: 80, from: 'V' }, { value: 50, from: 'N' }]
        : [{ value: 80, from: 'V' }, { value: 70, from: 'V' }, { value: 40, from: 'N' }, { value: 50, from: 'N' }]
      ).map((s) => {
        const el = document.createElement('span');
        el.className = 'iso-label';
        el.textContent = String(s.value);
        labelsLayer.appendChild(el);
        return Object.assign(s, { el, w: 0, angles: ANG, angle: ANG[0] });
      });
      /** @type {any} */ let centres = { V: { x: 0, y: 0 }, N: { x: 0, y: 0 } };
      const field = new IB.IsobarField(hc, {
        base: 62, spacing: 2, line: ink, alphaMinor: 0.12, alphaMajor: 0.22, widthMinor: 1, widthMajor: 1.5,
        tintLow: IB.rgb(0x8EA6C0), tintHigh: IB.rgb(0xF7D3BA), tintAlpha: 0.22, tintRange: 26,
        noise: mobile ? [1.5, 0.35, 3.4, 7.5] : [1.7, 0.4, 4.6, 9.5],
        pointer: { amp: mobile ? 12 : 15, sigma: mobile ? 0.13 : 0.075 },
        preserve: CAPTURE,
        onFrame: (/** @type {any} */ f) => {
          const Wd = f.w;
          /** @type {any[]} */ const gaps = [];
          for (const s of specs) {
            const c = centres[s.from];
            const p = f.crossing(c.x, c.y, s.angle, s.value, 0.5);
            if (!p) { s.el.style.opacity = '0'; continue; }
            if (!s.w) s.w = s.el.offsetWidth || 14;
            s.el.style.opacity = '1';
            s.el.style.transform = `translate(${(p.x * Wd).toFixed(1)}px, ${(p.y * Wd).toFixed(1)}px) translate(-50%, -50%)`;
            gaps.push({ x: p.x, y: p.y, rx: (s.w / 2 + 6) / Wd, ry: 8 / Wd });
          }
          f.setGaps(gaps);
        },
      });
      /** Pick, once per layout, the ray along which each isobar label stays clear of the border and other labels. */
      const chooseAngles = () => {
        const cr = field.canvas.getBoundingClientRect(), box = $('[data-map="hero"]'), br = box.getBoundingClientRect();
        const Wd = cr.width;
        const rects = [...$$('.station__label, .station__dot, .pcentre, .map-country', $('[data-map="hero"]')), $('.hero__title'), $('.hero__sub'), $('.hero__search'), $('[data-fcard]'), $('.site-header__inner')]
          .filter(Boolean).map((/** @type {Element} */ e) => e.getBoundingClientRect());
        /** @type {{x: number, y: number}[]} */ const used = [];
        for (const s of specs) {
          const c = centres[s.from];
          let best = s.angles[0], bestScore = Infinity;
          s.angles.forEach((a, k) => {
            const p = field.crossing(c.x, c.y, a, s.value, 0.5);
            if (!p) return;
            const vx = cr.left + p.x * Wd, vy = cr.top + p.y * Wd;
            let score = k * 3;
            if (vx < 16 || vx > window.innerWidth - 16 || vy < cr.top + 70 || vy > cr.bottom - 20) score += 500;
            if (W.NapovedMaps.borderDistance(box, vx - br.left, vy - br.top) < 14) score += 250;
            for (const r of rects) if (vx > r.left - 16 && vx < r.right + 16 && vy > r.top - 12 && vy < r.bottom + 12) score += 300;
            for (const u of used) if (Math.hypot(u.x - vx, u.y - vy) < 34) score += 300;
            if (score < bestScore) { bestScore = score; best = a; }
          });
          s.angle = best;
          const p = field.crossing(c.x, c.y, best, s.value, 0.5);
          if (p) used.push({ x: cr.left + p.x * Wd, y: cr.top + p.y * Wd });
        }
      };
      const layout = () => {
        field.resize();
        const cr = field.canvas.getBoundingClientRect();
        const box = $('[data-map="hero"]').getBoundingClientRect();
        const Wd = cr.width, H = cr.height / Wd, m = box.width / Wd;
        /** @param {{x: number, y: number}} p */
        const toQ = (p) => ({ x: (box.left - cr.left + (p.x / 1000) * box.width) / Wd, y: (box.top - cr.top + (p.y / 650) * box.height) / Wd });
        centres = { V: toQ(heroMap.V), N: toQ(heroMap.N) };
        const sys = [
          { x: centres.V.x, y: centres.V.y, amp: 25, sigma: 0.165 * m, orbit: 0.002, speed: 0.1, phase: 0.4 },
          { x: centres.N.x, y: centres.N.y, amp: -28, sigma: 0.115 * m, orbit: 0.002, speed: 0.12, phase: 2.1 },
        ];
        if (mobile) {
          sys.push({ x: 0.15, y: 0.32, amp: 6, sigma: 0.32, orbit: 0.03, speed: 0.1, phase: 1.0 });
          sys.push({ x: 0.92, y: H * 0.86, amp: -7, sigma: 0.34, orbit: 0.03, speed: 0.09, phase: 3.3 });
          sys.push({ x: 0.2, y: H * 0.9, amp: 5, sigma: 0.28, orbit: 0.02, speed: 0.11, phase: 5.1 });
        } else {
          sys.push({ x: 0.17, y: 0.1, amp: 7, sigma: 0.17, orbit: 0.025, speed: 0.105, phase: 1.0 });
          sys.push({ x: 0.06, y: H * 0.86, amp: -6, sigma: 0.14, orbit: 0.02, speed: 0.1, phase: 3.3 });
          sys.push({ x: 0.97, y: H * 0.8, amp: -7, sigma: 0.1, orbit: 0.02, speed: 0.11, phase: 4.2 });
          sys.push({ x: 0.5, y: H * 1.04, amp: 6, sigma: 0.15, orbit: 0.02, speed: 0.09, phase: 5.6 });
        }
        field.setSystems(sys);
        // calmer lines behind the headline and copy
        const t = $('.hero__title').getBoundingClientRect(), sb = $('.hero__search').getBoundingClientRect();
        const pad = 14;
        if (mobile) field.setFade({ x0: (t.left - cr.left - pad) / Wd, y0: (t.top - cr.top - pad) / Wd, x1: (t.right - cr.left + pad) / Wd, y1: (t.bottom - cr.top + pad) / Wd, min: 0.55, soft: 0.03 });
        else field.setFade({ x0: (t.left - cr.left - pad) / Wd, y0: (t.top - cr.top - pad) / Wd, x1: (Math.max(sb.right, t.left + t.width * 0.62) - cr.left + pad) / Wd, y1: (sb.bottom - cr.top + pad) / Wd, min: 0.5, soft: 0.035 });
        return { Wd, H };
      };
      let geom = layout();
      fields.push(field);

      if (CAPTURE) {
        // the pointer low sits between the card and the storm centre, so the bend reads as part of the system
        const px = mobile ? [0.74, 0.66] : [0.84, 0.47];
        field.setPointer(px[0], px[1] * geom.H, mobile ? 0.85 : 1, true);
        field.t = T0;
        chooseAngles();
        field.render(T0);
      } else if (REDUCED) {
        field.t = T0;
        chooseAngles();
        field.render(T0);
      } else {
        field.t = T0;
        field.setPointer(0.84, 0.47 * geom.H, 0, true);
        chooseAngles();
        const hero = $('[data-hero]');
        /** @param {number} cx @param {number} cy @param {number} amt */
        const aim = (cx, cy, amt) => {
          const r = field.canvas.getBoundingClientRect();
          field.setPointer((cx - r.left) / r.width, (cy - r.top) / r.width, amt);
        };
        hero.addEventListener('pointermove', (/** @type {PointerEvent} */ e) => { if (e.pointerType !== 'touch') aim(e.clientX, e.clientY, 1); });
        hero.addEventListener('pointerleave', () => field.setPointer(field.ptr.tx, field.ptr.ty, 0));
        hero.addEventListener('touchstart', (/** @type {TouchEvent} */ e) => { const t = e.touches[0]; aim(t.clientX, t.clientY, 1); }, { passive: true });
        hero.addEventListener('touchmove', (/** @type {TouchEvent} */ e) => { const t = e.touches[0]; aim(t.clientX, t.clientY, 1); }, { passive: true });
        hero.addEventListener('touchend', () => field.setPointer(field.ptr.tx, field.ptr.ty, 0), { passive: true });
        field.start();
      }
      onResize($('[data-hero]'), () => { geom = layout(); chooseAngles(); if (!field.running) field.render(); });
    }

    // ---- storm (dark)
    const sc = $('[data-field="storm"]');
    if (sc && radarMap) {
      const field = new IB.IsobarField(sc, {
        base: 60, spacing: 2, line: [1, 1, 1], alphaMinor: 0.055, alphaMajor: 0.11, widthMinor: 1, widthMajor: 1.4,
        noise: [2.2, 0.8, 5.0, 11.0], pointer: { amp: 12, sigma: 0.07 }, preserve: CAPTURE,
      });
      const layout = () => {
        field.resize();
        const cr = field.canvas.getBoundingClientRect(), box = $('[data-map="radar"]').getBoundingClientRect();
        const Wd = cr.width, H = cr.height / Wd, m = box.width / Wd;
        /** @param {number} x @param {number} y */
        const toQ = (x, y) => ({ x: (box.left - cr.left + (x / 1000) * box.width) / Wd, y: (box.top - cr.top + (y / 650) * box.height) / Wd });
        const N = toQ(W.NapovedMaps.CITY.Maribor.x, W.NapovedMaps.CITY.Maribor.y), V = toQ(268, 232);
        field.setSystems([
          { x: N.x, y: N.y, amp: -24, sigma: 0.12 * m, orbit: 0.004, speed: 0.1, phase: 1 },
          { x: V.x, y: V.y, amp: 16, sigma: 0.2 * m, orbit: 0.004, speed: 0.1, phase: 2 },
          { x: 0.12, y: 0.12, amp: 7, sigma: 0.2, orbit: 0.02, speed: 0.1, phase: 3 },
          { x: 0.3, y: H * 0.8, amp: -6, sigma: 0.18, orbit: 0.02, speed: 0.1, phase: 4 },
          { x: 0.98, y: H * 0.15, amp: 6, sigma: 0.14, orbit: 0.02, speed: 0.1, phase: 5 },
        ]);
      };
      onResize($('#opozorila'), () => { layout(); if (!field.running) field.render(); });
      fields.push(field);
      if (CAPTURE || REDUCED) field.render(T0 + 7);
      else {
        field.t = T0 + 7;
        const sec = $('#opozorila');
        sec.addEventListener('pointermove', (/** @type {PointerEvent} */ e) => {
          if (e.pointerType === 'touch') return;
          const r = field.canvas.getBoundingClientRect();
          field.setPointer((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.width, 1);
        });
        sec.addEventListener('pointerleave', () => field.setPointer(field.ptr.tx, field.ptr.ty, 0));
        field.start();
      }
    }

    // ---- final CTA (dawn, anticyclone around the rising sun)
    const cc = $('[data-field="cta"]');
    if (cc) {
      const field = new IB.IsobarField(cc, {
        base: 60, spacing: 2, line: ink, alphaMinor: 0.09, alphaMajor: 0.17, widthMinor: 1, widthMajor: 1.5,
        tintHigh: IB.rgb(0xF7D3BA), tintLow: IB.rgb(0xB9CDDF), tintAlpha: 0.18, tintRange: 30,
        noise: mobile ? [1.6, 0.6, 4.0, 9.0] : [1.8, 0.7, 5.0, 11.0], pointer: { amp: 12, sigma: 0.08 }, preserve: CAPTURE,
      });
      const layout = () => {
        field.resize();
        const cr = field.canvas.getBoundingClientRect();
        const Wd = cr.width, H = cr.height / Wd;
        field.setSystems([
          { x: 0.5, y: H * 1.0, amp: 30, sigma: mobile ? 0.55 : 0.26, orbit: 0.004, speed: 0.1, phase: 0 },
          { x: 0.06, y: 0.06, amp: -9, sigma: mobile ? 0.3 : 0.15, orbit: 0.02, speed: 0.1, phase: 1 },
          { x: 0.96, y: H * 0.3, amp: -7, sigma: mobile ? 0.3 : 0.14, orbit: 0.02, speed: 0.1, phase: 2 },
          { x: 0.22, y: H * 0.72, amp: -4, sigma: 0.12, orbit: 0.02, speed: 0.1, phase: 3 },
        ]);
        const t = $('.cta__title').getBoundingClientRect();
        field.setFade({ x0: (t.left - cr.left) / Wd, y0: (t.top - cr.top) / Wd, x1: (t.right - cr.left) / Wd, y1: (t.bottom - cr.top) / Wd, min: 0.6, soft: 0.04 });
      };
      onResize($('#zacnite'), () => { layout(); if (!field.running) field.render(); });
      fields.push(field);
      if (CAPTURE || REDUCED) field.render(T0 + 3);
      else {
        field.t = T0 + 3;
        const sec = $('#zacnite');
        sec.addEventListener('pointermove', (/** @type {PointerEvent} */ e) => {
          if (e.pointerType === 'touch') return;
          const r = field.canvas.getBoundingClientRect();
          field.setPointer((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.width, 1);
        });
        sec.addEventListener('pointerleave', () => field.setPointer(field.ptr.tx, field.ptr.ty, 0));
        field.start();
      }
    }
  }

  /* ============================================================= PRODUCT */
  /** @param {number} n @param {number} dec */
  const pct = (n, dec) => fmt(n, dec) + ' %';

  /** @param {Company} c */
  function renderCurve(c) {
    const svg = $('[data-curve]');
    if (!svg || !c.months) return;
    const w = svg.clientWidth || 900, h = svg.clientHeight || 100;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const max = c.months[11] * 1.08;
    const pts = c.months.map((v, i) => [((i + 0.5) / 12) * w, h - 8 - (v / max) * (h - 18)]);
    const line = smoothPath(pts);
    const area = `${line}L${pts[11][0]} ${h}L${pts[0][0]} ${h}Z`;
    const stormCol = c.key === 'kovac' ? '#E2412E' : '#0F1720';
    svg.innerHTML = `<defs><linearGradient id="fc-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${stormCol}" stop-opacity=".14"/><stop offset="1" stop-color="${stormCol}" stop-opacity="0"/></linearGradient></defs>
      <line x1="0" x2="${w}" y1="${h - 0.5}" y2="${h - 0.5}" stroke="rgba(15,23,32,.12)"/>
      <path class="fc-area" d="${area}"/><path class="fc-line" d="${line}" style="stroke:${stormCol}"/>
      ${pts.map((p, i) => `<circle class="fc-pt" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === 11 ? 4.5 : 3}" style="${i === 11 ? `fill:${stormCol};` : ''}stroke:${stormCol}"/>`).join('')}`;
  }

  /** @param {string} key @param {boolean} [instant] */
  function renderCompany(key, instant) {
    const c = COMPANIES[key];
    const panel = $('[data-report-panel]');
    if (!c || !panel) return;
    const apply = () => {
      /** @param {string} f @param {string} v */
      const set = (f, v) => { const el = $(`[data-f="${f}"]`, panel); if (el) el.innerHTML = v; };
      set('name', c.name);
      set('meta', `${c.place} · ${c.sector} · ${/** @type {string} */ (c.ids).split(' · ').map((x) => `<span class="nowrap">${x}</span>`).join(' · ')}`);
      set('state', c.state);
      set('class', `Razred ${c.cls} · ${c.clsName}`);
      set('index', String(c.index));
      set('pd', c.pd.replace(' ', '&nbsp;'));
      set('limit', /** @type {string} */ (c.limit).replace(' ', '&nbsp;'));
      set('term', /** @type {string} */ (c.term));
      $('[data-f="glyph"] use', panel).setAttribute('href', '#g-' + c.glyph);
      const tr = $('[data-f="trend"]', panel);
      tr.classList.toggle('is-down', c.delta < 0);
      tr.classList.toggle('is-flat', c.delta === 0);
      tr.innerHTML = c.delta === 0 ? '<span aria-hidden="true">±0</span><span class="sr-only">Indeks je nespremenjen.</span>'
        : `<svg class="trend-icon" aria-hidden="true"><use href="#i-${c.delta > 0 ? 'up' : 'down'}"/></svg><span aria-hidden="true">${Math.abs(c.delta)}</span><span class="sr-only">Indeks se je ${c.delta > 0 ? 'zvišal' : 'znižal'} za ${Math.abs(c.delta)} ${Math.abs(c.delta) === 1 ? 'točko' : Math.abs(c.delta) === 2 ? 'točki' : Math.abs(c.delta) <= 4 ? 'točke' : 'točk'}.</span>`;
      $('[data-f="advice-box"]', panel).classList.toggle('is-alert', !!c.alert);
      const strip = $('[data-f="strip"]', panel);
      strip.innerHTML = /** @type {number[]} */ (c.months).map((v, i) => {
        const g = /** @type {string} */ (c.glyphs)[i];
        return `<li class="${g === 'e' ? 'is-storm' : ''}"><span class="m">${MONTHS[i]}</span><svg class="glyph" aria-hidden="true"><use href="#g-${g}"/></svg><span class="sr-only">${GLYPH_NAME[g]},</span><span class="v">${pct(v, /** @type {number} */ (c.dec))}</span></li>`;
      }).join('');
      $('[data-f="reasons"]', panel).innerHTML = /** @type {any[]} */ (c.reasons).map((r) =>
        `<li class="why__item ${r[0] === '+' ? 'is-pos' : 'is-neg'}${r[3] ? ' is-severe' : ''}"><span class="why__sign" aria-hidden="true"><svg class="icon"><use href="#i-${r[0] === '+' ? 'plus' : 'minus'}"/></svg></span><span class="why__text"><span class="sr-only">${r[0] === '+' ? 'Pozitivno' : 'Negativno'}: </span>${nb(r[1])}</span><span class="why__bar" aria-hidden="true"><span style="--w: ${r[2]}"></span></span></li>`).join('');
      $('[data-f="events"]', panel).innerHTML = /** @type {any[]} */ (c.events).map((e) =>
        `<li class="${e[3] === 'latest' ? 'is-latest' : e[3] === 'alert' ? 'is-alert' : ''}"><time class="mono" datetime="${e[0]}">${e[1]}</time><span>${nb(e[2])}</span></li>`).join('');
      renderCurve(c);
    };
    if (instant || !ANIM) { apply(); return; }
    panel.classList.add('is-swapping');
    window.setTimeout(() => {
      apply();
      panel.classList.remove('is-swapping');
      gsap.from($$('.forecast12__strip .glyph', panel), { opacity: 0, y: 6, duration: 0.5, stagger: 0.04, ease: 'power3.out' });
      gsap.from($$('.why__bar span', panel), { scaleX: 0, duration: 0.8, stagger: 0.06, ease: 'power3.out' });
      const num = $('[data-f="index"]', panel), o = { v: Math.max(0, c.index - 12) };
      gsap.to(o, { v: c.index, duration: 0.7, ease: 'power2.out', onUpdate: () => { num.textContent = String(Math.round(o.v)); } });
    }, 250);
  }

  function initTabs() {
    const tabs = $$('[role="tab"]');
    const panel = $('[data-report-panel]');
    if (!tabs.length || !panel) return;
    /** @param {HTMLElement} tab @param {boolean} [focus] */
    const select = (tab, focus) => {
      if (tab.getAttribute('aria-selected') === 'true') { if (focus) tab.focus(); return; }
      tabs.forEach((t) => { const on = t === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
      panel.setAttribute('aria-labelledby', tab.id);
      if (focus) tab.focus();
      renderCompany(/** @type {string} */ (tab.dataset.company));
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
        let j = -1;
        if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = tabs.length - 1;
        if (j >= 0) { e.preventDefault(); select(tabs[j], true); }
      });
    });
    renderCompany('hribar', true);
    onResize($('[data-curve]'), () => {
      const sel = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
      renderCurve(COMPANIES[sel ? sel.dataset.company : 'hribar']);
    });
    W.__napovedSelect = (/** @type {string} */ key) => { const t = tabs.find((x) => x.dataset.company === key); if (t) select(t); };
  }

  /* ============================================================== SEARCH */
  function initSearch() {
    const list = Object.values(COMPANIES);
    $$('[data-search]').forEach((/** @type {HTMLFormElement} */ form) => {
      const input = $('input', form), box = $('.search__results', form), status = $('.search__status', form);
      /** @type {Company[]} */ let hits = [];
      let active = -1;
      const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
      /** @param {string} q */
      const find = (q) => {
        const n = norm(q.trim());
        if (!n) return [];
        const digits = n.replace(/\D/g, '');
        return list.filter((c) => norm(c.name).includes(n) || norm(c.place).includes(n) || (digits.length >= 3 && ((c.ms || '').includes(digits) || (c.ds || '').includes(digits))));
      };
      const paint = () => {
        if (!hits.length) {
          box.innerHTML = `<li class="result__empty" role="option" aria-disabled="true" aria-selected="false">Ni zadetkov. Poskusite na primer: Hribar Les, Novak Elektro ali Kovač Gradnje.</li>`;
        } else {
          box.innerHTML = hits.map((c, i) => `<li class="result" id="${input.id}-o${i}" role="option" aria-selected="${i === active}" data-key="${c.key}">
            <svg class="glyph" aria-hidden="true"><use href="#g-${c.glyph}"/></svg>
            <span><span class="result__name">${c.name}</span><span class="result__meta">${c.place} · razred ${c.cls} · ${c.pd}</span></span>
            <span class="result__idx" aria-label="Jasno indeks ${c.index}">${c.index}</span></li>`).join('');
        }
        box.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        if (active >= 0) input.setAttribute('aria-activedescendant', `${input.id}-o${active}`); else input.removeAttribute('aria-activedescendant');
        status.textContent = hits.length ? `${hits.length} ${hits.length === 1 ? 'zadetek' : hits.length === 2 ? 'zadetka' : hits.length <= 4 ? 'zadetki' : 'zadetkov'}` : 'Ni zadetkov.';
      };
      /** @param {Company} c */
      const choose = (c) => {
        input.value = c.name;
        close();
        if (c.tab) {
          if (W.__napovedSelect) W.__napovedSelect(c.key);
          scrollToEl($('#produkt'));
        } else {
          status.textContent = `${c.name}: Jasno indeks ${c.index}, razred ${c.cls}, verjetnost neplačila ${c.pd}. Priporočilo: ${c.limit}, ${c.term}.`;
          box.innerHTML = `<li class="result" role="option" aria-selected="true"><svg class="glyph" aria-hidden="true"><use href="#g-${c.glyph}"/></svg><span><span class="result__name">${c.name} · ${c.state.toLowerCase()}</span><span class="result__meta">Limit ${c.limit} · ${c.term} · verjetnost neplačila ${c.pd}</span></span><span class="result__idx">${c.index}</span></li>`;
          box.hidden = false;
        }
      };
      input.addEventListener('input', () => { hits = find(input.value); active = -1; if (input.value.trim()) paint(); else close(); });
      input.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          if (!hits.length) return;
          e.preventDefault();
          active = e.key === 'ArrowDown' ? (active + 1) % hits.length : (active - 1 + hits.length) % hits.length;
          paint();
        } else if (e.key === 'Escape') { close(); }
      });
      box.addEventListener('mousedown', (/** @type {MouseEvent} */ e) => e.preventDefault());
      box.addEventListener('click', (/** @type {MouseEvent} */ e) => {
        const li = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-key]'));
        if (li) choose(COMPANIES[/** @type {string} */ (li.dataset.key)]);
      });
      input.addEventListener('blur', () => window.setTimeout(close, 120));
      form.addEventListener('submit', (/** @type {SubmitEvent} */ e) => {
        e.preventDefault();
        hits = find(input.value);
        if (active >= 0 && hits[active]) choose(hits[active]);
        else if (hits.length === 1) choose(hits[0]);
        else if (hits.length) { active = 0; paint(); }
        else if (!input.value.trim()) { input.focus(); status.textContent = 'Vpišite ime podjetja, davčno ali matično številko.'; }
        else { paint(); }
      });
    });
  }

  function initSubscribe() {
    const form = $('[data-subscribe]');
    if (!form) return;
    const input = $('input', form), msg = $('.subscribe__msg', form);
    form.addEventListener('submit', (/** @type {SubmitEvent} */ e) => {
      e.preventDefault();
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim());
      input.setAttribute('aria-invalid', String(!ok));
      msg.classList.toggle('is-err', !ok);
      msg.classList.toggle('is-ok', ok);
      msg.textContent = ok ? 'Hvala. Prvo napoved prejmete v torek, 3. novembra 2026.' : 'Vpišite veljaven e-poštni naslov.';
      if (ok) input.value = '';
    });
  }

  /* ========================================================== HEADER/MENU */
  /** @type {any} */ let lenis = null;
  /** @param {Element | null} el */
  function scrollToEl(el) {
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: -8, duration: 1.4 });
    else el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
  }

  function initHeader() {
    const header = $('[data-header]');
    if (!header) return;
    const update = () => header.classList.toggle('is-scrolled', !CAPTURE && window.scrollY > 12);
    update();
    window.addEventListener('scroll', update, { passive: true });
    // in-page anchors
    document.addEventListener('click', (e) => {
      const a = /** @type {HTMLAnchorElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('a[href^="#"]'));
      if (!a) return;
      const id = a.getAttribute('href') || '';
      if (id.length < 2) return;
      const target = document.getElementById(id.slice(1));
      if (!target) return;
      e.preventDefault();
      const key = a.dataset.openCompany;
      if (key && W.__napovedSelect) W.__napovedSelect(key);
      closeMenu();
      scrollToEl(target);
      history.replaceState(null, '', id);
      if (id === '#vsebina') /** @type {HTMLElement} */ (target).focus({ preventScroll: true });
    });
  }

  /** @type {HTMLElement | null} */ let lastFocus = null;
  function closeMenu() {
    const m = $('[data-menu]');
    if (!m || m.hidden) return;
    m.hidden = true;
    $('[data-menu-open]').setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (lenis) lenis.start();
    if (lastFocus) lastFocus.focus();
  }
  function initMenu() {
    const m = $('[data-menu]'), open = $('[data-menu-open]'), close = $('[data-menu-close]');
    if (!m || !open) return;
    open.addEventListener('click', () => {
      lastFocus = open;
      m.hidden = false;
      open.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      if (lenis) lenis.stop();
      const first = $('a', m);
      if (first) first.focus();
    });
    close.addEventListener('click', closeMenu);
    m.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Escape') closeMenu();
      if (e.key === 'Tab') {
        const f = $$('a, button', m).filter((x) => x.offsetParent !== null);
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i === 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
    mqMobile.addEventListener('change', () => { if (!mqMobile.matches) closeMenu(); });
  }

  function initSheet() {
    const card = $('[data-fcard]'), toggle = $('[data-fcard-toggle]');
    if (!card || !toggle) return;
    const set = (/** @type {boolean} */ open) => { card.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open)); };
    toggle.addEventListener('click', () => set(!card.classList.contains('is-open')));
    card.addEventListener('click', (/** @type {MouseEvent} */ e) => {
      if (!mqMobile.matches || card.classList.contains('is-open')) return;
      if (/** @type {HTMLElement} */ (e.target).closest('a, button')) return;
      set(true);
    });
    let y0 = 0;
    card.addEventListener('touchstart', (/** @type {TouchEvent} */ e) => { y0 = e.touches[0].clientY; }, { passive: true });
    card.addEventListener('touchend', (/** @type {TouchEvent} */ e) => {
      const dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dy) > 30) set(dy < 0);
    }, { passive: true });
    mqMobile.addEventListener('change', () => set(false));
  }

  /* =============================================================== CLOCK */
  function initClock() {
    const el = $('[data-clock]');
    if (!el) return;
    if (CAPTURE) { el.textContent = '06.02.14'; el.setAttribute('datetime', '2026-10-06T06:02:14'); return; }
    let f;
    try { f = new Intl.DateTimeFormat('sl-SI', { timeZone: 'Europe/Ljubljana', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); } catch (e) { f = null; }
    const tick = () => {
      const now = new Date();
      const s = f ? f.format(now) : now.toTimeString().slice(0, 8);
      el.textContent = s.replace(/[:\s]/g, (m) => (m === ':' ? '.' : '')).replace(/\.(?=\.)/g, '');
    };
    tick();
    window.setInterval(tick, 1000);
  }

  /* ============================================================== MOTION */
  function initMotion() {
    if (!ANIM) return;
    gsap.registerPlugin(ScrollTrigger);
    if (SplitText) gsap.registerPlugin(SplitText);

    // smooth scroll
    if (Lenis) {
      lenis = new Lenis({ lerp: 0.11, smoothWheel: true, wheelMultiplier: 0.95 });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((/** @type {number} */ t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    }

    // hero intro
    const mobile = mqMobile.matches;
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: () => html.classList.add('intro-done') });
    // the CSS pre-state is translateY(110%); reset GSAP's parsed y so only yPercent animates
    tl.fromTo('.hero__title .line__inner', { y: 0, yPercent: 110 }, { y: 0, yPercent: 0, duration: 1.1, stagger: 0.08 }, 0.1);
    tl.fromTo('.hero__eyebrow', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, 0.05);
    tl.fromTo('.hero__sub', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, 0.35);
    tl.fromTo('.hero__search', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, 0.45);
    tl.fromTo('.hero__micro', { opacity: 0 }, { opacity: 1, duration: 0.8, ease: 'power2.out' }, 0.6);
    tl.fromTo('.hero__strip', { opacity: 0 }, { opacity: 1, duration: 0.9, ease: 'power2.out' }, 0.9);
    if (heroMap) {
      tl.fromTo(heroMap.outline, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut' }, 0.2);
      tl.fromTo(heroMap.dots, { opacity: 0 }, { opacity: 1, duration: 1.4, ease: 'power2.out' }, 0.5);
      tl.fromTo(heroMap.stations, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, stagger: 0.05, ease: 'back.out(2)', transformOrigin: '50% 50%', xPercent: -50, yPercent: -50 }, 1.0);
      tl.fromTo(heroMap.centres, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.8, stagger: 0.1, ease: 'back.out(1.6)', xPercent: -50, yPercent: -50 }, 1.15);
      tl.fromTo(heroMap.halo, { opacity: 0 }, { opacity: 1, duration: 1.2, ease: 'power2.out' }, 1.2);
    }
    const ul = $('.front-word__line .uline');
    if (ul) {
      tl.fromTo(ul, { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.inOut' }, 0.9);
      tl.fromTo('.front-word__line .tri', { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, stagger: 0.06, ease: 'back.out(2.4)' }, 1.15);
    }
    const card = $('[data-fcard]');
    if (mobile) tl.fromTo(card, { opacity: 0 }, { opacity: 1, duration: 0.9, ease: 'power2.out' }, 1.0);
    else tl.fromTo(card, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' }, 1.0);
    tl.fromTo('.fcard__months .glyph', { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.04, ease: 'power2.out' }, 1.25);

    // split headings
    if (SplitText) {
      $$('[data-split]').forEach((/** @type {HTMLElement} */ el) => {
        const split = new SplitText(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
        gsap.from(split.lines, {
          yPercent: 108, duration: 1.05, ease: 'expo.out', stagger: 0.08,
          scrollTrigger: { trigger: el, start: 'top 82%', once: true },
          onComplete: () => split.revert(),
        });
      });
    }

    // reveals (batched so siblings stagger)
    const items = $$('[data-reveal]');
    gsap.set(items, { opacity: 0, y: 24 });
    ScrollTrigger.batch(items, {
      start: 'top 78%', once: true,
      onEnter: (/** @type {Element[]} */ batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, overwrite: true, clearProps: 'transform' }),
    });

    // counters
    $$('[data-count]').forEach((/** @type {HTMLElement} */ el) => {
      const to = Number(el.dataset.count), o = { v: 0 };
      el.textContent = '0';
      ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true, onEnter: () => gsap.to(o, { v: to, duration: 1.2, ease: 'power2.out', onUpdate: () => { el.textContent = fmt(Math.round(o.v)); } }) });
    });

    // product strip glyphs + reason bars on enter
    ScrollTrigger.create({
      trigger: '.forecast12', start: 'top 80%', once: true,
      onEnter: () => {
        gsap.from($$('.forecast12__strip .glyph'), { opacity: 0, y: 8, duration: 0.6, stagger: 0.04, ease: 'power3.out' });
        gsap.from('.fc-line', { strokeDasharray: 2000, strokeDashoffset: 2000, duration: 1.4, ease: 'power2.inOut' });
      },
    });
    ScrollTrigger.create({ trigger: '.why', start: 'top 85%', once: true, onEnter: () => gsap.from($$('.why__bar span'), { scaleX: 0, duration: 0.9, stagger: 0.08, ease: 'power3.out' }) });

    // invoice chart lines draw in
    ScrollTrigger.create({
      trigger: '.invoice', start: 'top 75%', once: true,
      onEnter: () => {
        gsap.fromTo('.ic-risky', { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut' });
        gsap.fromTo('.ic-safe', { strokeDasharray: 1, strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.2, ease: 'power2.inOut' });
        gsap.from('.ic-band, .ic-cone', { opacity: 0, duration: 1.4, delay: 0.4, ease: 'power2.out' });
      },
    });

    // desktop-only scrubs
    const mm = gsap.matchMedia();
    mm.add('(min-width: 1024px)', () => {
      $$('[data-front]').forEach((/** @type {HTMLElement} */ f) => {
        gsap.fromTo($('[data-front-svg]', f), { x: 90 }, { x: -110, ease: 'none', scrollTrigger: { trigger: f, start: 'top bottom', end: 'bottom top', scrub: true } });
      });
      gsap.fromTo('[data-sun]', { yPercent: 34 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '#zacnite', start: 'top bottom', end: 'center center', scrub: true } });
    });

    window.addEventListener('load', () => ScrollTrigger.refresh());
  }

  /* ================================================================ BOOT */
  async function boot() {
    try {
      await Promise.all([
        document.fonts.load('560 100px "Mona Sans"'),
        document.fonts.load('250 100px "Mona Sans"'),
        document.fonts.load('400 12px "IBM Plex Mono"'),
        document.fonts.load('500 12px "IBM Plex Mono"'),
      ]);
      await document.fonts.ready;
    } catch (e) { /* fonts optional */ }

    const steps = [buildMaps, () => $$('[data-front]').forEach(buildFront), buildUnderline, buildInvoiceChart, buildLayerViz, buildConverge,
      buildCadence, buildQuoteIsobars, buildSun, initTabs, initSearch, initSubscribe, initHeader, initMenu, initSheet, initClock, initFields, initMotion];
    for (const s of steps) {
      try { s(); } catch (err) { console.error('[napoved]', err); }
    }
    if (!ANIM) html.classList.add('intro-done');
    else window.setTimeout(() => html.classList.add('intro-done'), 4200);
    requestAnimationFrame(() => requestAnimationFrame(() => { W.__READY__ = true; }));
  }

  boot();
})();
