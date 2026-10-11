import { Bullets, P, VerifySection } from '@/components/verify/VerifyParts';
import { useI18n } from '@/i18n';

export function TrustSection() {
  const { t } = useI18n();
  return (
    <VerifySection id="trust" title={t('verify.trust.title')}>
      <p className={P}>{t('verify.trust.intro')}</p>
      <Bullets items={[t('verify.trust.days'), t('verify.trust.human'), t('verify.trust.key'), t('verify.trust.attester'), t('verify.trust.old'), t('verify.trust.dispute')]} />
    </VerifySection>
  );
}
