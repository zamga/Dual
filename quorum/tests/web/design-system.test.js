// Guards for the design system (docs/DESIGN.md). Later builders run these too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../web/', import.meta.url));
const css = ['tokens', 'base', 'components', 'pages'].map((f) => [f, readFileSync(`${root}css/${f}.css`, 'utf8')]);
const allCss = css.map(([, s]) => s).join('\n');
const index = readFileSync(`${root}index.html`, 'utf8');

const PALETTE = {
  karst: '#e3e6e4', paper: '#f4f5f3', graphite: '#111418', slate: '#545c63', hairline: '#aeb6b9', chamber: '#0d1014',
  mist: '#c9cfd2', ultramarine: '#1f2ee0', lift: '#8c96ff', gain: '#0b6e4f', loss: '#b3261e', 'gain-dark': '#4fd1a1', 'loss-dark': '#ff8a7a',
};

test('palette tokens are exactly the brief §5 values', () => {
  const tokens = css[0][1];
  for (const [name, hex] of Object.entries(PALETTE)) assert.match(tokens, new RegExp(`--${name}: ${hex};`, 'i'), name);
});

test('no hex colour outside tokens.css (pages use tokens)', () => {
  for (const [f, s] of css.slice(1)) {
    const hexes = (s.replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-f]{3,8}\b/gi) ?? []).filter((x) => x.toLowerCase() !== '#ffffff');
    assert.deepEqual(hexes, [], f);
  }
});

test('no gradients, no banned fonts', () => {
  assert.doesNotMatch(allCss, /gradient\(/);
  assert.doesNotMatch(allCss, /\b(Inter|Space Grotesk|Söhne)\b/);
});

test('ultramarine and Lift are only used by quorum elements', () => {
  const allowed = /(quorum|lintel|lv__|sms|sc-q|sc-key|how-col|how-quorum|chain__kind|sb__dot|pill|badge|zero|is-agree|is-in)/;
  const rules = allCss.replace(/\/\*[\s\S]*?\*\//g, '').split('}');
  for (const r of rules) {
    const [sel, body] = r.split('{');
    if (!body || !/var\(--(ultramarine|lift|quorum)\)/.test(body)) continue;
    const s = sel.trim();
    if (s.startsWith(':root') || s.startsWith('.chamber') || s.startsWith('.paper') || s.startsWith('[data-surface')) continue;
    assert.match(s, allowed, `ultramarine used by: ${s}`);
  }
});

test('index.html: exact Google Fonts URL, preconnect, no inline script or style', () => {
  assert.ok(index.includes('https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800&family=Martian+Mono:wdth,wght@75..112.5,100..800&display=swap'));
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
  const pairs = [
    [P.graphite, P.karst], [P.slate, P.karst], [P.graphite, P.paper], [P.slate, P.paper], [P.mist, P.chamber], ['#9aa3a8', P.chamber],
    [P.ultramarine, P.karst], ['#ffffff', P.ultramarine], [P.lift, P.chamber], [P.gain, P.karst], [P.loss, P.karst], [P.gain, P.paper],
    [P.loss, P.paper], [P['gain-dark'], P.chamber], [P['loss-dark'], P.chamber], [P.mist, P.graphite], [P.karst, P.graphite],
  ];
  for (const [fg, bg] of pairs) assert.ok(ratio(fg, bg) >= 4.5, `${fg} on ${bg}: ${ratio(fg, bg).toFixed(2)}`);
});
