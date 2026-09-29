// Pure helpers over the published record (picks.json, issues.json, ledger.json) shared by the
// ledger, issue, pick, stock and disclosures pages. No DOM: tested in Node (tests/web/records.test.js).
//
// Commit–reveal: an open pick is sealed. A RENEW chain stays sealed until its final record closes,
// because the earlier records are revealed together with that CLOSE (ledger CLOSE.priorReveals).
// Free viewers (view-as Free) therefore see a record only when its whole chain has closed.

export const STATUSES = ['open', 'closed', 'renewed'];

// The venue as the data names it ("NYSE (simulated)"), in the page's language.
export function venueL(venue, locale) {
  const v = String(venue ?? '');
  return locale === 'sl' ? v.replace('(simulated)', '(simulirano)') : v;
}

export function indexPicks(picks) {
  return new Map((picks ?? []).map((p) => [p.no, p]));
}

// The RENEW chain a record belongs to, first record first.
export function chainOf(pick, byNo) {
  if (!pick) return [];
  let first = pick;
  const seen = new Set([first.no]);
  while (first.priorNo && byNo.has(first.priorNo) && !seen.has(first.priorNo)) {
    first = byNo.get(first.priorNo);
    seen.add(first.no);
  }
  const out = [first];
  let cur = first;
  while (cur.renewedAs && byNo.has(cur.renewedAs) && !out.includes(byNo.get(cur.renewedAs))) {
    cur = byNo.get(cur.renewedAs);
    out.push(cur);
  }
  return out;
}

// Revealed = the chain's final record has closed (its CLOSE entry carries every reveal).
export function isRevealed(pick, byNo) {
  const chain = chainOf(pick, byNo);
  return chain.length > 0 && chain[chain.length - 1].status === 'closed';
}

// Sealed for this viewer: the server redacted it (live mode: `sealed: true`, no ticker), or the demo's
// Free view of a chain that has not closed. A redacted record is sealed whatever the tier says, so no
// page ever reads a ticker, name, mark or reveal the server withheld.
export function isSealedFor(pick, tier, byNo) {
  if (!pick) return true;
  if (pick.sealed === true || pick.ticker == null) return true;
  return tier === 'free' && !isRevealed(pick, byNo);
}

// The measured result of a record: its outcome when the 21-day window has ended (closed or renewed),
// otherwise the mark-to-market at the latest close.
export function resultOf(pick) {
  if (pick.outcome) return { ...pick.outcome, final: true, date: pick.outcome.exitDate };
  if (pick.mark) return { net: pick.mark.net, bench: pick.mark.bench, excess: pick.mark.excess, final: false, date: pick.mark.date };
  return null;
}

// One row of the record table. Sealed rows carry only what the public chain already shows:
// number, dates, agreement, commitment hash (the BUY/RENEW body holds no ticker and no price).
export function recordRow(pick, byNo, tier = 'signal') {
  const sealed = isSealedFor(pick, tier, byNo);
  const res = resultOf(pick);
  const base = {
    no: pick.no,
    kind: pick.kind,
    priorNo: pick.priorNo ?? null,
    renewedAs: pick.renewedAs ?? null,
    issueDate: pick.issueDate,
    issueNo: pick.issueNo,
    disseminatedAt: pick.disseminatedAt,
    producedAt: pick.producedAt,
    agreement: pick.agreement,
    exitPlanned: pick.exitPlanned,
    status: pick.status,
    commit: pick.commit,
    seq: pick.seq,
    sealed,
  };
  if (sealed) {
    return {
      ...base,
      ticker: null,
      name: null,
      sector: null,
      entryOpen: null,
      exitDate: pick.exitPlanned,
      exitOpen: null,
      net: null,
      bench: null,
      excess: null,
      final: false,
    };
  }
  return {
    ...base,
    ticker: pick.ticker,
    name: pick.name,
    sector: pick.sector,
    sectorSl: pick.sectorSl ?? pick.sector,
    entryOpen: pick.entry?.open ?? null,
    exitDate: pick.exit?.date ?? pick.exitPlanned,
    exitOpen: pick.exit?.open ?? null,
    net: res?.net ?? null,
    bench: res?.bench ?? null,
    excess: res?.excess ?? null,
    final: !!res?.final,
    markDate: res && !res.final ? res.date : null,
  };
}

