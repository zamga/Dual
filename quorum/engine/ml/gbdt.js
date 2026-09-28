// Histogram gradient-boosted regression trees (squared loss), written for this project.
// Features are quantile-binned into a Uint8Array (row-major, one byte per feature). Trees grow
// level-wise to a fixed depth with a minimum leaf size and L2 leaf regularisation; each tree uses a
// row subsample and a feature subsample; shrinkage scales every leaf. Histograms of the larger
// child come from the parent by subtraction.
import { mulberry32, hashSeed } from '../../core/random.js';

export const GBDT_DEFAULTS = Object.freeze({
  nTrees: 100,
  depth: 4,
  lr: 0.05,
  minLeaf: 200,
  lambda: 5,
  rowSample: 0.3,
  colSample: 0.6,
  nBins: 64,
  seed: 1,
});

// ---- binning for float inputs (the engine passes pre-binned rank features) --------------------------

/** Quantile bin edges per feature from row-major float data. NaN is placed in bin 0. */
export function quantileEdges(X, n, F, nBins = 64) {
  const edges = [];
  for (let f = 0; f < F; f++) {
    const col = [];
    for (let r = 0; r < n; r++) {
      const v = X[r * F + f];
      if (v === v) col.push(v);
    }
    const sorted = Float64Array.from(col).sort();
    const e = [];
    for (let b = 1; b < nBins; b++) {
      if (!sorted.length) break;
      const v = sorted[Math.min(sorted.length - 1, Math.floor((b / nBins) * sorted.length))];
      if (!e.length || v > e[e.length - 1]) e.push(v);
    }
    edges.push(Float64Array.from(e));
  }
  return edges;
}

/** Map float data to bins with the given edges: bin = number of edges strictly below... (upper bound). */
export function applyBins(X, n, F, edges) {
  const out = new Uint8Array(n * F);
  for (let f = 0; f < F; f++) {
    const e = edges[f];
    for (let r = 0; r < n; r++) {
      const v = X[r * F + f];
      if (!(v === v)) {
        out[r * F + f] = 0;
        continue;
      }
      let lo = 0;
      let hi = e.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (e[mid] <= v) lo = mid + 1;
        else hi = mid;
      }
      out[r * F + f] = lo;
    }
  }
  return out;
}

// ---- training ------------------------------------------------------------------------------------

/**
 * Fit a boosted ensemble on binned data.
 * @param {Uint8Array} X  row-major bins, X[row * F + f]; bin = X >> shift
 * @param {number} F      features per row
 * @param {ArrayLike<number>} y  target per row id
 * @param {Int32Array} rows  training row ids
 * @param {object} p      parameters (GBDT_DEFAULTS)
 * @param {object} opt    { shift, features: allowed feature ids, evalRows, checkpoints }
 * @returns {{model, evalPreds}} model = { F, shift, base, trees, gain, params }
 */
