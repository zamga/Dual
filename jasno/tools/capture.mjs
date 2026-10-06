#!/usr/bin/env node
/**
 * Jasno — screenshot pipeline.
 *
 *   node tools/capture.mjs <design-dir> [--shots=desktop-hero,desktop-full,mobile-hero,mobile-full]
 *                                       [--mouse=0.62,0.45] [--wait=900] [--params=key=value&k2=v2]
 *
 * Serves jasno/ over HTTP (fonts need a real origin), opens <design-dir>/index.html?capture=1,
 * waits for document.fonts and window.__READY__, then writes to screens/<design-dir>/:
 *   desktop-hero@2x.png     1440×900 viewport, DPR 2
 *   desktop-full@2x.jpg     whole page, 1440 wide, DPR 2 (captured in segments, stitched)
 *   desktop-full.jpg        same, downscaled to 1x
 *   mobile-hero@3x.png      390×844 viewport, DPR 3
 *   mobile-full@2x.jpg      whole page, 390 wide, DPR 2
 *   review/*.jpg            1x slices for quick visual review (desktop 1440×1000, mobile 4-up strips)
 *
 * Pages read `capture=1` (or window.__CAPTURE__) and render every section in its final, composed
 * state: no smooth scroll, no hidden reveals, deterministic frame for generative visuals.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
if (!dir || !fs.existsSync(path.join(ROOT, dir, 'index.html'))) {
  console.error('usage: node tools/capture.mjs <design-dir> [--shots=..] [--mouse=x,y] [--wait=ms] [--params=a=b]');
  process.exit(1);
}
const opt = Object.fromEntries(
  args.filter((a) => a.startsWith('--')).map((a) => {
    const [k, ...v] = a.slice(2).split('=');
    return [k, v.join('=') || true];
  }),
);
const SHOTS = (opt.shots || 'desktop-hero,desktop-full,mobile-hero,mobile-full').split(',');
const EXTRA_WAIT = Number(opt.wait || 900);
const MOUSE = opt.mouse ? opt.mouse.split(',').map(Number) : null;
const OUT = path.join(ROOT, 'screens', dir);
fs.mkdirSync(path.join(OUT, 'review'), { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/${dir}/index.html?capture=1${opt.params ? '&' + opt.params : ''}`;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

async function open(kind, dpr, shot) {
  const ctx = await browser.newContext({ ...DEVICES[kind], deviceScaleFactor: dpr, reducedMotion: 'no-preference' });
  await ctx.addInitScript(() => { window.__CAPTURE__ = true; });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`  [${kind}:${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => console.log(`  [${kind}:pageerror] ${e.message}`));
  page.on('requestfailed', (r) => console.log(`  [${kind}:requestfailed] ${r.url()}`));
  await page.goto(`${base}&shot=${shot}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => window.__READY__ === true, null, { timeout: 12000 }).catch(() => console.log(`  [${kind}] __READY__ not set within 12s, capturing anyway`));
  if (MOUSE && kind === 'desktop') {
    const { width, height } = DEVICES.desktop.viewport;
    await page.mouse.move(width * MOUSE[0], height * MOUSE[1], { steps: 12 });
  }
  await page.waitForTimeout(EXTRA_WAIT);
  return { ctx, page };
}

async function fullPage(kind, dpr, outName) {
  const { ctx, page } = await open(kind, dpr, `${kind}-full`);
  const width = DEVICES[kind].viewport.width;
  const height = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
  const SEG = 3000;
  const parts = [];
  for (let y = 0, i = 0; y < height; y += SEG, i++) {
    const h = Math.min(SEG, height - y);
    const p = path.join(OUT, `.seg-${kind}-${i}.png`);
    await page.screenshot({ path: p, fullPage: true, clip: { x: 0, y, width, height: h } });
    parts.push(p);
  }
  await ctx.close();
  return { parts, height };
}

const PY_STITCH = `
import sys, json
from PIL import Image
cfg = json.loads(sys.argv[1])
ims = [Image.open(p).convert('RGB') for p in cfg['parts']]
W = ims[0].width; H = sum(i.height for i in ims)
canvas = Image.new('RGB', (W, H))
y = 0
for im in ims:
    canvas.paste(im, (0, y)); y += im.height
canvas.save(cfg['out'], quality=90, optimize=True, progressive=True)
one = canvas.resize((cfg['cssw'], round(H * cfg['cssw'] / W)), Image.LANCZOS)
if cfg.get('out1x'):
    one.save(cfg['out1x'], quality=88, optimize=True, progressive=True)
# review slices
rv = cfg['review']
if cfg['kind'] == 'desktop':
    sh = 1000
    n = 0
    for top in range(0, one.height, sh):
        one.crop((0, top, one.width, min(one.height, top + sh))).save(f"{rv}/desktop-{n:02d}.jpg", quality=84); n += 1
else:
    sh = 844
    tiles = [one.crop((0, t, one.width, min(one.height, t + sh))) for t in range(0, one.height, sh)]
    for k in range(0, len(tiles), 4):
        grp = tiles[k:k+4]
        strip = Image.new('RGB', (one.width * 4 + 30, sh), (128, 128, 128))
        for j, t in enumerate(grp): strip.paste(t, (j * (one.width + 10), 0))
        strip.save(f"{rv}/mobile-{k//4:02d}.jpg", quality=84)
print(W, H)
`;

function stitch(kind, parts, out, out1x, cssw) {
  for (const f of fs.readdirSync(path.join(OUT, 'review'))) if (f.startsWith(kind)) fs.unlinkSync(path.join(OUT, 'review', f));
  const res = execFileSync('python3', ['-I', '-c', PY_STITCH, JSON.stringify({ parts, out, out1x, cssw, kind, review: path.join(OUT, 'review') })]).toString().trim();
  parts.forEach((p) => fs.unlinkSync(p));
  return res;
}

for (const shot of SHOTS) {
  const t0 = Date.now();
  if (shot === 'desktop-hero' || shot === 'mobile-hero') {
    const kind = shot.split('-')[0];
    const dpr = kind === 'desktop' ? 2 : 3;
    const { ctx, page } = await open(kind, dpr, shot);
    await page.screenshot({ path: path.join(OUT, `${shot}@${dpr}x.png`) });
    await ctx.close();
  } else if (shot === 'desktop-full' || shot === 'mobile-full') {
    const kind = shot.split('-')[0];
    const { parts } = await fullPage(kind, 2, shot);
    const size = stitch(kind, parts, path.join(OUT, `${shot}@2x.jpg`), kind === 'desktop' ? path.join(OUT, `${shot}.jpg`) : null, DEVICES[kind].viewport.width);
    console.log(`  ${shot}: ${size}`);
  }
  console.log(`✓ ${dir} ${shot} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

await browser.close();
server.close();
