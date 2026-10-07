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
 *  - R-20 (PLAN ADR-10): the answer `auth-session` for exactly the DFL handoff (`isDflHandoff`), asked for through a
 *    seventh parameter. The shell opens it in the system auth session instead of the default path.
 *  - `originOf` is the bridge's (`@iterahq/shell-bridge`), re-exported: one origin parser in the shell.
 *
 * Sub-frame rules hold on iOS only. Android does not report the frame: the event of its normal path
 * (`RNCWebViewClient.java` `createWebViewEvent`) has no `isTopFrame`, so `isTopFrameRequest` reads every
 * Android request as the top frame. Only an explicit `false` (iOS) is a sub-frame.
 * Known consequence: Android's `shouldOverrideUrlLoading` may also be called for sub-frame navigations (Android docs) and the library
 * discards `isForMainFrame()`. A future `blob:` or `data:` iframe would be judged as a top frame and blocked, WITH the alert. Today's
 * preview is `srcdoc` (`about:srcdoc`, answer `load`), so nothing hits this; do not add such an iframe without changing this.
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

/**
 * The one reading of the `isTopFrame` field of a navigation request: `undefined` (Android's normal path) is the
 * top frame, and only an explicit `false` is a sub-frame. Pass the result to `navigationDecision` and to `blockedNotice`.
 */
export function isTopFrameRequest(isTopFrame: boolean | undefined): boolean {
  return isTopFrame !== false;
}

export type NavigationDecision = 'load' | 'external' | 'block' | 'auth-session';

/**
 * The cross-origin sub-frames the shell loads (exact origins). Empty: the web app has no
 * cross-origin iframe. A frame origin added here can load, but a host-only media grant would
 * still be a risk, so keep it empty until a measured flow needs it.
 */
export const FRAME_ORIGIN_ALLOW_LIST: readonly string[] = [];

/**
 * Expo Go only: the DFL handoff page loads inside the WebView, so "Entrar com DFL"
 * can finish without a deep-link return, which Expo Go cannot receive. An installed build passes nothing here
 * and the handoff takes the system auth session (`auth-session`, R-20).
 */
export const DEV_TOP_FRAME_ORIGINS: readonly string[] = ['https://learn.devfellowship.com'];

/** The DFL handoff the web starts with `loginWithDfl` (`src/auth/dflFederation.ts`): exact origin, exact path. */
export const DFL_HANDOFF_ORIGIN = 'https://learn.devfellowship.com';
export const DFL_HANDOFF_PATH = '/auth/federate';
/** The path on the app origin where the handoff returns, and where the shell's auth session ends. */
export const DFL_CALLBACK_PATH = '/auth/dfl/callback';

/** The `return` URL of the DFL handoff for an app origin: the one value the shell accepts. */
export function dflCallbackUrl(appOrigin: string): string | null {
  const o = originOf(appOrigin);
  return o === null || !o.startsWith('https://') ? null : `${o}${DFL_CALLBACK_PATH}`;
}

function decodeQueryValue(raw: string): string | null {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}

/**
 * True for exactly the DFL handoff: https, the origin `https://learn.devfellowship.com` (a trailing dot,
 * userinfo, another port or a longer host is not it), the path `/auth/federate`, and ONE `return`
 * parameter equal to `<app origin>/auth/dfl/callback`. The fragment is ignored; `next` and other
 * parameters are the web's.
 */
export function isDflHandoff(url: string, appOrigin: string): boolean {
  const callback = dflCallbackUrl(appOrigin);
  if (callback === null || url !== url.trim() || !/^https:\/\//i.test(url) || originOf(url) !== DFL_HANDOFF_ORIGIN) return false;
  const rest = url.slice(url.indexOf('//') + 2).replace(/^[^/?#]*/, '');
  const match = /^([^?#]*)(?:\?([^#]*))?/.exec(rest);
  if (match === null || match[1] !== DFL_HANDOFF_PATH) return false;
  const returns = (match[2] ?? '')
    .split('&')
    .filter((pair) => pair.split('=')[0] === 'return')
    .map((pair) => decodeQueryValue(pair.slice('return='.length)));
  return returns.length === 1 && returns[0] === callback;
}

/**
 * What the WebView does with a navigation request. `origin` is the app origin.
 *
 * - `load`: the app origin (exact: scheme + host + port), and `about:`. A SUB-frame also loads
 *   `blob:` and `data:` (srcdoc templates, previews).
 * - `block` (top frame): an http(s) URL whose origin is one of `blockedOrigins` (checked first, even
 *   before the app origin).
 *   A TOP-frame `blob:` or `data:`.
 * - `auth-session` (top frame, only when `useAuthSession` is true): the DFL handoff, `isDflHandoff`. Checked after
 *   the blocked origins. With `useAuthSession` false (Expo Go: it cannot receive the return link) the handoff
 *   keeps its old answer.
 * - `external`: any other http(s) URL (the DFL sign-in handoff included, when `useAuthSession` is false), plus `mailto:` and `tel:`; opened outside the shell.
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
  useAuthSession = false,
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
    if (useAuthSession && appOrigin !== null && isDflHandoff(url, appOrigin)) return 'auth-session';
    return scheme === 'https' && topFrameOrigins.includes(top) ? 'load' : 'external';
  }
  if (scheme === 'mailto' || scheme === 'tel') return 'external';
  return 'block';
}
