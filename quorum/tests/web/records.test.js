// Pure helpers behind the record pages (web/js/pages/_records.js, web/js/rule.js), on the real export.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  indexPicks,
  chainOf,
  isRevealed,
  isSealedFor,
  issueCounts,
  recordsCsv,
  recordRow,
  recordRows,
  sortRows,
  filterRows,
  prevNextIssue,
  nearestIssue,
  issueBlocks,
  issueTexts,
  twelveMonths,
  quarterOf,
  ratingDistribution,
  stockHistory,
  flipChar,
  tamperTarget,
  tamperCopy,
} from '../../web/js/pages/_records.js';
import { ruleText, ruleLabels, topPctOf } from '../../web/js/rule.js';

const data = (f) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../web/data/${f}.json`, import.meta.url)), 'utf8'));
const picks = data('picks');
const issues = data('issues');
const ledger = data('ledger');
const meta = data('meta');
const byNo = indexPicks(picks);

test('rule labels come from meta.rule.topPct, in both locales, never "top decile"', () => {
  assert.equal(topPctOf(meta), meta.rule.topPct);
  const en = ruleText(0.95, 'en');
  assert.equal(en.top, 'top 5%');
  assert.equal(en.inTop, 'in their top 5%');
  assert.equal(en.pctile, '95th percentile');
  assert.equal(en.plus, '95+');
  assert.equal(en.band, 'Top 5% · 95+');
  const sl = ruleText(0.95, 'sl');
  assert.equal(sl.inTop, 'med zgornjih 5 %');
  assert.equal(sl.pctile, '95. percentil');
  assert.equal(ruleText(0.9, 'en').pctile, '90th percentile');
  assert.equal(ruleText(0.9, 'en').top, 'top 10%');
  assert.equal(ruleText(0.975, 'en').top, 'top 2.5%');
  assert.equal(ruleText(0.975, 'sl').top, 'zgornjih 2,5 %');
  assert.equal(ruleText(0.91, 'en').pctile, '91st percentile');
  assert.equal(ruleText(0.92, 'en').pctile, '92nd percentile');
  assert.equal(ruleText(0.93, 'en').pctile, '93rd percentile');
  // without data the wording is neutral, not a guessed number
  assert.equal(ruleText(null, 'en').top, 'top slice');
  assert.equal(topPctOf(null, { topPct: 0.94 }), 0.94);
  for (const loc of ['en', 'sl']) assert.doesNotMatch(JSON.stringify(ruleLabels(meta, loc)), /decile|decil|90/i);
});

test('no page copy hard-codes the rule threshold', () => {
  const root = fileURLToPath(new URL('../../web/js/', import.meta.url));
  const files = ['pages/home.js', 'pages/how-it-works.js', 'pages/help.js', 'pages/methodology.js', 'pages/pricing.js', 'hero/assembly.js', 'hero/level-data.js', 'charts/lower-the-bar.js', 'pages/pick.js', 'pages/ledger.js', 'pages/issue.js', 'pages/stock.js', 'pages/disclosures.js', 'pages/backtest.js'];
  for (const f of files) {
    const src = readFileSync(`${root}${f}`, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    // "top decile" of a veto (days to cover, idiosyncratic volatility) is a different rule and allowed
    const hits = src.match(/[^\n]{0,60}(top decile|zgornji decil|v zgornjem decilu|90\+|90th percentile|90\. percentil)[^\n]{0,40}/gi) ?? [];
    const bad = hits.filter((l) => !/days-to-cover|days to cover|idiosyncratic|idiosinkrat|dni pokritja|volatil|veto/i.test(l));
    assert.deepEqual(bad, [], f);
  }
});

test('RENEW chains link both ways; a record is revealed only when its chain has closed', () => {
  for (const p of picks) {
    const chain = chainOf(p, byNo);
    assert.ok(chain.includes(p), p.no);
    for (let i = 1; i < chain.length; i++) assert.equal(chain[i].priorNo, chain[i - 1].no);
    const last = chain.at(-1);
    assert.equal(isRevealed(p, byNo), last.status === 'closed', p.no);
  }
  const open = picks.filter((p) => p.status === 'open');
  assert.ok(open.length > 0);
  for (const p of open) assert.equal(isSealedFor(p, 'free', byNo), true);
  for (const p of open) assert.equal(isSealedFor(p, 'signal', byNo), false);
  // an earlier record of a still-open chain is sealed too
  const renewedOpen = picks.find((p) => p.status === 'renewed' && !isRevealed(p, byNo));
  if (renewedOpen) assert.equal(isSealedFor(renewedOpen, 'free', byNo), true);
});

test('live mode: a record the server redacted (sealed: true, no ticker) is sealed for every tier', async () => {
  const { redactPicks } = await import('../../server/data.js');
  const red = redactPicks(picks);
  const rb = indexPicks(red);
  const sealed = red.filter((p) => p.sealed);
  assert.ok(sealed.length > 0);
  for (const tier of ['free', 'signal', 'research']) {
    for (const p of sealed) {
      assert.equal(isSealedFor(p, tier, rb), true, `${p.no} ${tier}`);
      const row = recordRow(p, rb, tier);
      assert.equal(row.sealed, true);
      assert.equal(row.ticker, null);
    }
  }
  // what the server leaves revealed stays readable
  const closed = red.find((p) => p.status === 'closed');
  assert.equal(isSealedFor(closed, 'free', rb), false);
});

test('issue counts: stocks that met the rule are issued, already open, capped or removed', () => {
  const k = issueCounts({ closest: 3, reached: 10, buys: ['0117'], renews: ['0116'], vetoes: { rule: 0, llm: 0, human: 0, capped: 1 } });
  assert.deepEqual([k.reached, k.issued, k.held, k.capped, k.quorumMet, k.newPick], [10, 2, 8, 1, true, true]);
  const none = issueCounts({ closest: 3, reached: 8, buys: [], renews: [], vetoes: { rule: 2, llm: 0, human: 0, capped: 0 } });
  assert.deepEqual([none.quorumMet, none.newPick, none.held], [true, false, 8]);
  assert.equal(issueCounts({ closest: 2, reached: 0, buys: [], renews: [], vetoes: {} }).quorumMet, false);
  for (const r of issues) {
    const c = issueCounts(r);
    assert.ok(c.held >= 0 && c.held <= c.reached, r.date);
    if (r.quorum) assert.ok(c.newPick, r.date);
  }
});

test('sealed rows expose only what the public chain shows', () => {
  const open = picks.find((p) => p.status === 'open');
  const row = recordRow(open, byNo, 'free');
  assert.equal(row.sealed, true);
  for (const k of ['ticker', 'name', 'entryOpen', 'net', 'bench', 'excess']) assert.equal(row[k], null, k);
  assert.equal(row.commit, open.commit);
  assert.equal(row.agreement, open.agreement);
  const full = recordRow(open, byNo, 'signal');
  assert.equal(full.ticker, open.ticker);
  assert.equal(full.final, false);
  assert.equal(full.excess, open.mark.excess);
  const closed = picks.find((p) => p.status === 'closed');
  assert.equal(recordRow(closed, byNo, 'free').excess, closed.outcome.excess);
});

test('sorting keeps sealed values last in both directions; filters never match a sealed ticker', () => {
  const rows = recordRows(picks, 'free');
  for (const dir of ['asc', 'desc']) {
    const s = sortRows(rows, 'excess', dir);
    const firstNull = s.findIndex((r) => r.excess === null);
    assert.ok(firstNull === -1 || s.slice(firstNull).every((r) => r.excess === null), dir);
    const vals = s.filter((r) => r.excess !== null).map((r) => r.excess);
    assert.deepEqual(vals, [...vals].sort((a, b) => (dir === 'asc' ? a - b : b - a)));
  }
  assert.deepEqual(sortRows(rows, 'no', 'desc').map((r) => r.no), [...rows].map((r) => r.no).sort().reverse());
  const open = picks.find((p) => p.status === 'open');
  assert.equal(filterRows(rows, { q: open.ticker }).some((r) => r.no === open.no), false);
  assert.equal(filterRows(recordRows(picks, 'signal'), { q: open.ticker }).some((r) => r.no === open.no), true);
  assert.equal(filterRows(rows, { q: `#${open.no}` })[0].no, open.no);
  assert.ok(filterRows(rows, { status: 'closed' }).every((r) => r.status === 'closed'));
  assert.ok(filterRows(rows, { agreement: '4' }).every((r) => r.agreement === 4));
  assert.ok(filterRows(rows, { kind: 'RENEW' }).every((r) => r.kind === 'RENEW'));
});

