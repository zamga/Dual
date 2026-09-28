import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHero, subsample, lineRandoms, buildVertices, STRIDE, stateAt, excessPath, THRESHOLD } from '../../web/js/hero/level-data.js';

function hero(n = 500) {
  const p = [];
  for (let i = 0; i < n; i++) p.push((i * 37) % 1000, (i * 91) % 1000, i === 7 ? -1 : (i * 13) % 1000, (i * 53) % 1000);
  p.splice(4 * 3, 4, 960, 620, 950, 980);
  return { issueDate: '2026-07-28', p, pick: { index: 3, agreeing: ['A', 'C', 'D'] } };
}

test('parseHero reads the flat percentile array and counts agreement', () => {
  const x = parseHero(hero());
  assert.equal(x.n, 500);
  assert.deepEqual(x.pickRow, [960, 620, 950, 980]);
  assert.equal(x.agree[3], 3);
  assert.ok(THRESHOLD === 900);
});

test('subsample is deterministic, sized, sorted and never contains the pick', () => {
  const a = subsample(1384, 812, 300, '2026-08-21');
  const b = subsample(1384, 812, 300, '2026-08-21');
  assert.deepEqual(a, b);
  assert.equal(a.length, 300);
  assert.equal(new Set(a).size, 300);
  assert.ok(!a.includes(812));
  assert.deepEqual(a, [...a].sort((x, y) => x - y));
  assert.notDeepEqual(a, subsample(1384, 812, 300, '2026-08-22'));
  assert.equal(subsample(10, 0, 300).length, 9);
});

test('buildVertices: 3 segments x 6 vertices per non-pick line, gaps flagged', () => {
  const h = hero();
  const x = parseHero(h);
  const v = buildVertices(x, subsample(x.n, 3, 100, 'k'), lineRandoms(x.n, 'k'));
  assert.equal(v.length, (x.n - 1) * 3 * 6 * STRIDE);
  // row 7 has C missing: its B-C and C-D segments are gaps (pct -1)
  let gaps = 0;
  for (let i = 0; i < v.length; i += STRIDE) if (v[i + 1] === -1) gaps++;
  assert.equal(gaps, 2 * 6);
});

test('stateAt: states advance with progress; stepped mode snaps', () => {
  assert.equal(stateAt(0).step, 0);
  assert.equal(stateAt(0.2).step, 1);
  assert.equal(stateAt(0.5).step, 2);
  assert.equal(stateAt(0.9).step, 3);
  assert.equal(stateAt(1).s3, 1);
  const s = stateAt(0.55, { stepped: true });
  assert.deepEqual(s, { step: 2, s1: 1, s2: 1, s3: 0 });
  let prev = -1;
  for (let p = 0; p <= 1; p += 0.01) {
    const st = stateAt(p);
    assert.ok(st.step >= prev);
    prev = st.step;
  }
});

test('excessPath subtracts the benchmark', () => {
  assert.deepEqual(excessPath([[0, 0, 0], [21, 0.05, 0.01]]).map(([d, e]) => [d, +e.toFixed(4)]), [[0, 0], [21, 0.04]]);
});
