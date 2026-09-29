// GET /data/:file.json — the engine's public data files, redacted to the viewer's entitlement
// (docs/ARCHITECTURE.md §4): picks.json without the `picks` entitlement keeps sealed picks sealed
// (no ticker, name, reveal or anything that identifies the stock until the pick closes);
// universe.json without `research_data` carries no rows.
// GET /api/ledger.csv — the same ledger entries as /data/ledger.json as CSV (core/ledger.js
// ledgerCsv, byte for byte what the ledger page's "Copy CSV" gives).
//
// Each variant (file x full/redacted, and the CSV) is serialised once per file version and kept as
// a Buffer with a strong ETag: a request costs a stat and a write, and If-None-Match answers 304.
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ledgerCsv } from '../core/ledger.js';
import { HttpError } from './http.js';
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

const PERSONAL = new Set(['picks', 'universe']);

export function createDataServer(ctx, root) {
  const cache = new Map(); // file -> { key, json, variants: Map(variant -> { body, etag }) }

  // entry(name) -> the cache entry of the file's current version, or null when there is no file
  async function entry(name) {
    const path = join(root, `${name}.json`);
    let s;
    try {
      s = await stat(path);
    } catch {
      return null;
    }
    const key = `${s.mtimeMs}:${s.size}`;
    const hit = cache.get(name);
    if (hit && hit.key === key) return hit;
    const fresh = { key, json: JSON.parse(await readFile(path, 'utf8')), variants: new Map() };
    cache.set(name, fresh);
    return fresh;
  }

  async function load(name) {
    return (await entry(name))?.json ?? null;
  }

  // variantOf(name, user) -> 'full' | 'redacted' (what this viewer may see of the file)
  function variantOf(name, user) {
    if (!PERSONAL.has(name)) return 'full';
    const ent = entitlementsFor(ctx.db, user?.id, ctx.now());
    if (name === 'picks') return ent.picks.active ? 'full' : 'redacted';
    return ent.research_data.active ? 'full' : 'redacted';
  }

  function build(name, json, variant) {
    if (variant === 'csv') return ledgerCsv(json?.entries ?? []);
    if (variant === 'full') return JSON.stringify(json);
    if (name === 'picks') return JSON.stringify(redactPicks(Array.isArray(json) ? json : []));
    return JSON.stringify(redactUniverse(json));
  }

  // serialized(name, variant) -> { body: Buffer, etag } | null, built once per file version
  async function serialized(name, variant) {
    const e = await entry(name);
    if (!e) return null;
    let v = e.variants.get(variant);
    if (!v) {
      const body = Buffer.from(build(name, e.json, variant));
      v = { body, etag: `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"` };
      e.variants.set(variant, v);
    }
    return v;
  }

  // body(name, user) -> the JSON to send for this viewer
  async function body(name, user) {
    const e = await entry(name);
    if (!e) return null;
    const variant = variantOf(name, user);
    if (variant === 'full') return e.json;
    return name === 'picks' ? redactPicks(Array.isArray(e.json) ? e.json : []) : redactUniverse(e.json);
  }

  return { load, body, serialized, variantOf };
}

// send(req, res, { body, etag }, headers): 304 when the client already holds this exact body.
function sendCached(req, res, { body, etag }, headers) {
  const inm = String(req.headers['if-none-match'] ?? '');
  const h = { etag, ...headers };
  if (inm && inm.split(',').some((x) => x.trim().replace(/^W\//, '') === etag)) {
    res.writeHead(304, h);
    res.end();
    return;
  }
  res.writeHead(200, { ...h, 'content-length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
}

export function registerDataRoutes(router, ctx, root) {
  const data = createDataServer(ctx, root);
  router.add(
    'GET',
    '/data/:file',
    async (req, res, { params, user }) => {
      const m = /^([a-z0-9-]+)\.json$/.exec(params.file);
      if (!m || !DATA_FILES.includes(m[1])) throw new HttpError(404, 'not_found', 'No such data file');
      const variant = data.variantOf(m[1], user);
      const out = await data.serialized(m[1], variant);
      if (out == null) throw new HttpError(404, 'not_found', 'No such data file');
      sendCached(req, res, out, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': PERSONAL.has(m[1]) ? 'private, no-store' : 'public, max-age=60',
        vary: 'Cookie',
      });
      return undefined;
    },
    { rate: 'data' },
  );
  router.add(
    'GET',
    '/api/ledger.csv',
    async (req, res) => {
      const out = await data.serialized('ledger', 'csv');
      if (out == null) throw new HttpError(404, 'not_found', 'No ledger yet');
      sendCached(req, res, out, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'inline; filename="quorum-ledger.csv"',
        'cache-control': 'public, max-age=60',
      });
      return undefined;
    },
    { rate: 'data' },
  );
  return data;
}
