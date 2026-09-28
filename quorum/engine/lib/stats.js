// Typed-array statistics used on the hot paths of the engine (ranks over ~1,400 names per day,
// thousands of days). core/stats.js has the general-purpose versions; these avoid per-cell objects.
import { normInv } from '../../core/stats.js';

export { normInv };

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
let kA = new Uint32Array(4096);
let kB = new Uint32Array(4096);
let iA = new Int32Array(4096);
let iB = new Int32Array(4096);
const cnt = new Int32Array(2048);

// Map a float to a uint32 whose unsigned order matches the float order (IEEE-754 trick).
function sortableBits(v) {
  f32[0] = v;
  const b = u32[0];
  return b & 0x80000000 ? ~b >>> 0 : (b | 0x80000000) >>> 0;
}

/**
 * Average ranks (1..m) of the finite values in `values[0..n)`, ties averaged; NaN stays NaN.
 * Writes into `out` (length >= n) and returns the number of finite values m.
 * LSD radix sort (3 passes of 11 bits) over order-preserving 32-bit keys: no comparator calls.
 */
export function rankInto(values, n, out) {
  if (n < 400) return rankSmall(values, n, out);
  if (kA.length < n) {
    kA = new Uint32Array(n);
    kB = new Uint32Array(n);
    iA = new Int32Array(n);
    iB = new Int32Array(n);
  }
  let m = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v === v) {
      kA[m] = sortableBits(v);
      iA[m] = i;
      m++;
    } else out[i] = NaN;
  }
  let ka = kA;
  let kb = kB;
  let ia = iA;
  let ib = iB;
  for (let shift = 0; shift < 32; shift += 11) {
    cnt.fill(0);
    for (let j = 0; j < m; j++) cnt[(ka[j] >>> shift) & 2047]++;
    let s = 0;
    for (let b = 0; b < 2048; b++) {
      const c = cnt[b];
      cnt[b] = s;
      s += c;
    }
    for (let j = 0; j < m; j++) {
      const key = ka[j];
      const p = cnt[(key >>> shift) & 2047]++;
      kb[p] = key;
      ib[p] = ia[j];
    }
    let tk = ka;
    ka = kb;
    kb = tk;
    tk = ia;
    ia = ib;
    ib = tk;
  }
  let a = 0;
  while (a < m) {
    let b = a;
    const key = ka[a];
    while (b + 1 < m && ka[b + 1] === key) b++;
    const r = (a + b) / 2 + 1;
    for (let k = a; k <= b; k++) out[ia[k]] = r;
    a = b + 1;
  }
  return m;
}

const smallIdx = new Int32Array(400);

function rankSmall(values, n, out) {
  let m = 0;
  for (let i = 0; i < n; i++) {
    if (values[i] === values[i]) smallIdx[m++] = i;
    else out[i] = NaN;
  }
  const idx = smallIdx.subarray(0, m);
  // insertion sort: fast for the small sector cross-sections
  for (let a = 1; a < m; a++) {
    const cur = idx[a];
    const v = values[cur];
    let b = a - 1;
    while (b >= 0 && values[idx[b]] > v) {
      idx[b + 1] = idx[b];
      b--;
    }
    idx[b + 1] = cur;
  }
  let a = 0;
  while (a < m) {
    let b = a;
    while (b + 1 < m && values[idx[b + 1]] === values[idx[a]]) b++;
    const r = (a + b) / 2 + 1;
    for (let k = a; k <= b; k++) out[idx[k]] = r;
    a = b + 1;
  }
  return m;
}

/** Cross-sectional rank transform to (-1, 1); missing -> 0. Writes into out. */
export function rankTransform(values, n, out, tmp = new Float64Array(n)) {
  const m = rankInto(values, n, tmp);
  for (let i = 0; i < n; i++) {
    const r = tmp[i];
    out[i] = r === r ? (2 * (r - 0.5)) / m - 1 : 0;
  }
  return m;
}

/** Percentile in (0, 1): (rank - 0.5) / m among finite values; missing -> NaN. */
export function percentileInto(values, n, out, tmp = new Float64Array(n)) {
  const m = rankInto(values, n, tmp);
  for (let i = 0; i < n; i++) {
    const r = tmp[i];
    out[i] = r === r ? (r - 0.5) / m : NaN;
  }
  return m;
}

/** Spearman rank correlation over pairs where both are finite. */
export function spearman(x, y, n = x.length) {
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  let m = 0;
  for (let i = 0; i < n; i++) {
    if (x[i] === x[i] && y[i] === y[i]) {
      xs[m] = x[i];
      ys[m] = y[i];
      m++;
    }
  }
  if (m < 3) return NaN;
  const rx = new Float64Array(m);
  const ry = new Float64Array(m);
  rankInto(xs, m, rx);
  rankInto(ys, m, ry);
  return pearson(rx, ry, m);
}

export function pearson(x, y, n = x.length) {
  let sx = 0;
  let sy = 0;
  let m = 0;
  for (let i = 0; i < n; i++) {
    if (x[i] === x[i] && y[i] === y[i]) {
      sx += x[i];
      sy += y[i];
      m++;
    }
  }
  if (m < 3) return NaN;
  const mx = sx / m;
  const my = sy / m;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    if (x[i] === x[i] && y[i] === y[i]) {
      const a = x[i] - mx;
      const b = y[i] - my;
      sxy += a * b;
      sxx += a * a;
      syy += b * b;
    }
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}

export function mean(xs) {
  let s = 0;
  let m = 0;
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i];
    if (v === v) {
      s += v;
      m++;
    }
  }
  return m ? s / m : NaN;
}

export function std(xs) {
  const mu = mean(xs);
  let s = 0;
  let m = 0;
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i];
    if (v === v) {
      s += (v - mu) ** 2;
      m++;
    }
  }
  return m > 1 ? Math.sqrt(s / (m - 1)) : NaN;
}

/** Quantile of the finite values (linear interpolation). */
export function quantile(xs, q) {
  const v = Float64Array.from(Array.prototype.filter.call(xs, (x) => x === x));
  if (!v.length) return NaN;
  v.sort();
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

/** z-score implied by a rank-transformed value in (-1, 1). */
export function rankToZ(r) {
  const p = Math.min(0.9995, Math.max(0.0005, (r + 1) / 2));
  return normInv(p);
}
