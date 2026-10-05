import type { ReactNode } from 'react';
import { useShellSurface } from '@/hooks/useShellSurface';

/**
 * Subscription, price, checkout and sign-up surfaces render in a browser tab only (Q-3, Q-11):
 * nothing inside the shell, and nothing while the handshake is still pending, so the copy cannot
 * flash before the shell answers.
 */
export function WebOnly({ children }: { children: ReactNode }) {
  return useShellSurface() === 'web' ? <>{children}</> : null;
}
