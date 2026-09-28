#!/usr/bin/env tsx
/**
 * generate-nesta-pr-mdx.ts — CLI entry point for the "🆕 Nesta PR" Storybook
 * page (see `docs/storybook-nesta-pr.md` if that doc exists, else CLAUDE.md's
 * Storybook section).
 *
 * Runs BEFORE `npm run build-storybook`, ONLY on a PR build
 * (`.github/workflows/storybook.yml`, gated on `STORYBOOK_PR_NUMBER`). It:
 *
 *   1. diffs the working tree against the PR's base branch;
 *   2. asks `detectChangedStories` (storybook-changed-stories.ts) which
 *      stories are new/changed (live-capped), which are only reachable
 *      through the deeper transitive closure ("maybe affected"), and which
 *      changed `.tsx` files have no story at all ("orphan visual files");
 *   3. writes `.storybook/generated/nesta-pr.mdx` — a Storybook docs page
 *      that renders LIVE `<Canvas of={...}>` for the live-budget entries,
 *      plain links for everything else, and is sorted first in the sidebar
 *      by `.storybook/preview.ts`'s `storySort`;
 *   4. writes `.storybook/generated/nesta-pr.affected.json` — the same data
 *      as plain JSON, consumed after the build by
 *      `storybook-pr-comment.ts` (which needs the REAL story ids from
 *      `storybook-static/index.json`, not available yet at this point).
 *
 * Both output files are gitignored and MUST NOT exist outside a PR build —
 * `deploy-storybook.yml` (the `main` branch build) never runs this script,
 * so the section simply doesn't exist there.
 *
 * Usage: STORYBOOK_PR_NUMBER=123 tsx scripts/generate-nesta-pr-mdx.ts
 * Env:
 *   STORYBOOK_PR_NUMBER  required — if unset/empty, exits 0 and writes nothing.
 *   STORYBOOK_BASE_REF   optional — defaults to "origin/main".
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  detectChangedStories,
  MAYBE_AFFECTED_CAP,
  parseGitDiffNameStatus,
  type AffectedStory,
} from './storybook-changed-stories';
import { parseStoryFileMeta } from './storybook-story-meta';
import { toStoryIdForMeta } from './storybook-story-id';
import { createRepoFs } from './repo-fs';

const REPO_ROOT = join(import.meta.dirname, '..');
const OUTPUT_DIR = join(REPO_ROOT, '.storybook', 'generated');
const MDX_PATH = join(OUTPUT_DIR, 'nesta-pr.mdx');
const MANIFEST_PATH = join(OUTPUT_DIR, 'nesta-pr.affected.json');

interface AffectedStoryWithMeta extends AffectedStory {
  title: string | undefined;
  explicitId: string | undefined;
  exportNames: string[];
  isMdx: boolean;
}

function gitDiffNameStatus(baseRef: string): string {
  return execFileSync('git', ['diff', '--name-status', `${baseRef}...HEAD`], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

function moduleVarName(index: number): string {
  return `Mod${index}`;
}

function importPathFor(repoRelativePath: string): string {
  return `../../${repoRelativePath}`;
}

/**
 * MDX treats `<`, `{` and `}` as syntax (JSX tag open / expression
 * delimiters) even OUTSIDE a code fence, wherever plain markdown text gets
 * interpolated in — a story `title` used as a heading with any of those
 * characters would otherwise corrupt the generated page instead of just
 * rendering oddly.
 *
 * Only for text that lands OUTSIDE a backtick code span (a heading). Text
 * inside a code span (a repo path, always rendered as `` `${pathLabel}` ``
 * below) must NOT go through this — a code span is already literal in MDX,
 * same as CommonMark, so escaping it here would print the backslash too
 * (`\{` visible in the rendered page instead of a literal `{`).
 */
function escapeMdxHeading(text: string): string {
  return text.replace(/[<{}]/g, (ch) => `\\${ch}`);
}

