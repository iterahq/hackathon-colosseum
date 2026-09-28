/**
 * storybook-changed-stories.ts — which stories does a PR touch, directly or
 * transitively?
 *
 * The Storybook PR preview (`.github/workflows/storybook.yml`) buries what a
 * PR actually changed inside the full Atoms/Molecules/Organisms tree — a
 * reviewer has to already know where to look. PR #517 added
 * `Organisms/Activities/8 · Cena/{Xray,Live type,Inspect}` and it went
 * unnoticed. This module answers "what changed" so a generated page
 * (`generate-nesta-pr-mdx.ts`) can put it first.
 *
 * v1 walked the FULL transitive import closure and rendered every hit as a
 * live canvas. On real branches that is ~95% noise: `src/i18n/index.ts` alone
 * pulls in 66 stories, `packages/activities/src/index.ts` 51, and
 * `src/stories/contractFixtures.ts` 20 — because everything imports those
 * hubs, changing them "affects" nearly the whole tree. PR #532 changed
 * `LessonCompleteCard.tsx`, which has no story at all, and the old logic
 * reported 66 unrelated "changed" stories and zero mention of the file that
 * actually changed.
 *
 * v2 keeps the full transitive walk but only for a SEPARATE "maybe affected"
 * bucket, and narrows what actually earns a live canvas. v3 (this version)
 * fixes two v2 holes found reviewing real branches (`feat/scene-kinds`,
 * PR #517): a story helper file (`src/stories/interactions.ts` — not a
 * `*.stories.*` file) is everything imports through, same shape as a hub,
 * but wasn't excluded; and a DISPATCHER component (`ActivityRenderer.tsx`,
 * which many unrelated stories import to render through) promoted every one
 * of those consumers to "changed" when only its own story should count.
 *
 *   - `new`      — a `*.stories.(ts|tsx|mdx)` file was added. Always live
 *     (budget permitting — see the canvas cap below).
 *   - `changed`  — EITHER the story file itself was modified, OR an existing
 *     story's OWN component changed. "Own component" is resolved two ways,
 *     tried IN ORDER: first a DIRECT (one-hop) import target whose basename
 *     matches the story file's own basename (`Foo.stories.tsx` ↔
 *     `Foo.tsx`) — authoritative when it exists; only when it doesn't does
 *     the story file's bare `component:` identifier on the CSF meta object
 *     (`storybook-story-meta.ts`) get a say, traced back to its import, and
 *     even then it's refused if that file is basename-claimed by some
 *     OTHER story. This is deliberately narrower than "imports the changed
 *     file at all": a dispatcher component like `ActivityRenderer.tsx` is
 *     imported by many stories that merely render THROUGH it and declare it
 *     as their own `component:` for Storybook's controls/docgen, but none
 *     of those count — only `ActivityRenderer.stories.tsx` itself (which
 *     basename-claims it) does. Hub files (barrel/`index.*`, `src/i18n/**`,
 *     `*types*`, anything under a `utils/` dir, `contractFixtures.ts`/other
 *     `*Fixtures.*`) and story HELPER files (anything under `src/stories/`
 *     that is not itself a `*.stories.*` file — `interactions.ts`, mocks,
 *     test-utils, fixtures)
 *     are excluded from "own component" entirely: those are exactly the
 *     files that make the signal meaningless, they still show up via the
 *     full transitive walk in `maybeAffected`. A whole-package alias
 *     (`@iterahq/<pkg>` with no resolvable subpath) is ALSO excluded here —
 *     it's coarser than one file, so it only earns a `maybeAffected` hit, not
 *     a live canvas.
 *   - `maybeAffected` — everything else the full transitive walk still finds
 *     (2+ hops, or only reachable through a whole-package alias, or only
 *     through a hub/helper file). Paths only, no live budget — the caller
 *     renders these as a collapsed link list.
 *   - `orphanVisualFiles` — a changed `.tsx` under `src/` or `packages/`
 *     (excluding `*.test.tsx`/`*.spec.tsx`, which are tests, not visual
 *     components) that no story directly imports at all. This is the #532
 *     case: the file that actually matters, with no story to demo it in.
 *
 * Live budget is a CANVAS cap (`CANVAS_CAP`), not a story-file cap — a single
 * story file can export dozens of individual stories, each rendering its own
 * `<Canvas>` on the "🆕 Nesta PR" page (`generate-nesta-pr-mdx.ts`), so
 * capping by file undercounts wildly: PR #517's `ActivityRenderer.stories.tsx`
 * alone exports 39. `new` entries are prioritized over `changed` (both consume
 * the same budget, walked in priority order); once a story's own canvas count
 * would push the running total over `CANVAS_CAP`, that story AND every story
 * after it in priority order render as a link instead of a live `<Canvas>`.
 *
 * Import resolution understands relative specifiers, the `@/` → `src/` alias
 * (`tsconfig.json` `paths`, mirrored by `vite.config.ts`) and workspace
 * package names (`@iterahq/<pkg>` → `packages/<pkg>/src`, read from each
 * `packages/<pkg>/package.json`). It does NOT resolve into `node_modules` for
 * anything else, and the transitive walk stops at `MAX_IMPORT_DEPTH` hops so
 * a cycle or a very deep chain can't make the CI step hang.
 */

