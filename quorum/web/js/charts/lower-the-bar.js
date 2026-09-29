// "Lower the bar" (docs/DESIGN-V2.md §4.8): the product explains its silence by letting you break it.
// A 2D-canvas mini colonnade of the latest hero issue (every scored stock as four dots, one per family, at
// its percentile), and a draggable bar (role="slider", 50–99, default the real rule from meta.rule.topPct).
// Dots above the bar are lit, dots below fall grey. The readout counts, live from hero.json, how many
// stocks stand on at least three columns at the real rule and at the bar (before vetoes, and labelled so).
// Only at the real rule does the pick turn ultramarine; every other value is labelled "Hypothetical
// threshold". Mount: `const ltb = lowerTheBar(hero, { meta, locale, fmt }); parent.append(ltb.el);`
// then `ltb.mount()` after it is in the document, `ltb.destroy()` on cleanup. It spans r1→r4 (.c-wide
// .flush): the columns stand on the four rules.
//
// SL: first draft, needs native review.
import { h } from '../dom.js';
import { ruleText, topPctOf } from '../rule.js';

export const BAR_MIN = 50;
export const BAR_MAX = 99;

// Pure: stocks with at least minAgree family percentiles at or above the bar (bar in whole percentiles).
// hero.p is flat permille [A0,B0,C0,D0, A1,…], -1 unscored.
export function barCount(p, bar, minAgree = 3) {
  const thr = bar * 10;
  let n = 0;
  for (let i = 0; i + 3 < p.length; i += 4) {
    let c = 0;
    for (let f = 0; f < 4; f++) if (p[i + f] >= thr) c++;
    if (c >= minAgree) n++;
  }
  return n;
}

// The next bar value for a key (arrows ±1, PageUp/PageDown ±10, Home/End the ends), or null.
export function barKey(bar, key) {
  const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[key];
  if (step) return Math.min(BAR_MAX, Math.max(BAR_MIN, bar + step));
  if (key === 'Home') return BAR_MIN;
  if (key === 'End') return BAR_MAX;
  return null;
}

// Everything the readout says at a bar (pure, tested).
export function barModel(hero, bar, meta) {
  const topPct = topPctOf(meta);
  const rule = topPct ? Math.round(topPct * 100) : null;
  const minAgree = meta?.rule?.minAgree ?? 3;
  return {
    bar,
    rule,
    minAgree,
    isRule: rule !== null && bar === rule,
    count: barCount(hero.p, bar, minAgree),
    ruleCount: rule !== null ? barCount(hero.p, rule, minAgree) : null,
  };
}

const COPY = {
  en: {
    label: 'Lower the bar',
    kicker: (no) => `Try it · issue #${no} · before vetoes`,
    at: (x) => `At the ${x.rulePctile}, the rule: ${x.ruleCount} ${x.ruleCount === 1 ? 'stock' : 'stocks'} on ${x.cols}.`,
    atBar: (x) => `At the ${x.pctile}: ${x.count}.`,
    cols: (n) => (n === 4 ? 'four columns' : n === 3 ? 'three columns' : `${n} columns`),
    rule: 'The real rule',
    hypo: 'Hypothetical threshold',
    slider: 'The bar: the percentile a family must rank a stock at',
    value: (x) => `${x.pctile}${x.isRule ? ', the rule' : ', hypothetical'}: ${x.count} ${x.count === 1 ? 'stock' : 'stocks'} on ${x.cols}`,
    how: 'Drag the bar or use the arrow keys.',
  },
  sl: {
    label: 'Znižajte prag',
    kicker: (no) => `Poskusite · izdaja #${no} · pred veti`,
    at: (x) => `Pri pragu ${x.rulePctile}, pravilo: ${x.ruleCount} delnic na ${x.cols}.`,
    atBar: (x) => `Pri pragu ${x.pctile}: ${x.count}.`,
    cols: (n) => (n === 4 ? 'štirih stebrih' : n === 3 ? 'treh stebrih' : `${n} stebrih`),
    rule: 'Pravo pravilo',
    hypo: 'Hipotetični prag',
    slider: 'Prag: percentil, na katerega mora družina uvrstiti delnico',
    value: (x) => `${x.pctile}${x.isRule ? ', pravilo' : ', hipotetično'}: ${x.count} delnic na ${x.cols}`,
    how: 'Povlecite prag ali uporabite puščice.',
  },
};

