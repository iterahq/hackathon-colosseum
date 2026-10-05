/**
 * The load state of the shell chrome (PLAN section 4.1): loading veil, load-failure card, process
 * death. A pure reducer: the route file feeds it WebView events and renders what it says, so the
 * rules below are unit-tested in plain Node.
 *
 * Pure TypeScript: no React Native import.
 */
import { originOf, type NavigationDecision } from './origin';

/** Loading for this long without the document finishing shows the failure card. */
export const LOAD_TIMEOUT_MS = 15_000;
export const VEIL_FADE_MS = 150;
/** Consecutive WebView process deaths (no finished load between them) before the card replaces the reload loop. */
export const MAX_PROCESS_DEATHS = 3;
export const BLOCKED_NOTICE = 'Indisponível no app';

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

/** Where a re-created WebView starts: the page it was on when that page is on the app origin, else the entry URL. */
export function restartUrl(lastUrl: string, origin: string, entryUrl: string): string {
  const appOrigin = originOf(origin);
  return appOrigin !== null && originOf(lastUrl) === appOrigin ? lastUrl : entryUrl;
}

/** The notice for a refused navigation: top frame only (a blocked sub-frame is not a tap of the learner). */
export function blockedNotice(decision: NavigationDecision, isTopFrame: boolean): string | null {
  return decision === 'block' && isTopFrame ? BLOCKED_NOTICE : null;
}

/** Hardware back goes back in the page only while the page can, and never from the failure card (it leaves the shell, as at the root). */
export function shouldHandleBack(canGoBack: boolean, phase: ChromePhase): boolean {
  return canGoBack && phase !== 'failed';
}

export const NOTICE_GAP_MS = 2000;

/** At most one blocked-navigation notice per NOTICE_GAP_MS: a page loop cannot queue modals. */
export const noticeDue = (lastAt: number | null, now: number): boolean => lastAt === null || now - lastAt >= NOTICE_GAP_MS;
