/**
 * Provenance: devfellowship/dfl-lesson-studio, apps/ios/app/[...path].tsx, commit
 * e90a642c4f7a7f4b9651895270a3f489cffc84a7 (strip-down, not a copy; PLAN section 2.5).
 * Kept: the WebView props, `onShouldStart`, `onError`, `retry`.
 * Removed: `useKeepAwake` (PR-2), `useMobileUiPath` (`?ui=mobile`: one responsive tree here), the
 * bridge router and `onMessage`, `nativeSession`, `shellGate`, `onFileDownload`,
 * `mediaCapturePermissionGrantType`, `OfflineScreen`, `UpdateNowScreen`, `downloadName`, the native
 * route push, the web-bundle origin, the splash gate and the two-React throw.
 * Also changed: `setSupportMultipleWindows={false}` added (PLAN ADR-5); `onNavigationStateChange` now only
 * records the loaded URL for the overlay (LS used it to push native routes); `onLoadStart`/`onLoadEnd`
 * (bridge reset, splash) removed.
 * Added: the `DevOverlay` mount, and the Stripe origins (`BLOCKED_ORIGINS`, via the default of `blockedOrigins`) in `navigationDecision`.
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
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest, WebViewNavigation } from 'react-native-webview/lib/WebViewTypes';
import { DevOverlay } from '../src/DevOverlay';
import { navigationDecision, parseWebOrigin } from '../src/origin';
import { resolveShellPath } from '../src/routes';

const ORIGIN = parseWebOrigin(Constants.expoConfig?.extra?.webOrigin);
const SHELL_VERSION = Constants.expoConfig?.version ?? '0.0.0';
const BACKGROUND = '#0A0908';

// react-native-webview declares `class WebView<P = undefined>` in some releases. With that default
// the props type is `WebViewProps & undefined`, which is `never` (TS2769). Instantiate the class
// with no extra props, as the old default `P = {}` did.
const ShellWebView = WebView<object>;
type ShellWebView = InstanceType<typeof ShellWebView>;

export default function ShellRoute() {
  const { path } = useLocalSearchParams<{ path?: string[] }>();
  const shellPath = resolveShellPath((path ?? []).join('/'));
  return <WebShell shellPath={shellPath} />;
}

function WebShell({ shellPath }: { shellPath: string }) {
  const uri = ORIGIN + shellPath;
  const webview = useRef<ShellWebView>(null);
  const [loadedUrl, setLoadedUrl] = useState(uri);
  const [failure, setFailure] = useState<string | null>(null);

  const onShouldStart = useCallback((req: ShouldStartLoadRequest) => {
    const decision = navigationDecision(req.url, ORIGIN, req.isTopFrame);
    if (decision === 'external') void Linking.openURL(req.url);
    return decision === 'load';
  }, []);

  const onNavigationStateChange = useCallback((nav: WebViewNavigation) => setLoadedUrl(nav.url), []);

  const retry = useCallback(() => {
    setFailure(null);
    webview.current?.reload();
  }, []);

  return (
    <View style={styles.root}>
      <ShellWebView
        ref={webview}
        source={{ uri }}
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={onShouldStart}
        onNavigationStateChange={onNavigationStateChange}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsBackForwardNavigationGestures
        onError={(e) => setFailure(e.nativeEvent.description || 'A página não carregou.')}
        onContentProcessDidTerminate={() => webview.current?.reload()}
        renderError={() => <View />}
        style={styles.web}
        testID="shell-webview"
      />
      {__DEV__ ? <DevOverlay version={SHELL_VERSION} url={loadedUrl} failure={failure} onRetry={retry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BACKGROUND },
  // Dark before the page paints: no light frame between the launch screen and the app.
  web: { flex: 1, backgroundColor: BACKGROUND },
});
