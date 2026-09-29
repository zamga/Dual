// The Assembly: the home hero (docs/DESIGN-V2.md §4.1, §4.3, §4.6). Data: data/hero.json only (the most
// recently closed pick's issue): every grain is one scored stock's rank in one family.
// Engines: the inline SVG frame paints first (a 300-stock subsample, one static frame per state); after
// two frames and idle time, raw WebGL2 (WebGL1 + ANGLE_instanced_arrays as the fallback) on capable GPUs,
// the 2D canvas on software renderers and weak devices, the SVG alone for ?gl=0 and reduced motion.
// ?gl=webgl|webgl1|canvas|0 forces one. Native scroll drives everything (p = progress through the tall
// section); nothing renders while the hero is off-screen or unchanged (section.asmStats counts frames).
//
// SL: first draft, needs native review.
import { h, svg, prefersReducedMotion } from '../dom.js';
import { formatInZone, LJUBLJANA, fmtDDMMYY } from '../core/calendar.js';
import { analyze } from '../core/gsm7.js';
import { ruleLabels } from '../rule.js';
import { phone as phoneEl, familyName, colPickLabel, colNoVoteLabel } from '../ui.js';
import { FAMS, thresholdOf, parseHero, subsample, excessPath, buildMotes, sceneAt, computeLayout, cameraAt, viewProj, project, lintelExtent, SETTLED, lerp, seg, clamp01, E } from './level-data.js';
import { createGLEngine } from './gl.js';
import { svgFrame, createCanvasEngine } from './flat.js';