import { parseStoryFileMeta } from './storybook-story-meta';

export type ChangeStatus = 'A' | 'M' | 'D' | 'R';

export interface ChangedFile {
  status: ChangeStatus;
  /** Repo-relative, forward-slash path. The NEW path for a rename. */
  path: string;
}

export type StoryVerdict = 'new' | 'changed';

export interface AffectedStory {
  path: string;
  verdict: StoryVerdict;
  /** False once `CANVAS_CAP` is exceeded — render a link, not a `<Canvas>`. */
  live: boolean;
}

export interface DetectChangedStoriesResult {
  /** New + directly-changed stories, live-canvas budget already applied. */
  affected: AffectedStory[];
  /** Story paths the full transitive walk still finds, beyond the direct
   *  one-hop pass above. Never live — render as a collapsed link list. */
  maybeAffected: string[];
  /** Changed `.tsx` files under `src/` or `packages/` that no story directly
   *  imports — "changed but no story covers it". */
  orphanVisualFiles: string[];
  removed: string[];
}

/**
 * Minimal filesystem seam. The real CLI (`generate-nesta-pr-mdx.ts`) backs
 * this with `node:fs`; tests back it with an in-memory map, so the traversal
 * logic never touches disk.
 */
export interface RepoFs {
  exists(path: string): boolean;
  readFile(path: string): string;
  /** All repo-relative file paths under `dir` (recursive). Empty if `dir` is absent or is a file. */
  listFiles(dir: string): string[];
}

const STORY_FILE_RE = /\.stories\.(tsx?|mdx)$/;
const TEST_FILE_RE = /\.(test|spec)\.tsx$/;
const WATCHED_DIRS = ['src/', 'packages/', 'design-playground/'];
const MAX_IMPORT_DEPTH = 8;
const RESOLVABLE_EXTENSIONS = ['.ts', '.tsx', '.mdx', '.css'];

/** Live-canvas budget for the whole "🆕 Nesta PR" page, counted in `<Canvas>`
 *  elements (one per exported story), not story files — a single story file
 *  can export dozens. `new` entries are prioritized over `changed`; once the
 *  running total would exceed this, that entry and everything after it in
 *  priority order render as a link instead of a live canvas. */
export const CANVAS_CAP = 24;
/** Display cap for `maybeAffected` — applied by callers, not here, so this
 *  module always reports the real count. */
export const MAYBE_AFFECTED_CAP = 30;

const IMPORT_SPECIFIER_RE =
  /\bfrom\s+['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)|\bimport\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;
/** A whole `import ... from '...'` clause, captured so its bound name(s)
 *  can be matched against a `component:` identifier from the CSF meta
 *  object. Deliberately simple (no multi-line named-import lists) — this
 *  repo's story files write imports on one line. */
const IMPORT_CLAUSE_RE = /^[ \t]*import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"]/gm;

export function parseGitDiffNameStatus(output: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split('\t');
    const status = parts[0][0] as ChangeStatus;
    if (status === 'R' || parts[0][0] === 'C') {
      // R100\told/path\tnew/path — the new path is what exists on HEAD.
      const newPath = parts[2] ?? parts[1];
      files.push({ status: 'R', path: newPath });
    } else if (status === 'A' || status === 'M' || status === 'D') {
      files.push({ status, path: parts[1] });
    }
    // Ignore other statuses (T, U, X, B — none apply to a normal PR diff).
  }
  return files;
}

function isStoryFile(path: string): boolean {
  return STORY_FILE_RE.test(path);
}

