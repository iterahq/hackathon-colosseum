# Itera — proof of learning that lives in your wallet

Colosseum "Crypto World's Fair" submission by Tainan Fidelis and Samuel (DevFellowship, Brazil).
Everything on-chain runs on **Solana devnet**.

**Itera** is a Duolingo-style microlearning app for programming: five-day trails of short activities, real code
checks, five lives, and a green phoenix mascot, Tera, who explains every miss. The product existed before the
hackathon and runs in production with real cohorts (`iterahq/itera-player`). This repository is a copy made on
2026-10-09 on which the Web3 layer was built during the competition. What is new and what is inherited is
spelled out in [Built during the hackathon](#what-was-built-during-the-hackathon-vs-what-existed-before) and in
[`docs/hackathon/BUILT-DURING-HACKATHON.md`](docs/hackathon/BUILT-DURING-HACKATHON.md).

**Thesis.** A beginner needs proof they built themselves, that anyone can check. A PDF proves nothing; a wallet
does. So the learner's credential is a soulbound Metaplex Core asset that is alive: every finished day is a
stamp (an on-chain attribute update the server pays for), the fifth turns it gold, a public page verifies it with
no login, and the same wallet that holds it can dress it through cent-sized purchases that land on the asset.

## Try it

Live app: **https://hackathon-colosseum.178-105-2-230.sslip.io**

You need the Phantom wallet set to **devnet** (Settings > Developer Settings > Testnet Mode). The app has a
built-in devnet faucet, so an empty wallet can still pay for a first shop item.

1. Open the site, choose "Continue with Phantom" (English UI; the language switch is in the header) and sign the sign-in message (Sign in with Solana).
2. Pick a nickname when asked (first sign-in only).
3. Open a trail (for example Week 1 · HTML) and open a day. Finishing a whole day is what stamps it.
4. Finish the day. The stamp ceremony appears; the certification is minted or updated on devnet, and you pay nothing.
5. Open the certificate page (`/c/<asset>`; the `/passport` page has a copy-link button and `/u/<your wallet>` links each asset). It reads the
   asset from the chain with no login: owner, frozen (soulbound), `days_done`, collection, issuer. Open the
   Explorer link to compare.
6. Open the shop (`/shop`) and buy an item with devnet SOL (cent-sized). Phantom asks you to sign; the effect
   (a lens, an ink, a life) is then written to your assets. Your public profile is `/u/<your wallet>`.

A fresh account has day progress to earn; a full trail is 5 days of about 16 short activities each. A finished
example to open without playing: certificate
[`4WHw4G…ZdG`](https://hackathon-colosseum.178-105-2-230.sslip.io/c/4WHw4Ghkx5Uxk5nn6FJdSsWwuj1nkcnq3D1vXsy19ZdG)
(gold, 5/5).

## What is on-chain

| Object | Standard | Soulbound? | What changes on-chain, and when | Where to verify |
|---|---|---|---|---|
| Certification (one per learner and trail; the UI says "Certificações do Tera") | Metaplex Core asset, collection "Itera Passports" | Yes (`PermanentFreezeDelegate`, no authority) | Created on the first completed day. Each further day is an `updatePlugin` of its `Attributes` (`days_done`); the last day sets `tier = gold` and `completed_at`. Paid inks and frames, and teacher endorsements (max 3), are also attributes | `/c/<asset>`, `credential-verify`, Explorer |
| Medal | Core asset, collection "Itera Medals" | Yes | One asset per milestone: first stamp, 3 and 7 day streaks, program complete, early bird, night owl, weekly goal, live-class podium 1/2/3, invited | `/u/<wallet>`, Explorer |
| Tera companion (one per wallet learner) | Core asset, collection "Itera Companions" | Yes | Mirrors `lives`, `max_lives`, `outfit`, `level`, `xp`, `streak`, `avatar`. Written on purchase, equip, lesson end and when the last life is lost, rate limited. A gifted life shows as 6/5 | `/c/<asset>`, `/u/<wallet>` |
| Collectible Tera avatar | Core asset, collection "Itera Avatars" | **No**, transferable | Minted on a paid purchase, numbered, rarity pyramid with supply caps | `/c/<asset>`, Explorer |
| Shop payment | System transfer + Memo (intent id) | n/a | Learner wallet to treasury | Explorer, `purchase-confirm` |
| Circuito | System transfer + Memo `circuit:<purchase id>` | n/a | 50 % of each paid purchase, treasury to mint authority, to fund the stamps the server pays; public counter at `GET /circuit` | Explorer |

Addresses (devnet):

| Role | Address |
|---|---|
| Mint authority (pays and updates, update authority of every collection) | `CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B` |
| Treasury (receives payments, funds the faucet) | `AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA` |
| Collection "Itera Passports" (certifications) | `Eu6EyWEiDdCT7cKmVaGMeRFWvoNdUMGPVe1eou2du91b` |
| Collection "Itera Medals" | `2frN2YFtKLWK4LCiqWMHppoGexSye9qk9xWue6ARsmDb` |
| Collection "Itera Companions" | `BSRAqgdY6dUPgY2iFWY2SRrzs58ptRWTtpHQSsYzYcPu` (third entry of `issuer.collections` in the live `credential-verify` answer) |
| Collection "Itera Avatars" | `Gy4mSSquMaH278zLbGvCvaLS2RTPoZvAFTfHsw7qHAvr` |

Example assets:

- Gold certification, 5/5 HTML:
  [`4WHw4Ghkx5Uxk5nn6FJdSsWwuj1nkcnq3D1vXsy19ZdG`](https://explorer.solana.com/address/4WHw4Ghkx5Uxk5nn6FJdSsWwuj1nkcnq3D1vXsy19ZdG?cluster=devnet)
- Collectible avatar, "Tera · Iniciante #1" (transferable):
  [`CPA9cX4BTNbCWcJC2wsnFNdKTZdHdbCaukP1ueqSZiYw`](https://explorer.solana.com/address/CPA9cX4BTNbCWcJC2wsnFNdKTZdHdbCaukP1ueqSZiYw?cluster=devnet)
- Collection page of certifications:
  [`Eu6EyW…u91b`](https://explorer.solana.com/address/Eu6EyWEiDdCT7cKmVaGMeRFWvoNdUMGPVe1eou2du91b?cluster=devnet)

Assets minted before the display rename keep their on-chain name "Tera Passport · …". The keys, tables and attribute
keys still say `passport`; only user-facing text says "Certification".

## How a purchase works

1. **Intent.** The app calls `purchase-intent` with an item key. The server prices it in lamports from the catalog
   (fixed price, no live quote) and stores an intent.
2. **Server-built transaction.** The server builds a legacy transaction: a System transfer of exactly the price
   from the learner's wallet to the treasury, plus a Memo carrying the intent id. The browser needs no Solana library.
3. **The wallet signs.** Phantom signs and sends it (`signAndSendTransaction`). If a wallet will only sign,
   `purchase-submit` takes the signed transaction and broadcasts it after the same checks.
4. **On-chain verification.** `purchase-confirm` reads the transaction from the chain and checks payer, destination
   (treasury), amount and memo. A signature can settle one payment only (a ledger table enforces it).
5. **Effect.** The item handler grants the item in the database and writes its effect to the NFT: an ink or frame on
   the certification, an outfit or lives on the companion, or mints a numbered avatar. Half of the payment then goes
   from the treasury to the mint authority (Circuito).

**Trust model, plainly.**

- One server authority key mints, updates and mirrors. The learner holds the asset but cannot edit it.
- The database is the source of truth for game state (lives, progress, purchases). The companion's attributes are a
  mirror written at defined moments and can lag between them.
- Without trusting us, a verifier can read from the chain: that the asset sits in one of our collections, that the
  collection's update authority is the issuer key, who owns it, that it is frozen, and its attributes
  (`GET /credential-verify/<asset>` does exactly these checks, and anyone can repeat them in Explorer).
- **Grading runs on the server.** The player sends each answer to the `grade` function, which reads the exercise
  with the learner's own session, grades it and is the only writer of a completion; the database refuses a
  completion written by a client. Of the 234 activities of the demo program, 118 are graded on the server (choices,
  ordering, matching, fill-in code and the HTML exercises whose tests read the page or the source), 51 need a browser
  (gestures, computed style, simulated clicks) and are recorded as `self_reported`, and 65 have nothing to grade.
  A stamp says what stands behind it: the certification carries `server_verified` ("10/12") on chain and each
  capability claim commits to the hashes of the graded answers. Details and what this still does not prove:
  "Trust model" in [`docs/onchain-passport.md`](docs/onchain-passport.md).

## Architecture

```
 Browser SPA (React 19 + Vite, Phantom)
        |  HTTPS                         |  sign + send (Phantom)
        v                                v
 Supabase (project nyzcbnnbffsizshiolbh)        Solana devnet
   Auth (email, Sign in with Solana)              Metaplex Core: 4 collections,
   Postgres schema `itera` (RLS on)  <--- reads -- certifications, medals, companions, avatars
   Edge functions (Deno, 26) --- Umi + mpl-core ---> mint / updatePlugin(Attributes) / read
        ^         authority key + treasury key are function secrets
        |
 public readers: /c/<asset>, /u/<wallet>, Solana Action (Blink)
```

Edge functions in `supabase/functions/` (all have `verify_jwt = false` and check the token in code where marked):

| Function | Auth | Purpose |
|---|---|---|
| `passport` | user token (or service role for operator sync) | Computes awards from progress, mints and stamps certifications and medals |
| `credential-meta` | public | Metaplex metadata JSON and SVG art for every asset kind, plus avatar previews |
| `credential-verify` | public | Reads one asset from the chain and answers `verified` with the three checks |
| `learner-profile` | public | Every Itera asset a wallet holds, verified against the chain |
| `circuit` | public | Counter of the Circuito (stamps funded by purchases) |
| `action-gift` | public (Solana Action) | Blink: gift a life to a learner from any wallet |
| `shop-items` | user token optional | Catalog with ownership, prices, avatar supply |
| `purchase-intent` | user token | Builds the payment transaction |
| `purchase-confirm` | user token | Verifies the payment on chain and applies the item |
| `purchase-submit` | user token | Broadcasts a transaction the wallet only signed |
| `shop-claim` | user token | Takes an item earned (not bought) |
| `companion` | user token | Companion state, equip outfit or avatar |
| `lives` | user token | Lose a life, lesson-end bonus, mirror of the last life |
| `wallet-faucet` | user token | Devnet SOL for an empty wallet, one claim per learner and wallet, daily budget |
| `link-wallet` | user token | Bind a wallet to an e-mail account by signed message |
| `gifts` | user token | Gift a life in the app |
| `referral` | user token | Invite code and invite reward |
| `class-podium` | user token, staff only | Records a live class podium and mints medals |
| `endorse` | user token, staff only | Teacher endorsement written on a certification |
| `crystals` | user token | Phoenix Crystals: earned currency, spend, backgrounds, icon colours, borders, token mirror |
| `grade` | user token | Server-side grading: the answer is checked against the stored spec, an attempt row is written |
| `bounty-board` | public | Bounties a certification opens: list and detail, read without a login |
| `bounty-claim` | user token | Accept (gated by the certification read from chain) and submit work |
| `bounty-sponsor` | user token, staff only | Post, fund (escrow on devnet), approve or reject, refund |
| `bounty-action` | public (Solana Action) | Blink: fund a bounty from any wallet |
| `share-meta` | public | Link-preview HTML (Open Graph) for `/c`, `/u` and `/gift`, served to crawlers by nginx |

Migrations are in `db/migrations/` (see the next section for the hackathon ones). Shared pure logic with tests lives
in `supabase/functions/_shared/`.

## What was built during the hackathon vs what existed before

**Existed before (inherited from `itera-player`, not part of the judged work):** the lesson player and the activity
engine, the lesson and trail content, e-mail authentication, the Supabase schema up to migration 0109, the live-class
feature, the instructor and admin screens, subscription billing code (Stripe), the mobile shell, and the monorepo
tooling. Of the 2,493 tracked files at `main` when this was written, roughly 2,000 are TypeScript; the copy point already
contained about 2,000 files. The inherited product is large and is not claimed.

**Built during the hackathon** (2026-10-09 17:44 BRT to 2026-10-11, 82 commits after the copy point, merged PRs #1 to
#83; +64.6k / -5.2k lines in 802 files against the copy point; everything under `supabase/functions/` and 52 new
migrations 0110 to 0210; counts as of main `77dea24`, see the disclosure file for the exact list):

- Wallet auth: Sign in with Solana (Phantom), provisioning trigger, nickname step, link a wallet to an e-mail account.
- Credentials: Certifications (stamp per day, gold, server-paid, server-generated SVG art), medals, stamp ceremony,
  public verify page `/c/<asset>` and public profile `/u/<wallet>`.
- Companion and lives: Tera companion asset mirroring lives, outfit, level and avatar; lives rules (lose, regenerate,
  bonus); out-of-lives gate.
- Shop and payments: server-built transactions verified on chain, sign-only fallback, payments ledger, certification
  inks and frames, outfits, earned or bought laurel, devnet faucet, the Circuito.
- Avatars: free expressions and collectible NFT avatars with a rarity pyramid, supply caps, holds, lore, try-on and viewer.
- Social: gift a life (in the app and as a Solana Action / Blink), invite reward, teacher endorsement, live-class podium
  medals, weekly-goal medal.
- UX redesign: dashboard, learner header and global search, profile ("Meu Tera"), video-course library, lesson
  sounds and "try again", English copy and HTML trail content in English.
- Tests: unit tests for the pure on-chain modules, devnet end-to-end scripts, a browser end-to-end run with a fake Phantom.
- Security: hardening pass against a written review (pay-once-get-two, forgeable XP, client-written progress, unbounded
  authority-paid writes, referral farming, public Action cost, faucet limits, internal ids in public data), then a
  per-address rate limit counted in the database on the public endpoints.
- Phoenix Crystals: an earned, non-purchasable currency with a Token-2022 mirror, backgrounds, icon colours and borders.
- Proof of learning: server-side grading (`grade`), attempt rows with answer hashes, the share of server-verified
  activities written on the certification asset.
- Capability graph: named claims proven by a stamped day, written on the certification, lit on `/u/<wallet>` from chain data.
- Earn: bounties a certification opens, escrow per bounty on devnet, chain-gated accept, payout to the learner's wallet.
- Share and ship: link previews for the public pages, offline state, a manual test plan for a real Phantom
  (`docs/hackathon/PHANTOM-TEST.md`).

The full list of PRs, migrations and functions is in
[`docs/hackathon/BUILT-DURING-HACKATHON.md`](docs/hackathon/BUILT-DURING-HACKATHON.md).

## Run locally

Honest answer: **a judge cannot build this repository without registry access.** Dependencies under `@iterahq/*`
and `@devfellowship/*` are served by GitHub Packages (`.npmrc`: `@iterahq:registry=https://npm.pkg.github.com`,
token read from `NODE_AUTH_TOKEN`), and those packages are private. Please use the live site above.

For people who do have access: Node 22 (`.node-version`), `npm ci`, `npm run dev`.

- Browser variables (public by nature): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ITERA_API_BASE`.
  Nothing secret goes in a `VITE_*` variable.
- Edge function secrets: `SOLANA_AUTHORITY_SECRET`, `SOLANA_TREASURY_SECRET`, `SOLANA_RPC_URL`
  (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase).
- Migrations: `db/migrations/` (hackathon ones are 0110 to 0210). Functions: `supabase/functions/`, deployed with
  `supabase functions deploy <name> --project-ref <ref> --use-api`.
- Unit tests of the on-chain modules (no network, no secrets): `npx vitest run --config vitest.supabase.config.ts`.
- `scripts/hackathon/*.mjs` are end-to-end scripts against the deployed devnet backend (passport, purchase, gift,
  social, avatars, link-wallet, security attacks, browser run with a fake Phantom). They need operator credentials,
  **spend devnet SOL**, and are not required to evaluate the project. See [`docs/browser-e2e.md`](docs/browser-e2e.md).

## Known limits

- Devnet only. No real money moves. Prices are fixed in lamports with no live quote; mainnet would use USDC.
- The server authority pays for and signs every mint and stamp; key custody is a function secret, not a multisig.
- Grading of choice, fill, order, match and static code checks is server-side (`grade`), 118 of 234 activities. The
  answer keys of the simple kinds still reach the browser for instant feedback, so server grading stops forged
  completions, not copied answers. The 51 activities the server cannot grade (gestures, computed style, simulated
  clicks) are recorded as self-reported; a stamp states the share it verified ("10/12") instead of hiding it.
- Avatar transfers are not tracked for equip, and the new holder gets no row. Avatar refunds are manual.
- Some public functions have no per-IP rate limit (`credential-verify`, `credential-meta`, `learner-profile`; the
  Blink endpoint caps unpaid intents but has no per-IP limit). The public devnet RPC is rate limited.
- Assets minted before the security pass keep the internal learner id in their `learner` attribute until their next
  write; new writes use the wallet.
- The art of some legendary avatars is weaker than the rest; outfit layers were painted for the default Tera and may
  not sit exactly over other expressions.
- A real Phantom signing the server-built purchase message is not covered by the automated tests (a fake Phantom is);
  the sign-only path exists as a fallback.
- Public docs describe the behaviour at the time of writing; when a doc and the code disagree, the code wins.

## Team and license

Tainan Fidelis and Samuel, DevFellowship, Brazil.

License: no license file yet. The repository is shared with the judges for evaluation; the inherited product code
is proprietary to Itera.

---

## Notes for coding agents

> # ⚠️ HACKATHON REPO — `iterahq/hackathon-colosseum`
>
> This is **NOT** `iterahq/itera-player`. It is an independent copy made on
> 2026-10-09 for the Colosseum hackathon (Solana wallet login + on-chain
> achievement credentials).
>
> - **Supabase project:** `nyzcbnnbffsizshiolbh` ("Itera hackathon project", org
>   "Hackathon Itera"). Verify the project ref before ANY database action.
> - **Never** connect to, migrate or deploy against the Itera production project
>   `kjefmwlopzeaqgqtlbdn`, `app.iterahq.dev` or `api.iterahq.dev`.
> - **Never** push to or open pull requests against `iterahq/itera-player`. The
>   `upstream-readonly` remote is fetch-only.
> - There is no CI here on purpose. Verify locally before merging.
> - Everything below this banner is inherited from itera-player and may describe
>   workflows, gates and environments that do not exist in this repo.
