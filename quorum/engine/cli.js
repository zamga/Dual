#!/usr/bin/env node
// Quorum engine command line.
//   node engine/cli.js run      build model -> validate (calibration, variants, DSR/PBO, holdout gates)
//                               -> sealed record -> export web/data/*.json, with a summary and timings
//   node engine/cli.js export   the same pipeline, printing only the files written. The expensive
//                               part (the D walk-forward and its CV) is read from engine/.cache when the
//                               cache matches the model sources; otherwise it is rebuilt.
// Options: --no-cache (rebuild the model), --small (test universe), --out <dir>, --quiet
import { buildModel } from './model.js';
import { validate } from './validate.js';
import { buildRecord } from './record.js';
import { buildAll, writeAll, DATA_DIR } from './export.js';

function parseArgs(argv) {
  const o = { cmd: argv[0] || 'run', cache: true, universe: 'full', out: null, quiet: false };
  for (let k = 1; k < argv.length; k++) {
    const a = argv[k];
    if (a === '--no-cache') o.cache = false;
    else if (a === '--small') o.universe = 'small';
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--out') o.out = argv[++k];
    else throw new Error(`unknown option ${a}`);
  }
  if (!['run', 'export'].includes(o.cmd)) throw new Error(`unknown command ${o.cmd} (use run or export)`);
  return o;
}

/** The whole pipeline. Returns { model, validation, record, files, written, timings }. */
export async function pipeline({ universe = 'full', cache = true, out = null, log = () => {} } = {}) {
  const timings = {};
  const clock = (k, t0) => {
    timings[k] = Date.now() - t0;
    return timings[k];
  };
  let t0 = Date.now();
  const model = await buildModel({ universe, cache });
  log(`model: ${model.N} companies, ${model.T} days, D ${model.timings.cacheHit ? 'from cache' : 'trained'} (${(clock('model', t0) / 1000).toFixed(1)}s)`);
  t0 = Date.now();
  const validation = validate(model, { log: (s) => log(`  ${s}`) });
  log(`validation (${(clock('validate', t0) / 1000).toFixed(1)}s)`);
  t0 = Date.now();
  const record = await buildRecord(model, validation.rule);
  log(`sealed record: ${record.issues.length} issues, ${record.picks.length} records, ${record.ledger.entries.length} ledger entries (${(clock('record', t0) / 1000).toFixed(1)}s)`);
  t0 = Date.now();
  const files = buildAll(model, validation, record);
  const dir = out ?? (universe === 'full' ? DATA_DIR : null);
  if (!dir) throw new Error('the small universe never writes web/data: pass --out <dir>');
  const written = writeAll(files, dir);
  log(`export: ${written.length} files (${(clock('export', t0) / 1000).toFixed(1)}s)`);
  return { model, validation, record, files, written, timings };
}

function pct(x, d = 1) {
  return x === null || x === undefined || !Number.isFinite(x) ? 'n/a' : `${(x * 100).toFixed(d)}%`;
}