export function fitBinned(X, F, y, rows, params = {}, opt = {}) {
  const p = { ...GBDT_DEFAULTS, ...params };
  const shift = opt.shift ?? 0;
  const nB = p.nBins;
  const allowed = opt.features ? Int32Array.from(opt.features) : Int32Array.from({ length: F }, (_, j) => j);
  const n = rows.length;
  const rng = mulberry32(hashSeed('gbdt', p.seed));
  let base = 0;
  for (let k = 0; k < n; k++) base += y[rows[k]];
  base /= n || 1;
  const pred = new Float64Array(n).fill(base);
  const g = new Float64Array(n);
  const maxNodes = (1 << (p.depth + 1)) - 1;
  const trees = [];
  const gain = new Float64Array(F);
  const evalRows = opt.evalRows || null;
  const checkpoints = opt.checkpoints ? [...opt.checkpoints].sort((a, b) => a - b) : [];
  const evalPred = evalRows ? new Float64Array(evalRows.length).fill(base) : null;
  const evalPreds = [];

  const bag = new Int32Array(n);
  const scratch = new Int32Array(n);
  const inBag = new Uint8Array(n);
  // interleaved histogram: [sumG, count] per (node, feature, bin)
  const H = new Float64Array(maxNodes * F * nB * 2);
  const nodeStart = new Int32Array(maxNodes);
  const nodeEnd = new Int32Array(maxNodes);
  const nodeG = new Float64Array(maxNodes);
  const nodeC = new Float64Array(maxNodes);
  const nFeatTree = Math.max(1, Math.round(allowed.length * p.colSample));
  const feats = new Int32Array(nFeatTree);

  for (let tIdx = 0; tIdx < p.nTrees; tIdx++) {
    // row subsample by geometric skipping (one draw per sampled row), then gradients for the bag
    // (negative gradient of squared loss = residual)
    let nb = 0;
    if (p.rowSample >= 1) {
      for (let k = 0; k < n; k++) {
        bag[nb++] = k;
        inBag[k] = 1;
      }
    } else {
      // inline xorshift32 stream (seeded from the tree's rng) for the Bernoulli row draws
      let xs = (Math.floor(rng() * 4294967296) | 1) >>> 0;
      const cut = Math.floor(p.rowSample * 4294967296);
      for (let k = 0; k < n; k++) {
        xs ^= xs << 13;
        xs ^= xs >>> 17;
        xs ^= xs << 5;
        if (xs >>> 0 < cut) {
          bag[nb++] = k;
          inBag[k] = 1;
        } else inBag[k] = 0;
      }
    }
    for (let a = 0; a < nb; a++) {
      const k = bag[a];
      g[k] = y[rows[k]] - pred[k];
    }
    // feature subsample (partial Fisher-Yates over the allowed list)
    const pool = Array.from(allowed);
    for (let j = 0; j < nFeatTree; j++) {
      const r = j + Math.floor(rng() * (pool.length - j));
      const tmp = pool[j];
      pool[j] = pool[r];
      pool[r] = tmp;
      feats[j] = pool[j];
    }
    // implicit full binary layout: children of node j are 2j+1 and 2j+2
    const tree = {
      feat: new Int16Array(maxNodes).fill(-1),
      thr: new Uint8Array(maxNodes),
      value: new Float64Array(maxNodes),
    };
    let nNodes = 1;
    nodeStart[0] = 0;
    nodeEnd[0] = nb;
    // root histogram
    buildHist(0, 0, nb);
    let sumG = 0;
    for (let a = 0; a < nb; a++) sumG += g[bag[a]];
    nodeG[0] = sumG;
    nodeC[0] = nb;
    let level = [0];
    for (let depth = 0; depth < p.depth; depth++) {
      const next = [];
      for (const node of level) {
        const best = bestSplit(node);
        if (!best) continue;
        const [f, b, gn] = best;
        gain[f] += gn;
        // stable partition of bag[start:end): rows with bin <= b first, order kept (keeps the
        // memory access to X ascending, which matters more than anything else for speed)
        const s0 = nodeStart[node];
        const e0 = nodeEnd[node];
        let lo = s0;
        let nr = 0;
        for (let a = s0; a < e0; a++) {
          const k = bag[a];
          if (X[rows[k] * F + f] >> shift <= b) bag[lo++] = k;
          else scratch[nr++] = k;
        }
        for (let a = 0; a < nr; a++) bag[lo + a] = scratch[a];
        const L = 2 * node + 1;
        const R = 2 * node + 2;
        nNodes = Math.max(nNodes, R + 1);
        tree.feat[node] = f;
        tree.thr[node] = b;
        nodeStart[L] = nodeStart[node];
        nodeEnd[L] = lo;
        nodeStart[R] = lo;
        nodeEnd[R] = nodeEnd[node];
        const nL = lo - nodeStart[node];
        const nR = nodeEnd[node] - lo;
        const small = nL <= nR ? L : R;
        const large = small === L ? R : L;
        buildHist(small, nodeStart[small], nodeEnd[small]);
        // larger child = parent - smaller child
        const oP = node * F * nB * 2;
        const oS = small * F * nB * 2;
        const oL = large * F * nB * 2;
        for (let j = 0; j < nFeatTree; j++) {
          const ff = feats[j] * nB * 2;
          for (let bb = 0; bb < 2 * nB; bb++) H[oL + ff + bb] = H[oP + ff + bb] - H[oS + ff + bb];
        }
        let gs = 0;
        for (let a = nodeStart[small]; a < nodeEnd[small]; a++) gs += g[bag[a]];
        nodeG[small] = gs;
        nodeC[small] = nodeEnd[small] - nodeStart[small];
        nodeG[large] = nodeG[node] - gs;
        nodeC[large] = nodeC[node] - nodeC[small];
        next.push(L, R);
      }
      level = next;
      if (!level.length) break;
    }
    // leaf values (only nodes reached by the growth are leaves; unused slots stay 0)
    const reached = new Uint8Array(maxNodes);
    reached[0] = 1;
    for (let node = 0; node < nNodes; node++) {
      if (!reached[node]) continue;
      if (tree.feat[node] >= 0) {
        reached[2 * node + 1] = 1;
        reached[2 * node + 2] = 1;
      } else tree.value[node] = (p.lr * nodeG[node]) / (nodeC[node] + p.lambda);
    }
    const compact = compactTree(tree, nNodes);
    trees.push(compact);
    // update predictions: bag rows from their leaf, the others by traversal
    for (let node = 0; node < nNodes; node++) {
      if (!reached[node] || tree.feat[node] >= 0) continue;
      const v = tree.value[node];
      for (let a = nodeStart[node]; a < nodeEnd[node]; a++) pred[bag[a]] += v;
    }
    for (let k = 0; k < n; k++) if (!inBag[k]) pred[k] += treeValue(compact, X, F, rows[k], shift);
    if (evalRows) {
      for (let k = 0; k < evalRows.length; k++) evalPred[k] += treeValue(compact, X, F, evalRows[k], shift);
      if (checkpoints.includes(tIdx + 1)) evalPreds.push({ nTrees: tIdx + 1, pred: Float32Array.from(evalPred) });
    }
  }
  return { model: { F, shift, base, trees, gain: Array.from(gain), params: p }, evalPreds };

  function buildHist(node, a, b) {
    const o = node * F * nB * 2;
    for (let j = 0; j < nFeatTree; j++) {
      const ff = o + feats[j] * nB * 2;
      H.fill(0, ff, ff + 2 * nB);
    }
    for (let k = a; k < b; k++) {
      const pos = bag[k];
      const gr = g[pos];
      const base = rows[pos] * F;
      for (let j = 0; j < nFeatTree; j++) {
        const f = feats[j];
        const idx = o + 2 * (f * nB + (X[base + f] >> shift));
        H[idx] += gr;
        H[idx + 1] += 1;
      }
    }
  }

  function bestSplit(node) {
    const G = nodeG[node];
    const C = nodeC[node];
    if (C < 2 * p.minLeaf) return null;
    const parentScore = (G * G) / (C + p.lambda);
    let bestGain = 1e-12;
    let bf = -1;
    let bb = -1;
    const o = node * F * nB * 2;
    for (let j = 0; j < nFeatTree; j++) {
      const f = feats[j];
      const off = o + f * nB * 2;
      let GL = 0;
      let CL = 0;
      for (let b = 0; b < nB - 1; b++) {
        GL += H[off + 2 * b];
        CL += H[off + 2 * b + 1];
        if (CL < p.minLeaf) continue;
        const CR = C - CL;
        if (CR < p.minLeaf) break;
        const GR = G - GL;
        const gn = (GL * GL) / (CL + p.lambda) + (GR * GR) / (CR + p.lambda) - parentScore;
        if (gn > bestGain) {
          bestGain = gn;
          bf = f;
          bb = b;
        }
      }
    }
    return bf < 0 ? null : [bf, bb, bestGain];
  }
}

