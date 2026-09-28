// The Level: the home hero. Data from data/hero.json (the most recently closed pick's issue).
// First paint: an inline SVG of the same chart (a deterministic 300-line subsample plus the pick).
// After first paint: raw WebGL (every line, gravity in the vertex shader) on capable GPUs, a 2D canvas
// with the same 300 lines on weak GPUs or without WebGL, or the SVG alone (?gl=0, reduced motion).
// Native scroll only: progress = how far the tall section has scrolled. No scroll hijacking.
import { h, svg, prefersReducedMotion } from '../dom.js';
import { formatInZone, LJUBLJANA, fmtDDMMYY } from '../core/calendar.js';
import { parseHero, subsample, lineRandoms, buildVertices, STRIDE, stateAt, ease, excessPath, THRESHOLD, FAMS } from './level-data.js';
import { phone as phoneEl, signed, quorumBadge, familyName } from '../ui.js';

const MIST = [201 / 255, 207 / 255, 210 / 255];

// Write a style or attribute only when it changes: fewer invalidations per scroll frame.
const last = new WeakMap();
function put(el, key, value) {
  let m = last.get(el);
  if (!m) last.set(el, (m = new Map()));
  if (m.get(key) === value) return;
  m.set(key, value);
  if (key.startsWith('@')) el.setAttribute(key.slice(1), value);
  else if (key.startsWith('--')) el.style.setProperty(key, value);
  else el.style[key] = value;
}
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;

const COPY = {
  en: {
    headline: ['No quorum,', 'no text.'],
    kicker: 'The Level · our latest closed pick',
    cap0: (x) =>
      `Every US trading day four independent model families rank about ${x.n} stocks. A pick exists only when three of them put the same stock in their top decile. Most days, none do.`,
    cap1: (x) => `Issue #${x.issueNo}, ${x.date}. ${x.nScored} stocks scored. One stood on ${x.agreement === 4 ? 'all four columns' : 'three of four columns'}: ${x.ticker}.`,
    cap2: (x) => `Sealed at 13:45. Published and texted at 14:00:00 ${x.tz}. Entry at the US open, ${x.minutes} minutes later.`,
    cap3: 'Our latest closed pick. Whatever happened.',
    meta: (x) => `Issue #${x.issueNo} · ${x.date} · ${x.nScored} scored · ${x.q}`,
    q: (n) => (n === 1 ? '1 quorum' : `${n} quorums`),
    topDecile: 'Top decile',
    steps: ['The issue', 'The quorum', 'The text', 'The result'],
    stepsLabel: 'The Level, step by step',
    jump: (i, s) => `Step ${i}: ${s}`,
    cue: 'Scroll',
    buy: 'BUY',
    entry: 'Entry',
    exit: 'Exit',
    usOpen: 'US open',
    vs: 'Excess vs S&P 500 TR (simulated)',
    net: 'Net',
    bench: 'Benchmark',
    day: 'day',
    fictional: 'fictional',
    models: (n) => `${n}/4 models`,
    notAdvice: 'Closed record. Not a current recommendation. Not personal advice.',
    altTitle: 'The Level: our latest closed pick, described',
    alt1: (x) =>
      `Issue #${x.issueNo} was published on ${x.date} at 14:00 ${x.tz}. ${x.nScored} stocks were scored by four model families. ${x.q}. The chart draws every stock as a line across the four columns A to D, at the height of its percentile in each family.`,
    alt2: (x) => `The pick: ${x.ticker}, ${x.name} (fictional), ${x.agreement} of 4 families in their top decile.`,
    altTable: 'Percentile the pick received from each family (top decile is 90 and above)',
    altFamily: 'Family',
    altPct: 'Percentile',
    altTop: 'Top decile',
    yes: 'yes',
    no: 'no',
    altSms: 'The SMS sent at 14:00:00:',
    altResult: (x) =>
      `Result at the US open 21 trading days later (${x.exit}): excess return ${x.excess} against the S&P 500 total return (simulated); net ${x.net}, benchmark ${x.bench}.`,
  },
  sl: {
    headline: ['Brez kvoruma', 'ni SMS.'],
    kicker: 'Nivelir · naša zadnja zaprta izbira',
    cap0: (x) =>
      `Vsak dan trgovanja v ZDA štiri neodvisne družine modelov rangirajo približno ${x.n} delnic. Izbira nastane samo, ko tri isto delnico uvrstijo v svoj zgornji decil. Večino dni se to ne zgodi.`,
    cap1: (x) => `Izdaja #${x.issueNo}, ${x.date}. ${x.nScored} ocenjenih delnic. Ena je stala na ${x.agreement === 4 ? 'vseh štirih stebrih' : 'treh od štirih stebrov'}: ${x.ticker}.`,
    cap2: (x) => `Zapečateno ob 13:45. Objavljeno in poslano ob 14:00:00 ${x.tz}. Vstop ob odprtju ameriškega trga, ${x.minutes} minut pozneje.`,
    cap3: 'Naša zadnja zaprta izbira. Ne glede na izid.',
    meta: (x) => `Izdaja #${x.issueNo} · ${x.date} · ${x.nScored} ocenjenih · ${x.q}`,
    q: (n) => (n === 1 ? '1 kvorum' : `${n} kvorumi`),
    topDecile: 'Zgornji decil',
    steps: ['Izdaja', 'Kvorum', 'SMS', 'Izid'],
    stepsLabel: 'Nivelir po korakih',
    jump: (i, s) => `Korak ${i}: ${s}`,
    cue: 'Drsite',
    buy: 'NAKUP',
    entry: 'Vstop',
    exit: 'Izstop',
    usOpen: 'odprtje ZDA',
    vs: 'Presežek proti S&P 500 TR (simulirano)',
    net: 'Neto',
    bench: 'Merilo',
    day: 'dan',
    fictional: 'izmišljeno',
    models: (n) => `${n}/4 modelov`,
    notAdvice: 'Zaprt zapis. Ni trenutno priporočilo. Ni osebni nasvet.',
    altTitle: 'Nivelir: opis naše zadnje zaprte izbire',
    alt1: (x) =>
      `Izdaja #${x.issueNo} je izšla ${x.date} ob 14:00 ${x.tz}. Štiri družine modelov so ocenile ${x.nScored} delnic. ${x.q}. Grafikon vsako delnico nariše kot črto čez štiri stebre od A do D, na višini njenega percentila v posamezni družini.`,
    alt2: (x) => `Izbira: ${x.ticker}, ${x.name} (izmišljeno), ${x.agreement} od 4 družin v zgornjem decilu.`,
    altTable: 'Percentil, ki ga je izbira dobila v posamezni družini (zgornji decil je 90 in več)',
    altFamily: 'Družina',
    altPct: 'Percentil',
    altTop: 'Zgornji decil',
    yes: 'da',
    no: 'ne',
    altSms: 'SMS, poslan ob 14:00:00:',
    altResult: (x) =>
      `Izid ob odprtju ameriškega trga 21 trgovalnih dni pozneje (${x.exit}): presežni donos ${x.excess} proti skupnemu donosu S&P 500 (simulirano); neto ${x.net}, merilo ${x.bench}.`,
  },
};