function renderStoryBlock(
  story: AffectedStoryWithMeta,
  index: number,
): { imports: string; body: string } {
  const heading = escapeMdxHeading(story.title ?? story.path);
  // Not escaped — always rendered inside a backtick code span, which is
  // already literal text in MDX.
  const pathLabel = story.path;

  if (story.isMdx || !story.title) {
    // No regex-friendly title/exports to build a <Canvas> from — link out.
    return {
      imports: '',
      body: [
        `### ${heading}`,
        '',
        `\`${pathLabel}\``,
        '',
        story.isMdx
          ? '_Página MDX — abra pelo menu lateral para ver o conteúdo._'
          : '_Não foi possível ler o `title` desta story automaticamente — abra pelo menu lateral._',
        '',
      ].join('\n'),
    };
  }

  if (!story.live) {
    // Past the live-canvas budget (CANVAS_CAP) — link instead of embedding.
    return {
      imports: '',
      body: [
        `### ${heading}`,
        '',
        `\`${pathLabel}\` — _fora do orçamento de canvas ao vivo desta PR, abra pelo menu lateral._`,
        '',
      ].join('\n'),
    };
  }

  const varName = moduleVarName(index);
  const imports = `import * as ${varName} from '${importPathFor(story.path)}';\n`;

  const exportBlocks =
    story.exportNames.length > 0
      ? story.exportNames
          .map((exportName) => {
            const id = toStoryIdForMeta(
              { title: story.title as string, explicitId: story.explicitId },
              exportName,
            );
            return [
              `#### ${exportName}`,
              '',
              `<Canvas of={${varName}.${exportName}} />`,
              '',
              `[Abrir isolado](?path=/story/${id})`,
              '',
            ].join('\n');
          })
          .join('\n')
      : `_Nenhuma story exportada foi encontrada neste arquivo — abra \`${pathLabel}\` pelo menu lateral._\n`;

  const body = [`### ${heading}`, '', `\`${pathLabel}\``, '', exportBlocks].join('\n');

  return { imports, body };
}

function renderCollapsedPathList(paths: string[], cap: number): string {
  const shown = paths.slice(0, cap);
  const overflow = paths.length - shown.length;
  const lines = shown.map((path) => `- \`${path}\``);
  if (overflow > 0) lines.push(`- _+${overflow} mais — veja o diff completo da PR._`);
  return lines.join('\n');
}

function buildMdx(
  prNumber: string,
  affected: AffectedStoryWithMeta[],
  maybeAffected: string[],
  orphanVisualFiles: string[],
  removed: string[],
): string {
  const novas = affected.filter((s) => s.verdict === 'new');
  const alteradas = affected.filter((s) => s.verdict === 'changed');

  const imports: string[] = [`import { Meta, Canvas } from '@storybook/addon-docs/blocks';`];
  const sections: string[] = [];

  let index = 0;
  const renderGroup = (emptyLabel: string, group: AffectedStoryWithMeta[]): string => {
    if (group.length === 0) return `_Nenhuma story ${emptyLabel} nesta PR._\n`;
    return group
      .map((story) => {
        const { imports: storyImports, body } = renderStoryBlock(story, index++);
        if (storyImports) imports.push(storyImports.trimEnd());
        return body;
      })
      .join('\n---\n\n');
  };

  if (orphanVisualFiles.length > 0) {
    sections.push(
      [
        '## ⚠️ Mudou mas não tem story',
        '',
        'Estes arquivos `.tsx` mudaram nesta PR e nenhuma story importa o',
        'componente diretamente — não há canvas para mostrar.',
        '',
        renderCollapsedPathList(orphanVisualFiles, orphanVisualFiles.length),
      ].join('\n'),
    );
  }

  sections.push(`## 🟢 Novas\n\n${renderGroup('nova', novas)}`);
  sections.push(`## 🟡 Alteradas\n\n${renderGroup('alterada', alteradas)}`);

  if (maybeAffected.length > 0) {
    sections.push(
      [
        '## 🟣 Talvez afetadas',
        '',
        '<details>',
        '<summary>',
        `Fecho transitivo mais fundo (import indireto, ou alias de pacote inteiro) — sem canvas, ${maybeAffected.length} arquivo${maybeAffected.length === 1 ? '' : 's'}`,
        '</summary>',
        '',
        renderCollapsedPathList(maybeAffected, MAYBE_AFFECTED_CAP),
        '',
        '</details>',
      ].join('\n'),
    );
  }

  if (removed.length > 0) {
    sections.push(
      `## 🔴 Removidas\n\nEstas stories existiam em \`main\` e não existem mais nesta PR:\n\n${removed
        .map((path) => `- \`${path}\``)
        .join('\n')}\n`,
    );
  }

  const nothingAffected = affected.length === 0 && orphanVisualFiles.length === 0;
  const emptyNote = nothingAffected
    ? `\nNenhuma story ou arquivo visual foi detectado como novo ou alterado nesta PR.\n`
    : '';

  return [
    imports.join('\n'),
    '',
    `<Meta title="🆕 Nesta PR #${prNumber}" />`,
    '',
    `# 🆕 Nesta PR #${prNumber}`,
    '',
    'O que esta PR adiciona ou altera no Storybook — sem precisar procurar na',
    'árvore Atoms/Molecules/Organisms.',
    emptyNote,
    ...sections,
  ].join('\n');
}

