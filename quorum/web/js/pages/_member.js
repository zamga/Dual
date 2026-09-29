// Shared pieces of the member pages (#join, #app, #app-research, #account, #u-TOKEN, #status):
// the in-memory demo reader, the viewer model ("me") in both modes, switches, the channel settings,
// a phone thread, Copy panels, in-page confirmation, the sign-in form and the launch line.
//
// Demo mode (the published Artifact): nothing is sent and nothing is stored. The demo reader below lives
// in this module's memory only (never localStorage), so it is gone when the tab closes, and it never
// holds a phone number: only the masked form (+386 •• ••• 45) the pages display.
//
// SL: first draft, needs native review.
import { h, announce, copyText, focusEl } from '../dom.js';
import { href } from '../router.js';
import { api, errorText } from './_api.js';
import { smsBody } from '../ui.js';
import { formatInZone, LJUBLJANA, addDays } from '../core/calendar.js';
import { consentText, consentHash, consentVersion } from '../core/consent-texts.js';
import { launchInfo } from './_join.js';

// ---- the demo reader (memory only) ---------------------------------------------------------------------
export const demo = {
  joined: null, // set by #join: { email, tier, interval, country, smsEligible, phoneMasked, smsLocale, token, at, consents }
  prefs: { sms: true, push: true, email: true },
  token: null,
  withdrawn: null, // { at, amount }
  deleted: false,
};

export function resetDemo() {
  demo.joined = null;
  demo.prefs = { sms: true, push: true, email: true };
  demo.token = null;
  demo.withdrawn = null;
  demo.deleted = false;
}

const DEMO_EMAIL = 'you@example.com';
const DEMO_MASKED = '+386 •• ••• 45';

// The viewer in the /api/me shape. Demo: the view-as tier decides the entitlement; the reader is fictional.
export function demoMe(ctx, asOf) {
  const tier = ctx.tier;
  const j = demo.joined;
  const paid = tier !== 'free' && !demo.withdrawn && !demo.deleted;
  const smsEligible = j ? j.smsEligible : true;
  const smsConsent = j ? !!j.consents?.sms : true;
  const start = j?.at ?? asOf ?? null;
  const interval = j?.interval ?? 'month';
  const periodEnd = start ? addDays(start, interval === 'year' ? 365 : 30) : null;
  return {
    authenticated: !demo.deleted,
    demo: true,
    user: { email: j?.email || DEMO_EMAIL, locale: ctx.locale, declaredCountry: j?.country ?? 'SI', jurisdiction: j?.country ?? 'SI', fictional: !j },
    geo: { ok: true, country: j?.country ?? 'SI', smsEligible, blocked: [] },
    phone: smsEligible ? { masked: j?.phoneMasked || DEMO_MASKED, country: j?.country ?? 'SI', verified: true, invalid: false } : null,
    consents: {
      sms: { granted: smsEligible && smsConsent && demo.prefs.sms, version: 'v3' },
      terms: { granted: true, version: 'v1' },
      immediate_performance: { granted: true, version: 'v1' },
    },
    entitlements: { picks: { active: paid, until: paid ? periodEnd : null }, research_data: { active: paid && tier === 'research', until: paid && tier === 'research' ? periodEnd : null } },
    subscription: tier === 'free' ? null : { tier, interval, status: demo.withdrawn ? 'canceled' : j?.preview ? 'preview' : 'active', currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false, withdrawnAt: demo.withdrawn?.at ?? null, startedAt: start, preview: !!j?.preview },
    activation: paid ? 'active' : 'none',
    prefs: { ...demo.prefs, sms: smsEligible && smsConsent && demo.prefs.sms },
    sms: { on: paid && smsEligible && smsConsent && demo.prefs.sms },
    // a preview join charged nothing, so there is nothing to refund: no withdrawal offer, no amount
    withdrawal: tier === 'free' || j?.preview ? { eligible: false, preview: !!j?.preview } : { eligible: !demo.withdrawn && !!start, deadline: start ? addDays(start, 14) : null, fullRefund: true },
  };
}

// The viewer in either mode. Live: GET /api/me; demo: the reader above.
export async function loadMe(ctx) {
  if (ctx.mode !== 'live') {
    const meta = await ctx.data('meta').catch(() => null);
    return demoMe(ctx, meta?.asOf);
  }
  return api('/api/me', { signal: ctx.signal });
}