function isTestFile(path: string): boolean {
  return TEST_FILE_RE.test(path);
}

function isWatchedSourceFile(path: string): boolean {
  return WATCHED_DIRS.some((dir) => path.startsWith(dir));
}

/**
 * Hub files: everything imports them, so "this story imports a hub that
 * changed" carries almost no signal. Excluded from the direct (one-hop)
 * pass on purpose — they still show up via the full transitive walk, in
 * `maybeAffected`.
 */
function isSharedHubFile(path: string): boolean {
  const basename = path.split('/').pop() ?? '';
  if (/^index\.(ts|tsx)$/.test(basename)) return true;
  if (path.startsWith('src/i18n/')) return true;
  if (/^types\.(ts|tsx)$/.test(basename) || /\.types\.(ts|tsx)$/.test(basename)) return true;
  if (/^utils\.(ts|tsx)$/.test(basename) || path.includes('/utils/')) return true;
  if (basename === 'contractFixtures.ts' || /Fixtures\.(ts|tsx)$/.test(basename)) return true;
  return false;
}

/**
 * Story/test HELPERS: anything under `src/stories/` that is not itself a
 * `*.stories.*` file — `interactions.ts`, `activityFixtures.ts`,
 * `decorators.ts`, mocks, test-utils. Every story in the folder tends to
 * import at least one of these, same shape as a hub file, so "this story
 * imports a helper that changed" carries almost no signal either. PR #517
 * changed `src/stories/interactions.ts` (it only added one function) and the
 * old direct pass promoted 8 unrelated stories to "changed" because of it.
 * Excluded from "own component" entirely — never a live canvas, only ever
 * reachable through the full transitive walk in `maybeAffected`.
 */
function isStoryHelperFile(path: string): boolean {
  return path.startsWith('src/stories/') && !isStoryFile(path);
}

interface PackageAlias {
  /** e.g. "@iterahq/activities" */
  name: string;
  /** e.g. "packages/activities/src" */
  srcDir: string;
}

function buildPackageAliasMap(fs: RepoFs): PackageAlias[] {
  const aliases: PackageAlias[] = [];
  for (const file of fs.listFiles('packages')) {
    if (!file.endsWith('/package.json')) continue;
    const pkgDir = file.slice(0, -'/package.json'.length);
    try {
      const parsed = JSON.parse(fs.readFile(file)) as { name?: string };
      if (parsed.name) {
        aliases.push({ name: parsed.name, srcDir: `${pkgDir}/src` });
      }
    } catch {
      // Malformed package.json isn't this script's problem to report.
    }
  }
  return aliases;
}

function extractImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(IMPORT_SPECIFIER_RE)) {
    const specifier = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (specifier) specifiers.push(specifier);
  }
  return specifiers;
}

function joinRepoPath(fromDir: string, relative: string): string {
  const segments = fromDir.split('/').filter(Boolean);
  for (const part of relative.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') segments.pop();
    else segments.push(part);
  }
  return segments.join('/');
}

function resolveFileCandidate(basePath: string, fs: RepoFs): string | undefined {
  if (RESOLVABLE_EXTENSIONS.some((ext) => basePath.endsWith(ext)) && fs.exists(basePath)) {
    return basePath;
  }
  for (const ext of RESOLVABLE_EXTENSIONS) {
    if (fs.exists(basePath + ext)) return basePath + ext;
  }
  for (const ext of RESOLVABLE_EXTENSIONS) {
    if (fs.exists(`${basePath}/index${ext}`)) return `${basePath}/index${ext}`;
  }
  return undefined;
}

/** A resolved import target: one file to keep walking, or a whole package
 *  source directory (see the "coarser than per-file" note in the docblock). */
type ResolvedImport = { kind: 'file'; path: string } | { kind: 'dir'; path: string };

function resolveImportPath(
  fromFile: string,
  specifier: string,
  fs: RepoFs,
  packageAliases: PackageAlias[],
): ResolvedImport | undefined {
  if (specifier.startsWith('.')) {
    const fromDir = fromFile.split('/').slice(0, -1).join('/');
    const joined = joinRepoPath(fromDir, specifier);
    const file = resolveFileCandidate(joined, fs);
    return file ? { kind: 'file', path: file } : undefined;
  }
  if (specifier.startsWith('@/')) {
    const file = resolveFileCandidate(`src/${specifier.slice(2)}`, fs);
    return file ? { kind: 'file', path: file } : undefined;
  }
  for (const alias of packageAliases) {
    if (specifier === alias.name) return { kind: 'dir', path: alias.srcDir };
    if (specifier.startsWith(`${alias.name}/`)) {
      const subpath = specifier.slice(alias.name.length + 1);
      const file = resolveFileCandidate(`${alias.srcDir}/${subpath}`, fs);
      return file ? { kind: 'file', path: file } : undefined;
    }
  }
  // Anything else (react, storybook, node builtins…) is an external package —
  // out of scope on purpose.
  return undefined;
}

