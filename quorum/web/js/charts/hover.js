// The hover layer for line charts: a crosshair and a readout that follow the pointer, and the same by
// keyboard (the plot is focusable; arrows, Home and End move the day). The readout is plain text in the
// figure, so it is readable at rest and never covers the data.
import { h } from '../dom.js';
import { nearestIndex } from './scale.js';

// plot: the positioned element over the SVG; xs: x positions in 0–1000 of each index; render(i) -> text
export function crosshair(plot, { xs, render, label, initial = xs.length - 1, readout }) {
  const line = h('span', { class: 'xh', 'aria-hidden': 'true' });
  plot.append(line);
  plot.tabIndex = 0;
  plot.setAttribute('role', 'group');
  if (label) plot.setAttribute('aria-label', label);
  let cur = -1;
  const set = (i, { announce = false } = {}) => {
    if (i < 0 || i >= xs.length) return;
    cur = i;
    line.style.setProperty('--x', `${xs[i] / 10}%`);
    const text = render(i);
    if (readout) {
      readout.textContent = text;
      if (announce) readout.setAttribute('aria-live', 'polite');
    }
  };
  const fromEvent = (e) => {
    const r = plot.getBoundingClientRect();
    if (!r.width) return;
    const x = ((e.clientX - r.left) / r.width) * 1000;
    set(nearestIndex(xs, x));
    plot.classList.add('is-hover');
  };
  plot.addEventListener('pointermove', fromEvent);
  plot.addEventListener('pointerdown', fromEvent);
  plot.addEventListener('pointerleave', () => {
    plot.classList.remove('is-hover');
    set(initial);
  });
  plot.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 5 : 1;
    let next = null;
    if (e.key === 'ArrowRight') next = cur + step;
    else if (e.key === 'ArrowLeft') next = cur - step;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = xs.length - 1;
    if (next === null) return;
    e.preventDefault();
    plot.classList.add('is-hover');
    set(Math.max(0, Math.min(xs.length - 1, next)), { announce: true });
  });
  plot.addEventListener('blur', () => {
    plot.classList.remove('is-hover');
    readout?.removeAttribute('aria-live');
  });
  set(initial);
  return { set };
}
