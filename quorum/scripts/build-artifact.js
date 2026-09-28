// Prepares web/ for publishing as a claude.ai Artifact.
// The Artifact host wraps the page in its own <!doctype>/<html>/<head>/<body> skeleton (with charset
// and viewport already set), so the published index.html carries only the head's links and the body's
// content. Every other file is copied unchanged and published beside it.
//
//   node scripts/build-artifact.js --out <dir>
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'web');
const outArg = process.argv.indexOf('--out');
const out = outArg > 0 ? process.argv[outArg + 1] : join(root, 'dist', 'artifact');
const TITLE = 'Quorum Research';

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files.push(...walk(p));
    else files.push(p);
  }
  return files;
}

export function toArtifactPage(html) {
  const head = /<head>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? '';
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? '';
  // The host skeleton already sets charset and viewport; the gallery reads our <title>.
  const keptHead = head
    .split('\n')
    .filter((line) => !/<meta charset|<meta name="viewport"|<title>/i.test(line))
    .join('\n');
  return `<title>${TITLE}</title>\n${keptHead.trim()}\n${body.trim()}\n`;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const published = [];
for (const src of walk(web)) {
  const rel = relative(web, src);
  if (rel.startsWith('.') || rel.endsWith('.DS_Store')) continue;
  const dst = join(out, rel);
  mkdirSync(dirname(dst), { recursive: true });
  if (rel === 'index.html') writeFileSync(dst, toArtifactPage(readFileSync(src, 'utf8')));
  else {
    copyFileSync(src, dst);
    published.push(rel);
  }
}
writeFileSync(join(out, 'files.json'), `${JSON.stringify(published.sort(), null, 2)}\n`);
const bytes = walk(out).reduce((n, f) => n + statSync(f).size, 0);
console.log(`build-artifact: ${published.length + 1} files, ${(bytes / 1e6).toFixed(2)} MB -> ${out}`);
