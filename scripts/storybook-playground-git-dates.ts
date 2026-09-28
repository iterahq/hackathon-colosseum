/**
 * storybook-playground-git-dates.ts — the real `git log` backing for
 * `SendOrderDates` (see `storybook-playground-order.ts`). Split out so the
 * score math stays pure/testable and this file is the one place that
 * actually shells out.
 *
 * `--diff-filter=A -1` walks the WHOLE history to find the single commit
 * that first added the file — a shallow clone without enough depth simply
 * finds nothing (`execFileSync` returns an empty string, not an error), so
 * the CI checkout step needs `fetch-depth: 0` (or equivalent) for this to
 * resolve real dates instead of silently falling back to `undefined` /
 * "no record" (see `.github/workflows/storybook.yml` and
 * `deploy-storybook.yml`).
 */
import { execFileSync } from 'node:child_process';
import type { SendOrderDates } from './storybook-playground-order';

function runGitLog(repoRoot: string, args: string[]): string | undefined {
  try {
    const out = execFileSync('git', args, { cwd: repoRoot, encoding: 'utf-8' }).trim();
    return out.length > 0 ? out.split('\n')[0] : undefined;
  } catch {
    return undefined;
  }
}

/** `repoRelativePath` uses forward slashes, matching the rest of this repo's
 *  `RepoFs`-based tooling (`storybook-changed-stories.ts`). */
export function getSendOrderDates(repoRoot: string, repoRelativePath: string): SendOrderDates {
  const addedAt = runGitLog(repoRoot, [
    'log',
    '--follow',
    '--diff-filter=A',
    '--format=%cI',
    '-1',
    '--',
    repoRelativePath,
  ]);
  const modifiedAt = runGitLog(repoRoot, ['log', '--format=%cI', '-1', '--', repoRelativePath]);
  return { addedAt, modifiedAt };
}
