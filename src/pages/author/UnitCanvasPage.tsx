/**
 * Per-UNIT review + comment canvas (plan 20260706, Phase 4 / ADR-6).
 *
 * Grid: rows = the unit's lessons, columns = each lesson's activities. Each cell
 * renders the activity via the shared `ActivityRenderer` (preview, noop
 * onComplete) with an index + comment-count + status badge. A Figma-style
 * Comment mode captures a relative anchor (0..1) on click → CommentModal →
 * persists to itera.activity_comments (unit-version-stamped). A right sidebar
 * lists the selected version's comments with Bump / Copy-all / resolve / delete.
 * Per-activity Publish/Unpublish flips itera.activities.status. Refresh re-reads
 * the graph so external MCP edits appear (NO realtime — TanStack Query + manual).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  MessageSquarePlus,
  RefreshCw,
  FlaskConical,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Badge, Button } from '@devfellowship/components';
import { AppHeader } from '@/components/branded';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { useI18n } from '@/i18n';
import {
  useUnitCanvas,
  useUnitVersions,
  useUnitComments,
  useCreateComment,
  useToggleResolved,
  useDeleteComment,
  useBumpVersion,
  useSetActivityStatus,
} from '@/hooks/useAuthorCanvas';
import {
  buildActivityRefs,
  buildVersionNumbers,
  formatCommentsForClipboard,
  resolveCurrentVersion,
} from '@/services/comments.service';
import { CommentModal, type CommentModalTarget } from '@/components/author/CommentModal';
import { CommentSidebar } from '@/components/author/CommentSidebar';
import type { Activity, I18nText } from '@/types/content';
import type { ActivityComment } from '@/types/comments';

const noop = (_correct: boolean) => {};

export default function UnitCanvasPage() {
  const { unitId } = useParams<{ unitId: string }>();
  const { locale } = useI18n();

  const canvasQ = useUnitCanvas(unitId);
  const versionsQ = useUnitVersions(unitId);
  const commentsQ = useUnitComments(unitId);

  const tenantId = canvasQ.data?.tenantId;

  const createComment = useCreateComment(unitId, tenantId);
  const toggleResolved = useToggleResolved(unitId);
  const deleteComment = useDeleteComment(unitId);
  const bumpVersion = useBumpVersion(unitId, tenantId);
  const setStatus = useSetActivityStatus(unitId);

  const [commentMode, setCommentMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [target, setTarget] = useState<CommentModalTarget | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  // Memoized so the stable identity doesn't churn the effect/memo deps below.
  const versions = useMemo(() => versionsQ.data ?? [], [versionsQ.data]);
  const allComments = useMemo(() => commentsQ.data ?? [], [commentsQ.data]);

  // Default the version filter to the current (max) version once versions load.
  useEffect(() => {
    if (selectedVersionId) return;
    const current = resolveCurrentVersion(versions);
    if (current) setSelectedVersionId(current.id);
  }, [versions, selectedVersionId]);

  // Comment-mode keyboard toggle (Figma `C`), ignoring typing in inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (!typing && (e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey) {
        setCommentMode((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const activityRefs = useMemo(
    () => (canvasQ.data ? buildActivityRefs(canvasQ.data) : new Map()),
    [canvasQ.data],
  );
  const versionNumbers = useMemo(() => buildVersionNumbers(versions), [versions]);

  // Comments scoped to the selected version — drives sidebar + copy + badges.
  const versionComments = useMemo(
    () => allComments.filter((c) => c.unitVersionId === selectedVersionId),
    [allComments, selectedVersionId],
  );

  // activityId → count (for the per-cell badge), scoped to the selected version.
  const commentCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of versionComments) m.set(c.activityId, (m.get(c.activityId) ?? 0) + 1);
    return m;
  }, [versionComments]);

  const pick = (b: I18nText | undefined) =>
    (b && (b[locale] || b.pt || b.en || Object.values(b).find(Boolean))) || '—';

  const refreshAll = () => {
    canvasQ.refetch();
    versionsQ.refetch();
    commentsQ.refetch();
  };

  const handleCopyAll = async () => {
    const block = formatCommentsForClipboard(versionComments, { activityRefs, versionNumbers });
    try {
      await navigator.clipboard.writeText(block);
    } catch {
      // Clipboard blocked (e.g. non-secure context) — fall back to a prompt.
      window.prompt('Copy the comments below:', block);
    }
  };

  const submitComment = (body: string) => {
    if (!target) return;
    createComment.mutate(
      {
        programId: target.programId,
        lessonId: target.lessonId,
        activityId: target.activityId,
        body,
        anchorX: target.anchorX ?? null,
        anchorY: target.anchorY ?? null,
      },
      { onSettled: () => setTarget(null) },
    );
  };

  const canvas = canvasQ.data;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />

      {/* Toolbar */}
      <div className="border-b border-border bg-card/40">
        <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-3 flex items-center gap-3 flex-wrap">
          <Link
            to="/author"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" /> Author
          </Link>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate" data-testid="canvas-unit-title">
              {canvas ? `${pick(canvas.program.title)} · ${pick(canvas.unit.title)}` : 'Unit canvas'}
            </h1>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant={commentMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCommentMode((v) => !v)}
              data-testid="comment-mode-toggle"
              aria-pressed={commentMode}
            >
              <MessageSquarePlus className="mr-1.5 h-4 w-4" />
              Comment{commentMode ? ' (on)' : ''}
            </Button>
            <Button variant="outline" size="sm" onClick={refreshAll} data-testid="canvas-refresh">
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSidebarOpen((v) => !v)}
              data-testid="toggle-sidebar"
            >
              {sidebarOpen ? 'Hide' : 'Show'} comments
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Grid */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-[1400px] w-full mx-auto px-4 md:px-6 py-6" data-testid="canvas-grid">
            {canvasQ.isPending && <p className="text-sm text-muted-foreground">Loading unit…</p>}
            {canvasQ.isError && (
              <div className="text-sm text-muted-foreground">
                Could not load this unit.{' '}
                <button className="underline" onClick={() => canvasQ.refetch()}>
                  Try again
                </button>
              </div>
            )}
            {canvas && canvas.lessons.length === 0 && (
              <p className="text-sm text-muted-foreground" data-testid="canvas-empty">
                This unit has no lessons yet.
              </p>
            )}

            <div className="flex flex-col gap-8">
              {canvas?.lessons.map((lesson) => (
                <section key={lesson.id} data-testid="canvas-row" data-lesson-id={lesson.id}>
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-menta tabular-nums">
                      L{String(lesson.ordinal).padStart(2, '0')}
                    </span>
                    <h2 className="text-sm font-semibold text-foreground truncate">
                      {pick(lesson.title)}
                    </h2>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {lesson.activities.length} activit
                      {lesson.activities.length === 1 ? 'y' : 'ies'}
                    </span>
                  </div>

                  {lesson.activities.length === 0 ? (
                    <p className="text-xs text-muted-foreground pl-1">No activities.</p>
                  ) : (
                    <div className="flex gap-4 overflow-x-auto pb-2">
                      {lesson.activities.map((activity) => (
                        <ActivityCell
                          key={activity.id}
                          activity={activity}
                          commentMode={commentMode}
                          commentCount={commentCounts.get(activity.id) ?? 0}
                          pins={versionComments.filter((c) => c.activityId === activity.id)}
                          onPublishToggle={(next) =>
                            setStatus.mutate({ activityId: activity.id, status: next })
                          }
                          onCommentClick={(anchorX, anchorY) =>
                            setTarget({
                              activityId: activity.id,
                              lessonId: lesson.id,
                              programId: canvas.program.id,
                              lessonTitle: pick(lesson.title),
                              lessonOrdinal: lesson.ordinal,
                              activityOrdinal: activity.ordinal,
                              activityKind: activity.kind,
                              anchorX,
                              anchorY,
                            })
                          }
                        />
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          </div>
        </main>

        {/* Comment sidebar */}
        {sidebarOpen && (
          <CommentSidebar
            versions={versions}
            selectedVersionId={selectedVersionId}
            onSelectVersion={setSelectedVersionId}
            comments={versionComments}
            activityRefs={activityRefs}
            onResolveToggle={(c) => toggleResolved.mutate({ id: c.id, resolved: !c.resolved })}
            onDelete={(c) => deleteComment.mutate(c.id)}
            onBumpVersion={() =>
              bumpVersion.mutate(undefined, {
                onSuccess: (v) => setSelectedVersionId(v.id),
              })
            }
            onCopyAll={handleCopyAll}
            bumping={bumpVersion.isPending}
            onClose={() => setSidebarOpen(false)}
          />
        )}
      </div>

      <CommentModal
        target={target}
        submitting={createComment.isPending}
        onClose={() => setTarget(null)}
        onSubmit={submitComment}
      />
    </div>
  );
}

/** One activity cell: ActivityRenderer preview + badges + publish + test + comment overlay. */
function ActivityCell({
  activity,
  commentMode,
  commentCount,
  pins,
  onPublishToggle,
  onCommentClick,
}: {
  activity: Activity;
  commentMode: boolean;
  commentCount: number;
  pins: ActivityComment[];
  onPublishToggle: (next: 'draft' | 'published') => void;
  onCommentClick: (anchorX: number, anchorY: number) => void;
}) {
  const published = activity.publishStatus === 'published';

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    onCommentClick(Number(x.toFixed(4)), Number(y.toFixed(4)));
  };

  return (
    <div
      data-testid="canvas-cell"
      data-activity-id={activity.id}
      data-activity-kind={activity.kind}
      data-status={activity.publishStatus ?? 'unknown'}
      className="relative w-[320px] shrink-0 rounded-2xl border border-border bg-card/40 p-3"
    >
      {/* Header row: index + status + comment badges */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
          #{String(activity.ordinal).padStart(2, '0')}
        </span>
        <Badge variant={published ? 'default' : 'secondary'} data-testid="cell-status-badge">
          {published ? 'published' : 'draft'}
        </Badge>
        {commentCount > 0 && (
          <Badge variant="outline" data-testid="cell-comment-badge">
            {commentCount} 💬
          </Badge>
        )}
        <span className="ml-auto text-[10px] font-mono text-muted-foreground/70">
          {activity.kind}
        </span>
      </div>

      {/* Preview (static) + comment-capture overlay */}
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-background max-h-[300px]">
        <div className="pointer-events-none select-none scale-[0.85] origin-top">
          <ActivityRenderer activity={activity} onComplete={noop} />
        </div>

        {/* Anchor pins for this version's comments on this activity. */}
        {pins.map((c) =>
          c.anchorX != null && c.anchorY != null ? (
            <span
              key={c.id}
              className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-clay ring-2 ring-background"
              style={{ left: `${c.anchorX * 100}%`, top: `${c.anchorY * 100}%` }}
              title={c.body}
              data-testid="comment-pin"
            />
          ) : null,
        )}

        {/* Comment-mode overlay: captures the relative anchor on click. */}
        {commentMode && (
          <div
            role="button"
            aria-label="Add comment on this activity"
            data-testid="cell-comment-overlay"
            onClick={handleOverlayClick}
            className="absolute inset-0 cursor-crosshair bg-clay/5 hover:bg-clay/10"
          />
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2 mt-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => onPublishToggle(published ? 'draft' : 'published')}
          data-testid="cell-publish-toggle"
        >
          {published ? (
            <>
              <EyeOff className="mr-1.5 h-3.5 w-3.5" /> Unpublish
            </>
          ) : (
            <>
              <Eye className="mr-1.5 h-3.5 w-3.5" /> Publish
            </>
          )}
        </Button>
        <Button variant="ghost" size="sm" asChild data-testid="cell-test-link">
          <Link to={`/author/activities/${activity.id}/test`}>
            <FlaskConical className="mr-1.5 h-3.5 w-3.5" /> Test
          </Link>
        </Button>
      </div>
    </div>
  );
}
