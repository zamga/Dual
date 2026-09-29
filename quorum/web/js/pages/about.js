// #about: the company in formation and the named responsible persons (meta.json persons,
// every one fictional and flagged). SL: first draft, needs native review.
import { h } from '../dom.js';
import { masthead, contentSections, page } from './_content.js';

const ROLE = {
  en: {
    approver: 'Approves every pick before 13:40. May remove a candidate with a logged reason; can never add one. Named on every pick note.',
    model_lead: 'Owns the four model families, the validation protocol and the model versions. Named on every pick note.',
    deputy_approver: 'Takes the approval when the approver is away. With neither available, no pick is issued.',
    compliance: 'Runs the staff trading policy, pre-release access logs and the disclosure texts.',
  },
  sl: {
    approver: 'Odobri vsako izbiro pred 13:40. Kandidatko lahko odstrani z zabeleženim razlogom, dodati je ne more nikoli. Navedena na vsakem zapisku izbire.',
    model_lead: 'Odgovoren za štiri družine modelov, protokol validacije in različice modelov. Naveden na vsakem zapisku izbire.',
    deputy_approver: 'Prevzame odobritev, ko odobriteljice ni. Če ni nobene od njiju, izbira ni izdana.',
    compliance: 'Vodi pravila trgovanja zaposlenih, dnevnike dostopa pred objavo in besedila razkritij.',
  },
};

const COPY = {
  en: {
    title: 'About',
    kicker: 'About Quorum',
    h1: 'A small research publisher in Ljubljana.',
    lede: 'Quorum Research d.o.o. is a company in formation in Ljubljana, Slovenia. We publish one daily issue of general research to the public, and we text subscribers only when our models agree.',
    ledePre: 'Quorum Research d.o.o. is a company in formation in Ljubljana, Slovenia. We publish one daily issue of general research to the public. Once SMS alerts launch we will text subscribers only when our models agree; there are none yet.',
    people: 'Responsible persons',
    peopleNote: 'Every person on this page is fictional, like every company and price in this demo.',
    fictional: 'fictional',
    sections: [
      {
        id: 'independence',
        title: 'Independence',
        body: `<ul><li>No payments from issuers, and no relationship with the companies we cover.</li><li>No affiliate or broker referral revenue.</li><li>The company holds no individual shares. Staff, founders and their families trade funds and ETFs only.</li><li>Pre-release candidates are access-controlled, and every access is logged.</li><li>Staff posts on social media carry disclosures and never preview a pick.</li></ul>`,
      },
      {
        id: 'why',
        title: 'Why we built it this way',
        body: `<p>Most stock-alert services text on a calendar and publish their backtests. We wanted the opposite: text only on conviction, publish on a calendar, and prove every record with a hash anyone can check. The ledger is free for exactly that reason.</p><p>We are not an investment firm and we do not give personal advice. We are not an LLM stock picker either: the language model only screens news and drafts text, under a validator and a named person.</p>`,
      },
      {
        id: 'contact',
        title: 'Contact',
        body: `<dl class="dl dl--wide"><div><dt>Support</dt><dd>{{contact:support}}</dd></div><div><dt>Press</dt><dd>{{contact:press}}</dd></div><div><dt>Address</dt><dd>[Address to be registered], Ljubljana, Slovenia</dd></div><div><dt>Registration</dt><dd>Pending (company in formation)</dd></div></dl>`,
      },
    ],
  },
  sl: {
    title: 'O nas',
    kicker: 'O Quorumu',
    h1: 'Majhen založnik raziskav v Ljubljani.',
    lede: 'Quorum Research d.o.o. je podjetje v ustanavljanju v Ljubljani. Javnosti objavljamo eno dnevno izdajo splošnih raziskav, naročnikom pa SMS pošljemo samo, ko se naši modeli strinjajo.',
    ledePre: 'Quorum Research d.o.o. je podjetje v ustanavljanju v Ljubljani. Javnosti objavljamo eno dnevno izdajo splošnih raziskav. Ko se obvestila SMS zaženejo, bomo naročnikom SMS pošiljali samo, ko se naši modeli strinjajo; naročnikov še ni.',
    people: 'Odgovorne osebe',
    peopleNote: 'Vse osebe na tej strani so izmišljene, tako kot vsa podjetja in cene v tem demu.',
    fictional: 'izmišljeno',
    sections: [
      {
        id: 'independence',
        title: 'Neodvisnost',
        body: `<ul><li>Brez plačil izdajateljev in brez odnosov s podjetji, ki jih pokrivamo.</li><li>Brez provizij partnerjev ali borznih posrednikov.</li><li>Podjetje nima posameznih delnic. Zaposleni, ustanovitelji in njihove družine trgujejo samo s skladi in ETF.</li><li>Dostop do kandidatk pred objavo je nadzorovan, vsak dostop je zabeležen.</li><li>Objave zaposlenih na družbenih omrežjih vsebujejo razkritja in nikoli ne razkrijejo izbire vnaprej.</li></ul>`,
      },
      {
        id: 'why',
        title: 'Zakaj smo ga zgradili tako',
        body: `<p>Večina storitev z opozorili o delnicah pošilja SMS po koledarju in objavlja svoje povratne teste. Želeli smo nasprotno: SMS samo ob prepričanju, objava po koledarju in vsak zapis dokazan z zgoščeno vrednostjo, ki jo lahko preveri vsakdo. Prav zato je knjiga brezplačna.</p><p>Nismo investicijsko podjetje in ne svetujemo osebno. Tudi nismo izbiralec delnic z LLM: jezikovni model samo pregleduje novice in pripravlja besedilo, pod nadzorom validatorja in imenovane osebe.</p>`,
      },
      {
        id: 'contact',
        title: 'Kontakt',
        body: `<dl class="dl dl--wide"><div><dt>Podpora</dt><dd>{{contact:support}}</dd></div><div><dt>Mediji</dt><dd>{{contact:press}}</dd></div><div><dt>Naslov</dt><dd>[Naslov bo vpisan], Ljubljana, Slovenija</dd></div><div><dt>Vpis</dt><dd>V teku (podjetje v ustanavljanju)</dd></div></dl>`,
      },
    ],
  },
};

export async function render(ctx) {
  const C = COPY[ctx.locale] ?? COPY.en;
  const meta = await ctx.data('meta').catch(() => null);
  const persons = (meta?.persons ?? []).slice(0, 4);
  const people = h(
    'section',
    { class: 'grid people', 'aria-labelledby': 'people-h' },
    h('h2', { class: 'label c-head', id: 'people-h' }, C.people),
    ...persons.map((p, i) =>
      h(
        'article',
        { class: `person c-p${i + 1}` },
        h('p', { class: 'person__n label', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
        h('h3', { class: 'person__name' }, p.name, ' ', p.fictional ? h('span', { class: 'tag' }, C.fictional) : null),
        h('p', { class: 'person__title' }, p.title?.[ctx.locale] ?? p.title?.en ?? ''),
        h('p', { class: 'person__role small muted' }, ROLE[ctx.locale]?.[p.role] ?? ''),
      ),
    ),
    h('p', { class: 'c-body small muted people__note' }, C.peopleNote),
  );
  const launch = await ctx.launch();
  const node = page(masthead({ kicker: C.kicker, title: C.h1, lede: launch.prelaunch ? C.ledePre : C.lede }), people, ...contentSections(C.sections));
  return { title: C.title, node };
}
