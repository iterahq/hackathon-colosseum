# Browser end-to-end test of the on-chain flows

Hackathon only: Supabase project `nyzcbnnbffsizshiolbh`, Solana **devnet**, the live site
`https://hackathon-colosseum.178-105-2-230.sslip.io`.

`scripts/hackathon/browser-e2e.mjs` drives the deployed app in headless Chromium (Playwright) with
a **fake Phantom**: `window.solana` / `window.phantom.solana` are installed before any app code runs
(`addInitScript`) and are backed by a real ed25519 keypair generated per run. The key stays in the
Node process; the page only gets `exposeFunction` bridges that sign bytes and broadcast a signed
transaction to `https://api.devnet.solana.com`.

## Run

```bash
source ~/.config/itera-hackathon/supabase.env && export HACKATHON_DB_PASSWORD SUPABASE_ACCESS_TOKEN
node scripts/hackathon/browser-e2e.mjs                         # fresh throwaway wallet, all 8 steps (~7 min)
node scripts/hackathon/browser-e2e.mjs --wallet /tmp/w.json    # keep the wallet in a file (created 0600 when missing)
node scripts/hackathon/browser-e2e.mjs --wallet /tmp/w.json --steps 6,7,8   # re-run some steps for that wallet
```

Options: `--base <url>` (default the live site), `--out <dir>` (default `/tmp/hk-e2e`),
`--video off`, `--shot-start <n>`. Needs `psql`, Node 22 and the repo's `node_modules/playwright`
with Chromium installed. Exit code 0 only when every check passed.

Output in `--out`: `NN-name.png` screenshots (1440x900, key screens again at 390x844),
`video/*.webm`, and `results.json` (checks, timings of every on-chain wait as the learner
experiences it, every call the page made to the wallet, console errors, failed requests).

## What it does

| Step | What |
|---|---|
| 1 | `/login` -> "Continuar com Phantom" -> nickname step -> dashboard greeting; `itera.users.display_name` in the database |
| 2 | seeds the throwaway learner (below), then the dashboard: trail at day 5, hearts, certifications panel with the backend art; waits for the companion mint |
| 3 | day 5: wrong answers until 0 lives (hearts and `itera.companions.lives` after each one), the out-of-lives gate, lives 0 on chain |
| 4 | gate -> "Recarregar vidas" -> (empty wallet: the app's own faucet) -> signature -> confirmation -> 5/5, same activity; the devnet transaction (transfer to the treasury, memo = intent id) |
| 5 | finishes day 5 -> stamp ceremony sampled frame by frame; certification 5/5, gold, frozen on chain |
| 6 | shop: buys and equips the glasses (shop stage, welcome strip, `outfit` on chain); buys `ink_emerald` (art on `/passport` and `/c/<asset>`) |
| 7 | a fresh context with no wallet and no session: `/c/<certification>`, `/c/<companion>`, `/u/<wallet>` |
| 8 | sign out, sign in again with the same wallet: same account, no nickname step, state kept |

Seeding touches only the user the wallet sign-in created: `itera.progress` + `itera.xp_events` for
days 1-4 (one per previous day) and day 5 except its last `single_choice` and its closing
`concept_reveal`, then `passport-sync.mjs` so the certification asset exists at 4/5.

## The fake Phantom

Implements `isPhantom`, `publicKey` (`toBase58` / `toString` / `toBytes`, `null` until connected),
`connect` (a silent `onlyIfTrusted` connect is rejected with code 4001 until the site was approved,
as Phantom does), `disconnect`, `on` / `off`, `signMessage` -> `{ signature, publicKey }`,
`signIn` (Sign-In-With-Solana: the wallet writes and signs the message),
`signTransaction`, `signAllTransactions`, `signAndSendTransaction(object)` and
`request({ method, params })` for `connect`, `disconnect`, `signMessage`, `signTransaction` and
`signAndSendTransaction` (`params.message` = base58 of a legacy message; the wallet signs it, sends
`[0x01][signature][message]` with `sendTransaction`, preflight on, and answers `{ signature }`).

Every call is printed as `WALLET [step] method(param keys) on <path>` and stored in
`results.json` under `providerCalls`: that list is what a real Phantom will be asked.

It is a stand-in, not a proof: a real Phantom may add instructions (priority fee, Lighthouse guards)
or refuse a legacy message through `request`. Only a manual run with the extension settles that.

## Rules

- Never point it at the owner's wallet account or at the demo e-mail user. The script refuses the
  owner's address and only ever signs in with the keypair it generated or was given.
- Each fresh run leaves one throwaway user behind and spends devnet SOL: about 0.01 SOL of the
  treasury (faucet) and the authority's fees for one companion, one certification, two medals and
  their updates.
