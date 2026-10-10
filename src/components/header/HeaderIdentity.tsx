import { AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import { useLearnerAvatar } from '@/hooks/useLearnerAvatar';
import { useProfile } from '@/hooks/useProfile';
import { useWalletLink } from '@/hooks/useWalletLink';
import { useI18n } from '@/i18n';
import { isGenericName } from '@/utils/isGenericName';
import { shortAddress, walletOf } from '@/utils/headerHud';
import { HeaderIcon } from './HeaderIcon';
import { HeaderMenu } from './HeaderMenu';
import { HeaderPassportExplainer } from './HeaderPassportExplainer';
import { useHeaderRoles } from './useHeaderRoles';

/** The identity pill: the chosen name (with the short address under it for a wallet), else the short address; opens the account menu. */
export function HeaderIdentity() {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();
  const { data: profile } = useProfile();
  const roles = useHeaderRoles();
  const [open, setOpen] = useState(false);
  const [explainer, setExplainer] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const link = useWalletLink();
  const wallet = walletOf(user) ?? (link.wallet ? { address: link.wallet, chain: 'solana', network: 'devnet' } : null);
  const chosen = profile?.displayName && !isGenericName(profile.displayName) ? profile.displayName : '';
  const name = chosen || (wallet ? '' : user?.email || '');
  const avatar = useLearnerAvatar();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={t('header.id.menu')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="header-identity"
        className="hd-press hd-focus flex h-11 items-center gap-2 rounded-full border border-[#262320] border-b-[3px] border-b-[#2E2A25] bg-[#141210] pl-1 pr-1 text-[#F4EDE2] min-[1440px]:pr-3"
      >
        <span className="relative">
          <LearnerAvatar avatar={avatar} size="sm" />
          {wallet && <span className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-[#141210] bg-[#3FD17F]" aria-hidden />}
        </span>
        <span className="hidden max-w-[140px] flex-col items-start leading-none min-[1440px]:flex">
          {chosen || !wallet ? (
            <>
              <span className="truncate [font:700_15px_'Barlow_Condensed'] tracking-[.02em]">{name}</span>
              {wallet && <span className="mt-0.5 [font:600_9px_JetBrains_Mono] uppercase tracking-[.1em] text-[#3FD17F]">{shortAddress(wallet.address)}</span>}
            </>
          ) : (
            <>
              <span className="[font:700_13px_JetBrains_Mono]">{shortAddress(wallet.address)}</span>
              <span className="mt-0.5 [font:600_9px_JetBrains_Mono] uppercase tracking-[.1em] text-[#3FD17F]">{wallet.network ?? wallet.chain}</span>
            </>
          )}
        </span>
        <HeaderIcon name="chevron" size={14} className={`hidden text-[#A0978A] transition-transform min-[1440px]:block ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <HeaderMenu
            name={name}
            avatar={avatar}
            email={user?.email ?? null}
            wallet={wallet}
            roles={roles}
            onClose={() => setOpen(false)}
            onExplainer={() => {
              setOpen(false);
              setExplainer(true);
            }}
            onSignOut={() => void signOut()}
          />
        )}
      </AnimatePresence>
      <HeaderPassportExplainer open={explainer} onOpenChange={setExplainer} />
    </div>
  );
}
