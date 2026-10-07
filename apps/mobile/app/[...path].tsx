/**
 * Provenance: devfellowship/dfl-lesson-studio, apps/ios/app/[...path].tsx, commit
 * e90a642c4f7a7f4b9651895270a3f489cffc84a7 (strip-down, not a copy; PLAN section 2.5).
 * Kept: the WebView props, `onShouldStart`, `onError`, the process-death handlers.
 * Removed: `useMobileUiPath` (`?ui=mobile`: one responsive tree here), the LS bridge handlers
 * (R-6 adds one router, src/bridgeMessage.ts, with `shell.version`; R-8 adds `keepAwake` there and removes `useKeepAwake`: the page asks per route), `nativeSession`, `onFileDownload`,
 * `mediaCapturePermissionGrantType`, `OfflineScreen`, `downloadName`, the native
 * route push, the web-bundle origin, the splash gate and the two-React throw.
 * Also changed: `setSupportMultipleWindows={false}` added (PLAN ADR-5); `onNavigationStateChange` now only
 * records the loaded URL and `canGoBack` (LS used it to push native routes); `onLoadStart`/`onLoadEnd`
 * drive the load state instead of the bridge reset and the splash.
 * R-7 adds the launch gate back, as `src/shellGate.ts` (pure, tested) and `src/UpdateNowCard.tsx`: a read of
 * `<webOrigin>/shell-config.json` at launch, repeated by `rereadDue` and on retry; a shell below `minShellVersion` shows the card instead of the WebView, read in parallel with it.
 * R-5 (deep links): the route reads the incoming query and fragment raw (`+native-intent.ts`, `src/rawLink.ts`, `src/deepLink.ts`), so the WebView starts on the link's query and fragment as written, e.g.
 * `/auth/dfl/callback#dfl_token=…`; the dev overlay shows the URL without query or fragment.
 * R-20 adds the DFL sign-in through the system auth session (`src/dflAuthSession.ts`, `navigationDecision` answer `auth-session`).
 * Added: the `DevOverlay` mount, and the Stripe origins (`BLOCKED_ORIGINS`, via the default of `blockedOrigins`) in `navigationDecision`.
 * PR-2 adds the chrome of PLAN section 4.1: the load state (src/shellChromeState.ts), the veil and the
 * failure card, `onHttpError`, `onRenderProcessGone`, the hardware back button, the "Indisponível no
 * app" notice, the safe-area frame, and the console forwarder (src/consoleMessage.ts). The WebView
 * is re-created (React key) on Retry and after a process death instead of `reload()`: a dead
 * Android renderer cannot be reloaded, and one path then serves every failure.
 * R-12 adds `auth.session` (PLAN ADR-10): the page hands its access token to `src/nativeSession.ts` (memory
 * only, one copy per process); the session token of the router comes from `expo-crypto`; the copy is dropped
 * on every top-frame load start, relaunch and unmount, and the next page sends its own. Under `__DEV__` the
 * probe of `src/backendProbe.ts` reads the backend with that token and the overlay shows the answer.
 * `onMessage` is `src/receiveShellMessage.ts` plus its effects. It has two windows (`src/messageWindow.ts`): a raw one before any parse (count and length of what frames on the app origin
 * send), and the page's budget after it, which counts only what a parser accepted. A frame on another origin
 * reaches neither. A build with no backend has no native session and never offers `auth.session`.
 * On return to the foreground the session is revalidated: the page is asked once, and a copy nobody vouches for is dropped.
 * The Android guard has a second line (`createLateGuard`, `onNavigationStateChange`): native loads the page when JS is late to answer the tap guard, so the URL of every navigation event is judged again.
 * Android reports a route change of the web app (pushState) as a load start with `loading: false`: `classifyLoadStart` makes it a history update, so it shows no veil and resets nothing.
 * R-2 adds the back-confirm card of installed builds (src/backConfirm.ts, src/BackConfirmCard.tsx); Expo Go keeps the system back.
 *
 * The one catch-all route of the shell. Every path opens the web app in a WebView; a path that is
 * not in the route map opens the home route.
 *
 * - Origin: ONE config value, `expo.extra.webOrigin` (src/origin.ts, PLAN ADR-4).
 * - Navigation: `navigationDecision` loads the app origin only. Stripe is blocked (never loaded,
 *   never opened outside); the DFL sign-in handoff goes to the system browser (PLAN ADR-5).
 *
 * File name: Expo Router 57 does not match the root path "/" (Expo Go opens "/--/") with an
 * optional catch-all "[[...path]]": it shows "Unmatched Route". So the catch-all is "[...path]"
 * and "index.tsx" re-exports it for the root.
 */
