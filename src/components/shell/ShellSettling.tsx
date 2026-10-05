import { useI18n } from '@/i18n';

/** Shown inside the shell for the moment between the first paint and the bridge `HelloAck`. */
export function ShellSettling() {
  const { t } = useI18n();
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background text-muted-foreground"
      data-testid="shell-settling"
    >
      {t('common.loading')}
    </div>
  );
}