export function recordRows(picks, tier = 'signal') {
  const byNo = indexPicks(picks);
  return (picks ?? []).map((p) => recordRow(p, byNo, tier));
}

// The record table as CSV for this viewer (Signal's "full ledger as CSV"): one row per BUY and RENEW,
// numbers as fractions, RFC 4180 quoting. A sealed row keeps only what the public chain shows.
export function recordsCsv(rows) {
  const q = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cols = ['no', 'kind', 'prior_no', 'issue_date', 'status', 'sealed', 'agreement', 'ticker', 'name', 'entry_open', 'exit_date', 'exit_open', 'net', 'bench', 'excess', 'final', 'commit'];
  const lines = [cols.join(',')];
  for (const r of rows) {
    lines.push(
      [r.no, r.kind, r.priorNo, r.issueDate, r.status, r.sealed ? 1 : 0, r.agreement, r.ticker, r.name, r.entryOpen, r.exitDate, r.exitOpen, r.net, r.bench, r.excess, r.final ? 1 : 0, r.commit]
        .map(q)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

// Sorting: nulls (sealed or not yet measured) always last, whatever the direction, so a sealed
// record's hidden values can never be inferred from its position.
const SORT_KEYS = {
  no: (r) => r.no,
  issueDate: (r) => r.issueDate,
  ticker: (r) => r.ticker,
  agreement: (r) => r.agreement,
  entryOpen: (r) => r.entryOpen,
  exitDate: (r) => (r.sealed ? null : r.exitDate),
  net: (r) => r.net,
  bench: (r) => r.bench,
  excess: (r) => r.excess,
  status: (r) => STATUSES.indexOf(r.status),
};
export const SORTABLE = Object.keys(SORT_KEYS);

export function sortRows(rows, key = 'no', dir = 'desc') {
  const get = SORT_KEYS[key] ?? SORT_KEYS.no;
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    const na = va === null || va === undefined;
    const nb = vb === null || vb === undefined;
    if (na !== nb) return na ? 1 : -1;
    if (!na && va !== vb) return (va < vb ? -1 : 1) * sign;
    return a.no < b.no ? 1 : a.no > b.no ? -1 : 0; // ties: newest first
  });
}

// Filters: status (all|open|closed|renewed), kind (all|BUY|RENEW), agreement (all|3|4), q (ticker,
// name or number). A sealed record never matches a text query on ticker or name.
export function filterRows(rows, { status = 'all', kind = 'all', agreement = 'all', q = '' } = {}) {
  const query = String(q ?? '')
    .trim()
    .toLowerCase()
    .replace(/^#/, '');
  return rows.filter((r) => {
    if (status !== 'all' && r.status !== status) return false;
    if (kind !== 'all' && r.kind !== kind) return false;
    if (agreement !== 'all' && String(r.agreement) !== String(agreement)) return false;
    if (!query) return true;
    if (r.no.includes(query) || String(Number(r.no)) === query) return true;
    if (r.sealed) return false;
    return (r.ticker ?? '').toLowerCase().includes(query) || (r.name ?? '').toLowerCase().includes(query);
  });
}

// ---- issues ----------------------------------------------------------------------------------------
export function issueIndex(issues) {
  return new Map((issues ?? []).map((r, i) => [r.date, i]));
}

export function prevNextIssue(issues, date) {
  const i = (issues ?? []).findIndex((r) => r.date === date);
  if (i < 0) return { prev: null, next: null, index: -1 };
  return { prev: issues[i - 1] ?? null, next: issues[i + 1] ?? null, index: i };
}

// Nearest issue on or before a date (for dates without an issue: weekends, holidays).
export function nearestIssue(issues, date) {
  let best = null;
  for (const r of issues ?? []) if (r.date <= date) best = r;
  return best ?? issues?.[0] ?? null;
}

export function entriesOn(entries, date) {
  return (entries ?? []).filter((e) => e.issueDate === date);
}

// Group ledger entries into issue blocks (one per issue date), newest first.
export function issueBlocks(entries, anchors = []) {
  const byDate = new Map();
  for (const e of entries ?? []) {
    if (!byDate.has(e.issueDate)) byDate.set(e.issueDate, []);
    byDate.get(e.issueDate).push(e);
  }
  const anc = new Map((anchors ?? []).map((a) => [a.date, a]));
  return [...byDate.entries()]
    .map(([date, list]) => ({ date, entries: list, anchor: anc.get(date) ?? null, issue: list.find((e) => e.type === 'ISSUE') ?? null }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

// What happened to the stocks that met the rule on an issue day, from the counts the issue publishes
// (issues.json; engine/backtest.js). `reached` counts every non-vetoed stock at the required agreement,
// including picks already open; `vetoes.capped` counts the caps (issue, month, sector, SMS budget) and
// cooldowns; `vetoes.human` and `unissued` remove issued BUYs. What is left was already an open pick
// (a RENEW is one of those). `rule` and `llm` count vetoed stocks, which are not in `reached`.
// -> { buys, renews, issued, reached, held, capped, human, unissued, rule, llm, required, quorumMet, newPick }
export function issueCounts(iss, required = 3) {
  const v = iss?.vetoes ?? {};
  const buys = iss?.buys?.length ?? 0;
  const renews = iss?.renews?.length ?? 0;
  const reached = Math.max(0, iss?.reached ?? 0);
  const capped = v.capped ?? 0;
  const human = v.human ?? 0;
  const unissued = iss?.unissued ?? 0;
  const held = Math.max(0, reached - buys - capped - human - unissued);
  const need = iss?.required ?? required;
  return {
    buys,
    renews,
    issued: buys + renews,
    reached,
    held,
    capped,
    human,
    unissued,
    rule: v.rule ?? 0,
    llm: v.llm ?? 0,
    required: need,
    // at least one stock met the rule with no veto (whether or not it could be issued)
    quorumMet: (iss?.closest ?? 0) >= need && reached > 0,
    newPick: buys + renews > 0,
  };
}

// Every SMS an issue carries (sent to subscribers once launched): BUY and RENEW texts of its picks, CLOSE
// texts of its exits.
export function issueTexts(issue, byNo) {
  const out = [];
  for (const no of [...(issue?.buys ?? []), ...(issue?.renews ?? [])]) {
    const p = byNo.get(no);
    if (p?.sms) out.push({ kind: p.kind, no, pick: p, text: p.sms });
  }
  for (const no of issue?.closes ?? []) {
    const p = byNo.get(no);
    if (p?.closeSms) out.push({ kind: 'CLOSE', no, pick: p, text: p.closeSms });
  }
  return out;
}

// ---- disclosures -----------------------------------------------------------------------------------
function minusMonths(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 - n, d));
  return t.toISOString().slice(0, 10);
}

// MAR 12-month list: every recommendation disseminated in the 12 months up to asOf, newest first.
export function twelveMonths(picks, asOf) {
  const from = minusMonths(asOf, 12);
  return (picks ?? []).filter((p) => p.issueDate > from && p.issueDate <= asOf).sort((a, b) => (a.no < b.no ? 1 : -1));
}

export function quarterOf(date) {
  const [y, m] = date.split('-').map(Number);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

// Quarterly rating distribution. Every record is a BUY (RENEW is a renewed BUY): we say so plainly.
export function ratingDistribution(picks) {
  const q = new Map();
  for (const p of picks ?? []) {
    const k = quarterOf(p.issueDate);
    if (!q.has(k)) q.set(k, { quarter: k, buy: 0, renew: 0, hold: 0, sell: 0, total: 0 });
    const row = q.get(k);
    if (p.kind === 'RENEW') row.renew++;
    else row.buy++;
    row.total++;
  }
  return [...q.values()].sort((a, b) => (a.quarter < b.quarter ? -1 : 1)).map((r) => ({ ...r, buyShare: r.total ? (r.buy + r.renew) / r.total : 0 }));
}

// Recommendations on one stock (12 months up to asOf), oldest first.
export function stockHistory(picks, ticker, asOf) {
  const from = asOf ? minusMonths(asOf, 12) : '0000-00-00';
  return (picks ?? []).filter((p) => p.ticker === ticker && p.issueDate > from && (!asOf || p.issueDate <= asOf)).sort((a, b) => (a.no < b.no ? -1 : 1));
}

// ---- tamper demo -----------------------------------------------------------------------------------
// Flip one character of a string deterministically: a digit becomes the next digit, a letter the next
// letter (keeping case); anything else becomes 'x'.
export function flipChar(str, index) {
  const s = String(str);
  const i = Math.max(0, Math.min(s.length - 1, index));
  const c = s[i];
  let n;
  if (/[0-9]/.test(c)) n = String((Number(c) + 1) % 10);
  else if (/[a-y]/.test(c) || /[A-Y]/.test(c)) n = String.fromCharCode(c.charCodeAt(0) + 1);
  else if (c === 'z') n = 'a';
  else if (c === 'Z') n = 'A';
  else n = 'x';
  return { value: s.slice(0, i) + n + s.slice(i + 1), index: i, from: c, to: n };
}

// Tamper presets over a real chain. Each returns where the forgery happens, in plain words.
// - 'reveal': the ticker revealed at a CLOSE (as if a loser were swapped for a winner)
// - 'result': the excess return written into a CLOSE
// - 'scored': the number of stocks scored in an ISSUE
export function tamperTarget(entries, preset = 'reveal') {
  const list = entries ?? [];
  if (preset === 'result') {
    const e = list.find((x) => x.type === 'CLOSE' && typeof x.body?.excess === 'number');
    if (e) return { seq: e.seq, path: ['body', 'excess'], label: `CLOSE #${e.body.no}: excess`, kind: 'number', raise: true };
  }
  if (preset === 'scored') {
    const e = list.find((x) => x.type === 'ISSUE' && typeof x.body?.nScored === 'number');
    if (e) return { seq: e.seq, path: ['body', 'nScored'], label: `ISSUE #${e.body.issueNo}: stocks scored`, kind: 'number' };
  }
  const e = list.find((x) => x.type === 'CLOSE' && x.body?.reveal?.ticker);
  if (!e) return null;
  return { seq: e.seq, path: ['body', 'reveal', 'ticker'], label: `CLOSE #${e.body.no}: revealed ticker`, kind: 'string' };
}

// A deep copy of the chain with one character flipped at the target. The original is untouched.
export function tamperCopy(entries, target, { rehash = null } = {}) {
  const copy = typeof structuredClone === 'function' ? structuredClone(entries) : JSON.parse(JSON.stringify(entries));
  const idx = copy.findIndex((e) => e.seq === target.seq);
  if (idx < 0) return null;
  let obj = copy[idx];
  for (const k of target.path.slice(0, -1)) obj = obj[k];
  const key = target.path[target.path.length - 1];
  const before = obj[key];
  const s = String(before);
  // flip the last digit of a number (keeps it a valid number), the last letter of a string. A forged
  // result is made better, as a forger would: one digit moves so the value rises (a negative excess
  // shrinks towards zero, a positive one grows), still exactly one character.
  let at = s.length - 1;
  let f = null;
  if (target.kind === 'number' && target.raise) {
    const neg = s.startsWith('-');
    for (let i = s.length - 1; i >= 0 && !f; i--) {
      if (!/[0-9]/.test(s[i])) continue;
      const d = Number(s[i]);
      if (neg ? d > 0 : d < 9) f = { value: s.slice(0, i) + String(neg ? d - 1 : d + 1) + s.slice(i + 1), index: i, from: s[i], to: String(neg ? d - 1 : d + 1) };
    }
  }
  if (!f && target.kind === 'number')
    for (let i = s.length - 1; i >= 0; i--)
      if (/[0-9]/.test(s[i])) {
        at = i;
        break;
      }
  f ??= flipChar(s, at);
  obj[key] = target.kind === 'number' ? Number(f.value) : f.value;
  return { entries: copy, index: idx, seq: target.seq, before: s, after: f.value, at: f.index, rehash };
}