import Constants from 'expo-constants';
import { getRandomValues } from 'expo-crypto';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as WebBrowser from 'expo-web-browser';
import { useIsFocused, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type RefObject } from 'react';
import { Alert, AppState, BackHandler, Linking, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview/lib/WebViewTypes';
import { parseBackend, probeIteraUser, probeLine, type ProbeResult } from '../src/backendProbe';
import { createShellBridge, type ShellBridge } from '../src/bridgeMessage';
import { buildConsoleForwarder } from '../src/consoleMessage';
import { type MessageBucket, type RawBucket } from '../src/messageWindow';
import { receiveShellMessage } from '../src/receiveShellMessage';
import { DevOverlay } from '../src/DevOverlay';
import { BackConfirmCard } from '../src/BackConfirmCard';
import { backConfirmEnabled, decideBack } from '../src/backConfirm';
import { browserUrl, displayUrl, entryFromLink, isCallbackEntry, type LinkParams } from '../src/deepLink';
import { AUTH_BUSY_NOTICE, AUTH_FAILED_NOTICE, acceptAuthSessionReturn, authSessionEnabled, createReturnLatch, createSessionGuard } from '../src/dflAuthSession';
import { forgetLink, lastLink } from '../src/rawLink';
import { createKeepAwakeClaims } from '../src/keepAwakeHolder';
import { LoadingVeil } from '../src/LoadingVeil';
import { createNativeSession, issuerOf, sessionStatusLine } from '../src/nativeSession';
import { OfflineCard } from '../src/OfflineCard';
import { browserMethod, createOpenReporter } from '../src/openExternal';
import { createLaunchGate, rereadDue, rereadOnRetry, shownLaunch, updateCardCopy, type LaunchConfig } from '../src/shellGate';
import { UpdateNowCard } from '../src/UpdateNowCard';
import { DEV_TOP_FRAME_ORIGINS, dflCallbackUrl, isTopFrameRequest, navigationDecision, parseWebOrigin } from '../src/origin';
import {
  INITIAL_CHROME,
  LOAD_TIMEOUT_MS,
  blockedNotice,
  cardCopy,
  LATE_GUARD_ERROR,
  chromeReducer,
  classifyLoadStart,
  createLateGuard,
  isCardVisible,
  isVeilVisible,
  noticeDue,
  OPEN_FAILED_NOTICE,
  restartUrl,
} from '../src/shellChromeState';

const ORIGIN = parseWebOrigin(Constants.expoConfig?.extra?.webOrigin);
const SHELL_VERSION = Constants.expoConfig?.version ?? '0.0.0';
const BACKGROUND = '#0A0908';
// Expo Go keeps the system back (it returns to the Expo Go home); an installed app asks first.
const BACK_CONFIRM = backConfirmEnabled(Constants.executionEnvironment);
// Installed builds sign in with DFL through the system auth session (R-20); Expo Go cannot receive the return link.
const AUTH_SESSION = authSessionEnabled(Constants.executionEnvironment);
// Top-frame origins the WebView may load besides the app: Expo Go only (it cannot receive the DFL return link). Both guards read this.
const TOP_FRAME_ORIGINS = __DEV__ && !AUTH_SESSION ? DEV_TOP_FRAME_ORIGINS : [];
// A page the system refuses to open (the browser, a mail or phone link, the auth sheet) is never a silent tap: one short notice.
const OPENS = createOpenReporter((notice) => Alert.alert(notice), Date.now, OPEN_FAILED_NOTICE);
const DFL_RETURN = dflCallbackUrl(ORIGIN);
const DFL_SESSION = createSessionGuard();
// Android delivers the return link twice (Expo Router and the session promise): the latch lets exactly one of them load it.
const DFL_RETURNS = createReturnLatch(Date.now);
// One platform lock per process, shared by every mounted WebView.
const KEEP_AWAKE = createKeepAwakeClaims({
  activate: (tag: string) => activateKeepAwakeAsync(tag),
  deactivate: (tag: string) => deactivateKeepAwake(tag),
});

// Both values are public (Metro inlines `EXPO_PUBLIC_*` into the bundle): the ones the web ships as `VITE_SUPABASE_*`.
const BACKEND = parseBackend(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
// One copy of the access token per process, in memory only (ADR-10). The WebView owns the session and its refresh.
// No backend in the build = no issuer to hold a token to = no native session: `auth.session` is not offered.
const NATIVE_SESSION = BACKEND === null ? null : createNativeSession({ issuer: issuerOf(BACKEND.origin) });
const RANDOM = (bytes: Uint8Array) => getRandomValues(bytes);

// react-native-webview declares `class WebView<P = undefined>` in some releases. With that default
// the props type is `WebViewProps & undefined`, which is `never` (TS2769). Instantiate the class
// with no extra props, as the old default `P = {}` did.
const ShellWebView = WebView<object>;
type ShellWebView = InstanceType<typeof ShellWebView>;

// Read at launch, in parallel with the WebView (which is already veiled). The card replaces the WebView only
// when a config that was read says this shell is too old. It is read again on return to the foreground (the update card always;
// otherwise when the last read failed, after 30 s, or succeeded, after 30 min: `rereadDue`) and on both retries (the update card's,
// and the failure card's when the last read failed), so a launch offline does not dodge `minShellVersion` for the life of the process.
const LAUNCH = createLaunchGate(ORIGIN, SHELL_VERSION, Platform.OS);
void LAUNCH.get();

function useLaunchConfig(): { launch: LaunchConfig | null; refresh: () => void; retryRead: () => boolean } {
  const [launch, setLaunch] = useState(LAUNCH.peek());
  const refresh = useCallback(() => void LAUNCH.refresh().then(setLaunch), []);
  // True when a read was started: the failure card is up, so the page is gone and the answer may apply at once.
  const retryRead = useCallback(() => {
    if (!rereadOnRetry(LAUNCH.status())) return false;
    refresh();
    return true;
  }, [refresh]);
  useEffect(() => {
    let live = true;
    void LAUNCH.get().then((config) => live && setLaunch(config));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && rereadDue(LAUNCH.peek()?.gate.kind === 'update' ? 'update' : 'run', LAUNCH.status(), Date.now())) refresh();
    });
    return () => subscription.remove();
  }, [refresh]);
  return { launch, refresh, retryRead };
}

