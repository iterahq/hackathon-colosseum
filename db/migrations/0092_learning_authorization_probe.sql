-- T28: caller-JWT policy diagnostics. Schema only; every candidate write rolls back.
-- Root reserves 0091 for the residue re-pass. This RPC leaves existing policies intact.
begin;
create or replace function learning.probe_authorization(
  p_resource text, p_operation text, p_reference_id text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  reference learning.capabilities%rowtype;
  candidate_id text := 'cap_authorization_probe_' || replace(gen_random_uuid()::text, '-', '');
  state text;
  message text;
  outcome text;
  insert_granted boolean;
  rls_enabled boolean;
begin
  if current_user <> 'authenticated' or itera.current_itera_user_id() is null then
    raise exception 'authenticated caller required' using errcode = '42501';
  end if;
  if p_resource is distinct from 'capabilities' or p_operation is distinct from 'insert_shared'
     or p_reference_id is null or length(btrim(p_reference_id)) = 0 or length(p_reference_id) > 200 then
    raise exception 'unsupported authorization probe input' using errcode = '22023';
  end if;
  select * into reference from learning.capabilities
    where id = p_reference_id and learner_id is null;
  if not found then
    raise exception 'caller-visible shared capability required' using errcode = '22023';
  end if;
  insert_granted := has_table_privilege(current_user, 'learning.capabilities', 'INSERT');
  rls_enabled := row_security_active('learning.capabilities'::regclass);
  -- Never return normally from this subtransaction: even a broken policy or
  -- an operator caller must leave no row or transactional trigger side effect.
  begin
    insert into learning.capabilities(id, learner_id, title, description, source, introduced_in)
      values (candidate_id, null, reference.title, reference.description, reference.source, reference.introduced_in);
    raise exception 'authorization probe forced rollback' using errcode = 'P9201';
  exception when others then
    get stacked diagnostics state = returned_sqlstate, message = message_text;
    outcome := case
      when state = 'P9201' then 'allowed_rolled_back'
      when state = '42501' and insert_granted and rls_enabled
        and message = 'new row violates row-level security policy for table "capabilities"'
        then 'rls_denied'
      when state = '42501' then 'permission_denied'
      when left(state, 2) = '23' then 'constraint_failed'
      else 'database_error'
    end;
  end;
  return jsonb_build_object('resource', p_resource, 'operation', p_operation,
    'reference_id', p_reference_id, 'outcome', outcome,
    'sqlstate', case when state = 'P9201' then null else state end,
    'rolled_back', true, 'sql_role', current_user,
    'rls_active', rls_enabled, 'insert_granted', insert_granted);
end $$;
revoke all on function learning.probe_authorization(text,text,text) from public, anon, service_role;
grant execute on function learning.probe_authorization(text,text,text) to authenticated;
comment on function learning.probe_authorization(text,text,text) is
  'Narrow caller-JWT policy probe. Attempts a valid shared capability INSERT and always rolls back its subtransaction; distinguishes RLS, privileges, constraints, and unexpected permission. No arbitrary SQL or identity override.';
notify pgrst, 'reload schema';
commit;
