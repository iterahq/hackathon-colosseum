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
  mirror written on purchase, equip, lesson end and when the **last life** is lost, never on an
  ordinary mistake. Email learners get the same rules off chain: no asset, no purchases.
- **Passport cosmetics.** The paid purchases are the truth: `ink` and `frame` are derived from them
  (`cosmeticsFromPurchases`, the latest ink wins) and written to the passport asset as attributes
  `ink` / `frame`. `state.cosmetics = { ink, frame }` on the `trail_pass` row is a copy. Every reader
  (art, metadata, the on-chain attributes of a stamp, inventory `equipped`, the `passport` response,
  `learner-profile`) loads rows through `restoreCosmetics` (`_shared/cosmetics-store.ts`), which puts
  the purchased values back into the row it hands out. A row whose copy was overwritten by a
  concurrent write still shows them, a stamp still sends them to chain, and the next `passport`
  write stores them again.
- Wallet and user always come from the verified token, never from the request body. One helper
  (`resolveWallet` in `_shared/caller.ts`) decides the wallet for every function: the web3 sign-in
  identity when the learner has one, otherwise the wallet linked by a verified signature
  (`link-wallet`, below), otherwise none. Lamports are integers end to end (`bigint` in code, `bigint` columns).

## Tables (schema `itera`, RLS on, only the service role writes)

| Table | What | Learner can read |
|---|---|---|
| `shop_items` | catalog: `key`, `kind`, `price_lamports`, `price_usd_cents`, `price_label`, i18n texts, `effect`, `art`, `active`, `sort` | everyone |
| `purchases` | one row per intent: `status` (`pending`/`paid`/`expired`; `refunded`/`failed` unused), `lamports`, `price_usd_cents`, `wallet`, `tx_signature` (unique), `memo`, `last_valid_block_height`, `expires_at`, `paid_at`, `applied_at`, `error` | own rows |
| `payments` | the ledger of every settled payment, purchases **and** gifts: `tx_signature` (pk), `kind` (`purchase`/`gift`), `ref_id` (the intent it settled), `lamports`, `created_at`. Written only by `itera.settle_payment` (migration `0132`), in the same database transaction that marks the intent paid | nobody |
| `user_inventory` | `(user_id, item_key, ref_id)` → `qty` | own rows |
| `companions` | lives, `last_regen_at`, `outfit`, mint columns, `mirrored`, `mirror_due`, public `id` | own row |
| `life_events` | idempotency: unique `(user_id, attempt_id)` | own rows |
| `devnet_airdrops` | one faucet claim per wallet and per learner: `wallet` (pk), `user_id` (unique), `lamports`, `tx_signature`, `created_at`, `confirmed_at` | nobody |
| `user_wallets` | the wallet an e-mail account linked: `user_id` (pk), `wallet` (unique), `linked_at` | own row |
| `wallet_link_challenges` | the message a wallet is asked to sign: `wallet`, `nonce`, `message`, `expires_at`, `used_at` | nobody |

Migrations `0115_purchase_rail.sql`, `0116_companion_lives.sql`, `0117_certification_naming.sql`,
`0118_price_labels_profile_indexes.sql`, `0119_wallet_link.sql`, `0120_companion_mirrored_at.sql`,
`0121_wallet_identity_search_path.sql`, `0122_companion_mirror_claim.sql`. `itera.wallet_identity_user(address)` (service role only)
answers which learner signs in with a wallet; it is the only code that reads `auth.identities`.

## Items

| key | kind | price | `ref_id` | rule | effect |
|---|---|---|---|---|---|
| `life_refill` | `life` | US$ 0.10 · 550 000 lamports | none | lives below max (`not_needed`) | lives → max, mirrored |
| `outfit_glasses` | `outfit` | US$ 0.20 · 1 100 000 | none | one per learner (`already_owned`) | inventory; equip through `companion` |
| `outfit_crown` | `outfit` | US$ 0.30 · 1 650 000 | none | same | same |
| `outfit_headphones` | `outfit` | US$ 0.20 · 1 100 000 | none | same | same |
| `ink_emerald`, `ink_violet` | `ink` | US$ 0.20 · 1 100 000 | unit id (trail) | a **minted** `trail_pass` for that trail (`passport_required`), one per item and trail | attribute `ink`; the latest ink bought replaces the previous one |
| `frame_gold_leaf` | `frame` | US$ 0.50 · 2 750 000 | unit id (trail) | same | attribute `frame = gold-leaf` |

Prices have one source, the `shop_items` table, at one pinned rate: **1 US cent = 55 000 lamports**
(US$ 0.20 = 1 100 000 lamports = 0.0011 SOL). `price_lamports = price_usd_cents × 55 000` and
`price_label` shows the exact SOL amount, never rounded (migration 0118 derives both from the
cents). No price feed is read. All seven are `active = true`.

| key | kind | cents | lamports | label | sort |
|---|---|---|---|---|---|
| `ink_emerald` | `ink` | 20 | 1 100 000 | `US$ 0.20 ≈ 0.0011 SOL` | 10 |
| `ink_violet` | `ink` | 20 | 1 100 000 | `US$ 0.20 ≈ 0.0011 SOL` | 20 |
| `frame_gold_leaf` | `frame` | 50 | 2 750 000 | `US$ 0.50 ≈ 0.00275 SOL` | 30 |
| `outfit_glasses` | `outfit` | 20 | 1 100 000 | `US$ 0.20 ≈ 0.0011 SOL` | 40 |
| `outfit_crown` | `outfit` | 30 | 1 650 000 | `US$ 0.30 ≈ 0.00165 SOL` | 50 |
| `outfit_headphones` | `outfit` | 20 | 1 100 000 | `US$ 0.20 ≈ 0.0011 SOL` | 60 |
| `outfit_laurel` | `outfit` | 50 | 2 750 000 | `US$ 0.50 ≈ 0.00275 SOL` | 65 |
| `life_gift` | `gift` | 10 | 550 000 | `US$ 0.10 ≈ 0.00055 SOL` | 95 (listed only with `?with=gift`) |
| `life_refill` | `life` | 10 | 550 000 | `US$ 0.10 ≈ 0.00055 SOL` | 90 |

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
`life | outfit | ink | frame | avatar` (the avatar entries carry more fields: see "Tera avatars").

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
  minute per URL and the `v` parameter is what makes it fresh. `companion.image_url` is already the
  refreshed one.
- Optional, present only when this call wrote an asset:
  `"chain": { "tx_signature": "…", "explorer_url": "…", "lives": 5, "mirrored_at": "…" }` and
  `"written": [{ "asset": "<address>", "attribute": "lives", "value": "5" }]`. A `life_refill` writes
  the companion (`chain.lives` is the lives now on chain); an ink or a frame writes the certification
  (`written` holds the `ink` / `frame` attribute, `chain` has no `lives`). `written` lists the
  attributes the transaction changed, `value` being the on-chain string. An outfit writes nothing at
  purchase (it is written on equip), and a repeated confirm of an applied intent sends no
  transaction: both answer without `chain` and `written`.
- All of these must hold: the intent is the caller's and not expired; the signature settled nothing
  else (no other purchase **and no gift**: one ledger, `itera.payments`); the transaction is confirmed
  with no error; its fee payer is the caller's wallet; System transfers **from the fee payer** to the
  treasury add up to at least the intent's lamports; and the transaction carries **exactly one** memo
  instruction, equal to the intent id. A transaction with two memos (the ids of two intents) pays
  nothing: `422 payment_mismatch`, `detail: memo`. Other extra instructions (a wallet's priority
  fee) are tolerated.
- One payment, one thing: `itera.settle_payment(kind, ref_id, signature, lamports)` locks the intent,
  writes the ledger entry and marks the intent paid in one database transaction. The same signature
  offered to any other purchase or gift answers `409 signature_reused`. The in-app gift shares one id
  between its purchase and its gift row, so both point at one ledger entry. Proof on devnet:
  `node scripts/hackathon/security-attacks.mjs a`.
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

### `POST /purchase-submit` (a wallet that only signs)

