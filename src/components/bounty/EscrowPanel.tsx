import { CopyAddress, ExplorerAnchor, SECTION_TITLE, ShortWallet } from '@/components/bounty/bountyUi';
import { CARD, MONO_LABEL } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import type { Bounty } from '@/types/bounty';

function formatSol(lamports: number): string {
  const whole = Math.floor(lamports / 1_000_000_000);
  const fraction = String(lamports % 1_000_000_000).padStart(9, '0').replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''} SOL`;
}

export function EscrowPanel({ bounty }: { bounty: Bounty }) {
  const { t } = useI18n();
  const escrow = bounty.escrow;
  if (!escrow) return null;
  const program = escrow.custody === 'program';
  return (
    <section className={`${CARD} flex flex-col gap-4 p-4 sm:p-5`} aria-labelledby="bounty-escrow" data-testid="bounty-escrow">
      <div className="flex flex-col gap-1">
        <h2 id="bounty-escrow" className={SECTION_TITLE}>{t('bounty.escrow.title')}</h2>
        <p className="[font:400_14px/1.5_Inter] text-[#C9BFB0]">{t(program ? 'bounty.escrow.plain.program' : 'bounty.escrow.plain')}</p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <dt className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.escrow.address')}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <CopyAddress address={escrow.address} />
            <ExplorerAnchor href={escrow.explorerUrl} />
          </dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <dt className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.escrow.target')}</dt>
          <dd className="[font:700_20px_JetBrains_Mono] text-[#F4EDE2]">{formatSol(escrow.targetLamports)}</dd>
          <dd className="[font:400_12px/1.4_Inter] text-[#A0978A]">{t(program ? 'bounty.escrow.targetHint.program' : 'bounty.escrow.targetHint')}</dd>
        </div>
        {program && escrow.programId && (
          <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2" data-testid="bounty-escrow-program">
            <dt className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.escrow.program')}</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <CopyAddress address={escrow.programId} />
              <ExplorerAnchor href={escrow.programExplorerUrl} />
            </dd>
          </div>
        )}
        {escrow.refundAddress && (
          <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
            <dt className={`${MONO_LABEL} text-[#A0978A]`}>{t('bounty.escrow.refund')}</dt>
            <dd><ShortWallet address={escrow.refundAddress} /></dd>
          </div>
        )}
      </dl>
      <p className="border-t border-[#262320] pt-3 [font:400_13px/1.5_Inter] text-[#A0978A]">{t(program ? 'bounty.custody.program' : 'bounty.custody.server')}</p>
    </section>
  );
}