const COPY = {
  en: {
    issue: (x) => `Replay · issue #${x.issueNo} · ${x.date} · our latest closed pick · ${x.nScored} scored`,
    issueShort: (x) => `Replay · #${x.issueNo} · ${x.date} · ${x.nScored} scored`,
    headline: ['No quorum,', 'no text.'],
    lede: (x) =>
      `Every US trading day four independent model families rank about ${x.n} stocks. A pick exists only when three of them put the same stock ${x.R.inTop}, no veto fires and the caps allow it. Only a pick, a renewal or an exit makes a text.`,
    vote: ['Four families', 'rank every stock.'],
    voteSub: (x) => `Each ranks all ${x.nScored} from 0 to 100 on its own evidence. Every grain here is one stock’s rank in one family, from issue #${x.issueNo}.`,
    silence: (x) => `${x.silent} stocks fall silent.`,
    voice: 'Most days, nothing.',
    silenceSub: (x) =>
      `Ranks below the ${x.R.pctile} fall to the floor. ${x.metW} reached the ${x.R.top} on ${x.minW} columns; ${x.q === 1 ? 'one became a new pick' : `${x.qW} became new picks`}${x.met > x.q ? `, the ${x.met - x.q === 1 ? 'other was' : 'others were'} vetoed, capped or already open` : ''}.`,
    quorumH: (x) => `One stock. ${x.agreement === 4 ? 'Four' : 'Three'} columns.`,
    quorum: (x) => `Issue #${x.issueNo}, ${x.date}. ${x.ticker} (fictional) stood on ${x.agreement === 4 ? 'all four columns' : `three of four columns: ${x.agreeList}`}${x.kind === 'RENEW' ? `, renewed from #${x.priorNo}` : ''}.`,
    textH: (x) => ['Sealed 13:45.', x.pre ? 'Published 14:00.' : 'Sent 14:00.'],
    text: (x) => `Sealed at 13:45, published at 14:00:00 ${x.tz} with this text${x.pre ? ' (before launch no text is sent)' : ''}. Entry at the US open, ${x.minutes} minutes later.`,
    seg: (a) => `${a.units}/${a.perSegment} ${a.encoding} · ${a.segments} ${a.segments === 1 ? 'segment' : 'segments'}`,
    steps: ['The universe', 'The vote', 'Silence', 'The quorum', 'The text', 'The result'],
    stepsLabel: 'The Assembly, step by step',
    jump: (i, s) => `Step ${i}: ${s}`,
    cue: 'Scroll',
    buy: 'BUY',
    renew: (no) => `RENEW of #${no}`,
    entry: 'Entry',
    exit: 'Exit',
    usOpen: 'US open',
    vs: 'Excess vs S&P 500 TR (simulated)',
    net: 'Net',
    bench: 'Benchmark',
    day: 'day',
    fictional: 'fictional',
    closed: 'Our latest closed pick.',
    whatever: 'Whatever happened.',
    notAdvice: 'Closed record. Not a current recommendation. Not personal advice.',
    altTitle: 'The Assembly: our latest closed pick, described',
    alt1: (x) =>
      `Issue #${x.issueNo} was published on ${x.date} at 14:00 ${x.tz}. ${x.nScored} stocks were scored by four model families; each stock is drawn as four grains, one per family, that rise on four stone columns to the height of its percentile. Below the rule (${x.R.band}) the grains fall to the floor: ${x.met} ${x.met === 1 ? 'stock' : 'stocks'} met the rule and ${x.q} became ${x.q === 1 ? 'a new pick' : 'new picks'}.`,
    alt2: (x) => `The pick: ${x.ticker}, ${x.name} (fictional), ${x.agreement} of 4 families ${x.R.inTop}.`,
    altTable: (x) => `Percentile the pick received from each family (${x.R.top} is ${x.R.plus})`,
    altFamily: 'Family',
    altPct: 'Percentile',
    yes: 'yes',
    no: 'no',
    altSms: (pre) => (pre ? 'The SMS written for 14:00:00 (before launch nothing is sent):' : 'The SMS sent at 14:00:00:'),
    altResult: (x) => `Result at the US open 21 trading days later (${x.exit}): excess return ${x.excess} against the S&P 500 total return (simulated); net ${x.net}, benchmark ${x.bench}.`,
  },
  sl: {
    issue: (x) => `Ponovitev · izdaja #${x.issueNo} · ${x.date} · naša zadnja zaprta izbira · ${x.nScored} ocenjenih`,
    issueShort: (x) => `Ponovitev · #${x.issueNo} · ${x.date} · ${x.nScored} ocenjenih`,
    headline: ['Brez kvoruma', 'ni SMS.'],
    lede: (x) =>
      `Vsak dan trgovanja v ZDA štiri neodvisne družine modelov rangirajo približno ${x.n} delnic. Izbira nastane samo, ko tri isto delnico uvrstijo ${x.R.inTop}, noben veto se ne sproži in omejitve to dopuščajo. SMS sproži samo izbira, podaljšanje ali izstop.`,
    vote: ['Štiri družine', 'rangirajo vsako delnico.'],
    voteSub: (x) => `Vsaka rangira vseh ${x.nScored} od 0 do 100 na podlagi svojih dokazov. Vsako zrno je rang ene delnice v eni družini, iz izdaje #${x.issueNo}.`,
    silence: (x) => `${x.silent} delnic utihne.`,
    voice: 'Večino dni nič.',
    silenceSub: (x) =>
      `Rangi pod pragom (${x.R.pctile}) padejo na tla. ${x.R.topCap} na vsaj ${x.minAgree} stebrih je doseglo ${x.met} delnic; ${x.q} ${x.q === 1 ? 'je postala nova izbira' : 'so postale nove izbire'}${x.met > x.q ? ', ostale so bile vetirane, omejene ali že odprte' : ''}.`,
    quorumH: (x) => `Ena delnica. ${x.agreement === 4 ? 'Štirje' : 'Trije'} stebri.`,
    quorum: (x) => `Izdaja #${x.issueNo}, ${x.date}. ${x.ticker} (izmišljeno) je stala na ${x.agreement === 4 ? 'vseh štirih stebrih' : `treh od štirih stebrov: ${x.agreeList}`}${x.kind === 'RENEW' ? `, podaljšano iz #${x.priorNo}` : ''}.`,
    textH: (x) => ['Zapečateno 13:45.', x.pre ? 'Objavljeno 14:00.' : 'Poslano 14:00.'],
    text: (x) => `Zapečateno ob 13:45, objavljeno ob 14:00:00 ${x.tz} s tem SMS${x.pre ? ' (pred zagonom se SMS ne pošilja)' : ''}. Vstop ob odprtju ameriškega trga, ${x.minutes} minut pozneje.`,
    seg: (a) => `${a.units}/${a.perSegment} ${a.encoding} · ${a.segments} ${a.segments === 1 ? 'segment' : 'segmenti'}`,
    steps: ['Univerzum', 'Glasovanje', 'Tišina', 'Kvorum', 'SMS', 'Izid'],
    stepsLabel: 'Zbor po korakih',
    jump: (i, s) => `Korak ${i}: ${s}`,
    cue: 'Drsite',
    buy: 'NAKUP',
    renew: (no) => `PODALJŠANJE #${no}`,
    entry: 'Vstop',
    exit: 'Izstop',
    usOpen: 'odprtje ZDA',
    vs: 'Presežek proti S&P 500 TR (simulirano)',
    net: 'Neto',
    bench: 'Merilo',
    day: 'dan',
    fictional: 'izmišljeno',
    closed: 'Naša zadnja zaprta izbira.',
    whatever: 'Ne glede na izid.',
    notAdvice: 'Zaprt zapis. Ni trenutno priporočilo. Ni osebni nasvet.',
    altTitle: 'Zbor: opis naše zadnje zaprte izbire',
    alt1: (x) =>
      `Izdaja #${x.issueNo} je izšla ${x.date} ob 14:00 ${x.tz}. Štiri družine modelov so ocenile ${x.nScored} delnic; vsaka delnica je narisana kot štiri zrna, eno na družino, ki se dvignejo na štirih kamnitih stebrih do višine njenega percentila. Pod pravilom (${x.R.band}) zrna padejo na tla: pravilo je izpolnilo ${x.met} delnic, ${x.q} jih je postalo novih izbir.`,
    alt2: (x) => `Izbira: ${x.ticker}, ${x.name} (izmišljeno), ${x.agreement} od 4 družin ${x.R.inTop}.`,
    altTable: (x) => `Percentil, ki ga je izbira dobila v posamezni družini (${x.R.top} je ${x.R.plus})`,
    altFamily: 'Družina',
    altPct: 'Percentil',
    yes: 'da',
    no: 'ne',
    altSms: (pre) => (pre ? 'SMS, pripravljen za 14:00:00 (pred zagonom se nič ne pošlje):' : 'SMS, poslan ob 14:00:00:'),
    altResult: (x) => `Izid ob odprtju ameriškega trga 21 trgovalnih dni pozneje (${x.exit}): presežni donos ${x.excess} proti skupnemu donosu S&P 500 (simulirano); neto ${x.net}, merilo ${x.bench}.`,
  },
};

// ---- engine choice ----------------------------------------------------------------------------------
function probe() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) || c.getContext('webgl', { failIfMajorPerformanceCaveat: true });
    if (!gl) return { ok: false };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { ok: true, software: /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(renderer) };
  } catch {
    return { ok: false };
  }
}

export function chooseEngine(flag, reduced) {
  const f = String(flag ?? '').toLowerCase();
  if (f === '0' || f === 'svg' || f === 'off') return 'svg';
  if (f === 'canvas' || f === '2d') return 'canvas';
  if (f === 'webgl1') return 'webgl1';
  if (reduced) return 'svg';
  if (f === 'webgl' || f === '1' || f === 'gl' || f === 'webgl2') return 'webgl';
  const pr = probe();
  if (!pr.ok || pr.software) return 'canvas';
  if ((navigator.hardwareConcurrency ?? 4) < 4 || (navigator.deviceMemory ?? 8) < 4) return 'canvas';
  return 'webgl';
}

