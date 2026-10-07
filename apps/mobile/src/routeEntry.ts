/**
 * Which entry a mounted instance of the catch-all route shows, and whether it shows one at all (R-20, Android).
 *
 * `usePathname()` is GLOBAL: it reads the one `routeInfo` of the router's store (`expo-router/build/hooks/usePathname.js` ->
 * `global-state/useRouteInfo.js`, `useSyncExternalStore`; `global-state/store.js` `onStateChange` notifies every subscriber), so EVERY mounted
 * instance of this route re-renders with the FOCUSED route's pathname. An instance that is not focused (beneath a pushed one) must therefore
 * keep the entry it has: rebuilding it from the global pathname would re-create its WebView on the other route's page (and, for the DFL return, on the
 * callback without its fragment). `focused` is the route's own focus (`useIsFocused()`, from the navigator state: `NavigationProvider.js`,
 * `focusedRouteKey === route.key`, so it is already true on the first render of a pushed route). A focused instance recomputes (a reused
 * `[...path]` for a new link, a pushed one catching up with the store); an instance beneath that is focused again after a pop finds its own
 * pathname back, builds the same view and keeps its entry.
 *
 * Expo Router reuses a route for a link only when the route NAME matches (`StackRouter.js:191`). A normal launch sits on `index`, so the App Link
 * that ends a DFL sign-in started there PUSHES a new `[...path]` instance (`previous` null, a fresh instance); the instance beneath holds the sign-in
 * page. A sign-in started on a `[...path]` instance is reused by the link.
 *
 * `nextEntry` asks the latch through `arrival` only when the raw entry changed, so each link is counted once. When the latch says `duplicate`:
 * - on a reused instance the effective entry stays what it was;
 * - on a fresh instance the session already loaded the callback elsewhere (the instance beneath), and a second WebShell would load the one-shot
 *   callback again. The instance is `leaving`: no WebShell, it pops itself (nothing beneath, `canPop` false: the entry is shown, nobody else holds it).
 *   DEFENSIVE PATH: the order Android is expected to produce is router first (the pushed instance loads, the session's copy is the duplicate and is
 *   dropped), which never reaches this branch; `leaving` covers the reverse order (session first). It has not been run on a device.
 * `leaving` is decided once, when the entry is built, and kept.
 *
 * Pure TypeScript: no React Native import.
 */
export interface RouteEntry {
  /** The entry as built from the link or the params. */
  raw: string;
  /** The entry the WebShell is keyed by and opens. */
  effective: string;
  /** The pathname and params the entry was built for (a render with the same view and no raw link keeps it). */
  view: string;
  /** A fresh instance whose link was already loaded elsewhere: no WebShell, pop. */
  leaving: boolean;
}

/** `null`: the entry is not the DFL callback, so the latch was not asked. */
export type RouterArrival = 'load' | 'duplicate' | null;

export interface EntryInput {
  /** The entry this instance built before, or null on its first render (a fresh instance). */
  previous: RouteEntry | null;
  rawEntry: string;
  view: string;
  /** Asks the latch; called only when `rawEntry` differs from the previous one. */
  arrival: () => RouterArrival;
  /** The navigator has a route beneath this one (`router.canGoBack()`), read during render. */
  canPop: boolean;
  /** This route is the focused one (`useIsFocused()`). An unfocused instance with an entry keeps it, whatever the global pathname says. */
  focused: boolean;
}

export function nextEntry({ previous, rawEntry, view, arrival, canPop, focused }: EntryInput): RouteEntry {
  if (previous !== null && !focused) return previous;
  if (previous !== null && previous.raw === rawEntry) return { ...previous, view };
  const duplicate = arrival() === 'duplicate';
  if (!duplicate) return { raw: rawEntry, effective: rawEntry, view, leaving: false };
  if (previous !== null) return { raw: rawEntry, effective: previous.effective, view, leaving: false };
  return { raw: rawEntry, effective: rawEntry, view, leaving: canPop };
}
