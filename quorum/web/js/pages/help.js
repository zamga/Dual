// #/help: SMS help (qrm.si/help is printed in the opt-in text) and the FAQ.
// SL: first draft, needs native review.
import { h } from '../dom.js';
import { masthead, contentSections, page, toNode } from './_content.js';

const COPY = {
  en: {
    title: 'Help',
    kicker: 'Help · SMS and questions',
    h1: 'Help with texts, and straight answers.',
    lede: 'Texts come from the sender QUORUM, only at 14:00 Ljubljana time on US trading days, and only when an issue contains a BUY, CLOSE or RENEW. Replies are not read. Every text has your own stop link.',
    sms: {
      title: 'SMS help',
      body: `<dl class="dl dl--wide">
<div><dt>Sender</dt><dd>QUORUM (alphanumeric, one-way)</dd></div>
<div><dt>When</dt><dd>14:00 Ljubljana time, US trading days only</dd></div>
<div><dt>What</dt><dd>BUY, CLOSE and RENEW only. No marketing texts, ever.</dd></div>
<div><dt>How many</dt><dd>At most 16 a month, picks and exits together. Most days, none.</dd></div>
<div><dt>Countries</dt><dd>Slovenia, Austria, Germany, Croatia, Italy</dd></div>
<div><dt>Quiet hours</dt><dd>Nothing outside 08:00–21:00 in your time zone, enforced in code</dd></div>
<div><dt>Cost</dt><dd>We charge nothing per text. Your operator may charge for roaming.</dd></div>
</dl>`,
      aside: `<p class="small muted">The sender is alphanumeric, so replying STOP or HELP cannot reach us. Use the stop link instead; it works in one tap.</p>`,
    },
    stop: {
      title: 'Stop the texts',
      body: `<ol><li><strong>Tap the stop link</strong> at the end of any text (qrm.si/u/…). It opens a confirmation page; one tap turns SMS off immediately, across every message.</li><li>Or switch SMS off in <a href="#/account">your account</a>.</li><li>Or email <span class="mono">support@quorum.example</span> from the address on your account.</li></ol><p>You get one final text confirming that SMS is off. Your subscription is not affected: picks still arrive by email and push.</p>`,
    },
    missing: {
      title: 'Not receiving texts?',
      body: `<ul><li>Most days there is no quorum and no text. Check <a href="#/ledger">the latest issue</a> first.</li><li>Check that your number is verified and SMS is on in <a href="#/account">your account</a>.</li><li>Texts are sent only to numbers in the five SMS countries.</li><li>Some phones file alphanumeric senders separately; look for QUORUM in your message list.</li><li>Delivery status for each channel is on <a href="#/status">the status page</a>.</li></ul>`,
    },
    faq: {
      title: 'Questions',
      items: [
        ['Is this investment advice?', '<p>No. We publish general research to the public. It does not take your situation into account, and we cannot tell you whether to buy or sell. Support and any assistant will refuse that question.</p>'],
        ['Why was there no text today?', '<p>Because no stock had at least three of four families in their top decile without a veto. The issue still published at 14:00, with the number of stocks scored and the closest agreement reached.</p>'],
        ['What does 3/4 mean?', '<p>Three of our four model families ranked the stock in their top decile that day. 4/4 means all four. We show conviction only this way, never as a probability or a score.</p>'],
        ['When is a pick measured from?', '<p>From the US regular-session open on the issue day, 90 minutes after the text (60 minutes in the weeks when the EU and US change clocks on different dates). The exit is the open 21 trading days later.</p>'],
        ['What is the alert gap?', '<p>The difference between the price when the pick was published and the entry open. We publish it for every pick. If the median gap exceeds 30 bps over 20 picks, the liquidity floor doubles.</p>'],
        ['Why can I not see the ticker of an open pick?', '<p>On the free Ledger tier, open picks are sealed: you see the number, the time and a commitment hash. The ticker is revealed at close, and anyone can check that it matches the hash.</p>'],
        ['Do you or your staff trade the picks?', '<p>No. The company holds no individual shares, and staff, founders and their families trade funds and ETFs only.</p>'],
        ['Can I get my money back?', '<p>Yes, a full refund within 14 days of your first subscription, with the withdrawal button in your account. Cancelling later is one click and keeps access until the end of the paid period.</p>'],
        ['How do I check the ledger myself?', '<p>Every record is canonical JSON hashed with SHA-256 and chained to the one before. The ledger page recomputes the chain in your browser, and the CSV lets you do it offline in any language.</p>'],
        ['What in this demo is real?', '<p>The rules, the calendar, the time zones, the hashing and the texts are real. The market, every company, ticker, price and person are simulated or fictional. Nothing here is a real service or a recommendation.</p>'],
      ],
    },
  },
  sl: {
    title: 'Pomoč',
    kicker: 'Pomoč · SMS in vprašanja',
    h1: 'Pomoč pri SMS in jasni odgovori.',
    lede: 'SMS prihajajo od pošiljatelja QUORUM, samo ob 14:00 po ljubljanskem času na dneve trgovanja v ZDA in samo, ko izdaja vsebuje NAKUP, ZAPRTJE ali PODALJŠANJE. Odgovorov ne beremo. Vsak SMS ima vašo povezavo za odjavo.',
    sms: {
      title: 'Pomoč za SMS',
      body: `<dl class="dl dl--wide">
<div><dt>Pošiljatelj</dt><dd>QUORUM (alfanumerični, enosmerni)</dd></div>
<div><dt>Kdaj</dt><dd>Ob 14:00 po ljubljanskem času, samo na dneve trgovanja v ZDA</dd></div>
<div><dt>Kaj</dt><dd>Samo NAKUP, ZAPRTJE in PODALJŠANJE. Nikoli trženjski SMS.</dd></div>
<div><dt>Koliko</dt><dd>Največ 16 na mesec, izbire in izhodi skupaj. Večino dni nobenega.</dd></div>
<div><dt>Države</dt><dd>Slovenija, Avstrija, Nemčija, Hrvaška, Italija</dd></div>
<div><dt>Mirne ure</dt><dd>Nič zunaj 08:00–21:00 v vašem časovnem pasu, zagotovljeno v kodi</dd></div>
<div><dt>Strošek</dt><dd>Za SMS ne zaračunavamo ničesar. Vaš operater lahko zaračuna gostovanje.</dd></div>
</dl>`,
      aside: `<p class="small muted">Pošiljatelj je alfanumerični, zato odgovor STOP ali HELP ne more priti do nas. Uporabite povezavo za odjavo; deluje z enim dotikom.</p>`,
    },
    stop: {
      title: 'Ustavite SMS',
      body: `<ol><li><strong>Tapnite povezavo za odjavo</strong> na koncu katerega koli SMS (qrm.si/u/…). Odpre stran za potrditev; en dotik takoj izklopi SMS za vsa sporočila.</li><li>Ali izklopite SMS v <a href="#/account">svojem računu</a>.</li><li>Ali pišite na <span class="mono">support@quorum.example</span> z naslova, ki je povezan z računom.</li></ol><p>Prejmete še en SMS s potrditvijo, da so SMS izklopljeni. Naročnina ostane nespremenjena: izbire še vedno prejemate po e-pošti in s potisnimi obvestili.</p>`,
    },
    missing: {
      title: 'Ne prejemate SMS?',
      body: `<ul><li>Večino dni ni kvoruma in ni SMS. Najprej preverite <a href="#/ledger">zadnjo izdajo</a>.</li><li>Preverite, ali je vaša številka potrjena in SMS vklopljen v <a href="#/account">vašem računu</a>.</li><li>SMS pošiljamo samo na številke v petih državah SMS.</li><li>Nekateri telefoni alfanumerične pošiljatelje razvrstijo posebej; poiščite QUORUM med sporočili.</li><li>Stanje dostave za vsak kanal je na <a href="#/status">strani s stanjem</a>.</li></ul>`,
    },
    faq: {
      title: 'Vprašanja',
      items: [
        ['Je to investicijski nasvet?', '<p>Ne. Javnosti objavljamo splošne raziskave. Ne upoštevajo vaših okoliščin in vam ne moremo reči, ali kupiti ali prodati. Podpora in vsak pomočnik bosta to vprašanje zavrnila.</p>'],
        ['Zakaj danes ni bilo SMS?', '<p>Ker nobena delnica ni imela vsaj treh od štirih družin v zgornjem decilu brez veta. Izdaja je kljub temu izšla ob 14:00, s številom ocenjenih delnic in največjim doseženim soglasjem.</p>'],
        ['Kaj pomeni 3/4?', '<p>Tri od naših štirih družin modelov so delnico tisti dan uvrstile v zgornji decil. 4/4 pomeni vse štiri. Prepričanje prikažemo samo tako, nikoli kot verjetnost ali oceno.</p>'],
        ['Od kdaj se meri izbira?', '<p>Od rednega odprtja ameriškega trga na dan izdaje, 90 minut po SMS (60 minut v tednih, ko EU in ZDA premikata uro na različna dneva). Izstop je odprtje 21 trgovalnih dni pozneje.</p>'],
        ['Kaj je razlika ob obvestilu?', '<p>Razlika med ceno ob objavi izbire in vstopno ceno ob odprtju. Objavimo jo za vsako izbiro. Če mediana v 20 izbirah preseže 30 b.t., se prag likvidnosti podvoji.</p>'],
        ['Zakaj ne vidim oznake odprte izbire?', '<p>V brezplačnem paketu Ledger so odprte izbire zapečatene: vidite številko, čas in zgoščeno zavezo. Oznaka se razkrije ob zaprtju in vsakdo lahko preveri, ali se ujema z zgoščeno vrednostjo.</p>'],
        ['Ali vi ali zaposleni trgujete z izbirami?', '<p>Ne. Podjetje nima posameznih delnic, zaposleni, ustanovitelji in njihove družine pa trgujejo samo s skladi in ETF.</p>'],
        ['Lahko dobim denar nazaj?', '<p>Da, celotno vračilo v 14 dneh od prve naročnine, z gumbom za odstop v vašem računu. Poznejša odpoved je en klik in dostop ostane do konca plačanega obdobja.</p>'],
        ['Kako sam preverim knjigo?', '<p>Vsak zapis je kanoničen JSON, zgoščen s SHA-256 in povezan s prejšnjim. Stran knjige verigo ponovno izračuna v vašem brskalniku, s CSV pa to storite brez povezave v katerem koli jeziku.</p>'],
        ['Kaj je v tem demu resnično?', '<p>Pravila, koledar, časovni pasovi, zgoščevanje in SMS so resnični. Trg, vsa podjetja, oznake, cene in osebe so simulirani ali izmišljeni. Nič tukaj ni resnična storitev ali priporočilo.</p>'],
      ],
    },
  },
};

export async function render(ctx) {
  const C = COPY[ctx.locale] ?? COPY.en;
  const faq = h(
    'div',
    { class: 'faq' },
    C.faq.items.map(([q, a]) => h('details', {}, h('summary', {}, q), h('div', { class: 'faq__a' }, toNode(a)))),
  );
  const node = page(
    masthead({ kicker: C.kicker, title: C.h1, lede: C.lede }),
    ...contentSections([
      { id: 'sms', title: C.sms.title, body: C.sms.body, aside: C.sms.aside },
      { id: 'stop', title: C.stop.title, body: C.stop.body },
      { id: 'missing', title: C.missing.title, body: C.missing.body },
      { id: 'faq', title: C.faq.title, body: faq },
    ]),
  );
  return { title: C.title, node };
}
