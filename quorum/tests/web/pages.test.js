// The page-module contract: every route's module exists and exports render(ctx).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROUTES, NOT_FOUND } from '../../web/js/router.js';

const pagesDir = fileURLToPath(new URL('../../web/js/pages/', import.meta.url));

test('every route has a page module exporting async render(ctx)', async () => {
  for (const r of [...ROUTES, NOT_FOUND]) {
    const file = `${pagesDir}${r.module}.js`;
    assert.ok(existsSync(file), `missing ${r.module}.js`);
    const mod = await import(file);
    assert.equal(typeof mod.render, 'function', r.module);
  }
});
