// The launch states (web/js/launch.js): every page that reads backtest.json "launch" takes its copy from
// launchInfo + launchCopy, so both states are designed and tested here with fixtures, whatever the current
// export says. "ready" means the ENGINE launch gate passes; launch itself also needs the brief's other gates
// (§8: legal, data licences, the SMS carrier's approval), so no state may say a text was sent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchInfo, launchCopy, OTHER_GATES } from '../../web/js/launch.js';
import { simulationText } from '../../web/js/ui.js';

const gates = (fail) => ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, pass: !fail.includes(id) }));

// Pre-launch and back in research: holdout (b) and (d1) failed, (d2) passes (the shape of the sealed export).
const PRE = {
  launch: {
    status: 'pre-launch',
    asOf: '2026-09-28',
    holdoutGates: gates(['b', 'd']),
    original: { dsr: 0.838, pass: false },
    d1: { dsrResearch: 0.4753, dsrThreshold: 0.95, pbo: 0.029, pboThreshold: 0.3, pass: false },
    d2: { psr: 0.999, threshold: 0.95, pass: true, firstPass: '2025-10' },
    pooled: { dsr: 0.94, pass: false, gate: false, passAt: '2027-03' },
    remaining: {
      en: 'Holdout gate (b) failed and gate (d1) fails, which no number of further months can change, so under our pre-registered launch protocol the engine goes back to research and SMS alerts do not launch.',
      sl: 'Pogoj (b) v preizkusnem obdobju ni bil izpolnjen in pogoj (d1) ni izpolnjen, zato se pogon vrne v raziskave in obvestila SMS se ne zaženejo.',
    },
  },
};
// Pre-launch and waiting: only (d2) is short, and it can pass with more months.
const WAIT = { launch: { status: 'pre-launch', holdoutGates: gates(['d']), d1: { dsrResearch: 0.97, pass: true }, d2: { psr: 0.9, threshold: 0.95, pass: false } } };
// Ready: the engine launch gate passes under A-1.
const READY = {
  launch: {
    status: 'ready',
    asOf: '2026-10-30',
    holdoutGates: gates(['d']),
    original: { dsr: 0.9, pass: false },
    d1: { dsrResearch: 0.97, dsrThreshold: 0.95, pbo: 0.03, pboThreshold: 0.3, pass: true },
    d2: { psr: 0.99, threshold: 0.95, pass: true, firstPass: '2025-10' },
    pooled: { dsr: 0.5, pass: false, gate: false },
    remaining: { en: 'Nothing on the engine side: SMS alerts can launch once the legal, research-tier and data gates are met.', sl: 'S strani pogona nič.' },
  },
};

// the delivery claims tests/e2e/checks.js copyChecks refuses before launch (a negation is allowed)
const CLAIM = /\b(texted|went out|as sent|readers got|subscribers saw|poslano naročnikom|so ta SMS dobili|je šel ven)\b/i;
const NEG = /\b(no|not|nothing|none|never|ni|nič|noben)\b/i;
function strings(copy) {
  const out = [];
  for (const [k, v] of Object.entries(copy)) {
    if (typeof v === 'string') out.push([k, v]);
    else if (typeof v === 'function') for (const arg of [true, false, '12', 'Signal']) out.push([`${k}(${arg})`, String(v(arg))]);
  }
  return out;
}

test('launchInfo: pre-launch fixture (back in research)', () => {
  const i = launchInfo(PRE);
  assert.equal(i.known, true);
  assert.equal(i.status, 'pre-launch');
  assert.equal(i.state, 'research');
  assert.equal(i.ready, false);
  assert.equal(i.research, true);
  assert.equal(i.launched, false);
  assert.equal(i.prelaunch, true);
  assert.deepEqual(i.failed, ['b', 'd1']);
  assert.ok(!i.holdout.some((g) => g.id === 'd'), 'gate (d) as first written is not an applied gate');
  assert.equal(i.text.en, PRE.launch.remaining.en, 'the engine’s computed sentence is used before launch');
  assert.match(i.lead.en, /back in research.*\(b\) and \(d1\).*no launch date/);
  assert.match(i.lead.sl, /raziskavah/);
  assert.equal(i.label.en, 'Pre-launch · back in research');
  // the pooled deflated figures are comparison only: never a gate, never a date
  for (const loc of ['en', 'sl']) assert.doesNotMatch(`${i.text[loc]} ${i.lead[loc]}`, /0[.,]94|2027/);
});

