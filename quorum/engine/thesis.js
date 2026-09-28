// Deterministic thesis writer (EN and SL) from a pick's factor JSON. Three short paragraphs: what the
// agreeing families see (with their percentiles), the top drivers with their values, and what was
// checked plus the exit rule. Every number in the text comes from the pick's data and is collected in
// `numbers`; the text is checked with core/numeric-validator.js before it is stored.
//
// SLOVENE: the Slovene text is written by the engine from fixed sentence patterns. The grammar
// (cases after "na", "med", numerals with "družin", "dni", "urah") has been checked by the author but
// the whole template set NEEDS REVIEW BY A NATIVE SPEAKER before launch.
import { validateNumbers } from '../core/numeric-validator.js';
import { fmtLong } from '../core/calendar.js';

const FAMILY_NAME = {
  en: { A: 'trend', B: 'fundamental momentum', C: 'quality/value', D: 'the ML ranker' },
  sl: { A: 'trend', B: 'fundamentalni momentum', C: 'kakovost/vrednost', D: 'rangirnik ML' },
};
const FAMILY_TITLE = {
  en: { A: 'Trend', B: 'Fundamental momentum', C: 'Quality/value', D: 'The ML ranker' },
  sl: { A: 'Trend', B: 'Fundamentalni momentum', C: 'Kakovost/vrednost', D: 'Rangirnik ML' },
};

// How a driver's raw value is written (unit handling per feature key).
const RAW_FORMAT = {
  resid_mom: 'pct', mom_12_1: 'pct', mom_6_1: 'pct', rev_1m: 'pct', vol_60: 'pct', ivol: 'pct', max_ret: 'pct',
  fcf_yield: 'pct', leverage: 'pct', turnover: 'pct', eps_chg: 'pct',
  gpa: 'plain', bm_adj: 'plain', beta: 'plain',
  ebit_ev: 'evEbit', gp_chg: 'pp', sue: 'sd', resid_mom_vs: 't',
  dtc: 'days', days_to_earn: 'days', days_since_filing: 'days',
};

function num(x, d, locale) {
  const s = Math.abs(x).toFixed(d);
  const body = locale === 'sl' ? s.replace('.', ',') : s;
  return `${x < 0 && Number(s) !== 0 ? '-' : ''}${body}`;
}
function pctText(x, d, locale) {
  return `${num(x * 100, d, locale)}${locale === 'sl' ? ' %' : '%'}`;
}
function rank(p) {
  return Math.min(100, Math.max(0, Math.round(p * 100)));
}
function ordinalEn(n) {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
}
function lowerFirst(s) {
  return /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
}
function listJoin(items, locale) {
  if (items.length <= 1) return items.join('');
  const and = locale === 'sl' ? ' in ' : ' and ';
  return `${items.slice(0, -1).join(', ')}${and}${items[items.length - 1]}`;
}
const COUNT_WORD = {
  en: { 3: 'Three of the four', 4: 'All four' },
  sl: { 3: 'Tri od štirih modelskih družin uvrščajo', 4: 'Vse štiri modelske družine uvrščajo' },
};

/** The raw value of a driver as text, plus the source number behind it (or null when not written). */
function rawText(drv, locale) {
  const f = RAW_FORMAT[drv.key];
  const v = drv.raw?.value;
  if (!f || v === null || v === undefined || !Number.isFinite(v)) return null;
  const sl = locale === 'sl';
  switch (f) {
    case 'pct':
      return { text: pctText(v, 1, locale), n: v };
    case 'plain':
      return { text: num(v, 2, locale), n: v };
    case 'evEbit':
      return drv.raw.evEbit ? { text: `EV/EBIT ${num(drv.raw.evEbit, 1, locale)}`, n: drv.raw.evEbit } : null;
    case 'pp':
      return { text: `${num(v * 100, 1, locale)} ${sl ? 'odstotne točke' : 'percentage points'}`, n: v };
    case 'sd':
      return { text: `${num(v, 1, locale)} ${sl ? 'standardnega odklona' : 'standard deviations'}`, n: v };
    case 't':
      return { text: `${sl ? 't-statistika' : 't-statistic'} ${num(v, 1, locale)}`, n: v };
    case 'days':
      return { text: `${num(v, 1, locale)} ${sl ? 'dneva' : 'days'}`, n: v };
    default:
      return null;
  }
}

