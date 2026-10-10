import { useI18n } from '@/i18n';

/** The one-line rule of the hearts: what costs one, what gives it back, and that it lives on-chain. */
export function LivesRule({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  return (
    <p className={`max-w-[520px] [font:500_12px/1.5_Inter] text-[#A0978A] ${className}`} data-testid="lives-rule">
      {t('lives.rule')}
    </p>
  );
}