test('launchInfo: pre-launch fixture (waiting on d2) and no launch block', () => {
  const w = launchInfo(WAIT);
  assert.equal(w.state, 'waiting');
  assert.equal(w.research, false);
  assert.match(w.lead.en, /opens at launch/);
  assert.match(w.text.en, /^Engine launch gate: holdout gates \(a\), \(b\), \(c\) and \(e\) pass; \(d1\) passes \(0\.97, needs 0\.95\); \(d2\) not yet \(0\.900, needs 0\.95\)\.$/);
  assert.match(w.text.sl, /^Pogoj pogona za zagon: /);
  for (const none of [launchInfo({}), launchInfo(null)]) {
    assert.equal(none.known, false);
    assert.equal(none.state, 'unknown');
    assert.equal(none.prelaunch, true);
    assert.equal(none.launched, false);
  }
});

test('launchInfo: ready fixture says the engine gate passes, never that SMS is open', () => {
  const r = launchInfo(READY);
  assert.equal(r.status, 'ready');
  assert.equal(r.state, 'ready');
  assert.equal(r.ready, true);
  assert.equal(r.research, false);
  assert.equal(r.launched, false, 'the engine gate is not launch');
  assert.equal(r.prelaunch, true, 'no subscribers: still pre-launch for every delivery sentence');
  assert.match(r.text.en, /^Engine launch gate: passes\./);
  assert.match(r.text.sl, /^Pogoj pogona za zagon: izpolnjen\./);
  assert.match(r.lead.en, /engine launch gate passes.*legal review, data licences and the SMS carrier’s approval/);
  assert.match(r.lead.sl, /pravni pregled, licence za podatke in odobritev ponudnika SMS/);
  assert.equal(r.label.en, 'Pre-launch · engine gate passed');
  for (const loc of ['en', 'sl']) assert.doesNotMatch(`${r.label[loc]} ${r.lead[loc]}`, /Launched|Zagnano|is open|je odprt/);
});

test('launchCopy: designed for every state, both locales, and no state claims a delivery', () => {
  const states = { research: launchInfo(PRE), waiting: launchInfo(WAIT), ready: launchInfo(READY), unknown: launchInfo(null) };
  for (const [name, info] of Object.entries(states)) {
    const en = launchCopy(info, 'en');
    const sl = launchCopy(info, 'sl');
    assert.equal(en.state, name);
    assert.deepEqual(Object.keys(en), Object.keys(sl), 'the same keys in both locales');
    const E = strings(en);
    const S = strings(sl);
    E.forEach(([k, v], i) => {
      assert.ok(v.trim().length > 3, `${name} ${k} is empty`);
      if (k !== 'state') assert.notEqual(v, S[i][1], `${name} ${k} is not translated`);
    });
    for (const [k, v] of [...E, ...S]) {
      assert.doesNotMatch(v, /Launch gate E|Pogoj za zagon E/, `${name} ${k}: the old gate name`);
      for (const sentence of v.split(/(?<=[.;])\s+/)) if (CLAIM.test(sentence)) assert.match(sentence, NEG, `${name} ${k} claims a delivery: ${sentence}`);
      assert.doesNotMatch(v, /\b(texts? (was|were) sent|you are subscribed|paid SMS is open)\b/i, `${name} ${k}`);
    }
    // the payment step is a labelled preview that charges nothing, in the demo and in live mode
    for (const demo of [true, false]) {
      assert.match(en.checkoutFlag(demo), /preview.*nothing is charged/);
      assert.match(sl.checkoutFlag(demo), /predogled.*nič se ne zaračuna/);
    }
    assert.match(en.checkoutFlag(true), /^Demo/);
    assert.match(en.joinDone(false), /^Nothing was charged\./);
    assert.match(en.homeTexts('12'), /none was sent/);
  }
});