/** The driver each agreeing family's vote rests on: its strongest own input (D: largest contribution). */
function leadDriver(fam, drivers) {
  const list = (drivers?.[fam] ?? []).filter((d) => !d.context && d.value !== null && d.value !== undefined);
  return list[0] ?? null;
}

function paragraphOne(p, locale, src) {
  const sl = locale === 'sl';
  const topShare = 1 - p.topPct;
  src.nums.push(topShare);
  const slice = sl ? `med zgornjih ${pctText(topShare, 0, 'sl')}` : `in their top ${pctText(topShare, 0, 'en')}`;
  const voters = p.crashSwitch ? ['B', 'C', 'D'] : ['A', 'B', 'C', 'D'];
  const agreeing = p.agreeing;
  const parts = agreeing.map((f, k) => {
    const r = rank(p.families[f].pct);
    src.nums.push(p.families[f].pct);
    if (sl) return `${FAMILY_NAME.sl[f]} na ${r}. percentilu`;
    return k === 0 ? `${FAMILY_NAME.en[f]} at the ${ordinalEn(r)} percentile` : `${FAMILY_NAME.en[f]} at the ${ordinalEn(r)}`;
  });
  const who = `${p.ticker} (${p.name}, ${sl ? p.sectorSl : p.sector})`;
  src.lits.push(p.ticker, p.name, p.sector, p.sectorSl ?? '');
  let s;
  if (p.crashSwitch) {
    s = sl
      ? `Stikalo za zlom momentuma je vklopljeno, zato trend ne glasuje in se morajo strinjati vse tri preostale družine. Vse tri uvrščajo ${who} ${slice}: ${listJoin(parts, 'sl')}.`
      : `The crash switch is on, so trend does not vote and all three remaining families must agree. All three place ${who} ${slice}: ${listJoin(parts, 'en')}.`;
  } else {
    const n = agreeing.length;
    s = sl ? `${COUNT_WORD.sl[n]} ${who} ${slice}: ${listJoin(parts, 'sl')}.` : `${COUNT_WORD.en[n]} model families place ${who} ${slice}: ${listJoin(parts, 'en')}.`;
  }
  const others = voters.filter((f) => !agreeing.includes(f));
  for (const f of others) {
    const pf = p.families[f].pct;
    if (pf === null || pf === undefined) {
      s += sl ? ` ${FAMILY_TITLE.sl[f]} delnice danes ne oceni.` : ` ${FAMILY_TITLE.en[f]} does not score the stock today.`;
      continue;
    }
    src.nums.push(pf);
    const r = rank(pf);
    s += sl
      ? ` Pri družini ${FAMILY_NAME.sl[f]} je delnica na ${r}. percentilu, zato ta družina ne glasuje za izbiro.`
      : ` ${FAMILY_TITLE.en[f]} ranks it at the ${ordinalEn(r)} percentile and does not vote for it.`;
  }
  if (p.kind === 'RENEW' && p.priorNo) {
    src.lits.push(p.priorNo);
    s = (sl ? `Podaljšanje izbire #${p.priorNo} za novo 21-dnevno obdobje. ` : `This renews pick #${p.priorNo} for a new 21-day window. `) + s;
    src.nums.push(21);
  }
  return s;
}

function paragraphTwo(p, locale, src) {
  const sl = locale === 'sl';
  const sentences = [];
  for (const f of p.agreeing) {
    const d = leadDriver(f, p.drivers);
    if (!d) continue;
    // Slovene keeps the label as a quoted name so its case does not have to follow the sentence
    const label = locale === 'sl' ? `»${d.label.sl}«` : lowerFirst(d.label.en);
    src.lits.push(label);
    src.nums.push(d.value);
    const raw = rawText(d, locale);
    if (raw) src.nums.push(raw.n);
    const z = num(d.value, 1, locale);
    const tail = raw ? (sl ? `; ${raw.text}` : `; ${raw.text}`) : '';
    if (f === 'D') {
      sentences.push(sl ? `Največji prispevek k oceni rangirnika ML ima ${label} (z-vrednost ${z}${tail}).` : `The ML ranker's largest contribution comes from ${label} (z-score ${z}${tail}).`);
    } else {
      sentences.push(sl ? `Glas družine ${FAMILY_NAME.sl[f]} temelji na kazalniku ${label} (z-vrednost ${z}${tail}).` : `The ${FAMILY_NAME.en[f]} vote rests on ${label} (z-score ${z}${tail}).`);
    }
  }
  return sentences.join(' ');
}