function rgbOf(el, name) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || 'currentColor';
}

export function lowerTheBar(hero, { meta = null, locale = 'en', fmt } = {}) {
  const C = COPY[locale] ?? COPY.en;
  const n = Math.floor(hero.p.length / 4);
  const pickIdx = hero.pick?.index ?? -1;
  const agreeing = new Set(hero.pick?.agreeing ?? []);
  const int = (x) => (fmt ? fmt.int(x) : String(x));
  const start = barModel(hero, BAR_MIN, meta).rule ?? 91;
  let bar = Math.min(BAR_MAX, Math.max(BAR_MIN, start));

  // deterministic jitter per dot (golden-ratio sequence: no Math.random, same picture every time)
  const jit = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) jit[i] = ((i * 0.6180339887) % 1) - 0.5;

  const canvas = h('canvas', { class: 'ltb__canvas', 'aria-hidden': 'true' });
  const thumb = h('span', { class: 'ltb__thumb mono', 'aria-hidden': 'true' });
  const slider = h('div', { class: 'ltb__bar', role: 'slider', tabindex: '0', 'aria-label': C.slider, 'aria-orientation': 'vertical', 'aria-valuemin': String(BAR_MIN), 'aria-valuemax': String(BAR_MAX) }, h('span', { class: 'ltb__line', 'aria-hidden': 'true' }), thumb);
  const lintel = h('span', { class: 'ltb__lintel', 'aria-hidden': 'true' });
  const plot = h('div', { class: 'ltb__plot' }, canvas, lintel, slider);
  const tag = h('span', { class: 'tag ltb__tag' });
  const readout = h('p', { class: 'ltb__readout', 'aria-live': 'polite' });
  const el = h(
    'figure',
    { class: 'ltb c-wide flush', 'aria-label': C.label },
    h('p', { class: 'label ltb__kicker' }, C.kicker(hero.issueNo)),
    plot,
    h('figcaption', { class: 'ltb__cap' }, tag, readout, h('span', { class: 'small muted ltb__how' }, C.how)),
  );

  let W = 0;
  let H = 0;
  let PAD = 0;
  let INSET = 0;
  let dpr = 1;
  let raf = 0;
  const cleanups = [];
  // the plot shows percentiles 30..100 (the bar moves in 50..99); ranks below 30 lie on the floor
  const LO = 30;
  const yOf = (pct) => (pct >= LO ? H - 3 - ((pct - LO) / (100 - LO)) * (H - 6) : H - 3);

  function text(m) {
    const R = ruleText(m.bar / 100, locale);
    const RR = m.rule !== null ? ruleText(m.rule / 100, locale) : null;
    const x = { pctile: R.pctile, count: int(m.count), ruleCount: m.ruleCount ?? 0, rulePctile: RR?.pctile ?? '', cols: C.cols(m.minAgree), isRule: m.isRule };
    return { x, line: `${RR ? C.at({ ...x, ruleCount: int(m.ruleCount) }) : ''} ${m.isRule ? '' : C.atBar(x)}`.trim() };
  }

  function draw() {
    raf = 0;
    if (!W) return;
    const m = barModel(hero, bar, meta);
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W + 2 * PAD, H);
    g.translate(PAD, 0);
    const fg = rgbOf(el, '--fg');
    const fg2 = rgbOf(el, '--fg-2');
    const quorum = rgbOf(el, '--quorum');
    const thr = bar * 10;
    // each column is centred on its rule (r1…r4 are the plot's edges and thirds); the dots of A and D
    // spill past the plot into the canvas's side pads
    // on a phone the page margin is too narrow for a spill: the columns step in by INSET so no dot
    // reaches the screen's edge (the spread then stays inside r1→r4)
    const spread = INSET ? INSET : Math.min(PAD, (W / 3) * 0.16);
    const xs = [0, 1, 2, 3].map((k) => INSET + (k * (W - 2 * INSET)) / 3);
    // below the bar: grey; above: lit
    for (const pass of [0, 1]) {
      g.fillStyle = pass ? fg : fg2;
      g.globalAlpha = pass ? 0.82 : 0.22;
      for (let i = 0; i < n; i++) {
        if (i === pickIdx) continue;
        for (let f = 0; f < 4; f++) {
          const v = hero.p[i * 4 + f];
          if (v < 0) continue;
          if ((v >= thr) !== !!pass) continue;
          const j = jit[i * 4 + f];
          g.fillRect(xs[f] + j * 2 * spread - 1, yOf(v / 10) - 1 - (v < LO * 10 ? ((j * 7.31) % 1 + 1) % 1 * 5 : 0), 2, 2);
        }
      }
    }
    // the pick: ultramarine only at the real rule
    g.globalAlpha = 1;
    for (let f = 0; f < 4; f++) {
      const v = hero.p[pickIdx * 4 + f];
      if (v < 0) continue;
      const lit = m.isRule && agreeing.has('ABCD'[f]);
      g.fillStyle = lit ? quorum : v >= thr ? fg : fg2;
      g.beginPath();
      g.arc(xs[f], yOf(v / 10), lit ? 4 : 3, 0, Math.PI * 2);
      g.fill();
    }
    const ks = [...agreeing].map((f) => 'ABCD'.indexOf(f)).filter((k) => k >= 0);
    lintel.hidden = !(m.isRule && ks.length);
    if (!lintel.hidden) {
      lintel.style.left = `${xs[Math.min(...ks)]}px`;
      lintel.style.width = `${xs[Math.max(...ks)] - xs[Math.min(...ks)]}px`;
      lintel.style.top = `${yOf(bar)}px`;
    }
    slider.style.transform = `translate3d(0, ${yOf(bar).toFixed(1)}px, 0)`;
    thumb.textContent = String(bar);
    const t = text(m);
    slider.setAttribute('aria-valuenow', String(bar));
    slider.setAttribute('aria-valuetext', C.value(t.x));
    tag.textContent = m.isRule ? C.rule : C.hypo;
    el.classList.toggle('is-hypothetical', !m.isRule);
    if (readout.textContent !== t.line) {
      readout.classList.remove('is-in');
      void readout.offsetWidth;
      readout.textContent = t.line;
      readout.classList.add('is-in');
    }
  }

  function set(v) {
    const next = Math.min(BAR_MAX, Math.max(BAR_MIN, Math.round(v)));
    if (next === bar) return;
    bar = next;
    if (!raf) raf = requestAnimationFrame(draw);
  }

  function layout() {
    W = plot.clientWidth;
    H = plot.clientHeight;
    // the side pads: as wide as a column's spill, never past the page margin (16 px on phones)
    const left = plot.getBoundingClientRect().left;
    INSET = left < 30 ? Math.min(16, (W / 3) * 0.16) : 0;
    PAD = INSET ? 0 : Math.max(4, Math.min(26, (W / 3) * 0.16, left - 3));
    canvas.style.left = `${-PAD}px`;
    plot.style.setProperty('--ltb-pad', `${PAD}px`);
    canvas.style.width = `${W + 2 * PAD}px`;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round((W + 2 * PAD) * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    draw();
  }

  slider.addEventListener('keydown', (e) => {
    const v = barKey(bar, e.key);
    if (v === null) return;
    e.preventDefault();
    set(v);
  });
  let dragging = false;
  const fromY = (clientY) => {
    const r = plot.getBoundingClientRect();
    return LO + (1 - (clientY - r.top) / r.height) * (100 - LO);
  };
  plot.addEventListener('pointerdown', (e) => {
    dragging = true;
    plot.setPointerCapture?.(e.pointerId);
    slider.focus({ preventScroll: true });
    set(fromY(e.clientY));
  });
  plot.addEventListener('pointermove', (e) => dragging && set(fromY(e.clientY)));
  const stop = () => (dragging = false);
  plot.addEventListener('pointerup', stop);
  plot.addEventListener('pointercancel', stop);

  return {
    el,
    get value() {
      return bar;
    },
    set,
    mount() {
      layout();
      if ('ResizeObserver' in window) {
        const ro = new ResizeObserver(() => layout());
        ro.observe(plot);
        cleanups.push(() => ro.disconnect());
      }
    },
    destroy() {
      cancelAnimationFrame(raf);
      cleanups.forEach((f) => f());
    },
  };
}
