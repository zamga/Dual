// web/js/core is a build copy of core/ (scripts/build-web.js). Fails if the copies drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../../core/', import.meta.url));
const dst = fileURLToPath(new URL('../../web/js/core/', import.meta.url));
const built = existsSync(dst) && readdirSync(dst).some((f) => f.endsWith('.js'));

test('web/js/core matches core/ byte for byte', { skip: built ? false : 'run npm run build:web first' }, () => {
  for (const f of readdirSync(src).filter((x) => x.endsWith('.js'))) {
    assert.ok(existsSync(dst + f), `missing web/js/core/${f}`);
    assert.equal(readFileSync(dst + f, 'utf8'), readFileSync(src + f, 'utf8'), f);
  }
});