For a wallet that supports `signTransaction` but not `signAndSendTransaction`: the browser gets the
signature, the server broadcasts and then runs the **same settlement code** as `purchase-confirm`
(`_shared/purchase-settle.ts`).

Body `{ "intent_id": "…", "signed_transaction": "<base64 or base58>", "lang": "pt" | "en" }`, where
`signed_transaction` is the fully signed serialized transaction. Answer: exactly the
`purchase-confirm` response.

```ts
const tx = Transaction.from(base64ToBytes(intent.transaction_base64));   // @solana/web3.js
const signed = await provider.signTransaction(tx);                       // Phantom: window.phantom.solana
await submit({ intent_id: intent.intent_id, signed_transaction: bytesToBase64(signed.serialize()) });
```

Without `@solana/web3.js`: sign `intent.message_base64` bytes with a raw ed25519 signer and send
`[0x01, ...signature(64), ...message]`.

Checked **before** anything is broadcast, in this order:

1. the text decodes to a whole legacy transaction (`400 invalid_transaction`: not base64/base58, a
   bare message, truncated, trailing bytes, a versioned message, more than 1232 bytes);
2. the first signature is the fee payer's ed25519 signature over the message (`422 signature_invalid`);
3. the intent is the caller's, payable and its signature is on no other purchase (the
   `purchase-confirm` errors);
4. `verifyPayment`, the function `purchase-confirm` applies to the landed transaction, applied to the
   signed message: fee payer and source = the caller's wallet, a System transfer to the treasury of
   at least the intent's lamports, a Memo equal to the intent id; other instructions (compute
   budget) are tolerated (`422 payment_mismatch` with `detail`).

Then `sendTransaction`; "already processed" counts as sent. The node refusing it answers
`422 { "error": "broadcast_failed", "detail": "<node message, at most 200 chars>" }` (a dead
blockhash: ask `purchase-intent` again and sign the new message). After a successful broadcast the
answer is whatever `purchase-confirm` would give for that signature; when it is an error
(`tx_not_found` while the transaction propagates, `rpc_unavailable`) it also carries
`"signature": "<base58>"`: post the same body again, or call `purchase-confirm` with it.
Idempotent: the same body again returns the same paid answer and re-applies nothing.

Errors: those of `purchase-confirm`, plus `invalid_transaction`, `signature_invalid`,
`broadcast_failed`.

### `POST /link-wallet` (an e-mail account binds a wallet)

An account that signed up with e-mail has no wallet: its certifications stay `unclaimed`, its
companion is off chain and `purchase-intent` answers `no_wallet`. It can bind **one** Solana wallet
by signing a message. No auth identity is created and the session does not change.

| Body | Answer |
|---|---|
| `{ "action": "status" }` | `{ "wallet": "<address>" \| null, "source": "identity" \| "linked" \| null }` |
| `{ "action": "challenge", "address": "<wallet>" }` | `{ "challenge_id": "<uuid>", "message": "…", "expires_at": "<ISO, +5 min>" }` |
| `{ "action": "verify", "challenge_id": "<uuid>", "signature": "<base58 or base64>" }` | `{ "wallet": "<address>", "linked_at": "<ISO>", "pending_mints": 4 }` |

```ts
const provider = window.phantom.solana;
const { publicKey } = await provider.connect();
const { challenge_id, message } = await linkWallet({ action: 'challenge', address: publicKey.toBase58() });
const { signature } = await provider.signMessage(new TextEncoder().encode(message), 'utf8');   // Uint8Array(64)
await linkWallet({ action: 'verify', challenge_id, signature: bs58.encode(signature) });      // or base64
```

The message is what the wallet shows, signed byte for byte:

```
Itera — link this wallet to your account
Wallet: <address>
Account: <first 8 characters of the itera user id>
Nonce: <32 hex characters>
Issued At: 2026-10-10T12:00:00.000Z
Expires At: 2026-10-10T12:05:00.000Z
```

- `verify` checks a real ed25519 signature (WebCrypto `Ed25519`, in the edge runtime) of the stored
  message by the address the challenge was issued for. The address is never read from the `verify`
  body. `pending_mints` counts the learner's `unclaimed` rows; nothing is minted here.
- After a link the existing flows work unchanged: the next `passport` call mints the unclaimed rows
  to the linked wallet (call it while `remaining > 0`), `companion` mints the companion, purchases
  and the faucet see the wallet, `learner-profile/<wallet>` lists everything.
- One open challenge per learner: asking again deletes the previous one. A challenge is single use.
- **No unlinking and no re-linking in this version.** A wrong wallet is removed by an operator:
  `delete from itera.user_wallets where user_id = '<id>';` (assets already minted stay where they are).

| Error | When |
|---|---|
| `400 invalid_body` | unknown `action`, a `verify` without a uuid `challenge_id` or a text `signature` |
| `400 invalid_address` | `address` is not a Solana public key |
| `409 already_wallet_account` | the caller signs in with a wallet: nothing to link (`challenge`, `verify`) |
| `409 already_linked` | the caller already has a linked wallet |
| `409 wallet_in_use` | the wallet is another learner's linked wallet, or any account's sign-in wallet |
| `404 challenge_not_found` | unknown, replaced by a newer one, or issued to another learner |
| `410 challenge_expired` | older than five minutes, or already used |
| `422 signature_invalid` | not the wallet's signature of that message |

**A linked wallet that later signs in on its own is the same learner** (migration `0141`, security
review finding 9). When wallet W, linked by e-mail account A, signs in with Solana, the provisioning
trigger finds W in `user_wallets` and attaches the new sign-in to A (one more row in
`itera.identities`): no second learner, no new tenant. Both sessions then resolve the same learner
and the same wallet (`link-wallet` `status` says `source: "identity"` for the wallet session and
`"linked"` for the e-mail one), and a gift to W finds one learner. The link was only ever written
after W signed a challenge for A. Proof: `node scripts/hackathon/security-attacks.mjs i`.

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
- The `lose` that takes the **last** life writes `lives = 0` to the companion asset and the answer
  gains `"chain": { "tx_signature", "explorer_url", "lives": 0, "mirrored_at" }`. The field is absent
  whenever this call wrote nothing: an ordinary mistake, a replayed `attempt_id`, a learner without a
  wallet or without a minted companion. The call waits at most 5 s for the chain (about 3 s in
  practice against 1.5 s for an ordinary `lose`); past that it answers without `chain`, the write
  finishes in the background, the row is flagged `mirror_due` and the next `lives` or `companion`
  call retries it. With two lives or fewer left the Solana SDK is loaded ahead of time so that write
  starts warm.
- Regeneration: +1 every 20 minutes up to 5, computed on read.
- `lesson_end` grants +1 when `bonus` is `granted`. Otherwise `bonus` says why not: `mistakes`
  (client count, or any life lost today in that lesson's activities), `lesson_incomplete` (not every
  published activity of the lesson is completed in `itera.progress`), `already_granted` (once per
  lesson per day), `full`. It also mirrors lives, level, xp and streak to the asset in the
  background; a failed write is retried by the next mirror moment.

### Mirror ordering (one writer per companion)

Two mirror moments close together (the last life, then a refill a few seconds later) used to send
two independent transactions, and the older value could land last. `syncMirror`
(`_shared/companion-store.ts`, decisions in `_shared/mirror.ts`) now serializes them:

- A mirror first claims the row (`mirror_claimed_at`, compare-and-set; a claim older than 60 s is
  taken over). The holder reads the row **immediately before** building each transaction, so it
  never writes a value captured earlier.
- A caller that finds the mirror taken sends nothing. It sets `mirror_dirty` (and `mirror_due`) and
  returns; the holder, after its transaction is confirmed, can only release the claim while
  `mirror_dirty` is false, otherwise it reads the row and writes again (at most 5 passes; still dirty after that, it lets go and leaves the row `mirror_due` for the next call). The last
  confirmed write is therefore the latest database state.
- `life_refill` waits up to 6 s, and the last-life `lose` up to 2.5 s, for a mirror in flight to
  finish and then takes the claim itself, so its answer still carries `chain`. Background mirrors
  (`lesson_end`, equip) defer at once.
