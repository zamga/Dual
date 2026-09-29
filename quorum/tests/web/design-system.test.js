// Guards for the design system (docs/DESIGN.md). Later builders run these too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../web/', import.meta.url));
// tokens.css first; every other stylesheet in web/css after it
const cssFiles = ['tokens', ...readdirSync(`${root}css/`).filter((f) => f.endsWith('.css') && f !== 'tokens.css').map((f) => f.slice(0, -4)).sort()];
const css = cssFiles.map((f) => [f, readFileSync(`${root}css/${f}.css`, 'utf8')]);
const allCss = css.map(([, s]) => s).join('\n');
const index = readFileSync(`${root}index.html`, 'utf8');

// DESIGN-V2 §3.2
const PALETTE = {
  night: '#0a0c0f', 'night-2': '#12151a', mist: '#c9cfd2', 'mist-2': '#8e979d', karst: '#e3e6e4', paper: '#f7f8f6', graphite: '#111418',
  slate: '#545c63', ultra: '#1f2ee0', lift: '#8c96ff', gain: '#0b6e4f', loss: '#b3261e', 'gain-night': '#4fd1a1', 'loss-night': '#ff8a7a',
};

test('palette tokens are exactly the DESIGN-V2 §3.2 values', () => {
  const tokens = css[0][1];
  for (const [name, hex] of Object.entries(PALETTE)) assert.match(tokens, new RegExp(`--${name}: ${hex};`, 'i'), name);
});

test('no hex colour outside tokens.css (pages use tokens)', () => {
  for (const [f, s] of css.slice(1)) {
    const hexes = (s.replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-f]{3,8}\b/gi) ?? []).filter((x) => x.toLowerCase() !== '#ffffff');
    assert.deepEqual(hexes, [], f);
  }
});

