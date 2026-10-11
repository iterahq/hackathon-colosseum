-- HACKATHON ONLY (Supabase nyzcbnnbffsizshiolbh).
-- One more ledger step: `escrow_moved`, written when an open bounty's reward leaves its first escrow account
-- (refund to the sponsor, the transaction on this row) to be locked again in an account that names the days.
-- Widens a check constraint; no row changes. Undo: restore the list without 'escrow_moved'.
alter table itera.bounty_events drop constraint if exists bounty_events_kind_check;
alter table itera.bounty_events add constraint bounty_events_kind_check check (kind in (
  'created', 'funded', 'accepted', 'submitted', 'approved', 'rejected',
  'withdrawn', 'expired', 'paid', 'refund_started', 'refunded', 'escrow_moved'));