test('launchCopy: ready names the engine gate and the brief’s other gates; pre-launch keeps its own story', () => {
  const r = launchCopy(launchInfo(READY), 'en');
  const rs = launchCopy(launchInfo(READY), 'sl');
  assert.equal(r.kicker, 'Engine launch gate');
  assert.equal(rs.kicker, 'Pogoj pogona za zagon');
  assert.match(r.title, /engine gate passes.*legal, data and SMS approvals/i);
  for (const g of OTHER_GATES) {
    assert.ok(r.others.includes(g.en), `ready lists ${g.id}`);
    assert.ok(rs.others.includes(g.sl), `ready lists ${g.id} (sl)`);
  }
  assert.match(r.others, /§8/);
  assert.match(r.others, /no subscribers and no text is sent/);
  for (const k of ['pricing', 'statusSms', 'methodology', 'appLabel']) assert.match(r[k], /engine (launch )?gate/i, k);
  for (const s of [r.homeTexts('9'), r.joinDone(true), r.appNote('Signal'), r.pricing, r.methodology]) assert.match(s, /legal/);
  assert.match(r.appNote('Signal'), /No subscriber exists yet/);

  const p = launchCopy(launchInfo(PRE), 'en');
  assert.equal(p.title, 'Back to research. SMS alerts do not launch.');
  assert.match(p.pricing, /back in research.*no launch date/);
  assert.match(p.statusSms, /^Not launching/);
  assert.doesNotMatch(`${p.title} ${p.pricing} ${p.methodology}`, /engine (launch )?gate (passes|has passed)/i);
  const w = launchCopy(launchInfo(WAIT), 'en');
  assert.equal(w.title, 'Pre-launch. SMS alerts stay off.');
  assert.match(w.methodology, /not met yet/);
  assert.match(w.pricing, /opens at launch/);
});

test('the pages read launch copy from launch.js, and the old gate name is gone from the site', () => {
  const root = fileURLToPath(new URL('../../web/js/', import.meta.url));
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'core' ? [] : walk(`${d}${e.name}/`)) : [`${d}${e.name}`]));
  for (const f of walk(root).filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /Launch gate E|Pogoj za zagon E/, f);
    // launch.ready is the engine gate, never a reason to say a text went out or a subscriber exists
    assert.doesNotMatch(src, /launch\.ready\s*\?/, `${f}: branch on launch.prelaunch / launchCopy, not launch.ready`);
  }
  const uses = { backtest: 'launchCopy', join: 'launchCopy', app: 'launchCopy', status: 'launchCopy', home: 'launchNote', methodology: 'launchCopy', pricing: 'launchNote' };
  for (const [page, fn] of Object.entries(uses)) assert.match(readFileSync(`${root}pages/${page}.js`, 'utf8'), new RegExp(`\\b${fn}\\(`), `${page}.js uses ${fn}`);
});

test('simulation note: meta.notes.simulation in the viewer’s language, absent when the export has none', () => {
  const meta = { notes: { simulation: { en: 'Every company is fictional.', sl: 'Vsa podjetja so izmišljena.' } } };
  assert.equal(simulationText(meta, 'en'), 'Every company is fictional.');
  assert.equal(simulationText(meta, 'sl'), 'Vsa podjetja so izmišljena.');
  assert.equal(simulationText({ notes: { simulation: { en: 'Only English.' } } }, 'sl'), 'Only English.');
  assert.equal(simulationText({ notes: {} }, 'en'), null);
  assert.equal(simulationText(null, 'en'), null);
  assert.equal(simulationText({ notes: { simulation: { en: '  ' } } }, 'en'), null);
});
