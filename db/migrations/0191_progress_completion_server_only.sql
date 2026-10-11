-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- Server-side grading, part 2: a completion is written by the server only.
--
-- `progress_client_guard` (0134) stamped the server's clock on a completion a
-- client wrote. It now REFUSES it: a request that arrives with a client role
-- cannot make a row `completed`. The `grade` edge function (service role) is
-- the writer, after it judged the answer.
--
-- Still allowed for a client: `in_progress` rows, reopening a completed row
-- (`completed -> in_progress`, the live class does it), and re-sending a row
-- that is already `completed` (it keeps its time and its origin).
--
-- `onchain_config.proof_cutoff` records when this took effect. `passport` reads
-- it: a client-recorded completion from before it is legacy (judged by the old
-- plausibility floor), one from after it cannot exist.
-- Apply only once the web app that calls `grade` is live.
-- Idempotent.
-- ============================================================================

create or replace function itera.progress_client_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.status::text = 'completed' then
    if tg_op = 'UPDATE' and old.status::text = 'completed' and old.completed_at is not null then
      new.completed_at := old.completed_at;
      new.written_by_client := old.written_by_client;
      return new;
    end if;
    raise exception 'progress: a completion is recorded by the server after grading'
      using errcode = '42501', hint = 'POST the answer to the grade function.';
  end if;

  new.written_by_client := true;
  new.completed_at := null;
  return new;
end;
$$;

insert into itera.onchain_config (key, value)
values ('proof_cutoff', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
on conflict (key) do nothing;
