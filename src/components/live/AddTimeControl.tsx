import { useState } from 'react';
import { AlarmClockPlus } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useI18n } from '@/i18n';

/** Quick-add increments (seconds): +30s, +1min, +2min. */
const QUICK_ADD_SECONDS = [30, 60, 120] as const;
/** A single addition is capped to 1h — the same ceiling as the timer override. */
const MAX_ADD_SECONDS = 3600;

/** Short label for a quick-add chip: `+30s`, `+1min`, `+2min`. */
function quickAddLabel(seconds: number): string {
  return seconds < 60 ? `+${seconds}s` : `+${Math.round(seconds / 60)}min`;
}

interface AddTimeControlProps {
  /**
   * The current activity's countdown is running. Drives the hint copy only —
   * ADDING is allowed in both states (running → extends the live remaining;
   * stopped → grows the duration the next start will use).
   */
  running: boolean;
  /** Add `seconds` to the timer. Positive integers only. */
  onAddTime: (seconds: number) => void;
}

/**
 * Icon-only professor control that opens a popover to ADD seconds to the shared
 * live countdown (Tainan: "botão que abre um popover em q o professor pode
 * aumentar o tempo em segundos"). Offers quick increments AND a free value in
 * seconds. It never SETS the clock — it always adds:
 *   - running  → adds to the time REMAINING (40s left + 60s ⇒ 100s), re-broadcast
 *     through the very same timer channel so the class sees the countdown jump.
 *   - stopped  → bumps the duration the NEXT start fires with (shown live on the
 *     start button label, so the effect is obvious before launch).
 */
export function AddTimeControl({ running, onAddTime }: AddTimeControlProps) {
  const { t } = useI18n();
  const [raw, setRaw] = useState('');

  const parsed = Math.floor(Number(raw));
  const freeValid =
    raw.trim() !== '' && Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_ADD_SECONDS;

  function submitFree() {
    if (!freeValid) return;
    onAddTime(parsed);
    setRaw('');
  }

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
          <AlarmClockPlus className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64"
        data-testid="instructor-add-time-popover"
      >
        <p className="text-xs font-semibold text-foreground">{t('live.timer.addTime.title')}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {running ? t('live.timer.addTime.hintRunning') : t('live.timer.addTime.hintStopped')}
        </p>

        <div className="mt-3 flex gap-1.5">
          {QUICK_ADD_SECONDS.map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`instructor-add-time-quick-${s}`}
              onClick={() => onAddTime(s)}
              className="flex-1 h-9 rounded-lg border border-border bg-background text-xs font-medium tabular-nums text-foreground hover:border-clay/50 transition-colors"
            >
              {quickAddLabel(s)}
            </button>
          ))}
        </div>

        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            submitFree();
          }}
        >
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_ADD_SECONDS}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            data-testid="instructor-add-time-input"
            aria-label={t('live.timer.addTime.inputAria')}
            placeholder={t('live.timer.addTime.placeholder')}
            className="flex-1 min-w-0 h-9 px-2.5 rounded-lg bg-background border border-border text-sm tabular-nums text-foreground focus:outline-none focus:border-clay/60"
          />
          <button
            type="submit"
            disabled={!freeValid}
            data-testid="instructor-add-time-submit"
            className="h-9 px-3 shrink-0 rounded-lg bg-clay text-white text-xs font-medium hover:bg-clay/90 transition-colors disabled:opacity-40"
          >
            {t('live.timer.addTime.add')}
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
