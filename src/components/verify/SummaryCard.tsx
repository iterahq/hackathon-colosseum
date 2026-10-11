import { ChainProof } from '@/components/chain/ChainProof';
import { SECTION_TITLE } from '@/components/bounty/bountyUi';
import { CARD, FOCUS } from '@/components/shop/shopStyles';
import { P } from '@/components/verify/VerifyParts';
import { useCircuit } from '@/hooks/useCircuit';
import { useI18n } from '@/i18n';
import { MPL_CORE_PROGRAM } from '@/lib/chain/coreAsset';
import { ESCROW_PROGRAM } from '@/lib/chain/escrowAccount';
import { SAMPLE_ASSET } from '@/lib/chain/samples';

const LINK = `inline-flex min-h-11 items-center rounded [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline ${FOCUS}`;

function Address({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" data-testid={testId}>
      <span className="[font:600_11px_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A]">{label}</span>
      <span className="break-all [font:500_12px/1.5_JetBrains_Mono] text-[#F4EDE2]">{value}</span>
      <ChainProof kind="address" value={value} compact />
    </div>
  );
}

/** The five addresses and the three checks a judge wants first; every section below is the long form of one of them. */
export function SummaryCard() {
  const { t } = useI18n();
  const circuit = useCircuit(null);
  const authority = circuit.data?.authority ?? null;
  const treasury = circuit.data?.treasury ?? null;
  const checks = [
    { key: 'check1', to: '#program' },
    { key: 'check2', to: '#soulbound' },
    { key: 'check3', to: '#gate' },
  ] as const;
  return (
    <section className={`${CARD} flex min-w-0 flex-col gap-4 border-[#3FD17F] p-4 sm:p-5`} aria-labelledby="verify-summary-title" data-testid="verify-summary">
      <div className="flex flex-col gap-1">
        <h2 id="verify-summary-title" className={SECTION_TITLE}>{t('verify.summary.title')}</h2>
        <p className={P}>{t('verify.summary.intro')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Address label={t('verify.summary.escrow')} value={ESCROW_PROGRAM} testId="verify-summary-escrow" />
        <Address label={t('verify.summary.core')} value={MPL_CORE_PROGRAM} testId="verify-summary-core" />
        {authority && <Address label={t('verify.summary.authority')} value={authority} testId="verify-summary-authority" />}
        {treasury && <Address label={t('verify.summary.treasury')} value={treasury} testId="verify-summary-treasury" />}
        <Address label={t('verify.summary.asset')} value={SAMPLE_ASSET} testId="verify-summary-asset" />
      </div>
      <ol className="flex flex-col gap-2 border-t border-[#262320] pt-3">
        {checks.map(({ key, to }, i) => (
          <li key={key} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="[font:700_13px_JetBrains_Mono] text-[#3FD17F]">{i + 1}.</span>
            <span className={`${P} min-w-0 flex-1 basis-[240px]`}>{t(`verify.summary.${key}`)}</span>
            <a href={to} className={LINK}>{t('verify.summary.go')} →</a>
          </li>
        ))}
      </ol>
    </section>
  );
}