function paragraphThree(p, locale, src) {
  const sl = locale === 'sl';
  const v = Object.fromEntries((p.vetoChecks ?? []).map((c) => [c.key, c]));
  const parts = [];
  if (v.days_to_cover?.value !== undefined && v.days_to_cover.value !== null) {
    src.nums.push(v.days_to_cover.value);
    parts.push(sl ? `dnevi za pokritje ${num(v.days_to_cover.value, 1, 'sl')} (veto velja za zgornji decil)` : `days to cover ${num(v.days_to_cover.value, 1, 'en')} (the veto applies to the top decile)`);
  }
  if (v.idio_vol?.value !== undefined && v.idio_vol.value !== null) {
    src.nums.push(v.idio_vol.value);
    parts.push(sl ? `idiosinkratična volatilnost ${pctText(v.idio_vol.value, 1, 'sl')} (veto velja za zgornji decil)` : `idiosyncratic volatility ${pctText(v.idio_vol.value, 1, 'en')} (the veto applies to the top decile)`);
  }
  src.nums.push(3);
  if (v.earnings_within_3d?.next) {
    const d = fmtLong(v.earnings_within_3d.next, locale);
    src.lits.push(d);
    parts.push(sl ? `v naslednjih 3 dneh trgovanja ni objave rezultatov (naslednja: ${d})` : `no earnings report within 3 trading days (next: ${d})`);
  } else {
    parts.push(sl ? `v naslednjih 3 dneh trgovanja ni objave rezultatov` : `no earnings report within 3 trading days`);
  }
  parts.push(sl ? 'ni čakajoče združitve ali delitve delnic' : 'no pending merger or split');
  src.nums.push(48);
  parts.push(
    sl
      ? 'po nadomestnem klasifikatorju novic (stand-in za LLM) v zadnjih 48 urah ni pomembne negativne novice'
      : 'no material negative headline in the last 48 hours according to the news-veto stand-in (it replaces the LLM in this simulation)',
  );
  const exit = fmtLong(p.exitPlanned, locale);
  src.lits.push(exit);
  src.nums.push(21);
  const checks = sl ? `Preverjeno: ${listJoin(parts, 'sl')}.` : `Checks passed: ${listJoin(parts, 'en')}.`;
  const exitRule = sl
    ? `Izbira se zapre ob odprtju borze v ZDA ${exit}, 21 dni trgovanja po vstopu. Ciljne cene in ustavitve izgube ni.`
    : `The pick exits at the US open on ${exit}, 21 trading days after entry. There is no price target and no stop-loss.`;
  return `${checks} ${exitRule}`;
}

/**
 * Write the thesis of one pick.
 * @param {object} p  { kind, no, priorNo, ticker, name, sector, sectorSl, agreement, agreeing, crashSwitch,
 *                      topPct, families: {A..D: {pct}}, drivers: model.drivers(s, i), vetoChecks, exitPlanned }
 * @returns {{ en, sl, numbers: number[], validator: 'passed'|'failed', unknown: {en, sl} }}
 */
export function writeThesis(p) {
  const out = {};
  const numbers = [];
  const unknown = {};
  let ok = true;
  for (const locale of ['en', 'sl']) {
    const src = { nums: [], lits: [p.no] };
    const text = [paragraphOne(p, locale, src), paragraphTwo(p, locale, src), paragraphThree(p, locale, src)].join('\n\n');
    const lits = src.lits.filter((x) => typeof x === 'string' && x.length);
    const res = validateNumbers(text, src.nums, { locale, allowStrings: lits });
    out[locale] = text;
    unknown[locale] = res.unknown;
    if (!res.ok) ok = false;
    for (const n of src.nums) if (!numbers.includes(n)) numbers.push(n);
  }
  return { en: out.en, sl: out.sl, numbers, validator: ok ? 'passed' : 'failed', unknown };
}

/** Re-check a stored thesis against its stored numbers (used by the tests and the export). */
export function checkThesis(thesis, numbers, literals = []) {
  const en = validateNumbers(thesis.en, numbers, { locale: 'en', allowStrings: literals });
  const sl = validateNumbers(thesis.sl, numbers, { locale: 'sl', allowStrings: literals });
  return { ok: en.ok && sl.ok, unknown: { en: en.unknown, sl: sl.unknown } };
}
