/**
 * The last incoming link, raw, in memory only (R-5). It exists because Expo Router decodes the query and the fragment
 * of a link into params; the WebView must start on them as the link carried them. Never logged, never persisted.
 * It is held from the moment the link arrives until the next link replaces it, except for the DFL callback (it carries a
 * bearer token in its fragment): the route calls `forgetLink` as soon as it has taken that link as its entry (`isCallbackEntry`).
 * It only ever receives what `intakeLink` let through: a link with a `refresh_token` arrives here already stripped of its
 * query and fragment (ADR-10), so no refresh token is held.
 * Pure TypeScript: no React Native import.
 */
let last: string | null = null;

export function rememberLink(url: string): void {
  last = typeof url === 'string' ? url : null;
}

export function lastLink(): string | null {
  return last;
}

export function forgetLink(): void {
  last = null;
}
