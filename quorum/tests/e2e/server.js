// A tiny static server for web/ (no dependencies), used by scripts/e2e.js.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

export function startServer(root, port = 0) {
  const base = resolve(root);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (p === '' || p.endsWith('/')) p += 'index.html';
      const file = join(base, p);
      if (!file.startsWith(base)) throw Object.assign(new Error('forbidden'), { code: 'EACCES' });
      const s = await stat(file);
      if (!s.isFile()) throw Object.assign(new Error('not a file'), { code: 'ENOENT' });
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(await readFile(file));
    } catch (e) {
      res.writeHead(e.code === 'EACCES' ? 403 : 404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) })));
}
