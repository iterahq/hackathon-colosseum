/**
 * On a phone browser no wallet is injected into the page: Phantom only injects
 * `window.solana` inside its own in-app browser. Its universal link reopens the
 * current page there, where the wallet sign-in works.
 */
export function isTouchBrowser(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

export function phantomBrowseUrl(href: string, origin: string): string {
  return `https://phantom.app/ul/browse/${encodeURIComponent(href)}?ref=${encodeURIComponent(origin)}`;
}
