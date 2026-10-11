import { ExplorerAnchor, Notice } from '@/components/bounty/bountyUi';
import { BTN_SECONDARY, BTN_SMALL } from '@/components/shop/shopStyles';
import { useSponsorFaucet } from '@/hooks/useBounties';
import { useI18n } from '@/i18n';
import { faucetKey } from '@/utils/bountyFaucet';

export function SponsorFaucet() {
  const { t } = useI18n();
  const faucet = useSponsorFaucet();
  const result = faucet.data;
  return (
    <div className="flex flex-col gap-2" data-testid="bounty-post-faucet">
      <button type="button" disabled={faucet.isPending} onClick={() => faucet.mutate()} className={`${BTN_SECONDARY} ${BTN_SMALL} w-full sm:w-auto sm:self-start`} data-testid="bounty-post-faucet-button">
        {faucet.isPending ? t('bounty.working') : t('bounty.faucet.cta')}
      </button>
      {result && (
        <Notice tone={result.kind === 'sent' ? 'good' : 'info'} testId="bounty-post-faucet-result">
          <span className="block">{t(faucetKey(result))}</span>
          {result.kind === 'sent' && <ExplorerAnchor href={result.explorerUrl} label={t('bounty.step.tx')} />}
        </Notice>
      )}
      {faucet.isError && <Notice tone="error">{t('bounty.faucet.unavailable')}</Notice>}
    </div>
  );
}