test('issues: neighbours, nearest issue for a closed day, blocks and texts', () => {
  const { prev, next, index } = prevNextIssue(issues, issues[1].date);
  assert.equal(index, 1);
  assert.equal(prev.date, issues[0].date);
  assert.equal(next.date, issues[2].date);
  assert.equal(prevNextIssue(issues, '2025-10-04').index, -1); // a Saturday
  assert.equal(nearestIssue(issues, '2025-10-04').date <= '2025-10-04', true);
  const blocks = issueBlocks(ledger.entries, ledger.anchors);
  assert.equal(blocks[0].date, issues.at(-1).date);
  assert.equal(blocks.reduce((n, b) => n + b.entries.length, 0), ledger.entries.length);
  assert.ok(blocks.every((b) => b.anchor && b.anchor.rowCount === b.entries.length));
  const q = issues.find((r) => r.buys.length && r.closes.length) ?? issues.find((r) => r.buys.length);
  const texts = issueTexts(q, byNo);
  assert.equal(texts.filter((t) => t.kind !== 'CLOSE').length, q.buys.length + q.renews.length);
  assert.ok(texts.every((t) => t.text.en && t.text.sl));
});

test('MAR lists: 12 months, quarters, 100% BUY, per-stock history', () => {
  const list = twelveMonths(picks, meta.asOf);
  assert.ok(list.length > 0 && list.length <= picks.length);
  assert.ok(list.every((p) => p.issueDate <= meta.asOf));
  assert.equal(quarterOf('2025-10-01'), '2025-Q4');
  assert.equal(quarterOf('2026-03-31'), '2026-Q1');
  const dist = ratingDistribution(picks);
  assert.equal(dist.reduce((n, r) => n + r.total, 0), picks.length);
  assert.ok(dist.every((r) => r.buyShare === 1 && r.hold === 0 && r.sell === 0));
  const t = picks[0].ticker;
  const hist = stockHistory(picks, t, meta.asOf);
  assert.ok(hist.length >= 1 && hist.every((p) => p.ticker === t));
});

