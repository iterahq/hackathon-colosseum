# Teras on chain: earned, bought, sponsored

Hackathon only: Supabase project `nyzcbnnbffsizshiolbh`, Solana **devnet**. Every Tera is a Metaplex Core asset in
the collection "Itera Avatars" (`onchain_config.collection_avatars`). There are three ways to get one, and the asset
itself says which.

| | Earned | Bought | Sponsored |
|---|---|---|---|
| How | the chest a stamped day opens | the shop, paid in SOL | the prize of a bounty a sponsor funded |
| Who pays | Itera | the buyer | the sponsor, when funding the bounty |
| Can it be transferred | no, frozen at mint | yes | no, frozen at mint |
| On-chain attribute `origin` | `earned` | absent | `sponsor` |
| Tiers | all six | Tera, Super Tera, Mega Tera | none of the ladder (`rarity = sponsor`) |
| Table | `avatar_assets` (`origin = earned`, `chest_id`) | `avatar_assets` (`origin = bought`) | `sponsor_teras` |

Legendary, Mythic and Primordial are **earn-only** (`avatar_tiers.earn_only`): the purchase rail refuses them
(`409 earn_only`) whatever a catalog row says, and a chest reaches one only when its seed rolls it. The Primordial,
of which one exists, can be rolled by ONE chest only: the one of the day that completes the last trail of the program.

The rarity of every Tera has one source, the catalog (`shop_items.rarity`, served by `GET /credential-meta/tiers`).
Migration `0350_tera_one_rarity.sql` aligned it to the owner's grouping and kept the previous values in
`itera.shop_items_rarity_backup`; the file's header has the statement that undoes it.

## The day chest

Each stamped day of a trail opens one chest for that learner. The learner signs nothing and pays nothing.

### What happens, in order

1. **Commit.** The transaction that stamps the day also writes one attribute on the certification asset:
   `chest:<day>` = `<target slot>.<effort level>.<first 8 hex of the pool hash>`, for example
   `510171299.0.f8d784c5`. The target slot is 32 slots (about 13 seconds) after the slot the server read while
   building the transaction.
2. **Seed.** When the chain has passed the target slot, the seed is
   `sha256("itera-chest:v1|" + blockhash + "|" + certification address + "|" + day)`, where the blockhash is the one of
   the **first block produced at or after the target slot**.
3. **Roll.** `tier_roll = int(seed[0..8]) mod 10000` is read against the odds row of the committed level.
   `start_roll = int(seed[8..16])`; inside the tier the walk starts at `start_roll mod (size of the tier)` and moves
   forward, wrapping, past every Tera the learner already holds and every edition that is used up.
4. **Mint.** The Tera is minted frozen (`PermanentFreezeDelegate`, frozen, authority `None`: nobody can thaw it) to
   the wallet that owns the certification, with attributes `origin=earned`, `learner` (that wallet), `certification`,
   `day`, `chest` (the commitment), `seed_slot`, `seed_blockhash`, after the usual `kind`, `key`, `rarity`, `tier`,
   `serial`, `supply_cap`.

Steps 2 to 4 run after the stamp has answered (`settleChest` in `_shared/tera-chest-store.ts`), started by the server in
the background and by `POST /tera-chest`. A chest never holds or fails a stamp.

### The odds (published, `GET /tera-chest/rules`)

Parts of 10 000. A day earns one effort point for each of: the server graded at least 75% of the day's gradable
answers; the server graded no answer of the day wrong (and graded at least one); the day finished the trail.
**Level 4** is not a fourth point: it is level 3 on the day that finishes the **last trail of the program**, when
every trail of the program is gold for that learner. It is the only row that gives the Primordial any weight.

| level | common | rare | epic | legendary | mythic | primordial |
|---|---|---|---|---|---|---|
| 0 | 7000 | 2500 | 450 | 45 | 5 | 0 |
| 1 | 6000 | 3000 | 880 | 100 | 20 | 0 |
| 2 | 5000 | 3400 | 1350 | 210 | 40 | 0 |
| 3 | 3800 | 3700 | 2000 | 400 | 100 | 0 |
| 4 | 3800 | 3700 | 2000 | 400 | 90 | 10 |

So a one-of-one cannot come out of an ordinary day: on every chest but one per learner its weight is zero, and a
chest opened late by its own write (below) never carries level 4. A learner reaches that one chest by finishing every
trail, with the last day mostly server-graded and without a miss; even then the odds are 10 in 10 000.

