// The Assembly's pure half (web/js/hero/level-data.js): data parsing, the 4.1 state machine, the camera and
// projection, the per-mote kinematics the shader mirrors, and the lintel's landing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseHero, subsample, excessPath, thresholdOf, DEFAULT_THRESHOLD, PHASES, SETTLED, AT, phaseAt, sceneAt, bezier, E, eOutFast,
  lintelExtent, computeLayout, cameraAt, viewProj, project, buildMotes, motePos, MOTE, Z_REST,
} from '../../web/js/hero/level-data.js';

const real = JSON.parse(readFileSync(new URL('../../web/data/hero.json', import.meta.url), 'utf8'));
const meta = JSON.parse(readFileSync(new URL('../../web/data/meta.json', import.meta.url), 'utf8'));

function hero(n = 500) {
  const p = [];
  for (let i = 0; i < n; i++) p.push((i * 37) % 1000, (i * 91) % 1000, i === 7 ? -1 : (i * 13) % 1000, (i * 53) % 1000);
  p.splice(4 * 3, 4, 960, 620, 950, 980);
  return { issueDate: '2026-07-28', p, pick: { index: 3, agreeing: ['A', 'C', 'D'] } };
}

const layout = (W = 1440, H = 900, thr = 910) => computeLayout({ W, H, rules: [0.125, 0.375, 0.625, 0.875].map((f) => f * W), top: 190, floor: H * 0.7, thr });

test('parseHero reads the flat percentile array, counts agreement and who met the rule', () => {
  const x = parseHero(hero());
  assert.equal(x.n, 500);
  assert.deepEqual(x.pickRow, [960, 620, 950, 980]);
  assert.equal(x.agree[3], 3);
  assert.equal(x.threshold, DEFAULT_THRESHOLD);
  // the real issue: the count that met the rule comes from the percentiles, not from copy
  const r = parseHero(real, thresholdOf(meta), meta.rule.minAgree);
  let met = 0;
  for (let i = 0; i < r.n; i++) if (r.agree[i] >= 3) met++;
  assert.equal(r.met, met);
  assert.ok(r.agree[real.pick.index] >= 3, 'the pick met the rule');
  assert.ok(r.met >= real.quorumCount, 'at least as many met the rule as became picks');
});

test('the threshold comes from meta.rule.topPct', () => {
  assert.equal(thresholdOf({ rule: { topPct: 0.91 } }), 910);
  assert.equal(thresholdOf(null), DEFAULT_THRESHOLD);
  assert.equal(parseHero(hero(), 955).agree[3], 2);
});

test('subsample is deterministic, sized, sorted and never contains the pick', () => {
  const a = subsample(1384, 812, 300, '2026-08-21');
  assert.deepEqual(a, subsample(1384, 812, 300, '2026-08-21'));
  assert.equal(new Set(a).size, 300);
  assert.ok(!a.includes(812));
  assert.deepEqual(a, [...a].sort((x, y) => x - y));
});

test('PHASES tile 0..1 in the order of DESIGN-V2 4.1; every settled frame lies in its own state', () => {
  assert.deepEqual(PHASES.map((p) => p.id), ['universe', 'vote', 'silence', 'quorum', 'text', 'result']);
  assert.equal(PHASES[0].from, 0);
  assert.equal(PHASES.at(-1).to, 1);
  for (let i = 1; i < PHASES.length; i++) assert.equal(PHASES[i].from, PHASES[i - 1].to);
  SETTLED.forEach((p, i) => assert.equal(phaseAt(p), i));
  let prev = 0;
  for (let p = 0; p <= 1.0001; p += 0.005) {
    const s = phaseAt(p);
    assert.ok(s >= prev);
    prev = s;
  }
});

test('the step indicator reads the scene: the text step starts with the hand-off, the result with the note', () => {
  assert.equal(phaseAt(AT.hand[0] - 0.001), 3);
  assert.equal(phaseAt(AT.hand[0]), 4);
  assert.equal(phaseAt(AT.note - 0.001), 4, 'the phone is still on screen');
  assert.equal(phaseAt(AT.note), 5);
  assert.ok(AT.bubble < AT.phone[1] && AT.bubble >= AT.phone[0] + 0.6 * (AT.phone[1] - AT.phone[0]) - 1e-9, 'the bubble grows once the phone is 60% risen');
});

test('sceneAt: the story in order; stepped mode shows each state settled', () => {
  const at = (p) => sceneAt(p);
  assert.equal(at(0).vote, 0);
  assert.equal(at(0.3).vote, 1);
  assert.equal(at(0.3).fall, 0);
  assert.equal(at(0.5).fall, 1);
  assert.equal(at(0.5).tilt, 1);
  assert.equal(at(0.53).lintel, 0, 'the lintel waits for the dolly');
  assert.equal(at(0.6).lintel, 1, 'the lintel extrudes over .06 of p');
  assert.ok(Math.abs(AT.lintel[1] - AT.lintel[0] - 0.06) < 1e-9);
  assert.equal(at(0.63).hand, 0);
  assert.equal(at(0.7).hand, 1, 'the lintel has reached the SMS baseline');
  assert.equal(at(0.7).handFade, 1);
  assert.ok(at(0.7).phone < 1, 'the phone is still rising behind the line');
  assert.ok(Math.abs(at(1).dim - 0.3) < 1e-9, 'the canvas dims to 30%');
  assert.equal(at(0.1).drift, true);
  assert.equal(at(0.31).drift, false);
  for (let i = 0; i < 6; i++) {
    const s = sceneAt(PHASES[i].from + 0.001, { stepped: true });
    assert.equal(s.step, i);
    assert.equal(s.p, SETTLED[i]);
  }
  const q = sceneAt(0.51, { stepped: true });
  assert.equal(q.lintel, 1, 'a stepped quorum shows the lintel whole');
  assert.equal(q.hand, 0);
});

