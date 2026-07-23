import { CheckCircle2, Circle, Loader2, MonitorUp, Pencil, WifiOff } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import type { StagePickerLearner, StageWorkStatus } from '@/types/liveClass';

interface LiveStagePickerProps {
  /** Every present, non-instructor learner — with the state we know for each. */
  learners: StagePickerLearner[];
  /** Staged work is currently active (offer "take off stage"). */
  staged: boolean;
  /** Learner whose pull is in flight — shows a spinner instead of the CTA. */
  pendingUserId?: string | null;
  /** Learner whose pull timed out (offline / unreachable) — shows the warning. */
  unreachableUserId?: string | null;
  onPull: (userId: string) => void;
  onClear: () => void;
}

/** Per-state icon + text color. clay = human-info, evergreen = finished. */
const STATE_STYLE: Record<StageWorkStatus, { Icon: typeof Circle; className: string }> = {
  submitted: { Icon: CheckCircle2, className: 'text-evergreen' },
  in_progress: { Icon: Pencil, className: 'text-clay' },
  not_started: { Icon: Circle, className: 'text-muted-foreground' },
};

const STATE_LABEL: Record<StageWorkStatus, string> = {
  submitted: 'live.stage.picker.state.submitted',
  in_progress: 'live.stage.picker.state.inProgress',
  not_started: 'live.stage.picker.state.notStarted',
};

/**
 * Instructor-only control: pick ANY learner present in the room and pull their
 * work for the current activity to the class stage.
 *
 * ADR-4 revised (Tainan, 2026-07-23): it used to list only learners who had
 * already answered, which hid exactly what the professor wants to follow — how
 * each student is advancing WHILE they work. Now everyone present is listed with
 * their state (concluiu / em andamento / não começou), so the choice is informed
 * instead of blind. Pulling still goes through the peer-to-peer request → the
 * learner answers for itself; nobody can pull someone else's work.
 */
export function LiveStagePicker({
  learners,
  staged,
  pendingUserId,
  unreachableUserId,
  onPull,
  onClear,
}: LiveStagePickerProps) {
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

      {learners.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('live.stage.picker.empty')}</p>
      ) : (
        <ul className="space-y-1.5">
          {learners.map((m) => {
            const { Icon, className } = STATE_STYLE[m.state];
            const pending = pendingUserId === m.userId;
            const unreachable = unreachableUserId === m.userId;
            return (
              <li key={m.userId}>
                <button
                  type="button"
                  onClick={() => onPull(m.userId)}
                  disabled={pending}
                  data-testid="live-stage-pull"
                  data-state={m.state}
                  className="w-full flex items-center gap-2 h-10 pl-1.5 pr-2 rounded-xl border border-border bg-background hover:border-clay/50 disabled:opacity-60 transition-colors text-left"
                >
                  <LiveAvatar name={m.name} avatarUrl={m.avatarUrl} size="w-6 h-6" />
                  <span className="flex-1 min-w-0 truncate text-sm text-foreground">{m.name}</span>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-medium ${className}`}
                    data-testid="live-stage-pull-state"
                  >
                    <Icon className="w-3 h-3" />
                    {t(STATE_LABEL[m.state])}
                  </span>
                  {pending ? (
                    <span
                      className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground"
                      data-testid="live-stage-pull-pending"
                    >
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {t('live.stage.picker.pulling')}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[11px] font-medium text-clay">
                      {t('live.stage.picker.pull')}
                    </span>
                  )}
                </button>
                {/* The pull is peer-to-peer: an offline learner can never answer
                    it. Say that out loud instead of spinning forever. */}
                {unreachable && !pending && (
                  <p
                    className="mt-1 pl-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                    data-testid="live-stage-pull-unreachable"
                  >
                    <WifiOff className="w-3 h-3" />
                    {t('live.stage.picker.unreachable')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
