// Guards on the export that is actually published (web/data, written by `node engine/cli.js run`):
// the same rules the export tests check on the small universe, on the full data the site shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FILES, DATA_DIR } from '../../engine/export.js';
import { isRealTicker } from '../../engine/sim/blocklist.js';
import { checkContract } from './contract.js';
import { nextTradingDay } from '../../core/calendar.js';

const present = FILES.every((f) => existsSync(join(DATA_DIR, `${f}.json`)));
const files = present ? Object.fromEntries(FILES.map((f) => [f, JSON.parse(readFileSync(join(DATA_DIR, `${f}.json`), 'utf8'))])) : null;
const skip = present ? false : 'no engine export in web/data';

function strings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out);
  return out;
}

test('web/data matches the data contract', { skip }, () => {
  assert.deepEqual(checkContract(files), {});
});

test('web/data: no published string refers to "the brief"', { skip }, () => {
  for (const f of FILES) for (const t of strings(files[f])) assert.ok(!/\bthe brief\b|\bbrief's\b|izhodišč/i.test(t), `${f}: ${t.slice(0, 120)}`);
});

test('web/data: no simulated company carries a real US ticker', { skip }, () => {
  const tickers = new Set([...files.picks.map((p) => p.ticker), ...files.universe.rows.map((r) => r[0]), files.hero.pick?.ticker].filter(Boolean));
  assert.deepEqual([...tickers].filter((t) => isRealTicker(t)), []);
});

test('web/data: picks are BUY records; renewals and closed windows are counted apart', { skip }, () => {
  const { summary: s, meta: m, picks } = files;
  assert.equal(s.nPicks, picks.filter((p) => p.kind === 'BUY').length);
  assert.equal(s.nPicks, m.counts.picks);
  assert.equal(s.nRenews, m.counts.renews);
  assert.equal(s.nRecords, picks.length);
  assert.equal(s.nClosed, picks.filter((p) => p.outcome).length);
});

test('web/data: percentiles at or above topPct exactly when the family votes; the path grid', { skip }, () => {
  const top = files.meta.rule.topPct;
  for (const p of files.picks) {
    for (const f of ['A', 'B', 'C', 'D']) {
      const v = p.families[f].pct;
      if (v !== null && !(p.crashSwitch && f === 'A')) assert.equal(v >= top, p.agreeing.includes(f), `#${p.no} ${f} ${v}`);
    }
    assert.equal(p.path[0][0], 0);
    if (p.outcome) assert.deepEqual(p.path.map((r) => r[0]), [0, ...Array.from({ length: 21 }, (_, d) => d), 21], `#${p.no}`);
  }
  assert.ok(files.hero.p.every((v) => Number.isInteger(v) && v >= -1 && v <= 999));
});

test('web/data: gate d2 counts complete months; the LLM stand-in is not in the backtest', { skip }, () => {
  const L = files.backtest.launch;
  const asOf = files.meta.asOf;
  const complete = nextTradingDay(asOf).slice(0, 7) !== asOf.slice(0, 7);
  assert.equal(L.d2.monthToDate === null, complete);
  assert.ok(L.pooled.monthly.every(([mo]) => complete || mo < asOf.slice(0, 7)));
  assert.equal(L.d2.months, L.pooled.monthly.length);
  assert.equal(files.backtest.llmVetoShadow.appliedFrom, files.meta.sealedSince);
});
