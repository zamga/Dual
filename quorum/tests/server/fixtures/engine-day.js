// A synthetic engine day in the shape engine/record.js buildRecord produces (an issues row plus the
// enriched picks), for the pipeline tests. Fictional companies and people only (fictional: true),
// so the tests do not depend on whatever the engine last exported to web/data/.
//
//   buildEngineDay({ date }) -> { issue, picks, persons, ledger, news }
//     today: BUY KRST, BUY VLMA, RENEW LUMX (of #0009); exit of #0006 ORBL
//     ledger: a verified chain holding the sealed commits of #0006 and #0009
//   fakeClaude({ script }) -> a client exposing beta.messages.parse, recording every call
import { createEntry, commitment } from '../../../core/ledger.js';
import { addTradingDays, fmtLong, issueSlot, prevTradingDay } from '../../../core/calendar.js';

export const PERSONS = [
  { id: 'p1', name: 'Maja Vrhovnik', title: { en: 'Head of Research', sl: 'Vodja raziskav' }, role: 'approver', fictional: true },
  { id: 'p2', name: 'Luka Ferjančič', title: { en: 'Model Lead', sl: 'Vodja modelov' }, role: 'model_lead', fictional: true },
  { id: 'p3', name: 'Nina Kosmač', title: { en: 'Deputy Head of Research', sl: 'Namestnica vodje raziskav' }, role: 'deputy_approver', fictional: true },
];

const LABELS = {
  resid_mom_vs: { en: 'Residual 12-1 momentum, volatility-scaled', sl: 'Rezidualni momentum 12-1, prilagojen volatilnosti' },
  sue: { en: 'Standardised earnings surprise', sl: 'Standardizirano presenečenje pri dobičku' },
  gpa: { en: 'Gross profits to assets', sl: 'Bruto dobiček glede na sredstva' },
  ivol: { en: 'Idiosyncratic volatility (60 days)', sl: 'Idiosinkratična volatilnost (60 dni)' },
};

