import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { openDb } from '../../server/db.js';
import { loadConfig } from '../../server/config.js';
import { createLogger, sha256 } from '../../server/util.js';
import { createExplainer, checkThesisDraft, wordingProblems, sourcesOf, errorOutcome, THESIS_SYSTEM } from '../../server/explainer.js';
import { adaptEngineDay, factorJsonOf } from '../../server/publisher.js';
import { buildEngineDay, fakeClaude } from './fixtures/engine-day.js';

// Not a model identifier: the explainer only needs a non-empty EXPLAINER_MODEL to be switched on.
const PINNED = 'pinned-model-under-test';

async function setup({ script, key = 'test-key', model = PINNED } = {}) {
  const day = await buildEngineDay();
  const input = adaptEngineDay({ issue: day.issue, picks: day.picks, persons: day.persons, news: day.news });
  const db = openDb(':memory:');
  // explanations.candidate_id references candidates: a few placeholder rows to point at.
  db.run("INSERT INTO instruments (figi, name) VALUES ('SIMTEST00000', 'Fictional test instrument')");
  for (let i = 1; i <= 8; i++) db.run("INSERT INTO candidates (date, instrument_id, families_in_top_decile, status, created_at, updated_at) VALUES ('2025-11-04', 1, '[]', 'candidate', 'x', 'x')");
  const client = fakeClaude({ picks: day.picks, script });
  const config = loadConfig({}, { anthropicApiKey: key, explainerModel: model });
  const ex = createExplainer({ config, db, log: createLogger({ quiet: true }), now: () => new Date('2025-11-04T10:30:00Z'), client });
  const c = input.candidates.find((x) => x.ticker === 'KRST');
  return { db, client, ex, input, c, factorJson: factorJsonOf(c, { date: input.date, topPct: 0.95 }) };
}

test('explainer: exactly the pinned SDK request shape; the model id comes only from configuration', async () => {
  const { client, ex, factorJson } = await setup();
  const r = await ex.draftThesis({ candidateId: 1, factorJson });
  assert.equal(r.status, 'passed');
  const p = client.calls[0].params;
  assert.deepEqual(Object.keys(p).sort(), ['betas', 'fallbacks', 'max_tokens', 'messages', 'model', 'output_config', 'system', 'thinking']);
  assert.equal(p.model, PINNED);
  assert.equal(p.max_tokens, 8000);
  assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(p.fallbacks, 'default');
  assert.deepEqual(p.thinking, { type: 'adaptive' });
  assert.equal(p.output_config.effort, 'medium');
  assert.equal(p.output_config.format.type, 'json_schema');
  assert.deepEqual(p.output_config.format.schema.required.sort(), ['en', 'sl']);
  assert.equal(p.system, THESIS_SYSTEM);
  assert.deepEqual(JSON.parse(p.messages[0].content), factorJson);
  for (const rule of ['"you"', '"should"', 'price targets', 'predictions', 'only numbers that appear in the input']) assert.ok(THESIS_SYSTEM.includes(rule), `system prompt covers ${rule}`);
});

test('explainer: pass -> both languages logged with SHA-256 of prompt and output, validator passed', async () => {
  const { db, ex, factorJson, c } = await setup();
  const r = await ex.draftThesis({ candidateId: 7, factorJson });
  assert.equal(r.status, 'passed');
  assert.equal(r.attempts, 1);
  assert.equal(r.en, c.templateThesis.en);
  const rows = db.all('SELECT * FROM explanations ORDER BY id');
  assert.deepEqual(rows.map((x) => [x.lang, x.outcome, x.validator_passed, x.drafter, x.candidate_id]), [['en', 'passed', 1, 'claude', 7], ['sl', 'passed', 1, 'claude', 7]]);
  for (const row of rows) {
    assert.equal(row.llm_model, PINNED);
    assert.equal(row.prompt_sha256, sha256(row.prompt), 'prompt hash is over the logged prompt');
    assert.equal(row.output_sha256, sha256(row.text));
    assert.ok(JSON.parse(row.prompt).system.startsWith('You draft'));
    assert.deepEqual(JSON.parse(JSON.parse(row.prompt).user), factorJson);
    assert.ok(JSON.parse(row.source_numbers_json).includes(0.97));
  }
});

