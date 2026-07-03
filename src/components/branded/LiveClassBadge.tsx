/**
 * Live-class BADGE (a badge, NOT a card) — appears on the home/dashboard when a
 * live class is active + visible to the user (per-tenant enable gate is enforced
 * inside useActiveLiveClass). Clicking enters the live session.
 *
 * Deliberately a compact pill with a pulsing "live" dot — it announces the class
 * without taking a full card slot in the grid (plan piece #4).
 */
import { useNavigate } from 'react-router-dom';
import { Radio } from 'lucide-react';
import { useActiveLiveClass } from '@/hooks/useLiveClass';
import { useI18n } from '@/i18n';

export function LiveClassBadge() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { data: active } = useActiveLiveClass();

  if (!active) return null;

  return (
    <button
      type="button"
      onClick={() => navigate(`/live/${active.id}`)}
      data-testid="live-class-badge"
      aria-label={t('live.badge.enter')}
      className="inline-flex items-center gap-2 h-9 pl-2.5 pr-4 rounded-full border border-clay/50 bg-clay/10 text-sm font-medium text-foreground hover:bg-clay/20 hover:border-clay/70 transition-colors"
    >
      <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-clay opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-clay" />
      </span>
      <Radio className="w-4 h-4 text-clay" />
      <span className="font-mono text-[11px] uppercase tracking-wider text-clay">
        {t('live.badge.label')}
      </span>
      <span className="hidden sm:inline">{t('live.badge.enter')}</span>
    </button>
  );
}
