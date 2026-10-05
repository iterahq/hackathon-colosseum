#!/usr/bin/env node
// Provenance: devfellowship/dfl-lesson-studio, apps/ios/scripts/check-one-react.mjs, commit e90a642c4f7a7f4b9651895270a3f489cffc84a7.
// Changed: the "npm run bundle:ios" hint is now "npm --prefix apps/mobile run bundle:ios" and one doc-comment sentence lost its spike name; the logic is untouched.
/**
 * Assertion: the mobile shell bundle contains ONE copy of React.
 *
 * Reads the source map that `npm run bundle:ios` writes, lists every module
 * path that is a React core file (`react/index.js`,
 * `react/cjs/react.production.js`, ...), and fails when they come from more
 * than one package directory. Two React copies in one app crash at run time
 * ("Invalid hook call"), and an empty app hides it (register r09).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, 'dist-ios');
const maps = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.map')) maps.push(p);
  }
};
walk(out);
if (maps.length === 0) {
  console.error(`check-one-react: FAIL — no source map under ${out}. Run "npm --prefix apps/mobile run bundle:ios" first.`);
  process.exit(1);
}
const dirs = new Set();
let reactModules = 0;
for (const m of maps) {
  const { sources = [] } = JSON.parse(readFileSync(m, 'utf8'));
  for (const s of sources) {
    const match = /^(.*\/node_modules\/react)\/(?:index\.js|cjs\/react\.[a-z.-]+\.js)$/.exec(s.replace(/\\/g, '/'));
    if (match) {
      dirs.add(match[1]);
      reactModules += 1;
    }
  }
}
const react = [...dirs];
if (react.length !== 1) {
  console.error(`check-one-react: FAIL — ${react.length} React package dir(s) in the bundle:`);
  for (const d of react) console.error(`  ${d}`);
  process.exit(1);
}
console.log(`check-one-react: PASS — one React (${react[0]}), ${reactModules} core module(s), ${maps.length} map(s).`);