test('explainer: a draft with a number not in the data fails the validator, one regeneration passes', async () => {
  const { db, client, ex, factorJson } = await setup({ script: ({ n }) => (n === 1 ? 'invented' : undefined) });
  const r = await ex.draftThesis({ candidateId: 1, factorJson });
  assert.equal(r.status, 'passed');
  assert.equal(r.attempts, 2);
  assert.equal(client.calls.length, 2);
  const rows = db.all('SELECT attempt, lang, outcome, validator_passed, error FROM explanations ORDER BY id');
  assert.deepEqual(rows.map((x) => [x.attempt, x.lang, x.outcome, x.validator_passed]), [[1, 'en', 'validator_failed', 0], [1, 'sl', 'validator_failed', 1], [2, 'en', 'passed', 1], [2, 'sl', 'passed', 1]]);
  assert.match(rows[0].error, /12\.5/);
});

test('explainer: fails twice -> handed to the approver (no third call); advice wording also fails', async () => {
  const { client, ex, factorJson } = await setup({ script: ({ n }) => (n === 1 ? 'invented' : 'you') });
  const r = await ex.draftThesis({ candidateId: 1, factorJson });
  assert.equal(r.status, 'handoff');
  assert.equal(r.attempts, 2);
  assert.equal(client.calls.length, 2);
  assert.match(r.reason, /forbidden wording/);
});

test('explainer: a refusal is checked first, logged with stop_details, and treated as a failed draft', async () => {
  const once = await setup({ script: ({ n }) => (n === 1 ? 'refusal' : undefined) });
  const r1 = await once.ex.draftThesis({ candidateId: 1, factorJson: once.factorJson });
  assert.equal(r1.status, 'passed', 'the one regeneration after a refusal');
  const refused = once.db.get("SELECT * FROM explanations WHERE outcome = 'refused'");
  assert.match(refused.error, /declined \(test\)/);
  assert.equal(refused.validator_passed, 0);
  const twice = await setup({ script: () => 'refusal' });
  const r2 = await twice.ex.draftThesis({ candidateId: 1, factorJson: twice.factorJson });
  assert.equal(r2.status, 'handoff');
  assert.equal(r2.reason, 'refused');
  const nulls = await setup({ script: () => 'null' });
  const r3 = await nulls.ex.draftThesis({ candidateId: 1, factorJson: nulls.factorJson });
  assert.equal(r3.status, 'handoff');
  assert.equal(r3.reason, 'parse_failed', 'parsed_output null');
});

test('explainer: SDK errors are caught by class; a rate limit hands off at once (the SDK already retried)', async () => {
  const limited = new Anthropic.RateLimitError(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, 'slow down', new Headers());
  const { db, client, ex, factorJson } = await setup({ script: () => limited });
  const r = await ex.draftThesis({ candidateId: 1, factorJson });
  assert.equal(r.status, 'handoff');
  assert.equal(r.reason, 'rate_limited');
  assert.equal(client.calls.length, 1);
  const row = db.get('SELECT * FROM explanations');
  assert.equal(row.outcome, 'rate_limited');
  assert.match(row.error, /RateLimitError 429/);
  assert.equal(errorOutcome(new Anthropic.APIConnectionError({ message: 'offline' })), 'connection_error');
  assert.equal(errorOutcome(new Anthropic.InternalServerError(500, {}, 'boom', new Headers())), 'server_error');
  assert.equal(errorOutcome(new Anthropic.AuthenticationError(401, {}, 'no', new Headers())), 'auth_error');
  assert.equal(errorOutcome(new Error('plain')), null, 'non-SDK errors are not swallowed');
  const bug = await setup({ script: () => new TypeError('a bug') });
  await assert.rejects(bug.ex.draftThesis({ candidateId: 1, factorJson: bug.factorJson }), TypeError);
});