// Compact form: code[j] = feature * 256 + threshold for a split node, -1 for a leaf (children of
// node j are 2j+1 and 2j+2); value[j] holds leaf values.
function compactTree(t, nNodes) {
  const code = new Int32Array(nNodes).fill(-1);
  for (let j = 0; j < nNodes; j++) if (t.feat[j] >= 0) code[j] = t.feat[j] * 256 + t.thr[j];
  return { code, value: t.value.slice(0, nNodes) };
}

function treeValue(tree, X, F, row, shift) {
  const code = tree.code;
  const n = code.length;
  let node = 0;
  const base = row * F;
  let c = code[0];
  while (c >= 0) {
    node = 2 * node + ((X[base + (c >> 8)] >> shift) <= (c & 255) ? 1 : 2);
    c = node < n ? code[node] : -1;
  }
  return tree.value[node];
}

/** Predict rows (ids into X) with one model; writes into out (Float64Array) and returns it. */
export function predictBinned(model, X, rows, out = new Float64Array(rows.length)) {
  const { F, shift, base, trees } = model;
  for (let k = 0; k < rows.length; k++) {
    let s = base;
    for (let t = 0; t < trees.length; t++) s += treeValue(trees[t], X, F, rows[k], shift);
    out[k] = s;
  }
  return out;
}

/** Predict a contiguous range of rows [a, b). */
export function predictRange(model, X, a, b, out = new Float64Array(b - a)) {
  const { F, shift, base, trees } = model;
  for (let r = a; r < b; r++) {
    let s = base;
    for (let t = 0; t < trees.length; t++) s += treeValue(trees[t], X, F, r, shift);
    out[r - a] = s;
  }
  return out;
}

/** Convenience for float data: bin, fit, and return a predictor over float rows. */
export function fitFloat(Xf, n, F, y, params = {}) {
  const nBins = params.nBins ?? GBDT_DEFAULTS.nBins;
  const edges = quantileEdges(Xf, n, F, nBins);
  const Xb = applyBins(Xf, n, F, edges);
  const rows = Int32Array.from({ length: n }, (_, k) => k);
  const { model } = fitBinned(Xb, F, y, rows, { ...params, nBins });
  return {
    model,
    edges,
    predict(Xnew, m) {
      const Xn = applyBins(Xnew, m, F, edges);
      return predictBinned(model, Xn, Int32Array.from({ length: m }, (_, k) => k));
    },
  };
}

/** Plain-object form for postMessage / JSON (typed arrays kept). */
export function serializeModel(model) {
  return model;
}
