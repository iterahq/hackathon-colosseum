import { Check } from 'lucide-react';
import { useI18n } from '@/i18n';
import { PLAN_INCLUDES } from '@/consts/planIncludes';

/** What the subscription includes — the desktop side panel on /signup, and the
 * compact mobile fallback below the form. Reuses the same PLAN_INCLUDES list
 * /subscribe shows, so the promise made at step 1 matches step 3. */
export function SubscriptionIncludesPanel({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();

  return (
    <div data-testid={compact ? 'subscription-includes-compact' : 'subscription-includes-panel'}>
      {!compact && (
        <h2 className="font-display text-lg font-bold text-foreground">{t('auth.signup.panelTitle')}</h2>
      )}
      <ul className={`flex flex-col gap-2 ${compact ? '' : 'mt-4'}`}>
        {PLAN_INCLUDES.map((key) => (
          <li key={key} className="flex items-start gap-2 text-sm text-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-evergreen" aria-hidden />
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
