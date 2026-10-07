/**
 * Where the WebView starts for an incoming link (R-5, PLAN ADR-10). The page needs the query and the fragment of
 * the link (`/auth/dfl/callback#dfl_token=…&next=…`) byte for byte.
 *
 * Expo Router DECODES the query params and the fragment (`#`) it hands the route, so they cannot be rebuilt
 * losslessly from the params (`%252F` would come out as `%2F`, `%2F` as `/`). The raw link is therefore taken from
 * `+native-intent.ts` (`src/rawLink.ts`), which sees it before the router parses it, on a cold and a warm start, and
 * `entryFromLink` uses its raw query and fragment when its path is the route being shown. When there is no such link
 * (Expo Go's `exp://` link, a path that does not match) `entryPathFor` rebuilds from the params: the same meaning, not
 * the same bytes (keys and values are re-encoded, the fragment is the router's decoded one).
 *
 * ADR-10: no refresh token reaches native code. A query or fragment that carries a `refresh_token` parameter is
 * dropped whole (the page opens on the path alone): the implicit-flow returns of Supabase (`#access_token=…&refresh_token=…`)
 * must not pass through the shell.
 *
 * A link carries a credential. Nothing here logs, stores or caches a URL: the functions are pure.
 *
 * Pure TypeScript: no React Native import.
 */
import { originOf } from './origin';
import { matchRoute, normalisePath, resolveShellPath } from './routes';

export type LinkParams = Record<string, string | string[] | undefined>;

/** The params Expo Router adds to the catch-all that are not part of the incoming query. */
const ROUTER_KEYS: ReadonlySet<string> = new Set(['path', '#']);

/** True when a query string or a fragment (with or without its `?`/`#`) has a `refresh_token` parameter. */
export function carriesRefreshToken(part: string): boolean {
  return part
    .replace(/^[?#]/, '')
    .split('&')
    .some((pair) => {
      const name = pair.split('=')[0] ?? '';
      let decoded = name;
      try {
        decoded = decodeURIComponent(name.replace(/\+/g, ' '));
      } catch {
        // an undecodable name is compared as written
      }
      return decoded.toLowerCase() === 'refresh_token' || name.toLowerCase() === 'refresh_token';
    });
}

/**
 * The path, query and fragment the WebView opens, relative to the app origin.
 * - A path that is not a route of the shell opens the home route, and its query and fragment are dropped.
 * - The path comes from `segments` only (the route passes the pathname): a query key named `path` is dropped, so a link cannot
 *   pick another route. A query key named `#` shares the router's fragment slot and is read as the fragment (same page).
 * - The query is rebuilt from the params (a repeated key stays repeated); the fragment is appended as the
 *   router received it, undecoded.
 */
export function entryPathFor(segments: readonly string[], params: LinkParams): string {
  const joined = segments.join('/');
  const shellPath = resolveShellPath(joined);
  if (matchRoute(normalisePath(joined)) === null) return shellPath;
  const pairs: string[] = [];
  if (Object.keys(params).some((k) => /^refresh_token$/i.test(k))) return shellPath;
  const hashParam = params['#'];
  if (typeof hashParam === 'string' && carriesRefreshToken(hashParam)) return shellPath;
  for (const [key, value] of Object.entries(params)) {
    if (ROUTER_KEYS.has(key) || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  const hash = params['#'];
  const fragment = typeof hash === 'string' && hash !== '' ? `#${hash}` : '';
  return `${shellPath}${pairs.length > 0 ? `?${pairs.join('&')}` : ''}${fragment}`;
}

/** A URL for display (the dev overlay): origin and path only; a query or a fragment is shown as a marker, never its value. */
export function displayUrl(url: string): string {
  const cut = url.search(/[?#]/);
  if (cut === -1) return url;
  return `${url.slice(0, cut)}${url[cut] === '?' ? '?…' : '#…'}`;
}

/** A URL for the system browser ("Open in browser"): an `/auth/` page keeps neither query nor fragment, so a credential never reaches the browser history. */
export function browserUrl(url: string): string {
  const cut = url.search(/[?#]/);
  if (cut === -1) return url;
  const base = url.slice(0, cut);
  return /^[a-z][a-z0-9+.-]*:\/\/[^/]*\/auth(\/|$)/i.test(base) ? base : url;
}

/**
 * The entry path from the RAW link, when it is the link of the route being shown: https, exactly the app origin, and a
 * path equal to `segments`. Its query and fragment are used byte for byte, except that one carrying a `refresh_token` is
 * dropped whole. Anything else (no link, another origin, another path, Expo Go's `exp://`) falls back to `entryPathFor`.
 */
export function entryFromLink(link: string | null, origin: string, segments: readonly string[], params: LinkParams): string {
  const fallback = entryPathFor(segments, params);
  if (link === null || link !== link.trim() || !/^https:\/\//i.test(link)) return fallback;
  const appOrigin = originOf(origin);
  if (appOrigin === null || originOf(link) !== appOrigin) return fallback;
  const rest = link.slice(link.indexOf('//') + 2).replace(/^[^/?#]*/, '');
  const m = /^([^?#]*)(\?[^#]*)?(#.*)?$/s.exec(rest);
  if (m === null) return fallback;
  const decodeSegments = (path: string): string[] | null => {
    try {
      return path.split('/').filter(Boolean).map(decodeURIComponent);
    } catch {
      return null;
    }
  };
  const linkSegments = decodeSegments(m[1] ?? '');
  const shown = segments.map((x) => x);
  if (linkSegments === null || linkSegments.join('/') !== shown.join('/')) return fallback;
  const joined = shown.join('/');
  if (matchRoute(normalisePath(joined)) === null) return fallback;
  const search = m[2] ?? '';
  const hash = m[3] ?? '';
  const path = resolveShellPath(joined);
  return `${path}${search === '?' || carriesRefreshToken(search) ? '' : search}${hash === '#' || carriesRefreshToken(hash) ? '' : hash}`;
}

const REFRESH_ANYWHERE = /refresh(?:_|%5f|%255f)token/i;

/**
 * The intake of every incoming link (`app/+native-intent.ts`), the one place that sees it before the router parses it
 * into params and before `rawLink` remembers it. ADR-10: no refresh token in native memory. A link whose query or
 * fragment carries a `refresh_token` parameter (any casing, percent-encoded name, or the text anywhere in them) comes out
 * WITHOUT its query and fragment, and that stripped form is what the router gets and what is remembered. Anything else
 * passes unchanged. Never throws: on input it cannot read, nothing is remembered and the path is unchanged only when it has
 * no `refresh_token` text in any casing, else `/`.
 */
export function intakeLink(raw: unknown): { path: string; remember: string | null } {
  try {
    if (typeof raw !== 'string') return { path: '/', remember: null };
    const hashAt = raw.indexOf('#');
    const beforeHash = hashAt === -1 ? raw : raw.slice(0, hashAt);
    const hash = hashAt === -1 ? '' : raw.slice(hashAt);
    const queryAt = beforeHash.indexOf('?');
    const base = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
    const search = queryAt === -1 ? '' : beforeHash.slice(queryAt);
    if (REFRESH_ANYWHERE.test(base)) return { path: '/', remember: null };
    if (carriesRefreshToken(search) || carriesRefreshToken(hash) || REFRESH_ANYWHERE.test(search) || REFRESH_ANYWHERE.test(hash)) {
      return { path: base === '' ? '/' : base, remember: base === '' ? '/' : base };
    }
    return { path: raw, remember: raw };
  } catch {
    return { path: typeof raw === 'string' && !REFRESH_ANYWHERE.test(raw) ? raw : '/', remember: null };
  }
}
