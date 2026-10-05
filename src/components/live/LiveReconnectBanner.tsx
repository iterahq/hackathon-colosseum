import { Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';

/** Floating "reconnecting…" pill shown while the live channel self-heals. */
export function LiveReconnectBanner({ show }: { show: boolean }) {
  const { t } = useI18n();
  if (!show) return null;
  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 rounded-full border border-clay/50 bg-clay/10 px-4 h-9 text-sm text-clay backdrop-blur-sm"
      data-testid="live-reconnect-banner"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="w-4 h-4 animate-spin" />
      {t('live.reconnecting')}
    </div>
  );
}
