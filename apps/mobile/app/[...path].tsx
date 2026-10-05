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
 * R-7 adds the launch gate back, as `src/shellGate.ts` (pure, tested) and `src/UpdateNowCard.tsx`: one read of
 * `<webOrigin>/shell-config.json` per launch; a shell below `minShellVersion` shows the card instead of the WebView, read in parallel with it.
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
 * `onMessage` has two windows: a raw one before any parse (count and length of what frames on the app origin
 * send), and the page's budget after it, which counts only what a parser accepted. A frame on another origin
 * reaches neither. A build with no backend has no native session and never offers `auth.session`.
 * On return to the foreground the session is revalidated: the page is asked once, and a copy nobody vouches for is dropped.
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
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Linking, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview/lib/WebViewTypes';
import { parseBackend, probeIteraUser, probeLine, type ProbeResult } from '../src/backendProbe';
import { createShellBridge, parseBridgeMessage } from '../src/bridgeMessage';
import { admitMessage, admitRaw, buildConsoleForwarder, messageSize, parseConsoleMessage, type MessageBucket, type RawBucket } from '../src/consoleMessage';
import { DevOverlay } from '../src/DevOverlay';
import { createKeepAwakeClaims } from '../src/keepAwakeHolder';
import { LoadingVeil } from '../src/LoadingVeil';
import { createNativeSession, issuerOf, sessionLine } from '../src/nativeSession';
import { OfflineCard } from '../src/OfflineCard';
import { createLaunchGate, updateCardCopy, type LaunchConfig } from '../src/shellGate';
import { UpdateNowCard } from '../src/UpdateNowCard';
import { navigationDecision, parseWebOrigin } from '../src/origin';
import { resolveShellPath } from '../src/routes';
import {
  INITIAL_CHROME,
  LOAD_TIMEOUT_MS,
  blockedNotice,
  cardCopy,
  chromeReducer,
  isCardVisible,
  isVeilVisible,
  noticeDue,
  restartUrl,
  shouldHandleBack,
} from '../src/shellChromeState';

const ORIGIN = parseWebOrigin(Constants.expoConfig?.extra?.webOrigin);
const SHELL_VERSION = Constants.expoConfig?.version ?? '0.0.0';
const BACKGROUND = '#0A0908';
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

// Read once per launch, in parallel with the WebView (which is already veiled). The card replaces the WebView only
// when a config that was read says this shell is too old; it is read again on foreground and on "Tentar de novo".
const LAUNCH = createLaunchGate(ORIGIN, SHELL_VERSION, Platform.OS);
void LAUNCH.get();

function useLaunchConfig(): { launch: LaunchConfig | null; refresh: () => void } {
  const [launch, setLaunch] = useState(LAUNCH.peek());
  const refresh = useCallback(() => void LAUNCH.refresh().then(setLaunch), []);
  useEffect(() => {
    let live = true;
    void LAUNCH.get().then((config) => live && setLaunch(config));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && LAUNCH.peek()?.gate.kind === 'update') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);
  return { launch, refresh };
}

export default function ShellRoute() {
  const { path } = useLocalSearchParams<{ path?: string[] }>();
  const shellPath = resolveShellPath((path ?? []).join('/'));
  const { launch, refresh } = useLaunchConfig();
  const gate = launch?.gate;
  if (gate?.kind === 'update') {
    return (
      <SafeAreaView style={styles.root}>
        <UpdateNowCard copy={updateCardCopy(gate)} onRetry={refresh} />
      </SafeAreaView>
    );
  }
  return <WebShell key={shellPath} shellPath={shellPath} />;
}

