// The daily pipeline of brief §4.3, driven by the engine's output for one US trading day.
//
//   06:00        writeCandidates(input)     candidates written (access-controlled; every read is logged)
//   11:30        explain(date)              Claude: 48-hour news veto scan, EN/SL thesis drafts
//   12:00-13:40  veto / reviewNews / writeThesis / signOff (server/admin.js)   the named approver, removal only
//   13:40        closeReview(date)          no approver or deputy -> "no_approver"; news not cleared and not
//                                           reviewed -> removed; no validated thesis -> removed
//
// The 48-hour news veto fails closed. A candidate goes through untouched only when the scan came
// back 'clear' (no items, or the model found nothing and the keyword floor did not fire). When the
// scan could not run ('unavailable', 'pending') or was not conclusive ('needs_review'), the named
// approver must read the items in the console and record "news reviewed, nothing material"
// (reviewNews, logged with the person); otherwise the candidate is removed at 13:40 with the code
// 'news_unreviewed'. The ISSUE entry counts the scan outcomes (newsScan).
//   13:45        seal(date)                 BUY/RENEW ledger entries: canonical JSON, SHA-256, prevHash,
//                                           producedAt; each carries the commit of a salted reveal
//   14:00:00     publish(date)              ISSUE entry, recommendations (disseminated_at, dissemination
//                                           price with source and time), notifications enqueued
//   US open +1m  recordOpens(date, prices)  entry opens; exits: CLOSE entries reveal the sealed pick
//   23:59 UTC    anchor(date)               Merkle root of the day's entries -> OpenTimestamps + RFC 3161
//
// An issue is published every US trading day, with or without a pick. Ledger order within a date
// follows engine/record.js: BUY/RENEW at the seal, ISSUE at 14:00, CLOSE after the US open (the
// CLOSE entry carries the exit price, which exists only then; the close decision itself is in the
// ISSUE entry's `closes`).
//
// adaptEngineDay({ issue, picks, candidates?, persons, news, modelVersion, topPct }) turns what the
// engine's record builder produces for one day (engine/record.js buildRecord: an issues row and the
// enriched picks; optionally runQuorum's candidate list) into the publisher's input.
import { createEntry, commitment, verifyReveal, verifyChain } from '../core/ledger.js';
import { canonicalize } from '../core/canonical-json.js';
import { issueSlot, isTradingDay, formatInZone, zonedToInstant, fmtLong, LJUBLJANA } from '../core/calendar.js';
import { randomToken } from '../core/hash.js';
import { checkThesisDraft, newsRedFlags, floorNote } from './explainer.js';
import { iso, sha256 } from './util.js';

export const HORIZON = 21;
// veto_scan values that need the approver's own reading of the news before the candidate may issue
export const NEWS_REVIEW_NEEDED = ['pending', 'unavailable', 'needs_review'];
export const PIPELINE_TIMES = { candidates: '06:00', explain: '11:30', reviewOpens: '12:00', reviewCloses: '13:40', seal: '13:45', publish: '14:00' };
const STAGES = ['candidates', 'explained', 'reviewed', 'sealed', 'published', 'marked', 'anchored'];
const FAMILY_NAME = { A: { en: 'trend', sl: 'trend' }, B: { en: 'fundamental momentum', sl: 'fundamentalni momentum' }, C: { en: 'quality/value', sl: 'kakovost/vrednost' }, D: { en: 'ML ranker', sl: 'rangirnik ML' } };

export class PipelineError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PipelineError';
    this.code = code;
  }
}

export const pipelineInstant = (date, time) => zonedToInstant(date, time, LJUBLJANA);
const localIso = (d) => formatInZone(d, LJUBLJANA).iso;
const padNo = (n) => String(n).padStart(4, '0');
const round = (x, d = 6) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const parse = (s, fallback = null) => {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
};

// ------------------------------------------------------------------ the engine adapter
// Engine candidate statuses -> server statuses. The engine's own approver decisions (vetoed_human,
// unissued_no_approver) are not carried over: on the server the named approver decides.
const ENGINE_STATUS = {
  issued: 'candidate',
  vetoed_human: 'candidate',
  unissued_no_approver: 'candidate',
  vetoed_rule: 'vetoed_rule',
  vetoed_llm: 'vetoed_llm',
  capped_issue: 'capped',
  capped_month: 'capped',
  capped_sector: 'capped',
  capped_sms: 'capped',
  cooldown: 'capped',
};

function closeItemOf(p, date, byNo) {
  const priorReveals = [];
  let q = p.priorNo ? byNo.get(p.priorNo) : null;
  while (q) {
    if (q.reveal) priorReveals.unshift(q.reveal);
    q = q.priorNo ? byNo.get(q.priorNo) : null;
  }
  return {
    no: p.no,
    kind: p.kind,
    ticker: p.ticker,
    name: p.name,
    figi: p.figi,
    isin: p.isin ?? null,
    sector: p.sector ?? null,
    venue: p.venue ?? null,
    issueDate: p.issueDate,
    reveal: p.reveal ?? null,
    priorReveals,
    entry: p.entry ? { date: p.entry.date, open: p.entry.open } : null,
    dissemination: p.dissemination ?? null,
    exitDate: date,
  };
}

export function adaptEngineDay({ issue, picks = [], candidates = null, persons = [], news = {}, modelVersion = null, topPct = 0.95 }) {
  if (!issue?.date) throw new PipelineError('bad_input', 'adaptEngineDay: issue.date is required');
  const date = issue.date;
  const byNo = new Map(picks.map((p) => [p.no, p]));
  const out = {
    date,
    simulated: true,
    source: 'engine',
    nScored: issue.nScored ?? 0,
    closest: issue.closest ?? 0,
    crashSwitch: Boolean(issue.crashSwitch),
    methodology: issue.methodology ?? null,
    modelVersion: modelVersion ?? picks.find((p) => p.modelVersion)?.modelVersion ?? null,
    topPct,
    vetoes: { rule: issue.vetoes?.rule ?? 0, llm: issue.vetoes?.llm ?? 0, capped: issue.vetoes?.capped ?? 0 },
    persons: persons.map((p) => ({ id: p.id, name: p.name, title: p.title ?? null, role: p.role, fictional: p.fictional !== false })),
    candidates: [],
    closes: [],
    marketData: { entryOpen: {}, exits: {} },
  };
  const asCandidate = (p, kind) => ({
    key: `${kind}:${p.figi}`,
    kind,
    priorNo: kind === 'RENEW' ? p.priorNo ?? null : null,
    status: 'candidate',
    vetoes: [],
    ticker: p.ticker,
    name: p.name,
    figi: p.figi,
    isin: p.isin ?? null,
    sector: p.sector ?? null,
    sectorSl: p.sectorSl ?? null,
    venue: p.venue ?? null,
    agreement: p.agreement,
    agreeing: p.agreeing,
    combined: p.combined ?? null,
    crashSwitch: Boolean(p.crashSwitch),
    families: p.families ?? {},
    sensitivity: p.sensitivity ?? null,
    vetoChecks: p.vetoChecks ?? [],
    exitPlanned: p.exitPlanned,
    entryDate: date,
    dissemination: p.dissemination ?? null,
    insider: p.insider ?? null,
    news: news[p.ticker] ?? news[p.figi] ?? [],
    templateThesis: p.thesis ?? null,
    prior: kind === 'RENEW' && p.priorNo && byNo.has(p.priorNo) ? closeItemOf(byNo.get(p.priorNo), date, byNo) : null,
  });
  for (const no of issue.renews ?? []) if (byNo.has(no)) out.candidates.push(asCandidate(byNo.get(no), 'RENEW'));
  for (const no of issue.buys ?? []) if (byNo.has(no)) out.candidates.push(asCandidate(byNo.get(no), 'BUY'));
  const issued = new Set(out.candidates.map((c) => c.ticker));
  for (const c of candidates ?? []) {
    const status = ENGINE_STATUS[c.status];
    if (!status || status === 'candidate' || issued.has(c.ticker)) continue; // issued ones came from picks; already_open is not a candidate
    out.candidates.push({ key: `BUY:${c.ticker}`, kind: 'BUY', status, vetoes: c.vetoes ?? [], ticker: c.ticker, agreement: c.agreement, agreeing: c.agreeing, combined: c.combined ?? null, engineStatus: c.status });
  }
  for (const no of issue.closes ?? []) if (byNo.has(no)) out.closes.push(closeItemOf(byNo.get(no), date, byNo));
  // Market data the 15:30 step would receive from the price feed (a replay already knows it).
  for (const c of out.candidates) {
    const p = picks.find((x) => x.figi === c.figi && x.issueDate === date);
    if (p?.entry?.open != null) out.marketData.entryOpen[c.figi] = p.entry.open;
    if (c.prior) {
      const q = byNo.get(c.prior.no);
      if (q?.exit?.date === date) out.marketData.exits[q.no] = exitData(q);
    }
  }
  for (const x of out.closes) {
    const q = byNo.get(x.no);
    if (q?.exit?.date === date) out.marketData.exits[q.no] = exitData(q);
  }
  return out;
}

