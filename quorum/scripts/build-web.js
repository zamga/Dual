// Copies the isomorphic core/ modules into web/js/core/ so the static site can import them.
// web/js/core/ is generated: edit core/ and rerun `npm run build:web`.
import { readdirSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'core');
const dst = join(root, 'web', 'js', 'core');

mkdirSync(dst, { recursive: true });
for (const f of readdirSync(dst)) if (f.endsWith('.js') && !existsSync(join(src, f))) rmSync(join(dst, f));
const files = readdirSync(src).filter((f) => f.endsWith('.js'));
for (const f of files) copyFileSync(join(src, f), join(dst, f));
console.log(`build-web: copied ${files.length} core modules to web/js/core/`);
