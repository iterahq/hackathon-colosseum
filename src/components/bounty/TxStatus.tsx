import { LINK, Notice } from '@/components/bounty/bountyUi';
import { useI18n } from '@/i18n';
import { describeTxError } from '@/services/bounty.service';
import type { TxPhase } from '@/types/bounty';

export function TxPhaseNotice({ phase }: { phase: TxPhase | null }) {
  const { t } = useI18n();
  if (!phase) return null;
  return <Notice testId="bounty-tx-phase">{t(`bounty.tx.phase.${phase}`)}</Notice>;
}

export function TxErrorNotice({ error }: { error: unknown }) {
  const { t } = useI18n();
  const info = describeTxError(error);
  return (
    <Notice tone="error" testId="bounty-tx-error">
      <span>{t(info.key, info.vars)}</span>
      {info.faucet && (
        <a href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer" className={`${LINK} mt-1 flex`} data-testid="bounty-faucet">
          {t('bounty.tx.faucet')} ↗
        </a>
      )}
    </Notice>
  );
}
