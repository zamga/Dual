// The Assembly without WebGL: the same frame, projected on the CPU from the same numbers (level-data.js).
// svgFrame: the first paint (the LCP stage), ?gl=0 and reduced motion, one static frame per state, drawn
// from a 300-stock subsample. canvasEngine: weak GPUs and software renderers, the same subsample live.
import { svg } from '../dom.js';
import { MOTE, motePos, project, pxPerUnit } from './level-data.js';

// Everything a flat frame draws, in stage CSS px.
export function flatFrame(motes, f) {
  const { vp, L, S, ag, time } = f;
  const { W, H } = L;
  const cols = L.colX.map((x) => {
    const a = project(vp, [x - 0.025, L.floorY, 0.025], W, H);
    const b = project(vp, [x + 0.025, L.floorY, 0.025], W, H);
    const t = project(vp, [x, 6, 0.025], W, H);
    return [a[0], Math.min(a[1], t[1]), b[0], Math.max(a[1], t[1])];
  });
  const dots = [];
  for (let o = 0; o < motes.length; o += MOTE) {
    const [x, y, z, a, size] = motePos(motes, o, S, L, ag, time);
    const q = project(vp, [x, y, z], W, H);
    if (q[2] <= 0.1) continue;
    const r = Math.max(0.8, size * pxPerUnit(q[2], H));
    dots.push([q[0], q[1], r, a * S.dim, motes[o + 12] > 0.5]);
  }
  return { cols, dots };
}

// Three-tone fluting across a column's width, lit from the key light's side (upper left): [from, to, alpha, k]
const FLUTES = [
  [0, 0.34, 0.34, 0],
  [0.34, 0.7, 0.22, 1],
  [0.7, 1, 0.12, 2],
];

const bucketOf = (a) => (a < 0.26 ? 0 : a < 0.5 ? 1 : a < 0.8 ? 2 : 3);

export function svgFrame(motes, f) {
  const { L } = f;
  const { cols, dots } = flatFrame(motes, f);
  const paths = ['', '', '', ''];
  const picks = [];
  for (const [x, y, , a, pick] of dots) {
    if (pick && a > 0.8) picks.push([x, y, a]);
    else paths[bucketOf(a)] += `M${x.toFixed(1)} ${y.toFixed(1)}h0`;
  }
  const kids = [
    ...cols.flatMap(([x0, y0, x1, y1]) =>
      FLUTES.map(([f0, f1, , k]) => {
        const w = Math.max(1, x1 - x0);
        return svg('rect', { class: `asm__svcol asm__svcol--${k}`, x: (x0 + f0 * w).toFixed(1), y: y0.toFixed(1), width: Math.max(0.5, (f1 - f0) * w).toFixed(1), height: (y1 - y0).toFixed(1) });
      }),
    ),
  ];
  if (f.slab && f.slab.int > 0.01) kids.push(svg('rect', { class: 'asm__svslab', x: f.slab.a[0].toFixed(1), y: (f.slab.a[1] - f.slab.half).toFixed(1), width: (f.slab.b[0] - f.slab.a[0]).toFixed(1), height: (2 * f.slab.half).toFixed(1) }));
  paths.forEach((d, i) => d && kids.push(svg('path', { class: `asm__svdot asm__svdot--${i}`, d })));
  for (const [x, y, a] of picks) kids.push(svg('circle', { class: `asm__svdot--pick${a > 0.8 ? ' is-bright' : ''}`, cx: x.toFixed(1), cy: y.toFixed(1), r: a > 0.8 ? 3.2 : 2 }));
  if (f.beam && f.beam.int > 0.01) {
    const { a, b } = f.beam;
    kids.push(svg('line', { class: 'asm__svlintel', x1: a[0].toFixed(1), y1: a[1].toFixed(1), x2: b[0].toFixed(1), y2: b[1].toFixed(1) }));
  }
  return svg('svg', { class: 'asm__svg', viewBox: `0 0 ${Math.round(L.W)} ${Math.round(L.H)}`, width: Math.round(L.W), height: Math.round(L.H), 'aria-hidden': 'true', focusable: 'false' }, kids);
}

// The 2D canvas engine (same interface as the WebGL engine).
export function createCanvasEngine(canvas, motes, colors) {
  const g = canvas.getContext('2d', { alpha: false });
  if (!g) return null;
  const css = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
  let W = 0;
  let H = 0;
  let dpr = 1;
  return {
    kind: 'canvas',
    api: '2d',
    el: canvas,
    resize(w, h, d) {
      W = w;
      H = h;
      dpr = d;
      canvas.width = Math.max(1, Math.round(w * d));
      canvas.height = Math.max(1, Math.round(h * d));
    },
    draw(f) {
      if (!W) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = css(colors.night);
      g.fillRect(0, 0, W, H);
      const { cols, dots } = flatFrame(motes, f);
      // the columns: fluted stone (three tones and a lit edge), standing in the sediment on a low plinth;
      // the last 28 px step down in alpha so the shaft sinks into the floor instead of ending hard
      const SINK = 28;
      for (const [x0, y0, x1, y1] of cols) {
        const w = Math.max(1, x1 - x0);
        for (const [f0, f1, al] of FLUTES) {
          g.fillStyle = css(colors.mist, al * f.dim);
          g.fillRect(x0 + f0 * w, y0, (f1 - f0) * w, y1 - y0 - SINK);
          for (let i = 0; i < 7; i++) {
            g.fillStyle = css(colors.mist, al * f.dim * (1 - (i + 1) / 8));
            g.fillRect(x0 + f0 * w, y1 - SINK + i * 4, (f1 - f0) * w, 4);
          }
        }
        g.fillStyle = css(colors.mist, 0.5 * f.dim);
        g.fillRect(x0, y0, 1, y1 - y0 - SINK);
        g.fillStyle = css(colors.mist, 0.1 * f.dim);
        g.fillRect(x0 - w * 0.35, y1 - 6, w * 1.7, 6);
      }
      if (f.slab && f.slab.int > 0.01) {
        g.fillStyle = css(colors.mist, 0.06 * f.slab.int * f.dim);
        g.fillRect(f.slab.a[0], f.slab.a[1] - f.slab.half, f.slab.b[0] - f.slab.a[0], 2 * f.slab.half);
      }
      g.globalCompositeOperation = 'lighter';
      // grains: round, 1.5 to 2.5 px by depth (nearer is larger); the pick's lit motes a little larger
      for (const [x, y, r, a, pick] of dots) {
        g.fillStyle = css(colors.mist, Math.min(1, a));
        const d = pick && a > 0.8 ? Math.min(5, r * 1.6) : Math.min(2.5, Math.max(1.5, r * 0.95));
        g.beginPath();
        g.arc(x, y, d / 2, 0, 6.2832);
        g.fill();
      }
      if (f.beam && f.beam.int > 0.01) {
        // the lintel's light without blur: three widening strokes at falling alpha, then the core
        const { a, b, half } = f.beam;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        for (const [w, al] of [[22, 0.08], [12, 0.14], [6, 0.3]]) {
          g.strokeStyle = css(colors.ultra, al * f.beam.int);
          g.lineWidth = w;
          g.stroke();
        }
        g.strokeStyle = css(colors.ultra, f.beam.int);
        g.lineWidth = 2 * half;
        g.stroke();
        g.strokeStyle = css(colors.lift, 0.5 * f.beam.int);
        g.lineWidth = 1;
        g.stroke();
      }
    },
    destroy() {},
  };
}
