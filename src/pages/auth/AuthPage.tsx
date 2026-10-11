/**
 * Itera sign-in — the wallet first, because the wallet is the account that holds the certification.
 * A browser without a wallet gets no dead wallet button: on a phone the first button opens the page
 * inside the Phantom app, and "Create an account with e-mail" is a real button in both cases.
 * E-mail + password and the DevFellowship account live under "sign in with e-mail", open by default
 * when no wallet is injected. On success navigates to the `from` location (default '/').
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useLocation, Link, Navigate } from 'react-router-dom';
import { Button, Input, Label, PasswordInput } from '@devfellowship/components';
import { useAuth } from '@/auth/AuthContext';
import { loginWithDfl } from '@/auth/dflFederation';
import { AuthShell } from '@/components/auth/AuthShell';
import { WebOnly } from '@/components/shell/WebOnly';
import { TRY_PATH } from '@/consts/guestLesson';
import { useI18n } from '@/i18n';
import { returnPathOf, returnState, signupHref } from '@/lib/loginReturn';
import { isGuestAccessToken } from '@/services/guestSession.service';
import type { InjectedWallet } from '@/types/solanaWallet';
import { isTouchBrowser, phantomBrowseUrl } from '@/utils/phantomDeepLink';
import { PHANTOM_INSTALL_URL, detectInjectedWallets, isMobileBrowser } from '@/utils/solanaWallets';

const LINK = 'text-xs text-muted-foreground touch-hit underline-offset-2 hover:underline';
const PRIMARY = 'inline-flex min-h-12 w-full items-center justify-center rounded-md bg-evergreen px-4 text-sm font-medium text-obsidiana';
const OUTLINE = 'inline-flex min-h-12 w-full items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground';

export default function AuthPage() {
  const { session, loading, signInWithPassword, signInWithSolana, configured } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wallets = useMemo(() => detectInjectedWallets(), []);
  const mobile = useMemo(() => isMobileBrowser(undefined, isTouchBrowser()), []);

  // location.state is client-controlled and `from` reaches the DFL federate URL
  // as the post-login redirect — only a same-origin in-app path may pass through.
  const from = returnPathOf(location);

  // Already signed in → straight to the app; without this the persisted session
  // LOOKS lost and the user "logs in again". A GUEST session must NOT count: it
  // persists in localStorage and keeps refreshing, so a learner who once joined
  // by link was bounced off this form forever, and `RequireAuth` then sent them
  // to the stored (ended) guest class — every route landed on the podium.
  if (!loading && session && !isGuestAccessToken(session.access_token)) {
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setWalletError(null);
    const { error } = await signInWithPassword(email.trim(), password);
    setBusy(false);
    if (error) {
      setError(t('auth.error'));
      return;
    }
    navigate(from, { replace: true });
  }

  async function onWallet(wallet: InjectedWallet) {
    setBusy(true);
    setError(null);
    setWalletError(null);
    const { error, noWallet } = await signInWithSolana(wallet.provider);
    setBusy(false);
    if (error) {
      setWalletError(t(noWallet ? 'auth.solana.noWallet' : 'auth.solana.error'));
      return;
    }
    navigate(from, { replace: true });
  }

  const phantomHref = typeof window === 'undefined' ? '#' : phantomBrowseUrl(window.location.href, window.location.origin);
  const noWallet = wallets.length === 0;
  const signUp = (
    <WebOnly>
      <Link to={signupHref(from)} state={returnState(from)} className={`${noWallet && !mobile ? PRIMARY : OUTLINE} touch-hit`} data-testid="goto-signup">
        {t('door.other.createEmail')}
      </Link>
    </WebOnly>
  );

  return (
    <AuthShell title={t('door.title')} subtitle={t('door.subtitle')} testId="login-page">
      {!configured && (
        <p className="mb-4 rounded-md bg-destructive/10 p-2 text-center text-xs text-destructive">
          Supabase is not configured (VITE_SUPABASE_* missing).
        </p>
      )}

      {wallets.length > 0 ? (
        <div className="flex flex-col gap-2" data-testid="wallet-choices">
          {wallets.map((wallet, index) => (
            <Button
              key={wallet.id}
              type="button"
              className="h-auto min-h-12 w-full whitespace-normal py-2.5 text-center leading-snug"
              variant={index === 0 ? 'default' : 'outline'}
              disabled={busy}
              onClick={() => void onWallet(wallet)}
              data-testid={index === 0 ? 'web3-solana' : `web3-solana-${wallet.id}`}
            >
              {t('door.wallet.continue', { wallet: wallet.name })}
            </Button>
          ))}
          <p className="text-center text-xs text-muted-foreground" data-testid="web3-solana-why">
            {t('door.wallet.free')}
          </p>
          <p className="text-center text-[11px] text-muted-foreground">{t('door.wallet.devnet')}</p>
          <p className="mt-2 text-center text-xs text-muted-foreground">{t('door.email.lead')}</p>
          {signUp}
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background/60 p-4" data-testid="no-wallet">
          <p className="font-display text-base font-bold text-foreground">{t('door.noWallet.title')}</p>
          <p className="text-sm text-muted-foreground">{t(mobile ? 'door.noWallet.mobile' : 'door.noWallet.desktop')}</p>
          {mobile && (
            <a href={phantomHref} className={PRIMARY} data-testid="open-in-phantom">
              {t('door.noWallet.openPhantom')}
            </a>
          )}
          <p className="text-xs text-muted-foreground">{t('door.email.lead')}</p>
          {signUp}
          <a href={PHANTOM_INSTALL_URL} target="_blank" rel="noreferrer" className={mobile ? `text-center ${LINK}` : OUTLINE} data-testid="install-phantom">
            {t('door.noWallet.install')}
          </a>
          <p className="text-xs text-muted-foreground">{t('door.noWallet.others')}</p>
          <Link to={TRY_PATH} className="text-center text-sm font-medium text-foreground touch-hit underline-offset-2 hover:underline" data-testid="try-first-lesson">
            {t('door.noWallet.tryFirst')}
          </Link>
        </div>
      )}
      {walletError && (
        <p id="wallet-error" role="alert" className="mt-2 text-center text-sm text-destructive" data-testid="wallet-error">
          {walletError}
        </p>
      )}

      <details className="group mt-5" data-testid="other-ways" open={noWallet}>
        <summary className="cursor-pointer list-none text-center text-sm font-medium text-foreground touch-hit underline-offset-2 hover:underline" data-testid="other-ways-summary">
          {t('door.other.summary')}
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="login-form">
            <p className="text-xs font-medium text-foreground">{t('door.other.email')}</p>
            <Label htmlFor="email">{t('auth.email')}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              enterKeyHint="next"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'login-error' : undefined}
              data-testid="email-input"
            />
            <Label htmlFor="password">{t('auth.password')}</Label>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              enterKeyHint="go"
              required
              value={password}
              onValueChange={setPassword}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'login-error' : undefined}
              data-testid="password-input"
            />
            {error && (
              <p id="login-error" role="alert" className="text-sm text-destructive" data-testid="login-error">
                {error}
              </p>
            )}
            <Button type="submit" variant="outline" disabled={busy} className="min-h-11 w-full" data-testid="submit-login">
              {busy ? t('common.loading') : t('auth.signIn')}
            </Button>
            <WebOnly>
              <p className="text-center text-xs text-muted-foreground">
                {t('door.other.noAccount')}{' '}
                <Link to={signupHref(from)} state={returnState(from)} className="font-medium text-foreground touch-hit underline-offset-2 hover:underline" data-testid="goto-signup-link">
                  {t('door.other.createEmail')}
                </Link>
              </p>
            </WebOnly>
          </form>
          <details className="group" data-testid="dfl-ways">
            <summary className={`cursor-pointer list-none text-center ${LINK}`} data-testid="dfl-ways-summary">
              {t('door.other.dflSummary')}
            </summary>
            <div className="mt-3 flex flex-col gap-1.5">
              <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => loginWithDfl(from)} data-testid="oauth-dfl">
                {t('auth.signInWith', { provider: 'DFL' })}
              </Button>
              <p className={`text-center ${LINK} no-underline hover:no-underline`}>{t('door.other.dflWhy')}</p>
            </div>
          </details>
        </div>
      </details>
    </AuthShell>
  );
}
