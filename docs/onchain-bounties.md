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
| `programs/bounty-escrow/src/lib.rs` | The escrow program (native Solana program, no framework): create, accept, release, unclaim, refund |
| `.github/workflows/bounty-escrow-build.yml` | Builds the program on a runner (the dev box has no room for the SBF toolchain). Not a gate |
| `supabase/functions/_shared/bounty-program.ts`, `solana-message.ts` | The program's instructions and account layout; a legacy message compiler and PDA derivation |
| `supabase/functions/_shared/bounty-chain.ts` | Reads the escrow account, plans and sends the program calls |
| `supabase/functions/_shared/bounty-escrow.ts` | The server-held escrow of bounties posted before the program (`escrow_kind = derived_account`) |
| `supabase/functions/_shared/bounty-store.ts` | Reads, the funding check, the chain read of a wallet's certifications, `settleTransfer` |
| `supabase/functions/bounty-board` | Public: the board, one bounty with its ledger, what a wallet earned |
| `supabase/functions/bounty-claim` | Learner (JWT): status, accept, submit, withdraw |
| `supabase/functions/bounty-sponsor` | Staff (JWT): list, create, fund from treasury, approve, reject, refund |
| `supabase/functions/bounty-action` | Solana Action (blink): any wallet funds a bounty's escrow account |
| `docs/hackathon/bounties-seed.json` | The four bounties DevFellowship posted |

## Escrow

### The escrow program (`escrow_kind = program`, every bounty posted now)

One program-derived account per bounty, seeds `["bounty", <16 bytes of the bounty id>]`, holds the reward
and 195 bytes of state: status, sponsor (the refund destination), approver, the certification collection,
amount, expiry, claimant and the certification that qualified them.

| instruction | signer | what the PROGRAM checks |
|---|---|---|
| `create(id, amount, expires_at)` | funder | the account is the bounty's PDA and does not exist; amount > 0; expiry in the future. Moves `amount` + rent from the funder |
| `accept` | approver | the bounty is open and not expired; the certification account is owned by Metaplex Core, is an `AssetV1`, **its owner is the claimant** and **its collection is the one the bounty names**. Records claimant and certification |
| `release` | approver | the bounty is claimed and the account passed is the recorded claimant. Pays `amount`, marks `paid` |
| `unclaim` | approver | the bounty is claimed. Reopens it |
| `refund` | approver or sponsor | the bounty is open and the destination is the recorded sponsor. Pays `amount`, marks `refunded` |

The account is never closed: after a payout it stays on chain saying `paid`, to whom, with which
certification. The approver is the Itera treasury key. It chooses **when** each step happens; it cannot
choose a destination, pay a wallet that holds no Itera certification, or pay twice.

- **Funding.** The treasury button and the blink both send `create`. A bounty opens when its account
  exists on chain with the terms it was posted with (our approver, the refund address, the passports
  collection, at least the reward, the expiry). An account someone created with other terms is ignored.
- **Accept.** After the database picked the single winner, the server sends `accept`; the signature lands
  on the ledger row. A refusal by the program (`refused_by_program`) releases the claim.
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
- Every transaction carries a memo, `itera-bounty:<id>:fund|accept|payout|refund`.

Currency is **devnet SOL**. Devnet USDC only comes from a captcha faucet, which neither the sponsor nor a
judge can refill on demand.

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

### `POST /bounty-claim` (user JWT, checked in code)

Body `{ "action": …, "bounty": "<uuid>" }`.

| action | answer |
|---|---|
| `status` | `{ wallet, eligible, reason: null \| "no_wallet" \| "no_certification" \| "not_enough_days", proof: { asset, days_done, explorer_url } \| null, claim: { bounty_id, status, accepted_at, deadline_at, submission_url, submission_note, submitted_at, review_note } \| null, busy_elsewhere }` |
| `accept` | `200 { accepted: true, proof, chain?: { status: "recorded" \| "pending", signature } }` · `403 { error: "not_eligible", reason, proof }` · `403 { error: "refused_by_program", reason }` · `409 { error: "not_open" \| "already_claiming" }` |
| `submit` (`url` https, optional `note`) | `200 { submitted: true }` · `400 invalid_submission` · `409 not_active` |
| `withdraw` | `200 { withdrawn: true }` · `409 not_active` |

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

`GET` describes the funding; `POST { account }` answers an unsigned transfer `account -> escrow` of what
the account still lacks, with the memo `itera-bounty:<id>:fund`; the chained `confirm` re-reads the escrow
balance and opens the bounty. Disabled once the bounty is funded or closed. Nothing in the confirm body
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
- **Who wins a race, and the deadlines.** One live claim per bounty and per learner, `claim_hours`, `expires_at`:
  database functions.
- **When the program is called.** The approver of every bounty is the Itera treasury key. It decides when to accept,
  release, reopen a claim (`unclaim`) or refund an unclaimed bounty. So the server can: delay a payout forever,
  take a bounty away from a learner who has not been paid yet, refund an unclaimed bounty before its date. It
  cannot: send the reward anywhere but the certified claimant or the sponsor.
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

A sponsor who refunds from their own wallet leaves our row behind the chain. The same sweep reads the escrow
accounts of open bounties and retires the ones the chain already shows as refunded; a learner who tries to accept
one first gets `refused_by_program` (`not_open`) and the row is brought in line at once.

The sweep route is public and takes no parameter: it can only send a bounty's money to the refund address fixed
when the bounty was posted. A bounty someone holds is not swept; its claim ends at `claim_hours` or at
`expires_at`, whichever comes first, and the bounty is swept after that. A delivery waiting for review is never
swept: the sponsor approves or rejects it, however late.

What is **not** automatic: a learner whose delivery the sponsor never reviews has no way to force a decision.

## Known limits

- One winner per bounty. A learner holds one bounty at a time.
- No dispute path: a rejection reopens the bounty and the learner sees the sponsor's note. Not built, on purpose.
- A sponsor who never reviews a delivery leaves the reward locked; only the sponsor (approve or reject) unlocks it.
- A bounty's escrow address is known before it is funded. Someone could create that account first with other
  terms; the server ignores it and the bounty never opens (post it again). Only unfunded bounties are exposed.
- The public routes (`bounty-board`, `bounty-action`) have no per-IP rate limit.
- Rewards are devnet SOL and have no monetary value.

## Tests

- Unit (`npx vitest run -c vitest.supabase.config.ts <files>`): `bounty.test.ts`, `bounty-escrow.test.ts`,
  `bounty-chain.test.ts` (the plans), `bounty-program.test.ts` (encoding, account layout),
  `solana-message.test.ts` (message bytes equal to the hand-written transfer; PDAs equal to the Solana CLI's).
- **The program, called directly on devnet** (27 checks, 2026-10-11): it refuses someone else's
  certification, an account that is not a Core asset, a certification of another collection, a signer that
  is not the approver, a payout to anyone but the recorded claimant, a second release, a refund after
  payment, a refund to anyone but the sponsor. Release of that run:
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
- **Sign-in return**: `loginReturn.test.ts`, `AuthPage.return.test.tsx` (a foreign `next` never leaves the app).
- **Attack, on devnet**: a sponsor funds a bounty from their own wallet, signs the program's `refund` directly and
  leaves the bounty looking open. The next learner's accept is refused by the program, the row reads `refunded`, and
  it cannot be taken afterwards (6 checks).
