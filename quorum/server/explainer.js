// The explainer: Claude (Anthropic) through the installed @anthropic-ai/sdk, for exactly two jobs
// (brief §3.3). It never picks, ranks or alters a pick.
//   1. vetoScan(): the 48-hour negative-news veto. A flag can only remove a candidate.
//   2. draftThesis(): the EN and SL thesis from the factor JSON, checked with core/numeric-validator.js
//      (every number must be in the input) and a wording check (no advice, no "you"/"should", no
//      targets or predictions). One regeneration on failure; after that the approver writes it.
// The model id comes only from configuration (EXPLAINER_MODEL). Without ANTHROPIC_API_KEY or
// EXPLAINER_MODEL the explainer is disabled and every candidate goes to the approver to write.
// Every prompt and output is logged in `explanations` with its SHA-256.
//
//   createExplainer({ config, db, log, now, client }) -> { enabled, disabledReason, vetoScan, draftThesis }
//   `client` is injectable (tests pass a fake exposing beta.messages.parse).
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { validateNumbers, extractNumbers } from '../core/numeric-validator.js';
import { iso, sha256 } from './util.js';

export const THESIS_SYSTEM = [
  'You draft the written thesis for one pick published by Quorum, a publisher of general investment research. Everything is a simulation: the companies are fictional and the market is simulated.',
  'The pick has already been made by four statistical model families and a fixed published rule. You do not choose, rank, change, endorse or question it. You only describe the data you are given.',
  'Input: one JSON object with the factor data of the pick. Output: "en" (English) and "sl" (Slovene), each two or three short paragraphs of plain prose, no headings, no lists, no markdown.',
  'Content: which model families place the stock in their top slice and at which percentile; the driver behind each agreeing family\'s vote with its value; what the veto checks found; the exit rule (the US open on the exitPlanned date, horizonDays trading days after entry). For a RENEW, say which pick it renews.',
  'Numbers: write only numbers that appear in the input. You may write a fraction as a percentage or a percentile (0.996 as the 100th percentile, 0.1111 as 11.1%) and round to the precision you write. Do not compute differences, averages, returns, prices, probabilities, counts or years, and do not write any date that is not given in the input.',
  'No advice: never address the reader. Never write "you", "your", "should", "recommend" or "consider" (Slovene: never "vi", "vas", "vam", "vaš", "morate", "bi morali", "priporočamo"). No call to buy, sell or hold.',
  'No price targets and no predictions: never say or imply the stock will rise, gain, beat or outperform anything. No superlatives, no urgency.',
  'Slovene: standard Slovene with a decimal comma and a space before the percent sign (11,1 %).',
].join('\n');

export const VETO_SYSTEM = [
  'You screen news items for Quorum\'s pre-publication veto. Everything is a simulation: the companies are fictional and the market is simulated.',
  'Decide only one thing: do the items contain material negative news about this company from the last windowHours hours? Material means: a guidance cut or profit warning, a restatement, an auditor resignation, a regulatory investigation or enforcement action, major litigation or a product recall, a going-concern doubt, a credit downgrade or covenant breach, a senior departure for cause, or a failed or withdrawn deal.',
  'A flag only removes the candidate from today\'s issue and a named person reviews it; when an item is ambiguous but plausibly material, flag it.',
  'You never pick, rank or rate stocks, and you do not comment on whether the company is attractive. Base the answer on the items only.',
  'Output: material_negative, the category ("none" when nothing is material), the ids of the items behind the flag, and a one-sentence factual reason without advice.',
].join('\n');

export const ThesisSchema = z.object({
  en: z.string(),
  sl: z.string(),
});

export const VETO_CATEGORIES = ['none', 'guidance_cut', 'restatement', 'auditor', 'regulatory', 'litigation', 'recall', 'going_concern', 'credit', 'management', 'deal', 'other'];
// category is a plain string (listed in its description) and normalised here, so a label outside the
// list cannot make the whole answer unparseable.
export const VetoSchema = z.object({
  material_negative: z.boolean(),
  category: z.string().describe(`One of: ${VETO_CATEGORIES.join(', ')}`),
  item_ids: z.array(z.string()),
  reason: z.string(),
});

const EN_FORBIDDEN = /\b(you|your|yours|yourself|should|recommend\w*|consider|guarantee\w*|buy now|sell now|target price|price target of|will (?:rise|climb|gain|increase|outperform|beat|double))\b/i;
const SL_FORBIDDEN = /(?:^|[^\p{L}])(vi|vas|vam|vaš\p{L}*|morate|bi morali|priporočamo|priporočam|zagotovljen\p{L}*|bo zrasl\p{L}*|kupite|prodajte)(?=$|[^\p{L}])/iu;

