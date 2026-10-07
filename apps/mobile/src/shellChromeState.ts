/**
 * The load state of the shell chrome (PLAN section 4.1): loading veil, load-failure card, process
 * death. A pure reducer: the route file feeds it WebView events and renders what it says, so the
 * rules below are unit-tested in plain Node.
 *
 * Pure TypeScript: no React Native import.
 */
import { DFL_CALLBACK_PATH, navigationDecision, originOf, type NavigationDecision } from './origin';

/** Loading for this long without the document finishing shows the failure card. */
export const LOAD_TIMEOUT_MS = 15_000;
export const VEIL_FADE_MS = 150;
/** Consecutive WebView process deaths (no finished load between them) before the card replaces the reload loop. */
export const MAX_PROCESS_DEATHS = 3;
export const BLOCKED_NOTICE = 'Indisponível no app';
/** A page the shell tried to open outside the WebView (the browser, the store, a mail or phone link) and the system refused. */
export const OPEN_FAILED_NOTICE = 'Não foi possível abrir';

export type ChromePhase = 'loading' | 'ready' | 'failed';
export type FailureKind = 'offline' | 'load' | 'http' | 'timeout' | 'process';

export interface ChromeState {
  phase: ChromePhase;
  failure: FailureKind | null;
  /** Changes whenever the WebView must be created again (retry, process death): use it as the React key. */
  mountKey: number;
  /** Changes whenever a load starts from a non-loading phase: the 15 s timer belongs to one id. */
  loadId: number;
  deaths: number;
  /** Where the WebView created for `mountKey` starts; null is the entry URL. It changes only together with `mountKey`. */
  startUrl: string | null;
}

export type ChromeEvent =
  | { type: 'loadStart' }
  | { type: 'loadEnd' }
  | { type: 'error'; description: string }
  | { type: 'httpError'; statusCode: number }
  | { type: 'timeout'; loadId: number }
  | { type: 'retry'; url?: string }
  | { type: 'load'; url: string }
  | { type: 'processGone'; url?: string };

export const INITIAL_CHROME: ChromeState = { phase: 'loading', failure: null, mountKey: 0, loadId: 0, deaths: 0, startUrl: null };

const OFFLINE = /ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|internet connection appears to be offline|not connected to the internet/i;

/**
 * The shell reads the description of `onError` only (rule 1c of the one-copy test). The strings
 * are the Android WebView `net::ERR_*` names and the iOS NSURLError text; any other description is
 * a plain load failure. Not measured on a phone yet: a miss shows the generic card, never nothing.
 */
export function classifyLoadError(description: string): FailureKind {
  return OFFLINE.test(description) ? 'offline' : 'load';
}

const failed = (state: ChromeState, failure: FailureKind): ChromeState => ({ ...state, phase: 'failed', failure });
const relaunch = (state: ChromeState, deaths: number, url: string | undefined): ChromeState => ({
  phase: 'loading',
  failure: null,
  mountKey: state.mountKey + 1,
  loadId: state.loadId + 1,
  deaths,
  startUrl: url ?? state.startUrl,
});

export function chromeReducer(state: ChromeState, event: ChromeEvent): ChromeState {
  switch (event.type) {
    case 'loadStart':
      if (state.phase === 'loading') return state;
      return { ...state, phase: 'loading', failure: null, loadId: state.loadId + 1 };
    case 'loadEnd':
      // After `error`/`httpError` a finish event follows on Android and must not hide the card; after
      // the 15 s timeout the load is still running, so its finish means the page is there.
      return state.phase === 'loading' || state.failure === 'timeout' ? { ...state, phase: 'ready', failure: null, deaths: 0 } : state;
    case 'error':
      return failed(state, classifyLoadError(event.description));
    case 'httpError':
      return event.statusCode >= 400 ? failed(state, 'http') : state;
    case 'timeout':
      return state.phase === 'loading' && event.loadId === state.loadId ? failed(state, 'timeout') : state;
    case 'retry':
      return state.phase === 'failed' ? relaunch(state, 0, event.url) : state;
    case 'load':
      // A page the shell chose (R-20: the DFL return), from any phase: the WebView is created again on that URL.
      return relaunch(state, 0, event.url);
    case 'processGone':
      // The third death keeps the dead WebView and its start URL: a new `source` would make it load again under the card.
      return state.deaths + 1 >= MAX_PROCESS_DEATHS ? failed({ ...state, deaths: 0 }, 'process') : relaunch(state, state.deaths + 1, event.url);
  }
}

export const isVeilVisible = (state: ChromeState): boolean => state.phase === 'loading';
export const isCardVisible = (state: ChromeState): boolean => state.phase === 'failed';

export interface CardCopy {
  title: string;
  body: string;
}

export function cardCopy(failure: FailureKind | null): CardCopy {
  if (failure === 'offline') return { title: 'Sem conexão', body: 'Verifique sua internet e tente de novo.' };
  return { title: 'Não foi possível abrir a Itera', body: 'Tente de novo ou abra no navegador.' };
}

/**
 * Where a re-created WebView starts: the page it was on when that page is on the app origin, else the entry URL.
 * Never the DFL callback (R-20): its URL may still carry the bearer token (the page scrubs it with `history.replaceState`,
 * which iOS does not report), and a restart would replay it. That restart is the app's home path.
 */