This table is written **inside the pool document** (version 3, `odds`), so it is covered by the hash in the
commitment: a chest is always recomputed with the odds it committed to. The chests opened on 2026-10-12 before this
rule committed to documents of version 1 or 2, whose odds are the earlier table (`LEGACY_ODDS_TABLE` in
`tera-roll.ts`: levels 1, 2 and 3 gave the Primordial 1, 4 and 10 parts). They recompute with that table; none of them
rolled it. `GET /tera-chest/rules` and `GET /credential-meta/tiers` also say, per earn-only tier, how it is earned
(`earn_only.<tier>.how`, `tiers[].how`), from the same table.

The pool is every priced Tera on the shelf plus the earn-only tiers, by tier, ordered by `sort` then key. Free faces
never come out of a chest. A tier with nothing left for this learner hands over to the lower tiers, then to the higher
tiers **that are for sale**. The walk never climbs into an earn-only tier: otherwise a learner who bought every Tera
that is sold would turn each chest into an earn-only one. The pool document names those tiers (`earn_only`), so the
rule is part of what is committed. The 15 chests opened before that rule existed committed to version 1 documents,
whose walk climbed anywhere; they recompute with that rule (the document says its version), and none of them climbed
into an earn-only tier.

### What the chain guarantees

- **The commitment existed before the seed.** The transaction that wrote `chest:<day>` is public, and its slot is
  below the slot it names. The settle path checks exactly that (`checkCommit`) and so can anyone
  (`getTransaction(<commit tx>)`). A commitment that landed at or after its slot is never used: the day is committed
  again by a new write with a new future slot.
- **The server did not know the seed when it committed.** A blockhash depends on every transaction of the blocks
  before it; nobody knows it 32 slots ahead.
- **The odds row and the order of the pool were fixed before the seed.** Both are inside the commitment: the level,
  and a hash of the exact pool document (`GET /tera-chest/<id>` serves the document; `recomputeChest` refuses one
  whose hash does not start with the committed 8 hex).
- **The Tera cannot move.** Frozen with no authority that could thaw it.
- **The inputs travel with the asset.** The earned Tera names its certification, day, commitment, seed slot and seed
  blockhash in its own attributes.

### What our server decides

- **The effort level.** It comes from our grading (`graded_attempts`, the proof on the stamp). The level is committed
  on chain, but whether a day deserved it is our word, like the grading itself.
- **What is "unavailable".** The Teras the learner already holds and the editions used up come from our tables
  (`avatar_assets`, `avatar_supply`) at the moment of the roll, after the seed is public. They are published with the
  chest (`recompute.from_itera`), and each held Tera is an asset anyone can open, but the list is ours.
- **When to settle.** A chest the server never settles gives nothing. The seed does not change with time.
- **The pool itself.** We choose which Teras exist and in which tier; the chain only proves the pool was not changed
  after the commitment.

### How a stranger recomputes a chest

With the public RPC (`commitment: confirmed`) and no session:

1. `GET /tera-chest/<chest id or the address of the earned Tera>`: the claim (`inputs`), the pool document, the
   unavailable list.
2. `getAccountInfo(<certification>)` (or `GET /credential-verify/<certification>`, which returns the same attribute
   list read from chain): the attribute `chest:<day>`.
3. `getTransaction(<commit tx>)`: its slot is below the target slot, and its instruction data carries the attribute
   (`instructionCommits`).
4. `getBlocks(<target slot>, <target slot> + 5000)`: the first entry is the seed slot. `getBlock(<seed slot>)`: the
   blockhash.
5. `recomputeChest({ blockhash, certification, day, commit, poolDocument, unavailable })` from
   `supabase/functions/_shared/tera-roll.ts`: a plain TypeScript file with no dependency but a SHA-256, the same one
   the server runs and the one `/verify` runs in the browser.

`scripts/hackathon/tera-e2e.mjs` does exactly this and compares the Tera.

### Known limits of the chest

- **Devnet prunes old blocks.** Months from now `getBlock(<seed slot>)` may answer nothing on a public node. The seed
  block's hash is on the Tera asset, so the arithmetic can still be redone, but the proof that this was the block of
  that slot then rests on an archive node.
- **One key writes everything.** The mint authority is the update authority of the collections. It could write a
  second commitment for a day after seeing a seed it did not like, before settling. Nothing on chain prevents it;
  what exists is that every write of a certification is public (`getSignaturesForAddress`), so a day with two
  commitments is visible, and a chest records how many times it was committed (`commit.via`, `tera_chests.commits`).
  A slot leader could also bias its own blockhash at a cost; it has no stake in a Tera.
