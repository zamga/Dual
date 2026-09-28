// Statistics used by the engine, the scoreboard and the backtest page.
// Every estimate Quorum publishes carries its uncertainty, so the interval helpers live here too.
import { mulberry32 } from './random.js';

const finite = (xs) => xs.filter((x) => typeof x === 'number' && Number.isFinite(x));

export function sum(xs) {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

export function mean(xs) {
  const v = finite(xs);
  return v.length ? sum(v) / v.length : NaN;
}

export function quantile(xs, q) {
  const v = finite(xs).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

export function median(xs) {
  return quantile(xs, 0.5);
}

// Sample standard deviation (n - 1).
export function std(xs) {
  const v = finite(xs);
  if (v.length < 2) return NaN;
  const m = sum(v) / v.length;
  let ss = 0;
  for (const x of v) ss += (x - m) ** 2;
  return Math.sqrt(ss / (v.length - 1));
}

// Ranks 1..n with ties averaged.
export function rank(xs) {
  const idx = xs.map((x, i) => i).sort((a, b) => xs[a] - xs[b]);
  const out = new Array(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && xs[idx[j + 1]] === xs[idx[i]]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k]] = r;
    i = j + 1;
  }
  return out;
}

export function pearson(x, y) {
  const n = Math.min(x.length, y.length);
  const a = [];
  const b = [];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) {
      a.push(x[i]);
      b.push(y[i]);
    }
  }
  if (a.length < 3) return NaN;
  const ma = sum(a) / a.length;
  const mb = sum(b) / b.length;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < a.length; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : NaN;
}

export function spearman(x, y) {
  const n = Math.min(x.length, y.length);
  const a = [];
  const b = [];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) {
      a.push(x[i]);
      b.push(y[i]);
    }
  }
  if (a.length < 3) return NaN;
  return pearson(rank(a), rank(b));
}

export function hitRate(xs) {
  const v = finite(xs);
  return v.length ? v.filter((x) => x > 0).length / v.length : NaN;
}

// Percentile bootstrap interval for any statistic.
export function bootstrapCI(values, stat = mean, { n = 2000, alpha = 0.05, seed = 7 } = {}) {
  const v = finite(values);
  if (v.length < 2) return [NaN, NaN];
  const rng = mulberry32(seed);
  const draws = new Array(n);
  const sample = new Array(v.length);
  for (let b = 0; b < n; b++) {
    for (let i = 0; i < v.length; i++) sample[i] = v[Math.floor(rng() * v.length)];
    draws[b] = stat(sample);
  }
  return [quantile(draws, alpha / 2), quantile(draws, 1 - alpha / 2)];
}

// Wilson score interval for a proportion (used for hit rates with few picks).
export function wilsonCI(successes, n, z = 1.959964) {
  if (!n) return [NaN, NaN];
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - h) / d, (c + h) / d];
}

export function sharpe(returns, periodsPerYear = 1) {
  const s = std(returns);
  return s ? (mean(returns) / s) * Math.sqrt(periodsPerYear) : NaN;
}

// Deepest peak-to-trough fall of an equity curve, as a negative fraction (0 if it never falls).
export function maxDrawdown(equity) {
  let peak = -Infinity;
  let worst = 0;
  for (const x of equity) {
    if (!Number.isFinite(x)) continue;
    if (x > peak) peak = x;
    const dd = x / peak - 1;
    if (dd < worst) worst = dd;
  }
  return worst;
}

export function skewness(xs) {
  const v = finite(xs);
  const n = v.length;
  if (n < 3) return NaN;
  const m = sum(v) / n;
  let m2 = 0;
  let m3 = 0;
  for (const x of v) {
    m2 += (x - m) ** 2;
    m3 += (x - m) ** 3;
  }
  m2 /= n;
  m3 /= n;
  return m2 ? m3 / m2 ** 1.5 : NaN;
}

// Non-excess kurtosis (3 for a normal distribution).
export function kurtosis(xs) {
  const v = finite(xs);
  const n = v.length;
  if (n < 4) return NaN;
  const m = sum(v) / n;
  let m2 = 0;
  let m4 = 0;
  for (const x of v) {
    m2 += (x - m) ** 2;
    m4 += (x - m) ** 4;
  }
  m2 /= n;
  m4 /= n;
  return m2 ? m4 / (m2 * m2) : NaN;
}

// Standard normal CDF via the Numerical Recipes erfc approximation (fractional error below 1.2e-7).
export function normCdf(x) {
  return 0.5 * erfc(-x / Math.SQRT2);
}

