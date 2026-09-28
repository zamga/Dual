/*
 * Rok landing page. Every point on screen is one company from the demo
 * universe. As the page scrolls, the same points re-arrange into each chapter:
 * a map of Slovenia, the age of annual accounts, payment delays, grades, one
 * credit decision and the back-test curve. Positions always come from the
 * company's own data, so hovering a point shows the company behind it.
 */
(function () {
  'use strict';
  const E = window.RokEngine;
  const D = window.RokData;
  const root = document.documentElement;
  const $ = s => document.querySelector(s);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(7);
  const gauss = () => { const u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  // Tall screens (phones held upright, small tablets) get their own layout:
  // text in a bottom sheet, the picture above it. Matches the CSS media query.
  function isTall() {
    return window.innerWidth < 900 && window.innerWidth / window.innerHeight <= 0.87;
  }

  // ---------- data ----------
  const { companies, asOf } = D.generate(2026, D.DEMO_COUNT);
  E.attachNetwork(companies);
  const live = companies.filter(c => c.status !== 'bankrupt');
  const N = live.length;
  const res = live.map(c => E.score(c, { asOf }));
  const pd = res.map(r => r.pd);
  const dbt = live.map(c => (c.pay ? avg(c.pay.dbt.slice(-3)) : null));
  const indexOf = new Map(live.map((c, i) => [c.id, i]));
  const sizeNorm = live.map(c => clamp((Math.log10(c.fin && c.fin.revenue > 0 ? c.fin.revenue : 1e5) - 4.8) / 2.4, 0, 1));

  const eurFmt = new Intl.NumberFormat('sl-SI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const intFmt = new Intl.NumberFormat('sl-SI', { maximumFractionDigits: 0 });
  const eur = v => eurFmt.format(Math.round(v));
  const pdNum = p => { const x = p * 100; return (x < 1 ? x.toFixed(2) : x < 10 ? x.toFixed(1) : x.toFixed(0)).replace('.', ','); };
  const pdText = p => (p >= 1 ? 'In default' : pdNum(p) + ' %');

  // Colour carries risk and nothing else.
  const PAPER = [0.89, 0.902, 0.882];
  const AMBER = [0.949, 0.722, 0.294];
  const RED = [1.0, 0.353, 0.235];
  const GREY = [0.46, 0.48, 0.47];
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  function riskColor(p) {
    if (p >= 1) return RED;
    const t = clamp((Math.log(p) - Math.log(0.006)) / (Math.log(0.2) - Math.log(0.006)), 0, 1);
    if (t < 0.45) return PAPER;
    if (t < 0.75) return mix3(PAPER, AMBER, (t - 0.45) / 0.3);
    return mix3(AMBER, RED, (t - 0.75) / 0.25);
  }
  function delayColor(d) {
    if (d == null) return GREY;
    const t = clamp((d - 4) / 22, 0, 1);
    return t < 0.5 ? mix3(PAPER, AMBER, t / 0.5) : mix3(AMBER, RED, (t - 0.5) / 0.5);
  }
  function statusColor(i) {
    const c = live[i];
    if (c.status === 'insolvency') return RED;
    if (c.events.blockedDays12m > 0 || c.events.taxDebt > 0) return AMBER;
    return PAPER;
  }
  const css = c => `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;

  // ---------- copy that comes from the data ----------
  const active = res.filter(r => !r.inDefault);
  const lateFilers = res.filter(r => r.finAgeMonths > 18).length;
  const covered = dbt.filter(d => d != null);
  const sortedPd = active.map(r => r.pd).sort((a, b) => a - b);
  const medianPd = sortedPd[Math.floor(sortedPd.length / 2)];
  $('#meta-count').textContent = `${intFmt.format(N)} companies · fictional demo data`;
  $('#late-share').textContent = `one in ${Math.round(N / Math.max(1, lateFilers))}`;
  $('#fig-ontime').innerHTML = `${Math.round((covered.filter(d => d <= 5).length / covered.length) * 100)}<small>%</small>`;
  $('#fig-late').innerHTML = `${Math.round((covered.filter(d => d >= 20).length / covered.length) * 100)}<small>%</small>`;
  $('#fig-median').innerHTML = `${pdNum(medianPd)}<small>%</small>`;
  $('#fig-de').textContent = intFmt.format(res.filter(r => r.grade.grade === 'D' || r.grade.grade === 'E').length);
  if (!finePointer) {
    document.querySelector('.hero-meta span').textContent = 'Each dot is a company · tap to inspect';
    document.querySelector('.hover-hint').hidden = true;
  }

  // Alert ticker: the week's worst news from the demo universe.
  (function ticker() {
    const items = [];
    const order = live.map((c, i) => i).sort((a, b) => ((a * 7919) % 101) - ((b * 7919) % 101));
    for (const i of order) {
      const c = live[i];
      let item = null;
      if (c.status === 'insolvency') item = ['crit', 'insolvency proceedings opened'];
      else if (c.events.blockPeriods.some(b => (new Date(asOf) - new Date(b.to)) / 864e5 <= 60)) item = ['crit', `account blocked ${c.events.blockedDays12m} days`];
      else if (c.pay && avg(c.pay.dbt.slice(-3)) - avg(c.pay.dbt.slice(0, 9)) >= 10) item = ['warn', `paying ${Math.round(avg(c.pay.dbt.slice(-3)) - avg(c.pay.dbt.slice(0, 9)))} days later than in spring`];
      else if (c.events.taxDebt > 5000) item = ['warn', `on the FURS debtor list, ${eur(c.events.taxDebt)}`];
      if (item) items.push({ name: c.name, level: item[0], text: item[1] });
      if (items.length >= 16) break;
    }
    const html = items.map(a => `<span class="tick-item"><i style="background:${a.level === 'crit' ? 'var(--red)' : 'var(--amber)'}"></i>${esc(a.name)} <span>${esc(a.text)}</span></span>`).join('');
    $('#ticker').innerHTML = `<div class="ticker-set">${html}</div><div class="ticker-set" aria-hidden="true">${html}</div>`;
  })();

  // ---------- the decision card ----------
  const focus = (function () {
    const cands = [];
    live.forEach((c, i) => {
      if (c.status !== 'active' || !c.pay || !c.fin || c.fin.equity <= 0) return;
      if (pd[i] < 0.02 || pd[i] > 0.05) return;
      if (E.recommend(c, res[i]).limit < 10000) return;
      cands.push(i);
    });
    cands.sort((a, b) => live[b].fin.revenue - live[a].fin.revenue);
    return cands.length ? cands[Math.min(4, cands.length - 1)] : 0;
  })();
  const F = live[focus];
  const Fr = res[focus];
  (function decisionCard() {
    const slider = $('#d-exposure');
    const rec0 = E.recommend(F, Fr);
    const max = Math.max(50000, Math.ceil((rec0.limit * 3) / 1000) * 1000);
    slider.max = String(max);
    slider.value = String(Math.round((rec0.limit * 1.4) / 1000) * 1000);
    $('#d-name').textContent = F.name;
    $('#d-meta').textContent = `${F.city} · ${F.sector.label}`;
    $('#d-grade').innerHTML = `<i style="background:${css(riskColor(Fr.pd))}"></i>${Fr.grade.grade}`;
    $('#d-pd').textContent = `${pdText(Fr.pd)} default risk`;
    $('#d-link').href = `desk.html#${F.id}`;
    function render() {
      const v = Number(slider.value);
      const rec = E.recommend(F, Fr, v);
      $('#d-out').textContent = eur(v);
      const tone = rec.verdict.code === 'approve' ? 'var(--paper)' : rec.verdict.code === 'cover' ? 'var(--amber)' : 'var(--red)';
      $('#d-verdict').innerHTML = `<i style="background:${tone}"></i><span>${esc(rec.verdict.label)}</span>`;
      $('#d-limit').textContent = eur(rec.limit);
      $('#d-terms').textContent = rec.term.label;
      $('#d-el').textContent = eur(rec.expectedLoss);
      $('#d-ins').textContent = rec.premiumRate == null ? 'Not insurable' : eur(v * rec.premiumRate);
      slider.style.setProperty('--fill', `${(v / max) * 100}%`);
    }
    slider.addEventListener('input', render);
    render();
  })();

  // ---------- the back-test (run when the browser is idle) ----------
  function runBacktest() {
    const full = [], fin = [], y = [];
    for (const seed of [101, 102, 103, 104, 105, 106]) {
      const d = D.generate(seed, 600);
      E.attachNetwork(d.companies);
      for (const c of d.companies) {
        if (c.status !== 'active') continue;
        full.push(E.score(c, { asOf: d.asOf }).pd);
        fin.push(E.score(c, { asOf: d.asOf, model: 'filings' }).pd);
        y.push(c.outcome12m);
      }
    }
    const P = y.filter(Boolean).length;
    const roc = sc => {
      const idx = sc.map((_, i) => i).sort((a, b) => sc[b] - sc[a]);
      let tp = 0, fp = 0;
      const pts = [[0, 0]];
      idx.forEach((i, j) => {
        if (y[i]) tp++; else fp++;
        if (j % 12 === 0 || j === idx.length - 1) pts.push([fp / (y.length - P), tp / P]);
      });
      return pts;
    };
    const capture = sc => sc.map((_, i) => i).sort((a, b) => sc[b] - sc[a]).slice(0, Math.round(sc.length * 0.1)).filter(i => y[i]).length / P;
    return { n: y.length, aucF: E.auc(full, y), aucO: E.auc(fin, y), rocF: roc(full), rocO: roc(fin), capF: capture(full) };
  }
  let backtest = null;

  // ---------- the field ----------
  const field = createField();
  if (!field) root.classList.add('no-webgl');

  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 500));
  idle(() => {
    backtest = runBacktest();
    document.querySelectorAll('.bt-n').forEach(el => { el.textContent = intFmt.format(backtest.n); });
    $('#bt-rok').textContent = backtest.aucF.toFixed(3);
    $('#bt-fin').textContent = backtest.aucO.toFixed(3);
    $('#bt-cap').innerHTML = `${Math.round(backtest.capF * 100)}<small>%</small>`;
    if (field) field.relayout();
  });

  function createField() {
    const THREE = window.THREE;
    if (!THREE) return null;
    const canvas = $('#field');
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
      return null;
    }
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    const outer = new THREE.Group();
    const inner = new THREE.Group();
    outer.add(inner);
    scene.add(outer);

    const VERT = `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aAlpha;
      uniform float uPx;
      uniform float uMin;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(uMin, aSize * uPx * (10.0 / -mv.z));
        vColor = aColor;
        vAlpha = aAlpha;
      }`;
    const FRAG = `
      uniform float uMul;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vColor, smoothstep(0.5, 0.3, d) * vAlpha * uMul);
      }`;
    const LINE_VERT = `
      attribute vec3 aColor;
      varying vec3 vColor;
      void main() {
        vColor = aColor;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`;
    const LINE_FRAG = `
      uniform float uOpacity;
      varying vec3 vColor;
      void main() { gl_FragColor = vec4(vColor, uOpacity); }`;

    function pointsMaterial(blending) {
      return new THREE.ShaderMaterial({
        uniforms: { uPx: { value: 1 }, uMul: { value: 1 }, uMin: { value: 1.5 } },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending,
      });
    }

    // Companies.
    const P = new Float32Array(N * 3), C = new Float32Array(N * 3), S = new Float32Array(N), A = new Float32Array(N);
    const geo = new THREE.BufferGeometry();
    const attr = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', attr(P, 3));
    geo.setAttribute('aColor', attr(C, 3));
    geo.setAttribute('aSize', attr(S, 1));
    geo.setAttribute('aAlpha', attr(A, 1));
    const pointMat = pointsMaterial(THREE.NormalBlending);
    const points = new THREE.Points(geo, pointMat);
    points.frustumCulled = false;
    inner.add(points);

    // Invoices moving along the motorways in the opening map.
    const M = 460;
    const FP = new Float32Array(M * 3), FC = new Float32Array(M * 3), FS = new Float32Array(M), FA = new Float32Array(M);
    const fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', attr(FP, 3));
    fgeo.setAttribute('aColor', attr(FC, 3));
    fgeo.setAttribute('aSize', attr(FS, 1));
    fgeo.setAttribute('aAlpha', attr(FA, 1));
    const flowMat = pointsMaterial(THREE.AdditiveBlending);
    const flows = new THREE.Points(fgeo, flowMat);
    flows.frustumCulled = false;
    inner.add(flows);
    const flow = [];
    for (let j = 0; j < M; j++) {
      flow.push({ r: 0, u: rnd(), v: 0.035 + rnd() * 0.07, dir: rnd() < 0.5 ? 1 : -1, off: gauss() * 0.006 });
      const tint = rnd() < 0.12 ? AMBER : PAPER;
      FC.set(tint, j * 3);
      FA[j] = 0.35 + rnd() * 0.4;
    }

    // Per-company randomness, fixed for the life of the page.
    const K = 7;
    const LP = [], LC = [], LS = [], LA = [], stag = [];
    for (let k = 0; k < K; k++) {
      LP.push(new Float32Array(N * 3)); LC.push(new Float32Array(N * 3)); LS.push(new Float32Array(N)); LA.push(new Float32Array(N)); stag.push(new Float32Array(N));
    }
    const jx = new Float32Array(N), jy = new Float32Array(N), jz = new Float32Array(N), lift = new Float32Array(N);
    const introDelay = new Float32Array(N), rs = new Float32Array(N), ra = new Float32Array(N), cloudN = new Float32Array(N * 3), fieldN = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      jx[i] = rnd() - 0.5; jy[i] = rnd() - 0.5; jz[i] = gauss();
      lift[i] = (rnd() - 0.5) * 1.4;
      introDelay[i] = rnd();
      rs[i] = rnd(); ra[i] = rnd() * Math.PI * 2;
      const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1), rr = Math.cbrt(rnd());
      cloudN[3 * i] = Math.sin(ph) * Math.cos(th) * rr; cloudN[3 * i + 1] = Math.sin(ph) * Math.sin(th) * rr; cloudN[3 * i + 2] = Math.cos(ph) * rr;
      fieldN[3 * i] = rnd() * 2 - 1; fieldN[3 * i + 1] = rnd() * 2 - 1; fieldN[3 * i + 2] = rnd();
    }
    const cloud = new Float32Array(N * 3);

    // Slovenia: company seats, spread around their towns.
    const CITY = {
      Ljubljana: [46.0569, 14.5058], Maribor: [46.5547, 15.6459], Celje: [46.2309, 15.2604], Kranj: [46.2389, 14.3556],
      Koper: [45.5481, 13.7302], 'Novo mesto': [45.8034, 15.1689], Velenje: [46.3592, 15.1103], 'Nova Gorica': [45.956, 13.648],
      'Murska Sobota': [46.6625, 16.1664], Ptuj: [46.42, 15.87], 'Domžale': [46.1382, 14.5944], 'Škofja Loka': [46.1655, 14.3064],
      Kamnik: [46.2259, 14.6121], 'Krško': [45.959, 15.4919], 'Slovenj Gradec': [46.5103, 15.0806], Postojna: [45.7743, 14.2153],
      Izola: [45.5369, 13.6604],
    };
    const LON0 = 14.9, LAT0 = 46.1, KX = Math.cos((46.1 * Math.PI) / 180);
    const proj = (lat, lon) => [(lon - LON0) * KX, lat - LAT0];
    const cityCount = {};
    live.forEach(c => { cityCount[c.city] = (cityCount[c.city] || 0) + 1; });
    const mapRaw = new Float32Array(N * 2);
    live.forEach((c, i) => {
      const [lat, lon] = CITY[c.city] || CITY.Ljubljana;
      const [x, y] = proj(lat, lon);
      const sig = (0.016 + 0.0021 * Math.sqrt(cityCount[c.city])) * (rnd() < 0.18 ? 2.4 : 1);
      mapRaw[2 * i] = x + gauss() * sig;
      mapRaw[2 * i + 1] = y + gauss() * sig;
    });
    const ROUTES = [
      [[45.548, 13.73], [45.757, 14.064], [45.774, 14.215], [45.963, 14.295], [46.057, 14.506], [46.138, 14.594], [46.188, 14.883], [46.231, 15.26], [46.392, 15.573], [46.555, 15.646]],
      [[46.555, 15.646], [46.576, 15.832], [46.662, 16.166]],
      [[46.43, 14.06], [46.239, 14.356], [46.057, 14.506]],
      [[46.057, 14.506], [45.938, 14.804], [45.803, 15.169], [45.959, 15.492], [45.904, 15.591]],
      [[45.757, 14.064], [45.887, 13.909], [45.956, 13.648]],
      [[46.555, 15.646], [46.42, 15.87]],
      [[46.231, 15.26], [46.359, 15.11], [46.51, 15.081]],
      [[45.548, 13.73], [45.537, 13.66]],
      [[46.166, 14.306], [46.239, 14.356]],
      [[46.226, 14.612], [46.138, 14.594]],
    ].map(r => r.map(([lat, lon]) => proj(lat, lon)));
    let routes = [];
    const MAIN_CITIES = ['Ljubljana', 'Maribor', 'Celje', 'Koper', 'Kranj', 'Novo mesto', 'Murska Sobota', 'Nova Gorica', 'Velenje', 'Ptuj'];

    let labels = [];
    const guides = [];
    for (let k = 0; k < K; k++) guides.push(null);
    let pivot = { x: 0, y: 0 };
    let tiltX = -0.46, driftY = 0.07;
    let orbit = { cx: 0, cy: 0, R: 1, ey: 0.92, others: new Uint8Array(N) };
    let dirty = true;
    let sPrev = -1;
    const introStart = performance.now();

    function worldBox(r) {
      const vh = 2 * Math.tan((camera.fov * Math.PI) / 360) * 10;
      const vw = vh * camera.aspect;
      const b = { x0: (r[0] * vw) / 2, x1: (r[1] * vw) / 2, y0: (r[2] * vh) / 2, y1: (r[3] * vh) / 2, vw, vh };
      b.w = b.x1 - b.x0; b.h = b.y1 - b.y0; b.cx = (b.x0 + b.x1) / 2; b.cy = (b.y0 + b.y1) / 2;
      return b;
    }

    function relayout() {
      const W = window.innerWidth, H = window.innerHeight;
      const tall = isTall();
      const pxw = (2 * Math.tan((camera.fov * Math.PI) / 360) * 10) / H; // world units per CSS pixel
      const pxBox = (l, t, r, b) => worldBox([(l / W) * 2 - 1, (r / W) * 2 - 1, 1 - (b / H) * 2, 1 - (t / H) * 2]);
      const navEl = document.querySelector('.nav');
      const navH = navEl ? navEl.offsetHeight : 64;
      // Where each chapter's picture may live: beside the text on wide screens,
      // above the chapter's bottom sheet on tall ones.
      const frameFor = k => {
        if (!tall) return k >= 4 ? worldBox([0.04, 0.92, -0.74, 0.74]) : worldBox([-0.02, 0.92, -0.62, 0.66]);
        const sec = document.querySelector(`[data-state="${k}"]`);
        const panel = sec && sec.querySelector('.chapter-text');
        const ph = panel ? Math.min(panel.offsetHeight, H * 0.6) : H * 0.42;
        return pxBox(14, navH + 12, W - 14, H - ph - 18);
      };
      const upright = f => f.h > f.w * 1.05;
      const segs = [];
      for (let k = 0; k < K; k++) segs.push({ p: [], c: [] });
      const defs = [];
      const put = (k, i, x, y, z, col, size, alpha) => {
        LP[k][3 * i] = x; LP[k][3 * i + 1] = y; LP[k][3 * i + 2] = z;
        LC[k][3 * i] = col[0]; LC[k][3 * i + 1] = col[1]; LC[k][3 * i + 2] = col[2];
        LS[k][i] = size; LA[k][i] = alpha;
      };
      const seg = (k, x1, y1, x2, y2, col) => { segs[k].p.push(x1, y1, 0, x2, y2, 0); const c = col || PAPER; segs[k].c.push(c[0], c[1], c[2], c[0], c[1], c[2]); };
      const dashed = (k, x1, y1, x2, y2, n, col) => { for (let j = 0; j < n; j++) { const a = j / n, b = (j + 0.5) / n; seg(k, lerp(x1, x2, a), lerp(y1, y2, a), lerp(x1, x2, b), lerp(y1, y2, b), col); } };
      const label = (k, x, y, text, cls, align, extra) => defs.push(Object.assign({ k, x, y, text, cls: cls || '', align: align || 'center' }, extra || {}));
      const dot = v => Math.max(pxw * 1.7, v); // never smaller than 1.7 CSS pixels

      // 0 · Map of Slovenia. On tall screens it runs edge to edge.
      // On tall screens the map fills the space between the nav and the headline.
      const heroEl = document.querySelector('.hero'), heroInnerEl = document.getElementById('hero-inner');
      const textTop = heroEl && heroInnerEl ? heroEl.offsetTop + heroInnerEl.offsetTop : H * 0.55;
      const mb = tall ? pxBox(0, navH, W, Math.max(navH + 140, Math.min(H * 0.54, textTop - 10))) : worldBox([-0.06, 0.9, -0.28, 0.86]);
      const sc = tall ? Math.min((mb.w / 1.95) * 1.12, mb.h / 1.28) : Math.min(mb.w / 1.95, mb.h / 1.3);
      const mx = x => mb.cx + (x - 0.01) * sc, my = y => mb.cy + y * sc;
      const u0 = Math.max(sc * 0.0068, pxw * 1.9);
      const grow = tall ? 0.8 : 1.4;
      for (let i = 0; i < N; i++) {
        put(0, i, mx(mapRaw[2 * i]), my(mapRaw[2 * i + 1]), sizeNorm[i] * 0.22 + jz[i] * 0.02, riskColor(pd[i]), u0 * (1 + grow * sizeNorm[i]), 0.9);
      }
      pivot = { x: mb.cx, y: mb.cy };
      tiltX = tall ? -0.3 : -0.46;
      driftY = tall ? 0.05 : 0.07;
      for (const name of tall ? ['Ljubljana', 'Maribor', 'Celje', 'Kranj', 'Novo mesto'] : MAIN_CITIES) {
        const [x, y] = proj(CITY[name][0], CITY[name][1]);
        label(0, mx(x) + 0.05, my(y) + 0.09, name, 'city', 'left');
      }
      routes = ROUTES.map(r => {
        const pts = r.map(([x, y]) => [mx(x), my(y)]);
        const cum = [0];
        for (let j = 1; j < pts.length; j++) cum.push(cum[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
        return { pts, cum, len: cum[cum.length - 1] };
      });
      const total = routes.reduce((s, r) => s + r.len, 0);
      flow.forEach(f => {
        let t = rnd() * total;
        f.r = 0;
        while (f.r < routes.length - 1 && t > routes[f.r].len) { t -= routes[f.r].len; f.r++; }
      });
      FS.fill(u0 * 0.9);
      for (let i = 0; i < N; i++) {
        cloud[3 * i] = mb.cx + cloudN[3 * i] * mb.w * 0.6;
        cloud[3 * i + 1] = mb.cy + cloudN[3 * i + 1] * mb.h * 0.7;
        cloud[3 * i + 2] = cloudN[3 * i + 2] * 3;
      }

      // 1 · Annual accounts on a time axis (left to right, or top to bottom).
      const F1 = frameFor(1);
      const months = 33, today = 32.9;
      const onTime = [], stale = [];
      for (let i = 0; i < N; i++) (res[i].finAgeMonths > 18 ? stale : onTime).push(i);
      const oldGrey = mix3(PAPER, GREY, 0.45);
      const fill = (ids, x0, x1, y0, y1, cell) => {
        const w = x1 - x0, h = y1 - y0;
        const cols = Math.max(1, Math.round(Math.sqrt((ids.length * w) / h)));
        const rows = Math.ceil(ids.length / cols);
        ids.forEach((i, j) => {
          const cx = j % cols, cy = Math.floor(j / cols);
          put(1, i, x0 + (cx + 0.5 + jx[i] * 0.5) * (w / cols), y0 + (cy + 0.5 + jy[i] * 0.5) * (h / rows), 0, oldGrey, dot(cell * 0.62), 0.62);
        });
      };
      const pctOn = Math.round((onTime.length / N) * 100);
      const todayText = `Today · ${asOf.split('-').map(Number).reverse().join('. ')}`;
      if (!upright(F1)) {
        const X1 = m => F1.x0 + (m / months) * F1.w;
        const yb = F1.y0 + F1.h * 0.14, top = F1.y0 + F1.h * 0.86;
        const ry0 = yb + (top - yb) * 0.04, ry1 = ry0 + (top - yb) * 0.72;
        const gap = F1.w * 0.008;
        const cell = Math.sqrt(((X1(24) - X1(12)) * (ry1 - ry0)) / onTime.length);
        fill(stale, X1(0) + gap, X1(12) - gap, ry0, ry1, cell);
        fill(onTime, X1(12) + gap, X1(24) - gap, ry0, ry1, cell);
        seg(1, X1(0), yb, X1(months), yb);
        for (let m = 0; m <= 33; m += 3) seg(1, X1(m), yb, X1(m), yb - (m % 12 === 0 ? 0.07 : 0.03), m % 12 === 0 ? PAPER : GREY);
        dashed(1, X1(today), yb, X1(today), ry1 + 0.12, 24, PAPER);
        const yBr = (ry0 + ry1) / 2;
        seg(1, X1(24) + gap * 2, yBr, X1(today) - gap * 2, yBr, AMBER);
        seg(1, X1(24) + gap * 2, yBr - 0.04, X1(24) + gap * 2, yBr + 0.04, AMBER);
        seg(1, X1(today) - gap * 2, yBr - 0.04, X1(today) - gap * 2, yBr + 0.04, AMBER);
        label(1, X1(6), yb - 0.17, '2024');
        label(1, X1(18), yb - 0.17, '2025');
        label(1, X1(28.5), yb - 0.17, '2026');
        label(1, X1(today) + 0.02, ry1 + 0.24, todayText, 'strong', 'right');
        label(1, X1(12) + gap, ry1 + 0.12, `Accounts for 2025 · ${pctOn} %`, '', 'left');
        label(1, X1(0) + gap, ry1 + 0.12, `Still on 2024 · ${100 - pctOn} %`, '', 'left');
        label(1, (X1(24) + X1(today)) / 2, yBr + 0.14, '9 months unseen', 'strong amber');
      } else {
        const axisX = F1.x0 + F1.w * 0.15;
        const top = F1.y1 - F1.h * 0.03, bot = F1.y0 + F1.h * 0.07;
        const Y = m => top - (m / months) * (top - bot);
        const gapY = F1.h * 0.035;
        const bx0 = axisX + F1.w * 0.05, bx1 = F1.x1;
        const cell = Math.sqrt(((bx1 - bx0) * (Y(12) - Y(24) - gapY * 2)) / onTime.length);
        fill(stale, bx0, bx1, Y(12) + gapY, Y(0) - gapY, cell);
        fill(onTime, bx0, bx1, Y(24) + gapY, Y(12) - gapY, cell);
        seg(1, axisX, Y(0), axisX, Y(months));
        for (let m = 0; m <= 33; m += 3) seg(1, axisX, Y(m), axisX - (m % 12 === 0 ? 0.07 : 0.03), Y(m), m % 12 === 0 ? PAPER : GREY);
        dashed(1, axisX, Y(today), bx1, Y(today), 22, PAPER);
        const xBr = bx0 + (bx1 - bx0) * 0.1;
        const yA = Y(24) - gapY * 0.4, yB = Y(today) + gapY * 0.4;
        seg(1, xBr, yA, xBr, yB, AMBER);
        seg(1, xBr - 0.04, yA, xBr + 0.04, yA, AMBER);
        seg(1, xBr - 0.04, yB, xBr + 0.04, yB, AMBER);
        label(1, axisX - 0.1, Y(6), '2024', '', 'right');
        label(1, axisX - 0.1, Y(18), '2025', '', 'right');
        label(1, axisX - 0.1, Y(28.5), '2026', '', 'right');
        label(1, bx0, Y(0) - gapY * 0.5, `Still on 2024 · ${100 - pctOn} %`, '', 'left');
        label(1, bx0, Y(12), `Accounts for 2025 · ${pctOn} %`, '', 'left');
        label(1, xBr + 0.07, (yA + yB) / 2, '9 months unseen', 'strong amber', 'left');
        label(1, bx1, Y(today) - 0.09, todayText, 'strong', 'right');
      }

      // 2 · Payment delays: columns on wide frames, bars on upright ones.
      // The dot spacing is chosen to fill the frame as fully as possible.
      const F2 = frameFor(2);
      const coveredIdx = [], noneIdx = [];
      for (let i = 0; i < N; i++) (dbt[i] == null ? noneIdx : coveredIdx).push(i);
      const B = 21;
      const bins = Array.from({ length: B }, () => []);
      coveredIdx.forEach(i => bins[Math.min(B - 1, Math.floor(dbt[i] / 2))].push(i));
      bins.forEach(b => b.sort((a, c) => dbt[a] - dbt[c]));
      const noneText = `${tall ? 'No data' : 'No invoices yet'} · ${intFmt.format(noneIdx.length)}`;
      if (!upright(F2)) {
        let best = null;
        for (let bc = 2; bc <= 16; bc++) {
          const nc = bc * 2, gc = Math.max(2, Math.round(bc * 0.8));
          const cols = nc + gc + B * (bc + 1) - 1;
          const rows = Math.max(Math.ceil(noneIdx.length / nc), ...bins.map(b => Math.ceil(b.length / bc)));
          const sz = Math.min((F2.w * 0.96) / cols, (F2.h * 0.66) / rows);
          if (!best || sz > best.sz) best = { bc, nc, gc, cols, sz };
        }
        const { bc: binCols, nc: noneCols, gc: gapCols, cols: totalCols, sz: s2 } = best;
        const x2 = F2.cx - (totalCols * s2) / 2;
        const yb2 = F2.y0 + F2.h * 0.18;
        noneIdx.forEach((i, j) => put(2, i, x2 + ((j % noneCols) + 0.5) * s2, yb2 + (Math.floor(j / noneCols) + 0.5) * s2, 0, GREY, dot(s2 * 0.74), 0.34));
        const binX = bi => x2 + (noneCols + gapCols + bi * (binCols + 1)) * s2;
        bins.forEach((b, bi) => b.forEach((i, j) => put(2, i, binX(bi) + ((j % binCols) + 0.5) * s2, yb2 + (Math.floor(j / binCols) + 0.5) * s2, 0, delayColor(dbt[i]), dot(s2 * 0.74), 0.96)));
        seg(2, binX(0), yb2 - s2 * 0.3, binX(B - 1) + binCols * s2, yb2 - s2 * 0.3);
        seg(2, x2, yb2 - s2 * 0.3, x2 + noneCols * s2, yb2 - s2 * 0.3, GREY);
        [0, 5, 10, 15, 20].forEach(bi => label(2, binX(bi) + (binCols * s2) / 2, yb2 - 0.16, bi === 20 ? '40+' : String(bi * 2)));
        label(2, (binX(0) + binX(B - 1) + binCols * s2) / 2, yb2 - 0.36, 'Days past due · average of the last 3 months');
        label(2, x2 + noneCols * s2, yb2 + Math.ceil(noneIdx.length / noneCols) * s2 + 0.13, noneText, '', 'right');
        label(2, binX(0), yb2 + Math.ceil(bins[0].length / binCols) * s2 + 0.13, `On time · ${intFmt.format(bins[0].length)}`, 'strong', 'left');
      } else {
        const x0 = F2.x0 + F2.w * 0.1;
        let best = null;
        for (let br = 2; br <= 12; br++) {
          const nr = Math.round(br * 1.6), sr = Math.max(4, br + 2);
          const rows = B * (br + 1) - 1 + sr + nr;
          const len = Math.max(Math.ceil(noneIdx.length / nr), ...bins.map(b => Math.ceil(b.length / br)));
          const sz = Math.min((F2.x1 - x0) / len, (F2.h * 0.84) / rows);
          if (!best || sz > best.sz) best = { br, nr, sr, sz };
        }
        const { br: binRows, nr: noneRows, sr: sepRows, sz: s } = best;
        const yTop = F2.y1 - F2.h * 0.08;
        const rowY = r => yTop - (r + 0.5) * s;
        const barTop = bi => bi * (binRows + 1);
        bins.forEach((b, bi) => b.forEach((i, j) => put(2, i, x0 + (Math.floor(j / binRows) + 0.5) * s, rowY(barTop(bi) + (j % binRows)), 0, delayColor(dbt[i]), dot(s * 0.74), 0.96)));
        const noneTop = B * (binRows + 1) - 1 + sepRows;
        noneIdx.forEach((i, j) => put(2, i, x0 + (Math.floor(j / noneRows) + 0.5) * s, rowY(noneTop + (j % noneRows)), 0, GREY, dot(s * 0.74), 0.34));
        seg(2, x0 - s * 0.7, rowY(0) + s * 0.5, x0 - s * 0.7, rowY(barTop(B - 1) + binRows - 1) - s * 0.5);
        [0, 5, 10, 15, 20].forEach(bi => label(2, x0 - 0.07, rowY(barTop(bi) + (binRows - 1) / 2), bi === 20 ? '40+' : String(bi * 2), '', 'right'));
        label(2, x0, yTop + 0.1, 'Days past due', '', 'left');
        label(2, x0 + Math.ceil(bins[0].length / binRows) * s, yTop + 0.1, `On time · ${intFmt.format(bins[0].length)}`, 'strong', 'right');
        label(2, x0, rowY(noneTop - sepRows / 2), noneText, '', 'left');
      }

      // 3 · Default probability as one beeswarm on a log scale, packed to fit.
      const F3 = frameFor(3);
      const lo = Math.log(0.001), hi = Math.log(0.6);
      const frac = p => (Math.log(clamp(p, 0.001, 0.6)) - lo) / (hi - lo);
      const dflt = [], alive = [];
      for (let i = 0; i < N; i++) (res[i].inDefault ? dflt : alive).push(i);
      const packSwarm = (axisLen, crossLen) => {
        let best = null;
        for (let nb = 24; nb <= 150; nb += 3) {
          const counts = new Uint16Array(nb);
          for (const i of alive) counts[Math.min(nb - 1, Math.floor(frac(pd[i]) * nb))]++;
          let cmax = 0;
          for (const c of counts) if (c > cmax) cmax = c;
          for (let per = 1; per <= 5; per++) {
            const sz = Math.min(axisLen / nb / per, crossLen / (Math.ceil(cmax / per) + 1));
            if (!best || sz > best.sz) best = { nb, per, sz, cmax };
          }
        }
        const sb = Array.from({ length: best.nb }, () => []);
        for (const i of alive) sb[Math.min(best.nb - 1, Math.floor(frac(pd[i]) * best.nb))].push(i);
        sb.forEach(b => b.sort((a, c) => pd[a] - pd[c]));
        best.bins = sb;
        best.half = Math.ceil((Math.ceil(best.cmax / best.per) - 1) / 2) * best.sz;
        return best;
      };
      const swarmSpot = (j, per) => {
        const r = Math.floor(j / per);
        return { sub: j % per, lvl: r === 0 ? 0 : (r % 2 ? 1 : -1) * Math.ceil(r / 2) };
      };
      const gradeBands = (place) => {
        let prevMax = 0.001;
        E.GRADES.forEach(g => {
          const col = riskColor(Math.sqrt(Math.max(prevMax, 0.0012) * Math.min(g.max, 0.6)));
          place(frac(Math.max(prevMax, 0.001)), frac(Math.min(g.max, 0.6)), g.grade, col);
          prevMax = g.max;
        });
      };
      if (!upright(F3)) {
        const axX0 = F3.x0 + F3.w * 0.03, axX1 = F3.x0 + F3.w * 0.84;
        const pk = packSwarm(axX1 - axX0, F3.h * 0.56);
        const cy3 = F3.y0 + F3.h * 0.62;
        const binW = (axX1 - axX0) / pk.nb;
        pk.bins.forEach((b, bi) => b.forEach((i, j) => {
          const { sub, lvl } = swarmSpot(j, pk.per);
          put(3, i, axX0 + bi * binW + (sub + 0.5) * (binW / pk.per) + jx[i] * pk.sz * 0.25, cy3 + lvl * pk.sz, 0, riskColor(pd[i]), dot(pk.sz * 0.82), 0.96);
        }));
        const dcols = 4, dsz = pk.sz * 1.25, drows = Math.ceil(dflt.length / dcols);
        const dx0 = F3.x0 + F3.w * 0.91;
        dflt.forEach((i, j) => put(3, i, dx0 + (j % dcols) * dsz, cy3 + (Math.floor(j / dcols) - drows / 2) * dsz, 0, RED, dot(pk.sz * 0.82), 0.96));
        const yb3 = cy3 - pk.half - pk.sz * 2.5;
        const XP = f => axX0 + f * (axX1 - axX0);
        gradeBands((fa, fb, grade, col) => {
          const a = XP(fa), b = XP(fb);
          if (b - a <= 0.02) return;
          seg(3, a + 0.012, yb3, b - 0.012, yb3, col);
          seg(3, a + 0.012, yb3 + 0.008, b - 0.012, yb3 + 0.008, col);
          label(3, (a + b) / 2, yb3 - 0.13, grade, 'strong', 'center', { color: css(col) });
        });
        [[0.001, '0,1 %', 'left'], [0.01, '1 %'], [0.1, '10 %'], [0.5, '50 %']].forEach(([p, t, al]) => label(3, XP(frac(p)), yb3 - 0.34, t, '', al || 'center'));
        const topY = cy3 + pk.half + pk.sz * 1.5;
        dashed(3, XP(frac(medianPd)), yb3 + 0.06, XP(frac(medianPd)), topY, 18, PAPER);
        label(3, XP(frac(medianPd)), topY + 0.12, `Median ${pdNum(medianPd)} %`, 'strong');
        if (dflt.length) label(3, F3.x1, cy3 + (drows / 2) * dsz + 0.14, `In default · ${dflt.length}`, 'strong red', 'right');
      } else {
        const ayTop = F3.y1 - F3.h * 0.05, ayBot = F3.y0 + F3.h * 0.2;
        // Leave room at the right for the median label so it never sits on the dots.
        const cx3 = F3.x0 + F3.w * 0.52;
        const room = F3.x1 - pxw * 96 - cx3;
        const pk = packSwarm(ayTop - ayBot, Math.min(F3.w * 0.56, room * 2));
        const binH = (ayTop - ayBot) / pk.nb;
        pk.bins.forEach((b, bi) => b.forEach((i, j) => {
          const { sub, lvl } = swarmSpot(j, pk.per);
          put(3, i, cx3 + lvl * pk.sz + jx[i] * pk.sz * 0.25, ayTop - bi * binH - (sub + 0.5) * (binH / pk.per), 0, riskColor(pd[i]), dot(pk.sz * 0.82), 0.96);
        }));
        const dcols = 14, dsz = pk.sz * 1.3, dy0 = F3.y0 + F3.h * 0.03;
        dflt.forEach((i, j) => put(3, i, cx3 + ((j % dcols) - (dcols - 1) / 2) * dsz, dy0 + Math.floor(j / dcols) * dsz, 0, RED, dot(pk.sz * 0.82), 0.96));
        const YP = f => ayTop - f * (ayTop - ayBot);
        const xb = F3.x0 + F3.w * 0.09;
        gradeBands((fa, fb, grade, col) => {
          const a = YP(fa), b = YP(fb);
          if (a - b <= 0.02) return;
          seg(3, xb, a - 0.012, xb, b + 0.012, col);
          seg(3, xb + 0.008, a - 0.012, xb + 0.008, b + 0.012, col);
          label(3, xb - 0.06, (a + b) / 2, grade, 'strong', 'right', { color: css(col) });
        });
        [[0.001, '0,1 %'], [0.01, '1 %'], [0.1, '10 %'], [0.5, '50 %']].forEach(([p, t]) => label(3, xb + 0.06, YP(frac(p)), t, '', 'left'));
        const half = pk.half + pk.sz;
        dashed(3, cx3 - half, YP(frac(medianPd)), cx3 + half + pxw * 6, YP(frac(medianPd)), 16, PAPER);
        label(3, cx3 + half + pxw * 10, YP(frac(medianPd)), `Median ${pdNum(medianPd)} %`, 'strong', 'left');
        if (dflt.length) label(3, cx3, dy0 + Math.ceil(dflt.length / dcols) * dsz + 0.1, `In default · ${dflt.length}`, 'strong red');
      }

      // 4 · One company, its links, and everyone else in orbit.
      const F4 = frameFor(4);
      const R = Math.min(F4.w, F4.h) * 0.46;
      const ey = tall ? 1 : 0.92;
      orbit = { cx: F4.cx, cy: F4.cy, R, ey, others: new Uint8Array(N) };
      const linked = new Set();
      F.net.viaDirector.forEach(v => { if (indexOf.has(v.id)) linked.add(indexOf.get(v.id)); });
      F.net.parents.concat(F.net.children).forEach(id => { if (indexOf.has(id)) linked.add(indexOf.get(id)); });
      linked.delete(focus);
      const L4 = [...linked].slice(0, 16);
      const r1 = R * 0.3;
      for (let i = 0; i < N; i++) {
        orbit.others[i] = 1;
        const rad = R * (0.62 + 0.38 * Math.sqrt(rs[i]));
        put(4, i, F4.cx + Math.cos(ra[i]) * rad, F4.cy + Math.sin(ra[i]) * rad * ey, jz[i] * 0.25, mix3(riskColor(pd[i]), GREY, 0.35), dot(u0 * 1.05), 0.5);
      }
      orbit.others[focus] = 0;
      put(4, focus, F4.cx, F4.cy, 0.3, riskColor(pd[focus]), R * 0.085, 1);
      L4.forEach((i, j) => {
        orbit.others[i] = 0;
        const a = (j / L4.length) * Math.PI * 2 + 0.5;
        const x = F4.cx + Math.cos(a) * r1, y = F4.cy + Math.sin(a) * r1;
        put(4, i, x, y, 0.15, statusColor(i), dot(R * 0.024), 1);
        seg(4, F4.cx, F4.cy, x, y, GREY);
      });
      label(4, F4.cx, F4.cy - R * 0.085 - 0.16, F.name, 'strong');
      if (L4.length) {
        if (tall) label(4, F4.cx, F4.cy - R * 0.085 - 0.32, `${L4.length} linked`);
        else label(4, F4.cx, F4.cy + r1 + 0.16, `Linked through its people · ${L4.length}`);
      }

      // 5 · The back-test as curves (placeholder until it has run).
      const F5 = frameFor(5);
      const side = Math.min(F5.w, F5.h) * 0.84;
      const ox = F5.cx - side / 2 + (tall ? side * 0.05 : 0), oy = F5.cy - side / 2 + (tall ? side * 0.04 : 0);
      const RX = f => ox + f * side, RY = t => oy + t * side;
      const fb = worldBox([-1, 1, -1, 1]);
      if (backtest) {
        const byRisk = live.map((c, i) => i).sort((a, b) => pd[b] - pd[a]);
        const groups = [[], [], []];
        byRisk.forEach((i, j) => groups[j % 100 < 60 ? 0 : j % 100 < 86 ? 1 : 2].push(i));
        const curves = [backtest.rocF, backtest.rocO, [[0, 0], [1, 1]]].map(pts => {
          const w = pts.map(([f, t]) => [RX(f), RY(t)]);
          const cum = [0];
          for (let j = 1; j < w.length; j++) cum.push(cum[j - 1] + Math.hypot(w[j][0] - w[j - 1][0], w[j][1] - w[j - 1][1]));
          return { w, cum, len: cum[cum.length - 1] };
        });
        const along = (cv, f) => {
          const t = f * cv.len;
          let j = 1;
          while (j < cv.cum.length - 1 && cv.cum[j] < t) j++;
          const seg0 = cv.cum[j] - cv.cum[j - 1] || 1;
          const a = (t - cv.cum[j - 1]) / seg0;
          const [x0, y0] = cv.w[j - 1], [x1, y1] = cv.w[j];
          const nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1;
          return [lerp(x0, x1, a), lerp(y0, y1, a), nx / nl, ny / nl];
        };
        groups.forEach((ids, g) => ids.forEach((i, j) => {
          const [x, y, nx, ny] = along(curves[g], (j + 0.5) / ids.length);
          const off = jx[i] * (g === 0 ? 0.028 : 0.016);
          const col = g === 0 ? riskColor(pd[i]) : g === 1 ? mix3(PAPER, GREY, 0.5) : GREY;
          put(5, i, x + nx * off, y + ny * off, jz[i] * 0.04, col, dot(u0 * (g === 2 ? 0.8 : 1.15)), g === 0 ? 0.95 : g === 1 ? 0.55 : 0.28);
        }));
        seg(5, RX(0), RY(0), RX(1), RY(0));
        seg(5, RX(0), RY(0), RX(0), RY(1));
        seg(5, RX(0), RY(1), RX(1), RY(1), GREY);
        seg(5, RX(1), RY(0), RX(1), RY(1), GREY);
        label(5, RX(0) - 0.1, RY(0) - 0.1, '0');
        label(5, RX(1), RY(0) - 0.14, '1');
        label(5, RX(0) - 0.12, RY(1), '1');
        label(5, RX(0.5), RY(0) - 0.14, 'Healthy companies flagged');
        label(5, RX(0) - 0.16, RY(0.5), 'Defaults caught', '', 'center', { rot: -90 });
        label(5, RX(0.05), RY(0.95), `Rok · ${backtest.aucF.toFixed(3)}`, 'strong', 'left');
        const [fx, fy] = along(curves[1], 0.58);
        label(5, fx + 0.1, fy - 0.12, `Accounts only · ${backtest.aucO.toFixed(3)}`, '', 'left');
      }

      // 6 · A quiet field behind pricing.
      for (let i = 0; i < N; i++) {
        put(6, i, fieldN[3 * i] * fb.vw * 0.62, fieldN[3 * i + 1] * fb.vh * 0.62, -5 + fieldN[3 * i + 2] * 6, mix3(riskColor(pd[i]), GREY, 0.5), u0 * 1.1, 0.22);
        if (!backtest) {
          LP[5].set(LP[6].subarray(3 * i, 3 * i + 3), 3 * i);
          LC[5].set(LC[6].subarray(3 * i, 3 * i + 3), 3 * i);
          LS[5][i] = LS[6][i]; LA[5][i] = LA[6][i];
        }
      }

      // Staggers: points arrive left to right, with a little noise.
      for (let k = 1; k < K; k++) {
        let minX = Infinity, maxX = -Infinity;
        for (let i = 0; i < N; i++) { const x = LP[k][3 * i]; if (x < minX) minX = x; if (x > maxX) maxX = x; }
        const span = maxX - minX || 1;
        for (let i = 0; i < N; i++) stag[k][i] = 0.75 * ((LP[k][3 * i] - minX) / span) + 0.25 * introDelay[i];
      }

      // Guides and labels.
      guides.forEach(g => { if (g) { inner.remove(g); g.geometry.dispose(); g.material.dispose(); } });
      for (let k = 0; k < K; k++) {
        if (!segs[k].p.length) { guides[k] = null; continue; }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(segs[k].p, 3));
        g.setAttribute('aColor', new THREE.Float32BufferAttribute(segs[k].c, 3));
        const m = new THREE.ShaderMaterial({ uniforms: { uOpacity: { value: 0 } }, vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, transparent: true, depthWrite: false, depthTest: false });
        const mesh = new THREE.LineSegments(g, m);
        mesh.frustumCulled = false;
        inner.add(mesh);
        guides[k] = mesh;
      }
      const host = $('#labels');
      host.innerHTML = '';
      labels = defs.map(d => {
        const el = document.createElement('div');
        el.className = `lbl ${d.cls}`;
        el.textContent = d.text;
        if (d.color) el.style.color = d.color;
        if (d.cls.includes('amber')) el.style.color = 'var(--amber)';
        if (d.cls.includes('red')) el.style.color = 'var(--red)';
        el.style.opacity = '0';
        host.appendChild(el);
        return Object.assign(d, { el, shown: -1 });
      });
      dirty = true;
    }

    function resize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const vh = 2 * Math.tan((camera.fov * Math.PI) / 360) * 10;
      const px = (h * renderer.getPixelRatio()) / vh;
      pointMat.uniforms.uPx.value = px;
      flowMat.uniforms.uPx.value = px;
      pointMat.uniforms.uMin.value = 1.5 * renderer.getPixelRatio();
      flowMat.uniforms.uMin.value = 1.2 * renderer.getPixelRatio();
      relayout();
    }

    const v3 = new THREE.Vector3();
    function frame(now, s, dt, ptr) {
      const t = now * 0.001;
      const k = Math.min(K - 2, Math.floor(s));
      const p = clamp(s - k, 0, 1);
      const introT = reduce ? 1 : clamp((now - introStart) / 2300, 0, 1);
      const w4 = Math.max(0, 1 - Math.abs(s - 4));
      if (dirty || introT < 1 || Math.abs(s - sPrev) > 1e-5 || w4 > 0) {
        const ta = LP[k], tb = LP[k + 1], ca = LC[k], cb = LC[k + 1], sa = LS[k], sb = LS[k + 1], aa = LA[k], ab = LA[k + 1];
        const st = stag[k + 1];
        const spin = reduce ? 0 : t * 0.035;
        for (let i = 0; i < N; i++) {
          let tt = clamp((p - st[i] * 0.4) / 0.6, 0, 1);
          tt = easeInOut(tt);
          let ax = ta[3 * i], ay = ta[3 * i + 1], az = ta[3 * i + 2];
          let bx = tb[3 * i], by = tb[3 * i + 1], bz = tb[3 * i + 2];
          if (orbit.others[i] && (k === 4 || k + 1 === 4)) {
            const rad = orbit.R * (0.62 + 0.38 * Math.sqrt(rs[i]));
            const ang = ra[i] + spin * (1.6 - rs[i]);
            const ox = orbit.cx + Math.cos(ang) * rad, oy = orbit.cy + Math.sin(ang) * rad * orbit.ey;
            if (k === 4) { ax = ox; ay = oy; } else { bx = ox; by = oy; }
          }
          let x = ax + (bx - ax) * tt, y = ay + (by - ay) * tt, z = az + (bz - az) * tt + Math.sin(Math.PI * tt) * lift[i];
          let alpha = aa[i] + (ab[i] - aa[i]) * tt;
          if (introT < 1) {
            const ti = easeOut(clamp((introT - introDelay[i] * 0.45) / 0.55, 0, 1));
            x = cloud[3 * i] + (x - cloud[3 * i]) * ti;
            y = cloud[3 * i + 1] + (y - cloud[3 * i + 1]) * ti;
            z = cloud[3 * i + 2] + (z - cloud[3 * i + 2]) * ti;
            alpha *= 0.25 + 0.75 * ti;
          }
          P[3 * i] = x; P[3 * i + 1] = y; P[3 * i + 2] = z;
          C[3 * i] = ca[3 * i] + (cb[3 * i] - ca[3 * i]) * tt;
          C[3 * i + 1] = ca[3 * i + 1] + (cb[3 * i + 1] - ca[3 * i + 1]) * tt;
          C[3 * i + 2] = ca[3 * i + 2] + (cb[3 * i + 2] - ca[3 * i + 2]) * tt;
          S[i] = sa[i] + (sb[i] - sa[i]) * tt;
          A[i] = alpha;
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.aColor.needsUpdate = true;
        geo.attributes.aSize.needsUpdate = true;
        geo.attributes.aAlpha.needsUpdate = true;
        sPrev = s;
        dirty = false;
      }

      // Invoices on the motorways, only in the opening map.
      const w0 = clamp(1 - s, 0, 1);
      flowMat.uniforms.uMul.value = w0 * (reduce ? 0.6 : 1) * clamp(introT * 1.4 - 0.4, 0, 1);
      if (w0 > 0 && routes.length) {
        for (let j = 0; j < M; j++) {
          const f = flow[j];
          const rt = routes[f.r];
          if (!reduce) f.u = (f.u + (f.dir * f.v * dt) / Math.max(0.3, rt.len) + 1) % 1;
          const d = f.u * rt.len;
          let q = 1;
          while (q < rt.cum.length - 1 && rt.cum[q] < d) q++;
          const a = (d - rt.cum[q - 1]) / (rt.cum[q] - rt.cum[q - 1] || 1);
          const [x0, y0] = rt.pts[q - 1], [x1, y1] = rt.pts[q];
          FP[3 * j] = lerp(x0, x1, a) + f.off;
          FP[3 * j + 1] = lerp(y0, y1, a) + f.off;
          FP[3 * j + 2] = 0.06;
        }
        fgeo.attributes.position.needsUpdate = true;
      }
      flows.visible = w0 > 0;

      for (let kk = 0; kk < K; kk++) {
        if (guides[kk]) guides[kk].material.uniforms.uOpacity.value = 0.34 * smooth(0.35, 0.95, Math.max(0, 1 - Math.abs(s - kk)));
      }

      // Tilt the map like a landscape; flatten it for the charts.
      const we = easeInOut(w0);
      outer.position.set(pivot.x * we, pivot.y * we, 0);
      inner.position.set(-pivot.x * we, -pivot.y * we, 0);
      outer.rotation.x = we * (tiltX + ptr.y * 0.06);
      outer.rotation.y = we * ((reduce ? 0 : driftY * Math.sin(t * 0.15)) + ptr.x * 0.1);
      const amp = 0.08 + 0.16 * we;
      camera.position.x += (ptr.x * amp - camera.position.x) * 0.05;
      camera.position.y += (ptr.y * amp * 0.7 - camera.position.y) * 0.05;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);

      // Labels follow the points they describe.
      const W = window.innerWidth, H = window.innerHeight;
      for (const l of labels) {
        const o = smooth(0.45, 0.95, Math.max(0, 1 - Math.abs(s - l.k)));
        if (o < 0.01) {
          if (l.shown !== 0) { l.el.style.opacity = '0'; l.shown = 0; }
          continue;
        }
        v3.set(l.x, l.y, 0).applyMatrix4(inner.matrixWorld).project(camera);
        const sx = ((v3.x + 1) / 2) * W, sy = ((1 - v3.y) / 2) * H;
        const ax = l.align === 'left' ? '0%' : l.align === 'right' ? '-100%' : '-50%';
        l.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(${ax}, -50%)${l.rot ? ` rotate(${l.rot}deg)` : ''}`;
        l.el.style.opacity = o.toFixed(3);
        l.shown = 1;
      }
    }

    function pick(x, y, radius) {
      const W = window.innerWidth, H = window.innerHeight;
      let best = -1, bd = radius * radius, bx = 0, by = 0;
      for (let i = 0; i < N; i++) {
        if (A[i] < 0.3) continue;
        v3.set(P[3 * i], P[3 * i + 1], P[3 * i + 2]).applyMatrix4(inner.matrixWorld).project(camera);
        const sx = ((v3.x + 1) / 2) * W, sy = ((1 - v3.y) / 2) * H;
        const d = (sx - x) * (sx - x) + (sy - y) * (sy - y);
        if (d < bd) { bd = d; best = i; bx = sx; by = sy; }
      }
      return best < 0 ? null : { i: best, x: bx, y: by };
    }
    function screenOf(i) {
      v3.set(P[3 * i], P[3 * i + 1], P[3 * i + 2]).applyMatrix4(inner.matrixWorld).project(camera);
      return { x: ((v3.x + 1) / 2) * window.innerWidth, y: ((1 - v3.y) / 2) * window.innerHeight };
    }

    resize();
    let lastW = window.innerWidth, lastH = window.innerHeight, rt = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        const w = window.innerWidth, h = window.innerHeight;
        if (w === lastW && Math.abs(h - lastH) < 120) return;
        lastW = w; lastH = h;
        resize();
      }, 120);
    });
    return { frame, pick, screenOf, relayout: () => { relayout(); } };
  }

  // ---------- scroll, pointer and page effects ----------
  let lenis = null;
  if (!reduce && window.Lenis) {
    try { lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true }); } catch (e) { lenis = null; }
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.6 });
    else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  });

  const stateEls = [...document.querySelectorAll('[data-state]')];
  const chapters = [...document.querySelectorAll('.chapter')].map(sec => {
    const h2 = sec.querySelector('h2');
    const words = h2.textContent.trim().split(/\s+/);
    h2.setAttribute('aria-label', h2.textContent.trim());
    h2.innerHTML = words.map(w => `<span class="w" aria-hidden="true">${esc(w)}</span>`).join(' ');
    return { sec, text: sec.querySelector('.chapter-text'), words: [...h2.querySelectorAll('.w')] };
  });
  const heroInner = $('#hero-inner');
  const nav = $('.nav');
  const track = $('#ticker');
  let setW = 0;
  const measure = () => { setW = track.firstElementChild ? track.firstElementChild.offsetWidth : 0; };
  measure();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); if (field) field.relayout(); });
  window.addEventListener('resize', measure);

  // Cursor, tooltip and magnetic buttons.
  const cursor = $('#cursor');
  const cursorLabel = $('#cursor-label');
  const useCursor = finePointer && !reduce;
  if (useCursor) root.classList.add('has-cursor');
  const ptr = { x: 0, y: 0, cx: -100, cy: -100, rx: -100, ry: -100, moved: false, target: null, type: 'mouse', inside: false };
  window.addEventListener('pointerdown', e => { ptr.type = e.pointerType; }, { passive: true });
  window.addEventListener('pointermove', e => {
    ptr.cx = e.clientX; ptr.cy = e.clientY; ptr.moved = true; ptr.target = e.target; ptr.type = e.pointerType; ptr.inside = true;
    if (ptr.rx < -50) { ptr.rx = e.clientX; ptr.ry = e.clientY; }
  }, { passive: true });
  document.addEventListener('pointerleave', () => { ptr.inside = false; cursor.classList.add('is-hidden'); });
  document.addEventListener('pointerenter', () => cursor.classList.remove('is-hidden'));
  if (!reduce) {
    document.querySelectorAll('[data-magnetic]').forEach(el => {
      el.addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        const r = el.getBoundingClientRect();
        el.style.transform = `translate3d(${(e.clientX - (r.left + r.width / 2)) * 0.22}px, ${(e.clientY - (r.top + r.height / 2)) * 0.32}px, 0)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  const tip = $('#tip');
  let hover = null;
  let tipId = null;
  const UI = 'a, button, input, label, .chapter-text, .ticker, .nav, .tip, .plans, .pricing-head, .outro, .foot, .card';
  function showTip(hit, touch) {
    const c = live[hit.i], r = res[hit.i];
    tipId = c.id;
    $('#tip-name').textContent = c.name;
    $('#tip-meta').textContent = `${c.city} · ${c.sector.label}`;
    $('#tip-grade').innerHTML = `<i style="background:${css(riskColor(r.pd))}"></i>${r.grade.grade}`;
    $('#tip-pd').textContent = pdText(r.pd);
    $('#tip-cta').innerHTML = touch ? `<a href="desk.html#${c.id}">Open the dossier</a>` : 'Click to open the dossier';
    tip.classList.toggle('touch', !!touch);
    tip.hidden = false;
    const W = window.innerWidth, H = window.innerHeight;
    const x = hit.x + 20 + 248 > W ? hit.x - 20 - 248 : hit.x + 20;
    const y = clamp(hit.y + 20, 12, H - 150);
    tip.style.transform = `translate3d(${Math.max(12, x)}px, ${y}px, 0)`;
  }
  function hideTip() { tip.hidden = true; tipId = null; }

  document.addEventListener('click', e => {
    if (!field || e.target.closest(UI)) { if (!e.target.closest('.tip')) { if (ptr.type !== 'mouse') hideTip(); } return; }
    const coarse = ptr.type !== 'mouse';
    const hit = coarse ? field.pick(e.clientX, e.clientY, 28) : hover;
    if (!hit) { if (coarse) hideTip(); return; }
    const id = live[hit.i].id;
    if (!coarse || tipId === id) { window.location.href = `desk.html#${id}`; return; }
    showTip(hit, true);
  });

  // ---------- the loop ----------
  let sCur = 0;
  let last = performance.now();
  let tickX = 0;
  let lastScroll = window.scrollY;
  const pn = { x: 0, y: 0 };
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (lenis) lenis.raf(now);
    const vh = window.innerHeight;
    const scrollY = window.scrollY;
    const vel = Math.abs(scrollY - lastScroll) / Math.max(dt, 1e-3);
    lastScroll = scrollY;

    // Read layout first.
    let sT = 0;
    for (const el of stateEls) sT += clamp((vh * 0.92 - el.getBoundingClientRect().top) / (vh * 0.72), 0, 1);
    const rects = chapters.map(ch => ch.sec.getBoundingClientRect());

    sCur = reduce ? sT : sCur + (sT - sCur) * (1 - Math.exp(-dt * 9));
    if (Math.abs(sT - sCur) < 1e-4) sCur = sT;
    pn.x += ((ptr.cx / window.innerWidth) * 2 - 1 - pn.x) * 0.06;
    pn.y += (-((ptr.cy / window.innerHeight) * 2 - 1) - pn.y) * 0.06;
    if (!ptr.inside) { pn.x *= 0.96; pn.y *= 0.96; }

    if (field) field.frame(now, sCur, dt, finePointer && !reduce ? pn : { x: 0, y: 0 });

    nav.classList.toggle('solid', scrollY > 24);

    // Hero drifts up and fades as the story starts.
    heroInner.style.transform = `translate3d(0, ${(scrollY * 0.22).toFixed(1)}px, 0)`;
    heroInner.style.opacity = (1 - smooth(0, vh * 0.8, scrollY)).toFixed(3);

    // Chapter headings settle word by word; text fades as its chapter ends.
    const tall = isTall();
    chapters.forEach((ch, n) => {
      const r = rects[n];
      const enter = clamp((vh * 0.95 - r.top) / (vh * 0.6), 0, 1);
      const exit = tall ? clamp((r.bottom - vh * 0.7) / (vh * 0.3), 0, 1) : clamp((r.bottom - vh * 0.25) / (vh * 0.35), 0, 1);
      ch.text.style.opacity = exit.toFixed(3);
      ch.text.style.setProperty('--p', clamp((vh - r.top) / r.height, 0, 1).toFixed(3));
      const J = ch.words.length;
      ch.words.forEach((w, j) => {
        const tw = reduce ? 1 : easeOut(clamp(enter * 1.7 - (j / J) * 0.7, 0, 1));
        w.style.opacity = (0.14 + 0.86 * tw).toFixed(3);
        w.style.transform = `translate3d(0, ${((1 - tw) * 0.3).toFixed(3)}em, 0)`;
      });
    });

    // Ticker speeds up with the scroll.
    if (!reduce && setW) {
      tickX += (36 + Math.min(900, vel * 0.35)) * dt;
      track.style.transform = `translate3d(${(-(tickX % setW)).toFixed(1)}px, 0, 0)`;
    }

    // Hover: the nearest company under the pointer.
    if (field && ptr.type === 'mouse' && ptr.inside && (ptr.moved || Math.abs(sT - sCur) > 1e-4)) {
      const overUI = ptr.target && ptr.target.closest && ptr.target.closest(UI);
      hover = overUI ? null : field.pick(ptr.cx, ptr.cy, 16);
      if (hover) showTip(hover, false); else if (tipId && ptr.type === 'mouse') hideTip();
      ptr.moved = false;
    }
    if (hover) { const sp = field.screenOf(hover.i); hover.x = sp.x; hover.y = sp.y; }

    if (useCursor) {
      const lt = ptr.target && ptr.target.closest ? ptr.target.closest('a, button, [data-cursor]') : null;
      cursor.classList.toggle('is-link', !!lt);
      cursor.classList.toggle('is-dot', !lt && !!hover);
      if (lt) cursorLabel.textContent = lt.getAttribute('data-cursor') || 'Open';
      const tx = hover && !lt ? hover.x : ptr.cx, ty = hover && !lt ? hover.y : ptr.cy;
      ptr.rx += (tx - ptr.rx) * 0.2;
      ptr.ry += (ty - ptr.ry) * 0.2;
      cursor.firstElementChild.style.transform = `translate3d(${ptr.rx.toFixed(1)}px, ${ptr.ry.toFixed(1)}px, 0)`;
      cursor.lastElementChild.style.transform = `translate3d(${ptr.cx}px, ${ptr.cy}px, 0)`;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
