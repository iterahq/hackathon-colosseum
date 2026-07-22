import { MonitorUp } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import type { ClassPresenceMember } from '@/types/liveClass';

interface LiveStagePickerProps {
  /** Learners (present, non-instructor) who have answered the current activity. */
  answered: ClassPresenceMember[];
  /** A staged answer is currently active (offer "take off stage"). */
  staged: boolean;
  onPull: (userId: string) => void;
  onClear: () => void;
}

/**
 * Instructor-only control: pick a learner who has ALREADY answered the current
 * activity and pull their answer to the class stage (everyone sees it). Only
 * answered learners are pullable — a student with no answer never appears.
 */
export function LiveStagePicker({ answered, staged, onPull, onClear }: LiveStagePickerProps) {
  const { t } = useI18n();

  return (
    <div className="p-4" data-testid="live-stage-picker">
      <div className="flex items-center justify-between mb-2.5">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
          <MonitorUp className="w-4 h-4 text-clay" /> {t('live.stage.picker.title')}
        </span>
        {staged && (
          <button
            type="button"
            onClick={onClear}
            data-testid="live-stage-picker-clear"
            className="text-xs font-medium text-clay hover:underline"
          >
            {t('live.stage.picker.clear')}
          </button>
        )}
      </div>

      {answered.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('live.stage.picker.empty')}</p>
      ) : (
        <ul className="space-y-1.5">
          {answered.map((m) => (
            <li key={m.userId}>
              <button
                type="button"
                onClick={() => onPull(m.userId)}
                data-testid="live-stage-pull"
                className="w-full flex items-center gap-2 h-10 pl-1.5 pr-2 rounded-xl border border-border bg-background hover:border-clay/50 transition-colors text-left"
              >
                <LiveAvatar name={m.name} avatarUrl={m.avatarUrl} size="w-6 h-6" />
                <span className="flex-1 min-w-0 truncate text-sm text-foreground">{m.name}</span>
                <span className="text-[11px] font-medium text-clay">
                  {t('live.stage.picker.pull')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