// ---- engine choice ----------------------------------------------------------------------------------
function webglProbe() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl', { failIfMajorPerformanceCaveat: true }) || null;
    if (!gl) return { ok: false };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { ok: true, renderer, software: /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(renderer) };
  } catch {
    return { ok: false };
  }
}

export function chooseEngine(flag, reduced) {
  const f = String(flag ?? '').toLowerCase();
  if (f === '0' || f === 'svg' || f === 'off') return 'svg';
  if (f === 'canvas' || f === '2d') return 'canvas';
  if (reduced) return 'svg';
  const probe = webglProbe();
  if (f === 'webgl' || f === '1' || f === 'gl') return probe.ok || webglAny() ? 'webgl' : 'canvas';
  if (!probe.ok || probe.software) return 'canvas';
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = navigator.deviceMemory ?? 8;
  if (cores < 4 || mem < 4) return 'canvas';
  return 'webgl';
}

function webglAny() {
  try {
    return !!document.createElement('canvas').getContext('webgl');
  } catch {
    return false;
  }
}

// ---- the field engines ------------------------------------------------------------------------------
// Common geometry (stage css px): ax[4], yTop (pct 1), yBot (pct 0), W, H, dpr.

function fallDrop(tf, H) {
  return tf * tf * H * 1.3;
}

function createCanvasField(parsed, sub, rand) {
  const canvas = h('canvas', { class: 'lv__canvas', 'aria-hidden': 'true' });
  const ctx2d = canvas.getContext('2d');
  let g = null;
  return {
    kind: 'canvas',
    el: canvas,
    resize(geom) {
      g = geom;
      canvas.width = Math.round(geom.W * geom.dpr);
      canvas.height = Math.round(geom.H * geom.dpr);
      canvas.style.width = `${geom.W}px`;
      canvas.style.height = `${geom.H}px`;
    },
    draw({ fall }) {
      if (!g) return;
      const { p, agree } = parsed;
      ctx2d.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
      ctx2d.clearRect(0, 0, g.W, g.H);
      ctx2d.globalCompositeOperation = 'lighter';
      ctx2d.lineWidth = 1;
      const span = g.yBot - g.yTop;
      for (const i of sub) {
        const seed = rand.seed[i];
        const tf = clamp01((fall - seed * 0.55) / 0.45);
        if (tf >= 1) continue;
        const a = (agree[i] >= 2 ? 0.34 : 0.15) * (1 - tf);
        if (a <= 0.003) continue;
        ctx2d.strokeStyle = `rgba(201,207,210,${a.toFixed(3)})`;
        ctx2d.beginPath();
        let pen = false;
        for (let f = 0; f < 4; f++) {
          const v = p[i * 4 + f];
          if (v < 0) {
            pen = false;
            continue;
          }
          const x = g.ax[f] + (seed - 0.5) * 30 * tf;
          const y = g.yBot - (v / 1000) * span + fallDrop(tf, g.H) + (f - 1.5) * (seed - 0.5) * 90 * tf * tf;
          if (pen) ctx2d.lineTo(x, y);
          else ctx2d.moveTo(x, y);
          pen = true;
        }
        ctx2d.stroke();
      }
    },
    destroy() {
      canvas.remove();
    },
  };
}

