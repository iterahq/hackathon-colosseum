import { Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BTN_PRIMARY, BTN_SMALL, CARD, DEVNET_BADGE, MONO_LABEL } from '@/components/shop/shopStyles';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { useWalletLink } from '@/hooks/useWalletLink';
import { useI18n } from '@/i18n';
import { addressUrl, shortAddress } from '@/lib/explorer';
import { formatSolBalance, localizeDecimal } from '@/utils/shopPrice';

/** "1.9989 SOL", or a dash while the node has not answered. */
export function balanceText(lamports: number | null, locale: string): string {
  return lamports == null ? '— SOL' : `${localizeDecimal(formatSolBalance(lamports), locale)} SOL`;
}

/**
 * What the learner's wallet holds, as a wallet app shows it: the SOL balance, large, read from the public node by the
 * browser. `card` stands on the profile, with the way to the shop beside it; `line` is one row for a side panel.
 * Renders nothing for an account with no wallet.
 */
export function WalletBalance({ variant = 'card', className = '' }: { variant?: 'card' | 'line'; className?: string }) {
  const { t, locale } = useI18n();
  const { wallet } = useWalletLink();
  const { lamports, pending } = useWalletBalance(wallet);
  if (!wallet) return null;
  const amount = balanceText(lamports, locale);

  if (variant === 'line') {
    return (
      <span className={`flex items-center justify-between gap-2 ${className}`} data-testid="wallet-balance" data-variant="line" data-lamports={lamports ?? undefined} aria-busy={pending}>
        <span className={`${MONO_LABEL} !text-[10px] text-[#A0978A]`}>{t('wallet.balance.label')}</span>
        <span className="[font:700_14px_JetBrains_Mono] tabular-nums text-[#F4EDE2]" data-testid="wallet-balance-amount">{amount}</span>
      </span>
    );
  }

  return (
    <section className={`${CARD} flex flex-wrap items-center gap-x-5 gap-y-3 border-b-[5px] border-b-[#262320] p-5 ${className}`} aria-label={t('wallet.balance.title')} data-testid="wallet-balance" data-variant="card" data-lamports={lamports ?? undefined} aria-busy={pending}>
      <span aria-hidden className="flex h-12 w-12 flex-none items-center justify-center rounded-[12px] bg-[#3FD17F]/15 text-[#3FD17F]">
        <Wallet size={24} />
      </span>
      <div className="flex min-w-0 flex-1 basis-[200px] flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={`${MONO_LABEL} text-[#A0978A]`}>{t('wallet.balance.title')}</span>
          <span className={DEVNET_BADGE}>devnet</span>
        </span>
        <span className="[font:700_40px/1_'Barlow_Condensed'] tabular-nums text-[#F4EDE2]" data-testid="wallet-balance-amount">{amount}</span>
        <a href={addressUrl(wallet)} target="_blank" rel="noopener noreferrer" className="self-start [font:600_12px_JetBrains_Mono] text-[#A0978A] underline-offset-2 hover:text-[#F4EDE2] hover:underline" data-testid="wallet-balance-address">
          {shortAddress(wallet)} ↗
        </a>
      </div>
      <Link to="/shop" className={`${BTN_PRIMARY} ${BTN_SMALL} flex-none`} data-testid="wallet-balance-shop">
        {t('wallet.balance.shop')}
      </Link>
    </section>
  );
}
