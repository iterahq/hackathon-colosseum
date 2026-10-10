import { useI18n } from '@/i18n';
import { snapshotWhen } from '@/utils/snapshot';

/** "on-chain em {local date and time}"; renders nothing without a mirror time. */
export function SnapshotLine({ mirroredAt, className = '' }: { mirroredAt: string | null | undefined; className?: string }) {
  const { t, locale } = useI18n();
  const when = snapshotWhen(mirroredAt, locale);
  if (!when) return null;
  return (
    <span className={`[font:500_12px_JetBrains_Mono] text-[#A0978A] ${className}`} data-testid="snapshot-line">
      {t('snapshot.asOf', { when })}
    </span>
  );
}
