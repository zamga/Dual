#!/usr/bin/env node
// Runs the member-page flows (tests/e2e/member.js) against web/ in demo mode.
// Usage: node tests/e2e/member-run.js [--sizes 390x844,1440x900] [--base URL]
// (scripts/e2e.js covers every route at rest; this covers the interactive states of #join, #app,
// #app-research, #account, #u-TOKEN and #status.) Set E2E_SPKI behind an intercepting proxy.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { startServer } from './server.js';
import { memberChecks } from './member.js';

const require = createRequire(import.meta.url);
const { chromium } = (() => {
  for (const id of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try {
      return require(id);
    } catch {
      /* next */
    }
  }
  console.error('Playwright not found.');
  process.exit(2);
})();

const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)), 'web');
const sizes = String(opt('--sizes', '390x844,1440x900')).split(',').map((s) => s.split('x').map(Number));
const LAUNCH = ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-angle=swiftshader'];
if (process.env.E2E_SPKI) LAUNCH.push(`--ignore-certificate-errors-spki-list=${process.env.E2E_SPKI}`);

const t0 = performance.now();
const server = opt('--base') ? null : await startServer(ROOT);
const base = String(opt('--base', server?.url));
const browser = await chromium.launch({ args: LAUNCH, executablePath: process.env.E2E_CHROMIUM || undefined });
const failures = [];
const fail = (where, list) => list.forEach((m) => failures.push(`${where}: ${m}`));
try {
  await memberChecks({ browser, base, sizes, fail });
} catch (e) {
  failures.push(`crashed: ${e.stack || e.message}`);
}
await browser.close();
await server?.close();
const secs = ((performance.now() - t0) / 1000).toFixed(1);
if (failures.length) {
  console.log(failures.join('\n'));
  console.log(`\nmember e2e: ${failures.length} problem(s), ${sizes.length} sizes, ${secs}s`);
  process.exit(1);
}
console.log(`member e2e: ok, ${sizes.map((s) => s.join('x')).join(', ')}, ${secs}s`);
