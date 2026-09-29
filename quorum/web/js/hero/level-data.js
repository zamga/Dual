// The Assembly (home hero, docs/DESIGN-V2.md §4.1): the pure half. No DOM, no WebGL; tested in Node.
// Parsing hero.json, the scroll state machine, the camera, the per-mote kinematics (mirrored line for line
// by the grain vertex shader in shaders.js, so the SVG and 2D-canvas fallbacks draw the same frames), the
// lintel's landing curve and the projection the DOM labels and the SMS hand-off use.
import { mulberry32, hashSeed } from '../core/random.js';

export const FAMS = ['A', 'B', 'C', 'D'];
// The rule threshold on the 0–1000 scale of hero.json comes from the data (meta.rule.topPct, calibrated
// per methodology version). DEFAULT_THRESHOLD is used only when meta.json is unavailable.
export const DEFAULT_THRESHOLD = 950;
export function thresholdOf(meta) {
  const v = meta?.rule?.topPct;
  return Number.isFinite(v) && v > 0 && v < 1 ? Math.round(v * 1000) : DEFAULT_THRESHOLD;
}

// hero.p is flat [A0,B0,C0,D0, A1,…], integer permille; -1 = not scored by that family.
export function parseHero(hero, threshold = DEFAULT_THRESHOLD, minAgree = 3) {
  const p = hero.p;
  const n = Math.floor(p.length / 4);
  const pick = hero.pick;
  const pickRow = [0, 1, 2, 3].map((f) => p[pick.index * 4 + f]);
  const agree = new Uint8Array(n);
  let met = 0;
  for (let i = 0; i < n; i++) {
    let c = 0;
    for (let f = 0; f < 4; f++) if (p[i * 4 + f] >= threshold) c++;
    agree[i] = c;
    if (c >= minAgree) met++;
  }
  return { n, p, pick, pickRow, agree, threshold, met };
}

// A deterministic subsample of k rows (never the pick), seeded by the issue date, sorted ascending.
export function subsample(n, pickIndex, k = 300, seedKey = 'level') {
  const rng = mulberry32(hashSeed('level-subsample', seedKey));
  const idx = [];
  for (let i = 0; i < n; i++) if (i !== pickIndex) idx.push(i);
  const m = Math.min(k, idx.length);
  for (let i = 0; i < m; i++) {
    const j = i + Math.floor(rng() * (idx.length - i));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, m).sort((a, b) => a - b);
}

// Excess path [[day, net, bench]] -> [[day, excess]], one point per day. The data has two rows for day 0
// (the entry at the US open, then that day's close; ARCHITECTURE §3): the chart keeps the entry, so the line
// starts where the position did and never draws a vertical spike at x = 0.
export function excessPath(path) {
  const out = [];
  for (const [d, net, bench] of path ?? []) {
    if (out.length && out[out.length - 1][0] === d) continue;
    out.push([d, net - bench]);
  }
  return out;
}

// ---- easing -----------------------------------------------------------------------------------------
export const clamp01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
export const seg = (t, a, b) => clamp01((t - a) / (b - a));
export const lerp = (a, b, t) => a + (b - a) * t;

// CSS cubic-bezier(x1, y1, x2, y2) as a function of t (Newton, then bisection).
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const X = (s) => ((ax * s + bx) * s + cx) * s;
  const Y = (s) => ((ay * s + by) * s + cy) * s;
  const dX = (s) => (3 * ax * s + 2 * bx) * s + cx;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 6; i++) {
      const e = X(s) - t;
      const d = dX(s);
      if (Math.abs(e) < 1e-6) return Y(s);
      if (Math.abs(d) < 1e-6) break;
      s -= e / d;
    }
    let lo = 0;
    let hi = 1;
    s = t;
    for (let i = 0; i < 30; i++) {
      const x = X(s);
      if (Math.abs(x - t) < 1e-6) break;
      if (x < t) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return Y(s);
  };
}
// The motion tokens of DESIGN-V2 §3.5
export const E = {
  out: bezier(0.16, 1, 0.3, 1),
  io: bezier(0.7, 0, 0.2, 1),
  ui: bezier(0.2, 0, 0, 1),
  land: bezier(0.2, 0.9, 0.25, 1),
};
// The grains' flight curve. The vertex shader cannot afford a bezier solve per vertex, so the grains use
// this closed form of --e-out (exponential out, max error 0.03 against the bezier) on every engine.
export function eOutFast(t) {
  return t >= 1 ? 1 : t <= 0 ? 0 : (1 - 2 ** (-10 * t)) / (1 - 2 ** -10);
}