test('tamper copies flip exactly one character and leave the ledger untouched', () => {
  assert.deepEqual(flipChar('MCB', 2), { value: 'MCC', index: 2, from: 'B', to: 'C' });
  assert.equal(flipChar('A9', 1).value, 'A0');
  assert.equal(flipChar('z', 0).value, 'a');
  const before = JSON.stringify(ledger.entries);
  for (const preset of ['reveal', 'result', 'scored']) {
    const target = tamperTarget(ledger.entries, preset);
    assert.ok(target, preset);
    const c = tamperCopy(ledger.entries, target);
    assert.notEqual(c.before, c.after);
    let diffs = 0;
    for (let i = 0; i < Math.max(c.before.length, c.after.length); i++) if (c.before[i] !== c.after[i]) diffs++;
    assert.equal(diffs, 1, preset);
    assert.notEqual(JSON.stringify(c.entries[c.index]), JSON.stringify(ledger.entries[c.index]));
  }
  assert.equal(JSON.stringify(ledger.entries), before);
  // "Improve a result" makes the forged excess better, never worse
  const t = tamperTarget(ledger.entries, 'result');
  const c = tamperCopy(ledger.entries, t);
  assert.ok(Number(c.after) > Number(c.before), `${c.before} -> ${c.after}`);
  const neg = tamperCopy([{ seq: 1, type: 'CLOSE', body: { no: '0001', excess: -0.02415 } }], { seq: 1, path: ['body', 'excess'], kind: 'number', raise: true });
  assert.equal(neg.after, '-0.02414');
  const pos = tamperCopy([{ seq: 1, type: 'CLOSE', body: { no: '0001', excess: 0.0199 } }], { seq: 1, path: ['body', 'excess'], kind: 'number', raise: true });
  assert.equal(pos.after, '0.0299');
});

test('the picks CSV: every record, open tickers only for paid tiers', () => {
  const paid = recordsCsv(recordRows(picks, 'signal'));
  const free = recordsCsv(recordRows(picks, 'free'));
  const lines = paid.trim().split('\n');
  assert.equal(lines.length, picks.length + 1);
  assert.match(lines[0], /^no,kind,prior_no,issue_date,status,sealed,agreement,ticker,name/);
  const open = picks.find((p) => p.status === 'open');
  assert.ok(paid.includes(`,${open.ticker},`));
  const freeRow = free.split('\n').find((l) => l.startsWith(`${open.no},`));
  assert.ok(freeRow && !freeRow.includes(open.ticker), freeRow);
});
