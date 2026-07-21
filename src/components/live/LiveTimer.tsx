import { useEffect, useRef } from 'react';
import { Timer as TimerIcon } from 'lucide-react';
import { useCountdown } from '@/hooks/useCountdown';
import { useI18n } from '@/i18n';
import { formatMmss } from '@/utils/formatMmss';

const WARN_SECONDS = 5;
const HURRY_SECONDS = 10;

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
  /** Fires once per second during the final countdown (at 5,4,3,2,1). */
  onWarn?: () => void;
  /** Larger sizing for the top-chrome hero placement. */
  prominent?: boolean;
}

export function LiveTimer({ deadline, onExpire, onWarn, prominent = false }: LiveTimerProps) {
  const { t } = useI18n();
  const remaining = useCountdown(deadline);
  const done = remaining <= 0;
  const warning = !done && remaining <= WARN_SECONDS;
  // Three-stage urgency ramp: calm → attention (≤10s) → urgent (≤5s). The
  // mid "hurry" stage gives the room a heads-up before the red pulse instead
  // of jumping straight from calm to alarm.
  const hurry = !done && !warning && remaining <= HURRY_SECONDS;
  const firedRef = useRef(false);
  const lastTickRef = useRef(0);

  useEffect(() => {
    firedRef.current = false;
    lastTickRef.current = 0;
  }, [deadline]);

  useEffect(() => {
    if (done && !firedRef.current) {
      firedRef.current = true;
      onExpire?.();
    }
  }, [done, onExpire]);

  useEffect(() => {
    // Tick once per remaining second inside the window (5,4,3,2,1).
    if (!done && remaining >= 1 && remaining <= WARN_SECONDS && remaining !== lastTickRef.current) {
      lastTickRef.current = remaining;
      onWarn?.();
    }
  }, [remaining, done, onWarn]);

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border font-mono tabular-nums transition-colors ${
        prominent ? 'px-3 h-9 text-sm md:px-5 md:h-10 md:text-lg font-semibold' : 'px-3 h-9 text-sm'
      } ${
        done || warning
          ? 'border-destructive/50 bg-destructive/10 text-destructive'
          : hurry
            ? 'border-clay/50 bg-clay/10 text-clay'
            : 'border-border bg-card text-muted-foreground'
      } ${warning ? 'animate-pulse' : ''}`}
      data-testid="live-timer"
      data-done={done ? 'true' : 'false'}
      data-warning={warning ? 'true' : 'false'}
      data-hurry={hurry ? 'true' : 'false'}
      role="timer"
      aria-live={done ? 'assertive' : 'off'}
    >
      <TimerIcon className="w-4 h-4" />
      {done ? t('live.timer.done') : formatMmss(remaining)}
    </div>
  );
}
