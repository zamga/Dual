// End-to-end checks of the member pages in demo mode (the published Artifact): #join (the whole flow,
// a refusal, the SMS preview and its counter, the non-GSM highlight), #app (channels, the SMS consent
// asked again), #app-research (the explorer at the Research tier: virtual rows, filters, sorting,
// keyboard, Copy CSV; the honest preview for Signal), #account (withdrawal and deletion confirmed in the
// page), #u-TOKEN (one tap, the confirmation text) and #status. Every interactive state is also run
// through the page checks (console, overflow, basics, contrast).
//
//   memberChecks({ browser, base, sizes, fail }) -> Promise<void>
import { overflow, basics, contrast } from './checks.js';

const ready = (page) => page.waitForFunction(() => document.querySelector('#view h1') && !document.documentElement.dataset.busy, null, { timeout: 15000 });

async function audit(page, where, fail, logs) {
  await page.waitForTimeout(250);
  const ignorable = (t) => /fonts\.(googleapis|gstatic)\.com|ERR_CERT|net::ERR_(NAME|INTERNET|PROXY|TUNNEL)/.test(t);
  fail(where, logs.splice(0).filter((l) => !ignorable(l)).map((e) => `console: ${e}`));
  fail(where, await page.evaluate(overflow));
  fail(where, await page.evaluate(basics));
  fail(where, await page.evaluate(contrast));
}

async function open(browser, base, { w, h, query = '', hash, reducedMotion = 'reduce' }) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => m.type() === 'error' && logs.push(m.text()));
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  await page.goto(`${base}${query}${hash}`, { waitUntil: 'networkidle' });
  await ready(page);
  return { context, page, logs };
}

