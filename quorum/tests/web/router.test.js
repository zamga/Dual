import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROUTES, parseHash, matchRoute, isRouteHash, href, canonicalHash, routeOfHref } from '../../web/js/router.js';

test('parseHash splits the legacy path and query and normalises slashes', () => {
  assert.deepEqual(parseHash('#/issue/2026-09-28?x=1&y=two'), { path: '/issue/2026-09-28', query: { x: '1', y: 'two' } });
  assert.deepEqual(parseHash(''), { path: '/', query: {} });
  assert.equal(parseHash('#//pricing/').path, '/pricing');
});

test('every canonical flat token resolves to its module', () => {
  const cases = {
    '': 'home',
    '#': 'home',
    '#home': 'home',
    '#how-it-works': 'how-it-works',
    '#methodology': 'methodology',
    '#methodology-changelog': 'changelog',
    '#ledger': 'ledger',
    '#backtest': 'backtest',
    '#issue-2026-09-28': 'issue',
    '#p-0052': 'pick',
    '#p-10417': 'pick',
    '#s-KSMM': 'stock',
    '#disclosures': 'disclosures',
    '#pricing': 'pricing',
    '#join': 'join',
    '#join-signal': 'join',
    '#app': 'app',
    '#app-research': 'research',
    '#account': 'account',
    '#u-7Kq2xZ': 'unsubscribe',
    '#help': 'help',
    '#status': 'status',
    '#about': 'about',
    '#legal-terms': 'legal',
    '#legal-cookies': 'legal',
  };
  for (const [hash, module] of Object.entries(cases)) assert.equal(matchRoute(hash).module, module, hash);
  assert.equal(ROUTES.length, 20);
});

test('the older slash form is still accepted and maps to the same route and params', () => {
  const cases = {
    '#/': ['home', {}],
    '#/methodology/changelog': ['methodology-changelog', {}],
    '#/issue/2026-09-28': ['issue', { date: '2026-09-28' }],
    '#/p/0055': ['pick', { no: '0055' }],
    '#/s/ACME': ['stock', { ticker: 'ACME' }],
    '#/app/research': ['app-research', {}],
    '#/u/7Kq2xZ': ['unsubscribe', { token: '7Kq2xZ' }],
    '#/legal/privacy': ['legal', { doc: 'privacy' }],
    '#/join?tier=research': ['join', { tier: 'research' }],
  };
  for (const [hash, [name, params]] of Object.entries(cases)) {
    const r = matchRoute(hash);
    assert.equal(r.name, name, hash);
    assert.deepEqual(r.params, params, hash);
    assert.equal(r.legacy, true, hash);
  }
});

test('legacy links normalise to the canonical flat token (sections and tiers included)', () => {
  assert.equal(canonicalHash('#/p/0417'), '#p-0417');
  assert.equal(canonicalHash('#/issue/2026-09-28'), '#issue-2026-09-28');
  assert.equal(canonicalHash('#/methodology/changelog'), '#methodology-changelog');
  assert.equal(canonicalHash('#/ledger?s=scoreboard'), '#ledger~scoreboard');
  assert.equal(canonicalHash('#/join?tier=signal'), '#join-signal');
  assert.equal(canonicalHash('#/'), '#');
  assert.equal(canonicalHash('#/nope'), null);
});

test('params are captured and validated; bad params fall to the 404', () => {
  assert.deepEqual(matchRoute('#issue-2026-09-28').params, { date: '2026-09-28' });
  assert.deepEqual(matchRoute('#p-0052').params, { no: '0052' });
  assert.equal(matchRoute('#issue-yesterday').module, 'not-found');
  assert.equal(matchRoute('#p-55').module, 'not-found');
  assert.equal(matchRoute('#s-acme').module, 'not-found');
  assert.equal(matchRoute('#legal-nda').module, 'not-found');
  assert.equal(matchRoute('#join-gold').module, 'not-found');
  assert.equal(matchRoute('#nope').module, 'not-found');
  assert.equal(matchRoute('#nope').pathname, '#nope');
  assert.equal(matchRoute('#/issue/yesterday').module, 'not-found');
  assert.equal(matchRoute('#/nope/deeper').module, 'not-found');
});

test('sections ride after a tilde and never change the route', () => {
  const r = matchRoute('#ledger~scoreboard');
  assert.equal(r.name, 'ledger');
  assert.equal(r.section, 'scoreboard');
  assert.equal(r.hash, '#ledger~scoreboard');
  assert.equal(matchRoute('#issue-2026-03-02~r158').section, 'r158');
  assert.equal(matchRoute('#issue-2026-03-02~r158').params.date, '2026-03-02');
  assert.equal(matchRoute('#ledger~bad section').section, null);
});

test('href builds only Artifact-safe flat tokens', () => {
  assert.equal(href('home'), '#');
  assert.equal(href('ledger'), '#ledger');
  assert.equal(href('pick', '0052'), '#p-0052');
  assert.equal(href('issue', '2026-09-28'), '#issue-2026-09-28');
  assert.equal(href('stock', 'KSMM'), '#s-KSMM');
  assert.equal(href('methodology-changelog'), '#methodology-changelog');
  assert.equal(href('legal', 'terms'), '#legal-terms');
  assert.equal(href('join'), '#join');
  assert.equal(href('join', 'signal'), '#join-signal');
  assert.equal(href('app-research'), '#app-research');
  assert.equal(href('unsubscribe', '7Kq2xZ'), '#u-7Kq2xZ');
  assert.equal(href('ledger', null, 'scoreboard'), '#ledger~scoreboard');
  assert.equal(href('home', null, 'x'), '#home~x');
  assert.throws(() => href('nope'));
  assert.throws(() => href('pick'));
  const safe = /^#[A-Za-z0-9._~-]*$/;
  for (const r of ROUTES) {
    const sample = { date: '2026-09-28', no: '0052', ticker: 'KSMM', tier: 'signal', token: '7Kq2xZ', doc: 'sms' }[r.param];
    const link = r.token !== undefined ? href(r.name) : href(r.name, sample);
    assert.match(link, safe, r.name);
    assert.equal(matchRoute(link).name, r.name, link);
    if (r.prefix) assert.equal(matchRoute(href(r.name, sample)).params[r.param], sample, r.name);
  }
});

test('every hash is a route except the shell ids; routeOfHref reads rendered links', () => {
  assert.equal(isRouteHash('#pricing'), true);
  assert.equal(isRouteHash('#/pricing'), true);
  assert.equal(isRouteHash(''), true);
  assert.equal(isRouteHash('#view'), false);
  assert.equal(isRouteHash('#main-content'), false);
  assert.equal(isRouteHash('#a b'), false);
  assert.equal(routeOfHref('#p-0001').name, 'pick');
  assert.equal(routeOfHref('https://x.test/'), null);
});

test('no page, chart or shell module renders an old "#/" link', () => {
  const root = fileURLToPath(new URL('../../web/js/', import.meta.url));
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'core' ? [] : walk(`${d}${e.name}/`)) : [`${d}${e.name}`]));
  for (const f of walk(root).filter((x) => x.endsWith('.js') && !x.endsWith('router.js'))) {
    const src = readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(src, /(['"`])#\/[^'"`]*\1|href="#\//, f);
  }
});
