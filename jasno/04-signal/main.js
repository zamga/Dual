// @ts-check
/**
 * Jasno — 04 SIGNAL · The Departure Board
 * Split-flap engine (DOM + transforms), boards, countdown, rail line, search and motion.
 * Vanilla ES2020, no build step. Vendor UMD globals: gsap, ScrollTrigger, ScrambleTextPlugin, Lenis.
 */
(function () {
  'use strict';

  /** @type {any} */
  const W = window;
  const root = document.documentElement;
  const params = new URLSearchParams(location.search);
  const CAPTURE = W.__CAPTURE__ === true || params.has('capture');
  const REDUCED = !CAPTURE && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MOTION = !CAPTURE && !REDUCED;
  const gsap = W.gsap;
  const ScrollTrigger = W.ScrollTrigger;

  root.classList.remove('no-js');
  root.classList.add('js');
  root.classList.toggle('is-capture', CAPTURE);
  root.classList.toggle('is-reduced', REDUCED);
  if (CAPTURE) root.style.setProperty('--vh', Math.max(window.innerHeight, 640) + 'px');

  /* ------------------------------------------------------------------ *
   * helpers
   * ------------------------------------------------------------------ */

  /**
   * @param {string} sel
   * @param {ParentNode} [ctx]
   * @returns {HTMLElement|null}
   */
  const $ = (sel, ctx = document) => /** @type {HTMLElement|null} */ (ctx.querySelector(sel));

  /**
   * @param {string} sel
   * @param {ParentNode} [ctx]
   * @returns {HTMLElement[]}
   */
  const $$ = (sel, ctx = document) => /** @type {HTMLElement[]} */ (Array.from(ctx.querySelectorAll(sel)));

  /** @param {string} s */
  const UP = (s) => s.toLocaleUpperCase('sl-SI');

  /** @param {string} s @param {number} n */
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);

  /**
   * Deterministic PRNG (mulberry32).
   * @param {number} seed
   * @returns {() => number}
   */
  function mulberry(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** @param {string} s */
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /**
   * CSS-style cubic-bezier easing.
   * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
   * @returns {(x: number) => number}
   */
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    /** @param {number} t */ const sx = (t) => ((ax * t + bx) * t + cx) * t;
    /** @param {number} t */ const sy = (t) => ((ay * t + by) * t + cy) * t;
    /** @param {number} t */ const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 7; i++) {
        const e = sx(t) - x;
        if (Math.abs(e) < 1e-5) break;
        const d = dx(t);
        if (Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      return sy(Math.min(1, Math.max(0, t)));
    };
  }
  const leafEase = bezier(0.3, 0, 0.6, 1);
  /** @param {number} t */
  const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /**
   * Slovenian plural forms (singular · dual · 3–4 · 5+).
   * @param {number} n @param {string} one @param {string} two @param {string} few @param {string} many
   */
  function plural(n, one, two, few, many) {
    const m = n % 100;
    return m === 1 ? one : m === 2 ? two : m === 3 || m === 4 ? few : many;
  }

  /**
   * Run `fn(visible)` whenever an element enters or leaves the viewport.
   * @param {Element} el
   * @param {(visible: boolean) => void} fn
   * @param {number} [margin]
   */
  function watch(el, fn, margin = 0) {
    if (!('IntersectionObserver' in window)) { fn(true); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => fn(e.isIntersecting)), { rootMargin: `${margin}px 0px` });
    io.observe(el);
  }

  /** Europe/Ljubljana wall-clock time. */
  const ljFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Ljubljana', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  function ljNow() {
    /** @type {Record<string, string>} */
    const p = {};
    for (const x of ljFmt.formatToParts(new Date())) p[x.type] = x.value;
    return { h: (+p.hour) % 24, m: +p.minute, s: +p.second };
  }
  /** @param {number} n */
  const two = (n) => String(n).padStart(2, '0');

  /* ------------------------------------------------------------------ *
   * sound — synthesised click per flip (WebAudio, OFF by default)
   * ------------------------------------------------------------------ */
  const Sound = (function () {
    /** @type {AudioContext|null} */ let ctx = null;
    /** @type {AudioBuffer|null} */ let noise = null;
    let on = false;
    let last = 0;
    const buttons = $$('[data-sound]');

    function ensure() {
      if (ctx) return true;
      const AC = W.AudioContext || W.webkitAudioContext;
      if (!AC) return false;
      ctx = /** @type {AudioContext} */ (new AC());
      const len = Math.ceil(ctx.sampleRate * 0.012);
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      return true;
    }

    /** @param {boolean} v */
    function set(v) {
      on = v && ensure();
      if (on && ctx && ctx.state === 'suspended') ctx.resume();
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(on)));
    }
    buttons.forEach((b) => b.addEventListener('click', () => set(!on)));

    /** @param {number} [gain] */
    function click(gain = 1) {
      if (!on || !ctx || !noise) return;
      const t = ctx.currentTime;
      if (t - last < 0.014) return;
      last = t;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1700 + Math.random() * 2400;
      const g = ctx.createGain();
      const v = 0.16 * gain * (0.55 + Math.random() * 0.45);
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.008);
      src.connect(hp);
      hp.connect(g);
      g.connect(ctx.destination);
      src.start(t);
      src.stop(t + 0.012);
    }
    return { click };
  })();

  /* ------------------------------------------------------------------ *
   * split-flap engine
   * One shared rAF loop drives every flipping leaf. Idle cells cost nothing:
   * the leaf is display:none until a flip starts, and only changed cells flip.
   * ------------------------------------------------------------------ */
  const SET = ' ABCČDEFGHIJKLMNOPRSŠTUVZŽ0123456789.,:-+%▲▼/€·→';
  /** numeric modules: time and score fields carry their own short drums */
  const DRUM_TIME = ' 0123456789.';
  const DRUM_SCORE = ' 0123456789▲▼·';

  /**
   * @typedef {Object} Cell
   * @property {HTMLElement} el    cell (static halves are its ::before / ::after)
   * @property {HTMLElement} leaf  rotating leaf
   * @property {HTMLElement} fa    leaf front: top half of the outgoing char
   * @property {HTMLElement} fz    leaf back: bottom half of the incoming char
   * @property {string} cur        settled character
   * @property {string} nxt        character currently flipping in
   * @property {string[]} q        queued characters
   * @property {number} t0         flip start (ms) or -1 when idle / waiting
   * @property {number} dur        current flip duration (ms)
   * @property {number} wait       start time of a queued sequence (ms)
   * @property {string} set        drum character set
   * @property {string} col        colour code
   * @property {string|null} pcol  colour to apply when the next flip starts
   * @property {number} slow       duration multiplier (big flaps fall slower)
   */

  const Flap = (function () {
    /** @type {Set<Cell>} */
    const active = new Set();
    let raf = 0;

    /**
     * @param {string} [ch]
     * @param {string} [set]
     * @param {number} [slow]
     * @returns {Cell}
     */
    function make(ch = ' ', set = SET, slow = 1) {
      const el = document.createElement('span');
      el.className = 'f';
      el.dataset.t = ch;
      el.dataset.b = ch;
      const leaf = document.createElement('span');
      leaf.className = 'f-l';
      const fa = document.createElement('span');
      fa.className = 'f-a';
      const fz = document.createElement('span');
      fz.className = 'f-z';
      const sh = document.createElement('span');
      sh.className = 'f-s';
      leaf.append(fa, fz);
      el.append(sh, leaf);
      return { el, leaf, fa, fz, cur: ch, nxt: ch, q: [], t0: -1, dur: 60, wait: 0, set, col: '', pcol: null, slow };
    }

    /**
     * Characters a drum passes through from `from` to `to` (forward only, at most 10 in between).
     * @param {string} set @param {string} from @param {string} to
     * @returns {string[]}
     */
    function seq(set, from, to) {
      if (from === to) return [];
      const n = set.length;
      const j = set.indexOf(to);
      if (j < 0) return [to];
      let i = set.indexOf(from);
      if (i < 0) i = 0;
      const steps = Math.min((j - i + n) % n, 11);
      /** @type {string[]} */
      const out = [];
      for (let k = steps - 1; k >= 0; k--) out.push(set[(j - k + n) % n]);
      return out;
    }

    /** @param {Cell} c @param {string} col */
    function setCol(c, col) {
      if (c.col === col) return;
      c.col = col;
      if (col) c.el.dataset.col = col;
      else delete c.el.dataset.col;
    }

    /**
     * Show a character instantly.
     * @param {Cell} c @param {string} ch @param {string} [col]
     */
    function show(c, ch, col) {
      active.delete(c);
      c.q.length = 0;
      c.t0 = -1;
      c.pcol = null;
      c.el.classList.remove('is-f');
      c.el.dataset.t = ch;
      c.el.dataset.b = ch;
      c.cur = c.nxt = ch;
      if (col !== undefined) setCol(c, col);
    }

    /**
     * Flip a cell to `ch` after `delay` ms.
     * @param {Cell} c @param {string} ch @param {number} [delay] @param {string} [col]
     */
    function to(c, ch, delay = 0, col) {
      const flipping = c.t0 >= 0;
      const s = seq(c.set, flipping ? c.nxt : c.cur, ch);
      if (!s.length) {
        c.q.length = 0;
        if (col !== undefined) { if (flipping) c.pcol = col; else setCol(c, col); }
        if (!flipping) active.delete(c);
        return;
      }
      c.q = s;
      c.pcol = col === undefined ? null : col;
      if (!flipping) c.wait = performance.now() + delay;
      active.add(c);
      if (!raf) raf = requestAnimationFrame(tick);
    }

    /** @param {Cell} c @param {number} now */
    function start(c, now) {
      if (c.pcol !== null) { setCol(c, c.pcol); c.pcol = null; }
      c.nxt = /** @type {string} */ (c.q.shift());
      c.fa.dataset.c = c.cur;
      c.fz.dataset.c = c.nxt;
      c.el.dataset.t = c.nxt;
      c.el.style.setProperty('--a', '0');
      c.el.classList.add('is-f');
      c.t0 = now;
      const base = 55 + Math.random() * 15 + (Math.random() * 30 - 15);
      c.dur = Math.max(45, Math.min(85, base)) * c.slow;
      Sound.click(c.slow > 1 ? 1.7 : 1);
    }

    /** @param {number} now */
    function tick(now) {
      raf = 0;
      for (const c of active) {
        if (c.t0 < 0) {
          if (now >= c.wait) start(c, now);
          continue;
        }
        const p = (now - c.t0) / c.dur;
        if (p < 1) {
          c.el.style.setProperty('--a', (180 * leafEase(p)).toFixed(1));
          continue;
        }
        c.el.dataset.b = c.nxt;
        c.cur = c.nxt;
        c.t0 = -1;
        if (c.q.length) start(c, now);
        else { c.el.classList.remove('is-f'); active.delete(c); }
      }
      if (active.size) raf = requestAnimationFrame(tick);
    }

    /**
     * Freeze a leaf mid-fall for a still frame.
     * @param {Cell} c @param {string} from @param {string} toCh @param {number} angle degrees (0 = upright, 180 = landed)
     */
    function freeze(c, from, toCh, angle) {
      active.delete(c);
      c.q.length = 0;
      c.t0 = -1;
      c.el.dataset.t = toCh;
      c.el.dataset.b = from;
      c.fa.dataset.c = from;
      c.fz.dataset.c = toCh;
      c.el.style.setProperty('--a', String(angle));
      c.el.classList.add('is-f');
      c.cur = from;
      c.nxt = toCh;
    }

    /** @param {string} set @param {string} ch @param {number} [k] */
    function prev(set, ch, k = 1) {
      const n = set.length;
      const j = set.indexOf(ch);
      return set[(((j - k) % n) + n) % n];
    }

    return { make, show, to, freeze, prev };
  })();

  /* ------------------------------------------------------------------ *
   * boards
   * ------------------------------------------------------------------ */

  /**
   * @typedef {{k: string, n: number, set?: string}} Field
   * @typedef {{td: HTMLElement, sr: HTMLElement|null, cells: Cell[]}} FieldCells
   * @typedef {Record<string, FieldCells>} BoardRow
   * @typedef {{txt: string, sr: string, cols?: string[]|null, col?: string}} FieldData
   */

  /**
   * Fill every td of a board table with flap cells (visuals are aria-hidden; the td keeps its text).
   * @param {HTMLElement} board
   * @param {Field[]} fields
   * @returns {BoardRow[]}
   */
  function buildBoard(board, fields) {
    return $$('tbody tr', board).map((tr) => {
      /** @type {BoardRow} */
      const row = {};
      for (const f of fields) {
        const td = /** @type {HTMLElement} */ (tr.querySelector(`td[data-k="${f.k}"]`));
        const wrap = document.createElement('span');
        wrap.className = 'cells';
        wrap.setAttribute('aria-hidden', 'true');
        /** @type {Cell[]} */
        const cells = [];
        for (let i = 0; i < f.n; i++) {
          const c = Flap.make(' ', f.set || SET);
          cells.push(c);
          wrap.append(c.el);
        }
        td.append(wrap);
        row[f.k] = { td, sr: td.querySelector('.ct'), cells };
      }
      return row;
    });
  }

  /**
   * Snap flap metrics to whole pixels so every gap and split line stays crisp.
   * @param {HTMLElement} board
   */
  function fitBoard(board) {
    const cs = getComputedStyle(board);
    const cols = parseFloat(cs.getPropertyValue('--board-cols')) || 79;
    const mode = cs.getPropertyValue('--board-mode').trim();
    const ratio = parseFloat(cs.getPropertyValue('--board-ratio')) || 1.58;
    let w;
    if (mode === 'mini') {
      const tr = /** @type {HTMLElement|null} */ (board.querySelector('tbody tr'));
      if (!tr) return;
      const t = getComputedStyle(tr);
      w = tr.clientWidth - parseFloat(t.paddingLeft) - parseFloat(t.paddingRight);
    } else {
      w = board.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    }
    const gap = 2;
    const pitch = Math.max(9, Math.floor((w + gap) / cols));
    const cw = pitch - gap;
    const fields = parseFloat(cs.getPropertyValue('--board-fields')) || 1;
    const colx = mode === 'mini' || fields < 2 ? 0 : Math.max(0, Math.floor((w - (cols * pitch - gap)) / (fields - 1)));
    const vals = {
      '--colx': colx + 'px',
      '--cw': cw + 'px',
      '--ch': Math.round(cw * ratio) + 'px',
      '--gap': gap + 'px',
      '--fs': Math.round(cw * 1.2 * 2) / 2 + 'px',
      '--rg': Math.max(4, Math.round(cw * 0.36)) + 'px',
    };
    for (const [k, v] of Object.entries(vals)) if (board.style.getPropertyValue(k) !== v) board.style.setProperty(k, v);
  }

  /** @param {HTMLElement} board */
  function autoFit(board) {
    fitBoard(board);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => fitBoard(board)).observe(board);
    else W.addEventListener('resize', () => fitBoard(board));
  }

  /**
   * Write one row. Cells cascade left → right (column stagger) unless `instant`.
   * @param {BoardRow} row
   * @param {Field[]} fields
   * @param {Record<string, FieldData>} data
   * @param {{instant?: boolean, delay?: number, stagger?: number}} [o]
   */
  function renderRow(row, fields, data, o = {}) {
    const stagger = o.stagger === undefined ? 18 : o.stagger;
    let x = 0;
    for (const f of fields) {
      const fc = row[f.k];
      const d = data[f.k];
      if (fc && d) {
        const txt = pad(d.txt, f.n);
        if (fc.sr) fc.sr.textContent = d.sr;
        fc.cells.forEach((c, i) => {
          const col = d.cols ? d.cols[i] || '' : d.col || '';
          if (o.instant) Flap.show(c, txt[i], col);
          else Flap.to(c, txt[i], (o.delay || 0) + (x + i) * stagger, col);
        });
      }
      x += f.n + 1;
    }
  }

  /** @param {number} v @param {number} d */
  const scoreTxt = (v, d) => `${v} ${d < 0 ? '▼' : d > 0 ? '▲' : '·'}${Math.abs(d)}`;
  /** @param {number} v @param {number} d */
  const scoreSr = (v, d) => (d < 0 ? `${v}, padec za ${-d}` : d > 0 ? `${v}, porast za ${d}` : `${v}, brez spremembe`);
  /** @param {string} txt @param {number} d */
  const scoreCols = (txt, d) => Array.from(txt).map((_, i) => (i <= txt.indexOf(' ') ? '' : d < 0 ? 'r' : d > 0 ? 'g' : 'm'));
  /** @param {string} st */
  const stCol = (st) => (st === 'w' ? '' : st);

  /** Today's 6.00 changes (shared brief §4). [time, company, place, event, index, change, status, colour] */
  const EVENTS = [
    ['06.00', 'Kovač Gradnje d.o.o.', 'Maribor', 'Blokada TRR', 34, -29, 'Rdeče', 'r'],
    ['06.00', 'Strojna Krajnc d.o.o.', 'Velenje', 'Letno poročilo manjka', 46, -7, 'Oranžno', 'a'],
    ['06.01', 'Novak Elektro d.o.o.', 'Celje', 'Zamuda plačil +12 dni', 58, -6, 'Rumeno', 'y'],
    ['06.01', 'Hribar Les d.o.o.', 'Škofja Loka', 'Ocena izboljšana', 87, 3, 'Zeleno', 'g'],
    ['06.02', 'Tiskarna Vidmar d.o.o.', 'Nova Gorica', 'Vložena izvršba', 41, -9, 'Oranžno', 'a'],
    ['06.02', 'Zupan Transport d.o.o.', 'Koper', 'Nov direktor', 71, 0, 'Info', 'w'],
    ['06.03', 'Pekarna Zrno d.o.o.', 'Kranj', 'Odprava blokade', 79, 11, 'Zeleno', 'g'],
    ['06.03', 'Avtoservis Horvat s.p.', 'Murska Sobota', 'Davčni dolg poravnan', 63, 8, 'Zeleno', 'g'],
  ];
  /** @type {Field[]} */
  const HERO_FIELDS = [{ k: 'time', n: 5, set: DRUM_TIME }, { k: 'company', n: 22 }, { k: 'place', n: 13 }, { k: 'event', n: 21 }, { k: 'score', n: 6, set: DRUM_SCORE }, { k: 'status', n: 7 }];

  /** @param {any[]} e @returns {Record<string, FieldData>} */
  function eventData(e) {
    const [time, company, place, event, v, d, status, st] = e;
    const score = scoreTxt(v, d);
    return {
      time: { txt: time, sr: time },
      company: { txt: UP(company), sr: company },
      place: { txt: UP(place), sr: place },
      event: { txt: UP(event), sr: event },
      score: { txt: score, sr: scoreSr(v, d), cols: scoreCols(score, d) },
      status: { txt: UP(status), sr: status, col: stCol(st) },
    };
  }

  /** Hero departures board: cascade in, then a new event enters at the top every 4.5 s. */
  function initHeroBoard() {
    const board = $('[data-board="hero"]');
    if (!board) return;
    const rows = buildBoard(board, HERO_FIELDS);
    autoFit(board);
    const toggle = $('[data-board-toggle]', board);
    const label = toggle ? $('[data-label]', toggle) : null;
    const trs = $$('tbody tr', board);

    const shown = $('[data-shown]', board);
    const countShown = () => {
      if (!shown) return;
      const n = trs.filter((tr) => getComputedStyle(tr).position !== 'absolute').length;
      shown.textContent = `${plural(n, 'Prikazana', 'Prikazani', 'Prikazane', 'Prikazanih')} ${n} od 1.284 sprememb`;
    };
    countShown();
    window.addEventListener('resize', countShown);
    if (REDUCED) {
      const foot = $('#hero-board-foot');
      if (foot && shown) { foot.textContent = ''; foot.append(shown, ' · torek 6.\u00a010.\u00a02026'); }
    }

    /** @param {number[]} order */
    const markRows = (order) => trs.forEach((tr, i) => tr.classList.toggle('is-red', EVENTS[order[i]][7] === 'r'));

    if (!MOTION) {
      rows.forEach((r, i) => renderRow(r, HERO_FIELDS, eventData(EVENTS[i]), { instant: true }));
      if (CAPTURE) {
        // the still: two numeric flaps of row 1 are caught landing — the last digit of 06.00
        // and the ones digit of ▼29 (new top · falling leaf · old bottom). Every word stays legible.
        /** @type {[Cell, number][]} */
        const still = [[rows[0].time.cells[4], 132], [rows[0].score.cells[5], 138]];
        still.forEach(([c, a]) => Flap.freeze(c, Flap.prev(c.set, c.cur), c.cur, a));
      }
      if (REDUCED && toggle) toggle.hidden = true;
      return;
    }

    rows.forEach((r, i) => renderRow(r, HERO_FIELDS, eventData(EVENTS[i]), { delay: 520 + i * 120 }));
    const order = EVENTS.map((_, i) => i);
    let paused = false;
    let inView = true;
    watch(board, (v) => { inView = v; });

    const step = () => {
      window.setTimeout(step, 4500);
      if (paused || !inView || document.hidden) return;
      order.unshift(/** @type {number} */ (order.pop()));
      rows.forEach((r, i) => renderRow(r, HERO_FIELDS, eventData(EVENTS[order[i]]), { delay: i * 70 }));
      markRows(order);
    };
    window.setTimeout(step, 4500 + 1600);

    if (toggle) {
      toggle.addEventListener('click', () => {
        paused = !paused;
        board.classList.toggle('is-paused', paused);
        if (label) label.textContent = paused ? 'Nadaljuj' : 'Ustavi';
      });
    }
  }

  /** "Vaš peron": personal board of six partners. */
  const PARTNERS = [
    ['Kovač Gradnje d.o.o.', 34, -29, 'Rdeče', 'r'],
    ['Strojna Krajnc d.o.o.', 46, -7, 'Oranžno', 'a'],
    ['Novak Elektro d.o.o.', 58, -6, 'Rumeno', 'y'],
    ['Zupan Transport d.o.o.', 71, 0, 'Info', 'w'],
    ['Pekarna Zrno d.o.o.', 79, 11, 'Zeleno', 'g'],
    ['Hribar Les d.o.o.', 87, 3, 'Zeleno', 'g'],
  ];
  /** @type {Field[]} */
  const PERON_FIELDS = [{ k: 'company', n: 22 }, { k: 'score', n: 6, set: DRUM_SCORE }, { k: 'status', n: 7 }];

  /** @param {any[]} p @returns {Record<string, FieldData>} */
  function partnerData(p) {
    const [company, v, d, status, st] = p;
    const score = scoreTxt(v, d);
    return {
      company: { txt: UP(company), sr: company },
      score: { txt: score, sr: scoreSr(v, d), cols: scoreCols(score, d) },
      status: { txt: UP(status), sr: status, col: stCol(st) },
    };
  }

  function initPeronBoard() {
    const board = $('[data-board="peron"]');
    if (!board) return;
    const rows = buildBoard(board, PERON_FIELDS);
    autoFit(board);
    if (!MOTION) {
      rows.forEach((r, i) => renderRow(r, PERON_FIELDS, partnerData(PARTNERS[i]), { instant: true }));
      return;
    }
    let done = false;
    watch(board, (v) => {
      if (!v || done) return;
      done = true;
      rows.forEach((r, i) => renderRow(r, PERON_FIELDS, partnerData(PARTNERS[i]), { delay: 200 + i * 140, stagger: 22 }));
    }, -120);
  }

  /** Small flap chips in the report timetable (impact on score). */
  function initImpactFlaps() {
    $$('.tt__v').forEach((el) => {
      const txt = (el.textContent || '').trim();
      const disp = txt.replace('±', '·');
      const sr = document.createElement('span');
      sr.className = 'sr';
      sr.textContent = txt === '±0' ? 'brez vpliva' : txt.replace('−', 'minus ');
      const wrap = document.createElement('span');
      wrap.className = 'cells tt__cells';
      wrap.setAttribute('aria-hidden', 'true');
      const s = pad(' '.repeat(Math.max(0, 3 - disp.length)) + disp, 3);
      for (const ch of s) {
        const c = Flap.make(ch);
        if (el.classList.contains('tt__v--r')) c.el.dataset.col = 'r';
        wrap.append(c.el);
      }
      el.textContent = '';
      el.classList.add('tt__v--flap');
      el.append(sr, wrap);
    });
  }

  /* ------------------------------------------------------------------ *
   * countdown to the next 6.00 (giant flaps, descending drums)
   * ------------------------------------------------------------------ */
  function initCountdown() {
    const host = $('[data-countdown]');
    if (!host) return;
    const boardEl = /** @type {HTMLElement} */ ($('.cd__board', host));
    const srText = $('[data-cd-text]', host);
    /** @type {Record<string, string[]>} */
    const drums = { h: ['210', '9876543210'], m: ['543210', '9876543210'], s: ['543210', '9876543210'] };
    /** @type {Record<string, Cell[]>} */
    const cells = {};
    for (const k of ['h', 'm', 's']) {
      const g = /** @type {HTMLElement} */ ($(`[data-cd="${k}"]`, host));
      cells[k] = drums[k].map((set) => {
        const c = Flap.make('0', set, 2.8);
        g.append(c.el);
        return c;
      });
    }

    const fit = () => {
      const w = host.clientWidth;
      const small = w < 600;
      const padX = small ? 28 : 80;
      const gap = small ? 4 : 8;
      const cw = Math.max(36, Math.min(124, Math.floor((w - padX - 3 * gap) / 6.98)));
      boardEl.style.setProperty('--cw', cw + 'px');
      boardEl.style.setProperty('--ch', Math.round(cw * 1.56) + 'px');
      boardEl.style.setProperty('--fs', Math.round(cw * 1.22) + 'px');
      boardEl.style.setProperty('--gap', gap + 'px');
    };
    fit();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(host);

    const secsToSix = () => {
      const { h, m, s } = ljNow();
      let secs = 6 * 3600 - (h * 3600 + m * 60 + s);
      if (secs <= 0) secs += 86400;
      return secs;
    };

    /** @param {number} secs @param {boolean} animate */
    const render = (secs, animate) => {
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      /** @type {Record<string, string>} */
      const str = { h: two(h), m: two(m), s: two(s) };
      for (const k of ['h', 'm', 's']) {
        cells[k].forEach((c, i) => (animate ? Flap.to(c, str[k][i], i * 50) : Flap.show(c, str[k][i])));
      }
      if (srText) {
        srText.textContent = `Do naslednje posodobitve: ${h} ${plural(h, 'ura', 'uri', 'ure', 'ur')}, ${m} ${plural(m, 'minuta', 'minuti', 'minute', 'minut')} in ${s} ${plural(s, 'sekunda', 'sekundi', 'sekunde', 'sekund')}.`;
      }
    };

    if (CAPTURE) { render(7 * 3600 + 59 * 60 + 46, false); return; }
    render(secsToSix(), false);
    let visible = false;
    watch(host, (v) => { visible = v; });
    const loop = () => {
      window.setTimeout(loop, 1000 - (Date.now() % 1000) + 8);
      render(secsToSix(), MOTION && visible && !document.hidden);
    };
    window.setTimeout(loop, 1000 - (Date.now() % 1000) + 8);
  }

  /* ------------------------------------------------------------------ *
   * live clock in the status bars
   * ------------------------------------------------------------------ */
  function initClock() {
    const els = $$('[data-clock]');
    if (CAPTURE) { els.forEach((e) => { e.textContent = '06:00:14'; }); return; }
    const upd = () => {
      const t = ljNow();
      const s = `${two(t.h)}:${two(t.m)}:${two(t.s)}`;
      els.forEach((e) => { e.textContent = s; });
    };
    upd();
    window.setInterval(() => { if (!document.hidden) upd(); }, 1000);
  }

  /* ------------------------------------------------------------------ *
   * ticker band
   * ------------------------------------------------------------------ */
  function initTicker() {
    const t = $('[data-ticker]');
    if (!t) return;
    const move = $('[data-ticker-move]', t);
    const list = move ? $('.ticker__list', move) : null;
    const btn = $('[data-ticker-toggle]', t);
    if (!MOTION) { if (btn) btn.hidden = true; return; }
    if (move && list) {
      const clone = /** @type {HTMLElement} */ (list.cloneNode(true));
      clone.setAttribute('aria-hidden', 'true');
      $$('.sr', clone).forEach((e) => e.remove());
      move.append(clone);
    }
    if (btn) {
      btn.addEventListener('click', () => {
        const p = t.classList.toggle('is-paused');
        btn.setAttribute('aria-label', p ? 'Nadaljuj trak' : 'Ustavi trak');
      });
    }
    watch(t, (v) => t.classList.toggle('is-off', !v));
  }

  /* ------------------------------------------------------------------ *
   * counters: flap-style digit roll
   * ------------------------------------------------------------------ */
  function initCounters() {
    const els = $$('.cnt__n, .rep__n');
    els.forEach((el) => {
      const txt = (el.textContent || '').trim();
      const sr = document.createElement('span');
      sr.className = 'sr';
      sr.textContent = txt;
      const vis = document.createElement('span');
      vis.setAttribute('aria-hidden', 'true');
      for (const ch of txt) {
        const s = document.createElement('span');
        s.className = /\d/.test(ch) ? 'dg' : 'dp';
        s.textContent = ch;
        vis.append(s);
      }
      el.textContent = '';
      el.append(sr, vis);
    });
    if (!MOTION) return;
    els.forEach((el) => {
      let done = false;
      watch(el, (v) => { if (v && !done) { done = true; roll(el); } }, -80);
    });
  }

  /** @param {HTMLElement} el */
  function roll(el) {
    const digits = $$('.dg', el);
    const finals = digits.map((d) => +(d.textContent || 0));
    digits.forEach((d) => { d.style.width = d.getBoundingClientRect().width + 'px'; });
    const from = el.dataset.rollFrom ? +el.dataset.rollFrom : null;
    const target = +finals.join('');
    const dur = 900;
    const t0 = performance.now();
    /** @param {number} now */
    const frame = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      if (from !== null) {
        const v = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3)));
        const s = String(v).padStart(digits.length, '0');
        digits.forEach((d, i) => { d.textContent = s[i]; });
      } else {
        digits.forEach((d, i) => {
          const steps = 6 + (digits.length - 1 - i) * 4;
          const q = Math.min(1, Math.max(0, (now - t0 - i * 50) / (dur - i * 50)));
          const k = Math.floor((1 - Math.pow(1 - q, 2)) * steps);
          d.textContent = String((((finals[i] - steps + k) % 10) + 10) % 10);
        });
      }
      if (p < 1) requestAnimationFrame(frame);
      else digits.forEach((d, i) => { d.textContent = String(finals[i]); });
    };
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ *
   * sparklines: last 30 days as bars (deterministic)
   * ------------------------------------------------------------------ */
  function initSparks() {
    $$('[data-spark]').forEach((svg) => {
      const final = +(svg.dataset.spark || 0);
      const r = mulberry(+(svg.dataset.sparkSeed || 1));
      /** @type {number[]} */
      const vals = [];
      for (let d = 0; d < 30; d++) {
        const wd = (((2 - (29 - d)) % 7) + 7) % 7; // 0 = nedelja; today (d = 29) is a Tuesday
        const wk = wd === 1 ? 0.5 : wd === 0 ? 0.38 : 1;
        vals.push(final * (0.66 + r() * 0.46) * wk);
      }
      vals[29] = final;
      const max = Math.max(...vals) * 1.02;
      const bw = 240 / 30;
      let out = '<line class="sp-base" x1="0" y1="47.5" x2="240" y2="47.5"/>';
      vals.forEach((v, i) => {
        const h = Math.max(2, (v / max) * 45);
        out += `<rect class="sp-bar${i === 29 ? ' is-now' : ''}" x="${(i * bw + 1).toFixed(2)}" y="${(47 - h).toFixed(2)}" width="${(bw - 2).toFixed(2)}" height="${h.toFixed(2)}"/>`;
      });
      svg.setAttribute('viewBox', '0 0 240 48');
      svg.innerHTML = out;
    });
  }

  /* ------------------------------------------------------------------ *
   * rail line (TIR 2): SVG drawn from data, train runs a 9 s loop
   * ------------------------------------------------------------------ */
  const RAIL = {
    h: {
      vb: [1360, 392],
      start: [40, 200],
      model: [1000, 200],
      stations: [
        { p: [40, 200], name: 'AJPES', cap: ['LETNA POROČILA', 'POSLOVNI REGISTER', '1× LETNO · VSAK DAN'] },
        { p: [230, 200], name: 'BLOKADE TRR', cap: ['TRANSAKCIJSKI RAČUNI', 'VSAK DAN 6.00'] },
        { p: [420, 200], name: 'FURS', cap: ['DAVČNI DOLŽNIKI', 'VSAK DAN 6.00'] },
        { p: [610, 200], name: 'SODIŠČA', cap: ['STEČAJI, IZVRŠBE', 'VSAK DAN 6.00'] },
        { p: [800, 200], name: 'PLAČILNE IZKUŠNJE', cap: ['4,2 MIO RAČUNOV', 'SPROTI'] },
      ],
      branches: [
        { d: 'M1000 200 H1072 L1172 100 H1330', end: [1330, 100], name: 'E-POŠTA / SMS', cap: 'OPOZORILO OB 6.02' },
        { d: 'M1000 200 H1330', end: [1330, 200], name: 'SLACK / TEAMS', cap: 'V KANAL EKIPE' },
        { d: 'M1000 200 H1072 L1172 300 H1330', end: [1330, 300], name: 'ERP / API', cap: 'SAMODEJNO V ERP' },
      ],
    },
    v: {
      vb: [358, 1010],
      start: [22, 24],
      model: [22, 650],
      stations: [
        { p: [22, 24], name: 'AJPES', cap: ['LETNA POROČILA', 'POSLOVNI REGISTER', '1× LETNO · VSAK DAN'] },
        { p: [22, 144], name: 'BLOKADE TRR', cap: ['TRANSAKCIJSKI RAČUNI', 'VSAK DAN 6.00'] },
        { p: [22, 264], name: 'FURS', cap: ['DAVČNI DOLŽNIKI', 'VSAK DAN 6.00'] },
        { p: [22, 384], name: 'SODIŠČA', cap: ['STEČAJI, IZVRŠBE', 'VSAK DAN 6.00'] },
        { p: [22, 504], name: 'PLAČILNE IZKUŠNJE', cap: ['4,2 MIO RAČUNOV', 'SPROTI'] },
      ],
      branches: [
        { d: 'M22 650 V746 L52 776 H104', end: [104, 776], name: 'E-POŠTA / SMS', cap: 'OPOZORILO OB 6.02' },
        { d: 'M22 650 V846 L52 876 H104', end: [104, 876], name: 'SLACK / TEAMS', cap: 'V KANAL EKIPE' },
        { d: 'M22 650 V946 L52 976 H104', end: [104, 976], name: 'ERP / API', cap: 'SAMODEJNO V ERP' },
      ],
    },
  };

  function initRail() {
    const fig = $('[data-rail]');
    const svg = /** @type {SVGSVGElement|null} */ (/** @type {unknown} */ ($('[data-rail-svg]')));
    if (!fig || !svg) return;
    const mq = window.matchMedia('(max-width: 1100px)');
    const toggle = $('[data-rail-toggle]', fig);
    const toggleLabel = toggle ? $('[data-label]', toggle) : null;
    const T = 9;
    const NS = 'http://www.w3.org/2000/svg';

    /** @type {{main: SVGPathElement, branches: SVGPathElement[], lens: number[], mainLen: number, stops: number[], lits: SVGElement[], glows: SVGElement[], termLits: SVGElement[], modelLit: SVGElement, train: SVGGElement, mini: SVGGElement[]}|null} */
    let G = null;

    const draw = () => {
      const L = mq.matches ? RAIL.v : RAIL.h;
      const vert = L === RAIL.v;
      const [sx, sy] = L.start;
      const [mx, my] = L.model;
      let s = '';
      // ticks under the main line (sleepers)
      const len = vert ? my - sy : mx - sx;
      for (let i = 12; i < len; i += 24) {
        s += vert
          ? `<line class="r-tick" x1="${sx - 10}" y1="${sy + i}" x2="${sx + 10}" y2="${sy + i}"/>`
          : `<line class="r-tick" x1="${sx + i}" y1="${sy - 10}" x2="${sx + i}" y2="${sy + 10}"/>`;
      }
      L.branches.forEach((b) => { s += `<path class="r-line r-line--b" d="${b.d}"/>`; });
      s += `<path class="r-line" data-main d="M${sx} ${sy} ${vert ? 'V' + my : 'H' + mx}"/>`;
      // terminals
      L.branches.forEach((b) => {
        const [x, y] = b.end;
        s += `<circle class="r-ring r-ring--y" cx="${x}" cy="${y}" r="11"/><circle class="r-lit" data-tlit cx="${x}" cy="${y}" r="5.5"/>`;
        if (vert) {
          s += `<text class="r-name" x="${x + 26}" y="${y + 1}">${b.name}</text><text class="r-cap" x="${x + 26}" y="${y + 19}">${b.cap}</text>`;
        } else {
          s += `<text class="r-name" x="${x + 11}" y="${y - 24}" text-anchor="end">${b.name}</text><text class="r-cap" x="${x + 11}" y="${y + 34}" text-anchor="end">${b.cap}</text>`;
        }
      });
      // source stations
      L.stations.forEach((st) => {
        const [x, y] = st.p;
        s += `<circle class="r-glow" data-glow cx="${x}" cy="${y}" r="19"/><circle class="r-ring" cx="${x}" cy="${y}" r="11"/><circle class="r-lit" data-lit cx="${x}" cy="${y}" r="6"/>`;
        if (vert) {
          s += `<text class="r-name" x="${x + 30}" y="${y + 5}">${st.name}</text>`;
          st.cap.forEach((c, k) => { s += `<text class="r-cap" x="${x + 30}" y="${y + 25 + k * 16}">${c}</text>`; });
        } else {
          s += `<text class="r-name" x="${x - 11}" y="${y - 30}">${st.name}</text>`;
          st.cap.forEach((c, k) => { s += `<text class="r-cap" x="${x - 11}" y="${y + 40 + k * 17}">${c}</text>`; });
        }
      });
      // interchange
      s += `<circle class="r-ring" cx="${mx}" cy="${my}" r="27"/><circle class="r-ring r-ring--y" cx="${mx}" cy="${my}" r="17"/>`;
      s += `<circle class="r-lit" data-mlit cx="${mx}" cy="${my}" r="13"/>`;
      s += `<text class="r-j" x="${mx}" y="${my + 8}" text-anchor="middle">J</text>`;
      if (vert) {
        s += `<text class="r-name r-name--y" x="${mx + 44}" y="${my - 3}">JASNO MODEL</text><text class="r-cap" x="${mx + 44}" y="${my + 17}">INDEKS 0–100 V 3 SEKUNDAH</text>`;
      } else {
        s += `<text class="r-name r-name--y" x="${mx}" y="${my - 46}" text-anchor="middle">JASNO MODEL</text><text class="r-cap" x="${mx}" y="${my + 56}" text-anchor="middle">INDEKS 0–100</text><text class="r-cap" x="${mx}" y="${my + 73}" text-anchor="middle">V 3 SEKUNDAH</text>`;
      }
      // trains
      s += '<g data-train><rect class="r-train" x="-19" y="-8" width="38" height="16" rx="5"/><rect class="r-train-win" x="8" y="-4" width="7" height="8" rx="1.5"/><rect class="r-train-win" x="-3" y="-4" width="7" height="8" rx="1.5"/></g>';
      L.branches.forEach(() => { s += '<g data-mini><rect class="r-train" x="-13" y="-6" width="26" height="12" rx="4"/><rect class="r-train-win" x="4" y="-3" width="5" height="6" rx="1"/></g>'; });
      svg.setAttribute('viewBox', `0 0 ${L.vb[0]} ${L.vb[1]}`);
      svg.innerHTML = s;

      const main = /** @type {SVGPathElement} */ (svg.querySelector('[data-main]'));
      const branches = /** @type {SVGPathElement[]} */ (Array.from(svg.querySelectorAll('.r-line--b')));
      return {
        main,
        branches,
        lens: branches.map((b) => b.getTotalLength()),
        mainLen: main.getTotalLength(),
        stops: L.stations.map((st) => (vert ? st.p[1] - sy : st.p[0] - sx)).concat([vert ? my - sy : mx - sx]),
        lits: /** @type {SVGElement[]} */ (Array.from(svg.querySelectorAll('[data-lit]'))),
        glows: /** @type {SVGElement[]} */ (Array.from(svg.querySelectorAll('[data-glow]'))),
        termLits: /** @type {SVGElement[]} */ (Array.from(svg.querySelectorAll('[data-tlit]'))),
        modelLit: /** @type {SVGElement} */ (svg.querySelector('[data-mlit]')),
        train: /** @type {SVGGElement} */ (svg.querySelector('[data-train]')),
        mini: /** @type {SVGGElement[]} */ (Array.from(svg.querySelectorAll('[data-mini]'))),
      };
    };

    // schedule: dwell 0.3 s, then 0.75 s per leg with 0.25 s stops; model at 5.05 s; branches 5.6 → 7.2 s
    const LEG = 0.75, STOP = 0.25, DEP = 0.3;
    const arrive = (/** @type {number} */ i) => DEP + i * (LEG + STOP) + LEG; // arrival at stop i+1
    const MODEL_AT = arrive(4);
    const BR0 = 5.6, BR1 = 7.2, BR_OUT = 7.8;

    /**
     * Distance of the main train along the main line at time t, or -1 when hidden.
     * @param {number} t
     */
    const mainDist = (t) => {
      if (!G) return -1;
      const stops = G.stops;
      if (t < DEP) return 0;
      for (let i = 0; i < stops.length - 1; i++) {
        const t0 = DEP + i * (LEG + STOP);
        const t1 = t0 + LEG;
        if (t < t0) return stops[i];
        if (t <= t1) return stops[i] + (stops[i + 1] - stops[i]) * inOut((t - t0) / LEG);
      }
      return t < MODEL_AT + 0.12 ? stops[stops.length - 1] : -1;
    };

    /**
     * @param {SVGGElement} g @param {SVGPathElement} path @param {number} d @param {number} len
     */
    const place = (g, path, d, len) => {
      const a = path.getPointAtLength(Math.max(0, Math.min(len, d)));
      const b = path.getPointAtLength(Math.max(0, Math.min(len, d + 1)));
      const c = path.getPointAtLength(Math.max(0, Math.min(len, d - 1)));
      const ang = (Math.atan2(b.y - c.y, b.x - c.x) * 180) / Math.PI;
      g.setAttribute('transform', `translate(${a.x.toFixed(1)} ${a.y.toFixed(1)}) rotate(${ang.toFixed(1)})`);
    };

    /** Render a frame at time t. `still` sets light levels directly instead of using fades. @param {number} t @param {boolean} still */
    const frame = (t, still) => {
      if (!G) return;
      const d = mainDist(t);
      G.train.style.opacity = d < 0 ? '0' : '1';
      if (d >= 0) place(G.train, G.main, d, G.mainLen);
      const inBr = t >= BR0 && t <= BR_OUT;
      const bp = inOut(Math.min(1, Math.max(0, (t - BR0) / (BR1 - BR0))));
      G.mini.forEach((g, i) => {
        if (!G) return;
        g.style.opacity = inBr ? (t > BR1 ? String(Math.max(0, 1 - (t - BR1) / (BR_OUT - BR1))) : '1') : '0';
        if (inBr) place(g, G.branches[i], bp * G.lens[i], G.lens[i]);
      });
      if (still) {
        const fade = 2.2;
        G.lits.forEach((el, i) => {
          if (!G) return;
          const ta = i === 0 ? 0 : arrive(i - 1);
          const o = t >= ta ? Math.max(0, 1 - (t - ta) / fade) : 0;
          el.style.opacity = String(o);
          el.style.transition = 'none';
          G.glows[i].style.opacity = String(o * 0.5);
          G.glows[i].style.transition = 'none';
        });
      }
    };

    /** @param {SVGElement} el */
    const flash = (el) => {
      el.classList.add('is-on');
      window.setTimeout(() => el.classList.remove('is-on'), 260);
    };

    G = draw();
    mq.addEventListener('change', () => { G = draw(); if (!MOTION) frame(CAPTURE ? 4.62 : 0, true); });

    if (CAPTURE) { frame(4.62, true); return; }
    if (REDUCED) {
      if (G) { G.train.style.opacity = '0'; G.mini.forEach((g) => { g.style.opacity = '0'; }); }
      if (toggle) toggle.hidden = true;
      return;
    }

    let running = true;
    let visible = false;
    let raf = 0;
    let clock = 0;
    let last = 0;
    let prevT = 0;
    watch(fig, (v) => { visible = v; kick(); }, 100);

    const kick = () => { if (!raf && running && visible) { last = performance.now(); raf = requestAnimationFrame(loop); } };
    /** @param {number} now */
    const loop = (now) => {
      raf = 0;
      if (!running || !visible || document.hidden) return;
      clock += Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = clock % T;
      if (G) {
        const crossed = (/** @type {number} */ x) => (prevT <= t ? prevT < x && t >= x : prevT < x || t >= x);
        if (crossed(0.02)) { flash(G.lits[0]); flash(G.glows[0]); }
        for (let i = 0; i < 4; i++) if (crossed(arrive(i))) { flash(G.lits[i + 1]); flash(G.glows[i + 1]); }
        if (crossed(MODEL_AT)) flash(G.modelLit);
        if (crossed(BR1)) G.termLits.forEach(flash);
      }
      prevT = t;
      frame(t, false);
      raf = requestAnimationFrame(loop);
    };
    document.addEventListener('visibilitychange', kick);

    if (toggle) {
      toggle.addEventListener('click', () => {
        running = !running;
        fig.classList.toggle('is-paused', !running);
        if (toggleLabel) toggleLabel.textContent = running ? 'Ustavi vlak' : 'Nadaljuj';
        kick();
      });
    }
  }

  /* ------------------------------------------------------------------ *
   * ticket barcodes (deterministic)
   * ------------------------------------------------------------------ */
  function initBarcodes() {
    $$('[data-barcode]').forEach((el) => {
      const r = mulberry(hash(el.dataset.barcode || 'JS'));
      const stops = [];
      let x = 0;
      while (x < 100) {
        const w = (1 + Math.floor(r() * 3)) * 1.1;
        const g = (1 + Math.floor(r() * 2.6)) * 1.1;
        const a = Math.min(100, x + w);
        const b = Math.min(100, a + g);
        stops.push(`#0b0b0a ${x.toFixed(1)}% ${a.toFixed(1)}%`, `transparent ${a.toFixed(1)}% ${b.toFixed(1)}%`);
        x = b;
      }
      el.style.setProperty('--bars', `linear-gradient(90deg, ${stops.join(', ')})`);
    });
  }

  /* ------------------------------------------------------------------ *
   * company search (combobox over the example companies)
   * ------------------------------------------------------------------ */
  const CLASS = { A: 'Odlično', B: 'Dobro', C: 'Zmerno', D: 'Povišano', E: 'Visoko tveganje' };
  const COMPANIES = [
    { name: 'Kovač Gradnje d.o.o.', place: 'Maribor', sector: 'gradbeništvo', idx: 34, cls: 'E', pd: '18,6 %', limit: '0 €', term: 'samo predplačilo', ids: '6123456000 SI12345678' },
    { name: 'Hribar Les d.o.o.', place: 'Škofja Loka', sector: 'lesna industrija', idx: 87, cls: 'A', pd: '0,4 %', limit: '120.000 €', term: '60 dni', ids: '5874123000 SI87654321' },
    { name: 'Pekarna Zrno d.o.o.', place: 'Kranj', sector: 'živilska industrija', idx: 79, cls: 'B', pd: '0,6 %', limit: '30.000 €', term: '45 dni', ids: '' },
    { name: 'Zupan Transport d.o.o.', place: 'Koper', sector: 'logistika', idx: 71, cls: 'B', pd: '0,9 %', limit: '45.000 €', term: '45 dni', ids: '' },
    { name: 'Avtoservis Horvat s.p.', place: 'Murska Sobota', sector: 'avtoservis', idx: 63, cls: 'C', pd: '1,6 %', limit: '8.000 €', term: '30 dni', ids: '' },
    { name: 'Novak Elektro d.o.o.', place: 'Celje', sector: 'elektroinštalacije', idx: 58, cls: 'C', pd: '2,1 %', limit: '18.000 €', term: '30 dni', ids: '' },
    { name: 'Strojna Krajnc d.o.o.', place: 'Velenje', sector: 'strojegradnja', idx: 46, cls: 'D', pd: '5,8 %', limit: '6.000 €', term: '15 dni', ids: '' },
    { name: 'Tiskarna Vidmar d.o.o.', place: 'Nova Gorica', sector: 'tiskarstvo', idx: 41, cls: 'D', pd: '7,4 %', limit: '3.000 €', term: '15 dni', ids: '' },
  ];
  /** @param {string} s */
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  /** @param {string} s */
  const esc = (s) => s.replace(/[&<>"]/g, (ch) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

  function initSearch() {
    const form = /** @type {HTMLFormElement|null} */ ($('[data-search]'));
    const input = /** @type {HTMLInputElement|null} */ ($('[data-q]'));
    const list = $('[data-q-list]');
    const out = $('[data-q-out]');
    if (!form || !input || !list || !out) return;
    /** @type {typeof COMPANIES} */
    let opts = [];
    let act = -1;

    /** @param {string} q */
    const match = (q) => {
      const n = norm(q);
      const digits = q.replace(/\D/g, '');
      if (!n) return [];
      return COMPANIES.filter((c) => norm(`${c.name} ${c.place}`).includes(n) || (digits.length >= 3 && c.ids.replace(/\D/g, ' ').includes(digits)));
    };
    const close = () => {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      act = -1;
    };
    const paint = () => {
      list.innerHTML = opts
        .map((c, i) => `<li class="tm__opt" role="option" id="q-o-${i}" aria-selected="${i === act}"><span class="tm__opt-n">${esc(UP(c.name))}</span><span class="tm__opt-p">${esc(c.place)} · ${esc(c.sector)}</span><span class="tm__opt-i">${c.idx}<span class="tm__opt-c c-${c.cls.toLowerCase()}">${c.cls}</span></span></li>`)
        .join('');
      if (act >= 0) input.setAttribute('aria-activedescendant', `q-o-${act}`);
      else input.removeAttribute('aria-activedescendant');
    };
    const openList = () => {
      opts = match(input.value);
      act = opts.length ? 0 : -1;
      if (!opts.length) { close(); return; }
      paint();
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    };
    /** @param {(typeof COMPANIES)[number] | null} c @param {string} q */
    const showResult = (c, q) => {
      close();
      /** @param {string} v */
      const nb = (v) => esc(v).replace(/ (€|%)/g, '\u00a0$1');
      if (!c) {
        out.innerHTML = `<div class="res"><p class="res__top"><span>Ni zadetka</span><button class="res__x" type="button" aria-label="Zapri"><svg class="ico" aria-hidden="true"><use href="#i-close"/></svg></button></p><p class="res__msg">${q ? `Podjetja „${esc(q)}“` : 'Tega podjetja'} ni med predstavitvenimi podatki. Poskusite „Kovač“, „Hribar“ ali davčno številko SI 12345678.</p></div>`;
      } else {
        out.innerHTML = `<div class="res"><p class="res__top"><span>Rezultat · ocena v 3 sekundah</span><button class="res__x" type="button" aria-label="Zapri rezultat"><svg class="ico" aria-hidden="true"><use href="#i-close"/></svg></button></p>
          <p class="res__n">${esc(c.name)}</p><p class="res__p">${esc(c.place)} · ${esc(c.sector)}</p>
          <div class="res__row"><p class="res__i">${c.idx}<span class="sr"> od 100</span></p><p class="res__cls"><span class="tm__opt-c c-${c.cls.toLowerCase()}" aria-hidden="true">${c.cls}</span> Razred ${c.cls} · ${CLASS[/** @type {'A'|'B'|'C'|'D'|'E'} */ (c.cls)]}</p></div>
          <dl class="res__d"><dt>Verjetnost neplačila</dt><dd>${nb(c.pd)}</dd><dt>Kreditni limit</dt><dd>${nb(c.limit)}</dd><dt>Plačilni rok</dt><dd>${nb(c.term)}</dd></dl>
          <a class="btn btn--k" href="#porocilo">Oglejte si primer poročila<svg class="ico" aria-hidden="true"><use href="#i-arrow"/></svg></a></div>`;
      }
      const x = $('.res__x', out);
      if (x) x.addEventListener('click', () => { out.innerHTML = ''; input.focus(); });
    };

    input.addEventListener('input', () => { out.innerHTML = ''; openList(); });
    input.addEventListener('focus', () => { if (input.value) openList(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (list.hidden) openList();
        if (!opts.length) return;
        e.preventDefault();
        act = (act + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
        paint();
      } else if (e.key === 'Escape') {
        if (!list.hidden) { e.preventDefault(); close(); } else if (out.innerHTML) { out.innerHTML = ''; }
      }
    });
    list.addEventListener('mousedown', (e) => e.preventDefault());
    list.addEventListener('click', (e) => {
      const li = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[role="option"]'));
      if (!li) return;
      const i = +(li.id.split('-').pop() || 0);
      input.value = opts[i].name;
      showResult(opts[i], input.value);
    });
    input.addEventListener('blur', () => window.setTimeout(close, 120));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      const pick = act >= 0 && !list.hidden ? opts[act] : match(q)[0] || null;
      if (pick) input.value = pick.name;
      showResult(q ? pick : null, q);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && out.innerHTML && document.activeElement !== input) out.innerHTML = ''; });
  }

  /* ------------------------------------------------------------------ *
   * mobile menu
   * ------------------------------------------------------------------ */
  function initMenu() {
    const menu = $('[data-menu]');
    const openBtn = $('[data-menu-open]');
    const closeBtn = $('[data-menu-close]');
    if (!menu || !openBtn || !closeBtn) return;
    const open = () => {
      menu.hidden = false;
      openBtn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      closeBtn.focus();
    };
    const close = (focus = true) => {
      menu.hidden = true;
      openBtn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      if (focus) openBtn.focus();
    };
    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', () => close());
    $$('a', menu).forEach((a) => a.addEventListener('click', () => close(false)));
    menu.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      if (e.key !== 'Tab') return;
      const f = $$('a[href], button:not([hidden])', menu);
      const first = f[0];
      const lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    });
  }

  /* ------------------------------------------------------------------ *
   * motion: Lenis, intro, reveals
   * ------------------------------------------------------------------ */
  /** @type {any} */
  let lenis = null;

  /** @param {HTMLElement} el */
  function scrollToEl(el) {
    const off = -(($('.hdr') || { offsetHeight: 64 }).offsetHeight + 12);
    if (lenis) lenis.scrollTo(el, { offset: off, duration: 1.1 });
    else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + off, behavior: MOTION ? 'smooth' : 'auto' });
  }

  function initLinks() {
    const input = /** @type {HTMLInputElement|null} */ ($('[data-q]'));
    const form = $('[data-search]');
    $$('[data-to-search]').forEach((a) => {
      a.addEventListener('click', (e) => {
        if (!form || !input) return;
        e.preventDefault();
        scrollToEl(form);
        window.setTimeout(() => input.focus({ preventScroll: true }), MOTION ? 900 : 0);
      });
    });
    document.addEventListener('click', (e) => {
      const a = /** @type {HTMLAnchorElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('a[href^="#"]'));
      if (!a || a.hasAttribute('data-to-search') || e.defaultPrevented) return;
      const id = a.getAttribute('href') || '';
      if (id.length < 2) return;
      const target = document.getElementById(id.slice(1));
      if (!target) return;
      e.preventDefault();
      scrollToEl(target);
      history.replaceState(null, '', id);
      if (target.id === 'vsebina') target.focus({ preventScroll: true });
    });
  }

  function initMotion() {
    if (!MOTION || !gsap) return;
    if (ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
    if (W.ScrambleTextPlugin) gsap.registerPlugin(W.ScrambleTextPlugin);

    if (W.Lenis) {
      lenis = new W.Lenis({ duration: 1.05, easing: (/** @type {number} */ t) => 1 - Math.pow(1 - t, 3.2) });
      if (ScrollTrigger) lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((/** @type {number} */ time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    }

    // hero: lines rise; "Mi ga." cuts in hard — signage, not silk
    const lines = $$('.hero__h .ln__in');
    if (lines.length === 3) {
      gsap.from(lines.slice(0, 2), { yPercent: 104, duration: 0.8, ease: 'power4.out', stagger: 0.12, delay: 0.08 });
      gsap.set(lines[2], { visibility: 'hidden' });
      gsap.set(lines[2], { visibility: 'visible', delay: 1.08 });
    }

    // board header types in
    if (W.ScrambleTextPlugin) {
      $$('[data-board="hero"] thead th, [data-board="hero"] .board__cap span:last-child').forEach((el, i) => {
        const txt = el.textContent || '';
        gsap.to(el, { duration: 0.6, delay: 0.28 + i * 0.05, scrambleText: { text: txt, chars: 'ABCČDEFGHIJKLMNOPRSŠTUVZŽ0123456789', speed: 0.7 } });
      });
    }

    if (!ScrollTrigger) return;

    // yellow sections: hard horizontal wipe
    $$('[data-wipe]').forEach((sec) => {
      gsap.fromTo(sec, { clipPath: 'inset(0 100% 0 0)' }, {
        clipPath: 'inset(0 0% 0 0)', duration: 0.6, ease: 'power3.inOut',
        scrollTrigger: { trigger: sec, start: 'top 86%', once: true },
      });
    });

    // wayfinding names scramble on arrival
    if (W.ScrambleTextPlugin) {
      $$('.tir__name, .ybar__tag').forEach((el) => {
        const node = /** @type {HTMLElement} */ (el.lastChild && el.lastChild.nodeType === 3 ? el : el);
        const txt = (node.lastChild && node.lastChild.nodeType === 3 ? node.lastChild.textContent : node.textContent) || '';
        if (node.lastChild && node.lastChild.nodeType === 3) {
          const span = document.createElement('span');
          span.textContent = txt;
          node.lastChild.replaceWith(span);
          gsap.to(span, { duration: 0.6, scrambleText: { text: txt, chars: 'ABCČDEFGHIJKLMNOPRSŠTUVZŽ', speed: 0.8 }, scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
        }
      });
    }

    // tickets drop in like printed stubs (fast, mechanical)
    gsap.from('.tix__i', { y: 28, opacity: 0, duration: 0.5, ease: 'power3.out', stagger: 0.08, scrollTrigger: { trigger: '.tix', start: 'top 82%', once: true } });
  }

  /* ------------------------------------------------------------------ *
   * boot
   * ------------------------------------------------------------------ */
  initClock();
  initHeroBoard();
  initPeronBoard();
  initImpactFlaps();
  initCountdown();
  initTicker();
  initCounters();
  initSparks();
  initBarcodes();
  initSearch();
  initMenu();
  initRail();
  initLinks();
  initMotion();

  const ready = async () => {
    try { await document.fonts.ready; } catch (e) { /* ignore */ }
    try {
      await Promise.all([
        document.fonts.load('900 100px "Big Shoulders Display"', 'JASNOČŠŽ'),
        document.fonts.load('700 16px "JetBrains Mono"', 'ABCČŠŽ'),
        document.fonts.load('400 16px "JetBrains Mono"', 'abcčšž'),
      ]);
    } catch (e) { /* ignore */ }
    $$('[data-board]').forEach(fitBoard);
    if (ScrollTrigger && MOTION) ScrollTrigger.refresh();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    W.__READY__ = true;
  };
  ready();
})();