test('explainer: missing ANTHROPIC_API_KEY or EXPLAINER_MODEL -> disabled, candidates go to the approver', async () => {
  for (const [key, model, missing] of [['', PINNED, 'ANTHROPIC_API_KEY'], ['k', '', 'EXPLAINER_MODEL']]) {
    const { client, ex, factorJson, db } = await setup({ key, model });
    assert.equal(ex.enabled, false);
    assert.match(ex.disabledReason, new RegExp(missing));
    const r = await ex.draftThesis({ candidateId: 1, factorJson });
    assert.equal(r.status, 'handoff');
    const v = await ex.vetoScan({ candidateId: 1, ticker: 'KRST', name: 'x', items: [{ id: '1', headline: 'Something happened (fictional)' }] });
    assert.equal(v.status, 'unavailable');
    assert.equal(client.calls.length, 0);
    assert.equal(db.get('SELECT COUNT(*) AS n FROM explanations').n, 0);
  }
});

test('explainer: the 48-hour veto scan flags or clears; no items means no call; errors mean unavailable', async () => {
  const flag = { veto: { material_negative: true, category: 'recall', item_ids: ['v1', 'zz'], reason: 'A product recall with a guidance cut.' } };
  const { db, client, ex } = await setup({ script: ({ data }) => (data.ticker === 'VLMA' ? flag : undefined) });
  const items = [{ id: 'v1', at: '2025-11-03T12:00:00Z', source: 'Simulated Wire', headline: 'Velmara Foods cuts guidance after a recall (fictional)' }];
  const v = await ex.vetoScan({ candidateId: 3, ticker: 'VLMA', name: 'Velmara Foods plc', asOf: '2025-11-04T11:30:00+01:00', items });
  assert.deepEqual([v.status, v.category, v.itemIds], ['flagged', 'recall', ['v1']], 'unknown item ids are dropped');
  const k = await ex.vetoScan({ candidateId: 2, ticker: 'KRST', name: 'Krastova Mills Corp.', items: [{ id: 'k1', headline: 'Opens a plant (fictional)' }] });
  assert.equal(k.status, 'clear');
  const none = await ex.vetoScan({ candidateId: 4, ticker: 'ORBL', name: 'x', items: [] });
  assert.equal(none.status, 'clear');
  assert.equal(client.calls.length, 2);
  assert.match(client.calls[0].params.output_config.format.schema.properties.category.description, /guidance_cut/);
  const rows = db.all("SELECT candidate_id, outcome, prompt_sha256, prompt FROM explanations WHERE purpose = 'veto_scan' ORDER BY id");
  assert.deepEqual(rows.map((r) => [r.candidate_id, r.outcome]), [[3, 'flagged'], [2, 'clear']]);
  for (const r of rows) assert.equal(r.prompt_sha256, sha256(r.prompt));
  const err = await setup({ script: () => new Anthropic.APIConnectionError({ message: 'offline' }) });
  const u = await err.ex.vetoScan({ candidateId: 1, ticker: 'KRST', name: 'x', items });
  assert.equal(u.status, 'unavailable');
});

test('numeric validator sources and the wording check', async () => {
  const { factorJson, c } = await setup();
  const s = sourcesOf(factorJson);
  assert.ok(s.numbers.includes(0.05) && s.numbers.includes(21) && s.numbers.includes(48) && s.numbers.includes(-1), 'numbers inside labels ("12-1") count as input');
  assert.ok(s.literals.includes('4 Dec 2025') && s.literals.includes('4. dec. 2025'));
  assert.equal(checkThesisDraft(c.templateThesis, factorJson).ok, true);
  const bad = checkThesisDraft({ en: `${c.templateThesis.en} It trades at 14.2 times earnings.`, sl: c.templateThesis.sl }, factorJson);
  assert.deepEqual(bad.unknown.en, ['14.2']);
  assert.deepEqual(wordingProblems('You should buy it now.', 'en'), ['forbidden wording: "You"']);
  assert.equal(wordingProblems('The ML ranker places it at the 98th percentile.', 'en').length, 0);
  assert.equal(wordingProblems('There is no price target and no stop-loss.', 'en').length, 0);
  assert.equal(wordingProblems('The stock will outperform the index.', 'en').length, 1);
  assert.equal(wordingProblems('Priporočamo nakup, vi boste zadovoljni.', 'sl').length, 1);
  assert.equal(wordingProblems('Trend uvršča delnico med zgornjih 5 %.', 'sl').length, 0);
});