function writeManifest(
  prNumber: string,
  affected: AffectedStoryWithMeta[],
  maybeAffected: string[],
  orphanVisualFiles: string[],
  removed: string[],
): void {
  const manifest = {
    prNumber,
    generatedAt: new Date().toISOString(),
    affected: affected.map((story) => ({
      path: story.path,
      verdict: story.verdict,
      live: story.live,
      title: story.title ?? null,
      exportNames: story.exportNames,
    })),
    maybeAffected,
    orphanVisualFiles,
    removed,
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

function main(): void {
  const prNumber = process.env.STORYBOOK_PR_NUMBER?.trim();

  // Outside a PR build there is no section — and no leftover from a previous
  // local run should ship either.
  rmSync(OUTPUT_DIR, { recursive: true, force: true });

  if (!prNumber) {
    console.log('[generate-nesta-pr-mdx] STORYBOOK_PR_NUMBER not set — skipping (not a PR build).');
    return;
  }

  const baseRef = process.env.STORYBOOK_BASE_REF?.trim() || 'origin/main';
  const diffOutput = gitDiffNameStatus(baseRef);
  const changedFiles = parseGitDiffNameStatus(diffOutput);

  const fs = createRepoFs(REPO_ROOT);
  const { affected, maybeAffected, orphanVisualFiles, removed } = detectChangedStories(
    changedFiles,
    fs,
  );

  const affectedWithMeta: AffectedStoryWithMeta[] = affected.map((story) => {
    const isMdx = story.path.endsWith('.mdx');
    if (isMdx) {
      return { ...story, title: undefined, explicitId: undefined, exportNames: [], isMdx };
    }
    const meta = parseStoryFileMeta(fs.readFile(story.path));
    return {
      ...story,
      title: meta.title,
      explicitId: meta.explicitId,
      exportNames: meta.exportNames,
      isMdx,
    };
  });

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    MDX_PATH,
    buildMdx(prNumber, affectedWithMeta, maybeAffected, orphanVisualFiles, removed),
    'utf-8',
  );
  writeManifest(prNumber, affectedWithMeta, maybeAffected, orphanVisualFiles, removed);

  const liveStories = affectedWithMeta.filter((s) => s.live);
  const liveCanvasCount = liveStories.reduce(
    (sum, s) => sum + (s.isMdx || !s.title ? 0 : s.exportNames.length),
    0,
  );
  console.log(
    `[generate-nesta-pr-mdx] PR #${prNumber}: ${affected.length} affected stor${
      affected.length === 1 ? 'y' : 'ies'
    } (${liveStories.length} live, ${liveCanvasCount} canvas${liveCanvasCount === 1 ? '' : 'es'}), ${
      maybeAffected.length
    } maybe-affected, ${orphanVisualFiles.length} orphan visual file(s), ${
      removed.length
    } removed. Wrote ${MDX_PATH}.`,
  );
}

main();
