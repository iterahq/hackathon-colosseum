/** The BYOC pending state — reading a past generation, or building a new one. */
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useI18n } from '@/i18n';
import { BYOC_STAGE_KEYS, byocProgress } from './byocProgress';

export function ByocWaiting({
  title,
  hint,
  /** Generation takes ~6s; narrate it. A read takes milliseconds — don't. */
  narrate = false,
}: {
  title: string;
  hint?: string;
  narrate?: boolean;
}) {
  const { t } = useI18n();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!narrate) return;
    const started = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - started), 500);
    return () => clearInterval(id);
  }, [narrate]);

  const { stage, percent, seconds } = byocProgress(elapsed);

  return (
    <div className="py-8 text-center" data-testid="byoc-waiting" role="status" aria-live="polite">
      <Sparkles className="mx-auto w-6 h-6 text-evergreen animate-pulse" />
      <p className="mt-3 font-medium text-foreground">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}

      {/* The bar is aria-hidden: the ticking seconds sit inside `aria-live`, and
          would re-announce the whole block every single second otherwise. */}
      {narrate && (
        <div className="mx-auto mt-5 max-w-xs" data-testid="byoc-waiting-progress" aria-hidden="true">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-evergreen transition-[width] duration-500 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground" data-testid="byoc-waiting-stage">
            {t(BYOC_STAGE_KEYS[stage])} · {seconds}s
          </p>
        </div>
      )}
    </div>
  );
}
