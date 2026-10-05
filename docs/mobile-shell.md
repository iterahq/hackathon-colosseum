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
- Then it starts Expo on port 8091 with the packager host set to the tailnet address and `--host lan`, and prints `ss -ltn` for the port (expected `*:8091`, or `0.0.0.0:8091` and `[::]:8091`).
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

v1 capabilities: `shell.version` and `keepAwake` (R-8). A method of the protocol without a handler (`auth.session`, `link.open`, `haptics`, ...) answers `capability_absent`; no token crosses, no navigation command, no file access. Shell version: `0.2.0` (`expo.version`, raised by R-8 because `keepAwake` is a new capability; contract file `packages/bridge/contracts/shells/0.2.0.json`; builds of PR-1, PR-2 and R-6 report 0.1.0 and the web never asks them for `keepAwake`; PR-1 and PR-2 builds answer no bridge message, so the web handshake times out and the page runs as in a browser; the dev overlay's handshake count tells them apart). Known limits: on Android System WebView older than 73 every frame is reported with the top-frame URL, so a cross-origin frame passes the origin gate there and can replace the handshake session (which releases the screen lock and makes the page's later calls `bad_session`) or provoke refusals (it cannot read a reply); a same-origin sub-frame cannot be told from the top frame by URL; the session token is `Math.random`-based and the replay window is 1024 ids (upstream); the native gate parses each envelope twice; a shell `reset()` that does not replace the page (a top-frame load that starts and never commits) releases the lock and the page does not re-ask until the route changes (fails safe: the screen dims). R-12 (`auth.session`) owns all three.

Metro reaches the package by name through `apps/mobile/metro.config.js` (`watchFolders` and `resolver.extraNodeModules`; hierarchical lookup stays on because expo-doctor rejects the alternative, and it is safe because `packages/bridge/src` imports no bare module, so the root React 18 is unreachable, ADR-2; `check:one-react` backs it) and `tsconfig.json` `paths`; the shell's `package.json` and lockfile are untouched. R-11 replaces this with the `file:` link of section 2.3.

## Route map vocabulary

`apps/mobile/route-map.json` uses the key names of the Lesson Studio map (`map.yaml` in `dfl-loops`), plus three keys that are new here.

| Key | Meaning | LS |
|---|---|---|
| `version` | schema version, 1 | same |
| `routes[].path` | route pattern of `src/App.tsx`, composed with its parents | same |
| `routes[].screen` | a name for the screen | same |
| `routes[].mode` | `webview` (the only mode this shell opens) or `native` | same |
| `routes[].universal` | the route renders from one shared screen package (false for all rows today) | same |
| `routes[].web_paths` | the web page file(s) of the route; the one-copy test checks them against `src/App.tsx` | new |
| `shell_chrome[]` | the closed list of shell `.tsx` files that are chrome | new |
| `dom_zones[]` | `{id, reason, paths, kinds}`: routes and activity kinds that stay in the DOM | new (`paths`, `kinds`) |
| `not_counted_routes[]` | `{path, reason}`: `*` and `/prototipo/cena` | same |

The route meter (printed by the one-copy test) is 14: 32 paths in `src/App.tsx`, minus 14 staff, minus 2 not counted, minus 2 learner DOM zones.

## One-copy rules

`scripts/mobile/one-copy.test.ts` runs in the `build-test` job. The rules live in `scripts/mobile/oneCopyRules.ts`; each rule has a negative fixture in the test. A PR that touches `apps/mobile/route-map.json` needs Tainan's review (CODEOWNERS is a record, not a gate).