/**
 * The files a story imports ONE hop away — no transitive walk — resolved to
 * a concrete file (never a whole-package `dir` alias) and with hub AND
 * story-helper files already filtered out. This is the candidate pool for
 * the basename fallback in `resolveOwnComponent`; see the module docblock.
 */
function directImportTargets(
  storyFile: string,
  source: string,
  fs: RepoFs,
  packageAliases: PackageAlias[],
): string[] {
  const targets: string[] = [];
  for (const specifier of extractImportSpecifiers(source)) {
    const resolved = resolveImportPath(storyFile, specifier, fs, packageAliases);
    if (!resolved || resolved.kind !== 'file') continue;
    if (isSharedHubFile(resolved.path) || isStoryHelperFile(resolved.path)) continue;
    targets.push(resolved.path);
  }
  return targets;
}

/** Basename without its story-file or component-file extension, for the
 *  `Foo.stories.tsx` ↔ `Foo.tsx` fallback match. */
function fileBaseName(path: string, ext: RegExp): string {
  const basename = path.split('/').pop() ?? '';
  return basename.replace(ext, '');
}

/**
 * Which import clause (if any) in `source` binds `identifier` — the
 * specifier of an `import { Foo } from '...'` / `import Foo from '...'` /
 * `import * as Foo from '...'` whose bound name matches. Used to trace a
 * CSF meta object's bare `component: Foo` back to a file.
 */
function findImportSpecifierForIdentifier(source: string, identifier: string): string | undefined {
  for (const match of source.matchAll(IMPORT_CLAUSE_RE)) {
    const clause = match[1];
    const specifier = match[2];
    const names = clause
      .replace(/[{}]/g, ' ')
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => {
        const asMatch = /\bas\s+([A-Za-z_$][\w$]*)/.exec(token);
        return asMatch ? asMatch[1] : token.split(/\s+/)[0];
      });
    if (names.includes(identifier)) return specifier;
  }
  return undefined;
}

/**
 * The BASENAME-only half of "own component": a direct (one-hop) import
 * target whose basename matches the story file's own basename
 * (`Foo.stories.tsx` ↔ `Foo.tsx`). Split out from `resolveOwnComponent` so
 * `detectChangedStories` can run it first, over EVERY story file, to build
 * the "claimed" set a dispatcher check needs — see there.
 */
function resolveBasenameOwnComponent(
  storyFile: string,
  fs: RepoFs,
  packageAliases: PackageAlias[],
): string | undefined {
  let source: string;
  try {
    source = fs.readFile(storyFile);
  } catch {
    return undefined;
  }
  const storyBase = fileBaseName(storyFile, STORY_FILE_RE);
  const targets = directImportTargets(storyFile, source, fs, packageAliases);
  return targets.find((target) => fileBaseName(target, /\.(tsx?|mdx)$/) === storyBase);
}

/**
 * A story's OWN component file — see the module docblock's "changed"
 * bullet. The basename match (`Foo.stories.tsx` ↔ `Foo.tsx`) is
 * authoritative when it exists: it means the story file directly imports a
 * same-named component, the strongest "this story is about that file"
 * signal there is. Only when there is NO basename match does the CSF meta
 * object's `component:` identifier get a say — resolved back through the
 * story file's own imports — and even then it's refused when it points at
 * a file `claimedByBasename` from a DIFFERENT story: that's exactly the
 * DISPATCHER shape (`ActivityRenderer.tsx`, declared as `component:` on
 * five unrelated activity-kind stories that merely render through it,
 * while `ActivityRenderer.stories.tsx` is its real, basename-matched, own
 * story). Without that check every one of those five would wrongly promote
 * whenever the dispatcher changes. Returns `undefined` when nothing
 * resolves to a concrete, non-hub, non-helper, unclaimed file — the story
 * can still land in `maybeAffected` via the full transitive walk.
 */
