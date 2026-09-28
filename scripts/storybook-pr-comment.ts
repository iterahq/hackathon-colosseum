#!/usr/bin/env tsx
/**
 * storybook-pr-comment.ts — builds the "Mudou nesta PR" markdown block that
 * `.github/workflows/storybook.yml` appends to its `<!-- storybook-preview -->`
 * PR comment.
 *
 * Runs AFTER `npm run build-storybook`, because it needs the REAL story ids
 * from `storybook-static/index.json` — the MDX generator
 * (`generate-nesta-pr-mdx.ts`) runs BEFORE the build and only has its own
 * best-effort id (see `storybook-story-id.ts`), which this script does not
 * reuse on purpose: the built index is the ground truth.
 *
 * GitHub's issue/PR comment body is capped at 65,536 characters — `gh api
 * PATCH` fails outright past that, which is exactly what happened on PR #517
 * (68,027 chars) back when every transitively-affected story rendered as its
 * own line. `SAFE_COMMENT_CHAR_CAP` truncates the changed-section body with a
 * "+N more, see the full preview" note well before that hard limit, so a
 * pathological diff degrades the comment instead of failing the workflow
 * step outright.
 *
 * Usage:
 *   tsx scripts/storybook-pr-comment.ts <preview-base-url>
 * Reads:
 *   .storybook/generated/nesta-pr.affected.json  (written by generate-nesta-pr-mdx.ts)
 *   storybook-static/index.json                  (written by build-storybook)
 * Prints ONE line of JSON to stdout: `{ "depoisUrl": string, "changedSection":
 * string }` — `depoisUrl` points straight at the built "🆕 Nesta PR" docs
 * page (falls back to `previewBase` if that entry isn't in the index for
 * some reason). Prints `{}` (exit 0) when the manifest is absent — e.g. a
 * `main`-branch build never has one.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAYBE_AFFECTED_CAP } from './storybook-changed-stories';

const REPO_ROOT = join(import.meta.dirname, '..');
const MANIFEST_PATH = join(REPO_ROOT, '.storybook', 'generated', 'nesta-pr.affected.json');
const INDEX_PATH = join(REPO_ROOT, 'storybook-static', 'index.json');

/** GitHub issue/PR comment body hard limit is 65,536 chars; stay well under it. */
const SAFE_COMMENT_CHAR_CAP = 60_000;

interface AffectedManifestEntry {
  path: string;
  verdict: 'new' | 'changed';
  live: boolean;
  title: string | null;
  exportNames: string[];
}

interface NestaPrManifest {
  prNumber: string;
  affected: AffectedManifestEntry[];
  maybeAffected: string[];
  orphanVisualFiles: string[];
  removed: string[];
}

interface StorybookIndexEntry {
  id: string;
  title: string;
  name: string;
  importPath: string;
  type?: string;
}

interface StorybookIndex {
  entries: Record<string, StorybookIndexEntry>;
}

/** `storybook-static/index.json` paths are repo-relative with a leading `./`. */
function normalizeImportPath(importPath: string): string {
  return importPath.startsWith('./') ? importPath.slice(2) : importPath;
}

/**
 * Escapes characters that would otherwise break markdown LINK TEXT (a story
 * `title`/`name` is untrusted free text here) — `[`, `]` would close the
 * link-text span early, `|` matters inside a table cell.
 *
 * Deliberately NOT used on a repo path: every path below is rendered inside
 * a backtick code span (`` `${path}` ``), and a code span is already
 * literal text in CommonMark — backslash-escaping a backtick INSIDE one
 * doesn't un-terminate it (there's no such escape), it just prints a stray
 * `\` in the comment.
 */
function escapeMd(text: string): string {
  return text.replace(/[[\]|]/g, (ch) => `\\${ch}`);
}

export interface PrCommentBlock {
  depoisUrl: string;
  changedSection: string;
}

/**
 * Keeps whole lines up to `capChars`, then appends a truncation note instead
 * of cutting mid-line (mid-line would risk an unterminated markdown link or
 * code span). Also tracks `<details>`/`</details>` balance as it goes — the
 * "Talvez afetadas" section opens one — and closes any still-open tag right
 * after the truncation note, so a mid-`<details>` cut never leaves the rest
 * of the GitHub comment (or the next section) rendered as blockquoted plain
 * text inside a dangling collapsible.
 */
