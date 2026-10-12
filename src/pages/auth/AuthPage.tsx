/**
 * Itera sign-in: Phantom, and nothing else on the screen. One "Connect Wallet" button; a browser without
 * Phantom gets the one link that fixes it (the Phantom app's browser on a phone, the install page on a desktop)
 * and, under it, the two ways on that need no wallet: the first lesson and an example profile.
 * The e-mail, code and DevFellowship routes still exist by URL; nothing links to them from here.
 * On success navigates to the `from` location (default '/').
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { AuthShell } from '@/components/auth/AuthShell';
import { ConnectWalletButton } from '@/components/header/ConnectWalletButton';
import { EXAMPLE_WALLET } from '@/components/landing/landingStyles';
import { TRY_PATH } from '@/consts/guestLesson';
import { useI18n } from '@/i18n';
import { returnPathOf } from '@/lib/loginReturn';
import { isGuestAccessToken } from '@/services/guestSession.service';
import { isTouchBrowser, phantomBrowseUrl } from '@/utils/phantomDeepLink';
import { PHANTOM_INSTALL_URL, isMobileBrowser } from '@/utils/solanaWallets';

const PRIMARY =
  "inline-flex min-h-14 w-full items-center justify-center rounded-xl border-0 border-b-[5px] border-b-[#1F8A4F] bg-[#3FD17F] px-6 [font:700_22px_'Barlow_Condensed'] uppercase tracking-[.04em] text-[#0A0908] transition-transform duration-75 hover:bg-[#5BE095] active:translate-y-[3px] active:border-b-[2px] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4EDE2]";

const SMALL_LINK = 'inline-flex min-h-11 items-center rounded text-[#C9BFB0] underline underline-offset-4 hover:text-[#3FD17F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]';

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
      <div className="relative mx-auto mb-6 flex h-[260px] w-full items-end justify-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-1/2 h-24 w-56 -translate-x-1/2 rounded-full bg-[#3FD17F]/30 blur-2xl"
        />
        <img src="/mascot/tera-body.webp" alt="" width={186} height={260} className="relative h-[260px] w-[186px] object-contain" data-testid="login-art" />
      </div>
      <ConnectWalletButton
        className={PRIMARY}
        testId="web3-solana"
        onConnected={() => navigate(from, { replace: true })}
        onError={(noWallet) => setWalletError(t(noWallet ? 'auth.solana.noWallet' : 'auth.solana.error'))}
        fallback={
          <>
            {mobile ? (
              <a href={phantomHref} className={PRIMARY} data-testid="open-in-phantom">
                {t('door.noWallet.openPhantom')}
              </a>
            ) : (
              <a href={PHANTOM_INSTALL_URL} target="_blank" rel="noreferrer" className={PRIMARY} data-testid="install-phantom">
                {t('door.noWallet.install')}
              </a>
            )}
            <p className="mt-3 text-center [font:500_12px/1.5_JetBrains_Mono] text-[#A0978A]" data-testid="login-devnet">
              {t('door.noWallet.devnet')}
            </p>
            <p className="mt-4 flex flex-col items-center gap-1 [font:500_14px/1.4_Inter]">
              <Link to={TRY_PATH} className={SMALL_LINK} data-testid="login-try">
                {t('door.noWallet.try')} →
              </Link>
              <Link to={`/u/${EXAMPLE_WALLET}`} className={SMALL_LINK} data-testid="login-example">
                {t('door.noWallet.example')} →
              </Link>
            </p>
          </>
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
