import { useI18n } from '@/i18n';

/**
 * The guest badge (ADR-9 + ADR-11) — LOAD-BEARING, not decoration.
 *
 * Guest names are self-declared with no uniqueness check, so a guest may
 * legitimately type the exact display name of a real student. ADR-11 accepts
 * that collision precisely BECAUSE this badge carries the distinction; drop it
 * from any surface a guest appears on (reception, roster, ranked list, podium)
 * and that surface becomes silent impersonation.
 */
export function LiveGuestBadge({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  return (
    <span
      data-testid="live-guest-badge"
      title={t('live.guest.badge')}
      aria-label={t('live.guest.badge')}
      className={`shrink-0 inline-flex items-center rounded-full border border-clay/50 bg-clay/10 px-1.5 text-[10px] uppercase tracking-wide font-mono text-clay ${className}`}
    >
      {t('live.guest.badge')}
    </span>
  );
}