function printSummary(res, wallMs) {
  const { validation: v, files, written, timings } = res;
  const s = files.summary;
  const b = files.backtest;
  console.log('\nRule (calibrated on the research window)');
  console.log(`  topPct ${v.rule.topPct}, ${v.rule.minAgree} of 4, caps ${v.rule.maxPerIssue}/issue ${v.rule.maxPerMonth}/month ${v.rule.maxPerSector}/sector, cooldown ${v.rule.cooldownDays}d`);
  console.log(`  research picks/month ${b.stats.picksPerMonth} (renewals ${b.stats.renewsPerMonth}), hit ${pct(b.stats.hitRate)}, mean excess ${pct(b.stats.meanExcess, 2)}, Sharpe ${b.stats.sharpe}`);
  const dd = b.dsrDetail;
  console.log(`\nVariants tried ${b.variantsTried}, effective trials K = ${dd.clustered.K} (silhouette ${dd.clustered.silhouette}, sizes ${dd.clustered.sizes.join('/')}, cluster Sharpes ${dd.clustered.clusterSharpes.join('/')})`);
  console.log(`  DSR holdout: clustered ${dd.clustered.dsr}, raw ${dd.raw.dsr}; DSR research: clustered ${dd.clustered.dsrResearch}, raw ${dd.raw.dsrResearch}; SR0 monthly clustered ${dd.clustered.expectedMaxSharpeMonthly}, raw ${dd.raw.expectedMaxSharpeMonthly}; PBO ${b.pbo}`);
  console.log('\nShip gates (holdout, net of costs)');
  for (const g of b.gates) console.log(`  (${g.id}) ${g.pass ? 'PASS' : 'FAIL'}  ${g.detail.en}`);
  const L = b.launch;
  const P = L.pooled;
  console.log(`\nLaunch (${L.amendment.id}): ${L.status}`);
  console.log(`  original (d) on the holdout: DSR ${L.original.dsr}, PBO ${L.original.pbo}, pass ${L.original.pass}`);
  console.log(`  (d1) research window: DSR ${L.d1.dsrResearch} (K ${L.d1.nTrialsEff}, raw ${L.d1.dsrResearchRaw}), PBO ${L.d1.pbo}, pass ${L.d1.pass}`);
  console.log(`  (d2) pooled ${P.from}..${P.to}: PSR ${L.d2.psr}, ${L.d2.months} months, Sharpe ${L.d2.sharpe}, pass ${L.d2.pass} (first pass ${L.d2.firstPass}), months to pass ${L.d2.monthsToPass}`);
  console.log(`  pooled deflated (not a gate): DSR clustered ${P.dsr} (K ${P.nTrialsEff}), raw ${P.dsrRaw} (${P.nTrialsRaw}), months to 0.95 ${P.monthsToPass}`);
  if (L.d2.monthToDate) console.log(`  month to date ${L.d2.monthToDate.month} (through ${L.d2.monthToDate.through}, not a test result): PSR ${L.d2.monthToDate.psr} over ${L.d2.monthToDate.months} months`);
  const sh = b.llmVetoShadow;
  console.log(`  LLM news-veto stand-in, not backtested (live from ${sh.appliedFrom}): would have blocked ${sh.research.candidates} research and ${sh.holdout.candidates} holdout candidates (renewals ${sh.research.renewals}/${sh.holdout.renewals})`);
  console.log(`  ${L.remaining.en}`);
  console.log('\nSealed record');
  console.log(`  ${s.nRecords} records (${s.nPicks} BUY picks, ${s.nRenews} RENEW), ${s.nClosed} windows closed, hit ${pct(s.hitRate)} [${pct(s.hitCI[0])}, ${pct(s.hitCI[1])}]`);
  console.log(`  median excess ${pct(s.medianExcess, 2)}, mean ${pct(s.meanExcess, 2)}, worst #${s.worstPick?.no} ${pct(s.worstPick?.excess, 1)}, max drawdown ${pct(s.maxDrawdown)}, median alert gap ${s.medianAlertGapBps} bps`);
  console.log(`  cumulative follow ${pct(s.cumulative.follow)} vs bench ${pct(s.cumulative.bench)}; vetoes ${JSON.stringify(s.vetoes)}; unissued ${s.unissued}`);
  console.log(`  alert gap: latest ${s.alertGap.window} ${s.alertGap.latestWindowBps} bps, max window ${s.alertGap.maxWindowBps} bps, ${s.alertGap.windowsAbove}/${s.alertGap.windows} windows above ${s.alertGap.thresholdBps}; earnings entries ${s.alertGap.earningsEntries} (median ${s.alertGap.earningsMedianBps} bps, others ${s.alertGap.otherMedianBps} bps)`);
  console.log(`  human vetoes: ${res.record.decisions.removals.map((r) => `${r.date} ${r.code}`).join(', ')}`);
  console.log('\nFiles');
  for (const w of written) console.log(`  ${w.file.padEnd(16)} ${String(w.bytes).padStart(9)} bytes`);
  console.log(`\nTimings: model ${(timings.model / 1000).toFixed(1)}s, validate ${(timings.validate / 1000).toFixed(1)}s, record ${(timings.record / 1000).toFixed(1)}s, export ${(timings.export / 1000).toFixed(1)}s, total ${(wallMs / 1000).toFixed(1)}s`);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const log = o.quiet || o.cmd === 'export' ? () => {} : (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
  const res = await pipeline({ universe: o.universe, cache: o.cache, out: o.out, log });
  if (o.cmd === 'run' && !o.quiet) printSummary(res, Date.now() - t0);
  else for (const w of res.written) console.log(`${w.file} ${w.bytes}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
