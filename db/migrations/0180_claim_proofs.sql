-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Capability claims proven by a certification.
--
-- `itera.claim_proofs`: one row per (certification row, claim). A stamped day
-- proves the claims of that day (`_shared/capability-graph.ts`). `evidence` is
-- the document whose SHA-256 is `evidence_hash`; a prefix of that hash is
-- written to the certification asset as the attribute `claim:<claim_id>`.
-- `tx_signature` is the transaction that wrote it, null until one did.
--
-- No client policy: the public reads go through `learner-profile`, which
-- answers by wallet and carries no learner id. Only the service role writes.
-- Additive and idempotent.
-- ============================================================================

create table if not exists itera.claim_proofs (
  user_achievement_id uuid not null references itera.user_achievements(id) on delete cascade,
  claim_id            text not null check (claim_id ~ '^[a-z0-9-]{1,24}$'),
  lesson_id           uuid not null,
  wallet              text not null check (wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  evidence            text not null,
  evidence_hash       text not null check (evidence_hash ~ '^[0-9a-f]{64}$'),
  tx_signature        text,
  proven_at           timestamptz not null default now(),
  written_at          timestamptz,
  primary key (user_achievement_id, claim_id)
);

create index if not exists claim_proofs_wallet_idx on itera.claim_proofs (wallet);

alter table itera.claim_proofs enable row level security;
revoke all on itera.claim_proofs from anon, authenticated;
grant all on itera.claim_proofs to service_role;
