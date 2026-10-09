# On-chain passport ("Passaporte do Tera")

Hackathon only: Supabase project `nyzcbnnbffsizshiolbh`, Solana **devnet**.

## Architecture

```
itera.progress ──► computeAwards (pure TS) ──► itera.user_achievements ──► Metaplex Core (devnet)
                   _shared/awards.ts            unique (user, key, ref)     minted by the server authority
```

- One **soulbound Core asset per (learner, trail)**: the passport page. The first completed day
  creates it; each further day is an `updatePlugin` of its `Attributes` (`days_done`); the last
  day sets `tier = gold` and `completed_at`. Medals (`first_stamp`, `streak_3`, `streak_7`,
  `program_complete`, `early_bird`, `night_owl`) are one asset each.
- Soulbound = `PermanentFreezeDelegate { frozen: true, authority: None }` set at mint.
- The learner signs nothing and pays nothing. The authority keypair pays and is the update
  authority of two collections, "Itera Passports" and "Itera Medals", created on first use and
  recorded in `itera.onchain_config` (`collection_passports`, `collection_medals`, `authority`,
  `cluster`). The table is public read and holds no secret.
- Every address we create is derived from the authority key plus a label (row id, collection
  name). A retry after a lost response finds the account instead of minting a duplicate.
- A learner without a wallet (email login) still earns rows; they stay `unclaimed` and are minted
  by a later call made with a wallet session.
- The wallet is read from the auth identity (`provider = web3`, written by the auth server), not
  from user-editable metadata, and never from the request.

| key | row `ref_id` | on-chain |
|---|---|---|
| `trail_pass` | unit | creates the passport asset |
| `day_stamp` | lesson | updates the parent passport (`state.parent_id`, `state.tx`) |
| `trail_complete` | unit | updates the passport to gold |
| medals | zero uuid (program id for `program_complete`) | creates a medal asset |

A lesson counts as done when every **published** activity is `completed`; it happened at the
latest `completed_at`. Days and hours are computed in `America/Sao_Paulo`.

## Files

| Path | What |
|---|---|
| `supabase/functions/_shared/awards.ts` | pure awarding logic (`computeAwards`) |
| `supabase/functions/_shared/mint-plan.ts` | pure: which transactions the unminted rows need |
| `supabase/functions/_shared/credential.ts` | pure: names, on-chain attributes, metadata JSON |
| `supabase/functions/_shared/art.ts` | pure: SVG artwork |
| `supabase/functions/_shared/chain.ts` | Umi + mpl-core (the only module that touches Solana) |
| `supabase/functions/{passport,credential-meta,credential-verify}/index.ts` | the three functions |
| `db/migrations/0113_onchain_passport.sql` | catalog seed, `onchain_config`, `mint_claimed_at`, service-role grants |
| `scripts/hackathon/passport-e2e.mjs` | end-to-end script |

## Function contracts

Base URL: `https://nyzcbnnbffsizshiolbh.supabase.co/functions/v1`. CORS: `passport` allows the web
app origins and localhost; the two public functions allow any origin.

### `POST /passport` (user JWT required, checked in code)

Body (optional): `{ "lang": "pt" | "en" }` (default `pt`). Safe to call repeatedly.

```json
{
  "awards": [
    {
      "id": "70f5eb27-…", "key": "trail_pass", "kind": "trail", "tier": "bronze",
      "title": "Trail passport", "description": "…", "ref_id": "<unit id>",
      "state": { "days_done": 1, "total_days": 5, "tier": "bronze", "trail": "Week 1 · HTML",
                 "trail_title": { "pt": "…", "en": "…" }, "stamped_days": [1],
                 "stamped_lesson_ids": ["…"], "program_slug": "itera-v2", "completed_at": null },
      "earned_at": "2026-10-09T21:26:15.229+00:00",
      "mint_status": "minted", "asset_address": "…", "tx_signature": "…",
      "explorer_url": "https://explorer.solana.com/address/…?cluster=devnet",
      "tx_explorer_url": "…", "metadata_url": "…/credential-meta/<id>", "image_url": "…/image.svg"
    }
  ],
  "updated": [],
  "remaining": 0,
  "mint": { "wallet": "<address or null>", "cluster": "devnet", "attempted": 1, "blocked": null }
}
```

- `awards`: rows created by this call. `updated`: older rows this call changed (a passport that
  gained a stamp, a row that got minted). Same shape.
- At most 3 transactions per call; `remaining` is how many are still due. Call again while `> 0`
  and `mint.blocked` is `null`.
- `mint.blocked` says why nothing was minted: `no_wallet`, `authority_unfunded`,
  `authority_not_configured`, `rpc_unavailable`. The function never reports a mint it did not do.
- A failed transaction leaves the rows `failed` with `state.mint_error`; the next call retries.
- Errors: `401 unauthorized`, `403 no_itera_profile`, `400 invalid_body`, `405`, `500 internal_error`.

### `GET /credential-meta/<row id>` (public)

