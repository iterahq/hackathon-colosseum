# Bounties ("Missões pagas"): a certification opens a paid door

Train -> prove -> **earn**. A sponsor posts a small real task with a reward in devnet SOL. The reward is
locked on chain before anyone can take the task. Only a wallet whose **on-chain certification** shows
the required stamped days may accept. The learner delivers a link, the sponsor approves, and the escrow
pays the learner's wallet. Every step has an explorer link.

Devnet only. See "Trust model" for exactly what is and is not enforced by the chain.

```
sponsor ── create ──► bounty (awaiting_funding) ── fund ──► open ── accept (chain gate) ──► claimed
                                                             ▲                                  │ submit
                                                reject / withdraw / claim expired               ▼
                                 refunded ◄── refund ── open             paid ◄── approve ── submitted
```

## Files

| Path | What |
|---|---|
| `db/migrations/0200_bounties.sql` | `itera.bounties`, `bounty_claims`, `bounty_events`, and the five functions that are the only writers of a status |
| `supabase/functions/_shared/bounty.ts` | Pure rules: eligibility, amounts, the transfer decision, form checks, public views, the Action texts |
| `supabase/functions/_shared/bounty-escrow.ts` | The escrow key of a bounty and the transfer out of it |
| `supabase/functions/_shared/bounty-store.ts` | Reads, the funding check, the chain read of a wallet's certifications, `settleTransfer` |
| `supabase/functions/bounty-board` | Public: the board, one bounty with its ledger, what a wallet earned |
| `supabase/functions/bounty-claim` | Learner (JWT): status, accept, submit, withdraw |
| `supabase/functions/bounty-sponsor` | Staff (JWT): list, create, fund from treasury, approve, reject, refund |
| `supabase/functions/bounty-action` | Solana Action (blink): any wallet funds a bounty's escrow account |
| `docs/hackathon/bounties-seed.json` | The four bounties DevFellowship posted |

## Escrow

Each bounty has **its own system account on chain**, `escrow_address`. Its key is derived on the server
(HMAC-SHA256 of the bounty id under the treasury seed) every time it is needed and stored nowhere.

- **Funding.** A bounty opens when its escrow account holds `reward + 5000` lamports (the fee of the one
  transfer that will empty it). The balance of the account decides, read from the node: whoever paid,
  through the treasury button or the blink, the bounty opens when the money is there.
- **Payout / refund.** One transfer that sends the whole balance minus the fee, paid by the escrow
  account itself. The account ends at zero lamports. A second payout therefore **cannot land on chain**:
  there is nothing left to send, whatever our database says.
- **In flight.** `settleTransfer` is the only code that sends. One request at a time holds a lease on the
  row; the signature is recorded as soon as the node accepts the transaction; a signature that may still
  land is never sent again; a request that finds the account empty looks for its own memo
  (`itera-bounty:<id>:payout|refund`) among the account's transactions and settles from that.
- **Where money can go.** A payout goes to the wallet recorded when the claim was accepted (the one the
  chain gate checked). A refund goes to `refund_address`, fixed when the bounty was created. No request
  parameter chooses a destination.

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
  "escrow": { "kind": "derived_account", "custody": "itera_server", "address": "<escrow>",
              "explorer_url": "…", "target_lamports": 80005000, "refund_address": "<address>" },
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

`expired` is a bounty nobody holds past `expires_at`; its money waits for the sponsor's refund. `fund` is
present only while the bounty waits for money. Rows written by automated runs (`is_test`) are not listed.
Cached 10 s. `502 upstream_unavailable`, `500 internal_error`.

### `GET /bounty-board/<slug or id>` (public)

The same `<bounty>` plus the ledger:

```json
"events": [ { "kind": "created | funded | accepted | submitted | approved | rejected | withdrawn | expired | paid | refund_started | refunded",
              "wallet": "<address>|null", "lamports": 80005000, "sol": "…", "signature": "…|null", "explorer_url": "…|null", "at": "<ISO>" } ]
```

A bounty that was just funded opens on this read. `404 bounty_not_found`. Not cached.

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
| `accept` | `200 { accepted: true, proof }` · `403 { error: "not_eligible", reason, proof }` · `409 { error: "not_open" \| "already_claiming" }` |
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

**Enforced by the chain**

- The reward exists and is set apart: the balance of `escrow_address` is public.
- A bounty cannot be paid twice: the payout empties the account.
- Every movement (fund, payout, refund) is a public transaction with a memo naming the bounty.
- The certification the gate read is a soulbound asset anyone can re-read (`/c/<asset>`).

**Enforced by the Itera server, and stated as such in the UI**

- **Custody.** The server can sign for an escrow account. It is a custodial escrow with a public ledger,
  not a program-enforced one. The code only ever sends to the claim's wallet or to the refund address,
  but that is our code, not a chain rule.
- **The gate.** The server reads the chain and decides who may accept. The chain does not check it.
- **Approval.** A person on the sponsor's staff judges the delivery.

**Next step (not built):** a small Solana program holding each bounty in a PDA, where `accept` verifies
the Core certification account itself and `release` can only pay the recorded claimant. The schema
already carries `escrow_kind = 'program'` for it.

## Known limits

- One winner per bounty. A learner holds one bounty at a time.
- A claim lasts `claim_hours` (default 72); past that the bounty returns to the board on the next read.
- An expired bounty is refunded when the sponsor asks; nothing sweeps it automatically.
- No dispute path: a rejection reopens the bounty and the learner sees the sponsor's note.
- Rewards are devnet SOL and have no monetary value.

## Tests

- `supabase/functions/_shared/bounty.test.ts`, `bounty-escrow.test.ts` (`npx vitest run -c vitest.supabase.config.ts <files>`).
- End to end on devnet, 2026-10-11 (51 checks): an uncertified wallet is refused; one stamped day is
  refused where two are required; three simultaneous accepts give one winner; three simultaneous
  approvals give one payout transaction and an empty escrow account; a rejection reopens with the money
  still locked; two simultaneous refunds give one refund transaction; a wallet funds a bounty through the
  Action. Payout of that run:
  `3qkEdz4TTa2f6ZwvQyeva4h9AN5iieyuHbGpiBGuAKNi4T1efV5XHRx2KtZeUAYWDaeoWxvSuaJkxqF992fHjsVH`.
