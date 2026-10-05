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

`protocol.ts` keeps every LS method name and schema (`file.*`, `upload.*`, `capture.*`, `auth.session`,
...): ADR-9 says only LS method names. A method is a capability only when the shell registers a
handler for it; `apps/mobile/src/bridgeMessage.ts` registers `shell.version` alone, so the rest answer
`capability_absent`. The comments in these files name Lesson Studio paths and plans; they are upstream's.
`UPDATE_URL_HOSTS` is upstream's list (`apps.apple.com`, `testflight.apple.com`) unchanged: the host
decision (Google Play) belongs to R-7, the first reader of `shell-config.json`.

## Changed against upstream (every line)

1. `src/client.ts` (upstream sha256 `009edff4facc`): the handshake-timeout branch now clears `helloId` and
   adds it to `settled`, so a HelloAck that arrives after the timeout is ignored instead of flipping the
   page from `web` to `shell` (review R-6 finding 5). Test: `src/client.test.ts`. To be filed upstream;
   drop this patch when upstream has it.
   ```
   -        if (mode.kind === 'pending') finishHandshake(toWeb('timeout', 'no hello ack'));
   +        if (mode.kind === 'pending') {
   +          if (helloId !== null) settled.add(helloId);
   +          helloId = null;
   +          finishHandshake(toWeb('timeout', 'no hello ack'));
   +        }
   ```
2. `src/index.ts` (upstream 15 lines, here 5): the barrel exports `protocol`, `shell`, `client`,
   `shellConfig`, `base64` only. The exports of the files not taken (below) are removed.
3. `src/web.ts` (upstream 126 lines, here 22): only `domTransport` is kept, byte for byte in behaviour.
   Removed: `domFallbacks` (navigator wake lock, vibrate, share, file anchors, permissions),
   `getWebBridge` and its singleton (they built `createCapabilities`). `src/lib/shellBridge.ts` builds the
   client from `createBridgeClient` and `domTransport` instead.
4. `package.json`: new (name `@iterahq/shell-bridge`, version `0.1.0`, `private`, `sideEffects: false`, no
   `build` script; `exports` `.`, `./web`, `./contracts/shells/*`). Upstream's is `@dfl-lesson-studio/bridge`.
5. `contracts/shells/0.1.0.json` and `0.2.0.json`: new, one per shell version of this repo (upstream's six are LS shell versions). `0.2.0` (R-8) adds `keepAwake`; no copied file changed.

## Not taken

`src/capabilities.ts`, `src/saveBytes.ts`, `src/shellSession.ts`, `src/webSession.ts` (the LS capability
wrappers, `file.saveBytes` assembler and `auth.session`: no v1 capability uses them; `auth.session` is
R-12), `scripts/count-capability-branches.mjs`, `README.md`, `contracts/shells/0.1.0..0.6.0.json`
of LS, and upstream's tests `test/*.test.ts` + `test/harness.ts` (they exercise the omitted files).

## Written here

`src/contract.test.ts` (the current web client against every `contracts/shells/*.json`), `src/shell.test.ts`
(the router's refusals), `src/client.test.ts` (late HelloAck), `src/wire.testkit.ts` (an in-memory WebView, derived from upstream's
`test/harness.ts` and reduced to the kept files), `src/shellDetectLint.test.ts` (the lint rule of
`eslint.config.js`, same idea as upstream's `shell-detect-lint.test.ts`).
