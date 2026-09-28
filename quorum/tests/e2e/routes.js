// Every route of ARCHITECTURE.md §5 with real parameters taken from the published data.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function sampleRoutes(dataDir) {
  const read = async (f) => JSON.parse(await readFile(join(dataDir, f), 'utf8'));
  const [issues, picks] = await Promise.all([read('issues.json'), read('picks.json').catch(() => [])]);
  const lastIssue = issues.at(-1)?.date ?? '2026-09-28';
  const closed = picks.find((p) => p.status === 'closed') ?? picks[0];
  return [
    '#/', '#/how-it-works', '#/methodology', '#/methodology/changelog', '#/ledger', '#/backtest', `#/issue/${lastIssue}`,
    `#/p/${closed?.no ?? '0001'}`, `#/s/${closed?.ticker ?? 'ACME'}`, '#/disclosures', '#/pricing', '#/join', '#/app', '#/app/research',
    '#/account', '#/u/7Kq2xZ', '#/help', '#/status', '#/about', '#/legal/terms', '#/legal/privacy', '#/legal/sms', '#/legal/imprint',
    '#/legal/cookies', '#/this-route-does-not-exist',
  ];
}
