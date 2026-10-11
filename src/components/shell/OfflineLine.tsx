import { useI18n } from '@/i18n';

/** The line itself: shown only while offline, so it is the only place that reads the dictionary. */
export function OfflineLine() {
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite" data-testid="offline-banner" className="fixed inset-x-0 top-0 z-[80] flex items-center justify-center gap-3 bg-[#F5B301] px-4 py-2 text-center [font:600_13px/1.3_Inter] text-[#0A0908]">
      <span>{t('offline.banner')}</span>
      <button type="button" onClick={() => window.location.reload()} className="rounded-full border border-[#0A0908]/40 px-3 py-1 [font:600_12px_Inter] hover:bg-[#0A0908]/10">
        {t('offline.retry')}
      </button>
    </div>
  );
}