function pick({ no, kind, priorNo = null, ticker, name, sector, sectorSl, issueDate, agreeing, pct, exitPlanned, entryOpen, prevClose, dtc = 1.9, ivol = 0.21 }) {
  const drivers = {
    A: [{ key: 'resid_mom_vs', label: LABELS.resid_mom_vs, value: 2.08, unit: 'z', raw: { value: 2.9, unit: 't' } }],
    B: [{ key: 'sue', label: LABELS.sue, value: 1.44, unit: 'z', raw: { value: 2.3, unit: 'sd' } }],
    C: [{ key: 'gpa', label: LABELS.gpa, value: 1.12, unit: 'z', raw: { value: 0.41, unit: 'ratio' } }],
    D: [{ key: 'ivol', label: LABELS.ivol, value: -1.3, unit: 'z', raw: { value: 0.18, unit: 'ratio' } }],
  };
  const families = Object.fromEntries(['A', 'B', 'C', 'D'].map((f) => [f, { pct: pct[f], drivers: drivers[f] }]));
  const rank = (p) => Math.round(p * 100);
  const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
  const fam = { A: 'trend', B: 'fundamental momentum', C: 'quality/value', D: 'the ML ranker' };
  const famSl = { A: 'trend', B: 'fundamentalni momentum', C: 'kakovost/vrednost', D: 'rangirnik ML' };
  const other = ['A', 'B', 'C', 'D'].find((f) => !agreeing.includes(f));
  const en = [
    `${kind === 'RENEW' ? `This renews pick #${priorNo} for a new 21-day window. ` : ''}Three of the four model families place ${ticker} (${name}, ${sector}) in their top 5%: ${agreeing.map((f) => `${fam[f]} at the ${ord(rank(pct[f]))} percentile`).join(', ')}. ${fam[other][0].toUpperCase()}${fam[other].slice(1)} ranks it at the ${ord(rank(pct[other]))} percentile and does not vote for it.`,
    `The ${fam[agreeing[0]]} vote rests on ${drivers[agreeing[0]][0].label.en.toLowerCase()} (z-score ${drivers[agreeing[0]][0].value.toFixed(1)}).`,
    `Checks passed: days to cover ${dtc.toFixed(1)}, idiosyncratic volatility ${(ivol * 100).toFixed(1)}%, no earnings report within 3 trading days and no material negative headline in the last 48 hours. The pick exits at the US open on ${fmtLong(exitPlanned, 'en')}, 21 trading days after entry. There is no price target and no stop-loss.`,
  ].join('\n\n');
  const sl = [
    `${kind === 'RENEW' ? `Podaljšanje izbire #${priorNo} za novo 21-dnevno obdobje. ` : ''}Tri od štirih modelskih družin uvrščajo ${ticker} (${name}, ${sectorSl}) med zgornjih 5 %: ${agreeing.map((f) => `${famSl[f]} na ${rank(pct[f])}. percentilu`).join(', ')}.`,
    `Preverjeno: dnevi za pokritje ${dtc.toFixed(1).replace('.', ',')}, idiosinkratična volatilnost ${(ivol * 100).toFixed(1).replace('.', ',')} %, v naslednjih 3 dneh trgovanja ni objave rezultatov in v zadnjih 48 urah ni pomembne negativne novice. Izbira se zapre ob odprtju borze v ZDA ${fmtLong(exitPlanned, 'sl')}, 21 dni trgovanja po vstopu.`,
  ].join('\n\n');
  return {
    simulated: true,
    no,
    kind,
    priorNo,
    renewedAs: null,
    status: 'open',
    ticker,
    name,
    isin: `ZZ${no.padStart(10, '0')}`,
    figi: `SIM${ticker.padEnd(9, 'X')}`,
    sector,
    sectorSl,
    venue: 'NASDAQ (simulated)',
    issueDate,
    issueNo: null,
    producedAt: issueSlot(issueDate).sealAt,
    disseminatedAt: issueSlot(issueDate).publishAt,
    dissemination: { price: prevClose, source: 'SIM last close', at: `${prevTradingDay(issueDate)}T16:00:00-05:00` },
    entry: { date: issueDate, open: entryOpen },
    exitPlanned,
    exit: null,
    agreement: 3,
    agreeing,
    crashSwitch: false,
    combined: Math.round((agreeing.reduce((s, f) => s + pct[f], 0) / 3) * 1e4) / 1e4,
    families,
    sensitivity: null,
    vetoChecks: [
      { key: 'days_to_cover', pass: true, value: dtc },
      { key: 'idio_vol', pass: true, value: ivol },
      { key: 'earnings_within_3d', pass: true },
      { key: 'pending_ma', pass: true },
      { key: 'llm_48h', pass: true, note: 'stand-in', headlines: 0 },
    ],
    thesis: { en, sl },
    drafter: 'template',
    validator: 'passed',
    approver: 'p1',
    modelLead: 'p2',
    modelVersion: 'ensemble 1.0.0',
    methodology: '1.0',
    outcome: null,
    fictional: true,
  };
}