export default function ShellRoute() {
  // The query and the fragment of an incoming link ride in the params (`#` is the fragment): the page needs both.
  // The segments come from the pathname, never from the `path` param: a link with `?path=…` cannot pick the route.
  const pathname = usePathname();
  const params = useLocalSearchParams() as LinkParams;
  // Android: when the session already loaded this return link, the router's copy of it keeps the WebShell it has (same key, no second load).
  // The raw link of the DFL callback (a bearer token in its fragment) is forgotten once taken as the entry (the effect below), so a render
  // after that, on the same route and params, keeps the entry it built from the link instead of rebuilding it from the decoded params.
  const entry = useRef<{ raw: string; effective: string; view: string } | null>(null);
  const view = `${pathname}\n${JSON.stringify(params)}`;
  const link = lastLink();
  const rawEntry =
    link === null && entry.current?.view === view
      ? entry.current.raw
      : entryFromLink(link, ORIGIN, pathname.split('/').filter(Boolean), params);
  if (entry.current?.raw !== rawEntry) {
    const returned = acceptAuthSessionReturn({ type: 'success', url: ORIGIN + rawEntry }, ORIGIN);
    const duplicate = returned !== null && DFL_RETURNS.arrive('router') === 'duplicate';
    entry.current = { raw: rawEntry, effective: duplicate && entry.current !== null ? entry.current.effective : rawEntry, view };
  }
  entry.current.view = view;
  const entryPath = entry.current.effective;
  // The RAW entry, not the effective one: in the Android order where the session loaded the return first, the router's copy is a
  // `duplicate`, the effective entry stays `/login`, and the raw link was consumed all the same.
  useEffect(() => {
    if (isCallbackEntry(rawEntry)) forgetLink();
  }, [rawEntry]);
  const { launch, refresh, retryRead } = useLaunchConfig();
  // A run -> update flip is not applied under a mounted page (`shownLaunch`): at the next launch, the next route entry, or when the page is already gone.
  const shown = useRef<{ config: LaunchConfig | null; fresh: LaunchConfig | null; entry: string }>({ config: null, fresh: null, entry: entryPath });
  const pageGone = useRef(false);
  shown.current.config = shownLaunch(shown.current.config, launch, { entryChanged: shown.current.entry !== entryPath, pageGone: pageGone.current });
  shown.current.entry = entryPath;
  if (launch !== shown.current.fresh) {
    shown.current.fresh = launch;
    pageGone.current = false;
  }
  const gate = shown.current.config?.gate;
  if (gate?.kind === 'update') {
    return (
      <SafeAreaView style={styles.root}>
        <UpdateNowCard copy={updateCardCopy(gate)} onRetry={refresh} />
      </SafeAreaView>
    );
  }
  return <WebShell key={entryPath} entryPath={entryPath} onRetryRead={() => {
        if (retryRead()) pageGone.current = true;
      }} />;
}

