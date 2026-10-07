# Provenance of `packages/bridge`

Source: `devfellowship/dfl-lesson-studio`, path `packages/bridge/`, upstream `main` at
`3f21f2d89135114dfa1dc9c3ea16fc2640d29c06` (2026-10-04). The last upstream commit that touched the
folder is `aca4360e6b4daf94160a68b84d646458df7d6ae1` (2026-10-04). PLAN ADR-9, row R-6.
The shell files already in `apps/mobile/` cite the older LS commit `e90a642c4f7a7f4b9651895270a3f489cffc84a7`.

## Copied byte for byte (sha256 prefix, upstream and here equal)

| File | sha256 (12) |
|---|---|
| `src/base64.ts` | `cf381baf8d7a` |
| `src/protocol.ts` | `0a27fa03dc47` |
| `src/shell.ts` | `22a2cba21ef0` |
| `src/shellConfig.ts` | `2ef96f1e8b5e` |
| `src/shellSession.ts` (R-12) | `9f4cc0e992a2` |
| `src/webSession.ts` (R-12) | `b64315fb9345` |

R-12 (`auth.session`, PLAN ADR-10) adds the last two, at the same pinned SHA (`3f21f2d`); upstream `main` at
`c90ad44cd6e55d37d337bb26ede17e96a10c51f1` (2026-10-05) still has all six files byte for byte. Their comments
name `packages/core`, `dfl-render`, native uploads and a Keychain copy: those are upstream's. Here the shell copy
is memory only and there is no upload.

`protocol.ts` keeps every LS method name and schema (`file.*`, `upload.*`, `capture.*`, `auth.session`,
...): ADR-9 says only LS method names. A method is a capability only when the shell registers a
handler for it; `apps/mobile/src/bridgeMessage.ts` registers `shell.version`, `keepAwake` (R-8) and `auth.session` (R-12), so the
rest answer `capability_absent`. The comments in these files name Lesson Studio paths and plans; they are upstream's.
`UPDATE_URL_HOSTS` is upstream's list (`apps.apple.com`, `testflight.apple.com`) unchanged: the host
decision (Google Play) belongs to R-7, the first reader of `shell-config.json`.

## Changed against upstream (every line)

1. `src/client.ts` (sha256 12: upstream `009edff4facc`, here `117a931db1f9`): the handshake-timeout branch now clears `helloId` and
   adds it to `settled`, so a HelloAck that arrives after the timeout is ignored instead of flipping the
   page from `web` to `shell` (review R-6 finding 5). Test: `src/client.test.ts`. Not filed upstream: no issue or PR has been
   opened; drop this patch if upstream ever has the fix.
   ```
   -        if (mode.kind === 'pending') finishHandshake(toWeb('timeout', 'no hello ack'));
   +        if (mode.kind === 'pending') {
   +          if (helloId !== null) settled.add(helloId);
   +          helloId = null;
   +          finishHandshake(toWeb('timeout', 'no hello ack'));
   +        }
   ```
2. `src/index.ts` (upstream 15 lines, here 7): the barrel exports `protocol`, `shell`, `client`,
   `shellConfig`, `base64`, and from R-12 `shellSession`, `webSession`. The exports of the files not taken
   (below) are removed.
3. `src/web.ts` (upstream 126 lines, here 22): only `domTransport` is kept, byte for byte in behaviour.
   Removed: `domFallbacks` (navigator wake lock, vibrate, share, file anchors, permissions),
   `getWebBridge` and its singleton (they built `createCapabilities`). `src/lib/shellBridge.ts` builds the
   client from `createBridgeClient` and `domTransport` instead.
4. `package.json`: new (name `@iterahq/shell-bridge`, version `0.1.0`, `private`, `sideEffects: false`, no
   `build` script; `exports` `.`, `./web`, `./contracts/shells/*`). Upstream's is `@dfl-lesson-studio/bridge`.
5. `contracts/shells/0.1.0.json`, `0.2.0.json` and `0.3.0.json`: new, one per shell version of this repo (upstream's six are LS shell versions). `0.2.0` (R-8) adds `keepAwake`; `0.3.0` (R-12) adds `auth.session`; no copied file changed.

## Divergences of R-12 that live OUTSIDE the copied files

The copied files are untouched. What this repo does differently from Lesson Studio is in the host
(`apps/mobile/src/`) and the web call site (`src/lib/shellAuthSession.ts`):

1. The session token and the ask id of the router are NOT `shell.ts`'s `Math.random` defaults: the host passes
   `newSession` / `newAskId` built on `expo-crypto` `getRandomValues` (`apps/mobile/src/sessionToken.ts`).
   Upstream's host passes neither.
2. Two routers per WebView instead of one (`apps/mobile/src/bridgeMessage.ts`): `auth.session` is registered only
   on the router that takes messages whose sender frame the shell can attribute (`senderAttributed`). On the
   Android legacy WebView path the handshake does not list it. Upstream offers it on every path (iOS only there).
3. The native handler wraps `createShellSession().handler` with a claims gate (`apps/mobile/src/nativeSession.ts`
   `tokenShapeProblem`: `sub` a uuid, `aud` `authenticated`, `iss` the project of the build, not a guest), and the
   copy is dropped when the WebView that delivered it starts a top-frame load, is relaunched or unmounts, and
   on return to the foreground when the page does not vouch for it (`revalidate`). A build that names no
   backend registers no `auth.session`. Upstream keeps the copy across loads and adds a Keychain copy (its R2);
   here there is no persistent copy.
4. The web side does not use upstream's `createWebAuthSession` (`src/lib/ports/webAuthSession.ts`, not part of
   the bridge package): `src/lib/shellAuthSession.ts` builds the same `WebAuthSessionLike` from the auth state
   the app already holds (`useAuth`), so there is no second `onAuthStateChange`; and a guest session of a live
   class is told as signed out. `connectAuthSession` gets the client through `withSignOutRetry`: a
   `{signedOut: true}` that times out is sent again (three tries); upstream sends it once.
5. The payload is upstream's: `{accessToken, expiresAt}` or `{signedOut: true}`. The user id is NOT a field
   (`validateRequest` refuses every unknown key): the shell reads it from the `sub` claim.

## Not taken

`src/capabilities.ts`, `src/saveBytes.ts` (the LS capability wrappers and the `file.saveBytes` assembler: no
capability here uses them), `scripts/count-capability-branches.mjs`, `README.md`,
`contracts/shells/0.1.0..0.6.0.json` of LS, and upstream's tests `test/*.test.ts` + `test/harness.ts` (they
exercise the omitted files and LS's `packages/core`; `test/authSession.test.ts` is the model of the
`auth.session` tests written here).

## Written here

`src/contract.test.ts` (the current web client against every `contracts/shells/*.json`; R-12 adds the `auth.session` round trip with the real `createShellSession`), `src/shell.test.ts`
(the router's refusals), `src/client.test.ts` (late HelloAck), `src/wire.testkit.ts` (an in-memory WebView, derived from upstream's
`test/harness.ts` and reduced to the kept files), `src/shellDetectLint.test.ts` (the lint rule of
`eslint.config.js`, same idea as upstream's `shell-detect-lint.test.ts`).
