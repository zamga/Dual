// DOM helpers shared by the shell and every page module. No framework: h() builds elements,
// html`` builds fragments from trusted templates with escaped interpolations.
// CSP note: never write style="" attributes (blocked without 'unsafe-inline'); use el.style or classes.

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'text', 'tspan', 'defs', 'clipPath', 'title', 'desc', 'use', 'mask',
]);

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyProps(el, props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class' || k === 'className') {
      if (el instanceof SVGElement) el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
      else el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
    } else if (k === 'style' && typeof v === 'object') {
      for (const [p, val] of Object.entries(v)) if (val !== undefined && val !== null) el.style.setProperty(p, String(val));
    } else if (k === 'dataset') {
      for (const [dk, dv] of Object.entries(v)) if (dv !== undefined && dv !== null) el.dataset[dk] = dv;
    } else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'text') {
      el.textContent = v;
    } else if (k === 'html') {
      el.innerHTML = v;
    } else if (v === true) {
      el.setAttribute(k, '');
    } else {
      el.setAttribute(k, String(v));
    }
  }
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === undefined || c === null || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// h('p', {class: 'lede'}, 'text', child, [more])
export function h(tag, props, ...children) {
  if (props instanceof Node || typeof props === 'string' || Array.isArray(props)) {
    children.unshift(props);
    props = null;
  }
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  applyProps(el, props);
  return append(el, children);
}

export function svg(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  return append(el, children);
}

// Marks a string as trusted HTML for html``.
export function raw(str) {
  return { __raw: String(str) };
}

// html`<p>${text}</p>` -> DocumentFragment. Strings are escaped, Nodes are inserted, arrays flattened,
// raw() is trusted. Only for templates written in this codebase.
export function html(strings, ...values) {
  const nodes = [];
  let src = '';
  const put = (v) => {
    if (v === undefined || v === null || v === false || v === true) return '';
    if (Array.isArray(v)) return v.map(put).join('');
    if (v instanceof Node) {
      nodes.push(v);
      return `<template data-slot="${nodes.length - 1}"></template>`;
    }
    if (typeof v === 'object' && '__raw' in v) return v.__raw;
    return escapeHtml(v);
  };
  strings.forEach((s, i) => {
    src += s;
    if (i < values.length) src += put(values[i]);
  });
  const tpl = document.createElement('template');
  tpl.innerHTML = src;
  const frag = tpl.content;
  for (const slot of frag.querySelectorAll('template[data-slot]')) slot.replaceWith(nodes[Number(slot.dataset.slot)]);
  return frag;
}

export function qs(sel, root = document) {
  return root.querySelector(sel);
}

export function qsa(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

// ---- announcements, focus, clipboard -----------------------------------------------------------

let announceTimer = 0;
export function announce(message, { assertive = false } = {}) {
  const el = document.getElementById(assertive ? 'announcer-assertive' : 'announcer');
  if (!el) return;
  clearTimeout(announceTimer);
  el.textContent = '';
  // A tick later so repeated identical messages are still read.
  announceTimer = setTimeout(() => {
    el.textContent = message;
  }, 60);
}

export function focusEl(el) {
  if (!el) return;
  if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = h('textarea', { class: 'visually-hidden', 'aria-hidden': 'true', readonly: true });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

// ---- preferences -------------------------------------------------------------------------------

export function prefersReducedMotion() {
  return (
    document.documentElement.dataset.motion === 'reduce' ||
    (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}

export function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    /* private mode or blocked storage: the default applies */
  }
  return null;
}

// Replace a number's text with a 150 ms cross-fade (numbers never count up).
export function setNumber(el, text) {
  if (!el || el.textContent === text) return;
  if (prefersReducedMotion() || !el.animate) {
    el.textContent = text;
    return;
  }
  const out = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 75, easing: 'linear' });
  out.onfinish = () => {
    el.textContent = text;
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 75, easing: 'linear' });
  };
}

export function onVisible(el, cb, options = { rootMargin: '200px' }) {
  if (!('IntersectionObserver' in window)) {
    cb(true);
    return () => {};
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) cb(e.isIntersecting, e);
  }, options);
  io.observe(el);
  return () => io.disconnect();
}
