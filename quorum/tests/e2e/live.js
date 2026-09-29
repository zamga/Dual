// Live mode (the Node server serving web/ with <meta name="quorum-mode" content="live">): an anonymous
// visitor tours the record pages. The server redacts open picks (sealed: true, no ticker) and the pages
// must treat them as sealed whatever the demo's view-as tier would have been: no crash, no leak, and no
// "View as" switch (it is a demo control).
//
//   liveChecks({ browser, webRoot, fail }) -> Promise<void>
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { basics, overflow } from './checks.js';

export async function liveChecks({ browser, webRoot, fail }) {
  const { makeApp } = await import('../server/helpers.js');
  const t = await makeApp({
    webRoot,
    config: { publicBaseUrl: 'http://127.0.0.1', rateLimits: { data: { capacity: 100000, windowMs: 60000 }, api: { capacity: 100000, windowMs: 60000 } } },
  });
  try {
    const picks = JSON.parse(await readFile(join(webRoot, 'data', 'picks.json'), 'utf8'));
    const issues = JSON.parse(await readFile(join(webRoot, 'data', 'issues.json'), 'utf8'));
    const open = [...picks].reverse().find((p) => p.status === 'open');
    const closed = picks.find((p) => p.status === 'closed');
    const last = issues.at(-1)?.date;
    const routes = ['#', '#ledger', `#p-${open.no}`, `#p-${closed.no}`, `#issue-${last}`, '#disclosures', `#s-${open.ticker}`, '#app-research'];
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const logs = [];
    const ignorable = (s) => /fonts\.(googleapis|gstatic)\.com|ERR_CERT|net::ERR_(NAME|INTERNET|PROXY|TUNNEL)/.test(s);
    page.on('console', (m) => m.type() === 'error' && !ignorable(m.text()) && logs.push(m.text()));
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
    for (const r of routes) {
      await page.goto(`${t.url}/${r}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.querySelector('#view h1') && !document.documentElement.dataset.busy, null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(300);
      const where = `live ${r}`;
      fail(where, logs.splice(0).map((e) => `console: ${e}`));
      const st = await page.evaluate((ticker) => {
        const view = document.querySelector('#view');
        return {
          h1: document.querySelector('#view h1')?.textContent ?? '',
          viewAs: !!document.querySelector('#demo-bar .seg, #demo-bar .demo-bar__select'),
          mode: document.querySelector('meta[name="quorum-mode"]')?.content ?? '',
          leak: new RegExp(`\\b${ticker}\\b`).test(view.textContent) && !location.hash.startsWith('#s-'),
        };
      }, open.ticker);
      if (st.mode !== 'live') fail(where, ['the server did not put the page in live mode']);
      if (/failed to render|did not load/i.test(st.h1)) fail(where, [`page failed: ${st.h1}`]);
      if (st.viewAs) fail(where, ['the demo "View as" switch is shown in live mode']);
      if (st.leak) fail(where, [`an anonymous visitor sees the open ticker ${open.ticker}`]);
      fail(where, await page.evaluate(basics));
      fail(where, await page.evaluate(overflow));
    }
    await context.close();
  } finally {
    await t.close();
  }
}
