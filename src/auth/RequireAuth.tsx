/**
 * Route guard — redirects unauthenticated users to /login.
 * When Supabase is not configured (e.g. local mock mode), it lets through so
 * the mock lesson path still renders.
 */
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';

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
  return <>{children}</>;
}
