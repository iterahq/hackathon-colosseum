-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Limits on the public gift Action (security review, finding 6): `action-gift`
-- POST takes no token, and every call cost the Solana node four requests and
-- could add a `gifts` row.
--
-- * `gifts.blockhash`: the blockhash of the transaction last built for the
--   intent. A repeated POST of the same payer for the same recipient inside
--   that window returns the same transaction with no node call at all.
-- * `gifts_action_recipient_idx`: the per-recipient counts the function takes
--   BEFORE any node call (at most 10 open action intents per recipient, at most
--   60 unpaid ones a day; rules in `_shared/gift.ts`).
-- Idempotent.
-- ============================================================================

alter table itera.gifts add column if not exists blockhash text;

create index if not exists gifts_action_recipient_idx
  on itera.gifts (to_user_id, created_at)
  where source = 'action' and status in ('pending', 'expired');
