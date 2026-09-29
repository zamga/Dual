// #join (brief §4.2): tier → account → country (geofence) → phone with the live SMS preview → code →
// consent → checkout → "Activating…" → done, where the opt-in text is shown as it would arrive.
// The steps read as one timetable: every step is visible at rest, the current one open on the rules,
// finished ones folded to a line with what was chosen.
//
// Demo (the published Artifact): nothing is sent, nothing is stored, no real number is collected. The
// flow lives in this module's memory (it survives a language or view-as switch, not a reload), and the
// number field is a preview that says so. Live (<meta name="quorum-mode" content="live">): real /api
// calls, resumed from GET /api/me after the sign-in link. Launch (web/js/launch.js): whatever
// backtest.json launch.status says ("pre-launch", or "ready" when the engine launch gate passes), paid SMS
// also needs the brief's legal, data-licence and SMS-carrier gates, so checkout stays a clearly labelled
// preview in both modes, nothing is charged, and no page says a text was sent.
//
// SL: first draft, needs native review (and legal review for every consent and refusal text).
import { h, announce, focusEl, setNumber, store, prefersReducedMotion } from '../dom.js';
import { href } from '../router.js';
import { masthead } from './_content.js';
import { api, errorText } from './_api.js';
import {
  STEPS,
  PAID_TIERS,
  price,
  countryGroups,
  countryName,
  geoVerdict,
  readPhone,
  groupE164,
  demoLookup,
  phoneVerdict,
  isEmail,
  isCode,
  launchInfo,
  previewPick,
  previewFromHero,
  buySms,
  smsModel,
  demoToken,
  stepFromMe,
  stepsFor,
  reason,
  quietHoursAt,
} from './_join.js';
import { demo, modeNote, launchBox, field, phoneThread, consentBox } from './_member.js';
import { launchCopy } from '../launch.js';
import { maskPhone } from '../core/consent-texts.js';
import { formatInZone, LJUBLJANA } from '../core/calendar.js';

// ---- the flow, in memory ---------------------------------------------------------------------------------------
const flow = fresh();

function fresh() {
  return {
    step: 'tier',
    done: new Set(),
    tier: 'signal',
    interval: 'month',
    email: '',
    sent: false, // live: sign-in link sent
    country: '',
    geo: null,
    phoneInput: '', // demo: the preview number, memory only
    e164: null,
    masked: '',
    phoneErr: null,
    smsLocale: null,
    token: demoToken(),
    codeSent: false,
    consents: { sms: false, terms: false, immediate_performance: false },
    hashes: {},
    checkout: null, // 'preview' | 'paid'
    liveResumed: false,
  };
}

function restart(keepTier = true) {
  const t = flow.tier;
  const i = flow.interval;
  Object.assign(flow, fresh());
  if (keepTier) {
    flow.tier = t;
    flow.interval = i;
  }
}

// The step that should be open next: the first one that applies and is not done.
function firstOpen() {
  const applies = stepsFor({ smsEligible: flow.geo ? flow.geo.smsEligible : null });
  for (const s of applies) if (s.applies && !flow.done.has(s.id)) return s.id;
  return 'final';
}