test('no gradient fills (a mask falloff is technique, DESIGN-V2 §3.2), no banned or retired fonts', () => {
  const decls = allCss.replace(/\/\*[\s\S]*?\*\//g, '').split(/;|\{|\}/);
  for (const d of decls) if (/gradient\(/.test(d)) assert.match(d.trim(), /^(-webkit-)?mask(-image)?\s*:/, `gradient outside a mask: ${d.trim().slice(0, 80)}`);
  assert.doesNotMatch(allCss.replace(/\/\*[\s\S]*?\*\//g, ''), /\b(Inter|Space Grotesk|Söhne|Archivo|Newsreader)\b/);
});

test('the rules are faint: Graphite 11% on light, Mist 10% on night (DESIGN-V2 §3.3)', () => {
  const tokens = css[0][1];
  assert.match(tokens, /--rule-light: rgb\(17 20 24 \/ 0\.11\);/);
  assert.match(tokens, /--rule-night: rgb\(201 207 210 \/ 0\.1\);/);
  assert.match(css.find(([f]) => f === 'base')[1], /\.rules > i \{[^}]*border-left: 1px solid var\(--rule-light\)/);
});

test('type and motion tokens are the DESIGN-V2 §3.1 and §3.5 values', () => {
  const tokens = css[0][1];
  for (const [k, v] of Object.entries({
    '--t-hero': 'clamp(4.5rem, 1.6rem + 11.2vw, 13rem)', '--t-d1': 'clamp(3.25rem, 1.4rem + 7vw, 9rem)', '--t-d2': 'clamp(2.5rem, 1.3rem + 4.2vw, 6rem)',
    '--t-lintel': 'clamp(1.6rem, 0.9rem + 2.6vw, 3.6rem)', '--t-voice': 'clamp(2rem, 1.1rem + 3.2vw, 4.75rem)', '--t-lede': 'clamp(1.2rem, 1rem + 0.8vw, 1.65rem)',
    '--t-fig-xl': 'clamp(2.5rem, 1.4rem + 3.4vw, 5.5rem)', '--e-out': 'cubic-bezier(0.16, 1, 0.3, 1)', '--e-io': 'cubic-bezier(0.7, 0, 0.2, 1)',
    '--e-ui': 'cubic-bezier(0.2, 0, 0, 1)', '--e-land': 'cubic-bezier(0.2, 0.9, 0.25, 1)', '--d-1': '150ms', '--d-2': '260ms', '--d-3': '420ms', '--d-4': '700ms',
  })) assert.ok(tokens.includes(`${k}: ${v};`), k);
  for (const band of ['50% 87.4%', '87.5% 106%', '106.1% 118%', '118.1% 150%']) assert.ok(tokens.includes(`font-stretch: ${band};`), `Mona Sans Fallback band ${band}`);
  assert.match(tokens, /font-family: 'Instrument Serif Fallback';[^}]*local\('Georgia Italic'\)/);
});

test('all CSS together is at most 45 KB gzipped (DESIGN-V2 §6 WP-A)', () => {
  const kb = css.reduce((n, [, s]) => n + gzipSync(s, { level: 9 }).length, 0) / 1024;
  assert.ok(kb <= 45, `${kb.toFixed(1)} KB`);
});

test('ultramarine and Lift are only used by quorum elements', () => {
  const allowed = /(quorum|lintel|lv__|sms|sc-q|sc-key|how-col|how-quorum|chain__kind|sb__dot|pill|badge|zero|is-agree|is-in)/;
  // --ultra / --ultramarine / --lift / --quorum may only be read by a quorum element
  const rules = allCss.replace(/\/\*[\s\S]*?\*\//g, '').split('}');
  for (const r of rules) {
    const [sel, body] = r.split('{');
    if (!body || !/var\(--(ultra|ultramarine|lift|quorum)\)/.test(body)) continue;
    const s = sel.trim();
    if (s.startsWith(':root') || /^(\.night|\.chamber|\.paper|\.karst|\[data-surface|\.site-footer \{|\.site-footer$)/.test(s)) continue;
    assert.match(s, allowed, `ultramarine used by: ${s}`);
  }
});

test('index.html: exact Google Fonts URL, preconnect, no inline script or style', () => {
  assert.ok(index.includes('https://fonts.googleapis.com/css2?family=Mona+Sans:wdth,wght@75..125,200..900&family=Martian+Mono:wdth,wght@75..112.5,100..800&family=Instrument+Serif:ital@1&display=swap'));
  assert.ok(index.includes('rel="preconnect" href="https://fonts.gstatic.com" crossorigin'));
  assert.doesNotMatch(index, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(index, /<style/);
  assert.doesNotMatch(index, /\sstyle="/);
});

test('no external JS and no style="" attributes in page templates', () => {
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'core' ? [] : walk(`${d}${e.name}/`)) : [`${d}${e.name}`]));
  for (const f of walk(`${root}js/`).filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(src, /import\s[^;]*from\s+['"]https?:/, f);
    assert.doesNotMatch(src, /\sstyle="/, f);
  }
});

// WCAG contrast of the text pairs the system uses
function lum(hex) {
  const c = hex.match(/\w\w/g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

test('text tokens meet WCAG AA on their surfaces', () => {
  const P = PALETTE;
  // every text pair of DESIGN-V2 §3.2, on each surface it appears on
  const pairs = [];
  for (const bg of [P.night, P['night-2']]) pairs.push([P.mist, bg], [P['mist-2'], bg], [P.lift, bg], [P['gain-night'], bg], [P['loss-night'], bg]);
  for (const bg of [P.karst, P.paper]) pairs.push([P.graphite, bg], [P.slate, bg], [P.ultra, bg], [P.gain, bg], [P.loss, bg]);
  pairs.push(['#ffffff', P.ultra], [P.night, P.lift], [P.karst, P.graphite], [P.mist, P.graphite]);
  for (const [fg, bg] of pairs) assert.ok(ratio(fg, bg) >= 4.5, `${fg} on ${bg}: ${ratio(fg, bg).toFixed(2)}`);
});
