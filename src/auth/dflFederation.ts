import { createDflState, wrapNext } from '@/auth/dflState';

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
 * State binding (login CSRF): starting a sign-in stores a one-shot nonce in this
 * browser (dflState.ts) and sends it inside `next` as `/~<nonce><path>`; the DFL
 * page returns `next` unchanged. The callback exchanges a token only when that
 * nonce matches, so a link carrying someone else's token signs nobody in. The
 * `return` URL stays exactly the callback: the mobile shell matches it verbatim.
 *
 * The handoff URL is configurable; default targets the DFL learn app.
 *
 * STATUS: the DFL-side gate is CLOSED — the handoff page shipped on 2026-06-24
 * (`devfellowship/dfl-learn` PR #254, `src/pages/AuthFederate.tsx`, routed at
 * `/auth/federate` in `src/components/routing/AppRoutes.tsx`) and the flow works
 * end-to-end. An earlier version of this docblock said the page had not shipped
 * and that the redirect "lands on DFL but cannot complete"; that was already
 * false by the time it was read, and it misled at least one plan into treating
 * federation as blocked. Do not reintroduce that claim without re-checking the
 * route on the DFL side.
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
  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    // Blocked storage: the nonce is sent but never stored, so the callback refuses.
    storage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } as unknown as Storage;
  }
  const nonce = createDflState(storage, Date.now());
  url.searchParams.set('next', wrapNext(nonce, next));
  window.location.assign(url.toString());
}
