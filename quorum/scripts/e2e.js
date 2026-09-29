#!/usr/bin/env node
// Playwright end-to-end check of web/ (ARCHITECTURE.md §6): every route at phone, tablet and desktop
// sizes; fails on console errors, horizontal overflow, axe-like basics and text contrast. Also checks
// the keyboard path, the hero's engines (?gl=webgl|canvas|0) and the reduced-motion path, the flat-token
// router (legacy links normalise), and the record pages' behaviour: in-browser verification, the tamper
// demo, reveal verification, sorting, and the sealed view for Free viewers.
// Usage: node scripts/e2e.js [--base http://127.0.0.1:8841/] [--sizes 390x844,834x1194,1440x900] [--quick]
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { startServer } from '../tests/e2e/server.js';
import { sampleRoutes, sampleData } from '../tests/e2e/routes.js';
import { overflow, basics, contrast } from '../tests/e2e/checks.js';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const id of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try {
      return require(id);
    } catch {
      /* next */
    }
  }
  console.error('Playwright not found: install it or set NODE_PATH to a node_modules that has it.');
  process.exit(2);
}

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]]] : acc), []),
);
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)), 'web');
const SIZES = String(args.sizes ?? '390x844,834x1194,1440x900').split(',').map((s) => s.split('x').map(Number));
const LAUNCH = ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-angle=swiftshader'];
if (process.env.E2E_SPKI) LAUNCH.push(`--ignore-certificate-errors-spki-list=${process.env.E2E_SPKI}`);

const { chromium } = loadPlaywright();
const t0 = performance.now();
const server = args.base ? null : await startServer(ROOT);
const BASE = String(args.base ?? server.url);
const routes = await sampleRoutes(resolve(ROOT, 'data'));
const failures = [];
const fail = (where, list) => list.forEach((m) => failures.push(`${where}: ${m}`));

const browser = await chromium.launch({ args: LAUNCH, executablePath: process.env.E2E_CHROMIUM || undefined });
// Console noise we cannot control (fonts blocked on an offline machine) is reported, not failed.
const ignorable = (t) => /fonts\.(googleapis|gstatic)\.com|ERR_CERT|net::ERR_(NAME|INTERNET|PROXY|TUNNEL)/.test(t);
const warnings = [];

for (const [w, h] of SIZES) {
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  let logs = [];
  page.on('console', (m) => m.type() === 'error' && logs.push(m.text()));
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => logs.push(`requestfailed ${r.url()} ${r.failure()?.errorText ?? ''}`));
  await page.goto(`${BASE}#`, { waitUntil: 'networkidle' });
  for (const r of routes) {
    logs = [];
    await page.evaluate((hash) => {
      location.hash = hash;
    }, r);
    await page.waitForFunction(() => document.querySelector('#view h1') && !document.documentElement.dataset.busy, null, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(args.quick ? 350 : 700); // view transition and header surface settle
    const where = `${r} @${w}x${h}`;
    const errs = logs.filter((l) => !ignorable(l));
    logs.filter(ignorable).forEach((l) => warnings.push(`${where}: ${l}`));
    fail(where, errs.map((e) => `console: ${e}`));
    fail(where, await page.evaluate(overflow));
    fail(where, await page.evaluate(basics));
    fail(where, await page.evaluate(contrast));
  }
  await context.close();
}

// Keyboard: skip link first, then the header, with a visible focus ring on every stop.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}#how-it-works`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#view h1');
  const stops = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    stops.push(
      await page.evaluate(() => {
        const a = document.activeElement;
        const cs = getComputedStyle(a);
        const r = a.getBoundingClientRect();
        return { tag: a.tagName, cls: a.className, text: (a.textContent || '').trim().slice(0, 30), ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2, visible: r.width > 0 && r.height > 0 };
      }),
    );
  }
  if (!String(stops[0].cls).includes('skip-link')) failures.push(`keyboard: first Tab stop is not the skip link (${stops[0].tag}.${stops[0].cls})`);
  stops.forEach((s, i) => {
    if (s.tag === 'BODY') failures.push(`keyboard: focus lost to body at stop ${i + 1}`);
    if (!s.ring) failures.push(`keyboard: no 2px focus ring on ${s.tag}.${s.cls} "${s.text}"`);
    if (!s.visible) failures.push(`keyboard: invisible focus target ${s.tag}.${s.cls}`);
  });
  await page.goto(`${BASE}#pricing`);
  await page.waitForFunction(() => document.querySelector('#view h1') && !document.documentElement.dataset.busy);
  await page.focus('.skip-link');
  await page.keyboard.press('Enter');
  const onH1 = await page.evaluate(() => document.activeElement?.tagName === 'H1');
  if (!onH1) failures.push('keyboard: the skip link does not move focus to the page heading');
  await page.close();
}

// The hero's engines and the reduced-motion path.
for (const [flag, want] of [['?gl=webgl', 'webgl'], ['?gl=canvas', 'canvas'], ['?gl=0', 'svg']]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}${flag}#`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const engine = await page.evaluate(() => document.querySelector('.lv')?.dataset.engine);
  if (engine !== want) failures.push(`hero ${flag}: engine ${engine}, expected ${want}`);
  fail(`hero ${flag}`, errs);
  await page.close();
}
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${BASE}#`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => ({ stepped: document.querySelector('.lv')?.classList.contains('is-stepped'), engine: document.querySelector('.lv')?.dataset.engine }));
  if (!r.stepped || r.engine !== 'svg') failures.push(`reduced motion: stepped=${r.stepped} engine=${r.engine}`);
  await context.close();
}