// buildEngineDay({ date }) -> { issue, picks, persons, ledger, news }
export async function buildEngineDay({ date = '2025-11-04' } = {}) {
  const d0 = addTradingDays(date, -21);
  const exit = addTradingDays(date, 21);
  const orbl = pick({ no: '0006', kind: 'BUY', ticker: 'ORBL', name: 'Orbelan Freight Co.', sector: 'Industrials', sectorSl: 'Industrija', issueDate: d0, agreeing: ['A', 'C', 'D'], pct: { A: 0.97, B: 0.62, C: 0.96, D: 0.98 }, exitPlanned: date, entryOpen: 48.2, prevClose: 47.9 });
  const lumxOld = pick({ no: '0009', kind: 'BUY', ticker: 'LUMX', name: 'Lumexa Systems Inc.', sector: 'Information Technology', sectorSl: 'Informacijska tehnologija', issueDate: d0, agreeing: ['A', 'B', 'D'], pct: { A: 0.99, B: 0.97, C: 0.55, D: 0.96 }, exitPlanned: date, entryOpen: 131.4, prevClose: 130.1 });
  const salt = (x) => `salt${x}`.padEnd(16, 'Q');
  orbl.reveal = { no: orbl.no, ticker: orbl.ticker, figi: orbl.figi, issueDate: d0, agreeing: orbl.agreeing, salt: salt('ORBL') };
  lumxOld.reveal = { no: lumxOld.no, ticker: lumxOld.ticker, figi: lumxOld.figi, issueDate: d0, agreeing: lumxOld.agreeing, salt: salt('LUMX') };
  orbl.commit = await commitment(orbl.reveal);
  lumxOld.commit = await commitment(lumxOld.reveal);
  // Their outcomes as the engine measures them at today's open.
  orbl.status = 'closed';
  orbl.exit = { date, open: 50.6 };
  orbl.outcome = { exitDate: date, exitOpen: 50.6, gross: 0.049793, net: 0.047698, bench: 0.012, excess: 0.035698, d5: 0.011, d63: null };
  lumxOld.status = 'renewed';
  lumxOld.renewedAs = '0010';
  lumxOld.exit = { date, open: 127.2 };
  lumxOld.outcome = { exitDate: date, exitOpen: 127.2, gross: -0.031963, net: -0.033899, bench: 0.012, excess: -0.045899, d5: -0.004, d63: null };

  const lumx = pick({ no: '0010', kind: 'RENEW', priorNo: '0009', ticker: 'LUMX', name: 'Lumexa Systems Inc.', sector: 'Information Technology', sectorSl: 'Informacijska tehnologija', issueDate: date, agreeing: ['A', 'B', 'D'], pct: { A: 0.98, B: 0.96, C: 0.51, D: 0.97 }, exitPlanned: exit, entryOpen: 127.2, prevClose: 126.8 });
  const krst = pick({ no: '0011', kind: 'BUY', ticker: 'KRST', name: 'Krastova Mills Corp.', sector: 'Industrials', sectorSl: 'Industrija', issueDate: date, agreeing: ['A', 'C', 'D'], pct: { A: 0.97, B: 0.71, C: 0.96, D: 0.98 }, exitPlanned: exit, entryOpen: 88.4, prevClose: 87.95 });
  const vlma = pick({ no: '0012', kind: 'BUY', ticker: 'VLMA', name: 'Velmara Foods plc', sector: 'Consumer Staples', sectorSl: 'Osnovne potrošne dobrine', issueDate: date, agreeing: ['B', 'C', 'D'], pct: { A: 0.4, B: 0.96, C: 0.97, D: 0.96 }, exitPlanned: exit, entryOpen: 41.05, prevClose: 40.8 });
  lumx.priorNo = '0009';
  const picks = [orbl, lumxOld, lumx, krst, vlma];

  // The sealed chain before today: a methodology record, then the day-0 issue with both picks.
  const entries = [];
  let prev = null;
  const add = async (type, issueDate, at, body) => {
    prev = await createEntry(prev, { type, issueDate, at, body });
    entries.push(prev);
  };
  const s0 = issueSlot(d0);
  await add('METHODOLOGY', d0, s0.sealAt.replace('13:45', '08:00'), { version: '1.0', effective: d0, summary: { en: 'Fictional test methodology', sl: 'Izmišljena testna metodologija' }, modelVersion: 'ensemble 1.0.0' });
  for (const p of [orbl, lumxOld]) await add('BUY', d0, s0.sealAt, { no: p.no, commit: p.commit, horizon: 21, exitPlanned: date, agreement: 3, methodology: '1.0', modelVersion: 'ensemble 1.0.0', producedAt: s0.sealAt });
  await add('ISSUE', d0, s0.publishAt, { issueNo: 7, nScored: 1398, closest: 3, buys: ['0006', '0009'], renews: [], closes: [], vetoes: { rule: 1, llm: 0, human: 0, capped: 0 }, methodology: '1.0', approver: 'p1', humanVetoes: [], unissued: 0 });
  const issue = {
    date,
    issueNo: 28,
    nScored: 1402,
    closest: 3,
    crashSwitch: false,
    quorum: true,
    buys: ['0011', '0012'],
    renews: ['0010'],
    closes: ['0006'],
    vetoes: { rule: 2, llm: 0, human: 0, capped: 1 },
    methodology: '1.0',
  };
  // A routine day: nothing in the news is material (tests put RECALL_NEWS in VLMA's place when the
  // scan must find something).
  const news = {
    KRST: [{ id: 'k1', at: `${prevTradingDay(date)}T21:00:00Z`, source: 'Simulated Wire', headline: 'Krastova Mills opens a new plant (fictional)' }],
    VLMA: [{ id: 'v1', at: `${prevTradingDay(date)}T12:00:00Z`, source: 'Simulated Wire', headline: 'Velmara Foods opens a regional distribution centre (fictional)' }],
  };
  return { issue, picks, persons: PERSONS, ledger: entries, news, exit };
}

