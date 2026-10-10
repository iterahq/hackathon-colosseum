-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- One payment settles ONE thing (security review, finding 2).
--
-- `purchases.tx_signature` and `gifts.tx_signature` are each unique, but only
-- inside their own table: a transaction carrying the memos of a purchase and of
-- an Action gift settled both. `itera.payments` is the single ledger across
-- every paid thing: `tx_signature` is its primary key and `ref_id` the intent
-- it settled (a purchase id or a gift id; the in-app gift shares one id between
-- its `purchases` row and its `gifts` row, so both rows point at one entry).
--
-- `itera.settle_payment` is the only way an intent becomes paid: it locks the
-- intent row, writes the ledger entry and marks the intent paid in ONE
-- transaction. Its answers:
--   settled          : paid by this signature (now, or already: idempotent)
--   signature_reused : this signature already settled another intent
--   already_paid     : the intent was paid by another signature
--   not_payable      : the intent is refunded / failed
--   not_found        : no such intent
--
-- Verification of the transaction itself stays in TypeScript
-- (`_shared/purchase-verify.ts`). Service role only; no client reads the ledger.
-- Idempotent.
-- ============================================================================

create table if not exists itera.payments (
  tx_signature text primary key,
  kind         text not null check (kind in ('purchase', 'gift')),
  ref_id       uuid not null,
  lamports     bigint not null check (lamports > 0),
  created_at   timestamptz not null default now()
);

create index if not exists payments_ref_idx on itera.payments (ref_id);

alter table itera.payments enable row level security;
revoke all on itera.payments from public, anon, authenticated;
grant all on itera.payments to service_role;

-- What was settled before the ledger existed. Purchases first: an in-app gift
-- shares its signature and its id with its purchase.
insert into itera.payments (tx_signature, kind, ref_id, lamports, created_at)
select tx_signature, 'purchase', id, lamports, coalesce(paid_at, created_at)
from itera.purchases
where tx_signature is not null
on conflict (tx_signature) do nothing;

insert into itera.payments (tx_signature, kind, ref_id, lamports, created_at)
select tx_signature, 'gift', id, lamports, coalesce(paid_at, created_at)
from itera.gifts
where tx_signature is not null
on conflict (tx_signature) do nothing;

create or replace function itera.settle_payment(p_kind text, p_ref_id uuid, p_signature text, p_lamports bigint)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status    text;
  v_signature text;
  v_ref       uuid;
begin
  if p_signature is null or length(p_signature) < 64 then
    raise exception 'settle_payment: malformed signature';
  end if;

  if p_kind = 'purchase' then
    select status, tx_signature into v_status, v_signature from itera.purchases where id = p_ref_id for update;
  elsif p_kind = 'gift' then
    select status, tx_signature into v_status, v_signature from itera.gifts where id = p_ref_id for update;
  else
    raise exception 'settle_payment: unknown kind %', p_kind;
  end if;
  if not found then
    return 'not_found';
  end if;

  if v_status in ('paid', 'delivered') then
    return case when v_signature = p_signature then 'settled' else 'already_paid' end;
  end if;
  if v_status not in ('pending', 'expired') then
    return 'not_payable';
  end if;

  begin
    insert into itera.payments (tx_signature, kind, ref_id, lamports)
    values (p_signature, p_kind, p_ref_id, p_lamports)
    on conflict (tx_signature) do nothing;

    select ref_id into v_ref from itera.payments where tx_signature = p_signature;
    if v_ref is distinct from p_ref_id then
      return 'signature_reused';
    end if;

    if p_kind = 'purchase' then
      update itera.purchases
         set status = 'paid', tx_signature = p_signature, paid_at = now(), error = null
       where id = p_ref_id;
    else
      update itera.gifts
         set status = 'paid', tx_signature = p_signature, paid_at = now(), error = null
       where id = p_ref_id;
    end if;
  exception when unique_violation then
    -- The per-table unique index on `tx_signature` refused it: the ledger entry is rolled back with it.
    return 'signature_reused';
  end;

  return 'settled';
end;
$$;

revoke all on function itera.settle_payment(text, uuid, text, bigint) from public, anon, authenticated;
grant execute on function itera.settle_payment(text, uuid, text, bigint) to service_role;
