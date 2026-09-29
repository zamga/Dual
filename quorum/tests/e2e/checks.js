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

// A column rule must never strike through a number. For every digit-bearing text run in a table cell,
// definition value or headline stat, find a rule x inside its box; the rule is visible there unless the
// nearest opaque ancestor inside the view hides it (a `.ruled` surface redraws the rules above its own
// background, so it does not count). DESIGN.md §4: tables either end their columns on the rules or have
// opaque cells.
export function ruleStrike() {
  const xs = [...document.querySelectorAll('.rules > i')].map((r) => r.getBoundingClientRect().left).filter((x) => x > 0.5);
  if (!xs.length) return [];
  const view = document.querySelector('#view');
  const opaque = (el) => {
    const c = String(getComputedStyle(el).backgroundColor);
    const f = c.match(/^color\([a-z0-9-]+\s+[^/)]+(?:\/\s*([\d.]+))?\)/); // color-mix() computes to color(srgb r g b / a)
    if (f) return f[1] === undefined || Number(f[1]) >= 0.99;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return p.length < 4 || p[3] >= 0.99;
  };
  const coveredAt = (el) => {
    for (let e = el; e && e !== view; e = e.parentElement) if (opaque(e)) return !e.classList.contains('ruled');
    return false;
  };
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('#view :is(td, th, dd, .stat__v)')) {
    if (!/\d/.test(el.textContent) || el.closest('.visually-hidden, [aria-hidden="true"], .lv')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const node = w.currentNode;
      // numbers, not prose: a short run with a digit (prose that crosses a rule is §4's business, not this check's)
      if (!/\d/.test(node.textContent) || node.textContent.trim().length > 28) continue;
      const host = node.parentElement;
      if (seen.has(host) || host.closest('.visually-hidden, [aria-hidden="true"]')) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (r.width < 2 || r.height < 2) continue;
        const x = xs.find((v) => v > r.left + 1.5 && v < r.right - 1.5);
        if (x === undefined || coveredAt(host)) continue;
        seen.add(host);
        out.push(`rule at x=${Math.round(x)} strikes "${node.textContent.trim().slice(0, 30)}" (${host.tagName.toLowerCase()}.${String(host.className).split(/\s+/)[0]})`);
        break;
      }
      if (out.length >= 8) return out;
    }
  }
  return out;
}

// Running text must never be struck by a rule (DESIGN.md §4): the colonnade passes behind ledes, prose,
// notes, captions, labels and definition text, and stays visible only in open space. For every line of
// text in the view (headlines, tables, charts and the hero excepted: those have their own rules), find a
// rule x inside the line's glyph box; the rule is visible there unless an ancestor inside the view paints
// an opaque background over that point (its background-clip counts: a content-box ground leaves the
// inset clear, so rules 1 and 4 beside the text stay). A `.ruled` surface redraws the rules above its own
// background, so reaching one first means the rule shows.
export function proseStrike() {
  const xs = [...document.querySelectorAll('.rules > i')].map((r) => r.getBoundingClientRect().left).filter((x) => x > 0.5);
  if (!xs.length) return [];
  const view = document.querySelector('#view');
  const opaque = (c) => {
    c = String(c);
    const f = c.match(/^color\([a-z0-9-]+\s+[^/)]+(?:\/\s*([\d.]+))?\)/);
    if (f) return f[1] === undefined || Number(f[1]) >= 0.99;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return p.length < 4 || p[3] >= 0.99;
  };
  const ground = (e) => {
    const cs = getComputedStyle(e);
    if (!opaque(cs.backgroundColor)) return null;
    const r = e.getBoundingClientRect();
    const px = (k) => parseFloat(cs[k]) || 0;
    const clip = cs.backgroundClip;
    const b = { l: px('borderLeftWidth'), r: px('borderRightWidth'), t: px('borderTopWidth'), bo: px('borderBottomWidth') };
    const p = clip === 'content-box' ? { l: px('paddingLeft'), r: px('paddingRight'), t: px('paddingTop'), bo: px('paddingBottom') } : { l: 0, r: 0, t: 0, bo: 0 };
    const k = clip === 'border-box' ? 0 : 1;
    return { left: r.left + k * b.l + p.l, right: r.right - k * b.r - p.r, top: r.top + k * b.t + p.t, bottom: r.bottom - k * b.bo - p.bo };
  };
  const covered = (el, x, y) => {
    for (let e = el; e && e !== view; e = e.parentElement) {
      if (e.classList.contains('ruled')) return false;
      const g = ground(e);
      if (g && x >= g.left && x <= g.right && y >= g.top && y <= g.bottom) return true;
    }
    return false;
  };
  const SKIP = '.visually-hidden, [aria-hidden="true"], .lv, svg, .display, .content-sec > h2, table, .rules, [hidden]';
  const out = [];
  const seen = new Set();
  const w = document.createTreeWalker(view, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const node = w.currentNode;
    const text = node.textContent.trim();
    if (text.length < 2) continue;
    const host = node.parentElement;
    if (!host || seen.has(host) || host.closest(SKIP)) continue;
    const cs = getComputedStyle(host);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (r.width < 2 || r.height < 2 || r.bottom < 0) continue;
      const x = xs.find((v) => v > r.left + 1.5 && v < r.right - 1.5);
      if (x === undefined || covered(host, x, r.top + r.height / 2)) continue;
      seen.add(host);
      out.push(`rule at x=${Math.round(x)} strikes text "${text.slice(0, 40)}" (${host.tagName.toLowerCase()}.${String(host.className).split(/\s+/)[0]})`);
      break;
    }
    if (out.length >= 12) break;
  }
  return out;
}

