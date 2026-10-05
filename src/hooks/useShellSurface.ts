import { useSyncExternalStore } from 'react';
import { readShellSurface, subscribeShellSurface, type ShellSurface } from '@/lib/shellSurface';

/** The one "am I inside the native shell" read for components: `pending`, `web` or `shell`. */
export function useShellSurface(): ShellSurface {
  return useSyncExternalStore(subscribeShellSurface, readShellSurface, readShellSurface);
}