const VS = `
attribute vec4 a0; attribute vec4 a1; attribute vec2 a2;
uniform vec4 u_ax; uniform vec2 u_y; uniform vec2 u_res;
uniform float u_settle; uniform float u_fall; uniform float u_alpha; uniform float u_half;
varying float v_a; varying float v_side;
float axx(float a){ return a < 0.5 ? u_ax.x : (a < 1.5 ? u_ax.y : (a < 2.5 ? u_ax.z : u_ax.w)); }
vec2 vpos(float axis, float pct, float noise, float seed, float inSub, float tf){
  float yReal = mix(u_y.x, u_y.y, max(pct, 0.0));
  float s = clamp((u_settle - seed * 0.4) / 0.6, 0.0, 1.0);
  float e = max(1.0 - pow(1.0 - s, 3.0), inSub);
  float span = u_y.x - u_y.y;
  float yNoise = mix(u_y.y - 0.18 * span, u_y.x + 0.18 * span, noise);
  float y = mix(yNoise, yReal, e);
  float drop = tf * tf * u_res.y * 1.3;
  float tilt = (axis - 1.5) * (seed - 0.5) * 90.0 * tf * tf;
  return vec2(axx(axis) + (seed - 0.5) * 30.0 * tf, y + drop + tilt);
}
void main(){
  float seed = a1.z; float kind = a1.w;
  float inSub = step(1.5, kind);
  float nearMiss = kind - 2.0 * inSub;
  float tf = clamp((u_fall - seed * 0.55) / 0.45, 0.0, 1.0);
  vec2 A = vpos(a0.x, a0.y, a0.z, seed, inSub, tf);
  vec2 B = vpos(a0.w, a1.x, a1.y, seed, inSub, tf);
  vec2 d = normalize(B - A + vec2(0.0001, 0.0));
  vec2 nrm = vec2(-d.y, d.x);
  vec2 P = mix(A, B, a2.y) + nrm * a2.x * u_half;
  gl_Position = vec4(P.x / u_res.x * 2.0 - 1.0, 1.0 - P.y / u_res.y * 2.0, 0.0, 1.0);
  float gap = step(a0.y, -0.5);
  float settled = max(inSub, clamp((u_settle - seed * 0.4) / 0.6, 0.0, 1.0));
  v_a = u_alpha * (1.0 + nearMiss * 1.8) * (1.0 - gap) * (1.0 - tf) * (0.3 + 0.7 * settled);
  v_side = a2.x;
}`;

const FS = `
precision mediump float;
uniform vec3 u_color; uniform float u_feather;
varying float v_a; varying float v_side;
void main(){
  float aa = 1.0 - smoothstep(1.0 - u_feather, 1.0, abs(v_side));
  gl_FragColor = vec4(u_color, v_a * aa);
}`;

function createGLField(parsed, sub, rand, onLost) {
  const canvas = h('canvas', { class: 'lv__canvas', 'aria-hidden': 'true' });
  const gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
  } catch (e) {
    console.warn('Quorum: WebGL program failed, using the canvas', e);
    return null;
  }
  const data = buildVertices(parsed, sub, rand);
  const count = data.length / STRIDE;
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.useProgram(prog);
  const loc = (n) => gl.getAttribLocation(prog, n);
  const a0 = loc('a0');
  const a1 = loc('a1');
  const a2 = loc('a2');
  const bpe = 4;
  gl.enableVertexAttribArray(a0);
  gl.vertexAttribPointer(a0, 4, gl.FLOAT, false, STRIDE * bpe, 0);
  gl.enableVertexAttribArray(a1);
  gl.vertexAttribPointer(a1, 4, gl.FLOAT, false, STRIDE * bpe, 4 * bpe);
  gl.enableVertexAttribArray(a2);
  gl.vertexAttribPointer(a2, 2, gl.FLOAT, false, STRIDE * bpe, 8 * bpe);
  const u = (n) => gl.getUniformLocation(prog, n);
  const U = { ax: u('u_ax'), y: u('u_y'), res: u('u_res'), settle: u('u_settle'), fall: u('u_fall'), alpha: u('u_alpha'), half: u('u_half'), color: u('u_color'), feather: u('u_feather') };
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
  gl.disable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);
  let g = null;
  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
    onLost?.();
  });
  return {
    kind: 'webgl',
    el: canvas,
    count,
    resize(geom) {
      g = geom;
      canvas.width = Math.round(geom.W * geom.dpr);
      canvas.height = Math.round(geom.H * geom.dpr);
      canvas.style.width = `${geom.W}px`;
      canvas.style.height = `${geom.H}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    draw({ settle, fall }) {
      if (!g || lost) return;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform4f(U.ax, g.ax[0], g.ax[1], g.ax[2], g.ax[3]);
      gl.uniform2f(U.y, g.yBot, g.yTop);
      gl.uniform2f(U.res, g.W, g.H);
      gl.uniform1f(U.settle, settle);
      gl.uniform1f(U.fall, fall);
      gl.uniform1f(U.alpha, 0.05);
      gl.uniform1f(U.half, 0.6 + 0.5 / g.dpr);
      gl.uniform1f(U.feather, Math.min(0.9, 0.5 / g.dpr / (0.6 + 0.5 / g.dpr) + 0.2));
      gl.uniform3f(U.color, MIST[0], MIST[1], MIST[2]);
      gl.drawArrays(gl.TRIANGLES, 0, count);
    },
    destroy() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };
}

// The SVG field (first paint, ?gl=0 and reduced motion). Normalised 0..1000 in both axes, stretched
// over the plot box with non-scaling strokes; lines are split into ten groups so they can fall.
function svgField(parsed, sub, rand) {
  const { p, agree } = parsed;
  const groups = Array.from({ length: 10 }, () => ({ normal: [], near: [] }));
  for (const i of sub) {
    let d = '';
    let pen = false;
    for (let f = 0; f < 4; f++) {
      const v = p[i * 4 + f];
      if (v < 0) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${Math.round((f * 1000) / 3)} ${1000 - v}`;
      pen = true;
    }
    const gi = Math.min(9, Math.floor(rand.seed[i] * 10));
    (agree[i] >= 2 ? groups[gi].near : groups[gi].normal).push(d);
  }
  const el = svg(
    'svg',
    { class: 'lv__svgfield', viewBox: '0 0 1000 1000', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
    groups.map((gr, k) =>
      svg(
        'g',
        { class: 'lv__grp', dataset: { k: String(k) } },
        svg('path', { d: gr.normal.join(''), class: 'lv__ln' }),
        svg('path', { d: gr.near.join(''), class: 'lv__ln lv__ln--near' }),
      ),
    ),
  );
  const grps = [...el.querySelectorAll('.lv__grp')];
  return {
    el,
    draw({ fall }, H) {
      grps.forEach((gEl, k) => {
        const seed = (k + 0.5) / 10;
        const tf = clamp01((fall - seed * 0.55) / 0.45);
        gEl.style.transform = tf > 0 ? `translate3d(0, ${Math.round(fallDrop(tf, H))}px, 0)` : '';
        gEl.style.opacity = String(1 - tf);
      });
    },
  };
}

