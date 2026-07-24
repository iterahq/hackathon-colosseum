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
 * Why a fragment (not a query param): the token must not land in server logs,
 * referrers, or the Dokploy/Traefik access log. The fragment stays client-side.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { exchangeDflToken } from '@/auth/embedBridge';
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
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const { token, next } = readFragment();
    if (!token) {
      setFailed(true);
      return;
    }
    // Scrub the token from the address bar immediately.
    try {
      window.history.replaceState(null, '', window.location.pathname);
    } catch {
      /* ignore */
    }
    void exchangeDflToken(token).then((ok) => {
      if (ok) navigate(safeInternalPath(next), { replace: true });
      else setFailed(true);
    });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4" data-testid="dfl-callback">
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo size={40} />
        {failed ? (
          <>
            <p className="text-sm text-destructive" data-testid="dfl-callback-error">
              {t('auth.error')}
            </p>
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => navigate('/login', { replace: true })}
            >
              {t('auth.signIn')}
            </button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="dfl-callback-loading">
            {t('common.loading')}
          </p>
        )}
      </div>
    </div>
  );
}