function exitData(p) {
  const o = p.outcome ?? {};
  return { open: p.exit.open, bench: o.bench ?? null, net: o.net ?? null, gross: o.gross ?? null, excess: o.excess ?? null, d5: o.d5 ?? null, d63: o.d63 ?? null, source: 'SIM open' };
}

// factorJsonOf(candidate, { date, topPct }) -> the JSON the explainer drafts from (numbers only
// from the engine's data; texts it may copy, such as the exit date written out, are included).
export function factorJsonOf(c, { date, topPct = 0.95, vetoScan = null } = {}) {
  const families = {};
  for (const f of ['A', 'B', 'C', 'D']) {
    const x = c.families?.[f];
    if (!x) continue;
    families[f] = {
      name: FAMILY_NAME[f],
      pct: x.pct ?? null,
      votes: (c.agreeing ?? []).includes(f),
      drivers: (x.drivers ?? []).map((d) => ({ key: d.key, label: d.label, value: d.value, unit: d.unit ?? 'z', raw: d.raw ?? null, context: d.context ?? false })),
    };
  }
  const checks = (c.vetoChecks ?? []).map((v) => (v.key === 'llm_48h' ? newsCheck(v, vetoScan) : { ...v }));
  const earnings = checks.find((v) => v.key === 'earnings_within_3d' && v.next);
  return {
    simulated: true,
    fictionalCompany: true,
    kind: c.kind,
    priorNo: c.priorNo ?? null,
    ticker: c.ticker,
    name: c.name,
    sector: { en: c.sector ?? null, sl: c.sectorSl ?? null },
    issueDate: date,
    agreement: c.agreement,
    familyCount: 4,
    agreeing: c.agreeing,
    crashSwitch: Boolean(c.crashSwitch),
    topShare: round(1 - topPct, 4),
    families,
    vetoChecks: checks,
    earningsWindowDays: 3,
    newsWindowHours: 48,
    nextEarningsText: earnings ? { en: fmtLong(earnings.next, 'en'), sl: fmtLong(earnings.next, 'sl') } : null,
    horizonDays: HORIZON,
    exitPlanned: c.exitPlanned,
    exitPlannedText: { en: fmtLong(c.exitPlanned, 'en'), sl: fmtLong(c.exitPlanned, 'sl') },
  };
}

// newsCheck(engineCheck, vetoScan) -> the llm_48h entry of the factor JSON. Only a scan that cleared
// passes; a scan that did not run or was not conclusive passes nothing (pass: null), and its note
// says what a published pick then rests on: the approver's own reading of the news.
export function newsCheck(v, vetoScan) {
  switch (vetoScan) {
    case null:
    case undefined:
      return { key: 'llm_48h', pass: v.pass ?? null, note: v.note ?? null };
    case 'clear':
      return { key: 'llm_48h', pass: true, note: 'Claude news scan' };
    case 'flagged':
      return { key: 'llm_48h', pass: false, note: 'Claude news scan' };
    case 'reviewed':
      return { key: 'llm_48h', pass: true, note: 'the automated scan did not clear it; the approver read the news: nothing material' };
    case 'needs_review':
      return { key: 'llm_48h', pass: null, note: 'the automated scan did not clear it; the approver reads the news before sign-off' };
    default:
      return { key: 'llm_48h', pass: null, note: 'the automated scan did not run; the approver reads the news before sign-off' };
  }
}