// The tier a viewer sees: live from the entitlements, demo from "view as".
export function tierOf(ctx, me) {
  if (ctx.mode !== 'live') return ctx.tier;
  if (me?.entitlements?.research_data?.active) return 'research';
  if (me?.entitlements?.picks?.active) return 'signal';
  return 'free';
}

// ---- small pieces ---------------------------------------------------------------------------------------
export function modeNote(ctx, extra) {
  const live = ctx.mode === 'live';
  return h(
    'p',
    { class: ['m-mode', live && 'is-live'] },
    h('span', { class: 'tag' }, live ? ctx.L('live', 'v živo') : ctx.L('demo', 'demo')),
    h('span', {}, extra ?? (live ? ctx.L('Connected to the Quorum server.', 'Povezano s strežnikom Quorum.') : ctx.L('Nothing is sent and nothing is stored.', 'Nič se ne pošlje in nič se ne shrani.'))),
  );
}

// The launch line: status label, one lead sentence, the gate status in one line and a link to the test.
// When a gate failed that no further month can change, the lead says the engine is back in research.
export function launchBox(ctx, backtest, { compact = false } = {}) {
  const info = launchInfo(backtest);
  const { L } = ctx;
  const loc = (o) => o[ctx.locale] ?? o.en;
  return h(
    'div',
    { class: ['m-launch', compact && 'is-compact', info.ready && 'is-ready', info.research && 'is-research'] },
    h('p', { class: 'label' }, loc(info.label)),
    h('p', { class: 'm-launch__lead' }, loc(info.lead)),
    h('p', { class: 'm-launch__gate small' }, loc(info.text), ' ', h('a', { class: 'nowrap', href: href('backtest', null, 'launch') }, L('The launch test →', 'Preizkus za zagon →'))),
  );
}

// A labelled field: label, control, hint, error line (aria-describedby wired).
let fid = 0;
export function field({ label, control, hint, id, className, wrap }) {
  const cid = control.id || `mf-${++fid}`;
  control.id = cid;
  const hintEl = hint ? h('p', { class: 'm-field__hint small', id: `${cid}-hint` }, hint) : null;
  const err = h('p', { class: 'm-field__err small', id: `${cid}-err`, role: 'alert', hidden: true });
  control.setAttribute('aria-describedby', [hintEl && hintEl.id, err.id].filter(Boolean).join(' '));
  const node = h('div', { class: ['m-field', className], id }, h('label', { class: 'm-field__label', for: cid }, label), wrap ? h('span', { class: wrap }, control) : control, hintEl, err);
  return {
    node,
    error(msg) {
      err.hidden = !msg;
      err.textContent = msg ?? '';
      if (msg) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    },
  };
}

// An on/off switch (button role="switch"). onToggle(next) may return a Promise; false keeps it as it was.
export function switchRow({ label, hint, checked, disabled = false, onToggle, id, words = ['on', 'off'] }) {
  const sid = id ?? `sw-${++fid}`;
  const btn = h(
    'button',
    { type: 'button', class: 'm-switch', role: 'switch', 'aria-checked': String(!!checked), id: sid, 'aria-describedby': hint ? `${sid}-d` : null, disabled },
    h('span', { class: 'm-switch__track', 'aria-hidden': 'true' }, h('span', { class: 'm-switch__knob' })),
    h('span', { class: 'm-switch__state', 'aria-hidden': 'true' }),
  );
  const state = btn.querySelector('.m-switch__state');
  const set = (v) => {
    btn.setAttribute('aria-checked', String(!!v));
    state.textContent = v ? words[0] : words[1];
  };
  set(checked);
  btn.addEventListener('click', async () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-busy', 'true');
    let ok = true;
    try {
      ok = (await onToggle?.(next)) !== false;
    } finally {
      btn.removeAttribute('aria-busy');
    }
    if (ok) set(next);
  });
  const node = h(
    'div',
    { class: ['m-switch-row', disabled && 'is-disabled'] },
    h('div', { class: 'm-switch-row__text' }, h('label', { class: 'm-switch-row__label', for: sid }, label), hint ? h('p', { class: 'small muted', id: `${sid}-d` }, hint) : null),
    btn,
  );
  return { node, btn, set, setState: (text) => (state.textContent = text) };
}

