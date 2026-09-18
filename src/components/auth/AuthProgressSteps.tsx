import { Check } from 'lucide-react';
import { useI18n } from '@/i18n';

const STEP_KEYS = ['auth.progress.email', 'auth.progress.code', 'auth.progress.subscription'] as const;

/** 3-step indicator shared by /signup and /subscribe: Email → Code → Subscription. */
export function AuthProgressSteps({ current }: { current: 1 | 2 | 3 }) {
  const { t } = useI18n();

  return (
    <ol className="mb-6 flex items-center gap-2" aria-label={t('auth.progress.label')} data-testid="auth-progress-steps">
      {STEP_KEYS.map((key, i) => {
        const step = (i + 1) as 1 | 2 | 3;
        const done = step < current;
        const active = step === current;
        return (
          <li key={key} className="flex flex-1 items-center gap-2" aria-current={active ? 'step' : undefined}>
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                done
                  ? 'bg-evergreen text-obsidiana'
                  : active
                    ? 'border-2 border-evergreen text-evergreen'
                    : 'border border-border text-muted-foreground'
              }`}
              data-testid={`auth-progress-step-${step}`}
              data-state={done ? 'done' : active ? 'active' : 'pending'}
            >
              {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : step}
            </span>
            <span className={`text-xs ${active ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
              {t(key)}
            </span>
            {step < 3 && <span className="h-px flex-1 bg-border" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
