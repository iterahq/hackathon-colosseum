import { Circle, Pencil, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { CodeLivePreview } from '@/components/branded/activity/code/CodeLivePreview';
import type { StagedAnswer } from '@/types/liveClass';

interface LiveStageProps {
  staged: StagedAnswer;
  /** Instructor-only affordance to dismiss the stage for everyone. */
  onClear?: () => void;
  /**
   * Instructor view mode (B9): the professor's own screen is REPLACED by the
   * pulled learner's, so the eyebrow reads "você está visualizando a tela de"
   * instead of the class-facing "no palco".
   */
  viewingName?: string;
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
export function LiveStage({ staged, onClear, viewingName }: LiveStageProps) {
  const { t } = useI18n();
  const isCode = staged.kind === 'code';
  const isEmpty = staged.kind === 'empty' || staged.status === 'not_started';
  const isDraft = staged.status === 'in_progress';

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
            {(isDraft || isEmpty) && (
              <span
                data-testid="live-stage-status"
                className="shrink-0 inline-flex items-center gap-1 h-5 px-2 rounded-full border border-streak/50 bg-streak/15 text-[10px] font-medium uppercase tracking-wide text-streak"
              >
                {isEmpty ? <Circle className="w-2.5 h-2.5" /> : <Pencil className="w-2.5 h-2.5" />}
                {isEmpty ? t('live.stage.status.notStarted') : t('live.stage.status.inProgress')}
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
        {isEmpty ? (
          // The learner is in the room but hasn't touched this activity. Say so
          // plainly — the pull resolving to "nothing" is information, not a bug.
          <div
            className="mx-auto max-w-2xl rounded-3xl border border-dashed border-border bg-card p-6 text-center"
            data-testid="live-stage-empty"
          >
            <p className="text-sm text-muted-foreground">{t('live.stage.empty')}</p>
          </div>
        ) : isCode ? (
          <div className="mx-auto max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-[360px] overflow-hidden rounded-2xl border border-border bg-[#0a0a0a]">
              <CodeEditor value={staged.content} language="typescript" readOnly />
            </div>
            <div className="h-[360px] overflow-hidden rounded-2xl border border-border">
              <CodeLivePreview code={staged.content} />
            </div>
          </div>
        ) : (
          <div
            className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-6 text-center"
            data-testid="live-stage-summary"
          >
            <p className="text-sm text-foreground">
              {staged.content === 'correct'
                ? t('live.stage.summary.correct')
                : t('live.stage.summary.wrong')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