// token colours from the CSS (tokens.css is the only place with hex values)
function rgbOf(el, name, fallbackName) {
  const cs = getComputedStyle(el);
  const v = (cs.getPropertyValue(name) || cs.getPropertyValue(fallbackName) || '').trim();
  let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) return [0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16) / 255);
  m = v.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (m) return [m[1], m[2], m[3]].map((x) => Number(x) / 255);
  return [0.5, 0.5, 0.5];
}

function offsetIn(el, ancestor) {
  let x = 0;
  let y = 0;
  let n = el;
  while (n && n !== ancestor) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent;
  }
  return { left: x, top: y, width: el.offsetWidth, height: el.offsetHeight };
}

function nyOffset(date) {
  // US daylight saving: second Sunday of March to first Sunday of November
  const y = Number(date.slice(0, 4));
  const sunday = (m, n) => {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + (n - 1) * 7;
  };
  const start = `${y}-03-${String(sunday(3, 2)).padStart(2, '0')}`;
  const end = `${y}-11-${String(sunday(11, 1)).padStart(2, '0')}`;
  return date >= start && date < end ? '-04:00' : '-05:00';
}

const WORDS = { en: ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'], sl: null };
const words = (n, locale) => (WORDS[locale] && n < 10 ? WORDS[locale][n] : String(n));
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// Masked display lines: each authored line clips its own text (DESIGN-V2 §4.7)
function lines(list, cls) {
  return list.map((t, i) => {
    const inner = h('span', { class: 'asm__li' }, t);
    inner.style.setProperty('--i', String(i));
    return h('span', { class: ['asm__ln', cls] }, inner);
  });
}

// The result as a digit reveal: sign and arrow first, then each character drops in from blank, right to
// left. No intermediate value is ever shown; the accessible name carries the whole value.
function digits(x, fmt) {
  const s = fmt.signed(x);
  const sign = /^[+−-]/.test(s.text) ? s.text[0] : '';
  const rest = sign ? s.text.slice(1) : s.text;
  const chars = [...rest];
  return h(
    'span',
    { class: ['signed', s.cls, 'asm__digits'], role: 'img', 'aria-label': `${s.arrow} ${s.text}` },
    h('span', { class: 'asm__dsign', 'aria-hidden': 'true' }, h('span', { class: 'signed__arrow' }, s.arrow), sign),
    chars.map((c, i) => {
      const cell = h('span', { class: ['asm__dcell', /[.,]/.test(c) && 'is-p'], 'aria-hidden': 'true' }, h('span', {}, c));
      cell.style.setProperty('--d', String(chars.length - 1 - i));
      return cell;
    }),
  );
}

// ---- the component ----------------------------------------------------------------------------------
// opts: { meta, prelaunch (from ctx.launch(): before launch the copy never says a text was sent), freeze,
//   clearOf (frozen: () => the host element the floor must stay 48 px above) }
// freeze: 'quorum' shows the settled quorum frame in one viewport (for a pick page that hero.json holds).
export function createAssembly(ctx, hero, opts = {}) {
  const meta = opts.meta ?? null;
  const locale = ctx.locale;
  const C = COPY[locale] ?? COPY.en;
  const fmt = ctx.fmt;
  const THRESHOLD = thresholdOf(meta);
  const R = ruleLabels(meta, locale);
  const parsed = parseHero(hero, THRESHOLD, meta?.rule?.minAgree ?? 3);
  const seedKey = hero.issueDate;
  const reduced = prefersReducedMotion();
  const frozen = opts.freeze === 'quorum';
  const pickRow = parsed.pickRow;
  const agreeing = new Set(hero.pick.agreeing);
  const ag = FAMS.map((f) => (agreeing.has(f) ? 1 : 0));
  const agreeK = FAMS.map((f, k) => (agreeing.has(f) ? k : -1)).filter((k) => k >= 0);
  const missK = FAMS.map((f, k) => (agreeing.has(f) ? -1 : k)).filter((k) => k >= 0);
  const lj = formatInZone(new Date(hero.smsAt), LJUBLJANA);
  const tz = lj.offset === '+02:00' ? 'CEST' : 'CET';
  const q = hero.quorumCount ?? 0;
  const X = {
    n: fmt.int(Math.floor(hero.nScored / 100) * 100),
    issueNo: hero.issueNo,
    date: fmtDDMMYY(hero.issueDate),
    nScored: fmt.int(hero.nScored),
    silent: fmt.int(parsed.n - parsed.met),
    met: parsed.met,
    q,
    metW: cap(words(parsed.met, locale)),
    qW: words(q, locale),
    minAgree: meta?.rule?.minAgree ?? 3,
    minW: words(meta?.rule?.minAgree ?? 3, locale),
    agreement: agreeing.size,
    agreeList: hero.pick.agreeing.join(', '),
    ticker: hero.pick.ticker,
    name: hero.pick.name,
    tz,
    minutes: 90,
    R,
    kind: hero.pick.kind ?? 'BUY',
    priorNo: hero.pick.priorNo ?? null,
    pre: opts.prelaunch !== false,
  };
  if (lj.date === hero.issueDate) {
    const open = new Date(`${hero.issueDate}T09:30:00${nyOffset(hero.issueDate)}`);
    X.minutes = Math.round((open.getTime() - new Date(hero.smsAt).getTime()) / 60000);
  }
  const smsText = locale === 'sl' ? (hero.smsSl ?? hero.sms) : hero.sms;
  const kindBadge = X.kind === 'RENEW' && X.priorNo ? C.renew(X.priorNo) : C.buy;
  const ex = hero.outcome ?? { excess: 0, net: 0, bench: 0, exitDate: hero.issueDate };
  const exPath = excessPath(hero.path);

  // grains: every stock for WebGL; a 300-stock subsample (plus the pick) for the flat engines
  const allRows = Array.from({ length: parsed.n }, (_, i) => i);
  const subRows = [...subsample(parsed.n, hero.pick.index, 300, seedKey), hero.pick.index];
  const subMotes = buildMotes(parsed, subRows, seedKey);

  // ---- DOM ------------------------------------------------------------------------------------------
  const stage = h('div', { class: 'asm__stage', 'aria-hidden': 'true' });
  const issueLine = h('p', { class: 'asm__issue label' }, h('span', { class: 'asm__issue-l' }, C.issue(X)), h('span', { class: 'asm__issue-s' }, C.issueShort(X)));

  const headline = h('h1', { class: 'asm__h', id: 'asm-h' }, ...lines(C.headline).flatMap((l, i) => (i ? [' ', l] : [l])));
  const beats = [
    h('div', { class: 'asm__beat asm__beat--0 is-on' }, headline, h('p', { class: 'asm__lede' }, C.lede(X))),
    h('div', { class: 'asm__beat asm__beat--1', 'aria-hidden': 'true' }, h('p', { class: 'asm__d2' }, ...lines(C.vote)), h('p', { class: 'asm__sub' }, C.voteSub(X))),
    h('div', { class: 'asm__beat asm__beat--2', 'aria-hidden': 'true' }, h('p', { class: 'asm__wide' }, ...lines([C.silence(X)])), h('p', { class: 'asm__voice' }, ...lines([C.voice])), h('p', { class: 'asm__sub' }, C.silenceSub(X))),
    h('div', { class: 'asm__beat asm__beat--3', 'aria-hidden': 'true' }, h('p', { class: 'asm__wide' }, ...lines([C.quorumH(X)])), h('p', { class: 'asm__sub asm__sub--q' }, C.quorum(X))),
    h('div', { class: 'asm__beat asm__beat--4', 'aria-hidden': 'true' }, h('p', { class: 'asm__d2' }, ...lines(C.textH(X))), h('p', { class: 'asm__sub asm__sub--t' }, C.text(X))),
  ];
  beats.forEach((b, i) => (b.dataset.beat = String(i)));

  // labels that follow the scene (positioned from the projection each frame)
  const famLabels = FAMS.map((f, k) => h('li', { class: ['asm__fam', ag[k] ? 'is-agree' : 'is-miss'] }, h('b', {}, f), h('span', {}, familyName(f, meta, locale))));
  const fams = h('ol', { class: 'asm__fams', 'aria-hidden': 'true' }, famLabels);
  const slabLabel = h('p', { class: 'asm__slablabel label', 'aria-hidden': 'true' }, R.band);
  const pickLabel = colPickLabel(hero.pick.ticker, agreeing.size, 'asm__quorum-label');
  const noVote = missK.map((k) => colNoVoteLabel(FAMS[k], pickRow[k] < 0 ? NaN : pickRow[k] / 10, locale, 'asm__novote'));

  // the phone (DOM only) and the SMS baseline the lintel hands over
  const phoneNode = phoneEl({ text: smsText, at: hero.smsAt, locale });
  const bubble = phoneNode.querySelector('.sms');
  const screen = phoneNode.querySelector('.phone__screen');
  const gsm = analyze(smsText);
  const phoneWrap = h('div', { class: 'asm__phonewrap', 'aria-hidden': 'true' }, phoneNode, h('p', { class: 'asm__gsm label' }, C.seg(gsm)));
  const baseline = h('span', { class: 'asm__lintel-line', 'aria-hidden': 'true' });

  // the note: the phone screen expands into it; the 21-day path draws with p
  const noteChart = buildNoteChart(exPath, ex.excess, fmt, C);
  const result = digits(ex.excess, fmt);
  const note = h(
    'div',
    { class: 'asm__note paper', 'aria-hidden': 'true' },
    h(
      'div',
      { class: 'asm__notehead asm__nb' },
      h('span', { class: 'badge-quorum' }, `${kindBadge} · ${agreeing.size}/4`),
      h('span', { class: 'ticker asm__noteticker' }, hero.pick.ticker),
      h('span', { class: 'asm__notename' }, `${hero.pick.name} `, h('span', { class: 'tag' }, C.fictional)),
      h('span', { class: 'label asm__noteno' }, `#${hero.pick.no} · ${X.date} 14:00 ${tz}`),
    ),
    h(
      'p',
      { class: 'asm__notedates label asm__nb' },
      h('span', {}, `${C.entry} · ${C.usOpen} ${fmtDDMMYY(hero.issueDate)}`),
      h('span', {}, `${C.exit} · ${C.usOpen} ${fmtDDMMYY(ex.exitDate)}`),
    ),
    noteChart.el,
    h(
      'div',
      { class: 'asm__noteresult asm__nb' },
      h('p', { class: 'label' }, C.vs),
      h('p', { class: 'asm__notex' }, result),
      h('p', { class: 'asm__notesub mono' }, `${C.net} ${fmt.signed(ex.net).arrow} ${fmt.signed(ex.net).text} · ${C.bench} ${fmt.signed(ex.bench).arrow} ${fmt.signed(ex.bench).text}`),
    ),
    h('p', { class: 'asm__whatever' }, h('span', { class: 'asm__ln' }, h('span', { class: 'asm__li' }, `${C.closed} `, h('em', {}, C.whatever)))),
    h('p', { class: 'asm__noteadvice asm__nb' }, C.notAdvice),
  );

  const stepBtns = C.steps.map((s, i) =>
    h('button', { type: 'button', class: ['asm__stepbtn', i === 0 && 'is-on'], 'aria-label': C.jump(i + 1, s) }, h('span', { class: 'asm__stepn' }, `0${i + 1}`), h('span', { class: 'asm__stepname' }, s)),
  );
  const steps = h('nav', { class: 'asm__steps', 'aria-label': C.stepsLabel }, stepBtns);
  const cue = h('p', { class: 'asm__cue label', 'aria-hidden': 'true' }, h('span', { class: 'asm__cueline' }), C.cue);

  const view = h('div', { class: 'asm__view grid' }, stage, issueLine, fams, slabLabel, pickLabel, ...noVote, phoneWrap, baseline, note, ...beats, steps, cue);

  const altRows = FAMS.map((f, k) =>
    h('tr', {}, h('th', { scope: 'row' }, `${f} · ${familyName(f, meta, locale)}`), h('td', {}, pickRow[k] < 0 ? '–' : String(Math.floor(pickRow[k] / 10))), h('td', {}, agreeing.has(f) ? C.yes : C.no)),
  );
  const alt = h(
    'div',
    { class: 'visually-hidden' },
    h('h2', {}, C.altTitle),
    h('p', {}, C.alt1(X)),
    h('p', {}, C.alt2(X)),
    h('table', {}, h('caption', {}, C.altTable(X)), h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, C.altFamily), h('th', { scope: 'col' }, C.altPct), h('th', { scope: 'col' }, R.topCap))), h('tbody', {}, altRows)),
    h('p', {}, `${C.altSms(X.pre)} ${smsText}`),
    h('p', {}, C.altResult({ exit: fmtDDMMYY(ex.exitDate), excess: fmt.signed(ex.excess).text, net: fmt.signed(ex.net).text, bench: fmt.signed(ex.bench).text })),
  );

  const section = h('section', { class: ['asm', 'lv', 'chamber', reduced && 'is-stepped', frozen && 'is-frozen'], 'aria-labelledby': 'asm-h' }, view, alt);
  section.dataset.engine = 'svg';
  section.dataset.step = '0';
  const stats = { engine: 'svg', api: 'svg', frames: 0, offscreen: 0, drawMs: 0, maxDrawMs: 0 };
  section.asmStats = stats;

  // ---- behaviour ----------------------------------------------------------------------------------
  const engineKind = chooseEngine(ctx.flags?.gl, reduced);
  const stepped = () => reduced || !engine;
  let engine = null;
  let canvas = null;
  let svgEl = null;
  let svgKey = '';
  let L = null;
  let geo = null;
  let colors = null;
  let visible = true;
  let destroyed = false;
  let raf = 0;
  let lastKey = '';
  let lastStep = -1;
  let time = 0;
  let lastT = 0;
  let lastInput = performance.now();
  const par = [0, 0];
  const parT = [0, 0];
  const flags = { bubble: false, note: false, result: false };
  const cleanups = [];
  let bubbleAnim = null;
  let labelH = { pick: 18, pickW: 90, novote: 14, novoteW: 120 };
  let noteAnim = null;

  function measure() {
    const W = view.clientWidth;
    const H = view.clientHeight;
    if (!W || !H) return;
    const ri = [...document.querySelectorAll('.rules > i')].map((i) => i.getBoundingClientRect().left + 0.5);
    let rules = ri.length === 4 && ri[3] > ri[0] ? ri : [0.125, 0.375, 0.625, 0.875].map((f) => f * W);
    // phones: the page gutter is 16 px, so columns on rules 1 and 4 would lose half their grains to the
    // screen's edge. A and D step in to the gutter + 12 px; B and C stay on rules 2 and 3 (a column 4 px off
    // a rule reads as a mistake, 12 px in from the gutter as a margin).
    if (W < 640) rules = [rules[0] + 12, rules[1], rules[2], rules[3] - 12];
    // the text beat's words stand under the phone on tablets and phones
    section.style.setProperty('--b4h', `${Math.ceil(beats[4].offsetHeight)}px`);
    const chrome = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chrome-h')) || 100;
    const wide = W >= 1024;
    const top = chrome + Math.max(36, H * (wide ? 0.09 : 0.06));
    // The scene never runs through the words: the floor (and the family labels under it) stays clear of
    // every beat's headline, and the quorum's crane stops before the floor reaches that beat's headline.
    // (A frozen scene has no beats: it clears the host page's words, opts.clearOf, by 48 px instead.)
    const vr = view.getBoundingClientRect();
    const topIn = (el) => (el && el.getClientRects().length ? el.getBoundingClientRect().top - vr.top : H);
    const labelRoom = wide ? 52 : 34;
    labelH = { pick: pickLabel.offsetHeight || 18, pickW: pickLabel.offsetWidth || 90, novote: noVote[0]?.offsetHeight || 14, novoteW: noVote[0]?.offsetWidth || 120 };
    const clear = opts.clearOf?.() ?? null;
    const floor = Math.min(
      H * (wide ? 0.7 : W >= 640 ? 0.62 : 0.56),
      topIn(beats[0].firstChild) - 28,
      topIn(beats[1].firstChild) - labelRoom - 12,
      topIn(beats[2].firstChild) - labelRoom - 12,
      topIn(clear) - 48,
    );
    const quorumFloor = Math.min(topIn(beats[3].firstChild) - 32, topIn(clear) - 48);
    L = computeLayout({ W, H, rules, top, floor: Math.max(top + H * 0.22, floor), thr: THRESHOLD, quorumFloor });
    // DPR cap 1.75 (1.5 on phones); a software renderer draws at 1
    const dpr = engine?.software ? 1 : Math.min(window.devicePixelRatio || 1, W < 640 ? 1.5 : 1.75);
    const b = offsetIn(bubble, view);
    geo = {
      W,
      H,
      dpr,
      bubble: b,
      base: { x0: b.left, x1: b.left + b.width, y: b.top + b.height - 1 },
      screen: offsetIn(screen, view),
      note: offsetIn(note, view),
      lineH: parseFloat(getComputedStyle(bubble).lineHeight) || 18,
      pad: parseFloat(getComputedStyle(bubble).paddingTop) || 10,
    };
    put(baseline, 'transform', `translate3d(${b.left}px, ${b.top + b.height - 2}px, 0)`);
    put(baseline, 'width', `${b.width}px`);
    colors = {
      night: rgbOf(section, '--night', '--chamber'),
      mist: rgbOf(section, '--mist', '--mist'),
      ultra: rgbOf(section, '--ultra', '--ultramarine'),
      lift: rgbOf(section, '--lift', '--lift'),
    };
    engine?.resize(W, H, dpr, L);
    noteChart.layout();
    svgKey = '';
    lastKey = '';
  }

  function progressNow() {
    if (frozen) return SETTLED[3];
    const r = section.getBoundingClientRect();
    const range = section.offsetHeight - view.offsetHeight;
    return range > 0 ? Math.min(1, Math.max(0, -r.top / range)) : 0;
  }

  // the scene's screen geometry for this frame
  function frameOf(S, vp) {
    const P = (x, y, z = 0.06) => project(vp, [x, y, z], L.W, L.H);
    const a = P(L.colX[agreeK[0]], L.yThr);
    const d = P(L.colX[agreeK[agreeK.length - 1]], L.yThr);
    const span = Math.hypot(d[0] - a[0], d[1] - a[1]);
    const ext = lintelExtent(S.lintel, span);
    const ux = (d[0] - a[0]) / (span || 1);
    const uy = (d[1] - a[1]) / (span || 1);
    let A = [a[0], a[1]];
    let B = [a[0] + ux * ext, a[1] + uy * ext];
    const hand = S.hand;
    if (hand > 0) {
      A = [lerp(A[0], geo.base.x0, hand), lerp(A[1], geo.base.y, hand)];
      B = [lerp(B[0], geo.base.x1, hand), lerp(B[1], geo.base.y, hand)];
    }
    const beam = S.lintel > 0 ? { a: A, b: B, half: lerp(1.5, 1, hand), int: 1 - S.handFade } : null;
    const s0 = P(L.colX[0], L.y0 + L.thr * L.yH, 0);
    const s1 = P(L.colX[3], L.y0 + L.yH, 0);
    const s3 = P(L.colX[3], L.y0 + L.thr * L.yH, 0);
    const midY = (s0[1] + s1[1]) / 2;
    const slab = S.slab > 0 ? { a: [s0[0] - 6, midY], b: [s3[0] + 6, midY], half: Math.abs(s0[1] - s1[1]) / 2, int: S.slab } : null;
    return { beam, slab, a, d, P };
  }

  function apply(force = false) {
    if (!L || destroyed) return;
    const t0 = performance.now();
    applyFrame(force);
    stats.frameMs = performance.now() - t0;
    stats.maxFrameMs = Math.max(stats.maxFrameMs ?? 0, stats.frameMs);
  }

  function applyFrame(force) {
    const p = progressNow();
    const S = sceneAt(p, { stepped: stepped() });
    S.dim = S.dim ?? 1;
    const cam = cameraAt(S, L, par);
    const vp = viewProj(cam, L.W / L.H);
    const key = `${S.p.toFixed(5)}|${time.toFixed(3)}|${par[0].toFixed(4)}|${par[1].toFixed(4)}`;
    if (key === lastKey && !force) return;
    lastKey = key;
    const F = frameOf(S, vp);
    const f = { vp, eye: cam.pos, S, L, ag, time, dim: S.dim, beam: F.beam, slab: F.slab };
    if (engine) {
      const t0 = performance.now();
      engine.draw(f);
      const dt = performance.now() - t0;
      stats.drawMs = dt;
      stats.maxDrawMs = Math.max(stats.maxDrawMs, dt);
      stats.frames++;
      if (!visible) stats.offscreen++;
    } else {
      const k = `${S.step}|${L.W}x${L.H}`;
      if (k !== svgKey) {
        svgKey = k;
        const next = svgFrame(subMotes, { ...f, time: 0 });
        if (svgEl) svgEl.replaceWith(next);
        else stage.prepend(next);
        svgEl = next;
        stats.frames++;
        if (!visible) stats.offscreen++;
      }
    }
    dom(S, F);
  }

  // Write a style only when it changes: fewer invalidations per scroll frame.
  const last = new WeakMap();
  function put(el, k, v) {
    let m = last.get(el);
    if (!m) last.set(el, (m = new Map()));
    if (m.get(k) === v) return;
    m.set(k, v);
    if (k.startsWith('--')) el.style.setProperty(k, v);
    else el.style[k] = v;
  }
  const tr = (x, y) => `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;

  function dom(S, F) {
    // the story beats (masked lines in and out, CSS)
    if (S.step !== lastStep) {
      beats.forEach((b, i) => {
        b.classList.toggle('is-on', i === S.step);
        b.classList.toggle('is-past', i < S.step);
      });
      stepBtns.forEach((b, i) => {
        b.classList.toggle('is-on', i === S.step);
        if (i === S.step) b.setAttribute('aria-current', 'step');
        else b.removeAttribute('aria-current');
      });
      section.dataset.step = String(S.step);
      lastStep = S.step;
    }
    put(section, '--cue', String(1 - seg(S.p, 0, 0.03)));
    put(issueLine, 'opacity', String(1 - seg(S.p, 0.13, 0.19)));
    put(section, '--dim', S.dim.toFixed(3));
    // family labels at the column bases, the rule band's label, the pick's label at the lintel's end
    const famOn = seg(S.p, 0.12, 0.2) * (1 - seg(S.p, 0.5, 0.54));
    famLabels.forEach((el, k) => {
      const b = F.P(L.colX[k], L.floorY, 0);
      put(el, 'transform', tr(b[0], b[1]));
    });
    put(fams, 'opacity', famOn.toFixed(3));
    const sl = L.W >= 1024 ? F.P(L.colX[0], L.y0 + ((1 + L.thr) / 2) * L.yH, 0) : F.P(L.colX[0], L.y0 + L.yH, 0);
    put(slabLabel, 'transform', tr(sl[0], sl[1]));
    put(slabLabel, 'opacity', (S.slab * (1 - S.brighten)).toFixed(3));
    const lintelOn = clamp01((S.lintel - 0.5) / 0.2) * (1 - clamp01(S.hand * 4));
    // the pick's label hangs under the lintel's end, inside the last agreeing bay (so it never runs off the
    // right edge on a phone)
    put(pickLabel, 'transform', tr(F.d[0], F.d[1]));
    put(pickLabel, 'opacity', lintelOn.toFixed(3));
    noVote.forEach((el, i) => {
      const k = missK[i];
      const v = pickRow[k];
      const at = F.P(L.colX[k], L.y0 + Math.max(0, v / 1000) * L.yH);
      // phones: the label stands left of its column (bay 1 has no room to the left of A), so it stays on
      // screen; if it would still share x with the pick's label, it drops 12 px under that one
      const left = L.W < 640 && k > 0;
      el.classList.toggle('is-left', left);
      const x0 = left ? at[0] - 12 - labelH.novoteW : at[0] + 12;
      const px1 = F.d[0] - 22;
      const clash = L.W < 640 && x0 < px1 && Math.max(x0 + labelH.novoteW, at[0] + 6) > px1 - labelH.pickW;
      const y = clash ? Math.max(at[1], F.d[1] + 14 + labelH.pick + 12 + labelH.novote / 2) : at[1];
      put(el, 'transform', tr(at[0], y));
      put(el, 'opacity', String(S.brighten >= 1 && S.hand <= 0 ? 1 : 0));
    });
    // the phone rises behind a mask, fully opaque; the baseline takes over from the canvas beam
    const ph = frozen ? 0 : S.phone;
    put(phoneWrap, 'clipPath', ph >= 1 ? 'none' : `inset(${((1 - ph) * 100).toFixed(2)}% 0 0 0)`);
    put(phoneWrap, 'visibility', ph > 0 && !S.note ? 'visible' : 'hidden');
    put(baseline, 'opacity', S.note ? '0' : S.handFade.toFixed(3));
    baseline.classList.toggle('is-landed', S.bubble); // the bubble stands on it, then it goes
    // the bubble grows up from the baseline, one line every 90 ms (time-based, reversible)
    if (S.bubble !== flags.bubble) {
      flags.bubble = S.bubble;
      growBubble(S.bubble);
    }
    if (S.note !== flags.note) {
      flags.note = S.note;
      flipNote(S.note);
    }
    noteChart.draw(S.path);
    if (S.result !== flags.result) {
      flags.result = S.result;
      note.classList.toggle('is-result', S.result);
    }
    if (canvas) put(canvas, 'opacity', '1');
  }

  function growBubble(on) {
    bubbleAnim?.cancel();
    const hgt = geo.bubble.height;
    const n = Math.max(1, Math.round((hgt - 2 * geo.pad) / geo.lineH));
    const cut = (i) => `inset(${Math.max(0, hgt - geo.pad - i * geo.lineH - (i === n ? geo.pad : 0)).toFixed(1)}px 0 0 0 round 16px 16px 16px 4px)`;
    phoneNode.classList.toggle('is-grown', on);
    if (!on) {
      bubble.style.clipPath = 'inset(100% 0 0 0)';
      return;
    }
    bubble.style.clipPath = 'none';
    if (reduced || stepped()) return;
    const frames = [{ clipPath: 'inset(100% 0 0 0 round 16px 16px 16px 4px)', offset: 0 }];
    for (let i = 1; i <= n; i++) frames.push({ clipPath: cut(i), offset: i / n });
    frames[frames.length - 1].clipPath = 'inset(0px 0 0 0 round 16px 16px 16px 4px)';
    bubbleAnim = bubble.animate(frames, { duration: n * 90 + 170, easing: 'linear' });
  }

  function flipNote(on) {
    noteAnim?.cancel();
    section.classList.toggle('is-note', on);
    if (reduced || stepped() || !geo) return;
    const n = geo.note;
    const s = geo.screen;
    const from = `translate3d(${(s.left - n.left).toFixed(1)}px, ${(s.top - n.top).toFixed(1)}px, 0) scale(${(s.width / n.width).toFixed(4)}, ${(s.height / n.height).toFixed(4)})`;
    const kf = [
      { transform: from, borderRadius: '34px' },
      { transform: 'none', borderRadius: '24px' },
    ];
    noteAnim = note.animate(on ? kf : kf.reverse(), { duration: on ? 700 : 420, easing: on ? 'cubic-bezier(.7,0,.2,1)' : 'cubic-bezier(.2,0,0,1)', fill: on ? 'none' : 'backwards' });
    if (!on) {
      note.classList.add('is-leaving');
      noteAnim.onfinish = () => note.classList.remove('is-leaving');
    }
  }

  function frame(t) {
    raf = 0;
    if (destroyed) return;
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
    lastT = t;
    const p = progressNow();
    const drifting = !!engine && !reduced && !frozen && visible && p < 0.3 && t - lastInput < 12000 && document.visibilityState !== 'hidden';
    if (drifting) time += dt;
    let moving = false;
    for (let i = 0; i < 2; i++) {
      const d = parT[i] - par[i];
      if (Math.abs(d) > 0.0005) {
        par[i] += d * 0.06;
        moving = true;
      } else par[i] = parT[i];
    }
    // zero frames off-screen: the observer's answer, checked against this frame's geometry (the observer
    // reports a frame late)
    const r = section.getBoundingClientRect();
    if (!visible || r.bottom <= 0 || r.top >= innerHeight) return;
    apply();
    if (drifting || moving) raf = requestAnimationFrame(frame);
    else lastT = 0;
  }

  function request() {
    if (!raf && !destroyed) raf = requestAnimationFrame(frame);
  }

  function makeEngine(kind) {
    canvas?.remove();
    canvas = h('canvas', { id: 'stage', class: 'asm__canvas', 'aria-hidden': 'true' });
    let e = null;
    if (kind === 'webgl' || kind === 'webgl1') {
      const model = { motes: buildMotes(parsed, allRows, seedKey) };
      try {
        e = createGLEngine(canvas, model, colors, {
          webgl1: kind === 'webgl1',
          onLost: () => {
            engine = null;
            startEngine('canvas');
          },
        });
      } catch (err) {
        console.warn('Quorum: WebGL unavailable', err);
      }
      if (!e) {
        canvas = h('canvas', { id: 'stage', class: 'asm__canvas', 'aria-hidden': 'true' });
      }
    }
    if (!e) e = createCanvasEngine(canvas, subMotes, colors);
    return e;
  }

  function startEngine(kind = engineKind) {
    if (destroyed || kind === 'svg' || frozen) return;
    measure();
    const e = makeEngine(kind);
    if (!e) return;
    engine = e;
    stage.append(canvas);
    section.dataset.engine = e.kind;
    stats.engine = e.kind;
    stats.api = e.api;
    stats.instanced = !!e.instanced;
    section.classList.add('has-engine');
    measure();
    request();
  }

  stepBtns.forEach((b, i) => {
    b.addEventListener('click', () => {
      const range = section.offsetHeight - view.offsetHeight;
      const top = window.scrollY + section.getBoundingClientRect().top + range * SETTLED[i];
      window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
    });
  });

  return {
    node: section,
    mount() {
      const onScroll = () => {
        lastInput = performance.now();
        request();
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      cleanups.push(() => window.removeEventListener('scroll', onScroll));
      if (!reduced && matchMedia('(pointer: fine)').matches) {
        const onMove = (e) => {
          lastInput = performance.now();
          parT[0] = (e.clientX / innerWidth) * 2 - 1;
          parT[1] = -((e.clientY / innerHeight) * 2 - 1);
          if (engine) request();
        };
        window.addEventListener('pointermove', onMove, { passive: true });
        cleanups.push(() => window.removeEventListener('pointermove', onMove));
      }
      let rt = 0;
      const onRs = () => {
        clearTimeout(rt);
        rt = setTimeout(() => {
          measure();
          request();
        }, 120);
      };
      window.addEventListener('resize', onRs);
      cleanups.push(() => window.removeEventListener('resize', onRs));
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((es) => {
          visible = es.some((e) => e.isIntersecting);
          stats.visible = visible;
          if (visible) request();
        });
        io.observe(section);
        cleanups.push(() => io.disconnect());
      }
      measure();
      apply(true);
      // the engine after first paint: two frames later, then idle time
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if ('requestIdleCallback' in window) requestIdleCallback(() => startEngine(), { timeout: 250 });
          else setTimeout(() => startEngine(), 30);
        }),
      );
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      cleanups.forEach((f) => f());
      bubbleAnim?.cancel();
      noteAnim?.cancel();
      engine?.destroy?.();
    },
    get engine() {
      return engine?.kind ?? 'svg';
    },
  };
}

// The 21-day excess path inside the note: day 0 at its left edge, day 21 at its right (7 days a bay), drawn
// by stroke-dashoffset with p. The zero line is the lintel, extended.
function buildNoteChart(path, final, fmt, C) {
  const n = path.length ? path[path.length - 1][0] : 21;
  const vals = path.map((d) => d[1]);
  const m = Math.max(0.02, ...vals.map((v) => Math.abs(v))) * 1.15;
  // Graphite, not gain/loss: the path crosses zero (it was negative on days 2–7); the sign and arrow go
  // with the result figure under it, and the zero line carries its own label.
  const line = svg('path', { class: 'asm__path', d: '' });
  const zero = svg('line', { class: 'asm__zero', x1: 0, x2: 0, y1: 0, y2: 0 });
  const plot = svg('svg', { class: 'asm__pathsvg', focusable: 'false', 'aria-hidden': 'true' }, zero, line);
  const el = h(
    'div',
    { class: 'asm__notechart' },
    plot,
    h('span', { class: 'asm__daylabel label', dataset: { d: '0' } }, `${C.day} 0`),
    h('span', { class: 'asm__daylabel label', dataset: { d: '7' } }, '7'),
    h('span', { class: 'asm__daylabel label', dataset: { d: '14' } }, '14'),
    h('span', { class: 'asm__daylabel label', dataset: { d: '21' } }, '21'),
    h('span', { class: ['asm__zerolabel label', final < 0 && 'is-above'] }, '0%'),
  );
  let len = 0;
  let w = 0;
  let lastT = -1;
  return {
    el,
    layout() {
      w = el.clientWidth;
      const hh = el.clientHeight;
      if (!w || !hh) return;
      plot.setAttribute('viewBox', `0 0 ${w} ${hh}`);
      const X = (d) => (d / Math.max(1, n)) * w;
      const Y = (v) => hh / 2 - (v / m) * (hh / 2 - 6);
      line.setAttribute('d', path.map(([d, v], i) => `${i ? 'L' : 'M'}${X(d).toFixed(1)} ${Y(v).toFixed(1)}`).join(''));
      zero.setAttribute('y1', String(hh / 2));
      zero.setAttribute('y2', String(hh / 2));
      len = line.getTotalLength?.() ?? 0;
      line.style.strokeDasharray = `${len} ${len}`;
      lastT = -1;
    },
    draw(t) {
      if (Math.abs(t - lastT) < 0.0005 || !len) return;
      lastT = t;
      line.style.strokeDashoffset = String(len * (1 - t));
      zero.setAttribute('x2', String((w * t).toFixed(1)));
    },
  };
}
