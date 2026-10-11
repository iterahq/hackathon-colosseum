import { CodeBlock } from '@/components/chain/RawParts';
import { ChainProof } from '@/components/chain/ChainProof';
import { DirectGateRefusal } from '@/components/verify/DirectGateRefusal';
import { GateRefusal } from '@/components/verify/GateRefusal';
import { AddressLookup, Bullets, P, VerifySection } from '@/components/verify/VerifyParts';
import { usePublishedText } from '@/hooks/useChainRead';
import { useI18n } from '@/i18n';
import { MPL_CORE_PROGRAM } from '@/lib/chain/coreAsset';
import { SAMPLE_ESCROW, SAMPLE_GATED_ACCEPT_TX } from '@/lib/chain/samples';
import { functionSource, SOURCE_PATH } from '@/lib/chain/verifyChecks';

function FunctionSource({ name, labelKey, optional = false }: { name: string; labelKey: string; optional?: boolean }) {
  const { t } = useI18n();
  const source = usePublishedText(SOURCE_PATH);
  if (source.isPending) return <p className={P}>{t('verify.gate.loading')}</p>;
  const body = source.data ? functionSource(source.data, name) : null;
  if (optional && !body) return null;
  if (source.isError || !body) {
    return (
      <p role="alert" className="[font:500_14px_Inter] text-[#E0655A]">
        {t('verify.gate.error')}{' '}
        <button type="button" className="underline" onClick={() => void source.refetch()}>{t('bounty.retry')}</button>
      </p>
    );
  }
  return <CodeBlock label={t(labelKey)}>{body}</CodeBlock>;
}

export function GateSection() {
  const { t } = useI18n();
  return (
    <VerifySection id="gate" title={t('verify.gate.title')}>
      <p className={P}>{t('verify.gate.intro')}</p>
      <GateRefusal />
      <DirectGateRefusal />
      <Bullets
        items={[
          t('verify.gate.check1', { core: MPL_CORE_PROGRAM }),
          t('verify.gate.check2'),
          t('verify.gate.check3'),
          t('verify.gate.check4'),
        ]}
      />
      <p className={P}>{t('verify.gate.gatedIntro')}</p>
      <Bullets items={[t('verify.gate.gated1'), t('verify.gate.gated2'), t('verify.gate.gated3'), t('verify.gate.gated4')]} />
      <p className={P}>{t('verify.gate.oldIntro')}</p>
      <FunctionSource name="accept" labelKey="verify.gate.codeLabel" />
      <FunctionSource name="read_stamps" labelKey="verify.gate.readStampsLabel" optional />
      <p className={P}>{t('verify.gate.notChecked')}</p>
      <p className={P}>{t('verify.gate.signers')}</p>
      {SAMPLE_GATED_ACCEPT_TX !== '' && (
        <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="gate-gated-sample">
          <span className={P}>{t('verify.gate.sampleGated')}</span>
          <ChainProof kind="tx" value={SAMPLE_GATED_ACCEPT_TX} />
        </div>
      )}
      <p className="[font:400_12px/1.5_Inter] text-[#A0978A]">{t('verify.gate.sample')}</p>
      <AddressLookup initial={SAMPLE_ESCROW} label={t('verify.gate.input')} testId="gate-lookup" />
    </VerifySection>
  );
}
