#!/usr/bin/env node
/**
 * ADR-5, ASSERTED OVER THE BUILT ARTIFACT.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY READING THE SOURCE IS NOT THE SAME CHECK
 * ═════════════════════════════════════════════════════════════════════════════
 * ADR-5 says the `code` kind — the transpiler, the preview runtime, and any
 * editor a host wires in — must never be in the bundle that a consumer who only
 * renders `concept` and `single_choice` pays for. The obvious version of that
 * check is a `grep` for `@monaco-editor/react` in `packages/activities/src`,
 * and it is the wrong check twice over:
 *
 *  1. it answers "does anyone import it TODAY", not "can it be reached". A
 *     green that comes from nobody having happened to write the import is a
 *     green that a single innocent barrel re-export flips to red-in-production
 *     without turning this red;
 *  2. it reads the SOURCE. What ships is `dist/`, resolved through the
 *     `exports` map — the file that would actually pull the transpiler into a
 *     consumer's bundle is `dist/index.js`, and no test in this repo other than
 *     `external-consumer/` had ever looked at it.
 *
 * So this walks the real module graph of the BUILT package, from each declared
 * entrypoint, following relative imports and recording bare specifiers, and
 * asserts the SHAPE:
 *
 *   base (`.`)      MUST NOT reach anything under `code/`
 *                   MUST NOT name sucrase / monaco-editor / @monaco-editor/react
 *   `./code`        MUST reach the preview and the transpiler
 *                   MUST NOT name any editor package either (the editor is a
 *                   port — see `src/code/CodeEditorSurface.tsx`)
 *
 * The second block is not decoration: it is the walker's SELF-TEST. A walker
 * that silently stopped following imports would report "base reaches nothing
 * forbidden" forever, and only the positive assertion catches that.
 *
 * Usage:
 *   node scripts/assert-entrypoint-isolation.mjs [packageDir]
 *
 * `packageDir` defaults to `packages/activities`. `external-consumer/check.sh`
 * points it at `external-consumer/node_modules/@iterahq/activities` instead —
 * the unpacked tarball, i.e. what a consumer really installs.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const pkgDir = resolve(process.argv[2] ?? join(HERE, '..', 'packages', 'activities'));

/** Bundle-weight offenders. The editor is a PORT; the transpiler is `/code`-only. */
const DENIED_IN_BASE = ['@monaco-editor/react', 'monaco-editor', 'sucrase'];
/** The package ships no editor at all, in either entrypoint. */
const DENIED_EVERYWHERE = ['@monaco-editor/react', 'monaco-editor'];

/**
 * Every module specifier in one emitted file.
 *
 * A regex rather than a parser, and that is a deliberate, bounded choice: the
 * input is `tsc` output with `module: NodeNext`, which emits plain, unminified
 * `import … from '…'` / `export … from '…'` and leaves dynamic `import()` as
 * written. There is no JSX, no bundler wrapper and no string-concatenated
 * specifier to defeat it. Adding a parser dependency to a guard that must run
 * inside a bare external-consumer install would cost more than it buys.
 */
function specifiersOf(file) {
  const src = readFileSync(file, 'utf8');
  const out = [];
  const patterns = [
    /(?:^|[\s;}])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g,
    /(?:^|[\s;}])import\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src)) !== null) out.push(m[1]);
  }
  return out;
}

/** Walk from one entry file. Returns the reachable files + the bare specifiers. */
function walk(entry) {
  const files = new Set();
  const bare = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (files.has(file)) continue;
    if (!existsSync(file)) throw new Error(`module graph points at a missing file: ${file}`);
    files.add(file);
    for (const spec of specifiersOf(file)) {
      if (spec.startsWith('.')) {
        queue.push(resolve(dirname(file), spec));
      } else {
        bare.add(spec);
      }
    }
  }
  return { files, bare };
}

const problems = [];
const say = (ok, line) => console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${line}`);
function must(condition, line, detail) {
  say(condition, line);
  if (!condition) problems.push(`${line}${detail ? `\n         ${detail}` : ''}`);
}

const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
console.log(`entrypoint isolation — ${manifest.name}@${manifest.version}`);
console.log(`  ${pkgDir}`);

/* ── 1. the exports map really has two doors, and both are shipped ─────────── */

const exportsMap = manifest.exports ?? {};
must(Boolean(exportsMap['./code']), 'package.json declares the ./code export condition');

const entryFor = (key) => {
  const cond = exportsMap[key];
  const rel = typeof cond === 'string' ? cond : cond?.import ?? cond?.default;
  if (!rel) throw new Error(`no import condition for the "${key}" export`);
  return resolve(pkgDir, rel);
};
const baseEntry = entryFor('.');
const codeEntry = entryFor('./code');
must(existsSync(baseEntry), 'the base entry file exists in dist', baseEntry);
must(existsSync(codeEntry), 'the ./code entry file exists in dist', codeEntry);

/* ── 2. the base graph ─────────────────────────────────────────────────────── */

const base = walk(baseEntry);
const codeDir = resolve(pkgDir, dirname(relative(pkgDir, codeEntry)));
const baseTouchingCode = [...base.files].filter((f) => f.startsWith(`${codeDir}/`));
must(
  baseTouchingCode.length === 0,
  `the base entrypoint reaches NOTHING under ${relative(pkgDir, codeDir)}/`,
  baseTouchingCode.map((f) => relative(pkgDir, f)).join(', '),
);

const baseOffenders = DENIED_IN_BASE.filter((d) => base.bare.has(d));
must(
  baseOffenders.length === 0,
  `the base entrypoint imports none of: ${DENIED_IN_BASE.join(', ')}`,
  `found ${baseOffenders.join(', ')}`,
);

/* ── 3. the /code graph — and the walker's own self-test ───────────────────── */

const code = walk(codeEntry);
must(
  code.files.size > base.files.size / 4,
  'the ./code graph is non-trivial (the walker really followed imports)',
  `${code.files.size} files reachable from ./code, ${base.files.size} from the base`,
);
must(
  [...code.files].some((f) => f.endsWith('CodeLivePreview.js')),
  './code reaches the preview — the walker resolves relative imports',
);
must(
  code.bare.has('sucrase'),
  './code names the transpiler — so "base does not" is a real difference',
  `bare specifiers under ./code: ${[...code.bare].sort().join(', ')}`,
);

const editorOffenders = DENIED_EVERYWHERE.filter((d) => code.bare.has(d));
must(
  editorOffenders.length === 0,
  `./code ships no editor either (${DENIED_EVERYWHERE.join(', ')}) — it is a port`,
  `found ${editorOffenders.join(', ')}`,
);

/* ── verdict ───────────────────────────────────────────────────────────────── */

console.log(
  `  base: ${base.files.size} files, ${base.bare.size} deps · ` +
    `./code: ${code.files.size} files, ${code.bare.size} deps`,
);
if (problems.length > 0) {
  console.error(`\n::error::ADR-5 entrypoint isolation broke:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log('ENTRYPOINT ISOLATION OK');
