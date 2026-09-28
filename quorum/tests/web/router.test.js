import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, parseHash, matchRoute, isRouteHash, href } from '../../web/js/router.js';

test('parseHash splits path and query and normalises slashes', () => {
  assert.deepEqual(parseHash('#/issue/2026-09-28?x=1&y=two'), { path: '/issue/2026-09-28', query: { x: '1', y: 'two' } });
  assert.deepEqual(parseHash(''), { path: '/', query: {} });
  assert.equal(parseHash('#//pricing/').path, '/pricing');
});

test('every architecture route resolves to its module', () => {
  const cases = {
    '#/': 'home',
    '#/how-it-works': 'how-it-works',
    '#/methodology': 'methodology',
    '#/methodology/changelog': 'changelog',
    '#/ledger': 'ledger',
    '#/backtest': 'backtest',
    '#/issue/2026-09-28': 'issue',
    '#/p/0055': 'pick',
    '#/s/ACME': 'stock',
    '#/disclosures': 'disclosures',
    '#/pricing': 'pricing',
    '#/join': 'join',
    '#/app': 'app',
    '#/app/research': 'research',
    '#/account': 'account',
    '#/u/7Kq2xZ': 'unsubscribe',
    '#/help': 'help',
    '#/status': 'status',
    '#/about': 'about',
    '#/legal/terms': 'legal',
    '#/legal/cookies': 'legal',
  };
  for (const [hash, module] of Object.entries(cases)) assert.equal(matchRoute(hash).module, module, hash);
  assert.equal(ROUTES.length, 20);
});

test('params are captured and validated; bad params fall to the 404', () => {
  const r = matchRoute('#/issue/2026-09-28?s=top');
  assert.deepEqual(r.params, { date: '2026-09-28' });
  assert.deepEqual(r.query, { s: 'top' });
  assert.equal(matchRoute('#/issue/yesterday').module, 'not-found');
  assert.equal(matchRoute('#/p/55').module, 'not-found');
  assert.equal(matchRoute('#/s/acme').module, 'not-found');
  assert.equal(matchRoute('#/legal/nda').module, 'not-found');
  assert.equal(matchRoute('#/nope/deeper').module, 'not-found');
});

test('only #/ hashes are routes; other hashes are in-page anchors', () => {
  assert.equal(isRouteHash('#/pricing'), true);
  assert.equal(isRouteHash(''), true);
  assert.equal(isRouteHash('#view'), false);
  assert.equal(href('/ledger', { seq: 3 }), '#/ledger?seq=3');
});
