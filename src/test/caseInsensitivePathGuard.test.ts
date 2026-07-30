import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Two files in one directory whose names differ only by case are fine on Linux
// (dev box + CI) and fatal on macOS/Windows: Vite resolves the import to
// whichever the case-insensitive filesystem matches first, so the app fails to
// boot for half the team. This guard makes that a red test everywhere.
const ROOT = resolve(__dirname, '..', '..');
const SCANNED = ['src', 'design-playground', 'e2e', 'scripts'];
const SKIP = new Set(['node_modules', 'dist', '.git', 'storybook-static', 'vendor']);

function collisionsIn(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const seen = new Map<string, string>();
  const found: string[] = [];

  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const lower = entry.name.toLowerCase();
    const previous = seen.get(lower);
    if (previous) found.push(`${dir}: ${previous} vs ${entry.name}`);
    else seen.set(lower, entry.name);
    if (entry.isDirectory()) found.push(...collisionsIn(join(dir, entry.name)));
  }

  return found;
}

describe('paths never collide case-insensitively', () => {
  it.each(SCANNED)('%s has no two entries differing only by case', (folder) => {
    expect(collisionsIn(join(ROOT, folder))).toEqual([]);
  });
});
