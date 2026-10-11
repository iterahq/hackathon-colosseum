import { Bullets, P, VerifySection } from '@/components/verify/VerifyParts';
import { useI18n } from '@/i18n';

export function DurableSection() {
  const { t } = useI18n();
  return (
    <VerifySection id="durable" title={t('verify.durable.title')}>
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="[font:600_11px_JetBrains_Mono] uppercase tracking-[.08em] text-[#3FD17F]">{t('verify.durable.yes')}</h3>
        <Bullets items={[t('verify.durable.yes1'), t('verify.durable.yes3'), t('verify.durable.yes2')]} />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="[font:600_11px_JetBrains_Mono] uppercase tracking-[.08em] text-[#F2C66D]">{t('verify.durable.no')}</h3>
        <Bullets items={[t('verify.durable.no1'), t('verify.durable.no2'), t('verify.durable.no3')]} />
      </div>
      <p className={P}>{t('verify.durable.plan')}</p>
    </VerifySection>
  );
}
