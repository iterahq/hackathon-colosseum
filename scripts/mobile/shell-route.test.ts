// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The route file is JSX and cannot be imported in plain Node, and `tsc` of the shell needs the shell's
// own install. This reads it as text and pins the wiring that the pure modules cannot prove: each
// WebView handler and flag the chrome depends on is present, once, with the name the
// react-native-webview 13.16.1 typings use.
const source = readFileSync(fileURLToPath(new URL('../../apps/mobile/app/[...path].tsx', import.meta.url)), 'utf8');
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
// Global, so `toBe(1)` means exactly once (a non-global match returns one entry however often the text occurs).
const count = (re: RegExp) => (code.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)) ?? []).length;

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

  it('onMessage hands the whole nativeEvent to receiveShellMessage and stores both buckets from the answer (the order is tested in receiveShellMessage.test.ts)', () => {
    expect(count(/\breceiveShellMessage\(\{ event: e\.nativeEvent, raw: rawBucket\.current, page: bucket\.current, origin: ORIGIN, platform: Platform\.OS, dev: __DEV__, now: Date\.now\(\) \}\)/)).toBe(1);
    expect(code).toMatch(/rawBucket\.current = answer\.raw;\s*bucket\.current = answer\.page;\s*if \(answer\.kind === 'drop'\) return;/);
  });

  it('keep-awake is per route over the bridge (R-8): no shell-level hook, released on unmount and on relaunch', () => {
    expect(count(/\buseKeepAwake\b/)).toBe(0);
    expect(code).toMatch(/from 'expo-keep-awake'/);
    expect(code).toMatch(/activate: \(tag: string\) => activateKeepAwakeAsync\(tag\)/);
    expect(code).toMatch(/deactivate: \(tag: string\) => deactivateKeepAwake\(tag\)/);
    expect(code).toMatch(/useEffect\(\(\) => \(\) => shellBridge\.reset\(\), \[shellBridge\]\);/);
    expect(code).toMatch(/canGoBack\.current = false;\s*shellBridge\.reset\(\);\s*dispatch\(\{ type: event, url: restartUrl\(loadedUrl, ORIGIN, entryUrl\) \}\);/);
  });

  it('the start URL of the WebView is the reducer\'s: it moves only with the mount key, never from a state of the route', () => {
    expect(count(/\bsource=\{\{ uri: chrome\.startUrl \?\? entryUrl \}\}/)).toBe(1);
    expect(count(/\bsetStartUrl\b/)).toBe(0);
  });

  it('the launch gate (R-7): read in parallel with the WebView, the card replaces it only on update, re-read on foreground and on retry', () => {
    expect(count(/createLaunchGate\(ORIGIN, SHELL_VERSION, Platform\.OS\)/)).toBe(1);
    expect(code).toMatch(/gate\?\.kind === 'update'[\s\S]*<UpdateNowCard copy=\{updateCardCopy\(gate\)\} onRetry=\{refresh\} \/>/);
    expect(code).toMatch(/return <WebShell key=\{entryPath\} entryPath=\{entryPath\} \/>;/);
    expect(code).not.toMatch(/launch === null/);
    expect(code).toMatch(/AppState\.addEventListener\('change'[\s\S]*state === 'active' && LAUNCH\.peek\(\)\?\.gate\.kind === 'update'\) refresh\(\)/);
    expect(code).not.toMatch(/\bfetch\b/);
  });

  it('Android back follows canGoBack, is reset on every remount, and returns false at the root or on the card', () => {
    expect(code).toMatch(/BackHandler\.addEventListener\('hardwareBackPress'/);
    expect(code).toMatch(/decideBack\(\{ canGoBack: canGoBack\.current, phase: phase\.current, confirmOpen: backConfirmOpenRef\.current, confirmEnabled: BACK_CONFIRM, focused: focusedRef\.current \}\)/);
    expect(code).toMatch(/focusedRef\.current = useIsFocused\(\);/);
    expect(code).toMatch(/return action !== 'leave';/);
    expect(code).toMatch(/const BACK_CONFIRM = backConfirmEnabled\(Constants\.executionEnvironment\);/);
    expect(code).toMatch(/canGoBack\.current = false;/);
    expect(code).toMatch(/canGoBack\.current = nav\.canGoBack;/);
  });

  it('both card buttons are wired to a handler', () => {
    expect(code).toMatch(/onRetry=\{\(\) => relaunch\('retry'\)\}/);
    expect(code).toMatch(/onOpenBrowser=\{openInBrowser\}/);
  });

  it('both back-confirm buttons are wired to a handler', () => {
    expect(code).toMatch(/<BackConfirmCard onStay=\{\(\) => setBackConfirmOpen\(false\)\} onLeave=\{\(\) => BackHandler\.exitApp\(\)\} \/>/);
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

  it('nothing in the route reads the payload or calls a parser or a window: only receiveShellMessage sees nativeEvent.data', () => {
    expect(count(/\bnativeEvent\b/)).toBe(3);
    expect(count(/\.data\b/)).toBe(0);
    expect(count(/\b(?:parseConsoleMessage|parseBridgeMessage|readConsoleShape|readBridgeEnvelope|messageSize|admitRaw|admitMessage)\(/)).toBe(0);
    expect(code).not.toMatch(/onMessage=\{__DEV__/);
  });

  it('only two scripts enter the WebView, both built by the router: a reply, and the ask for the session (R-12)', () => {
    expect(count(/\binjectJavaScript\(/)).toBe(2);
    expect(code).toMatch(/if \(out\.script !== null\) webview\.current\?\.injectJavaScript\(out\.script\);/);
    expect(code).toMatch(/NATIVE_SESSION\?\.bindAsk\(\(forceRefresh\) => \{/);
    expect(code).toMatch(/const script = shellBridge\.askSession\(forceRefresh\);\s*if \(script === null \|\| webview\.current === null\) return false;\s*webview\.current\.injectJavaScript\(script\);/);
  });

  it('the router is created with the one configured origin, the shell version, the process-wide session and the random source', () => {
    expect(code).toMatch(/createShellBridge\(\{ origin: ORIGIN, shellVersion: SHELL_VERSION, keepAwake: KEEP_AWAKE, session: NATIVE_SESSION, random: RANDOM \}\)/);
  });
});

describe('route file wiring: auth.session (R-12)', () => {
  it('the session token of the router comes from expo-crypto, never Math.random', () => {
    expect(code).toMatch(/import \{ getRandomValues \} from 'expo-crypto';/);
    expect(code).toMatch(/const RANDOM = \(bytes: Uint8Array\) => getRandomValues\(bytes\);/);
    expect(count(/Math\.random/)).toBe(0);
  });

  it('one session per process, in memory: no storage module is imported by the shell', () => {
    expect(count(/createNativeSession\(/)).toBe(1);
    expect(code).toMatch(/^const NATIVE_SESSION = BACKEND === null \? null : createNativeSession\(\{ issuer: issuerOf\(BACKEND\.origin\) \}\);$/m);
    expect(code).not.toMatch(/secure-store|async-storage|AsyncStorage|expo-file-system|expo-sqlite/);
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../../apps/mobile/package.json', import.meta.url)), 'utf8')) as { dependencies: Record<string, string> };
    for (const name of Object.keys(pkg.dependencies)) expect(name).not.toMatch(/secure-store|async-storage|file-system|sqlite|mmkv|supabase/);
  });

  it('the backend is the two public variables and nothing else: no other env var is read by the shell', () => {
    expect(code).toMatch(/parseBackend\(process\.env\.EXPO_PUBLIC_SUPABASE_URL, process\.env\.EXPO_PUBLIC_SUPABASE_ANON_KEY\)/);
    expect((code.match(/process\.env\.\w+/g) ?? []).sort()).toEqual(['process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY', 'process.env.EXPO_PUBLIC_SUPABASE_URL']);
    expect(code).not.toMatch(/service_role|SERVICE_ROLE/);
    const shell = fileURLToPath(new URL('../../apps/mobile/', import.meta.url));
    const sources = ['app', 'src'].flatMap((dir) => readdirSync(path.join(shell, dir)).filter((f) => /\.tsx?$/.test(f) && !/\.(test|testkit)\.ts$/.test(f)).map((f) => path.join(shell, dir, f)));
    expect(sources.length).toBeGreaterThan(10);
    for (const file of sources) {
      if (file.endsWith('[...path].tsx')) continue;
      expect(readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''), file).not.toMatch(/process\.env|expoConfig\?\.extra\?\.(?!webOrigin)/);
    }
  });

  it('the probe runs in development only, once per session change, and a sign-out clears its answer without a request', () => {
    expect(count(/\bprobeIteraUser\(/)).toBe(1);
    expect(code).toMatch(
      /if \(!__DEV__ \|\| NATIVE_SESSION === null\) return undefined;\s*const native = NATIVE_SESSION\.session;\s*return native\.subscribe\(\(event\) => \{[\s\S]*if \(event\.type === 'signed-out'\) \{\s*setSessionExpiresAt\(null\);\s*setProbe\(\{ kind: 'no-session' \}\);\s*return;\s*\}[\s\S]*probeIteraUser\(BACKEND, \(\) => native\.getAccessToken\(\)\)/,
    );
    expect(code).toMatch(/if \(probeRun\.current === run\) setProbe\(result\);/);
  });

  it('the token never enters React state or a log: state holds the expiry only, and each console call prints a level or a reason', () => {
    expect(code).not.toMatch(/accessToken/);
    expect(code).toMatch(/setSessionExpiresAt\(event\.session\.expiresAt\);/);
    expect((code.match(/console\.\w+\([^\n]*/g) ?? []).sort()).toEqual([
      'console.warn(`[bridge] refused: ${out.refused}`);',
      'console.warn(`[web ${answer.message.level}] ${answer.message.text}`);',
    ]);
  });

  it('a build with no backend has no native session: nothing can hold a token whose issuer is unchecked', () => {
    expect(code).not.toMatch(/issuer: null/);
    expect(count(/NATIVE_SESSION\.(?!session;)/)).toBe(0);
  });

  it('back in the foreground the session is revalidated once: a listener, no interval', () => {
    expect(code).toMatch(/AppState\.addEventListener\('change', \(state\) => \{\s*if \(state === 'active'\) NATIVE_SESSION\?\.revalidate\(\);\s*\}\);/);
    expect(count(/\bsetInterval\b/)).toBe(0);
  });

  it('the overlay gets the session line and the probe line, never the snapshot', () => {
    expect(code).toMatch(/session=\{sessionStatusLine\(sessionOffered, NATIVE_SESSION !== null, sessionExpiresAt, Date\.now\(\)\)\}/);
    expect(code).toMatch(/backend=\{probeLine\(probe\)\}/);
  });
});

describe('DFL sign-in through the system auth session (R-20)', () => {
  it('opens the handoff URL as the page built it, with the one return link, behind a one-session guard', () => {
    expect(count(/WebBrowser\.openAuthSessionAsync\(handoffUrl, DFL_RETURN, \{ preferUniversalLinks: true \}\)/)).toBe(1);
    expect(count(/openAuthSessionAsync/)).toBe(1);
    expect(code).toMatch(/const ticket = DFL_SESSION\.tryEnter\(\);\s*if \(ticket === null\) \{[\s\S]*?Alert\.alert\(AUTH_BUSY_NOTICE\);/);
    expect(code).toMatch(/\.finally\(\(\) => \{\s*if \(DFL_SESSION\.leave\(ticket\)\) DFL_RETURNS\.end\(\);/);
  });

  it('loads the returned URL only after the pure validator, and only through the reducer', () => {
    expect(code).toMatch(/const returned = acceptAuthSessionReturn\(result, ORIGIN\);\s*if \(returned !== null && DFL_RETURNS\.arrive\('session'\) === 'load'\) onReturn\(returned\);/);
    expect(code).toMatch(/dispatch\(\{ type: 'load', url \}\)/);
  });

  it('Android: the router\'s copy and the session\'s copy of the return link go through one latch, so one of them loads', () => {
    expect(code).toMatch(/DFL_RETURNS\.arrive\('router'\) === 'duplicate'/);
    expect(code).toMatch(/DFL_RETURNS\.begin\(\);/);
  });

  it('the guard asks for the session in installed builds only and lists the dev origin in Expo Go only', () => {
    expect(code).toMatch(/const AUTH_SESSION = authSessionEnabled\(Constants\.executionEnvironment\);/);
    expect(code).toMatch(/__DEV__ && !AUTH_SESSION \? DEV_TOP_FRAME_ORIGINS : \[\], AUTH_SESSION\)/);
  });

  it('the returned URL (a bearer token) is never logged: no console call reads it, and the only console calls are the two known ones', () => {
    expect(count(/\bconsole\./)).toBe(2);
    expect(code).toMatch(/console\.warn\(`\[web \$\{answer\.message\.level\}\] \$\{answer\.message\.text\}`\)/);
    expect(code).toMatch(/console\.warn\(`\[bridge\] refused: \$\{out\.refused\}`\)/);
  });
});

