-- 0210: a shared counter for the per-address limit of the public edge functions.
-- Each request of a Supabase edge function may run in a fresh isolate (measured: an in-memory
-- counter never moved), so the window lives here. One row per key (function + address), a fixed
-- window, one atomic upsert per call. Service role only: RLS on, no policy, execute revoked.
-- Additive and idempotent.

create table if not exists itera.rate_hits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);

alter table itera.rate_hits enable row level security;

revoke all on itera.rate_hits from anon, authenticated;

create or replace function itera.rate_take(p_key text, p_limit integer, p_window_ms integer)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window interval := make_interval(secs => p_window_ms / 1000.0);
  v_start timestamptz;
  v_hits integer;
begin
  insert into itera.rate_hits (key, window_start, hits)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set window_start = case when itera.rate_hits.window_start < v_now - v_window then v_now else itera.rate_hits.window_start end,
        hits = case when itera.rate_hits.window_start < v_now - v_window then 1 else itera.rate_hits.hits + 1 end
  returning itera.rate_hits.window_start, itera.rate_hits.hits into v_start, v_hits;

  -- Idle keys are swept now and then by the calls themselves: no job, no growth.
  if random() < 0.002 then
    delete from itera.rate_hits where window_start < v_now - interval '1 day';
  end if;

  return query select
    v_hits <= p_limit,
    greatest(p_limit - v_hits, 0),
    case when v_hits <= p_limit then 0 else greatest(1, ceil(extract(epoch from (v_start + v_window - v_now)))::integer) end;
end;
$$;

revoke all on function itera.rate_take(text, integer, integer) from public, anon, authenticated;
grant all on itera.rate_hits to service_role;
grant execute on function itera.rate_take(text, integer, integer) to service_role;
