-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Earned OR bought: `outfit_laurel` is also free once the learner reaches
-- level 5.
--
-- * `shop_items.effect.unlock.level`: the rule, read by `_shared/unlock.ts`.
-- * `purchases.source` (`payment` | `claim`): a free claim records a paid row
--   of zero lamports, so both paths end in the same `user_inventory` row and
--   the same history. `lamports = 0` is allowed for a claim only, and a
--   learner holds at most one claim per item and ref.
--
-- Only the service role writes (grants of 0115 unchanged). Idempotent.
-- ============================================================================

alter table itera.purchases add column if not exists source text not null default 'payment';

alter table itera.purchases drop constraint if exists purchases_source_check;
alter table itera.purchases add constraint purchases_source_check check (source in ('payment', 'claim'));

alter table itera.purchases drop constraint if exists purchases_lamports_check;
alter table itera.purchases add constraint purchases_lamports_check
  check (lamports > 0 or (lamports = 0 and source = 'claim'));

create unique index if not exists purchases_one_claim_idx
  on itera.purchases (user_id, item_key, ref_id) where source = 'claim';

update itera.shop_items
   set effect = effect || '{"unlock": {"level": 5}}'::jsonb
 where key = 'outfit_laurel';
