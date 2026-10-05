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
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Linking, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview/lib/WebViewTypes';
import { createShellBridge, parseBridgeMessage } from '../src/bridgeMessage';
import { admitMessage, buildConsoleForwarder, parseConsoleMessage, type MessageBucket } from '../src/consoleMessage';
import { DevOverlay } from '../src/DevOverlay';
import { createKeepAwakeClaims } from '../src/keepAwakeHolder';
import { LoadingVeil } from '../src/LoadingVeil';
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
  const shellBridge = useMemo(() => createShellBridge({ origin: ORIGIN, shellVersion: SHELL_VERSION, keepAwake: KEEP_AWAKE }), []);
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
  // One router behind one native rate window: the console shape first (development only), then the
  // bridge envelope; anything else is dropped.
  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      const admission = admitMessage(bucket.current, Date.now());
      bucket.current = admission.bucket;
      if (!admission.admitted) return;
      if (__DEV__) {
        const message = parseConsoleMessage(e.nativeEvent, ORIGIN);
        if (message !== null) {
          setForwardedErrors((n) => n + 1);
          console.warn(`[web ${message.level}] ${message.text}`);
          return;
        }
      }
      const bridgeMessage = parseBridgeMessage(e.nativeEvent, ORIGIN);
      if (bridgeMessage === null) return;
      void shellBridge.handle(bridgeMessage).then((out) => {
        if (out.script !== null) webview.current?.injectJavaScript(out.script);
        if (out.handshake) setBridgeHandshakes((n) => n + 1);
        if (__DEV__ && out.refused !== null) console.warn(`[bridge] refused: ${out.refused}`);
      });
    },
    [shellBridge],
  );

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
      {__DEV__ ? <DevOverlay version={SHELL_VERSION} url={loadedUrl} forwardedErrors={forwardedErrors} bridgeHandshakes={bridgeHandshakes} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BACKGROUND },
  // Dark before the page paints: no light frame between the launch screen and the app.
  web: { flex: 1, backgroundColor: BACKGROUND },
});
