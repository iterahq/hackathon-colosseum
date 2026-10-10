-- ============================================================================
-- HACKATHON ONLY (iterahq/hackathon-colosseum, Supabase nyzcbnnbffsizshiolbh).
-- `itera.wallet_identity_user` (0119) is SECURITY DEFINER: pin an empty
-- search_path so nothing but the schema-qualified names in its body resolves.
-- Idempotent.
-- ============================================================================

create or replace function itera.wallet_identity_user(p_address text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select i.user_id
  from auth.identities a
  join itera.identities i on i.provider_subject = a.user_id::text
  where a.provider = 'web3' and a.provider_id = 'web3:solana:' || p_address
  limit 1;
$function$;

revoke all on function itera.wallet_identity_user(text) from public, anon, authenticated;
grant execute on function itera.wallet_identity_user(text) to service_role;