// Copy that must hold on every page, in every launch state (web/js/launch.js):
// - The demo bar carries the whole disclaimer at every width (ARCHITECTURE.md §5), advice line included.
// - Nothing may say a text was delivered: there are no subscribers. launch.status "ready" only means the
//   engine launch gate passes; launch also needs the brief's legal, data and SMS-carrier gates (§8).
// - The pooled deflated figures are not a gate: no "passes at this pace" launch date.
// - The old name "Launch gate E" (it clashed with gate (e)) is gone: it is the "Engine launch gate".
// - No stray "null" / "undefined" printed by a DOM call.
export function copyChecks() {
  const out = [];
  const bar = document.querySelector('#demo-bar .demo-bar__text');
  const barText = bar ? bar.innerText : '';
  if (!/not investment advice|ni investicijski nasvet/i.test(barText)) out.push(`demo bar lacks the advice disclaimer: "${barText.trim().slice(0, 80)}"`);
  const view = document.querySelector('#view');
  const text = view ? view.innerText : '';
  // a sentence that says a text was delivered, unless it says the opposite ("no text went out")
  const claims = text.match(/[^.\n]*\b(texted|went out|as sent|readers got|subscribers saw|poslano naročnikom|so ta SMS dobili|je šel ven)\b[^.\n]*/gi) ?? [];
  const m = claims.find((c) => !/\b(no|not|nothing|none|never|ni|nič|noben)\b/i.test(c));
  if (m) out.push(`a page claims a delivery with no subscribers: "${m.trim().slice(0, 100)}"`);
  const old = text.match(/[^.\n]*(Launch gate E|Pogoj za zagon E)\b[^.\n]*/);
  if (old) out.push(`the old gate name is printed: "${old[0].trim().slice(0, 80)}"`);
  const pace = text.match(/[^.\n]*(at this pace|pri tem tempu)[^.\n]*/i);
  if (pace) out.push(`a launch date is implied: "${pace[0].trim().slice(0, 80)}"`);
  const w = document.createTreeWalker(view ?? document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const s = w.currentNode.textContent.trim();
    if (s === 'null' || s === 'undefined' || s === 'NaN') {
      out.push(`a stray "${s}" is printed in ${w.currentNode.parentElement?.className || w.currentNode.parentElement?.tagName}`);
      break;
    }
  }
  return out;
}

// A text ground (DESIGN.md §4: running text stands on an opaque --bg, clipped to its content box) must
// match the surface it stands on, or it shows as a patch: a container that paints another colour than
// --bg (a Paper note, a shaded banner, a button) must redefine --bg for its text. And a row laid out on
// the page grid (a .grid list item, a subgrid) must not be grounded as a whole: the rules between its
// columns belong to the open space.
export function groundMismatch() {
  // [r, g, b, a] with r, g, b in 0–255
  const rgba = (c) => {
    const f = String(c).match(/^color\(srgb\s+([^)]+)\)/); // color-mix() computes to color(srgb r g b / a), 0–1
    if (f) {
      const p = f[1].split(/[\s/]+/).filter(Boolean).map(Number);
      return [...p.slice(0, 3).map((v) => v * 255), p.length > 3 ? p[3] : 1];
    }
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [...p.slice(0, 3), p.length > 3 ? p[3] : 1];
  };
  const rgb = (c) => {
    const v = rgba(c);
    return v && v[3] >= 0.99 ? v.slice(0, 3).map(Math.round) : null;
  };
  // the colour painted under an element: the nearest opaque ground, with translucent ones composited over it
  const beneath = (el) => {
    const layers = [];
    let base = null;
    for (let e = el.parentElement; e && !base; e = e.parentElement) {
      const v = rgba(getComputedStyle(e).backgroundColor);
      if (!v || v[3] <= 0.01) continue;
      if (v[3] >= 0.99) base = v.slice(0, 3);
      else layers.push(v);
    }
    base ??= rgb(getComputedStyle(document.documentElement).backgroundColor) ?? [227, 230, 228];
    for (const v of layers.reverse()) base = base.map((b, i) => v[i] * v[3] + b * (1 - v[3]));
    return base.map(Math.round);
  };
  const out = [];
  for (const el of document.querySelectorAll('#view *')) {
    const cs = getComputedStyle(el);
    if (cs.backgroundClip !== 'content-box' || cs.display === 'none' || cs.display === 'contents') continue;
    const c = rgb(cs.backgroundColor);
    if (!c || !el.textContent.trim() || el.closest('.visually-hidden, [hidden]')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    // a row laid out on the page grid (.grid, or a subgrid of it) keeps the colonnade between its columns:
    // a ground on the whole row would hide the rules where there is no text
    if (el.classList.contains('grid') || /^subgrid/.test(cs.gridTemplateColumns)) {
      out.push(`a page-grid row has a text ground and hides the rules: ${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).join('.')}`);
      if (out.length >= 8) break;
      continue;
    }
    const u = beneath(el);
    if (!u || c.every((v, i) => Math.abs(v - u[i]) <= 2)) continue;
    out.push(`text ground rgb(${c.join(',')}) on rgb(${u.join(',')}): ${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/)[0]} "${el.textContent.trim().slice(0, 30)}"`);
    if (out.length >= 8) break;
  }
  return out;
}
