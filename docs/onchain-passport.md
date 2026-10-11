# On-chain passport ("Passaporte do Tera")

Hackathon only: Supabase project `nyzcbnnbffsizshiolbh`, Solana **devnet**.

> **Display name (2026-10-09):** the product is shown as "Certificações do Tera" / "Tera's
> Certifications" and one trail's page as a "Certificação" / "Certification". Only text changed
> (art, metadata, catalog titles, the asset name of new mints, the collection name "Itera
> Certifications"). Keys, tables, routes and attribute keys (`trail_pass`, `kind: trail_passport`)
> keep the word passport, and so does this document. Purchases, the companion, lives and the
> operator sync of `passport` are in [`onchain-purchases.md`](onchain-purchases.md).

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
  by the first `passport` call made after the account linked a wallet (`link-wallet`, see
  [`onchain-purchases.md`](onchain-purchases.md)).
- The wallet is read from the auth identity (`provider = web3`, written by the auth server) or, for
  an account without one, from `itera.user_wallets` (written only after a verified signature). Never
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
| `supabase/functions/_shared/chain.ts` | Umi + mpl-core: every write, and the single-asset read of `credential-verify` |
| `supabase/functions/_shared/chain-read.ts` | many assets in one `getMultipleAccounts` call (mpl-core deserializers, no Umi client) |
| `supabase/functions/_shared/profile.ts` | pure: `isVerified` and the `learner-profile` response |
| `supabase/functions/{passport,credential-meta,credential-verify,learner-profile}/index.ts` | the four functions |
| `db/migrations/0113_onchain_passport.sql` | catalog seed, `onchain_config`, `mint_claimed_at`, service-role grants |
| `scripts/hackathon/passport-e2e.mjs` | end-to-end script |

## Function contracts

Base URL: `https://nyzcbnnbffsizshiolbh.supabase.co/functions/v1`. CORS: `passport` allows the web
app origins and localhost; the three public functions (`credential-meta`, `credential-verify`,
`learner-profile`) allow any origin.

### `POST /passport` (user JWT required, checked in code)

Body (optional): `{ "lang": "pt" | "en", "lesson_id": "<uuid>" }` (default `pt`). Safe to call repeatedly.

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

- `day_incomplete` (only when the body carries a valid `lesson_id`; the key is absent otherwise):
  `null` when every published activity of that lesson is completed by the caller (or the lesson
  is unknown or has no activities), else `{ "lesson_id": "…", "done": 13, "total": 16 }`. Same
  completion rule as the awards (`dayIncomplete` in `_shared/awards.ts`); nothing else changes.
- `day_pending_review` (optional; the key is absent in the normal case):
  `{ "lesson_id": "…", "reason": "too_fast" | "missing_results" | "unverified" }` when a lesson has every
  activity completed but is held: by the plausibility floor, or because a completion is not backed by a
  server-recorded attempt (see "Trust model"). That lesson awards nothing in this
  call: no stamp, no medal, no mint. With a `lesson_id` in the body it speaks about that lesson only;
  without one, about the first such lesson. The UI needs no change: with no award the end of the lesson
  is the plain completion card.
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

Artwork colour rule: Itera is green. A certification page is charcoal with a green border and green
line stamps on **every** trail (there is no per-trail colour); a completed page is gold. The paid
looks sit on top of that page and never repaint it: `ink = emerald` draws the stamps as jewels
(solid emerald gradient, a sheen, a soft emerald glow inside the border), `ink = violet` draws
violet line stamps and a violet accent bar, `frame = gold-leaf` adds the gilded border. An ink keeps
its stamps on a gold page. The stamp group carries `data-ink="default|emerald|violet"`.

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
`?lang=pt|en` (default `pt`). No email or name is ever returned. The `learner` attribute is the
wallet that owns the asset on everything written since the security hardening (review finding 8);
an asset written before it still carries the internal itera user id there until its next ordinary
write (a stamp, a cosmetic, a mirror). Existing assets are not rewritten on purpose.

For a **companion** asset the answer also carries an optional top-level
`companion: { lives, max_lives, outfit, level, xp, streak, image_url, metadata_url }` parsed from the
on-chain attributes (numbers as numbers, `outfit` the item key or `null`) and
`snapshot: { source: "chain", mirrored_at }`; both `image_url`s of a companion draw the on-chain values. `achievement.state` stays
the database's view of the same companion. Certification and medal assets have no `companion` key.

### `GET /learner-profile/<wallet address>` (public)

Every Itera asset a wallet holds. **What exists** comes from our tables (rows with
`mint_status = 'minted'` recorded for that wallet; stamps and completions own no asset and are not
listed). **Whether each one is valid** comes from chain: all assets and the three collections are
read in one `getMultipleAccounts` call, at most 50 assets.

```json
{
  "wallet": "<address>", "cluster": "devnet", "verified_count": 4,
  "companion": { "asset": "…", "verified": true, "lives": 4, "max_lives": 5, "outfit": "outfit_crown",
                 "level": 1, "xp": 0, "streak": 0, "image_url": "…?source=chain&…",
                 "mirrored_at": "2026-10-10T00:24:54.999+00:00", "explorer_url": "…" },
  "certifications": [{ "asset": "…", "verified": true, "trail": "Semana 1 · HTML",
                       "trail_title": { "pt": "Semana 1 · HTML", "en": "Week 1 · HTML" },
                       "days_done": 5, "total_days": 5, "tier": "gold", "ink": "violet", "frame": "gold-leaf",
                       "completed_at": "…", "earned_at": "…", "image_url": "…", "page_url": "…/c/<asset>",
                       "explorer_url": "…" }],
  "medals": [{ "asset": "…", "verified": true, "key": "first_stamp", "title": "Primeiro carimbo",
               "tier": "bronze", "earned_at": "…", "image_url": "…", "explorer_url": "…" }],
  "issuer": { "authority": "…", "collections": ["<passports>", "<medals>", "<companions>"] }
}
```

- `verified`: on chain the asset is owned by that wallet, sits in the collection of ours that its
  kind belongs to, that collection's update authority is our authority, and it is frozen. An asset
  that fails any of these stays in the list with `verified: false`. `verified_count` counts the rest.
- `companion` is `null` when the wallet has none. Its numbers are the on-chain attributes (the
  database's only when the asset cannot be read); lives regenerate off chain between mirror moments.
  `companion.image_url` draws those same on-chain values (`?source=chain`) and
  `companion.mirrored_at` (ISO or `null`) says when the asset was last written.
- A wallet linked to an e-mail account is listed like any other: rows are found by the address they
  were minted to.
- `ink` is `"emerald" | "violet" | null`, `frame` is `"gold-leaf" | null`, both derived from the paid
  purchases. `trail` is the title in `?lang=pt|en` (default `pt`), as is a medal's `title`.
- The `image_url`s carry `lang` and a version, so the one-minute art cache never serves a stale page.
- A wallet with nothing answers `200` with `companion: null` and empty lists. A malformed address
  (or anything after it in the path): `400 { "error": "invalid_address" }`. `502 upstream_unavailable`
  when the RPC cannot be reached, `405`, `500 internal_error`. Cached 20 s.
- No email, no display name, no itera user id: the response is built from asset addresses, the
  credential row ids inside the image URLs and catalog text. The `learner` attribute is not echoed.

Collectible avatars (a fourth collection, "Itera Avatars", whose assets are **not** frozen) add
`credential-meta/avatar/<id>`, `credential-meta/preview.svg`, an `avatar` block on `credential-verify`
and `avatar` / `avatars` on `learner-profile`: see "Tera avatars" in
[`onchain-purchases.md`](onchain-purchases.md).

## Secrets and deploy

Edge-function secrets (project-wide): `SOLANA_AUTHORITY_SECRET` (64-byte key as a JSON array or
base58) and `SOLANA_RPC_URL` (`https://api.devnet.solana.com`). `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase. Nothing goes in a `VITE_*` variable.

```bash
supabase functions deploy passport --project-ref nyzcbnnbffsizshiolbh --use-api
supabase functions deploy credential-meta --project-ref nyzcbnnbffsizshiolbh --use-api
supabase functions deploy credential-verify --project-ref nyzcbnnbffsizshiolbh --use-api
supabase functions deploy learner-profile --project-ref nyzcbnnbffsizshiolbh --use-api
```

Imports are plain `npm:` specifiers (`@metaplex-foundation/umi@1.6.0`,
`umi-bundle-defaults@1.6.0`, `mpl-core@1.10.0`), bundled by the API (no Docker). `passport` loads
the Solana SDK only when there is something to mint.

## Tests

```bash
npx vitest run --config vitest.supabase.config.ts      # pure modules, 128 tests
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

Once funded, `node scripts/hackathon/passport-e2e.mjs wallet --lessons 2` covers collection
creation, a passport created with two stamps, the `first_stamp` medal and `credential-verify`.
Each run creates a new wallet user, so the stamp **update** on an existing asset has to be
exercised from the app: sign in with a wallet, complete a day, complete another.

## Known limits

- No rate limit on the public functions; `credential-verify` makes RPC calls per request and
  `learner-profile` one (both cached 20 s).
- `learner-profile` lists at most 50 assets per wallet, oldest first.
- The public devnet RPC is rate limited; a provider URL in `SOLANA_RPC_URL` is advisable for a demo.
- `earned_at` is set when a row is first written and does not move if progress is edited later.
- A row stuck in `pending` (invocation killed mid-mint) is retaken after 3 minutes.

## Trust model

Read this before saying what a certification proves.

**Grading runs on the server.** The player sends each settled answer to the `grade` edge function
(`supabase/functions/grade`, rules in `_shared/grading.ts`). The function reads the activity with the
learner's own session (row level security decides whether they may see it), grades the answer against
the spec it read, and records the attempt (`itera.graded_attempts`) and the completion
(`itera.progress`) in one call (`itera.record_graded_attempt`, migration `0192`). It is the only writer
of a completion: a request that arrives with a client role cannot make a progress row `completed`
(trigger `progress_client_guard`, migration `0191`, error `42501`), and clients have no write grant on
the attempt log (migration `0190`).

Every activity has one of three modes, decided from the activity alone, never from what was sent:

| Mode | What the server did | Kinds (program `itera-v2`, 234 activities) |
|---|---|---|
| `server` | graded the answer | `single_choice` 38, `code_fill_type` 17, `code_fill_bank` 17, `code_fill_select` 10, `match` 8, `multi_choice` 3, `order` 2, and 23 `code_editor_checks` whose checks read the parsed page or the source: **118** |
| `self_reported` | recorded the player's claim, as a claim | the scene kinds (`spot`, `xray`, `timeline`, `selector`, `inspect`, `wire`, `bucket`, `press`, `dial`, `intercept`, `arrange`, `plug`: 31, completed by a gesture that produces no answer) and 20 `code_editor_checks` that assert computed style, simulate clicks or carry a script: **51** |
| `participation` | recorded that it was opened and finished | `concept` 32, `code_editor_ungraded` 18, `concept_reveal` 15: **65** |

The HTML exercises are graded without a browser: the source is parsed with the HTML5 algorithm
(parse5, through cheerio) and the same assertions the player runs are evaluated on the tree. Agreement
with the player's own runner was measured on 13,104 check verdicts (30 exercises, 84 sources): no
disagreement. Every published answer key passes the server grader and a wrong answer is refused.

**What a stamp states.** `day_stamp.state.proof` and `trail_pass.state.proof` are
`{ verified, self_reported, participation, legacy, evidence }`. `verified` counts answers the server
graded; `legacy` counts completions from before server grading (no attempt row). `evidence` is the
SHA-256 of the lines `activity_id|mode|answer_hash|spec_hash|created_at` of the first passing attempt
of each activity, sorted by activity. The certification asset carries `server_verified` ("10/12":
graded on the server, over the answers that had something to grade; legacy completions are named
apart, "2/2 +14 legacy") in its on-chain attributes, the
metadata shows the same share and the evidence hash, and each capability claim's evidence document
(version 2) lists the hash of the graded answer per activity. A day whose completions are not backed
by attempts is not stamped (`day_pending_review: unverified`).

**What the chain proves:** that the Itera issuer (one authority key, one collection) wrote this
credential to this wallet at this time, that it is frozen, and that the issuer's server received and
graded correct answers for the stated share of the day's exercises before writing it.

**What it does not prove:**

- *Who produced the answers.* The answer keys of choice, fill, ordering and matching exercises still
  reach the browser, because the player shows the verdict at once. A learner who reads the key from the
  network panel, or is told the answers, passes. Server grading removes forged completions; it does not
  remove copied answers. The HTML exercises ship tests, not solutions.
- *The self-reported share.* 51 activities are recorded on the player's word. The stamp says so
  ("10/12") instead of hiding it.
- A completed day is still held by the **plausibility floor** when its completions span less than 20 s
  (`day_pending_review: too_fast`), so answers replayed in one burst award nothing. Replayed slowly,
  they do.

**Legacy rows.** Completions written by a client before `onchain_config.proof_cutoff` (the moment
`0191` was applied) keep counting, judged by the old floor (server clock, span, a passed row in
`activity_results`). A stamp built on them reports them as `legacy`, and a stamp already awarded is
never taken back. Operator rows (service role, psql seeding) are trusted as before.

**Proof on the live project:** `node scripts/hackathon/proof-attacks.mjs` (forged writes and forged
claims stamp nothing; one real day is stamped and minted with its share on chain) and
`node scripts/hackathon/proof-browser.mjs` (the player on the live site sends answers to `grade` and
writes no completion). `node scripts/hackathon/security-attacks.mjs c`
runs the attacks of the original review (finding 1) and shows each one refused.

**What mainnet would still require:** answer keys that never reach the browser (the verdict would wait
for the server); server-side execution for the exercises that need a browser; proctoring or an oral
check if a credential must bind to a person; rate limits per account and per wallet on everything the
authority pays for; and separate custody for the authority and treasury keys.

## End of a lesson (UI)

`src/utils/lessonEnd.ts` decides the screen from two facts, in this order: what the player knows
(are all activities of this lesson completed?) and what `passport` answered. The call carries
`{ lesson_id, lang }`; the answer's optional `day_incomplete` (`null` or `{ lesson_id, done, total }`)
wins over the local count.

| Situation | Screen |
|---|---|
| Day not whole (local count or `day_incomplete`) | completion card "Faltou N atividade(s) pra carimbar o dia" + "Refazer as que faltaram"; `passport` is not called for a locally unfinished day |
| Day finished whole in this visit, lesson is a day of a trail | the ceremony at once in its minting state (previous stamps, nothing claimed), then what the server confirmed |
| `passport` error or 20 s without an answer | plain card + "Seu dia está salvo; o carimbo on-chain entra na próxima vez." |
| Lesson reopened already whole, lesson outside a trail, guest | plain card; a ceremony only if the server stamps the lesson in that call |
| Day whole but `day_pending_review` (the plausibility floor refused it) | plain card: the server awarded nothing, so there is no ceremony to show. No message accuses the learner |

Gold is shown only when the returned `trail_pass` says `days_done >= total_days` or tier `gold`.


## Social on-chain: podium medals, weekly goal, teacher endorsement

Migrations `0127_podium_weekly_medals.sql`, `0128_weekly_goal_shelf_order.sql`,
`0129_endorsements.sql`, `0131_service_role_reads_tenants.sql`. Purchases-side features of the same
work (earned laurel, Circuito) are in [`onchain-purchases.md`](onchain-purchases.md).

### Who is a teacher (`_shared/staff.ts`)

`resolveCaller` carries no role. `class-podium` and `endorse` read the caller's rows of
`itera.memberships` (joined to `tenants.slug`) and apply pure predicates: a role of `instructor`,
`tenant_admin` or `owner` (the set of `itera.current_instructor_tenant_ids()`), in the tenant the
action is about. A **personal** tenant (`plg-<uid>`, owned by whoever signed up) confers nothing, as
in the app's `membership.service`: otherwise any free account would be a teacher. Nothing in a
request body is read for this.

### Live-class podium medals (`POST /class-podium`)

Keys `podium_1` (gold), `podium_2` (silver), `podium_3` (bronze): kind `milestone`, `ref_id` = the
class session, `state = { position, class_title (i18n), class_date (São Paulo day), correct, answered }`.
On chain: `kind`, `achievement`, `tier`, `completed_at`, `position`, `class`, `class_date`, and **no**
`learner` attribute. Art: the place over the three steps (`_shared/art-podium.ts`), Itera green, the
metal only in the ring.

- Body `{ "session_id": "<uuid>", "lang"? }`, Bearer user token. Only staff of the session's tenant:
  `403 forbidden` otherwise. `404 session_not_found`, `409 session_not_ended`, `400 invalid_body`.
- The ranking is computed on the server from `class_attendance` + `class_answers` with the rule of the
  instructor report (`src/utils/buildClassReport.ts`: most correct, then most answered, then fastest,
  then name; `_shared/podium.ts`). Guests (`class_guests`, `users.is_guest`) and the session's
  instructor are skipped and the next learner takes the place; someone who answered nothing takes none.
- The first call fixes the podium in `itera.class_podiums` (one row per session); later calls read
  it, so answers written afterwards change nothing and a session mints three medals at most, ever
  (one medal per place and session is also a unique index). Rows are created `unclaimed` and minted
  through `passport` (operator call, the one mint path), one learner at a time; a learner without a
  wallet stays `unclaimed` as usual.
- Answer: `{ session_id, recorded_at, already_recorded, class: { title, date }, places: [{ position, key, title, user_id, name, correct, answered, wallet, mint_status, asset_address, explorer_url, tx_explorer_url, image_url }] }`.
- `{ "session_id", "view": true }`: for anyone who attended the class or belongs to its tenant:
  `{ session_id, recorded, places: [{ position, user_id, mint_status, asset_address, explorer_url, mine }] }`
  (the ids the class ranking already shares; no name, no wallet). `itera.class_podiums` has no client policy.
- UI: "Gravar pódio na Solana" on `/live/instructor/report/<session>` with the result list; the medal
  on the shelf and on `/u/<wallet>`; "medalha on-chain" under a name on the learner's podium screen.

### Weekly goal medal (`weekly_goal`)

The dashboard promised "ao bater: medalha da semana" and no such medal existed. Now: kind `milestone`,
awarded by `computeAwards` once per ISO week of `America/Sao_Paulo` when the learner has completed 20
activities within the seven days ending at a completion (the dashboard's count; `_shared/weekly-goal.ts`).
`ref_id` = `7765656b-<year>-40<week>-8000-000000000000`, `state = { week: "2026-W41", count, goal, time_zone }`,
on chain `week` and no `learner`. It can land before any day is whole. The shelf lists the first eight
goals of the catalog and, past them, only medals already earned.

### Teacher endorsement of a certification (`POST /endorse`)

- `{ "user_achievement_id": "<trail_pass row id>", "note"?, "lang"? }`, Bearer user token. The caller
  must be staff of a tenant the learner belongs to (`403 forbidden`), must not be the learner
  (`403 self_endorsement`) and must have a wallet, sign-in or linked (`403 no_wallet`).
  `404 certification_not_found`, `409 not_minted`, `400 invalid_note` (over 140 characters),
  `409 endorsements_full`, `502 chain_write_failed` (the row is withdrawn; try again).
- The server writes the certification asset's attributes: `endorsed_by_<slot>` = the instructor's
  **full** wallet address and `endorsed_at_<slot>`, slots 1 to 3. One endorsement per instructor per
  certification, three per certification: at most three endorsement writes per asset, ever. A repeat
  answers `200` with `already_endorsed: true` and sends nothing.
- `itera.endorsements` (`user_achievement_id`, `instructor_user_id`, `wallet`, `note` <= 140, `slot`,
  `tx_signature`): no client policy. The note is plain text, stays in the table and is never written
  to the asset or drawn. The endorsements ride in the row's `state.endorsements` through
  `restoreCosmetics`, so a later stamp or ink keeps them on chain.
- Answer: `{ status: "endorsed", already_endorsed, asset, endorsement: { wallet, at, tx_signature, explorer_url, slot }, endorsements: [...], image_url, page_url, explorer_url }`.
  `{ "action": "list" }` -> `{ wallet, certifications: [{ user_achievement_id, learner_name, trail, days_done, total_days, tier, asset_address, page_url, image_url, endorsements, endorsed_by_me }] }` (staff only).
- `GET /credential-verify/<certification asset>` gains `endorsements: [{ wallet, at, tx_signature, explorer_url }]`
  (no names) and its `achievement.image_url` carries `?v=e<count>` once endorsed; `learner-profile`
  certifications gain `endorsements` (when > 0) and the count in the art version. The art draws a small seal.
- UI: `/live/instructor/certifications` ("Certificações dos alunos") with "Endossar" and a confirm
  dialog; "Endossada por" on `/c/<asset>` linking each wallet to `/u/<wallet>`.

### Known limits (social)

- A teacher of a real (non-personal) tenant is trusted: they can record one podium per ended session
  of their tenant and endorse their learners. Sessions and answers are written by clients under RLS.
- The weekly goal and the level behind the laurel are computed from rows a client can write
  (security review, findings 1 and 3); they inherit those findings until they are fixed.
- The learner's podium screen ranks the people the live room saw; the on-chain mark shows there only
  after a class that was really run and recorded.

## Capability graph (claims proven by a stamped day)

Migration `0180_claim_proofs.sql`; `_shared/capability-graph.ts`, `_shared/claims.ts`, `_shared/claims-store.ts`.

- The model: each day of `itera-v2` proves one or two named **claims** ("Structures a page in semantic parts"),
  28 in all, with prerequisite edges (a DAG authored from the published lessons, pt + en). Ids are stable and
  never renamed once minted.
- When `passport` stamps a day it records, per claim, an **evidence document** (`itera.claim_proofs.evidence`):
  the JSON string `{v, issuer, claim, program, wallet, lesson_id, completed_at, activities: [[id, completed_at]…]}`.
  Its SHA-256 is `evidence_hash`; a prefix (16 hex; 12 or 8 on an asset crowded with endorsements) is written
  to the certification asset as the attribute `claim:<id>`, in the same `updatePlugin` that stamps the day.
- The claims ride in `state.claims` through `restoreCosmetics` (and the shop's `loadPassport`), so every later
  write of that asset (stamp, ink, frame, endorsement) keeps them. A minted certification whose claims have no
  transaction yet gets one update on the next `passport` call: that is the backfill path
  (`/tmp/hk/orch/graph-backfill.sh` ran it once for every minted certification on 2026-10-11).
- `GET /learner-profile/<wallet>` gains `capabilities: { program, version, total, verified_count, next, trails, nodes }`.
  A node is `verified` only when the asset read from chain in that request carries the claim, the asset passes
  the same checks as a certification, and the chain value is a prefix of our evidence hash; `recorded` when only
  our table has it; `open` otherwise. `GET /learner-profile/<wallet>/evidence/<claim>` serves the document.
- The page `/u/<wallet>` does not trust that answer for its strongest label: the browser reads the asset account
  from the devnet RPC itself (`src/lib/chainClaims.ts`), checks the Core program, the owner and the attribute, and
  recomputes the SHA-256 of the evidence document. "Verified on chain" appears only after that.
- What a claim proves is bounded by the trust model above. Since server grading, the evidence document is version 2:
  each activity carries the hash of the answer the server graded (`null` when it graded none) and the document states
  the share (`verified: "10/12"`). Claims recorded before keep their version 1 document.