// A phone with a thread of texts (the shell's phone() shows one).
//   messages: [{ text, at }]; returns { node, add({text, at}) }
export function phoneThread({ messages = [], locale = 'en', label }) {
  const fmtWhen = (at) => {
    const lj = formatInZone(new Date(at), LJUBLJANA);
    return `${lj.date.slice(8, 10)}.${lj.date.slice(5, 7)}.${lj.date.slice(2, 4)} ${lj.time.slice(0, 5)}`;
  };
  const thread = h('div', { class: 'phone__thread m-thread' });
  const time = h('span', {}, messages[0]?.at ? formatInZone(new Date(messages.at(-1).at), LJUBLJANA).time.slice(0, 5) : '14:00');
  const live = h('div', { class: 'visually-hidden', 'aria-live': 'polite' });
  const node = h(
    'div',
    { class: 'phone m-phone', role: 'group', 'aria-label': label ?? (locale === 'sl' ? 'SMS od QUORUM' : 'Texts from QUORUM') },
    h(
      'div',
      { class: 'phone__screen' },
      h('div', { class: 'phone__bar', 'aria-hidden': 'true' }, time, h('span', {}, '5G')),
      h('div', { class: 'phone__from', 'aria-hidden': 'true' }, h('b', {}, 'QUORUM'), h('span', { class: 'label' }, locale === 'sl' ? 'Samo za branje' : 'Read-only sender')),
      thread,
    ),
    live,
  );
  const add = ({ text, at, fresh = false }) => {
    const when = at ? fmtWhen(at) : '';
    const item = h(
      'div',
      { class: ['m-thread__item', fresh && 'is-fresh'] },
      when ? h('p', { class: 'phone__when' }, when) : null,
      h('p', { class: 'sms' }, smsBody(text)),
      h('p', { class: 'visually-hidden' }, `${when}: ${text}`),
    );
    thread.append(item);
    if (at) time.textContent = formatInZone(new Date(at), LJUBLJANA).time.slice(0, 5);
    if (fresh) live.textContent = `${locale === 'sl' ? 'Nov SMS' : 'New text'}: ${text}`;
    return item;
  };
  for (const m of messages) add(m);
  return { node, add, thread };
}

// Copy a text (the viewer blocks downloads): a button, a status line and the raw text to select.
export function copyPanel(ctx, { button, getText, rawLabel, summary, note, rows = 12 }) {
  const { L } = ctx;
  const status = h('p', { class: 'small muted m-copy__status', role: 'status' });
  const raw = h('textarea', { class: 'm-raw mono', readonly: true, rows: String(rows), spellcheck: 'false', 'aria-label': rawLabel, wrap: 'off' });
  let filled = false;
  const fill = async () => {
    raw.value = await getText();
    filled = true;
  };
  const btn = h('button', { type: 'button', class: 'btn' }, button);
  btn.addEventListener('click', async () => {
    btn.setAttribute('aria-busy', 'true');
    let text;
    try {
      text = await getText();
    } catch (e) {
      status.textContent = errorText(e, ctx.locale);
      btn.removeAttribute('aria-busy');
      return;
    }
    btn.removeAttribute('aria-busy');
    raw.value = text;
    filled = true;
    const ok = await copyText(text);
    status.textContent = ok ? (summary ? summary(text) : L(`Copied ${text.length.toLocaleString('en')} characters.`, `Kopiranih ${text.length.toLocaleString('de')} znakov.`)) : L('Copy was blocked here. Open the raw text below and select it.', 'Kopiranje je tu onemogočeno. Odprite besedilo spodaj in ga izberite.');
    if (!ok) {
      details.open = true;
      raw.focus();
      raw.select();
    }
    announce(status.textContent);
  });
  const details = h('details', { class: 'm-rawbox' }, h('summary', {}, rawLabel), note ? h('p', { class: 'small muted' }, note) : null, raw);
  details.addEventListener('toggle', () => {
    if (details.open && !filled) fill().catch((e) => (raw.value = errorText(e, ctx.locale)));
  });
  return { node: h('div', { class: 'm-copy' }, h('p', { class: 'm-copy__row' }, btn), status, details), refresh: () => (filled = false) };
}

