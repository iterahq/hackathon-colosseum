import type { ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { RouteSettling } from '@/components/RouteSettling';
import { LazyLandingPage } from '@/pages/landingLazy';
import { isGuestAccessToken } from '@/services/guestSession.service';

/** "/" is the public landing for a visitor without a session, and the learner home (passed in) for everyone else. */
export function RootRoute({ children }: { children: ReactNode }) {
  const { session, loading, configured } = useAuth();
  if (!configured) return <>{children}</>;
  if (loading) return <RouteSettling />;
  if (!session || isGuestAccessToken(session.access_token)) return <LazyLandingPage />;
  return <>{children}</>;
}