// The one reader of WebView messages and the router that answers them. `nativeEvent` is handed whole to `receiveShellMessage` and read nowhere else (rule 1c).
function useBridgeChannel(webview: RefObject<ShellWebView | null>) {
  const [forwardedErrors, setForwardedErrors] = useState(0);
  const [bridgeHandshakes, setBridgeHandshakes] = useState(0);
  const [sessionOffered, setSessionOffered] = useState<boolean | null>(null);
  const shellBridge = useMemo(
    () => createShellBridge({ origin: ORIGIN, shellVersion: SHELL_VERSION, keepAwake: KEEP_AWAKE, session: NATIVE_SESSION, random: RANDOM }),
    [],
  );
  const bucket = useRef<MessageBucket>({ start: 0, count: 0 });
  const rawBucket = useRef<RawBucket>({ start: 0, count: 0, chars: 0 });
  // Every decision (origin, the raw window, the console shape in development, the bridge envelope, the
  // page budget) is `receiveShellMessage`'s; this callback stores the buckets and performs the effect.
  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      const answer = receiveShellMessage({ event: e.nativeEvent, raw: rawBucket.current, page: bucket.current, origin: ORIGIN, platform: Platform.OS, dev: __DEV__, now: Date.now() });
      rawBucket.current = answer.raw;
      bucket.current = answer.page;
      if (answer.kind === 'drop') return;
      if (answer.kind === 'console') {
        setForwardedErrors((n) => n + 1);
        console.warn(`[web ${answer.message.level}] ${answer.message.text}`);
        return;
      }
      void shellBridge.handle(answer.message).then((out) => {
        if (out.script !== null) webview.current?.injectJavaScript(out.script);
        if (out.handshake) {
          setBridgeHandshakes((n) => n + 1);
          setSessionOffered(out.sessionOffered);
        }
        if (__DEV__ && out.refused !== null) console.warn(`[bridge] refused: ${out.refused}`);
      });
    },
    [shellBridge, webview],
  );
  return { shellBridge, onMessage, forwardedErrors, bridgeHandshakes, sessionOffered };
}

function useNativeSessionLink(webview: RefObject<ShellWebView | null>, shellBridge: ShellBridge) {
  // The native session asks the page of this WebView when its copy is absent or about to expire.
  useEffect(
    () =>
      NATIVE_SESSION?.bindAsk((forceRefresh) => {
        const script = shellBridge.askSession(forceRefresh);
        if (script === null || webview.current === null) return false;
        webview.current.injectJavaScript(script);
        return true;
      }),
    [shellBridge, webview],
  );

  // A sign-out sent while the app was suspended can be lost. Back in the foreground the page is asked once;
  // with no answer inside the grace the copy is dropped. No interval: one timer per return to the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') NATIVE_SESSION?.revalidate();
    });
    return () => subscription.remove();
  }, []);
}

