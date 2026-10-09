import type { ReactNode } from 'react';
import { useShellSurface } from '@/hooks/useShellSurface';
import { ShellLiveUnavailableScreen } from './ShellLiveUnavailableScreen';
import { ShellSettling } from './ShellSettling';

/**
 * A live-class route. In a browser tab it renders its page; inside the native shell, where live class
 * is not supported, it renders the notice instead and never mounts the page.
 */
export function ShellLiveUnavailableRoute({ children }: { children: ReactNode }) {
  const surface = useShellSurface();
  if (surface === 'web') return <>{children}</>;
  if (surface === 'pending') return <ShellSettling />;
  return <ShellLiveUnavailableScreen />;
}
