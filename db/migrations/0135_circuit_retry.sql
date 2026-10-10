-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Circuito: the transfer now runs after the purchase answer and is retried
-- when it failed or never ran (`_shared/circuit-store.ts`).
--
-- * Purchases paid before the Circuito existed (0130, applied
--   2026-10-10 03:20 UTC) never owed a transfer. They are closed as `skipped`
--   (`before_circuit`) so the retry can never sweep them.
-- * `purchases_circuit_due_idx`: the rows the retry looks for.
--
-- 0130 said a `failed` transfer "is NOT retried (it may have been broadcast)".
-- It is retried now, safely: the signature is stored at broadcast time and the
-- retry first asks the chain whether that signature, or any transaction of the
-- treasury carrying the memo `circuit:<purchase id>`, landed.
-- Idempotent.
-- ============================================================================

update itera.purchases
   set circuit_status = 'skipped', circuit_reason = 'before_circuit', circuit_at = now()
 where status = 'paid'
   and source = 'payment'
   and circuit_status is null
   and paid_at < '2026-10-10T03:20:00Z';

create index if not exists purchases_circuit_due_idx
  on itera.purchases (paid_at)
  where status = 'paid' and source = 'payment' and (circuit_status is null or circuit_status in ('pending', 'failed'));
