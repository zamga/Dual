// "Lower the bar" (web/js/charts/lower-the-bar.js, DESIGN-V2 §4.8): counts live from hero.json, the
// slider's keyboard model, and the honesty rule (only the real threshold is the rule).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { barCount, barKey, barModel, BAR_MIN, BAR_MAX } from '../../web/js/charts/lower-the-bar.js';
import { parseHero, thresholdOf } from '../../web/js/hero/level-data.js';

const hero = JSON.parse(readFileSync(new URL('../../web/data/hero.json', import.meta.url), 'utf8'));
const meta = JSON.parse(readFileSync(new URL('../../web/data/meta.json', import.meta.url), 'utf8'));

test('barCount counts stocks with at least three families at or above the bar', () => {
  const p = [950, 950, 950, 0, 950, 950, 0, 0, 990, 990, 990, 990, 910, 909, 910, 910];
  assert.equal(barCount(p, 95), 2);
  assert.equal(barCount(p, 91), 3);
  assert.equal(barCount(p, 91, 4), 1);
  assert.equal(barCount(p, 99), 1);
});

test('lowering the bar never removes a stock; at the rule it matches the hero parse', () => {
  let prev = -1;
  for (let b = BAR_MAX; b >= BAR_MIN; b--) {
    const n = barCount(hero.p, b);
    assert.ok(n >= prev, `bar ${b}`);
    prev = n;
  }
  const rule = Math.round(meta.rule.topPct * 100);
  assert.equal(barCount(hero.p, rule, meta.rule.minAgree), parseHero(hero, thresholdOf(meta), meta.rule.minAgree).met);
});

test('barModel: only the real threshold is the rule', () => {
  const rule = Math.round(meta.rule.topPct * 100);
  const m = barModel(hero, rule, meta);
  assert.equal(m.isRule, true);
  assert.equal(m.count, m.ruleCount);
  const h = barModel(hero, 70, meta);
  assert.equal(h.isRule, false);
  assert.ok(h.count > m.count);
  assert.equal(barModel(hero, 70, null).rule, null, 'no meta: no rule claimed');
});

test('the slider keys: arrows ±1, PageUp/PageDown ±10, Home/End the ends, clamped', () => {
  assert.equal(barKey(91, 'ArrowUp'), 92);
  assert.equal(barKey(91, 'ArrowLeft'), 90);
  assert.equal(barKey(91, 'PageDown'), 81);
  assert.equal(barKey(95, 'PageUp'), BAR_MAX);
  assert.equal(barKey(55, 'PageDown'), BAR_MIN);
  assert.equal(barKey(70, 'Home'), BAR_MIN);
  assert.equal(barKey(70, 'End'), BAR_MAX);
  assert.equal(barKey(70, 'a'), null);
});
