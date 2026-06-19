/**
 * Shared loading / error / empty blocks for the admin views.
 * Matches the dfl-iterate degrade-gracefully house rule: a fresh tenant with no
 * data renders a clean empty state, never a blank screen or 500.
 */
import { useI18n } from '@/i18n';

export function AdminLoading() {
  return (
    <div className="space-y-3" data-testid="admin-loading">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-16 rounded-2xl ds-shimmer" />
      ))}
    </div>
  );
}

export function AdminError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-4 py-16" data-testid="admin-error">
      <p className="text-muted-foreground">{t('admin.error')}</p>
      <button
        onClick={onRetry}
        className="h-10 px-5 rounded-full bg-menta text-obsidiana font-medium hover:bg-verde-tech transition-colors"
      >
        {t('common.retry')}
      </button>
    </div>
  );
}

export function AdminEmpty({ message }: { message: string }) {
  return (
    <div
      className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center text-muted-foreground"
      data-testid="admin-empty"
    >
      {message}
    </div>
  );
}

export function AdminNoTenant() {
  const { t } = useI18n();
  return <AdminEmpty message={t('admin.noTenant')} />;
}