// Development probe (R-12): on each session change, read the backend as the learner. A sign-out clears the answer.
function useSessionProbe() {
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const probeRun = useRef(0);
  useEffect(() => {
    if (!__DEV__ || NATIVE_SESSION === null) return undefined;
    const native = NATIVE_SESSION.session;
    return native.subscribe((event) => {
      const run = (probeRun.current += 1);
      if (event.type === 'signed-out') {
        setSessionExpiresAt(null);
        setProbe({ kind: 'no-session' });
        return;
      }
      setSessionExpiresAt(event.session.expiresAt);
      void probeIteraUser(BACKEND, () => native.getAccessToken()).then((result) => {
        if (probeRun.current === run) setProbe(result);
      });
    });
  }, []);
  return { sessionExpiresAt, probe };
}

// "Entrar com DFL" (R-20): the system auth sheet on the handoff URL, `return` untouched. The URL that comes back carries a
// bearer token in its fragment: it goes to `onReturn` and nowhere else (no log, no state, no storage).
function useDflAuthSession(onReturn: (url: string) => void) {
  const lastBusyNotice = useRef<number | null>(null);
  return useCallback(
    (handoffUrl: string) => {
      if (DFL_RETURN === null) return;
      const ticket = DFL_SESSION.tryEnter();
      if (ticket === null) {
        if (noticeDue(lastBusyNotice.current, Date.now())) {
          lastBusyNotice.current = Date.now();
          Alert.alert(AUTH_BUSY_NOTICE);
        }
        return;
      }
      DFL_RETURNS.begin();
      // `preferUniversalLinks`: iOS 17.4+ then ends the session on the https callback (`ASWebAuthenticationSession` `.https`); without
      // it the library uses `callbackURLScheme: "https"`, which never matches, and the callback page would run inside the sheet.
      // Android ignores the option (the library reads it on iOS only).
      WebBrowser.openAuthSessionAsync(handoffUrl, DFL_RETURN, { preferUniversalLinks: true })
        .then((result) => {
          const returned = acceptAuthSessionReturn(result, ORIGIN);
          if (returned !== null && DFL_RETURNS.arrive('session') === 'load') onReturn(returned);
        })
        .catch(() => OPENS.fail(AUTH_FAILED_NOTICE))
        .finally(() => {
          if (DFL_SESSION.leave(ticket)) DFL_RETURNS.end();
        });
    },
    [onReturn],
  );
}

// One blocked-navigation notice per NOTICE_GAP_MS for the tap guard and the late guard together: a page loop cannot queue modals.
function useBlockedNotice() {
  const lastNotice = useRef<number | null>(null);
  return useCallback((notice: string) => {
    if (!noticeDue(lastNotice.current, Date.now())) return;
    lastNotice.current = Date.now();
    Alert.alert(notice);
  }, []);
}

function useNavigationGuard(onAuthSession: (handoffUrl: string) => void, showNotice: (notice: string) => void) {
  return useCallback((req: ShouldStartLoadRequest) => {
    const topFrame = isTopFrameRequest(req.isTopFrame);
    const decision = navigationDecision(req.url, ORIGIN, topFrame, undefined, undefined, TOP_FRAME_ORIGINS, AUTH_SESSION);
    if (decision === 'external') void OPENS.attempt(() => Linking.openURL(req.url));
    if (decision === 'auth-session') onAuthSession(req.url);
    const notice = blockedNotice(decision, topFrame);
    if (notice !== null) showNotice(notice);
    return decision === 'load';
  }, [onAuthSession, showNotice]);
}

