# Bounties ("Missões pagas"): a certification opens a paid door

Train -> prove -> **earn**. A sponsor posts a small real task with a reward in devnet SOL. The reward is
locked on chain before anyone can take the task. Only a wallet whose **on-chain certification** shows
the required stamped days may accept. The learner delivers a link, the sponsor approves, and the escrow
pays the learner's wallet. Every step has an explorer link.

Devnet only. The reward is held by an **on-chain program** (`programs/bounty-escrow`, id
`ETeJkm9QrVgMuaMdAV6aLkFZGLDX6pMcniAXu8rcBqhq`). See "Trust model" for exactly what the program enforces and
what the server still decides.

```
sponsor ── create ──► bounty (awaiting_funding) ── fund ──► open ── accept (chain gate) ──► claimed
                                                             ▲                                  │ submit
                                                reject / withdraw / claim expired               ▼
                                 refunded ◄── refund ── open             paid ◄── approve ── submitted
```

## Files

| Path | What |
|---|---|
| `db/migrations/0202_bounty_refund_schedule.sql` | The ten-minute job that refunds expired bounties |
| `src/lib/loginReturn.ts` | The sign-in link that brings a visitor back to the bounty they came from |
| `db/migrations/0201_bounty_escrow_program.sql` | `onchain_config.bounty_escrow_program`: with it, new bounties are held by the program |
| `db/migrations/0200_bounties.sql` | `itera.bounties`, `bounty_claims`, `bounty_events`, and the five functions that are the only writers of a status |
| `supabase/functions/_shared/bounty.ts` | Pure rules: eligibility, amounts, the transfer decision, form checks, public views, the Action texts |
| `programs/bounty-escrow/src/lib.rs` | The escrow program (native Solana program, no framework): create, create_gated, create_direct, accept, release, unclaim, refund |
| `.github/workflows/bounty-escrow-build.yml` | Builds the program on a runner (the dev box has no room for the SBF toolchain). Not a gate |
| `supabase/functions/_shared/bounty-program.ts`, `solana-message.ts` | The program's instructions and account layout; a legacy message compiler and PDA derivation |
| `supabase/functions/_shared/bounty-chain.ts` | Reads the escrow account, plans and sends the program calls |
| `supabase/functions/_shared/bounty-escrow.ts` | The server-held escrow of bounties posted before the program (`escrow_kind = derived_account`) |
| `supabase/functions/_shared/bounty-store.ts` | Reads, the funding check, the chain read of a wallet's certifications, `settleTransfer` |
| `supabase/functions/bounty-board` | Public: the board, one bounty with its ledger, what a wallet earned |
| `supabase/functions/bounty-claim` | Learner (JWT): status, accept, submit, withdraw |
| `supabase/functions/bounty-sponsor` | Staff (JWT): list, create, fund from treasury, approve, reject, refund |
| `supabase/functions/bounty-action` | Solana Action (blink): any wallet funds a bounty's escrow account |
| `supabase/functions/bounty-post` | Any wallet (JWT): post a bounty, the transactions it signs to fund / approve / refund, reject, report |
| `db/migrations/0240_bounty_wallet_sponsors.sql` | `origin`, `sponsor_wallet`, `approver_address`, English slugs, moderation, reports |
| `docs/hackathon/bounties-seed.json` | The four bounties DevFellowship posted |
| `db/migrations/0340_bounty_direct.sql` | `bounties.invitee_wallet`, its check and index; `bounty_accept` answers `not_invited` |
| `db/migrations/0341_bounty_escrow_direct_version.sql` | `onchain_config.bounty_escrow_version = 4`: the deployed program has direct bounties |
| `programs/bounty-escrow/tests/direct.rs` | The program's direct paths, run natively with the runtime's three calls stubbed |
| `scripts/hackathon/bounty-direct-e2e.mjs` | A direct bounty end to end on devnet, the refusals by the program included |

## Escrow

### The escrow program (`escrow_kind = program`, every bounty posted now)

One program-derived account per bounty holds the reward. Its seeds are `["bounty", <16 bytes of the bounty id>,
sponsor, approver, collection, amount (u64 LE), expires_at (i64 LE)]`: **the address commits to the terms**. An
account at a bounty's address can only have been created with exactly the terms the bounty was posted with, so
nobody can occupy it with others; creating it is funding it. (The four bounties funded before this rule sit at
addresses derived from the id alone; their accounts already exist with our terms.) The account holds the reward
and 195 bytes of state: status, sponsor (the refund destination), approver, the certification collection,
amount, expiry, claimant and the certification that qualified them.