- `chain` in an answer is unchanged: present only when that call confirmed a write, with the lives
  that write put on chain; absent when the call deferred or had nothing to write (for example a
  `lose` whose mirror started after the refill already landed in the database).

### Mirror limits (who the authority pays for)

Every mirror is a transaction signed and paid by the mint authority, so each one passes
`mirrorPolicy` (`_shared/mirror.ts`, migrations `0136`, `0137`) before it is sent:

- **Cooldown**: at least 30 s between two ordinary mirrors of one companion (an equip, a lesson end,
  a retry). Inside the window nothing is sent: the row is flagged `mirror_due` and ONE invocation
  waits for the window to end and writes the state the database has then, so any number of changes
  coalesce into one transaction. If that invocation dies, the next `companion` / `lives` call writes.
- **Not held by the cooldown**: a purchase (`life_refill`, a gift received, an outfit put on within
  10 minutes of being bought or claimed) and the loss of the last life. They are the two moments the
  product shows on chain and they still land within seconds.
- **Daily cap**: 60 on-chain writes per companion per UTC day (`companions.mirror_day`,
  `mirror_writes`), counted for every reason. Past it the database stays right, nothing is sent, the
  answer carries no `chain`, and the asset catches up on the first call of the next day.
- Contract unchanged: `chain` was already optional everywhere. What a client can now see: after an
  equip that was not just bought, or a lesson end, the asset may be up to 30 s behind.

Proof on devnet: `node scripts/hackathon/security-attacks.mjs d` (8 equip changes in 22 s = 2 writes).

### `POST /wallet-faucet`

Works for a sign-in wallet and for a linked one.
`{ "signature": "…", "lamports": 10000000, "explorer_url": "…" }`, or HTTP 200
`{ "blocked": "already_claimed" | "not_needed" | "not_devnet" | "no_wallet" }`, or
`503 { "error": "faucet_unavailable" | "rpc_unavailable" }` (`rpc_unavailable` may carry `signature`
when the transfer was handed to the node and not seen confirmed). Only when the balance cannot pay
the cheapest active item. Paid by the treasury, never by the mint authority. Rules in
`_shared/faucet.ts` (migration `0140`, security review finding 7):

- **One claim per learner AND per wallet** (`devnet_airdrops`: `wallet` primary key, `user_id` unique).
- **A transfer that timed out is never paid twice.** The row is the lock; the signature is stored the
  moment the node accepts the transaction and the row is kept from then on. A claim not seen
  confirmed answers `already_claimed` for 3 minutes (longer than a blockhash lives); after that the
  next call asks the chain about the stored signature: landed means claimed, and only when the chain
  has nothing is the drop sent again, once. The lock is released only when nothing was sent.
- **Daily budget**: 0.3 SOL in any 24 hours (thirty drops), then `503 faucet_unavailable`; also capped
  at 200 claims in all and refused when the treasury is low.
- The memo is `faucet:<wallet>`. It used to carry the internal learner id.

Wallets are free, so a determined visitor can still take the whole daily budget with thirty
accounts: the budget is the bound, not the per-learner rule.

### Companion in the public functions

- `GET /credential-verify/<asset>`: same shape; `achievement.key = "companion"`,
  `achievement.state = { lives, max_lives, outfit, level, xp, streak }` (the database), plus
  `companion: { lives, max_lives, outfit, level, xp, streak, image_url, metadata_url }` parsed from
  the on-chain attributes and `snapshot: { source: "chain", mirrored_at: "<ISO>" | null }`
  (`mirrored_at`: the last successful write of the asset; `null` for a companion last mirrored
  before 2026-10-10).
- **The public view is one snapshot, the chain's.** `companion.image_url` and
  `achievement.image_url` of a companion are `…/image.svg?source=chain&v=<lives>-<max>-<level>-<outfit>`,
  art that draws the values the asset holds, so the picture and the numbers next to it agree.
  Lives regenerate in the database and reach the chain only at the mirror moments, so the signed-in
  card (`POST /companion`, live database values, art URL without `source`) can be ahead of it.
- `GET /learner-profile/<wallet>` lists the companion with the wallet's certifications and medals
  (contract in [`onchain-passport.md`](onchain-passport.md)); its `companion.image_url` is the same
  `source=chain` art and it carries `companion.mirrored_at`.
- `GET /credential-meta/companion/<companion id>` and `…/image.svg` (`?lang=pt|en`): metadata and
  art (Tera, a hearts row, the outfit, the level). Keyed by the companion id; no name or email.
  Without a parameter the art draws the database row, as before. With `?source=chain` it reads the
  asset (one `getMultipleAccounts` call) and draws its `lives`, `max_lives`, `level` and `outfit`;
  when the node cannot be reached it falls back to the last mirrored attributes, then to the row.
  The parameter and the values are part of the URL, so the one-minute cache holds one entry per
  snapshot.
- `GET /credential-meta/<row id>` gains `Ink` / `Frame` in `attributes` when set.

### Operator sync on `passport`