test('easing: the motion tokens and the grains closed form agree', () => {
  assert.equal(E.out(0), 0);
  assert.equal(E.out(1), 1);
  assert.ok(Math.abs(bezier(0.25, 0.1, 0.25, 1)(0.5) - 0.8024) < 0.002, 'CSS ease at .5');
  for (let t = 0; t <= 1; t += 0.05) assert.ok(Math.abs(eOutFast(t) - E.out(t)) < 0.12, `e-out ${t}`);
  let prev = -1;
  for (let t = 0; t <= 1; t += 0.01) {
    const v = E.io(t);
    assert.ok(v >= prev - 1e-9);
    prev = v;
  }
});

test('lintelExtent overshoots by 2 px and settles on the span', () => {
  const span = 900;
  assert.equal(lintelExtent(0, span), 0);
  let max = 0;
  for (let t = 0; t <= 1; t += 0.01) max = Math.max(max, lintelExtent(t, span));
  assert.ok(max <= span + 2 + 1e-9 && max > span + 1.5);
  assert.ok(Math.abs(lintelExtent(1, span) - span) < 1e-9);
});

test('at rest the columns project onto the four page rules; the camera holds the frame', () => {
  for (const [W, H] of [[1440, 900], [390, 844], [834, 1194]]) {
    const L = layout(W, H);
    const vp = viewProj(cameraAt(sceneAt(0), L), W / H);
    L.colX.forEach((x, k) => {
      const [px] = project(vp, [x, L.y0, 0], W, H);
      assert.ok(Math.abs(px - [0.125, 0.375, 0.625, 0.875][k] * W) < 0.01, `${W}: rule ${k + 1}`);
    });
    // the tilt and the quorum's crane keep A and D on rules 1 and 4 (within 4 px), at every width
    for (const p of [0.45, 0.6, 0.75, 0.9]) {
      const vq = viewProj(cameraAt(sceneAt(p), L), W / H);
      for (const k of [0, 3]) {
        for (const y of [L.y0, L.yThr]) {
          const [px] = project(vq, [L.colX[k], y, 0], W, H);
          assert.ok(Math.abs(px - [0.125, 0.375, 0.625, 0.875][k] * W) <= 4, `${W} p=${p}: column ${k} stays on its rule (${px.toFixed(1)})`);
        }
      }
    }
    assert.equal(L.zQ, Z_REST, 'no dolly in z');
  }
});

test('motes: a cloud, then the vote, then silence; the pick never falls', () => {
  const x = parseHero(real, 910);
  const rows = [x.pick.index, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const m = buildMotes(x, rows, real.issueDate);
  assert.equal(m.length, rows.length * 4 * MOTE);
  assert.deepEqual(m, buildMotes(x, rows, real.issueDate), 'deterministic');
  const L = layout();
  const ag = [1, 1, 0, 1];
  const S0 = sceneAt(0);
  const S1 = sceneAt(0.3);
  const S2 = sceneAt(0.5);
  for (let o = 0; o < m.length; o += MOTE) {
    const k = m[o + 11];
    const pct = m[o + k];
    const pick = m[o + 12] > 0.5;
    const c = motePos(m, o, S0, L, ag);
    assert.ok(Math.abs(c[2] - L.cc[2]) <= L.cr[2] + 0.1, 'in the cloud, in front of the columns');
    const v = motePos(m, o, S1, L, ag);
    assert.ok(Math.abs(v[0] - L.colX[k]) <= 0.081, 'on its column');
    assert.ok(Math.abs(v[1] - (L.y0 + Math.max(0, pct) * L.yH)) < 1e-6, 'at its percentile');
    const s = motePos(m, o, S2, L, ag);
    if (pick) assert.ok(Math.abs(s[1] - v[1]) < 1e-9, 'the pick stays, C included');
    else if (pct < L.thr) {
      assert.ok(s[1] >= L.floorY && s[1] <= L.floorY + 0.015, 'fallen into the sediment (±.01)');
    } else assert.ok(Math.abs(s[1] - v[1]) < 1e-9, 'above the rule it stays');
  }
  // the pick's agreeing motes brighten at the quorum; the others dim
  const SQ = sceneAt(0.6);
  const pickA = motePos(m, 0, SQ, L, ag);
  assert.equal(pickA[3], 1);
});

test('excessPath keeps one point per day (the entry, not the entry day close)', () => {
  assert.deepEqual(excessPath([[0, -0.002, 0], [0, 0.004, -0.008], [1, 0.01, 0.0]]).map(([d, e]) => [d, +e.toFixed(4)]), [[0, -0.002], [1, 0.01]]);
});

test('excessPath subtracts the benchmark', () => {
  assert.deepEqual(excessPath([[0, 0, 0], [21, 0.05, 0.01]]).map(([d, e]) => [d, +e.toFixed(4)]), [[0, 0], [21, 0.04]]);
});
