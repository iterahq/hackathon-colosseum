-- Origin: agent. T6/D: caller-only physical column metadata for complete exports.
-- No data writes. The existing export_inventory() contract remains unchanged.
begin;
create or replace function learning.export_evidence_columns()
returns text[] language plpgsql stable security invoker set search_path = '' as $$
begin
 if current_user <> 'authenticated' or itera.current_itera_user_id() is null then
  raise exception 'An authenticated caller identity is required' using errcode='42501';
 end if;
 if not pg_catalog.has_table_privilege(current_user,'learning.evidence','SELECT') then
  raise exception 'Evidence SELECT privilege is required' using errcode='42501';
 end if;
 return (select pg_catalog.array_agg(a.attname::text order by a.attname::text collate "C")
  from pg_catalog.pg_attribute a
  where a.attrelid = 'learning.evidence'::pg_catalog.regclass and a.attnum > 0 and not a.attisdropped);
end $$;
revoke all on function learning.export_evidence_columns() from public,anon,service_role;
grant execute on function learning.export_evidence_columns() to authenticated;
comment on function learning.export_evidence_columns() is 'Read-only physical evidence-column metadata for complete exports. No arguments or identity override; caller identity and SELECT privilege are required.';
notify pgrst,'reload schema';
commit;