`POST /passport` with the function's service key as Bearer (this project: the `sb_secret_…` key),
**no `Origin` header**, and `{ "user_id": "<itera user id>", "max_jobs": 1..10, "lang" }` runs the
normal flow for that learner (wallet from the learner's own web3 identity, else the linked wallet) and returns the normal
response. The key is compared in constant time. Any other request behaves exactly as before.

```bash
node scripts/hackathon/passport-sync.mjs <wallet address | itera user id> [--lang pt|en]
```

## Gift a life and the invite reward

Migrations `0123_gift_referral.sql`, `0124_gift_referral_user_read.sql`, `0125_outfit_laurel_item.sql`.
Functions `action-gift`, `gifts`, `referral` (new) and additive changes to `purchase-intent`,
`purchase-confirm` / `purchase-submit`, `shop-items`, `companion`, `lives`, `passport`.

| Table | What | Learner can read |
|---|---|---|
| `gifts` | one row per gift intent: `id` (= the memo of the payment; the in-app path shares it with its `purchases` row), `source` (`app` / `action`), `from_wallet`, `from_user_id` (null when the payer is not a learner), `to_user_id`, `to_wallet`, `lamports`, `status` (`pending` / `paid` / `delivered` / `expired`), `tx_signature` (unique), `mirror_signature`, `created_at`, `paid_at`, `delivered_at`, `seen_at` | rows they received or sent |
| `referral_codes` | `user_id` -> `code` (8 characters, random, stable) | own row |
| `referrals` | `invited_user_id` (pk) -> `inviter_user_id`, `code`, `status` (`pending` / `rewarded`), `claimed_at`, `rewarded_at` | rows they are part of |

### The bonus life

A gift or an invite reward may put **one** life above the maximum (`companions.lives <= max_lives + 1`),
so it is never wasted. Every `lives` block gains `bonus` (0 or 1): `{ current: 6, max: 5, bonus: 1,
next_regen_at: null, regen_seconds: 0, … }`. A bonus life never regenerates, is the first one a
mistake takes, and survives a refill and a lesson bonus. On chain the companion says `lives = 6`,
`max_lives = 5`; the companion art draws a sixth heart in gold and `6/5`. A client that clamps
`current` to `max` (the front end before this change) simply shows 5/5.

### Item `life_gift` (kind `gift`, US$ 0.10 · 550 000 lamports · `US$ 0.10 ≈ 0.00055 SOL`)

- `GET /shop-items` lists it **only** with `?with=gift` (it is bought on a profile, not in the shop).
- `POST /purchase-intent` `{ "item_key": "life_gift", "recipient": "<wallet address>" }`: same answer
  as any intent, plus `recipient: { wallet }`. The purchase's `ref_id` is the recipient's user id.
  Errors on top of the usual ones: `400 invalid_ref` (no or malformed `recipient`),
  `404 recipient_not_found` (the wallet is nobody's sign-in or linked wallet), `409 self_gift`,
  `409 recipient_full` (already at max + 1), `429 gift_limit` (the recipient received 5 gifts in the
  last 24 hours; counted on paid gifts).
- `POST /purchase-confirm` / `-submit`: the usual paid answer (`passport: null`, no `lives` /
  `companion` of the payer) plus
  `gift: { id, source, status, from: { wallet, name }, to: { wallet, name }, recipient: { lives, max_lives, companion_asset, companion_explorer_url }, payment_explorer_url, mirror_tx_signature, mirror_explorer_url, delivered_at, seen_at }`.
  `chain` / `written` describe the write of the **recipient's** companion when this call made it;
  a repeated confirm has no `chain` but keeps `gift.mirror_explorer_url`. `name` is the nickname of
  a wallet learner, `null` for anyone else (an e-mail account's name is never returned).
- The life is given exactly once per intent (`life_events`, attempt `gift:<intent id>`), and one
  payment settles one thing across purchases and gifts (the `payments` ledger, see `purchase-confirm`).

### `POST /gifts` (Bearer user token, app CORS)

- `{ "action": "inbox" }` -> `{ gifts: [<gift as above>] }`: delivered gifts the caller has not seen
  (at most 5, oldest first). Runs the reconcile below first.
- `{ "action": "seen", "ids": ["<gift id>", …] }` -> `{ seen: <rows marked> }` (only the caller's).

### Solana Action `action-gift` (public, no token; the blink)

`X-Action-Version: 2.4`, `X-Blockchain-Ids: solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` and open CORS
(`Access-Control-Allow-Origin: *`, methods `GET,POST,PUT,OPTIONS`, headers `Content-Type,
Authorization, Content-Encoding, Accept-Encoding, X-Action-Version, X-Blockchain-Ids,
X-Accept-Action-Version, X-Accept-Blockchain-Ids`) on **every** answer, `OPTIONS` included (204).
`?lang=pt|en` (default `en`). Errors are `ActionError` bodies, `{ "message": "…" }`.

| Call | Answer |
|---|---|
| `GET /action-gift?to=<wallet>` or `GET /action-gift/<wallet>` | `ActionGetResponse`: `{ type: "action", icon: <the recipient's companion art>, title: "Give <name>'s Tera a life", description, label: "Gift a life", links: { actions: [{ type: "transaction", label: "Gift a life · 0.00055 SOL", href: <this url> }] } }`; `disabled: true` + `error` while the recipient is full or over the daily limit. `400` malformed wallet, `404` unknown wallet |
| `POST` (same url) `{ "account": "<payer wallet>" }` | `ActionPostResponse`: `{ type: "transaction", transaction: <base64 unsigned legacy transaction: System transfer account -> treasury of 550 000 lamports + Memo(gift id)>, message, links: { next: { type: "post", href: "…/action-gift/confirm?gift=<id>&lang=…" } } }`. `400` bad account (not a real ed25519 public key), self-gift, recipient full, insufficient funds; `429` daily limit, or too many open intents for this recipient; `503` node down |
| `POST /action-gift/confirm?gift=<id>` `{ "account", "signature" }` | `CompletedAction`: `{ type: "completed", icon, title: "Life delivered ✓", description, label }`. Same checks as `purchase-confirm` (payer, treasury, amount, memo, read from chain). `404` gift / transaction not visible yet (call again), `410` expired, `422` wrong payer or payment, `409` signature reused. Idempotent |

- The payer needs no Itera account. A repeated `POST` for the same payer and recipient refreshes
  one pending row; before it, a payment of that payer whose callback never came is settled.
- Shareable link: `https://dial.to/?action=<encodeURIComponent("solana-action:" + action url)>&cluster=devnet`.
- `public/actions.json` maps `/gift/*` on the web app to `…/functions/v1/action-gift/*`; nginx serves
  it with `Access-Control-Allow-Origin: *` (`location = /actions.json` in `Dockerfile`). The app's
  own `/gift/<wallet>` page shows the recipient's Tera and the same gift button.

### The callback that never arrives (reconcile)

`_shared/gift-reconcile.ts`. A gift that is `pending` for more than 15 s is looked up on chain:
`getSignaturesForAddress(<payer>, limit 25)` returns each transaction's memo, and the one carrying
the gift id is settled through the normal path (`purchase-confirm`'s settlement for the in-app
path, the Action settlement otherwise). A `paid` gift whose life is still due is delivered too.
It runs when the recipient calls `companion` (waited up to 4 s) or `gifts` inbox, in the background
of `lives`, and for the payer on the next Action `POST`. Idempotent on the signature and on the
intent. An unpaid gift is marked `expired` two minutes after its blockhash died.

### `POST /referral` (Bearer user token, app CORS)

- `{ "action": "status" }` -> `{ code, link: "<site>/?ref=<code>", invited: [{ status: "pending" | "rewarded", at }], rewarded_count, pending_count }`.
  No name, e-mail, wallet or id of anyone else. The code is created on first use.
- `{ "action": "claim", "code" }` -> `200 { claimed: true }` or `200 { claimed: false, reason }` with
  `reason`: `unknown_code`, `self_referral`, `already_claimed` (one invite per learner, for ever),
  `account_too_old` (`itera.users.created_at` more than 10 minutes ago).
- **Reward.** Paid inside `passport`, on the call that finds the invited learner holding
  `first_stamp` while their referral is `pending`: the invited learner gets the medal `invited`
  (it is in that call's `awards` and minted with the others) and +1 life; the inviter gets a medal
  `friend_brought` (one per invited friend, `ref_id` = the invited learner's id) and +1 life. Both
  lives may be the bonus life and both companions are mirrored. The inviter's medal is minted in
  the background of the same call, after the caller's own mints, with up to three attempts; a
  `failed` row is retried by the inviter's next `passport` call, as any medal. Every step is
  idempotent and `rewarded` is written last.

- **Caps** (migration `0138`, security review finding 5): one inviter earns at most **5** invite
  rewards in 24 hours and **50** in all. An invite takes one of the inviter's slots
  (`itera.claim_referral_reward`, atomic per inviter) before anything is given. With no slot nothing is
  given to either side, the invite stays `pending`, and the invited learner's `passport` answer
  carries the optional `referral: { "rewarded": false, "reason": "cap" }`; a later call, once a slot
  is free, rewards it (`referral: { "rewarded": true }` on the call that does). The invited learner's
  own stamps and medals are never held back.
- **The first day must be real enough to be stamped**: the reward hangs on `first_stamp`, and a day
  that fails the plausibility floor (see "Trust model" in `docs/onchain-passport.md`) earns none.
  Proof: `node scripts/hackathon/security-attacks.mjs e` (no on-chain cost).

### Known limits (gift and referral)

- Two payers racing for the last free slot can both pay; the second life is lost at the cap (6).
  The daily limit counts paid gifts, so the same race can go one over it.
- The Action takes no token, so its cost is bounded per recipient, not per caller (migration `0139`,
  `actionSlot` in `_shared/gift.ts`; security review finding 6). Everything below is decided from the
  database, before the Solana node is asked anything:
  - `account` must be a real ed25519 public key (on the curve, not a small-order point): the System
    address, off-curve bytes and program-derived addresses answer `400`.
  - at most **10** open Action intents per recipient and **60** unpaid ones in 24 hours; past either
    a new payer gets `429` with an `ActionError` ("Too many gifts are open for this learner right
    now…") and no row is written. An intent takes its slot before the node is asked, so an unfunded
    payer also uses one (and frees it when its window ends, about 3.5 minutes).
  - the same payer asking again gets the **same transaction** while its blockhash has 20 s or more to
    live (no node call, one row); an attempt that gave no transaction is answered from the database
    for 15 s.
  - an unpaid intent older than the callback's grace window (24 h) is marked `expired`.
  There is still no per-IP limit: someone can keep one recipient's ten slots taken and stop blinks to
  that learner (the in-app gift is not affected). Proof: `node scripts/hackathon/security-attacks.mjs f`.
- `learner-profile` is cached for 20 s, so a profile can show the lives from before a gift for that long.
- The invite reward needs the invited learner's `passport` call (the app makes it at lesson end).

### Tests

```bash
node scripts/hackathon/gift-e2e.mjs                                         # devnet, ~0.04 SOL of the authority, 72 checks
node scripts/hackathon/gift-browser.mjs --base http://localhost:8080 --out /tmp/hk-gift   # two wallets, fake Phantom, local dev server
```

## Tera avatars (profile pictures: free icons and collectible NFTs)

Migration `0142_nft_avatars.sql`. Pure rules in `_shared/avatars.ts` and `_shared/preview.ts`, database
and mint in `_shared/avatar-store.ts`, picture fetch in `_shared/avatar-image.ts`. Everything here is
additive: the items, the certification path and the lives behave as before.

Every learner always has an avatar (there is no photo upload). The default is `tera_normal`. Ten
expressions are free and everyone's; the other 33 are **collectibles**: Metaplex Core assets in the
collection "Itera Avatars" (`onchain_config.collection_avatars`,
`Gy4mSSquMaH278zLbGvCvaLS2RTPoZvAFTfHsw7qHAvr`), numbered, sold from the wallet through the purchase
rail, and **not frozen**: unlike a certification or the companion, the owner can transfer one.

### Data

| Table | What | Learner can read |
|---|---|---|
| `shop_items` (kind `avatar`) | the catalog. Extra columns `rarity`, `avatar_group`, `supply_cap` (`null` = open edition), `image_key`. `price_lamports` is `NULL` for a free avatar | everyone |
| `avatar_tiers` | the rarity ladder: `rarity`, `rank`, `tier_name_i18n`, `label_i18n` | everyone |
| `avatar_assets` | one row per (learner, avatar): `serial`, `purchase_id`, `mint_status` (`reserved` / `pending` / `minted` / `failed`), `reserved_until`, `wallet`, `asset_address` (unique), `tx_signature`, `minted_at`. Unique `(user_id, item_key)` and `(item_key, serial)` | own rows |
| `avatar_supply` (view) | per avatar: `minted` (paid units) and `held` (paid + unpaid holds still inside their window) | nobody |
| `companions.avatar` | the avatar worn, default `tera_normal` | own row |
| `purchases.refund_due_at` | a paid purchase whose unit was gone | own rows |

| rarity | tier name (pt / en) | label (pt / en) |
|---|---|---|
| `common` | Tera / Tera | Comum / Common |
| `rare` | Super Tera / Super Tera | Raro / Rare |
| `epic` | Mega Tera / Mega Tera | Muito raro / Very rare |
| `legendary` | Tera Lendário / Legendary Tera | Lendário / Legendary |
| `mythic` | Tera Mítico / Mythic Tera | Impossível / Impossible |

Prices use the shop's one pinned rate (1 US cent = 55 000 lamports). The top of the pyramid is
US$ 1,000.00 = 5 500 000 000 lamports: above int32, so lamports stay `bigint` in the database and
`bigint` / safe-integer numbers in code, and the ceiling of `shop_items.price_lamports` went from 1 SOL
to 100 SOL. `insufficient_funds` is the normal answer for the expensive tiers. The faucet still
looks at the cheapest item **for sale** (`life_refill`), so its behaviour did not change.

| key | title (pt / en) | group | rarity | price | supply |
|---|---|---|---|---|---|
| `tera_normal` | Normal / Normal | expression | common | free | open |
| `tera_feliz` | Feliz / Happy | expression | common | free | open |
| `tera_determinado` | Determinado / Determined | expression | common | free | open |
| `tera_piscada` | Piscada / Wink | expression | common | free | open |
| `tera_surpreso` | Surpreso / Surprised | expression | common | free | open |
| `tera_focado` | Focado / Focused | expression | common | free | open |
| `tera_triste` | Triste / Sad | expression | common | free | open |
| `tera_sorriso` | Sorriso ligeiro / Slight smile | expression | common | free | open |
| `tera_sob_pressao` | Sob pressão / Under pressure | expression | common | free | open |
| `tera_curioso` | Curioso / Curious | expression | common | free | open |
| `base_iniciante` | Iniciante / Beginner | base | common | US$ 0.20 ≈ 0.0011 SOL | open |
| `base_focado` | Focado / Focused | base | common | US$ 0.20 ≈ 0.0011 SOL | open |
| `base_estudioso` | Estudioso / Studious | base | common | US$ 0.20 ≈ 0.0011 SOL | open |
| `base_determinado` | Determinado / Determined | base | common | US$ 0.20 ≈ 0.0011 SOL | open |
| `base_disciplinado` | Disciplinado / Disciplined | base | common | US$ 0.20 ≈ 0.0011 SOL | open |
| `base_focado_no_objetivo` | Focado no objetivo / Goal-driven | base | common | US$ 0.20 ≈ 0.0011 SOL | open |
| `base_criativo` | Criativo / Creative | base | common | US$ 0.20 ≈ 0.0011 SOL | open |
| `base_analitico` | Analítico / Analytical | base | common | US$ 0.20 ≈ 0.0011 SOL | open |
| `acc_cyber_chip` | Cyber-chip / Cyber-chip | accessory | rare | US$ 0.50 ≈ 0.00275 SOL | open |
| `acc_oculos_tech` | Óculos tech / Tech glasses | accessory | rare | US$ 0.50 ≈ 0.00275 SOL | open |
| `acc_capuz_web3` | Capuz Web3 / Web3 hoodie | accessory | rare | US$ 0.50 ≈ 0.00275 SOL | open |
| `acc_chain_link` | Chain-link / Chain-link | accessory | rare | US$ 0.50 ≈ 0.00275 SOL | open |
| `acc_programador` | Programador / Coder | accessory | rare | US$ 0.50 ≈ 0.00275 SOL | open |
| `base_lider` | Líder / Leader | base | rare | US$ 1.00 ≈ 0.0055 SOL | 500 |
| `base_mistico` | Místico / Mystic | base | rare | US$ 1.00 ≈ 0.0055 SOL | 500 |
| `base_natural` | Natural / Natural | base | rare | US$ 1.00 ≈ 0.0055 SOL | 500 |
| `base_livre` | Livre / Free spirit | base | rare | US$ 1.00 ≈ 0.0055 SOL | 500 |
| `base_guerreiro` | Guerreiro / Warrior | base | epic | US$ 10.00 ≈ 0.055 SOL | 100 |
| `base_sombrio` | Sombrio / Shadow | base | epic | US$ 10.00 ≈ 0.055 SOL | 100 |
| `base_sabedoria` | Sabedoria / Wisdom | base | epic | US$ 10.00 ≈ 0.055 SOL | 100 |
| `base_evoluido` | Evoluído / Evolved | base | epic | US$ 10.00 ≈ 0.055 SOL | 100 |
| `event_halloween` | Halloween / Halloween | event | epic | US$ 10.00 ≈ 0.055 SOL | 100 |
| `event_natal` | Natal / Holiday | event | epic | US$ 10.00 ≈ 0.055 SOL | 100 |
| `event_verao` | Verão / Summer | event | epic | US$ 10.00 ≈ 0.055 SOL | 100 |
| `special_dourado` | Dourado / Golden | special | legendary | US$ 100.00 ≈ 0.55 SOL | 25 |
| `special_prata` | Prata / Silver | special | legendary | US$ 100.00 ≈ 0.55 SOL | 25 |
| `special_verde_neon` | Verde neon / Neon green | special | legendary | US$ 100.00 ≈ 0.55 SOL | 25 |
| `special_azul_eletrico` | Azul elétrico / Electric blue | special | legendary | US$ 100.00 ≈ 0.55 SOL | 25 |
| `special_roxo_estelar` | Roxo estelar / Stellar purple | special | legendary | US$ 100.00 ≈ 0.55 SOL | 25 |
| `special_vermelho_lava` | Vermelho lava / Lava red | special | legendary | US$ 100.00 ≈ 0.55 SOL | 25 |
| `special_preto_cosmico` | Preto cósmico / Cosmic black | special | legendary | US$ 100.00 ≈ 0.55 SOL | 25 |
| `special_arco_iris` | Arco-íris / Rainbow | special | mythic | US$ 1,000.00 ≈ 5.5 SOL | 5 |
| `event_space` | Space / Space | event | mythic | US$ 1,000.00 ≈ 5.5 SOL | 5 |

### Adding an avatar = one insert + one uploaded image

```sql
insert into itera.shop_items
  (key, kind, price_lamports, price_usd_cents, price_label, title_i18n, description_i18n, active, sort, rarity, avatar_group, supply_cap, image_key)
values
  ('special_aurora', 'avatar', 100 * 55000, 100, 'US$ 1.00 ≈ 0.0055 SOL',
   '{"pt": "Aurora", "en": "Aurora"}', '{"pt": "…", "en": "…"}', true, 1700, 'rare', 'special', 250, 'special_aurora');
```

Upload `special_aurora.webp` (512 px), `special_aurora_128.webp` and `special_aurora.png` to the public
bucket `tera-avatars`; every URL is derived from `image_key`. A free avatar is the same insert with
`price_lamports = null`, `price_usd_cents = 0`. A new tier is one row in `avatar_tiers`. No deploy:
`shop-items` reads the catalog on every call, the other functions within a minute. Only `expression`
avatars take an outfit (see the art rule below).

### Lore

The names and stories of the Tera avatars live in `supabase/functions/_shared/tera-lore.json`
(`avatars.<key>` has `name`, `epithet`, `story`, `quote` in `pt` and `en`). The frontend keeps a mirror at
`src/content/teraLore.ts`: whoever edits either copy must update the other. Migration `0143_avatar_lore.sql`
copies `name` / `epithet` into `shop_items.title_i18n` / `description_i18n` of the avatar rows, so `title`
carries the lore name everywhere. Reader: `_shared/lore.ts` (`loreOf`, `loreText`, `loreView`), tolerant of a
key without lore (`null`).

- Every avatar object (`shop-items`, `companion.avatar`, `learner-profile.avatar` / `avatars[]`,
  `credential-verify.avatar` and `achievement`) gains `lore: { name, epithet, story, quote } | null`, in `?lang=`
  (default pt), `null` when the key has no lore.
- Avatar objects also carry `chip_url` (`…/<key>_chip.webp`, a 128 px circular crop), derived in `avatarImageUrl(…, "chip")`.
- NFT metadata (`credential-meta/avatar/<id>`): `name` = `<lore name en> · <tier en> #<serial>`, `description` =
  the English story plus the transferable-collectible sentence, attributes `Epithet` and `Quote` (en). The
  on-chain asset name given at mint uses the same composition; assets minted earlier keep their name.
- Add lore for a new avatar: edit the JSON (and the frontend mirror), run
  `node scripts/hackathon/gen-avatar-lore-migration.mjs <NNNN_name>.sql` and apply the generated migration.

### `GET /shop-items`: avatar entries

Listed after the older items (`sort` 1000 and up; sorting by rarity is the frontend's job).

```json
{ "key": "base_lider", "kind": "avatar", "title": "Líder", "description": "…",
  "rarity": "rare", "rarity_label": "Raro", "tier_name": "Super Tera", "group": "base", "free": false,
  "price_usd_cents": 100, "price_lamports": 5500000, "price_label": "US$ 1.00 ≈ 0.0055 SOL",
  "image_url": "https://nyzcbnnbffsizshiolbh.supabase.co/storage/v1/object/public/tera-avatars/base_lider.webp",
  "thumb_url": "…/base_lider_128.webp",
  "supply": { "minted": 6, "max": 500 }, "sold_out": false,
  "owned": false, "equipped": false, "asset_address": null, "allows_outfit": false,
  "sort": 1300, "art": {}, "owned_refs": [] }
```

- A free avatar: `free: true`, `owned: true` for everyone (also without a token), `price_lamports: 0`,
  `price_label` "Grátis" / "Free", `supply: { minted: 0, max: null }`.
- `supply.minted` counts paid units. `sold_out` is true when paid units plus live unpaid holds reach
  the cap (never for the learner who is holding one, or who owns it).
- `owned` / `equipped` / `asset_address` need a token. `asset_address` stays `null` until the mint.

### Buying: serial, supply and the reservation

An avatar is the item kind `avatar` of the registry (`ITEM_HANDLERS.avatar`), through the unchanged
`purchase-intent` -> `purchase-confirm` / `purchase-submit` path: same ledger (`itera.payments`, one
payment settles one thing), same wallet rule (never from the body), same Circuito share.

- **`canBuy`**: `409 free_item` (a free avatar is never sold or minted), `409 already_owned` (one per
  learner), `409 sold_out`, `400 invalid_ref` (an avatar takes no `ref_id`).
- **The serial is reserved at intent time.** Only after the wallet is known to hold the price
  (`402 insufficient_funds` reserves nothing) the intent takes the lowest free serial as an
  `avatar_assets` row with `mint_status = 'reserved'` and `reserved_until` = the intent's `expires_at`
  + 2 minutes. Asking for the intent again keeps the same row and moves the window. An unpaid hold
  past its window is deleted by the next buyer of that avatar and its serial is handed out again, so
  a serial never exceeds the cap.
- **Race safety** is the unique index `(item_key, serial)`: the serial is proposed in TypeScript
  (`reserveAvatar`, `lowestFreeSerial`) and the insert decides. Of two buyers of the last unit one
  insert wins; the other reads again, finds no serial at or below the cap and gets `409 sold_out`
  **before paying**. A cap of 5 can never hold a sixth row.
- **Hoarding**: one learner holds at most 2 unpaid units of limited avatars (`429 reservation_limit`).
- **`apply`** (at confirm): the hold becomes the learner's (`pending`), then the asset is minted to
  the wallet that paid, name `<tier> · <title> #<serial>` in Portuguese (`Super Tera · Líder #7`),
  URI `credential-meta/avatar/<avatar_assets id>`, Attributes `kind=avatar`, `key`, `rarity`, `tier`,
  `serial`, `supply_cap` (`open` for an open edition), and **no freeze plugin**. The asset address is
  derived from the row id, one invocation mints at a time, and a repeated confirm returns the same
  asset: pay once, exactly one asset. The first avatar ever also created the collection.
- **Paid, but the unit is gone.** Only possible when a learner pays after their hold lapsed AND the
  last unit was handed on meanwhile (a transaction that landed but was confirmed late). The confirm
  first tries to take a unit again; when none is left the purchase stays `paid`, gets
  `refund_due_at` and `error = 'sold_out_after_payment'`, and the answer is
  `409 { "error": "sold_out_after_payment", "status": "paid", "refund_due": true, "intent_id", "explorer_url" }`.
  It is never retried into a mint and sends no Circuito share. Nothing refunds automatically:

```sql
select id, user_id, item_key, wallet, lamports, tx_signature, refund_due_at from itera.purchases where refund_due_at is not null;
```

- The paid answer gains
  `avatar: { key, title, tier_name, asset_address, explorer_url, image_url, thumb_url, serial }`
  (no `lives` / `companion` block). The first confirm waits for the mint (5 to 15 s);
  `502 apply_failed` is retryable as for any item.

### Equip

`POST /companion { "lang": "pt" | "en", "equip": { "avatar": "<key>" } }` (the body may also carry
`outfit`; `avatar` alone leaves the outfit as it is). A free avatar can be worn by anyone, a
collectible only by the learner whose **paid** `avatar_assets` row it is; anything else (an unknown
key, an unpaid hold) is `409 not_owned`. **Ownership is our table: transfers on chain are not
tracked in this version**, so a learner who sent the asset away can still wear it here, and whoever
received it cannot. `learner-profile` does tell the truth about the chain (below).

Every `companion` answer carries, for wallet and e-mail learners alike:

```json
"avatar": { "key": "tera_normal", "title": "Normal", "rarity": "common", "tier_name": "Tera", "group": "expression",
            "image_url": "…/tera_normal.webp", "thumb_url": "…/tera_normal_128.webp",
            "asset_address": null, "allows_outfit": true }
```

A stored key that left the catalog reads as the default. The avatar is mirrored to the companion
asset by the existing serialized mirror (same claim, cooldown and daily cap; an avatar put on within
10 minutes of buying it skips the cooldown like an outfit). The attribute `avatar` is written **only
while a non-default avatar is worn**: absent means `tera_normal`, so no companion is rewritten just
because avatars exist. `companion.image_url` gains `-<key>` in its `v` for a non-default avatar.

### Art: the card shows the equipped avatar

`credential-meta/companion/<id>/image.svg` fetches the avatar's picture from the bucket, inlines it
as a data URI (an SVG used as an image cannot load external files) and draws it where Tera stands.
The 512 px file is used when it is at most 110 KB, otherwise the 128 px thumb, so the card stays
under about 250 KB. Pictures are cached in memory by URL (10 minutes; a missing one is retried after
30 s). When neither file can be had the card draws the built-in Tera. The **default avatar always
draws the built-in Tera**, with no fetch: that card is byte for byte the one from before avatars.

**Outfit rule, `allows_outfit`:** the painted outfit layers are drawn only over an avatar of group
`expression`. `base`, `special`, `event` and `accessory` avatars are finished paintings: no outfit
layer is drawn, whatever the learner has equipped (the outfit stays equipped and returns with an
expression avatar). The field is on `avatar` and on every shop entry so the frontend applies the
same rule.

### Preview: `GET /credential-meta/preview.svg` (public, no token, cached 5 minutes)

The same SVG the real endpoints draw, from the query alone: no user data, no write.

- `?type=certification&trail=<text, 40 chars>&days=<0..total>&total=<1..12>&tier=bronze|gold&ink=emerald|violet&frame=gold-leaf&lang=pt|en`
- `?type=companion&avatar=<key>&outfit=<outfit key | none>&lives=<0..5>&level=<1..99>&lang=pt|en`

Every value is validated and clamped; an unknown one falls back to its default (no ink, no frame,
the default avatar, `pt`; `tier` defaults to gold on a full page). `avatar` is checked against the
active catalog before any URL is built. The only refusal is an unknown `type`:
`400 { "error": "invalid_type" }`.

### Avatars in the public functions

- `GET /credential-meta/avatar/<avatar_assets id>` (`?lang=pt|en`, default `en`): Metaplex JSON,
  `image` = the published 512 px webp (the png is in `properties.files`), attributes Avatar, Group,
  Rarity, Tier, Serial, Supply, Transferable; the description says the NFT is **not** soulbound.
  `GET /credential-meta/collection/avatars` (+ `/image.svg`) serves the collection.
- `GET /credential-verify/<avatar asset>`: `achievement.key = "avatar"` (`kind: "avatar"`, `tier` =
  the rarity, `state: { key, group, rarity, tier_name, serial, supply_cap }`), top-level
  `avatar: { key, rarity, tier_name, serial, supply_cap | null }` parsed from the on-chain
  attributes and `image_url`. `frozen: false` and `checks.soulbound: false` are correct for a
  collectible; `verified` is unchanged (our collection, our authority). `issuer.collections` has four
  addresses now.
- `GET /learner-profile/<wallet>` gains `avatar` (the block above, for the learner whose companion
  the wallet holds; the default otherwise) and
  `avatars: [{ key, title, rarity, tier_name, serial, supply_cap, asset, verified, image_url, thumb_url, page_url, explorer_url }]`:
  the collectibles our tables say were minted to that wallet (30 at most). `verified` = in the Avatars
  collection, under our authority, and **owned by that wallet now**, so an avatar transferred away
  shows `verified: false`. Avatars are not counted in `verified_count`. `companion.avatar` (a key)
  is present only for a non-default avatar.

### Known limits (avatars)

- On-chain transfers are not tracked for equip (above), and the new holder gets no row.
- An unpaid hold keeps a unit off sale for its window (about 3 minutes); accounts are free, so the
  last units of a tiny edition can be held by a few funded wallets that never pay. The price must be
  in the wallet to take a hold, and each learner holds two at most.
- Refunds are manual (`refund_due_at`).
- The outfit layers were painted for the built-in Tera. Over another expression avatar they are
  drawn at the same place and may not sit exactly on the picture.
- Redeploying `lives`, `passport`, `gifts`, `action-gift` or `purchase-*` from a tree without this
  code would mirror companions without the `avatar` attribute.

```bash
node scripts/hackathon/avatar-e2e.mjs      # devnet, ~0.012 SOL of the authority, ~0.007 of the treasury, 64 checks
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
for f in shop-items purchase-intent purchase-confirm purchase-submit link-wallet companion lives wallet-faucet credential-meta credential-verify learner-profile passport action-gift gifts referral shop-claim; do
  supabase functions deploy $f --project-ref nyzcbnnbffsizshiolbh --use-api
done
```

## Tests

```bash
npx vitest run --config vitest.supabase.config.ts     # pure modules
source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN HACKATHON_DB_PASSWORD HACKATHON_DEMO_EMAIL HACKATHON_DEMO_PASSWORD
node scripts/hackathon/purchase-e2e.mjs               # devnet, a throwaway keypair plays the wallet (~0.03 SOL)
```

```bash
node scripts/hackathon/link-wallet-e2e.mjs [--keep]   # devnet, ~0.05 SOL of the authority
```

```bash
# The attacks of the security review, reproduced against the live functions, one section per finding.
# Throwaway wallets are funded from the TREASURY key and what they pay flows back to it; the script
# prints both balances around every section and stops before the authority would go below 0.62 SOL
# or the treasury below 0.25 SOL. Cost per section: a, b, e, f, g, i, j, owner: network fees only;
# c: 0.013 SOL of the authority (the mints of one honest day); d: 0.004 (one companion mint, reused
# on later runs); h: one attribute write, needs d first. `owner` is a read-only dry check.
node scripts/hackathon/security-attacks.mjs [a b c d e f g h i j owner]
```

`purchase-e2e.mjs` and `gift-e2e.mjs` fund their wallets from the treasury too (not from the mint
authority) and refuse to start below the same floors. Without `HACKATHON_DEMO_EMAIL` /
`HACKATHON_DEMO_PASSWORD` in the environment `purchase-e2e.mjs` skips its five wallet-less checks
and never signs the demo user in.

`link-wallet-e2e.mjs` creates two e-mail learners (admin API) and one wallet learner, runs the whole
linked-wallet story (unclaimed rows, challenge, verify, mint, companion, a purchase through
`purchase-submit`, `learner-profile`, the chain snapshot of the companion) with every refusal on the
way, and deletes the three users at the end. It reads `link-wallet status` of the demo e-mail user
once and never opens a challenge for it.

```bash
node scripts/hackathon/mirror-order-e2e.mjs [--keep]  # devnet, ~0.035 SOL of the authority
```

`mirror-order-e2e.mjs` loses the last life and pays the refill three times back to back and three
times concurrently, then equips an outfit right after a `lesson_end`, and each time requires the
asset to reach the database's values within 30 s and hold them for 10 s.

`purchase-e2e.mjs` only **reads** the demo e-mail user (companion, a `lesson_end` for a lesson that does not
exist, the two wallet-only refusals) and checks its companion row is unchanged afterwards.

## Verified vs not (2026-10-09)

Verified on devnet by `purchase-e2e.mjs` with a synthetic wallet: the whole table it prints
(companion mint and verification, lives, every item kind, idempotency, reused signature, three
tampered payments, expiry, faucet, the email learner, and that a passport stamped to gold after the
purchases keeps `ink` and `frame`). The server-built message was compared byte for byte with
`@solana/web3.js`. Since 2026-10-10 also: the last life reaching the chain with `chain` in the
answer, `chain` / `written` on a refill and on an ink, the parsed `companion` of
`credential-verify`, the price rule on all seven items, a row stripped of `state.cosmetics` that
still shows, stamps and gets back its ink and frame, and `learner-profile` (84 checks).

Verified on devnet by `link-wallet-e2e.mjs` (2026-10-10, 89 checks): WebCrypto `Ed25519`
verification in the edge runtime (base58 and base64 signatures accepted, five kinds of wrong
signature refused), challenge isolation between learners, replay, `wallet_in_use` for a sign-in
wallet and for a wallet linked meanwhile, RLS on both tables, minting to a linked wallet, and
`purchase-submit` (base64 and base58, six refusals before broadcast, a node refusal, idempotency,
reuse).

Not verified:

- **A real Phantom.** No browser wallet signed these messages. The message is legacy; whether a
  given Phantom build takes it through `request({ method: 'signAndSendTransaction', params: { message } })`
  and what it adds (priority fee, guard instructions) was not observed. The verification tolerates
  extra instructions; a wallet that changes the transfer or drops the memo would be refused.
- Behaviour under the public devnet RPC's rate limit with many concurrent learners.

## Known limits

- A wallet linked to an e-mail account can later be used to **sign in** (Supabase creates a new
  wallet account; nothing in `link-wallet` can stop a sign-in). The two accounts then resolve to the
  same address: both mint to it and `learner-profile` lists the assets of both (one companion, the
  older). The reverse, linking a wallet that already is an account, is refused.
- `link-wallet` has no unlink and no rate limit; a learner holds at most one challenge row.

- A `passport` call and a cosmetic purchase racing on the same row can still drop the
  `state.cosmetics` **copy** (`passport` writes the state it read at the start). Nothing reads the
  copy alone any more, so the page, the metadata and the chain keep the cosmetics, and the next
  `passport` write puts the copy back. What remains is two attribute writes for the same asset sent
  within the same second (a stamp computed just before a purchase, landing just after it): the stamp
  re-reads the purchases immediately before sending, which leaves a window of one database round
  trip. `purchase-confirm` again, or any later stamp, rewrites the attributes.
- `lives.chain` depends on devnet answering inside the 5 s budget; when it does not, the write still
  lands but that response has no `chain`.
- A companion's on-chain `lives` only moves at the mirror moments, so it can lag the database while
  lives regenerate.
- `apply` for a life refill is at-least-once: a crash between the refill and its bookkeeping can
  refill twice.
- The faucet is one claim per learner and per wallet, and wallets are free: the daily budget (0.3 SOL)
  and the treasury balance are the real bounds.
- No rate limit on any function.

## Earned or bought: the golden laurel (`shop-claim`)

Migration `0126_laurel_unlock_claim.sql`. `outfit_laurel` keeps its price and is **also** free once
the learner's level reaches 5. The rule lives on the item (`shop_items.effect.unlock.level`) and is
read by `_shared/unlock.ts`; the level is the companion's (`floor(xp / 200) + 1` from
`itera.xp_events`, `loadStats`), computed on the server.

- `GET /shop-items`: an item that can be earned carries
  `unlock: { level: 5, current_level: <number | null>, unlocked: <boolean> }` (`current_level` is
  `null` without a session). Every other field and every other item is unchanged.
- `POST /shop-claim` (Bearer user token, app CORS) `{ "item_key": "outfit_laurel", "lang"? }` ->
  `200 { status: "claimed", already_owned, item: { key, kind, title }, unlock, lives, companion, inventory, wallet }`.
  It grants the `user_inventory` row a purchase grants and records a `purchases` row with
  `source = 'claim'`, `status = 'paid'`, `lamports = 0`, `memo = 'claim:<key>'`, so both paths end in
  the same inventory and the same history. Idempotent: owning the item (bought or claimed) answers
  `200` with `already_owned: true` and writes nothing; one claim row per learner and item (unique index).
  Errors: `409 locked` (+ `unlock`), `409 not_claimable` (the item has no unlock rule), `404 item_not_found`,
  `409 item_inactive`, `400 invalid_body`, `401 unauthorized`.
- The claim sends no transaction. Wearing it is the usual `companion { equip }`, which mirrors the
  `outfit` attribute like any bought outfit. E-mail learners can claim too (off chain).
- The level is only as trustworthy as the xp ledger. Since migration `0133` `award_activity_xp` gives
  at most 10 xp, once per activity, and only for an activity the caller holds a `completed` progress
  row for (security review, finding 3: the amount used to be the client's). What remains is finding 1:
  the progress row itself is written by the client, so a learner can still reach level 5 without
  learning anything, 10 xp at a time. See "Trust model" in `docs/onchain-passport.md`.

## Circuito: the shop pays for other learners' stamps

Migration `0130_circuit.sql`. The server pays the network fee of every stamp, so a learner never pays
to earn a credential. The Circuito funds that: each **paid** purchase moves 50 % of its lamports from
the treasury to the mint authority, in a plain System transfer signed by the treasury key with the
memo `circuit:<purchase id>`.

- **Amount**: `floor(purchases.lamports / 2)`, read from the paid row (the price stored at intent
  time). **Destination**: the authority's public key, taken from `SOLANA_AUTHORITY_SECRET` inside
  `sendToAuthority` (`_shared/treasury.ts`), which has no recipient parameter. Nothing in a request
  reaches either.
- **Once per purchase**: `purchases.circuit_status` goes `null -> pending` by compare-and-set before
  anything is sent, then `sent` (`circuit_lamports`, `circuit_signature` unique, `circuit_at`),
  `skipped` (`circuit_reason`: `treasury_floor` when the treasury would end below 0.2 SOL after the
  transfer and its fee, `nothing_to_send`, `before_circuit` for purchases older than the feature) or
  `failed`. A free claim and an unpaid intent move nothing. An in-app gift is one purchase row, so it
  moves once; a blink gift (`gifts` table only) is not part of the Circuito.
- **After the answer, never in it** (migration `0135`): `purchase-confirm` / `purchase-submit` do not
  wait for the transfer. They gain an optional
  `circuit: { status: "sent" | "pending" | "skipped" | "failed", lamports, stamps_funded, tx_signature, explorer_url }`
  read from the row alone. On the first confirm that is `pending` with the share the purchase **will**
  move (`lamports = floor(purchases.lamports / 2)`, `stamps_funded = floor(lamports / 5000)`,
  `tx_signature: null`); the transfer runs right after the response (`EdgeRuntime.waitUntil`) and lands
  3 to 6 s later. A repeated confirm then answers `sent` with the transaction. `skipped` / `failed`
  carry zeros.
- **Retry, without paying twice** (`retryCircuits` in `_shared/circuit-store.ts`): after every purchase
  answer and on every `GET /circuit`, at most two older purchases are taken up again: a transfer that
  never ran (`circuit_status` null a minute after the purchase was paid) and one left `pending` or
  `failed` for three minutes (longer than a blockhash lives, so an unseen transaction can no longer
  land). The signature is stored the moment the node accepts the transaction; before sending again
  the retry asks the chain about that signature **and** looks for any treasury transaction with the
  memo `circuit:<purchase id>`. Found: it is recorded as `sent`. Still in flight: left alone. Only when
  the chain has nothing is a new transfer sent, and if the chain cannot be asked nothing is sent.
  Destination and amount are unchanged: the authority key inside `sendToAuthority`, half of the paid
  row. Purchases older than 7 days are left alone. Proof: `node scripts/hackathon/security-attacks.mjs j`.
- `GET /circuit` (public, no token, CORS `*`, cached 15 s; `?wallet=<address>` adds that wallet's
  share and is not cached):
  `{ total_lamports, total_usd_cents, purchases, stamps_funded, cluster, treasury, authority, treasury_explorer_url, authority_explorer_url, recent: [{ at, lamports, tx_signature, explorer_url }] (10), wallet?: { lamports, stamps_funded } }`.
  `total_usd_cents` uses the shop's pinned rate. `400 invalid_address` for a malformed `wallet`, `405`.
- `GET /learner-profile/<wallet>` gains `circuit: { lamports, stamps_funded }` for that wallet's own purchases.
- UI: a strip in the shop header ("Suas compras já pagaram N carimbos de outros alunos · no total a
  loja pagou M ↗"), a line on `/u/<wallet>`, and "+N carimbos pagos pra outros alunos" in the success
  dialog (for a `sent` or a `pending` share: the number is fixed by the paid purchase; the strip's
  totals count confirmed transfers only, so they follow a few seconds later).
- Effect on the treasury: a purchase now nets `price - floor(price / 2) - 5 000` lamports.
  `purchase-e2e.mjs` and `link-wallet-e2e.mjs` accept either reading of their "treasury received" check.

```bash
node scripts/hackathon/social-e2e.mjs [--only laurel,podium,endorse,circuit]   # devnet, < 0.04 SOL of the authority per pass, 101 checks
node scripts/hackathon/social-browser.mjs --base http://localhost:8080 --out /tmp/hk-social   # fake Phantom, local dev server
```