function resolveOwnComponent(
  storyFile: string,
  fs: RepoFs,
  packageAliases: PackageAlias[],
  claimedByBasename: Set<string>,
): string | undefined {
  const basenameMatch = resolveBasenameOwnComponent(storyFile, fs, packageAliases);
  if (basenameMatch) return basenameMatch;

  let source: string;
  try {
    source = fs.readFile(storyFile);
  } catch {
    return undefined;
  }

  const meta = parseStoryFileMeta(source);
  if (!meta.componentIdentifier) return undefined;
  const specifier = findImportSpecifierForIdentifier(source, meta.componentIdentifier);
  if (!specifier) return undefined;
  const resolved = resolveImportPath(storyFile, specifier, fs, packageAliases);
  if (resolved?.kind !== 'file') return undefined;
  if (isSharedHubFile(resolved.path) || isStoryHelperFile(resolved.path)) return undefined;
  if (claimedByBasename.has(resolved.path)) return undefined;
  return resolved.path;
}

/**
 * Number of `<Canvas>` elements `generate-nesta-pr-mdx.ts` would render for
 * this story file if it's live: one per exported story, or zero for an
 * `.mdx` page or a file whose `title` couldn't be parsed (those always
 * render as a link regardless of the `live` flag — see `renderStoryBlock`).
 */
function canvasCountFor(path: string, fs: RepoFs): number {
  if (path.endsWith('.mdx')) return 0;
  let source: string;
  try {
    source = fs.readFile(path);
  } catch {
    return 0;
  }
  const meta = parseStoryFileMeta(source);
  if (!meta.title) return 0;
  return meta.exportNames.length;
}

/**
 * True if `entryFile` transitively imports anything in `changedSet`, within
 * `MAX_IMPORT_DEPTH` hops. Used for the `maybeAffected` bucket — the coarse,
 * full-closure pass that v1 used to treat as the whole answer.
 */
