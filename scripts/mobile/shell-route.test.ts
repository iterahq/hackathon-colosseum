// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The route file is JSX and cannot be imported in plain Node, and `tsc` of the shell needs the shell's
// own install. This reads it as text and pins the wiring that the pure modules cannot prove: each
// WebView handler and flag the chrome depends on is present, once, with the name the
// react-native-webview 13.16.1 typings use.
const source = readFileSync(fileURLToPath(new URL('../../apps/mobile/app/[...path].tsx', import.meta.url)), 'utf8');
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const count = (re: RegExp) => (code.match(re) ?? []).length;

describe('route file wiring', () => {
  it.each([
    ['onLoadStart', /\bonLoadStart=\{onLoadStart\}/],
    ['onLoadEnd', /\bonLoadEnd=\{\(\) => dispatch\(\{ type: 'loadEnd' \}\)\}/],
    ['onError', /\bonError=\{\(e\) => dispatch\(\{ type: 'error', description: e\.nativeEvent\.description \}\)\}/],
    ['onHttpError (statusCode, no URL)', /\bonHttpError=\{\(e\) => dispatch\(\{ type: 'httpError', statusCode: e\.nativeEvent\.statusCode \}\)\}/],
    ['onContentProcessDidTerminate (iOS)', /\bonContentProcessDidTerminate=\{\(\) => relaunch\('processGone'\)\}/],
    ['onRenderProcessGone (Android)', /\bonRenderProcessGone=\{\(\) => relaunch\('processGone'\)\}/],
    ['onShouldStartLoadWithRequest', /\bonShouldStartLoadWithRequest=\{onShouldStart\}/],
    ['onMessage, once (the bridge is always on; the console shape inside is development only)', /\bonMessage=\{onMessage\}/],
    ['originWhitelist all', /\boriginWhitelist=\{\['\*'\]\}/],
    ['setSupportMultipleWindows off', /\bsetSupportMultipleWindows=\{false\}/],
  ])('%s', (_name, re) => {
    expect(count(re)).toBe(1);
  });

  it('injects the forwarder before content loads, main frame only (ADR-5), in development only', () => {
    expect(code).toMatch(/__DEV__ \? buildConsoleForwarder\(ORIGIN\) : undefined/);
    expect(count(/\binjectedJavaScriptBeforeContentLoaded=\{forwarder\}/)).toBe(1);
    expect(count(/\binjectedJavaScriptBeforeContentLoadedForMainFrameOnly=\{true\}/)).toBe(1);
    expect(count(/\binjectedJavaScriptForMainFrameOnly=\{true\}/)).toBe(1);
  });

  it('the message handler applies the native rate limit before parsing', () => {
    expect(code).toMatch(/admitMessage\(bucket\.current, Date\.now\(\)\)[\s\S]*parseConsoleMessage\(e\.nativeEvent, ORIGIN\)/);
  });

  it('keep-awake is per route over the bridge (R-8): no shell-level hook, released on unmount and on relaunch', () => {
    expect(count(/\buseKeepAwake\b/)).toBe(0);
    expect(code).toMatch(/from 'expo-keep-awake'/);
    expect(code).toMatch(/activate: \(tag: string\) => activateKeepAwakeAsync\(tag\)/);
    expect(code).toMatch(/deactivate: \(tag: string\) => deactivateKeepAwake\(tag\)/);
    expect(code).toMatch(/useEffect\(\(\) => \(\) => shellBridge\.reset\(\), \[shellBridge\]\);/);
    expect(code).toMatch(/canGoBack\.current = false;\s*shellBridge\.reset\(\);\s*setStartUrl\(/);
  });

  it('the launch gate (R-7): read in parallel with the WebView, the card replaces it only on update, re-read on foreground and on retry', () => {
    expect(count(/createLaunchGate\(ORIGIN, SHELL_VERSION, Platform\.OS\)/)).toBe(1);
    expect(code).toMatch(/gate\?\.kind === 'update'[\s\S]*<UpdateNowCard copy=\{updateCardCopy\(gate\)\} onRetry=\{refresh\} \/>/);
    expect(code).toMatch(/return <WebShell key=\{shellPath\} shellPath=\{shellPath\} \/>;/);
    expect(code).not.toMatch(/launch === null/);
    expect(code).toMatch(/AppState\.addEventListener\('change'[\s\S]*state === 'active' && LAUNCH\.peek\(\)\?\.gate\.kind === 'update'\) refresh\(\)/);
    expect(code).not.toMatch(/\bfetch\b/);
  });

  it('Android back follows canGoBack, is reset on every remount, and returns false at the root or on the card', () => {
    expect(code).toMatch(/BackHandler\.addEventListener\('hardwareBackPress'/);
    expect(code).toMatch(/if \(!shouldHandleBack\(canGoBack\.current, phase\.current\)\) return false;/);
    expect(code).toMatch(/canGoBack\.current = false;/);
    expect(code).toMatch(/canGoBack\.current = nav\.canGoBack;/);
  });

  it('both card buttons are wired to a handler', () => {
    expect(code).toMatch(/onRetry=\{\(\) => relaunch\('retry'\)\}/);
    expect(code).toMatch(/onOpenBrowser=\{openInBrowser\}/);
  });

  it('a blocked navigation shows the notice', () => {
    expect(code).toMatch(/noticeDue\(lastNotice\.current, Date\.now\(\)\)[\s\S]*Alert\.alert\(notice\)/);
  });

  it('the WebView is keyed by the chrome mount key', () => {
    expect(code).toMatch(/key=\{chrome\.mountKey\}/);
  });
});

describe('route file wiring: the bridge (R-6)', () => {
  it('the load start resets the bridge session, then dispatches the load state', () => {
    expect(code).toMatch(/const onLoadStart = useCallback\(\(\) => \{\s*shellBridge\.reset\(\);\s*dispatch\(\{ type: 'loadStart' \}\);\s*\}, \[shellBridge\]\);/);
  });

  it('onMessage reads the console shape first, then the bridge envelope, each once and through its own parser', () => {
    expect(count(/\bparseConsoleMessage\(e\.nativeEvent, ORIGIN\)/)).toBe(1);
    expect(count(/\bparseBridgeMessage\(e\.nativeEvent, ORIGIN\)/)).toBe(1);
    expect(code.indexOf('parseConsoleMessage(e.nativeEvent')).toBeLessThan(code.indexOf('parseBridgeMessage(e.nativeEvent'));
  });

  it('both parsers sit behind the one native rate window, and the console shape is development only', () => {
    expect(code).toMatch(/admitMessage\(bucket\.current, Date\.now\(\)\)[\s\S]*if \(__DEV__\) \{\s*const message = parseConsoleMessage\(e\.nativeEvent, ORIGIN\)[\s\S]*parseBridgeMessage\(e\.nativeEvent, ORIGIN\)/);
    expect(code).not.toMatch(/onMessage=\{__DEV__/);
  });

  it('a reply goes back through injectJavaScript of the WebView, and only a script from the router', () => {
    expect(count(/\binjectJavaScript\(/)).toBe(1);
    expect(code).toMatch(/if \(out\.script !== null\) webview\.current\?\.injectJavaScript\(out\.script\);/);
  });

  it('the router is created with the one configured origin and the shell version', () => {
    expect(code).toMatch(/createShellBridge\(\{ origin: ORIGIN, shellVersion: SHELL_VERSION, keepAwake: KEEP_AWAKE \}\)/);
  });
});

