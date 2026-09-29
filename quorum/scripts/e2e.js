#!/usr/bin/env node
// Playwright end-to-end check of web/ (ARCHITECTURE.md §6): every route at the five design sizes (DESIGN.md
// §14); fails on console errors, horizontal overflow, axe-like basics, text contrast, a rule through a
// number, a rule that is not faint where it passes behind running text (ruleContrast), a text ground that does not match its surface, and copy contracts.
// The launch states: key pages again with backtest.json patched to "ready" and to back-in-research, and
// meta.notes.simulation present (web/js/launch.js; nothing may say a text was sent). Also checks
// the keyboard path, the hero's engines (?gl=webgl|canvas|0) and the reduced-motion path, the flat-token
// router (legacy links normalise), and the record pages' behaviour: in-browser verification, the tamper
// demo, reveal verification, sorting, and the sealed view for Free viewers.
// Usage: node scripts/e2e.js [--base http://127.0.0.1:8841/] [--sizes 390x844,834x1194,1440x900,1920x1080,360x780] [--quick]
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { startServer } from '../tests/e2e/server.js';
import { sampleRoutes, sampleData } from '../tests/e2e/routes.js';
import { overflow, basics, contrast, ruleStrike, ruleContrast, groundMismatch, copyChecks } from '../tests/e2e/checks.js';
import { liveChecks } from '../tests/e2e/live.js';

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
const SIZES = String(args.sizes ?? '390x844,834x1194,1440x900,1920x1080,360x780').split(',').map((s) => s.split('x').map(Number));
const LAUNCH = ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-angle=swiftshader'];
if (process.env.E2E_SPKI) LAUNCH.push(`--ignore-certificate-errors-spki-list=${process.env.E2E_SPKI}`);

const { chromium } = loadPlaywright();
const t0 = performance.now();
const server = args.base ? null : await startServer(ROOT);
const BASE = String(args.base ?? server.url);
const routes = await sampleRoutes(resolve(ROOT, 'data'));
// No page may say a text was sent, in any launch state: there are no subscribers (tests/e2e/checks.js copyChecks).
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
    fail(where, await page.evaluate(ruleStrike));
    fail(where, await page.evaluate(ruleContrast));
    fail(where, await page.evaluate(groundMismatch));
    fail(where, await page.evaluate(copyChecks));
  }
  await context.close();
}

// Launch states (web/js/launch.js): the pages that read the launch block, with backtest.json patched to each
// state and meta.notes.simulation present. "ready" must name the engine launch gate and the brief's other
// gates, keep the checkout a labelled preview, and never say a text was sent; the simulation note sits near
// the top of #methodology and #backtest and the footer's demo line links to it.
{
  const bt = JSON.parse(await readFile(resolve(ROOT, 'data', 'backtest.json'), 'utf8'));
  const meta = JSON.parse(await readFile(resolve(ROOT, 'data', 'meta.json'), 'utf8'));
  const simMeta = { ...meta, notes: { ...(meta.notes ?? {}), simulation: meta.notes?.simulation ?? { en: 'Test note: every company, price and result here comes from a simulated market.', sl: 'Testna opomba: vsa podjetja, cene in rezultati izhajajo iz simuliranega trga.' } } };
  const pass = (g) => ({ ...g, pass: true });
  const l = bt.launch ?? {};
  const ready = {
    ...bt,
    gates: (bt.gates ?? []).map((g) => (g.id === 'd' ? g : pass(g))),
    launch: {
      ...l,
      status: 'ready',
      holdoutGates: (l.holdoutGates ?? []).map((g) => (g.id === 'd' ? g : pass(g))),
      d1: { ...(l.d1 ?? {}), dsrResearch: Math.max(0.96, l.d1?.dsrResearch ?? 0), pass: true },
      d2: { ...(l.d2 ?? {}), psr: Math.max(0.96, l.d2?.psr ?? 0), pass: true },
      remaining: { en: 'Nothing on the engine side: SMS alerts can launch once the legal, research-tier and data gates are met.', sl: 'S strani pogona nič: obvestila SMS se lahko zaženejo, ko bodo izpolnjeni še pravni, raziskovalni in podatkovni pogoji.' },
    },
  };
  const research = { ...bt, launch: { ...l, status: 'pre-launch', holdoutGates: (l.holdoutGates ?? [{ id: 'b', pass: false }]).map((g) => (g.id === 'b' ? { ...g, pass: false } : g)), remaining: undefined } };
  const want = {
    ready: { '#backtest': /Engine launch gate[\s\S]*engine gate passes[\s\S]*legal/i, '#pricing': /engine gate passed[\s\S]*legal review, data licences/i, '#join': /engine launch gate passes/i, '#app': /engine gate passed/i, '#status': /engine gate has passed/i, '#methodology': /engine launch gate passes/i, '#': /engine launch gate has passed/i },
    research: { '#backtest': /Back to research/, '#pricing': /back in research/, '#join': /back in research/, '#status': /back in research/ },
  };
  for (const [state, data] of [['ready', ready], ['research', research]]) {
    for (const [w, hgt] of [[1440, 900], [390, 844]]) {
      const context = await browser.newContext({ viewport: { width: w, height: hgt } });
      await context.route(/\/data\/backtest\.json$/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }));
      await context.route(/\/data\/meta\.json$/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(simMeta) }));
      const page = await context.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.goto(`${BASE}#`, { waitUntil: 'networkidle' });
      for (const r of ['#', '#backtest', '#methodology', '#pricing', '#join', '#app', '#status']) {
        await page.evaluate((hash) => (location.hash = hash), r);
        await page.waitForFunction(() => document.querySelector('#view h1') && !document.documentElement.dataset.busy, null, { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(args.quick ? 350 : 600);
        const where = `launch ${state} ${r} @${w}`;
        fail(where, await page.evaluate(copyChecks));
        fail(where, await page.evaluate(overflow));
        fail(where, await page.evaluate(ruleContrast));
        const text = await page.evaluate(() => document.querySelector('#view').innerText);
        if (want[state][r] && !want[state][r].test(text)) failures.push(`${where}: the ${state} copy is missing (${want[state][r]})`);
        if (/Paid SMS is open|Launched\b|Zagnano\b/.test(text)) failures.push(`${where}: says SMS has launched`);
        const foot = await page.evaluate(() => document.querySelector('.footer-demo a')?.getAttribute('href'));
        if (foot !== '#methodology~simulation') failures.push(`${where}: the footer demo line does not link to the simulation note (${foot})`);
        if (['#methodology', '#backtest'].includes(r)) {
          const top = await page.evaluate(() => {
            const n = document.querySelector('#simulation');
            const s = document.querySelectorAll('#view section');
            return n ? [...s].indexOf(n) : -1;
          });
          if (top < 0 || top > 1) failures.push(`${where}: the simulation note is not near the top (section index ${top})`);
        }
      }
      if (state === 'ready') {
        await page.evaluate(() => (location.hash = '#join'));
        await page.waitForFunction(() => document.querySelector('#view h1') && !document.documentElement.dataset.busy, null, { timeout: 10000 }).catch(() => {});
        const box = await page.evaluate(() => document.querySelector('.m-launch')?.innerText ?? '');
        if (!/engine gate passed/i.test(box) || !/legal review/i.test(box)) failures.push(`launch ready #join @${w}: the launch line reads "${box.slice(0, 120)}"`);
      }
      fail(`launch ${state} @${w}`, errs);
      await context.close();
    }
  }
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

