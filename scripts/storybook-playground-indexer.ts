/**
 * storybook-playground-indexer.ts — `experimental_indexers` entry
 * (`.storybook/main.ts`) that stamps every Design Playground story with a
 * `playground-order:<score>` tag (see `storybook-playground-order.ts`), so
 * `.storybook/preview.tsx`'s `storySort` can read it back and sort the
 * group "send order, most recent first" without importing anything (it
 * can't — see that module's docblock).
 *
 * Delegates the actual CSF parsing to Storybook's own default indexer
 * (`loadCsf`, same one `csfIndexer` in `storybook/internal/core-server`
 * uses) and only ADDS a tag to each returned `IndexInput` — it never
 * reinterprets the file itself, so args/decorators/parameters/play on the
 * real stories are untouched.
 *
 * Runs for every CSF file but only tags two kinds:
 *   - any file whose stories are titled `Design Playground` or
 *     `Design Playground/...`, wherever it lives (`design-playground/**` or
 *     `src/**`) — real send order from `git log`.
 *   - `.storybook/generated/**\/*.stories.@(ts|tsx)` — PR re-exports written
 *     by `generate-nesta-pr-stories.ts` (gitignored, PR builds only);
 *     always sorted to the top via `generatedPrEntryScore`.
 * Every other file is returned as the default indexer parsed it, so it falls
 * through to `storySort`'s existing alphabetical branch.
 */
import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import type { Indexer, IndexInput } from 'storybook/internal/types';
import { loadCsf } from 'storybook/internal/csf-tools';
import { buildOrderTag, computeSendOrderScore, generatedPrEntryScore } from './storybook-playground-order';
import { getSendOrderDates } from './storybook-playground-git-dates';

const GENERATED_RE = /^\.storybook\/generated\//;
const DESIGN_PLAYGROUND_TITLE = 'Design Playground';

export const PLAYGROUND_INDEXER_TEST = /\.stories\.(m?js|ts)x?$/;

export function isDesignPlaygroundTitle(title: string | undefined): boolean {
  return title === DESIGN_PLAYGROUND_TITLE || (title ?? '').startsWith(`${DESIGN_PLAYGROUND_TITLE}/`);
}

/** Exported for `storybook-playground-indexer.test.ts` — the one piece of
 *  this module that's pure enough to unit test without a real CSF file or a
 *  git checkout. */
export function injectOrderTag(indexInputs: IndexInput[], tag: string): IndexInput[] {
  return indexInputs.map((input) => ({ ...input, tags: [...(input.tags ?? []), tag] }));
}

/**
 * Score for one story FILE (not per exported story — every story in the
 * same file shares the file's send order). `generatedIndex` tracks how many
 * `.storybook/generated/*.stories.*` files this process has already scored,
 * so several PR re-exports keep a stable relative order at the top —
 * imperative counter is fine here, each `createIndex` call is for one file.
 */
export function createPlaygroundIndexer(repoRoot: string): Indexer {
  let generatedCount = 0;
  return {
    test: PLAYGROUND_INDEXER_TEST,
    createIndex: async (fileName, options) => {
      const code = await readFile(fileName, 'utf-8');
      const { indexInputs } = loadCsf(code, { ...options, fileName }).parse();
      const repoRelativePath = relative(repoRoot, fileName).split('\\').join('/');

      if (GENERATED_RE.test(repoRelativePath)) {
        return injectOrderTag(indexInputs, buildOrderTag(generatedPrEntryScore(generatedCount++)));
      }
      if (!indexInputs.some((input) => isDesignPlaygroundTitle(input.title))) return indexInputs;

      const score = computeSendOrderScore(getSendOrderDates(repoRoot, repoRelativePath));

      return injectOrderTag(indexInputs, buildOrderTag(score));
    },
  };
}