// Record pages: the router, verification, the tamper demo, reveals, sorting and the Free (sealed) view.
{
  const d = await sampleData(resolve(ROOT, 'data'));
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const ready = () => page.waitForFunction(() => document.querySelector('#view h1') && !document.documentElement.dataset.busy, null, { timeout: 15000 });
  // legacy slash links are rewritten to the flat token without a new history entry
  await page.goto(`${BASE}#/p/${d.closed.no}`, { waitUntil: 'networkidle' });
  await ready();
  const h1 = await page.evaluate(() => location.hash);
  if (h1 !== `#p-${d.closed.no}`) failures.push(`router: #/p/${d.closed.no} was not normalised (hash ${h1})`);
  // every rendered link is a flat token
  await page.goto(`${BASE}#ledger`, { waitUntil: 'networkidle' });
  await ready();
  const bad = await page.evaluate(() => [...document.querySelectorAll('a[href^="#/"]')].map((a) => a.getAttribute('href')).slice(0, 3));
  if (bad.length) failures.push(`router: old "#/" links rendered on the ledger: ${bad.join(', ')}`);
  // in-browser verification of the whole ledger
  await page.click('#chain .verify__btn');
  await page.waitForFunction(() => /intact|nepoškodovana/.test(document.querySelector('.vp__phase')?.textContent ?? ''), null, { timeout: 20000 }).catch(() => {});
  const v = await page.evaluate(() => ({ phase: document.querySelector('.vp__phase')?.textContent ?? '', bad: document.querySelectorAll('.vr__line.is-bad').length, ok: document.querySelectorAll('.vr__line.is-ok').length }));
  if (!/intact/.test(v.phase) || v.bad || v.ok < 4) failures.push(`ledger verify: ${v.phase} (ok ${v.ok}, bad ${v.bad})`);
  // the tamper demo names the forged record, then the next link once the forger rehashes it
  await page.click('.td__actions .btn:not([hidden])');
  await page.waitForSelector('.td__out .vr__line.is-bad', { timeout: 10000 }).catch(() => {});
  const t1 = await page.evaluate(() => document.querySelector('.td__out')?.textContent ?? '');
  if (!/fails at record #\d+/.test(t1)) failures.push(`tamper demo: no failing record named (${t1.slice(0, 80)})`);
  await page.click('.td__actions .btn:nth-child(2)');
  await page.waitForFunction(() => document.querySelectorAll('.td__out .vr__line.is-bad').length >= 3, null, { timeout: 10000 }).catch(() => {});
  const t2 = await page.evaluate(() => document.querySelector('.td__out')?.textContent ?? '');
  if (!/break moves to record #\d+/.test(t2)) failures.push('tamper demo: the rehash step did not move the break to the next record');
  // sorting by excess puts the best first, and says so to assistive tech
  await page.click('.lg-table th[data-sort="excess"] .lg-sort');
  const sort = await page.evaluate(() => document.querySelector('.lg-table th[data-sort="excess"]')?.getAttribute('aria-sort'));
  if (sort !== 'descending') failures.push(`ledger sort: aria-sort is ${sort}`);
  // a pick's reveal recomputes to its commitment
  await page.goto(`${BASE}#p-${d.closed.no}`, { waitUntil: 'networkidle' });
  await ready();
  await page.click('#reveal .verify__btn');
  await page.waitForFunction(() => document.querySelector('.pk-verify__status')?.dataset.state === 'ok' || document.querySelector('.pk-verify__status')?.dataset.state === 'bad', null, { timeout: 10000 }).catch(() => {});
  const rv = await page.evaluate(() => document.querySelector('.pk-verify__status')?.dataset.state);
  if (rv !== 'ok') failures.push(`pick #${d.closed.no}: reveal verification ${rv}`);
  fail('record pages', errs);
  await context.close();
  // Free viewers see an open pick sealed: no ticker, name or thesis anywhere on the page
  const free = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const fp = await free.newPage();
  await fp.goto(`${BASE}?tier=free#p-${d.open.no}`, { waitUntil: 'networkidle' });
  await fp.waitForFunction(() => document.querySelector('#view h1'), null, { timeout: 15000 });
  const leak = await fp.evaluate((p) => {
    const text = document.querySelector('#view').textContent;
    return [p.ticker, p.name].filter((x) => x && new RegExp(`\\b${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text));
  }, { ticker: d.open.ticker, name: d.open.name });
  if (leak.length) failures.push(`free view of open pick #${d.open.no} leaks: ${leak.join(', ')}`);
  await fp.goto(`${BASE}?tier=free#ledger`, { waitUntil: 'networkidle' });
  await fp.waitForFunction(() => document.querySelector('.lg-table'), null, { timeout: 15000 });
  const leak2 = await fp.evaluate((t) => [...document.querySelectorAll('.lg-row.is-sealed')].some((r) => r.textContent.includes(t)), d.open.ticker);
  if (leak2) failures.push(`free ledger leaks the open ticker ${d.open.ticker}`);
  await free.close();
}

await browser.close();
await server?.close();
const secs = ((performance.now() - t0) / 1000).toFixed(1);
if (warnings.length) console.log(`${warnings.length} ignorable network warnings (fonts offline?)`);
if (failures.length) {
  console.log(failures.join('\n'));
  console.log(`\ne2e: ${failures.length} problem(s), ${routes.length} routes x ${SIZES.length} sizes, ${secs}s`);
  process.exit(1);
}
console.log(`e2e: ok, ${routes.length} routes x ${SIZES.length} sizes + keyboard + hero engines + reduced motion, ${secs}s`);
