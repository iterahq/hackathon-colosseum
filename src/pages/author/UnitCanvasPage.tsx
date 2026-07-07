/**
 * Per-UNIT review + comment canvas (plan 20260706, Phase 4 / ADR-6).
 *
 * A REAL pannable / zoomable canvas (mirrors the Lesson Studio Course Canvas —
 * `dfl-lesson-studio` `CanvasReview.tsx`, same `react-zoom-pan-pinch` engine).
 * The unit's lessons + activities are laid out as live cards on an infinite
 * surface: rows = lessons, each row a horizontal flow of activity cards. Each
 * card renders the activity LIVE via the shared `ActivityRenderer` (preview,
 * noop onComplete) so the author SEES the real thing — no CI/CD render routine,
 * the HTML is rendered on-the-fly in-browser.
 *
 * Interactions: drag empty space to pan · scroll/two-finger to pan · ⌘/ctrl +
 * scroll or trackpad pinch to zoom · zoom in/out/fit buttons (bottom-right).
 * Layout: computed auto-flow by lesson (no saved per-card positions yet — that
 * would be an itera-schema change, deferred; see PR body).
 *
 * A Figma-style Comment mode captures a relative anchor (0..1) on click →
 * CommentModal → persists to itera.activity_comments (unit-version-stamped).
 * The anchor math is transform-safe: getBoundingClientRect returns the VISUAL
 * (scaled) rect, so (clientX-left)/width stays a correct 0..1 fraction at any
 * zoom. A right sidebar lists the selected version's comments with Bump /
 * Copy-all / resolve / delete. Per-activity Publish/Unpublish flips
 * itera.activities.status. Refresh re-reads the graph so external MCP edits
 * appear (NO realtime — TanStack Query + manual).
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
  ZoomIn,
  ZoomOut,
  Maximize,
} from 'lucide-react';
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';
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

// Trackpad pinch-to-zoom sensitivity (mirrors dfl-lesson-studio CanvasReview).
// macOS maps a trackpad pinch to `wheel` events with `ctrlKey === true`; the lib
// zooms those (centered on the cursor) even when plain-wheel zoom is disabled so
// the wheel can pan instead. Bumping the smoothStep lands a pinch in 1-2
// gestures without overshooting the min/max clamp.
const PINCH_ZOOM_SENSITIVITY = 0.0035;
const CANVAS_MIN_SCALE = 0.2;
const CANVAS_MAX_SCALE = 2;
const CANVAS_INITIAL_SCALE = 0.7;

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
  const [scale, setScale] = useState(CANVAS_INITIAL_SCALE);

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
          <span className="hidden lg:inline text-[11px] font-mono text-muted-foreground/70">
            drag to pan · scroll to pan · ⌘/pinch to zoom · C to comment
          </span>
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
        {/* Pan / zoom canvas */}
        <main
          className="relative flex-1 overflow-hidden bg-muted/20"
          style={{
            // Figma-style dotted grid so it reads as an infinite canvas.
            backgroundImage:
              'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        >
          {/* Loading / error / empty states — overlaid, NOT inside the transform
              so they stay centered and readable regardless of pan/zoom. */}
          {canvasQ.isPending && (
            <div className="absolute inset-0 grid place-items-center">
              <p className="text-sm text-muted-foreground">Loading unit…</p>
            </div>
          )}
          {canvasQ.isError && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-sm text-muted-foreground text-center">
                Could not load this unit.{' '}
                <button className="underline" onClick={() => canvasQ.refetch()}>
                  Try again
                </button>
              </div>
            </div>
          )}
          {canvas && canvas.lessons.length === 0 && (
            <div className="absolute inset-0 grid place-items-center">
              <p className="text-sm text-muted-foreground" data-testid="canvas-empty">
                This unit has no lessons yet.
              </p>
            </div>
          )}

          {canvas && canvas.lessons.length > 0 && (
            <TransformWrapper
              minScale={CANVAS_MIN_SCALE}
              maxScale={CANVAS_MAX_SCALE}
              initialScale={CANVAS_INITIAL_SCALE}
              limitToBounds={false}
              centerOnInit
              wheel={{ wheelDisabled: true, smoothStep: PINCH_ZOOM_SENSITIVITY }}
              panning={{ velocityDisabled: true, wheelPanning: true }}
              doubleClick={{ disabled: true }}
              onTransformed={(_ref: ReactZoomPanPinchRef, s: { scale: number }) =>
                setScale(s.scale)
              }
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <>
                  {/* Zoom controls (bottom-right) — mirror of Lesson Studio. */}
                  <div className="absolute bottom-6 right-6 z-10 flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card/90 p-1.5 shadow-lg backdrop-blur-sm">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => zoomIn()}
                      aria-label="Zoom in"
                      data-testid="canvas-zoom-in"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <span
                      className="text-[10px] font-mono tabular-nums text-muted-foreground"
                      data-testid="canvas-zoom-readout"
                    >
                      {Math.round(scale * 100)}%
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => zoomOut()}
                      aria-label="Zoom out"
                      data-testid="canvas-zoom-out"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => resetTransform()}
                      aria-label="Reset view"
                      data-testid="canvas-zoom-reset"
                    >
                      <Maximize className="h-4 w-4" />
                    </Button>
                  </div>

                  <TransformComponent
                    wrapperClass="!w-full !h-full"
                    contentClass="!w-auto !h-auto"
                  >
                    <div
                      className="flex flex-col gap-14 p-16"
                      data-testid="canvas-grid"
                    >
                      {canvas.lessons.map((lesson) => (
                        <section
                          key={lesson.id}
                          data-testid="canvas-row"
                          data-lesson-id={lesson.id}
                        >
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
                            <div className="flex gap-6">
                              {lesson.activities.map((activity) => (
                                <ActivityCell
                                  key={activity.id}
                                  activity={activity}
                                  commentMode={commentMode}
                                  commentCount={commentCounts.get(activity.id) ?? 0}
                                  pins={versionComments.filter(
                                    (c) => c.activityId === activity.id,
                                  )}
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
                  </TransformComponent>
                </>
              )}
            </TransformWrapper>
          )}
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
