# Purchase rail, Tera companion and lives

Hackathon only: Supabase project `nyzcbnnbffsizshiolbh`, Solana **devnet**. Extends
[`onchain-passport.md`](onchain-passport.md).

## Architecture

```
shop_items ─► purchase-intent ─► wallet signs + sends ─► purchase-confirm ─► item handler
(catalog)     builds the tx       (Phantom)              verifies on chain    (_shared/shop-items.ts)
                                                                                 │
              itera.companions (lives, outfit) ◄─────────────────────────────────┤ life / outfit
              itera.user_achievements.state.cosmetics ◄──────────────────────────┘ ink / frame
                         │
                         └─► mirrored to Metaplex Core assets by the server authority
```

- **Rail.** Devnet SOL only. The server builds a legacy transaction (System transfer learner →
  treasury of exactly `price_lamports`, plus a Memo carrying the intent id; fee payer = the
  learner's wallet), so the browser needs no Solana library. The wallet signs and sends it; the
  server then reads the transaction from chain and grants the item.
- **Treasury** `AMoTUQic1C5ecYfvs3T2L5cBAZcUmCn4dPvboSdmJ3cA`: a keypair separate from the mint
  authority, public key in `itera.onchain_config` (`treasury`). It receives payments and funds the
  devnet faucet. Nothing is ever refunded and no deposit is held.
- **Companion.** One soulbound Core asset per wallet learner in the collection "Itera Companions"
  (`onchain_config.collection_companions`). The database is the source of truth; the asset's
  `Attributes` (`kind`, `lives`, `max_lives`, `outfit`, `level`, `xp`, `streak`, `learner`) are a
  mirror written on purchase, equip and lesson end, never on a mistake. Email learners get the same
  rules off chain: no asset, no purchases.
- **Passport cosmetics.** `ink` and `frame` are stored in the `trail_pass` row
  (`state.cosmetics = { ink, frame }`) and written to the passport asset as attributes `ink` /
  `frame`. `onchainAttributes` (`_shared/credential.ts`) reads them from the row, so every later
  stamp update re-sends them: nothing is wiped.
- Wallet and user always come from the verified token (`auth.identities` custom claims), never from
  the request body. Lamports are integers end to end (`bigint` in code, `bigint` columns).

## Tables (schema `itera`, RLS on, only the service role writes)

| Table | What | Learner can read |
|---|---|---|
| `shop_items` | catalog: `key`, `kind`, `price_lamports`, `price_usd_cents`, `price_label`, i18n texts, `effect`, `art`, `active`, `sort` | everyone |
| `purchases` | one row per intent: `status` (`pending`/`paid`/`expired`; `refunded`/`failed` unused), `lamports`, `price_usd_cents`, `wallet`, `tx_signature` (unique), `memo`, `last_valid_block_height`, `expires_at`, `paid_at`, `applied_at`, `error` | own rows |
| `user_inventory` | `(user_id, item_key, ref_id)` → `qty` | own rows |
| `companions` | lives, `last_regen_at`, `outfit`, mint columns, `mirrored`, `mirror_due`, public `id` | own row |
| `life_events` | idempotency: unique `(user_id, attempt_id)` | own rows |
| `devnet_airdrops` | one faucet claim per wallet | nobody |

Migrations `0115_purchase_rail.sql`, `0116_companion_lives.sql`, `0117_certification_naming.sql`.

## Items

| key | kind | price | `ref_id` | rule | effect |
|---|---|---|---|---|---|
| `life_refill` | `life` | US$ 0.10 · 550 000 lamports | none | lives below max (`not_needed`) | lives → max, mirrored |
| `outfit_glasses` | `outfit` | US$ 0.20 · 1 100 000 | none | one per learner (`already_owned`) | inventory; equip through `companion` |
| `outfit_crown` | `outfit` | US$ 0.30 · 1 650 000 | none | same | same |
| `outfit_headphones` | `outfit` | US$ 0.20 · 1 100 000 | none | same | same |
| `ink_emerald`, `ink_violet` | `ink` | US$ 0.20 · 1 100 000 | unit id (trail) | a **minted** `trail_pass` for that trail (`passport_required`), one per item and trail | attribute `ink`; the latest ink bought replaces the previous one |
| `frame_gold_leaf` | `frame` | US$ 0.50 · 2 750 000 | unit id (trail) | same | attribute `frame = gold-leaf` |

Prices are pinned in the table at US$ 0.20 = 1 100 000 lamports; `price_label` is a fixed string
(`US$ 0.20 ≈ 0.0011 SOL`). No price feed is read. All seven are `active = true`.

```sql
-- take an item off sale / put it back
update itera.shop_items set active = false where key = 'frame_gold_leaf';
update itera.shop_items set active = true  where key = 'frame_gold_leaf';
```

An ink that was replaced stays in the inventory but cannot be put back on (buying it again answers
`already_owned`). There is no cosmetic "equip" yet.

## Function contracts

Base `https://nyzcbnnbffsizshiolbh.supabase.co/functions/v1`. `verify_jwt = false`; every function
validates `Authorization: Bearer <user access token>` itself. CORS: the app origins and localhost,
as `passport`. Errors are `{ "error": "<code>" }`. Common: `401 unauthorized`,
`403 no_itera_profile`, `400 invalid_body`, `405 method_not_allowed`, `500 internal_error`.

### `GET /shop-items` (`?lang=pt|en`, token optional)

```json
[{ "key": "outfit_crown", "kind": "outfit", "title": "Coroa", "description": "…",
   "price_usd_cents": 30, "price_lamports": 1650000, "price_label": "US$ 0.30 ≈ 0.00165 SOL",
   "art": { "outfit": "outfit_crown" }, "owned": false, "equipped": false, "owned_refs": [] }]
```

Active items only. Without a valid user token `owned`/`equipped` are `false`. `owned_refs` lists the
`ref_id`s the caller holds the item for (trails, for ink and frame). `kind` is
`life | outfit | ink | frame`.

### `POST /purchase-intent`

Body `{ "item_key": "ink_emerald", "ref_id": "<unit id>" }` (`ref_id` only for ink and frame).

```json
{ "intent_id": "8ba48490-…", "message_base58": "…", "message_base64": "…",
  "transaction_base58": "…", "transaction_base64": "…",
  "price_lamports": 1100000, "price_usd_cents": 20, "price_label": "US$ 0.20 ≈ 0.0011 SOL",
  "last_valid_block_height": 497123456, "expires_at": "2026-10-09T23:21:10.000Z",
  "treasury": "AMoTUQic…", "memo": "8ba48490-…", "cluster": "devnet" }
```

- `message_*` is the serialized transaction **message**; `transaction_*` is the full unsigned
  transaction (one zeroed signature slot). `memo` equals `intent_id`.
- A second call for the same (learner, item, ref) returns the **same** `intent_id` with a fresh
  blockhash and expiry. `expires_at` is estimated from `last_valid_block_height` (about a minute).
- Errors: `403 no_wallet`, `404 item_not_found`, `409 item_inactive`, `409 already_owned`,
  `409 not_needed`, `409 passport_required`, `400 invalid_ref` (a `ref_id` where none belongs, or
  none where one is needed), `402 insufficient_funds` (with `balance_lamports`,
  `required_lamports`, `price_lamports`), `503 rpc_unavailable`, `503 shop_not_configured`.
- `insufficient_funds` asks for price + 5 000 (fee) + 890 880: a wallet may end empty or rent
  exempt, never in between.

### The Phantom call

```ts
const { signature } = await window.phantom.solana.request({
  method: 'signAndSendTransaction',
  params: { message: intent.message_base58 },
});
await confirm({ intent_id: intent.intent_id, signature });
```

The message is a **legacy** (unversioned) message, byte-identical to
`Transaction.serializeMessage()` of `@solana/web3.js` for the same transfer and memo. If a wallet
wants a transaction object instead: `Transaction.from(base64ToBytes(intent.transaction_base64))`.
Phantom must be on devnet.

### `POST /purchase-confirm`

Body `{ "intent_id": "…", "signature": "<base58>", "lang": "pt" | "en" }`.

```json
{ "status": "paid", "intent_id": "…", "item": { "key": "ink_emerald", "kind": "ink", "title": "Emerald ink" },
  "inventory": [{ "item_key": "ink_emerald", "kind": "ink", "ref_id": "<unit id>", "qty": 1, "equipped": true }],
  "passport": { "…": "same shape as an entry of passport's updated[]" },
  "image_url": "…/credential-meta/<row id>/image.svg?lang=en&v=1760051000000",
  "explorer_url": "https://explorer.solana.com/tx/…?cluster=devnet" }
```

- `lives` and `companion` (shapes below) are present for `life` and `outfit`; `passport` (else
  `null`) and `image_url` for `ink` and `frame`. Use `image_url` as given: art is cached for a
  minute per URL and the `v` parameter is what makes it fresh.
- All of these must hold: the intent is the caller's and not expired; the signature is on no other
  purchase; the transaction is confirmed with no error; its fee payer and the source of the transfer
  are the caller's wallet; a System transfer to the treasury of at least the intent's lamports; a
  memo equal to the intent id. Extra instructions (a wallet's priority fee) are tolerated.
- Idempotent: the same intent and signature again returns the same paid result and re-applies
  nothing.
- Errors: `404 intent_not_found` (also for another learner's intent), `410 intent_expired`,
  `404 tx_not_found` with `retryable: true` (not visible yet after ~6 s: call again),
  `422 tx_failed`, `422 payment_mismatch` with `detail: payer | destination | amount | memo`,
  `409 signature_reused`, `409 intent_already_paid` (a paid intent with another signature),
  `502 apply_failed` with `status: "paid"` (payment recorded, effect due: call confirm again),
  `503 rpc_unavailable`.
- Expiry: an unseen signature answers `tx_not_found` until the chain passes
  `last_valid_block_height`, then `intent_expired`. A transaction that did land can be confirmed up
  to 24 h after `expires_at`.

### `POST /companion`

Body `{}` or `{ "equip": { "outfit": "outfit_crown" | null } }`.

```json
{ "lives": { "current": 4, "max": 5, "next_regen_at": "2026-10-09T23:38:16.178Z",
             "regen_seconds": 1200, "regen_interval_seconds": 1200 },
  "companion": { "id": "<companion id>", "asset_address": "Bip…" , "mint_status": "minted",
                 "explorer_url": "…", "outfit": "outfit_crown", "level": 4, "xp": 780, "streak": 2,
                 "metadata_url": "…/credential-meta/companion/<id>", "image_url": "…/image.svg?v=…" },
  "inventory": [{ "item_key": "outfit_crown", "kind": "outfit", "ref_id": "00000000-…", "qty": 1, "equipped": true }],
  "wallet": "<address or null>" }
```

- Creates the row on first use (5/5 lives). For a wallet learner without an asset the call answers
  `mint_status: "pending"` at once and mints in the background of the same invocation; poll until
  `minted` (about 5 s; `failed` is retried by the next call, a stuck `pending` after 3 minutes).
- `regen_seconds` is the time until the **next** life (0 and `next_regen_at: null` when full).
- `level = floor(xp / 200) + 1` and `streak` (consecutive São Paulo days with xp ending today, or
  yesterday while today has none) are derived from `itera.xp_events`.
- Equipping an outfit that is not owned: `409 not_owned`. `null` takes it off.

### `POST /lives`

`{ "action": "lose", "attempt_id": "<1..120 chars of A-Z a-z 0-9 _ . : ->", "activity_id": "<uuid>" }`
or `{ "action": "lesson_end", "lesson_id": "<uuid>", "mistakes": 0 }` → `{ lives, companion }`
(same blocks), plus `bonus` on `lesson_end`.

- `lose`: one life, once per `attempt_id`; a replay returns the current state. Never below 0.
- Regeneration: +1 every 20 minutes up to 5, computed on read.
- `lesson_end` grants +1 when `bonus` is `granted`. Otherwise `bonus` says why not: `mistakes`
  (client count, or any life lost today in that lesson's activities), `lesson_incomplete` (not every
  published activity of the lesson is completed in `itera.progress`), `already_granted` (once per
  lesson per day), `full`. It also mirrors lives, level, xp and streak to the asset in the
  background; a failed write is retried by the next mirror moment.

### `POST /wallet-faucet`

`{ "signature": "…", "lamports": 10000000, "explorer_url": "…" }`, or HTTP 200
`{ "blocked": "already_claimed" | "not_needed" | "not_devnet" | "no_wallet" }`. Once per wallet,
only when the balance cannot pay the cheapest active item. Paid by the treasury, never by the mint
authority; capped at 200 claims and refused (`503 faucet_unavailable`) when the treasury is low.

### Companion in the public functions

- `GET /credential-verify/<asset>`: same shape; `achievement.key = "companion"`,
  `achievement.state = { lives, max_lives, outfit, level, xp, streak }`.
- `GET /credential-meta/companion/<companion id>` and `…/image.svg` (`?lang=pt|en`): metadata and
  art (Tera, a hearts row, the outfit, the level). Keyed by the companion id; no name or email.
- `GET /credential-meta/<row id>` gains `Ink` / `Frame` in `attributes` when set.

### Operator sync on `passport`

`POST /passport` with the function's service key as Bearer (this project: the `sb_secret_…` key),
**no `Origin` header**, and `{ "user_id": "<itera user id>", "max_jobs": 1..10, "lang" }` runs the
normal flow for that learner (wallet from the learner's own web3 identity) and returns the normal
response. The key is compared in constant time. Any other request behaves exactly as before.

```bash
node scripts/hackathon/passport-sync.mjs <wallet address | itera user id> [--lang pt|en]
```

## Adding an item kind

1. Add the kind to `ITEM_KINDS` and its rule to `eligibility` in `_shared/shop-rules.ts` (pure, with
   a test).
2. Add one entry to `ITEM_HANDLERS` in `_shared/shop-items.ts`: `canBuy` gathers the facts and
   calls the rule; `apply` performs the effect and must be safe to run twice.
3. Insert the `shop_items` rows. Redeploy `purchase-intent`, `purchase-confirm`, `shop-items`.

A new outfit also needs its key in `OUTFITS` (`_shared/cosmetics.ts`) and a drawing in
`OUTFIT_ART` (`_shared/art.ts`, one function per key).

## Runbook

```sql
-- a payment that landed but whose effect is still due (the client can also just call confirm again)
select id, item_key, ref_id, error from itera.purchases where status = 'paid' and applied_at is null;
-- companions whose asset is behind the database
select user_id, mirror_error from itera.companions where mirror_due;
-- give lives back by hand
update itera.companions set lives = max_lives, last_regen_at = now(), version = version + 1 where user_id = '<id>';
```

Secrets (project-wide): `SOLANA_TREASURY_SECRET` (read only by `wallet-faucet`),
`SOLANA_AUTHORITY_SECRET`, `SOLANA_RPC_URL`. Treasury key file:
`~/.config/itera-hackathon/devnet-treasury.json`.

```bash
for f in shop-items purchase-intent purchase-confirm companion lives wallet-faucet credential-meta credential-verify passport; do
  supabase functions deploy $f --project-ref nyzcbnnbffsizshiolbh --use-api
done
```

## Tests

```bash
npx vitest run --config vitest.supabase.config.ts     # pure modules
source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN HACKATHON_DB_PASSWORD HACKATHON_DEMO_EMAIL HACKATHON_DEMO_PASSWORD
node scripts/hackathon/purchase-e2e.mjs               # devnet, a throwaway keypair plays the wallet (~0.03 SOL)
```

## Verified vs not (2026-10-09)

Verified on devnet by `purchase-e2e.mjs` with a synthetic wallet: the whole table it prints
(companion mint and verification, lives, every item kind, idempotency, reused signature, three
tampered payments, expiry, faucet, the email learner, and that a passport stamped to gold after the
purchases keeps `ink` and `frame`). The server-built message was compared byte for byte with
`@solana/web3.js`.

Not verified:

- **A real Phantom.** No browser wallet signed these messages. The message is legacy; whether a
  given Phantom build takes it through `request({ method: 'signAndSendTransaction', params: { message } })`
  and what it adds (priority fee, guard instructions) was not observed. The verification tolerates
  extra instructions; a wallet that changes the transfer or drops the memo would be refused.
- Behaviour under the public devnet RPC's rate limit with many concurrent learners.

## Known limits

- A `passport` call and a cosmetic purchase racing on the same row can drop `state.cosmetics`
  (`passport` writes the state it read at the start). Calling `purchase-confirm` again for the paid
  intent restores it.
- `apply` for a life refill is at-least-once: a crash between the refill and its bookkeeping can
  refill twice.
- The faucet is one claim per wallet, and wallets are free: the cap and the treasury balance are the
  only bounds.
- No rate limit on any function.
