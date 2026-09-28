// A small shape checker for the data contract of docs/ARCHITECTURE.md §3 (web/data/*.json).
// Specs are plain values:
//   'number' | 'string' | 'boolean' | 'date' | 'instant' | 'hex64' | 'no4' | 'frac' | 'int' | 'object' | 'any'
//   true (the literal true), ['literal', ...values] via { $in: [...] }, a RegExp (string matching it)
//   [spec] (array whose every element matches spec), { $tuple: [spec, ...] }, { $or: [spec, spec] }
//   { key: spec, ... } (object with at least these keys)
// The checker returns a list of "path: problem" strings; an empty list means the shape matches.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const HEX64 = /^[0-9a-f]{64}$/;
const NO4 = /^\d{4}$/;

const nul = (spec) => ({ $or: [null, spec] });
const en_sl = { en: 'string', sl: 'string' };

export function check(value, spec, path = '$', errors = []) {
  const fail = (msg) => errors.push(`${path}: ${msg} (got ${JSON.stringify(value)?.slice(0, 60)})`);
  if (spec === null) {
    if (value !== null) fail('expected null');
    return errors;
  }
  if (spec === true) {
    if (value !== true) fail('expected true');
    return errors;
  }
  if (spec instanceof RegExp) {
    if (typeof value !== 'string' || !spec.test(value)) fail(`expected a string matching ${spec}`);
    return errors;
  }
  if (typeof spec === 'string') {
    const ok = {
      any: () => value !== undefined,
      number: () => typeof value === 'number' && Number.isFinite(value),
      int: () => Number.isInteger(value),
      frac: () => typeof value === 'number' && value >= 0 && value <= 1,
      string: () => typeof value === 'string',
      boolean: () => typeof value === 'boolean',
      object: () => value !== null && typeof value === 'object' && !Array.isArray(value),
      date: () => typeof value === 'string' && DATE.test(value),
      instant: () => typeof value === 'string' && INSTANT.test(value) && !Number.isNaN(Date.parse(value)),
      hex64: () => typeof value === 'string' && HEX64.test(value),
      no4: () => typeof value === 'string' && NO4.test(value),
    }[spec];
    if (!ok) throw new Error(`unknown spec ${spec}`);
    if (!ok()) fail(`expected ${spec}`);
    return errors;
  }
  if (Array.isArray(spec)) {
    if (!Array.isArray(value)) return fail('expected an array'), errors;
    value.forEach((v, k) => check(v, spec[0], `${path}[${k}]`, errors));
    return errors;
  }
  if (spec.$in) {
    if (!spec.$in.includes(value)) fail(`expected one of ${JSON.stringify(spec.$in)}`);
    return errors;
  }
  if (spec.$or) {
    const alts = spec.$or.map((s) => check(value, s, path, []));
    if (!alts.some((a) => a.length === 0)) errors.push(...alts[alts.length - 1]);
    return errors;
  }
  if (spec.$tuple) {
    if (!Array.isArray(value) || value.length !== spec.$tuple.length) return fail(`expected a ${spec.$tuple.length}-tuple`), errors;
    spec.$tuple.forEach((s, k) => check(value[k], s, `${path}[${k}]`, errors));
    return errors;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail('expected an object'), errors;
  for (const [k, s] of Object.entries(spec)) {
    if (!(k in value)) errors.push(`${path}.${k}: missing`);
    else check(value[k], s, `${path}.${k}`, errors);
  }
  return errors;
}

const vetoCounts = { rule: 'int', llm: 'int', human: 'int', capped: 'int' };
const driver = { key: 'string', label: en_sl, value: nul('number'), unit: 'string' };
const family = { pct: nul('frac'), drivers: [driver] };
const outcome = { exitDate: 'date', exitOpen: 'number', gross: 'number', net: 'number', bench: 'number', excess: 'number', eurNet: 'number', alertGapBps: 'number', d5: nul('number'), d63: nul('number') };
const ci = nul({ $tuple: ['number', 'number'] });
const famStats = { hit: nul('frac'), hitCI: ci, ic: nul('number'), icCI: ci, meanExcess: nul('number'), n: 'int' };
const agreeStats = { n: 'int', hit: nul('frac'), hitCI: ci, medianExcess: nul('number') };
const decile = [{ d: 'int', excess: nul('number'), ci }];
const decileSet = { combined: decile, A: decile, B: decile, C: decile, D: decile };

export const SPECS = {
  meta: {
    simulated: true, seed: 'int', asOf: 'date', dataThrough: 'instant', sealedSince: 'date', holdout: { from: 'date', to: 'date' }, engineFrozen: 'date',
    methodology: [{ version: 'string', effective: 'date', summary: en_sl, seq: 'int' }],
    modelVersion: 'string',
    families: [{ id: { $in: ['A', 'B', 'C', 'D'] }, name: en_sl, def: en_sl }],
    persons: [{ id: 'string', name: 'string', title: en_sl, role: 'string', fictional: true }],
    universe: { scoredToday: 'int', eligibleRule: { minPrice: 'number', minMcap: 'number', minAdv: 'number' } },
    counts: { issues: 'int', quorumDays: 'int', picks: 'int', renews: 'int', closed: 'int', open: 'int' },
  },
  summary: {
    simulated: true, liveSince: 'date', label: en_sl, nPicks: 'int', nClosed: 'int', hitRate: 'frac', hitCI: { $tuple: ['frac', 'frac'] },
    medianExcess: 'number', meanExcess: 'number',
    worstPick: { no: 'no4', ticker: nul('string'), excess: 'number' }, bestPick: { no: 'no4', ticker: nul('string'), excess: 'number' },
    maxDrawdown: 'number', medianAlertGapBps: 'number', cumulative: { follow: 'number', bench: 'number' }, vetoes: vetoCounts,
    equity: [{ $tuple: ['date', 'number', 'number'] }],
  },
  issues: [{
    date: 'date', issueNo: 'int', publishAt: 'instant', tz: { $in: ['CEST', 'CET'] }, nScored: 'int', closest: 'int', quorum: 'boolean',
    buys: ['no4'], renews: ['no4'], closes: ['no4'], vetoes: vetoCounts, seq: 'int', hash: 'hex64',
  }],
  ledger: {
    simulated: true, genesis: 'hex64',
    entries: [{ seq: 'int', type: { $in: ['METHODOLOGY', 'ISSUE', 'BUY', 'RENEW', 'CLOSE', 'CORRECTION'] }, issueDate: 'date', at: 'instant', body: 'object', prevHash: 'hex64', hash: 'hex64' }],
    anchors: [{ date: 'date', merkleRoot: 'hex64', rowCount: 'int', ots: { $in: ['confirmed', 'pending'] }, rfc3161: 'string' }],
  },
  picks: [{
    no: 'no4', kind: { $in: ['BUY', 'RENEW'] }, priorNo: nul('no4'), renewedAs: nul('no4'), status: { $in: ['open', 'closed', 'renewed'] },
    ticker: /^[A-Z]{1,5}$/, name: 'string', isin: /^ZZ[0-9A-Z]{9}\d$/, figi: /^SIM[0-9A-Z]{9}$/, sector: 'string', venue: 'string',
    issueDate: 'date', issueNo: 'int', producedAt: 'instant', disseminatedAt: 'instant',
    dissemination: { price: 'number', source: 'string', at: 'instant' },
    entry: { date: 'date', open: 'number' }, exitPlanned: 'date', exit: nul({ date: 'date', open: 'number' }),
    agreement: { $in: [3, 4] }, agreeing: [{ $in: ['A', 'B', 'C', 'D'] }], crashSwitch: 'boolean', combined: 'frac',
    families: { A: family, B: family, C: family, D: family },
    sensitivity: { family: { $in: ['A', 'B', 'C', 'D'] }, pct: 'frac', margin: 'number' },
    vetoChecks: [{ key: { $in: ['days_to_cover', 'idio_vol', 'earnings_within_3d', 'pending_ma', 'llm_48h'] }, pass: 'boolean' }],
    insider: { cluster: 'boolean', buyers: 'int' },
    thesis: en_sl, thesisNumbers: ['number'], drafter: { $in: ['template'] }, validator: { $in: ['passed'] },
    approver: 'string', modelLead: 'string', modelVersion: 'string', methodology: 'string',
    outcome: nul(outcome),
    mark: { date: 'date', close: 'number', net: 'number', bench: 'number', excess: 'number' },
    path: [{ $tuple: ['int', nul('number'), nul('number')] }],
    sms: en_sl, closeSms: nul(en_sl),
    seq: 'int', commit: 'hex64',
    reveal: { no: 'no4', ticker: 'string', figi: 'string', issueDate: 'date', agreeing: ['string'], salt: /^[0-9A-Za-z]{16}$/ },
    history12m: ['no4'],
  }],
  scoreboard: {
    simulated: true, periods: { sealed: { from: 'date', to: 'date' }, holdout: { from: 'date', to: 'date' } },
    families: [{ id: { $in: ['A', 'B', 'C', 'D'] }, sealed: famStats, holdout: famStats }],
    agreement: [{ k: { $in: ['4/4', '3/4', '2/4 shadow'] }, sealed: agreeStats, holdout: agreeStats }],
    correlations: { order: ['string'], matrix: [[nul('number')]] },
    icMonthly: [{ $tuple: [/^\d{4}-\d{2}$/, { A: nul('number'), B: nul('number'), C: nul('number'), D: nul('number') }] }],
  },
  deciles: { simulated: true, sealed: decileSet, holdout: decileSet },
  hero: {
    simulated: true, issueDate: 'date', issueNo: 'int', nScored: 'int', quorumCount: 'int',
    pick: { no: 'no4', ticker: 'string', name: 'string', agreeing: ['string'], index: 'int' },
    p: ['int'], sms: 'string', smsAt: 'instant',
    outcome: { excess: 'number', net: 'number', bench: 'number', exitDate: 'date' },
    path: [{ $tuple: ['int', nul('number'), nul('number')] }],
  },
  universe: { simulated: true, date: 'date', cols: ['string'], rows: [{ $tuple: ['string', 'string', 'string', nul('frac'), nul('frac'), nul('frac'), nul('frac'), 'int', nul('string'), 'number', 'number', nul('number')] }] },
  backtest: {
    simulated: true, label: { $in: ['HYPOTHETICAL'] }, window: { from: 'date', to: 'date' }, holdout: { from: 'date', to: 'date' },
    variantsTried: 'int', dsr: 'frac', pbo: 'frac', variantSharpes: ['number'],
    gates: [{ id: { $in: ['a', 'b', 'c', 'd', 'e'] }, pass: 'boolean', label: en_sl, detail: en_sl, values: 'object' }],
    equity: [{ $tuple: ['date', 'number', 'number', 'number', 'number', 'number', 'number', 'number'] }],
    equityCols: ['string'],
    annual: [{ year: 'int', quorum: 'number', bench: 'number', n: 'int' }],
    stats: { picksPerMonth: 'number', hitRate: 'frac', medianExcess: 'number', meanExcess: 'number', sharpe: 'number', maxDrawdown: 'number' },
    crashSwitchPeriods: [{ $tuple: ['date', 'date'] }],
  },
};

/** Check every file of the export; returns { file: [problems] } for files with problems. */
export function checkContract(files) {
  const out = {};
  for (const [name, spec] of Object.entries(SPECS)) {
    const errs = files[name] === undefined ? [`${name}: missing file`] : check(files[name], spec, name);
    // exact column lists
    if (name === 'universe' && files.universe) {
      const cols = ['ticker', 'name', 'sector', 'A', 'B', 'C', 'D', 'agree', 'veto', 'mcap', 'adv60', 'ret21'];
      if (JSON.stringify(files.universe.cols) !== JSON.stringify(cols)) errs.push('universe.cols: not the contract column list');
    }
    if (name === 'backtest' && files.backtest) {
      if (JSON.stringify(files.backtest.equityCols) !== JSON.stringify(['quorum', 'bench', 'twoOfFour', 'A', 'B', 'C', 'D'])) errs.push('backtest.equityCols: not the contract column list');
      if (files.backtest.gates.map((g) => g.id).join('') !== 'abcde') errs.push('backtest.gates: not gates a-e in order');
    }
    if (errs.length) out[name] = errs.slice(0, 20);
  }
  return out;
}
