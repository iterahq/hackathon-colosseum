import { Pencil, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import { LiveStageBody } from '@/components/live/LiveStageBody';
import type { Activity } from '@/types/content';
import type { StageCursor, StagedAnswer } from '@/types/liveClass';

interface LiveStageProps {
  staged: StagedAnswer;
  /**
   * The activity currently on the class. Shown read-only when the learner has
   * nothing local to project: `gatherStageContent` only sees a code snapshot or
   * a submitted answer, so every other kind reports `not_started` even while the
   * learner is working it. Pulling someone means showing the CURRENT state.
   *
   * Only the instructor surface passes it: the learner already has their own
   * copy of the same activity right below the stage.
   */
  activity?: Activity | null;
  /** Instructor-only affordance to dismiss the stage for everyone. */
  onClear?: () => void;
  /**
   * Instructor view mode (B9): the professor's own screen is REPLACED by the
   * pulled learner's, so the eyebrow reads "você está visualizando a tela de"
   * instead of the class-facing "no palco".
   */
  viewingName?: string;
  /**
   * Latest mirrored pointer/caret of the person on stage — the whole point of
   * the stage for a code exercise: without it, "move o cursor pra direita" has
   * no shared referent.
   */
  cursor?: StageCursor | null;
  /** Sample gap the cursor is arriving at; tunes the interpolation only. */
  cursorIntervalMs?: number;
  /**
   * The room is too large to mirror a cursor within the project's Realtime
   * budget. Shown, not hidden: silence would read as "the feature is broken".
   */
  cursorOff?: boolean;
}

/**
 * The shared "on stage" surface (ADR-3/4): an identity bar naming the author
 * (NOT anonymous — the whole class sees whose work it is) plus the staged work.
 * `code` shows a read-only Monaco + the SAME sandboxed live preview the learner
 * sees; other kinds show a design-system summary card. Rendered by both the
 * learner and instructor pages directly below the navbar.
 *
 * Since the professor can now pull WORK IN PROGRESS (ADR-4 revised), the identity
 * bar carries an explicit "em andamento" badge: a classmate's half-written draft
 * on the projector must never be read by the class as a finished answer.
 */
export function LiveStage({
  staged,
  activity,
  onClear,
  viewingName,
  cursor = null,
  cursorIntervalMs = 200,
  cursorOff = false,
}: LiveStageProps) {
  const { t } = useI18n();
  const isEmpty = staged.kind === 'empty' || staged.status === 'not_started';
  const isDraft = staged.status === 'in_progress';
  // `code` is the ONE kind whose absence is trustworthy, and the renderer would
  // seed the editor from the VIEWER's own localStorage — projecting the
  // professor's draft under the learner's name.
  const mirrorActivity = activity && activity.kind !== 'code' ? activity : null;

  return (
    <div data-testid="live-stage">
      <div
        className="flex items-center gap-3 px-4 md:px-8 py-3 border-b border-streak/40 bg-streak/10"
        data-testid="live-stage-identity"
      >
        <LiveAvatar name={staged.author.name} avatarUrl={staged.author.avatarUrl} size="w-8 h-8" />
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider font-mono text-streak leading-none">
            {viewingName ? t('live.stage.viewing') : t('live.stage.onStage')}
          </p>
          <div className="flex items-center gap-2 mt-0.5 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{staged.author.name}</p>
            {(isDraft || (isEmpty && mirrorActivity)) && (
              <span
                data-testid="live-stage-status"
                className="shrink-0 inline-flex items-center gap-1 h-5 px-2 rounded-full border border-streak/50 bg-streak/15 text-[10px] font-medium uppercase tracking-wide text-streak"
              >
                <Pencil className="w-2.5 h-2.5" />
                {t(isDraft ? 'live.stage.status.inProgress' : 'live.stage.status.current')}
              </span>
            )}
          </div>
        </div>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            data-testid="live-stage-clear"
            className="ml-auto inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-border bg-background text-sm font-medium text-foreground hover:border-streak/50 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> {t('live.stage.clear')}
          </button>
        )}
      </div>

      <div
        className="px-4 md:px-8 py-6 bg-muted/40 bg-gradient-to-b from-streak/[0.08] to-transparent"
        data-testid="live-stage-body"
      >
        <LiveStageBody
          staged={staged}
          mirrorActivity={mirrorActivity}
          cursor={cursor}
          cursorIntervalMs={cursorIntervalMs}
          cursorOff={cursorOff}
        />
      </div>
    </div>
  );
}