function WebShell({ shellPath }: { shellPath: string }) {
  const entryUrl = ORIGIN + shellPath;
  const webview = useRef<ShellWebView>(null);
  const [chrome, dispatch] = useReducer(chromeReducer, INITIAL_CHROME);
  const canGoBack = useRef(false);
  const phase = useRef(chrome.phase);
  phase.current = chrome.phase;
  const [loadedUrl, setLoadedUrl] = useState(entryUrl);
  const [startUrl, setStartUrl] = useState(entryUrl);
  const [forwardedErrors, setForwardedErrors] = useState(0);
  const [bridgeHandshakes, setBridgeHandshakes] = useState(0);
  const [sessionOffered, setSessionOffered] = useState<boolean | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const shellBridge = useMemo(
    () => createShellBridge({ origin: ORIGIN, shellVersion: SHELL_VERSION, keepAwake: KEEP_AWAKE, session: NATIVE_SESSION, random: RANDOM }),
    [],
  );
  // The console forwarder is a development aid (Expo Go is always __DEV__); the bridge channel is always on.
  const forwarder = useMemo(() => (__DEV__ ? buildConsoleForwarder(ORIGIN) : undefined), []);

  const lastNotice = useRef<number | null>(null);
  const onShouldStart = useCallback((req: ShouldStartLoadRequest) => {
    const decision = navigationDecision(req.url, ORIGIN, req.isTopFrame);
    if (decision === 'external') void Linking.openURL(req.url);
    const notice = blockedNotice(decision, req.isTopFrame);
    if (notice !== null && noticeDue(lastNotice.current, Date.now())) {
      lastNotice.current = Date.now();
      Alert.alert(notice);
    }
    return decision === 'load';
  }, []);

  const onNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    canGoBack.current = nav.canGoBack;
    setLoadedUrl(nav.url);
  }, []);

  const bucket = useRef<MessageBucket>({ start: 0, count: 0 });
  const rawBucket = useRef<RawBucket>({ start: 0, count: 0, chars: 0 });
  // A frame that is not on the app origin stops at `messageSize`: unparsed and uncounted, so it can never
  // use up a window of the page. The raw window then bounds what is parsed at all. The page's own budget
  // counts only what a parser accepted: the console shape first (development only), then the bridge envelope.
  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      const size = messageSize(e.nativeEvent, ORIGIN);
      if (size === null || !admitRaw(rawBucket.current, Date.now(), size)) return;
      const consoleMessage = __DEV__ ? parseConsoleMessage(e.nativeEvent, ORIGIN) : null;
      const bridgeMessage = consoleMessage === null ? parseBridgeMessage(e.nativeEvent, ORIGIN, Platform.OS) : null;
      if (consoleMessage === null && bridgeMessage === null) return;
      const admission = admitMessage(bucket.current, Date.now());
      bucket.current = admission.bucket;
      if (!admission.admitted) return;
      if (consoleMessage !== null) {
        setForwardedErrors((n) => n + 1);
        console.warn(`[web ${consoleMessage.level}] ${consoleMessage.text}`);
        return;
      }
      if (bridgeMessage === null) return;
      void shellBridge.handle(bridgeMessage).then((out) => {
        if (out.script !== null) webview.current?.injectJavaScript(out.script);
        if (out.handshake) {
          setBridgeHandshakes((n) => n + 1);
          setSessionOffered(out.sessionOffered);
        }
        if (__DEV__ && out.refused !== null) console.warn(`[bridge] refused: ${out.refused}`);
      });
    },
    [shellBridge],
  );

  // The native session asks the page of this WebView when its copy is absent or about to expire.
  useEffect(
    () =>
      NATIVE_SESSION?.bindAsk((forceRefresh) => {
        const script = shellBridge.askSession(forceRefresh);
        if (script === null || webview.current === null) return false;
        webview.current.injectJavaScript(script);
        return true;
      }),
    [shellBridge],
  );

  // A sign-out sent while the app was suspended can be lost. Back in the foreground the page is asked once;
  // with no answer inside the grace the copy is dropped. No interval: one timer per return to the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') NATIVE_SESSION?.revalidate();
    });
    return () => subscription.remove();
  }, []);

  // Development probe (R-12): on each session change, read the backend as the learner. A sign-out clears the answer.
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

  // The page asks to keep the screen on; whatever it holds ends with the WebView.
  useEffect(() => () => shellBridge.reset(), [shellBridge]);

  const onLoadStart = useCallback(() => {
    shellBridge.reset();
    dispatch({ type: 'loadStart' });
  }, [shellBridge]);

  // Re-create the WebView on the page it was on (Retry, process death).
  const relaunch = useCallback(
    (event: 'retry' | 'processGone') => {
      canGoBack.current = false;
      shellBridge.reset();
      setStartUrl(restartUrl(loadedUrl, ORIGIN, entryUrl));
      dispatch({ type: event });
    },
    [loadedUrl, entryUrl, shellBridge],
  );

  const openInBrowser = useCallback(() => void Linking.openURL(restartUrl(loadedUrl, ORIGIN, entryUrl)), [loadedUrl, entryUrl]);

  useEffect(() => {
    if (chrome.phase !== 'loading') return undefined;
    const timer = setTimeout(() => dispatch({ type: 'timeout', loadId: chrome.loadId }), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [chrome.phase, chrome.loadId]);

  // Android hardware back follows the WebView history; at the root it returns false (Expo Go home).
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!shouldHandleBack(canGoBack.current, phase.current)) return false;
      webview.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, []);

  const copy = cardCopy(chrome.failure);

  return (
    <SafeAreaView style={styles.root}>
      <ShellWebView
        key={chrome.mountKey}
        ref={webview}
        source={{ uri: startUrl }}
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
        <OfflineCard title={copy.title} body={copy.body} onRetry={() => relaunch('retry')} onOpenBrowser={openInBrowser} />
      ) : null}
      {__DEV__ ? (
        <DevOverlay
          version={SHELL_VERSION}
          url={loadedUrl}
          forwardedErrors={forwardedErrors}
          bridgeHandshakes={bridgeHandshakes}
          session={sessionOffered === false ? (NATIVE_SESSION === null ? 'Sessão: não oferecida (build sem backend)' : 'Sessão: não oferecida (este WebView não informa o frame)') : sessionLine(sessionExpiresAt === null ? null : { expiresAt: sessionExpiresAt }, Date.now())}
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
