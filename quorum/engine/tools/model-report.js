// Build the model and print the calibration report (runtime, eligible counts, family ICs,
// correlations, 3-of-4 hit rates, crash-switch periods, D training summary).
// Usage: node engine/tools/model-report.js [--small] [--no-cache] [--json out.json]
import { writeFileSync } from 'node:fs';
import { buildModel } from '../model.js';

const args = process.argv.slice(2);
const small = args.includes('--small');
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const t0 = Date.now();
const model = await buildModel({ universe: small ? 'small' : 'full', cache: !args.includes('--no-cache'), verbose: true });
const wall = Date.now() - t0;
const d = model.diagnostics;
const r = (x) => (x === null || x === undefined ? '  n/a ' : x.toFixed(4));
console.log(`\nuniverse ${model.universe}: ${model.N} companies ever listed, ${model.T} model days ${model.dates[0]} -> ${model.dates[model.T - 1]}`);
console.log(`runtime ${(wall / 1000).toFixed(1)}s (sim ${(model.timings.simMs / 1000).toFixed(1)}s, features ${(model.timings.featuresMs / 1000).toFixed(1)}s, D ${(model.timings.mlMs / 1000).toFixed(1)}s${model.timings.cacheHit ? ' cached' : ''}, diagnostics ${(model.timings.diagnosticsMs / 1000).toFixed(1)}s)`);
console.log(`eligible per day: min ${d.eligible.min} (${d.eligible.minDate}), max ${d.eligible.max} (${d.eligible.maxDate})`);
console.log('\nmean monthly rank IC (21d, month-end scores)');
console.log('period      months     A       B       C       D');
for (const [p, v] of Object.entries(d.icByPeriod)) console.log(`${p.padEnd(10)} ${String(v.months).padStart(6)}  ${r(v.A)}  ${r(v.B)}  ${r(v.C)}  ${r(v.D)}`);
console.log('\nfamily rank correlations (mean monthly cross-sectional Spearman)');
for (let a = 0; a < 4; a++) console.log(`${d.correlations.order[a]}  ${d.correlations.matrix[a].map((x) => x.toFixed(3).padStart(6)).join(' ')}`);
console.log('\n>= 3 of 4 families in the top decile: beat the benchmark over the next 21 days, net of costs');
for (const [p, v] of Object.entries(d.hit3of4)) console.log(`${p.padEnd(10)} raw ${r(v.rawRule.hit)} (n ${v.rawRule.n}, mean excess ${r(v.rawRule.meanExcessNet)})  crash-aware ${r(v.withCrashSwitch.hit)}  +vetoes ${r(v.withCrashSwitchAndVetoes.hit)} (n ${v.withCrashSwitchAndVetoes.n})  first-day-of-month ${r(v.firstDayOfMonthOnly.hit)}  candidates/day ${v.candidatesPerDay}`);
console.log('\nveto effect (research window, month-end, mean 21d excess vs benchmark): flagged vs not flagged');
for (const [k, v] of Object.entries(d.vetoEffect)) console.log(`${k.padEnd(18)} ${r(v.flaggedMeanExcess)} vs ${r(v.otherMeanExcess)} (n flagged ${v.nFlagged})`);
console.log(`\ncrash switch ON: ${d.crashPeriods.map(([a, b]) => `${a}..${b}`).join(', ')}`);
console.log(`\nD: ${JSON.stringify(model.dModel.params)} cvIC ${model.dModel.cvIC?.toFixed(4)} excluded ${JSON.stringify(model.dModel.excludedFamilies)}; ${model.experiments.length} configurations logged`);
for (const e of model.trainingLog.filter((x) => x.step !== 'walk-forward')) console.log(JSON.stringify(e));
for (const e of model.trainingLog.filter((x) => x.step === 'walk-forward')) console.log(`${e.model} cutoff ${e.cutoff} rows ${e.nRows} oosIC ${e.oosMonthlyIC} top ${e.topFeatures.slice(0, 3).map((x) => x[0]).join(',')}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ diagnostics: { ...d, icMonthly: undefined }, dModel: model.dModel, timings: model.timings }, null, 2));
