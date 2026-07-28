/**
 * The browse surface for stored artifacts — shared by the learner's
 * "My repository" (`/artifacts`) and the tenant owner's view
 * (`/admin/artifacts`).
 *
 * Plan: 20260728-itera-artifact-storage (Phases 2 + 3).
 *
 * ONE component for both surfaces on purpose. The two views differ only in
 * whose rows they are given and whether an owner column is shown — the folder
 * semantics, the preview, and the download path must not drift apart, because
 * both are reading the same `repo_path` that Phase 4 will commit to git.
 *
 * Two presentations of the same tree, per Tainan's "uma tabelinha, ou pode ser
 * um formato de repositório git, pastas e tal":
 *   - FOLDERS — the repository shape, built from `repo_path`.
 *   - TABLE   — the flat list, for scanning and sorting by recency.
 *
 * ⚠️ The bucket is PRIVATE. Nothing here builds a public URL: preview streams
 * the body through an authenticated download, and Download mints a short-lived
 * signed URL at click time.
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronRight, Download, FileText, Folder, FolderOpen } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { StoredArtifact } from '@/services/artifact.service';
import { getArtifactUrl } from '@/services/artifact.service';
import { useArtifactContent } from '@/hooks/useArtifacts';
import {
  buildArtifactTree,
  flattenArtifactTree,
  formatBytes,
  type ArtifactTreeFolder,
  type ArtifactTreeNode,
} from '@/utils/artifactTree';

type ViewMode = 'folders' | 'table';

export function ArtifactBrowser({
  artifacts,
  ownerLabelFor,
}: {
  artifacts: StoredArtifact[];
  /**
   * Renders an owner column when provided — the tenant-admin view passes a
   * learner-name resolver; the learner's own view passes nothing, because
   * every row is theirs.
   */
  ownerLabelFor?: (artifact: StoredArtifact) => string;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<ViewMode>('folders');
  const [selected, setSelected] = useState<StoredArtifact | null>(null);

  const tree = useMemo(() => buildArtifactTree(artifacts), [artifacts]);
  const files = useMemo(() => flattenArtifactTree(tree), [tree]);
  // A repo path is <program>/<unit>/<lesson>/<activity>/<file> — FOUR folder
  // levels — so a shallow default-open leaves every file hidden behind four
  // clicks. Caught by the E2E run: the file was saved and the table view listed
  // it, while the folder view rendered no file at all. Expand everything unless
  // the repository is genuinely large.
  const expandAll = files.length <= 40;

  return (
    <div data-testid="artifact-browser">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground" data-testid="artifact-count">
          {t('artifacts.count', { count: String(files.length) })}
        </p>
        <div className="inline-flex rounded-full border border-border p-0.5">
          {(['folders', 'table'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              data-testid={`artifact-view-${mode}`}
              className={`px-3.5 h-8 rounded-full text-xs font-mono uppercase tracking-wider transition-colors ${
                view === mode
                  ? 'bg-evergreen-soft text-evergreen-hi'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`artifacts.view.${mode}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-border bg-card p-2 overflow-x-auto scrollbar-hide">
          {view === 'folders' ? (
            <FolderTree
              folder={tree}
              depth={0}
              expandAll={expandAll}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              ownerLabelFor={ownerLabelFor}
            />
          ) : (
            <ArtifactTable
              files={files}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              ownerLabelFor={ownerLabelFor}
            />
          )}
        </div>

        <ArtifactPreview artifact={selected} ownerLabelFor={ownerLabelFor} />
      </div>
    </div>
  );
}

function FolderTree({
  folder,
  depth,
  expandAll,
  selectedId,
  onSelect,
  ownerLabelFor,
}: {
  folder: ArtifactTreeFolder;
  depth: number;
  expandAll: boolean;
  selectedId: string | null;
  onSelect: (a: StoredArtifact) => void;
  ownerLabelFor?: (artifact: StoredArtifact) => string;
}) {
  return (
    <ul className="min-w-[280px]">
      {folder.children.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={depth}
          expandAll={expandAll}
          selectedId={selectedId}
          onSelect={onSelect}
          ownerLabelFor={ownerLabelFor}
        />
      ))}
    </ul>
  );
}

function TreeNode({
  node,
  depth,
  expandAll,
  selectedId,
  onSelect,
  ownerLabelFor,
}: {
  node: ArtifactTreeNode;
  depth: number;
  expandAll: boolean;
  selectedId: string | null;
  onSelect: (a: StoredArtifact) => void;
  ownerLabelFor?: (artifact: StoredArtifact) => string;
}) {
  // Small repository → fully expanded, so the learner SEES their files instead
  // of a stack of closed folders. Only a large one falls back to a shallow
  // default, where dumping every path at once would be the worse failure.
  const [open, setOpen] = useState(expandAll || depth < 2);
  const indent = { paddingLeft: `${depth * 14 + 8}px` };

  if (node.kind === 'folder') {
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={indent}
          data-testid="artifact-folder"
          className="w-full flex items-center gap-2 py-1.5 pr-2 rounded-lg text-sm text-foreground hover:bg-obsidiana/40 transition-colors text-left"
        >
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          )}
          {open ? (
            <FolderOpen className="w-4 h-4 shrink-0 text-evergreen-hi" />
          ) : (
            <Folder className="w-4 h-4 shrink-0 text-evergreen-hi" />
          )}
          <span className="truncate font-mono text-[13px]">{node.name}</span>
          <span className="ml-auto text-[11px] text-muted-foreground shrink-0">{node.fileCount}</span>
        </button>
        {open && (
          <ul>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                expandAll={expandAll}
                selectedId={selectedId}
                onSelect={onSelect}
                ownerLabelFor={ownerLabelFor}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const isSelected = selectedId === node.artifact.id;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(node.artifact)}
        style={indent}
        data-testid="artifact-file"
        data-artifact-path={node.path}
        className={`w-full flex items-center gap-2 py-1.5 pr-2 rounded-lg text-sm transition-colors text-left ${
          isSelected ? 'bg-evergreen-soft text-evergreen-hi' : 'text-foreground hover:bg-obsidiana/40'
        }`}
      >
        <span className="w-3.5 shrink-0" />
        <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-[13px]">{node.name}</span>
        {ownerLabelFor && (
          <span className="ml-auto text-[11px] text-muted-foreground shrink-0 truncate max-w-[40%]">
            {ownerLabelFor(node.artifact)}
          </span>
        )}
      </button>
    </li>
  );
}