// ---- the component ----------------------------------------------------------------------------------
export function createLevel(ctx, hero, { meta = null } = {}) {
  const locale = ctx.locale;
  const C = COPY[locale] ?? COPY.en;
  const fmt = ctx.fmt;
  const parsed = parseHero(hero);
  const seedKey = hero.issueDate;
  const sub = subsample(parsed.n, hero.pick.index, 300, seedKey);
  const rand = lineRandoms(parsed.n, seedKey);
  const reduced = prefersReducedMotion();
  const pickRow = parsed.pickRow;
  const agreeing = new Set(hero.pick.agreeing);
  const agreement = hero.pick.agreeing.length;
  const lj = formatInZone(new Date(hero.smsAt), LJUBLJANA);
  const tz = lj.offset === '+02:00' ? 'CEST' : 'CET';
  const X = {
    n: fmt.int(Math.round(hero.nScored / 100) * 100),
    issueNo: hero.issueNo,
    date: fmtDDMMYY(hero.issueDate),
    nScored: fmt.int(hero.nScored),
    agreement,
    ticker: hero.pick.ticker,
    name: hero.pick.name,
    tz,
    minutes: 90,
    q: C.q(hero.quorumCount),
  };
  if (lj.date === hero.issueDate) {
    // minutes from 14:00 to the US open, from the calendar rather than assumed
    const open = new Date(`${hero.issueDate}T09:30:00${nyOffset(hero.issueDate)}`);
    X.minutes = Math.round((open.getTime() - new Date(hero.smsAt).getTime()) / 60000);
  }
  const ex = hero.outcome ?? { excess: 0, net: 0, bench: 0, exitDate: hero.issueDate };
  const exPath = excessPath(hero.path);

  // ---- DOM ------------------------------------------------------------------------------------------
  const field = svgField(parsed, sub, rand);

  // overlay: band, columns, pick line (normalised like the field)
  const yN = (v) => 1000 - v; // normalised y of a 0..1000 value
  const xN = (f) => (f * 1000) / 3;
  const colEls = FAMS.map((f, k) =>
    svg('line', { class: ['lv__col', agreeing.has(f) ? 'is-agree' : 'is-miss'].join(' '), x1: xN(k), x2: xN(k), y1: 1000, y2: 1000 }),
  );
  const pickLine = svg('polyline', { class: 'lv__pick', points: '' });
  const over = svg(
    'svg',
    { class: 'lv__over', viewBox: '0 0 1000 1000', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
    svg('rect', { class: 'lv__band', x: 0, y: 0, width: 1000, height: 1000 - THRESHOLD }),
    svg('line', { class: 'lv__thr', x1: 0, x2: 1000, y1: yN(THRESHOLD), y2: yN(THRESHOLD) }),
    ...colEls,
    pickLine,
  );
  const valEls = FAMS.map((f, k) =>
    h(
      'span',
      { class: ['lv__val', agreeing.has(f) ? 'is-agree' : 'is-miss'], dataset: { k: String(k) } },
      pickRow[k] < 0 ? '–' : String(Math.round(pickRow[k] / 10)),
    ),
  );
  valEls.forEach((el, k) => {
    el.style.left = `${(k * 100) / 3}%`;
    const v = Math.max(0, pickRow[k]);
    const at = agreeing.has(FAMS[k]) ? THRESHOLD : v;
    el.style.top = `${((1000 - at) / 1000) * 100}%`;
  });
  const bandLabel = h('span', { class: 'lv__bandlabel label' }, `${C.topDecile} · 90+`);
  const pickLabel = h('span', { class: 'lv__picklabel' }, h('b', { class: 'ticker' }, hero.pick.ticker), ' ', h('span', {}, `${agreement}/4`));

  const plot = h('div', { class: 'lv__plot flush' }, field.el, over, ...valEls, bandLabel, pickLabel);

  const bar = h('div', { class: 'lv__bar', 'aria-hidden': 'true' });

  const caps = [C.cap0(X), C.cap1(X), C.cap2(X), C.cap3].map((text, i) =>
    h('p', { class: ['lv__cap', i === 0 && 'is-on'], dataset: { s: String(i) } }, text),
  );

  const phoneNode = phoneEl({ text: hero.sms, at: hero.smsAt, locale });
  const phoneWrap = h('div', { class: 'lv__phonewrap flush', 'aria-hidden': 'true' }, phoneNode);

  // the note (pick-note layout) with the 21-day excess path
  const noteChart = buildNoteChart(exPath, ex.excess, fmt, C);
  const note = h(
    'div',
    { class: 'lv__note paper flush', 'aria-hidden': 'true' },
    h(
      'div',
      { class: 'lv__notehead' },
      h('div', { class: 'lv__noteid' }, h('span', { class: 'badge-quorum' }, `${C.buy} · ${agreement}/4`), h('span', { class: 'ticker lv__noteticker' }, hero.pick.ticker), h('span', { class: 'lv__notename' }, `${hero.pick.name} `, h('span', { class: 'tag' }, C.fictional))),
      h('p', { class: 'label lv__noteno' }, `#${hero.pick.no} · ${X.date} 14:00 ${tz}`),
    ),
    h(
      'div',
      { class: 'lv__notedates' },
      h('span', {}, h('span', { class: 'label' }, C.entry), ` ${C.usOpen} ${fmtDDMMYY(hero.issueDate)}`),
      h('span', {}, h('span', { class: 'label' }, C.exit), ` ${C.usOpen} ${fmtDDMMYY(ex.exitDate)}`),
    ),
    noteChart.el,
    h(
      'div',
      { class: 'lv__noteresult' },
      h('span', { class: 'label' }, C.vs),
      h('span', { class: 'lv__notex' }, signed(ex.excess, { fmt })),
      h('span', { class: 'lv__notesub' }, `${C.net} `, signed(ex.net, { fmt }), ` · ${C.bench} `, signed(ex.bench, { fmt })),
    ),
    h('p', { class: 'lv__noteadvice' }, C.notAdvice),
  );

  const axes = h(
    'ol',
    { class: 'lv__axes flush', 'aria-hidden': 'true' },
    FAMS.map((f) => h('li', { class: agreeing.has(f) ? 'is-agree' : '' }, h('b', {}, f), h('span', {}, familyName(f, meta, locale)))),
  );

  const stepBtns = C.steps.map((s, i) =>
    h('button', { type: 'button', class: ['lv__stepbtn', i === 0 && 'is-on'], 'aria-label': C.jump(i + 1, s) }, h('span', { class: 'lv__stepn' }, `0${i + 1}`), h('span', { class: 'lv__steps' }, s)),
  );
  const steps = h('nav', { class: 'lv__stepnav', 'aria-label': C.stepsLabel }, stepBtns);

  const headline = h('h1', { class: 'display d-hero lv__h', id: 'lv-h' }, h('span', {}, C.headline[0]), ' ', h('span', {}, C.headline[1]));

  const stage = h(
    'div',
    { class: 'lv__stage grid ruled' },
    h('p', { class: 'lv__kicker label c-head', 'aria-hidden': 'true' }, C.kicker),
    headline,
    h('p', { class: 'lv__meta label c-meta', 'aria-hidden': 'true' }, C.meta(X)),
    h('div', { class: 'lv__caps c-body', 'aria-hidden': 'true' }, caps),
    plot,
    phoneWrap,
    note,
    axes,
    h('p', { class: 'lv__cue label', 'aria-hidden': 'true' }, h('span', { class: 'lv__cueline' }), C.cue),
    steps,
    bar,
  );

  const altRows = FAMS.map((f, k) =>
    h('tr', {}, h('th', { scope: 'row' }, `${f} · ${familyName(f, meta, locale)}`), h('td', {}, pickRow[k] < 0 ? '–' : String(Math.round(pickRow[k] / 10))), h('td', {}, agreeing.has(f) ? C.yes : C.no)),
  );
  const alt = h(
    'div',
    { class: 'visually-hidden' },
    h('h2', {}, C.altTitle),
    h('p', {}, C.alt1(X)),
    h('p', {}, C.alt2(X)),
    h('table', {}, h('caption', {}, C.altTable), h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, C.altFamily), h('th', { scope: 'col' }, C.altPct), h('th', { scope: 'col' }, C.altTop))), h('tbody', {}, altRows)),
    h('p', {}, `${C.altSms} ${hero.sms}`),
    h(
      'p',
      {},
      C.altResult({
        exit: fmtDDMMYY(ex.exitDate),
        excess: fmt.signed(ex.excess).text,
        net: fmt.signed(ex.net).text,
        bench: fmt.signed(ex.bench).text,
      }),
    ),
  );

  const section = h('section', { class: ['lv', 'chamber', reduced && 'is-stepped'], 'aria-labelledby': 'lv-h' }, stage, alt);

  // ---- behaviour ----------------------------------------------------------------------------------
  let engine = null;
  let geom = null;
  let progress = 0;
  let loadT = reduced ? 1 : 0;
  let loadStart = 0;
  let visible = true;
  let raf = 0;
  let destroyed = false;
  let lastStep = 0;
  let lastFieldKey = '';
  const cleanups = [];
  const engineKind = chooseEngine(ctx.flags?.gl, reduced);
  section.dataset.engine = 'svg';

  function measure() {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const pr = offsetIn(plot, stage);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const ax = [0, 1, 2, 3].map((k) => pr.left + (k * pr.width) / 3);
    geom = { W, H, dpr, ax, yTop: pr.top, yBot: pr.top + pr.height, plot: pr };
    // morph targets
    const bubble = phoneNode.querySelector('.sms');
    const screen = phoneNode.querySelector('.phone__screen');
    geom.bubble = bubble ? offsetIn(bubble, stage) : null;
    geom.screen = screen ? offsetIn(screen, stage) : null;
    geom.note = offsetIn(note, stage);
    geom.lintelY = pr.top + (1 - THRESHOLD / 1000) * pr.height;
    stage.style.setProperty('--head-h', `${headline.offsetHeight}px`);
    engine?.resize?.(geom);
    noteChart.layout();
    lastFieldKey = '';
  }

  function progressNow() {
    const r = section.getBoundingClientRect();
    const range = section.offsetHeight - stage.offsetHeight;
    return range > 0 ? clamp01(-r.top / range) : 0;
  }

  function apply() {
    if (!geom) return;
    const st = stateAt(progress, { stepped: reduced });
    const rise = reduced ? 1 : ease.out3(ease.seg(loadT, 0, 0.62));
    const lock = reduced ? 1 : ease.inOut(ease.seg(loadT, 0.5, 1));
    const s1 = reduced ? st.s1 : ease.inOut(st.s1);
    const s2 = st.s2;
    const s3 = st.s3;

    // field
    const settle = reduced ? 1 : ease.out3(clamp01(loadT));
    const fall = s1;
    const key = `${settle.toFixed(4)}|${fall.toFixed(4)}`;
    if (key !== lastFieldKey) {
      lastFieldKey = key;
      if (engine) engine.draw({ settle, fall });
      else field.draw({ fall }, geom.H);
    }

    // columns rise, the pick line locks into the lintel
    const fadeCols = 1 - ease.seg(s2, 0, 0.3);
    FAMS.forEach((f, k) => {
      const v = Math.max(0, pickRow[k]);
      const top = rise * (agreeing.has(f) ? lerp(v, THRESHOLD, lock) : v);
      put(colEls[k], '@y2', String(Math.round(yN(top) * 10) / 10));
      put(valEls[k], 'opacity', String(ease.seg(loadT, 0.55, 0.95) * fadeCols));
    });
    const pts = FAMS.map((f, k) => {
      const v = Math.max(0, pickRow[k]);
      const y = lerp(v, THRESHOLD, lock);
      return `${xN(k)},${Math.round(yN(y) * 10) / 10}`;
    }).join(' ');
    put(pickLine, '@points', pts);
    put(pickLine, 'strokeWidth', `${lerp(1.5, 4, lock).toFixed(2)}px`);
    put(pickLine, 'opacity', s2 > 0 ? '0' : String(ease.seg(loadT, 0.05, 0.4)));
    put(over, 'opacity', String(fadeCols));
    put(axes, 'opacity', String(1 - ease.seg(s2, 0, 0.25)));
    put(bandLabel, 'opacity', String(fadeCols * ease.seg(loadT, 0.6, 1)));
    put(pickLabel, 'opacity', String(lock * (s2 > 0 ? 0 : 1)));

    // S2: the lintel contracts into the SMS baseline, the phone appears, the bubble grows
    const phoneIn = ease.out3(ease.seg(s2, 0.05, 0.4)) * (1 - ease.seg(s3, 0.12, 0.34));
    put(phoneWrap, 'opacity', String(phoneIn));
    put(phoneWrap, 'transform', `translate3d(0, ${Math.round((1 - ease.out3(ease.seg(s2, 0.05, 0.4))) * 40)}px, 0) scale(${(1 + ease.seg(s3, 0.05, 0.34) * 0.06).toFixed(4)})`);
    put(phoneWrap, 'visibility', phoneIn <= 0.001 ? 'hidden' : 'visible');
    const travel = ease.inOut(ease.seg(s2, 0, 0.45));
    const barOn = s2 > 0 && s2 < 0.9;
    if (barOn && geom.bubble) {
      const from = { x: geom.ax[0], y: geom.lintelY - 2, w: geom.ax[3] - geom.ax[0] };
      const to = { x: geom.bubble.left + 12, y: geom.bubble.top + geom.bubble.height - 7, w: Math.max(40, geom.bubble.width - 24) };
      const x = lerp(from.x, to.x, travel);
      const y = lerp(from.y, to.y, travel);
      const w = lerp(from.w, to.w, travel);
      put(bar, 'transform', `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scaleX(${(w / 1000).toFixed(4)})`);
      put(bar, 'opacity', String(1 - ease.seg(s2, 0.72, 0.88)));
      bar.classList.toggle('is-in', travel > 0.55);
      put(bar, 'visibility', 'visible');
    } else {
      put(bar, 'visibility', 'hidden');
    }
    const bubble = phoneNode.querySelector('.sms');
    if (bubble) {
      const grow = ease.out3(ease.seg(s2, 0.42, 0.78));
      put(bubble, 'clipPath', grow >= 1 ? 'none' : `inset(${Math.round((1 - grow) * 100)}% 0 0 0 round 16px 16px 16px 4px)`);
      bubble.classList.toggle('is-tapped', s3 > 0.02 && s3 < 0.3);
    }
    const when = phoneNode.querySelector('.phone__when');
    if (when) put(when, 'opacity', String(ease.seg(s2, 0.6, 0.85)));

    // S3: the phone opens the link and becomes the pick note (a compositor-only scale from the
    // phone screen to the note); then the lintel extends 21 days to the right
    const open = ease.inOut(ease.seg(s3, 0.1, 0.4));
    if (s3 > 0 && geom.screen && geom.note) {
      const n = geom.note;
      const sc = geom.screen;
      const sx = lerp(sc.width / n.width, 1, open);
      const sy = lerp(sc.height / n.height, 1, open);
      const tx = lerp(sc.left - n.left, 0, open);
      const ty = lerp(sc.top - n.top, 0, open);
      const r = lerp(29, 2, open);
      put(note, 'transform', open >= 1 ? 'none' : `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`);
      put(note, 'borderRadius', open >= 1 ? '' : `${(r / sx).toFixed(1)}px / ${(r / sy).toFixed(1)}px`);
      put(note, 'visibility', 'visible');
      put(note, 'opacity', String(ease.seg(s3, 0.08, 0.16)));
    } else {
      put(note, 'visibility', 'hidden');
    }
    put(note, '--content', String(ease.seg(s3, 0.3, 0.5)));
    noteChart.draw(ease.inOut(ease.seg(s3, 0.42, 0.9)), ease.seg(s3, 0.88, 0.98));

    // captions, steps, cue
    if (st.step !== lastStep || !section.dataset.step) {
      section.dataset.step = String(st.step);
      caps.forEach((c, i) => c.classList.toggle('is-on', i === st.step));
      stepBtns.forEach((b, i) => {
        b.classList.toggle('is-on', i === st.step);
        if (i === st.step) b.setAttribute('aria-current', 'step');
        else b.removeAttribute('aria-current');
      });
      lastStep = st.step;
    }
    put(section, '--cue', String(1 - clamp01(progress / 0.04)));
  }

  function frame(t) {
    raf = 0;
    if (destroyed) return;
    if (loadT < 1 && loadStart) {
      loadT = clamp01((t - loadStart) / 900);
      if (loadT < 1) raf = requestAnimationFrame(frame);
    }
    if (!visible && loadT >= 1) return;
    progress = progressNow();
    apply();
  }

  function request() {
    if (!raf && !destroyed) raf = requestAnimationFrame(frame);
  }

  function startEngine() {
    if (destroyed) return;
    let e = null;
    if (engineKind === 'webgl') {
      try {
        e = createGLField(parsed, sub, rand, () => {
          // context lost: fall back to the 2D canvas
          engine?.destroy?.();
          engine = createCanvasField(parsed, sub, rand);
          stage.prepend(engine.el);
          section.dataset.engine = 'canvas';
          measure();
          request();
        });
      } catch (err) {
        console.warn('Quorum: WebGL unavailable', err);
      }
    }
    if (!e && (engineKind === 'webgl' || engineKind === 'canvas')) e = createCanvasField(parsed, sub, rand);
    if (e) {
      engine = e;
      stage.prepend(e.el);
      section.dataset.engine = e.kind;
      section.classList.add('has-engine');
    }
    measure();
    if (!reduced) {
      loadT = 0;
      loadStart = performance.now();
    }
    request();
  }

  function onResize() {
    measure();
    request();
  }

  // SL: the real Slovene SMS is on the pick record; fetch it lazily.
  if (locale === 'sl') {
    ctx
      .data('picks')
      .then((picks) => {
        const rec = Array.isArray(picks) ? picks.find((p) => p.no === hero.pick.no) : null;
        const text = rec?.sms?.sl;
        const b = phoneNode.querySelector('.sms');
        if (text && b) {
          b.replaceChildren(...String(text).split(/(qrm\.si\/\S+)/g).map((s) => (/^qrm\.si\//.test(s) ? h('u', {}, s) : s)));
          phoneNode.setAttribute('aria-label', `SMS: ${text}`);
          measure();
          request();
        }
      })
      .catch(() => {});
  }

  stepBtns.forEach((b, i) => {
    b.addEventListener('click', () => {
      const mids = [0, 0.3, 0.63, 0.96];
      const range = section.offsetHeight - stage.offsetHeight;
      const top = window.scrollY + section.getBoundingClientRect().top + range * mids[i];
      window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
    });
  });

  return {
    node: section,
    mount() {
      const onScroll = () => request();
      window.addEventListener('scroll', onScroll, { passive: true });
      cleanups.push(() => window.removeEventListener('scroll', onScroll));
      let rt = 0;
      const onRs = () => {
        clearTimeout(rt);
        rt = setTimeout(onResize, 120);
      };
      window.addEventListener('resize', onRs);
      cleanups.push(() => window.removeEventListener('resize', onRs));
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((es) => {
          visible = es.some((e) => e.isIntersecting);
          if (visible) request();
        });
        io.observe(section);
        cleanups.push(() => io.disconnect());
      }
      measure();
      apply();
      // WebGL after first paint: two frames later, then idle time if available.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if ('requestIdleCallback' in window) requestIdleCallback(startEngine, { timeout: 200 });
          else setTimeout(startEngine, 30);
        }),
      );
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      cleanups.forEach((f) => f());
      engine?.destroy?.();
    },
    get engine() {
      return engine?.kind ?? 'svg';
    },
  };
}