export async function render(ctx) {
  const { L, locale, fmt } = ctx;
  const [hero, backtest] = await Promise.all([ctx.data('hero').catch(() => null), ctx.data('backtest').catch(() => null)]);
  const launch = launchInfo(backtest);
  const LC = launchCopy(launch, locale);
  const live = ctx.mode === 'live';
  const previewOnly = !live || !launch.launched; // checkout charges nothing unless live and launched (never in this build)
  const pick = previewFromHero(hero) ?? previewPick(await ctx.data('picks').catch(() => null));
  if (!flow.smsLocale) flow.smsLocale = locale;

  // A tier in the link (#join-research) preselects it until the tier step is done.
  if (ctx.params?.tier && PAID_TIERS.includes(ctx.params.tier) && !flow.done.has('tier')) flow.tier = ctx.params.tier;

  let act = null; // the activation state: { stage: 1..3, timedOut }
  // Live: resume where the account stands.
  let me = null;
  if (live) {
    try {
      me = await api('/api/me', { signal: ctx.signal });
    } catch {
      me = null;
    }
    resumeLive(me);
  }

  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };

  // ---- masthead ---------------------------------------------------------------------------------------------
  const head = masthead({
    kicker: L('What do I get? · Join', 'Kaj dobim? · Pridruži se'),
    title: L('Seven steps, then mostly silence.', 'Sedem korakov, nato večinoma tišina.'),
    lede: L(
      'Choose a tier, confirm where you live and which number to text, read exactly what you agree to, then pay through Stripe. Most days after that, nothing arrives: we only text when three of four models agree.',
      'Izberite paket, potrdite, kje živite in na katero številko pošiljamo, preberite natanko, s čim se strinjate, nato plačajte prek Stripa. Večino dni potem ne prispe nič: SMS pošljemo samo, ko se strinjajo trije od štirih modelov.',
    ),
    meta: h('div', { class: 'jn-meta' }, launchBox(ctx, backtest), modeNote(ctx, live ? null : L('Demo: nothing is sent, nothing is stored, no number is collected.', 'Demo: nič se ne pošlje, nič se ne shrani, nobena številka se ne zbira.'))),
  });

  // The join colonnade (DESIGN-V2 §5): the seven steps stand on rule 1, a finished step draws a short
  // lintel (Graphite: not a quorum); the live SMS preview stays in view beside them (a bottom sheet on
  // phones and tablets, opened by its 48 px handle).
  const stepsWrap = h('ol', { class: 'jc__steps jn-steps', 'aria-label': L('Steps', 'Koraki') });
  const finalWrap = h('div', { class: 'jn-final-wrap' });

  const meter = h('p', { class: 'jn-meter jc__count mono' });
  const bar = h('span', { class: 'jn-meter__bar', 'aria-hidden': 'true' }, h('i'));
  const phoneWrap = h('div', { class: 'jn-preview__phone' });
  const cap = h('p', { class: 'figcaption' });
  const handleCount = h('span', { class: 'jc__handle-n' });
  const handle = h(
    'button',
    { type: 'button', class: 'jc__handle', 'aria-expanded': 'false', 'aria-controls': 'jn-preview' },
    h('span', {}, L('The text you would get', 'SMS, ki bi ga prejeli')),
    handleCount,
  );
  const preview = h(
    'aside',
    { class: 'jc__preview jn-preview figure', id: 'jn-preview', 'aria-label': L('Preview of a pick text', 'Predogled SMS z izbiro') },
    handle,
    h('p', { class: 'label jc__plabel' }, L('What arrives on a pick day', 'Kaj prispe na dan izbire')),
    phoneWrap,
    h('div', { class: 'jn-meter-wrap' }, bar, meter),
    cap,
  );
  handle.addEventListener('click', () => {
    const open = !preview.classList.contains('is-open');
    preview.classList.toggle('is-open', open);
    handle.setAttribute('aria-expanded', String(open));
  });
  // the preview: the exact BUY text in the chosen language, its septet count, one segment
  const drawPreview = () => {
    const m = pick ? buySms(pick, flow.smsLocale, flow.token) : smsModel('OPT_IN', flow.smsLocale, { token: flow.token });
    const t = phoneThread({ messages: [{ text: m.text, at: pick ? pick.disseminatedAt : null }], locale: flow.smsLocale, label: L('Preview of a pick text', 'Predogled SMS z izbiro') });
    phoneWrap.replaceChildren(t.node);
    meter.replaceChildren(h('b', {}, m.label), h('span', { class: 'muted' }, ` · ${m.segments} ${m.segments === 1 ? L('text', 'SMS') : L('texts', 'SMS')} · ${L('no č, š, ž, no emoji, no prices', 'brez č, š, ž, emojijev in cen')}`));
    handleCount.textContent = m.label;
    bar.style.setProperty('--fill', `${Math.min(100, (m.used / m.max) * 100)}%`);
    bar.setAttribute('title', m.label);
    cap.replaceChildren(
      pick
        ? L(`The exact text of pick #${pick.no} as written for ${fmt.date(pick.issueDate)} (before launch nothing is sent), rendered here with your own stop link (qrm.si/u/${flow.token}). Every pick text has this shape.`, `Natančno besedilo izbire #${pick.no}, kot je pripravljeno za ${fmt.date(pick.issueDate)} (pred zagonom se nič ne pošlje), tu z vašo povezavo za odjavo (qrm.si/u/${flow.token}). Vsak SMS z izbiro ima to obliko.`)
        : L('The confirmation text, rendered with your own stop link.', 'Potrditveni SMS z vašo povezavo za odjavo.'),
    );
  };
  drawPreview();
  const colonnade = h('section', { class: 'jc grid', 'aria-label': L('Join, step by step', 'Pridružitev, korak za korakom') }, stepsWrap, preview);
  const node = h('div', { class: 'page jn' }, head, colonnade, finalWrap);

  const TITLES = {
    tier: L('Tier', 'Paket'),
    account: L('Account', 'Račun'),
    country: L('Where you live', 'Kje živite'),
    phone: L('The number we text', 'Številka za SMS'),
    code: L('The code', 'Koda'),
    consent: L('What you agree to', 'S čim se strinjate'),
    checkout: L('Payment', 'Plačilo'),
  };
  const TODO = {
    tier: L('Signal or Research, monthly or annual.', 'Signal ali Research, mesečno ali letno.'),
    account: L('An email address. We sign you in with a one-time link; no password.', 'E-poštni naslov. Prijava z enkratno povezavo, brez gesla.'),
    country: L('EU and EEA only. Texts in Slovenia, Austria, Germany, Croatia and Italy.', 'Samo EU in EGP. SMS v Sloveniji, Avstriji, Nemčiji, na Hrvaškem in v Italiji.'),
    phone: L('A mobile number in your country, and the exact text you will get.', 'Mobilna številka v vaši državi in natančno besedilo, ki ga boste prejeli.'),
    code: L('A 6-digit code by text confirms the number.', 'Šestmestna koda po SMS potrdi številko.'),
    consent: L('Three boxes, all unchecked. Texts are optional.', 'Tri polja, vsa neoznačena. SMS je neobvezen.'),
    checkout: L('Stripe collects the payment; we never see your card.', 'Plačilo zbere Stripe; vaše kartice nikoli ne vidimo.'),
  };

  // ---- step sections ------------------------------------------------------------------------------------------
  function stepState(id) {
    const applies = stepsFor({ smsEligible: flow.geo ? flow.geo.smsEligible : null }).find((s) => s.id === id)?.applies;
    if (!applies) return 'skipped';
    if (flow.step === id) return 'current';
    if (flow.done.has(id)) return 'done';
    return 'todo';
  }

  function summaryOf(id) {
    const p = price(flow.tier, flow.interval);
    switch (id) {
      case 'tier':
        return `${flow.tier === 'research' ? 'Research' : 'Signal'} · ${flow.interval === 'year' ? L('annual', 'letno') : L('monthly', 'mesečno')} · ${fmt.eur(p.amount)}`;
      case 'account':
        return flow.email || '–';
      case 'country':
        return flow.geo ? `${countryName(flow.country, locale, { list: true })} · ${flow.geo.smsEligible ? L('texts available', 'SMS na voljo') : L('email and push', 'e-pošta in potisna obvestila')}` : '–';
      case 'phone':
        return flow.masked || '–';
      case 'code':
        return L('verified', 'potrjeno');
      case 'consent': {
        const list = [flow.consents.terms && L('terms', 'pogoji'), flow.consents.immediate_performance && L('immediate start', 'takojšen začetek'), flow.consents.sms && 'SMS'].filter(Boolean);
        return list.join(' · ');
      }
      case 'checkout':
        return flow.checkout === 'paid' ? L('paid', 'plačano') : L('preview · nothing charged', 'predogled · nič zaračunano');
      default:
        return '';
    }
  }

  function canChange(id) {
    if (flow.step === 'final' || flow.step === 'activating') return false;
    if (live && (id === 'account' || id === 'code')) return false;
    if (live && id === 'checkout') return false;
    return true;
  }

  function stepSection(id) {
    const i = STEPS.indexOf(id);
    const n = String(i + 1).padStart(2, '0');
    const state = stepState(id);
    const hid = `jn-h-${id}`;
    const title = h(
      'h2',
      { class: ['jn-step__title', state === 'current' ? 'display d3' : 'd4'], id: hid, tabindex: '-1' },
      h('span', { class: 'visually-hidden' }, L(`Step ${i + 1} of ${STEPS.length}: `, `Korak ${i + 1} od ${STEPS.length}: `)),
      TITLES[id],
      state === 'done' ? h('span', { class: 'visually-hidden' }, L(', done', ', opravljeno')) : null,
      state === 'skipped' ? h('span', { class: 'visually-hidden' }, L(', not needed', ', ni potrebno')) : null,
    );
    const sec = h('li', { class: ['jc__step', 'jn-step', `is-${state}`, `jn-step--${id}`], 'aria-labelledby': hid, dataset: { step: id } });
    title.classList.add('jc__t');
    sec.append(h('span', { class: 'jc__n', 'aria-hidden': 'true' }, n, state === 'done' ? ' ✓' : ''));
    sec.append(title);
    const body = h('div', { class: 'jc__b' });
    if (state === 'current') {
      body.append(...bodyOf(id));
    } else if (state === 'done') {
      const change = canChange(id)
        ? h(
            'button',
            { type: 'button', class: 'jn-change', 'aria-label': L(`Change ${TITLES[id].toLowerCase()}`, `Spremeni: ${TITLES[id].toLowerCase()}`), onclick: () => reopen(id) },
            L('Change', 'Spremeni'),
          )
        : null;
      body.append(h('div', { class: 'jn-step__sum' }, h('span', { class: 'mono jn-sum' }, summaryOf(id)), change));
    } else if (state === 'skipped') {
      body.append(h('p', { class: 'jn-step__sum small muted' }, L(`Not needed: no texts in ${countryName(flow.country, locale)}.`, `Ni potrebno: v državi ${countryName(flow.country, 'sl')} ni SMS.`)));
    } else {
      body.append(h('p', { class: 'jn-step__sum small muted' }, TODO[id]));
    }
    sec.append(body);
    return sec;
  }

  function draw({ focus = true } = {}) {
    stepsWrap.replaceChildren(...STEPS.map(stepSection));
    drawPreview();
    finalWrap.replaceChildren(...(flow.step === 'final' || flow.step === 'activating' ? [finalSection()] : []));
    if (!focus) return;
    const target = flow.step === 'final' || flow.step === 'activating' ? finalWrap.querySelector('h2') : stepsWrap.querySelector(`#jn-h-${flow.step}`);
    if (target) {
      focusEl(target);
      (target.closest('section') ?? target).scrollIntoView({ block: 'start', behavior: ctx.reducedMotion || prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  }

  function complete(id) {
    flow.done.add(id);
    go(firstOpen());
  }

  function go(step) {
    flow.step = step;
    draw();
    const i = STEPS.indexOf(step);
    if (i >= 0) announce(L(`Step ${i + 1} of ${STEPS.length}: ${TITLES[step]}`, `Korak ${i + 1} od ${STEPS.length}: ${TITLES[step]}`));
  }

  function reopen(id) {
    flow.step = id;
    draw();
  }

  // ---- 01 tier -------------------------------------------------------------------------------------------------
  function tierBody() {
    const items = {
      signal: [
        L('Every BUY, CLOSE and RENEW at 14:00: text, push and email', 'Vsak NAKUP, ZAPRTJE in PODALJŠANJE ob 14:00: SMS, potisno obvestilo in e-pošta'),
        L('Full pick notes: thesis, colonnade, sensitivity, disclosures', 'Celotni zapiski izbir: teza, stebri, občutljivost, razkritja'),
        L('At most 16 texts a month; most days, none', 'Največ 16 SMS na mesec; večino dni nobenega'),
      ],
      research: [
        L('Everything in Signal', 'Vse iz paketa Signal'),
        L('The daily universe: about 1,300 stocks, four percentiles each, vetoes', 'Dnevni univerzum: približno 1.300 delnic, štirje percentili, veta'),
        L('Screener, deciles and IC; CSV for personal use', 'Iskalnik, decili in IC; CSV za osebno rabo'),
      ],
    };
    const amounts = {};
    const pers = {};
    const cards = PAID_TIERS.map((tier, k) => {
      const p = price(tier, flow.interval);
      const input = h('input', { type: 'radio', name: 'jn-tier', value: tier, class: 'visually-hidden', checked: flow.tier === tier });
      input.addEventListener('change', () => {
        flow.tier = tier;
        for (const c of cards) c.classList.toggle('is-on', c.dataset.tier === tier);
        cta.querySelector('.jn-cta__t').textContent = ctaText();
      });
      amounts[tier] = h('span', { class: 'jn-tier__amount' }, fmt.eur(p.amount));
      pers[tier] = h('span', { class: 'jn-tier__per small' }, perText());
      return h(
        'label',
        { class: ['jn-tier', `c-b${k + 1}`, flow.tier === tier && 'is-on'], dataset: { tier } },
        input,
        h('span', { class: 'jn-tier__top' }, h('span', { class: 'label jn-tier__name' }, tier === 'research' ? 'Research' : 'Signal'), h('span', { class: 'jn-tier__mark', 'aria-hidden': 'true' })),
        h('span', { class: 'jn-tier__price' }, amounts[tier], pers[tier]),
        h('span', { class: 'jn-tier__items' }, items[tier].map((x) => h('span', { class: 'jn-tier__item' }, x))),
        tier === 'research'
          ? h('span', { class: 'jn-tier__note small' }, L('Opens after counsel review (Gate R): if daily scores count as recommendations, Research starts with families A–C as descriptive percentiles.', 'Odpre se po pravnem pregledu (pogoj R): če dnevne ocene štejejo za priporočila, Research začne z opisnimi percentili družin A–C.'))
          : null,
      );
    });
    function perText() {
      return flow.interval === 'year' ? L('a year · the price of 10 months', 'na leto · cena 10 mesecev') : L('a month', 'na mesec');
    }
    function ctaText() {
      const p = price(flow.tier, flow.interval);
      return L(`Continue with ${flow.tier === 'research' ? 'Research' : 'Signal'} · ${fmt.eur(p.amount)} ${flow.interval === 'year' ? 'a year' : 'a month'}`, `Nadaljuj s paketom ${flow.tier === 'research' ? 'Research' : 'Signal'} · ${fmt.eur(p.amount)} ${flow.interval === 'year' ? 'na leto' : 'na mesec'}`);
    }
    const segBtns = ['month', 'year'].map((iv) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(flow.interval === iv),
          onclick: () => {
            flow.interval = iv;
            segBtns.forEach((b, j) => b.setAttribute('aria-pressed', String(['month', 'year'][j] === iv)));
            for (const t of PAID_TIERS) {
              setNumber(amounts[t], fmt.eur(price(t, iv).amount));
              pers[t].textContent = perText();
            }
            cta.querySelector('.jn-cta__t').textContent = ctaText();
          },
        },
        iv === 'month' ? L('Monthly', 'Mesečno') : L('Annual', 'Letno'),
      ),
    );
    const cta = h('button', { type: 'button', class: 'btn jn-cta', onclick: () => complete('tier') }, h('span', { class: 'jn-cta__t' }, ctaText()), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'));
    return [
      h('div', { class: 'c-meta jn-billing' }, h('p', { class: 'label', id: 'jn-billing-l' }, L('Billing', 'Obračun')), h('div', { class: 'seg seg--light', role: 'group', 'aria-labelledby': 'jn-billing-l' }, segBtns)),
      h('div', { class: 'jn-tiers c-wide flush', role: 'radiogroup', 'aria-labelledby': 'jn-h-tier' }, cards),
      h(
        'aside',
        { class: 'jn-ledger c-b3' },
        h('p', { class: 'label' }, 'Ledger · €0'),
        h('p', { class: 'small' }, L('No trial: the free Ledger tier plays that role. Every record, every loser and the daily issue headline are public, with no account.', 'Brez preizkusnega obdobja: to vlogo ima brezplačni paket Ledger. Vsak zapis, vsaka slaba izbira in naslov dnevne izdaje so javni, brez računa.')),
        h('a', { class: 'arrow-link', href: href('ledger') }, L('Open the ledger', 'Odpri knjigo'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')),
      ),
      h('div', { class: 'c-body jn-actions' }, cta, h('p', { class: 'small muted' }, L('Prices include VAT. One price for everyone; cancel in one click; 14-day full refund on your first subscription.', 'Cene vključujejo DDV. Ena cena za vse; odpoved z enim klikom; celotno vračilo v 14 dneh za prvo naročnino.'))),
    ];
  }

  // ---- 02 account ----------------------------------------------------------------------------------------------
  function accountBody() {
    const input = h('input', { type: 'email', class: 'm-input', autocomplete: 'email', inputmode: 'email', spellcheck: 'false', value: flow.email, required: true });
    const f = field({
      label: L('Email', 'E-pošta'),
      control: input,
      hint: live ? L('We send a sign-in link that works once and expires in 15 minutes.', 'Pošljemo povezavo za prijavo, ki deluje enkrat in poteče v 15 minutah.') : L('Demo: no email is sent. Use any address; it stays in this tab.', 'Demo: nobeno sporočilo se ne pošlje. Uporabite kateri koli naslov; ostane v tem zavihku.'),
    });
    const btn = h('button', { type: 'submit', class: 'btn' }, live ? L('Send sign-in link', 'Pošlji povezavo') : L('Continue', 'Nadaljuj'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'));
    const sent = h('div', { class: 'jn-sent', role: 'status', hidden: !flow.sent });
    const fillSent = () =>
      sent.replaceChildren(
        h('p', { class: 'jn-sent__t' }, L(`Check ${flow.email}.`, `Preverite ${flow.email}.`)),
        h('p', { class: 'small' }, L('Open the link on this device. It signs you in and brings you back to this step.', 'Povezavo odprite na tej napravi. Prijavi vas in vrne na ta korak.')),
      );
    if (flow.sent) fillSent();
    const form = h('form', { class: 'm-form jn-form', novalidate: true }, f.node, h('p', { class: 'jn-actions' }, btn), sent);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = input.value.trim();
      if (!isEmail(email)) {
        f.error(L('Enter a valid email address, for example you@example.com.', 'Vnesite veljaven e-poštni naslov, na primer vi@example.com.'));
        input.focus();
        return;
      }
      f.error(null);
      flow.email = email;
      if (!live) {
        complete('account');
        return;
      }
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      try {
        store('quorum.join', JSON.stringify({ tier: flow.tier, interval: flow.interval }));
        await api('/api/auth/magic', { method: 'POST', body: { email, locale } });
        flow.sent = true;
        sent.hidden = false;
        fillSent();
        announce(sent.textContent);
      } catch (err) {
        f.error(errorText(err, locale));
      } finally {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
      }
    });
    return [
      h('div', { class: 'c-body' }, form),
      h(
        'aside',
        { class: 'c-meta jn-aside' },
        h('p', { class: 'label' }, L('Why a link', 'Zakaj povezava')),
        h('p', { class: 'small' }, L('No password to leak. The link is single-use and we store only its SHA-256, never the link itself.', 'Ni gesla, ki bi lahko ušlo. Povezava je enkratna, hranimo pa samo njen SHA-256, nikoli povezave same.')),
      ),
    ];
  }

  // ---- 03 country (geofence) -----------------------------------------------------------------------------------
  function countryBody() {
    const sel = h(
      'select',
      { class: 'm-input m-select', autocomplete: 'country', required: true },
      h('option', { value: '', disabled: true, selected: !flow.country }, L('Choose a country', 'Izberite državo')),
      countryGroups(locale).map((g) => h('optgroup', { label: g.label }, g.countries.map((c) => h('option', { value: c, selected: flow.country === c }, countryName(c, locale, { list: true }))))),
    );
    const f = field({ wrap: 'm-select-wrap', label: L('Country where you live', 'Država, v kateri živite'), control: sel, hint: L('Your connection, phone number and card must point to the same country; we check again at each step.', 'Povezava, telefonska številka in kartica morajo kazati na isto državo; preverimo na vsakem koraku.') });
    const out = h('div', { class: 'jn-verdict', role: 'status' });
    const btn = h('button', { type: 'submit', class: 'btn' }, L('Continue', 'Nadaljuj'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'));
    const form = h('form', { class: 'm-form jn-form', novalidate: true }, f.node, h('p', { class: 'jn-actions' }, btn));
    const refuse = (reasons, cc) => {
      form.hidden = true;
      out.replaceChildren(
        h('p', { class: 'label' }, L('Signup ends here', 'Prijava se tu konča')),
        h('p', { class: 'jn-refuse__t display d4' }, L(`Not available in ${countryName(cc, 'en')}.`, `V državi ${countryName(cc, 'sl')} ni na voljo.`)),
        ...reasons.map((r) => h('p', { class: 'jn-refuse__why' }, r[locale] ?? r.en)),
        live
          ? h(
              'p',
              { class: 'small muted' },
              L('We keep this country check with your account, for the eligibility and fraud record (see ', 'To preverjanje države hranimo pri vašem računu, za evidenco upravičenosti in preprečevanja zlorab (glejte '),
              h('a', { href: href('legal', 'privacy') }, L('Privacy', 'Zasebnost')),
              L('). The ledger, the issues and every closed pick stay public to everyone.', '). Knjiga, izdaje in vse zaprte izbire ostanejo javne za vse.'),
            )
          : h('p', { class: 'small muted' }, L('We keep no record of this choice in the demo. The ledger, the issues and every closed pick stay public to everyone.', 'V demu te izbire ne hranimo. Knjiga, izdaje in vse zaprte izbire ostanejo javne za vse.')),
        h(
          'p',
          { class: 'jn-refuse__actions' },
          h('a', { class: 'arrow-link', href: href('ledger') }, L('Open the public ledger', 'Odpri javno knjigo'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn--ghost',
              onclick: () => {
                form.hidden = false;
                out.replaceChildren();
                sel.focus();
              },
            },
            L('I chose the wrong country', 'Izbral(a) sem napačno državo'),
          ),
        ),
      );
      out.classList.add('is-refused');
      focusEl(out.querySelector('.jn-refuse__t'));
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cc = sel.value;
      if (!cc) {
        f.error(L('Choose the country where you live.', 'Izberite državo, v kateri živite.'));
        sel.focus();
        return;
      }
      f.error(null);
      const prev = flow.country;
      let v;
      if (live) {
        btn.disabled = true;
        try {
          const r = await api('/api/join/geo', { method: 'POST', body: { declaredCountry: cc } });
          v = { ok: true, country: r.country, smsEligible: !!r.smsEligible, reasons: [], notes: r.notes ?? [] };
        } catch (err) {
          btn.disabled = false;
          if (err.status === 403 && err.reasons.length) return refuse(err.reasons, cc);
          f.error(errorText(err, locale));
          return;
        }
      } else {
        v = geoVerdict(cc);
        if (!v.ok) return refuse(v.reasons, cc);
      }
      flow.country = cc;
      flow.geo = v;
      if (prev && prev !== cc) {
        // A new country: the number, its code and the text consent are asked again.
        for (const s of ['phone', 'code', 'consent']) flow.done.delete(s);
        flow.e164 = null;
        flow.masked = '';
        flow.consents.sms = false;
      }
      complete('country');
    });
    return [
      h('div', { class: 'c-body' }, form, out),
      h(
        'aside',
        { class: 'c-meta jn-aside' },
        h('p', { class: 'label' }, L('Who can subscribe', 'Kdo se lahko naroči')),
        h('p', { class: 'small' }, L('Consumers in the EU and the EEA. Texts in Slovenia, Austria, Germany, Croatia and Italy; elsewhere the same picks arrive by push and email at the same second.', 'Potrošniki v EU in EGP. SMS v Sloveniji, Avstriji, Nemčiji, na Hrvaškem in v Italiji; drugod iste izbire prispejo s potisnim obvestilom in po e-pošti v isti sekundi.')),
        h('p', { class: 'small' }, L('Not available to residents of the US, the UK, Australia, and Canada until reviewed.', 'Ni na voljo prebivalcem ZDA, Združenega kraljestva, Avstralije in Kanade do pregleda.')),
      ),
    ];
  }

  // ---- 04 phone, with the live SMS preview ---------------------------------------------------------------------
  function phoneBody() {
    const cc = flow.country || 'SI';
    const input = h('input', {
      type: 'tel',
      class: 'm-input m-input--tel mono',
      autocomplete: live ? 'tel' : 'off',
      inputmode: 'tel',
      spellcheck: 'false',
      value: flow.phoneInput,
      placeholder: cc === 'SI' ? '+386 41 234 545' : `+${{ AT: '43', DE: '49', HR: '385', IT: '39' }[cc] ?? '386'} …`,
    });
    const f = field({
      label: L('Mobile number', 'Mobilna številka'),
      control: input,
      hint: live
        ? L('With the country code. We check it is a mobile in your country, then text a code.', 'S klicno kodo države. Preverimo, da gre za mobilno številko v vaši državi, nato pošljemo kodo.')
        : L('Preview: this demo never collects a real number. What you type stays in this tab’s memory and is cleared when you leave this page; only the masked form (+386 •• ••• 45) is kept. Try one ending 0000 (a landline) or 9999 (VoIP).', 'Predogled: ta demo nikoli ne zbira prave številke. Kar vpišete, ostane v pomnilniku tega zavihka in se izbriše, ko zapustite to stran; ostane le zakrita oblika (+386 •• ••• 45). Poskusite številko, ki se konča z 0000 (stacionarna) ali 9999 (VoIP).'),
    });
    const readout = h('p', { class: 'jn-read mono', 'aria-live': 'polite' });
    const errBox = h('div', { class: 'jn-reasons', role: 'alert' });
    const showRead = () => {
      const r = readPhone(input.value);
      flow.phoneInput = input.value;
      readout.replaceChildren();
      if (!input.value) {
        readout.append(h('span', { class: 'muted' }, L('Reads as: nothing yet.', 'Prebrano: še nič.')));
        return r;
      }
      const mirror = h(
        'span',
        { class: 'jn-read__mirror', 'aria-hidden': 'true' },
        r.chars.map((c) => (c.kind === 'nongsm' || c.kind === 'invalid' ? h('mark', { class: `jn-bad is-${c.kind}`, title: c.kind === 'nongsm' ? `U+${c.ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}` : c.ch }, c.ch.trim() ? c.ch : '␣') : c.ch)),
      );
      readout.append(mirror, h('span', { class: 'jn-read__arrow', 'aria-hidden': 'true' }, ' → '));
      const who = r.e164 ? countryName(demoLookup(r.e164).countryCode ?? '', locale, { list: true }) : '';
      readout.append(h('span', {}, r.e164 ? `${groupE164(r.e164)}${who ? ` · ${who}` : ''}` : L('not a full number yet', 'še ni cela številka')));
      if (r.flagged) {
        readout.append(
          h(
            'span',
            { class: 'jn-read__note' },
            r.nonGsm
              ? L(`${r.nonGsm} highlighted ${r.nonGsm === 1 ? 'character is' : 'characters are'} outside the GSM-7 alphabet (often a hidden space pasted from a contact card) and ${r.nonGsm === 1 ? 'is' : 'are'} ignored.`, `Označeni znaki (${r.nonGsm}) so zunaj abecede GSM-7 (pogosto skrit presledek iz kontakta) in jih prezremo.`)
              : L('Highlighted characters are not part of a number and are ignored.', 'Označeni znaki niso del številke in jih prezremo.'),
          ),
        );
      }
      return r;
    };
    input.addEventListener('input', showRead);
    showRead();

    const langBtns = ['en', 'sl'].map((lc) =>
      h(
        'button',
        {
          type: 'button',
          lang: lc,
          'aria-pressed': String(flow.smsLocale === lc),
          onclick: () => {
            flow.smsLocale = lc;
            langBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.lang === lc)));
            drawPreview();
          },
        },
        lc === 'en' ? 'English' : 'Slovenščina',
      ),
    );
    const btn = h('button', { type: 'submit', class: 'btn' }, live ? L('Text me a code', 'Pošlji mi kodo') : L('Continue to the code', 'Nadaljuj do kode'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'));
    const form = h(
      'form',
      { class: 'm-form jn-form', novalidate: true },
      f.node,
      readout,
      h('div', { class: 'jn-lang' }, h('p', { class: 'label', id: 'jn-lang-l' }, L('Texts in', 'Jezik SMS')), h('div', { class: 'seg seg--light', role: 'group', 'aria-labelledby': 'jn-lang-l' }, langBtns)),
      errBox,
      h('p', { class: 'jn-actions' }, btn),
    );
    const carries = h(
      'div',
      { class: 'jn-carries' },
      h(
        'div',
        {},
        h('p', { class: 'label' }, L('Every pick text carries', 'Vsak SMS z izbiro vsebuje')),
        h('ul', { class: 'jn-list' }, [L('the brand and the pick number', 'znamko in številko izbire'), L('the action and the ticker', 'dejanje in oznako'), L('date, time and time zone', 'datum, čas in časovni pas'), L('the entry and exit rule', 'pravilo vstopa in izstopa'), L('how many models agree', 'koliko modelov se strinja'), L('“Not personal advice” and the note’s link', '»Ni osebni nasvet« in povezavo do zapiska'), L('your own stop link', 'vašo povezavo za odjavo')].map((x) => h('li', {}, x))),
      ),
      h(
        'div',
        {},
        h('p', { class: 'label' }, L('And never', 'In nikoli')),
        h('ul', { class: 'jn-list' }, [L('a price or a target', 'cene ali cilja'), L('“now”, “act”, “last chance”', '»zdaj«, »takoj«, »zadnja priložnost«'), L('a return claim or “for you”', 'obljube donosa ali »za vas«'), L('an emoji or a č, š, ž', 'emojija ali č, š, ž'), L('a link shortener', 'skrajševalnika povezav')].map((x) => h('li', {}, x))),
      ),
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.replaceChildren();
      const r = showRead();
      if (!r.e164) {
        f.error(reason('invalid_number')[locale]);
        input.focus();
        return;
      }
      f.error(null);
      if (live) {
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        try {
          const res = await api('/api/phone/start', { method: 'POST', body: { e164: r.e164, locale: flow.smsLocale } });
          flow.e164 = r.e164;
          flow.masked = res.masked ?? maskPhone(r.e164);
          flow.done.delete('code');
          complete('phone');
        } catch (err) {
          const reasons = err.reasons?.length ? err.reasons : [{ en: errorText(err, 'en'), sl: errorText(err, 'sl') }];
          errBox.replaceChildren(...reasons.map((x) => h('p', { class: 'jn-refuse__why' }, x[locale] ?? x.en)));
        } finally {
          btn.disabled = false;
          btn.removeAttribute('aria-busy');
        }
        return;
      }
      const verdict = phoneVerdict(demoLookup(r.e164), flow.country);
      if (!verdict.ok) {
        errBox.replaceChildren(
          h('p', { class: 'label' }, L('This number cannot receive our texts', 'Ta številka ne more prejemati naših SMS')),
          ...verdict.reasons.map((x) => h('p', { class: 'jn-refuse__why' }, x[locale] ?? x.en)),
        );
        focusEl(errBox);
        return;
      }
      if (flow.masked && flow.masked !== maskPhone(r.e164)) flow.consents.sms = false; // a new number needs a new consent
      // demo: only the masked form is kept once the step is done; the typed number is dropped
      flow.e164 = null;
      flow.phoneInput = '';
      flow.masked = maskPhone(r.e164);
      flow.done.delete('code');
      complete('phone');
    });

    return [h('div', { class: 'c-body jn-phone-main' }, form, carries)];
  }

  // ---- 05 code -------------------------------------------------------------------------------------------------
  function codeBody() {
    const input = h('input', { type: 'text', class: 'm-input m-input--code mono', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', pattern: '[0-9]{6}', spellcheck: 'false' });
    const f = field({
      label: L(`The 6-digit code texted to ${flow.masked}`, `Šestmestna koda, poslana na ${flow.masked}`),
      control: input,
      hint: live ? L('It expires after 10 minutes.', 'Poteče po 10 minutah.') : L('Demo: no text was sent. Any 6 digits work.', 'Demo: noben SMS ni bil poslan. Deluje katerih koli 6 števk.'),
    });
    const btn = h('button', { type: 'submit', class: 'btn' }, L('Verify', 'Potrdi'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'));
    const back = h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => reopen('phone') }, L('Change the number', 'Spremeni številko'));
    const form = h('form', { class: 'm-form jn-form', novalidate: true }, f.node, h('p', { class: 'jn-actions' }, btn, back));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = input.value.replace(/\s/g, '');
      if (!isCode(code)) {
        f.error(L('Enter the 6 digits.', 'Vnesite 6 števk.'));
        input.focus();
        return;
      }
      f.error(null);
      if (live) {
        btn.disabled = true;
        try {
          await api('/api/phone/check', { method: 'POST', body: { e164: flow.e164, code } });
        } catch (err) {
          f.error(errorText(err, locale));
          btn.disabled = false;
          return;
        }
      }
      complete('code');
    });
    return [
      h('div', { class: 'c-body' }, !live ? h('p', { class: 'jn-demo-flag label' }, L('Demo · any 6 digits', 'Demo · katerih koli 6 števk')) : null, form),
      h(
        'aside',
        { class: 'c-meta jn-aside' },
        h('p', { class: 'label' }, L('Why a code', 'Zakaj koda')),
        h('p', { class: 'small' }, L('The code proves the number is yours before anything is sent to it. Codes go only to mobiles in Slovenia, Austria, Germany, Croatia and Italy, with fraud checks on.', 'Koda dokaže, da je številka vaša, preden nanjo karkoli pošljemo. Kode gredo samo na mobilne številke v Sloveniji, Avstriji, Nemčiji, na Hrvaškem in v Italiji, s preverjanjem prevar.')),
      ),
    ];
  }

  // ---- 06 consent ----------------------------------------------------------------------------------------------
  function consentBody() {
    const smsOk = !!flow.geo?.smsEligible && !!flow.masked;
    const boxes = [];
    if (smsOk) boxes.push(consentBox(ctx, { kind: 'sms', vars: { phone: flow.masked }, checked: flow.consents.sms, links: [[href('legal', 'sms'), L('SMS terms', 'Pogoji SMS')]] }));
    boxes.push(consentBox(ctx, { kind: 'terms', required: true, checked: flow.consents.terms, links: [[href('legal', 'terms'), L('Terms', 'Pogoji')], [href('legal', 'privacy'), L('Privacy', 'Zasebnost')]] }));
    boxes.push(consentBox(ctx, { kind: 'immediate_performance', required: true, checked: flow.consents.immediate_performance }));
    const err = h('p', { class: 'm-field__err small', role: 'alert', hidden: true });
    const btn = h('button', { type: 'submit', class: 'btn' }, L('Agree and continue', 'Strinjam se in nadaljuj'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'));
    const form = h('form', { class: 'm-form jn-consents', novalidate: true }, boxes.map((b) => b.node), err, h('p', { class: 'jn-actions' }, btn));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const by = Object.fromEntries(boxes.map((b) => [b.kind, b]));
      const missing = ['terms', 'immediate_performance'].filter((k) => !by[k].input.checked);
      if (missing.length) {
        err.hidden = false;
        err.textContent = L('Tick the terms and the immediate start to continue. The text box is optional.', 'Za nadaljevanje označite pogoje in takojšen začetek. Polje za SMS je neobvezno.');
        by[missing[0]].input.focus();
        return;
      }
      err.hidden = true;
      for (const b of boxes) {
        flow.consents[b.kind] = b.input.checked;
        flow.hashes[b.kind] = await b.sha256;
      }
      if (live) {
        btn.disabled = true;
        try {
          for (const b of boxes) {
            if (!b.input.checked) continue;
            await api('/api/consent', { method: 'POST', body: { kind: b.kind, action: 'grant', version: b.version, sha256: flow.hashes[b.kind], pageUrl: location.href, locale } });
          }
        } catch (er) {
          err.hidden = false;
          err.textContent = errorText(er, locale);
          btn.disabled = false;
          return;
        }
      }
      complete('consent');
    });
    return [
      h('div', { class: 'c-body' }, form),
      h(
        'aside',
        { class: 'c-meta jn-aside' },
        h('p', { class: 'label' }, L('What we keep', 'Kaj hranimo')),
        h('p', { class: 'small' }, L('For each box you tick: the SHA-256 of the exact text above, its version, the time, your IP address and browser, this page’s address and language. Kept at least five years, so the consent can be proven. The server recomputes the hash and refuses a mismatch.', 'Za vsako označeno polje: SHA-256 natančnega besedila zgoraj, njegovo različico, čas, naslov IP in brskalnik, naslov te strani in jezik. Hranimo vsaj pet let, da je soglasje mogoče dokazati. Strežnik zgoščeno vrednost izračuna znova in zavrne neujemanje.')),
        h('p', { class: 'small' }, L('Texts are not a condition of the subscription. Switching them off later is one tap.', 'SMS ni pogoj za naročnino. Kasnejši izklop je en dotik.')),
        !live ? h('p', { class: 'small muted' }, L('Demo: the hashes are computed in your browser; nothing is stored.', 'Demo: zgoščene vrednosti se izračunajo v brskalniku; nič se ne shrani.')) : null,
      ),
    ];
  }

  // ---- 07 checkout ---------------------------------------------------------------------------------------------
  function checkoutBody() {
    const p = price(flow.tier, flow.interval);
    const name = flow.tier === 'research' ? 'Quorum Research' : 'Quorum Signal';
    const rows = [
      [L('Plan', 'Paket'), `${name} · ${flow.interval === 'year' ? L('annual', 'letno') : L('monthly', 'mesečno')}`],
      [L('Price', 'Cena'), `${fmt.eur(p.amount, { digits: 2 })} ${L('incl. VAT', 'z DDV')} (${L('VAT', 'DDV')} ${fmt.eur(p.vat, { digits: 2 })})`],
      [L('Email', 'E-pošta'), flow.email || '–'],
      [L('Card or EU payment method', 'Kartica ali plačilo v EU'), L('entered on Stripe’s page, never on ours', 'vnesete na Stripovi strani, nikoli na naši')],
      [L('Billing address', 'Naslov za račun'), L('required, for VAT', 'obvezno, zaradi DDV')],
      [L('VAT number', 'ID za DDV'), L('optional, for businesses', 'neobvezno, za podjetja')],
      [L('Renews', 'Obnovitev'), flow.interval === 'year' ? L('yearly, with a reminder 7 days before', 'letno, z opomnikom 7 dni prej') : L('monthly; cancel in one click', 'mesečno; odpoved z enim klikom')],
    ];
    const err = h('p', { class: 'm-field__err small', role: 'alert', hidden: true });
    const label = previewOnly ? L('Finish the preview', 'Zaključi predogled') : L(`Pay ${fmt.eur(p.amount, { digits: 2 })} with Stripe`, `Plačaj ${fmt.eur(p.amount, { digits: 2 })} prek Stripa`);
    const btn = h('button', { type: 'button', class: 'btn' }, label, h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'));
    btn.addEventListener('click', async () => {
      if (previewOnly) {
        flow.checkout = 'preview';
        flow.done.add('checkout');
        startActivation();
        return;
      }
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      try {
        const r = await api('/api/checkout', { method: 'POST', body: { tier: flow.tier, interval: flow.interval } });
        if (r?.url) location.assign(r.url);
      } catch (er) {
        err.hidden = false;
        err.textContent = errorText(er, locale);
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
      }
    });
    return [
      h(
        'div',
        { class: 'c-body' },
        previewOnly ? h('p', { class: 'jn-demo-flag label' }, LC.checkoutFlag(!live)) : null,
        h(
          'div',
          { class: 'jn-sheet paper' },
          h('p', { class: 'label' }, previewOnly ? L('What the payment page will collect', 'Kaj bo zbrala plačilna stran') : L('What the payment page collects', 'Kaj zbere plačilna stran')),
          h('dl', { class: 'dl jn-sheet__dl' }, rows.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))),
          h('p', { class: 'jn-sheet__total' }, h('span', {}, L('Due today', 'Za plačilo danes')), h('b', { class: 'mono' }, previewOnly ? fmt.eur(0, { digits: 2 }) : fmt.eur(p.amount, { digits: 2 }))),
          previewOnly ? h('p', { class: 'small muted' }, L(`At launch: ${fmt.eur(p.amount, { digits: 2 })} ${flow.interval === 'year' ? 'a year' : 'a month'}. Nothing is charged in this preview.`, `Ob zagonu: ${fmt.eur(p.amount, { digits: 2 })} ${flow.interval === 'year' ? 'na leto' : 'na mesec'}. V tem predogledu se nič ne zaračuna.`)) : null,
        ),
        err,
        h('p', { class: 'jn-actions' }, btn),
      ),
      h(
        'aside',
        { class: 'c-meta jn-aside' },
        h('p', { class: 'label' }, L('How access starts', 'Kako se začne dostop')),
        h('p', { class: 'small' }, L('Coming back from the payment page grants nothing by itself. Access starts when Stripe tells our server the invoice is paid, and runs to the end of the period plus 3 days.', 'Vrnitev s plačilne strani sama ne odobri ničesar. Dostop se začne, ko Stripe našemu strežniku sporoči, da je račun plačan, in traja do konca obdobja in še 3 dni.')),
        h('p', { class: 'small' }, L('Withdraw within 14 days of your first payment for a full refund, with the button in your account.', 'V 14 dneh od prvega plačila lahko odstopite in dobite celotno vračilo, z gumbom v računu.')),
      ),
    ];
  }

  function bodyOf(id) {
    return { tier: tierBody, account: accountBody, country: countryBody, phone: phoneBody, code: codeBody, consent: consentBody, checkout: checkoutBody }[id]();
  }

  // ---- activating → done ---------------------------------------------------------------------------------------
  function startActivation() {
    flow.step = 'activating';
    act = { stage: 1, timedOut: false };
    draw();
    if (live && !previewOnly) pollMe();
    else {
      const d = prefersReducedMotion() ? 500 : 900;
      later(() => advance(2), d);
      later(() => advance(3), d * 2);
      later(() => finish(), d * 3);
    }
  }
  function advance(stage) {
    act.stage = stage;
    const list = finalWrap.querySelector('.jn-act');
    if (list) list.replaceWith(activationList());
    announce(stageText(stage - 1));
  }
  function finish() {
    flow.step = 'final';
    if (!live) {
      demo.joined = {
        email: flow.email,
        tier: flow.tier,
        interval: flow.interval,
        country: flow.country,
        smsEligible: !!flow.geo?.smsEligible,
        phoneMasked: flow.masked,
        smsLocale: flow.smsLocale,
        token: flow.token,
        at: formatInZone(new Date(ctx.now()), LJUBLJANA).date,
        consents: { ...flow.consents },
        preview: flow.checkout !== 'paid', // a pre-launch preview charged nothing (#account says so)
      };
      demo.token = flow.token;
      demo.prefs.sms = !!flow.consents.sms;
    }
    draw();
    announce(previewOnly ? L('Preview complete.', 'Predogled zaključen.') : L('Your subscription is active.', 'Naročnina je aktivna.'));
  }
  async function pollMe(started = Date.now()) {
    try {
      const m = await api('/api/me', { signal: ctx.signal });
      if (m?.activation === 'active') {
        advance(3);
        later(finish, 400);
        return;
      }
      if (Date.now() - started > 180000) {
        act.timedOut = true;
        advance(2);
        return;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
    later(() => pollMe(started), 2500);
  }
  function stageText(k) {
    const texts = [
      L('Back from the payment page. This redirect grants nothing by itself.', 'Nazaj s plačilne strani. Ta preusmeritev sama ne odobri ničesar.'),
      previewOnly ? L('Stripe tells our server the invoice is paid (simulated in this preview).', 'Stripe našemu strežniku sporoči, da je račun plačan (v tem predogledu simulirano).') : L('Waiting for Stripe to tell our server the invoice is paid.', 'Čakamo, da Stripe našemu strežniku sporoči, da je račun plačan.'),
      L('Access is active until the end of the period, plus 3 days.', 'Dostop je aktiven do konca obdobja in še 3 dni.'),
    ];
    return texts[k];
  }
  function activationList() {
    return h(
      'ol',
      { class: 'jn-act' },
      [0, 1, 2].map((k) =>
        h(
          'li',
          { class: ['jn-act__i', act.stage > k + 1 || (act.stage === 3 && k === 2) ? 'is-done' : act.stage === k + 1 ? 'is-now' : 'is-later'] },
          h('span', { class: 'jn-act__n mono', 'aria-hidden': 'true' }, `0${k + 1}`),
          h('span', {}, stageText(k)),
          h('span', { class: 'jn-act__s label' }, act.stage > k + 1 || (act.stage === 3 && k === 2) ? L('done', 'opravljeno') : act.stage === k + 1 ? (k === 1 && act.timedOut ? L('still waiting', 'še čakamo') : L('now', 'zdaj')) : ''),
        ),
      ),
    );
  }

  function finalSection() {
    if (flow.step === 'activating') {
      return h(
        'section',
        { class: 'grid jn-final is-activating', 'aria-labelledby': 'jn-final-h' },
        h('p', { class: 'jn-idx c-margin', 'aria-hidden': 'true' }, '08'),
        h('div', { class: 'c-body' }, h('p', { class: 'label' }, L('Activation', 'Aktivacija')), h('h2', { class: 'display d3', id: 'jn-final-h', tabindex: '-1' }, L('Activating…', 'Aktiviranje …'))),
        h('div', { class: 'c-wide' }, activationList()),
        act?.timedOut
          ? h(
              'p',
              { class: 'c-body small' },
              L('This can take a minute after payment. We email you when access starts; you can close this page.', 'Po plačilu lahko traja minuto. Ko se dostop začne, vam pošljemo e-pošto; to stran lahko zaprete.'),
              ' ',
              h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => pollMe() }, L('Check again', 'Preveri znova')),
            )
          : null,
      );
    }
    // done
    const sms = !!flow.consents.sms && !!flow.geo?.smsEligible;
    const smsLocale = flow.smsLocale ?? locale;
    const optIn = smsModel('OPT_IN', smsLocale, { token: flow.token });
    const now = new Date(ctx.now());
    const q = quietHoursAt(now);
    const t = phoneThread({ messages: [], locale: smsLocale, label: L('The confirmation text', 'Potrditveni SMS') });
    // Live: the stop link is personal and only the server knows it, so it is not shown here.
    if (sms) t.add({ text: live ? optIn.text.replace(flow.token, '••••••') : optIn.text, at: q.at.toISOString(), fresh: true });
    const lj = formatInZone(q.at, LJUBLJANA);
    const title = previewOnly ? (sms ? L('Preview complete. This is the text you would get now.', 'Predogled zaključen. To je SMS, ki bi ga zdaj prejeli.') : L('Preview complete.', 'Predogled zaključen.')) : L('You are in.', 'Naročeni ste.');
    return h(
      'section',
      { class: 'grid chamber ruled jn-final is-done', 'aria-labelledby': 'jn-final-h' },
      h('p', { class: 'jn-idx c-margin', 'aria-hidden': 'true' }, '08'),
      h(
        'div',
        { class: 'c-body jn-final__text' },
        h('p', { class: 'label' }, previewOnly ? L('Done · preview', 'Končano · predogled') : L('Done', 'Končano')),
        h('h2', { class: 'display d3', id: 'jn-final-h', tabindex: '-1' }, title),
        h(
          'p',
          { class: 'lede' },
          previewOnly
            ? LC.joinDone(!live)
            : L('Your first text arrives with the next BUY, RENEW or CLOSE. On many days there is none.', 'Prvi SMS prispe z naslednjim NAKUPOM, PODALJŠANJEM ali ZAPRTJEM. Veliko dni ga ni.'),
        ),
        sms
          ? h(
              'p',
              { class: 'small' },
              q.held ? L(`Quiet hours: texts go out only between 08:00 and 21:00, so this one waits until ${lj.time.slice(0, 5)} on ${fmt.date(lj.date)}. `, `Mirne ure: SMS gredo samo med 08:00 in 21:00, zato ta počaka do ${lj.time.slice(0, 5)}, ${fmt.date(lj.date)}. `) : '',
              L(`${optIn.label} · one text. After this, a text comes only with a BUY, CLOSE or RENEW at 14:00, at most 16 a month.`, `${optIn.label} · en SMS. Potem SMS pride samo ob NAKUPU, ZAPRTJU ali PODALJŠANJU ob 14:00, največ 16 na mesec.`),
            )
          : h('p', { class: 'small' }, flow.geo?.smsEligible ? L('You chose no texts: every pick arrives by email and push at 14:00.', 'Izbrali ste brez SMS: vsaka izbira prispe po e-pošti in s potisnim obvestilom ob 14:00.') : L(`No texts in ${countryName(flow.country, 'en')}: every pick arrives by email and push at 14:00.`, `V državi ${countryName(flow.country, 'sl')} ni SMS: vsaka izbira prispe po e-pošti in s potisnim obvestilom ob 14:00.`)),
        h(
          'p',
          { class: 'jn-final__links' },
          h('a', { class: 'btn', href: href('app') }, L('Open today’s issue', 'Odpri današnjo izdajo'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')),
          h('a', { class: 'arrow-link', href: href('account') }, L('Your account', 'Vaš račun'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')),
          sms && !live ? h('a', { class: 'arrow-link', href: href('unsubscribe', flow.token) }, L('What the stop link does', 'Kaj naredi povezava za odjavo'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')) : null,
        ),
        !live
          ? h(
              'p',
              { class: 'small muted' },
              L('The demo bar’s “View as” switches between tiers on every page. ', 'Z »Pogled kot« v demo vrstici preklapljate med paketi na vseh straneh. '),
              h(
                'button',
                {
                  type: 'button',
                  class: 'jn-change',
                  onclick: () => {
                    restart();
                    flow.step = 'tier';
                    draw();
                  },
                },
                L('Start over', 'Začni znova'),
              ),
            )
          : null,
      ),
      h('div', { class: 'c-meta jn-final__phone' }, sms ? t.node : h('p', { class: 'small muted' }, L('No confirmation text: texts are off.', 'Brez potrditvenega SMS: SMS je izklopljen.'))),
    );
  }

  // ---- live resume ---------------------------------------------------------------------------------------------
  function resumeLive(m) {
    if (!m) return;
    try {
      const saved = JSON.parse(store('quorum.join') || 'null');
      if (saved && PAID_TIERS.includes(saved.tier) && !flow.done.has('tier')) {
        flow.tier = saved.tier;
        flow.interval = saved.interval === 'year' ? 'year' : 'month';
      }
    } catch {
      /* nothing saved */
    }
    if (!m.authenticated) {
      if (flow.step !== 'tier' && flow.step !== 'account') flow.step = flow.done.has('tier') ? 'account' : 'tier';
      return;
    }
    flow.email = m.user?.email ?? flow.email;
    flow.done.add('tier');
    flow.done.add('account');
    flow.sent = false;
    if (m.geo?.ok) {
      flow.country = m.geo.country ?? m.user?.jurisdiction ?? flow.country;
      flow.geo = { ok: true, country: flow.country, smsEligible: !!m.geo.smsEligible };
      flow.done.add('country');
    }
    if (m.phone?.verified) {
      flow.masked = m.phone.masked;
      flow.done.add('phone');
      flow.done.add('code');
    }
    const c = m.consents ?? {};
    if (c.terms?.granted && c.immediate_performance?.granted) {
      flow.done.add('consent');
      flow.consents = { sms: !!c.sms?.granted, terms: true, immediate_performance: true };
    }
    const s = stepFromMe(m);
    if (s === 'done') {
      flow.done.add('checkout');
      flow.checkout = 'paid';
      flow.step = 'final';
    } else if (s === 'activating') {
      flow.done.add('checkout');
      flow.step = 'activating';
      act = { stage: 2, timedOut: false };
      queueMicrotask(() => pollMe());
    } else if (s === 'refused') {
      flow.step = 'country';
    } else if (!flow.liveResumed || !STEPS.includes(flow.step) || flow.done.has(flow.step)) {
      flow.step = s === 'account' ? 'account' : firstOpen();
    }
    flow.liveResumed = true;
  }

  draw({ focus: false });

  // Coming back from the payment page (live), the activation is what matters: show it.
  return {
    title: L('Join', 'Pridruži se'),
    node,
    afterMount() {
      if (live && (flow.step === 'activating' || flow.step === 'final')) finalWrap.firstElementChild?.scrollIntoView({ block: 'start' });
    },
    cleanup() {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      // Leaving #join forgets the typed number (the page promises it): only the masked form survives,
      // so the flow can still resume. Live mode keeps the E.164 the server's code check needs.
      flow.phoneInput = '';
      if (!live) flow.e164 = null;
    },
  };
}

// For tests and the demo: forget the flow (the page calls this on "Start over").
export function _resetJoin() {
  restart(false);
}
