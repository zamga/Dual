// Self-hosted fonts for live mode. The static site (web/index.html, published as an Artifact) loads
// Archivo, Newsreader and Martian Mono from Google Fonts (docs/ARCHITECTURE.md §5); the live server
// must not make every visitor's browser contact a third party (IP address transfer, LG München I,
// 3 O 17493/20), so static.js swaps that stylesheet for /fonts/fonts.css and the files below are
// served from this origin. The server's own pages (opt-out, sign-in, approver console) use them too.
//
//   GET /fonts/:file   fonts.css, the woff2 files it names, and the OFL licence texts
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HttpError } from './http.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fonts');
export const FONT_STYLESHEET = '/fonts/fonts.css';
const FILE_RE = /^(?:fonts\.css|[a-z-]+\.woff2|OFL-[a-z-]+\.txt)$/;
const TYPES = { css: 'text/css; charset=utf-8', woff2: 'font/woff2', txt: 'text/plain; charset=utf-8' };

// The Google Fonts <link> tags of web/index.html (preconnects and the css2 stylesheet).
const GOOGLE_LINK_RE = /[ \t]*<link\b[^>]*\bhref=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"']*["'][^>]*>[ \t]*\r?\n?/gi;

// selfHostFonts(html) -> html without any Google Fonts link and with the local stylesheet instead
// (placed where the Google stylesheet was, so the cascade order is unchanged). Idempotent.
export function selfHostFonts(html) {
  if (html.includes(`href="${FONT_STYLESHEET}"`)) return html.replace(GOOGLE_LINK_RE, '');
  let placed = false;
  const out = html.replace(GOOGLE_LINK_RE, (tag) => {
    if (placed || !/rel=["']stylesheet["']/i.test(tag) || !/fonts\.googleapis\.com\/css/i.test(tag)) return '';
    placed = true;
    const indent = /^[ \t]*/.exec(tag)[0];
    return `${indent}<link rel="stylesheet" href="${FONT_STYLESHEET}" />\n`;
  });
  return placed ? out : out.replace(/<\/head>/i, `  <link rel="stylesheet" href="${FONT_STYLESHEET}" />\n  </head>`);
}

export function registerFontRoutes(router) {
  const cache = new Map();
  router.add('GET', '/fonts/:file', async (req, res, { params }) => {
    const name = params.file;
    if (!FILE_RE.test(name)) throw new HttpError(404, 'not_found', 'Not found');
    let body = cache.get(name);
    if (!body) {
      try {
        body = await readFile(join(DIR, name));
      } catch {
        throw new HttpError(404, 'not_found', 'Not found');
      }
      cache.set(name, body);
    }
    const ext = name.split('.').pop();
    res.writeHead(200, {
      'content-type': TYPES[ext],
      'content-length': body.length,
      'cache-control': ext === 'woff2' ? 'public, max-age=604800' : 'public, max-age=3600',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
    return undefined;
  });
}
