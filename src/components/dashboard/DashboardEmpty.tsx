import { useI18n } from '@/i18n';

interface Props {
  kind: 'empty' | 'error';
  onAction: () => void;
}

export function DashboardEmpty({ kind, onAction }: Props) {
  const { t } = useI18n();
  const error = kind === 'error';
  return (
    <section
      className="flex flex-col items-start gap-4 rounded-[14px] border border-dashed border-[#2E2A25] bg-[#141210] p-8"
      data-testid={error ? 'dashboard-error' : 'dashboard-empty'}
    >
      <p className="[font:700_32px_'Barlow_Condensed']">{error ? t('dash.error') : t('dash.empty.title')}</p>
      <button
        type="button"
        onClick={onAction}
        className="h-12 rounded-xl border-0 border-b-[5px] border-b-[#1F8A4F] bg-[#3FD17F] px-6 [font:700_22px_'Barlow_Condensed'] text-[#0A0908] transition-transform duration-75 active:translate-y-1 active:border-b-[1px]"
      >
        {error ? t('dash.retry') : t('dash.empty.cta')}
      </button>
    </section>
  );
}