Metaplex-standard JSON: `name`, `symbol`, `description`, `image`, `external_url`
(`https://hackathon-colosseum.178-105-2-230.sslip.io/c/<asset or row id>`), `attributes`,
`properties.files`. `GET /credential-meta/<row id>/image.svg` is the artwork, drawn from the
current `state` (so a passport image gains stamps over time). `?lang=pt|en` (default `en`).
`/credential-meta/collection/<passports|medals>` and `…/image.svg` serve the collections.
Unknown or malformed id: `404 { "error": "not_found" }`.

### `GET /credential-verify/<asset address>` (public)

Reads the asset from chain and attaches the catalog row only when it is ours.

```json
{
  "verified": true,
  "checks": { "collection_is_ours": true, "update_authority_is_ours": true, "soulbound": true },
  "cluster": "devnet",
  "asset": "<address>", "name": "Tera Passport · Week 1 · HTML", "uri": "…",
  "owner": "<wallet>", "frozen": true, "collection": "<address>", "update_authority": "<authority>",
  "attributes": [{ "key": "days_done", "value": "2" }],
  "achievement": { "key": "trail_pass", "kind": "trail", "tier": "bronze", "title": "…",
                   "description": "…", "trail": "…", "credential_id": "…", "earned_at": "…",
                   "minted_at": "…", "state": {}, "metadata_url": "…", "image_url": "…",
                   "stamps": [{ "day": 1, "lesson": "…", "earned_at": "…", "tx_signature": "…" }] },
  "minted_at": "…", "explorer_url": "…", "owner_explorer_url": "…",
  "issuer": { "authority": "…", "collections": ["…", "…"] }, "page_url": "…/c/<address>"
}
```

`verified` is true only when the asset's collection is one of ours **and** that collection's update
authority is our authority. A foreign asset answers 200 with `verified: false` and
`achievement: null`. `400 invalid_address`, `404 asset_not_found`, `502 upstream_unavailable`.
`?lang=pt|en` (default `pt`). No email or name is ever returned; the `learner` attribute is the
itera user id.

## Secrets and deploy

Edge-function secrets (project-wide): `SOLANA_AUTHORITY_SECRET` (64-byte key as a JSON array or
base58) and `SOLANA_RPC_URL` (`https://api.devnet.solana.com`). `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase. Nothing goes in a `VITE_*` variable.

```bash
supabase functions deploy passport --project-ref nyzcbnnbffsizshiolbh --use-api
supabase functions deploy credential-meta --project-ref nyzcbnnbffsizshiolbh --use-api
supabase functions deploy credential-verify --project-ref nyzcbnnbffsizshiolbh --use-api
```

Imports are plain `npm:` specifiers (`@metaplex-foundation/umi@1.6.0`,
`umi-bundle-defaults@1.6.0`, `mpl-core@1.10.0`), bundled by the API (no Docker). `passport` loads
the Solana SDK only when there is something to mint.

## Tests

```bash
npx vitest run --config vitest.supabase.config.ts      # pure modules, 26 tests
source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN HACKATHON_DB_PASSWORD HACKATHON_DEMO_EMAIL HACKATHON_DEMO_PASSWORD
node scripts/hackathon/passport-e2e.mjs demo   [--lessons N] [--reset]   # email user, no wallet
node scripts/hackathon/passport-e2e.mjs wallet [--lessons N]             # throwaway wallet user, exercises the mint
```

The script completes the next N unfinished lessons of `itera-v2` directly in the database, calls
`passport` twice, then reads `credential-meta` and, when something was minted, `credential-verify`.
`--reset` deletes that user's progress and achievement rows. Each `wallet` run leaves one
throwaway user behind.

## Verified vs not (2026-10-09)

Verified:

- Umi + mpl-core load and run in the edge runtime through `npm:` specifiers (authority key
  loaded, balance read, a foreign devnet Core asset read and deserialized by `credential-verify`).
- Awarding end to end for the demo user and for a throwaway wallet user: rows inserted, repeat
  call returns nothing new, passport state moves with each day, gold on the last day.
- `mint.blocked = no_wallet` (email user) and `authority_unfunded` (wallet user).
- Metadata and artwork served for real rows; input validation and CORS on all three functions.
- By devnet `simulateTransaction` only (create collection + create frozen asset + update in one
  transaction, signatures not verified): a frozen asset accepts `updatePlugin(Attributes)` from the
  update authority, twice in a row, and rejects a transfer.

Not verified, blocked by funding (the authority has 0 SOL):

- A real mint: collection creation, asset creation to a learner wallet, the stamp update, the
  writes of `asset_address`/`tx_signature`, and `credential-verify` returning `verified: true`.
- Transaction confirmation polling and the duration of a 3-transaction call in the edge runtime.

Once funded: `node scripts/hackathon/passport-e2e.mjs wallet --lessons 2`, then again with
`--lessons 1` is not possible for the same throwaway user (each run creates a new one); to see a
stamp update, sign in with a real wallet in the app, or call `passport` again for an existing
wallet user after completing another lesson.

## Known limits

- No rate limit on the public functions; `credential-verify` makes RPC calls per request (20 s cache).
- The public devnet RPC is rate limited; a provider URL in `SOLANA_RPC_URL` is advisable for a demo.
- `earned_at` is set when a row is first written and does not move if progress is edited later.
- A row stuck in `pending` (invocation killed mid-mint) is retaken after 3 minutes.
