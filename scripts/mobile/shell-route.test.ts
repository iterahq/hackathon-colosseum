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
    ['onLoadStart', /\bonLoadStart=\{\(\) => dispatch\(\{ type: 'loadStart' \}\)\}/],
    ['onLoadEnd', /\bonLoadEnd=\{\(\) => dispatch\(\{ type: 'loadEnd' \}\)\}/],
    ['onError', /\bonError=\{\(e\) => dispatch\(\{ type: 'error', description: e\.nativeEvent\.description \}\)\}/],
    ['onHttpError (statusCode, no URL)', /\bonHttpError=\{\(e\) => dispatch\(\{ type: 'httpError', statusCode: e\.nativeEvent\.statusCode \}\)\}/],
    ['onContentProcessDidTerminate (iOS)', /\bonContentProcessDidTerminate=\{\(\) => relaunch\('processGone'\)\}/],
    ['onRenderProcessGone (Android)', /\bonRenderProcessGone=\{\(\) => relaunch\('processGone'\)\}/],
    ['onShouldStartLoadWithRequest', /\bonShouldStartLoadWithRequest=\{onShouldStart\}/],
    ['onMessage, once, development only', /\bonMessage=\{__DEV__ \? onMessage : undefined\}/],
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

  it('keeps the screen awake while the WebView is mounted', () => {
    expect(count(/\buseKeepAwake\(\)/)).toBe(1);
    expect(code).toMatch(/from 'expo-keep-awake'/);
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
