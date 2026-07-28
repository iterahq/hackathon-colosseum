/**
 * Route guard — redirects unauthenticated users to /login.
 * When Supabase is not configured (e.g. local mock mode), it lets through so
 * the mock lesson path still renders.
 */
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { findStoredGuestCode, isGuestAccessToken } from '@/services/guestSession.service';
import { GUEST_ROUTE_PREFIX } from '@/guest/guestRoute';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, configured } = useAuth();
  const location = useLocation();

  if (!configured) return <>{children}</>;
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!session) {
    const tenant = new URLSearchParams(location.search).get('tenant');
    const to = tenant ? `/login?tenant=${encodeURIComponent(tenant)}` : '/login';
    return <Navigate to={to} replace state={{ from: location }} />;
  }

  /* A link-invited guest holds a REAL session, so every authenticated route
     happily lets them in and then RequireSubscription bounces them to
     /subscribe — app chrome plus a price tag, shown to the prospect the guest
     link exists to impress. No data leaks there (zero memberships means RLS
     returns nothing), but it is the wrong surface at the worst moment.
     Send them back to their own class instead.
     Only a redirect: authorization is still RLS's job, not this claim's. */
  if (isGuestAccessToken(session.access_token)) {
    const code = findStoredGuestCode();
    if (code) return <Navigate to={`${GUEST_ROUTE_PREFIX}/${code}`} replace />;
  }

  return <>{children}</>;
}
