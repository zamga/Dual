'use strict';
const test = require('node:test');
const assert = require('node:assert');
const E = require('../app/engine.js');
const D = require('../app/data.js');

function dataset(seed = 2026) {
  const d = D.generate(seed, 600);
  E.attachNetwork(d.companies);
  return d;
}

test('generator is deterministic for a seed', () => {
  const a = D.generate(5, 50), b = D.generate(5, 50);
  assert.deepStrictEqual(a, b);
});

test('companies in insolvency or bankruptcy score as default', () => {
  const { companies, asOf } = dataset();
  const c = companies.find(x => x.status === 'insolvency');
  const r = E.score(c, { asOf });
  assert.strictEqual(r.pd, 1);
  assert.strictEqual(r.grade.grade, 'X');
  assert.strictEqual(E.recommend(c, r).verdict.code, 'decline');
});

test('reason codes add up to the log-odds', () => {
  const { companies, asOf } = dataset();
  const c = companies.find(x => x.status === 'active' && x.pay);
  const r = E.score(c, { asOf });
  const sum = E.MODELS.full.intercept + r.contributions.reduce((s, x) => s + x.contribution, 0);
  assert.ok(Math.abs(sum - r.logit) < 1e-9);
});

test('worse payment behaviour raises PD', () => {
  const { companies, asOf } = dataset();
  const c = companies.find(x => x.status === 'active' && x.pay);
  const worse = structuredClone(c);
  worse.pay.lateShare30 = Math.min(1, c.pay.lateShare30 + 0.3);
  worse.pay.dbt = c.pay.dbt.map((v, i) => (i >= 9 ? v + 30 : v));
  assert.ok(E.score(worse, { asOf }).pd > E.score(c, { asOf }).pd);
});

test('older filings carry less weight', () => {
  assert.strictEqual(E.financialWeight(6), 1);
  assert.ok(E.financialWeight(21) < E.financialWeight(9));
  assert.strictEqual(E.financialWeight(60), 0.4);
});

test('every fitted weight points the declared way', () => {
  for (const m of Object.values(E.MODELS)) {
    for (const [k, w] of Object.entries(m.weights)) {
      const f = E.FEATURES.find(x => x.key === k);
      assert.ok(w * f.sign >= 0, `${k} has the wrong sign`);
    }
  }
});

test('credit limit shrinks as PD rises', () => {
  const { companies, asOf } = dataset();
  const c = companies.find(x => x.status === 'active' && x.fin.equity > 0);
  const base = E.score(c, { asOf });
  const lo = E.recommend(c, { ...base, pd: 0.005 });
  const hi = E.recommend(c, { ...base, pd: 0.05 });
  assert.ok(lo.limit >= hi.limit);
  assert.strictEqual(E.recommend(c, { ...base, pd: 0.5 }).limit, 0);
});

test('auc matches known values', () => {
  assert.strictEqual(E.auc([0.1, 0.2, 0.3, 0.4], [0, 0, 1, 1]), 1);
  assert.strictEqual(E.auc([0.4, 0.3, 0.2, 0.1], [0, 0, 1, 1]), 0);
  assert.strictEqual(E.auc([0.5, 0.5], [0, 1]), 0.5);
});

test('payment data beats filings-only on held-out seeds', () => {
  const full = [], filings = [], y = [];
  for (const seed of [101, 102, 103, 104]) {
    const { companies, asOf } = dataset(seed);
    for (const c of companies.filter(x => x.status === 'active')) {
      full.push(E.score(c, { asOf }).pd);
      filings.push(E.score(c, { asOf, model: 'filings' }).pd);
      y.push(c.outcome12m);
    }
  }
  assert.ok(E.auc(full, y) > E.auc(filings, y) + 0.03);
});

test('600-company seeds are unchanged, so the fitted weights stay valid', () => {
  const crypto = require('crypto');
  const hash = seed => crypto.createHash('sha1').update(JSON.stringify(D.generate(seed, 600))).digest('hex');
  assert.strictEqual(hash(11), 'fe9f2186534268665e2b86a8aed472dbe7dae487');
  assert.strictEqual(hash(101), '093f4b2942b7a978263df5c9fc021a21a3b20fca');
});

test('the shared demo universe has unique names and a realistic network', () => {
  const d = D.generate(2026, D.DEMO_COUNT);
  E.attachNetwork(d.companies);
  assert.strictEqual(new Set(d.companies.map(c => c.name)).size, d.companies.length);
  const live = d.companies.filter(c => c.status !== 'bankrupt');
  assert.strictEqual(live.length, D.DEMO_COUNT);
  const linked = live.reduce((s, c) => s + c.net.viaDirector.length, 0) / live.length;
  assert.ok(linked < 6, `companies link to ${linked.toFixed(1)} others on average`);
});
