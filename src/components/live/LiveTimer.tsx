import { useEffect, useRef } from 'react';
import { Timer as TimerIcon } from 'lucide-react';
import { useCountdown } from '@/hooks/useCountdown';
import { useI18n } from '@/i18n';
import { formatMmss } from '@/utils/formatMmss';

interface LiveTimerProps {
  deadline: number;
  /**
   * Fires once when the countdown reaches 0. SECURITY: keep this purely cosmetic
   * (e.g. a sound). The timer rides a PUBLIC broadcast channel, so a learner can
   * spoof "time's up" — never wire this to auto-submit, lock answers, or scoring.
   * Only a server-authoritative timer (durable + RLS) may drive consequences.
   */
  onExpire?: () => void;
}

export function LiveTimer({ deadline, onExpire }: LiveTimerProps) {
  const { t } = useI18n();
  const remaining = useCountdown(deadline);
  const done = remaining <= 0;
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
  }, [deadline]);

  useEffect(() => {
    if (done && !firedRef.current) {
      firedRef.current = true;
      onExpire?.();
    }
  }, [done, onExpire]);

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 h-9 rounded-full border text-sm font-mono tabular-nums ${
        done
          ? 'border-destructive/50 bg-destructive/10 text-destructive'
          : 'border-clay/50 bg-clay/10 text-clay'
      }`}
      data-testid="live-timer"
      data-done={done ? 'true' : 'false'}
      role="timer"
      aria-live={done ? 'assertive' : 'off'}
    >
      <TimerIcon className="w-4 h-4" />
      {done ? t('live.timer.done') : formatMmss(remaining)}
    </div>
  );
}