export function restartUrl(lastUrl: string, origin: string, entryUrl: string): string {
  const appOrigin = originOf(origin);
  const target = appOrigin !== null && originOf(lastUrl) === appOrigin ? lastUrl : entryUrl;
  return appOrigin !== null && isCallbackUrl(target, appOrigin) ? `${appOrigin}/` : target;
}

function isCallbackUrl(url: string, appOrigin: string): boolean {
  if (originOf(url) !== appOrigin) return false;
  const path = url.slice(url.indexOf('//') + 2).replace(/^[^/?#]*/, '').split(/[?#]/)[0] ?? '';
  return path.replace(/\/+$/, '').toLowerCase() === DFL_CALLBACK_PATH;
}

/** The notice for a refused navigation: top frame only (a blocked sub-frame is not a tap of the learner). */
export function blockedNotice(decision: NavigationDecision, isTopFrame: boolean): string | null {
  return decision === 'block' && isTopFrame ? BLOCKED_NOTICE : null;
}

/** Recoveries onto the same last good page, inside `LATE_WINDOW_MS`, before the guard stops relaunching and shows the failure card. */
export const MAX_LATE_RECOVERIES = 3;
export const LATE_WINDOW_MS = 60_000;
/** The description the route hands the reducer's `error` event when the late guard gives up: it classifies as a plain load failure (the card with both buttons). */
export const LATE_GUARD_ERROR = 'late-guard: forbidden navigation';

export type LateAction =
  /** The top-frame URL is one the guard would have let load. */
  | { kind: 'none' }
  /** Stop the load and create the WebView again on `restartUrl`; `notice` is what a blocked tap shows, or null. */
  | { kind: 'recover'; notice: string | null }
  /** The refusal after `MAX_LATE_RECOVERIES`: stop the load and show the failure card at once (`LATE_GUARD_ERROR`), no new relaunch. */
  | { kind: 'stop'; notice: string | null };

export interface LateGuard {
  /** Judge the top-frame URL a navigation event reports, with the decision `onShouldStartLoadWithRequest` makes. `lastGood` is the page the relaunch would land on. */
  judge: (url: string, lastGood: string) => LateAction;
}

/**
 * The second line of defence of the Android guard (react-native-webview `RNCWebViewClient.java`: when JS does not answer
 * `shouldOverrideUrlLoading` within 250 ms, the native side loads the page anyway). The navigation events still arrive afterwards
 * with the URL; this judges it by the SAME `navigationDecision` (same top-frame origins, same auth-session flag), so a Stripe page
 * or the DFL handoff that got in is stopped, and Expo Go's allowed DFL origin (`DEV_TOP_FRAME_ORIGINS`) is not.
 * An answer other than `load` is a recovery. Recoveries are counted per `lastGood` page inside a time window (not reset when
 * some page finishes loading: an app page that redirects out after it loaded would never trip a counter reset that way); the
 * fourth inside the window is `stop`. The relaunch lands on `restartUrl`, an app-origin URL, which this judges `load`.
 */
export function createLateGuard(appOrigin: string, topFrameOrigins: readonly string[], useAuthSession: boolean, now: () => number = Date.now): LateGuard {
  const recoveries = new Map<string, number[]>();
  return {
    judge(url, lastGood) {
      const decision = navigationDecision(url, appOrigin, true, undefined, undefined, topFrameOrigins, useAuthSession);
      if (decision === 'load') return { kind: 'none' };
      const notice = blockedNotice(decision, true);
      const at = now();
      const recent = (recoveries.get(lastGood) ?? []).filter((t) => at - t < LATE_WINDOW_MS);
      recent.push(at);
      recoveries.set(lastGood, recent);
      return recent.length > MAX_LATE_RECOVERIES ? { kind: 'stop', notice } : { kind: 'recover', notice };
    },
  };
}

/**
 * Android reports `onLoadStart` from `doUpdateVisitedHistory` (`RNCWebViewClient.java:74-82`), which Chromium also calls for a
 * same-document navigation (`history.pushState`: every route change of the web app) with `loading` false (`createWebViewEvent`:
 * `!mLastLoadFailed && getProgress() != 100`), and no `onPageFinished` follows. Such a "start" is a history update: the URL and
 * `canGoBack` change and nothing else (no veil, no 15 s timer, no bridge reset). On iOS `loading` is `WKWebView.loading` at the policy
 * decision (false before the navigation starts) and a pushState sends no event, so iOS always starts a load. While the page is not `ready`
 * (first load, retry) a start is a start.
 */
export function classifyLoadStart(os: string, loading: boolean, phase: ChromePhase): 'load' | 'history' {
  return os === 'android' && !loading && phase === 'ready' ? 'history' : 'load';
}

/** Hardware back goes back in the page only while the page can, and never from the failure card (it leaves the shell, as at the root). */
export function shouldHandleBack(canGoBack: boolean, phase: ChromePhase): boolean {
  return canGoBack && phase !== 'failed';
}

export const NOTICE_GAP_MS = 2000;

/** At most one blocked-navigation notice per NOTICE_GAP_MS: a page loop cannot queue modals. */
export const noticeDue = (lastAt: number | null, now: number): boolean => lastAt === null || now - lastAt >= NOTICE_GAP_MS;