| instruction | signer | what the PROGRAM checks |
|---|---|---|
| `create(id, amount, expires_at)` | funder | the account is the PDA of these exact terms and does not exist; amount > 0; expiry in the future. Moves `amount` + rent from the funder |
| `accept` | an attester (the approver, or Itera's attester key) **and the claimant** | the claimant signed (`claimant_must_sign` otherwise); the bounty is open and not expired; the certification account is owned by Metaplex Core, is an `AssetV1`, **its owner is the claimant** and **its collection is the one the bounty names**. Records claimant and certification |
| `release` | approver | the bounty is claimed and the account passed is the recorded claimant. Pays `amount`, marks `paid` |
| `unclaim` | the recorded claimant, the approver, or Itera's attester key | the bounty is claimed. Reopens it and clears the claimant |
| `refund` | approver or sponsor; **any signer once the bounty is past its expiry** | the bounty is open and the destination is the recorded sponsor. Pays `amount`, marks `refunded` |

The account is never closed: after a payout it stays on chain saying `paid`, to whom, with which
certification. The approver (the Itera treasury key on Itera's own bounties, the sponsor's wallet on a bounty a
wallet posted) chooses **when** the reward is paid; it cannot choose a destination, pay a wallet that holds no
Itera certification, or pay twice. Itera's attester key (`ITERA_ATTESTER` in `lib.rs`, the treasury address) may
co-sign an `accept` and reopen a claim on any bounty; it can move no reward it is not also the approver or sponsor of.

**Who signs what (since the upgrade of 2026-10-11, slot 509884700).** The learner's own wallet signs `accept` and
the `unclaim` of a withdrawal. The wallet holds no SOL: the transaction's fee payer is the treasury, which signs
after the wallet did (`_shared/cosign.ts`). The page's ledger says, per step, which wallet signed
(`bounty_events.signer`), and says when a step is only our own record (a delivery, a step from before the upgrade).

- **Funding.** The treasury button and the blink both send `create`. A bounty opens when its account
  exists on chain with the terms it was posted with (our approver, the refund address, the passports
  collection, at least the reward, the expiry). An account someone created with other terms is ignored.
- **Accept.** `accept_prepare` answers a transaction (the program's `accept` and the memo; fee payer = treasury)
  for the learner's wallet to sign; `accept_submit` takes the signed message back, checks it is the one offered
  (same instructions in order; the only additions tolerated are a wallet's own compute-budget instruction with a
  capped price and Lighthouse assertions, none naming the fee payer), verifies the wallet's signature, adds the
  treasury's and sends. **The chain picks the winner of a race**: the program records the first accept that lands
  and refuses the rest (`not_open`); our tables record it afterwards, and reopen the account if they cannot.
- **Withdraw.** Same two steps with the program's `unclaim`, signed by the wallet that holds the bounty. Our tables
  let the claim go only after the account stopped naming the learner. A learner with SOL can send that `unclaim`
  without us; the page follows on its next read (`syncWithEscrow`).
- **Out of time, rejected.** When a claim ends without the learner, the server reopens the account at once with the
  attester key (`unclaimOnChain`); the transaction lands on that step's ledger row.
- **Payout / refund.** `settleTransfer` reads the account and sends what is missing to get there
  (`releasePlan`, `refundPlan` in `bounty-chain.ts`): a claim our tables already let go of is released on
  chain in the same transaction. An account that already says `paid` to this claimant only gets recorded.
- **Cost.** The funder pays the reward plus the rent of the account (about 0.0016 SOL), which stays in it.

Built on a GitHub runner (`bounty-escrow-build`), deployed by hand with the authority key as upgrade
authority: `solana program deploy --program-id <keypair> itera_bounty_escrow.so`. The upgrade authority
could replace the program; on devnet it is kept so a bug can be fixed during the hackathon.

### Server-held accounts (`escrow_kind = derived_account`, bounties posted before the program)

Each such bounty has its own system account on chain, `escrow_address`, whose key is derived on the
server (HMAC-SHA256 of the bounty id under the treasury seed) every time it is needed and stored nowhere.
It opens when the account holds `reward + 5000` lamports; payout and refund are one transfer that sends
the whole balance minus the fee, so the account ends at zero and a second payout cannot land. It is a
custodial escrow with a public ledger, and the UI says so on those bounties.

### Both kinds

- **In flight.** `settleTransfer` is the only code that sends a payout or a refund. One request at a time
  holds a lease on the row; the signature is recorded as soon as the node accepts the transaction; a
  signature that may still land is never sent again.
- **Where money can go.** A payout goes to the wallet recorded when the claim was accepted. A refund goes
  to `refund_address`, fixed when the bounty was created. No request parameter chooses a destination.
- **Treasury money** only enters an escrow whose refund returns to the treasury.
- Every transaction carries a memo, `itera-bounty:<id>:fund|accept|withdraw|expired|rejected|payout|refund`.

Currency is **devnet SOL**. Devnet USDC only comes from a captcha faucet, which neither the sponsor nor a
judge can refill on demand.

## Direct bounty: a reward locked for one invited wallet

A sponsor's wallet posts a bounty addressed to ONE learner wallet, the `invitee`. Everything else is a gated bounty a
wallet posted: the sponsor's wallet funds it, is its refund destination and its approver; the invitee accepts with
its own signature, delivers, and is paid by the sponsor's `release`.

**Why the program has to enforce it.** A gated escrow account needs no attester on `accept`: the program reads the
stamped days itself. So "only the invitee may accept" written only in our server would stop nobody: any wallet with
the certification and a little SOL could send `accept` to the program directly. The invitation is therefore a term of
the escrow account.

**Layout and address.** `create_direct` (instruction tag 6) takes the data of `create_gated` followed by the 32 bytes
of the invitee (97 bytes after the tag) and the same six accounts. The account is 260 bytes, tag 3: the 228 bytes of
a gated account, then `invitee` at offset 228.

```
seeds = ["bounty", id (16), sponsor, approver, collection, amount (u64 LE), expires_at (i64 LE),
         min_days (1), trail (32), invitee (32)]          10 seeds + the bump, each 32 bytes or less (limit: 16)
```

The address commits to the invitee like to every other term: an account at a direct bounty's address can only have
been created for that wallet, and the same terms without an invitee (or with another) live at another address.

| instruction on a direct account | signer | what the PROGRAM checks |
|---|---|---|
| `create_direct(id, amount, expires_at, min_days, trail, invitee)` | funder (the sponsor's wallet) | what `create_gated` checks, with the invitee in the seeds; `min_days` at least 1 |
| `accept` | the claimant alone | the claimant signed; **the claimant is the invitee the account names, else `NotInvited` (6020)**; open; not expired; the certification is a Core asset owned by the claimant, in the collection the bounty names, frozen, of the trail in the terms, with `days_done >= min_days`. An attester co-signing changes nothing |
| `release`, `unclaim`, `refund` | as on any bounty | as on any bounty. `unclaim` leaves the invitee in place; past the expiry anyone may send `refund` and the money goes to the recorded sponsor |

`NotInvited` is answered before the certification is looked at: a wallet that was not invited learns nothing else.
The invitee still has to qualify: an invited wallet without the stamped days is refused with the gated errors.

**Who checks what.**

| | the program (on chain) | the server |
|---|---|---|
| Only the invitee may hold the bounty | yes: `accept` | also: `bounty-claim` answers `403 not_invited` before preparing anything, `bounty_accept` (SQL) answers `not_invited` |
| The invitee holds the certification and the days | yes: read from the asset account | read first (`eligibilityOf`) so the page can say why not |
| The invitee is not the sponsor | no (the program would allow it) | yes: `own_invitee` at posting, a check constraint on the row, `own_bounty` at accept |
| Where the money can go | the invitee (after `release` by the sponsor) or the sponsor | builds the unsigned transactions; holds no key of this money before the expiry |
| That the public board does not list it | n/a (the account is public on chain) | yes: `listBounties` leaves rows with an invitee out |

The view of a bounty says `direct: true`, `invitee_wallet` and `invite_enforced_by: "program"`. A direct bounty is not
secret: its page by slug is public, its escrow account names the invitee on chain, and `GET bounty-board/invited/<wallet>`
lists what was addressed to a wallet. What the board hides is the offer, from wallets that could not take it.

**A direct bounty is "open" only when its account exists with exactly these terms**, invitee included
(`matchesTerms`). An account with the same id for another wallet, or with no invitee, is not this bounty's escrow.

**Counters.** Direct bounties are not in the board's list or in `open_count` / `locked_*` / `paid_*`. `stats` carries
them apart: `direct_open`, `direct_held`, `direct_locked_lamports|sol`, `direct_paid`, `direct_paid_lamports|sol`, and
`direct_team_test` (how many of those the team's own test accounts posted or were paid for). `open_on_chain_count`
counts the 260-byte accounts too, and `hidden_test_count` subtracts the direct ones the stats already name. A paid
direct bounty counts in what its payee earned (`bounty-board/wallet/<address>`), like any other.

**Expiry.** Nothing special: past `expires_at` the sweep (`sweepExpired`, every ten minutes) sends the program's
`refund` with Itera's key and the money returns to the sponsor's wallet. Proven on devnet by `bounty-direct-e2e.mjs`.

**Posting.** `bounty-post` `create` with `invitee_wallet`; before it, `invitee_check` tells the form whether that
wallet is a learner's and holds the days today, so nobody locks money for a wallet that cannot accept. Posting needs
`onchain_config.bounty_escrow_version >= 4` (`503 direct_unavailable` otherwise). The team console (`bounty-sponsor`)
posts no direct bounties.

**Not built.** Changing the invitee of a posted bounty (refund it and post another); inviting more than one wallet;
a notification to the invitee (the inbox is a read).

## Bounties posted by any wallet (`origin = wallet`)

> A wallet may add a **sponsor Tera** as the prize of its bounty (`prize_tera` on `create`): paid for in the funding
> transaction, minted soulbound to the learner when the payout is recorded. The program is unchanged and does not know
> about it. See [`onchain-teras.md`](onchain-teras.md), "The sponsor Tera".

`/bounties/post` is open to any signed-in wallet; `/bounties/mine` is that wallet's console. Function: `bounty-post`.

- **Who holds what.** The escrow account is created by a transaction whose only signer is the sponsor's wallet. The
  program records that wallet as `sponsor` (the refund destination) **and** as `approver` (the only key `release`
  accepts). The Itera treasury key is in no instruction that moves this money. The server builds unsigned
  transactions (`fund_tx`, `approve_tx`, `refund_tx`) and reads the escrow account afterwards (`confirm`); a request
  never says what happened, the account does.
- **Accept** needs the learner's signature plus an attester (the bounty's approver or the Itera treasury as
  `ITERA_ATTESTER`): the sponsor is offline when a learner accepts, and the attester is how the server's "enough
  stamped days" check stays unskippable. The attester cannot move money. See "Trust model".
- **Payout.** The sponsor's wallet signs `release` in the browser. `recordWalletPayout` then writes the approval and
  the payout from what the account says (also on any read of the board, so a closed tab loses nothing).
- **Refund.** The sponsor's wallet signs `refund` at any time while nobody holds the bounty. Past `expires_at` the
  program lets anyone send the money back to the recorded sponsor, which is how the ten-minute sweep returns an
  outside sponsor's money without holding authority over it (`onchain_config.bounty_escrow_version = 2`).
- **Abuse limits** (`_shared/bounty.ts`): reward 0.01 to 0.5 SOL, 3 posts a day and 5 live bounties per wallet,
  deadline up to 30 days, hold up to 168 hours, text lengths, control and direction characters stripped, names of the
  team refused. A wallet's bounty reaches the public board only once its escrow is funded. Any signed-in user can
  report a bounty (`itera.bounty_reports`); Itera's staff hides or restores it in `/bounties/manage`
  (`bounty-sponsor` `moderation` / `hide` / `unhide`). Hiding moves no money: the sponsor can still refund.
- **Funding link.** A sponsor who posted a bounty and did not fund it can share its Solana Action
  (`…/functions/v1/bounty-action/<slug>`, shown with a copy button and a `dial.to` preview on `/bounties/mine`, on
  the post form and on the bounty page, which tells a visitor "This bounty is waiting for funds"). ANY wallet can
  lock the reward through it, with no account on the site: the program's `create` takes the funder as its own
  account (the signer that pays), separate from the `sponsor` and `approver` it records and that are in the seeds of
  the address. So the Action builds `create` for the funding wallet with exactly the terms the bounty was posted
  with: the same address the page shows, sponsor = approver = refund address = the posting wallet. Nothing in the
  POST body but `account` is read. The funder buys no right: only the sponsor's wallet approves, and a refund goes
  to the sponsor, never to the funder; the Action's text says both, in pt and en, and names the invited wallet of a
  direct bounty in full. A bounty that is funded, closed or past its date builds nothing (`fundingLinkVerdict`); a
  hidden one answers 404. The ledger's funding step names the wallet that signed and labels it "funder", not
  "sponsor", when they differ (`stepSigner`, `signerRole`). Proof: `scripts/hackathon/bounty-blink-e2e.mjs`.
- **The team's own bounties** keep `origin = team`: posted by staff, funded from the treasury, approved by the
  treasury key, and labelled "posted by the Itera team" on the board.

### Counters and rehearsals

The three numbers above the board (`stats` of `GET /bounty-board`) are counted from the same rows the cards are drawn
from, after the escrow accounts were read: a card that says PAID is in `paid_count`. A bounty whose payout went to an
account in `itera.test_accounts` is a **rehearsal**: it is counted, `rehearsal_paid_count` says how many of the paid
ones are rehearsals, the card and the page carry a "team rehearsal" label, and `delivery_mirror_url` points to a copy
of the delivery hosted on the site (`public/rehearsal/`) so the link opens for anyone. The landing page reads the
same `stats`.

### Holds

A learner who accepts holds the bounty for `claim_hours` (two hours on the one-day starter bounties, of which there
are three so one visitor cannot lock the demo). The page says who holds it and until when. When the time runs out
the next read of the board or of the page releases it (`expireStaleClaims`).

## The capability gate

`accept` reads the caller's certifications **from chain** (`getMultipleAccounts` on the Core asset
accounts) and requires one that is:

- owned by the caller's wallet,
- in the "Itera Passports" collection, whose update authority is the Itera authority,
- frozen (soulbound),
- with attributes `kind = trail_passport`, `program` and `trail` equal to the bounty's requirement, and
  `days_done >= min_days`.

Our tables are used only as an **index** of which asset addresses to read. Nothing they say about an
asset decides: a row edited in the database cannot make an asset pass, and the wallet itself comes from
the verified sign-in identity (or the signature-verified link), never from the request.

Then the **program** checks again, on chain, in the `accept` transaction: owner and collection of the
certification account. The stamped days (`days_done`, an attribute inside the asset's plugin data) are
checked by the server only.

The proof used (`asset`, `days_done`, when it was read) is stored on the claim and linked on the page.

## Function contracts

Base: `https://nyzcbnnbffsizshiolbh.supabase.co/functions/v1`.

### `GET /bounty-board` (public, `?lang=pt|en`, default `pt`)

```json
{ "cluster": "devnet",
  "stats": { "paid_lamports": 0, "paid_sol": "0 SOL", "paid_count": 0,
             "locked_lamports": 280020000, "locked_sol": "0.28002 SOL", "open_count": 4 },
  "bounties": [ <bounty> ] }
```

`<bounty>`:

```json
{ "id": "<uuid>", "slug": "card-de-evento-responsivo", "sponsor": "DevFellowship",
  "title": "…", "summary": "…", "brief": "… (plain text, \n line breaks)", "deliverable": "…",
  "status": "awaiting_funding | open | claimed | submitted | paying | paid | refunding | refunded | expired",
  "cluster": "devnet", "reward_lamports": 80000000, "reward_sol": "0.08 SOL",
  "requirement": { "program": "itera-v2", "unit_id": "<uuid>", "trail": "Semana 2 · CSS", "min_days": 3, "total_days": 5 },
  "escrow": { "kind": "program | derived_account", "custody": "program | itera_server", "address": "<escrow>",
              "explorer_url": "…", "target_lamports": 80000000, "refund_address": "<address>",
              "program_id": "<program>|null", "program_explorer_url": "…|null" },
  "claim_hours": 72, "expires_at": "<ISO>", "created_at": "<ISO>",
  "claim": null | { "wallet": "<address>", "wallet_short": "95SA…pMAc", "profile_url": "…/u/<wallet>",
                    "status": "active | submitted | approved", "accepted_at": "<ISO>", "deadline_at": "<ISO>",
                    "submitted_at": "<ISO>|null", "proof_asset": "<asset>", "proof_url": "…/c/<asset>",
                    "submission_url": "<https link, only once paid>|null" },
  "funding": null | { "signature": "…", "lamports": 80005000, "sol": "0.080005 SOL", "at": "<ISO>", "wallet": null, "explorer_url": "…" },
  "payout":  null | { "signature": "…", "lamports": 80000000, "sol": "0.08 SOL", "at": "<ISO>", "wallet": "<learner>", "explorer_url": "…" },
  "refund":  null | { same shape, "wallet": "<refund address>" },
  "page_url": "…/bounties/<slug>",
  "fund": null | { "action_url": "…/bounty-action/<slug>", "blink_url": "https://dial.to/?action=…" } }
```

`expired` is a bounty nobody holds past `expires_at`; it is refunded on its own (see "Expiry and refunds"). `fund` is
present only while the bounty waits for money. Rows written by automated runs (`is_test`) are not listed.
Cached 10 s. `502 upstream_unavailable`, `500 internal_error`.

### `GET /bounty-board/<slug or id>` (public)

The same `<bounty>` plus the ledger:

```json
"events": [ { "kind": "created | funded | accepted | submitted | approved | rejected | withdrawn | expired | paid | refund_started | refunded",
              "wallet": "<address>|null", "lamports": 80005000, "sol": "…", "signature": "…|null", "explorer_url": "…|null", "at": "<ISO>" } ]
```

A bounty that was just funded opens on this read. `404 bounty_not_found`. Not cached.

### `GET /bounty-board/sweep` (public)

`202 { sweeping: true }` at once; the refunds of expired bounties run after the answer. See "Expiry and refunds".

### `GET /bounty-board/wallet/<address>` (public): what a wallet earned

```json
{ "wallet": "<address>", "cluster": "devnet", "earned_lamports": 5000000, "earned_sol": "0.005 SOL", "bounties_paid": 1,
  "items": [ { "slug": "…", "title": "…", "sponsor": "…", "lamports": 5000000, "sol": "0.005 SOL", "paid_at": "<ISO>",
               "signature": "…", "verified": true, "explorer_url": "…", "page_url": "…/bounties/<slug>" } ] }
```

`verified` is the node's answer for each payout signature (`getSignatureStatuses`, one call); only
verified payouts count in the totals. A wallet with nothing answers `200` with zeros. `400 invalid_address`.
Cached 20 s. This is the endpoint `/u/<wallet>` reads for "earned X from N bounties".

### `GET /bounty-board/invited/<address>` (public): the direct bounties addressed to a wallet

```json
{ "wallet": "<address>", "cluster": "devnet", "read_at": "<ISO>", "chain_read": true, "open_count": 1, "bounties": [ <bounty> ] }
```

Newest first, the same `<bounty>` as the board (with `direct: true`), once funded and unless moderation hid it. Rows
of automated runs are included: it is that wallet's own inbox. The escrow accounts are read before one is shown as
open. `400 invalid_address`. 30 calls a minute per address, on top of the board's 120.

### Direct bounties in the other contracts

- Every `<bounty>` also carries `"direct": false | true, "invitee_wallet": "<address>|null", "invitee_wallet_short": "BRNk…6Upx|null",
  "invitee_profile_url": "…/u/<wallet>|null", "invite_enforced_by": "program|null"`.
- `GET /bounty-board`: `stats` gains the `direct_*` figures above; no direct bounty is in `bounties`.
- `GET /bounty-post`: `"direct": true` when the program has direct bounties; `limits.direct_escrow_rent_lamports`.
- `POST /bounty-post` `create` takes an optional `invitee_wallet`. `400 invalid_invitee` (not a wallet address),
  `400 own_invitee` (the sponsor's own wallet), `503 direct_unavailable`. A direct bounty answers
  `{ created, id, slug, direct: true, invitee_wallet, invitee_known, invitee_eligible, invitee_reason, invitee_proof, invite_enforced_by: "program" }`;
  any other `{ created, id, slug, direct: false }`. The bounty is created even when `invitee_eligible` is false: the
  form warns, the sponsor decides (the invitee may stamp the days before the bounty expires).
- `POST /bounty-post` `{ "action": "invitee_check", "wallet": "<address>", "unit_id": "<uuid>", "min_days": 1 }` (signed-in
  wallet, 30 a minute): `200 { wallet, direct_available, known_learner, eligible, reason: null | "no_certification" | "not_enough_days",
  proof: { asset, days_done, explorer_url } | null, requirement: { unit_id, min_days, total_days } }` ·
  `400 invalid_invitee | own_invitee | invalid_requirement`. Writes nothing.
- `POST /bounty-claim`: on a direct bounty any wallet but the invitee gets `403 { error: "not_invited", invitee_wallet }`
  from `accept_prepare` / `accept_submit`, and from `status` `403` with the usual fields beside the error
  (`eligible: false, reason: "not_invited", proof: null, claim, busy_elsewhere`). `reason` gains `"not_invited"`.
  A direct accept the program itself refused surfaces as `403 { error: "refused_by_program", reason: "not_invited" }`.

### `POST /bounty-claim` (user JWT, checked in code)

Body `{ "action": …, "bounty": "<uuid>" }`.

| action | answer |
|---|---|
| `status` | `{ wallet, eligible, reason: null \| "no_wallet" \| "no_certification" \| "not_enough_days", proof: { asset, days_done, explorer_url } \| null, claim: { bounty_id, status, accepted_at, deadline_at, submission_url, submission_note, submitted_at, review_note } \| null, busy_elsewhere }` |
| `accept_prepare` | `200 { sign: { message_base58, message_base64, fee_payer, signer, last_valid_block_height } \| null, proof }` (`sign: null` only for a server-held escrow) · `403 { error: "not_eligible", reason, proof }` · `403 own_bounty` · `409 { error: "not_open" \| "already_claiming" }` |
| `accept_submit` (`message`, `signature`: base64) | `200 { accepted: true, proof, chain: { status: "recorded", signature, signed_by, explorer_url } }` · `400 signature_required \| invalid_transaction \| invalid_signature` · `409 expired` (the blockhash died in the wallet) · `409 not_open` (another wallet's accept landed first) · `403 { error: "refused_by_program", reason }` |
| `submit` (`url` https, optional `note`) | `200 { submitted: true }` · `400 invalid_submission` · `409 not_active` |
| `withdraw_prepare` | `200 { sign: {…} \| null }` · `409 not_active` |
| `withdraw_submit` (`message`, `signature`) | `200 { withdrawn: true, chain: { status, signature, signed_by, explorer_url } \| null }` · `400 signature_required \| invalid_transaction \| invalid_signature` · `409 expired \| not_active` |
| `accept`, `withdraw` | `409 client_outdated` (a page from before the learner signed) |

`401 unauthorized`, `403 no_itera_profile`, `404 bounty_not_found`, `400 invalid_body | invalid_action`.
A learner holds at most one bounty at a time (`already_claiming`, `busy_elsewhere`).

### `POST /bounty-sponsor` (user JWT, then staff membership)

Staff = `instructor | tenant_admin | owner` of a non-personal tenant (`_shared/staff.ts`). A bounty of
another tenant answers `404`. `403 forbidden` for everyone else.

| action | body | answer |
|---|---|---|
| `list` | | `{ tenant_ids, treasury_tenant, trails: [{ unit_id, title: {pt,en}, total_days }], bounties: [<bounty> + { title_i18n, treasury_fundable, review: { status, wallet, submission_url, submission_note, submitted_at, proof } \| null }] }` |
| `create` | `slug, sponsor_name, title{pt,en}, summary{pt,en}, brief{pt,en}, deliverable{pt,en}, reward_lamports, unit_id, min_days, expires_in_days, claim_hours?, refund_address?` | `{ created, id, slug }` · `400 invalid_slug \| invalid_sponsor \| invalid_text \| invalid_reward \| invalid_requirement \| invalid_deadline \| invalid_refund_address` · `409 slug_taken` |
| `fund` | `bounty` | Treasury -> escrow. Only the tenant in `onchain_config.bounty_treasury_tenant`. `{ funded, status, signature }` · `403 treasury_not_allowed` · `409 not_fundable` |
| `refresh` | `bounty` | Re-reads the escrow balance. `{ status }` |
| `approve` | `bounty`, `note?` | `200 { approved, outcome: "settled", status: "paid", payout_signature }` · `202` with `outcome: "pending"` while the transfer confirms (call again) · `409 not_submitted` · `403 self_review` |
| `reject` | `bounty`, `note?` | `{ rejected, status: "open" }` (the money stays locked, the bounty reopens) |
| `refund` | `bounty` | Only a bounty nobody holds. `{ outcome, status, refund_signature }` · `409 not_refundable` |

Reward: 0.001 to 0.5 SOL. A sponsor other than the treasury's tenant must give a `refund_address` and
funds through the blink.

### `GET | POST /bounty-action/<slug>` and `POST /bounty-action/confirm?bounty=<id>` (Solana Action)

`GET` describes the funding; `POST { account }` answers an unsigned transaction for `account`: the program's
`create` with the bounty's own terms (a server-held bounty: a transfer `account -> escrow` of what the account
still lacks), with the memo `itera-bounty:<id>:fund`; the chained `confirm` re-reads the escrow
account and opens the bounty. Offered for the team's bounties and for those a wallet posted ("Funding link"
above). Disabled once the bounty is funded, closed or expired; 404 for a hidden one. Nothing in the confirm body
is trusted: the balance decides.

## Trust model

Said without decoration. Three parties can move or block a reward: the escrow program, the Itera server, and
whoever holds the program's upgrade key.

### What the chain decides (the escrow program; the server cannot do otherwise)

- The reward is locked in the bounty's own account. The account and its terms are public.
- A claimant can only be a wallet that **owns a Metaplex Core asset of the Itera Passports collection**. The
  program reads that account in the `accept` transaction; it takes nobody's word for it.
- The reward can leave to exactly two places: the recorded claimant, or the sponsor recorded when the bounty was
  funded. No instruction takes another destination.
- It leaves once. No second release, no refund after a payout, no refund while someone holds the bounty.

### What the server decides (Itera's edge functions and database; trust required)

- **How much certification is enough.** The program checks "owns an Itera certification", not "has 3 stamped days of
  Week 1 · HTML". The server reads `program`, `trail` and `days_done` from the same on-chain asset and refuses the
  rest. A server that lied here could let a wallet with a one-day certification take a three-day bounty. It could
  not let an uncertified wallet in.
- **The deadlines, and one bounty per learner.** `claim_hours`, one live claim per learner: database functions.
  (Who wins a race is the chain's: the first `accept` that lands.)
- **When the program is called.** On Itera's own bounties the approver is the Itera treasury key: it decides when to
  release or to refund an unclaimed bounty. On every bounty the treasury key is also the attester: it must co-sign an
  accept (so it can refuse one) and it can reopen a claim. So the server can: refuse to co-sign, delay a payout of
  its own bounty forever, take a bounty away from a learner who has not been paid yet. It cannot: record a learner
  who did not sign, send a reward anywhere but the certified claimant or the sponsor, or move the reward of a
  bounty a wallet posted before its expiry.
- **Whether the work is good.** A person on the sponsor's staff approves or rejects. This is a human judgement, and
  the sponsor's staff could approve a friend's delivery. There is no dispute path.
- **The ledger shown on the page** (`bounty_events`) is our table. The transactions it links to are the proof; a
  row without a transaction is our say-so.

### The upgrade authority (one key; trust required, total)

The program is deployed upgradeable. Its upgrade authority is the Itera mint authority,
`CPq4SPcqmwXd1wyMkdQZYJe9kfTx23EGTnXrXtAVJq8B`, a single key held as an edge-function secret. Whoever holds that key
can replace the program with one that sends every locked reward anywhere. Every guarantee in "What the chain
decides" holds only for as long as the deployed program is the one in `programs/bounty-escrow`.

This is deliberate on devnet, where a bug found during the hackathon has to be fixable. Before real money it must
change: `solana program set-upgrade-authority <program> --final`, or a multisig. Anyone can check the current
state with `solana program show ETeJkm9QrVgMuaMdAV6aLkFZGLDX6pMcniAXu8rcBqhq -u devnet`.

The same single-key caveat applies to the approver (the treasury key) for the powers listed above.

### Server-held bounties (`derived_account`)

Only rows posted before the program existed (all closed). There the server signs for the escrow account outright:
a custodial escrow with a public ledger.

## Expiry and refunds

A bounty past `expires_at` that nobody holds reads as `expired` and is refunded **without anyone asking**:

- **A scheduler**: the database calls `GET /bounty-board/sweep` every ten minutes (`pg_cron` + `pg_net`,
  `0202_bounty_refund_schedule.sql`). It refunds up to four expired bounties per run and finishes refunds that were
  started and never confirmed.
- **Lazily on read**: every read of the board sets off the same sweep for one bounty, after answering. So the money
  also moves if the scheduled job is ever removed.
- **The sponsor's button** in `/bounties/manage`, at any time while nobody holds the bounty.
- **Without Itera at all**: the sponsor's own wallet can sign the program's `refund` for an unclaimed bounty. This
  works when the refund address is a wallet the sponsor controls (a bounty funded through the blink); it is the way
  out if Itera's server disappears.

A sponsor who refunds from their own wallet leaves our row behind the chain, so **the board reads the chain before
it says "open"**: the list reads the escrow accounts of every open bounty in one call, and a bounty's page reads its
own, before answering. A row the chain shows as refunded is marked refunded first. The "locked in escrow" total is
built after that read.

The sweep route is public and takes no parameter: it can only send a bounty's money to the refund address fixed
when the bounty was posted. A bounty someone holds is not swept; its claim ends at `claim_hours` or at
`expires_at`, whichever comes first, and the bounty is swept after that. A delivery waiting for review is never
swept: the sponsor approves or rejects it, however late.

What is **not** automatic: a learner whose delivery the sponsor never reviews has no way to force a decision.

## Known limits

- One winner per bounty. A learner holds one bounty at a time.
- No dispute path: a rejection reopens the bounty and the learner sees the sponsor's note. Not built, on purpose.
- A sponsor who never reviews a delivery leaves the reward locked; only the sponsor (approve or reject) unlocks it.
- The public routes are throttled per address (`bounty-board` 120 per minute, `bounty-action` 30); the limiter fails
  open when its counter cannot be reached.
- Rewards are devnet SOL and have no monetary value.

## Tests

Run from a clone (devnet; credentials of the hackathon project in the environment, keys in local files, nothing secret in the scripts):

```bash
source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN
node scripts/hackathon/bounty-program-e2e.mjs   # the escrow program called directly, 27 checks, ~0.006 SOL of the treasury
RUN=<label> node scripts/hackathon/bounty-blink-e2e.mjs   # the funding link: another wallet funds, sponsor approves, refund goes to the sponsor, 9 attacks, ~0.03 SOL of the authority
node scripts/hackathon/bounty-e2e.mjs           # the whole flow through the API, 52 checks, ~0.02 SOL (authority + treasury)
RUN=<label> node scripts/hackathon/bounty-chain-agrees.mjs   # page vs escrow account at every step, 32 checks, ~0.01 SOL of the treasury
node scripts/hackathon/bounty-wallet-sponsor-e2e.mjs  # a bounty posted, funded and refunded by an outside wallet, 32 checks, 0.05 SOL of the authority
```

Both need Node 22.18 or newer (they import the functions' TypeScript modules as they are). Each header lists its
environment variables. They leave throwaway wallet accounts behind: run `select itera.tag_test_accounts();` afterwards.

- Unit (`npx vitest run -c vitest.supabase.config.ts <files>`): `bounty.test.ts`, `bounty-escrow.test.ts`,
  `bounty-chain.test.ts` (the plans), `bounty-program.test.ts` (encoding, account layout),
  `solana-message.test.ts` (message bytes equal to the hand-written transfer; PDAs equal to the Solana CLI's).
- **The page and the chain, compared at every step** (`scripts/hackathon/bounty-chain-agrees.mjs`, 32 checks,
  2026-10-11, through the live API): funded, accepted, given up, accepted, delivered, rejected, delivered, paid,
  then accepted, out of time, refunded. After each one the public page and the escrow account read from a node tell
  the same status and the same wallet; the accept and the give-up carry the learner's signature and a fee payer that
  is not the learner; the rejection and the expiry carry a transaction of the attester. The server refuses another
  wallet's signature, a transfer out of the fee payer slipped into the message, and the old unsigned accept.
- **The program, called directly on devnet** (45 checks, 2026-10-11, after the upgrade): it refuses a claimant who
  did not sign, someone else's
  certification, an account that is not a Core asset, a certification of another collection, an attester that
  is neither the approver nor Itera's, a payout signed by the attester on an outside sponsor's bounty, a payout to
  anyone but the recorded claimant, a second release, a refund after
  payment, a refund to anyone but the sponsor, a stranger's refund before the expiry; it lets the claimant give up
  alone and anyone return an expired bounty to its sponsor. Release of that run:
  `2o9Sd9mmTYnmZQmHZpyiEuwRLtas8gVRiZtK1CwVdmrrXmzC5Et2HHLM4vezAonaxEfvpqsicp6jXy4k4HLQjig8`.
- **End to end through the API on devnet**, once per escrow kind (51 and 52 checks): an uncertified
  wallet is refused; one stamped day is refused where two are required; three simultaneous accepts give
  one winner, recorded by the program; three simultaneous approvals give one payout transaction; a
  rejection reopens with the money still locked; two simultaneous refunds give one refund transaction; a
  wallet funds a bounty through the Action. Program-escrow payout of that run:
  `66i6tf5q75sEEk6fU87iX1gBzrgfQFoKV7LsfrgcxfwGKSDZN82mtr6uqyiFpjyrPy1wUxfDNNHm5R1iZJjz89yF`.
- **Automatic refund on devnet** (10 checks): a funded bounty past its date is refunded by one unauthenticated call
  to the sweep, to the refund address fixed at creation; a held bounty and a bounty inside its date are left
  alone; a second sweep pays nothing again.
- **Direct bounty on devnet** (`scripts/hackathon/bounty-direct-e2e.mjs`, 53 checks, 2026-10-11, after the upgrade of
  slot 510040266): a wallet posts a bounty for learner A and funds it (`create_direct`, a 260-byte account naming A);
  learner B, who holds the same certification, is answered `not_invited` by the API and `NotInvited` (6020) by the
  program when it sends `accept` itself, with Itera's attester co-signing, or presenting A's certification; the same
  instruction signed by A passes; A accepts, delivers and is paid by the sponsor's wallet alone; the board never
  listed the bounty, `invited/<A>` did; a second direct bounty past its date is returned to the sponsor by the public
  sweep, in a transaction the sponsor did not sign. `RUN=<label> [KEEP_OPEN=1] node scripts/hackathon/bounty-direct-e2e.mjs`.
- **The program's direct paths, natively** (`programs/bounty-escrow/tests/direct.rs`, 8 tests, run by the build
  workflow before `cargo build-sbf`): the bytes `create_direct` writes, the address refusing another invitee, a gated
  bounty unchanged, accept by the invitee, an eligible stranger refused, the invitee without the days refused, the
  invitation surviving a give-up, the refund past the expiry.
- **Sign-in return**: `loginReturn.test.ts`, `AuthPage.return.test.tsx` (a foreign `next` never leaves the app).
- **Attack, on devnet**: a sponsor funds a bounty from their own wallet, signs the program's `refund` directly and
  leaves the bounty looking open. The next learner's accept is refused by the program, the row reads `refunded`, and
  it cannot be taken afterwards (6 checks).
- **Attack, on devnet** (found by the adversarial pass, A7b): a stranger tries to create the escrow account of an
  unfunded bounty with its own approver, its own refund address, one lamport, or another expiry. The program
  refuses each (`wrong_escrow_account`); the only `create` the address accepts carries the bounty's own terms, and
  that is funding it. The sponsor then funds and the bounty opens.
- **Rate limit, on devnet** (adversarial pass, A8): 60 calls to `bounty-action` from one address give 30 answers and
  30 × 429; the confirmation route that polls the chain is behind the same counter; 170 calls to `bounty-board`
  give 120 and 50 × 429; a forged `X-Forwarded-For` opens no second bucket.
- After the program upgrade: the direct program test again (27 checks), the four bounties funded before it still
  accept and refund under the new program (simulated, nothing sent), and the full API flow once more.