function importsChangedFile(
  entryFile: string,
  fs: RepoFs,
  packageAliases: PackageAlias[],
  changedSet: Set<string>,
): boolean {
  const visited = new Set<string>();
  const queue: Array<{ target: ResolvedImport; depth: number }> = [
    { target: { kind: 'file', path: entryFile }, depth: 0 },
  ];

  while (queue.length > 0) {
    const { target, depth } = queue.shift()!;
    const visitKey = `${target.kind}:${target.path}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);

    if (target.kind === 'dir') {
      for (const changed of changedSet) {
        if (changed === target.path || changed.startsWith(`${target.path}/`)) return true;
      }
      continue;
    }

    if (changedSet.has(target.path)) return true;
    if (depth >= MAX_IMPORT_DEPTH) continue;

    let source: string;
    try {
      source = fs.readFile(target.path);
    } catch {
      continue;
    }
    for (const specifier of extractImportSpecifiers(source)) {
      const resolved = resolveImportPath(target.path, specifier, fs, packageAliases);
      if (resolved) queue.push({ target: resolved, depth: depth + 1 });
    }
  }
  return false;
}

export function detectChangedStories(
  changedFiles: ChangedFile[],
  fs: RepoFs,
): DetectChangedStoriesResult {
  const removed = changedFiles
    .filter((f) => f.status === 'D' && isStoryFile(f.path))
    .map((f) => f.path);

  const changedStoryFiles = changedFiles.filter((f) => f.status !== 'D' && isStoryFile(f.path));
  const newPaths = new Set(
    changedStoryFiles.filter((f) => f.status === 'A').map((f) => f.path),
  );
  const directFileChanged = changedStoryFiles
    .filter((f) => f.status !== 'A')
    .map((f) => f.path)
    .sort((a, b) => a.localeCompare(b));

  const changedSourceFiles = new Set(
    changedFiles
      .filter((f) => f.status !== 'D' && isWatchedSourceFile(f.path) && !isStoryFile(f.path))
      .map((f) => f.path),
  );

  const packageAliases = buildPackageAliasMap(fs);

  const allStoryFiles = new Set<string>([
    ...fs.listFiles('src').filter(isStoryFile),
    ...fs.listFiles('packages').filter(isStoryFile),
    ...fs.listFiles('design-playground').filter(isStoryFile),
  ]);
  // A story file removed in this diff no longer exists on disk — `listFiles`
  // (reading the current tree) already excludes it from `allStoryFiles`.

  const directFileChangedSet = new Set(directFileChanged);

  // Pass 1: every story file's basename-matched component, if any — the
  // "claimed" set `resolveOwnComponent` needs to refuse a dispatcher
  // component's `component:` identifier on a story that isn't its own.
  const claimedByBasename = new Set<string>();
  for (const storyPath of allStoryFiles) {
    const claim = resolveBasenameOwnComponent(storyPath, fs, packageAliases);
    if (claim) claimedByBasename.add(claim);
  }

  // Direct (one-hop) component pass: an unchanged story whose OWN component
  // (basename match, or — failing that — the meta `component:` identifier)
  // resolves to a file that changed. Narrower than "imports the changed
  // file at all" on purpose — see the module docblock's dispatcher note.
  const componentDirect: string[] = [];
  if (changedSourceFiles.size > 0) {
    for (const storyPath of allStoryFiles) {
      if (newPaths.has(storyPath) || directFileChangedSet.has(storyPath)) continue;
      const own = resolveOwnComponent(storyPath, fs, packageAliases, claimedByBasename);
      if (own && changedSourceFiles.has(own)) componentDirect.push(storyPath);
    }
    componentDirect.sort((a, b) => a.localeCompare(b));
  }

  // Directly-edited story files come first — editing the story itself is
  // the strongest signal — then component-triggered ones. Live budget
  // applies to the combined "changed" list.
  const changedCandidates = [...directFileChanged, ...componentDirect];

  // Canvas budget: `new` entries (sorted for determinism) are prioritized
  // over `changed` entries, both walked in one priority order against a
  // single running total of `<Canvas>` elements (one per exported story).
  // Once a story's own count would push the total over `CANVAS_CAP`, that
  // story and everything after it in priority order is `live: false`.
  const newPathsSorted = Array.from(newPaths).sort((a, b) => a.localeCompare(b));
  const priorityOrder: Array<{ path: string; verdict: StoryVerdict }> = [
    ...newPathsSorted.map((path) => ({ path, verdict: 'new' as const })),
    ...changedCandidates.map((path) => ({ path, verdict: 'changed' as const })),
  ];

  let canvasesUsed = 0;
  let overBudget = false;
  const budgeted: AffectedStory[] = priorityOrder.map(({ path, verdict }) => {
    const count = overBudget ? 0 : canvasCountFor(path, fs);
    if (!overBudget && canvasesUsed + count <= CANVAS_CAP) {
      canvasesUsed += count;
      return { path, verdict, live: true };
    }
    overBudget = true;
    return { path, verdict, live: false };
  });

  const affected = budgeted.sort((a, b) => a.path.localeCompare(b.path));

  // Everything else the full transitive closure still reaches — 2+ hops, or
  // only reachable through a coarse whole-package alias.
  const alreadyClassified = new Set<string>([...newPaths, ...changedCandidates]);
  const maybeAffected: string[] = [];
  if (changedSourceFiles.size > 0) {
    for (const storyPath of allStoryFiles) {
      if (alreadyClassified.has(storyPath)) continue;
      if (importsChangedFile(storyPath, fs, packageAliases, changedSourceFiles)) {
        maybeAffected.push(storyPath);
      }
    }
    maybeAffected.sort((a, b) => a.localeCompare(b));
  }

  // Changed .tsx files under src/ or packages/ that NO story reaches at
  // all — not even through the coarse package-alias/transitive walk. Using
  // the full closure (not just the direct pass) matters in a monorepo: a
  // story importing `@iterahq/activities` (a bare package specifier, which
  // resolves to a whole `dir`, not one file — see `resolveImportPath`)
  // legitimately covers everything under that package's `src/`, even though
  // it isn't a "direct" one-hop target. The #532 case (`LessonCompleteCard.tsx`)
  // has no story reaching it by either path, so it still surfaces here.
  const orphanCandidates = Array.from(changedSourceFiles).filter(
    (path) => path.endsWith('.tsx') && !isTestFile(path),
  );
  const orphanVisualFiles = orphanCandidates
    .filter((candidate) => {
      const singleTarget = new Set([candidate]);
      return !Array.from(allStoryFiles).some((storyPath) =>
        importsChangedFile(storyPath, fs, packageAliases, singleTarget),
      );
    })
    .sort((a, b) => a.localeCompare(b));

  return { affected, maybeAffected, orphanVisualFiles, removed };
}