// ---- the state machine (DESIGN-V2 §4.1) -------------------------------------------------------------
// Milestones inside the states (fractions of p). The step indicator reads the same table (PHASES below is
// built from it), so the step never names a state the scene has not reached.
export const AT = {
  vote: 0.06, // the grains lift off just before the vote's headline masks in (the scene leads, never lags)
  slabIn: [0.16, 0.24],
  slabOut: [0.62, 0.68],
  dolly: [0.5, 0.57], // the camera cranes up to the rule band (x and z never change: A and D stay on rules 1 and 4)
  brighten: [0.5, 0.55],
  lintel: [0.54, 0.6], // .06 of p, on --e-land
  hand: [0.645, 0.685], // the lintel contracts onto the SMS baseline
  handFade: [0.685, 0.695], // canvas beam -> DOM line, same pixels
  phone: [0.69, 0.73], // then the phone rises behind the line
  bubble: 0.714, // the bubble grows (time-based, 90 ms a line) once the phone is 60% risen
  dim: [0.82, 0.86],
  note: 0.845, // the phone screen becomes the note (FLIP, 700 ms)
  path: [0.86, 0.96], // the 21-day path, scrubbed by p
  result: 0.955, // digits reveal, then "Whatever happened."
};
export const PHASES = [
  { id: 'universe', from: 0, to: 0.1 },
  { id: 'vote', from: 0.1, to: 0.3 },
  { id: 'silence', from: 0.3, to: 0.5 },
  { id: 'quorum', from: 0.5, to: AT.hand[0] },
  { id: 'text', from: AT.hand[0], to: AT.note },
  { id: 'result', from: AT.note, to: 1 },
];
// The settled frame of each state: where a step button scrolls to, and the frame reduced motion shows.
export const SETTLED = [0.03, 0.27, 0.48, 0.62, 0.8, 0.99];

export function phaseAt(p) {
  const x = clamp01(p);
  for (let i = PHASES.length - 1; i >= 0; i--) if (x >= PHASES[i].from) return i;
  return 0;
}

// Everything a frame needs, from scroll progress p. stepped: every state shows its settled frame.
export function sceneAt(progress, { stepped = false } = {}) {
  const step = phaseAt(progress);
  const p = stepped ? SETTLED[step] : clamp01(progress);
  const ph = (i) => seg(p, PHASES[i].from, PHASES[i].to);
  return {
    p,
    step,
    vote: seg(p, AT.vote, PHASES[1].to), // grains fly to their columns (per-mote stagger in the shader)
    fall: ph(2), // below the rule they fall into the sediment
    tilt: E.io(ph(2)), // the camera tilts down 3° (4° spread the columns off the rules at 1920)
    dolly: E.io(seg(p, ...AT.dolly)),
    brighten: seg(p, ...AT.brighten),
    lintel: seg(p, ...AT.lintel), // 0..1 of the extrusion; lintelExtent() adds the landing
    slab: seg(p, ...AT.slabIn) * (1 - seg(p, ...AT.slabOut)),
    hand: E.io(seg(p, ...AT.hand)),
    handFade: seg(p, ...AT.handFade),
    phone: E.out(seg(p, ...AT.phone)),
    bubble: p >= AT.bubble,
    note: p >= AT.note,
    path: E.io(seg(p, ...AT.path)),
    result: p >= AT.result,
    dim: 1 - 0.7 * seg(p, ...AT.dim), // the canvas dims to 30%
    drift: p < PHASES[2].from, // the idle drift only moves the cloud
  };
}

// The lintel's length in px as it extrudes from A to D: --e-land to 2 px past D, then it settles.
export function lintelExtent(t, span, over = 2) {
  if (t <= 0) return 0;
  if (t < 0.8) return E.land(t / 0.8) * (span + over);
  return span + over - over * E.out((t - 0.8) / 0.2);
}

// ---- layout and camera ------------------------------------------------------------------------------
export const FOV = (28 * Math.PI) / 180;
export const Z_REST = 9;
export const Z_QUORUM = 6.2;
const TAN = Math.tan(FOV / 2);

