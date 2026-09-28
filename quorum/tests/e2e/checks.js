// In-page checks, passed to page.evaluate(). Each returns a list of problems (strings).

// Horizontal overflow, measured with the body's overflow clip lifted so hidden overflow counts too.
export function overflow() {
  const body = document.body;
  const prev = body.style.overflowX;
  body.style.overflowX = 'visible';
  const W = document.documentElement.clientWidth;
  const sw = document.documentElement.scrollWidth;
  const out = [];
  if (sw > W + 1) {
    const culprits = [];
    for (const el of document.querySelectorAll('#view *, .site-header *, .site-footer *, .demo-bar *')) {
      if (el.closest('.visually-hidden, .lv__stage')) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.right > W + 1) culprits.push(`${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).trim().split(/\s+/).join('.')}`);
      if (culprits.length >= 3) break;
    }
    out.push(`horizontal overflow ${sw - W}px (${culprits.join(', ')})`);
  }
  body.style.overflowX = prev;
  return out;
}

// Axe-like basics: names for images, buttons and links; one h1 per view; unique ids; lang.
export function basics() {
  const out = [];
  const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim() ||
    (el.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join('').trim();
  for (const img of document.querySelectorAll('img')) if (!img.hasAttribute('alt')) out.push(`img without alt: ${img.src}`);
  for (const b of document.querySelectorAll('button, [role="button"]')) if (!name(b) && b.offsetParent !== null) out.push(`button without a name: ${b.outerHTML.slice(0, 80)}`);
  for (const a of document.querySelectorAll('a[href]')) if (!name(a) && a.offsetParent !== null) out.push(`link without a name: ${a.outerHTML.slice(0, 80)}`);
  for (const s of document.querySelectorAll('select, input:not([type=hidden])')) if (!name(s) && !s.labels?.length) out.push(`form control without a label: ${s.outerHTML.slice(0, 80)}`);
  const h1 = document.querySelectorAll('#view h1');
  if (h1.length !== 1) out.push(`expected one h1 in #view, found ${h1.length}`);
  const ids = new Map();
  for (const el of document.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) out.push(`duplicate id #${id} (${n})`);
  if (!['en', 'sl'].includes(document.documentElement.lang)) out.push(`html lang is "${document.documentElement.lang}"`);
  for (const el of document.querySelectorAll('[aria-hidden="true"] a[href], [aria-hidden="true"] button')) {
    if (el.offsetParent !== null && el.tabIndex >= 0) out.push(`focusable element inside aria-hidden: ${el.outerHTML.slice(0, 60)}`);
  }
  return out;
}

// Contrast of every visible text run in the view, header, footer and demo bar (WCAG AA).
export function contrast() {
  const parse = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a >= 0.99) return c;
    }
    return parse(getComputedStyle(document.documentElement).backgroundColor) ?? { r: 227, g: 230, b: 228, a: 1 };
  };
  const hidden = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return true;
      if (e.getAttribute?.('aria-hidden') === 'true' || e.classList?.contains('visually-hidden')) return true;
    }
    return false;
  };
  const out = [];
  const seen = new Set();
  for (const root of document.querySelectorAll('#view, #site-header, #site-footer, #demo-bar')) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const el = w.currentNode.parentElement;
      if (!w.currentNode.textContent.trim() || seen.has(el)) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || hidden(el)) continue;
      const cs = getComputedStyle(el);
      const bg = bgOf(el);
      const fg = over(parse(cs.color), bg);
      const [a, b] = [L(fg), L(bg)].sort((x, y) => y - x);
      const ratio = (a + 0.05) / (b + 0.05);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (Number(cs.fontWeight) >= 700 && size >= 18.66);
      if (ratio < (large ? 3 : 4.5)) out.push(`contrast ${ratio.toFixed(2)} for "${w.currentNode.textContent.trim().slice(0, 40)}" (${cs.color} on rgb(${bg.r},${bg.g},${bg.b}))`);
    }
  }
  return out;
}
