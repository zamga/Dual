// The disclosure latent (engine/sim/market.js): a change in what each filing's text says, drawn on its
// own random stream, observable only through the four filing-text embedding components released on the
// filing date. Families A-C never read it; D does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateMarket, disclosureDrift, HIDDEN, EMB_DIM } from '../../engine/sim/market.js';
import { computeFeatures, rawFeaturesAt, FEATURE_INDEX, EMBEDDING_KEYS, FAMILY_INPUTS, D_OWN_KEYS } from '../../engine/features.js';
import { SMALL_UNIVERSE } from '../../engine/model.js';
import { pearson } from '../../engine/lib/stats.js';
import { mulberry32, normal } from '../../core/random.js';

const base = simulateMarket(SMALL_UNIVERSE.sim);
const fsBase = computeFeatures(base, { shared: false });
const EMB_FIELDS = ['emb1', 'emb2', 'emb3', 'emb4'];

test('each filing carries a noisy low-dimensional projection of its disclosure latent', () => {
  const fil = base.filings;
  const delta = base.disclosure.delta;
  assert.equal(delta.length, fil.F);
  assert.equal(EMB_DIM, EMB_FIELDS.length);
  const L = HIDDEN.discLoadings;
  EMB_FIELDS.forEach((k, j) => {
    const r = pearson(fil[k], delta, fil.F);
    assert.ok(Math.abs(r - L[j]) < 0.06, `${k}: correlation ${r.toFixed(3)} vs loading ${L[j]}`);
  });
  // no component reveals it exactly
  for (const k of EMB_FIELDS) assert.ok(Math.abs(pearson(fil[k], delta, fil.F)) < 0.8);
  // independent of the other filing latents: the earnings surprise and the company's quality
  assert.ok(Math.abs(pearson(delta, fil.sue, fil.F)) < 0.05);
  const q = Float64Array.from(fil.company, (i) => base.companies.q[i]);
  assert.ok(Math.abs(pearson(delta, q, fil.F)) < 0.05);
  // the attention multiplier: larger drift for low-turnover names, 1 on average
  const mult = base.disclosure.mult;
  assert.ok([...new Set(mult)].sort().join() === [1 - HIDDEN.discAttention, 1 + HIDDEN.discAttention].sort().join());
});

test('the embedding is point in time: invisible before the filing date, used from it, stale after 130 days', () => {
  const fil = base.filings;
  let n = -1;
  for (let k = 0; k < fil.F; k++) {
    const t = fil.filingIdx[k];
    if (t > base.s0 + 50 && t < base.S - 200 && base.eligible[t * base.N + fil.company[k]]) {
      n = k;
      break;
    }
  }
  assert.ok(n >= 0);
  const i = fil.company[n];
  const tf = fil.filingIdx[n];
  const at = rawFeaturesAt(base, tf, i);
  const before = rawFeaturesAt(base, tf - 1, i);
  EMB_FIELDS.forEach((k, j) => {
    assert.equal(at[FEATURE_INDEX[EMBEDDING_KEYS[j]]], fil[k][n], `${k} on the filing date`);
    if (n > fil.start[i]) assert.notEqual(before[FEATURE_INDEX[EMBEDDING_KEYS[j]]], fil[k][n], `${k} the day before`);
  });
  // stale: no newer filing and older than 130 trading days -> missing
  const nextF = n + 1 < fil.end[i] ? fil.filingIdx[n + 1] : Infinity;
  if (nextF > tf + 131 && tf + 131 < base.S) assert.ok(Number.isNaN(rawFeaturesAt(base, tf + 131, i)[FEATURE_INDEX.emb_1]));
});

test('families A-C never see the disclosure latent: scrambling it and the embedding leaves their scores unchanged', () => {
  // the hand-built families' inputs and D's own set are disjoint, and no family input is an embedding
  for (const f of ['A', 'B', 'C']) for (const k of FAMILY_INPUTS[f]) assert.ok(!EMBEDDING_KEYS.includes(k) && !D_OWN_KEYS.includes(k), k);
  const rng = mulberry32(4242);
  const fil = base.filings;
  const scrambled = { ...base, filings: { ...fil }, disclosure: { ...base.disclosure, delta: base.disclosure.delta.map(() => normal(rng)) } };
  for (const k of EMB_FIELDS) scrambled.filings[k] = fil[k].map(() => normal(rng));
  const fsS = computeFeatures(scrambled, { shared: false });
  for (const f of ['A', 'B', 'C']) assert.deepEqual(fsS.pct[f], fsBase.pct[f], `family ${f} changed`);
  // every stored feature but the embedding is unchanged; the embedding (a D input) is not
  const F = fsBase.F;
  const emb = new Set(EMBEDDING_KEYS.map((k) => FEATURE_INDEX[k]));
  let embDiff = 0;
  for (let r = 0; r < fsBase.R; r += 7) {
    for (let j = 0; j < F; j++) {
      if (emb.has(j)) embDiff += fsS.q[r * F + j] !== fsBase.q[r * F + j];
      else assert.equal(fsS.q[r * F + j], fsBase.q[r * F + j]);
    }
  }
  assert.ok(embDiff > 1000, 'the embedding features changed');
});

test('the disclosure drift reaches prices from the day after the filing date, never before', () => {
  // the same world with the drift switched off (the latent and the embedding are still drawn)
  const off = simulateMarket({ ...SMALL_UNIVERSE.sim, params: { discTotal: 0 } });
  const fil = base.filings;
  const N = base.N;
  let checked = 0;
  for (let i = 0; i < 60; i++) {
    const k = fil.start[i];
    if (k >= fil.end[i]) continue;
    const tf = fil.filingIdx[k];
    if (tf + 2 >= base.S || base.companies.delistIdx[i] >= 0) continue;
    for (let t = 0; t <= tf; t++) {
      const a = base.close[t * N + i];
      if (a === a) assert.equal(a, off.close[t * N + i], `company ${i}: price moved before its first filing was public`);
    }
    assert.notEqual(base.close[(tf + 1) * N + i], off.close[(tf + 1) * N + i], `company ${i}: no drift the day after the filing`);
    checked++;
  }
  assert.ok(checked > 20, `checked ${checked}`);
  // the expected drift of the next 21 days halves over one half-life when no new filing arrives
  const d = base.disclosure;
  const rho = Math.exp(-Math.LN2 / d.halfLife);
  const k = fil.start[7] + 6;
  const i = fil.company[k];
  const tf = fil.filingIdx[k];
  const own = (t) => d.total * d.delta[k] * d.mult[k] * rho ** (t - tf) * (1 - rho ** 21);
  assert.ok(Math.abs(own(tf + d.halfLife) - own(tf) / 2) < 1e-12);
  let sum = 0;
  for (let f = fil.start[i]; f <= k; f++) sum += d.total * d.delta[f] * d.mult[f] * rho ** (tf - fil.filingIdx[f]) * (1 - rho ** 21);
  assert.ok(Math.abs(disclosureDrift(base, i, tf, 21) - sum) < 1e-12);
});
