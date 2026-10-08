/**
 * What a native host keeps for a universal screen: one read of the backend and where it stands, as a store
 * a route file reads with `useSyncExternalStore`. It reads when the first listener arrives (the screen
 * mounted) and when the learner changes; it holds no timer and never reads while nothing listens.
 * A sign-out drops the data at once, and so does the last listener leaving (no session is followed while
 * nothing listens): the next learner never sees it.
 *
 * Pure TypeScript: no React, no React Native.
 */
import type { BackendAnswer } from './backendProbe';

export type Loaded<T> =
  | { readonly kind: 'loading' }
  /** No session to read with: the web owns sign-in, so the route sends the learner to it. */
  | { readonly kind: 'signed-out' }
  /** `unreachable`: no answer from the backend (offline, a timeout). Otherwise it answered with an error. */
  | { readonly kind: 'error'; readonly unreachable: boolean }
  | { readonly kind: 'ready'; readonly value: T };

/** The first answer that is not `ok`, as what the screen shows; null when every read answered. */
export function failureOf(answers: readonly BackendAnswer[]): Loaded<never> | null {
  if (answers.some((a) => a.kind === 'no-session' || a.kind === 'not-configured')) return { kind: 'signed-out' };
  const failed = answers.find((a) => a.kind === 'failed');
  return failed === undefined ? null : { kind: 'error', unreachable: failed.status === null };
}

export interface ScreenStore<T> {
  subscribe(listener: () => void): () => void;
  /** The same object until something changes. */
  snapshot(): Loaded<T>;
  /** Read again, behind the loading state when `quiet` is not set. Nothing while no listener is there. */
  reload(quiet?: boolean): void;
}

export function createScreenStore<T>(load: () => Promise<Loaded<T>>, onSession: (listener: (signedIn: boolean) => void) => () => void): ScreenStore<T> {
  const listeners = new Set<() => void>();
  let state: Loaded<T> = { kind: 'loading' };
  let run = 0;
  let offSession: (() => void) | null = null;
  const set = (next: Loaded<T>) => {
    state = next;
    for (const listener of [...listeners]) listener();
  };
  const reload = (quiet = false) => {
    if (listeners.size === 0) return;
    const mine = (run += 1);
    if (!quiet || state.kind !== 'ready') set({ kind: 'loading' });
    void load()
      .catch((): Loaded<T> => ({ kind: 'error', unreachable: false }))
      .then((next) => {
        if (run === mine && listeners.size > 0) set(next);
      });
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        offSession = onSession((signedIn) => {
          run += 1;
          if (signedIn) reload();
          else set({ kind: 'signed-out' });
        });
        reload();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        offSession?.();
        offSession = null;
        run += 1;
        state = { kind: 'loading' };
      };
    },
    snapshot: () => state,
    reload,
  };
}
