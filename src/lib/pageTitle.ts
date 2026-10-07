/**
 * What the browser tab, the history entry and a screen reader call the page.
 * A route with a fixed name is in `STATIC_TITLES`; a page whose name is data (a
 * program, a lesson) names itself through `usePageTitle`. Anything else keeps
 * the title the document was served with.
 */
const STATIC_TITLES: readonly (readonly [RegExp, string])[] = [
  [/^\/login\/?$/, 'auth.login'],
  // not-commerce: the tab title of /signup, a route the shell never renders (WebOnlyRoute) and a WebView has no title bar
  [/^\/signup\/?$/, 'auth.signUp'],
  [/^\/auth\/forgot\/?$/, 'auth.forgot.title'],
  [/^\/auth\/reset\/?$/, 'auth.reset.title'],
  [/^\/auth\/code\/?$/, 'auth.otp.title'],
  [/^\/$/, 'nav.discover'],
  [/^\/catalog\/?$/, 'catalog.title'],
  [/^\/artifacts\/?$/, 'artifacts.title'],
  [/^\/profile\/?$/, 'profile.title'],
  // not-commerce: the tab title of /subscribe, web-only in the same way
  [/^\/subscribe\/?$/, 'subscribe.title'],
];

/** The dictionary key that names a route, or null when the route has no fixed name. */
export function pageTitleKey(pathname: string): string | null {
  return STATIC_TITLES.find(([pattern]) => pattern.test(pathname))?.[1] ?? null;
}

/** `<page> | Itera`, or the document's own title when the page has no name. */
export function formatPageTitle(name: string | null | undefined, fallback: string): string {
  const trimmed = name?.trim();
  return trimmed ? `${trimmed} | Itera` : fallback;
}

let named: string | null = null;
const listeners = new Set<() => void>();

/** The name a mounted page gave itself, or null. One at a time: the last page to speak wins. */
export const pageName = {
  get: (): string | null => named,
  set(next: string | null): void {
    if (next === named) return;
    named = next;
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
