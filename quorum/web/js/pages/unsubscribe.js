// #u-TOKEN: the one-tap SMS opt-out, as the link in every text opens it (brief §2.7, §4.4). One clear
// button; opening the page changes nothing (link previews and scanners open links too). After the tap:
// the result, the one confirmation text exactly as it is sent (core OPT_OUT template), and "your
// subscription is unchanged".
//
// Demo: nothing changes and no text is sent; the stop is kept in this tab's memory so #app and #account
// agree with it. Live: POST /u/<token> (JSON), the same code path as the server's own page.
//
// SL: first draft, needs native review.
import { h, announce, focusEl, copyText } from '../dom.js';
import { href } from '../router.js';
import { renderSms, LINK_DOMAIN } from '../core/sms-templates.js';
import { api, errorText } from './_api.js';
import { previewPick, previewFromHero, buySms, quietHoursAt } from './_join.js';
import { formatInZone, LJUBLJANA } from '../core/calendar.js';
import { demo, modeNote, phoneThread } from './_member.js';

const SUPPORT = 'support@qrm.si';

export async function render(ctx) {
  const { L, locale, fmt } = ctx;
  const token = String(ctx.params?.token ?? '');
  const live = ctx.mode === 'live';
  const hero = await ctx.data('hero').catch(() => null);
  const pick = previewFromHero(hero) ?? previewPick(await ctx.data('picks').catch(() => null));
  const already = !live && demo.prefs.sms === false && (!demo.token || demo.token === token);

  const optOut = renderSms('OPT_OUT', locale, {});
  const lastText = pick ? buySms(pick, locale, token) : null;
  const thread = phoneThread({
    messages: lastText ? [{ text: lastText.text, at: pick.disseminatedAt }] : [],
    locale,
    label: L('The texts on this phone', 'SMS-i na tem telefonu'),
  });

  const kicker = h('p', { class: 'label us-kicker' }, h('span', { class: 'mono' }, `${LINK_DOMAIN}/u/${token}`), h('span', { 'aria-hidden': 'true' }, ' · '), L('one-tap stop', 'odjava z enim dotikom'));
  const h1 = h('h1', { class: 'display d2 us-h1' }, already ? L('Text alerts are already off.', 'SMS-obvestila so že izklopljena.') : L('Stop all Quorum texts to this phone?', 'Izklopim vse SMS-e Quoruma na ta telefon?'));
  const lede = h(
    'p',
    { class: 'lede us-lede' },
    already
      ? L('Nothing more to do. Your subscription is unchanged.', 'Ničesar več ni treba storiti. Naročnina ostaja nespremenjena.')
      : L('One tap switches off every text from Quorum at once. Email and push stay as they are, and so does your subscription.', 'En dotik izklopi vse SMS-e Quoruma naenkrat. E-pošta in potisna obvestila ostanejo, prav tako naročnina.'),
  );
  const err = h('p', { class: 'm-field__err small', role: 'alert', hidden: true });
  const btn = h('button', { type: 'button', class: 'btn us-btn' }, L('Stop text alerts', 'Izklopi SMS-obvestila'));
  const action = h('div', { class: 'us-action' }, already ? null : btn, err, !live ? modeNote(ctx, L('Demo: this page changes nothing and sends nothing.', 'Demo: ta stran ničesar ne spremeni in ničesar ne pošlje.')) : null);
  const after = h('div', { class: 'us-after', hidden: !already });
  if (already) after.append(...afterLinks());

  function afterLinks() {
    return [
      h(
        'p',
        { class: 'us-links' },
        h('a', { class: 'btn btn--ghost', href: href('account') }, L('Your account', 'Vaš račun'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')),
        h('a', { class: 'arrow-link', href: href('account', null, 'channels') }, L('Turn texts back on', 'Znova vklopi SMS'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')),
      ),
    ];
  }

  function done({ changed }) {
    h1.textContent = changed ? L('Text alerts are off.', 'SMS-obvestila so izklopljena.') : L('Text alerts are already off.', 'SMS-obvestila so že izklopljena.');
    lede.textContent = changed
      ? L('We will not text this number again. One text confirms it, then nothing. Your subscription is unchanged.', 'Na to številko ne bomo več pošiljali SMS-ov. En SMS to potrdi, nato nič več. Naročnina ostaja nespremenjena.')
      : L('Nothing more to do. Your subscription is unchanged.', 'Ničesar več ni treba storiti. Naročnina ostaja nespremenjena.');
    btn.remove();
    if (changed) {
      const q = quietHoursAt(new Date(ctx.now()));
      thread.add({ text: optOut, at: q.at.toISOString(), fresh: true });
      const lj = formatInZone(q.at, LJUBLJANA);
      const held = q.held ? L(` Quiet hours hold it until ${lj.time.slice(0, 5)}.`, ` Mirne ure ga zadržijo do ${lj.time.slice(0, 5)}.`) : '';
      caption.textContent = live
        ? L(`The confirmation text, sent once: ${optOut.length} characters, GSM-7, one text.${held}`, `Potrditveni SMS, poslan enkrat: ${optOut.length} znakov, GSM-7, en SMS.${held}`)
        : L(`Demo: not sent. In the live service this confirmation arrives once, exactly as shown (${optOut.length} characters, GSM-7).${held}`, `Demo: ni poslano. V živi storitvi ta potrditev prispe enkrat, natanko tako (${optOut.length} znakov, GSM-7).${held}`);
    }
    after.hidden = false;
    after.replaceChildren(...afterLinks());
    focusEl(h1);
    announce(`${h1.textContent} ${lede.textContent}`);
  }

  btn.addEventListener('click', async () => {
    err.hidden = true;
    if (!live) {
      demo.prefs.sms = false;
      demo.token = token;
      done({ changed: true });
      return;
    }
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    try {
      const r = await api(`/u/${encodeURIComponent(token)}`, { method: 'POST', body: {} });
      done({ changed: !!r.changed });
    } catch (e) {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      if (e.status === 404) return notRecognised();
      err.hidden = false;
      err.textContent = errorText(e, locale);
    }
  });

  function notRecognised() {
    h1.textContent = L('Link not recognised.', 'Povezava ni prepoznana.');
    lede.textContent = L('This stop link is not valid. If you still get texts from Quorum, write to us and we stop them by hand.', 'Ta povezava za odjavo ni veljavna. Če še vedno prejemate SMS-e Quoruma, nam pišite in jih ustavimo ročno.');
    const copy = h('button', { type: 'button', class: 'btn btn--ghost' }, L('Copy the address', 'Kopiraj naslov'));
    const status = h('span', { class: 'small muted', role: 'status' });
    copy.addEventListener('click', async () => {
      status.textContent = (await copyText(SUPPORT)) ? L('Copied.', 'Kopirano.') : L('Select the address to copy it.', 'Izberite naslov, da ga kopirate.');
    });
    action.replaceChildren(h('p', { class: 'us-support' }, h('span', { class: 'mono us-mail' }, SUPPORT), copy, status));
    focusEl(h1);
  }

  const caption = h(
    'figcaption',
    { class: 'figcaption' },
    lastText ? L(`The last text this link came in: pick #${pick.no}, ${fmt.date(pick.issueDate)}. Every text carries the same personal stop link.`, `Zadnji SMS s to povezavo: izbira #${pick.no}, ${fmt.date(pick.issueDate)}. Vsak SMS ima isto osebno povezavo za odjavo.`) : '',
  );

  const facts = [
    [L('Everything, at once', 'Vse naenkrat'), L('One stop applies to every text from Quorum immediately, whichever message the link came in.', 'Ena odjava takoj velja za vse SMS-e Quoruma, ne glede na to, v katerem sporočilu je bila povezava.')],
    [L('Our record decides', 'Odloča naš zapis'), L('The stop is written to our own database, the source of truth; the SMS provider’s opt-out list cannot be queried, so we never rely on it.', 'Odjava se zapiše v našo bazo, ki je vir resnice; seznama odjav ponudnika SMS ni mogoče poizvedovati, zato se nanj ne zanašamo.')],
    [L('One confirmation', 'Ena potrditev'), L('You get one text saying texts are off. After that, none.', 'Prejmete en SMS, da je pošiljanje izklopljeno. Potem nobenega več.')],
    [L('Nothing else changes', 'Drugo ostane'), L('Your subscription, the email and the push notifications stay as they are. Texts can be switched back on in your account, with a fresh consent box.', 'Naročnina, e-pošta in potisna obvestila ostanejo. SMS lahko znova vklopite v računu, z novim poljem za soglasje.')],
    [L('Opening is not stopping', 'Odprtje ni odjava'), L('Opening this page changes nothing: link previews and scanners open links too. Only the button does.', 'Odprtje te strani ne spremeni ničesar: tudi predogledi in pregledovalniki odpirajo povezave. Spremeni samo gumb.')],
  ];

  const node = h(
    'div',
    { class: 'page us' },
    h(
      'section',
      { class: 'grid us-top', 'aria-labelledby': 'us-h1' },
      h('div', { class: 'c-body us-main' }, kicker, Object.assign(h1, { id: 'us-h1' }), lede, action, after),
      h('figure', { class: 'c-meta us-phone figure' }, thread.node, caption),
    ),
    h(
      'section',
      { class: 'grid us-facts', 'aria-labelledby': 'us-f-h' },
      h('h2', { class: 'label c-head', id: 'us-f-h' }, L('What the button does', 'Kaj naredi gumb')),
      h('dl', { class: 'c-wide us-facts__dl' }, facts.map(([k, v]) => h('div', { class: 'us-fact' }, h('dt', {}, k), h('dd', {}, v)))),
      h('p', { class: 'c-body small muted' }, L('Withdrawing consent is one tap (GDPR Art. 7(3)). ', 'Preklic soglasja je en dotik (člen 7(3) GDPR). '), h('a', { href: href('legal', 'sms') }, L('SMS terms', 'Pogoji SMS')), ' · ', h('a', { href: href('help') }, L('Help', 'Pomoč'))),
    ),
  );
  return { title: L('Stop text alerts', 'Odjava od SMS'), node };
}
