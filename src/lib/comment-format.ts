/**
 * Pure helpers for the per-UNIT review canvas — current-version resolution and
 * the agent-pasteable clipboard format
 * (plan 20260706-iterahq-activity-authoring-canvas-testing, Phase 4 / ADR-2).
 *
 * Ported from dfl-lesson-studio's `comment-format.ts` and re-keyed onto Itera
 * entities (program/unit/lesson/activity). Kept FREE of any Supabase import so
 * it's unit-testable in isolation; the service layer re-exports the resolvers.
 *
 * The crown jewel is the clipboard block: each comment line INLINES the
 * activity's current `kind` + `spec` JSON so an agent calling itera-mcp
 * `update_activity` has full context with NO extra fetch (ADR-1 loop).
 */
import type { ActivityComment, UnitVersion } from '@/types/comments';
import type { ActivityKind, I18nText } from '@/types/content';
// Type-only import — erased at compile time, so this file stays runtime-pure
// (no Supabase pulled into the unit test).
import type { UnitCanvas } from '@/services/authorCanvas.service';

// ---------------------------------------------------------------------------
// Small formatting utilities (no external dep — itera-player has no format lib)
// ---------------------------------------------------------------------------

/** Zero-pad a 1-based index to 2 digits (01, 02, … 10). */
export function padNumber(n: number): string {
  return String(n).padStart(2, '0');
}

/** Short 8-char id prefix used in the clipboard reference headers. */
export function id8(id: string): string {
  return (id ?? '').replace(/-/g, '').slice(0, 8);
}

/** Pick a display title from an i18n bag, preferring pt then en then any. */
export function pickTitle(title: I18nText | undefined, fallback = '—'): string {
  if (!title) return fallback;
  return title.pt || title.en || Object.values(title).find(Boolean) || fallback;
}

// ---------------------------------------------------------------------------
// Current-version resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the "current" version of a unit from its version list.
 * Current = the row with the highest `versionNumber`. Returns null when there
 * are no versions yet (caller auto-creates v1).
 */
export function resolveCurrentVersion(versions: UnitVersion[]): UnitVersion | null {
  if (!versions || versions.length === 0) return null;
  return versions.reduce((max, v) => (v.versionNumber > max.versionNumber ? v : max));
}

/** The next version number to assign on a bump (max + 1, or 1 if none). */
export function nextVersionNumber(versions: UnitVersion[]): number {
  const current = resolveCurrentVersion(versions);
  return current ? current.versionNumber + 1 : 1;
}

// ---------------------------------------------------------------------------
// Clipboard format
// ---------------------------------------------------------------------------

/** Everything the formatter needs to know about an activity's place + content. */
export interface ActivityRef {
  program: { title: string; id: string };
  unit: { title: string; id: string };
  lesson: { title: string; ordinal: number; id: string };
  activity: {
    ordinal: number;
    id: string;
    kind: ActivityKind | string;
    spec: Record<string, unknown>;
  };
}

export interface CommentFormatContext {
  /** Map activityId → its full ref (program/unit/lesson/activity + kind+spec). */
  activityRefs: Map<string, ActivityRef>;
  /** Map unitVersionId → versionNumber for the (uv<n>) tag. */
  versionNumbers: Map<string, number>;
}

/**
 * Format a single comment into a stable, agent-pasteable block:
 *
 *   [program:<title>#<id8>] [unit:<title>#<id8>] [lesson:<title>#<ord>#<id8>] [activity:<ord>#<id8>] (uv<n>)[ resolved] — <body>
 *     kind: <kind>
 *     spec: <compact-JSON>
 *
 * Missing context degrades gracefully to `?`-marked placeholders so a line is
 * never silently dropped (mirrors lesson-studio). The kind+spec are inlined
 * from the already-loaded canvas graph — no extra query.
 */
export function formatCommentLine(
  comment: ActivityComment,
  ctx: CommentFormatContext,
): string {
  const ref = ctx.activityRefs.get(comment.activityId);

  const programTag = ref
    ? `[program:${ref.program.title}#${id8(ref.program.id)}]`
    : `[program:?#${id8(comment.programId)}]`;
  const unitTag = ref
    ? `[unit:${ref.unit.title}#${id8(ref.unit.id)}]`
    : `[unit:?#${id8(comment.unitId)}]`;
  const lessonTag = ref
    ? `[lesson:${ref.lesson.title}#${padNumber(ref.lesson.ordinal)}#${id8(ref.lesson.id)}]`
    : `[lesson:?#${id8(comment.lessonId)}]`;
  const activityTag = ref
    ? `[activity:${padNumber(ref.activity.ordinal)}#${id8(ref.activity.id)}]`
    : `[activity:?#${id8(comment.activityId)}]`;

  const vNum = ctx.versionNumbers.get(comment.unitVersionId);
  const versionTag = vNum != null ? `(uv${vNum})` : `(uv?)`;
  const status = comment.resolved ? ' resolved' : '';

  const body = comment.body.replace(/\s+/g, ' ').trim();
  const header = `${programTag} ${unitTag} ${lessonTag} ${activityTag} ${versionTag}${status} — ${body}`;

  const kind = ref ? ref.activity.kind : '?';
  const spec = ref ? JSON.stringify(ref.activity.spec) : '{}';
  return `${header}\n  kind: ${kind}\n  spec: ${spec}`;
}

/**
 * Build the full clipboard block for a set of comments (one unit-version's
 * worth), one block per comment, separated by a blank line.
 */
export function formatCommentsForClipboard(
  comments: ActivityComment[],
  ctx: CommentFormatContext,
): string {
  return comments.map((c) => formatCommentLine(c, ctx)).join('\n\n');
}

// ---------------------------------------------------------------------------
// Context builders (derive the ref/version maps from the loaded canvas graph)
// ---------------------------------------------------------------------------

/**
 * Derive the `activityId → ActivityRef` map from the loaded per-unit canvas.
 * Each ref carries the program/unit/lesson placement PLUS the activity's
 * current `kind` + `spec` — the payload the clipboard block inlines.
 */
export function buildActivityRefs(canvas: UnitCanvas): Map<string, ActivityRef> {
  const map = new Map<string, ActivityRef>();
  const program = { title: pickTitle(canvas.program.title), id: canvas.program.id };
  const unit = { title: pickTitle(canvas.unit.title), id: canvas.unit.id };
  for (const lesson of canvas.lessons) {
    const lref = {
      title: pickTitle(lesson.title),
      ordinal: lesson.ordinal,
      id: lesson.id,
    };
    for (const activity of lesson.activities) {
      map.set(activity.id, {
        program,
        unit,
        lesson: lref,
        activity: {
          ordinal: activity.ordinal,
          id: activity.id,
          kind: activity.kind,
          spec: activity.spec ?? {},
        },
      });
    }
  }
  return map;
}

/** Derive the `unitVersionId → versionNumber` map for the (uv<n>) tag. */
export function buildVersionNumbers(versions: UnitVersion[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const v of versions) map.set(v.id, v.versionNumber);
  return map;
}
