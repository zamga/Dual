// Every route of ARCHITECTURE.md §5 in its canonical flat-token form (the Artifact-safe deep links),
// with real parameters taken from the published data, plus the record pages' edge cases (an empty
// issue, an open pick, a renewed pick, a stock) and one legacy slash link.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function sampleData(dataDir) {
  const read = async (f) => JSON.parse(await readFile(join(dataDir, f), 'utf8'));
  const [issues, picks] = await Promise.all([read('issues.json'), read('picks.json').catch(() => [])]);
  const lastIssue = issues.at(-1)?.date ?? '2026-09-28';
  const emptyIssue = issues.find((r) => !r.quorum && !r.closes?.length)?.date ?? lastIssue;
  const closed = picks.find((p) => p.status === 'closed') ?? picks[0];
  const open = [...picks].reverse().find((p) => p.status === 'open') ?? picks.at(-1);
  const renewed = picks.find((p) => p.status === 'renewed') ?? closed;
  return { lastIssue, emptyIssue, closed, open, renewed };
}

export async function sampleRoutes(dataDir) {
  const d = await sampleData(dataDir);
  return [
    '#', '#how-it-works', '#methodology', '#methodology-changelog', '#ledger', '#backtest', `#issue-${d.lastIssue}`, `#issue-${d.emptyIssue}`,
    `#p-${d.closed?.no ?? '0001'}`, `#p-${d.open?.no ?? '0001'}`, `#p-${d.renewed?.no ?? '0001'}`, `#s-${d.closed?.ticker ?? 'ACME'}`, '#disclosures',
    '#pricing', '#join', '#join-signal', '#join-research', '#app', '#app-research', '#account', '#u-7Kq2xZ', '#help', '#status', '#about', '#legal-terms', '#legal-privacy',
    '#legal-sms', '#legal-imprint', '#legal-cookies', '#this-route-does-not-exist', `#/p/${d.closed?.no ?? '0001'}`,
  ];
}
