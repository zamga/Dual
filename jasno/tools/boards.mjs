#!/usr/bin/env node
/**
 * Presentation boards from the captured screenshots.
 *
 *   node tools/boards.mjs
 *
 * Writes screens/boards/:
 *   00-overview.jpg          the four directions side by side (desktop heroes)
 *   0X-name-board.jpg        per direction: desktop hero + three mobile frames + the idea in one line
 *   0X-name-scroll.jpg       per direction: the full desktop page next to the full mobile page
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'screens', 'boards');
fs.mkdirSync(OUT, { recursive: true });

/** @type {{dir:string,no:string,name:string,idea:string,ideaEn:string,line:string,bg:string,fg:string,muted:string,font:string,fontCss:string}[]} */
const DIRECTIONS = [
  { dir: '01-napoved', no: '01', name: 'Napoved', idea: 'Tveganje je vreme.', ideaEn: 'Risk is weather.', line: 'Credit risk read like a weather forecast: isobars, pressure systems and storm warnings for every company.', bg: '#E4ECF2', fg: '#0F1720', muted: '#4B5967', font: "'Mona Sans'", fontCss: 'mona-sans.css' },
  { dir: '02-rentgen', no: '02', name: 'Rentgen', idea: 'Kar podjetje pove. Kar podjetje je.', ideaEn: 'What a company says. What a company is.', line: 'An X-ray lens over the glossy facade of a company reveals its skeleton: blockades, debts, late payments.', bg: '#07090C', fg: '#ECE6D9', muted: '#9AA6B2', font: "'Geist'", fontCss: 'geist.css' },
  { dir: '03-mera', no: '03', name: 'Mera', idea: 'Zaupanje, izmerjeno.', ideaEn: 'Trust, measured.', line: 'Trust gets a unit. A meticulously typeset financial journal with monumental numerals and precision rulers.', bg: '#F2EEE6', fg: '#151413', muted: '#5E5850', font: "'Schibsted Grotesk'", fontCss: 'schibsted-grotesk.css' },
  { dir: '04-signal', no: '04', name: 'Signal', idea: 'Tveganje se ne najavi. Mi ga.', ideaEn: 'Risk doesn\'t announce itself. We do.', line: 'The Slovenian economy as a live departures board: every change, every morning at 6.00, flipping into view.', bg: '#0B0B0A', fg: '#F4F1E8', muted: '#8A877F', font: "'JetBrains Mono'", fontCss: 'jetbrains-mono.css' },
];

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const pages = new Map();
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (pages.has(url.pathname)) { res.writeHead(200, { 'content-type': MIME['.html'] }); return res.end(pages.get(url.pathname)); }
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

const has = (d, f) => fs.existsSync(path.join(ROOT, 'screens', d, f));
const shot = (d, f) => `/screens/${d}/${f}`;

const BASE_CSS = `
  @import url('/shared/fonts/geist.css'); @import url('/shared/fonts/geist-mono.css');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Geist',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  .label{font-family:'Geist Mono',monospace;font-size:13px;letter-spacing:.08em;text-transform:uppercase}
  .frame{border-radius:14px;overflow:hidden;box-shadow:0 1px 0 rgba(255,255,255,.06) inset,0 40px 80px -30px rgba(0,0,0,.45),0 12px 24px -12px rgba(0,0,0,.3)}
  .frame img{display:block;width:100%}
  .phone{border-radius:34px;overflow:hidden;position:relative;box-shadow:0 0 0 7px #111,0 0 0 8px #333,0 40px 80px -24px rgba(0,0,0,.55)}
  .phone img{display:block;width:100%;position:absolute;left:0;top:0}
`;

/**
 * Finds where the report and pricing sections start on the 390-wide capture so the phone frames show them.
 * @param {string} dir
 * @returns {Promise<number[]>} CSS-pixel offsets for phones 2 and 3
 */
async function mobileOffsets(dir) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { window.__CAPTURE__ = true; });
  const page = await ctx.newPage();
  await page.goto(`${origin}/${dir}/index.html?capture=1&shot=mobile-full`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => window.__READY__ === true, null, { timeout: 12000 }).catch(() => {});
  const offsets = await page.evaluate(() => {
    const sections = [...document.querySelectorAll('main section, main > article, main > div > section')];
    const find = (re) => sections.find((s) => re.test(s.textContent || ''));
    const top = (el) => (el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null);
    const report = find(/UGOTOVITVE|Razlogi za oceno|Zakaj\?|ZAKAJ\?/i);
    const pricing = find(/39\s?€/);
    const H = document.documentElement.scrollHeight;
    return [top(report) ?? Math.round(H * 0.4), top(pricing) ?? Math.round(H * 0.7)];
  });
  await ctx.close();
  return offsets;
}

async function render(name, html, width, height, dpr = 2) {
  const route = `/__board/${name}.html`;
  pages.set(route, html);
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  await page.goto(origin + route, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 90, fullPage: h > height });
  await ctx.close();
  console.log(`✓ boards/${name}.jpg`);
}

