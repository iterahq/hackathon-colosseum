/**
 * Right-hand sidebar listing the selected unit-version's comments, grouped by
 * activity (plan 20260706, Phase 4). Ported from dfl-lesson-studio's
 * CommentSidebar, re-keyed onto Itera activities + `@devfellowship/components`.
 * Provides the version switcher, resolve toggle, delete (owner — RLS enforces),
 * Bump version, and Copy all controls.
 */
import { useMemo } from 'react';
import { Check, Copy, GitBranch, Trash2, X } from 'lucide-react';
import {
  Button,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@devfellowship/components';
import { padNumber } from '@/lib/comment-format';
import { useI18n } from "@/i18n";
import type { ActivityComment, UnitVersion } from '@/types/comments';
import type { ActivityRef } from '@/lib/comment-format';

interface CommentSidebarProps {
  versions: UnitVersion[];
  selectedVersionId: string | null;
  onSelectVersion: (versionId: string) => void;
  /** Comments for the SELECTED version only. */
  comments: ActivityComment[];
  /** activityId → its ref (lesson ordinal/title + activity ordinal/kind). */
  activityRefs: Map<string, ActivityRef>;
  onResolveToggle: (comment: ActivityComment) => void;
  onDelete: (comment: ActivityComment) => void;
  onBumpVersion: () => void;
  onCopyAll: () => void;
  bumping?: boolean;
  onClose: () => void;
}

interface GroupedComments {
  activityId: string;
  lessonOrdinal: number | null;
  activityOrdinal: number | null;
  kind: string;
  label: string;
  items: ActivityComment[];
}

export const CommentSidebar = ({
  versions,
  selectedVersionId,
  onSelectVersion,
  comments,
  activityRefs,
  onResolveToggle,
  onDelete,
  onBumpVersion,
  onCopyAll,
  bumping = false,
  onClose,
}: CommentSidebarProps) => {
  const { t } = useI18n();
  const sortedVersions = useMemo(
    () => [...versions].sort((a, b) => b.versionNumber - a.versionNumber),
    [versions],
  );

  const groups = useMemo<GroupedComments[]>(() => {
    const map = new Map<string, GroupedComments>();
    for (const c of comments) {
      const ref = activityRefs.get(c.activityId);
      let g = map.get(c.activityId);
      if (!g) {
        g = {
          activityId: c.activityId,
          lessonOrdinal: ref?.lesson.ordinal ?? null,
          activityOrdinal: ref?.activity.ordinal ?? null,
          kind: ref?.activity.kind ?? "?",
          label: ref
            ? `${ref.lesson.title} → activity ${padNumber(ref.activity.ordinal)}`
            : t("comments.unknownActivity"),
          items: [],
        };
        map.set(c.activityId, g);
      }
      g.items.push(c);
    }
    return [...map.values()].sort((a, b) => {
      const la = a.lessonOrdinal ?? 1e9;
      const lb = b.lessonOrdinal ?? 1e9;
      if (la !== lb) return la - lb;
      return (a.activityOrdinal ?? 1e9) - (b.activityOrdinal ?? 1e9);
    });
  }, [comments, activityRefs]);

  const total = comments.length;
  const resolvedCount = comments.filter((c) => c.resolved).length;

  return (
    <aside
      data-testid="comment-sidebar"
      className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-card/60 backdrop-blur-xs"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            {t("author.comments")}
          </h2>
          <span
            data-testid="comment-total-count"
            className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-mono tabular-nums text-primary"
          >
            {total}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClose}
          aria-label={t("comments.closePanel")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Version switcher + actions */}
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            {t("comments.version")}
          </span>
          <Select
            value={selectedVersionId ?? undefined}
            onValueChange={onSelectVersion}
          >
            <SelectTrigger
              className="h-8 flex-1"
              data-testid="version-switcher"
            >
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {sortedVersions.map((v, i) => (
                <SelectItem key={v.id} value={v.id}>
                  uv{v.versionNumber}
                  {i === 0 ? ` (${t("comments.current")})` : ""}
                  {v.label ? ` — ${v.label}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onBumpVersion}
            disabled={bumping}
            data-testid="bump-version"
          >
            <GitBranch className="mr-1.5 h-3.5 w-3.5" />
            {bumping ? t("comments.bumping") : t("comments.bumpVersion")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onCopyAll}
            disabled={total === 0}
            data-testid="copy-all-comments"
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            {t("comments.copyAll")}
          </Button>
        </div>
        {total > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {t("comments.resolved", { count: resolvedCount })} ·{" "}
            {t("comments.open", { count: total - resolvedCount })}
          </p>
        )}
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        {total === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            {t("comments.none")}
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            {groups.map((g) => (
              <div key={g.activityId} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    {g.activityOrdinal != null
                      ? padNumber(g.activityOrdinal)
                      : "—"}
                  </span>
                  <span className="truncate text-xs font-semibold text-foreground">
                    {g.label}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground/70">
                  {g.kind}
                </span>
                <div className="flex flex-col gap-1.5">
                  {g.items.map((c) => (
                    <CommentRow
                      key={c.id}
                      comment={c}
                      onResolveToggle={() => onResolveToggle(c)}
                      onDelete={() => onDelete(c)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </aside>
  );
};

interface CommentRowProps {
  comment: ActivityComment;
  onResolveToggle: () => void;
  onDelete: () => void;
}

const CommentRow = ({
  comment,
  onResolveToggle,
  onDelete,
}: CommentRowProps) => {
  const { t } = useI18n();
  return (
  <div
    data-testid="comment-row"
    className={`group rounded-md border px-2.5 py-2 text-xs ${
      comment.resolved
        ? "border-border/50 bg-muted/30 text-muted-foreground"
        : "border-border bg-background text-foreground"
    }`}
  >
    <p className={comment.resolved ? "line-through opacity-70" : ""}>
      {comment.body}
    </p>
    <div className="mt-1.5 flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={onResolveToggle}
        aria-label={
          comment.resolved ? t("comments.reopen") : t("comments.resolve")
        }
        title={comment.resolved ? t("comments.reopen") : t("comments.resolve")}
      >
        <Check
          className={`h-3.5 w-3.5 ${comment.resolved ? "text-primary" : ""}`}
        />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-destructive hover:text-destructive"
        onClick={onDelete}
        aria-label={t("comments.delete")}
        title={t("comments.delete")}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  </div>
  );
};

export default CommentSidebar;
