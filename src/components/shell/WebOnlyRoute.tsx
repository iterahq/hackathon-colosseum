import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useShellSurface } from '@/hooks/useShellSurface';
import { ShellSettling } from './ShellSettling';

/**
 * A route that exists in a browser tab only: checkout, its return page and sign-up (Q-3, Q-11).
 * Inside the shell it leaves for "/", whose guards decide the rest: the login when signed out, the
 * neutral screen for an account without access, home otherwise.
 */
export function WebOnlyRoute({ children }: { children: ReactNode }) {
  const surface = useShellSurface();
  if (surface === 'web') return <>{children}</>;
  if (surface === 'pending') return <ShellSettling />;
  return <Navigate to="/" replace />;
}