1. Every `.tsx` under `apps/mobile/` is in `shell_chrome`, or is a route file of at most 15 lines that only renders an export of `@iterahq/screens`.
1b. `shell_chrome` equals a closed list asserted in the test. A chrome file imports nothing from `@iterahq/*` (except the bare `@iterahq/shell-bridge`, R-6; its `/web` entry stays forbidden), `@supabase/*`, `@tanstack/*`, `react-router*`, and no file under `apps/mobile/app` or `apps/mobile/src` contains `fetch(` except `apps/mobile/src/shellGate.ts`.
1c. A chrome file references no `XMLHttpRequest`, `WebSocket` or `expo/fetch`, and reads `onMessage` data only through `parseConsoleMessage` (the forwarder's `{type:'console', …}` shape) or `parseBridgeMessage` (a bridge envelope that passed the native gate; R-6); the single `onMessage` handler lives in `apps/mobile/app/[...path].tsx`.
2. Every file under `packages/screens/src/` belongs to exactly one route's universal path.
2b. No `*.{native,web,ios,android}.tsx` under `packages/screens/src` except under a `**/slots/` directory; a slot file has no default export.
2c. `Platform.OS` and `Platform.select` appear under `packages/screens/src` only inside `**/slots/`.
3. A route with `universal: true` has none of its `web_paths` on disk.
3b. `web_paths` is checked, not declared: for every route outside the staff zone, the page component of its `element=` in `src/App.tsx` (the innermost non-wrapper JSX element; wrappers `RequireAuth`, `RequireSubscription`, `RequireRole`, `LazyRoute`, `Suspense`; `lazy(() => import(x))` resolves to `x`) must be in `web_paths`; `web_paths` is non-empty while `universal: false`.
4. `mode: native` requires `universal: true`.
5. The frozen manifest `e2e/support/capture-manifest.json` (32 routes) is the primary source: every route of it has a row in the map. A secondary scan of `src/App.tsx` composes every `path` with its parent, asserts it found 32 paths, and reports any path missing from the manifest.
6. `apps/mobile/**` and `packages/{bridge,core,screens}/**` import nothing from `src/`, `@/`, `react-dom`; `apps/mobile` and `packages/screens` have no lowercase JSX host tag and no DOM global, except files named `*.injected.ts` that export only strings; `packages/{bridge,core}` import no `react`.
7. No basename under `apps/mobile/src` or `packages/screens/src` equals one under `src/pages`, `src/components` or `packages/activities/src`.

Residual: the closed chrome list is edited in the same PR that adds a chrome file, so whether a new file on that list is chrome or a copy is decided by the reviewer, not by CI.

## Known gaps

- Analytics: the Umami property `shell=<version>` is set after `HelloAck` (R-6); sessions of the weekend shell (0.1.0) answer no handshake and still look like mobile web.
- Stripe (`checkout.stripe.com`, `billing.stripe.com`) is blocked: never loaded, never opened in the system browser, Expo Go included (ADR-5, Q-3). A blocked top-frame navigation shows the notice "Indisponível no app" (PR-2); in Expo Go the web's subscribe button therefore answers with that notice.
- "Sign in with DFL": no DFL host loads in the WebView. Until R-20 the handoff URL takes the default path (system browser, no way back); the shell login is email or code.
- The chrome states, the console forwarder and keep-awake are in PR-2 (sections above). None of them has run on a phone yet: the recording and the screenshots of S9 are Samuel's.
- `tsc` of the shell (the three `.tsx` chrome files and the route file), `expo-doctor`, `expo export`, `check:one-react` need `apps/mobile/node_modules` and have not run on this box (row 0.4); `mobile-shell` runs them on the runner. The shell's pure `.ts` files and their tests do run: root Vitest with `apps/mobile/vitest.config.ts` (move `apps/mobile/tsconfig.json` aside, it extends `expo/tsconfig.base`).
- Rule 2 is read as: a file under `packages/screens/src/<dir>/` belongs to the one universal route whose `screen` equals `<dir>`; `packages/screens/src/index.ts` (the barrel) is exempt, and so is any `index` file in rule 7. For a `universal: true` route, rule 3b skips the page resolution (its `web_paths` are the deleted pages, rule 3). ADR-8 does not say this yet. No such package exists yet.
- Rules 1b and 1c apply to every `.ts`, `.tsx`, `.js` and `.jsx` file under `apps/mobile/app` and `apps/mobile/src`, not only to chrome. `.js`/`.jsx` there are refused; `nativeEvent` is read only as `parseConsoleMessage(e.nativeEvent, ...)` (a pure parser in `apps/mobile/src/consoleMessage.ts` with its own test) or `parseBridgeMessage(e.nativeEvent, ...)` (R-6, `apps/mobile/src/bridgeMessage.ts` with its own test), plus `.nativeEvent.description` and `.nativeEvent.statusCode` of the error events.

## Monday checklist

R-1 accounts; R-2 EAS and dev client; R-3 Android first; R-4 iOS TestFlight; R-5 deep links; R-6 bridge v1; R-7 `shell-config.json` and update screen; R-8 keep-awake over the bridge; R-9 React 19 measurement branch; R-10 widen the `@iterahq/activities` peer; R-11 `packages/core`, `packages/screens`, Metro settings; R-12 `auth.session`; R-13a `catalog-watch.yml`; R-13 port `/catalog`; R-14 store readiness; R-15 simulator journeys; R-16 fold `apps/mobile` into the root workspaces; R-17 React 19 on the web; R-18 Tailwind 4 and Uniwind; R-19 job-level path filter in `ci.yml`; R-20 DFL sign-in through the system auth session; R-21 route map source in `dfl-loops`. Details are in section 12 of the plan.

### Keep awake (R-8)

The screen stays on during `/lesson/:lessonId` and `/live/*` only. The one call site is `KeepAwakeRouteMount` (`src/lib/shellKeepAwake.ts`), mounted beside `ShellBridgeMount`: it calls `keepAwake {on: true}` when the router enters one of those routes and `{on: false}` when it leaves or unmounts. In a browser tab the handshake settles at `no_shell` and nothing is sent; the Screen Wake Lock API is out of scope. In the shell, `apps/mobile/src/keepAwakeHolder.ts` holds the lock under one tag (`expo-keep-awake`) and one registry holds the one platform lock per process and each mounted WebView holds its own claim, so a hidden WebView's release never drops another's claim. `bridge.reset()` releases the claim: on each accepted `hello` (a new session never inherits a lock), on each top-frame load start, on WebView relaunch (Retry, process death) and on unmount. The payload is `{on: boolean}` and nothing else; any other shape is `bad_payload`. `useKeepAwake()` of PR-2 is gone.

### Launch gate and `shell-config.json` (R-7)

`public/shell-config.json` is served by the web deploy at `<webOrigin>/shell-config.json` with `Cache-Control: no-cache` (the `location = /shell-config.json` block of the nginx config in the `Dockerfile`; a missing file is a 404). Keys: `minShellVersion` (`x.y.z`), `updateUrl` (`null`, or `{ "ios": url|null, "android": url|null }`: iOS only `https://apps.apple.com/...`, Android only `https://play.google.com/store/apps/details...`, read by `apps/mobile/src/shellGate.ts`, so `packages/bridge` stays byte-identical to upstream), `forceWebview` (route patterns). Shipped values are neutral: `"0.0.0"`, `null`, `[]`; Tainan owns the values and the shape (`/public/shell-config.json` is in CODEOWNERS), and a test bounds them (`minShellVersion` not above the newest `packages/bridge/contracts/shells/*.json`, `forceWebview` entries are routes of `apps/mobile/route-map.json`).

The shell reads the file at launch with `fetch` and `no-store`, in parallel with the WebView (no added latency; 4 s timeout, 16 KiB cap, app origin only, no URL taken from the file). Every failure to read it (no file, HTTP error, timeout, offline, malformed or oversized body, a redirect to another origin) restricts nothing. Closed by design: a valid `minShellVersion` above the shell replaces the WebView with the full-screen update card (`apps/mobile/src/UpdateNowCard.tsx`); the store button appears only for a vetted URL of the running platform, and the card is complete without it ("Uma atualização é necessária. Fale com quem te passou o app."). The card is not terminal: the config is read again when the app returns to the foreground and on "Tentar de novo"; a config that was read and no longer restricts lifts the card, a read that fails keeps it. Rollback latency (CI + deploy until a launch sees the file) is not measured. There is no `billing.external` (Q-3).

Known limits of `forceWebview`, owned by R-13 (not built): (a) it matches the bundled route pattern exactly, so `/Catalog`, `/program/:id` or a concrete `/program/abc` are silent no-ops; (b) it fails open on a timeout, so on a slow network a broken native route still opens (persist the last good list); (c) `LaunchConfig.forceWebview` is not threaded to any consumer, because no native route exists; (d) the pinned bridge copy still exports `hasShellCapability` and parses a remote `capabilities` list, an upgrade path ADR-7 forbids: `decideLaunch` drops it, and R-13 adds a one-copy rule that `apps/mobile` never imports `hasShellCapability`.
