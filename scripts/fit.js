#!/usr/bin/env node
// Fits the logistic weights for both models on training seeds and writes
// them into app/engine.js between the <fitted> markers.
// Usage: node scripts/fit.js
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../app/engine.js');
const D = require('../app/data.js');

const TRAIN_SEEDS = [11, 12, 13, 14, 15, 16, 17, 18];
const L2 = 0.02;

function trainingRows() {
  const rows = [];
  for (const seed of TRAIN_SEEDS) {
    const { companies, asOf } = D.generate(seed, 600);
    E.attachNetwork(companies);
    for (const c of companies) if (c.status === 'active') rows.push({ c, asOf });
  }
  return rows;
}

// Design row: (value - typical), scaled by the filing-age weight for
// financial features, exactly as score() applies it. Missing values give 0.
function design(rows, groups) {
  const feats = E.FEATURES.filter(f => groups.includes(f.group));
  const X = rows.map(({ c, asOf }) => {
    const ctx = { asOfYear: Number(asOf.slice(0, 4)) };
    const age = c.fin ? E.monthsBetween(c.fin.periodEnd, asOf) : null;
    const finW = age == null ? 0 : E.financialWeight(age);
    return feats.map(f => {
      const v = f.get(c, ctx);
      if (v == null) return 0;
      return (v - f.typical) * (f.group === 'financial' ? finW : 1);
    });
  });
  return { feats, X, y: rows.map(r => r.c.outcome12m) };
}

// Newton-Raphson (IRLS) with a ridge penalty on standardised columns.
function fit(X, y) {
  const n = X.length, k = X[0].length;
  const mean = Array(k).fill(0), sd = Array(k).fill(0);
  for (const r of X) r.forEach((v, j) => (mean[j] += v / n));
  for (const r of X) r.forEach((v, j) => (sd[j] += (v - mean[j]) ** 2 / n));
  for (let j = 0; j < k; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  const Z = X.map(r => [1, ...r.map((v, j) => (v - mean[j]) / sd[j])]);
  let b = Array(k + 1).fill(0);
  for (let it = 0; it < 50; it++) {
    const g = Array(k + 1).fill(0);
    const H = Array.from({ length: k + 1 }, () => Array(k + 1).fill(0));
    for (let i = 0; i < n; i++) {
      const z = Z[i].reduce((s, v, j) => s + v * b[j], 0);
      const p = 1 / (1 + Math.exp(-z));
      const wt = p * (1 - p);
      for (let a = 0; a <= k; a++) {
        g[a] += (y[i] - p) * Z[i][a];
        for (let c = 0; c <= k; c++) H[a][c] += wt * Z[i][a] * Z[i][c];
      }
    }
    for (let a = 1; a <= k; a++) { g[a] -= L2 * b[a]; H[a][a] += L2; }
    const step = solve(H, g);
    b = b.map((v, j) => v + step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  const w = b.slice(1).map((v, j) => v / sd[j]);
  const intercept = b[0] - w.reduce((s, v, j) => s + v * mean[j], 0);
  return { intercept, w };
}

function solve(A, bvec) {
  const n = bvec.length;
  const M = A.map((r, i) => [...r, bvec[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

const rows = trainingRows();
const out = {};
for (const [name, model] of Object.entries(E.MODELS)) {
  // Sign-constrained fit: drop the worst wrong-signed feature and refit
  // until every weight points the way its feature is meant to.
  let { feats, X, y } = design(rows, model.groups);
  let res = fit(X, y);
  for (;;) {
    const bad = feats.map((f, j) => ({ j, v: res.w[j] * f.sign })).filter(o => o.v < 0).sort((a, b) => a.v - b.v)[0];
    if (!bad) break;
    console.log(`  ${name}: dropping ${feats[bad.j].key} (wrong sign)`);
    feats = feats.filter((_, j) => j !== bad.j);
    X = X.map(r => r.filter((_, j) => j !== bad.j));
    res = fit(X, y);
  }
  const { intercept, w } = res;
  out[name] = { groups: model.groups, intercept, weights: Object.fromEntries(feats.map((f, j) => [f.key, w[j]])) };
  console.log(`${name}: n=${y.length} defaults=${y.reduce((a, b) => a + b, 0)} intercept=${intercept.toFixed(3)}`);
  feats.forEach((f, j) => console.log(`  ${f.key.padEnd(22)} ${w[j].toFixed(4)}`));
}

const r4 = v => Math.round(v * 10000) / 10000;
const groupsSrc = g => (g.length === E.GROUPS.length ? 'GROUPS' : JSON.stringify(g).replace(/"/g, "'").replace(/,/g, ', '));
const block = Object.entries(out).map(([name, m]) =>
  `    ${name}: {\n      groups: ${groupsSrc(m.groups)},\n      intercept: ${r4(m.intercept)},\n      weights: {\n` +
  Object.entries(m.weights).map(([k, v]) => `        ${k}: ${r4(v)},`).join('\n') +
  `\n      },\n    },`).join('\n');
const file = path.join(__dirname, '../app/engine.js');
const src = fs.readFileSync(file, 'utf8');
fs.writeFileSync(file, src.replace(/(\/\/ <fitted>\n)[\s\S]*?(\n\s*\/\/ <\/fitted>)/, `$1${block}$2`));
console.log('Wrote weights to app/engine.js');
