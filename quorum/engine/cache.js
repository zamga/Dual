// Disk cache for the expensive part of buildModel (the D walk-forward and its CV).
// Keyed by the options and a hash of the engine source, so any code change invalidates it.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, renameSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CACHE_DIR = join(ENGINE_DIR, '.cache');

function sourceFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (['tools'].includes(e.name)) continue;
      sourceFiles(p, out);
    } else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

// Only the files that shape the cached model are hashed; the backtest, validation, record, thesis
// and export modules (engine/*.js outside this list) can change without retraining D.
const MODEL_DIRS = ['sim', 'families', 'ml', 'lib'];
const MODEL_FILES = ['model.js', 'features.js', 'returns.js', 'cache.js'];

/** Hash of the engine sources that shape the model (sim, features, families, ml, lib, core). */
export function sourceHash() {
  const h = createHash('sha256');
  const files = [
    ...MODEL_DIRS.flatMap((d) => sourceFiles(join(ENGINE_DIR, d))),
    ...MODEL_FILES.map((f) => join(ENGINE_DIR, f)).filter((f) => existsSync(f)),
    ...sourceFiles(join(ENGINE_DIR, '..', 'core')),
  ].sort();
  for (const f of files) {
    h.update(f.slice(ENGINE_DIR.length));
    h.update(readFileSync(f));
  }
  return h.digest('hex').slice(0, 16);
}

export function cacheKey(parts) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 20);
}

/** Save { json, arrays: {name: TypedArray} } under dir/key. */
export function saveCache(dir, key, { json, arrays }, keep = 4) {
  const root = join(dir, key);
  const tmp = `${root}.tmp-${process.pid}`;
  mkdirSync(tmp, { recursive: true });
  const manifest = { arrays: {} };
  for (const [name, arr] of Object.entries(arrays)) {
    writeFileSync(join(tmp, `${name}.bin`), Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
    manifest.arrays[name] = { type: arr.constructor.name, length: arr.length };
  }
  writeFileSync(join(tmp, 'data.json'), JSON.stringify(json));
  writeFileSync(join(tmp, 'manifest.json'), JSON.stringify(manifest));
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  renameSync(tmp, root);
  prune(dir, keep);
}

/** Keep only the `keep` most recently written cache entries. */
function prune(dir, keep) {
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.includes('.tmp-'))
    .map((e) => ({ name: e.name, mtime: statSync(join(dir, e.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const e of entries.slice(keep)) rmSync(join(dir, e.name), { recursive: true, force: true });
}

const TYPES = { Float32Array, Float64Array, Int32Array, Uint8Array, Int16Array, Uint32Array };

export function loadCache(dir, key) {
  const root = join(dir, key);
  if (!existsSync(join(root, 'manifest.json'))) return null;
  try {
    const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
    const json = JSON.parse(readFileSync(join(root, 'data.json'), 'utf8'));
    const arrays = {};
    for (const [name, { type, length }] of Object.entries(manifest.arrays)) {
      const buf = readFileSync(join(root, `${name}.bin`));
      const Type = TYPES[type];
      const copy = new Type(length);
      new Uint8Array(copy.buffer).set(buf.subarray(0, copy.byteLength));
      arrays[name] = copy;
    }
    return { json, arrays };
  } catch {
    return null;
  }
}
