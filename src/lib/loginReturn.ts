import { safeInternalPath } from '@/lib/safeInternalPath';

interface LocationLike {
  state: unknown;
  search: string;
}

/**
 * Where a sign-in should land. Router state wins (the in-app redirect of
 * `RequireAuth`); `?next=` is the fallback that survives a full page load, such
 * as Phantom reopening the login page inside its own browser. Either one is
 * client-controlled, so only a same-origin in-app path passes.
 */
export function returnPathOf(location: LocationLike): string {
  const fromState = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
  return safeInternalPath(fromState ?? new URLSearchParams(location.search).get('next'));
}

/** The login link that brings the visitor back to `path` once signed in. */
export function loginHref(path: string): string {
  const next = safeInternalPath(path);
  return next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`;
}

/** The sign-up link that brings the visitor back to `path` once the account exists. */
export function signupHref(path: string): string {
  const next = safeInternalPath(path);
  return next === '/' ? '/signup' : `/signup?next=${encodeURIComponent(next)}`;
}

/** What a link to another sign-in page passes on, so the destination is not lost on the way. */
export function returnState(path: string): { from: { pathname: string } } {
  return { from: { pathname: path } };
}
