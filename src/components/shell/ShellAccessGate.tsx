import type { ReactNode } from 'react';
import { RequireSubscription } from '@/auth/RequireSubscription';
import { useShellSurface } from '@/hooks/useShellSurface';

/**
 * For a signed-in route that a browser leaves open to an account without access (`/profile`).
 * In a browser tab it adds nothing. Inside the shell the hard gate of Q-11 applies there too, so
 * the route goes through the same decision as every learner route.
 */
export function ShellAccessGate({ children }: { children: ReactNode }) {
  if (useShellSurface() === 'web') return <>{children}</>;
  return <RequireSubscription>{children}</RequireSubscription>;
}
