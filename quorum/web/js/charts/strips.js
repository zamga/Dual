// The universe as four strips on the rules (DESIGN-V2 §5, #app-research): every scored stock is a dot on
// each family's rule, at its percentile (100 at the top), jittered sideways by a fixed hash so the
// picture never changes between renders. The top decile is a faint band; dots at or above the rule
// threshold are full Mist, the rest dimmer. 2D canvas (thousands of marks), with a text alternative.
// No quorum colour here: this is descriptive data, and a stock is only a quorum once it passes the vetoes.
import { h } from '../dom.js';

// rows: [[pA, pB, pC, pD] ...] with percentiles in 0..1 (null for a missing score)
export function strips(rows, { topPct = 0.91, label = '', caption = '', decile = 'Top decile', threshold = '' } = {}) {
  const canvas = h('canvas', { class: 'strips__canvas', 'aria-hidden': 'true' });
  const counts = [0, 1, 2, 3].map((f) => rows.filter((r) => Number.isFinite(r[f]) && r[f] >= topPct).length);
  const el = h(
    'figure',
    { class: 'strips-fig c-full flush' },
    h('div', { class: 'strips', role: 'img', 'aria-label': label }, canvas, h('span', { class: 'strips__k strips__k--dec label', 'aria-hidden': 'true' }, decile), threshold ? h('span', { class: 'strips__k strips__k--th label', 'aria-hidden': 'true' }, threshold) : null),
    caption ? h('figcaption', { class: 'figcaption strips__cap' }, caption) : null,
  );
  const jit = new Float32Array(rows.length * 4);
  for (let i = 0; i < jit.length; i++) {
    // a small integer hash -> -1..1, stable across renders
    let x = (i + 1) * 2654435761;
    x ^= x >>> 15;
    x = Math.imul(x, 2246822519);
    x ^= x >>> 13;
    jit[i] = ((x >>> 0) / 4294967295) * 2 - 1;
  }
  let raf = 0;
  function draw() {
    raf = 0;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, box.width, box.height);
    const cs = getComputedStyle(el);
    const fg = cs.getPropertyValue('--mist').trim() || cs.color;
    let xs = [...document.querySelectorAll('.rules > i')].map((r) => r.getBoundingClientRect().left - box.left);
    let bay = xs.length > 1 ? xs[1] - xs[0] : box.width / 4;
    // on a phone the outer rules sit at the screen edge: stand the strips in four equal lanes instead
    if (xs.length < 4 || xs[0] < 40) {
      bay = box.width / 4;
      xs = [0, 1, 2, 3].map((f) => (f + 0.5) * bay);
    }
    const half = Math.max(8, Math.min(64, bay * 0.3));
    const pad = 10;
    const H = box.height - pad * 2;
    const Y = (p) => pad + (1 - p) * H;
    // the top decile: a faint band across the strips
    g.globalAlpha = 0.06;
    g.fillStyle = fg;
    g.fillRect(0, Y(1), box.width, Y(0.9) - Y(1));
    // the rule threshold: a dashed hairline
    g.globalAlpha = 0.35;
    g.strokeStyle = fg;
    g.setLineDash([4, 3]);
    g.beginPath();
    g.moveTo(0, Math.round(Y(topPct)) + 0.5);
    g.lineTo(box.width, Math.round(Y(topPct)) + 0.5);
    g.stroke();
    g.setLineDash([]);
    const s = box.width < 640 ? 1.5 : 2;
    for (let f = 0; f < 4; f++) {
      const cx = xs[f] ?? ((f + 0.5) * box.width) / 4;
      for (let pass = 0; pass < 2; pass++) {
        g.globalAlpha = pass ? 0.95 : 0.32;
        for (let i = 0; i < rows.length; i++) {
          const p = rows[i][f];
          if (!Number.isFinite(p) || p >= topPct !== !!pass) continue;
          g.fillRect(cx + jit[i * 4 + f] * half - s / 2, Y(p) - s / 2, s, s);
        }
      }
    }
    g.globalAlpha = 1;
    el.style.setProperty('--dec', `${Y(0.9)}px`);
    el.style.setProperty('--th', `${Y(topPct)}px`);
  }
  const request = () => {
    if (!raf) raf = requestAnimationFrame(draw);
  };
  let ro = null;
  return {
    el,
    counts,
    mount() {
      request();
      if ('ResizeObserver' in window) {
        ro = new ResizeObserver(request);
        ro.observe(canvas);
      }
    },
    destroy() {
      ro?.disconnect();
      cancelAnimationFrame(raf);
    },
  };
}