export async function memberChecks({ browser, base, sizes = [[390, 844], [1440, 900]], fail }) {
  for (const [w, h] of sizes) {
    const at = `@${w}x${h}`;

    // ---- #join: the whole demo flow ----------------------------------------------------------------------
    {
      const { context, page, logs } = await open(browser, base, { w, h, hash: '#join-research' });
      const where = `#join ${at}`;
      const on = await page.evaluate(() => document.querySelector('.jn-tier.is-on')?.dataset.tier);
      if (on !== 'research') fail(where, [`#join-research did not preselect Research (${on})`]);
      await page.click('.jn-tier[data-tier="signal"]');
      await page.click('.jn-billing .seg button:nth-child(2)');
      const cta = await page.textContent('.jn-cta');
      if (!/190/.test(cta)) fail(where, [`annual price not in the button: ${cta}`]);
      await audit(page, `${where} tier`, fail, logs);
      await page.click('.jn-cta');
      // account: a bad address is refused in the page
      await page.fill('.jn-step--account input[type=email]', 'nobody');
      await page.click('.jn-step--account button[type=submit]');
      if (!(await page.isVisible('.jn-step--account .m-field__err'))) fail(where, ['invalid email shows no error']);
      await page.fill('.jn-step--account input[type=email]', 'reader@example.com');
      await page.click('.jn-step--account button[type=submit]');
      // country: a refusal first, then a text-alert country
      await page.selectOption('.jn-step--country select', 'US');
      await page.click('.jn-step--country button[type=submit]');
      const refusal = await page.textContent('.jn-verdict');
      if (!/United States/.test(refusal ?? '')) fail(where, [`no plain refusal for the US: ${refusal?.slice(0, 80)}`]);
      await audit(page, `${where} refused`, fail, logs);
      await page.click('.jn-verdict .btn--ghost');
      await page.selectOption('.jn-step--country select', 'SI');
      await page.click('.jn-step--country button[type=submit]');
      // phone: the preview text, its counter, a highlighted non-GSM character, a landline refused
      const meter = await page.textContent('.jn-meter');
      if (!/^\d{3}\/160 GSM-7/.test(meter ?? '')) fail(where, [`SMS counter reads "${meter}"`]);
      const sms = await page.textContent('.jn-preview .sms');
      if (!/^QUORUM #\d{4} BUY [A-Z]{1,5} \d\d\.\d\d\.\d\d 14:00 CES?T\./.test(sms ?? '')) fail(where, [`preview is not a BUY text: ${sms}`]);
      await page.fill('.jn-step--phone input[type=tel]', '+386 41 230 0000');
      if (!(await page.locator('.jn-bad.is-nongsm').count())) fail(where, ['a pasted non-breaking space is not highlighted']);
      await page.click('.jn-step--phone button[type=submit]');
      if (!/landline/i.test((await page.textContent('.jn-reasons')) ?? '')) fail(where, ['a landline number is not refused']);
      await page.click('.jn-lang button[lang="sl"]');
      if (!/NAKUP/.test((await page.textContent('.jn-preview .sms')) ?? '')) fail(where, ['the Slovene preview is not the SL template']);
      await audit(page, `${where} phone`, fail, logs);
      await page.fill('.jn-step--phone input[type=tel]', '+386 41 234 545');
      await page.click('.jn-step--phone button[type=submit]');
      // code: demo, any 6 digits
      if (!/any 6 digits/i.test((await page.textContent('.jn-step--code')) ?? '')) fail(where, ['the demo code step is not labelled']);
      await page.fill('.jn-step--code input', '123456');
      await page.click('.jn-step--code button[type=submit]');
      // consent: unchecked, the exact text with the masked number, version and hash
      const boxes = await page.$$eval('.jn-step--consent input[type=checkbox]', (els) => els.map((e) => e.checked));
      if (boxes.length !== 3 || boxes.some(Boolean)) fail(where, [`consent boxes: ${JSON.stringify(boxes)} (want three, unchecked)`]);
      const smsText = await page.textContent('.m-consent--sms .m-check__text');
      if (!/\+386 •• ••• 45/.test(smsText ?? '')) fail(where, ['the SMS consent does not show the masked number']);
      await page.waitForFunction(() => /sha256 [0-9a-f]{4}…/.test(document.querySelector('.m-consent--sms .m-consent__hash')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => fail(where, ['consent hash not computed']));
      if (!/Text v3/.test((await page.textContent('.m-consent--sms .m-consent__meta')) ?? '')) fail(where, ['SMS consent version is not v3']);
      await page.click('.jn-step--consent button[type=submit]');
      if (!(await page.isVisible('.jn-step--consent .m-field__err'))) fail(where, ['consent without the required boxes was accepted']);
      await audit(page, `${where} consent`, fail, logs);
      for (const b of await page.$$('.jn-step--consent input[type=checkbox]')) await b.check();
      await page.click('.jn-step--consent button[type=submit]');
      // checkout: a preview that charges nothing, then activation, then the opt-in text
      if (!/0\.00/.test((await page.textContent('.jn-sheet__total')) ?? '')) fail(where, ['the preview checkout does not say nothing is due']);
      await audit(page, `${where} checkout`, fail, logs);
      await page.click('.jn-step--checkout .jn-actions .btn');
      await page.waitForSelector('.jn-final.is-activating', { timeout: 3000 }).catch(() => fail(where, ['no "Activating…" state']));
      await page.waitForSelector('.jn-final.is-done', { timeout: 8000 }).catch(() => fail(where, ['the flow did not finish']));
      const optIn = await page.textContent('.jn-final .sms');
      if (!/^QUORUM: SMS (alerts ON|obvestila VKLOPLJENA)/.test(optIn ?? '')) fail(where, [`the opt-in text is not shown: ${optIn}`]);
      await audit(page, `${where} done`, fail, logs);
      // the demo reader carries over (memory only): #account shows the masked number, #u- stops texts
      const stop = await page.getAttribute('.jn-final a[href^="#u-"]', 'href');
      await page.evaluate(() => (location.hash = '#account'));
      await ready(page);
      if (!/reader@example\.com/.test((await page.textContent('.acc-id')) ?? '')) fail(where, ['#account does not show the joined reader']);
      if (stop) {
        await page.evaluate((hsh) => (location.hash = hsh), stop);
        await ready(page);
        await page.click('.us-btn');
        const t = await page.textContent('#view h1');
        if (!/off/.test(t ?? '')) fail(where, [`stop link result: ${t}`]);
        await page.evaluate(() => (location.hash = '#app'));
        await ready(page);
        const smsOn = await page.getAttribute('.m-switch-row:first-child .m-switch', 'aria-checked');
        if (smsOn !== 'false') fail(where, ['#app still shows texts on after the stop link']);
      }
      const stored = await page.evaluate(() => {
        try {
          return Object.keys(localStorage).filter((k) => !['quorum.locale', 'quorum.tier'].includes(k));
        } catch {
          return [];
        }
      });
      if (stored.length) fail(where, [`the demo stored something: ${stored.join(', ')}`]);
      await context.close();
    }

    // ---- #app: channels; SMS back on asks for the consent box again --------------------------------------
    {
      const { context, page, logs } = await open(browser, base, { w, h, hash: '#app' });
      const where = `#app ${at}`;
      if (!(await page.locator('.app-row').count())) fail(where, ['no open picks listed']);
      const sms = page.locator('.m-switch').first();
      await sms.click();
      if ((await sms.getAttribute('aria-checked')) !== 'false') fail(where, ['SMS did not switch off']);
      await sms.click();
      if (!(await page.isVisible('.m-channels__ask .m-consent--sms'))) fail(where, ['switching texts back on does not ask for consent']);
      if ((await sms.getAttribute('aria-checked')) !== 'false') fail(where, ['texts came back on without the consent box']);
      await audit(page, `${where} consent again`, fail, logs);
      await page.check('.m-channels__ask input[type=checkbox]');
      await page.click('.m-channels__ask .btn');
      if ((await sms.getAttribute('aria-checked')) !== 'true') fail(where, ['texts did not come back on after consent']);
      await context.close();
      // Free viewers see open picks sealed
      const free = await open(browser, base, { w, h, query: '?tier=free', hash: '#app' });
      const leak = await free.page.evaluate(() => [...document.querySelectorAll('.app-row.is-sealed')].some((r) => r.querySelector('.ticker')));
      if (leak) fail(`#app free ${at}`, ['a sealed open pick shows its ticker']);
      await free.context.close();
    }

    // ---- #app-research: the explorer ------------------------------------------------------------------------
    {
      const { context, page, logs } = await open(browser, base, { w, h, query: '?tier=research', hash: '#app-research' });
      const where = `#app-research ${at}`;
      await page.waitForSelector('.rx-datarow', { timeout: 5000 }).catch(() => fail(where, ['no rows']));
      const total = await page.evaluate(() => Number(document.querySelector('.rx-grid')?.getAttribute('aria-rowcount')) - 1);
      const inDom = await page.locator('.rx-datarow').count();
      if (!(total > 1000)) fail(where, [`row count ${total}`]);
      if (!(inDom > 5 && inDom < 80)) fail(where, [`virtualisation renders ${inDom} rows`]);
      const allFictional = await page.$$eval('.rx-datarow .rx-sub', (els) => els.every((e) => /fictional|izmišljeno/.test(e.textContent)));
      if (!allFictional) fail(where, ['a row is not labelled fictional']);
      await audit(page, `${where} rows`, fail, logs);
      // scroll far: rows are replaced, not accumulated
      await page.evaluate(() => {
        const s = document.querySelector('.rx-scroll');
        s.scrollTop = s.scrollHeight / 2;
      });
      await page.waitForTimeout(200);
      const mid = await page.evaluate(() => Number(document.querySelector('.rx-datarow')?.dataset.i));
      if (!(mid > 100)) fail(where, [`scrolling did not move the window (first row ${mid})`]);
      if ((await page.locator('.rx-datarow').count()) > 80) fail(where, ['rows accumulate while scrolling']);
      // a preset, then sort by D ascending (desktop head) or the sort select (phones)
      await page.click('.rx-chip[data-preset="quorum"]');
      const q = await page.$$eval('.rx-datarow .rx-agree', (els) => els.map((e) => Number(e.textContent[0])));
      if (!q.length || q.some((n) => n < 3)) fail(where, [`the "3 or more" screen shows ${JSON.stringify(q)}`]);
      if (w >= 640) {
        await page.click('.rx-h[data-sort="D"] .rx-sort');
        const s = await page.getAttribute('.rx-h[data-sort="D"]', 'aria-sort');
        if (s !== 'descending') fail(where, [`sorting by D: aria-sort ${s}`]);
      } else {
        await page.selectOption('.rx-sortsel', 'D:desc');
      }
      const ds = await page.$$eval('.rx-datarow', (els) => els.sort((a, b) => a.dataset.i - b.dataset.i).map((e) => parseFloat(e.querySelectorAll('.rx-c-fam')[3].textContent.replace(/[A-D]/, ''))));
      if (ds.some((v, i) => i && v > ds[i - 1])) fail(where, [`D is not descending: ${ds.slice(0, 6).join(', ')}`]);
      // search narrows; clear
      await page.click('.rx-linkbtn');
      const firstTicker = await page.textContent('.rx-datarow .rx-ticker');
      await page.fill('.rx-search', firstTicker);
      const found = await page.$$eval('.rx-datarow .rx-ticker', (els) => els.map((e) => e.textContent));
      if (!found.includes(firstTicker)) fail(where, [`search for ${firstTicker} lost it`]);
      await page.fill('.rx-search', '');
      // keyboard: one tab stop, arrows move the active row, Enter opens the stock
      // (the focus stop is the role=grid element itself, named, with aria-activedescendant and a row count)
      await page.focus('.rx-grid');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      const act = await page.evaluate(() => {
        const g = document.querySelector('.rx-grid');
        return { id: g.getAttribute('aria-activedescendant'), role: g.getAttribute('role'), name: g.getAttribute('aria-label'), rows: g.getAttribute('aria-rowcount'), focused: document.activeElement === g };
      });
      if (act.id !== 'rx-c-2' || act.role !== 'grid' || !act.name || !(Number(act.rows) > 1) || !act.focused) fail(where, [`grid keyboard stop: ${JSON.stringify(act)}`]);
      const t2 = await page.evaluate(() => document.querySelector('#rx-c-2 .rx-ticker')?.textContent);
      await page.keyboard.press('Enter');
      await ready(page);
      const hash = await page.evaluate(() => location.hash);
      if (hash !== `#s-${t2}`) fail(where, [`Enter opened ${hash}, expected #s-${t2}`]);
      await page.goBack();
      await ready(page);
      await page.waitForSelector('.rx-datarow', { timeout: 5000 }).catch(() => {});
      // Copy CSV (the clipboard) and the raw view
      await page.click('.rx-copy .btn');
      await page.waitForFunction(() => /Copied|blocked|Kopiran/.test(document.querySelector('.rx-copy .m-copy__status')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => fail(where, ['Copy CSV reports nothing']));
      await page.click('.rx-copy .m-rawbox summary');
      await page.waitForFunction(() => document.querySelector('.rx-copy .m-raw')?.value.length > 100, null, { timeout: 5000 }).catch(() => {});
      const raw = await page.inputValue('.rx-copy .m-raw');
      if (!/^# Quorum Research universe.*no redistribution\.\ndate,ticker,name/.test(raw)) fail(where, [`raw CSV starts "${raw.slice(0, 60)}"`]);
      await audit(page, `${where} copied`, fail, logs);
      await context.close();
      // Signal: the honest preview, no rows
      const sig = await open(browser, base, { w, h, hash: '#app-research' });
      if (await sig.page.locator('.rx-datarow').count()) fail(`#app-research signal ${at}`, ['rows shown to a Signal viewer']);
      if (!(await sig.page.locator('.rx-gate').count())) fail(`#app-research signal ${at}`, ['no preview for a Signal viewer']);
      await sig.context.close();
    }

    // ---- #account: withdrawal and deletion, confirmed in the page ---------------------------------------------
    {
      const { context, page, logs } = await open(browser, base, { w, h, hash: '#account' });
      const where = `#account ${at}`;
      await page.click('#withdrawal .m-confirm > .btn');
      if (!(await page.isVisible('#withdrawal .m-confirm__panel'))) fail(where, ['no in-page withdrawal confirmation']);
      await audit(page, `${where} withdraw confirm`, fail, logs);
      await page.click('#withdrawal .m-confirm__yes');
      if (!/Withdrawal confirmed|Odstop potrjen/.test((await page.textContent('#withdrawal')) ?? '')) fail(where, ['withdrawal not confirmed']);
      // the rest of the page follows the withdrawal: billing withdrawn, no refund offer left, SMS off
      await page.waitForFunction(() => /withdrawn|odstopljeno/.test(document.querySelector('#billing, .acc-billing')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => {});
      const after = await page.evaluate(() => ({ billing: document.querySelector('.acc-billing')?.textContent ?? '', withdrawal: document.querySelector('#withdrawal')?.textContent ?? '' }));
      if (!/withdrawn|odstopljeno/.test(after.billing)) fail(where, ['billing still shows the subscription as active after the withdrawal']);
      if (/You can withdraw until|Odstopite lahko do/.test(after.withdrawal)) fail(where, ['the refund offer is still shown after the withdrawal']);
      await page.click('#data .m-copy .btn');
      await page.click('#data .m-rawbox summary');
      await page.waitForFunction(() => document.querySelector('#data .m-raw')?.value.length > 20, null, { timeout: 5000 }).catch(() => {});
      const json = await page.inputValue('#data .m-raw');
      try {
        const d = JSON.parse(json);
        if (d.format !== 'quorum-export/1' || !d.demo) fail(where, ['the export JSON is not the demo export']);
        if (JSON.stringify(d).match(/\+386\d{6,}/)) fail(where, ['the export holds a full number']);
      } catch {
        fail(where, ['the export is not JSON']);
      }
      await page.click('#delete .m-confirm > .btn');
      await page.click('#delete .m-confirm__yes');
      if (!(await page.isVisible('#delete .m-field__err'))) fail(where, ['deletion without the "I understand" box went through']);
      await page.check('#delete .m-confirm__panel input[type=checkbox]');
      await page.click('#delete .m-confirm__yes');
      if (!/Account deleted|Račun izbrisan/.test((await page.textContent('#delete')) ?? '')) fail(where, ['deletion not confirmed']);
      await audit(page, `${where} deleted`, fail, logs);
      await page.click('#delete .btn--ghost');
      await ready(page);
      await context.close();
    }

    // ---- #u-TOKEN and #status ---------------------------------------------------------------------------------
    {
      const { context, page, logs } = await open(browser, base, { w, h, hash: '#u-7Kq2xZ' });
      const where = `#u-7Kq2xZ ${at}`;
      if ((await page.locator('#view button.us-btn').count()) !== 1) fail(where, ['not exactly one stop button']);
      await page.click('.us-btn');
      const bubbles = await page.$$eval('.us-phone .sms', (els) => els.map((e) => e.textContent));
      if (bubbles.at(-1) !== 'QUORUM: SMS alerts OFF. No more texts. Your subscription is unchanged: qrm.si/account') fail(where, [`confirmation text: ${bubbles.at(-1)}`]);
      if (!/subscription is unchanged/.test((await page.textContent('#view')) ?? '')) fail(where, ['"your subscription is unchanged" missing']);
      await audit(page, `${where} stopped`, fail, logs);
      await page.evaluate(() => (location.hash = '#status'));
      await ready(page);
      const cells = await page.$$eval('.st-board tbody tr:not(:first-child) td.num', (els) => els.map((e) => e.textContent.trim()));
      if (cells.some((c) => c !== '0')) fail(`#status ${at}`, [`demo counts are not all zero: ${cells.join(' ')}`]);
      if ((await page.locator('.st-slot').count()) < 8) fail(`#status ${at}`, ['the timetable is missing']);
      await context.close();
    }
  }
}