function ArtifactTable({
  files,
  selectedId,
  onSelect,
  ownerLabelFor,
}: {
  files: ReturnType<typeof flattenArtifactTree>;
  selectedId: string | null;
  onSelect: (a: StoredArtifact) => void;
  ownerLabelFor?: (artifact: StoredArtifact) => string;
}) {
  const { t } = useI18n();
  return (
    <table className="w-full min-w-[520px] text-sm">
      <thead>
        <tr className="text-left text-[12px] uppercase tracking-wider text-muted-foreground border-b border-border">
          <th className="px-3 py-2.5 font-medium">{t('artifacts.col.file')}</th>
          {ownerLabelFor && <th className="px-3 py-2.5 font-medium">{t('artifacts.col.owner')}</th>}
          <th className="px-3 py-2.5 font-medium">{t('artifacts.col.size')}</th>
          <th className="px-3 py-2.5 font-medium">{t('artifacts.col.version')}</th>
        </tr>
      </thead>
      <tbody>
        {files.map((file, i) => (
          <motion.tr
            key={file.artifact.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.03 }}
            onClick={() => onSelect(file.artifact)}
            data-testid="artifact-row"
            className={`border-b border-border last:border-0 cursor-pointer transition-colors ${
              selectedId === file.artifact.id ? 'bg-evergreen-soft' : 'hover:bg-obsidiana/40'
            }`}
          >
            <td className="px-3 py-2.5">
              <span className="font-mono text-[13px] text-foreground">{file.name}</span>
              <span className="block text-[11px] text-muted-foreground truncate">{file.path}</span>
            </td>
            {ownerLabelFor && (
              <td className="px-3 py-2.5 text-muted-foreground">{ownerLabelFor(file.artifact)}</td>
            )}
            <td className="px-3 py-2.5 text-muted-foreground">{formatBytes(file.artifact.sizeBytes)}</td>
            <td className="px-3 py-2.5 text-muted-foreground">v{file.artifact.version}</td>
          </motion.tr>
        ))}
      </tbody>
    </table>
  );
}

function ArtifactPreview({
  artifact,
  ownerLabelFor,
}: {
  artifact: StoredArtifact | null;
  ownerLabelFor?: (artifact: StoredArtifact) => string;
}) {
  const { t } = useI18n();
  const { data: content, isPending } = useArtifactContent(artifact?.storagePath ?? null);

  async function download() {
    if (!artifact) return;
    const url = await getArtifactUrl(artifact.storagePath);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  if (!artifact) {
    return (
      <div
        className="rounded-2xl border border-border bg-card p-6 flex items-center justify-center min-h-[220px]"
        data-testid="artifact-preview-empty"
      >
        <p className="text-sm text-muted-foreground text-center">{t('artifacts.selectPrompt')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5" data-testid="artifact-preview">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm text-foreground truncate">{artifact.filename}</p>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
            {artifact.repoPath ?? t('artifacts.unfiled')}
          </p>
          {ownerLabelFor && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{ownerLabelFor(artifact)}</p>
          )}
        </div>
        <button
          type="button"
          onClick={download}
          data-testid="artifact-download"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 h-9 rounded-full border border-border text-xs hover:border-evergreen/60 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          {t('artifacts.download')}
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3 text-[11px] text-muted-foreground font-mono uppercase tracking-wider">
        <span>{artifact.type}</span>
        <span>·</span>
        <span>{formatBytes(artifact.sizeBytes)}</span>
        <span>·</span>
        <span>v{artifact.version}</span>
      </div>

      <pre
        data-testid="artifact-preview-body"
        className="mt-4 max-h-[420px] overflow-auto scrollbar-hide rounded-xl bg-background border border-border p-4 text-[13px] leading-relaxed text-foreground whitespace-pre-wrap break-words"
      >
        {isPending ? t('common.loading') : (content ?? t('artifacts.previewUnavailable'))}
      </pre>
    </div>
  );
}
