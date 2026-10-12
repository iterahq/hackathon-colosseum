# Privacy: the profile is a choice, a contact is for companies only

Hackathon only: Supabase project `nyzcbnnbffsizshiolbh`. Migration `0355_privacy.sql`. Pure rules in
`supabase/functions/_shared/privacy.ts` (tests beside it), database in `_shared/privacy-store.ts`, functions `privacy`,
`talent-board`, and the gate in `learner-profile`, `capability-graph`, `bounty-board`, `share-meta`.

A wallet is anonymous until its owner says otherwise. Nothing asks for a name, an e-mail or a contact to learn, stamp
a day, open a chest, buy or accept a bounty: an account made by a wallet sign-in stores a placeholder address
(`…@wallets.hackathon.invalid`) where the inherited schema wants an e-mail.

## The public profile

`/u/<wallet>` is our aggregation of what a wallet did here. Showing it to others is the learner's choice
(`itera.profile_settings.public_profile`).

- **No choice made:** an account that existed before `onchain_config.profile_private_from` (the moment the migration
  ran, `2026-10-12T07:36:45Z`) stays visible, because nobody asked to hide it. An account created from that moment on
  is **private** until it chooses. No row was written for any existing account.
- **Private, asked by a stranger:** `GET /learner-profile/<wallet>` answers `{ wallet, cluster, private: true }` and
  nothing else: no avatar, name, graph, Tera shelf, count or issuer. The same gate (`walletView`) answers
  `capability-graph/<wallet>` with `{ wallet, private: true }`, `bounty-board/wallet/<wallet>` with no earnings, and
  `share-meta/u/<wallet>` with the site's own link preview.
- **The owner, signed in** (a valid session whose wallet is that one), always gets the whole page, with
  `private: true|false` and `viewer: "owner"`. A made-up or foreign token is a stranger.
- **When the gate cannot tell** (a read failed, a date that cannot be parsed), the answer is private.
- Switching the page off while listed on the talent board is refused (`409 listed_on_talent_board`) unless the same
  call leaves the board (`leave_board: true`).

`GET /privacy` and `POST /privacy { action: "set_profile", public }` are the learner's own view and switch.

### What stays public, on purpose

- **A certification page `/c/<asset>` and `credential-verify`:** it is the proof, and it reads the chain. A private
  profile hides our aggregation, not the assets: anyone who knows a wallet address can still list what it holds with a
  Solana RPC, and each asset names its owner.
- `learner-profile/<wallet>/evidence/<claim>`: the document whose hash is on the certification.
- `tera-chest/<chest id>`: the recompute of one chest, reached from the earned Tera.
- `gate-check`: reads the chain.
- `bounty-board/invited/<wallet>`: the direct bounties addressed to a wallet. The escrow accounts name that wallet on
  chain, and the learner's own inbox reads it.
- A bounty's own page shows the wallet it paid.

So "private" means: this site does not hand a stranger the summary of a wallet. It does not mean the wallet's on-chain
history is hidden; nothing can make it so.

## The talent board and the contact

Listing is opt-in and needs three things: a wallet with at least one stamped day (as before), the public profile ON
(`409 profile_private` otherwise: the page is switched on by its owner, not as a side effect of listing), and **at
least one contact** (`400 contact_required`).

| field | accepted |
|---|---|
| `email` | one address, at most 120 characters, stored lowercase |
| `telegram` | 5 to 32 of `a-z 0-9 _`; a leading `@` is dropped |
| `linkedin` | `https://www.linkedin.com/in/<slug>`, at most 120 |
| `link` | one `https` URL, at most 200, a host with a dot, no `user:password`, no port |

Every field is one plain token. A space, a quote, `<`, `>`, a backslash, a control or direction character, or
anything not of the field's shape refuses the whole form (`400 invalid_contact` with the field's name). Nothing is
stripped and kept.

**Only companies see it.** The contact lives in `itera.talent_contacts`, one row per listing. It is returned by three
answers and no other: the learner's own `privacy` and `talent-board status`, and `reveal_contact` to a company. It is
in no card of the public board (a card says `has_contact`), in no `learner-profile`, `credential-*` or bounty answer,
in no on-chain attribute, and in no log line: the functions log an error's message or code only, never the object
(a database error about a refused row can quote the row).

**Leaving deletes it.** `unlist`, and switching the profile off with `leave_board`, delete the contact row and then the
listing. The foreign key (`on delete cascade`) deletes it too if a listing ever goes another way. A company that had
seen a contact is answered `404 not_listed` afterwards.

The five listings made before contacts existed (the owner's among them) stay listed with `has_contact: false`;
nothing was written to them.

### Who is a company

Decided from our tables for the signed-in caller; nothing in the request takes part (`companyOf`):

- **staff of a sponsor tenant:** an instructor, admin or owner of a tenant (not a personal one) that has posted a
  bounty; or
- **a wallet that funded a bounty:** the caller's sign-in wallet is the sponsor wallet of at least one bounty whose
  escrow account was seen funded on chain (`bounties.funded_at`).

`POST /talent-board { action: "reveal_contact", wallet }` then shows the contact of one listed learner. A visitor is
`401`; a learner, or anyone who is not a company, `403 not_a_company` (answered before the listing is even looked up);
the learner's own listing `403 own_listing`.

- **Audit.** Every reveal writes a row in `itera.talent_contact_reveals` (which account, whose listing, how the caller
  qualified, when) before the contact is answered. The table holds no contact.
- **The learner sees how many.** `companies_looked` and `last_looked_at` on their own status: a count of different
  accounts, never which.
- **Cap.** A company is shown at most 10 different learners in any 24 hours (`429 reveal_limit`); looking again at
  one of them is free. On top of it, one account makes at most 12 reveal calls a minute.

### What this does not stop

- **A company that is not one.** Funding the cheapest bounty (0.01 devnet SOL plus rent, refundable while nobody holds
  it) makes any wallet a "company". With the cap, one such wallet reads at most 10 contacts a day, and each read is
  recorded with the account that made it; several wallets multiply that. On devnet SOL is free, so the bar is only
  effort. A real deployment would need a reviewed company account, not a funded escrow.
- **A company that copies a contact.** Deleting the row stops new reveals; it cannot take back what somebody already
  read. The form says the contact is shown to companies while listed; it does not promise more.
- **The staff of a sponsor tenant are trusted as a group.** Any instructor of such a tenant qualifies.
- **The operator.** Whoever holds the service-role key or the database password reads every table. The contact is not
  encrypted at rest beyond what the database does for everything.
- **A wallet our tables know nothing about** (signed in, nothing minted) has no page to hide: the gate finds no
  account behind the address and answers the same empty profile as before.
- **Twenty seconds.** A public profile answer may sit in a browser or proxy cache for 20 seconds after its owner
  switches it off.

## Tables

| table | what | who reads or writes |
|---|---|---|
| `profile_settings` | the learner's choice | service role only |
| `talent_contacts` | the contact while listed (personal data) | service role only |
| `talent_contact_reveals` | the audit of reveals (no contact) | service role only |

RLS is on with no policy on all three, and every privilege of `public`, `anon` and `authenticated` is revoked: the
PostgREST API answers `401`/`403` for them to the anon key and to a learner's own session alike. They are in no view.

## Run it

```bash
npx vitest run --config vitest.supabase.config.ts supabase/functions/_shared/privacy.test.ts
source ~/.config/itera-hackathon/supabase.env && export SUPABASE_ACCESS_TOKEN
RUN=<stamp of a tera-e2e.mjs run> node scripts/hackathon/privacy-e2e.mjs      # one stamp on devnet, about 0.008 SOL
```