function nyOffset(date) {
  // US daylight saving: second Sunday of March to first Sunday of November
  const y = Number(date.slice(0, 4));
  const sunday = (m, n) => {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + (n - 1) * 7;
  };
  const start = `${y}-03-${String(sunday(3, 2)).padStart(2, '0')}`;
  const end = `${y}-11-${String(sunday(11, 1)).padStart(2, '0')}`;
  return date >= start && date < end ? '-04:00' : '-05:00';
}

function offsetIn(el, ancestor) {
  let x = 0;
  let y = 0;
  let n = el;
  while (n && n !== ancestor) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent;
  }
  return { left: x, top: y, width: el.offsetWidth, height: el.offsetHeight };
}

// The 21-day excess path inside the note: day 0 at rule 1, day 21 at rule 4 (7 trading days a bay).
function buildNoteChart(path, final, fmt, C) {
  const n = path.length ? path[path.length - 1][0] : 21;
  const vals = path.map((d) => d[1]);
  const m = Math.max(0.02, ...vals.map((v) => Math.abs(v))) * 1.15;
  const cls = final > 0 ? 'gain' : final < 0 ? 'loss' : 'flat';
  const X = (d) => (d / Math.max(1, n)) * 1000;
  const Y = (v) => 500 - (v / m) * 440;
  const zero = svg('line', { class: 'lv__zero', x1: 0, x2: 0, y1: 500, y2: 500 });
  const line = svg('polyline', { class: `lv__path ${cls}`, points: '' });
  const grid = [1, 2].map((k) => svg('line', { class: 'lv__vgrid', x1: (k * 1000) / 3, x2: (k * 1000) / 3, y1: 0, y2: 1000 }));
  const el = h(
    'div',
    { class: 'lv__notechart' },
    svg('svg', { viewBox: '0 0 1000 1000', preserveAspectRatio: 'none', focusable: 'false', 'aria-hidden': 'true' }, ...grid, zero, line),
    h('span', { class: 'lv__endlabel' }, signed(final, { fmt })),
    h('span', { class: 'lv__daylabel lv__d0 label' }, `${C.day} 0`),
    h('span', { class: 'lv__daylabel lv__d7 label' }, '7'),
    h('span', { class: 'lv__daylabel lv__d14 label' }, '14'),
    h('span', { class: 'lv__daylabel lv__d21 label' }, '21'),
  );
  const endLabel = el.querySelector('.lv__endlabel');
  endLabel.style.top = `${(Y(final) / 1000) * 100}%`;
  let lastT = -1;
  return {
    el,
    layout() {
      lastT = -1;
    },
    // t: 0..1 of the 21 days drawn; the lintel (zero line) extends with it
    draw(t, endT) {
      endLabel.style.opacity = String(endT);
      if (Math.abs(t - lastT) < 0.0005) return;
      lastT = t;
      const upto = t * n;
      const pts = [];
      for (const [d, v] of path) {
        if (d <= upto) pts.push(`${X(d)},${Y(v)}`);
        else {
          const prev = path[path.findIndex((q) => q[0] === d) - 1];
          if (prev) {
            const f = (upto - prev[0]) / (d - prev[0]);
            pts.push(`${X(upto)},${Y(prev[1] + (v - prev[1]) * f)}`);
          }
          break;
        }
      }
      line.setAttribute('points', pts.join(' '));
      zero.setAttribute('x2', String(X(upto)));
    },
  };
}