// Material negative news for VLMA (a guidance cut and a recall), for the scans that must find it.
export const RECALL_NEWS = (date) => [{ id: 'v1', at: `${prevTradingDay(date)}T12:00:00Z`, source: 'Simulated Wire', headline: 'Velmara Foods cuts full-year guidance after a product recall (fictional)' }];

// A short thesis written only from the factor JSON (for days the fixture has no template for).
function genericThesis(d) {
  const renew = d.kind === 'RENEW' ? { en: `This renews pick #${d.priorNo}. `, sl: `Podaljšanje izbire #${d.priorNo}. ` } : { en: '', sl: '' };
  return {
    en: `${renew.en}${d.agreement} of the ${d.familyCount} model families place ${d.ticker} in their top ${Math.round(d.topShare * 100)}%. The pick exits at the US open on ${d.exitPlannedText.en}, ${d.horizonDays} trading days after entry.`,
    sl: `${renew.sl}${d.agreement} od ${d.familyCount} modelskih družin uvršča ${d.ticker} med zgornjih ${Math.round(d.topShare * 100)} %. Izbira se zapre ob odprtju borze v ZDA ${d.exitPlannedText.sl}, ${d.horizonDays} dni trgovanja po vstopu.`,
  };
}

// fakeClaude({ theses, script }) -> client with beta.messages.parse and a `calls` log.
//   theses: Map ticker -> { en, sl } (defaults to the picks' own template theses)
//   script(call, params) -> undefined (answer normally) | 'invented' | 'you' | 'refusal' | 'null' | Error | { veto: {...} }
export function fakeClaude({ picks = [], script = () => undefined } = {}) {
  const theses = new Map(picks.map((p) => [`${p.ticker}|${p.issueDate}`, p.thesis]));
  const calls = [];
  const client = {
    calls,
    beta: {
      messages: {
        async parse(params) {
          const data = JSON.parse(params.messages[0].content);
          const kind = Array.isArray(data.items) ? 'veto' : 'thesis';
          const n = calls.push({ kind, params, data });
          const action = script({ n, kind, data, params });
          if (action instanceof Error) throw action;
          const reply = (out, extra = {}) => ({ id: `msg_${n}`, stop_reason: 'end_turn', stop_details: null, content: [{ type: 'text', text: JSON.stringify(out) }], parsed_output: out, ...extra });
          if (action === 'refusal') return { id: `msg_${n}`, stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: 'declined (test)' }, content: [], parsed_output: null };
          if (action === 'null') return reply(null, { parsed_output: null, stop_reason: 'max_tokens' });
          if (kind === 'veto') {
            const v = action?.veto ?? { material_negative: false, category: 'none', item_ids: [], reason: 'Routine announcements only.' };
            return reply(v);
          }
          const t = theses.get(`${data.ticker}|${data.issueDate}`) ?? genericThesis(data);
          if (action === 'invented') return reply({ en: `${t.en} The shares rose 12.5% last quarter.`, sl: t.sl });
          if (action === 'you') return reply({ en: `${t.en} You should consider it.`, sl: t.sl });
          return reply({ en: t.en, sl: t.sl });
        },
      },
    },
  };
  return client;
}