// World layout from the stage in CSS px: the columns stand on the four page rules (their projection at
// rest falls on the rules), the percentile scale runs from the floor to under the header.
export function computeLayout({ W, H, rules, top, floor, thr = DEFAULT_THRESHOLD, quorumFloor = H }) {
  const halfH = Z_REST * TAN;
  const halfW = halfH * (W / H);
  const wx = (px) => (px / W) * 2 * halfW - halfW;
  const wy = (py) => halfH - (py / H) * 2 * halfH;
  const colX = rules.map(wx);
  const floorY = wy(floor);
  const y0 = floorY + 0.05;
  const yH = wy(top) - y0;
  const bay = (colX[3] - colX[0]) / 3;
  const span = colX[3] - colX[0];
  // the cloud: in front of the columns, across the bays, between the floor and the rule band
  const cz = 0.9;
  const k = (Z_REST - cz) / Z_REST; // world units at depth cz per world unit at z = 0
  const cc = [(colX[0] + colX[3]) / 2, y0 + yH * 0.54, cz];
  const cr = [(span / 2) * k * 0.8, yH * 0.38 * k, 0.55];
  // the quorum shot: the camera cranes (y only) so the rule band sits in the upper third. It never dollies
  // in z or pans in x: the projected columns A and D stay on rules 1 and 4 at every width (a dolly moved
  // them off the page rules and, on phones, half off-screen).
  const zQ = Z_REST;
  const yThr = y0 + (thr / 1000) * yH;
  // ... but the floor may not sink below quorumFloor (px): the quorum beat's headline stands under it
  const yQ = Math.min(yThr - 0.36 * zQ * TAN, floorY - (1 - (2 * quorumFloor) / H) * (zQ - 0.06) * TAN);
  return { W, H, colX, y0, yH, floorY, bay, span, cc, cr, thr: thr / 1000, zQ, yQ, xQ: 0, yThr };
}

export function cameraAt(sc, L, parallax = [0, 0]) {
  const deg = Math.PI / 180;
  const pitch = lerp(-3 * deg * sc.tilt, -1 * deg, sc.dolly) + parallax[1] * 1.2 * deg;
  const yaw = parallax[0] * 1.2 * deg;
  // the tilt rises as it pitches, so the rule band holds its place and the floor opens up below it
  const rise = Z_REST * Math.tan(3 * deg) * sc.tilt * 0.8;
  const y = lerp(rise, L.yQ, sc.dolly);
  // A pitched camera brings the floor nearer than the capitals, which spreads the columns off the rules.
  // Hold the view depth of the columns' middle at its rest value, so A and D stay on rules 1 and 4.
  const sp = Math.sin(-pitch);
  const cp = Math.cos(-pitch);
  const yRef = L.y0 + L.yH / 2;
  const z = 0.06 + (lerp(Z_REST, L.zQ, sc.dolly) - 0.06 + sp * (yRef - y)) / cp;
  return { pos: [lerp(0, L.xQ, sc.dolly), y, z], pitch, yaw };
}

// Column-major view-projection matrix: perspective(FOV) * Rx(-pitch) * Ry(-yaw) * T(-pos)
export function viewProj(cam, aspect, near = 0.1, far = 60) {
  const f = 1 / TAN;
  const P = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
  const cp = Math.cos(-cam.pitch);
  const sp = Math.sin(-cam.pitch);
  const cy = Math.cos(-cam.yaw);
  const sy = Math.sin(-cam.yaw);
  const Rx = [1, 0, 0, 0, 0, cp, sp, 0, 0, -sp, cp, 0, 0, 0, 0, 1];
  const Ry = [cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1];
  const [x, y, z] = cam.pos;
  const T = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1];
  return mul(P, mul(Rx, mul(Ry, T)));
}

function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}

// World point -> stage CSS px. Returns [x, y, w] (w: clip w, for sizes).
export function project(m, [x, y, z], W, H) {
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [(cx / cw * 0.5 + 0.5) * W, (0.5 - (cy / cw) * 0.5) * H, cw];
}
// px per world unit at clip w, for the stage height H
export const pxPerUnit = (w, H) => H / (2 * TAN * w);

