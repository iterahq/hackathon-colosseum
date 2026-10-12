import { assetFirstUrl } from '@/lib/explorer';
import { useI18n } from '@/i18n';

interface Props {
  txSignature: string | null;
  assetAddress: string | null;
  className?: string;
}

/** The green "on-chain" pill; opens the asset on the explorer (the page with the image), or the transaction when there is no asset. */
export function OnChainMark({ txSignature, assetAddress, className }: Props) {
  const { t } = useI18n();
  const href = assetFirstUrl(assetAddress, txSignature);
  const cls = `inline-flex min-h-[24px] items-center rounded-full border border-[#3FD17F] bg-[#1C3A2A] px-2 [font:700_10px_JetBrains_Mono] text-[#3FD17F] ${className ?? ''}`;
  if (!href) return <span className={cls}>◎ {t('passport.onChain')}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="onchain-mark"
      title={t('passport.viewOnSolana')}
      className={`${cls} hover:bg-[#244b36] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3FD17F]`}
    >
      ◎ {t('passport.onChain')}
    </a>
  );
}
