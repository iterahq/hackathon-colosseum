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
1b. `shell_chrome` equals a closed list asserted in the test. A chrome file imports nothing from `@iterahq/*`, `@supabase/*`, `@tanstack/*`, `react-router*`, and no file under `apps/mobile/app` or `apps/mobile/src` contains `fetch(` except `apps/mobile/src/shellGate.ts`.
1c. A chrome file references no `XMLHttpRequest`, `WebSocket` or `expo/fetch`, and reads `onMessage` data only in the forwarder's `{type:'console', …}` shape; the single `onMessage` handler lives in `apps/mobile/app/[...path].tsx`.
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

- Analytics: shell sessions look like mobile web until the bridge lands (R-6).
- Stripe (`checkout.stripe.com`, `billing.stripe.com`) is blocked: never loaded, never opened in the system browser, Expo Go included (ADR-5, Q-3). A blocked navigation shows nothing: ADR-5 assigns no shell state to it, so the default is a refused navigation, and in Expo Go the web's subscribe button does nothing. Any user-visible message is not in PR-1.
- "Sign in with DFL": no DFL host loads in the WebView. Until R-20 the handoff URL takes the default path (system browser, no way back); the shell login is email or code.
- No chrome states in PR-1: no loading veil, no offline card, no safe-area handling, no keep-awake. The dev overlay shows the shell version, the loaded URL and, after a load error, a retry button. PR-2 adds the chrome.
- `tsc`, `expo-doctor`, `expo export`, `check:one-react` and the shell's own Vitest run need `apps/mobile/node_modules` and have not run (the lockfile exists; the install waits for row 0.4).
- Rule 2 is read as: a file under `packages/screens/src/<dir>/` belongs to the one universal route whose `screen` equals `<dir>`; `packages/screens/src/index.ts` (the barrel) is exempt, and so is any `index` file in rule 7. For a `universal: true` route, rule 3b skips the page resolution (its `web_paths` are the deleted pages, rule 3). ADR-8 does not say this yet. No such package exists yet.
- Rules 1b and 1c apply to every `.ts`, `.tsx`, `.js` and `.jsx` file under `apps/mobile/app` and `apps/mobile/src`, not only to chrome. `.js`/`.jsx` there are refused; `nativeEvent` is read only as `parseConsoleMessage(e.nativeEvent, ...)` (a pure parser in `apps/mobile/src/consoleMessage.ts` with its own test, added by PR-2), plus `.nativeEvent.description` and `.nativeEvent.statusCode` of the error events.

## Monday checklist

R-1 accounts; R-2 EAS and dev client; R-3 Android first; R-4 iOS TestFlight; R-5 deep links; R-6 bridge v1; R-7 `shell-config.json` and update screen; R-8 keep-awake over the bridge; R-9 React 19 measurement branch; R-10 widen the `@iterahq/activities` peer; R-11 `packages/core`, `packages/screens`, Metro settings; R-12 `auth.session`; R-13a `catalog-watch.yml`; R-13 port `/catalog`; R-14 store readiness; R-15 simulator journeys; R-16 fold `apps/mobile` into the root workspaces; R-17 React 19 on the web; R-18 Tailwind 4 and Uniwind; R-19 job-level path filter in `ci.yml`; R-20 DFL sign-in through the system auth session; R-21 route map source in `dfl-loops`. Details are in section 12 of the plan.
