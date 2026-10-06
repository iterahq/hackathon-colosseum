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
 *  - `originOf` is the bridge's (`@iterahq/shell-bridge`), re-exported: one origin parser in the shell.
 *
 * The origin of the web content in the shell stays ONE config value: `expo.extra.webOrigin`.
 *
 * Pure TypeScript: no React Native import.
 */
import { originOf } from '@iterahq/shell-bridge';

export { originOf };

export const DEFAULT_WEB_ORIGIN = 'https://app.iterahq.dev';

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
 * Development builds only (Expo Go): the DFL handoff page loads inside the WebView, so "Entrar com DFL"
 * can finish without a deep-link return, which Expo Go cannot receive. A store build passes nothing here
 * and the handoff goes to the system browser until the auth session of R-20 exists.
 */
export const DEV_TOP_FRAME_ORIGINS: readonly string[] = ['https://learn.devfellowship.com'];

/**
 * What the WebView does with a navigation request. `origin` is the app origin.
 *
 * - `load`: the app origin (exact: scheme + host + port), and `about:`. A SUB-frame also loads
 *   `blob:` and `data:` (srcdoc templates, previews).
 * - `block` (top frame): an http(s) URL whose origin is one of `blockedOrigins` (checked first, even
 *   before the app origin).
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
  topFrameOrigins: readonly string[] = [],
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
  if (scheme === 'https' || scheme === 'http') {
    const top = originOf(url);
    if (top === null) return 'block';
    const dotless = originWithoutTrailingDot(url);
    if (dotless !== null && blockedOrigins.includes(dotless)) return 'block';
    if (top === appOrigin) return 'load';
    return scheme === 'https' && topFrameOrigins.includes(top) ? 'load' : 'external';
  }
  if (scheme === 'mailto' || scheme === 'tel') return 'external';
  return 'block';
}
