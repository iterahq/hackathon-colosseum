#!/usr/bin/env node
/**
 * Second half of the `web-inert` step of mobile-shell.yml (PLAN ADR-13). The first half (the path
 * allow-list) prints `web-inert=yes|no`; this one fails when a change that the allow-list lets
 * through is wider than its allowance:
 *   - eslint.config.js may change only inside its `ignores` array;
 *   - renovate.json may change only inside its `ignorePaths` array;
 *   - .dockerignore and .gitignore may change only by adding lines that start with `apps/`
 *     (blank and `#` comment lines are inert and allowed).
 * Inside an array, an added entry must start with `apps/mobile/` (or be one of the Renovate preset
 * entries, for renovate.json) and no entry may be removed.
 * The files are compared at the merge base and at HEAD after removing that one member from both:
 * what remains must be identical. A file that is not changed is not checked.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** The allow-list of the workflow's first half. A test asserts the workflow carries this exact text. */
export const ALLOW_LIST =
  '^(apps/mobile/|scripts/mobile/|\\.github/workflows/mobile-|\\.github/CODEOWNERS$|docs/|repo-contract\\.yaml$|renovate\\.json$|\\.dockerignore$|\\.gitignore$|eslint\\.config\\.js$|[^/]+\\.md$)';

/** The entries of Renovate's own `ignorePaths` preset, repeated in renovate.json because a repo-level list replaces it. */
const RENOVATE_PRESET = ['**/node_modules/**', '**/test/**', '**/tests/**', '**/__tests__/**', '**/__fixtures__/**', '**/examples/**', '**/vendor/**', '**/bower_components/**'];

export const CHECKS = [
  { file: 'eslint.config.js', kind: 'array', member: /\bignores\s*:\s*\[/ },
  { file: 'renovate.json', kind: 'array', member: /"ignorePaths"\s*:\s*\[/, extra: RENOVATE_PRESET },
  { file: '.dockerignore', kind: 'lines' },
  { file: '.gitignore', kind: 'lines' },
];

/** End index (exclusive) of the bracket-balanced, string-aware array that opens at `open`. */
function arrayEnd(text, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return i + 1;
  }
  throw new Error('unbalanced array');
}

const stringLiterals = (text) => [...text.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1] ?? m[2]);

/** The member split out of `text`: the text without it (whitespace collapsed) and its string entries. */
function splitMember(text, member) {
  const m = member.exec(text);
  if (!m) return { rest: text.replace(/\s+/g, ' '), entries: [] };
  const open = m.index + m[0].length - 1;
  const end = arrayEnd(text, open);
  const after = text.slice(end).replace(/^\s*,?/, '');
  return { rest: (text.slice(0, m.index) + after).replace(/\s+/g, ' '), entries: stringLiterals(text.slice(open, end)) };
}

/** Problems with a change of one allowed file; an empty list means the change is inside its allowance. */
export function checkChange({ file, kind, member, extra = [] }, before, after) {
  const problems = [];
  if (kind === 'array') {
    const b = splitMember(before, member);
    const a = splitMember(after, member);
    if (b.rest !== a.rest) problems.push(`${file} changed outside its ${member.source} array`);
    for (const e of b.entries) if (!a.entries.includes(e)) problems.push(`${file} removed the entry ${JSON.stringify(e)}`);
    for (const e of a.entries) if (!b.entries.includes(e) && !e.startsWith('apps/mobile/') && !extra.includes(e)) problems.push(`${file} added the entry ${JSON.stringify(e)}, which is not under apps/mobile/`);
    return problems;
  }
  const b = before.split('\n');
  const a = after.split('\n');
  for (const line of b) if (!a.includes(line)) problems.push(`${file} removed or edited the line ${JSON.stringify(line)}`);
  for (const line of a) {
    if (b.includes(line) || line.trim() === '' || line.startsWith('#') || line.startsWith('apps/')) continue;
    problems.push(`${file} added the line ${JSON.stringify(line)}, which does not start with apps/`);
  }
  return problems;
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

function main() {
  const base = git('merge-base', 'origin/main', 'HEAD').trim();
  const changed = new Set(git('diff', '--name-only', '--no-renames', base, 'HEAD').split('\n').filter(Boolean));
  let failed = false;
  for (const check of CHECKS) {
    if (!changed.has(check.file)) continue;
    let before;
    try {
      before = git('show', `${base}:${check.file}`);
    } catch {
      console.error(`web-inert: ${check.file} did not exist at the merge base`);
      failed = true;
      continue;
    }
    try {
      const problems = checkChange(check, before, git('show', `HEAD:${check.file}`));
      for (const p of problems) console.error(`web-inert: ${p}`);
      if (problems.length === 0) console.log(`web-inert: ${check.file} changed only inside its allowance`);
      else failed = true;
    } catch (e) {
      console.error(`web-inert: cannot read ${check.file}: ${e.message}`);
      failed = true;
    }
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