// An in-page confirmation (no window.confirm): a trigger, then a panel with the consequences and two
// buttons. onConfirm() returns a Node (the result) or throws (the error is shown, the panel stays).
export function confirmFlow(ctx, { trigger, triggerClass = 'btn btn--ghost', title, body, confirm, cancel, onConfirm, danger = false, gate }) {
  const { L } = ctx;
  const wrap = h('div', { class: ['m-confirm', danger && 'is-danger'] });
  const open = h('button', { type: 'button', class: triggerClass }, trigger);
  const err = h('p', { class: 'm-field__err small', role: 'alert', hidden: true });
  const panelTitle = h('h3', { class: 'm-confirm__title', tabindex: '-1' }, title);
  const yes = h('button', { type: 'button', class: 'btn m-confirm__yes' }, confirm);
  const no = h('button', { type: 'button', class: 'btn btn--ghost' }, cancel ?? L('Cancel', 'Prekliči'));
  const gateBox = gate ? h('label', { class: 'm-check' }, h('input', { type: 'checkbox', class: 'm-check__box' }), h('span', { class: 'm-check__text' }, gate)) : null;
  const panel = h('div', { class: 'm-confirm__panel', role: 'group', 'aria-label': title, hidden: true }, panelTitle, body, gateBox, err, h('p', { class: 'm-confirm__actions' }, yes, no));
  open.addEventListener('click', () => {
    open.hidden = true;
    panel.hidden = false;
    focusEl(panelTitle);
  });
  no.addEventListener('click', () => {
    panel.hidden = true;
    open.hidden = false;
    err.hidden = true;
    open.focus();
  });
  yes.addEventListener('click', async () => {
    if (gateBox && !gateBox.querySelector('input').checked) {
      err.hidden = false;
      err.textContent = L('Tick the box to confirm.', 'Označite polje za potrditev.');
      gateBox.querySelector('input').focus();
      return;
    }
    yes.setAttribute('aria-busy', 'true');
    yes.disabled = true;
    try {
      const result = await onConfirm();
      const res = h('div', { class: 'm-confirm__result', tabindex: '-1', role: 'status' }, result);
      wrap.replaceChildren(res);
      focusEl(res);
    } catch (e) {
      err.hidden = false;
      err.textContent = errorText(e, ctx.locale);
      yes.disabled = false;
    } finally {
      yes.removeAttribute('aria-busy');
    }
  });
  wrap.append(open, panel);
  return wrap;
}

// Live: sign in with a one-time link by email (no passwords).
export function signInPanel(ctx, { lead } = {}) {
  const { L } = ctx;
  const input = h('input', { type: 'email', class: 'm-input', autocomplete: 'email', inputmode: 'email', spellcheck: 'false', required: true });
  const f = field({ label: L('Email', 'E-pošta'), control: input, hint: L('We send a sign-in link that works once and expires in 15 minutes. No password.', 'Pošljemo povezavo za prijavo, ki deluje enkrat in poteče v 15 minutah. Brez gesla.') });
  const btn = h('button', { type: 'submit', class: 'btn' }, L('Send sign-in link', 'Pošlji povezavo'));
  const done = h('p', { class: 'm-sent', role: 'status', hidden: true });
  const form = h('form', { class: 'm-form', novalidate: true }, lead ? h('p', { class: 'small' }, lead) : null, f.node, h('p', {}, btn), done);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = input.value.trim();
    if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) {
      f.error(L('Enter a valid email address.', 'Vnesite veljaven e-poštni naslov.'));
      input.focus();
      return;
    }
    f.error(null);
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;
    try {
      await api('/api/auth/magic', { method: 'POST', body: { email, locale: ctx.locale } });
      done.hidden = false;
      done.textContent = L(`Check ${email}: the link signs you in on this device and brings you back here.`, `Preverite ${email}: povezava vas prijavi na tej napravi in vrne sem.`);
      announce(done.textContent);
    } catch (err) {
      f.error(errorText(err, ctx.locale));
    } finally {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  });
  return form;
}

