import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { LEGAL_AND_HELP_URLS } from '@iterahq/shell-core';
import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import { useI18n } from '@/i18n';
import { addressUrl } from '@/lib/explorer';
import type { LearnerAvatar as Avatar } from '@/types/avatar';
import type { WalletIdentity } from '@/types/headerHud';
import { shortAddress } from '@/utils/headerHud';
import { HeaderIcon } from './HeaderIcon';
import { HeaderLocale } from './HeaderLocale';
import { MENU_ITEM, MENU_LEGAL, MenuLegalRow, MenuSection } from './HeaderMenuParts';
import type { HeaderRoles } from './useHeaderRoles';

interface Props {
  name: string;
  avatar: Avatar;
  email: string | null;
  wallet: WalletIdentity | null;
  roles: HeaderRoles;
  onClose: () => void;
  onExplainer: () => void;
  onSignOut: () => void;
}

/** The account sheet: who is signed in, then account, help, staff areas and sign out, each under a mono label. */
export function HeaderMenu({ name, avatar, email, wallet, roles, onClose, onExplainer, onSignOut }: Props) {
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
        <LearnerAvatar avatar={avatar} size="md" thumb={false} />
        <div className="min-w-0 flex-1">
          {name && <span className="block truncate [font:700_17px_'Barlow_Condensed'] text-[#F4EDE2]">{name}</span>}
          {wallet ? (
            <div className="mt-1" data-testid="header-menu-wallet">
              <span className="flex items-center gap-1.5 [font:600_9px_JetBrains_Mono] uppercase tracking-[.1em] text-[#3FD17F]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#3FD17F]" aria-hidden />
                {t('header.id.wallet', { network: wallet.network || 'devnet' })}
              </span>
              <span className="mt-0.5 flex items-center gap-0.5">
                <span className="truncate [font:500_11px_JetBrains_Mono] text-[#A0978A]" title={wallet.address}>
                  {shortAddress(wallet.address, 6, 6)}
                </span>
                <button
                  type="button"
                  role="menuitem"
                  onClick={copy}
                  aria-label={copied ? t('header.id.copied') : t('header.id.copy')}
                  title={copied ? t('header.id.copied') : t('header.id.copy')}
                  className="hd-focus grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-[#A0978A] hover:bg-[#1C1916] hover:text-[#F4EDE2]"
                  data-testid="header-menu-copy"
                >
                  <HeaderIcon name="copy" size={14} className={copied ? 'text-[#3FD17F]' : undefined} />
                </button>
                <a
                  href={addressUrl(wallet.address)}
                  target="_blank"
                  rel="noreferrer"
                  role="menuitem"
                  aria-label={t('header.id.explorer')}
                  title={t('header.id.explorer')}
                  onClick={onClose}
                  className="hd-focus grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-[#A0978A] hover:bg-[#1C1916] hover:text-[#F4EDE2]"
                  data-testid="header-menu-explorer"
                >
                  <HeaderIcon name="external" size={14} />
                </a>
              </span>
            </div>
          ) : (
            <>
              <span className="[font:600_10px_JetBrains_Mono] uppercase tracking-[.1em] text-[#A0978A]">{t('header.id.email')}</span>
              {email && email !== name && <span className="block truncate [font:400_12px_Inter] text-[#A0978A]">{email}</span>}
            </>
          )}
          {avatar.rarity !== 'common' && (
            <span data-testid="header-avatar-tier" className="mt-1 block [font:600_10px_JetBrains_Mono] uppercase tracking-[.1em] text-[#A0978A]">
              {avatar.tierName}
            </span>
          )}
        </div>
        <div className="shrink-0 sm:hidden">
          <HeaderLocale size="lg" />
        </div>
      </div>

      <MenuSection label={t('header.menu.account')} first>
        <Link to="/profile" role="menuitem" className={MENU_ITEM} onClick={onClose}>
          {t('header.id.profile')}
        </Link>
        <Link to="/shop#invite" role="menuitem" className={MENU_ITEM} onClick={onClose} data-testid="header-menu-invite">
          {t('invite.menu')}
        </Link>
      </MenuSection>

      <MenuSection label={t('header.menu.help')}>
        <button type="button" role="menuitem" onClick={onExplainer} className={MENU_ITEM}>
          {t('header.id.howPassport')}
        </button>
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