/* Per-direction board: hero + three phones (mobile frames cropped from the full mobile capture). */
for (const d of DIRECTIONS) {
  if (!has(d.dir, 'desktop-hero@2x.png')) { console.log(`- skip ${d.dir} (no captures yet)`); continue; }
  const mobileFull = has(d.dir, 'mobile-full@2x.jpg');
  const phoneW = 270, phoneH = Math.round(phoneW * 844 / 390);
  // offsets in CSS px of the 390-wide page → scaled to phone width
  const k = phoneW / 390;
  const offsets = mobileFull ? [0, ...(await mobileOffsets(d.dir))] : [];
  const phones = mobileFull
    ? offsets.map((o, i) => `<div class="phone" style="width:${phoneW}px;height:${phoneH}px"><img src="${i === 0 && has(d.dir, 'mobile-hero@3x.png') ? shot(d.dir, 'mobile-hero@3x.png') : shot(d.dir, 'mobile-full@2x.jpg')}" style="transform:translateY(${i === 0 ? 0 : -Math.round(o * k)}px)"></div>`).join('')
    : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    @import url('/shared/fonts/${d.fontCss}');
    body{background:${d.bg};color:${d.fg};width:2000px;padding:64px 72px 80px;display:grid;grid-template-rows:auto auto;gap:44px}
    header{display:flex;justify-content:space-between;align-items:flex-end;gap:40px}
    .idea{font-family:${d.font},'Geist',sans-serif;font-size:44px;line-height:1.05;letter-spacing:-.02em;max-width:820px}
    .meta{color:${d.muted};max-width:560px;font-size:17px;line-height:1.45;text-align:right}
    .stage{display:grid;grid-template-columns:942px auto;gap:48px;align-items:center}
    .phones{display:flex;gap:28px;padding-top:6px}
  </style></head><body>
    <header><div><div class="label" style="color:${d.muted};margin-bottom:14px">Jasno · Direction ${d.no} · ${d.name}</div><div class="idea">${d.idea}</div><div style="color:${d.muted};font-size:20px;margin-top:10px">${d.ideaEn}</div></div>
      <div class="meta">${d.line}<div class="label" style="margin-top:12px">Desktop 1440 · Mobile 390</div></div></header>
    <div class="stage"><div class="frame" style="width:${phones ? 942 : 1856}px"><img src="${shot(d.dir, 'desktop-hero@2x.png')}"></div><div class="phones">${phones}</div></div>
  </body></html>`;
  await render(`${d.dir}-board`, html, 2000, 700);

  /* Scroll board: full desktop page + full mobile page side by side. */
  if (has(d.dir, 'desktop-full@2x.jpg') && mobileFull) {
    const html2 = `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
      body{background:${d.bg};color:${d.fg};width:2000px;padding:64px 72px}
      .row{display:flex;gap:56px;align-items:flex-start;margin-top:40px}
      .frame.full{width:1280px}.frame.mob{width:420px;border-radius:24px}
    </style></head><body>
      <div class="label" style="color:${d.muted}">Jasno · Direction ${d.no} · ${d.name} · Full page, desktop 1440 + mobile 390</div>
      <div class="row"><div class="frame full"><img src="${shot(d.dir, 'desktop-full@2x.jpg')}"></div><div class="frame mob"><img src="${shot(d.dir, 'mobile-full@2x.jpg')}"></div></div>
    </body></html>`;
    await render(`${d.dir}-scroll`, html2, 2000, 1250, 1);
  }
}

/* Overview: 2×2 grid of heroes. */
const ready = DIRECTIONS.filter((d) => has(d.dir, 'desktop-hero@2x.png'));
if (ready.length) {
  const cells = ready.map((d) => `<figure>
      <div class="frame"><img src="${shot(d.dir, 'desktop-hero@2x.png')}"></div>
      <figcaption><span class="label">${d.no} · ${d.name}</span><span class="idea">${d.idea}</span><span class="en">${d.ideaEn}</span></figcaption></figure>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    body{background:#E9E8E4;color:#121212;width:2000px;padding:72px 80px 88px}
    h1{font-weight:600;font-size:56px;letter-spacing:-.035em;line-height:1}
    .sub{color:#5b5b57;font-size:19px;margin-top:14px;max-width:900px;line-height:1.45}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:56px 48px;margin-top:56px}
    figure{display:grid;gap:18px}
    figcaption{display:flex;gap:18px;align-items:baseline}
    figcaption .label{color:#6b6b66}
    figcaption .idea{font-size:24px;font-weight:500;letter-spacing:-.02em}
    figcaption .en{color:#6b6b66;font-size:18px}
  </style></head><body>
    <div class="label" style="color:#6b6b66;margin-bottom:18px">Jasno · credit intelligence for Slovenia · 4 creative directions</div>
    <h1>Four directions for Jasno</h1>
    <p class="sub">One brand, one product, four ideas. Every direction is a complete, working landing page; these are their first screens at 1440 px.</p>
    <div class="grid">${cells}</div>
  </body></html>`;
  await render('00-overview', html, 2000, 1400);
}

await browser.close();
server.close();