// The masked number never breaks across lines inside the consent text.
function keepTogether(text, part) {
  if (!part || !text.includes(part)) return text;
  const [a, ...rest] = text.split(part);
  return [a, h('span', { class: 'nowrap' }, part), rest.join(part)];
}

// ---- consent: the exact text, its version and its SHA-256 computed here --------------------------------
// -> { node, input, kind, version, sha256: Promise<string> }
export function consentBox(ctx, { kind, vars = {}, required = false, checked = false, links = [] }) {
  const { L, locale } = ctx;
  const version = consentVersion(kind);
  const text = consentText(kind, locale, vars);
  const input = h('input', { type: 'checkbox', class: 'm-check__box', checked: !!checked, 'aria-describedby': `cs-${kind}-meta` });
  const hashEl = h('span', { class: 'm-consent__hash' }, L('sha256 computing…', 'sha256 računam…'));
  const sha = consentHash(kind, locale).then((hex) => {
    hashEl.textContent = `sha256 ${hex.slice(0, 4)}…`;
    hashEl.title = hex;
    return hex;
  });
  const node = h(
    'div',
    { class: ['m-consent', `m-consent--${kind}`] },
    h('label', { class: 'm-check m-check--consent' }, input, h('span', { class: 'm-check__text' }, keepTogether(text, vars.phone))),
    h(
      'p',
      { class: 'm-consent__meta', id: `cs-${kind}-meta` },
      h('span', {}, `${L('Text', 'Besedilo')} ${version}`),
      h('span', { 'aria-hidden': 'true' }, ' · '),
      hashEl,
      h('span', { 'aria-hidden': 'true' }, ' · '),
      h('span', {}, required ? L('required', 'obvezno') : L('optional', 'neobvezno')),
      ...links.flatMap(([hrefv, label]) => [h('span', { 'aria-hidden': 'true' }, ' · '), h('a', { href: hrefv }, label)]),
    ),
  );
  return { node, input, kind, version, sha256: sha, text };
}

