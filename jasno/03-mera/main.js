// @ts-check
/* Jasno · Mera — rulers, odometer, search, timelines and motion.
   Vanilla ES2020. GSAP / ScrollTrigger / SplitText / Lenis are optional enhancements. */
(() => {
  'use strict';

  const root = document.documentElement;
  const CAPTURE = /** @type {any} */ (window).__CAPTURE__ === true || new URLSearchParams(location.search).has('capture');
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MOTION = !CAPTURE && !REDUCED;
  if (CAPTURE) root.classList.add('is-capture');

  /** @type {any} */
  const W = window;
  const gsap = W.gsap;
  const ScrollTrigger = W.ScrollTrigger;
  const SplitText = W.SplitText;

  /* ------------------------------------------------------------------ *
   * Data (fictional companies; mirrors the shared brief)
   * ------------------------------------------------------------------ */
  /**
   * @typedef {{ id:string, name:string, place:string, sector:string, idx:number, delta:number,
   *   cls:'A'|'B'|'C'|'D'|'E', pd:string, limit:string, term:string, ms?:string, ds?:string }} Company
   */
  /** @type {Company[]} */
  const COMPANIES = [
    { id: 'hribar', name: 'Hribar Les d.o.o.', place: 'Škofja Loka', sector: 'lesna industrija', idx: 87, delta: 3, cls: 'A', pd: '0,4 %', limit: '120.000 €', term: '60 dni', ms: '5874123000', ds: 'SI 87654321' },
    { id: 'zrno', name: 'Pekarna Zrno d.o.o.', place: 'Kranj', sector: 'živilska industrija', idx: 79, delta: 11, cls: 'B', pd: '0,6 %', limit: '30.000 €', term: '45 dni' },
    { id: 'zupan', name: 'Zupan Transport d.o.o.', place: 'Koper', sector: 'logistika', idx: 71, delta: 0, cls: 'B', pd: '0,9 %', limit: '45.000 €', term: '45 dni' },
    { id: 'horvat', name: 'Avtoservis Horvat s.p.', place: 'Murska Sobota', sector: 'avtoservis', idx: 63, delta: 8, cls: 'C', pd: '1,6 %', limit: '8.000 €', term: '30 dni' },
    { id: 'novak', name: 'Novak Elektro d.o.o.', place: 'Celje', sector: 'elektroinštalacije', idx: 58, delta: -6, cls: 'C', pd: '2,1 %', limit: '18.000 €', term: '30 dni', ms: '6234567000', ds: 'SI 23456789' },
    { id: 'krajnc', name: 'Strojna Krajnc d.o.o.', place: 'Velenje', sector: 'strojegradnja', idx: 46, delta: -7, cls: 'D', pd: '5,8 %', limit: '6.000 €', term: '15 dni' },
    { id: 'vidmar', name: 'Tiskarna Vidmar d.o.o.', place: 'Nova Gorica', sector: 'tiskarstvo', idx: 41, delta: -9, cls: 'D', pd: '7,4 %', limit: '3.000 €', term: '15 dni' },
    { id: 'kovac', name: 'Kovač Gradnje d.o.o.', place: 'Maribor', sector: 'gradbeništvo', idx: 34, delta: -29, cls: 'E', pd: '18,6 %', limit: '0 €', term: 'samo predplačilo', ms: '6123456000', ds: 'SI 12345678' },
  ];
  /** @type {Record<string,string>} */
  const CLASS_NAME = { A: 'odlično', B: 'dobro', C: 'zmerno', D: 'povišano', E: 'visoko tveganje' };
  const byId = (/** @type {string} */ id) => /** @type {Company} */ (COMPANIES.find((c) => c.id === id));
  const CYCLE = ['hribar', 'novak', 'kovac'];

  /**
   * Slovenian typesetting: no single-letter word or bare unit at a line end.
   * @param {string} s
   * @returns {string}
   */
  function nb(s) {
    return s
      .replace(/(^|[\s(])([vVsSzZkKoOaAiIuU])\s+/g, '$1$2\u00a0')
      .replace(/(\d)\s+(%|€|dni|ur|mesecih)/g, '$1\u00a0$2')
      .replace(/(\d{1,2}\.)\s(\d{1,2}\.)\s(\d{4})/g, '$1\u00a0$2\u00a0$3')
      .replace(/ob\s(\d)/g, 'ob\u00a0$1');
  }

  /** @param {string} s */
  const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const dprNow = () => Math.min(window.devicePixelRatio || 1, 2);
  const isSmall = () => window.matchMedia('(max-width: 767px)').matches;
  const SVGNS = 'http://www.w3.org/2000/svg';

  /* ------------------------------------------------------------------ *
   * Rulers: crisp SVG ticks, snapped to device pixels, redrawn on resize
   * ------------------------------------------------------------------ */
  /**
   * @param {HTMLElement} el
   */
  function drawRuler(el) {
    const rect = el.getBoundingClientRect();
    const Wd = Math.round(rect.width);
    const Hd = Math.round(rect.height);
    if (!Wd || !Hd) return;
    const dpr = dprNow();
    const snap = (/** @type {number} */ v) => Math.round(v * dpr) / dpr;
    const vertical = el.dataset.orient === 'auto' && Hd > Wd * 1.5;
    const every = Number((isSmall() && el.dataset.labelsSm) || el.dataset.labels || 10) || 0;
    const long = el.classList.contains('ruler--long');
    const L = long ? [24, 14, 8] : vertical ? [22, 13, 7] : [20, 12, 7];
    const hair = 1;
    let out = '';
    if (!vertical) {
      out += `<rect class="t t--base" x="0" y="0" width="${Wd}" height="1"/>`;
      for (let i = 0; i <= 100; i++) {
        const x = Math.min(snap((i / 100) * (Wd - 1)), Wd - 1);
        const h = i % 10 === 0 ? L[0] : i % 5 === 0 ? L[1] : L[2];
        const cls = i % 10 === 0 || i % 5 === 0 ? 't' : 't t--minor';
        out += `<rect class="${cls}" data-i="${i}" x="${x}" y="1" width="${hair}" height="${h}"/>`;
        if (every && i % every === 0) {
          const anchor = i === 0 && long ? 'start' : i === 100 && long ? 'end' : 'middle';
          const tx = anchor === 'start' ? x : anchor === 'end' ? x + 1 : x + 0.5;
          out += `<text class="${i % 50 === 0 ? 'is-major' : ''}" x="${tx}" y="${L[0] + 15}" text-anchor="${anchor}">${i}</text>`;
        }
      }
    } else {
      const bx = Wd - 1;
      out += `<rect class="t t--base" x="${bx}" y="0" width="1" height="${Hd}"/>`;
      for (let i = 0; i <= 100; i++) {
        const y = Math.min(snap((1 - i / 100) * (Hd - 1)), Hd - 1);
        const w = i % 10 === 0 ? L[0] : i % 5 === 0 ? L[1] : L[2];
        const cls = i % 10 === 0 || i % 5 === 0 ? 't' : 't t--minor';
        out += `<rect class="${cls}" data-i="${i}" x="${bx - w}" y="${y}" width="${w}" height="1"/>`;
        if (every && i % every === 0) {
          out += `<text x="${bx - L[0] - 6}" y="${y + 4}" text-anchor="end">${i}</text>`;
        }
      }
    }
    let svg = /** @type {SVGSVGElement|null} */ (el.querySelector(':scope > svg.ruler__svg'));
    if (!svg) {
      svg = /** @type {SVGSVGElement} */ (document.createElementNS(SVGNS, 'svg'));
      svg.setAttribute('class', 'ruler__svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      el.prepend(svg);
    }
    svg.setAttribute('viewBox', `0 0 ${Wd} ${Hd}`);
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.innerHTML = out;
    el.classList.add('is-drawn');
    el.dataset.vertical = vertical ? '1' : '0';
  }

  /* ------------------------------------------------------------------ *
   * 365 : 1 — one tick per day vs one tick per year
   * ------------------------------------------------------------------ */
  const DAY0 = Date.UTC(2025, 9, 7); // 7. 10. 2025 → 6. 10. 2026 = 365 days
  const N_DAYS = 365;
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAJ', 'JUN', 'JUL', 'AVG', 'SEP', 'OKT', 'NOV', 'DEC'];
  /** @param {number} i */
  const dayDate = (i) => new Date(DAY0 + i * 864e5);
  const REPORT_DAY = Math.round((Date.UTC(2026, 2, 31) - DAY0) / 864e5); // 31. 3. 2026

  /**
   * Day spacing: snapped to whole device pixels on dense screens (perfectly even
   * hairlines), continuous on 1x screens so the year still spans the measure.
   * @param {number} Wd
   * @param {number} dpr
   */
  function daysStep(Wd, dpr) {
    const raw = (Wd - 1) / (N_DAYS - 1);
    return dpr >= 2 ? Math.floor(raw * dpr) / dpr : raw;
  }

  /** @param {HTMLElement} el */
  function drawDays(el) {
    const kind = el.dataset.days;
    const Wd = Math.round(el.getBoundingClientRect().width);
    if (!Wd) return;
    const dpr = dprNow();
    let out = '';
    let H = 54;
    if (!isSmall()) {
      const step = daysStep(Wd, dpr);
      const span = step * (N_DAYS - 1);
      el.style.setProperty('--span', `${span + 1}px`);
      if (kind === 'classic') {
        out += `<rect class="base" x="0" y="${H - 1}" width="${span + 1}" height="1"/>`;
        for (let i = 0; i < N_DAYS; i++) {
          if (dayDate(i).getUTCDate() === 1) out += `<rect class="base" x="${i * step}" y="${H - 7}" width="1" height="6"/>`;
        }
        const x = REPORT_DAY * step;
        out += `<rect class="big" data-big x="${x - 1.5}" y="4" width="4" height="${H - 4}"/>`;
        out += `<text x="${x + 12}" y="22">letno poročilo</text>`;
        out += `<text x="${x + 12}" y="40" class="sub">31.\u00a03.\u00a02026</text>`;
      } else {
        for (let i = 0; i < N_DAYS; i++) {
          const d = dayDate(i);
          const today = i === N_DAYS - 1;
          const first = d.getUTCDate() === 1;
          const h = today ? H : first ? 40 : 30;
          out += `<rect class="d${first ? ' d--m' : ''}${today ? ' d--today' : ''}" x="${i * step}" y="${H - h}" width="1" height="${h}"/>`;
        }
        const tx = (N_DAYS - 1) * step;
        out += `<circle class="ping" cx="${tx + 0.5}" cy="${H - 4}" r="3"/>`;
        out += `<text class="red" x="${tx - 8}" y="10" text-anchor="end">danes, 6.00</text>`;
      }
    } else {
      // Phone: a ledger of months, one row per month, days in columns.
      const rows = [];
      for (let i = 0; i < N_DAYS; i++) {
        const d = dayDate(i);
        const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
        if (!rows.length || rows[rows.length - 1].key !== key) rows.push({ key, m: d.getUTCMonth(), y: d.getUTCFullYear(), days: /** @type {number[]} */ ([]) });
        rows[rows.length - 1].days.push(i);
      }
      const labelW = 44;
      const step = Math.floor(((Wd - labelW - 1) / 30) * dpr) / dpr;
      const rowH = 17;
      H = rows.length * rowH + 6;
      rows.forEach((r, ri) => {
        const y = ri * rowH + 4;
        const lab = `${MONTHS[r.m]}${r.m === 9 ? ` ${String(r.y).slice(2)}` : ''}`;
        out += `<text class="mlab" x="0" y="${y + 9}">${lab}</text>`;
        if (kind === 'classic') {
          out += `<rect class="base" x="${labelW}" y="${y + 11}" width="${step * 30 + 1}" height="1"/>`;
        }
        r.days.forEach((i) => {
          const dom = dayDate(i).getUTCDate();
          const x = labelW + (dom - 1) * step;
          if (kind === 'classic') {
            if (i === REPORT_DAY) out += `<rect class="big" data-big x="${x - 1.5}" y="${y - 2}" width="4" height="${rowH - 3}"/>`;
          } else {
            const today = i === N_DAYS - 1;
            out += `<rect class="d${today ? ' d--today' : ''}" x="${x}" y="${y + (today ? 0 : 3)}" width="1" height="${today ? 12 : 9}"/>`;
          }
        });
      });
      if (kind === 'classic') {
        const ri = rows.findIndex((r) => r.days.includes(REPORT_DAY));
        const tx = labelW + (dayDate(REPORT_DAY).getUTCDate() - 1) * step;
        out += `<text x="${tx - 9}" y="${ri * rowH + 12}" text-anchor="end">letno poročilo</text>`;
      } else {
        const last = rows.length - 1;
        out += `<text class="red" x="${Wd}" y="${last * rowH + 14}" text-anchor="end">danes, 6.00</text>`;
      }
    }
    let svg = /** @type {SVGSVGElement|null} */ (el.querySelector(':scope > svg'));
    if (!svg) {
      svg = /** @type {SVGSVGElement} */ (document.createElementNS(SVGNS, 'svg'));
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      el.append(svg);
    }
    svg.setAttribute('viewBox', `0 0 ${Wd} ${H}`);
    svg.setAttribute('height', String(H));
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.innerHTML = out;
    el.classList.add('is-drawn');
  }

  /** Month labels under the timelines (desktop) */
  function drawAxis() {
    const el = /** @type {HTMLElement|null} */ (document.querySelector('[data-days-axis]'));
    if (!el) return;
    const Wd = Math.round(el.getBoundingClientRect().width);
    if (!Wd) return;
    const dpr = dprNow();
    const step = daysStep(Wd, dpr);
    let out = `<rect x="0" y="0" width="${step * (N_DAYS - 1) + 1}" height="1" fill="#151413"/>`;
    for (let i = 0; i < N_DAYS; i++) {
      const d = dayDate(i);
      if (i === 0 || d.getUTCDate() === 1) {
        const m = d.getUTCMonth();
        const yr = i === 0 || m === 0 ? ` ${d.getUTCFullYear()}` : '';
        out += `<rect x="${i * step}" y="0" width="1" height="6" fill="#151413"/>`;
        out += `<text class="${yr ? 'mt' : ''}" x="${i * step + 5}" y="18">${MONTHS[m]}${yr}</text>`;
      }
    }
    let svg = el.querySelector('svg');
    if (!svg) {
      svg = /** @type {SVGSVGElement} */ (document.createElementNS(SVGNS, 'svg'));
      svg.setAttribute('aria-hidden', 'true');
      el.append(svg);
    }
    svg.setAttribute('viewBox', `0 0 ${Wd} 26`);
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.innerHTML = out;
    el.style.borderTop = '0';
  }

  /* ------------------------------------------------------------------ *
   * Hero: odometer + marker + bands + footnote
   * ------------------------------------------------------------------ */
  const hero = /** @type {HTMLElement|null} */ (document.querySelector('[data-hero]'));
  const numeral = /** @type {HTMLElement|null} */ (document.querySelector('[data-numeral]'));
  const strips = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('[data-odo] .odo__s')));
  const heroRuler = /** @type {HTMLElement|null} */ (document.querySelector('.ruler--hero'));
  const heroMarker = /** @type {HTMLElement|null} */ (heroRuler && heroRuler.querySelector('[data-marker-el]'));
  const heroBands = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('[data-bands] .band')));
  const fnText = /** @type {HTMLElement|null} */ (document.querySelector('[data-fn-text]'));
  const heroSr = /** @type {HTMLElement|null} */ (document.querySelector('[data-hero-sr]'));
  const countEl = /** @type {HTMLElement|null} */ (document.querySelector('[data-count]'));
  const pauseBtn = /** @type {HTMLButtonElement|null} */ (document.querySelector('[data-pause]'));
  let heroCurrent = 'hribar';
  let fnTimer = 0;

  /**
   * @param {Company} c
   * @returns {string}
   */
  function footnoteHTML(c) {
    const limit = c.cls === 'E' ? `${c.limit} – ${c.term}` : c.limit;
    const co = `<span class="fn__co">${nb(`${c.name}, ${c.place}.`)}</span>`;
    return `${co} ${nb(`Jasno indeks na dan 6. 10. 2026 ob 6.00. Verjetnost neplačila v 12 mesecih: ${c.pd}. Priporočeni limit: ${limit}.`)}`;
  }

  /**
   * @param {Company} c
   * @param {boolean} animate
   */
  function setHero(c, animate) {
    if (!numeral || !heroMarker) return;
    heroCurrent = c.id;
    const digits = String(c.idx).padStart(2, '0').slice(-2);
    strips.forEach((s, i) => s.style.setProperty('--d', digits[i]));
    numeral.classList.toggle('is-risk', c.cls === 'E');
    heroMarker.style.setProperty('--v', String(c.idx));
    heroBands.forEach((b) => b.classList.toggle('is-on', b.dataset.cls === c.cls));
    if (heroSr) heroSr.textContent = `Jasno indeks ${c.idx} od 100, razred ${c.cls}, ${CLASS_NAME[c.cls]}.`;
    if (fnText) {
      window.clearTimeout(fnTimer);
      if (animate) {
        fnText.classList.add('is-out');
        fnTimer = window.setTimeout(() => {
          fnText.innerHTML = footnoteHTML(c);
          fnText.classList.remove('is-out');
        }, 420);
      } else {
        fnText.innerHTML = footnoteHTML(c);
        fnText.classList.remove('is-out');
      }
    }
    const k = CYCLE.indexOf(c.id);
    if (countEl) countEl.textContent = k >= 0 ? String(k + 1) : '–';
  }

  /* cycle every 5 s while idle and visible */
  const cycle = {
    timer: 0,
    userPaused: false,
    typing: false,
    visible: true,
    i: 0,
    get running() { return MOTION && !this.userPaused && !this.typing && this.visible && !document.hidden; },
    schedule() {
      window.clearTimeout(this.timer);
      if (!this.running) return;
      this.timer = window.setTimeout(() => this.tick(), 5000);
    },
    tick() {
      if (!this.running) return;
      const k = CYCLE.indexOf(heroCurrent);
      this.i = (k + 1) % CYCLE.length;
      setHero(byId(CYCLE[this.i]), true);
      this.schedule();
    },
  };

  function renderPause() {
    if (!pauseBtn) return;
    pauseBtn.textContent = cycle.userPaused ? 'Nadaljujte primere' : 'Ustavite primere';
    pauseBtn.dataset.state = cycle.userPaused ? 'paused' : 'playing';
  }
  if (pauseBtn) {
    if (REDUCED && !CAPTURE) {
      // Nothing cycles under reduced motion, so the control would have nothing to pause.
      const ctrl = pauseBtn.closest('[data-ctrl]');
      if (ctrl) /** @type {HTMLElement} */ (ctrl).hidden = true;
    }
    pauseBtn.removeAttribute('aria-pressed');
    renderPause();
    pauseBtn.addEventListener('click', () => {
      cycle.userPaused = !cycle.userPaused;
      if (!cycle.userPaused && CYCLE.indexOf(heroCurrent) < 0) setHero(byId('hribar'), true);
      renderPause();
      cycle.schedule();
    });
  }
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      cycle.visible = entries[0].isIntersecting;
      cycle.schedule();
    }, { threshold: 0.25 }).observe(hero);
  }
  document.addEventListener('visibilitychange', () => cycle.schedule());

  /* ------------------------------------------------------------------ *
   * Final CTA: the marker waits at "?"
   * ------------------------------------------------------------------ */
  const finalMeasure = /** @type {HTMLElement|null} */ (document.querySelector('[data-final-measure]'));
  /** @param {Company} c */
  function setFinal(c) {
    if (!finalMeasure) return;
    const track = /** @type {HTMLElement} */ (finalMeasure.querySelector('.final__qv'));
    const val = /** @type {HTMLElement} */ (finalMeasure.querySelector('[data-final-v]'));
    const marker = /** @type {HTMLElement} */ (finalMeasure.querySelector('[data-marker-el]'));
    const cap = /** @type {HTMLElement} */ (finalMeasure.querySelector('[data-final-cap]'));
    track.style.setProperty('--v', String(c.idx));
    marker.style.setProperty('--v', String(c.idx));
    val.textContent = String(c.idx);
    val.classList.add('is-val');
    val.classList.toggle('is-risk', c.cls === 'E');
    const rec = c.cls === 'E' ? 'samo predplačilo' : `limit ${c.limit}, rok ${c.term}`;
    cap.textContent = nb(`${c.name}, ${c.place} · razred ${c.cls}, ${CLASS_NAME[c.cls]} · priporočilo: ${rec}.`);
  }

  /* ------------------------------------------------------------------ *
   * Search: an accessible combobox over the example companies
   * ------------------------------------------------------------------ */
  /**
   * @param {string} q
   * @returns {Company[]}
   */
  function match(q) {
    const f = fold(q.trim());
    if (!f) return [];
    const digits = f.replace(/\D/g, '');
    return COMPANIES.filter((c) => {
      if (fold(c.name).includes(f) || fold(c.place).includes(f)) return true;
      if (digits.length >= 3) return [c.ms, c.ds].some((x) => x && x.replace(/\D/g, '').includes(digits));
      return false;
    });
  }

  /** @param {HTMLFormElement} form */
  function initSearch(form) {
    const kind = form.dataset.search;
    const input = /** @type {HTMLInputElement} */ (form.querySelector('input'));
    const list = /** @type {HTMLUListElement} */ (form.querySelector('[role="listbox"]'));
    const status = /** @type {HTMLElement} */ (form.querySelector('[data-status]'));
    /** @type {Company[]} */
    let results = [];
    let active = -1;

    const close = () => {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    };
    const paint = () => {
      list.querySelectorAll('[role="option"]').forEach((o, i) => o.setAttribute('aria-selected', String(i === active)));
      if (active >= 0) input.setAttribute('aria-activedescendant', `${list.id}-${active}`);
      else input.removeAttribute('aria-activedescendant');
    };
    const render = () => {
      results = match(input.value);
      active = -1;
      if (!results.length) { close(); return; }
      list.innerHTML = results.map((c, i) => `
        <li class="opt${c.cls === 'E' ? ' is-risk' : ''}" role="option" id="${list.id}-${i}" aria-selected="false" data-id="${c.id}">
          <span class="opt__n">${c.name}</span>
          <span class="opt__p">${c.place} · ${c.sector}</span>
          <span class="opt__v">${c.idx}<small>${c.cls}</small></span>
        </li>`).join('');
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    };
    /** @param {Company} c */
    const choose = (c) => {
      input.value = c.name;
      close();
      const line = nb(`${c.name}: Jasno indeks ${c.idx}, razred ${c.cls} (${CLASS_NAME[c.cls]}). Verjetnost neplačila ${c.pd}.`);
      status.textContent = line;
      if (kind === 'hero') {
        cycle.userPaused = true;
        renderPause();
        cycle.schedule();
        setHero(c, MOTION);
      } else {
        setFinal(c);
      }
    };

    input.addEventListener('input', () => {
      if (kind === 'hero') { cycle.typing = input.value.length > 0; cycle.schedule(); }
      status.textContent = '';
      render();
    });
    input.addEventListener('focus', () => { if (kind === 'hero') { cycle.typing = true; cycle.schedule(); } });
    input.addEventListener('blur', () => {
      window.setTimeout(close, 150);
      if (kind === 'hero') { cycle.typing = input.value.length > 0; cycle.schedule(); }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        if (list.hidden) render();
        if (!results.length) return;
        e.preventDefault();
        active = (active + 1) % results.length; paint();
      } else if (e.key === 'ArrowUp') {
        if (!results.length) return;
        e.preventDefault();
        active = (active - 1 + results.length) % results.length; paint();
      } else if (e.key === 'Escape') {
        if (!list.hidden) { e.preventDefault(); close(); }
      }
    });
    list.addEventListener('mousedown', (e) => e.preventDefault());
    list.addEventListener('click', (e) => {
      const li = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[role="option"]'));
      if (li && li.dataset.id) choose(byId(li.dataset.id));
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const pick = active >= 0 ? results[active] : match(input.value)[0];
      if (pick) { choose(pick); return; }
      close();
      status.textContent = input.value.trim()
        ? nb('Med primeri ni takega podjetja. Poskusite »Hribar Les«, »Novak Elektro« ali »Kovač Gradnje«.')
        : nb('Vpišite ime podjetja, davčno ali matično številko.');
      input.focus();
    });
  }
  document.querySelectorAll('form[data-search]').forEach((f) => initSearch(/** @type {HTMLFormElement} */ (f)));

  /* ------------------------------------------------------------------ *
   * Masthead: condense on scroll; margin ruler reading marker; menu
   * ------------------------------------------------------------------ */
  const masthead = /** @type {HTMLElement|null} */ (document.querySelector('[data-masthead]'));
  const markEl = /** @type {HTMLElement|null} */ (document.querySelector('.mrule__mark'));
  function measureHeader() {
    if (!masthead) return;
    const line = /** @type {HTMLElement|null} */ (masthead.querySelector('.masthead__line'));
    masthead.style.setProperty('--line-h', `${line ? line.offsetHeight : 0}px`);
    root.style.setProperty('--header-h', `${masthead.offsetHeight}px`);
  }
  /** @param {number} y */
  function onScroll(y) {
    if (masthead) masthead.classList.toggle('is-condensed', y > 60);
    if (markEl) {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      markEl.style.setProperty('--p', String(Math.min(1, Math.max(0, y / max))));
    }
  }

  const menuBtn = /** @type {HTMLButtonElement|null} */ (document.querySelector('[data-menu-btn]'));
  const nav = /** @type {HTMLElement|null} */ (document.querySelector('[data-nav]'));
  if (menuBtn && nav) {
    const setOpen = (/** @type {boolean} */ open) => {
      nav.classList.toggle('is-open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      const label = menuBtn.querySelector('.menu-btn__label');
      if (label) label.textContent = open ? 'Zaprite' : 'Meni';
      menuBtn.setAttribute('aria-label', open ? 'Zaprite meni' : 'Odprite meni');
    };
    menuBtn.setAttribute('aria-label', 'Odprite meni');
    menuBtn.addEventListener('click', () => setOpen(menuBtn.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', (e) => { if (/** @type {HTMLElement} */ (e.target).closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); menuBtn.focus(); }
    });
    document.addEventListener('click', (e) => {
      if (nav.classList.contains('is-open') && !(/** @type {HTMLElement} */ (e.target).closest('[data-nav],[data-menu-btn]'))) setOpen(false);
    });
  }

  /* ------------------------------------------------------------------ *
   * Drawing + responsive redraws
   * ------------------------------------------------------------------ */
  const rulers = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('[data-ruler]')));
  const dayEls = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('[data-days]')));
  function drawAll() {
    measureHeader();
    rulers.forEach(drawRuler);
    dayEls.forEach(drawDays);
    drawAxis();
  }
  let lastW = window.innerWidth;
  let rafId = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const wChanged = window.innerWidth !== lastW;
      lastW = window.innerWidth;
      if (!CAPTURE) root.style.removeProperty('--vh');
      drawAll();
      if (wChanged && ScrollTrigger) ScrollTrigger.refresh();
    });
  });

  /* ------------------------------------------------------------------ *
   * Motion (GSAP + Lenis), only when allowed
   * ------------------------------------------------------------------ */
  function initMotion() {
    if (!MOTION || !gsap) { root.classList.remove('motion'); return; }
    if (ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
    if (SplitText) gsap.registerPlugin(SplitText);
    root.classList.add('motion-ready');

    // Lenis smooth scroll
    /** @type {any} */
    let lenis = null;
    if (W.Lenis) {
      lenis = new W.Lenis({ duration: 1.1, anchors: { offset: -70 }, autoRaf: false });
      gsap.ticker.add((/** @type {number} */ t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
      lenis.on('scroll', (/** @type {any} */ l) => { if (ScrollTrigger) ScrollTrigger.update(); onScroll(l.scroll); });
    }
    // move focus with in-page links (skip link, nav, table of contents)
    document.addEventListener('click', (e) => {
      const a = /** @type {HTMLAnchorElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('a[href^="#"]'));
      if (!a) return;
      const id = a.getAttribute('href') || '';
      const target = id.length > 1 ? document.getElementById(id.slice(1)) : null;
      if (!target) return;
      window.setTimeout(() => {
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }, 60);
    });

    // Hero intro: odometer rolls up from 00, ticks draw, marker slides in.
    const h1 = /** @type {HTMLElement|null} */ (document.querySelector('.h1[data-split]'));
    if (h1 && SplitText) {
      const split = splitLines(h1);
      h1.style.visibility = 'visible';
      gsap.from(split.lines, { yPercent: 100, duration: 0.9, ease: 'power3.out', stagger: 0.06, delay: 0.1, onComplete: () => split.revert() });
    } else if (h1) h1.style.visibility = 'visible';
    const intro = document.querySelectorAll('[data-intro]');
    if (intro.length) gsap.to(intro, { opacity: 1, duration: 0.8, ease: 'power2.out', stagger: 0.08, delay: 0.3 });

    const target = byId('hribar');
    strips.forEach((s) => { s.style.transition = 'none'; s.style.setProperty('--d', '0'); });
    if (heroMarker) { heroMarker.style.transition = 'none'; heroMarker.style.setProperty('--v', '0'); }
    void document.body.offsetHeight;
    requestAnimationFrame(() => {
      strips.forEach((s) => { s.style.transition = ''; });
      if (heroMarker) { heroMarker.style.transition = ''; heroMarker.style.opacity = '1'; }
      window.setTimeout(() => setHero(target, false), 120);
    });
    if (heroRuler) drawTicksIn(heroRuler, 0.25);

    if (!ScrollTrigger) return;

    // Headlines: masked lines
    document.querySelectorAll('[data-split]:not(.h1)').forEach((el) => {
      if (!SplitText) return;
      const split = splitLines(/** @type {HTMLElement} */ (el));
      gsap.from(split.lines, {
        yPercent: 100, duration: 0.9, ease: 'power3.out', stagger: 0.06,
        scrollTrigger: { trigger: el, start: 'top 86%', once: true },
        onComplete: () => split.revert(),
      });
    });
    // Big figures of 365 : 1
    if (document.querySelector('.ratio__fig')) gsap.from('.ratio__fig', {
      yPercent: 30, opacity: 0, duration: 1.1, ease: 'power3.out', stagger: 0.12,
      scrollTrigger: { trigger: '.ratio__title', start: 'top 80%', once: true },
    });
    // Body copy fades
    ScrollTrigger.batch('[data-fade]', {
      start: 'top 90%', once: true,
      onEnter: (/** @type {Element[]} */ els) => gsap.from(els, { opacity: 0, y: 14, duration: 0.8, ease: 'power2.out', stagger: 0.07, overwrite: true }),
    });
    // Rulers below the fold draw in when they arrive
    rulers.filter((r) => r !== heroRuler).forEach((r) => {
      ScrollTrigger.create({ trigger: r, start: 'top 92%', once: true, onEnter: () => drawTicksIn(r, 0) });
      const m = /** @type {HTMLElement|null} */ (r.querySelector('[data-marker-el]'));
      if (m) {
        const v = m.style.getPropertyValue('--v');
        m.style.transition = 'none'; m.style.setProperty('--v', '0');
        ScrollTrigger.create({ trigger: r, start: 'top 90%', once: true, onEnter: () => { m.style.transition = ''; m.style.setProperty('--v', v); } });
      }
    });
    // Pins rise onto the long ruler
    if (document.querySelector('.pin')) gsap.from('.pin', {
      opacity: 0, y: 18, duration: 0.7, ease: 'power3.out', stagger: 0.07,
      scrollTrigger: { trigger: '.specimen', start: 'top 75%', once: true },
    });
    // 365 ticks, then the red one pings
    dayEls.forEach((el) => {
      ScrollTrigger.create({
        trigger: el, start: 'top 88%', once: true,
        onEnter: () => {
          const ds = el.querySelectorAll('.d, .big');
          if (!ds.length) return;
          const tl = gsap.timeline();
          tl.from(ds, { scaleY: 0, transformOrigin: '50% 100%', duration: 0.35, ease: 'power2.out', stagger: ds.length > 1 ? 1.6 / ds.length : 0 });
          const ping = el.querySelector('.ping');
          if (ping) tl.fromTo(ping, { attr: { r: 2 }, opacity: 0.9 }, { attr: { r: 20 }, opacity: 0, duration: 1.3, ease: 'power2.out', repeat: 2 }, '>-0.05');
        },
      });
    });
    // The red pen: invoice ring and the report line draw themselves
    const ring = document.querySelector('.invoice__ring path');
    if (ring) gsap.fromTo(ring, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut', scrollTrigger: { trigger: ring, start: 'top 85%', once: true } });
    const line = document.querySelector('.ichart__line');
    if (line) {
      gsap.set(line, { strokeDasharray: '1 1' });
      gsap.fromTo(line, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.8, ease: 'power2.inOut', scrollTrigger: { trigger: line, start: 'top 80%', once: true } });
      gsap.from('.ichart__ann', { opacity: 0, duration: 0.6, stagger: 0.3, delay: 1.2, scrollTrigger: { trigger: line, start: 'top 80%', once: true } });
    }
    // marginal notes slide in from the margins
    gsap.utils.toArray('.note').forEach((n) => {
      const el = /** @type {HTMLElement} */ (n);
      gsap.from(el, { x: el.classList.contains('note--l') ? -16 : 16, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 85%', once: true } });
    });
  }

  /**
   * Split a headline into masked lines. The masks get room for accents and
   * descenders, because display type is set with line-height under 1.
   * @param {HTMLElement} el
   * @returns {any}
   */
  function splitLines(el) {
    const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
    (split.masks || []).forEach((/** @type {HTMLElement} */ m) => {
      m.style.paddingBlock = '0.14em 0.22em';
      m.style.marginBlock = '-0.14em -0.22em';
    });
    return split;
  }

  /**
   * Ticks rise in from left to right (scaleY 0 → 1, origin at the rule).
   * @param {HTMLElement} el
   * @param {number} delay
   */
  function drawTicksIn(el, delay) {
    if (!gsap || !MOTION) return;
    const ticks = el.querySelectorAll('rect[data-i]');
    if (!ticks.length) return;
    const vertical = el.dataset.vertical === '1';
    gsap.from(ticks, {
      [vertical ? 'scaleX' : 'scaleY']: 0,
      transformOrigin: vertical ? '100% 50%' : '50% 0%',
      duration: 0.5, ease: 'power2.out',
      stagger: { each: 0.006, from: vertical ? 'end' : 'start' },
      delay,
    });
    const labels = el.querySelectorAll('text');
    if (labels.length) gsap.from(labels, { opacity: 0, duration: 0.6, stagger: 0.03, delay: delay + 0.25 });
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  function boot() {
    if (CAPTURE) {
      // Pin viewport-relative sizes so a full-page capture keeps the hero composition.
      root.style.setProperty('--vh', `${window.innerHeight}px`);
      root.style.setProperty('--vu', `${window.innerHeight / 100}px`);
    }
    drawAll();
    setHero(byId('hribar'), false);
    onScroll(window.scrollY);
    if (!W.Lenis || !MOTION) window.addEventListener('scroll', () => onScroll(window.scrollY), { passive: true });
    initMotion();
    cycle.schedule();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      drawAll();
      W.__READY__ = true;
    }));
  }

  const fontsReady = Promise.all([
    document.fonts.load("250 100px 'Noto Serif Display'", '0123456789Jasnočšž'),
    document.fonts.load("italic 400 28px 'Noto Serif Display'", 'Vsak dan čšž'),
    document.fonts.load("400 17px 'Schibsted Grotesk'", 'Ime podjetja čšž'),
    document.fonts.load("600 11px 'Schibsted Grotesk'", 'ŠT. LJUBLJANA ČŠŽ'),
  ]).then(() => document.fonts.ready).catch(() => undefined);
  const timeout = new Promise((r) => window.setTimeout(r, 2500));
  Promise.race([fontsReady, timeout]).then(boot);
})();
