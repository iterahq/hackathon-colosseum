/**
 * The last incoming link, raw, in memory only (R-5). It exists because Expo Router decodes the query and the fragment
 * of a link into params; the WebView must start on them as the link carried them. Never logged, never persisted.
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