// ---- channel settings (#app and #account) ----------------------------------------------------------------
// me: the viewer; onChange(me) after a change. Demo: memory only. Live: POST /api/prefs (and /api/consent
// when SMS goes back on, because the SMS consent is its own unchecked box).
export function channelsPanel(ctx, me, { onChange, compact = false } = {}) {
  const { L } = ctx;
  const tier = tierOf(ctx, me);
  const paid = tier !== 'free';
  const smsEligible = !!me?.geo?.smsEligible;
  const verified = !!me?.phone?.verified;
  const msg = h('p', { class: 'small m-channels__msg', role: 'status' });
  const consentSlot = h('div', { class: 'm-channels__consent' });
  const list = h('div', { class: 'm-channels' });

  const words = [L('on', 'vkl.'), L('off', 'izkl.')];
  const setPref = async (key, value) => {
    if (ctx.mode !== 'live') {
      demo.prefs[key] = value;
      return true;
    }
    await api('/api/prefs', { method: 'POST', body: { [key]: value, pageUrl: location.href } });
    return true;
  };

  const smsHint = !paid
    ? L('Texts come with Signal and Research. The Ledger tier gets the weekly email.', 'SMS je del paketov Signal in Research. Paket Ledger dobi tedensko e-pošto.')
    : !smsEligible
      ? L('Not available in your country: every pick arrives by email and push at the same second.', 'V vaši državi ni na voljo: vsaka izbira prispe po e-pošti in s potisnim obvestilom v isti sekundi.')
      : verified
        ? L(`To ${me.phone.masked}. At most 16 a month, 14:00 Ljubljana time, only on a BUY, CLOSE or RENEW. Every text carries a one-tap stop link.`, `Na ${me.phone.masked}. Največ 16 na mesec, ob 14:00 po ljubljanskem času, samo ob NAKUPU, ZAPRTJU ali PODALJŠANJU. Vsak SMS ima povezavo za odjavo.`)
        : L('Verify a mobile number first.', 'Najprej potrdite mobilno številko.');

  const sms = switchRow({
    words,
    label: 'SMS',
    hint: smsHint,
    checked: !!me?.prefs?.sms && paid && smsEligible,
    disabled: !paid || !smsEligible || !verified,
    onToggle: async (next) => {
      msg.textContent = '';
      consentSlot.replaceChildren();
      try {
        if (!next) {
          await setPref('sms', false);
          msg.textContent = ctx.mode === 'live'
            ? L('Texts are off. One text confirms it. Email and push continue.', 'SMS je izklopljen. En SMS to potrdi. E-pošta in potisna obvestila ostanejo.')
            : L('Texts are off (demo: nothing was sent). In the live service one text confirms it; email and push continue.', 'SMS je izklopljen (demo: nič ni bilo poslano). V živi storitvi to potrdi en SMS; e-pošta in potisna obvestila ostanejo.');
          announce(msg.textContent);
          onChange?.();
          return true;
        }
        // Back on: the SMS consent is its own unchecked box, every time.
        const box = consentBox(ctx, { kind: 'sms', vars: { phone: me.phone.masked } });
        const go = h('button', { type: 'button', class: 'btn' }, L('Switch texts on', 'Vklopi SMS'));
        const err = h('p', { class: 'm-field__err small', role: 'alert', hidden: true });
        go.addEventListener('click', async () => {
          if (!box.input.checked) {
            err.hidden = false;
            err.textContent = L('Tick the box to switch texts on.', 'Označite polje, da vklopite SMS.');
            return;
          }
          try {
            if (ctx.mode === 'live') {
              await api('/api/consent', { method: 'POST', body: { kind: 'sms', action: 'grant', version: box.version, sha256: await box.sha256, pageUrl: location.href, locale: ctx.locale } });
              await api('/api/prefs', { method: 'POST', body: { sms: true } });
            } else demo.prefs.sms = true;
            sms.set(true);
            consentSlot.replaceChildren();
            msg.textContent = L('Texts are on.', 'SMS je vklopljen.');
            announce(msg.textContent);
            onChange?.();
          } catch (e) {
            err.hidden = false;
            err.textContent = errorText(e, ctx.locale);
          }
        });
        consentSlot.replaceChildren(h('div', { class: 'm-channels__ask' }, box.node, err, h('p', {}, go)));
        focusEl(box.input);
        return false;
      } catch (e) {
        msg.textContent = errorText(e, ctx.locale);
        return false;
      }
    },
  });
  const push = switchRow({
    words,
    label: L('Push', 'Potisna obvestila'),
    hint: L('Every BUY, CLOSE and RENEW at 14:00. On iPhone, add Quorum to your home screen first.', 'Vsak NAKUP, ZAPRTJE in PODALJŠANJE ob 14:00. Na iPhonu najprej dodajte Quorum na začetni zaslon.'),
    checked: paid && !!me?.prefs?.push,
    disabled: !paid,
    onToggle: async (v) => {
      try {
        await setPref('push', v);
        msg.textContent = v ? L('Push is on.', 'Potisna obvestila so vklopljena.') : L('Push is off.', 'Potisna obvestila so izklopljena.');
        announce(msg.textContent);
        return true;
      } catch (e) {
        msg.textContent = errorText(e, ctx.locale);
        return false;
      }
    },
  });
  const email = switchRow({
    words,
    label: L('Email', 'E-pošta'),
    hint: paid
      ? L(`Every issue item to ${me?.user?.email ?? ''}, and the Ledger email on Sundays at 18:00.`, `Vsaka postavka izdaje na ${me?.user?.email ?? ''} in e-pošta Ledger ob nedeljah ob 18:00.`)
      : L('The Ledger email on Sundays at 18:00: open picks, closes and statistics.', 'E-pošta Ledger ob nedeljah ob 18:00: odprte izbire, zaprtja in statistika.'),
    checked: !!me?.prefs?.email,
    onToggle: async (v) => {
      try {
        await setPref('email', v);
        msg.textContent = v ? L('Email is on.', 'E-pošta je vklopljena.') : L('Email is off.', 'E-pošta je izklopljena.');
        announce(msg.textContent);
        return true;
      } catch (e) {
        msg.textContent = errorText(e, ctx.locale);
        return false;
      }
    },
  });
  list.append(sms.node, consentSlot, push.node, email.node);
  return h('div', { class: ['m-channels-wrap', compact && 'is-compact'] }, list, msg);
}
