/**
 * repo-fs.ts — the real `node:fs` backing for `RepoFs` (see
 * `storybook-changed-stories.ts`). Split out so that module stays pure and
 * testable with an in-memory fixture, while this file is the one place that
 * actually walks the working tree.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { RepoFs } from './storybook-changed-stories';

const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', '.git', 'storybook-static']);

function walk(repoRoot: string, dir: string, out: string[]): void {
  const abs = join(repoRoot, dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry)) continue;
    const relPath = dir ? `${dir}/${entry}` : entry;
    const absPath = join(repoRoot, relPath);
    const stat = statSync(absPath);
    if (stat.isDirectory()) {
      walk(repoRoot, relPath, out);
    } else if (stat.isFile()) {
      out.push(relPath);
    }
  }
}

export function createRepoFs(repoRoot: string): RepoFs {
  return {
    exists: (path) => existsSync(join(repoRoot, path)),
    readFile: (path) => readFileSync(join(repoRoot, path), 'utf-8'),
    listFiles: (dir) => {
      const out: string[] = [];
      walk(repoRoot, dir, out);
      return out;
    },
  };
}
