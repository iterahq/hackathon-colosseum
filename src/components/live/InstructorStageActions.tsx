import { Eye, MonitorUp } from 'lucide-react';
import { useI18n } from '@/i18n';

interface InstructorStageActionsProps {
  busy: boolean;
  /** The professor's own screen is the one on the projector right now. */
  selfStaged: boolean;
  onToggleSelfStage: () => void;
  /** The current activity HAS an answer — content kinds hide the Reveal button. */
  canReveal: boolean;
  /** The current activity's answer is already revealed to the class. */
  revealed: boolean;
  onReveal: () => void;
}

/** The projector half of the professor's controls: stage myself, reveal the answer. */
export function InstructorStageActions({
  busy,
  selfStaged,
  onToggleSelfStage,
  canReveal,
  revealed,
  onReveal,
}: InstructorStageActionsProps) {
  const { t } = useI18n();
  return (
    <>
      <button
        onClick={onToggleSelfStage}
        disabled={busy}
        aria-pressed={selfStaged}
        data-testid="instructor-self-stage"
        className={`w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-full border text-sm transition-colors disabled:opacity-40 ${
          selfStaged
            ? 'border-evergreen bg-evergreen-soft text-evergreen-hi'
            : 'border-border bg-background text-foreground hover:border-evergreen/40'
        }`}
      >
        <MonitorUp className="w-3.5 h-3.5" />{' '}
        {selfStaged ? t('live.instructor.control.selfStageOff') : t('live.instructor.control.selfStage')}
      </button>

      {canReveal && (
        <button
          onClick={onReveal}
          disabled={busy || revealed}
          data-testid="instructor-reveal"
          className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-full border border-border bg-background text-sm text-foreground hover:border-evergreen/40 transition-colors disabled:opacity-40"
        >
          <Eye className="w-3.5 h-3.5" /> {t('live.instructor.control.reveal')}
        </button>
      )}
    </>
  );
}
