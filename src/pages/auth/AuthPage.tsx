/**
 * Itera sign-in: Phantom, and nothing else on the screen. One "Connect Wallet" button; a browser without
 * Phantom gets the one link that fixes it (the Phantom app's browser on a phone, the install page on a desktop).
 * The e-mail, code and DevFellowship routes still exist by URL; nothing links to them from here.
 * On success navigates to the `from` location (default '/').
 */
import { useMemo, useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { AuthShell } from '@/components/auth/AuthShell';
import { ConnectWalletButton } from '@/components/header/ConnectWalletButton';
import { useI18n } from '@/i18n';
import { returnPathOf } from '@/lib/loginReturn';
import { isGuestAccessToken } from '@/services/guestSession.service';
import { isTouchBrowser, phantomBrowseUrl } from '@/utils/phantomDeepLink';
import { PHANTOM_INSTALL_URL, isMobileBrowser } from '@/utils/solanaWallets';

const PRIMARY =
  "inline-flex min-h-14 w-full items-center justify-center rounded-xl border-0 border-b-[5px] border-b-[#1F8A4F] bg-[#3FD17F] px-6 [font:700_22px_'Barlow_Condensed'] uppercase tracking-[.04em] text-[#0A0908] transition-transform duration-75 hover:bg-[#5BE095] active:translate-y-[3px] active:border-b-[2px] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4EDE2]";

export default function AuthPage() {
  const { session, loading, configured } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [walletError, setWalletError] = useState<string | null>(null);
  const mobile = useMemo(() => isMobileBrowser(undefined, isTouchBrowser()), []);

  // location.state is client-controlled: only a same-origin in-app path may pass through.
  const from = returnPathOf(location);

  // Already signed in → straight to the app; without this the persisted session
  // LOOKS lost and the user "logs in again". A GUEST session must NOT count: it
  // persists in localStorage and keeps refreshing, so a learner who once joined
  // by link was bounced off this form forever, and `RequireAuth` then sent them
  // to the stored (ended) guest class — every route landed on the podium.
  if (!loading && session && !isGuestAccessToken(session.access_token)) {
    return <Navigate to={from} replace />;
  }

  const phantomHref = typeof window === 'undefined' ? '#' : phantomBrowseUrl(window.location.href, window.location.origin);

  return (
    <AuthShell title={t('door.title')} testId="login-page">
      {!configured && (
        <p className="mb-4 rounded-md bg-destructive/10 p-2 text-center text-xs text-destructive">
          Supabase is not configured (VITE_SUPABASE_* missing).
        </p>
      )}
      <img src="/mascot/tera-hero.webp" alt="" width={220} height={220} className="mx-auto mb-6 h-[220px] w-[220px] object-contain" data-testid="login-art" />
      <ConnectWalletButton
        className={PRIMARY}
        testId="web3-solana"
        onConnected={() => navigate(from, { replace: true })}
        onError={(noWallet) => setWalletError(t(noWallet ? 'auth.solana.noWallet' : 'auth.solana.error'))}
        fallback={
          mobile ? (
            <a href={phantomHref} className={PRIMARY} data-testid="open-in-phantom">
              {t('door.noWallet.openPhantom')}
            </a>
          ) : (
            <a href={PHANTOM_INSTALL_URL} target="_blank" rel="noreferrer" className={PRIMARY} data-testid="install-phantom">
              {t('door.noWallet.install')}
            </a>
          )
        }
      />
      {walletError && (
        <p id="wallet-error" role="alert" className="mt-3 text-center text-sm text-destructive" data-testid="wallet-error">
          {walletError}
        </p>
      )}
    </AuthShell>
  );
}
