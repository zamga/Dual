// Shared UI strings (EN + SL) and locale-aware formatters. Page copy lives in each page module
// as { en, sl } objects; this dictionary holds the shell, components and anything reused.
//
// SL: all Slovene strings in this codebase are first drafts written by the build team and need
// review by a native speaker (and by counsel for legal and disclosure text) before launch.
import { fmtInt, fmtPctHtml, fmtBps, fmtEur, fmtNum, fmtPctRank } from './core/format.js';
import { fmtDDMMYY, fmtLong, fmtDDMM } from './core/calendar.js';

export const LOCALES = ['en', 'sl'];

const EN = {
  'site.name': 'Quorum',
  'site.tagline': 'We only text when the models agree.',
  'site.description':
    'Quorum scores about 1,300 liquid US stocks every trading day with four independent model families and texts only when three agree. Simulated demo.',
  skip: 'Skip to content',
  'demo.notice': 'Simulated market · fictional companies · demo — not a real service, not investment advice',
  'demo.region': 'Demo notice',
  'demo.viewAs': 'View as',
  'demo.viewAsHint': 'Demo only: see the site as each tier sees it. The paid tiers differ in data breadth, never in pick timing; Free sees open picks sealed until they close.',
  'tier.free': 'Free',
  'tier.signal': 'Signal',
  'tier.research': 'Research',
  'tier.changed': 'Viewing as {tier}.',
  'nav.label': 'Main',
  'nav.home': 'Quorum, home',
  'nav.q.how': 'How does a pick happen?',
  'nav.q.proof': 'Did it work?',
  'nav.q.get': 'What do I get?',
  'nav.howItWorks': 'How it works',
  'nav.methodology': 'Methodology',
  'nav.changelog': 'Changelog',
  'nav.ledger': 'Ledger',
  'nav.backtest': 'Backtest',
  'nav.pricing': 'Pricing',
  'nav.join': 'Join',
  'nav.help': 'Help',
  'nav.about': 'About',
  'nav.disclosures': 'Disclosures',
  'nav.status': 'Status',
  'nav.menu': 'Menu',
  'nav.close': 'Close',
  'nav.sheet': 'Site menu',
  'locale.label': 'Language',
  'locale.switchTo': 'Slovenščina',
  'locale.changed': 'Language: English.',
  'pill.next': 'Next issue',
  'pill.noQuorum': 'No quorum today',
  'pill.noPick': 'No new pick today',
  'pill.quorum.one': 'Quorum: {n} pick',
  'pill.quorum.other': 'Quorum: {n} picks',
  'pill.pinned': 'demo clock',
  'pill.title.live': 'Live countdown to the next daily issue at 14:00 Ljubljana time ({tz}). Opens the latest issue.',
  'pill.title.pinned': 'Demo clock pinned to {date} {time} {tz}, when the data ends. Opens the latest issue.',
  'pill.title.override': 'Test clock set from the page address. Opens the latest issue.',
  'pill.title.result': 'Today’s issue was published at 14:00 {tz}. Opens it.',
  'rules.label': 'Column {id}',
  'rules.key': 'The four columns',
  'rules.hint': 'Every page stands on four model families. Point at a rule to name it.',
  'family.A': 'Trend',
  'family.B': 'Fundamental momentum',
  'family.C': 'Quality / value',
  'family.D': 'ML ranker',
  'familyDef.A': 'Residual 12-1 momentum, volatility-scaled',
  'familyDef.B': 'Earnings surprise by filing date, change in gross profitability',
  'familyDef.C': 'Gross profits to assets, EV/EBIT, free-cash-flow yield',
  'familyDef.D': 'Gradient-boosted trees ranking the 21-day sector-relative return',
  'hash.copy': 'Copy the full hash {hash}',
  'hash.copied': 'Full hash copied: {short}…',
  'hash.copyFailed': 'Could not copy. The full hash is {hash}',
  'hash.done': 'Copied',
  'ts.produced': 'Production completed',
  'ts.disseminated': 'First disseminated',
  'ts.sealed': 'Sealed',
  'ts.published': 'Published',
  'ts.utc': 'UTC',
  'ts.local': 'Ljubljana',
  'common.fictional': 'fictional',
  'common.simulated': 'simulated',
  'common.sealed': 'sealed',
  'common.loading': 'Loading',
  'common.retry': 'Try again',
  'common.readMore': 'Read more',
  'common.draft': 'Draft for counsel review',
  'common.notAdvice': 'General research issued to the public. Not personal advice.',
  'common.models': '{n}/4 models',
  'common.scored': '{n} scored',
  'common.closest': 'closest {n}/4',
  'common.issue': 'Issue',
  'common.pick': 'Pick',
  'common.benchmark': 'S&P 500 TR (simulated)',
  'common.ci': '95% CI',
  'common.of': '{a} of {b}',
  'error.data.title': 'The data did not load.',
  'error.data.body': 'This page reads published files from the ledger. One of them could not be fetched: {file}.',
  'error.page.title': 'This page failed to render.',
  'error.page.body': 'Something in this page went wrong on our side. Try again; the published record itself is unaffected.',
  'error.data.kicker': 'Data',
  'error.page.kicker': 'Error',
  'announce.page': '{title}',
  'footer.company': 'Quorum Research d.o.o. (in formation), Ljubljana, Slovenia · Registration pending · No VAT number yet.',
  'footer.p1':
    'We publish general investment research to the public. It is not personal investment advice and does not take your situation into account. We are not an investment firm and are not authorised by the Slovenian Securities Market Agency (ATVP) to give investment advice.',
  'footer.p2':
    'Shares can fall as well as rise; you can lose all the money you invest. Past performance is not a reliable indicator of future results. Our track record is a hypothetical paper portfolio, not real trades.',
  'footer.p3':
    'Picks come from statistical and machine-learning models. Written explanations are drafted by an AI model (Claude, Anthropic) or, while it is switched off, by a template writer from the model data; a numeric validator checks every number and a named person approves each one. Neither the company nor our staff hold individual shares.',
  'footer.p3demo':
    'Picks come from statistical and machine-learning models (the gradient-boosted ranker is family D). In this demo every written explanation comes from a template writer working from the model data; in production an AI model (Claude, Anthropic) drafts them. A numeric validator checks every number and a named person approves each one. Neither the company nor our staff hold individual shares.',
  'footer.p4': 'Not available to residents of the US, UK or Australia, or in Canada until reviewed.',
  'footer.label': 'Footer',
  'footer.demo':
    'This site is a demonstration. Every company, ticker, price and person in it is fictional and every result comes from a simulated market.',
  'footer.all12m': 'All recommendations, last 12 months',
  'footer.conflicts': 'Conflicts & trading policy',
  'footer.terms': 'Terms',
  'footer.privacy': 'Privacy',
  'footer.sms': 'SMS terms',
  'footer.imprint': 'Imprint',
  'footer.cookies': 'Cookies',
  'footer.data': 'Data through {date} · {model} · methodology {version}',
  'footer.legal': 'Legal',
  'pending.title': 'This room is still being built.',
  'pending.body': 'The page at {path} belongs to the next build. Everything it will show is already public in the ledger.',
  'notFound.title': 'Nothing stands here.',
  'notFound.body': 'No page at {path}. Without columns there is no lintel, and without a route there is no page.',
  'notFound.home': 'Back to the front',
  'notFound.ledger': 'Open the ledger',
};

