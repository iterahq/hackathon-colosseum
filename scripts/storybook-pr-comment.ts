#!/usr/bin/env tsx
/**
 * storybook-pr-comment.ts — builds the "Mudou nesta PR" markdown block that
 * `.github/workflows/storybook.yml` appends to its `<!-- storybook-preview -->`
 * PR comment.
 *
 * Runs AFTER `npm run build-storybook`, because it needs the REAL story ids
 * from `storybook-static/index.json` — the generator
 * (`generate-nesta-pr-stories.ts`) runs BEFORE the build and only knows the
 * GENERATED file's title, not the id Storybook's own `toId()` assigns to it.
 *
 * The "Depois" link now opens the first NEW (falling back to first CHANGED)
 * generated story directly — there is no longer a standalone "🆕 Nesta PR"
 * docs page; the stories live for real inside
 * `Design Playground/🆕 PR #<n>/...` (see `generate-nesta-pr-stories.ts` and
 * `storybook-playground-indexer.ts`). When nothing was generated at all
 * (nothing affected, or everything was skipped), it falls back to the
 * preview root.
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
 *   .storybook/generated/nesta-pr.manifest.json  (written by generate-nesta-pr-stories.ts)
 *   storybook-static/index.json                  (written by build-storybook)
 * Prints ONE line of JSON to stdout: `{ "depoisUrl": string, "changedSection":
 * string }`. Prints `{}` (exit 0) when the manifest is absent — e.g. a
 * `main`-branch build never has one.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAYBE_AFFECTED_CAP } from './storybook-changed-stories';
import type { GeneratedManifestEntry, NestaPrManifest, SkipReason } from './generate-nesta-pr-stories';

const REPO_ROOT = join(import.meta.dirname, '..');
const MANIFEST_PATH = join(REPO_ROOT, '.storybook', 'generated', 'nesta-pr.manifest.json');
const INDEX_PATH = join(REPO_ROOT, 'storybook-static', 'index.json');

/** GitHub issue/PR comment body hard limit is 65,536 chars; stay well under it. */
const SAFE_COMMENT_CHAR_CAP = 60_000;

const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  mdx: 'página `.mdx`, sem export para reexportar',
  'no-default-export': 'sem `title` legível no export default',
};

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
  for (const entry of Object.values(index.entries)) {
    if (entry.type !== 'story') continue;
    const path = normalizeImportPath(entry.importPath);
    const list = entriesByPath.get(path) ?? [];
    list.push(entry);
    entriesByPath.set(path, list);
  }

  const renderEntry = (story: GeneratedManifestEntry): string[] => {
    const label = story.verdict === 'new' ? 'nova' : 'alterada';
    const matches = (entriesByPath.get(story.generatedPath) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    if (matches.length === 0) {
      return [`- \`${story.path}\` (${label})`];
    }
    return matches.map(
      (entry) =>
        `- [${escapeMd(story.title)} — ${escapeMd(entry.name)}](${previewBase}/?path=/story/${entry.id}) (${label})`,
    );
  };

  const novas = manifest.generated.filter((s) => s.verdict === 'new');
  const alteradas = manifest.generated.filter((s) => s.verdict === 'changed');

  const lines: string[] = ['**Mudou nesta PR:**', ''];
  lines.push(`${novas.length} nova${novas.length === 1 ? '' : 's'} · ${alteradas.length} alterada${alteradas.length === 1 ? '' : 's'}`, '');

  if (manifest.orphanVisualFiles.length > 0) {
    lines.push('**⚠️ Mudou mas não tem story:**', '');
    lines.push(...manifest.orphanVisualFiles.map((path) => `- \`${path}\``));
    lines.push('');
  }

  if (manifest.generated.length === 0) {
    lines.push('_Nenhuma story nova ou alterada detectada._');
  } else {
    for (const story of manifest.generated) {
      lines.push(...renderEntry(story));
    }
  }

  if (manifest.skipped.length > 0) {
    lines.push('', '**⚠️ Não deu pra gerar preview ao vivo:**', '');
    lines.push(
      ...manifest.skipped.map(
        (s) => `- \`${s.path}\` — ${SKIP_REASON_LABEL[s.reason]}`,
      ),
    );
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

  const depoisUrl = resolveDepoisUrl(previewBase, novas, alteradas, entriesByPath);

  return { depoisUrl, changedSection };
}

/** Opens the first NEW generated story directly, falling back to the first
 *  CHANGED one, then to the preview root when nothing was generated. */
function resolveDepoisUrl(
  previewBase: string,
  novas: GeneratedManifestEntry[],
  alteradas: GeneratedManifestEntry[],
  entriesByPath: Map<string, StorybookIndexEntry[]>,
): string {
  for (const story of [...novas, ...alteradas]) {
    const matches = entriesByPath.get(story.generatedPath) ?? [];
    if (matches.length > 0) {
      const first = [...matches].sort((a, b) => a.name.localeCompare(b.name))[0];
      return `${previewBase}/?path=/story/${first.id}`;
    }
  }
  return previewBase;
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
