-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- "Circuito": each paid purchase moves half of its lamports from the treasury
-- to the mint authority (the key that pays the network fee of every stamp).
--
-- The transfer is recorded on the purchase row itself, so it is idempotent per
-- purchase id: `circuit_status` goes null -> `pending` (compare-and-set, taken
-- once) -> `sent` | `skipped` | `failed`, and is never taken again.
--   sent    : `circuit_lamports` moved, `circuit_signature` (unique) is the transfer
--   skipped : nothing moved (`circuit_reason`: `treasury_floor`, `nothing_to_send`)
--   failed  : the transfer errored; it is NOT retried (it may have been broadcast)
--
-- Amount and destination are decided in TypeScript from this row and from the
-- function's own keys (`_shared/circuit.ts`, `_shared/treasury.ts`). Totals are
-- public through the `circuit` function only; grants of 0115 are unchanged
-- (a learner reads their own purchase rows, only the service role writes).
-- Idempotent.
-- ============================================================================

alter table itera.purchases add column if not exists circuit_status text;
alter table itera.purchases add column if not exists circuit_lamports bigint;
alter table itera.purchases add column if not exists circuit_signature text;
alter table itera.purchases add column if not exists circuit_at timestamptz;
alter table itera.purchases add column if not exists circuit_reason text;

alter table itera.purchases drop constraint if exists purchases_circuit_status_check;
alter table itera.purchases add constraint purchases_circuit_status_check
  check (circuit_status is null or circuit_status in ('pending', 'sent', 'skipped', 'failed'));

alter table itera.purchases drop constraint if exists purchases_circuit_sent_check;
alter table itera.purchases add constraint purchases_circuit_sent_check
  check (circuit_status is distinct from 'sent' or (circuit_lamports > 0 and circuit_lamports <= lamports and circuit_signature is not null));

create unique index if not exists purchases_circuit_signature_idx on itera.purchases (circuit_signature) where circuit_signature is not null;
create index if not exists purchases_circuit_sent_idx on itera.purchases (circuit_at desc) where circuit_status = 'sent';
create index if not exists purchases_circuit_wallet_idx on itera.purchases (wallet) where circuit_status = 'sent';