function WebShell({ entryPath, onRetryRead }: { entryPath: string; onRetryRead: () => void }) {
  const entryUrl = ORIGIN + entryPath;
  const webview = useRef<ShellWebView>(null);
  const [chrome, dispatch] = useReducer(chromeReducer, INITIAL_CHROME);
  const canGoBack = useRef(false);
  const phase = useRef(chrome.phase);
  phase.current = chrome.phase;
  const [loadedUrl, setLoadedUrl] = useState(entryUrl);
  const { shellBridge, onMessage, forwardedErrors, bridgeHandshakes, sessionOffered } = useBridgeChannel(webview);
  useNativeSessionLink(webview, shellBridge);
  const { sessionExpiresAt, probe } = useSessionProbe();
  // The console forwarder is a development aid (Expo Go is always __DEV__); the bridge channel is always on.
  const forwarder = useMemo(() => (__DEV__ ? buildConsoleForwarder(ORIGIN) : undefined), []);
  // The page the DFL session returned: the WebView is created again on it, so `DflCallbackPage` reads the fragment as in a browser.
  const loadReturned = useCallback(
    (url: string) => {
      canGoBack.current = false;
      shellBridge.reset();
      dispatch({ type: 'load', url });
    },
    [shellBridge],
  );
  const showNotice = useBlockedNotice();
  const onShouldStart = useNavigationGuard(useDflAuthSession(loadReturned), showNotice);

  // The second line of the Android guard: native loads the page when JS is late to answer `onShouldStartLoadWithRequest`
  // (250 ms), so the top-frame URL of every navigation event is judged again, by the same decision. `onLoadStart` hands the
  // same event to this callback right after itself, so this is the earliest point on both platforms (react-native-webview `WebViewShared.js`).
  // A forbidden page is stopped and the WebView is created again on the last page the guard let through (the reducer's `load`).
  const lateGuard = useMemo(() => createLateGuard(ORIGIN, TOP_FRAME_ORIGINS, AUTH_SESSION), []);
  const loadStartPending = useRef(false);
  const lastGoodUrl = useRef(entryUrl);
  const mountKey = useRef(chrome.mountKey);
  mountKey.current = chrome.mountKey;
  const recoveredMount = useRef<number | null>(null);
  const onNavigationStateChange = useCallback(
    (nav: WebViewNavigation) => {
      // `onLoadStart` and this callback run back to back for the same event (`WebViewShared.js` `onLoadingStart`): the start is acted on here, where `loading` is known.
      const startsLoad = loadStartPending.current;
      loadStartPending.current = false;
      if (recoveredMount.current === mountKey.current) return;
      const late = lateGuard.judge(nav.url, restartUrl(lastGoodUrl.current, ORIGIN, entryUrl));
      if (late.kind !== 'none') {
        webview.current?.stopLoading();
        if (late.notice !== null) showNotice(late.notice);
        recoveredMount.current = mountKey.current;
        canGoBack.current = false;
        shellBridge.reset();
        // `stop` is the refusal: the failure card with its two buttons at once. `recover` creates the WebView again on the last page let through.
        dispatch(late.kind === 'stop' ? { type: 'error', description: LATE_GUARD_ERROR } : { type: 'load', url: restartUrl(lastGoodUrl.current, ORIGIN, entryUrl) });
        return;
      }
      // Android sends pushState (every route change of the web app) as a load start with `loading: false`: a history update, not a load (`classifyLoadStart`).
      if (startsLoad && classifyLoadStart(Platform.OS, nav.loading, phase.current) === 'load') {
        shellBridge.reset();
        dispatch({ type: 'loadStart' });
      }
      canGoBack.current = nav.canGoBack;
      lastGoodUrl.current = nav.url;
      setLoadedUrl(nav.url);
    },
    [lateGuard, showNotice, shellBridge, entryUrl],
  );

  // The page asks to keep the screen on; whatever it holds ends with the WebView.
  useEffect(() => () => shellBridge.reset(), [shellBridge]);

  // Marks a load start; `onNavigationStateChange` acts on it right after (see there).
  const onLoadStart = useCallback(() => {
    loadStartPending.current = true;
  }, []);

  // Re-create the WebView on the page it was on (Retry, process death). The reducer owns the start URL,
  // so it changes only when the WebView is in fact created again.
  const relaunch = useCallback(
    (event: 'retry' | 'processGone') => {
      canGoBack.current = false;
      shellBridge.reset();
      dispatch({ type: event, url: restartUrl(loadedUrl, ORIGIN, entryUrl) });
    },
    [loadedUrl, entryUrl, shellBridge],
  );

  // Android: a Custom Tab, never `Linking.openURL` (the installed app is the verified handler of its own links and would get the intent back).
  const retry = useCallback(() => {
    onRetryRead();
    relaunch('retry');
  }, [onRetryRead, relaunch]);

  const openInBrowser = useCallback(() => {
    const url = browserUrl(restartUrl(loadedUrl, ORIGIN, entryUrl));
    void OPENS.attempt(() => (browserMethod(Platform.OS) === 'custom-tab' ? WebBrowser.openBrowserAsync(url) : Linking.openURL(url)));
  }, [loadedUrl, entryUrl]);

  useEffect(() => {
    if (chrome.phase !== 'loading') return undefined;
    const timer = setTimeout(() => dispatch({ type: 'timeout', loadId: chrome.loadId }), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [chrome.phase, chrome.loadId]);

  // Android hardware back follows the WebView history. At the root an installed app opens the back-confirm
  // card (src/backConfirm.ts); in Expo Go the press is left to the system (the Expo Go home).
  const [backConfirmOpen, setBackConfirmOpen] = useState(false);
  const backConfirmOpenRef = useRef(false);
  backConfirmOpenRef.current = backConfirmOpen;
  const focusedRef = useRef(true);
  focusedRef.current = useIsFocused();
  const router = useRouter();
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const action = decideBack({ canGoBack: canGoBack.current, phase: phase.current, confirmOpen: backConfirmOpenRef.current, confirmEnabled: BACK_CONFIRM, focused: focusedRef.current, canPop: router.canGoBack() });
      if (action === 'history') webview.current?.goBack();
      else if (action === 'confirm') setBackConfirmOpen(true);
      else if (action === 'dismiss') setBackConfirmOpen(false);
      return action !== 'leave';
    });
    return () => subscription.remove();
  }, []);

  const copy = cardCopy(chrome.failure);

  return (
    <SafeAreaView style={styles.root}>
      <ShellWebView
        key={chrome.mountKey}
        ref={webview}
        source={{ uri: chrome.startUrl ?? entryUrl }}
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
        injectedJavaScriptBeforeContentLoaded={forwarder}
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly={true}
        injectedJavaScriptForMainFrameOnly={true}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
        onNavigationStateChange={onNavigationStateChange}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsBackForwardNavigationGestures
        onLoadStart={onLoadStart}
        onLoadEnd={() => dispatch({ type: 'loadEnd' })}
        onError={(e) => dispatch({ type: 'error', description: e.nativeEvent.description })}
        onHttpError={(e) => dispatch({ type: 'httpError', statusCode: e.nativeEvent.statusCode })}
        onContentProcessDidTerminate={() => relaunch('processGone')}
        onRenderProcessGone={() => relaunch('processGone')}
        renderError={() => <></>}
        style={styles.web}
        testID="shell-webview"
      />
      <LoadingVeil visible={isVeilVisible(chrome)} />
      {isCardVisible(chrome) ? (
        <OfflineCard title={copy.title} body={copy.body} onRetry={retry} onOpenBrowser={openInBrowser} />
      ) : null}
      {backConfirmOpen ? <BackConfirmCard onStay={() => setBackConfirmOpen(false)} onLeave={() => BackHandler.exitApp()} /> : null}
      {__DEV__ ? (
        <DevOverlay
          version={SHELL_VERSION}
          url={displayUrl(loadedUrl)}
          forwardedErrors={forwardedErrors}
          bridgeHandshakes={bridgeHandshakes}
          session={sessionStatusLine(sessionOffered, NATIVE_SESSION !== null, sessionExpiresAt, Date.now())}
          backend={probeLine(probe)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BACKGROUND },
  // Dark before the page paints: no light frame between the launch screen and the app.
  web: { flex: 1, backgroundColor: BACKGROUND },
});
