/**
 * <EmbedBridge> — wires the federated-session embed bootstrap into the router.
 *
 * Renders nothing. When the app is in embed mode (`?embed=1`):
 *   - installs the postMessage bridge (emits DFL_READY, listens for DFL_SET_TOKEN
 *     from allowed origins, exchanges the DFL token for an Itera session);
 *   - once authed, routes the fellow to the pilot lesson so the activity renders
 *     instead of the standalone home/login.
 *
 * Must live INSIDE <BrowserRouter> (it uses useNavigate). When NOT in embed
 * mode it is an immediate no-op — standalone behavior is unchanged.
 */
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  installEmbedBridge,
  isEmbedMode,
  PILOT_LESSON_ID,
  postNavigate,
} from './embedBridge';

export function EmbedBridge() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isEmbedMode()) return;

    const teardown = installEmbedBridge(() => {
      // Authed via the DFL token exchange. If we're at the root (no specific
      // lesson requested), route to the pilot lesson so the activity renders.
      const pathname = window.location.pathname;
      if (pathname === '/' || pathname === '' || pathname === '/login') {
        const target = `/lesson/${PILOT_LESSON_ID}`;
        navigate(target, { replace: true });
        postNavigate(target); // best-effort host hint
      }
    });

    return teardown;
    // Intentionally run once on mount: the bridge manages its own lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the host informed of in-app navigation while embedded (nice-to-have).
  useEffect(() => {
    if (!isEmbedMode()) return;
    postNavigate(location.pathname);
  }, [location.pathname]);

  return null;
}
