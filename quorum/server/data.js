// GET /data/:file.json — the engine's public data files, redacted to the viewer's entitlement
// (docs/ARCHITECTURE.md §4): picks.json without the `picks` entitlement keeps sealed picks sealed
// (no ticker, name, reveal or anything that identifies the stock until the pick closes);
// universe.json without `research_data` carries no rows.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { HttpError, sendJson } from './http.js';
import { entitlementsFor } from './entitlements.js';

export const DATA_FILES = ['meta', 'summary', 'issues', 'ledger', 'picks', 'scoreboard', 'deciles', 'hero', 'universe', 'backtest'];

// Fields a sealed (not yet closed) pick may show to everyone: the number, the times, the commit
// hash and the process facts. Everything else is nulled.
const SEALED_KEEP = new Set([
  'no', 'kind', 'priorNo', 'renewedAs', 'status', 'issueDate', 'issueNo', 'producedAt', 'disseminatedAt',
  'exitPlanned', 'agreement', 'crashSwitch', 'approver', 'modelLead', 'modelVersion', 'methodology',
  'seq', 'commit', 'drafter', 'validator',
]);

// redactPicks(picks) -> picks with every unrevealed pick sealed. A renewed pick is revealed once
// the chain it was renewed into has closed.
export function redactPicks(picks) {
  const byNo = new Map(picks.map((p) => [p.no, p]));
  const revealed = (p, depth = 0) => {
    if (!p || depth > 50) return false;
    if (p.status === 'closed') return true;
    if (p.status === 'renewed' && p.renewedAs) return revealed(byNo.get(p.renewedAs), depth + 1);
    return false;
  };
  return picks.map((p) => {
    if (revealed(p)) return p;
    const out = {};
    for (const [k, v] of Object.entries(p)) out[k] = SEALED_KEEP.has(k) ? v : null;
    out.entry = p.entry ? { date: p.entry.date ?? null } : null;
    out.sealed = true;
    return out;
  });
}

export function redactUniverse(u) {
  return { simulated: u?.simulated ?? true, date: u?.date ?? null, cols: u?.cols ?? [], rows: [], redacted: true, requires: 'research_data' };
}

export function createDataServer(ctx, root) {
  const cache = new Map(); // file -> { mtimeMs, json }

  async function load(name) {
    const path = join(root, `${name}.json`);
    let s;
    try {
      s = await stat(path);
    } catch {
      return null;
    }
    const hit = cache.get(name);
    if (hit && hit.mtimeMs === s.mtimeMs) return hit.json;
    const json = JSON.parse(await readFile(path, 'utf8'));
    cache.set(name, { mtimeMs: s.mtimeMs, json });
    return json;
  }

  // body(name, user) -> the JSON to send for this viewer
  async function body(name, user) {
    const json = await load(name);
    if (json == null) return null;
    const ent = entitlementsFor(ctx.db, user?.id, ctx.now());
    if (name === 'picks') return ent.picks.active ? json : redactPicks(Array.isArray(json) ? json : []);
    if (name === 'universe') return ent.research_data.active ? json : redactUniverse(json);
    return json;
  }

  return { load, body };
}

export function registerDataRoutes(router, ctx, root) {
  const data = createDataServer(ctx, root);
  router.add(
    'GET',
    '/data/:file',
    async (req, res, { params, user }) => {
      const m = /^([a-z0-9-]+)\.json$/.exec(params.file);
      if (!m || !DATA_FILES.includes(m[1])) throw new HttpError(404, 'not_found', 'No such data file');
      const out = await data.body(m[1], user);
      if (out == null) throw new HttpError(404, 'not_found', 'No such data file');
      const personal = m[1] === 'picks' || m[1] === 'universe';
      return sendJson(res, 200, out, {
        'cache-control': personal ? 'private, no-store' : 'public, max-age=60',
        vary: 'Cookie',
      });
    },
    { rate: 'data' },
  );
  return data;
}