const SL = {
  'site.name': 'Quorum',
  'site.tagline': 'SMS pošljemo samo, ko se modeli strinjajo.',
  'site.description':
    'Quorum vsak dan trgovanja s štirimi neodvisnimi družinami modelov oceni približno 1.300 likvidnih ameriških delnic in pošlje SMS samo, ko se strinjajo tri. Simulirani demo.',
  skip: 'Preskoči na vsebino',
  'demo.notice': 'Simuliran trg · izmišljena podjetja · demo — ni prava storitev, ni investicijski nasvet',
  'demo.region': 'Obvestilo o demu',
  'demo.viewAs': 'Pogled kot',
  'demo.viewAsHint': 'Samo v demu: stran, kot jo vidi posamezen paket. Plačljiva paketa se razlikujeta po obsegu podatkov, nikoli po času izbir; Brezplačno vidi odprte izbire zapečatene do zaprtja.',
  'tier.free': 'Brezplačno',
  'tier.signal': 'Signal',
  'tier.research': 'Research',
  'tier.changed': 'Pogled kot {tier}.',
  'nav.label': 'Glavna',
  'nav.home': 'Quorum, domov',
  'nav.q.how': 'Kako nastane izbira?',
  'nav.q.proof': 'Je delovalo?',
  'nav.q.get': 'Kaj dobim?',
  'nav.howItWorks': 'Kako deluje',
  'nav.methodology': 'Metodologija',
  'nav.changelog': 'Dnevnik sprememb',
  'nav.ledger': 'Knjiga',
  'nav.backtest': 'Povratni test',
  'nav.pricing': 'Cene',
  'nav.join': 'Pridruži se',
  'nav.help': 'Pomoč',
  'nav.about': 'O nas',
  'nav.disclosures': 'Razkritja',
  'nav.status': 'Stanje',
  'nav.menu': 'Meni',
  'nav.close': 'Zapri',
  'nav.sheet': 'Meni strani',
  'locale.label': 'Jezik',
  'locale.switchTo': 'English',
  'locale.changed': 'Jezik: slovenščina.',
  'pill.next': 'Naslednja izdaja',
  'pill.noQuorum': 'Danes brez kvoruma',
  'pill.noPick': 'Danes brez nove izbire',
  'pill.quorum.one': 'Kvorum: {n} izbira',
  'pill.quorum.two': 'Kvorum: {n} izbiri',
  'pill.quorum.few': 'Kvorum: {n} izbire',
  'pill.quorum.other': 'Kvorum: {n} izbir',
  'pill.pinned': 'demo ura',
  'pill.title.live': 'Odštevanje do naslednje dnevne izdaje ob 14:00 po ljubljanskem času ({tz}). Odpre zadnjo izdajo.',
  'pill.title.pinned': 'Demo ura je ustavljena na {date} {time} {tz}, ko se podatki končajo. Odpre zadnjo izdajo.',
  'pill.title.override': 'Testna ura, nastavljena v naslovu strani. Odpre zadnjo izdajo.',
  'pill.title.result': 'Današnja izdaja je izšla ob 14:00 {tz}. Odpre jo.',
  'rules.label': 'Steber {id}',
  'rules.key': 'Štirje stebri',
  'rules.hint': 'Vsaka stran stoji na štirih družinah modelov. Pokažite na črto in izveste njeno ime.',
  'family.A': 'Trend',
  'family.B': 'Temeljni moment',
  'family.C': 'Kakovost / vrednost',
  'family.D': 'Rangirnik ML',
  'familyDef.A': 'Rezidualni moment 12-1, prilagojen volatilnosti',
  'familyDef.B': 'Presenečenje dobička po datumu vložitve, sprememba bruto donosnosti',
  'familyDef.C': 'Bruto dobiček na sredstva, EV/EBIT, donos prostega denarnega toka',
  'familyDef.D': 'Gradientno ojačana drevesa, ki rangirajo 21-dnevni donos glede na sektor',
  'hash.copy': 'Kopiraj celotno zgoščeno vrednost {hash}',
  'hash.copied': 'Celotna zgoščena vrednost kopirana: {short}…',
  'hash.copyFailed': 'Kopiranje ni uspelo. Celotna vrednost je {hash}',
  'hash.done': 'Kopirano',
  'ts.produced': 'Izdelava zaključena',
  'ts.disseminated': 'Prvič objavljeno',
  'ts.sealed': 'Zapečateno',
  'ts.published': 'Objavljeno',
  'ts.utc': 'UTC',
  'ts.local': 'Ljubljana',
  'common.fictional': 'izmišljeno',
  'common.simulated': 'simulirano',
  'common.sealed': 'zapečateno',
  'common.loading': 'Nalaganje',
  'common.retry': 'Poskusi znova',
  'common.readMore': 'Več',
  'common.draft': 'Osnutek za pregled odvetnika',
  'common.notAdvice': 'Splošna raziskava, objavljena javnosti. Ni osebni nasvet.',
  'common.models': '{n}/4 modelov',
  'common.scored': '{n} ocenjenih',
  'common.closest': 'največ {n}/4',
  'common.issue': 'Izdaja',
  'common.pick': 'Izbira',
  'common.benchmark': 'S&P 500 TR (simulirano)',
  'common.ci': '95 % IZ',
  'common.of': '{a} od {b}',
  'error.data.title': 'Podatki se niso naložili.',
  'error.data.body': 'Ta stran bere objavljene datoteke iz knjige. Ene ni bilo mogoče prenesti: {file}.',
  'error.page.title': 'Te strani ni bilo mogoče prikazati.',
  'error.page.body': 'Na tej strani je šlo pri nas nekaj narobe. Poskusite znova; objavljeni zapis ni prizadet.',
  'error.data.kicker': 'Podatki',
  'error.page.kicker': 'Napaka',
  'announce.page': '{title}',
  'footer.company': 'Quorum Research d.o.o. (v ustanavljanju), Ljubljana, Slovenija · Vpis v register v teku · Še brez ID za DDV.',
  'footer.p1':
    'Javnosti objavljamo splošne investicijske raziskave. To ni osebno investicijsko svetovanje in ne upošteva vaših okoliščin. Nismo investicijsko podjetje in nimamo dovoljenja Agencije za trg vrednostnih papirjev (ATVP) za investicijsko svetovanje.',
  'footer.p2':
    'Vrednost delnic lahko pade ali zraste; izgubite lahko ves vloženi denar. Pretekla uspešnost ni zanesljiv kazalnik prihodnjih rezultatov. Naš zapis je hipotetični papirni portfelj, ne resnični posli.',
  'footer.p3':
    'Izbire nastanejo s statističnimi modeli in modeli strojnega učenja. Pisne razlage pripravi model umetne inteligence (Claude, Anthropic) ali, dokler je izklopljen, predložni pisec iz podatkov modelov; vsako število preveri numerični preverjevalnik, vsako razlago odobri imenovana oseba. Niti podjetje niti zaposleni nimajo posameznih delnic.',
  'footer.p3demo':
    'Izbire nastanejo s statističnimi modeli in modeli strojnega učenja (gradientno ojačani rangirnik je družina D). V tem demu vse pisne razlage pripravi predložni pisec iz podatkov modelov; v produkciji jih pripravi model umetne inteligence (Claude, Anthropic). Vsako število preveri numerični preverjevalnik, vsako razlago odobri imenovana oseba. Niti podjetje niti zaposleni nimajo posameznih delnic.',
  'footer.p4': 'Ni na voljo prebivalcem ZDA, Združenega kraljestva ali Avstralije, v Kanadi pa do pregleda.',
  'footer.label': 'Noga strani',
  'footer.demo':
    'Ta stran je predstavitev. Vsa podjetja, oznake, cene in osebe so izmišljeni, vsi rezultati pa izhajajo iz simuliranega trga.',
  'footer.all12m': 'Vsa priporočila, zadnjih 12 mesecev',
  'footer.conflicts': 'Nasprotja interesov in pravila trgovanja',
  'footer.terms': 'Pogoji',
  'footer.privacy': 'Zasebnost',
  'footer.sms': 'Pogoji SMS',
  'footer.imprint': 'Impresum',
  'footer.cookies': 'Piškotki',
  'footer.data': 'Podatki do {date} · {model} · metodologija {version}',
  'footer.legal': 'Pravno',
  'pending.title': 'Ta prostor še gradimo.',
  'pending.body': 'Stran na naslovu {path} pripada naslednji gradnji. Vse, kar bo prikazala, je že javno v knjigi.',
  'notFound.title': 'Tu nič ne stoji.',
  'notFound.body': 'Na naslovu {path} ni strani. Brez stebrov ni preklade in brez poti ni strani.',
  'notFound.home': 'Nazaj na začetek',
  'notFound.ledger': 'Odpri knjigo',
};

