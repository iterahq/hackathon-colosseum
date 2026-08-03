import { useState } from 'react';
import { AlarmClock } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useI18n } from '@/i18n';
import { ADD_TIME_MAX_TOTAL_SECONDS, ADD_TIME_MIN_TOTAL_SECONDS } from '@/utils/addLiveTime';
import { QUICK_DELTA_SECONDS, quickDeltaLabel, quickDeltaTestId } from '@/utils/liveTimeChips';

interface TimeControlProps {
  /**
   * The current activity's countdown is running. Drives the hint copy only —
   * both actions work in either state (running → the live remaining changes;
   * stopped → the duration the next start will use changes).
   */
  running: boolean;
  /** Nudge the timer by a SIGNED delta in seconds. */
  onAdjustTime: (deltaSeconds: number) => void;
  /** Set the timer to an ABSOLUTE duration in seconds. */
  onSetTime: (seconds: number) => void;
}

/**
 * Icon-only professor control that opens a popover to change the shared live
 * countdown. Two gestures, on purpose:
 *   - the chips NUDGE by a signed delta, for the mid-question "eles precisam de
 *     mais 30s";
 *   - the field SETS an absolute duration, because the authored duration used to
 *     be a floor — the professor wanted 30s on a question that starts at 1min
 *     and the only direction available was up (feedback da aula, 2026-08-02).
 */
export function AddTimeControl({ running, onAdjustTime, onSetTime }: TimeControlProps) {
  const { t } = useI18n();
  const [raw, setRaw] = useState('');

  const parsed = Math.floor(Number(raw));
  const setValid =
    raw.trim() !== '' &&
    Number.isFinite(parsed) &&
    parsed >= ADD_TIME_MIN_TOTAL_SECONDS &&
    parsed <= ADD_TIME_MAX_TOTAL_SECONDS;

  const submitSet = () => {
    if (setValid) onSetTime(parsed);
    setRaw('');
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="instructor-add-time"
          aria-label={t('live.timer.addTime.aria')}
          title={t('live.timer.addTime.aria')}
          className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-full border border-border bg-background text-foreground hover:border-clay/50 transition-colors"
        >
          <AlarmClock className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64" data-testid="instructor-add-time-popover">
        <p className="text-xs font-semibold text-foreground">{t('live.timer.addTime.title')}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {running ? t('live.timer.addTime.hintRunning') : t('live.timer.addTime.hintStopped')}
        </p>

        <div className="mt-3 flex gap-1.5">
          {QUICK_DELTA_SECONDS.map((s) => (
            <button
              key={s}
              type="button"
              data-testid={quickDeltaTestId(s)}
              onClick={() => onAdjustTime(s)}
              className="flex-1 h-9 rounded-lg border border-border bg-background text-xs font-medium tabular-nums text-foreground hover:border-clay/50 transition-colors"
            >
              {quickDeltaLabel(s)}
            </button>
          ))}
        </div>

        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            submitSet();
          }}
        >
          <input
            type="number"
            inputMode="numeric"
            min={ADD_TIME_MIN_TOTAL_SECONDS}
            max={ADD_TIME_MAX_TOTAL_SECONDS}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            data-testid="instructor-add-time-input"
            aria-label={t('live.timer.addTime.inputAria')}
            placeholder={t('live.timer.addTime.placeholder')}
            className="flex-1 min-w-0 h-9 px-2.5 rounded-lg bg-background border border-border text-sm tabular-nums text-foreground focus:outline-none focus:border-clay/60"
          />
          <button
            type="submit"
            disabled={!setValid}
            data-testid="instructor-add-time-submit"
            className="h-9 px-3 shrink-0 rounded-lg bg-clay text-white text-xs font-medium hover:bg-clay/90 transition-colors disabled:opacity-40"
          >
            {t('live.timer.addTime.set')}
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
