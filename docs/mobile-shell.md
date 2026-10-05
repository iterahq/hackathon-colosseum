# Mobile shell (`apps/mobile`)

The phone shell of the Itera player: Expo Router 57 with one catch-all route that opens `https://app.iterahq.dev` in a WebView. It runs in stock Expo Go (no custom native module). It has its own `package.json` and lockfile and is not a root npm workspace.

Plan: <https://plans.devfellowship.com/20261003-itera-player-mobile>. This file is the working record of the weekend floor (PR-1, PR-2). A row with no value here is a row that has not run.

## Measurements

Each row: the plan row, the value, the date (UTC). A row says "not run" when it has not run, with the reason.

| Row | Question | Value | Date |
|---|---|---|---|
| 0.4 | At least 4 GB free on `/home` for one Expo tree? | not run: human gate S0 not answered. Free disk is 2.2 GB at the start of PR-1 work and 1.8 GB after the `npm install --package-lock-only` attempts (npm metadata cache). Nothing was deleted. | 2026-10-04 |
| 0.5 | Does Expo Go ship SDK 57? | yes: `expoGoSdkVersion` is `57.0.0` (`https://api.expo.dev/v2/versions/latest`) | 2026-10-04 18:55 |
| 0.7 | `npm ci` with strict peers; `expo-doctor` on Node 20 and 22; is `@expo/metro-runtime` required? | **partial.** Lockfile: `npx --yes npm@11 install --package-lock-only --ignore-scripts` in `apps/mobile` succeeded (lockfileVersion 3, 593 packages, no `node_modules` of packages written; peer warnings only, e.g. optional `react-native-worklets`). npm 10.9.7 had crashed twice (text below). `npm ci` itself, `expo-doctor`: not run (no install, row 0.4). `@expo/metro-runtime`: declared explicitly, as the LS shell does; `expo-router` already lists it as a dependency and a peer, so it is not removable until row 0.7 is measured. | 2026-10-04 |
| 0.9 | Metro first bundle, rebundle, RSS | not run: needs `apps/mobile/node_modules` (row 0.4) | — |
| 0.11 | Does `https://app.iterahq.dev/login` answer 200 with the app? | yes: HTTP 200, title "Itera \| Microlearning com IA" | 2026-10-04 18:55 |
| 0.24 | `mobile-shell` run <= 10 min, runner disk >= 3 GB? | not run: the value comes from the first `mobile-shell` run of PR-2 (job time and the `df -h` line of the disk guard). Not measured here. | — |
| 0.23 | PR-1 path diff has no web file | see the PR body (pasted output of `git diff --name-only --no-renames origin/main...HEAD`) | 2026-10-04 |

Row 0.7, npm 10.9.7, verbatim, run 1 (versions pinned as in `apps/mobile/package.json` of that moment, no `react-dom`):

```
npm warn ERESOLVE overriding peer dependency
npm error Cannot read properties of null (reading 'edgesOut')
```

