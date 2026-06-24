/**
 * "Sign in with DFL" — standalone (non-iframe) federation entrypoint. forma 1:
 * DFL Supabase is the IdP; Itera trusts DFL's signed token (ADR-103/ADR-4).
 *
 * The browser is sent to a DFL-side handoff page (on a *.devfellowship.com
 * origin, where the fellow logs into DFL). That page, after a DFL login,
 * redirects back to our callback with the DFL access_token in the URL fragment:
 *
 *   <DFL_HANDOFF_URL>?return=<app.iterahq.dev/auth/dfl/callback>&next=<path>
 *      → (DFL login) → https://app.iterahq.dev/auth/dfl/callback#dfl_token=<JWT>&next=<path>
 *
 * Our DflCallbackPage then exchanges the token for an Itera session via
 * itera-api POST /v1/embed/session (the same verified path the iframe uses).
 *
 * The handoff URL is configurable; default targets the DFL learn app. Until the
 * DFL-side handoff page ships, this redirect lands on DFL but cannot complete —
 * see the federation plan's open DFL-side gate.
 */
const DFL_HANDOFF_URL =
  (import.meta.env.VITE_DFL_HANDOFF_URL as string | undefined) ||
  'https://learn.devfellowship.com/auth/federate';

/** Returns the callback URL on THIS origin that the DFL handoff redirects to. */
export function dflCallbackUrl(): string {
  if (typeof window === 'undefined') return '/auth/dfl/callback';
  return `${window.location.origin}/auth/dfl/callback`;
}

/** Redirect the browser to the DFL handoff to start "Sign in with DFL". */
export function loginWithDfl(next = '/'): void {
  if (typeof window === 'undefined') return;
  const url = new URL(DFL_HANDOFF_URL);
  url.searchParams.set('return', dflCallbackUrl());
  url.searchParams.set('next', next);
  window.location.assign(url.toString());
}
