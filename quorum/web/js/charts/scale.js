// Small pure helpers shared by the SVG charts (tested in tests/web/charts.test.js).
// Charts draw in a viewBox normalised to 0–1000 (preserveAspectRatio="none", non-scaling strokes) and
// put their text in HTML positioned in %, so labels never stretch (docs/DESIGN.md §8).

export function linear(d0, d1, r0 = 0, r1 = 1000) {
  const span = d1 - d0 || 1;
  const f = (v) => r0 + ((v - d0) / span) * (r1 - r0);
  f.invert = (y) => d0 + ((y - r0) / (r1 - r0)) * span;
  return f;
}

export function logScale(d0, d1, r0 = 0, r1 = 1000) {
  const a = Math.log(d0);
  const b = Math.log(d1);
  return (v) => r0 + ((Math.log(Math.max(v, 1e-9)) - a) / (b - a || 1)) * (r1 - r0);
}

export function extent(values) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo === Infinity ? [0, 1] : [lo, hi];
}

// "Nice" steps: 1, 2, 2.5, 5 × 10^k.
export function niceStep(span, count = 5) {
  const raw = Math.abs(span) / Math.max(1, count);
  if (!raw) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  const k = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return k * p;
}

export function ticks(lo, hi, count = 5) {
  const step = niceStep(hi - lo, count);
  const out = [];
  const start = Math.ceil(lo / step - 1e-9) * step;
  for (let v = start; v <= hi + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out.map((v) => (Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12))));
}

// Padded domain that always contains zero (returns and excess returns).
export function domainWithZero(values, pad = 0.08) {
  let [lo, hi] = extent(values);
  lo = Math.min(lo, 0);
  hi = Math.max(hi, 0);
  const span = hi - lo || 0.01;
  return [lo - span * pad, hi + span * pad];
}

// Multiples of an index for log charts: 1, 2, 5, 10, 20, 50 … within [lo, hi].
export function logTicks(lo, hi) {
  const out = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
    }
  }
  return out;
}

export function pointsAttr(points) {
  return points.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');
}

export function pathD(points) {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${round(x)} ${round(y)}`).join('');
}

const round = (v) => Math.round(v * 10) / 10;

// Histogram with fixed bins over [lo, hi): returns [{x0, x1, n}].
export function histogram(values, lo, hi, bins) {
  const w = (hi - lo) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, n: 0 }));
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const i = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / w)));
    out[i].n++;
  }
  return out;
}

// Index of the point nearest to x in an ascending array of xs.
export function nearestIndex(xs, x) {
  let lo = 0;
  let hi = xs.length - 1;
  if (hi < 0) return -1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < x) lo = mid;
    else hi = mid;
  }
  return Math.abs(xs[lo] - x) <= Math.abs(xs[hi] - x) ? lo : hi;
}

// Percent position helper for HTML labels over a 0–1000 plot.
export const pct = (v) => `${Math.round(v * 100) / 1000}%`;
