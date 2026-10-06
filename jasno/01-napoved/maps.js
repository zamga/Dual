// @ts-check
/**
 * Napoved · maps of Slovenia from window.JASNO_GEO (country frame, viewBox 1000 × 650).
 * Hero synoptic stage, dark radar for the watchlist, and the regional "economic weather map".
 */
(function () {
  'use strict';

  /**
   * @typedef {{ x: number, y: number }} Pt
   * @typedef {{ id: string, name: string, x: number, y: number }} Seed
   * @typedef {{ x: number, y: number, name: string, idx: number, key?: string, cls?: string, glyph?: string, color?: string, storm?: boolean }} StationSpec
   */

  const NS = 'http://www.w3.org/2000/svg';
  const geo = /** @type {any} */ (window).JASNO_GEO;
  const F = geo ? geo.frames.country : null;
  const CITY = /** @type {Record<string, Pt>} */ ({});
  if (F) for (const c of F.cities) CITY[c.name] = { x: c.x, y: c.y };

  /**
   * @param {string} tag @param {Record<string, string | number>} [attrs] @returns {SVGElement}
   */
  function svgEl(tag, attrs = {}) {
    const el = /** @type {SVGElement} */ (document.createElementNS(NS, tag));
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    return el;
  }

  /** @param {number[][]} dots @returns {string} */
  function dotsPath(dots) {
    let d = '';
    for (const p of dots) d += `M${p[0]} ${p[1]}h0`;
    return d;
  }

  /**
   * Create the svg + html layer inside a container with aspect-ratio 1000/650.
   * Elements with data-sw get a stroke-width in CSS pixels regardless of the map scale.
   * @param {HTMLElement} box
   */
  function stage(box) {
    box.textContent = '';
    const svg = /** @type {SVGSVGElement} */ (svgEl('svg', { class: 'map__svg', viewBox: '0 0 1000 650', preserveAspectRatio: 'xMidYMid meet', focusable: 'false' }));
    const layer = document.createElement('div');
    layer.className = 'map__layer';
    box.append(svg, layer);
    const fit = () => {
      const w = box.clientWidth || 1000;
      const u = 1000 / w;
      svg.querySelectorAll('[data-sw]').forEach((el) => {
        el.setAttribute('stroke-width', String(Number(/** @type {SVGElement} */ (el).dataset.sw) * u));
      });
      box.style.setProperty('--map-scale', String(w / 1000));
    };
    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(box);
    requestAnimationFrame(fit);
    fit();
    return { svg, layer, fit };
  }

  /**
   * Place an absolutely positioned element at frame coordinates.
   * @param {HTMLElement} el @param {number} x @param {number} y
   */
  function place(el, x, y) {
    el.style.left = (x / 10).toFixed(3) + '%';
    el.style.top = (y / 6.5).toFixed(3) + '%';
  }

  /**
   * @param {HTMLElement} layer @param {StationSpec} s @returns {HTMLElement}
   */
  function station(layer, s) {
    const el = document.createElement('div');
    el.className = 'station' + (s.storm ? ' station--storm' : '') + (s.cls ? ' ' + s.cls : '');
    if (s.key) el.dataset.key = s.key;
    if (s.color) el.style.setProperty('--c', s.color);
    const glyph = s.glyph ? `<svg class="glyph" aria-hidden="true"><use href="#g-${s.glyph}"/></svg>` : '';
    el.innerHTML = `<span class="station__dot"></span><span class="station__label">${glyph}<span>${s.name}</span><b>${s.idx}</b></span>`;
    place(el, s.x, s.y);
    layer.appendChild(el);
    return el;
  }

  /**
   * Pressure centre label (V / N) centred on a frame point.
   * @param {HTMLElement} layer @param {'V' | 'N'} kind @param {number} x @param {number} y @param {number} value
   */
  function pcentre(layer, kind, x, y, value) {
    const el = document.createElement('div');
    el.className = 'pcentre pcentre--' + kind.toLowerCase();
    el.innerHTML = `<span class="pcentre__l">${kind}</span><span class="pcentre__v">${kind} · ${value}</span>`;
    place(el, x, y);
    layer.appendChild(el);
    return el;
  }


  /* ---------------------------------------------------------- label placer */
  /** @type {number[][] | null} */ let OUTLINE = null;
  /** Densified outline polyline in frame units (max 2.5 units between points). @returns {number[][]} */
  function outlinePts() {
    if (OUTLINE) return OUTLINE;
    const nums = (F.outline.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    /** @type {number[][]} */ const raw = [];
    for (let i = 0; i + 1 < nums.length; i += 2) raw.push([nums[i], nums[i + 1]]);
    /** @type {number[][]} */ const out = [];
    for (let i = 0; i < raw.length; i++) {
      const a = raw[i], b = raw[(i + 1) % raw.length];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2.5));
      for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    OUTLINE = out;
    return out;
  }

  /**
   * @typedef {{ x: number, y: number, w: number, h: number }} Rect
   * @param {Rect} a @param {Rect} b
   */
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  /**
   * Place station labels so none crosses the border, another label or an obstacle.
   * Candidates around each dot are scored; a greedy pass places stations in priority order and the
   * best of several orders wins (fewest weighted drops, then lowest score). Coordinates are box-local px.
   * @param {HTMLElement} box
   * @param {HTMLElement[]} stations
   * @param {{ obstacles?: Element[], fixed?: Element[], bounds?: Rect, drop?: boolean | 'label', weights?: Record<string, number> }} [o]
   */
  function placeLabels(box, stations, o = {}) {
    const br = box.getBoundingClientRect();
    if (!br.width) return;
    const s = br.width / 1000;
    const pts = outlinePts().filter((_, i) => i % 2 === 0).map((p) => [p[0] * s, p[1] * s]);
    /** @param {Element} el @returns {Rect} */
    const local = (el) => { const r = el.getBoundingClientRect(); return { x: r.left - br.left, y: r.top - br.top, w: r.width, h: r.height }; };
    /** @type {Rect[]} */ const taken = [];
    for (const el of o.obstacles || []) { const r = local(el); if (r.w && r.h) taken.push({ x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 8 }); }
    for (const el of o.fixed || []) { const r = local(el); if (r.w && r.h) taken.push({ x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 }); }
    // reset any previous drop so every label is measured at its real size
    for (const st of stations) { st.hidden = false; st.classList.remove('station--quiet'); }
    const bounds = o.bounds || { x: -br.left + 8, y: -br.top + 8, w: window.innerWidth - 16, h: 1e5 };
    const info = stations.map((st) => {
      const label = /** @type {HTMLElement} */ (st.querySelector('.station__label'));
      const d = local(/** @type {Element} */ (st.querySelector('.station__dot')));
      const cx = d.x + d.w / 2, cy = d.y + d.h / 2, w = label.offsetWidth, h = label.offsetHeight, g = 9;
      /** @type {[string, number, number][]} */
      const raw = [
        ['r', g, -h / 2], ['l', -g - w, -h / 2], ['b', -w / 2, g - 2], ['t', -w / 2, -g - h + 2],
        ['br', g - 4, 3], ['tr', g - 4, -h - 3], ['bl', -g - w + 4, 3], ['tl', -g - w + 4, -h - 3],
        ['r', g, -h / 2 - 9], ['r', g, -h / 2 + 9], ['l', -g - w, -h / 2 - 9], ['l', -g - w, -h / 2 + 9],
        ['b', -w / 2 - 24, g - 2], ['b', -w / 2 + 24, g - 2], ['t', -w / 2 - 24, -g - h + 2], ['t', -w / 2 + 24, -g - h + 2],
        ['b', -w * 0.15, g - 2], ['b', -w * 0.85, g - 2], ['t', -w * 0.15, -g - h + 2], ['t', -w * 0.85, -g - h + 2],
        ['tr', g + 10, -h - 4], ['br', g + 10, 4], ['tl', -g - w - 10, -h - 4], ['bl', -g - w - 10, 4],
        ['tr', g + 22, -h - 8], ['br', g + 22, 8], ['tl', -g - w - 22, -h - 8], ['bl', -g - w - 22, 8],
      ];
      // static cost of each candidate (border, obstacles, bounds), computed once
      const cands = raw.map(([dir, dx, dy], i) => {
        const r = { x: cx + dx - 2, y: cy + dy - 2, w: w + 4, h: h + 4 };
        let b = 0, ov = 0;
        for (const p of pts) if (p[0] > r.x && p[0] < r.x + r.w && p[1] > r.y && p[1] < r.y + r.h) b++;
        for (const t of taken) if (overlap(r, t)) ov++;
        const ob = r.x < bounds.x || r.y < bounds.y || r.x + r.w > bounds.x + bounds.w || r.y + r.h > bounds.y + bounds.h ? 1 : 0;
        return { dir, dx, dy, r, cost: i * 0.6 + b * 120 + ov * 400 + ob * 300, why: `${dir}#${i} border:${b} overlap:${ov} out:${ob}` };
      });
      const dot = { x: d.x - 2, y: d.y - 2, w: d.w + 4, h: d.h + 4 };
      return { st, label, dot, cands, weight: (o.weights && o.weights[st.dataset.key || '']) || 10 };
    });
    /** @param {number[]} order */
    const run = (order) => {
      /** @type {Rect[]} */ const placed = [];
      /** @type {any[]} */ const res = new Array(info.length);
      let total = 0, drops = 0;
      for (const k of order) {
        const it = info[k];
        let best = null, bs = Infinity;
        for (const c of it.cands) {
          let sc = c.cost;
          for (const t of placed) if (overlap(c.r, t)) sc += 400;
          for (let j = 0; j < info.length; j++) if (j !== k && overlap(c.r, info[j].dot)) sc += 400;
          if (sc < bs) { bs = sc; best = c; }
        }
        if (o.drop && bs >= 300) { res[k] = { drop: true, score: bs, why: best ? best.why : '' }; drops += it.weight; continue; }
        res[k] = { c: best, score: bs };
        if (best) placed.push(best.r);
        total += bs;
      }
      return { res, total, drops };
    };
    const base = info.map((_, i) => i);
    let bestRun = run(base);
    if (bestRun.drops || bestRun.total > 50) {
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let t = 0; t < 40 && (bestRun.drops || bestRun.total > 50); t++) {
        const rest = base.slice(1);
        for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
        const r = run([0, ...rest]);
        if (r.drops < bestRun.drops || (r.drops === bestRun.drops && r.total < bestRun.total)) bestRun = r;
      }
    }
    bestRun.res.forEach((r, k) => {
      const it = info[k];
      it.st.dataset.score = String(Math.round(r.score));
      it.st.classList.remove('station--quiet');
      if (r.drop) {
        // 'label' keeps the station dot and drops only its label; otherwise the station is left out
        if (o.drop === 'label') it.st.classList.add('station--quiet'); else it.st.hidden = true;
        it.st.dataset.why = 'dropped ' + r.why;
        return;
      }
      it.label.style.setProperty('--lx', r.c.dx.toFixed(1) + 'px');
      it.label.style.setProperty('--ly', r.c.dy.toFixed(1) + 'px');
      it.st.dataset.why = r.c.why;
    });
  }

  /**
   * Distance from a box-local point to the nearest border point, in CSS px.
   * @param {HTMLElement} box @param {number} x @param {number} y
   */
  function borderDistance(box, x, y) {
    const s = box.getBoundingClientRect().width / 1000;
    let m = Infinity;
    for (const p of outlinePts()) { const d = Math.hypot(p[0] * s - x, p[1] * s - y); if (d < m) m = d; }
    return m;
  }

  /* ------------------------------------------------------------------ hero */
  /**
   * @param {HTMLElement} box @param {{ mobile: boolean }} o
   */
  function buildHero(box, o) {
    const { svg, layer } = stage(box);
    const dots = svgEl('path', { class: 'map-dots', d: dotsPath(F.dots), 'stroke-width': 2.6 });
    const outline = svgEl('path', { class: 'map-outline', d: F.outline, 'data-sw': 1, pathLength: 1 });
    svg.append(dots, outline);

    // neighbouring-country annotations, like a printed chart (placed in open water/land, clear of the border)
    /** @type {HTMLElement[]} */ const countries = [];
    const clabels = o.mobile ? [] : [{ t: 'Avstrija', x: 470, y: 58 }, { t: 'Hrvaška', x: 812, y: 528 }];
    for (const l of clabels) {
      const el = document.createElement('span');
      el.className = 'map-country';
      el.textContent = l.t;
      place(el, l.x, l.y);
      layer.appendChild(el);
      countries.push(el);
    }

    const V = { x: 262, y: 262 };
    const N = { x: 660, y: 44 };

    const halo = document.createElement('div');
    halo.className = 'halo';
    halo.innerHTML = '<span></span><span></span><span></span>';
    place(halo, (N.x + CITY.Maribor.x) / 2, (N.y + CITY.Maribor.y) / 2);
    layer.appendChild(halo);

    const all = [
      { key: 'kovac', x: CITY.Maribor.x, y: CITY.Maribor.y, name: 'Kovač Gradnje', idx: 34, glyph: 'e', storm: true },
      { key: 'hribar', x: CITY['Škofja Loka'].x, y: CITY['Škofja Loka'].y, name: 'Hribar Les', idx: 87, glyph: 'a' },
      { key: 'novak', x: CITY.Celje.x, y: CITY.Celje.y, name: 'Novak Elektro', idx: 58, glyph: 'c' },
      { key: 'zupan', x: CITY.Koper.x, y: CITY.Koper.y, name: 'Zupan Transport', idx: 71, glyph: 'b' },
      { key: 'krajnc', x: CITY.Velenje.x, y: CITY.Velenje.y, name: 'Strojna Krajnc', idx: 46, glyph: 'd' },
      { key: 'vidmar', x: CITY['Nova Gorica'].x, y: CITY['Nova Gorica'].y, name: 'Tiskarna Vidmar', idx: 41, glyph: 'd' },
      { key: 'pekarna', x: CITY.Kranj.x, y: CITY.Kranj.y, name: 'Pekarna Zrno', idx: 79, glyph: 'b' },
    ];
    const keep = o.mobile ? ['kovac', 'hribar', 'novak', 'vidmar'] : all.map((s) => s.key);
    const stations = all.filter((s) => keep.includes(s.key)).map((s) => station(layer, s));
    const centres = [pcentre(layer, 'V', V.x, V.y, 87), pcentre(layer, 'N', N.x, N.y, 34)];

    return { svg, layer, outline, dots, halo, stations, centres, countries, V, N };
  }

  /* ----------------------------------------------------------------- radar */
  /** @param {HTMLElement} box @param {{ mobile: boolean }} o */
  function buildRadar(box, o) {
    const { svg, layer } = stage(box);
    const lj = CITY.Ljubljana;
    const rings = svgEl('g', { class: 'radar__rings' });
    for (const r of [140, 280, 420, 560]) rings.appendChild(svgEl('circle', { cx: lj.x, cy: lj.y, r, 'data-sw': 1 }));
    const cross = svgEl('path', { d: `M${lj.x - 600} ${lj.y}H${lj.x + 600}M${lj.x} ${lj.y - 420}V${lj.y + 420}`, stroke: 'rgba(255,255,255,.06)', 'data-sw': 1 });
    const dots = svgEl('path', { class: 'map-dots', d: dotsPath(F.dots), 'data-sw': 2.2 });
    const outline = svgEl('path', { class: 'map-outline', d: F.outline, 'data-sw': 1 });
    svg.append(rings, cross, dots, outline);

    const clip = document.createElement('div');
    clip.className = 'radar__clip';
    const sweep = document.createElement('div');
    sweep.className = 'radar__sweep';
    place(sweep, lj.x, lj.y);
    clip.appendChild(sweep);
    layer.appendChild(clip);

    const C = { g: '#57C892', y: '#F2C230', o: '#FF9A4A', r: '#FF6B57' };
    const specs = [
      { key: 'kovac', x: CITY.Maribor.x, y: CITY.Maribor.y, name: 'Kovač Gradnje', idx: 34, color: C.r },
      { key: 'krajnc', x: CITY.Velenje.x, y: CITY.Velenje.y, name: 'Strojna Krajnc', idx: 46, color: C.o },
      { key: 'novak', x: CITY.Celje.x, y: CITY.Celje.y, name: 'Novak Elektro', idx: 58, color: C.y },
      { key: 'pekarna', x: CITY.Kranj.x, y: CITY.Kranj.y, name: 'Pekarna Zrno', idx: 79, color: C.g },
      { key: 'hribar', x: CITY['Škofja Loka'].x, y: CITY['Škofja Loka'].y, name: 'Hribar Les', idx: 87, color: C.g },
      { key: 'vidmar', x: CITY['Nova Gorica'].x, y: CITY['Nova Gorica'].y, name: 'Tiskarna Vidmar', idx: 41, color: C.o },
      { key: 'zupan', x: CITY.Koper.x, y: CITY.Koper.y, name: 'Zupan Transport', idx: 71, color: C.g },
      { key: 'horvat', x: CITY['Murska Sobota'].x, y: CITY['Murska Sobota'].y, name: 'Avtoservis Horvat', idx: 63, color: C.y },
    ];
    const stations = specs.map((s) => station(layer, s));
    return { svg, layer, sweep, stations, all: stations, centre: lj };
  }

  /* ------------------------------------------------------------------ econ */
  /**
   * Smooth value per dot: Gaussian-weighted average of region values of nearby dots.
   * @param {number[][]} dots @param {number[]} regionVals
   */
  function smoothDots(dots, regionVals) {
    const step = F.dotStep;
    /** @type {Map<string, number[][]>} */
    const hash = new Map();
    for (const d of dots) {
      const k = Math.round(d[0] / step) + ',' + Math.round(d[1] / step);
      if (!hash.has(k)) hash.set(k, []);
      /** @type {number[][]} */ (hash.get(k)).push(d);
    }
    const sigma = 22, R = 3;
    /** @param {number} x @param {number} y */
    const at = (x, y) => {
      const ci = Math.round(x / step), cj = Math.round(y / step);
      let s = 0, w = 0, nearest = Infinity, nv = 0;
      for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
        const cell = hash.get(ci + i + ',' + (cj + j));
        if (!cell) continue;
        for (const d of cell) {
          const dx = d[0] - x, dy = d[1] - y, dd = dx * dx + dy * dy;
          const ww = Math.exp(-dd / (2 * sigma * sigma));
          s += ww * regionVals[d[2]]; w += ww;
          if (dd < nearest) { nearest = dd; nv = regionVals[d[2]]; }
        }
      }
      return w > 1e-6 ? s / w : nv;
    };
    return { at, hash };
  }

  /** sequential sky → storm ramp, t in [0,1] where 0 = storm (high risk) */
  const RAMP = [[0x1B, 0x20, 0x33], [0x3B, 0x4A, 0x6B], [0x6D, 0x86, 0xA6], [0xA9, 0xC0, 0xD6], [0xDC, 0xE7, 0xF0]];
  /** @param {number} t @returns {string} */
  function ramp(t) {
    t = Math.max(0, Math.min(1, t));
    const f = t * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(f)), k = f - i;
    const a = RAMP[i], b = RAMP[i + 1];
    const c = a.map((v, j) => Math.round(v + (b[j] - v) * k));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  /**
   * Marching squares on a regular grid; returns an SVG path for one level.
   * @param {Float32Array} g @param {number} cols @param {number} rows @param {number} cell @param {number} ox @param {number} oy @param {number} lv
   * @returns {{ d: string, mids: Pt[] }}
   */
  function contour(g, cols, rows, cell, ox, oy, lv) {
    let d = '';
    /** @type {Pt[]} */ const mids = [];
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      const a = g[j * cols + i], b = g[j * cols + i + 1], c = g[(j + 1) * cols + i], e = g[(j + 1) * cols + i + 1];
      const x = ox + i * cell, y = oy + j * cell;
      /** @type {number[][]} */ const p = [];
      if ((a < lv) !== (b < lv)) p.push([x + ((lv - a) / (b - a)) * cell, y]);
      if ((b < lv) !== (e < lv)) p.push([x + cell, y + ((lv - b) / (e - b)) * cell]);
      if ((c < lv) !== (e < lv)) p.push([x + ((lv - c) / (e - c)) * cell, y + cell]);
      if ((a < lv) !== (c < lv)) p.push([x, y + ((lv - a) / (c - a)) * cell]);
      for (let k = 0; k + 1 < p.length; k += 2) {
        d += `M${p[k][0].toFixed(1)} ${p[k][1].toFixed(1)}L${p[k + 1][0].toFixed(1)} ${p[k + 1][1].toFixed(1)}`;
        mids.push({ x: (p[k][0] + p[k + 1][0]) / 2, y: (p[k][1] + p[k + 1][1]) / 2 });
      }
    }
    return { d, mids };
  }

  /**
   * @param {HTMLElement} box
   * @param {{ values: Record<string, number>, mobile: boolean }} o
   */
  function buildEcon(box, o) {
    const { svg, layer } = stage(box);
    const seeds = /** @type {Seed[]} */ (F.regions);
    const vals = seeds.map((s) => o.values[s.id]);
    const lo = 52, hi = 76;
    const { at } = smoothDots(F.dots, vals);

    // coloured dots, binned into a few paths
    const BINS = 28;
    /** @type {string[]} */ const bins = new Array(BINS).fill('');
    for (const d of F.dots) {
      const v = at(d[0], d[1]);
      const b = Math.max(0, Math.min(BINS - 1, Math.floor(((v - lo) / (hi - lo)) * BINS)));
      bins[b] += `M${d[0]} ${d[1]}h0`;
    }
    const g = svgEl('g', { 'stroke-linecap': 'round' });
    bins.forEach((d, b) => {
      if (!d) return;
      g.appendChild(svgEl('path', { d, fill: 'none', stroke: ramp((b + 0.5) / BINS), 'stroke-width': 7.4 }));
    });

    // isolines of the smoothed index, clipped to the border
    const defs = svgEl('defs');
    const clip = svgEl('clipPath', { id: 'econ-clip' });
    clip.appendChild(svgEl('path', { d: F.outline }));
    defs.appendChild(clip);
    const cell = 8, ox = 30, oy = 10, cols = Math.ceil(950 / cell), rows = Math.ceil(640 / cell);
    const grid = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) grid[j * cols + i] = at(ox + i * cell, oy + j * cell);
    const iso = svgEl('g', { 'clip-path': 'url(#econ-clip)' });
    /** @type {{ lv: number, mids: Pt[] }[]} */ const tagged = [];
    for (const lv of [56, 60, 64, 68, 72]) {
      const c = contour(grid, cols, rows, cell, ox, oy, lv);
      if (!c.d) continue;
      iso.appendChild(svgEl('path', { d: c.d, class: 'econ-iso' + (lv % 8 === 0 ? ' econ-iso--major' : ''), 'data-sw': lv % 8 === 0 ? 1.25 : 1 }));
      tagged.push({ lv, mids: c.mids });
    }
    const outline = svgEl('path', { class: 'map-outline', d: F.outline, 'data-sw': 1 });
    svg.append(defs, g, iso, outline);

    // region labels
    for (const s of seeds) {
      const el = document.createElement('div');
      const v = o.values[s.id];
      el.className = 'region-label' + (v < 61 ? ' is-dark' : '');
      el.innerHTML = `<b>${v}</b><span>${s.name}</span>`;
      const off = /** @type {Record<string, Pt>} */ ({
        SI037: { x: 0, y: 6 }, SI038: { x: -6, y: 0 }, SI035: { x: 6, y: -6 }, SI041: { x: -14, y: 4 }, SI044: { x: 2, y: 14 }, SI043: { x: 4, y: 0 }, SI031: { x: 6, y: 18 },
      })[s.id] || { x: 0, y: 0 };
      place(el, s.x + off.x, s.y + off.y);
      layer.appendChild(el);
    }

    // value tags on two isolines, at the segment closest to a chosen anchor
    const anchors = /** @type {Record<number, Pt>} */ ({ 60: { x: 650, y: 330 }, 72: { x: 292, y: 362 } });
    for (const t of tagged) {
      const a = anchors[t.lv];
      if (!a) continue;
      let best = null, bd = Infinity;
      for (const m of t.mids) {
        const dd = (m.x - a.x) ** 2 + (m.y - a.y) ** 2;
        if (dd < bd) { bd = dd; best = m; }
      }
      if (best && bd < 120 * 120) {
        const tag = document.createElement('span');
        tag.className = 'iso-tag';
        tag.textContent = String(t.lv);
        place(tag, best.x, best.y);
        layer.appendChild(tag);
      }
    }
    return { svg, layer, ramp: (/** @type {number} */ v) => ramp((v - lo) / (hi - lo)) };
  }

  /** @type {any} */ (window).NapovedMaps = { buildHero, buildRadar, buildEcon, placeLabels, borderDistance, outlinePts, CITY, ramp, place };
})();
