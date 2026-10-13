# Itera — proof of learning that lives in your wallet

Colosseum "Crypto World's Fair" submission by Samuel Stefano (DevFellowship, Brazil).
Everything on-chain runs on **Solana devnet**.

**Itera** is a microlearning app for programming: short daily lessons of 5 to 15 minutes, hands-on activities
with a real code editor, and a green phoenix mascot, Tera. The product existed before the hackathon and runs in
production with real cohorts (`iterahq/itera-player`). This repository is a copy made on 2026-10-09 on which the
Web3 layer was built during the competition. What is new and what is inherited is spelled out in
[Built during the hackathon](#what-was-built-during-the-hackathon-vs-what-existed-before) and in
[`docs/hackathon/BUILT-DURING-HACKATHON.md`](docs/hackathon/BUILT-DURING-HACKATHON.md).

**Thesis: learn, prove, own.** A beginner needs proof they built themselves, that anyone can check. A PDF proves
nothing; a wallet does. So the learner's certification is a soulbound Metaplex Core asset that is alive: every
finished day is a stamp (an on-chain attribute update the server pays for), the fifth turns it gold, and a public
page verifies it with no login. The same wallet buys a Tera avatar with a cent-sized payment in SOL.

## Try it

Live app: **https://hackathon.iterahq.dev**
(the same deployment also answers at `https://hackathon-colosseum.178-105-2-230.sslip.io`, the address of the
example links below).

You need the Phantom wallet set to **devnet** (Settings > Developer Settings > Testnet Mode). When a wallet is short
for a small purchase, the purchase dialog offers the built-in devnet faucet.

1. Open the site and choose "Connect Wallet". Phantom opens; confirm the sign-in message (Sign in with Solana).
   There is no e-mail and no password.
2. The header has four tabs: Trails, Certifications, World, Shop.
3. In Trails, open Week 1 · HTML and then Day 1. Day 1 is four short activities: an X-ray of a page, a multiple
   choice, a matching exercise and a code editor with a live preview. The other days have about 16 activities each.
4. Finish the day. An activity you missed comes back at the end; nothing is lost for a miss. The day is then stamped:
   the certification is minted or updated on devnet, and you pay nothing. A chest opens with a Tera avatar.
5. Open Certifications. The HTML certification shows what you have proven and what is left, and links to the asset.
   The public page `/c/<asset>` reads it from the chain with no login: owner, frozen (soulbound), `days_done`,
   collection, issuer. Open the Explorer link to compare. `/u/<your wallet>` is your public profile.
6. Open Shop and buy a Tera with devnet SOL (from about US$ 0.20). Phantom shows the amount and asks you to confirm;
   the purchase dialog links to the transaction. The avatar is then yours to wear on your profile and in World.

A finished example to open without playing: certificate
[`4WHw4G…ZdG`](https://hackathon-colosseum.178-105-2-230.sslip.io/c/4WHw4Ghkx5Uxk5nn6FJdSsWwuj1nkcnq3D1vXsy19ZdG)
(gold, 5/5).

### What the live build shows, and what this README also documents

The live app is a **focus build** (`src/config/focus.ts`, on unless the build sets `VITE_FOCUS_BUILD=off`). It
shows one loop, learn → prove → own, and hides everything beside it:

- **Hidden in the live app:** lives (no hearts, a miss is redone), Phoenix Crystals, the life gift, the Circuit
  mention in the shop, the video courses, the live classes and the subscription pages.
- **Out of the landing and the home, still answering by URL:** the bounties (`/bounties`), the talent board
  (`/talent`) and the escrow proof (`/verify`).
- **The Web3 on Solana trails** are listed on the home as coming next and have no activities yet.

Nothing was deleted: the code, the server functions and the on-chain programs of the hidden surfaces are in this
repository and are described in the sections below. Where a section mentions lives, crystals, the gift Blink or
bounties, it describes code that exists and is switched off or unlinked in the live build.

## What is on-chain

| Object | Standard | Soulbound? | What changes on-chain, and when | Where to verify |
|---|---|---|---|---|
| Certification (one per learner and trail; the UI says "Certificações do Tera") | Metaplex Core asset, collection "Itera Passports" | Yes (`PermanentFreezeDelegate`, no authority) | Created on the first completed day. Each further day is an `updatePlugin` of its `Attributes` (`days_done`); the last day sets `tier = gold` and `completed_at`. Paid inks and frames, and teacher endorsements (max 3), are also attributes | `/c/<asset>`, `credential-verify`, Explorer |
| Medal | Core asset, collection "Itera Medals" | Yes | One asset per milestone: first stamp, 3 and 7 day streaks, program complete, early bird, night owl, weekly goal, live-class podium 1/2/3, invited | `/u/<wallet>`, Explorer |
| Tera companion (one per wallet learner) | Core asset, collection "Itera Companions" | Yes | Mirrors `lives`, `max_lives`, `outfit`, `level`, `xp`, `streak`, `avatar`. Written on purchase, equip, lesson end and when the last life is lost, rate limited. A gifted life shows as 6/5 | `/c/<asset>`, `/u/<wallet>` |
| Collectible Tera avatar | Core asset, collection "Itera Avatars" | **No**, transferable | Minted on a paid purchase, numbered, rarity pyramid with supply caps | `/c/<asset>`, Explorer |
| Shop payment | System transfer + Memo (intent id) | n/a | Learner wallet to treasury | Explorer, `purchase-confirm` |
| Bounty escrow (one account per bounty) | Program-derived account of the Itera escrow program (`programs/bounty-escrow`, native Solana program) | n/a | Created when a sponsor locks a reward, in one of three layouts: 195 bytes (attested), 228 (gated), 260 (direct). `accept` is signed by the learner's own wallet (the treasury only pays the fee) and the **program** reads their certification account: owner and collection in all three. Gated and direct bounties also read the certification's plugins (frozen, Attributes under the update authority, trail hash, `days_done` against the bounty's minimum) and no attester co-signs; a direct bounty accepts only its invited wallet. An attested bounty does not read the days: the approver or Itera's attester key co-signs and vouches for them. The learner's wallet signs the give-up too; `release` pays the recorded wallet once, signed by the approver; `refund` returns to the sponsor. The account stays on chain saying `paid` and to whom | `/bounties/<slug>`, Explorer |
| Circuito | System transfer + Memo `circuit:<purchase id>` | n/a | 50 % of each paid purchase, treasury to mint authority, to fund the stamps the server pays; public counter at `GET /circuit` | Explorer |

Addresses (devnet):

| Role | Address |
|---|---|
| Mint authority (pays and updates, update authority of every collection) | `CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B` |
| Treasury (receives payments, funds the faucet, funds DevFellowship's bounties, signs the escrow program's calls) | `AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA` |
| Collection "Itera Passports" (certifications) | `Eu6EyWEiDdCT7cKmVaGMeRFWvoNdUMGPVe1eou2du91b` |
| Collection "Itera Medals" | `2frN2YFtKLWK4LCiqWMHppoGexSye9qk9xWue6ARsmDb` |
| Collection "Itera Companions" | `BSRAqgdY6dUPgY2iFWY2SRrzs58ptRWTtpHQSsYzYcPu` (third entry of `issuer.collections` in the live `credential-verify` answer) |
| Collection "Itera Avatars" | `Gy4mSSquMaH278zLbGvCvaLS2RTPoZvAFTfHsw7qHAvr` |
| Bounty escrow program (upgrade authority: the mint authority above; approver of every bounty: the treasury above) | `ETeJkm9QrVgMuaMdAV6aLkFZGLDX6pMcniAXu8rcBqhq` |

Example assets:

- Gold certification, 5/5 HTML (minted before server grading; carries the claim hashes but no `server_verified`):
  [`4WHw4Ghkx5Uxk5nn6FJdSsWwuj1nkcnq3D1vXsy19ZdG`](https://explorer.solana.com/address/4WHw4Ghkx5Uxk5nn6FJdSsWwuj1nkcnq3D1vXsy19ZdG?cluster=devnet)
- Certification with server-verified share and claim hashes (`server_verified` = `10/12`, claims `html-skeleton` and
  `html-tags`): [`Eedhtwu3Y2he54nSc4BcT11xNnXqCnJJEANyfL3W4dqa`](https://explorer.solana.com/address/Eedhtwu3Y2he54nSc4BcT11xNnXqCnJJEANyfL3W4dqa?cluster=devnet)
  (`/c/Eedhtwu3Y2he54nSc4BcT11xNnXqCnJJEANyfL3W4dqa`). It is bronze, one day of five, and its wallet took a bounty during
  our own runs. Treat it as a team test account: by "Known limits" no certification other than the owner's is a real
  learner's.
  No gold 5/5 certification with `server_verified` was found at the time of writing.
- A bounty paid by the escrow program (accept, delivery, approval, payout, each with its transaction):
  [`/bounties/e2e-ui-mv3bd099`](https://hackathon-colosseum.178-105-2-230.sslip.io/bounties/e2e-ui-mv3bd099)
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
- **Bounties: what the chain decides and what the server decides.** The reward of a bounty sits in an account of
  the escrow program `ETeJkm9QrVgMuaMdAV6aLkFZGLDX6pMcniAXu8rcBqhq`. The program decides where that money can go:
  only to a wallet that owns a certification of the collection the bounty names (it reads the asset account
  itself), only once, or back to the sponsor recorded when the bounty was funded. What the program reads beyond that
  depends on the layout of the bounty's account. **Gated and direct bounties** (228 and 260 bytes) name a trail and
  a minimum number of stamped days in their terms, and `accept` reads them from the certification itself: it must
  be frozen, its Attributes must sit under the update authority (the owner cannot write them), its `program` and
  `trail` must hash to the bounty's trail, and `days_done` must reach the minimum. No attester co-signs these. A
  direct bounty also names one invited wallet, and the program refuses every other (`NotInvited`). **The older
  attested layout** (195 bytes) names no days: the program reads only owner and collection, and the bounty's
  approver or Itera's attester key (the treasury) must co-sign the accept and vouch for the days. The server decides
  the rest: the deadlines, which layout each bounty uses (recorded as `escrow_gated`), when to pay its own bounties, and (through the sponsor's
  staff) whether a delivery is approved. **The learner's wallet signs the accept and the give-up** (fee paid by the
  treasury, so it needs no SOL); the program records nobody without their signature, and the first accept that
  lands wins a race. The treasury is the approver of Itera's own bounties and the attester of the older layout: as
  approver it can refuse or delay a payout, reopen a claim (`unclaim`) and refund a bounty of its own early; as
  attester it can only co-sign an accept or reopen a claim. Neither can redirect a reward, nor move the reward of a
  bounty another wallet posted. Anyone can check all of this at `/verify` (program source, IDL, deployed-code hash, raw accounts). **The program is upgradeable and its upgrade
  authority is the Itera authority key**, a single key held as a function secret: whoever holds it could replace
  the program and, with it, every rule above. On devnet that is deliberate, to fix bugs during the hackathon; it is
  the first thing to remove (or hand to a multisig) before real money. Full model:
  [`docs/onchain-bounties.md`](docs/onchain-bounties.md).
  **Direct bounty:** from a learner's card on `/talent` a company can lock a reward for ONE wallet; the program refuses any
  other wallet (`NotInvited`, 6020), and `/verify#gate` lets anyone watch it refuse.
- **Grading runs on the server.** The player sends each answer to the `grade` function, which reads the exercise
  with the learner's own session, grades it and is the only writer of a completion; the database refuses a
  completion written by a client. Of the 234 activities of the demo program, 118 are graded on the server (choices,
  ordering, matching, fill-in code and the HTML exercises whose tests read the page or the source), 51 need a browser
  (gestures, computed style, simulated clicks) and are recorded as `self_reported`, and 65 have nothing to grade.
  A stamp says what stands behind it: a certification stamped after the grading change carries `server_verified` ("10/12") on chain and each
  capability claim commits to the hashes of the graded answers; the featured gold example below predates it and
  carries the claim hashes without `server_verified`. Details and what this still does not prove:
  "Trust model" in [`docs/onchain-passport.md`](docs/onchain-passport.md).

## Architecture

```
 Browser SPA (React 19 + Vite, Phantom)
        |  HTTPS                         |  sign + send (Phantom)
        v                                v
 Supabase (project nyzcbnnbffsizshiolbh)        Solana devnet
   Auth (email, Sign in with Solana)              Metaplex Core: 4 collections,
   Postgres schema `itera` (RLS on)  <--- reads -- certifications, medals, companions, avatars
   Edge functions (Deno, 34) --- Umi + mpl-core ---> mint / updatePlugin(Attributes) / read
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
| `bounty-post` | public read of the form options; user token for every action | A wallet's own bounty: draft, fund, approve, reject, refund, submit work, report; also direct bounties and the check of an invited wallet |
| `capability-graph` | public | A wallet's capability graph from our tables, with no chain read: claims read `recorded`, not `verified` |
| `credential-archive` | public (rate limited) | Permanent Arweave copies of a certification's picture, metadata and claim evidence: `GET` lists them, `POST` uploads what is new |
| `gate-check` | public | Simulates the escrow program's `accept` for any wallet so anyone can watch it refuse; `?send=1` sends it for real with a throwaway key and Itera pays the fee |
| `lesson` | user token (the lesson is read as the caller, under row level security) | The lesson a learner plays; the exercise specs are sealed before they leave |
| `privacy` | user token | The caller's own privacy: the public-profile switch, their talent-board contact, how many companies looked |
| `talent-board` | public read; user token to list, unlist, or (company only) reveal a contact | Opt-in listing of learners built from chain facts, with filters; a contact is shown only to a company, capped and recorded |
| `tera-chest` | public read of one chest or `rules`; user token to list own chests and settle a day's chest | The day chest of a stamped day: the committed roll, its recomputation, and the settle that mints an earned Tera |

Migrations are in `db/migrations/` (see the next section for the hackathon ones). Shared pure logic with tests lives
in `supabase/functions/_shared/`.

## What was built during the hackathon vs what existed before

**Existed before (inherited from `itera-player`, not part of the judged work):** the lesson player and the activity
engine, the lesson and trail content, e-mail authentication, the Supabase schema up to migration 0109, the live-class
feature, the instructor and admin screens, subscription billing code (Stripe), the mobile shell, and the monorepo
tooling. Of the 3,069 tracked files at `main` when this was written, 2,449 are TypeScript; the copy point already
contained 1,999 files, 1,571 of them TypeScript. The inherited product is large and is not claimed.

**Built during the hackathon** (2026-10-09 17:44 BRT to 2026-10-12, 266 commits after the copy point, merged PRs numbered up to
#270; +109.0k / -6.3k lines in 1,276 files against the copy point; everything under `supabase/functions/` (34 functions)
and 81 new migration files, 0110 to 0355; counts as of main `8c24bf0`, see the disclosure file for the exact list):

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
- Earn: bounties a certification opens. An on-chain escrow program (`programs/bounty-escrow`) holds each reward, checks
  the certification account in `accept` and pays only that wallet; sponsor console, funding blink, automatic refund
  of expired bounties.
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
- Migrations: `db/migrations/` (hackathon ones are 0110 to 0355). Functions: `supabase/functions/`, deployed with
  `supabase functions deploy <name> --project-ref <ref> --use-api`.
- Unit tests of the on-chain modules (no network, no secrets): `npx vitest run --config vitest.supabase.config.ts`.
- `scripts/hackathon/*.mjs` are end-to-end scripts against the deployed devnet backend (passport, purchase, gift,
  social, avatars, link-wallet, security attacks, browser run with a fake Phantom). They need operator credentials,
  **spend devnet SOL**, and are not required to evaluate the project. See [`docs/browser-e2e.md`](docs/browser-e2e.md).

## Known limits

- Devnet only. No real money moves. Prices are fixed in lamports with no live quote; mainnet would use USDC.
- Every account in this database was created during the hackathon: three belong to people (the owner's wallet, a demo
  e-mail, the sponsor e-mail) and the rest are our own test runs (tagged in `itera.test_accounts`). One real certification
  exists (the owner's, eight claims on chain) and no bounty has been paid to a real learner. The Circuito
  counters on the landing page and in the shop include those test runs: on 2026-10-12 `GET /circuit` answers 369 stamps
  written on chain (`stamps_issued`, the landing tile; 13 outside the tagged test accounts) and 11,605 stamps funded
  (`stamps_funded`, the shop line; 715 outside). These are different numbers: "written" counts minted day stamps, while
  "funded" is a capacity, the half of each purchase moved to the mint authority divided by the 5,000-lamport fee of
  one stamp, so it is not a count of stamps that exist. A profile's line "cover the network fee of up to N stamps" is the
  same capacity for that wallet's own purchases. What is true is that the whole loop runs end to end on devnet and anyone can verify every step.
- The server authority pays for and signs every mint and stamp; key custody is a function secret, not a multisig.
- Grading of choice, fill, order, match and static code checks is server-side (`grade`), 118 of 234 activities. The
  answer keys of the simple kinds still reach the browser for instant feedback, so server grading stops forged
  completions, not copied answers. The 51 activities the server cannot grade (gestures, computed style, simulated
  clicks) are recorded as self-reported; a stamp states the share it verified ("10/12") instead of hiding it.
- Bounties: the program reads the stamped days only for gated and direct bounties; in the older attested layout the
  approver or Itera's attester key vouches for them. There is one approver key per bounty and the program is
  upgradeable by one key. There is no dispute path: a rejected delivery reopens the bounty and the learner sees the
  sponsor's note. Rewards are devnet SOL. An approved delivery is a human judgement, not a proof.
  - Creating a bounty's escrow account uses `create_account` at an address fixed by the bounty's terms. If someone
    sends lamports to that address before it is funded, the creation fails and the sponsor must post the bounty
    again. No funds are at risk: the failed transaction moves nothing.
  - The escrow protects the sponsor's money more than the worker's time. After a learner has delivered, the approver
    can still `unclaim` (reopening the bounty and clearing the claimant) and then `refund` the sponsor, so the
    learner is paid nothing. The approver cannot pay any wallet but the recorded claimant, cannot pay twice, and
    cannot pay an uncertified wallet; it can only choose whether and when to `release`, or take the claim back.
    Nothing on chain obliges it to pay a delivery.
  - Accepting a gated bounty is permissionless on chain: the claimant signs and the program reads the certification,
    and nothing else. Rules only the server enforces (one open claim per learner, not your own bounty) can be
    bypassed by calling the program directly. `release` still follows the approver, so this allows squatting on a
    bounty, not theft. A claimed bounty can be reopened by the claimant, the approver or the attester; if none of
    them acts, an expired claimed bounty cannot be refunded (`refund` needs it open) and its funds stay stranded
    until one of them does, for instance if the approver and attester keys are lost. There is no instruction that
    closes an escrow account, so each bounty's rent (about 0.0016 SOL) stays locked in it.
- Privacy: a private profile hides this site's summary of a wallet, not the wallet's assets, which anyone can list on
  chain. A contact on the talent board is shown to "companies", and a company is any wallet that funded one bounty:
  on devnet that costs effort, not money. Reads are capped (10 learners a day) and recorded, and leaving the board
  deletes the contact. See [`docs/privacy.md`](docs/privacy.md).
- Avatar transfers are not tracked for equip, and the new holder gets no row. Avatar refunds are manual.
- Teras: an earned Tera's roll can be recomputed by anyone, but one key writes every commitment (it could commit a day
  twice; every write is public), the effort level and the list of Teras a learner already holds are our server's word,
  and devnet prunes old blocks. The 5% resale fee is a Core Royalties plugin: a marketplace that honours it pays, a
  plain transfer does not. The escrow program knows nothing about a bounty's prize Tera: our server mints it after the
  payout and only if the funding paid for it. See [`docs/onchain-teras.md`](docs/onchain-teras.md).
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

Samuel Stefano, DevFellowship, Brazil.

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