- **Confirmed, not finalized.** The seed block is read at `confirmed`, to keep the wait near 10 seconds. A confirmed
  block has never been rolled back on Solana; if one were, a later recompute would disagree with the minted Tera.
- **The holder list is read after the seed.** Between the seed block and the settle (about a second when the
  background settle runs), a learner who bought the exact Tera the seed points at would be moved to the next one of
  the same tier. It cannot reach a higher tier that is not for sale.
- **An empty chest exists in one case.** A learner who holds every Tera that is for sale and rolls a tier that is for
  sale gets `failed: nothing_left_to_give`.
- **Days stamped before the chest** carry no commitment. Their chest is opened on the learner's request by a
  commitment in its own write (`commit.via = own_write`), still before the slot it names.
- **Room on the asset.** The commitment is 35 bytes per day and is sized after everything else the certification
  carries. If a certification ever has no room, the oldest commitments leave the asset first (their transactions
  remain); a day whose commitment cannot fit at all gets `failed: commitment_does_not_fit_the_asset`.
- **Level 2 was produced on chain** by a learner whose answers were graded by `grade` (`PART=effort` of the
  end-to-end script). Levels 3 and 4 need a finished trail and a finished program of graded days; the script holds
  the answers of day 1 only, so those two are covered by the unit tests of the pure module.
- **"Every trail gold" is our tables' word at commit time.** The level is on chain and each certification says `gold`
  on chain, but the server is what counted them when it wrote level 4.
- The kill switch's off path is no longer exercised by the end-to-end script, which must not flip a switch on the live
  backend. It was proven by the runs of 2026-10-12 that did (`tera-e2e-chest-1.log`, `-chest-2.log`, `-final.log`).

### Kill switch

`itera.onchain_config.tera_chest`: `on` or anything else. Off: a stamp carries no commitment, nothing is settled,
`POST /tera-chest` answers `{ enabled: false, chest: null }`, and the commitments already on an asset are kept by
later writes.

### Functions

| | |
|---|---|
| `GET /tera-chest` (Bearer) | `{ enabled, chests, rules }`: the caller's chests, newest first |
| `GET /tera-chest/<chest id \| earned Tera address>` (public) | `{ chest, recompute }` |
| `GET /tera-chest/rules` (public) | the odds table and the constants |
| `POST /tera-chest { lesson_id }` (Bearer) | `{ enabled, chest \| null }`: settles or polls the chest of that day. Reads nothing else from the body |

A chest goes `committed` (waiting for its slot; `retry_after_ms` says when to ask again), `rolling`, `minted`.
`failed` is terminal. Tables: `tera_chests` (unique per certification and day), `tera_chest_pools` (every pool document
a commitment named), both with RLS on and no policy. Migration `0351_tera_chests.sql`.

The stamp path was timed before and after on devnet with the same script, a throwaway learner and five days: median
of the four updates 6.32 s before and 6.47 s after, every stamp landing both times. The plan of a commitment is
bounded to 1.2 s; past that the stamp goes out as it always did.

## The bought Tera

Unchanged purchase rail (see [`onchain-purchases.md`](onchain-purchases.md), "Tera avatars"): minted with no freeze
plugin, so its owner can transfer it. Tera, Super Tera and Mega Tera are for sale.

