// Static files from web/. index.html gets <meta name="quorum-mode" content="live"> so the site
// calls /api instead of running the demo. web/data is never served from here (see data.js).
import { readFile, stat } from 'node:fs/promises';
import { extname, normalize, resolve, sep } from 'node:path';

export const LIVE_META = '<meta name="quorum-mode" content="live" />';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// injectLiveMode(html) -> html with the live-mode meta as the first element of <head> (idempotent)
export function injectLiveMode(html) {
  if (/<meta\s+name=["']quorum-mode["']/i.test(html)) {
    return html.replace(/<meta\s+name=["']quorum-mode["'][^>]*>/i, LIVE_META);
  }
  const m = /<head[^>]*>/i.exec(html);
  if (!m) return `${LIVE_META}\n${html}`;
  const at = m.index + m[0].length;
  return `${html.slice(0, at)}\n    ${LIVE_META}${html.slice(at)}`;
}

export function createStatic(root, { live = true } = {}) {
  const base = resolve(root);
  let indexCache = null;

  // serve(req, res, pathname) -> Promise<boolean> (false when there is no such file)
  async function serve(req, res, pathname) {
    let p;
    try {
      p = decodeURIComponent(pathname);
    } catch {
      return false;
    }
    if (p.includes('\0')) return false;
    p = normalize(p).replace(/^([/\\])+/, '');
    if (p === '' || p.endsWith('/') || p.endsWith(sep)) p += 'index.html';
    const top = p.split(/[/\\]/)[0];
    if (top === 'data' || p.startsWith('.') || p.split(/[/\\]/).some((seg) => seg.startsWith('.'))) return false;
    const file = resolve(base, p);
    if (file !== base && !file.startsWith(base + sep)) return false;
    let s;
    try {
      s = await stat(file);
    } catch {
      return false;
    }
    if (!s.isFile()) return false;
    const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
    let body;
    if (p === 'index.html') {
      if (!indexCache || indexCache.mtimeMs !== s.mtimeMs) {
        const html = await readFile(file, 'utf8');
        indexCache = { mtimeMs: s.mtimeMs, body: Buffer.from(live ? injectLiveMode(html) : html) };
      }
      body = indexCache.body;
    } else {
      body = await readFile(file);
    }
    res.writeHead(200, {
      'content-type': type,
      'content-length': body.length,
      'cache-control': p === 'index.html' ? 'no-cache' : 'public, max-age=300',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  }

  return { serve, root: base };
}

