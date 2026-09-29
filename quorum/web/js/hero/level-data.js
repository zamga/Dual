// Pure helpers for The Level (no DOM): parsing hero.json, the deterministic subsample used by the
// SVG first paint and the 2D canvas, the per-segment vertex data for WebGL, and the scroll states.
import { mulberry32, hashSeed } from '../core/random.js';

export const FAMS = ['A', 'B', 'C', 'D'];
// The rule threshold on the 0–1000 scale of hero.json comes from the data (meta.rule.topPct, calibrated
// per methodology version). DEFAULT_THRESHOLD is used only when meta.json is unavailable.
export const DEFAULT_THRESHOLD = 950;
export function thresholdOf(meta) {
  const v = meta?.rule?.topPct;
  return Number.isFinite(v) && v > 0 && v < 1 ? Math.round(v * 1000) : DEFAULT_THRESHOLD;
}

// hero.p is flat [A0,B0,C0,D0, A1,…]; -1 = not scored by that family.
export function parseHero(hero, threshold = DEFAULT_THRESHOLD) {
  const THRESHOLD = threshold;
  const p = hero.p;
  const n = Math.floor(p.length / 4);
  const pick = hero.pick;
  const pickRow = [p[pick.index * 4], p[pick.index * 4 + 1], p[pick.index * 4 + 2], p[pick.index * 4 + 3]];
  const agree = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let c = 0;
    for (let f = 0; f < 4; f++) if (p[i * 4 + f] >= THRESHOLD) c++;
    agree[i] = c;
  }
  return { n, p, pick, pickRow, agree, threshold };
}

// A deterministic subsample of k rows (never the pick), seeded by the issue date, sorted ascending.
export function subsample(n, pickIndex, k = 300, seedKey = 'level') {
  const rng = mulberry32(hashSeed('level-subsample', seedKey));
  const idx = [];
  for (let i = 0; i < n; i++) if (i !== pickIndex) idx.push(i);
  // partial Fisher–Yates: the first k of a seeded shuffle
  const m = Math.min(k, idx.length);
  for (let i = 0; i < m; i++) {
    const j = i + Math.floor(rng() * (idx.length - i));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, m).sort((a, b) => a - b);
}

// Per-line random attributes (seed for stagger, noise for the start position of each vertex).
export function lineRandoms(n, seedKey = 'level') {
  const rng = mulberry32(hashSeed('level-randoms', seedKey));
  const seed = new Float32Array(n);
  const noise = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    seed[i] = rng();
    for (let f = 0; f < 4; f++) noise[i * 4 + f] = rng();
  }
  return { seed, noise };
}

// WebGL vertex data: every polyline is 3 segments, every segment a quad (2 triangles, 6 vertices).
// Layout per vertex (10 floats): axisA, pctA, noiseA, axisB, pctB, noiseB, seed, kind, side, end.
// kind = nearMiss (0|1) + 2 * inSubsample (0|1). pct in 0..1, or -1 when the segment has a gap.
export const STRIDE = 10;
export function buildVertices(parsed, sub, rand) {
  const { n, p, pick, agree } = parsed;
  const inSub = new Uint8Array(n);
  for (const i of sub) inSub[i] = 1;
  const lines = n - 1;
  const out = new Float32Array(lines * 3 * 6 * STRIDE);
  const corners = [
    [-1, 0],
    [1, 0],
    [-1, 1],
    [-1, 1],
    [1, 0],
    [1, 1],
  ];
  let o = 0;
  for (let i = 0; i < n; i++) {
    if (i === pick.index) continue;
    const kind = (agree[i] >= 2 ? 1 : 0) + 2 * inSub[i];
    for (let s = 0; s < 3; s++) {
      const a = p[i * 4 + s];
      const b = p[i * 4 + s + 1];
      const gap = a < 0 || b < 0;
      const pa = gap ? -1 : a / 1000;
      const pb = gap ? -1 : b / 1000;
      for (const [side, end] of corners) {
        out[o++] = s;
        out[o++] = pa;
        out[o++] = rand.noise[i * 4 + s];
        out[o++] = s + 1;
        out[o++] = pb;
        out[o++] = rand.noise[i * 4 + s + 1];
        out[o++] = rand.seed[i];
        out[o++] = kind;
        out[o++] = side;
        out[o++] = end;
      }
    }
  }
  return out;
}

// Scroll progress (0..1 over the tall section) -> the four states and their local progress.
export const STATES = [
  { id: 0, from: 0, to: 0.05 },
  { id: 1, from: 0.07, to: 0.3 },
  { id: 2, from: 0.36, to: 0.62 },
  { id: 3, from: 0.68, to: 0.95 },
];

const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function stateAt(progress, { stepped = false } = {}) {
  const p = clamp01(progress);
  if (stepped) {
    const s = p < 0.18 ? 0 : p < 0.47 ? 1 : p < 0.78 ? 2 : 3;
    return { step: s, s1: s >= 1 ? 1 : 0, s2: s >= 2 ? 1 : 0, s3: s >= 3 ? 1 : 0 };
  }
  const local = (st) => clamp01((p - st.from) / (st.to - st.from));
  const s1 = local(STATES[1]);
  const s2 = local(STATES[2]);
  const s3 = local(STATES[3]);
  const step = s3 > 0 ? 3 : s2 > 0 ? 2 : s1 > 0 ? 1 : 0;
  return { step, s1, s2, s3 };
}

export const ease = {
  out3: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  seg: (t, a, b) => clamp01((t - a) / (b - a)),
};

// Excess path [[day, net, bench]] -> [[day, excess]]
export function excessPath(path) {
  return (path ?? []).map(([d, net, bench]) => [d, net - bench]);
}
