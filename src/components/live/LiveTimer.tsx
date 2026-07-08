import { useEffect, useRef } from 'react';
import { Timer as TimerIcon } from 'lucide-react';
import { useCountdown } from '@/hooks/useCountdown';
import { useI18n } from '@/i18n';
import { formatMmss } from '@/utils/formatMmss';

const WARN_SECONDS = 5;

interface LiveTimerProps {
  deadline: number;
  /**
   * Fires once when the countdown reaches 0. The learner surface uses it to LOCK
   * the activity (per Samuel's directive). SECURITY: the timer rides a PUBLIC
   * broadcast channel, so a learner CAN spoof "time's up" and lock the cohort —
   * acceptable for the trusted pilot, but this is what raises the priority of
   * making the channel private + restricting the timer writer to the instructor
   * (issue #57). Never wire onExpire to durable scoring while the channel is public.
   */
  onExpire?: () => void;
  /** Fires once when the countdown crosses into the final WARN_SECONDS. */
  onWarn?: () => void;
}

export function LiveTimer({ deadline, onExpire, onWarn }: LiveTimerProps) {
  const { t } = useI18n();
  const remaining = useCountdown(deadline);
  const done = remaining <= 0;
  const warning = !done && remaining <= WARN_SECONDS;
  const firedRef = useRef(false);
  const warnedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    warnedRef.current = false;
  }, [deadline]);

  useEffect(() => {
    if (done && !firedRef.current) {
      firedRef.current = true;
      onExpire?.();
    }
  }, [done, onExpire]);

  useEffect(() => {
    if (warning && !warnedRef.current) {
      warnedRef.current = true;
      onWarn?.();
    }
  }, [warning, onWarn]);

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 h-9 rounded-full border text-sm font-mono tabular-nums transition-colors ${
        done || warning
          ? 'border-destructive/50 bg-destructive/10 text-destructive'
          : 'border-clay/50 bg-clay/10 text-clay'
      } ${warning ? 'animate-pulse' : ''}`}
      data-testid="live-timer"
      data-done={done ? 'true' : 'false'}
      data-warning={warning ? 'true' : 'false'}
      role="timer"
      aria-live={done ? 'assertive' : 'off'}
    >
      <TimerIcon className="w-4 h-4" />
      {done ? t('live.timer.done') : formatMmss(remaining)}
    </div>
  );
}
