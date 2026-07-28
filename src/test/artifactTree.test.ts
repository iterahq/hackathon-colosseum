/**
 * The folder tree behind "Meu repositório" and the tenant-admin view.
 *
 * Plan: 20260728-itera-artifact-storage (Phase 2). The tree is built from
 * `repo_path` — the same string Phase 4 will commit to — so these assertions
 * are also the contract for the eventual git export.
 */
import { describe, it, expect } from 'vitest';
import type { StoredArtifact } from '@/services/artifact.service';
import {
  UNFILED_FOLDER,
  buildArtifactTree,
  flattenArtifactTree,
  formatBytes,
} from '@/utils/artifactTree';

function artifact(overrides: Partial<StoredArtifact> = {}): StoredArtifact {
  return {
    id: Math.random().toString(36).slice(2),
    activityId: 'act-1',
    userId: 'user-1',
    type: 'text',
    filename: 'reflection.md',
    repoPath: 'prog/01-unit/02-lesson/03-activity/reflection.md',
    storagePath: 'auth-uid/act-1/abc.md',
    mimeType: 'text/markdown',
    sizeBytes: 128,
    version: 1,
    createdAt: '2026-07-28T00:00:00Z',
    ...overrides,
  };
}

describe('buildArtifactTree', () => {
  it('nests folders from repo_path and counts files at every level', () => {
    const tree = buildArtifactTree([
      artifact({ repoPath: 'prog/01-unit/01-lesson/01-act/a.md' }),
      artifact({ repoPath: 'prog/01-unit/01-lesson/02-act/b.md' }),
      artifact({ repoPath: 'prog/02-unit/01-lesson/01-act/c.md' }),
    ]);

    expect(tree.fileCount).toBe(3);
    expect(tree.children).toHaveLength(1);

    const prog = tree.children[0];
    expect(prog.kind).toBe('folder');
    if (prog.kind !== 'folder') throw new Error('expected folder');
    expect(prog.name).toBe('prog');
    expect(prog.fileCount).toBe(3);

    const unit1 = prog.children.find((c) => c.name === '01-unit');
    expect(unit1?.kind).toBe('folder');
    if (unit1?.kind !== 'folder') throw new Error('expected folder');
    expect(unit1.fileCount).toBe(2);
  });

  it('sorts folders before files, each alphabetically', () => {
    const tree = buildArtifactTree([
      artifact({ repoPath: 'root/z.md' }),
      artifact({ repoPath: 'root/a.md' }),
      artifact({ repoPath: 'root/sub/inner.md' }),
    ]);
    const root = tree.children[0];
    if (root.kind !== 'folder') throw new Error('expected folder');
    expect(root.children.map((c) => `${c.kind}:${c.name}`)).toEqual([
      'folder:sub',
      'file:a.md',
      'file:z.md',
    ]);
  });

  it('files a null repo_path under _unfiled instead of DROPPING the artifact', () => {
    // Hiding a learner's file because of a missing metadata column would be the
    // same class of bug this whole plan exists to fix.
    const tree = buildArtifactTree([artifact({ repoPath: null, filename: 'orphan.md' })]);
    expect(tree.fileCount).toBe(1);
    const folder = tree.children[0];
    expect(folder.name).toBe(UNFILED_FOLDER);
    if (folder.kind !== 'folder') throw new Error('expected folder');
    expect(folder.children[0].name).toBe('orphan.md');
  });

  it('tolerates an empty-string repo_path the same way', () => {
    const tree = buildArtifactTree([artifact({ repoPath: '   ' })]);
    expect(tree.children[0].name).toBe(UNFILED_FOLDER);
  });

  it('returns an empty tree for no artifacts', () => {
    const tree = buildArtifactTree([]);
    expect(tree.fileCount).toBe(0);
    expect(tree.children).toEqual([]);
  });
});

describe('flattenArtifactTree', () => {
  it('returns files only, in tree order', () => {
    const tree = buildArtifactTree([
      artifact({ repoPath: 'p/b.md' }),
      artifact({ repoPath: 'p/sub/a.md' }),
    ]);
    expect(flattenArtifactTree(tree).map((f) => f.path)).toEqual(['p/sub/a.md', 'p/b.md']);
  });
});

describe('formatBytes', () => {
  it('renders a readable size, and an em-dash when unknown', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });
});
