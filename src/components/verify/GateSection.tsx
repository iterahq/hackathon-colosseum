import { CodeBlock } from '@/components/chain/RawParts';
import { AddressLookup, Bullets, P, VerifySection } from '@/components/verify/VerifyParts';
import { usePublishedText } from '@/hooks/useChainRead';
import { useI18n } from '@/i18n';
import { MPL_CORE_PROGRAM } from '@/lib/chain/coreAsset';
import { SAMPLE_ESCROW } from '@/lib/chain/samples';
import { acceptFunctionSource, SOURCE_PATH } from '@/lib/chain/verifyChecks';

function AcceptSource() {
  const { t } = useI18n();
  const source = usePublishedText(SOURCE_PATH);
  if (source.isPending) return <p className={P}>{t('verify.gate.loading')}</p>;
  const body = source.data ? acceptFunctionSource(source.data) : null;
  if (source.isError || !body) {
    return (
      <p role="alert" className="[font:500_14px_Inter] text-[#E0655A]">
        {t('verify.gate.error')}{' '}
        <button type="button" className="underline" onClick={() => void source.refetch()}>{t('bounty.retry')}</button>
      </p>
    );
  }
  return <CodeBlock label={t('verify.gate.codeLabel')}>{body}</CodeBlock>;
}

export function GateSection() {
  const { t } = useI18n();
  return (
    <VerifySection id="gate" title={t('verify.gate.title')}>
      <p className={P}>{t('verify.gate.intro')}</p>
      <Bullets
        items={[
          t('verify.gate.check1', { core: MPL_CORE_PROGRAM }),
          t('verify.gate.check2'),
          t('verify.gate.check3'),
          t('verify.gate.check4'),
        ]}
      />
      <AcceptSource />
      <p className={P}>{t('verify.gate.notChecked')}</p>
      <p className={P}>{t('verify.gate.signers')}</p>
      <p className="[font:400_12px/1.5_Inter] text-[#A0978A]">{t('verify.gate.sample')}</p>
      <AddressLookup initial={SAMPLE_ESCROW} label={t('verify.gate.input')} testId="gate-lookup" />
    </VerifySection>
  );
}
