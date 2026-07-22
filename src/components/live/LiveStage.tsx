import { X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { CodeLivePreview } from '@/components/branded/activity/code/CodeLivePreview';
import type { StagedAnswer } from '@/types/liveClass';

interface LiveStageProps {
  staged: StagedAnswer;
  /** Instructor-only affordance to dismiss the stage for everyone. */
  onClear?: () => void;
}

/**
 * The shared "on stage" surface (ADR-3/4): an identity bar naming the author
 * (NOT anonymous — the whole class sees whose answer it is) plus the staged
 * answer. `code` shows a read-only Monaco + the SAME sandboxed live preview the
 * learner sees; other kinds show a design-system summary card. Rendered by both
 * the learner and instructor pages directly below the navbar.
 */
export function LiveStage({ staged, onClear }: LiveStageProps) {
  const { t } = useI18n();
  const isCode = staged.kind === 'code';

  return (
    <div data-testid="live-stage">
      <div
        className="flex items-center gap-3 px-4 md:px-8 py-3 border-b border-clay/40 bg-clay/10"
        data-testid="live-stage-identity"
      >
        <LiveAvatar name={staged.author.name} avatarUrl={staged.author.avatarUrl} size="w-8 h-8" />
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider font-mono text-clay leading-none">
            {t('live.stage.onStage')}
          </p>
          <p className="text-sm font-medium text-foreground truncate mt-0.5">
            {staged.author.name}
          </p>
        </div>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            data-testid="live-stage-clear"
            className="ml-auto inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-border bg-background text-sm font-medium text-foreground hover:border-clay/50 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> {t('live.stage.clear')}
          </button>
        )}
      </div>

      <div className="px-4 md:px-8 py-6">
        {isCode ? (
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