function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

// Inverse standard normal CDF (Acklam), relative error below 1.15e-9.
export function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q;
  let r;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= 1 - pl) {
    q = p - 0.5;
    r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

const EULER_GAMMA = 0.5772156649015329;

// Expected maximum Sharpe ratio among nTrials zero-skill strategies (Bailey & López de Prado 2014).
export function expectedMaxSharpe(nTrials, varSR) {
  if (nTrials <= 1 || !(varSR > 0)) return 0;
  return Math.sqrt(varSR) * ((1 - EULER_GAMMA) * normInv(1 - 1 / nTrials) + EULER_GAMMA * normInv(1 - 1 / (nTrials * Math.E)));
}

/**
 * Deflated Sharpe Ratio: probability that the true Sharpe exceeds the best a set of zero-skill
 * trials would show by luck. `sr`, `varSR` and `T` share one periodicity (e.g. monthly).
 */
export function deflatedSharpe({ sr, nTrials, varSR, T, skew = 0, kurt = 3 }) {
  const sr0 = expectedMaxSharpe(nTrials, varSR);
  const denom = Math.sqrt(Math.max(1e-12, 1 - skew * sr + ((kurt - 1) / 4) * sr * sr));
  return normCdf(((sr - sr0) * Math.sqrt(T - 1)) / denom);
}

function combinations(n, k) {
  const out = [];
  const cur = [];
  (function rec(start) {
    if (cur.length === k) {
      out.push(cur.slice());
      return;
    }
    for (let i = start; i <= n - (k - cur.length); i++) {
      cur.push(i);
      rec(i + 1);
      cur.pop();
    }
  })(0);
  return out;
}

/**
 * Probability of Backtest Overfitting via combinatorially symmetric cross-validation
 * (Bailey, Borwein, López de Prado & Zhu). `matrix` is T rows (periods) x N columns (variants)
 * of returns. For every split of S row-blocks into halves, the in-sample best variant's
 * out-of-sample relative rank w gives a logit ln(w / (1 - w)); PBO is the share of logits <= 0.
 */
export function pbo(matrix, S = 16) {
  const T = matrix.length;
  const N = matrix[0]?.length ?? 0;
  if (N < 2 || T < S) throw new Error('pbo: need at least 2 variants and S rows');
  if (S % 2) throw new Error('pbo: S must be even');
  // Per-block sufficient statistics, so each split costs O(S * N) instead of O(T * N).
  const blockOf = (t) => Math.min(S - 1, Math.floor((t * S) / T));
  const cnt = new Float64Array(S);
  const s1 = Array.from({ length: S }, () => new Float64Array(N));
  const s2 = Array.from({ length: S }, () => new Float64Array(N));
  for (let t = 0; t < T; t++) {
    const b = blockOf(t);
    cnt[b]++;
    for (let j = 0; j < N; j++) {
      const x = matrix[t][j];
      s1[b][j] += x;
      s2[b][j] += x * x;
    }
  }
  const perf = (blocks, out) => {
    let n = 0;
    for (const b of blocks) n += cnt[b];
    for (let j = 0; j < N; j++) {
      let a = 0;
      let q = 0;
      for (const b of blocks) {
        a += s1[b][j];
        q += s2[b][j];
      }
      const m = a / n;
      const v = (q - n * m * m) / Math.max(1, n - 1);
      out[j] = v > 0 ? m / Math.sqrt(v) : m > 0 ? Infinity : m < 0 ? -Infinity : 0;
    }
  };
  const all = Array.from({ length: S }, (_, i) => i);
  const logits = [];
  const isPerf = new Float64Array(N);
  const oosPerf = new Float64Array(N);
  for (const combo of combinations(S, S / 2)) {
    const inSet = new Set(combo);
    perf(combo, isPerf);
    perf(all.filter((b) => !inSet.has(b)), oosPerf);
    let best = 0;
    for (let j = 1; j < N; j++) if (isPerf[j] > isPerf[best]) best = j;
    let below = 0;
    let ties = 0;
    for (let j = 0; j < N; j++) {
      if (oosPerf[j] < oosPerf[best]) below++;
      else if (oosPerf[j] === oosPerf[best] && j !== best) ties++;
    }
    const rankOos = below + 1 + ties / 2; // 1 = worst out of sample
    const w = rankOos / (N + 1);
    logits.push(Math.log(w / (1 - w)));
  }
  return { pbo: logits.filter((l) => l <= 0).length / logits.length, logits };
}
