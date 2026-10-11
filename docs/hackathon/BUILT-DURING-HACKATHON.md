# Built during the hackathon, and what was inherited

Disclosure for the Colosseum "Crypto World's Fair" rules (pre-existing code is allowed if disclosed; only work
done during the competition is judged).

## Copy point

- This repository is a copy of the private product repository `iterahq/itera-player`.
- Last inherited commit: `1f5b925b` (2026-10-09 16:49 -0300), "feat: funnel events (DFL-00D3F) (#699)".
- First hackathon commit: `34336b3` (2026-10-09 17:44 -0300), "chore: bootstrap hackathon copy (drop CI, isolation
  banner, API base build arg) (#1)". Its parent is the copy point.
- Range: `git log 1f5b925b..origin/main`. At the time of writing (main at `65f9256`, 2026-10-11 00:48 -0300): 76 commits,
  one per merged PR (squash merges), all by one git author account.
- Diff against the copy point: 784 files changed, 662 added, 102 modified, 20 deleted; 63,860 lines added and 5,256 removed.
- To refresh these numbers: `git rev-list --count 1f5b925b..origin/main`, `git diff --shortstat 1f5b925b origin/main`,
  `gh pr list --state merged --limit 200`.
- Before the copy point the repository history has 721 commits. The history of the original product is included in
  this repository.

## What was inherited

- The lesson player, activity engine and activity kinds, lesson and trail content, the instructor and admin screens.
- E-mail authentication and the Supabase schema `itera` up to migration 0109 (107 migration files at the copy point).
- Live classes, instructor reports, the mobile shell (`apps/mobile`), the monorepo packages (`packages/*`), tooling,
  Storybook and the end-to-end test suites in `e2e/`.
- Subscription billing code (Stripe) and the original documentation, including the original `CLAUDE.md`.
- Brand assets: the Tera mascot images, fonts and sound effects under `public/`.
- `supabase/functions/` did not exist at the copy point: the original backend runs elsewhere and is not in this
  repository. All 26 edge functions below were written during the competition.

## What was built during the competition

Merged pull requests (`gh pr list --state merged`, titles as merged; times are in the PR list). #7 was never merged.

| PR | Title | What it added |
|---|---|---|
| #1 | chore: bootstrap hackathon copy | Removes CI, adds the isolation banner, adds an API base build argument. |
| #2 | feat: sign in with Solana wallet | Provisioning trigger for wallet users and the login button. |
| #3 | feat: on-chain achievements schema | Catalog and earned-row tables. |
| #4 | feat: learner home dashboard (Trilho em destaque) | Dashboard with a featured trail. |
| #5 | feat: on-chain passport backend | Awards, minting, metadata, art and `credential-verify` functions. |
| #6 | Redesign Courses catalog and course page | Courses catalog and course page in the dashboard language. |
| #8 | feat: nickname step for wallet users | Asks wallet users for a nickname once. |
| #9 | feat: redesign the dashboard top bar as a game HUD | Streak, XP, achievements and wallet chip in the header. |
| #10 | feat: Passaporte do Tera UI | Stamp ceremony, `/passport`, `/c/:asset`, dashboard fixes. |
| #11 | chore: turn telemetry off in the hackathon build | Disables telemetry export. |
| #12 | Video courses: Cursos becomes a library of video courses | Video course catalog (migration 0114). |
| #13 | Passport polish | Medal art, i18n, plurals, trail list. |
| #14 | One learner header everywhere | Global search, PT/EN switch, profile menu. |
| #15 | Lesson sounds: code verdicts and interactive exercises | Sounds for code verdicts, "Tentar de novo", hover off by default. |
| #16 | fix: a profile save that updates no row is a failure | Nickname save reports errors. |
| #17 | Collapse the post-miss explanation behind an Entenda o porquê button | Explanation is collapsed behind a button. |
| #18 | Dashboard: always-visible trail cards | Trail cards always visible, compact certifications panel. |
| #19 | test: declare ExplanationDisclosure in the activities public contract | Contract test fix for #17. |
| #20 | Purchase rail, Tera companion and lives (backend) | Shop, intents, confirmation, companion asset, lives (migrations 0115, 0116). |
| #21 | Lives, Loja do Tera and Tera outfits (frontend) | Lives UI, shop, outfits. |
| #22 | fix: green is the only trail fill colour | Colour fix. |
| #23 | Backend pass 2 | Lives written on chain, `learner-profile`, default art, cosmetics derived from purchases. |
| #24 | UX pass | Companion proof page, shop and gate cleanup, welcome strip, public profile. |
| #25 | Backend pass 3 | `purchase-submit`, `link-wallet`, chain snapshot of the companion. |
| #26 | Companion mirrors: one writer at a time | Ordering fix for companion writes (migration 0122). |
| #27 | Pass 3 UI | Sign-only purchase path, link wallet, companion snapshot, public profile. |
| #28 | test: browser end-to-end run with a fake Phantom | Playwright harness for the on-chain flows. |
| #29 | fix: wallet login on a phone reopens the page inside Phantom | Mobile wallet login fix. |
| #30 | Shop/purchase defects from the browser E2E + passport day_incomplete | Fixes found by #28; `day_incomplete` field. |
| #31 | Lesson end: ceremony only claims what the server confirmed | Ceremony behaviour fix. |
| #32 | Fix English copy across learner screens | Copy. |
| #33 | Tera outfits: painted layers | Painted image layers replace SVG outfits; laurel (migration 0125). |
| #34 | Gift a life (Solana Action / blink) and invite reward | `gifts`, `action-gift`, `referral` (migrations 0123, 0124). |
| #35 | Social on-chain | Earned laurel, podium medals, teacher endorsement, Circuito (migrations 0126 to 0131). |
| #36 | Security hardening | Payments ledger, server-side XP, progress guard, mirror and faucet limits (migrations 0132 to 0141). |
| #37 | fix: the ceremony waits for the stamp only | Medals mint after the ceremony. |
| #38 | feat: shared avatar foundation | Avatar model on the front end. |
| #39 | feat: avatars say whether they take the outfit layer | `allowsOutfit` flag. |
| #40 | feat: learner avatar everywhere | Profile picker, green-only pass, course covers. |
| #41 | feat: Tera's World lore page | `/world` page and lore module. |
| #42 | fix: restore the original program trail | Trail page with the Tera loader. |
| #44 | feat: round avatars use the published chip art | Avatar chip images. |
| #45 | fix: trail page uses the shared top bar | Header on the trail page. |
| #46 | Shop: wardrobe, try-on, art viewer, avatar pyramid, explainers | Shop redesign. |
| #47 | fix: one ring on avatars | Avatar ring and placeholder e-mail. |
| #48 | Tera avatars: free icons and collectible NFTs | Catalog, purchase, equip, art, preview (migration 0142). |
| #49 | fix: tidy the account dropdown | UI fix. |
| #50 | Avatar lore | Names, epithets, lore in NFT metadata (migration 0143). |
| #51 | perf: trail query without activity specs | Trail payload reduction; one user-id lookup at boot. |
| #52 | fix: header: search centred | Header layout. |
| #53 | perf: warm the shop list at sign-in | Shop list prefetch and cache. |
| #54 | feat(profile): Meu Tera section | Profile section for faces, looks, accessories. |
| #55 | fix: certification art no longer flashes another design on language change | Art swap fix. |
| #56 | Crystals in the header: balance chip and sheet on every learner page | Front-end balance chip and sheet for the Phoenix Crystals currency. The currency backend (PR #43) is not on `main`. |
| #57 | fix(header): balanced top bar | Header layout. |
| #58 | docs: judge-facing README, hackathon disclosure and submission checklist | This file, the README, the checklist. |
| #43 | Phoenix Crystals and Shop v3 | Earned currency with a Token-2022 mirror, tiers, seasons, borders, life packs, currency switch (migrations 0160 to 0171). |
| #59 | Compact shop: section chips, rarity carousels, dual pay actions | Shop layout. |
| #60 | Avatars batch 2: 18 new rows, lore, sharper free faces | Second avatar batch (migration 0144). |
| #61 | Try-on fidelity, profile borders, app theme, wardrobe groups, crystal purchases | Shop and profile. |
| #62 | Crystals: recoverable refund order, filtered paged reconcile reads | Crystals robustness. |
| #63 | Capability graph (1/2): claims proven by a stamped day, written on the certification asset | Claim model and `claim:*` attributes (migration 0180). |
| #64 | UX core: first-60-seconds path (locale, login, auth card, welcome) | Login and onboarding path. |
| #65 | Purchase rail: real-wallet failure recovery; shop/companion/crystals reads in fewer round trips | Every purchase failure recoverable; faster reads. |
| #66 | Capability graph (2/2): the graph on /u/<wallet> and on the certifications page | Public graph page, lit from chain data. |
| #67 | UX core: auth copy, nickname gate scroll lock, 404 page title | Polish. |
| #68 | Shop as a game armoury: rail, slot grid, inspector, phone strips | Shop redesign. |
| #69 | Capability graph: edges no longer cross medallions | Graph layout. |
| #70 | Route error boundary: reload once on a stale chunk after a deploy | Stale-chunk recovery. |
| #71 | Share surfaces: link previews for /c, /u, /gift; OG card, manifest, icons, page titles, offline line | `share-meta`, nginx crawler proxy, OG image, manifest, offline line. |
| #72 | Order activity: arrows per row, compact rows on phones | Activity polish. |
| #73 | Bounties: a certification opens a paid door (escrow per bounty, chain-gated accept, payout on devnet) | `bounty-*` functions, bounty tables (migration 0200), `/bounties` pages. |
| #74 | Lesson not found: Tera note with retry and a way back | Error state. |
| #75 | Public endpoints: per-address rate limit; manifest served as JSON | `itera.rate_take` (migration 0210), limits on five public functions. |
| #76 | Public profile polish: graph in the first screen, 1180px page, invalid-wallet CTA | `/u/<wallet>` polish. |
| #77 | Server-side grading: a completion comes only from an answer the server graded | `grade` function, `graded_attempts` (migration 0190), proof fields on the asset. |

Merged after this table was written: see `gh pr list --state merged`. Nothing is open at the time of writing.

## Hackathon migrations (`db/migrations/`, 50 files)

- `0110_identity_provider_solana.sql`
- `0111_wallet_user_provisioning.sql`
- `0112_onchain_achievements.sql`
- `0113_onchain_passport.sql`
- `0114_video_courses.sql`
- `0115_purchase_rail.sql`
- `0116_companion_lives.sql`
- `0117_certification_naming.sql`
- `0118_price_labels_profile_indexes.sql`
- `0119_wallet_link.sql`
- `0120_companion_mirrored_at.sql`
- `0121_wallet_identity_search_path.sql`
- `0122_companion_mirror_claim.sql`
- `0123_gift_referral.sql`
- `0124_gift_referral_user_read.sql`
- `0125_outfit_laurel_item.sql`
- `0126_laurel_unlock_claim.sql`
- `0127_podium_weekly_medals.sql`
- `0128_weekly_goal_shelf_order.sql`
- `0129_endorsements.sql`
- `0130_circuit.sql`
- `0131_service_role_reads_tenants.sql`
- `0132_payments_ledger.sql`
- `0133_award_activity_xp_server_amount.sql`
- `0134_progress_client_guard.sql`
- `0135_circuit_retry.sql`
- `0136_companion_mirror_limits.sql`
- `0137_companion_mirror_retry_at.sql`
- `0138_referral_reward_cap.sql`
- `0139_action_gift_limits.sql`
- `0140_faucet_limits.sql`
- `0141_linked_wallet_same_learner.sql`
- `0142_nft_avatars.sql`
- `0143_avatar_lore.sql`
- `0144_avatars_batch_2.sql`
- `0160_wallet_learner_names.sql`
- `0161_crystal_ledger.sql`
- `0162_theme_items.sql`
- `0163_avatar_retier.sql`
- `0164_avatar_seasons.sql`
- `0165_profile_borders.sql`
- `0166_avatar_includes.sql`
- `0167_lives_v3.sql`
- `0168_shop_currencies.sql`
- `0169_companion_lives_default.sql`
- `0171_crystal_daily_cap.sql`
- `0180_claim_proofs.sql`
- `0190_graded_attempts.sql`
- `0200_bounties.sql`
- `0210_rate_hits.sql`

## Hackathon edge functions (`supabase/functions/`, 26 functions plus `_shared/`)

- `action-gift`
- `bounty-action`
- `bounty-board`
- `bounty-claim`
- `bounty-sponsor`
- `circuit`
- `class-podium`
- `companion`
- `credential-meta`
- `credential-verify`
- `crystals`
- `endorse`
- `gifts`
- `grade`
- `learner-profile`
- `link-wallet`
- `lives`
- `passport`
- `purchase-confirm`
- `purchase-intent`
- `purchase-submit`
- `referral`
- `share-meta`
- `shop-claim`
- `shop-items`
- `wallet-faucet`

Also new: `scripts/hackathon/` (end-to-end scripts for the deployed devnet backend), `docs/onchain-passport.md`,
`docs/onchain-purchases.md`, `docs/browser-e2e.md`, and the front-end modules for certifications, shop, companion,
avatars, social features and the redesigned dashboard, header and profile under `src/`.

## Modified inherited code

102 inherited files were modified. `git diff --diff-filter=M --name-only 1f5b925b origin/main` lists them.

## Not covered by this repository

The deployed hackathon backend runs on the Supabase project `nyzcbnnbffsizshiolbh`; its data is not in this repository.
