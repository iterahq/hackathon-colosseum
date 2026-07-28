/**
 * The guest surface's route contract (plan 20260728-itera-guest-link-aula-sincrona,
 * ADR-3).
 *
 * `/g/:code` is mounted OUTSIDE `RequireAuth`. That is the whole point: the gate
 * is STRUCTURAL, not conditional. There is no branch anywhere in the guest tree
 * that can drop a link-invited visitor into the authenticated app — the guest
 * route never renders `RequireAuth`/`RequireSubscription`, and every exit inside
 * it lands on the guest end-card, never on `/`.
 *
 * Kept in its own module (no React) so both the router and the app-wide-mount
 * guard can ask "is this the guest surface?" without importing each other.
 */

export const GUEST_ROUTE_PREFIX = '/g';

/** The router pattern mounted in App.tsx. */
export const GUEST_ROUTE_PATH = '/g/:code';

/**
 * True for any path served by the guest surface. Used by `AppWideMounts` to keep
 * `LocaleSync` (writes itera.users.locale) and `LiveClassSignal` (reads
 * memberships) from ever mounting for a membership-less guest.
 */
export function isGuestRoutePath(pathname: string | undefined | null): boolean {
  if (!pathname) return false;
  return pathname === GUEST_ROUTE_PREFIX || pathname.startsWith(`${GUEST_ROUTE_PREFIX}/`);
}

/** The shareable guest link for a session code (ADR-12 instructor affordance). */
export function guestLinkFor(origin: string, code: string): string {
  return `${origin.replace(/\/$/, '')}${GUEST_ROUTE_PREFIX}/${code}`;
}
