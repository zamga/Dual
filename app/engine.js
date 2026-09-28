/*
 * Rok scoring engine.
 *
 * A transparent logistic model: every feature has a "typical" value and a
 * fitted weight on the log-odds of default. A company's score is the baseline
 * PD shifted by the sum of (weight x distance from typical), so each feature's
 * contribution doubles as a reason code.
 *
 * Works in the browser (window.RokEngine) and in Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RokEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LGD = 0.6; // loss given default on unsecured trade credit
  const INSURANCE_LOADING = 1.35;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const sigmoid = z => 1 / (1 + Math.exp(-z));

  // sign: the direction a feature is allowed to push risk. The fitter drops
  // any feature whose fitted weight comes out the other way.
  const FEATURES = [
    { key: 'equityRatio', sign: -1, label: 'Equity ratio', group: 'financial', typical: 0.35, unit: 'pct',
      get: c => c.fin && c.fin.assets > 0 ? clamp(c.fin.equity / c.fin.assets, -1, 1) : null },
    { key: 'currentRatio', sign: -1, label: 'Current ratio', group: 'financial', typical: 1.3, unit: 'x',
      get: c => c.fin && c.fin.currentLiabilities > 0 ? clamp(c.fin.currentAssets / c.fin.currentLiabilities, 0, 4) : null },
    { key: 'ebitMargin', sign: -1, label: 'EBIT margin', group: 'financial', typical: 0.04, unit: 'pct',
      get: c => c.fin && c.fin.revenue > 0 ? clamp(c.fin.ebit / c.fin.revenue, -0.5, 0.5) : null },
    { key: 'debtToEbitda', sign: 1, label: 'Debt / EBITDA', group: 'financial', typical: 2.5, unit: 'x',
      get: c => (c.fin ? (c.fin.ebitda <= 0 ? 10 : clamp(c.fin.debt / c.fin.ebitda, 0, 10)) : null) },
    { key: 'revenueGrowth', sign: -1, label: 'Revenue growth', group: 'financial', typical: 0.03, unit: 'pct',
      get: c => c.fin && c.finPrev && c.finPrev.revenue > 0 ? clamp(c.fin.revenue / c.finPrev.revenue - 1, -0.6, 1) : null },
    { key: 'size', sign: -1, label: 'Company size (revenue)', group: 'financial', typical: 6, unit: 'log10',
      get: c => c.fin && c.fin.revenue > 0 ? clamp(Math.log10(c.fin.revenue), 4, 8) : null },
    { key: 'companyAge', sign: -1, label: 'Years in business', group: 'profile', typical: Math.log(11), unit: 'lnyears',
      get: (c, ctx) => Math.log(1 + Math.max(0, ctx.asOfYear - c.founded)) },
    { key: 'dbt3m', sign: 1, label: 'Days beyond terms, last 3 months', group: 'payments', typical: 6, unit: 'days',
      get: c => c.pay ? clamp(avg(c.pay.dbt.slice(-3)), 0, 120) : null },
    { key: 'dbtTrend', sign: 1, label: 'Change in payment delays vs earlier months', group: 'payments', typical: 0, unit: 'days',
      get: c => c.pay ? clamp(avg(c.pay.dbt.slice(-3)) - avg(c.pay.dbt.slice(0, 9)), -60, 60) : null },
    { key: 'lateShare', sign: 1, label: 'Invoices paid 30+ days late', group: 'payments', typical: 0.05, unit: 'pct',
      get: c => c.pay ? clamp(c.pay.lateShare30, 0, 1) : null },
    { key: 'blocked', sign: 1, label: 'Bank account blocked, last 12 months', group: 'events', typical: 0, unit: 'lndays',
      get: c => Math.log(1 + (c.events.blockedDays12m || 0)) },
    { key: 'taxDebt', sign: 1, label: 'On FURS tax-debtor list', group: 'events', typical: 0, unit: 'flag',
      get: c => (c.events.taxDebt > 0 ? 1 : 0) },
    { key: 'directorBankruptcies', sign: 1, label: 'Directors linked to past bankruptcies', group: 'network', typical: 0, unit: 'count',
      get: c => clamp(c.net ? c.net.directorBankruptcies : 0, 0, 5) },
    { key: 'relatedDistress', sign: 1, label: 'Related companies in distress', group: 'network', typical: 0, unit: 'count',
      get: c => clamp(c.net ? c.net.relatedDistress : 0, 0, 5) },
  ];

  const GROUPS = ['financial', 'profile', 'payments', 'events', 'network'];

  // Weights fitted by scripts/fit.js (logistic regression on training seeds;
  // the back-test uses different seeds). "full" is Rok. "filings" uses only
  // annual accounts and company age, the way registry-only scores work.
  const MODELS = {
    // <fitted>
    full: {
      groups: GROUPS,
      intercept: -4.1854,
      weights: {
        equityRatio: -1.7952,
        currentRatio: -1.0821,
        debtToEbitda: 0.0303,
        revenueGrowth: -0.1408,
        size: -0.0465,
        companyAge: -0.1387,
        dbt3m: 0.0038,
        dbtTrend: 0.0725,
        lateShare: 2.6844,
        blocked: 0.1283,
        taxDebt: 0.5021,
        directorBankruptcies: 0.0399,
        relatedDistress: 0.1384,
      },
    },
    filings: {
      groups: ['financial', 'profile'],
      intercept: -3.7539,
      weights: {
        equityRatio: -2.4011,
        currentRatio: -1.3178,
        ebitMargin: -0.2239,
        debtToEbitda: 0.0425,
        revenueGrowth: -0.6788,
        companyAge: -0.1546,
      },
    },
    // </fitted>
  };

  // Upper PD bound for each grade. X is reserved for companies already in default.
  const GRADES = [
    { grade: 'A+', max: 0.003, tone: 'good' },
    { grade: 'A', max: 0.007, tone: 'good' },
    { grade: 'B+', max: 0.015, tone: 'fair' },
    { grade: 'B', max: 0.03, tone: 'fair' },
    { grade: 'C+', max: 0.06, tone: 'warn' },
    { grade: 'C', max: 0.12, tone: 'warn' },
    { grade: 'D', max: 0.25, tone: 'crit' },
    { grade: 'E', max: 1, tone: 'crit' },
  ];

  function gradeFor(pd, inDefault) {
    if (inDefault) return { grade: 'X', max: 1, tone: 'crit' };
    return GRADES.find(g => pd < g.max) || GRADES[GRADES.length - 1];
  }

  function monthsBetween(isoFrom, isoTo) {
    const a = new Date(isoFrom), b = new Date(isoTo);
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  }

  // Annual accounts lose predictive weight as they age; payment data does not.
  function financialWeight(ageMonths) {
    return clamp(1 - (ageMonths - 6) / 30, 0.4, 1);
  }

  function score(company, opts) {
    const asOf = (opts && opts.asOf) || new Date().toISOString().slice(0, 10);
    const model = MODELS[(opts && opts.model) || 'full'];
    const ctx = { asOfYear: Number(asOf.slice(0, 4)) };
    const finAgeMonths = company.fin ? monthsBetween(company.fin.periodEnd, asOf) : null;
    const finW = finAgeMonths == null ? 0 : financialWeight(finAgeMonths);
    const inDefault = company.status === 'insolvency' || company.status === 'bankrupt';

    const contributions = [];
    let z = model.intercept;
    for (const f of FEATURES) {
      if (!model.groups.includes(f.group)) continue;
      const value = f.get(company, ctx);
      if (value == null) continue;
      const w = model.weights[f.key] || 0;
      const weight = f.group === 'financial' ? w * finW : w;
      const contribution = weight * (value - f.typical);
      z += contribution;
      contributions.push({ key: f.key, label: f.label, group: f.group, unit: f.unit, value, typical: f.typical, contribution });
    }
    contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    const pd = inDefault ? 1 : sigmoid(z);
    return {
      pd,
      logit: z,
      inDefault,
      grade: gradeFor(pd, inDefault),
      contributions,
      finAgeMonths,
      finWeight: finW,
      hasPayments: !!company.pay,
    };
  }

  const TERMS = [
    { max: 0.007, days: 60, label: '60 days' },
    { max: 0.015, days: 45, label: '45 days' },
    { max: 0.03, days: 30, label: '30 days' },
    { max: 0.06, days: 15, label: '15 days' },
    { max: 0.12, days: 0, label: '50% advance, rest on delivery' },
    { max: 1.01, days: -1, label: 'Prepayment only' },
  ];
  const LIMIT_FACTORS = [
    [0.007, 1], [0.015, 0.8], [0.03, 0.6], [0.06, 0.4], [0.12, 0.2], [1.01, 0],
  ];

  function roundNice(v) {
    if (v <= 0) return 0;
    const step = v >= 100000 ? 10000 : v >= 10000 ? 1000 : 500;
    return Math.floor(v / step) * step;
  }

  // Credit decision for one supplier's exposure to this company.
  function recommend(company, result, plannedExposure) {
    const pd = result.pd;
    const fin = company.fin;
    let limit = 0;
    if (!result.inDefault && fin && fin.revenue > 0) {
      const monthlyRevenue = fin.revenue / 12;
      const capacity = fin.equity > 0
        ? Math.min(monthlyRevenue * 0.3, fin.equity * 0.25)
        : monthlyRevenue * 0.05;
      const factor = LIMIT_FACTORS.find(([max]) => pd < max)[1];
      limit = roundNice(capacity * factor);
    }
    const term = result.inDefault ? TERMS[TERMS.length - 1] : TERMS.find(t => pd < t.max);
    const premiumRate = result.inDefault ? null : Math.max(0.001, pd * LGD * INSURANCE_LOADING);
    const exposure = plannedExposure == null ? limit : plannedExposure;
    const expectedLoss = exposure * pd * LGD;

    let verdict;
    if (result.inDefault || limit === 0) verdict = { code: 'decline', label: 'Decline credit' };
    else if (exposure <= limit) verdict = { code: 'approve', label: 'Approve' };
    else if (exposure <= limit * 2 && pd < 0.06) verdict = { code: 'cover', label: 'Approve with credit insurance' };
    else verdict = { code: 'decline', label: 'Reduce exposure or take security' };

    return { limit, term, premiumRate, exposure, expectedLoss, verdict };
  }

  // Director and ownership links. Mutates companies by adding c.net.
  function attachNetwork(companies) {
    const byId = new Map(companies.map(c => [c.id, c]));
    const byDirector = new Map();
    for (const c of companies) {
      for (const p of c.directors) {
        if (!byDirector.has(p)) byDirector.set(p, []);
        byDirector.get(p).push(c.id);
      }
    }
    const owned = new Map();
    for (const c of companies) {
      for (const o of c.owners) {
        if (o.type !== 'company') continue;
        if (!owned.has(o.id)) owned.set(o.id, []);
        owned.get(o.id).push(c.id);
      }
    }
    const distressed = c => c.status === 'insolvency' || c.events.blockedDays12m > 0 || c.events.taxDebt > 0;

    for (const c of companies) {
      const viaDirector = new Map(); // companyId -> [personIds]
      for (const p of c.directors) {
        for (const other of byDirector.get(p)) {
          if (other === c.id) continue;
          if (!viaDirector.has(other)) viaDirector.set(other, []);
          viaDirector.get(other).push(p);
        }
      }
      const parents = c.owners.filter(o => o.type === 'company').map(o => o.id);
      const children = owned.get(c.id) || [];
      const groupIds = new Set([...parents, ...children]);

      const linked = new Set([...viaDirector.keys(), ...groupIds]);
      let directorBankruptcies = 0, relatedDistress = 0;
      for (const id of linked) {
        const o = byId.get(id);
        if (o.status === 'bankrupt') { if (viaDirector.has(id)) directorBankruptcies++; }
        else if (distressed(o)) relatedDistress++;
      }
      c.net = {
        directorBankruptcies,
        relatedDistress,
        viaDirector: [...viaDirector.entries()].map(([id, people]) => ({ id, people })),
        parents,
        children,
      };
    }
    return companies;
  }

  // Area under the ROC curve (Mann-Whitney, ties counted as half).
  function auc(scores, labels) {
    const rows = scores.map((s, i) => [s, labels[i]]).sort((a, b) => a[0] - b[0]);
    let pos = 0, neg = 0, rankSum = 0, i = 0;
    while (i < rows.length) {
      let j = i;
      while (j < rows.length && rows[j][0] === rows[i][0]) j++;
      const avgRank = (i + 1 + j) / 2;
      for (let k = i; k < j; k++) if (rows[k][1]) { rankSum += avgRank; pos++; }
      i = j;
    }
    neg = rows.length - pos;
    if (!pos || !neg) return NaN;
    return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
  }

  function calibration(results, labels) {
    return GRADES.map(g => {
      const idx = results.map((r, i) => i).filter(i => results[i].grade.grade === g.grade);
      const n = idx.length;
      return {
        grade: g.grade,
        tone: g.tone,
        n,
        predicted: n ? avg(idx.map(i => results[i].pd)) : null,
        observed: n ? idx.filter(i => labels[i]).length / n : null,
      };
    });
  }

  return {
    LGD, FEATURES, GROUPS, GRADES, MODELS,
    score, recommend, attachNetwork, auc, calibration, gradeFor, financialWeight, monthsBetween,
  };
});
