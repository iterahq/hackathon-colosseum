/**
 * Provenance: devfellowship/dfl-lesson-studio, apps/ios/src/origin.ts (plus `originOf` from
 * packages/bridge/src/protocol.ts), commit e90a642c4f7a7f4b9651895270a3f489cffc84a7.
 * Changed:
 *  - `DEFAULT_WEB_ORIGIN` is `https://app.iterahq.dev` (PLAN ADR-4).
 *  - `navigationDecision` gains a fifth parameter, `blockedOrigins` (exact origins, a trailing dot
 *    and the case of the host ignored). It is checked first in the http(s) branch and answers
 *    `block`: such a URL is never loaded and never handed to the system browser. This is a
 *    behaviour change against the LS file (PLAN ADR-5); its tests in origin.test.ts are new.
 *  - The custom-scheme bundle origin (`resolveShellOrigin`, `WebBundleStatus`, `isBundleScheme`,
 *    `bundleOrigin`) is removed: this shell has no native bundle handler (Expo Go, ADR-11).
 *  - `originOf` is copied here instead of imported, because the bridge package is not part of
 *    this shell yet (ADR-9). It is byte-for-byte the LS function.
 *
 * The origin of the web content in the shell stays ONE config value: `expo.extra.webOrigin`.
 *
 * Pure TypeScript: no React Native import.
 */

export const DEFAULT_WEB_ORIGIN = 'https://app.iterahq.dev';

/**
 * The origin of a URL, as `scheme://host[:port]`, lower case, default port removed. `null` for an
 * opaque origin (file:, about:, data:, blob:, a URL with user info, or a string that is not an
 * absolute hierarchical URL). No `URL` object: Hermes gives some schemes the opaque origin "null".
 */
export function originOf(url: string): string | null {
  if (typeof url !== 'string') return null;
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)/.exec(url.trim());
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  if (scheme === 'file' || scheme === 'blob' || scheme === 'data' || scheme === 'about' || scheme === 'javascript') return null;
  const authority = m[2].toLowerCase();
  if (!authority || authority.includes('@') || authority.includes('\\')) return null;
  const host = (scheme === 'https' && authority.endsWith(':443')) || (scheme === 'http' && authority.endsWith(':80'))
    ? authority.slice(0, authority.lastIndexOf(':'))
    : authority;
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/.test(host) && !/^\[[0-9a-f:.]+\](:\d{1,5})?$/.test(host)) return null;
  return `${scheme}://${host}`;
}

/**
 * Read an https origin from a config value. Refuses a value that is not an
 * https origin. With no value, the prod origin.
 */
export function parseWebOrigin(value: unknown): string {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_WEB_ORIGIN;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`expo.extra.webOrigin is not a URL: ${raw}`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`expo.extra.webOrigin must be https: ${raw}`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`expo.extra.webOrigin must be an origin with no path: ${raw}`);
  }
  return url.origin;
}

/**
 * Top-frame origins that are refused outright (PLAN ADR-5, Q-3): Stripe. Never loaded in the
 * WebView and never opened in the system browser, Expo Go included.
 */
export const BLOCKED_ORIGINS: readonly string[] = ['https://checkout.stripe.com', 'https://billing.stripe.com'];

/** `originOf` with a trailing dot of the host removed, so `host.` cannot dodge an exact comparison. */
function originWithoutTrailingDot(url: string): string | null {
  const o = originOf(url);
  return o === null ? null : o.replace(/\.(?=(:\d+)?$)/, '');
}

export type NavigationDecision = 'load' | 'external' | 'block';

/**
 * The cross-origin sub-frames the shell loads (exact origins). Empty: the web app has no
 * cross-origin iframe. A frame origin added here can load, but a host-only media grant would
 * still be a risk, so keep it empty until a measured flow needs it.
 */
export const FRAME_ORIGIN_ALLOW_LIST: readonly string[] = [];

/**
 * What the WebView does with a navigation request. `origin` is the app origin.
 *
 * - `load`: the app origin (exact: scheme + host + port), and `about:`. A SUB-frame also loads
 *   `blob:` and `data:` (srcdoc templates, previews).
 * - `block` (top frame): an http(s) URL whose origin is one of `blockedOrigins` (checked first).
 *   A TOP-frame `blob:` or `data:`.
 * - `external`: any other http(s) URL (the DFL sign-in handoff included, until the system auth
 *   session of R-20), plus `mailto:` and `tel:`; opened outside the shell.
 * - `block`: everything else, including every custom scheme (`itera://`, `intent://`, ...).
 *
 * A sub-frame loads for `about:`, `blob:`, `data:`, and a URL whose origin is EXACTLY the app
 * origin or is in `frameOrigins` (http(s) only). Any other sub-frame is blocked.
 */
export function navigationDecision(
  url: string,
  origin: string,
  isTopFrame = true,
  frameOrigins: readonly string[] = FRAME_ORIGIN_ALLOW_LIST,
  blockedOrigins: readonly string[] = BLOCKED_ORIGINS,
): NavigationDecision {
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url.trim())?.[1].toLowerCase() ?? null;
  if (scheme === null) return 'block';
  const appOrigin = originOf(origin);
  if (!isTopFrame) {
    if (scheme === 'about' || scheme === 'blob' || scheme === 'data') return 'load';
    const frame = originOf(url);
    if (frame === null) return 'block';
    if (frame === appOrigin) return 'load';
    if (scheme !== 'https' && scheme !== 'http') return 'block';
    return frameOrigins.includes(frame) ? 'load' : 'block';
  }
  if (scheme === 'blob' || scheme === 'data') return 'block';
  if (scheme === 'about') return 'load';
  const top = originOf(url);
  if (top !== null && top === appOrigin) return 'load';
  if (scheme === 'https' || scheme === 'http') {
    if (top === null) return 'block';
    const dotless = originWithoutTrailingDot(url);
    if (dotless !== null && blockedOrigins.includes(dotless)) return 'block';
    return 'external';
  }
  if (scheme === 'mailto' || scheme === 'tel') return 'external';
  return 'block';
}
