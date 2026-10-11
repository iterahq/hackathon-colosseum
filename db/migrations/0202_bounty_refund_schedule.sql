-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Bounties: an expired bounty returns to its sponsor on its own.
--
-- Every ten minutes the database calls `GET /bounty-board/sweep`, which refunds
-- bounties past `expires_at` that nobody holds, and finishes refunds that were
-- started and never confirmed. The call carries no secret: the route is public
-- and can only send a bounty's money to the refund address fixed when it was
-- posted. A read of the board does the same for one bounty, so the money also
-- moves if this job is ever removed.
--
-- The URL names this project on purpose: this migration is not for any other.
--
-- Additive and idempotent. Undo: select cron.unschedule('itera-bounty-refund-expired');
-- ============================================================================

create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'itera-bounty-refund-expired') then
    perform cron.unschedule('itera-bounty-refund-expired');
  end if;
  perform cron.schedule(
    'itera-bounty-refund-expired',
    '*/10 * * * *',
    $job$select net.http_get(url := 'https://nyzcbnnbffsizshiolbh.supabase.co/functions/v1/bounty-board/sweep', timeout_milliseconds := 8000)$job$
  );
end;
$$;