**The fee.** The collection carries the Metaplex Core **Royalties** plugin: 500 basis points (5%), one creator, the
Itera treasury (`onchain_config.treasury`), `ruleSet: None`
([transaction](https://explorer.solana.com/tx/4qgBKocSRhKxeZ96aYpWXjpSATDv864XbSgf12A6PydjJD3ipcRmwGW1mUshL6TdVebwDedA4TtNMo957ZDYPshB?cluster=devnet),
`scripts/hackathon/avatars-royalties.deno.ts`). `onchain_config.avatar_royalty_bps` is what `shop-items` states as
`royalty_bps`.

What that is and is not: a marketplace that honours Core royalties pays 5% of a resale to the treasury. `ruleSet: None`
restricts no program, and a plain wallet-to-wallet transfer pays nothing. The plugin sits on the collection, so the
update authority can change the rate or remove it. No marketplace lists devnet assets; the plugin is read back from
chain, a paid resale was not exercised.

Our tables do not follow a transfer: the new holder gets no row and cannot wear the Tera here; `learner-profile`
shows `verified: false` for a Tera whose wallet no longer holds it.

## The sponsor Tera

A sponsor posting a bounty from a wallet (`bounty-post`) may add a prize: `prize_tera: { brand, accent, base }`.

- **No upload.** `brand` is 2 to 24 Latin letters (accents included), ASCII digits, spaces and `. & + - _ ! '`;
  anything else (markup, quotes, slashes, emoji, a letter of another script) refuses the form, and so does a name that
  poses as the team. Control and direction characters are dropped. Latin only is the cheap guard against a look-alike
  built with another alphabet (a Cyrillic "І" in "Іtera"); it also refuses an honest name in another script, and a
  Latin look-alike ("ltera" with a lowercase L) still passes: the art labels every such Tera a sponsor Tera and the
  metadata says the brand is the sponsor's own text.
- **A tenant's own name.** The team's names are refused to everyone except the STAFF of the tenant whose row declares
  the name (`tenants.branding.sponsor_brand`, set by migration `0354`, today `DevFellowship` on `dfl-batch`). The check
  reads the caller's memberships and the tenant rows; nothing in the request takes part. The same rule opens the
  sponsor name of the bounty. `accent` is `#rrggbb`. `base` is one of four free faces. The server composes the art from those three
  values (`sponsorArt` in `_shared/sponsor-tera.ts`), and the brand is XML-escaped again where it is drawn.
  `GET /credential-meta/sponsor-preview.svg?brand=&accent=&base=` shows exactly what will be minted.
- **The sponsor pays.** The funding transaction the server builds carries, next to the escrow's `create`, one transfer
  to the treasury: the mint cost (0.004 SOL) plus an issuing fee (0.01 SOL). The quote names both lines before the
  wallet signs. The funding blink builds the same transaction and its text names the prize, the part of the total that
  goes to the treasury, and that a refund does not return it.
- **Minted in the settlement that pays.** When the escrow account says `paid` and our tables record it
  (`recordWalletPayout`), the same step mints the Tera, frozen, to the wallet the escrow paid, with `origin=sponsor`,
  `brand`, `accent`, `learner`, `bounty` (its id) and `payout_tx`. One per bounty and claim (a unique row, an address
  derived from the row): a retry finds it. Edition 1 of 1, because a bounty pays one learner.

### What the escrow program does not check here

The program (`programs/bounty-escrow`) was not changed. It holds the reward and pays the claimant. It knows nothing
about the prize:

- It does not check that the funding transaction paid the Tera lines. A sponsor (or anyone) can fund the escrow with a
  transaction that leaves the transfer out, and the bounty opens. Our server then reads the funding transaction, finds
  no payment, and shows `prize_tera.funded: false`; no Tera is minted for that bounty.
- It does not mint the Tera and does not make the payout wait for it. The sponsor's wallet signs `release` alone; the
  mint is a second transaction, by Itera's key, a few seconds later. If our server is down, the Tera is late, and the
  next read of the bounty mints it.
- It does not know the brand. The brand is the sponsor's own text; Itera composes the art and vouches only for the
  payout the asset names (`payout_tx`), which anyone can open.

So: the SOL of the reward is guaranteed by the program; the prize Tera is a promise of Itera's server, made checkable
after the fact by the attributes it writes.

Kill switch: `itera.onchain_config.prize_tera`. Off: a form with a prize answers `503 prize_unavailable`, a bounty
already posted with one is funded as a plain bounty (no fee taken), and nothing is minted. Tables: four columns on
`bounties`, `sponsor_teras` (RLS on, no policy). Migration `0352_sponsor_teras.sql`.

## What every Tera object says

Wherever a Tera is returned (`learner-profile.avatars[]`, `shop-items` entries the caller holds,
`credential-verify.avatar`): `origin` (`earned` | `bought` | `sponsor`), `transferable`, `proof { asset, page_url,
explorer_url }`, and `earned { certification, trail, day, tier, chest_id }` or `sponsor { brand, accent, base,
bounty_slug, bounty_title, bounty_url, payout_tx, payout_explorer_url }`. In `credential-verify` the origin is the
asset's own attribute and `transferable` is "not frozen on chain", so that page proves from the chain, not from our
tables.

## Run it

```bash
source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN
node scripts/hackathon/tera-e2e.mjs                 # devnet; about 0.05 SOL of the authority; PART=chest | effort | sponsor | all
npx vitest run --config vitest.supabase.config.ts supabase/functions/_shared/tera-roll.test.ts supabase/functions/_shared/sponsor-tera.test.ts
```
