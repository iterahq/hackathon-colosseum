import { AddressLookup, Bullets, P, VerifySection } from '@/components/verify/VerifyParts';
import { useI18n } from '@/i18n';
import { SAMPLE_ASSET } from '@/lib/chain/samples';

export function SoulboundSection() {
  const { t } = useI18n();
  return (
    <VerifySection id="soulbound" title={t('verify.soulbound.title')}>
      <p className={P}>{t('verify.soulbound.intro')}</p>
      <Bullets items={[t('verify.soulbound.point1'), t('verify.soulbound.point2'), t('verify.soulbound.point3')]} />
      <p className="[font:400_12px/1.5_Inter] text-[#A0978A]">{t('verify.soulbound.sample')}</p>
      <AddressLookup initial={SAMPLE_ASSET} label={t('verify.soulbound.input')} testId="soulbound-lookup" />
    </VerifySection>
  );
}
