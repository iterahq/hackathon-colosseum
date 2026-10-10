# Built during the hackathon, and what was inherited

Disclosure for the Colosseum "Crypto World's Fair" rules (pre-existing code is allowed if disclosed; only work
done during the competition is judged).

## Copy point

- This repository is a copy of the private product repository `iterahq/itera-player`.
- Last inherited commit: `1f5b925b` (2026-10-09 16:49 -0300), "feat: funnel events (DFL-00D3F) (#699)".
- First hackathon commit: `34336b3` (2026-10-09 17:44 -0300), "chore: bootstrap hackathon copy (drop CI, isolation
  banner, API base build arg) (#1)". Its parent is the copy point.
- Range: `git log 1f5b925b..origin/main`. At the time of writing (main at `7612e12`, 2026-10-10 07:55 -0300): 53 commits,
  one per merged PR (squash merges), all by one git author account.
- Diff against the copy point: 605 files changed, 501 added, 84 modified, 20 deleted; 45,544 lines added and 5,004 removed.
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
  repository. All 19 edge functions below were written during the competition.

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

Open and not on `main`: #43 "Phoenix Crystals: earned currency, backgrounds and icon colours, names for wallet learners".

## Hackathon migrations (`db/migrations/`, 34 files)

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

## Hackathon edge functions (`supabase/functions/`, 19 functions plus `_shared/`)

- `action-gift`
- `circuit`
- `class-podium`
- `companion`
- `credential-meta`
- `credential-verify`
- `endorse`
- `gifts`
- `learner-profile`
- `link-wallet`
- `lives`
- `passport`
- `purchase-confirm`
- `purchase-intent`
- `purchase-submit`
- `referral`
- `shop-claim`
- `shop-items`
- `wallet-faucet`

Also new: `scripts/hackathon/` (end-to-end scripts for the deployed devnet backend), `docs/onchain-passport.md`,
`docs/onchain-purchases.md`, `docs/browser-e2e.md`, and the front-end modules for certifications, shop, companion,
avatars, social features and the redesigned dashboard, header and profile under `src/`.

## Modified inherited code

84 inherited files were modified. `git diff --diff-filter=M --name-only 1f5b925b origin/main` lists them.

## Not covered by this repository

The deployed hackathon backend runs on the Supabase project `nyzcbnnbffsizshiolbh`; its data is not in this repository.