export function truncateLines(lines: string[], capChars: number): string[] {
  let total = 0;
  let openDetails = 0;
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cost = line.length + 1; // +1 for the joining newline
    if (total + cost > capChars) {
      const omitted = lines.length - i;
      kept.push('', `_+${omitted} linha${omitted === 1 ? '' : 's'} a mais no preview completo._`);
      for (let k = 0; k < openDetails; k++) kept.push('', '</details>');
      return kept;
    }
    kept.push(line);
    total += cost;
    const trimmed = line.trim();
    if (trimmed.startsWith('<details>')) openDetails++;
    else if (trimmed.startsWith('</details>')) openDetails = Math.max(0, openDetails - 1);
  }
  return kept;
}

export function buildPrCommentBlock(
  previewBase: string,
  manifest: NestaPrManifest,
  index: StorybookIndex,
): PrCommentBlock {
  const entriesByPath = new Map<string, StorybookIndexEntry[]>();
  let nestaPrDocsId: string | undefined;

  for (const entry of Object.values(index.entries)) {
    if (entry.type === 'docs' && entry.title.startsWith('🆕 Nesta PR')) {
      nestaPrDocsId = entry.id;
      continue;
    }
    if (entry.type !== 'story') continue;
    const path = normalizeImportPath(entry.importPath);
    const list = entriesByPath.get(path) ?? [];
    list.push(entry);
    entriesByPath.set(path, list);
  }

  const renderEntry = (story: AffectedManifestEntry): string[] => {
    const label = story.verdict === 'new' ? 'nova' : 'alterada';
    const matches = (entriesByPath.get(story.path) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    if (matches.length === 0) {
      return [`- \`${story.path}\` (${label})`];
    }
    return matches.map(
      (entry) =>
        `- [${escapeMd(entry.title)} — ${escapeMd(entry.name)}](${previewBase}/?path=/story/${entry.id}) (${label})`,
    );
  };

  const novas = manifest.affected.filter((s) => s.verdict === 'new');
  const alteradas = manifest.affected.filter((s) => s.verdict === 'changed');
  const liveCount = manifest.affected.filter((s) => s.live).length;
  const linkOnlyCount = manifest.affected.length - liveCount;

  const lines: string[] = ['**Mudou nesta PR:**', ''];
  lines.push(
    `${novas.length} nova${novas.length === 1 ? '' : 's'} · ${alteradas.length} alterada${
      alteradas.length === 1 ? '' : 's'
    }${linkOnlyCount > 0 ? ` (${linkOnlyCount} só link, fora do orçamento ao vivo)` : ''}`,
    '',
  );

  if (manifest.orphanVisualFiles.length > 0) {
    lines.push('**⚠️ Mudou mas não tem story:**', '');
    lines.push(...manifest.orphanVisualFiles.map((path) => `- \`${path}\``));
    lines.push('');
  }

  if (manifest.affected.length === 0) {
    lines.push('_Nenhuma story nova ou alterada detectada._');
  } else {
    for (const story of manifest.affected) {
      lines.push(...renderEntry(story));
    }
  }

  if (manifest.maybeAffected.length > 0) {
    const shown = manifest.maybeAffected.slice(0, MAYBE_AFFECTED_CAP);
    const overflow = manifest.maybeAffected.length - shown.length;
    lines.push(
      '',
      `<details><summary>Talvez afetadas (fecho transitivo, sem canvas) — ${manifest.maybeAffected.length}</summary>`,
      '',
      ...shown.map((path) => `- \`${path}\``),
      ...(overflow > 0 ? [`- _+${overflow} mais_`] : []),
      '',
      '</details>',
    );
  }

  if (manifest.removed.length > 0) {
    lines.push('', '**Removidas:**', '');
    lines.push(...manifest.removed.map((path) => `- \`${path}\``));
  }

  const changedSection = truncateLines(lines, SAFE_COMMENT_CHAR_CAP).join('\n');

  const depoisUrl = nestaPrDocsId ? `${previewBase}/?path=/docs/${nestaPrDocsId}` : previewBase;

  return { depoisUrl, changedSection };
}

function main(): void {
  const previewBase = process.argv[2];
  if (!previewBase) {
    console.error('Usage: tsx scripts/storybook-pr-comment.ts <preview-base-url>');
    process.exit(1);
  }
  if (!existsSync(MANIFEST_PATH) || !existsSync(INDEX_PATH)) {
    // Not a PR build, or the generator step didn't run — print nothing.
    console.log('{}');
    return;
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as NestaPrManifest;
  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf-8')) as StorybookIndex;
  console.log(JSON.stringify(buildPrCommentBlock(previewBase, manifest, index)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