export const DICTS = { en: EN, sl: SL };

let current = 'en';

export function setLocale(locale) {
  current = LOCALES.includes(locale) ? locale : 'en';
  return current;
}

export function getLocale() {
  return current;
}

function fill(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function t(key, vars, locale = current) {
  const d = DICTS[locale] ?? EN;
  const s = d[key] ?? EN[key];
  if (s === undefined) return key;
  return fill(s, vars);
}

const pluralRules = {};
export function tp(key, n, vars = {}, locale = current) {
  pluralRules[locale] ??= new Intl.PluralRules(locale === 'sl' ? 'sl-SI' : 'en-GB');
  const cat = pluralRules[locale].select(n);
  const d = DICTS[locale] ?? EN;
  const k = d[`${key}.${cat}`] !== undefined ? `${key}.${cat}` : `${key}.other`;
  return t(k, { n, ...vars }, locale);
}

// Pick a locale's string from an { en, sl } object (page copy, data labels).
export function pickL(obj, locale = current) {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  return obj[locale] ?? obj.en ?? '';
}

// 'gain' | 'loss' | 'flat' for a fraction shown as a percentage with `digits` decimals, decided on the
// rounded value so the arrow and colour never disagree with the printed number (0.000061 -> "0.0%", flat).
export function signClassAt(x, digits = 1) {
  if (!Number.isFinite(x)) return 'flat';
  const r = Math.round(Math.abs(x) * 10 ** (digits + 2));
  return r === 0 ? 'flat' : x > 0 ? 'gain' : 'loss';
}

// Locale-aware formatters. Percentages use the true minus sign (U+2212) on the web.
export function formatters(locale = current) {
  return {
    int: (n) => fmtInt(n, locale),
    num: (x, d = 1) => fmtNum(x, d, locale).replace(/^-/, '−'),
    pct: (x, opts = {}) => fmtPctHtml(x, { digits: 1, ...opts, locale }),
    pct0: (x, opts = {}) => fmtPctHtml(x, { digits: 0, ...opts, locale }),
    rank: (p) => fmtPctRank(p),
    bps: (x, opts = {}) => fmtBps(x, { ...opts, locale }).replace(/^-/, '−'),
    eur: (x, opts = {}) => fmtEur(x, { ...opts, locale }),
    date: (d) => fmtDDMMYY(d),
    dm: (d) => fmtDDMM(d),
    long: (d) => fmtLong(d, locale),
    // signed returns (sign + arrow + class) so Gain/Loss is never colour alone
    // The class follows the value as displayed: anything that rounds to 0.0% is flat (no arrow colour).
    signed: (x, opts = {}) => {
      const cls = signClassAt(x, opts.digits ?? 1);
      const arrow = cls === 'gain' ? '↑' : cls === 'loss' ? '↓' : '→';
      return { text: fmtPctHtml(x, { digits: 1, sign: true, ...opts, locale }), arrow, cls };
    },
  };
}