// ------------------------------------------------------------------ the publisher
export function createPublisher(ctx, { explainer = null, anchorer = null, notifier = null } = {}) {
  const { db } = ctx;
  let chain = Promise.resolve(); // ledger appends are serialised (seq and prevHash come from the last row)
  const serial = (fn) => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };

  // ---------------------------------------------------------------- helpers
  function run(date) {
    return db.get('SELECT * FROM issue_runs WHERE issue_date = ?', date);
  }
  function stageAtLeast(r, stage) {
    return r && STAGES.indexOf(r.stage) >= STAGES.indexOf(stage);
  }
  function setRun(date, fields) {
    const keys = Object.keys(fields);
    db.run(`UPDATE issue_runs SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE issue_date = ?`, ...Object.values(fields), iso(ctx.now()), date);
  }
  function logAccess(actor, action, objectType, objectId, ip = null) {
    db.run('INSERT INTO access_log (actor, action, object_type, object_id, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)', actor, action, objectType, objectId, ip, iso(ctx.now()));
  }
  function lastEntry() {
    const r = db.get('SELECT * FROM ledger_entries ORDER BY seq DESC LIMIT 1');
    return r ? rowToEntry(r) : null;
  }
  async function appendEntry(type, issueDate, at, body) {
    return serial(async () => {
      const entry = await createEntry(lastEntry(), { type, issueDate, at, body });
      db.run(
        'INSERT INTO ledger_entries (seq, type, issue_date, at, body_json, prev_hash, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        entry.seq,
        entry.type,
        entry.issueDate,
        entry.at,
        JSON.stringify(entry.body),
        entry.prevHash,
        entry.hash,
        iso(ctx.now()),
      );
      return entry;
    });
  }
  function nextNo() {
    const r = db.get("SELECT body_json FROM ledger_entries WHERE type IN ('BUY', 'RENEW') ORDER BY seq DESC LIMIT 1");
    const last = r ? Number(parse(r.body_json)?.no ?? 0) : 0;
    const reserved = db.get('SELECT MAX(CAST(no AS INTEGER)) AS n FROM pick_reveals')?.n ?? 0;
    return padNo(Math.max(last, reserved) + 1);
  }
  function nextIssueNo() {
    const r = db.get("SELECT body_json FROM ledger_entries WHERE type = 'ISSUE' ORDER BY seq DESC LIMIT 1");
    const fromLedger = r ? Number(parse(r.body_json)?.issueNo ?? 0) : 0;
    const fromIssues = db.get('SELECT MAX(issue_no) AS n FROM issues')?.n ?? 0;
    return Math.max(fromLedger, fromIssues) + 1;
  }
  function commitOf(no) {
    const r = db.get('SELECT commit_hash FROM pick_reveals WHERE no = ?', no);
    if (r) return r.commit_hash;
    for (const e of db.all("SELECT body_json FROM ledger_entries WHERE type IN ('BUY', 'RENEW') ORDER BY seq DESC")) {
      const b = parse(e.body_json);
      if (b?.no === no) return b.commit;
    }
    return null;
  }

  // persons (fictional in this simulation; flagged in the table)
  function ensurePersons(persons = []) {
    for (const p of persons) {
      if (!p?.id) continue;
      const title = typeof p.title === 'object' ? p.title?.en ?? null : p.title ?? null;
      db.run(
        `INSERT INTO persons (public_id, full_name, job_title, role, fictional, active_from) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(public_id) DO UPDATE SET full_name = excluded.full_name, job_title = excluded.job_title, role = excluded.role, fictional = excluded.fictional`,
        p.id,
        p.name,
        title,
        p.role,
        p.fictional === false ? 0 : 1,
        p.activeFrom ?? null,
      );
    }
  }
  function person(publicId) {
    return publicId ? db.get('SELECT * FROM persons WHERE public_id = ?', publicId) : null;
  }
  function approverPerson(publicId, date) {
    const p = person(publicId);
    if (!p || !['approver', 'deputy_approver'].includes(p.role)) throw new PipelineError('not_an_approver', 'Only the named approver or the deputy can do this.');
    if ((p.active_from && p.active_from > date) || (p.active_to && p.active_to < date)) throw new PipelineError('not_active', 'This person is not an active approver on this date.');
    return p;
  }
  function signedOff(date) {
    return db.get('SELECT s.*, p.public_id, p.full_name, p.job_title FROM approver_signoffs s JOIN persons p ON p.id = s.person_id WHERE s.issue_date = ? ORDER BY s.id LIMIT 1', date);
  }
  function upsertInstrument(c) {
    if (!c.figi) return null;
    db.run(
      `INSERT INTO instruments (figi, isin, name, sector, venue, simulated) VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(figi) DO UPDATE SET isin = COALESCE(excluded.isin, isin), name = COALESCE(excluded.name, name), sector = COALESCE(excluded.sector, sector), venue = COALESCE(excluded.venue, venue)`,
      c.figi,
      c.isin ?? null,
      c.name ?? null,
      c.sector ?? null,
      c.venue ?? null,
    );
    const id = db.get('SELECT id FROM instruments WHERE figi = ?', c.figi).id;
    if (c.ticker && !db.get('SELECT 1 AS x FROM ticker_history WHERE instrument_id = ? AND ticker = ? AND valid_to IS NULL', id, c.ticker)) {
      db.run('INSERT INTO ticker_history (instrument_id, ticker, valid_from) VALUES (?, ?, ?)', id, c.ticker, c.entryDate ?? c.issueDate ?? '2000-01-01');
    }
    return id;
  }
  function methodologyId(version) {
    if (!version) return null;
    db.run('INSERT INTO methodology_versions (version, effective, created_at) VALUES (?, ?, ?) ON CONFLICT(version) DO NOTHING', version, iso(ctx.now()).slice(0, 10), iso(ctx.now()));
    return db.get('SELECT id FROM methodology_versions WHERE version = ?', version).id;
  }

  // ---------------------------------------------------------------- 06:00 candidates
  // writeCandidates(input, { actor, replace }) -> { date, written, statuses }
  function writeCandidates(input, { actor = 'system:engine' } = {}) {
    const date = input?.date;
    if (!date || !isTradingDay(date)) throw new PipelineError('not_a_trading_day', `${date} is not a US trading day`);
    const existing = run(date);
    if (existing) {
      if (stageAtLeast(existing, 'sealed')) throw new PipelineError('already_sealed', `The ${date} issue is already sealed`);
      return { date, written: 0, existing: true, statuses: statusCounts(date) };
    }
    const now = iso(ctx.now());
    db.tx(() => {
      ensurePersons(input.persons);
      const { candidates = [], ...meta } = input;
      db.run('INSERT INTO issue_runs (issue_date, input_json, stage, candidates_at, updated_at) VALUES (?, ?, ?, ?, ?)', date, JSON.stringify(meta), 'candidates', now, now);
      for (const c of candidates) {
        const instrumentId = c.figi ? upsertInstrument({ ...c, entryDate: date }) : null;
        const open = c.status === 'candidate';
        db.run(
          `INSERT INTO candidates (date, instrument_id, families_in_top_decile, combined_score, status, created_at, updated_at, kind, prior_no, payload_json, thesis_status, veto_scan, status_reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          date,
          instrumentId ?? upsertPlaceholder(c.ticker),
          JSON.stringify(c.agreeing ?? []),
          c.combined ?? null,
          c.status,
          now,
          now,
          c.kind ?? 'BUY',
          c.priorNo ?? null,
          JSON.stringify(c),
          open ? 'pending' : null,
          open ? 'pending' : c.status === 'vetoed_llm' ? 'stand_in' : null,
          open ? null : c.engineStatus ?? c.status,
        );
      }
      logAccess(actor, 'write', 'candidates', date);
    });
    return { date, written: (input.candidates ?? []).length, existing: false, statuses: statusCounts(date) };
  }
  function upsertPlaceholder(ticker) {
    // a candidate the engine vetoed or capped, known to us only by ticker
    const figi = `TICKER:${ticker}`;
    db.run('INSERT INTO instruments (figi, name, simulated) VALUES (?, ?, 1) ON CONFLICT(figi) DO NOTHING', figi, ticker);
    return db.get('SELECT id FROM instruments WHERE figi = ?', figi).id;
  }
  function statusCounts(date) {
    const out = {};
    for (const r of db.all('SELECT status, COUNT(*) AS n FROM candidates WHERE date = ? GROUP BY status', date)) out[r.status] = r.n;
    return out;
  }

  // readCandidates(date, { actor, purpose, ip }) -> candidates with their payload. Every read of
  // pre-release candidates is logged (CJEU C-302/20; brief §2.9).
  function readCandidates(date, { actor, purpose = 'read', ip = null } = {}) {
    if (!actor) throw new PipelineError('actor_required', 'readCandidates needs an actor for the access log');
    logAccess(actor, purpose, 'candidates', date, ip);
    return db.all('SELECT * FROM candidates WHERE date = ? ORDER BY id', date).map((r) => ({ ...r, payload: parse(r.payload_json, {}) }));
  }

  function thesisOf(candidateId) {
    const rows = db.all(
      "SELECT * FROM explanations WHERE candidate_id = ? AND purpose = 'thesis' AND validator_passed = 1 AND outcome IN ('passed', 'approver') ORDER BY id DESC",
      candidateId,
    );
    const en = rows.find((r) => r.lang === 'en');
    const sl = rows.find((r) => r.lang === 'sl');
    if (!en || !sl) return null;
    return { en: en.text, sl: sl.text, enId: en.id, slId: sl.id, drafter: en.drafter ?? 'claude' };
  }

  // ---------------------------------------------------------------- 11:30 explainer
  async function explain(date) {
    const r = run(date);
    if (!r) throw new PipelineError('no_candidates', `No candidates for ${date}`);
    if (stageAtLeast(r, 'explained')) return { date, skipped: 'already_explained' };
    const input = parse(r.input_json, {});
    const out = { date, scanned: 0, flagged: 0, needsReview: 0, drafted: 0, handoff: 0, disabled: !explainer?.enabled, reason: explainer?.disabledReason ?? null };
    for (const c of readCandidates(date, { actor: 'system:explainer', purpose: 'explain' })) {
      if (c.status !== 'candidate') continue;
      const p = c.payload;
      const items = p.news ?? [];
      const s = explainer
        ? await explainer.vetoScan({ candidateId: c.id, ticker: p.ticker, name: p.name, sector: p.sector, asOf: localIso(ctx.now()), windowHours: 48, items })
        : items.length
          ? { status: 'unavailable', category: null, reason: 'explainer not configured', itemIds: [], explanationId: null, redFlags: newsRedFlags(items), unscanned: items.length }
          : { status: 'clear', category: 'none', reason: 'no news items in the last 48 hours', itemIds: [], explanationId: null, redFlags: [], unscanned: 0 };
      if (explainer) out.scanned++;
      const scan = s.status;
      const detail = JSON.stringify({ status: s.status, category: s.category ?? null, reason: s.reason ?? null, itemIds: s.itemIds ?? [], explanationId: s.explanationId ?? null, redFlags: s.redFlags ?? [], unscanned: s.unscanned ?? 0 });
      if (scan === 'flagged') {
        out.flagged++;
        db.tx(() => {
          db.run("UPDATE candidates SET status = 'vetoed_llm', veto_scan = 'flagged', veto_scan_detail = ?, thesis_status = NULL, status_reason = ?, updated_at = ? WHERE id = ?", detail, `llm_48h: ${s.category}: ${s.reason}`, iso(ctx.now()), c.id);
          db.run("INSERT INTO vetoes (candidate_id, type, detail, created_at) VALUES (?, 'llm_48h', ?, ?)", c.id, JSON.stringify({ category: s.category, reason: s.reason, items: s.itemIds, explanationId: s.explanationId }), iso(ctx.now()));
        });
        continue;
      }
      if (c.veto_scan === 'reviewed') {
        // The approver already read this candidate's news (before the scan ran): the review stands,
        // and the scan's answer is kept beside it (a flag, above, still removes the candidate).
        const prev = parse(c.veto_scan_detail, {});
        db.run('UPDATE candidates SET veto_scan_detail = ?, updated_at = ? WHERE id = ?', JSON.stringify({ ...JSON.parse(detail), review: prev.review ?? null }), iso(ctx.now()), c.id);
      } else {
        if (NEWS_REVIEW_NEEDED.includes(scan)) out.needsReview++;
        db.run('UPDATE candidates SET veto_scan = ?, veto_scan_detail = ?, updated_at = ? WHERE id = ?', scan, detail, iso(ctx.now()), c.id);
      }
      const draftScan = c.veto_scan === 'reviewed' ? 'reviewed' : scan;
      const d = explainer
        ? await explainer.draftThesis({ candidateId: c.id, factorJson: factorJsonOf(p, { date, topPct: input.topPct, vetoScan: draftScan }) })
        : { status: 'handoff', reason: 'explainer not configured' };
      if (d.status === 'passed') out.drafted++;
      else out.handoff++;
      db.run('UPDATE candidates SET thesis_status = ?, status_reason = ?, updated_at = ? WHERE id = ?', d.status === 'passed' ? 'drafted' : 'handoff', d.status === 'passed' ? null : `thesis: ${d.reason}`, iso(ctx.now()), c.id);
    }
    setRun(date, { stage: 'explained', explained_at: iso(ctx.now()) });
    return out;
  }

  // ---------------------------------------------------------------- 12:00-13:40 the approver
  function reviewOpen(date) {
    const r = run(date);
    if (!r) throw new PipelineError('no_candidates', `No candidates for ${date}`);
    if (stageAtLeast(r, 'reviewed')) throw new PipelineError('review_closed', `The ${date} review closed at 13:40`);
    if (ctx.now() >= pipelineInstant(date, PIPELINE_TIMES.reviewCloses)) throw new PipelineError('review_closed', `The ${date} review closed at 13:40`);
    return r;
  }
  function candidateFor(date, candidateId) {
    const c = db.get('SELECT * FROM candidates WHERE id = ? AND date = ?', Number(candidateId), date);
    if (!c) throw new PipelineError('not_found', 'No such candidate for this issue');
    return c;
  }

  // veto(date, candidateId, { personId, reason, reasonSl, ip }): removal only. There is no add and
  // no substitute; vetoes are counted in the ISSUE ledger entry.
  function veto(date, candidateId, { personId, reason, reasonSl = null, ip = null } = {}) {
    reviewOpen(date);
    const p = approverPerson(personId, date);
    const text = String(reason ?? '').trim();
    if (text.length < 10) throw new PipelineError('reason_required', 'A veto needs a written reason (at least 10 characters).');
    const c = candidateFor(date, candidateId);
    if (c.status !== 'candidate') throw new PipelineError('not_open', `This candidate is already ${c.status}`);
    db.tx(() => {
      db.run("UPDATE candidates SET status = 'vetoed_human', status_reason = ?, updated_at = ? WHERE id = ?", text.slice(0, 1000), iso(ctx.now()), c.id);
      db.run("INSERT INTO vetoes (candidate_id, type, detail, person_id, created_at) VALUES (?, 'human', ?, ?, ?)", c.id, JSON.stringify({ en: text.slice(0, 1000), sl: reasonSl ? String(reasonSl).slice(0, 1000) : null, code: 'approver' }), p.id, iso(ctx.now()));
      logAccess(`person:${p.public_id}`, 'veto', 'candidate', String(c.id), ip);
    });
    return { ok: true, candidateId: c.id, status: 'vetoed_human', by: p.public_id };
  }

  // reviewNews(date, candidateId, { personId, note, ip }): the approver has read the candidate's
  // 48-hour news (shown in the console) because the automated scan did not clear it, and records that
  // nothing is material. Logged with the person; without it the candidate is removed at 13:40.
  // (Material news is a veto: veto() with the reason.)
  function reviewNews(date, candidateId, { personId, note = null, ip = null } = {}) {
    reviewOpen(date);
    const p = approverPerson(personId, date);
    const c = candidateFor(date, candidateId);
    if (c.status !== 'candidate') throw new PipelineError('not_open', `This candidate is already ${c.status}`);
    if (!NEWS_REVIEW_NEEDED.includes(c.veto_scan)) throw new PipelineError('review_not_needed', `The news scan of this candidate is ${c.veto_scan}: no news review to record`);
    const now = iso(ctx.now());
    const detail = { ...parse(c.veto_scan_detail, {}), review: { by: p.public_id, at: now, note: note ? String(note).slice(0, 1000) : null, before: c.veto_scan } };
    db.tx(() => {
      db.run("UPDATE candidates SET veto_scan = 'reviewed', veto_scan_detail = ?, news_reviewed_by = ?, news_reviewed_at = ?, updated_at = ? WHERE id = ?", JSON.stringify(detail), p.id, now, now, c.id);
      logAccess(`person:${p.public_id}`, 'news_reviewed', 'candidate', String(c.id), ip);
    });
    return { ok: true, candidateId: c.id, vetoScan: 'reviewed', by: p.public_id };
  }

  // writeThesis(date, candidateId, { personId, en, sl }): the approver writes (or replaces) the thesis
  // of a candidate; the same numeric validator and wording check apply.
  function writeThesis(date, candidateId, { personId, en, sl, ip = null } = {}) {
    reviewOpen(date);
    const p = approverPerson(personId, date);
    const c = candidateFor(date, candidateId);
    if (c.status !== 'candidate') throw new PipelineError('not_open', `This candidate is already ${c.status}`);
    const input = parse(run(date).input_json, {});
    const payload = parse(c.payload_json, {});
    const check = checkThesisDraft({ en, sl }, factorJsonOf(payload, { date, topPct: input.topPct, vetoScan: c.veto_scan }));
    if (!check.ok) throw new PipelineError('thesis_invalid', `The thesis does not pass the checks: ${[...check.problems.en.map((x) => `EN ${x}`), ...check.problems.sl.map((x) => `SL ${x}`)].join('; ')}`);
    db.tx(() => {
      for (const [lang, text] of [['en', en], ['sl', sl]]) {
        db.run(
          `INSERT INTO explanations (lang, text, source_numbers_json, validator_passed, llm_model, prompt_sha256, output_sha256, approved_by, created_at, candidate_id, purpose, attempt, outcome, drafter)
           VALUES (?, ?, NULL, 1, NULL, NULL, ?, ?, ?, ?, 'thesis', NULL, 'approver', 'approver')`,
          lang,
          text,
          sha256(text),
          p.id,
          iso(ctx.now()),
          c.id,
        );
      }
      db.run("UPDATE candidates SET thesis_status = 'approver', status_reason = NULL, updated_at = ? WHERE id = ?", iso(ctx.now()), c.id);
      logAccess(`person:${p.public_id}`, 'write_thesis', 'candidate', String(c.id), ip);
    });
    return { ok: true, candidateId: c.id, thesis: 'approver' };
  }

  // signOff(date, { personId }): the named approver (or deputy) has reviewed today's candidates.
  function signOff(date, { personId, ip = null } = {}) {
    reviewOpen(date);
    const p = approverPerson(personId, date);
    db.run('INSERT INTO approver_signoffs (issue_date, person_id, signed_at) VALUES (?, ?, ?) ON CONFLICT(issue_date, person_id) DO NOTHING', date, p.id, iso(ctx.now()));
    logAccess(`person:${p.public_id}`, 'signoff', 'candidates', date, ip);
    return { ok: true, date, by: p.public_id };
  }

  // ---------------------------------------------------------------- 13:40 the review closes
  function closeReview(date, { reason = null } = {}) {
    const r = run(date);
    if (!r) throw new PipelineError('no_candidates', `No candidates for ${date}`);
    if (stageAtLeast(r, 'reviewed')) return { date, skipped: 'already_reviewed' };
    const who = signedOff(date);
    const now = iso(ctx.now());
    const out = { date, approver: who?.public_id ?? null, noApprover: 0, newsUnreviewed: 0, noThesis: 0 };
    db.tx(() => {
      for (const c of db.all("SELECT * FROM candidates WHERE date = ? AND status = 'candidate'", date)) {
        if (reason || !who) {
          db.run("UPDATE candidates SET status = 'no_approver', status_reason = ?, updated_at = ? WHERE id = ?", reason ?? 'unissued (no approver): no approver or deputy signed off by 13:40', now, c.id);
          out.noApprover++;
        } else if (NEWS_REVIEW_NEEDED.includes(c.veto_scan)) {
          // The published news veto never passes by default: no scan that cleared, no review, no pick.
          const d = parse(c.veto_scan_detail, {});
          const why = c.veto_scan === 'needs_review' ? floorNote(d.redFlags ?? [], d.unscanned ?? 0) : `the scan did not run (${d.reason ?? c.veto_scan})`;
          const text = `The 48-hour news check did not clear by 13:40: ${why}, and no news review was recorded.`;
          db.run("UPDATE candidates SET status = 'vetoed_human', status_reason = ?, updated_at = ? WHERE id = ?", text.slice(0, 1000), now, c.id);
          db.run("INSERT INTO vetoes (candidate_id, type, detail, person_id, created_at) VALUES (?, 'human', ?, ?, ?)", c.id, JSON.stringify({ en: text.slice(0, 1000), sl: null, code: 'news_unreviewed' }), who.person_id, now);
          out.newsUnreviewed++;
        } else if (!thesisOf(c.id)) {
          const text = 'No validated thesis by 13:40 (the draft failed the checks or the explainer was unavailable, and the approver did not write one).';
          db.run("UPDATE candidates SET status = 'vetoed_human', status_reason = ?, updated_at = ? WHERE id = ?", text, now, c.id);
          db.run("INSERT INTO vetoes (candidate_id, type, detail, person_id, created_at) VALUES (?, 'human', ?, ?, ?)", c.id, JSON.stringify({ en: text, sl: null, code: 'no_thesis' }), who.person_id, now);
          out.noThesis++;
        }
      }
      setRun(date, { stage: 'reviewed', reviewed_at: now });
    });
    return out;
  }

  // ---------------------------------------------------------------- 13:45 seal
  async function seal(date) {
    let r = run(date);
    if (!r) throw new PipelineError('no_candidates', `No candidates for ${date}`);
    if (stageAtLeast(r, 'sealed')) return { date, skipped: 'already_sealed', sealed: [] };
    if (!stageAtLeast(r, 'reviewed')) closeReview(date);
    r = run(date);
    const input = parse(r.input_json, {});
    const who = signedOff(date);
    const rows = readCandidates(date, { actor: 'system:publisher', purpose: 'seal' }).filter((c) => c.status === 'candidate');
    const ordered = [...rows.filter((c) => c.kind === 'RENEW'), ...rows.filter((c) => c.kind !== 'RENEW').sort((a, b) => (b.combined_score ?? 0) - (a.combined_score ?? 0) || a.id - b.id)];
    const sealed = [];
    for (const c of ordered) {
      const p = c.payload;
      const no = nextNo();
      const reveal = { no, ticker: p.ticker, figi: p.figi, issueDate: date, agreeing: p.agreeing, salt: randomToken(16) };
      const commit = await commitment(reveal);
      db.run('INSERT INTO pick_reveals (no, commit_hash, reveal_json, created_at) VALUES (?, ?, ?, ?)', no, commit, JSON.stringify(reveal), iso(ctx.now()));
      const producedAt = localIso(ctx.now());
      const body =
        c.kind === 'RENEW'
          ? { no, priorNo: c.prior_no, commit, horizon: HORIZON, exitPlanned: p.exitPlanned, agreement: p.agreement, methodology: input.methodology, modelVersion: input.modelVersion, producedAt }
          : { no, commit, horizon: HORIZON, exitPlanned: p.exitPlanned, agreement: p.agreement, methodology: input.methodology, modelVersion: input.modelVersion, producedAt };
      const entry = await appendEntry(c.kind === 'RENEW' ? 'RENEW' : 'BUY', date, producedAt, body);
      db.run("UPDATE candidates SET status = 'issued', public_no = ?, updated_at = ? WHERE id = ?", no, iso(ctx.now()), c.id);
      const t = thesisOf(c.id);
      if (t && who) db.run('UPDATE explanations SET approved_by = COALESCE(approved_by, ?) WHERE id IN (?, ?)', who.person_id, t.enId, t.slId);
      sealed.push({ candidateId: c.id, no, kind: entry.type, seq: entry.seq, hash: entry.hash, commit, producedAt });
    }
    setRun(date, { stage: 'sealed', sealed_at: iso(ctx.now()) });
    return { date, sealed, approver: who?.public_id ?? null };
  }

  // The seal slot was missed: nothing can be sealed after the fact, so nothing is issued today.
  function skipSeal(date, reason = 'seal slot missed') {
    const r = run(date);
    if (!r || stageAtLeast(r, 'sealed')) return { date, skipped: true };
    if (!stageAtLeast(r, 'reviewed')) closeReview(date, { reason: `unissued: ${reason}` });
    db.run("UPDATE candidates SET status = 'no_approver', status_reason = ?, updated_at = ? WHERE date = ? AND status = 'candidate'", `unissued: ${reason}`, iso(ctx.now()), date);
    setRun(date, { stage: 'sealed', sealed_at: null, notes: reason });
    return { date, skipped: false, reason };
  }

  // ---------------------------------------------------------------- 14:00:00 publish
  // publish(date, { late }) -> { issueNo, seq, hash, publishedAt, items, notify }
  // late = true: the slot was missed; the web issue appears with its real time and no notification is
  // sent (a missed slot is never caught up into an intraday text).
  async function publish(date, { late = false } = {}) {
    if (!isTradingDay(date)) throw new PipelineError('not_a_trading_day', `${date} is not a US trading day`);
    let r = run(date);
    const now = ctx.now();
    if (!r) {
      // The engine output never arrived: the issue is still published (no pick), and on-call is paged.
      const nowIso = iso(now);
      db.run('INSERT INTO issue_runs (issue_date, input_json, stage, updated_at, notes) VALUES (?, ?, ?, ?, ?)', date, JSON.stringify({ date, nScored: 0, closest: 0, candidatesMissing: true, vetoes: { rule: 0, llm: 0, capped: 0 } }), 'sealed', nowIso, 'engine output missing');
      ctx.alerts?.raise('engine_output_missing', `No engine output for ${date}; publishing an issue without picks`, { severity: 'page', dedupeKey: `engine:${date}` });
      r = run(date);
    }
    if (stageAtLeast(r, 'published')) return { date, skipped: 'already_published', ...parse(r.items_json, {}) };
    if (!stageAtLeast(r, 'sealed')) throw new PipelineError('not_sealed', `The ${date} issue is not sealed`);
    const input = parse(r.input_json, {});
    const slot = issueSlot(date);
    const publishedAt = localIso(now);
    const who = signedOff(date);
    const cands = db.all('SELECT * FROM candidates WHERE date = ? ORDER BY id', date).map((c) => ({ ...c, payload: parse(c.payload_json, {}) }));
    const issuedRows = cands.filter((c) => c.status === 'issued').sort((a, b) => Number(a.public_no) - Number(b.public_no));
    // RENEW candidates that were removed close their prior pick instead.
    const closes = [...(input.closes ?? [])];
    for (const c of cands) {
      if (c.kind === 'RENEW' && c.status !== 'issued' && c.payload.prior && !closes.some((x) => x.no === c.payload.prior.no)) closes.push({ ...c.payload.prior, viaRenewRemoved: true });
    }
    const human = cands
      .filter((c) => c.status === 'vetoed_human')
      .map((c) => {
        const v = db.get("SELECT v.detail, p.public_id FROM vetoes v LEFT JOIN persons p ON p.id = v.person_id WHERE v.candidate_id = ? AND v.type = 'human' ORDER BY v.id DESC LIMIT 1", c.id);
        const d = parse(v?.detail, {});
        return { by: v?.public_id ?? null, reason: { en: d.en ?? c.status_reason, sl: d.sl ?? null }, code: d.code ?? 'approver' };
      });
    const vetoes = {
      rule: input.vetoes?.rule ?? 0,
      llm: (input.vetoes?.llm ?? 0) + cands.filter((c) => c.status === 'vetoed_llm' && c.veto_scan === 'flagged').length,
      human: human.length,
      capped: input.vetoes?.capped ?? 0,
    };
    const issueNo = nextIssueNo();
    const body = {
      issueNo,
      nScored: input.nScored ?? 0,
      closest: input.closest ?? 0,
      buys: issuedRows.filter((c) => c.kind !== 'RENEW').map((c) => c.public_no),
      renews: issuedRows.filter((c) => c.kind === 'RENEW').map((c) => c.public_no),
      closes: closes.map((x) => x.no),
      vetoes,
      methodology: input.methodology ?? null,
      approver: who?.public_id ?? null,
      humanVetoes: human,
      unissued: cands.filter((c) => c.status === 'no_approver').length,
      // The 48-hour news scan of the day's candidates: cleared by the scan, flagged (removed), cleared
      // by the approver's own reading after a scan that did not clear, or never cleared (removed).
      newsScan: newsScanCounts(cands),
    };
    if (late) body.late = true;
    if (input.candidatesMissing) body.engineOutput = 'missing';
    const issueEntry = await appendEntry('ISSUE', date, publishedAt, body);

    // recommendations: INSERT only, with the times and the dissemination price
    const items = [];
    const approver = who ? { id: who.public_id, name: who.full_name, title: who.job_title } : null;
    const modelLead = db.get("SELECT public_id FROM persons WHERE role = 'model_lead' ORDER BY id LIMIT 1")?.public_id ?? null;
    const methId = methodologyId(input.methodology);
    db.tx(() => {
      for (const c of issuedRows) {
        const p = c.payload;
        const e = rowToEntry(db.get("SELECT * FROM ledger_entries WHERE issue_date = ? AND type IN ('BUY', 'RENEW') AND json_extract(body_json, '$.no') = ?", date, c.public_no));
        const t = thesisOf(c.id);
        const priorRec = c.prior_no ? db.get("SELECT id FROM recommendations WHERE public_no = ? AND kind IN ('BUY', 'RENEW')", c.prior_no) : null;
        const recId = db.run(
          `INSERT INTO recommendations (public_no, kind, instrument_id, prior_rec_id, horizon, planned_exit_date, families_json, model_version_ids, methodology_version_id,
             explanation_id, responsible_person_ids, conflicts_snapshot, dissemination_price, price_source, price_at, production_completed_at, disseminated_at,
             canonical_json, sha256, prev_sha256, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          c.public_no,
          c.kind === 'RENEW' ? 'RENEW' : 'BUY',
          c.instrument_id,
          priorRec?.id ?? null,
          HORIZON,
          p.exitPlanned,
          JSON.stringify({ agreement: p.agreement, agreeing: p.agreeing, crashSwitch: p.crashSwitch, pct: Object.fromEntries(Object.entries(p.families ?? {}).map(([k, v]) => [k, v.pct])) }),
          JSON.stringify([input.modelVersion]),
          methId,
          t?.enId ?? null,
          JSON.stringify([approver?.id ?? null, modelLead]),
          JSON.stringify(conflicts(date)),
          p.dissemination?.price ?? null,
          p.dissemination?.source ?? null,
          p.dissemination?.at ?? null,
          e.body.producedAt,
          publishedAt,
          canonicalize({ seq: e.seq, type: e.type, issueDate: e.issueDate, at: e.at, body: e.body, prevHash: e.prevHash }),
          e.hash,
          e.prevHash,
          iso(now),
        ).lastInsertRowid;
        if (p.dissemination?.price != null) {
          db.run("INSERT INTO price_marks (rec_id, kind, date, price, source, at, created_at) VALUES (?, 'dissemination', ?, ?, ?, ?, ?)", recId, date, p.dissemination.price, p.dissemination.source ?? 'unknown', p.dissemination.at ?? null, iso(now));
        }
        items.push({
          recId,
          kind: c.kind === 'RENEW' ? 'RENEW' : 'BUY',
          no: c.public_no,
          priorNo: c.prior_no ?? null,
          ticker: p.ticker,
          name: p.name,
          isin: p.isin ?? null,
          venue: p.venue ?? null,
          agreement: p.agreement,
          agreeing: p.agreeing,
          issueDate: date,
          entryDate: date,
          exitPlanned: p.exitPlanned,
          dissemination: p.dissemination ?? null,
          thesis: t ? { en: t.en, sl: t.sl } : null,
          drafter: t?.drafter ?? null,
          approver,
          seq: e.seq,
          commit: e.body.commit,
        });
      }
      for (const x of closes) {
        const closedRec = db.get("SELECT id, instrument_id FROM recommendations WHERE public_no = ? AND kind IN ('BUY', 'RENEW')", x.no);
        const notice = { type: 'CLOSE', no: x.no, issueDate: date, exitRule: 'US open on the day-21 issue date', issueSeq: issueEntry.seq };
        const recId = db.run(
          `INSERT INTO recommendations (public_no, kind, instrument_id, prior_rec_id, horizon, planned_exit_date, methodology_version_id, responsible_person_ids,
             production_completed_at, disseminated_at, canonical_json, sha256, prev_sha256, created_at)
           VALUES (?, 'CLOSE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          x.no,
          closedRec?.instrument_id ?? (x.figi ? upsertInstrument({ ...x, entryDate: x.entry?.date }) : null),
          closedRec?.id ?? null,
          HORIZON,
          date,
          methId,
          JSON.stringify([approver?.id ?? null, modelLead]),
          localIso(pipelineInstant(date, PIPELINE_TIMES.seal)),
          publishedAt,
          canonicalize(notice),
          sha256(canonicalize(notice)),
          issueEntry.hash,
          iso(now),
        ).lastInsertRowid;
        items.push({ recId, kind: 'CLOSE', no: x.no, ticker: x.ticker, name: x.name, issueDate: date, exitDate: date, entry: x.entry ?? null, closedKind: x.kind ?? null });
      }
      db.run(
        `INSERT INTO issues (issue_date, issue_no, published_at, has_pick, n_scored, closest_agreement) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(issue_date) DO UPDATE SET issue_no = excluded.issue_no, published_at = excluded.published_at, has_pick = excluded.has_pick, n_scored = excluded.n_scored, closest_agreement = excluded.closest_agreement`,
        date,
        issueNo,
        publishedAt,
        body.buys.length + body.renews.length > 0 ? 1 : 0,
        body.nScored,
        body.closest,
      );
      const summary = { issueNo, seq: issueEntry.seq, hash: issueEntry.hash, publishedAt, late, items, closes: closes.map((x) => ({ ...x, reveal: undefined, priorReveals: undefined })) };
      setRun(date, { stage: 'published', published_at: publishedAt, late: late ? 1 : 0, items_json: JSON.stringify(summary) });
    });
    let notify = null;
    if (!late && notifier) notify = await notifier.enqueueIssue({ date, items, publishedAt, slot });
    else if (late) ctx.alerts?.raise('issue_late', `Issue ${date} published late at ${publishedAt}; no notifications were sent`, { severity: 'page', dedupeKey: `late:${date}` });
    return { date, issueNo, seq: issueEntry.seq, hash: issueEntry.hash, publishedAt, late, items, notify, vetoes, body };
  }

  function newsScanCounts(cands) {
    const out = { clear: 0, flagged: 0, reviewed: 0, unreviewed: 0 };
    for (const c of cands) {
      if (c.veto_scan === 'clear') out.clear++;
      else if (c.veto_scan === 'flagged') out.flagged++;
      else if (c.veto_scan === 'reviewed') out.reviewed++;
      else if (NEWS_REVIEW_NEEDED.includes(c.veto_scan)) out.unreviewed++;
    }
    return out;
  }

  function conflicts(date) {
    const open = db.get("SELECT COUNT(*) AS n FROM staff_trade_requests WHERE decision = 'cleared' AND substr(created_at, 1, 10) >= ?", date)?.n ?? 0;
    return { firmPosition: 'none', staffPolicy: 'funds and ETFs only, no single stocks', issuerPayment: false, referralFees: false, shownToIssuer: false, staffClearancesToday: open };
  }

  // ---------------------------------------------------------------- US open: entry and exit prices
  // recordOpens(date, { entryOpen: {figi: price}, exits: {no: {open, bench, net?, excess?, costOneWay?}} })
  async function recordOpens(date, marketData = {}) {
    const r = run(date);
    if (!r || !stageAtLeast(r, 'published')) throw new PipelineError('not_published', `The ${date} issue is not published`);
    if (stageAtLeast(r, 'marked')) return { date, skipped: 'already_marked' };
    const summary = parse(r.items_json, {});
    const slot = issueSlot(date);
    const closeAt = formatInZone(new Date(Date.parse(slot.usOpenAt) + 60_000), LJUBLJANA).iso;
    const now = iso(ctx.now());
    const out = { date, entries: 0, closes: [] };
    for (const it of summary.items ?? []) {
      if (it.kind === 'CLOSE') continue;
      const figi = db.get('SELECT i.figi FROM recommendations r JOIN instruments i ON i.id = r.instrument_id WHERE r.id = ?', it.recId)?.figi;
      const price = marketData.entryOpen?.[figi];
      if (price == null) continue;
      db.run("INSERT INTO price_marks (rec_id, kind, date, price, source, at, created_at) VALUES (?, 'entry_open', ?, ?, ?, ?, ?)", it.recId, date, price, marketData.source ?? 'SIM open', slot.usOpenAt, now);
      out.entries++;
    }
    const input = parse(r.input_json, {});
    for (const x of summary.closes ?? []) {
      const closeRec = db.get("SELECT id FROM recommendations WHERE public_no = ? AND kind = 'CLOSE'", x.no);
      const ex = marketData.exits?.[x.no];
      // What we know about the closed pick: the engine's close item, or the prior of a removed RENEW.
      const src =
        (input.closes ?? []).find((c) => c.no === x.no) ??
        parse(db.get('SELECT payload_json FROM candidates WHERE date = ? AND prior_no = ?', date, x.no)?.payload_json, {})?.prior ??
        {};
      // The salted reveal: ours when we sealed the pick, else the one handed over with the record.
      const rv = revealFor(x.no) ?? src.reveal ?? null;
      const commit = commitOf(x.no);
      if (!rv || !commit || !(await verifyReveal(commit, rv))) {
        ctx.alerts?.raise('reveal_mismatch', `CLOSE ${x.no}: the reveal does not match the sealed commit; the CLOSE entry was not written`, { severity: 'page', dedupeKey: `reveal:${x.no}` });
        out.closes.push({ no: x.no, written: false, reason: 'reveal_mismatch' });
        continue;
      }
      if (!ex) {
        out.closes.push({ no: x.no, written: false, reason: 'no_exit_price' });
        continue;
      }
      const entry = src.entry ?? x.entry ?? entryMark(x.no);
      const gross = entry?.open ? ex.open / entry.open - 1 : ex.gross ?? null;
      const cost = ex.costOneWay ?? null;
      const net = ex.net ?? (gross != null && cost != null ? ((1 + gross) * (1 - cost)) / (1 + cost) - 1 : null);
      const bench = ex.bench ?? null;
      const excess = ex.excess ?? (net != null && bench != null ? net - bench : null);
      const e = await appendEntry('CLOSE', date, closeAt, {
        no: x.no,
        reveal: rv,
        entry: { date: entry?.date ?? null, open: entry?.open ?? null },
        exit: { date, open: ex.open },
        net: round(net),
        bench: round(bench),
        excess: round(excess),
        priorReveals: src.priorReveals?.length ? src.priorReveals : chainReveals(x.no),
      });
      db.run('UPDATE pick_reveals SET revealed_at = COALESCE(revealed_at, ?) WHERE no = ?', now, x.no);
      for (const pr of chainReveals(x.no)) db.run('UPDATE pick_reveals SET revealed_at = COALESCE(revealed_at, ?) WHERE no = ?', now, pr.no);
      if (closeRec) {
        db.run("INSERT INTO price_marks (rec_id, kind, date, price, source, at, created_at) VALUES (?, 'exit_open', ?, ?, ?, ?, ?)", closeRec.id, date, ex.open, ex.source ?? marketData.source ?? 'SIM open', slot.usOpenAt, now);
        const gap = src.dissemination?.price && entry?.open ? round((entry.open / src.dissemination.price - 1) * 1e4, 1) : null;
        db.run(
          'INSERT INTO outcomes (rec_id, gross, net, benchmark, excess, alert_gap_bps, eur_return, d5, d63, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(rec_id) DO NOTHING',
          closeRec.id,
          round(gross),
          round(net),
          round(bench),
          round(excess),
          gap,
          null,
          ex.d5 ?? null,
          ex.d63 ?? null,
          now,
        );
      }
      out.closes.push({ no: x.no, written: true, seq: e.seq, hash: e.hash, excess: round(excess) });
    }
    setRun(date, { stage: 'marked', marked_at: now });
    return out;
  }
  // chainReveals(no) -> the reveals of every earlier record of a renewed chain (oldest first), from
  // the RENEW entries' priorNo links; they are revealed together with the chain's final CLOSE.
  function chainReveals(no) {
    const out = [];
    let cur = no;
    for (let guard = 0; guard < 100; guard++) {
      const e = db.get("SELECT body_json FROM ledger_entries WHERE type = 'RENEW' AND json_extract(body_json, '$.no') = ?", cur);
      const prior = e ? parse(e.body_json)?.priorNo : null;
      if (!prior) break;
      const rv = revealFor(prior);
      if (rv) out.unshift(rv);
      cur = prior;
    }
    return out;
  }
  function revealFor(no) {
    return parse(db.get('SELECT reveal_json FROM pick_reveals WHERE no = ?', no)?.reveal_json, null);
  }
  function entryMark(no) {
    const m = db.get("SELECT pm.date, pm.price FROM price_marks pm JOIN recommendations r ON r.id = pm.rec_id WHERE r.public_no = ? AND r.kind IN ('BUY', 'RENEW') AND pm.kind = 'entry_open'", no);
    return m ? { date: m.date, open: m.price } : null;
  }

  // ---------------------------------------------------------------- 23:59 UTC anchor
  async function anchor(date, opts) {
    if (!anchorer) throw new PipelineError('no_anchorer', 'No anchor module configured');
    const res = await anchorer.anchorDay(date, opts);
    if (run(date)) setRun(date, { stage: 'anchored', anchored_at: iso(ctx.now()) });
    return res;
  }

  // ---------------------------------------------------------------- continuity with the sealed record
  // importLedger(entries): append an existing, verified chain (e.g. the engine's sealed record in
  // web/data/ledger.json) so today's entries continue it.
  async function importLedger(entries) {
    if (!entries.length) return { imported: 0, head: lastEntry()?.hash ?? null }; // nothing sealed before the genesis day
    const v = await verifyChain(entries);
    if (!v.ok) throw new PipelineError('bad_chain', `Ledger import refused: ${v.reason} at seq ${v.firstBad}`);
    const last = lastEntry();
    const first = entries[0];
    if (last && (first.seq !== last.seq + 1 || first.prevHash !== last.hash)) throw new PipelineError('bad_chain', 'Ledger import does not continue the stored chain');
    if (!last && first.seq !== 0) throw new PipelineError('bad_chain', 'Ledger import must start at the genesis record');
    db.tx(() => {
      for (const e of entries) {
        db.run('INSERT INTO ledger_entries (seq, type, issue_date, at, body_json, prev_hash, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', e.seq, e.type, e.issueDate, e.at, JSON.stringify(e.body), e.prevHash, e.hash, iso(ctx.now()));
      }
    });
    return { imported: entries.length, head: entries.at(-1)?.hash ?? null };
  }

  function ledger({ from = null } = {}) {
    return db.all(`SELECT * FROM ledger_entries ${from ? 'WHERE issue_date >= ?' : ''} ORDER BY seq`, ...(from ? [from] : [])).map(rowToEntry);
  }

  // ---------------------------------------------------------------- one call for the whole day
  // runDay(input, { approve, afterPublish }) runs 06:00 -> anchor in order (tests, demo). `approve`
  // is called in the review window with the publisher (it may veto, write theses and sign off).
  async function runDay(input, { approve = null, marketData = null, deliver = true, anchor: doAnchor = true } = {}) {
    const date = input.date;
    const steps = {};
    steps.candidates = writeCandidates(input);
    steps.explain = await explain(date);
    if (approve) steps.approve = await approve({ publisher: api, date, candidates: readCandidates(date, { actor: 'system:runDay', purpose: 'review' }) });
    steps.review = closeReview(date);
    steps.seal = await seal(date);
    steps.publish = await publish(date);
    if (deliver && notifier) steps.deliver = await notifier.deliverIssue(date);
    steps.marks = await recordOpens(date, marketData ?? input.marketData ?? {});
    if (doAnchor && anchorer) steps.anchor = await anchor(date);
    return steps;
  }

  const api = {
    writeCandidates,
    readCandidates,
    explain,
    veto,
    reviewNews,
    writeThesis,
    signOff,
    closeReview,
    seal,
    skipSeal,
    publish,
    recordOpens,
    anchor,
    importLedger,
    ledger,
    runDay,
    run,
    statusCounts,
    thesisOf,
    nextNo,
    ensurePersons,
  };
  return api;
}

export function rowToEntry(r) {
  if (!r) return null;
  return { seq: r.seq, type: r.type, issueDate: r.issue_date, at: r.at, body: JSON.parse(r.body_json), prevHash: r.prev_hash, hash: r.hash };
}
