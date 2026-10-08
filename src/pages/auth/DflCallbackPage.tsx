/**
 * Standalone "Sign in with DFL" callback (forma 1: DFL Supabase = IdP).
 *
 * A DFL-side handoff page (on a *.devfellowship.com origin, where the fellow has
 * a DFL session) redirects the browser back here with the DFL access_token in the
 * URL fragment:  https://app.iterahq.dev/auth/dfl/callback#dfl_token=<JWT>[&next=/path]
 *
 * We pull the token from the fragment (fragments are never sent to the server /
 * never logged), exchange it for an Itera session via itera-api
 * `POST /v1/embed/session` (reusing exchangeDflToken — the SAME verified path the
 * iframe-embed uses), and route the fellow into the app. On failure we bounce to
 * /login with an error flag.
 *
 * The token is exchanged ONLY when `next` carries the one-shot nonce that
 * loginWithDfl stored in this browser (dflState.ts). Otherwise the link was not
 * started here (login CSRF: someone else's token in a crafted link) and the
 * token is dropped without a call: a visitor who is already signed in (a guest
 * session does not count) goes home, anyone else sees a neutral refusal with a
 * one-tap fresh sign-in that keeps the destination.
 *
 * Why a fragment (not a query param): the token must not land in server logs,
 * referrers, or the Dokploy/Traefik access log. The fragment stays client-side.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { exchangeDflToken } from '@/auth/embedBridge';
import { useAuth } from '@/auth/AuthContext';
import { loginWithDfl } from '@/auth/dflFederation';
import { consumeDflState, unwrapNext } from '@/auth/dflState';
import { isGuestAccessToken } from '@/services/guestSession.service';
import { safeInternalPath } from '@/lib/safeInternalPath';
import { useI18n } from '@/i18n';
import { Logo } from '@/components/branded';

function readFragment(): { token: string | null; next: string } {
  if (typeof window === 'undefined') return { token: null, next: '/' };
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const next = params.get('next') || '/';
  // accept either dfl_token or access_token from the handoff page
  return { token: params.get('dfl_token') || params.get('access_token'), next };
}

export default function DflCallbackPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { session, loading } = useAuth();
  const [failed, setFailed] = useState(false);
  const [unsolicited, setUnsolicited] = useState(false);
  const [restartNext, setRestartNext] = useState('/');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const { token, next } = readFragment();
    // Scrub the token from the address bar immediately.
    try {
      window.history.replaceState(null, '', window.location.pathname);
    } catch {
      /* ignore */
    }
    if (!token) {
      setFailed(true);
      return;
    }
    const wrapped = unwrapNext(next);
    let started = false;
    try {
      started = consumeDflState(window.localStorage, Date.now(), wrapped?.nonce);
    } catch {
      started = false;
    }
    if (!wrapped || !started) {
      setRestartNext(wrapped?.next ?? '/');
      setUnsolicited(true);
      return;
    }
    void exchangeDflToken(token).then((ok) => {
      if (ok) navigate(safeInternalPath(wrapped.next), { replace: true });
      else setFailed(true);
    });
  }, [navigate]);

  // A guest token is not a learner session: a guest holder sees the refusal.
  const signedIn = !loading && !!session && !isGuestAccessToken(session.access_token);
  useEffect(() => {
    if (unsolicited && signedIn) navigate('/', { replace: true });
  }, [unsolicited, signedIn, navigate]);

  const refused = unsolicited && !loading && !signedIn;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4" data-testid="dfl-callback">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo size={40} />
        {refused ? (
          <div className="flex flex-col items-center gap-4" data-testid="dfl-callback-unsolicited">
            <p className="text-sm text-muted-foreground">{t('auth.dfl.unsolicited')}</p>
            <button
              type="button"
              className="touch-hit coarse:min-w-11 rounded-md bg-primary px-4 text-sm text-primary-foreground"
              onClick={() => loginWithDfl(restartNext)}
            >
              {t('auth.dfl.restart')}
            </button>
            <button
              type="button"
              className="touch-hit coarse:min-w-11 text-xs text-muted-foreground underline"
              onClick={() => navigate('/login', { replace: true })}
            >
              {t('auth.signIn')}
            </button>
          </div>
        ) : failed ? (
          <>
            <p className="text-sm text-destructive" data-testid="dfl-callback-error">
              {t('auth.error')}
            </p>
            <button
              type="button"
              className="touch-hit coarse:min-w-11 text-xs text-muted-foreground underline"
              onClick={() => navigate('/login', { replace: true })}
            >
              {t('auth.signIn')}
            </button>
          </>
        ) : (
          <div className="mx-auto h-5 w-40 rounded ds-shimmer" data-testid="dfl-callback-loading" aria-busy="true" />
        )}
      </div>
    </div>
  );
}