The debug log names the conflict: `react-dom@19.3.0` (pulled as a peer by `expo-router`'s dependencies) wants `react@^19.3.0`, while the shell pins `react@19.2.3`. Expo SDK 57 bundles `react-dom` 19.2.3 (`bundledNativeModules.json` of `expo@57.0.26`), so `react-dom` `19.2.3` was added to `dependencies`.

Row 0.7, verbatim, run 2 (with `react-dom` `19.2.3`):

```
npm error Cannot read properties of null (reading 'edgesOut')
```

Stack: `#loadPeerSet` in `@npmcli/arborist/lib/arborist/build-ideal-tree.js:1289`, while placing `node_modules/vitest`. This is an npm 10.9.7 resolver crash, not a peer conflict message. The lockfile was then produced with npm 11 in one attempt (row above). The CI job runs Node 20 (npm 10), so `npm ci` there still needs a first green run to confirm npm 10 reads an npm-11 lockfile; `legacy-peer-deps` was not used.

## Runbook

All times are the estimates of the plan. Steps S0 to S11 are in order; only Samuel does them.

| # | Row | What |
|---|---|---|
| S0 | 0.4 | `git -C /home/samuel/itera-player worktree list`; name what may be reclaimed (4 GB needed). Confirm whether `vps-triage` may remove `~/.npm/_cacache` and the Playwright browsers. |
| S1 | 0.1 | On a desktop, log in at `https://app.iterahq.dev` with the account the phone will use; open one lesson. Write down account, lesson id, tenant. |
| S2 | 0.2 | Ask Sabrina's channel for her phone model and the account she uses. |
| S3 | 0.3 | Run `apps/mobile/scripts/metro-firewall.sh` (sudo). Then, from the phone on mobile data (Wi-Fi and Tailscale off), open `http://178.156.191.231:8091` and `http://[2a01:4ff:f0:fb70::1]:8091`: both must time out. |
| S4 | 0.6 | Create or pick the Expo account; `npx expo login` in the worktree (mandatory for iOS); install Expo Go and Tailscale on the phone; join the tailnet; report device, OS and band. |
| S5 | 0.8 | The executor starts Metro with `apps/mobile/scripts/start-metro.sh`. Android: Expo Go, "Enter URL manually", `exp://100.69.123.19:8091`. iOS: Expo Go (same account as the CLI), Development servers, or scan the terminal QR with the Camera app. Repeat both outside probes of S3 while Metro runs. Report: loads or not. |
| S6 | 0.12, 0.13, 0.15, 0.16, 0.19 | `/login` screenshot with the overlay; log in; kill and reopen; try "Sign in with DFL" and read the hosts from the overlay; play the mixed lesson; type in a text activity; use back. Report each yes or no. |
| S7 | G5 | Note the entry asset hash of production (baseline 2026-10-03: `index-fPKZHRK5.js`). After the review verdict, merge PR-1; open production as a fresh user (0 console errors, lands on `/login`, same entry asset hash); reopen the shell. |
| S8 | — | Tell the executor to start PR-2. |
| S9 | PR-2 | On the PR-2 branch bundle, record the floor journey and take the 5 screenshots. |
| S10 | G5, G6 | After the reviewer confirms the screenshots, merge PR-2; post-deploy check. |
| S11 | — | Sunday-night message in `#core-daily-updates`. |

Box addresses (private repo): tailnet `100.69.123.19`; public IPv4 `178.156.191.231`; public IPv6 `2a01:4ff:f0:fb70::1`.

Metro:

- The only start path is `apps/mobile/scripts/start-metro.sh`. It exits 1 unless the four checks pass (`iptables -C INPUT -p tcp --dport 8091 -j METRO-8091`, `iptables -C METRO-8091 -j DROP`, and the same two with `ip6tables`). The checks need root: the script uses `sudo -n` when it is not root, and fails closed when sudo would ask for a password.
- Then it starts Expo on port 8091 with `--go` (Expo Go; see "EAS builds": `expo-dev-client` makes `expo start` default to a development build), the packager host set to the tailnet address and `--host lan`, and prints `ss -ltn` for the port (expected `*:8091`, or `0.0.0.0:8091` and `[::]:8091`).
- Never run `expo start` directly. Never use `--tunnel`: a tunnel is a public URL and ADR-12 forbids it. Row 0.8 "no" means no shell evidence this weekend.
- A reviewer session runs only while Metro is stopped (`ss -ltn | grep 8091` is empty).

## Chrome states (PR-2)

The shell draws only states that exist before the web document does (PLAN section 4.1, ADR-6). The load logic is one pure reducer, `apps/mobile/src/shellChromeState.ts`; `LoadingVeil.tsx` and `OfflineCard.tsx` only draw what it says. Strings are pt-BR.

| State | Shown | Event | Unit test (`apps/mobile/src/shellChromeState.test.ts`) |
|---|---|---|---|
| Loading | veil, monogram, thin top bar; 150 ms fade out | `onLoadStart`, `onLoadEnd` | "loading veil" |
| Load failure | card "Não foi possível abrir a Itera" | `onError`, or `onHttpError` with `statusCode >= 400` (no URL comparison), or 15 s without a finished load | "load failure card", "15 s timeout" |
| No network at start | same card, title "Sem conexão" | `onError` whose description names an offline error (`ERR_INTERNET_DISCONNECTED`, "appears to be offline") | "load failure card" |
| Retry | veil again, WebView re-created on the page it was on | "Tentar de novo" | "retry" |
| Open in browser | system browser on the same page | "Abrir no navegador" | `restartUrl` |
| Process death | veil, WebView re-created; the card after 3 deaths in a row | `onContentProcessDidTerminate` (iOS), `onRenderProcessGone` (Android) | "process death" |
| Back | Android hardware back goes back while the WebView can; at the root it returns false | `BackHandler` + `canGoBack` | wiring test `scripts/mobile/shell-route.test.ts`; phone row 0.19 |
| Blocked navigation | `Alert` "Indisponível no app" (top-frame refusals only: Stripe, custom schemes, `blob:`, `data:`) | `navigationDecision` answers `block` | "blocked-navigation notice" |
| Screen stays on | no dimming during `/lesson/:lessonId` and `/live/*` only | the `keepAwake` bridge capability (R-8; `expo-keep-awake` `~57.0.2`, from `bundledNativeModules.json` of `expo@57.0.26`) | `apps/mobile/src/keepAwakeHolder.test.ts`, `apps/mobile/src/bridgeMessage.test.ts` |
| Safe areas | insets painted `#0A0908` | `SafeAreaView` | phone screenshot |
| Dev overlay (`__DEV__`) | shell version, loaded URL, count of forwarded errors, count of bridge handshakes | `onMessage` through `parseConsoleMessage` and `parseBridgeMessage` | `apps/mobile/src/consoleMessage.test.ts` |

Both Retry and a process death create a new WebView (a React `key`) instead of calling `reload()`: a dead Android renderer cannot be reloaded, and one path then serves every failure. `onHttpError` fires for the main frame only on both platforms (`RNCWebViewImpl.m` `forMainFrame` at v13.16.1; `RNCWebViewClient.java:267`), so a failing API call or image never shows the card. Not measured on a phone: whether the airplane-mode description matches the offline pattern (a miss shows the generic card, never nothing).

## Console forwarder (ADR-5 "Consequence")

`apps/mobile/src/consoleForwarder.injected.ts` is a script string injected with `injectedJavaScriptBeforeContentLoaded` plus `injectedJavaScriptBeforeContentLoadedForMainFrameOnly={true}` and `injectedJavaScriptForMainFrameOnly={true}`, so boot errors are counted. `apps/mobile/src/consoleMessage.ts` fills in the origin (`buildConsoleForwarder`) and holds the one parser, `parseConsoleMessage`. Each constraint is tested in `consoleMessage.test.ts` by running the built script in a bare sandbox:

| Constraint | Where |
|---|---|
| Attaches only when `location.origin` is the app origin | the script's first check |
| Redacts `(access\|refresh\|dfl)_token` and api-key values, bearer tokens, JWT-shaped and `sb_publishable_`/`sb_secret_` strings, e-mail addresses, before posting | the script's `redact`, again in `redactSecrets` of the parser |
| `onMessage` drops a message whose frame URL is not on the app origin, or that is not `{type:'console', level, text}` | `parseConsoleMessage` |
| Size: text cut to 500 characters, a message over 4096 characters dropped | script and parser |
| Rate: at most 5 messages per second and 50 per page load in the page; at most 10 per second natively | the script; `admitMessage` |
| Development only: in a release build the script is not injected and `onMessage` is not set | the route file (`__DEV__`) |
| Forwards only `console.error`, uncaught errors and unhandled rejections | the script |

## Bridge v1 (R-6, ADR-9)

`packages/bridge` (`@iterahq/shell-bridge`, private, source-only, no `build` script) is a pinned copy of the Lesson Studio bridge. `packages/bridge/PROVENANCE.md` lists the upstream commit, every file copied byte for byte, every line changed and every file not taken (`UPDATE_URL_HOSTS` is upstream's list; the one behavioural patch is the late-HelloAck fix in `client.ts`). `packages/bridge/contracts/shells/<version>.json` is one file per supported shell version; the shell's `expo.version` must have one (a unit test), and `packages/bridge/src/contract.test.ts` runs the current web client against each file.

| Piece | Where |
|---|---|
| Web client, the only reader of the shell channel besides the package | `src/lib/shellBridge.ts`; `<ShellBridgeMount />` (one line in `src/App.tsx`, next to `EmbedBridgeMount`) calls `startShellBridge()` after mount, never as an import side effect |
| Detection of the shell | the handshake itself (`HelloAck`); no user-agent test, no `?ui=` switch. In a browser tab `domTransport()` is null and the mode is `no_shell`: no listener, no post, no console line, no request, no DOM change (`src/lib/shellBridge.test.ts`) |
| Umami | after `HelloAck`, `setUmamiProperty('shell', <version>)` in `src/lib/analytics.ts` calls `umami.identify({ shell })` (on the tracker's `load` when the script is not there yet) |
| Shell parser and router | `apps/mobile/src/bridgeMessage.ts`: `parseBridgeMessage` (frame origin from the event URL, string, size cap, envelope shape) and `createShellBridge` (the package's `createShellRouter`: handshake session, replay, method, capability, payload schema) |
| Shell wiring | `apps/mobile/app/[...path].tsx`: `onMessage` is always on; one native rate window (`admitMessage`) covers both parsers; the console shape (the forwarder, `__DEV__` only) is read first, then the bridge envelope; a reply returns through `injectJavaScript` and posts to the app origin only; `onLoadStart` resets the handshake |
| Lint | `eslint.config.js`: `no-restricted-syntax` forbids `.userAgent`, `.userAgentData`, `ReactNativeWebView` and `.messageHandlers` outside `packages/bridge/**` and tests; `packages/bridge/src/shellDetectLint.test.ts` runs the real config |

v1 capabilities: `shell.version` and `keepAwake` (R-8); shell 0.3.0 adds `auth.session` (R-12, section below; this paragraph describes 0.2.0). A method of the protocol without a handler (`link.open`, `haptics`, ...) answers `capability_absent`; no navigation command, no file access. Shell version: `0.2.0` (`expo.version`, raised by R-8 because `keepAwake` is a new capability; contract file `packages/bridge/contracts/shells/0.2.0.json`; builds of PR-1, PR-2 and R-6 report 0.1.0 and the web never asks them for `keepAwake`; PR-1 and PR-2 builds answer no bridge message, so the web handshake times out and the page runs as in a browser; the dev overlay's handshake count tells them apart). Known limits: on Android System WebView older than 73 every frame is reported with the top-frame URL, so a cross-origin frame passes the origin gate there and can replace the handshake session (which releases the screen lock and makes the page's later calls `bad_session`) or provoke refusals (it cannot read a reply); a same-origin sub-frame cannot be told from the top frame by URL; the session token is `Math.random`-based and the replay window is 1024 ids (upstream); the native gate parses each envelope twice; a shell `reset()` that does not replace the page (a top-frame load that starts and never commits) releases the lock and the page does not re-ask until the route changes (fails safe: the screen dims). R-12 (`auth.session`) owns the first three; what it did with each is in "Session handoff" below.

Metro reaches the package by name through `apps/mobile/metro.config.js` (`watchFolders` and `resolver.extraNodeModules`; hierarchical lookup stays on because expo-doctor rejects the alternative, and it is safe because `packages/bridge/src` imports no bare module, so the root React 18 is unreachable, ADR-2; `check:one-react` backs it) and `tsconfig.json` `paths`; the shell's `package.json` and lockfile are untouched. R-11 replaces this with the `file:` link of section 2.3.

## Route map vocabulary

`apps/mobile/route-map.json` uses the key names of the Lesson Studio map (`map.yaml` in `dfl-loops`), plus three keys that are new here.

| Key | Meaning | LS |
|---|---|---|
| `version` | schema version, 1 | same |
| `routes[].path` | route pattern of `src/App.tsx`, composed with its parents | same |
| `routes[].screen` | a name for the screen | same |
| `routes[].mode` | `webview` (the only mode this shell opens) or `native` | same |
| `routes[].universal` | the route renders from one shared screen package (`packages/screens/src/<screen>/`). True for one row since R-11: `*`, the not-found screen | same |
| `routes[].web_paths` | the web page file(s) of the route; the one-copy test checks them against `src/App.tsx` | new |
| `shell_chrome[]` | the closed list of shell `.tsx` files that are chrome | new |
| `dom_zones[]` | `{id, reason, paths, kinds}`: routes and activity kinds that stay in the DOM | new (`paths`, `kinds`) |
| `not_counted_routes[]` | `{path, reason}`: `/prototipo/cena`. `*` was here until R-11; it is a `routes[]` row now, because rule 2 needs a route that owns the screen's folder | same |

The route meter (printed by the one-copy test) is 14, the routes still to port: 32 paths in `src/App.tsx`, minus 14 staff, minus 1 not counted, minus 2 learner DOM zones = 15 rows, minus the 1 that is universal (`*`). A port moves it down by one.

## One-copy rules

`scripts/mobile/one-copy.test.ts` runs in the `build-test` job. The rules live in `scripts/mobile/oneCopyRules.ts`; each rule has a negative fixture in the test. A PR that touches `apps/mobile/route-map.json` needs Tainan's review (CODEOWNERS is a record, not a gate).

1. Every `.tsx` under `apps/mobile/` is in `shell_chrome`, or is a route file of at most 15 lines that only renders an export of `@iterahq/screens`. From R-11 such a file imports the screen by its own entry (`@iterahq/screens/<screen>`), `react`, `expo-router`, and `apps/mobile/src/screenPorts.ts` — nothing else.
1b. `shell_chrome` equals a closed list asserted in the test. A chrome file imports nothing from `@iterahq/*` (except the bare `@iterahq/shell-bridge`, R-6, and the bare `@iterahq/shell-core`, R-11; the bridge's `/web` entry stays forbidden, and `@iterahq/screens` is admitted only in a thin route file of rule 1), `@supabase/*`, `@tanstack/*`, `react-router*`, and no file under `apps/mobile/app` or `apps/mobile/src` contains `fetch(` except `apps/mobile/src/shellGate.ts` and, from R-12, `apps/mobile/src/backendProbe.ts` (exactly one `fetch(`, and no host written in the file: its host is the origin it is given).
1c. A chrome file references no `XMLHttpRequest`, `WebSocket` or `expo/fetch`, and reads `onMessage` data only through `parseConsoleMessage` (the forwarder's `{type:'console', …}` shape) or `parseBridgeMessage` (a bridge envelope that passed the native gate; R-6); the single `onMessage` handler lives in `apps/mobile/app/[...path].tsx`.
2. Every file under `packages/screens/src/` belongs to exactly one route's universal path.
2b. No `*.{native,web,ios,android}.tsx` under `packages/screens/src` except under a `**/slots/` directory; a slot file has no default export.
2c. `Platform.OS` and `Platform.select` appear under `packages/screens/src` only inside `**/slots/`.
3. A route with `universal: true` has none of its `web_paths` on disk.
3b. `web_paths` is checked, not declared: for every route outside the staff zone, the page component of its `element=` in `src/App.tsx` (the innermost non-wrapper JSX element; wrappers `RequireAuth`, `RequireSubscription`, `RequireRole`, `LazyRoute`, `Suspense`; `lazy(() => import(x))` resolves to `x`) must be in `web_paths`; `web_paths` is non-empty while `universal: false`.
3c. (R-11) The web host of a universal route — the file its `element=` resolves to under `src/` — has at most 15 lines, imports the screen from `@iterahq/screens`, and has no lowercase JSX host tag.
4. `mode: native` requires `universal: true`.
5. The frozen manifest `e2e/support/capture-manifest.json` (32 routes) is the primary source: every route of it has a row in the map. A secondary scan of `src/App.tsx` composes every `path` with its parent, asserts it found 32 paths, and reports any path missing from the manifest.
6. `apps/mobile/**` and `packages/{bridge,core,screens}/**` import nothing from `src/`, `@/`, `react-dom`; `apps/mobile` and `packages/screens` have no lowercase JSX host tag and no DOM global, except files named `*.injected.ts` that export only strings; `packages/{bridge,core}` import no `react`. From R-11: `packages/core` imports no package at all; a file of `packages/screens/src` imports by name only `react`, `react/jsx-runtime`, `react-native`, `uniwind` and `@iterahq/shell-core` (a platform file of a slot, `slots/x.web.tsx`, is exempt), and neither package imports from `apps/`.
7. No basename under `apps/mobile/src` or `packages/screens/src` equals one under `src/pages`, `src/components` or `packages/activities/src`. From R-11: and no file under `apps/mobile/{app,src}` has the basename of a file of `packages/screens/src`.

Residual: the closed chrome list is edited in the same PR that adds a chrome file, so whether a new file on that list is chrome or a copy is decided by the reviewer, not by CI.

## Known gaps

- Analytics: the Umami property `shell=<version>` is set after `HelloAck` (R-6); sessions of the weekend shell (0.1.0) answer no handshake and still look like mobile web.
- Stripe (`checkout.stripe.com`, `billing.stripe.com`) is blocked: never loaded, never opened in the system browser, Expo Go included (ADR-5, Q-3). A blocked top-frame navigation shows the notice "Indisponível no app" (PR-2); in Expo Go the web's subscribe button therefore answers with that notice.
- "Sign in with DFL": no DFL host loads in the WebView. Until R-20 the handoff URL takes the default path (system browser, no way back); the shell login is email or code.
- The chrome states, the console forwarder and keep-awake are in PR-2 (sections above). None of them has run on a phone yet: the recording and the screenshots of S9 are Samuel's.
- `tsc` of the shell (the three `.tsx` chrome files and the route file), `expo-doctor`, `expo export`, `check:one-react` need `apps/mobile/node_modules` and have not run on this box (row 0.4); `mobile-shell` runs them on the runner. The shell's pure `.ts` files and their tests do run: root Vitest with `apps/mobile/vitest.config.ts` (move `apps/mobile/tsconfig.json` aside, it extends `expo/tsconfig.base`).
- Rule 2 is read as: a file under `packages/screens/src/<dir>/` belongs to the one universal route whose `screen` equals `<dir>`; `packages/screens/src/index.ts` (the barrel) is exempt, and so is any `index` file in rule 7. For a `universal: true` route, rule 3b skips the page resolution (its `web_paths` are the deleted pages, rule 3). ADR-8 does not say this yet. No such package exists yet.
- Rules 1b and 1c apply to every `.ts`, `.tsx`, `.js` and `.jsx` file under `apps/mobile/app` and `apps/mobile/src`, not only to chrome. `.js`/`.jsx` there are refused; `nativeEvent` is read only as `parseConsoleMessage(e.nativeEvent, ...)` (a pure parser in `apps/mobile/src/consoleMessage.ts` with its own test) or `parseBridgeMessage(e.nativeEvent, ...)` (R-6, `apps/mobile/src/bridgeMessage.ts` with its own test), plus `.nativeEvent.description` and `.nativeEvent.statusCode` of the error events.

## EAS builds (R-2; R-3 and R-4 prepared, none run)

EAS project `@iterahq/itera-player` (Expo org `iterahq`, id `14894fdb-316a-4b24-a12b-ac3106ee9d6d`, created with `eas init` and the org robot token; the id is not a secret). Bundle id and Android package: `com.tainanfidelis.iterahq` (Q-2; the Android package is the same id until Tainan says otherwise). Apple app record: Apple ID `6819303533`, SKU `iterahq-ios`.

Files: `apps/mobile/app.json` (owner, ids, `runtimeVersion` policy `fingerprint`, `updates.url`, icon, splash, `ITSAppUsesNonExemptEncryption: false`, no usage string and no associated domain: the shell uses no camera, microphone or location, and R-5 owns deep links), `apps/mobile/eas.json` (profiles `development`, `preview`, `production`; `appVersionSource: remote`, so EAS numbers builds and `app.json` carries no `buildNumber` or `versionCode`; Node `20.19.4`, the major `mobile-shell.yml` runs), `.github/workflows/mobile-eas.yml`, `apps/mobile/scripts/eas-build-counter.mjs` (+ `scripts/mobile/eas-build-counter.test.ts`), `apps/mobile/scripts/make-icons.py` (draws `apps/mobile/assets/*.png` from the geometry and colours of `public/favicon.svg`: the web repo has no square 1024 px source).

| Profile | Does | Used by |
|---|---|---|
| `development` | dev client, internal distribution, Android `apk` | a development build, when one is wanted (iOS needs registered devices and an ad-hoc profile: not set up) |
| `preview` | Android `apk`, internal distribution, channel `preview` | R-3, the APK link |
| `production` | store distribution, `autoIncrement`, channel `production`; iOS for TestFlight, Android `app-bundle` | R-4; Android only when the Play track is set up |

### Expo Go still works

- `expo-dev-client` is installed. Its config plugin only runs at prebuild, so Expo Go ignores it. But the Expo CLI defaults `expo start` to the development-build target when this package is a direct dependency (`node_modules/@expo/cli/build/src/start/resolveOptions.js`: `isAutoDevClient`): the QR and URL would use the app scheme and Expo Go would not be offered. `scripts/start-metro.sh` therefore passes `--go`. Anyone starting Expo by hand must pass `--go` too (`--dev-client` is the opposite flag).
- The plugin is declared with `addGeneratedScheme: false`, so a store build does not claim the extra `exp+itera` scheme.
- `expo-updates` is a native module that Expo Go already ships; the app imports nothing from it. In Expo Go the `updates` and `runtimeVersion` fields are not used for loading. The Expo Go manifest handler does ask `expo-updates` for the runtime version on each manifest request; with the `fingerprint` policy that is a fingerprint of the project (measured here: 5.7 s and 136 MB RSS on iOS, 5.0 s and 130 MB on Android, one process, no Metro). A first connection is that much slower.
- Not verified on a phone: that the owner's Expo Go session still opens after this change.

### Back-confirm card (R-2)

`src/backConfirm.ts` (pure, tested) decides each Android hardware back press: close an open card; go back in the page while it can (never from the failure card); at the root, open the card ("Sair do Itera?", "Continuar no app" / "Sair"). The card is on in an installed build and a development build, off in Expo Go (`Constants.executionEnvironment === 'storeClient'`), where the press still returns to the Expo Go home. "Sair" calls `BackHandler.exitApp()`. iOS has no hardware back.

### First builds (run by the owner; nothing here has run)

Secrets in the repo (Settings, Secrets and variables, Actions): `ASC_API_KEY_P8`, `ASC_API_KEY_ID`, `ASC_API_ISSUER_ID` exist (2026-10-05). `EXPO_TOKEN` does not: it is the robot token of the Expo org `iterahq`, from Samuel's Infisical vault ("Expo Go Cli Samuel"). Add it first. Counter: each platform is held at 12 of the 15 a month of the Free plan (`EAS_BUILD_MAX` in the workflow); a run above the hold fails before any build starts.

1. Android APK (R-3): Actions, `mobile-eas`, Run workflow on `main` with `platform=android`, `profile=preview`. Or `gh workflow run mobile-eas.yml --ref main -f platform=android -f profile=preview`. Consumes one Android build of the org (the first keystore is generated by EAS and stored in its credentials). The run prints the build page, `https://expo.dev/accounts/iterahq/projects/itera-player/builds/<id>`; the build takes about 10 to 30 minutes on EAS, not on the runner. Once it is finished, the page has the install link and a QR.
2. TestFlight (R-4): `platform=ios`, `profile=production`. Consumes one iOS build. When the build page says "finished", run again with `submit_build_id=<that id>` (and `platform=ios profile=production`): the submit job sends it to App Store Connect (app `6819303533`, key from the repo secrets). It builds nothing and spends no build.
3. `platform=ios profile=preview` is refused on purpose. `dry_run=true` only reads the counter.

Installing: Android tester opens the link on the phone, allows installs from the browser once, installs the APK (signed with the keystore EAS holds; it does not come from Play). iOS tester: a TestFlight invite, then the TestFlight app.

Still manual, and who can do it:

- Apple (Tainan: the Apple account and the team are his): confirm the team id in `eas.json` (`P7WN2R8S4C`, copied from the Lesson Studio shell, same team key); the first iOS build asks EAS for a distribution certificate and provisioning profile through the API key, which has not been tried for this app; if EAS refuses in non-interactive mode, someone with the Apple login runs `eas credentials` once. App Store Connect: add the testers to the internal group, answer the export-compliance and privacy questions of the app record, and screenshots and the review for anything beyond internal TestFlight (R-14). Samuel has an iPhone, Windows and Linux and no Mac, so he can install from TestFlight but not do the Mac-only steps.
- Play Console (Tainan): the app record, the Play service account and the first upload to the internal track are not done; R-3 stops at the APK link.
- Supabase: the build carries no `EXPO_PUBLIC_SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the anon key is not in this repo). The `auth.session` capability is then not registered, by design (ADR-10): the first builds open the web app and have no native session. Putting the two public values in the `env` of a profile in `eas.json` is the owner's decision.

## Monday checklist

R-1 accounts; R-2 EAS and dev client; R-3 Android first; R-4 iOS TestFlight; R-5 deep links; R-6 bridge v1; R-7 `shell-config.json` and update screen; R-8 keep-awake over the bridge; R-9 React 19 measurement branch; R-10 widen the `@iterahq/activities` peer; R-11 `packages/core`, `packages/screens`, Metro settings; R-12 `auth.session`; R-13a `catalog-watch.yml`; R-13 port `/catalog`; R-14 store readiness; R-15 simulator journeys; R-16 fold `apps/mobile` into the root workspaces; R-17 React 19 on the web; R-18 Tailwind 4 and Uniwind; R-19 job-level path filter in `ci.yml`; R-20 DFL sign-in through the system auth session; R-21 route map source in `dfl-loops`. Details are in section 12 of the plan.

### Keep awake (R-8)

The screen stays on during `/lesson/:lessonId` and `/live/*` only. The one call site is `KeepAwakeRouteMount` (`src/lib/shellKeepAwake.ts`), mounted beside `ShellBridgeMount`: it calls `keepAwake {on: true}` when the router enters one of those routes and `{on: false}` when it leaves or unmounts. In a browser tab the handshake settles at `no_shell` and nothing is sent; the Screen Wake Lock API is out of scope. In the shell, `apps/mobile/src/keepAwakeHolder.ts` holds the lock under one tag (`expo-keep-awake`) and one registry holds the one platform lock per process and each mounted WebView holds its own claim, so a hidden WebView's release never drops another's claim. `bridge.reset()` releases the claim: on each accepted `hello` (a new session never inherits a lock), on each top-frame load start, on WebView relaunch (Retry, process death) and on unmount. The payload is `{on: boolean}` and nothing else; any other shape is `bad_payload`. `useKeepAwake()` of PR-2 is gone.

### Launch gate and `shell-config.json` (R-7)

`public/shell-config.json` is served by the web deploy at `<webOrigin>/shell-config.json` with `Cache-Control: no-cache` (the `location = /shell-config.json` block of the nginx config in the `Dockerfile`; a missing file is a 404). Keys: `minShellVersion` (`x.y.z`), `updateUrl` (`null`, or `{ "ios": url|null, "android": url|null }`: iOS only `https://apps.apple.com/...`, Android only `https://play.google.com/store/apps/details...`, read by `apps/mobile/src/shellGate.ts`, so `packages/bridge` stays byte-identical to upstream), `forceWebview` (route patterns). Shipped values are neutral: `"0.0.0"`, `null`, `[]`; Tainan owns the values and the shape (`/public/shell-config.json` is in CODEOWNERS), and a test bounds them (`minShellVersion` not above the newest `packages/bridge/contracts/shells/*.json`, `forceWebview` entries are routes of `apps/mobile/route-map.json`).

The shell reads the file at launch with `fetch` and `no-store`, in parallel with the WebView (no added latency; 4 s timeout, 16 KiB cap, app origin only, no URL taken from the file). Every failure to read it (no file, HTTP error, timeout, offline, malformed or oversized body, a redirect to another origin) restricts nothing. Closed by design: a valid `minShellVersion` above the shell replaces the WebView with the full-screen update card (`apps/mobile/src/UpdateNowCard.tsx`); the store button appears only for a vetted URL of the running platform, and the card is complete without it ("Uma atualização é necessária. Fale com quem te passou o app."). The card is not terminal: the config is read again when the app returns to the foreground and on "Tentar de novo"; a config that was read and no longer restricts lifts the card, a read that fails keeps it. Rollback latency (CI + deploy until a launch sees the file) is not measured. There is no `billing.external` (Q-3).

Known limits of `forceWebview`, owned by R-13 (not built): (a) it matches the bundled route pattern exactly, so `/Catalog`, `/program/:id` or a concrete `/program/abc` are silent no-ops; (b) it fails open on a timeout, so on a slow network a broken native route still opens (persist the last good list); (c) `LaunchConfig.forceWebview` is not threaded to any consumer, because no native route exists; (d) the pinned bridge copy still exports `hasShellCapability` and parses a remote `capabilities` list, an upgrade path ADR-7 forbids: `decideLaunch` drops it, and R-13 adds a one-copy rule that `apps/mobile` never imports `hasShellCapability`.

### Session handoff: `auth.session` (R-12, ADR-10)

The WebView owns the Supabase session and its refresh. The page hands the shell a COPY of the access token so that a later native screen can call the backend as the signed-in learner. Shell `0.3.0`, contract `packages/bridge/contracts/shells/0.3.0.json`.

| Part | Where |
|---|---|
| Web call site (the only one) | `src/lib/shellAuthSession.ts`, `<ShellAuthSessionMount />` beside `ShellBridgeMount` in `src/App.tsx`; it reads `useAuth()`, so there is no second auth subscription |
| Payload | `{accessToken, expiresAt}` or `{signedOut: true}`, built field by field by the bridge package (`toSessionPayload`); the schema refuses every other key. No refresh token, no provider token, no session object, no user id (the shell reads `sub`) |
| When | after the handshake (a session that already exists), on sign-in, on each token refresh, on a change of user; `{signedOut: true}` on sign-out. A guest of a live class (`/g/:code`) is told as signed out: its token never leaves the page (ADR-10 is silent on guests; that surface is a DOM zone) |
| Native holder | `apps/mobile/src/nativeSession.ts`: one per process, **memory only** (no SecureStore, no AsyncStorage, no file; ADR-10 "no storage") |
| When the copy ends | `{signedOut: true}` (the page re-sends one that times out: three tries, after 1 s and 3 s); replaced when another user signs in; dropped when the WebView that delivered it starts a top-frame load, is relaunched (Retry, process death) or unmounts; on return to the foreground when the page, asked once, pushes no state within 5 s (or there is no page to ask); process end. After its `exp` it is never given out. No interval timer anywhere: one 5 s timer per return to the foreground, and only while a copy is held |
| Refresh | never native. `getAccessToken()` gives the copy only with at least 60 s of life left (that is also the clock-skew margin); otherwise the shell sends `ask auth.session` and the page answers from supabase-js. No answer in 5 s = null ("sign in again" for the caller) |
| Shape check | `tokenShapeProblem`: three base64url parts, `exp` in the future, `sub` a uuid, `aud` `authenticated`, `iss` equal to `<EXPO_PUBLIC_SUPABASE_URL>/auth/v1`, not a guest. A build that names no backend (the variable unset or malformed) has no native session at all: `auth.session` is not registered, the handshake never lists it, the page sends nothing. There is no build in which `iss` goes unchecked. **No signature check**: the shell has no key and must not have one; the backend verifies the token on every request |
| Development probe | `apps/mobile/src/backendProbe.ts`, `__DEV__` only: `POST <EXPO_PUBLIC_SUPABASE_URL>/rest/v1/rpc/current_itera_user_id` (schema `itera`) with `Authorization: Bearer <access token>`; the dev overlay shows `Backend: usuário <id>`, and `Backend: sem sessão` after a sign-out. Overlay session line: `Sessão: sim (expira em N min)` |

Env vars (the first of the shell), in `apps/mobile/.env` (gitignored): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Both are public by definition: Metro inlines `EXPO_PUBLIC_*` into the bundle, as Vite does with the web's `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, and they are the same two values. `parseBackend` refuses plain http, a URL with a path, and a key whose role is not `anon` (a service-role key in that variable disables the probe instead of shipping). No other variable is read under `apps/mobile` (`scripts/mobile/shell-route.test.ts`).

Threats (PLAN section 8, item 4):

| Sender | What it can do | Why not more |
|---|---|---|
| A sandboxed frame of learner code (`sandbox="allow-scripts"`, `srcdoc`), iOS and Android on the `WebMessageListener` path | nothing | its origin is opaque (`about:srcdoc` / `null`): both parsers drop it before the rate window and before any router, with no reply. It cannot deliver a token, reset the handshake, starve the page's messages, or read a reply |
| The same frame on an Android System WebView without `WebMessageListener` (every frame is reported as the top frame) | handshake with the router that has no `auth.session`; replace THAT handshake (the R-8 keep-awake limit, unchanged); use up the raw window (40 messages or 256 KiB per second reach a parser, never more) | `auth.session` is not registered on that router: the handshake does not list it, a call answers `capability_absent`, the shell never asks. No token is ever held on that path |
| A frame or page on another origin | nothing | `foreign_origin`, no reply; a reply is posted with the app origin as `targetOrigin` |
| A sub-frame on the app origin itself, or script injected in the page (XSS) | everything the page can: read the handshake reply, forge `auth.session`, sign the shell out | **not defended, and it cannot be from JavaScript**: both platforms know whether the sender is the main frame, but react-native-webview 13.16.1 discards it and reports none (a patch upstream, or a native module, would close this; neither fits Expo Go). Such script already reads the Supabase session (refresh token included) from the page's storage, so the bridge gives it nothing new. `src/` renders no same-origin sub-frame today |
| A fake shell: a browser extension or a hostile app that defines `window.ReactNativeWebView` and answers `HelloAck` with `auth.session` | receive the learner's **access token** (about an hour of life), again on each refresh | nothing in the handshake proves a shell is genuine, so the page does post the token (`src/lib/shellAuthSession.test.ts` states it). Whoever can define that object on the app's window runs script in the page or owns the WebView: it can read the whole session, refresh token included, without the bridge. A page that merely embeds the app cannot: the object must be on the app's own window, and `frame-ancestors` limits who frames it |
| Logs | — | the new shell code has no `console` call; the host logs a refusal REASON only; a refusal detail is scrubbed of the held token and of JWT-shaped runs; the console forwarder's redaction now also covers a token cut short. React state holds the expiry, never the token |

How the legacy Android path is known: not from a WebView version (a threshold would be a guess) but from the message itself. On the `WebMessageListener` path the library reports the ORIGIN of the sender frame (`https://app.iterahq.dev`, no path); on the fallback it reports the URL of the top frame, which always has a path. `senderAttributed` (`apps/mobile/src/bridgeMessage.ts`) takes an Android message as attributed only when its URL is exactly the app origin. If that reading of the library is wrong on a device, the failure is closed: Android is never offered `auth.session`, and the overlay says `Sessão: não oferecida (este WebView não informa o frame)`.

The three limits R-6 left to this row: (1) Android legacy frame attribution: closed for the token as above (not for keep-awake). (2) A same-origin sub-frame: not closable from JavaScript, stated above. (3) `Math.random` session token: replaced by 256 bits from `expo-crypto` `getRandomValues` (`apps/mobile/src/sessionToken.ts`), ask ids too; the replay window stays 1024 ids, because whoever can capture a call also reads the session token inside it and needs no replay.

Also changed: `onMessage` has two windows. `messageSize` (no parse) drops a frame that is not on the app origin: it is counted nowhere, so a learner's preview frame that posts in a loop can no longer make the shell drop the page's own messages (before, it shared the page's 10 per second). `admitRaw` then admits at most 40 messages and 256 KiB per second to the parsers, which bounds `JSON.parse` on the Android legacy path, where every frame passes the origin gate. The page's budget (`admitMessage`, 10 per second) comes after the parse and counts only what a parser accepted.

Matrix: new web + shell 0.2.0 or older: `auth.session` is not listed, the page sends nothing. Shell 0.3.0 + a web build without this row: no token ever arrives; the probe shows `Backend: —`, the session line `Sessão: não`.

Known limits: a hidden second WebView (a deep link over an open route) shares the one copy, last writer wins, and the page asked for a fresh token is the one mounted last; a sign-out lost three times in a row while the app stays in the foreground leaves the copy until its `exp` or the next top-frame load (the next return to the foreground ends it); one-copy rule 1b for `apps/mobile/src/backendProbe.ts` ("exactly one `fetch(`, no host literal") is a tripwire read by a reviewer, not a guarantee: `const f = fetch; f(url)`, `globalThis['fetch'](url)`, a host assembled from pieces (`'https:' + '//host'`), a decoded one (`atob(...)`) and `new Function('return fetch')()` all pass it unchanged (rule 1c still closes `XMLHttpRequest`, `WebSocket` and `expo/fetch` in every shell file, and a `fetch(` in any other file); on the Android legacy path a frame can still spend the raw window, so the page's messages can be dropped there (no token exists on that path); React Native's `fetch` follows redirects and that cannot be turned off from JavaScript (the probe discards an answer that came from another origin; PostgREST does not redirect). Not verified on a device: everything in this section.

## Universal screens (R-11; Uniwind in the shell, R-18 shell half)

One file under `packages/screens/src/<screen>/` is rendered by the web (react-native-web, in a lazy chunk) and by the shell (React Native), with the same Tailwind classes. The first one is `not-found`. Shape derived from Lesson Studio (`packages/screens`, `apps/ios`).

| Piece | Where | Who resolves it |
|---|---|---|
| Ports (`Translate`, `LogPort`, `NavigationIntent`) | `packages/core` (`@iterahq/shell-core`): pure TypeScript, no package import | a type import on both sides |
| Screen, its strings, its slots | `packages/screens/src/<screen>/` (`@iterahq/screens/<screen>`) | web: Vite alias in `vite.config.ts`; shell: `file:` link in `apps/mobile/package.json` |
| Theme | `packages/screens/theme/{theme,tokens}.css` | web: `@import` in `src/index.css`; shell: `@import` in `apps/mobile/global.css` |
| Web host + adapters | `src/pages/<Screen>Route.tsx`, `src/lib/universalScreenHost.ts` | `lazy()` in `src/App.tsx` |
| Native route + adapters | `apps/mobile/app/…`, `apps/mobile/src/screenPorts.ts` | expo-router |

### Recipe

1. Add the row to `apps/mobile/route-map.json`: `screen: "<screen>"`, `universal: true`, `mode: "webview"`, `web_paths` = the page files you are about to delete.
2. Write `packages/screens/src/<screen>/<Name>Screen.tsx` with `View` / `Text` from `react-native` and `className`. No HTML tag, no `window`/`document`, no hook of a router or of a data client: what the screen needs from its host is a prop typed by a port of `@iterahq/shell-core`.
3. Give every `Text` its `font-sans`, size and colour class: a `Text` inherits nothing (react-native-web resets it to 14 px black, React Native has no cascade). Headings (`role="heading" aria-level={n}`) take the display face from the web's base layer; leave the font class off.
4. Put a platform difference in `<screen>/slots/` and nowhere else (`Platform.OS` there, or `x.web.tsx` + `x.native.tsx` with named exports).
5. Strings: `<screen>/messages.ts`, spread into `src/i18n/index.ts`. Give the file its own `exports` entry and Vite alias, so the web's entry chunk imports the strings and not the screen.
6. Add the `exports` entry of the screen to `packages/screens/package.json` and the alias to `vite.config.ts` (most specific first; `scripts/workspace-alias.test.ts` fails otherwise).
7. Web: a host of at most 15 lines under `src/pages/` that passes the adapters, mounted with `lazy()` in `src/App.tsx`. Delete the old page, its tests and its now-unused children in the same PR.
8. Shell: a route file of at most 15 lines under `apps/mobile/app/` importing the screen, `expo-router` and `../src/screenPorts`. Until Tainan flips the row to `native`, it is a `__DEV__` preview that redirects home in a release build.
9. A prop of React Native that the web typecheck does not know: add it to `packages/screens/types/react-native.web.d.ts` (the shell job checks the same file against the real types).
10. Run `npx vitest run scripts/mobile/one-copy.test.ts`, `npm run typecheck`, then in `apps/mobile`: `npx tsc -p . --noEmit && npx expo export --platform ios --output-dir dist-ios --dump-sourcemap && npm run check:one-react`.

### What Uniwind / React Native cannot express, and what to do instead

| Web habit | On native | Instead |
|---|---|---|
| `grid`, `col-span-*`, `place-items-*` | no grid | `flex-row flex-wrap` with fixed basis, or a list component in a slot |
| `before:` / `after:`, `placeholder:`, `marker:` | no pseudo-elements | a real `View`; `placeholderTextColor` |
| `group`, `group-hover:`, `peer-*`, `[&_x]:` | no selectors across elements | state in the component, classes chosen in JS |
| `fixed`, `sticky` | no such position | the native header/tab slot, or `absolute` inside a full-screen `View` |
| `backdrop-*`, `blur` | not available | a translucent background colour |
| `animate-*`, `@keyframes`, `transition*` | not available | none, or an animation in a slot |
| inherited text style (`text-center` on a parent, `body` font) | a `Text` inherits only from a parent `Text` | repeat the class on the `Text` |
| a font stack (`Inter, system-ui, sans-serif`) | one family name; Uniwind joins the stack into a name no device has | override the token in `apps/mobile/global.css` (`--font-sans: System` today; the Inter files are not bundled) |
| `<a href>`, `<p>` | no such thing | `role="link"` + `href` on the web through a slot, `onPress` on native; `role="paragraph"` on the web only |
| `hover:` | never fires | harmless; do not hide content behind it |
| `web:` / `native:` / `ios:` variants | exist in the shell only: `src/index.css` does not import `uniwind` (it would redefine `dark:` and `disabled:` for every page) | a slot |

### How one source is typechecked and bundled

- Web typecheck: `npm run typecheck` runs `tsc -p packages/core` and `tsc -p packages/screens` (strict, `lib` without DOM). The root has no `react-native`, so both resolve it to `packages/screens/types/react-native.web.d.ts`, a deliberately small lower bound.
- Shell typecheck: `apps/mobile/tsconfig.json` includes `packages/{core,screens}/src` and checks them against the real `react-native` and `uniwind/types`.
- Web bundle: `scripts/vite/universal-screens.ts` (`uniwind()` aliases `react-native` to Uniwind's web components over react-native-web; the app's CSS pipeline is kept as it was; two edits of react-native-web so that a screen leaves nothing in the document: no reset rule, no listener).
- Shell bundle: `apps/mobile/metro.config.js`. A bare import made by a file of `packages/` is resolved from `apps/mobile` (one React: `npm run check:one-react`). PLAN 2.3 names `nodeModulesPaths` + `disableHierarchicalLookup`; expo-doctor rejects both.

### Known gaps of R-11

- **The UX-paths source stamp does not see inside a universal screen.** `@devfellowship/ux-paths-capture` stamps lowercase host tags; a screen has none. `e2e/capture-regions.spec.ts` uses the not-found page as its witness (`minRegions: 4`, and "a coordinate inside a known component resolves to its exact file"): both go red (0 regions) with this port. Uniwind's web components forward `data-*` props to the DOM, so the stamp can reach these elements once the package also stamps `View`/`Text`; that is a change in the package, not here.
- react-native-web is edited while it is bundled (`scripts/vite/universal-screens.ts`): its four document-wide reset rules are removed, and its responder listeners attach when a node registers (a `Pressable`, a `ScrollView`) instead of when the first `View` mounts. Lesson Studio also detaches them when the last such node leaves (`scripts/vite/rnw-lazy-responder.ts`); that half is not ported, so the first screen with a `Pressable` leaves 13 listeners on `document` until the next page load. Port it with that screen.
- The shell's text is the system face (see the table). The native rendering has not been seen on a simulator or a phone: what is proven is that the screen, its strings and its compiled classes are in the exported bundle.
- `apps/mobile/app/preview/not-found.tsx` exists in release builds as a redirect to `/`.
