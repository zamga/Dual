// Pure geometry of the stage-2 charts (web/js/charts/*): scales, ticks, the colonnade, the path, the
// scoreboard axes (50% on rule 3), the decile staircase domain, the line chart helpers, formatting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { linear, logScale, ticks, niceStep, logTicks, domainWithZero, histogram, nearestIndex, pointsAttr } from '../../web/js/charts/scale.js';
import { colonnadeModel, sensitivityModel } from '../../web/js/charts/colonnade.js';
import { pathModel, HORIZON, endLabelYs, pathStep } from '../../web/js/charts/path.js';
import { axisPos, HIT_DOMAIN, IC_DOMAIN } from '../../web/js/charts/scoreboard.js';
import { stairDomain } from '../../web/js/charts/deciles.js';
import { thin, yAxis } from '../../web/js/charts/equity.js';
import { compactUsd, universeRow } from '../../web/js/pages/stock.js';
import { formatters } from '../../web/js/i18n.js';

const data = (f) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../web/data/${f}.json`, import.meta.url)), 'utf8'));

test('scales and ticks', () => {
  const s = linear(0, 10, 0, 1000);
  assert.equal(s(5), 500);
  assert.equal(s.invert(250), 2.5);
  assert.equal(logScale(1, 100, 1000, 0)(10), 500);
  assert.equal(niceStep(1, 5), 0.2);
  assert.deepEqual(ticks(-0.02, 0.2, 5), [0, 0.05, 0.1, 0.15, 0.2]);
  assert.deepEqual(logTicks(0.7, 60), [1, 2, 5, 10, 20, 50]);
  const [lo, hi] = domainWithZero([0.05, 0.1]);
  assert.ok(lo < 0 && hi > 0.1);
  assert.deepEqual(histogram([0.1, 0.2, 0.25, 0.9], 0, 1, 4).map((b) => b.n), [2, 1, 0, 1]);
  assert.equal(nearestIndex([0, 10, 20, 30], 14), 1);
  assert.equal(nearestIndex([0, 10, 20, 30], 16), 2);
  assert.equal(pointsAttr([[1, 2], [3.14159, 4]]), '1,2 3.1,4');
});

test('the colonnade: columns on the four rules, the lintel over the qualifying ones', () => {
  const picks = data('picks');
  const meta = data('meta');
  for (const p of picks.slice(0, 30)) {
    const m = colonnadeModel(p, meta.rule.topPct);
    assert.equal(m.cols.length, 4);
    const agree = m.cols.filter((c) => c.agree);
    assert.equal(agree.length, p.agreement, p.no);
    assert.ok(agree.every((c) => c.clears), `${p.no}: every agreeing family clears the rule`);
    assert.equal(m.lintel.from, Math.min(...agree.map((c) => c.k)));
    assert.equal(m.lintel.to, Math.max(...agree.map((c) => c.k)));
    const s = sensitivityModel(p, meta.rule.topPct);
    assert.ok(s.margin >= 0 && s.sd >= 0, p.no);
  }
  const lone = colonnadeModel({ agreeing: ['A', 'B', 'D'], families: { A: { pct: 0.97 }, B: { pct: 0.96 }, C: { pct: 0.4 }, D: { pct: 0.99 } } }, 0.95);
  assert.deepEqual(lone.lintel, { from: 0, to: 3 });
  assert.equal(lone.cols[2].agree, false);
});

test('the path: 21 trading days across rules 1–4, zero inside the domain', () => {
  const p = data('picks').find((x) => x.status === 'closed');
  const m = pathModel(p.path);
  assert.equal(HORIZON, 21);
  assert.equal(m.x(7), 1000 / 3);
  assert.equal(m.x(14), 2000 / 3);
  assert.equal(m.x(21), 1000);
  assert.ok(m.zero > 0 && m.zero < 1000);
  assert.equal(m.net.length, p.path.length);
  assert.equal(m.last[0], 21);
});

test('the path names its two day-0 rows: the entry at the US open, then the day-0 close', () => {
  const p = data('picks').find((x) => x.status === 'closed');
  const rows = pathModel(p.path).rows;
  assert.equal(pathStep(rows, 0), 'entry');
  assert.equal(pathStep(rows, 1), 'close0');
  assert.equal(pathStep(rows, 2), 'day');
  assert.equal(pathStep([[0, 0, 0], [1, 0.01, 0]], 0), 'day', 'an older one-row day 0 stays "day 0"');
});

test('the path end labels never overlap each other or sit on the zero line', () => {
  // net +3.3% and benchmark +6.1% end close together (the 834 px collision), and a 0.0% benchmark
  const m = pathModel([[0, 0, 0], [10, 0.05, 0.04], [21, 0.033, 0.061]]);
  const [a, b] = endLabelYs(m, 0.033, 0.061);
  assert.ok(Math.abs(a - b) >= 110 - 1e-9, `${a} ${b}`);
  assert.ok(b < a, 'the higher value keeps the higher label');
  const flat = pathModel([[0, 0, 0], [5, -0.02, 0.001], [9, -0.015, 0.00006]]);
  const [n, z] = endLabelYs(flat, -0.015, 0.00006);
  assert.ok(Math.abs(z - flat.zero) >= 60 - 1e-9 && Math.abs(n - flat.zero) >= 60 - 1e-9);
  for (const y of [a, b, n, z]) assert.ok(y >= 55 && y <= 945, String(y));
});

test('the scoreboard: 50% sits on rule 3, IC zero sits on rule 3', () => {
  assert.equal(axisPos(0.5, HIT_DOMAIN), 50);
  assert.equal(axisPos(0.1, HIT_DOMAIN), 0);
  assert.equal(axisPos(0.95, HIT_DOMAIN), 100);
  assert.equal(axisPos(0, IC_DOMAIN), 50);
  assert.equal(axisPos(NaN, IC_DOMAIN), null);
});

test('the staircase domain holds every interval and is symmetric', () => {
  const rows = data('deciles').sealed.combined;
  const [lo, hi] = stairDomain(rows);
  assert.equal(lo, -hi);
  assert.ok(rows.every((r) => r.ci.every((v) => v >= lo && v <= hi)));
});

test('line chart helpers: thinning keeps the ends, log axis for growth', () => {
  const idx = thin(10, 1000);
  assert.equal(idx[0], 0);
  assert.equal(idx.at(-1), 999);
  assert.ok(idx.length <= 10);
  assert.deepEqual(thin(10, 3), [0, 1, 2]);
  const y = yAxis([1, 46], { log: true });
  assert.ok(y.ticks.includes(1) && y.ticks.includes(10));
  assert.ok(y.scale(1) > y.scale(10));
});

test('stock page helpers', () => {
  const en = formatters('en');
  const sl = formatters('sl');
  assert.equal(compactUsd(19060906446704, en, 'en'), '$19.1T');
  assert.equal(compactUsd(54618690793, en, 'en'), '$54.6B');
  assert.equal(compactUsd(449256864, en, 'en'), '$449M');
  assert.equal(compactUsd(54618690793, sl, 'sl'), '54,6 mrd $');
  assert.equal(compactUsd(NaN, en, 'en'), '–');
  const u = data('universe');
  const row = universeRow(u, u.rows[0][0]);
  assert.equal(row.ticker, u.rows[0][0]);
  assert.equal(universeRow(u, 'NOPE'), null);
});