// ---- the grains --------------------------------------------------------------------------------------
// One instance per mote: 4 motes per stock, one per family. 13 floats:
//   pct.xyzw (the stock's four percentiles 0..1, -1 unscored) · r = (seed, jx, jz, sx) · c = (cloud xyz in
//   -1..1, family k) · pick (1 for the pick's motes). All randoms come from here, so every engine agrees.
export const MOTE = 13;
export function buildMotes(parsed, rows, seedKey = 'assembly') {
  const rng = mulberry32(hashSeed('assembly-motes', seedKey));
  const out = new Float32Array(rows.length * 4 * MOTE);
  const gauss = () => Math.max(-1.6, Math.min(1.6, (rng() + rng() + rng() - 1.5) / 0.87)) / 1.6;
  let o = 0;
  for (const i of rows) {
    const isPick = i === parsed.pick.index ? 1 : 0;
    const c = [gauss(), gauss(), gauss()];
    for (let k = 0; k < 4; k++) {
      for (let f = 0; f < 4; f++) {
        const v = parsed.p[i * 4 + f];
        out[o++] = v < 0 ? -1 : v / 1000;
      }
      out[o++] = rng();
      out[o++] = isPick ? 0.5 : rng();
      out[o++] = isPick ? 0.5 : rng();
      out[o++] = rng();
      out[o++] = c[0] + (rng() - 0.5) * 0.03;
      out[o++] = c[1] + (rng() - 0.5) * 0.03;
      out[o++] = c[2] + (rng() - 0.5) * 0.03;
      out[o++] = k;
      out[o++] = isPick;
    }
  }
  return out;
}

// The kinematics of one mote (the grain vertex shader is the same code in GLSL). m: the mote's 13 floats
// at offset o. S: sceneAt() plus time (s). ag: the pick's agreeing families as 0/1 per column.
// Returns [x, y, z, alpha, size(world)].
export function motePos(m, o, S, L, ag, time = 0) {
  const k = m[o + 11];
  const pct = m[o + k];
  const seed = m[o + 4];
  const jx = m[o + 5];
  const jz = m[o + 6];
  const sx = m[o + 7];
  const pick = m[o + 12];
  const cx = m[o + 8];
  const cy = m[o + 9];
  const cz = m[o + 10];
  // the cloud, drifting (a curl-like field of three phase-shifted sines, amplitude .03)
  const x0 = L.cc[0] + cx * L.cr[0] + 0.03 * Math.sin(time * 0.53 + cy * 4 + seed * 6.2832);
  const y0 = L.cc[1] + cy * L.cr[1] + 0.03 * Math.sin(time * 0.47 + cz * 4 + seed * 3.1);
  const z0 = L.cc[2] + cz * L.cr[2] + 0.03 * Math.sin(time * 0.41 + cx * 4 + seed * 9.0);
  // the vote: to the column, at percentile height
  const tx = L.colX[k] + (jx - 0.5) * 0.16;
  const ty = L.y0 + Math.max(pct, 0) * L.yH;
  const tz = 0.06 + (jz - 0.5) * 0.16;
  const ev = eOutFast(clamp01((S.vote - seed * 0.5) / 0.5));
  let x = lerp(x0, tx, ev);
  let y = lerp(y0, ty, ev);
  let z = lerp(z0, tz, ev);
  // silence: below the rule they fall (y -= g t²) and settle into the sediment
  const falls = pct < L.thr && pick < 0.5 ? 1 : 0;
  const tf = clamp01((S.fall - seed * 0.6) / 0.4) * falls;
  y = lerp(y, L.floorY + 0.004 + 0.01 * jz, tf * tf);
  x += (sx - 0.5) * L.bay * tf;
  z += (jz - 0.5) * 1.4 * tf;
  // brightness and size
  const inBand = pct >= L.thr ? 1 : 0;
  let a = lerp(0.3, lerp(0.42, 0.95, inBand), ev);
  a = lerp(a, 0.2, tf);
  const agk = ag[k];
  a *= lerp(1, pick > 0.5 ? 1 : 0.42, S.brighten);
  a = lerp(a, 1, pick * agk * S.brighten);
  const size = lerp(0.013, 0.0105, ev) * (1 + pick * S.brighten * (1.3 * agk + 0.5)) * lerp(1, 0.8, tf);
  return [x, y, z, a, size];
}
