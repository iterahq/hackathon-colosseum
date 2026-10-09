import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { LEGAL_AND_HELP_URLS } from '@iterahq/shell-core';
import { useI18n } from '@/i18n';
import type { WalletIdentity } from '@/types/headerHud';
import { shortAddress } from '@/utils/headerHud';
import { HeaderIcon } from './HeaderIcon';
import { HeaderLocale } from './HeaderLocale';
import { MENU_ITEM, MENU_LEGAL, MenuLegalRow, MenuSection } from './HeaderMenuParts';
import type { HeaderRoles } from './useHeaderRoles';

interface Props {
  name: string;
  email: string | null;
  wallet: WalletIdentity | null;
  roles: HeaderRoles;
  onClose: () => void;
  onExplainer: () => void;
  onSignOut: () => void;
}

const explorerUrl = (address: string, network: string | null) =>
  `https://explorer.solana.com/address/${encodeURIComponent(address)}${network ? `?cluster=${encodeURIComponent(network)}` : ''}`;

/** The account sheet: who is signed in, then account, help, staff areas and sign out, each under a mono label. */
export function HeaderMenu({ name, email, wallet, roles, onClose, onExplainer, onSignOut }: Props) {
  const { t } = useI18n();
  const reduced = !!useReducedMotion();
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const staff = roles.admin || roles.canStartLiveClass;

  useEffect(() => {
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);

  const copy = () => {
    void navigator.clipboard?.writeText(wallet?.address ?? '').then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const items = Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    e.preventDefault();
    items[next]?.focus();
  };

  return (
    <motion.div
      ref={root}
      role="menu"
      onKeyDown={onKeyDown}
      initial={reduced ? false : { opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="absolute right-0 top-[calc(100%+8px)] max-h-[calc(100dvh-88px)] w-[min(300px,calc(100vw-24px))] overflow-y-auto overscroll-contain rounded-[12px] border border-[#2E2A25] bg-[#141210] shadow-[0_18px_40px_rgba(0,0,0,.55)]"
      data-testid="header-menu"
    >
      <div className="flex items-start justify-between gap-3 border-b border-[#262320] px-4 py-3">
        <div className="min-w-0">
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
          <span
            data-testid="header-role"
            className={`mt-2 inline-block rounded-full border px-2 py-0.5 [font:600_9px_JetBrains_Mono] uppercase tracking-[.1em] ${
              roles.privileged ? 'border-[#3FD17F]/40 text-[#3FD17F]' : 'border-[#2E2A25] text-[#A0978A]'
            }`}
          >
            {t(roles.roleKey)}
          </span>
        </div>
        <div className="shrink-0 sm:hidden">
          <HeaderLocale size="lg" />
        </div>
      </div>

      <MenuSection label={t('header.menu.account')} first>
        {wallet && (
          <>
            <button type="button" role="menuitem" onClick={copy} className={MENU_ITEM}>
              <HeaderIcon name="copy" size={16} />
              {copied ? t('header.id.copied') : t('header.id.copy')}
            </button>
            <a href={explorerUrl(wallet.address, wallet.network)} target="_blank" rel="noreferrer" role="menuitem" className={MENU_ITEM} onClick={onClose}>
              <HeaderIcon name="external" size={16} />
              {t('header.id.explorer')}
            </a>
          </>
        )}
        <Link to="/profile" role="menuitem" className={MENU_ITEM} onClick={onClose}>
          {t('header.id.profile')}
        </Link>
        <Link to="/passport" role="menuitem" className={MENU_ITEM} onClick={onClose}>
          {t('header.id.passport')}
        </Link>
        <button type="button" role="menuitem" onClick={onExplainer} className={MENU_ITEM}>
          {t('header.id.howPassport')}
        </button>
      </MenuSection>

      <MenuSection label={t('header.menu.help')}>
        <a href={LEGAL_AND_HELP_URLS.support} target="_blank" rel="noreferrer" role="menuitem" className={MENU_ITEM} onClick={onClose}>
          <HeaderIcon name="external" size={16} />
          {t('header.id.help')}
        </a>
        <MenuLegalRow>
          <a href={LEGAL_AND_HELP_URLS.terms} target="_blank" rel="noreferrer" role="menuitem" className={MENU_LEGAL} onClick={onClose}>
            {t('header.id.terms')}
          </a>
          <a href={LEGAL_AND_HELP_URLS.privacy} target="_blank" rel="noreferrer" role="menuitem" className={MENU_LEGAL} onClick={onClose}>
            {t('header.id.privacy')}
          </a>
        </MenuLegalRow>
      </MenuSection>

      {staff && (
        <MenuSection label={t('header.menu.staff')}>
          {roles.admin && (
            <>
              <Link to="/admin" role="menuitem" className={MENU_ITEM} onClick={onClose}>
                {t('header.id.admin')}
              </Link>
              <Link to="/author" role="menuitem" className={MENU_ITEM} onClick={onClose}>
                {t('nav.author')}
              </Link>
            </>
          )}
          {roles.canStartLiveClass && (
            <Link to="/live/instructor" role="menuitem" className={`${MENU_ITEM} text-[#3FD17F]`} onClick={onClose}>
              {t('live.instructor.start.cta')}
            </Link>
          )}
        </MenuSection>
      )}

      <div className="border-t border-[#262320] p-1.5">
        <button type="button" role="menuitem" onClick={onSignOut} className={`${MENU_ITEM} text-[#E07A4A]`}>
          {t('header.id.signOut')}
        </button>
      </div>
    </motion.div>
  );
}