// wordingProblems(text, locale) -> string[] (advice, "you"/"should", targets, predictions)
export function wordingProblems(text, locale) {
  const m = (locale === 'sl' ? SL_FORBIDDEN : EN_FORBIDDEN).exec(String(text));
  const out = [];
  if (m) out.push(`forbidden wording: "${m[1] ?? m[0]}"`);
  if (!String(text).trim()) out.push('empty text');
  return out;
}

// sourcesOf(factorJson) -> { numbers, literals }: every number in the input and every string (with
// its lower-cased forms, and the numbers written inside it) is an allowed source for the validator.
export function sourcesOf(value) {
  const numbers = [];
  const literals = new Set();
  const walk = (v) => {
    if (typeof v === 'number' && Number.isFinite(v)) numbers.push(v);
    else if (typeof v === 'string') {
      if (!v) return;
      literals.add(v);
      literals.add(v.charAt(0).toLowerCase() + v.slice(1));
      literals.add(v.toLowerCase());
      for (const t of extractNumbers(v)) numbers.push(t.value);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(value);
  return { numbers: [...new Set(numbers)], literals: [...literals] };
}

// checkThesisDraft({ en, sl }, factorJson) -> { ok, problems: { en: [], sl: [] }, unknown: { en, sl } }
// Used for Claude's drafts and for a thesis the approver writes by hand.
export function checkThesisDraft(draft, factorJson) {
  const { numbers, literals } = sourcesOf(factorJson);
  const out = { ok: true, problems: {}, unknown: {} };
  for (const locale of ['en', 'sl']) {
    const text = draft?.[locale] ?? '';
    const v = validateNumbers(text, numbers, { locale, allowStrings: literals });
    const words = wordingProblems(text, locale);
    out.unknown[locale] = v.unknown;
    out.problems[locale] = [...(v.ok ? [] : [`numbers not in the input: ${v.unknown.join(', ')}`]), ...words];
    if (out.problems[locale].length) out.ok = false;
  }
  return out;
}

// errorOutcome(e) -> outcome code, from the SDK's typed errors (never from message strings).
export function errorOutcome(e) {
  if (e instanceof Anthropic.RateLimitError) return 'rate_limited';
  if (e instanceof Anthropic.APIConnectionError) return 'connection_error';
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return 'auth_error';
  if (e instanceof Anthropic.BadRequestError) return 'bad_request';
  if (e instanceof Anthropic.InternalServerError) return 'server_error';
  if (e instanceof Anthropic.APIError) return 'api_error';
  return null;
}

const rawText = (msg) =>
  (msg?.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

export function createExplainer({ config, db, log = console, now = () => new Date(), client = null } = {}) {
  const missing = [];
  if (!config.anthropicApiKey) missing.push('ANTHROPIC_API_KEY');
  if (!config.explainerModel) missing.push('EXPLAINER_MODEL');
  const enabled = missing.length === 0;
  const disabledReason = enabled ? null : `explainer off: ${missing.join(' and ')} not set`;
  let sdk = client;
  const getClient = () => (sdk ??= new Anthropic({ apiKey: config.anthropicApiKey }));

  function logRow({ candidateId, purpose, attempt, lang = 'en', text = '', prompt, output = '', outcome, validatorPassed = false, sources = null, error = null }) {
    return db.run(
      `INSERT INTO explanations (lang, text, source_numbers_json, validator_passed, llm_model, prompt_sha256, output_sha256, created_at,
         candidate_id, purpose, attempt, outcome, drafter, prompt, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'claude', ?, ?)`,
      lang,
      text,
      sources ? JSON.stringify(sources) : null,
      validatorPassed ? 1 : 0,
      config.explainerModel || null,
      sha256(prompt),
      sha256(output),
      iso(now()),
      candidateId ?? null,
      purpose,
      attempt,
      outcome,
      prompt,
      error ? String(error).slice(0, 2000) : null,
    ).lastInsertRowid;
  }

  // call(system, schema, input) -> { outcome, parsed, output, error, stopDetails }
  async function call(system, schema, input) {
    const content = JSON.stringify(input);
    const prompt = JSON.stringify({ system, user: content });
    try {
      const msg = await getClient().beta.messages.parse({
        model: config.explainerModel,
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium', format: betaZodOutputFormat(schema) },
        system,
        messages: [{ role: 'user', content }],
      });
      // A refusal is checked before anything else is read.
      if (msg.stop_reason === 'refusal') {
        const details = JSON.stringify(msg.stop_details ?? null);
        log.warn(`[explainer] refusal: ${details}`);
        return { prompt, outcome: 'refused', parsed: null, output: rawText(msg), error: details };
      }
      if (msg.parsed_output == null) return { prompt, outcome: 'parse_failed', parsed: null, output: rawText(msg), error: `stop_reason ${msg.stop_reason}` };
      return { prompt, outcome: 'ok', parsed: msg.parsed_output, output: rawText(msg) || JSON.stringify(msg.parsed_output), error: null };
    } catch (e) {
      const outcome = errorOutcome(e);
      if (!outcome) throw e;
      log.warn(`[explainer] ${outcome}: ${e.status ?? ''} ${e.message}`);
      return { prompt, outcome, parsed: null, output: '', error: `${e.constructor.name}${e.status ? ` ${e.status}` : ''}: ${e.message}` };
    }
  }

  // draftThesis({ candidateId, factorJson }) ->
  //   { status: 'passed', en, sl, explanationIds: {en, sl}, attempts }
  //   { status: 'handoff', reason, attempts }       (the approver writes it)
  async function draftThesis({ candidateId = null, factorJson }) {
    if (!enabled) return { status: 'handoff', reason: disabledReason, attempts: 0 };
    const sources = sourcesOf(factorJson);
    let lastReason = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const r = await call(THESIS_SYSTEM, ThesisSchema, factorJson);
      if (r.outcome !== 'ok') {
        logRow({ candidateId, purpose: 'thesis', attempt, text: r.output ?? '', prompt: r.prompt, output: r.output, outcome: r.outcome, error: r.error });
        lastReason = r.outcome;
        // API errors were already retried by the SDK; a second call now would meet the same limit.
        if (r.outcome !== 'refused' && r.outcome !== 'parse_failed') return { status: 'handoff', reason: r.outcome, attempts: attempt };
        continue;
      }
      const check = checkThesisDraft(r.parsed, factorJson);
      const ids = {};
      for (const lang of ['en', 'sl']) {
        const passed = check.problems[lang].length === 0;
        ids[lang] = logRow({
          candidateId,
          purpose: 'thesis',
          attempt,
          lang,
          text: r.parsed[lang],
          prompt: r.prompt,
          output: r.parsed[lang],
          outcome: check.ok ? 'passed' : 'validator_failed',
          validatorPassed: passed,
          sources: sources.numbers,
          error: passed ? null : check.problems[lang].join('; '),
        });
      }
      if (check.ok) return { status: 'passed', en: r.parsed.en, sl: r.parsed.sl, explanationIds: ids, attempts: attempt };
      lastReason = `validator: ${[...check.problems.en, ...check.problems.sl].join('; ')}`;
    }
    return { status: 'handoff', reason: lastReason, attempts: 2 };
  }

  // vetoScan({ candidateId, ticker, name, sector, asOf, windowHours, items }) ->
  //   { status: 'clear' | 'flagged' | 'unavailable', category, reason, itemIds, explanationId }
  async function vetoScan({ candidateId = null, ticker, name, sector = null, asOf, windowHours = 48, items = [] }) {
    if (!items.length) return { status: 'clear', category: 'none', reason: `no news items in the last ${windowHours} hours`, itemIds: [], explanationId: null };
    if (!enabled) return { status: 'unavailable', category: null, reason: disabledReason, itemIds: [], explanationId: null };
    const input = { ticker, name, sector, asOf, windowHours, items: items.map((x, i) => ({ id: String(x.id ?? i + 1), at: x.at ?? null, source: x.source ?? null, headline: x.headline, summary: x.summary ?? null })) };
    const r = await call(VETO_SYSTEM, VetoSchema, input);
    if (r.outcome !== 'ok') {
      const id = logRow({ candidateId, purpose: 'veto_scan', attempt: 1, text: r.output ?? '', prompt: r.prompt, output: r.output, outcome: r.outcome, error: r.error });
      return { status: 'unavailable', category: null, reason: r.outcome, itemIds: [], explanationId: id };
    }
    const flagged = r.parsed.material_negative === true;
    const known = new Set(input.items.map((x) => x.id));
    const itemIds = (r.parsed.item_ids ?? []).filter((x) => known.has(x));
    const id = logRow({ candidateId, purpose: 'veto_scan', attempt: 1, text: JSON.stringify(r.parsed), prompt: r.prompt, output: r.output, outcome: flagged ? 'flagged' : 'clear', validatorPassed: true });
    const category = VETO_CATEGORIES.includes(r.parsed.category) ? r.parsed.category : flagged ? 'other' : 'none';
    return { status: flagged ? 'flagged' : 'clear', category, reason: r.parsed.reason, itemIds, explanationId: id };
  }

  return { enabled, disabledReason, draftThesis, vetoScan, model: enabled ? config.explainerModel : null };
}