// The hero's engines (the Assembly, DESIGN-V2 §4.1) and the reduced-motion path. Every engine walks the
// six states; none may render a frame while the hero is off-screen (section.asmStats counts them).
for (const [flag, want, api] of [['?gl=webgl', 'webgl', 'webgl2'], ['?gl=webgl1', 'webgl', 'webgl1'], ['?gl=canvas', 'canvas', '2d'], ['?gl=0', 'svg', 'svg']]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !ignorable(m.text()) && errs.push(m.text()));
  await page.goto(`${BASE}${flag}#`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => ({ engine: document.querySelector('.lv')?.dataset.engine, api: document.querySelector('.asm')?.asmStats?.api }));
  if (r.engine !== want || r.api !== api) failures.push(`hero ${flag}: engine ${r.engine}/${r.api}, expected ${want}/${api}`);
  const steps = [];
  for (const [i, p] of [0.03, 0.27, 0.48, 0.62, 0.8, 0.99].entries()) {
    await page.evaluate((p) => {
      const s = document.querySelector('.asm');
      scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * p);
    }, p);
    // a loaded software renderer may take a few frames to catch up: wait for the state, then read it
    await page.waitForFunction((i) => document.querySelector('.asm')?.dataset.step === String(i), i, { timeout: 4000 }).catch(() => {});
    steps.push(await page.evaluate(() => document.querySelector('.asm')?.dataset.step));
  }
  if (steps.join('') !== '012345') failures.push(`hero ${flag}: states ${steps.join('')}, expected 012345`);
  // off-screen: scroll past the hero, idle, and count frames
  await page.evaluate(() => scrollTo(0, document.querySelector('.asm').offsetHeight + innerHeight * 2));
  await page.waitForFunction(() => document.querySelector('.asm').asmStats.visible === false, null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(300);
  const f0 = await page.evaluate(() => document.querySelector('.asm').asmStats.frames);
  await page.mouse.move(200, 200);
  await page.mouse.move(900, 500);
  await page.evaluate(() => scrollBy(0, 40));
  await page.waitForTimeout(800);
  const st = await page.evaluate(() => document.querySelector('.asm').asmStats);
  if (st.frames !== f0 || st.offscreen !== 0) failures.push(`hero ${flag}: ${st.frames - f0} frames rendered off-screen (counter ${st.offscreen})`);
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

// Live mode: the Node server's redaction, an anonymous visitor (skipped with --base or --no-live).
if (!args.base && !args['no-live']) {
  try {
    await liveChecks({ browser, webRoot: ROOT, fail });
  } catch (e) {
    failures.push(`live mode: ${e.stack || e.message}`);
  }
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
