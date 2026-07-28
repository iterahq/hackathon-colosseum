/**
 * Fold a flat list of artifacts into the folder tree the UI renders.
 *
 * Plan: 20260728-itera-artifact-storage (Phase 2). Tainan asked for the browse
 * surface to look like a repository — *"uma tabelinha, ou pode ser um formato de
 * repositório git, pastas e tal"* — and, more importantly, for the UI and the
 * extracted data to already be correlated with the eventual git export:
 *
 * > "já pensa numa estrutura que facilite depois, quando a gente for
 * >  implementar, enviar pro Git. Tem que ter correlação."
 *
 * That is why this builds the tree from `repo_path` — the SAME string that
 * Phase 4 will use as the path inside a real repository — rather than from a
 * presentation-only grouping invented here. The folder the learner clicks today
 * is literally the directory the file will land in when it is committed.
 *
 * Pure and dependency-free so the shape can be asserted in unit tests without
 * rendering anything.
 */
import type { StoredArtifact } from '@/services/artifact.service';

export interface ArtifactTreeFile {
  kind: 'file';
  name: string;
  path: string;
  artifact: StoredArtifact;
}

export interface ArtifactTreeFolder {
  kind: 'folder';
  name: string;
  path: string;
  children: ArtifactTreeNode[];
  /** Files anywhere beneath this folder — drives the "N arquivos" caption. */
  fileCount: number;
}

export type ArtifactTreeNode = ArtifactTreeFolder | ArtifactTreeFile;

/**
 * Artifacts whose `repo_path` is null (rows written before migration 0027, or
 * any save whose lesson context could not be resolved) are NOT dropped — they
 * are placed under this folder. Silently hiding a learner's file because of a
 * missing metadata column would be the same class of bug this whole plan exists
 * to fix.
 */
export const UNFILED_FOLDER = '_unfiled';

function emptyFolder(name: string, path: string): ArtifactTreeFolder {
  return { kind: 'folder', name, path, children: [], fileCount: 0 };
}

/**
 * Build the tree. Folders sort before files, each alphabetically — the ordering
 * every file browser uses, so it needs no explanation to the learner.
 */
export function buildArtifactTree(artifacts: StoredArtifact[]): ArtifactTreeFolder {
  const root = emptyFolder('', '');

  for (const artifact of artifacts) {
    const raw = artifact.repoPath?.trim();
    const segments = (raw && raw !== '' ? raw : `${UNFILED_FOLDER}/${artifact.filename}`)
      .split('/')
      .map((s) => s.trim())
      .filter((s) => s !== '');

    if (segments.length === 0) continue;

    const fileName = segments[segments.length - 1];
    const folders = segments.slice(0, -1);

    let cursor = root;
    cursor.fileCount += 1;
    let walked = '';
    for (const segment of folders) {
      walked = walked === '' ? segment : `${walked}/${segment}`;
      let next = cursor.children.find(
        (c): c is ArtifactTreeFolder => c.kind === 'folder' && c.name === segment
      );
      if (!next) {
        next = emptyFolder(segment, walked);
        cursor.children.push(next);
      }
      next.fileCount += 1;
      cursor = next;
    }

    cursor.children.push({
      kind: 'file',
      name: fileName,
      path: raw && raw !== '' ? raw : `${UNFILED_FOLDER}/${artifact.filename}`,
      artifact,
    });
  }

  sortFolder(root);
  return root;
}

function sortFolder(folder: ArtifactTreeFolder): void {
  folder.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of folder.children) {
    if (child.kind === 'folder') sortFolder(child);
  }
}

/** Flatten to files only, in tree order — the table view of the same data. */
export function flattenArtifactTree(folder: ArtifactTreeFolder): ArtifactTreeFile[] {
  const out: ArtifactTreeFile[] = [];
  for (const child of folder.children) {
    if (child.kind === 'file') out.push(child);
    else out.push(...flattenArtifactTree(child));
  }
  return out;
}

/** Human-readable byte size for the file list. */
export function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
