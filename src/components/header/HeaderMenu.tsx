import { motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';
import type { WalletIdentity } from '@/types/headerHud';
import { shortAddress } from '@/utils/headerHud';
import { HeaderIcon } from './HeaderIcon';

interface Props {
  name: string;
  email: string | null;
  wallet: WalletIdentity | null;
  admin: boolean;
  onClose: () => void;
  onToggleLocale: () => void;
  onSignOut: () => void;
}

const ITEM = 'hd-focus flex min-h-11 w-full items-center gap-2.5 rounded-[8px] px-3 text-left [font:500_13px_JetBrains_Mono] text-[#F4EDE2] hover:bg-[#1C1916]';

const explorerUrl = (address: string, network: string | null) =>
  `https://explorer.solana.com/address/${encodeURIComponent(address)}${network ? `?cluster=${encodeURIComponent(network)}` : ''}`;

/** The account sheet: who is signed in (name or wallet), the wallet tools, then the existing actions. */
export function HeaderMenu({ name, email, wallet, admin, onClose, onToggleLocale, onSignOut }: Props) {
  const { t, locale } = useI18n();
  const reduced = !!useReducedMotion();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(wallet?.address ?? '').then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <motion.div
      role="menu"
      initial={reduced ? false : { opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="absolute right-0 top-[calc(100%+8px)] w-[260px] overflow-hidden rounded-[12px] border border-[#2E2A25] bg-[#141210] shadow-[0_18px_40px_rgba(0,0,0,.55)]"
      data-testid="header-menu"
    >
      <div className="border-b border-[#262320] px-4 py-3">
        {wallet ? (
          <>
            <span className="flex items-center gap-1.5 [font:600_10px_JetBrains_Mono] uppercase tracking-[.1em] text-[#3FD17F]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#3FD17F]" aria-hidden />
              {t('header.id.wallet', { network: wallet.network ?? wallet.chain })}
            </span>
            <span className="mt-1 block truncate [font:700_15px_JetBrains_Mono] text-[#F4EDE2]" title={wallet.address}>
              {shortAddress(wallet.address, 6, 6)}
            </span>
          </>
        ) : (
          <>
            <span className="[font:600_10px_JetBrains_Mono] uppercase tracking-[.1em] text-[#A0978A]">{t('header.id.email')}</span>
            <span className="mt-1 block truncate [font:700_17px_'Barlow_Condensed'] text-[#F4EDE2]">{name}</span>
            {email && email !== name && <span className="block truncate [font:400_12px_Inter] text-[#A0978A]">{email}</span>}
          </>
        )}
      </div>
      <div className="p-1.5">
        {wallet && (
          <>
            <button type="button" role="menuitem" onClick={copy} className={ITEM}>
              <HeaderIcon name="copy" size={16} />
              {copied ? t('header.id.copied') : t('header.id.copy')}
            </button>
            <a href={explorerUrl(wallet.address, wallet.network)} target="_blank" rel="noreferrer" role="menuitem" className={ITEM} onClick={onClose}>
              <HeaderIcon name="external" size={16} />
              {t('header.id.explorer')}
            </a>
            <span className="my-1 block h-px bg-[#262320]" aria-hidden />
          </>
        )}
        <Link to="/profile" role="menuitem" className={ITEM} onClick={onClose}>
          {t('header.id.profile')}
        </Link>
        {admin && (
          <Link to="/admin" role="menuitem" className={ITEM} onClick={onClose}>
            {t('header.id.admin')}
          </Link>
        )}
        <button type="button" role="menuitem" onClick={onToggleLocale} className={ITEM} data-locale={locale}>
          {t('header.id.language')}
        </button>
        <button type="button" role="menuitem" onClick={onSignOut} className={`${ITEM} text-[#E07A4A]`}>
          {t('header.id.signOut')}
        </button>
      </div>
    </motion.div>
  );
}
