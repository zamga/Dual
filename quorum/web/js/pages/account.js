// #account: channels, billing (the Stripe portal live, a preview in the demo), the EU withdrawal button
// with an in-page confirmation (Directive 2023/2673; a 14-day full refund on the first subscription),
// a copy of your data (JSON; the viewer blocks downloads), and account deletion with confirmation.
//
// Demo: a fictional reader of the "view as" tier, in this tab's memory only. Live: /api/me, /api/prefs,
// /api/billing/portal, /api/withdraw, /api/export, /api/account/delete, /api/auth/logout.
//
// SL: first draft, needs native (and legal) review.
import { h, announce } from '../dom.js';
import { href } from '../router.js';
import { masthead } from './_content.js';
import { api, errorText } from './_api.js';
import { demo, resetDemo, loadMe, tierOf, channelsPanel, modeNote, signInPanel, copyPanel, confirmFlow } from './_member.js';
import { price, countryName } from './_join.js';
import { consentHash, consentVersion } from '../core/consent-texts.js';
import { formatInZone, LJUBLJANA } from '../core/calendar.js';

export async function render(ctx) {
  const { L, locale, fmt } = ctx;
  const live = ctx.mode === 'live';
  let me = null;
  let err = null;
  try {
    me = await loadMe(ctx);
  } catch (e) {
    err = e;
  }
  const tierName = (t) => ({ free: 'Ledger', signal: 'Signal', research: 'Research' })[t] ?? t;

  if (!me?.authenticated) {
    const node = h(
      'div',
      { class: 'page acc' },
      masthead({
        kicker: L('Account', 'Račun'),
        title: !live && demo.deleted ? L('Account deleted.', 'Račun izbrisan.') : L('Sign in to your account.', 'Prijava v račun.'),
        lede: !live && demo.deleted ? L('The demo reader in this tab is gone. In the live service, the records the law requires stay, pointing at an anonymised id.', 'Demo bralca v tem zavihku ni več. V živi storitvi ostanejo zapisi, ki jih zahteva zakon, vezani na anonimiziran identifikator.') : L('No password: we email a link that works once.', 'Brez gesla: pošljemo povezavo, ki deluje enkrat.'),
        meta: modeNote(ctx),
      }),
      h(
        'section',
        { class: 'grid rec-sec acc-sec' },
        h(
          'div',
          { class: 'c-body' },
          !live && demo.deleted
            ? h(
                'p',
                { class: 'acc-actions' },
                h('button', { type: 'button', class: 'btn', onclick: () => (resetDemo(), ctx.reload()) }, L('Restore the demo reader', 'Obnovi demo bralca')),
                h('a', { class: 'arrow-link', href: href('join') }, L('Join', 'Pridruži se'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→')),
              )
            : h('div', {}, err ? h('p', { class: 'm-field__err small' }, errorText(err, locale)) : null, signInPanel(ctx), h('p', { class: 'small muted acc-join' }, L('No account yet? ', 'Še nimate računa? '), h('a', { href: href('join') }, L('Join', 'Pridruži se')))),
        ),
      ),
    );
    return { title: L('Account', 'Račun'), node };
  }

  const tier = tierOf(ctx, me);
  const sub = me.subscription;
  const interval = sub?.interval === 'year' ? 'year' : 'month';
  const p = tier !== 'free' ? price(tier, interval) : null;
  const now = new Date(ctx.now());
  const stamp = () => {
    const z = formatInZone(new Date(ctx.now()), LJUBLJANA);
    return `${fmt.date(z.date)} ${z.time.slice(0, 5)}`;
  };

  // ---- identity strip ---------------------------------------------------------------------------------------
  const idRows = [
    [L('Email', 'E-pošta'), me.user?.email ?? '–'],
    [L('Country', 'Država'), me.geo?.country ? countryName(me.geo.country, locale, { list: true }) : '–'],
    [L('Mobile', 'Mobilna'), me.phone?.masked ? `${me.phone.masked}${me.phone.verified ? ` · ${L('verified', 'potrjena')}` : ''}` : L('none', 'brez')],
    [L('Plan', 'Paket'), tier === 'free' ? L('Ledger · free', 'Ledger · brezplačno') : `${tierName(tier)} · ${interval === 'year' ? L('annual', 'letno') : L('monthly', 'mesečno')}`],
  ];
  const signOut = live
    ? h(
        'button',
        {
          type: 'button',
          class: 'btn btn--ghost',
          onclick: async () => {
            await api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => null);
            ctx.reload();
          },
        },
        L('Sign out', 'Odjava'),
      )
    : null;
  const metaCol = h(
    'div',
    { class: 'acc-meta' },
    h('dl', { class: 'dl acc-id' }, idRows.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))),
    !live ? modeNote(ctx, me.user?.fictional ? L('Demo: a fictional reader of the “View as” tier. Nothing here is stored.', 'Demo: izmišljeni bralec paketa »Pogled kot«. Nič se ne shrani.') : L('Demo: the reader from the join preview, in this tab only.', 'Demo: bralec iz predogleda prijave, samo v tem zavihku.')) : signOut,
  );

  const section = (i, id, kicker, title, body, aside) =>
    h(
      'section',
      { class: 'grid content-sec acc-sec', id, 'aria-labelledby': `${id}-h` },
      h('p', { class: 'sec-index c-margin', 'aria-hidden': 'true' }, String(i).padStart(2, '0')),
      h('div', { class: 'c-head acc-head' }, h('p', { class: 'label' }, kicker), h('h2', { id: `${id}-h` }, title)),
      h('div', { class: 'c-body acc-body' }, body),
      aside ? h('aside', { class: 'c-meta content-aside acc-aside' }, aside) : null,
    );

  // ---- 01 channels ----------------------------------------------------------------------------------------
  const consents = me.consents ?? {};
  const cRow = (kind, label) =>
    h(
      'div',
      {},
      h('dt', {}, label),
      h('dd', {}, consents[kind]?.granted ? L(`given · text ${consents[kind].version ?? consentVersion(kind)}`, `dano · besedilo ${consents[kind].version ?? consentVersion(kind)}`) : L('not given', 'ni dano')),
    );
  const channels = section(
    1,
    'channels',
    L('Channels', 'Kanali'),
    L('How the issue reaches you.', 'Kako vas doseže izdaja.'),
    channelsPanel(ctx, me, {}),
    [
      h('p', { class: 'label' }, L('Your consents', 'Vaša soglasja')),
      h('dl', { class: 'dl acc-consents' }, cRow('sms', 'SMS'), cRow('terms', L('Terms', 'Pogoji')), cRow('immediate_performance', L('Immediate start', 'Takojšen začetek'))),
      h('p', { class: 'small muted' }, L('Each is stored with the SHA-256 of the exact text you ticked. Turning texts back on asks again, with an unchecked box.', 'Vsako je shranjeno s SHA-256 natančnega besedila, ki ste ga označili. Ponoven vklop SMS vpraša znova, z neoznačenim poljem.')),
    ],
  );

  // ---- 02 billing -----------------------------------------------------------------------------------------
  const billingBody = h('div', { class: 'acc-billing' });
  if (tier === 'free' || !sub) {
    billingBody.append(
      h('p', { class: 'lede' }, L('No subscription. The Ledger tier is free: the public record, the daily headline and the Sunday email.', 'Brez naročnine. Paket Ledger je brezplačen: javni zapis, dnevni naslov in nedeljska e-pošta.')),
      h('p', {}, h('a', { class: 'btn', href: href('join') }, L('Join Signal or Research', 'Naroči Signal ali Research'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'))),
    );
  } else {
    const status = sub.withdrawnAt || demo.withdrawn ? L('withdrawn', 'odstopljeno') : sub.status === 'preview' ? L('preview · nothing charged', 'predogled · nič zaračunano') : sub.cancelAtPeriodEnd ? L('ends at the period end', 'poteče ob koncu obdobja') : sub.status === 'active' ? L('active', 'aktivna') : sub.status;
    billingBody.append(
      h(
        'div',
        { class: 'acc-plan' },
        h('p', { class: 'label' }, tierName(tier)),
        h('p', { class: 'acc-plan__price' }, h('span', { class: 'acc-plan__amount' }, p ? fmt.eur(p.amount) : '–'), h('span', { class: 'small muted' }, interval === 'year' ? L('a year, VAT included', 'na leto, z DDV') : L('a month, VAT included', 'na mesec, z DDV'))),
        h(
          'dl',
          { class: 'dl acc-plan__dl' },
          h('div', {}, h('dt', {}, L('Status', 'Stanje')), h('dd', {}, status)),
          sub.currentPeriodEnd ? h('div', {}, h('dt', {}, L('Current period ends', 'Obdobje se konča')), h('dd', {}, fmt.date(String(sub.currentPeriodEnd).slice(0, 10)))) : null,
          h('div', {}, h('dt', {}, L('Cancel', 'Preklic')), h('dd', {}, L('one click in the portal; access runs to the period end', 'en klik v portalu; dostop do konca obdobja'))),
        ),
      ),
    );
    const portalMsg = h('p', { class: 'small', role: 'status' });
    if (live) {
      const btn = h('button', { type: 'button', class: 'btn' }, L('Open the billing portal', 'Odpri portal za plačila'), h('span', { class: 'btn__arrow', 'aria-hidden': 'true' }, '→'));
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const r = await api('/api/billing/portal', { method: 'POST', body: {} });
          if (r?.url) location.assign(r.url);
        } catch (e) {
          portalMsg.textContent = errorText(e, locale);
          btn.disabled = false;
        }
      });
      billingBody.append(h('p', { class: 'acc-actions' }, btn), portalMsg);
    } else {
      const sheet = h(
        'div',
        { class: 'jn-sheet paper acc-portal', hidden: true, id: 'acc-portal' },
        h('p', { class: 'label' }, L('The billing portal (Stripe), in the live service', 'Portal za plačila (Stripe) v živi storitvi')),
        h(
          'ul',
          { class: 'acc-portal__list' },
          [
            L('Cancel at the end of the period, in one click. No call, no email, no questionnaire.', 'Preklic ob koncu obdobja z enim klikom. Brez klica, e-pošte ali vprašalnika.'),
            L('Change the card or payment method.', 'Sprememba kartice ali načina plačila.'),
            L('Every invoice, with VAT shown.', 'Vsi računi, z izkazanim DDV.'),
            L('No pause, no retention offers.', 'Brez premora in brez ponudb za zadržanje.'),
          ].map((x) => h('li', {}, x)),
        ),
      );
      const btn = h('button', { type: 'button', class: 'btn btn--ghost', 'aria-expanded': 'false', 'aria-controls': 'acc-portal' }, L('Preview the billing portal', 'Predogled portala za plačila'));
      btn.addEventListener('click', () => {
        sheet.hidden = !sheet.hidden;
        btn.setAttribute('aria-expanded', String(!sheet.hidden));
      });
      billingBody.append(h('p', { class: 'acc-actions' }, btn), sheet);
    }
  }
  const billing = section(2, 'billing', L('Billing', 'Plačila'), L('What you pay, and how to stop.', 'Kaj plačujete in kako prenehate.'), billingBody, [
    h('p', { class: 'label' }, L('Policies', 'Pravila')),
    h('p', { class: 'small' }, L('One price for everyone. A reminder 7 days before any annual renewal. No upsell emails in the first 30 days; no marketing texts ever.', 'Ena cena za vse. Opomnik 7 dni pred vsako letno obnovitvijo. Brez prodajnih e-sporočil v prvih 30 dneh; nikoli trženjskih SMS.')),
  ]);

  // ---- 03 withdrawal (EU button) --------------------------------------------------------------------------
  const w = me.withdrawal ?? {};
  const wBody = h('div', { class: 'acc-withdraw' });
  if (tier === 'free' || !sub) {
    wBody.append(h('p', {}, L('There is no paid subscription to withdraw from.', 'Ni plačane naročnine, od katere bi odstopili.')));
  } else if (demo.withdrawn && !live) {
    wBody.append(withdrawnNode(demo.withdrawn));
  } else if (w.preview) {
    wBody.append(h('p', {}, L('Nothing was charged: this subscription is a pre-launch preview, so there is nothing to withdraw from or refund.', 'Nič ni bilo zaračunano: ta naročnina je predogled pred zagonom, zato ni česa odstopiti ali vrniti.')));
  } else if (!w.eligible) {
    wBody.append(h('p', {}, sub.withdrawnAt ? L('You have withdrawn from this subscription.', 'Od te naročnine ste odstopili.') : L('The 14-day withdrawal period has ended. You can still cancel at any time in the billing portal; access runs to the end of the paid period.', 'Rok 14 dni za odstop je potekel. Še vedno lahko kadar koli prekličete v portalu za plačila; dostop traja do konca plačanega obdobja.')));
  } else {
    const deadline = w.deadline ? fmt.date(String(w.deadline).slice(0, 10)) : '';
    const amount = p ? fmt.eur(p.amount, { digits: 2 }) : null;
    wBody.append(
      h(
        'p',
        { class: 'lede' },
        L(`You can withdraw until ${deadline}, 14 days after your first payment. ${w.fullRefund ? `This is your first subscription, so the refund is in full${amount ? `: ${amount}` : ''}.` : 'This is not your first subscription, so the unused share is refunded.'}`, `Odstopite lahko do ${deadline}, 14 dni po prvem plačilu. ${w.fullRefund ? `To je vaša prva naročnina, zato je vračilo celotno${amount ? `: ${amount}` : ''}.` : 'To ni vaša prva naročnina, zato se vrne neporabljeni del.'}`),
      ),
      confirmFlow(ctx, {
        trigger: L('Withdraw from contract here', 'Tukaj odstopite od pogodbe'),
        triggerClass: 'btn',
        title: L('Confirm your withdrawal', 'Potrdite odstop'),
        body: h(
          'ul',
          { class: 'acc-list' },
          [
            L('Access ends now: no more texts, push or email about picks.', 'Dostop se konča zdaj: ni več SMS, potisnih obvestil ali e-pošte o izbirah.'),
            w.fullRefund ? L(`The refund${amount ? ` of ${amount}` : ''} goes to the card you paid with, within 14 days.`, `Vračilo${amount ? ` ${amount}` : ''} gre na kartico, s katero ste plačali, v 14 dneh.`) : L('The unused share is refunded to your card within 14 days.', 'Neporabljeni del se vrne na kartico v 14 dneh.'),
            L('The subscription is cancelled; no further charges.', 'Naročnina je preklicana; brez nadaljnjih bremenitev.'),
            L('Your account and the free Ledger tier stay.', 'Račun in brezplačni paket Ledger ostaneta.'),
          ].map((x) => h('li', {}, x)),
        ),
        confirm: L('Confirm withdrawal', 'Potrdi odstop'),
        cancel: L('Keep my subscription', 'Obdrži naročnino'),
        onConfirm: async () => {
          // Afterwards the whole page follows (channels off, billing withdrawn, no refund offer): it is
          // rendered again from the viewer, and focus lands on the withdrawal result.
          const refresh = () =>
            setTimeout(async () => {
              await ctx.reload();
              const res = document.querySelector('#withdrawal .acc-result, #withdrawal .acc-result__t');
              if (res) {
                res.setAttribute('tabindex', '-1');
                res.focus();
              }
            }, 0);
          if (!live) {
            demo.withdrawn = { at: stamp(), amount };
            announce(L('Withdrawal confirmed.', 'Odstop potrjen.'));
            refresh();
            return withdrawnNode(demo.withdrawn);
          }
          const r = await api('/api/withdraw', { method: 'POST', body: {} });
          refresh();
          return h(
            'div',
            {},
            h('p', { class: 'acc-result__t' }, r.status === 'completed' ? L('Withdrawal confirmed.', 'Odstop potrjen.') : L('Withdrawal recorded. Access has ended.', 'Odstop zabeležen. Dostop se je končal.')),
            h('p', {}, r.status === 'completed' ? L('The refund is on its way and the subscription is cancelled. A confirmation email follows.', 'Vračilo je na poti in naročnina preklicana. Sledi potrditveno e-sporočilo.') : r.message ?? L('The refund needs a manual step; we complete it within 14 days.', 'Vračilo zahteva ročni korak; zaključimo ga v 14 dneh.')),
          );
        },
      }),
    );
  }
  function withdrawnNode(x) {
    return h(
      'div',
      { class: 'acc-result' },
      h('p', { class: 'acc-result__t' }, L(`Withdrawal confirmed, ${x.at}.`, `Odstop potrjen, ${x.at}.`)),
      h('p', {}, L(`Access ended at once and the subscription is cancelled.${x.amount ? ` ${x.amount} goes back to your card within 14 days.` : ''}`, `Dostop se je takoj končal in naročnina je preklicana.${x.amount ? ` ${x.amount} se vrne na kartico v 14 dneh.` : ''}`)),
      h('p', { class: 'small muted' }, L('Demo: nothing was charged, refunded or sent. The rest of the demo still shows the “View as” tier.', 'Demo: nič ni bilo zaračunano, vrnjeno ali poslano. Preostali demo še vedno kaže paket »Pogled kot«.')),
    );
  }
  const withdrawal = section(3, 'withdrawal', L('Withdrawal', 'Odstop'), L('14 days to change your mind.', '14 dni za premislek.'), wBody, [
    h('p', { class: 'label' }, L('The law', 'Zakon')),
    h('p', { class: 'small' }, L('EU consumers have a withdrawal button for contracts made online (Directive (EU) 2023/2673, from 19 June 2026). It is here, not behind a support email.', 'Potrošniki v EU imajo za pogodbe, sklenjene na spletu, gumb za odstop (Direktiva (EU) 2023/2673, od 19. junija 2026). Tukaj je, ne za e-pošto podpori.')),
  ]);

  // ---- 04 your data ---------------------------------------------------------------------------------------
  const exportText = async () => {
    if (live) return JSON.stringify(await api('/api/export', { signal: ctx.signal }), null, 2);
    const hashes = Object.fromEntries(await Promise.all(['sms', 'terms', 'immediate_performance'].map(async (k) => [k, await consentHash(k, locale)])));
    const data = {
      format: 'quorum-export/1',
      demo: true,
      note: 'Demo export of a fictional reader, built in your browser. Nothing about you is stored.',
      exportedAt: now.toISOString(),
      user: { email: me.user.email, locale, declaredCountry: me.user.declaredCountry, jurisdiction: me.user.jurisdiction, status: 'geo_ok', fictional: true },
      phoneNumbers: me.phone ? [{ masked: me.phone.masked, country: me.phone.country, verified: me.phone.verified, note: 'the demo never holds a real number' }] : [],
      consentEvents: ['sms', 'terms', 'immediate_performance']
        .filter((k) => me.consents?.[k]?.granted)
        .map((k) => ({ kind: k, action: 'grant', text_version: consentVersion(k), text_sha256: hashes[k], locale, channel: 'web' })),
      channelPrefs: me.prefs,
      subscriptions: sub ? [{ tier, interval, status: sub.status, current_period_end: sub.currentPeriodEnd }] : [],
      entitlements: me.entitlements,
      withdrawals: demo.withdrawn ? [{ requested_at: demo.withdrawn.at, status: 'completed', full_refund: true }] : [],
      optOuts: me.prefs?.sms ? [] : [{ channel: 'sms', source: 'link or account' }],
    };
    return JSON.stringify(data, null, 2);
  };
  const dataSec = section(
    4,
    'data',
    L('Your data', 'Vaši podatki'),
    L('Everything we hold about you.', 'Vse, kar hranimo o vas.'),
    h(
      'div',
      { class: 'acc-data' },
      h('p', {}, L('Every row we keep about you, as JSON: account, sign-ins, country checks, number, consents with their hashes, channels, billing, messages and opt-outs (GDPR Art. 15 and 20).', 'Vse vrstice, ki jih hranimo o vas, kot JSON: račun, prijave, preverjanja države, številka, soglasja z zgoščenimi vrednostmi, kanali, plačila, sporočila in odjave (člena 15 in 20 GDPR).')),
      copyPanel(ctx, {
        button: L('Copy my data as JSON', 'Kopiraj moje podatke kot JSON'),
        getText: exportText,
        rawLabel: L('View the JSON', 'Pokaži JSON'),
        summary: (t) => L(`Copied: ${fmt.int(t.length)} characters of JSON.`, `Kopirano: ${fmt.int(t.length)} znakov JSON.`),
        rows: 14,
      }).node,
    ),
    [h('p', { class: 'label' }, L('Why copy, not download', 'Zakaj kopiranje')), h('p', { class: 'small' }, L('This page cannot save files here, so the export is copied to your clipboard; paste it into any text file.', 'Ta stran tu ne more shranjevati datotek, zato se izvoz kopira v odložišče; prilepite ga v katero koli besedilno datoteko.'))],
  );

  // ---- 05 delete ----------------------------------------------------------------------------------------
  const retained = [
    [L('Consent records (text version and hash, time, IP, browser, page)', 'Zapisi o soglasjih (različica in zgoščena vrednost besedila, čas, IP, brskalnik, stran)'), L('proof of consent, kept 5 years', 'dokaz soglasja, hranjeno 5 let')],
    [L('Opt-out records', 'Zapisi o odjavah'), L('proof that texts stopped', 'dokaz, da je pošiljanje prenehalo')],
    [L('Subscription, payment, refund and withdrawal records', 'Zapisi o naročnini, plačilih, vračilih in odstopu'), L('accounting and tax law', 'računovodski in davčni predpisi')],
    [L('Delivery receipts (the number only as a hash)', 'Potrdila o dostavi (številka samo kot zgoščena vrednost)'), L('messaging audit', 'revizija sporočil')],
  ];
  const retainedList = () => h('dl', { class: 'dl acc-retained' }, retained.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))));
  const del = section(
    5,
    'delete',
    L('Delete', 'Izbris'),
    L('Close the account for good.', 'Račun zaprite za vedno.'),
    h(
      'div',
      { class: 'acc-delete' },
      h('p', {}, L('Deleting cancels any subscription at once (no refund: that is the withdrawal above), stops every text, signs you out everywhere and erases your email, number and preferences. What the law makes us keep stays, pointing at an anonymised id:', 'Izbris takoj prekliče morebitno naročnino (brez vračila: to je odstop zgoraj), ustavi vse SMS, vas odjavi povsod ter izbriše e-pošto, številko in nastavitve. Kar moramo hraniti po zakonu, ostane, vezano na anonimiziran identifikator:')),
      retainedList(),
      confirmFlow(ctx, {
        trigger: L('Delete my account', 'Izbriši moj račun'),
        danger: true,
        title: L('Delete the account?', 'Izbrišem račun?'),
        body: h('p', {}, L('This cannot be undone. The account, its email, number and settings are erased now.', 'Tega ni mogoče razveljaviti. Račun, e-pošta, številka in nastavitve se izbrišejo takoj.')),
        gate: L('I understand that deletion cannot be undone.', 'Razumem, da izbrisa ni mogoče razveljaviti.'),
        confirm: L('Delete my account now', 'Izbriši moj račun zdaj'),
        cancel: L('Keep my account', 'Obdrži račun'),
        onConfirm: async () => {
          if (live) await api('/api/account/delete', { method: 'POST', body: { confirm: true } });
          else {
            resetDemo();
            demo.deleted = true;
          }
          announce(L('Account deleted.', 'Račun izbrisan.'));
          return h(
            'div',
            {},
            h('p', { class: 'acc-result__t' }, L('Account deleted.', 'Račun izbrisan.')),
            h('p', {}, live ? L('You are signed out. Nothing more will be sent.', 'Odjavljeni ste. Nič več ne bomo pošiljali.') : L('Demo: the fictional reader in this tab is gone; nothing was sent.', 'Demo: izmišljenega bralca v tem zavihku ni več; nič ni bilo poslano.')),
            !live ? h('p', {}, h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => (resetDemo(), ctx.reload()) }, L('Restore the demo reader', 'Obnovi demo bralca'))) : null,
          );
        },
      }),
    ),
    null,
  );

  const node = h(
    'div',
    { class: 'page acc' },
    masthead({
      kicker: L(`Account · ${tierName(tier)}`, `Račun · ${tierName(tier)}`),
      title: L('Everything you agreed to, and how to undo it.', 'Vse, s čimer ste se strinjali, in kako to prekličete.'),
      lede: L('Channels, billing, the 14-day withdrawal, a copy of your data and deletion. Each is on this page; none needs an email to support.', 'Kanali, plačila, odstop v 14 dneh, kopija podatkov in izbris. Vse je na tej strani; nič ne zahteva e-pošte podpori.'),
      meta: metaCol,
    }),
    channels,
    billing,
    withdrawal,
    dataSec,
    del,
  );
  return { title: L('Account', 'Račun'), node };
}
