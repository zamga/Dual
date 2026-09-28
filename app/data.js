/*
 * Demo dataset: fictional Slovenian companies and people.
 *
 * A seeded generator stands in for the real feeds (AJPES annual accounts,
 * FURS tax-debtor list, blocked-account register, insolvency notices and the
 * invoice co-op). Each company has a hidden health score at its last filing
 * (h) and a drift since then (d). Filings only see h; payment data and
 * register events see h + d. outcome12m is a simulated default draw used by
 * the back-test.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RokData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const AS_OF = '2026-09-28';

  const ROOTS = ['Brez', 'Lip', 'Jel', 'Hrast', 'Kamn', 'Sav', 'Drav', 'Soč', 'Krn', 'Pohor', 'Kras', 'Mur',
    'Vrh', 'Log', 'Breg', 'Gaj', 'Jav', 'Bor', 'Klas', 'Mlin', 'Vit', 'Zor', 'Rud', 'Sel', 'Dol', 'Pes',
    'Tis', 'Rak', 'Slap', 'Grič', 'Bistr', 'Kolp', 'Loz', 'Viš', 'Ter', 'Nov'];
  const SUFFIXES = ['ex', 'ing', 'tek', 'plast', 'trans', 'mont', 'les', 'kov', 'com', 'gradnja', 'servis',
    'tim', 'lab', 'mark', 'elektro', 'pak', 'tehnik', 'net', 'form', 'agro'];
  const SECTORS = [
    { code: 'F41.200', label: 'Construction of buildings', margin: -0.01 },
    { code: 'F43.210', label: 'Electrical installation', margin: 0 },
    { code: 'G46.900', label: 'Non-specialised wholesale', margin: -0.005 },
    { code: 'G47.110', label: 'Retail, food predominating', margin: -0.01 },
    { code: 'C25.620', label: 'Machining', margin: 0.01 },
    { code: 'C16.230', label: 'Builders’ carpentry and joinery', margin: 0 },
    { code: 'C22.290', label: 'Other plastic products', margin: 0.005 },
    { code: 'H49.410', label: 'Freight transport by road', margin: -0.005 },
    { code: 'I56.101', label: 'Restaurants and inns', margin: -0.015 },
    { code: 'J62.010', label: 'Computer programming', margin: 0.03 },
    { code: 'M69.200', label: 'Accounting and bookkeeping', margin: 0.02 },
    { code: 'M71.129', label: 'Engineering and technical consultancy', margin: 0.02 },
    { code: 'A01.410', label: 'Raising of dairy cattle', margin: -0.005 },
    { code: 'N81.210', label: 'General cleaning of buildings', margin: 0 },
  ];
  const CITIES = ['Ljubljana', 'Ljubljana', 'Ljubljana', 'Maribor', 'Maribor', 'Celje', 'Kranj', 'Koper',
    'Novo mesto', 'Velenje', 'Nova Gorica', 'Murska Sobota', 'Ptuj', 'Domžale', 'Škofja Loka', 'Kamnik',
    'Krško', 'Slovenj Gradec', 'Postojna', 'Izola'];
  const FIRST = ['Ana', 'Maja', 'Nina', 'Eva', 'Mojca', 'Petra', 'Katja', 'Urška', 'Tina', 'Barbara', 'Špela',
    'Luka', 'Jan', 'Marko', 'Matej', 'Rok', 'Tomaž', 'Gregor', 'Andrej', 'Primož', 'Boštjan', 'Žiga', 'Aleš'];
  // Extra names, used only for universes larger than 600 companies so that the
  // 600-company seeds the model was fitted on stay byte-for-byte identical.
  const FIRST_MORE = ['Sara', 'Lara', 'Zala', 'Neža', 'Tjaša', 'Polona', 'Mateja', 'Vesna', 'Irena', 'Alenka',
    'Nejc', 'Miha', 'Blaž', 'Klemen', 'Uroš', 'Jure', 'Anže', 'Domen', 'Simon', 'Janez'];
  const LAST_MORE = ['Vovk', 'Kuhar', 'Lešnik', 'Hočevar', 'Jereb', 'Rupnik', 'Mavrič', 'Ferjan', 'Babič', 'Kranjc',
    'Pavlič', 'Černe', 'Kokalj', 'Debeljak', 'Zorko', 'Šinkovec', 'Kotnik', 'Mohorič', 'Jug', 'Tomažič',
    'Vidic', 'Rant', 'Štrukelj', 'Leban', 'Humar', 'Čuk', 'Gorjup', 'Oman', 'Marolt', 'Fras',
    'Kristan', 'Logar', 'Robnik', 'Sever', 'Stopar', 'Toplak', 'Urbanc', 'Zadravec', 'Ambrožič', 'Bergant'];
  const TAILS = ['Plus', 'Pro', 'Center', 'Group', 'Invest', 'Trade', 'Tech', 'Line', 'Nova', 'Alpe', 'Adria',
    'Commerce', 'Design', 'Energija', 'Storitve'];
  const LAST = ['Novak', 'Horvat', 'Kovačič', 'Krajnc', 'Zupančič', 'Potočnik', 'Kovač', 'Mlakar', 'Kos',
    'Vidmar', 'Golob', 'Turk', 'Kralj', 'Božič', 'Korošec', 'Bizjak', 'Zupan', 'Hribar', 'Kavčič', 'Rozman',
    'Kastelic', 'Oblak', 'Petek', 'Žagar', 'Kolar', 'Košir', 'Koren', 'Medved', 'Zajc', 'Pirc'];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generate(seed, count) {
    const rand = mulberry32(seed == null ? 2026 : seed);
    const U = (lo, hi) => lo + (hi - lo) * rand();
    const I = (lo, hi) => Math.floor(U(lo, hi + 1));
    const pick = arr => arr[Math.floor(rand() * arr.length)];
    const N = (mu, sd) => {
      const u = 1 - rand(), v = rand();
      return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const sigmoid = z => 1 / (1 + Math.exp(-z));
    const r1 = v => Math.round(v * 10) / 10;
    const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    // People. The first ten are serial directors who keep reappearing
    // behind companies that went bankrupt.
    const n = count || 600;
    const big = n > 600;
    const firstNames = big ? FIRST.concat(FIRST_MORE) : FIRST;
    const lastNames = big ? LAST.concat(LAST_MORE) : LAST;
    const people = [];
    const usedNames = new Set();
    while (people.length < (big ? Math.round(n * 0.45) : 260)) {
      const name = `${pick(firstNames)} ${pick(lastNames)}`;
      if (usedNames.has(name)) continue;
      usedNames.add(name);
      people.push({ id: `p${String(people.length + 1).padStart(3, '0')}`, name, serial: people.length < (big ? Math.round(n / 60) : 10) });
    }
    const serial = people.filter(p => p.serial);
    const regular = people.filter(p => !p.serial);

    const usedCompanyNames = new Set();
    function companyName() {
      for (;;) {
        const base = pick(ROOTS) + pick(SUFFIXES);
        let name = base.charAt(0) + base.slice(1).toLowerCase();
        if (big && usedCompanyNames.size >= 600) name += ' ' + pick(TAILS);
        if (!usedCompanyNames.has(name)) { usedCompanyNames.add(name); return name; }
      }
    }
    const usedMs = new Set();
    function registryNumbers() {
      for (;;) {
        const ms = String(I(1000000, 9999999)) + '000';
        if (usedMs.has(ms)) continue;
        usedMs.add(ms);
        return { ms, ds: 'SI' + String(I(10000000, 99999999)) };
      }
    }

    function financials(h, sector, revenue, periodEnd) {
      const er = clamp(0.33 + 0.17 * h + N(0, 0.1), -0.6, 0.95);
      const assets = revenue * U(0.5, 1.2);
      const margin = clamp(0.035 + sector.margin + 0.045 * h + N(0, 0.03), -0.4, 0.4);
      const ebit = revenue * margin;
      const ebitda = ebit + revenue * U(0.02, 0.06);
      const debt = Math.max(0, assets * (0.25 - 0.1 * h + N(0, 0.08)));
      const cr = clamp(1.3 + 0.45 * h + N(0, 0.25), 0.2, 4);
      const currentLiabilities = assets * U(0.2, 0.45);
      const R = Math.round;
      return {
        periodEnd,
        revenue: R(revenue), ebit: R(ebit), ebitda: R(ebitda), equity: R(er * assets), assets: R(assets),
        debt: R(debt), currentAssets: R(cr * currentLiabilities), currentLiabilities: R(currentLiabilities),
      };
    }

    const companies = [];
    let seq = 0;

    // Companies that already went bankrupt. They appear only as network links.
    for (let i = 0; i < (big ? Math.round(n * 0.075) : 45); i++) {
      const directors = [rand() < 0.65 ? pick(serial).id : pick(regular).id];
      const closed = I(2018, 2025);
      companies.push({
        id: `c${String(++seq).padStart(4, '0')}`, name: companyName(), form: 'd.o.o.', ...registryNumbers(),
        sector: pick(SECTORS), city: pick(CITIES), founded: closed - I(2, 12), status: 'bankrupt',
        closedYear: closed, employees: 0, fin: null, finPrev: null, pay: null,
        events: { blockedDays12m: 0, blockPeriods: [], taxDebt: 0 },
        directors, owners: [], outcome12m: null,
      });
    }
    const active = [];

    for (let i = 0; i < n; i++) {
      const h = N(0, 1);
      const d = N(0, 0.75);
      const c_ = h + d;
      const sector = pick(SECTORS);
      const founded = I(1991, 2023);
      const form = rand() < 0.06 ? 'd.d.' : rand() < 0.12 ? 's.p.' : 'd.o.o.';

      const directors = [];
      const serialOdds = c_ < -1 ? 0.35 : 0.03;
      directors.push(rand() < serialOdds ? pick(serial).id : pick(regular).id);
      if (form !== 's.p.' && rand() < 0.35) {
        const second = pick(regular).id;
        if (!directors.includes(second)) directors.push(second);
      }
      const hasSerial = directors.some(id => people.find(p => p.id === id).serial);

      const lateFiler = rand() < 0.08;
      const periodEnd = lateFiler ? '2024-12-31' : '2025-12-31';
      const revenue = clamp(Math.pow(10, N(5.9, 0.7)), 20000, 2e8);
      const growth = clamp(0.03 + 0.08 * h + N(0, 0.1), -0.5, 0.9);
      const fin = financials(h, sector, revenue, periodEnd);
      const prevYear = Number(periodEnd.slice(0, 4)) - 1;
      const finPrev = financials(h - N(0, 0.3), sector, revenue / (1 + growth), iso(prevYear, 12, 31));

      let status = 'active';
      if (c_ < -2.3 && rand() < 0.6) status = 'insolvency';

      // Register events from the last 12 months.
      let blockedDays12m = 0;
      if (c_ < -1.3 && rand() < 0.55) blockedDays12m = I(5, 150);
      else if (c_ < -0.6 && rand() < 0.12) blockedDays12m = I(1, 20);
      else if (rand() < 0.015) blockedDays12m = I(1, 5);
      if (status === 'insolvency') blockedDays12m = Math.max(blockedDays12m, I(60, 200));
      const blockPeriods = [];
      if (blockedDays12m) {
        const start = new Date(AS_OF);
        start.setDate(start.getDate() - I(blockedDays12m, 360));
        const end = new Date(start);
        end.setDate(end.getDate() + blockedDays12m);
        blockPeriods.push({ from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) });
      }
      let taxDebt = 0;
      if (c_ < -1.2 && rand() < 0.45) taxDebt = I(2000, 80000);
      else if (c_ < -0.5 && rand() < 0.08) taxDebt = I(1000, 15000);
      else if (rand() < 0.01) taxDebt = I(500, 3000);
      const taxListed = taxDebt ? iso(2026, I(1, 8), 25) : null;

      // Invoice co-op coverage: 12 monthly readings of average days beyond terms.
      let pay = null;
      if (rand() < 0.7) {
        const early = Math.max(0, 5 - 8 * h + N(0, 3));
        const recent = Math.max(0, 5 - 8 * c_ + N(0, 3));
        const dbt = [];
        for (let m = 0; m < 12; m++) {
          const ramp = m < 6 ? 0 : (m - 5) / 6;
          dbt.push(r1(Math.max(0, early + (recent - early) * ramp + N(0, 1.5))));
        }
        const suppliers = 3 + Math.floor(Math.exp(N(2.3, 0.7)));
        pay = {
          dbt,
          lateShare30: r1(clamp(0.04 - 0.07 * c_ + N(0, 0.03), 0, 0.95) * 100) / 100,
          suppliers,
          invoices: suppliers * I(8, 40),
          updated: '2026-09-21',
        };
      }

      const outcome12m = status === 'insolvency'
        ? null
        : (rand() < sigmoid(-4.2 - 1.35 * c_ + (hasSerial ? 0.4 : 0) - 0.35 * (Math.log(2027 - founded) - Math.log(11))) ? 1 : 0);

      const company = {
        id: `c${String(++seq).padStart(4, '0')}`, name: companyName(), form, ...registryNumbers(),
        sector, city: pick(CITIES), founded, status,
        employees: Math.max(1, Math.round(fin.revenue / U(70000, 150000))),
        fin, finPrev, pay,
        events: { blockedDays12m, blockPeriods, taxDebt, taxListed },
        directors, owners: [], outcome12m,
      };
      if (form === 's.p.') company.name = `${company.name}, ${people.find(p => p.id === directors[0]).name} s.p.`;
      companies.push(company);
      active.push(company);
    }

    // Group structures: some companies are owned by another active company.
    for (const c of active) {
      if (c.form === 's.p.' || rand() > 0.16) continue;
      const parent = pick(active);
      if (parent === c || parent.form === 's.p.' || parent.owners.some(o => o.id === c.id)) continue;
      c.owners.push({ type: 'company', id: parent.id, share: pick([51, 60, 75, 100, 100]) });
    }
    for (const c of active) {
      if (c.owners.length) continue;
      c.owners.push({ type: 'person', id: c.directors[0], share: c.form === 's.p.' ? 100 : pick([50, 60, 100, 100]) });
    }

    return { asOf: AS_OF, companies, people };
  }

  // Size of the shared demo universe used by the landing page and the desk.
  const DEMO_COUNT = 3000;

  return { generate, AS_OF, SECTORS, DEMO_COUNT };
});
