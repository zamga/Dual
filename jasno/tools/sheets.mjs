#!/usr/bin/env node
/**
 * Cuts the tall full-page captures into shareable sheets (≤ 8000 px on the long side),
 * splitting at section boundaries so no section is sliced mid-way when avoidable.
 *
 *   node tools/sheets.mjs            # all four directions
 *
 * Writes screens/sheets/:
 *   0X-name-desktop-1.jpg …   2880 px wide (1440 @2x), ≤ 7600 px tall, in page order
 *   0X-name-mobile.jpg        the whole mobile page folded into side-by-side columns (390 @2x each)
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'screens', 'sheets');
fs.mkdirSync(OUT, { recursive: true });
const DIRS = ['01-napoved', '02-rentgen', '03-mera', '04-signal'];
const MAX_CSS = 3800; // 7600 device px at DPR 2

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });

/**
 * Section boundaries (CSS px) of the page as captured.
 * @param {string} dir @param {'desktop'|'mobile'} kind
 * @returns {Promise<{height:number, tops:number[]}>}
 */
async function boundaries(dir, kind) {
  const mobile = kind === 'mobile';
  const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript(() => { window.__CAPTURE__ = true; });
  const page = await ctx.newPage();
  await page.goto(`${origin}/${dir}/index.html?capture=1&shot=${kind}-full`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => window.__READY__ === true, null, { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const els = [...document.querySelectorAll('main > *, main > div > section, body > footer, body > section')];
    const tops = els.map((e) => Math.round(e.getBoundingClientRect().top + window.scrollY)).filter((t) => t > 0);
    return { height: Math.ceil(document.documentElement.scrollHeight), tops: [...new Set(tops)].sort((a, b) => a - b) };
  });
  await ctx.close();
  return r;
}

/** Greedy cut list: each piece ≤ MAX_CSS, cutting at the last section top that fits. */
function cuts(height, tops) {
  const out = [0];
  let start = 0;
  while (height - start > MAX_CSS) {
    const fit = tops.filter((t) => t > start + 600 && t <= start + MAX_CSS);
    const next = fit.length ? fit[fit.length - 1] : start + MAX_CSS;
    out.push(next);
    start = next;
  }
  out.push(height);
  return out;
}

const PY = `
import sys, json
from PIL import Image
cfg = json.loads(sys.argv[1])
im = Image.open(cfg['src']).convert('RGB')
scale = im.height / cfg['height']
pieces = [(round(a*scale), round(b*scale)) for a, b in zip(cfg['cuts'][:-1], cfg['cuts'][1:])]
if cfg['kind'] == 'desktop':
    for i, (a, b) in enumerate(pieces, 1):
        im.crop((0, a, im.width, b)).save(f"{cfg['out']}-desktop-{i}.jpg", quality=88, optimize=True, progressive=True)
    print(len(pieces))
else:
    gut, pad = 48, 64
    H = max(b - a for a, b in pieces)
    W = len(pieces) * im.width + (len(pieces) - 1) * gut + 2 * pad
    sheet = Image.new('RGB', (W, H + 2 * pad), tuple(cfg['bg']))
    for i, (a, b) in enumerate(pieces):
        sheet.paste(im.crop((0, a, im.width, b)), (pad + i * (im.width + gut), pad))
    if max(sheet.size) > 8000:
        k = 8000 / max(sheet.size)
        sheet = sheet.resize((round(sheet.width * k), round(sheet.height * k)), Image.LANCZOS)
    sheet.save(f"{cfg['out']}-mobile.jpg", quality=88, optimize=True, progressive=True)
    print(sheet.size)
`;

const BG = { '01-napoved': [228, 236, 242], '02-rentgen': [20, 22, 26], '03-mera': [233, 227, 216], '04-signal': [28, 28, 26] };
for (const dir of DIRS) {
  for (const kind of /** @type {const} */ (['desktop', 'mobile'])) {
    const src = path.join(ROOT, 'screens', dir, `${kind}-full@2x.jpg`);
    if (!fs.existsSync(src)) { console.log(`- skip ${dir} ${kind}`); continue; }
    const { height, tops } = await boundaries(dir, kind);
    const c = cuts(height, tops);
    const res = execFileSync('python3', ['-I', '-c', PY, JSON.stringify({ src, height, cuts: c, kind, out: path.join(OUT, dir), bg: BG[dir] })]).toString().trim();
    console.log(`✓ ${dir} ${kind}: ${res}  cuts=${c.join(',')}`);
  }
}
await browser.close();
server.close();
