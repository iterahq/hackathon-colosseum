-- ============================================================================
-- census.sql — ONE definition of "what this schema is", used by three callers.
--
-- Version3 includes learning, trigger enabled state and explicit column ACLs.
--
--   1. db/scripts/apply-migrations.sh   — records a row in
--      itera.schema_object_census after every apply, and `drift` compares the
--      live database against the last recorded row (out-of-band DDL alarm).
--   2. db/scripts/schema-parity.sh      — censuses a from-zero build and diffs
--      it against db/census/expected-schema.txt (the repo-rebuilds-production
--      proof).
--   3. .github/workflows/db-drift.yml   — censuses the LIVE database and diffs
--      it against the same expected file (the proof stays true over time).
--
-- Having one file is the point. Until 2026-08-12 the census lived inline in
-- apply-migrations.sh and nothing else could reach it, so "the schema builds
-- from zero" (db-migration-check) and "the schema has not drifted" (db-drift)
-- were measured with two different rulers and neither could answer the
-- question that actually matters: does the repository still rebuild production?
--
-- ⚠️ WHAT THIS DELIBERATELY MEASURES, AND WHY EACH PART EARNS ITS PLACE
-- --------------------------------------------------------------------
-- The previous census listed relation names, column types, index NAMES,
-- function SIGNATURES and policy NAMES. Measured 2026-08-12, that surface was
-- blind to every one of these, all of which change behaviour with no visible
-- catalog difference:
--
--   * a policy keeping its name and changing its USING / WITH CHECK predicate
--     (0022 and 0023 both rewrite `itera_class_members_read` in place)
--   * a function keeping its signature and changing its body, its volatility
--     or its SECURITY DEFINER flag
--   * a CHECK or FOREIGN KEY constraint (pg_constraint was not read at all)
--   * a column DEFAULT
--   * a GRANT to anon / authenticated / service_role
--   * whether RLS is ENABLED on a table at all
--   * membership of the `supabase_realtime` publication
--
-- So: predicates, body hashes, constraint definitions, index definitions,
-- defaults, grants, RLS flags and publication membership are all in. A census
-- that cannot see a change is a census that certifies it.
--
-- ⚠️ ORDERING. Callers sort the output; do not rely on the order here.
--
-- ⚠️ pg_cron IS A HARD DEPENDENCY. Migration 0053 runs `CREATE EXTENSION
-- pg_cron` and schedules a job, so `cron.job` exists in production and in any
-- complete from-zero build. A database where this query fails to parse for
-- want of `cron.job` is not a complete Itera schema, and failing loudly is the
-- correct answer.
--
-- ⚠️ VERSIONING. The first line is `#cens version=<n>`. Bump it in the same
-- commit as any change to this file. `apply-migrations.sh drift` compares the
-- version before comparing the contents and RE-RECORDS instead of reporting a
-- diff when the version moved — otherwise editing this file would masquerade
-- as a schema drift incident on the next daily run.
-- ============================================================================

-- ⚠️ LOAD-BEARING. `pg_get_expr` / `pg_get_indexdef` / `pg_get_triggerdef`
-- render a name UNQUALIFIED when its schema is on the session search_path, and
-- the search_path differs between the Supabase pooler and the supabase/postgres
-- container. Measured 2026-08-12: the same column default came out as
-- `auth.uid()` from production and as `uid()` from the throwaway build — six
-- phantom differences that are pure rendering. Pinning the search_path to
-- pg_catalog makes every name fully qualified on every host, so a difference in
-- this census is a difference in the schema.
set search_path = pg_catalog;

select line from (
  select '#cens version=3' as line
  union all
  -- ── relations, including sequences, with the RLS flags ─────────────────────
  select format('rel   %s.%s %s rls=%s force=%s', n.nspname, c.relname, c.relkind,
                c.relrowsecurity, c.relforcerowsecurity)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('itera','billing','learning') and c.relkind in ('r','v','m','p','f','S')
  union all
  -- ── columns: type, NOT NULL, DEFAULT, identity, generated ─────────────────
  select format('col   %s.%s.%s %s%s default=%s ident=%s gen=%s',
                n.nspname, c.relname, a.attname,
                format_type(a.atttypid, a.atttypmod),
                case when a.attnotnull then ' NOT NULL' else '' end,
                coalesce(pg_get_expr(d.adbin, d.adrelid), '-'),
                coalesce(nullif(a.attidentity, ''), '-'),
                coalesce(nullif(a.attgenerated, ''), '-'))
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where n.nspname in ('itera','billing','learning') and c.relkind in ('r','v','m','p','f')
     and a.attnum > 0 and not a.attisdropped
  union all
  -- ── constraints: PK / FK / UNIQUE / CHECK / EXCLUDE, by full definition ────
  select format('con   %s.%s %s %s', n.nspname, c.relname, con.conname,
                pg_get_constraintdef(con.oid))
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('itera','billing','learning')
  union all
  -- ── indexes, by DEFINITION rather than by name ────────────────────────────
  select format('idx   %s', regexp_replace(pg_get_indexdef(i.indexrelid), '\s+', ' ', 'g'))
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('itera','billing','learning')
  union all
  -- ── functions: identity args, result, kind, volatility, security, body hash ─
  select format('fn    %s.%s(%s) -> %s kind=%s vol=%s secdef=%s cfg=%s body=%s',
                n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
                pg_get_function_result(p.oid), p.prokind, p.provolatile, p.prosecdef,
                coalesce(array_to_string(p.proconfig, ','), '-'),
                substr(md5(coalesce(p.prosrc, '')), 1, 12))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('itera','billing','learning')
  union all
  -- ── enum / domain types with their labels, in sort order ──────────────────
  select format('type  %s.%s %s [%s]', n.nspname, t.typname, t.typtype,
                coalesce((select string_agg(e.enumlabel, ',' order by e.enumsortorder)
                            from pg_enum e where e.enumtypid = t.oid), ''))
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
   where n.nspname in ('itera','billing','learning') and t.typtype in ('e','d')
  union all
  -- ── RLS policies WITH their predicates, roles and command ─────────────────
  -- The realtime.messages clause is scoped by policy name: this project owns
  -- the `itera*` policies there and nothing else in that schema.
  select format('pol   %s.%s %s cmd=%s perm=%s roles=%s using=%s check=%s',
                n.nspname, c.relname, pol.polname, pol.polcmd, pol.polpermissive,
                coalesce((select string_agg(r.rolname, ',' order by r.rolname)
                            from unnest(pol.polroles) x(o)
                            join pg_roles r on r.oid = x.o), 'PUBLIC'),
                coalesce(regexp_replace(pg_get_expr(pol.polqual, pol.polrelid), '\s+', ' ', 'g'), '-'),
                coalesce(regexp_replace(pg_get_expr(pol.polwithcheck, pol.polrelid), '\s+', ' ', 'g'), '-'))
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('itera','billing','learning')
      or (n.nspname = 'realtime' and pol.polname like 'itera%')
  union all
  -- ── triggers on this project's own tables, by definition ──────────────────
  select format('trg   %s enabled=%s', regexp_replace(pg_get_triggerdef(t.oid), '\s+', ' ', 'g'), t.tgenabled)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('itera','billing','learning') and not t.tgisinternal
  union all
  -- ── and the ones this project puts on SOMEBODY ELSE'S table ───────────────
  -- 0009 / 0015 attach `on_auth_user_created_provision_itera` to auth.users.
  -- The old census could not see it, so the federation trigger could vanish
  -- without a single check noticing.
  select format('trg   %s enabled=%s', regexp_replace(pg_get_triggerdef(t.oid), '\s+', ' ', 'g'), t.tgenabled)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname not in ('itera','billing','learning') and not t.tgisinternal
     and t.tgname like '%itera%'
  union all
  -- ── view / materialised-view definitions, hashed ──────────────────────────
  select format('view  %s.%s %s', n.nspname, c.relname,
                substr(md5(regexp_replace(pg_get_viewdef(c.oid), '\s+', ' ', 'g')), 1, 12))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('itera','billing','learning') and c.relkind in ('v','m')
  union all
  -- ── schema privileges for the client roles ────────────────────────────────
  select format('gsch  %s %s usage=%s create=%s', n.nspname, r.rolname,
                has_schema_privilege(r.oid, n.oid, 'USAGE'),
                has_schema_privilege(r.oid, n.oid, 'CREATE'))
    from pg_namespace n
    cross join pg_roles r
   where n.nspname in ('itera','billing','learning')
     and r.rolname in ('anon','authenticated','service_role','supabase_auth_admin')
  union all
  -- ── table privileges for the client roles ─────────────────────────────────
  select format('gtbl  %s.%s %s %s', n.nspname, c.relname, r.rolname,
                coalesce((select string_agg(p, ',' order by p)
                            from unnest(array['SELECT','INSERT','UPDATE','DELETE',
                                              'TRUNCATE','REFERENCES','TRIGGER']) p
                           where has_table_privilege(r.oid, c.oid, p)), '-'))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join pg_roles r
   where n.nspname in ('itera','billing','learning') and c.relkind in ('r','v','m','p','f','S')
     and r.rolname in ('anon','authenticated','service_role','supabase_auth_admin')
  union all
  -- Explicit column ACLs matter independently of table privileges. In learning,
  -- authenticated UPDATE(status) must not conceal an added metadata UPDATE grant.
  select format('gcol  %s.%s.%s %s %s grantable=%s', n.nspname, c.relname, a.attname,
                case when acl.grantee=0 then 'PUBLIC' else r.rolname end,
                acl.privilege_type, acl.is_grantable)
    from pg_attribute a
    join pg_class c on c.oid=a.attrelid
    join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(a.attacl) acl
    left join pg_roles r on r.oid=acl.grantee
   where n.nspname in ('itera','billing','learning')
     and a.attnum>0 and not a.attisdropped
     and (acl.grantee=0 or r.rolname in ('anon','authenticated','service_role','supabase_auth_admin'))
  union all
  -- ── function EXECUTE privileges for the client roles ──────────────────────
  select format('gfn   %s.%s(%s) %s exec=%s', n.nspname, p.proname,
                pg_get_function_identity_arguments(p.oid), r.rolname,
                has_function_privilege(r.oid, p.oid, 'EXECUTE'))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    cross join pg_roles r
   where n.nspname in ('itera','billing','learning')
     and r.rolname in ('anon','authenticated','service_role','supabase_auth_admin')
  union all
  -- ── realtime publication membership ───────────────────────────────────────
  select format('pub   %s %s.%s', pb.pubname, n.nspname, c.relname)
    from pg_publication_rel pr
    join pg_publication pb on pb.oid = pr.prpubid
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('itera','billing','learning')
  union all
  -- ── sequence parameters ───────────────────────────────────────────────────
  select format('seq   %s.%s start=%s inc=%s min=%s max=%s cycle=%s',
                n.nspname, c.relname, s.seqstart, s.seqincrement,
                s.seqmin, s.seqmax, s.seqcycle)
    from pg_sequence s
    join pg_class c on c.oid = s.seqrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('itera','billing','learning')
  union all
  -- ── COMMENTs on relations, columns and functions ──────────────────────────
  -- 0028_activity_results_truth_boundary.sql adds NO object at all: its entire
  -- content is a COMMENT ON TABLE recording that pass rates before
  -- 2026-07-29 are 100% by construction and must not be trusted. That is
  -- load-bearing knowledge living in the catalogue, and it could be dropped by
  -- one careless `comment on ... is null` with nothing to notice.
  select format('cmt   rel %s.%s %s', n.nspname, c.relname,
                substr(md5(obj_description(c.oid, 'pg_class')), 1, 12))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('itera','billing','learning') and c.relkind in ('r','v','m','p','f','S')
     and obj_description(c.oid, 'pg_class') is not null
  union all
  select format('cmt   col %s.%s.%s %s', n.nspname, c.relname, a.attname,
                substr(md5(col_description(c.oid, a.attnum)), 1, 12))
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('itera','billing','learning') and a.attnum > 0 and not a.attisdropped
     and col_description(c.oid, a.attnum) is not null
  union all
  select format('cmt   fn  %s.%s(%s) %s', n.nspname, p.proname,
                pg_get_function_identity_arguments(p.oid),
                substr(md5(obj_description(p.oid, 'pg_proc')), 1, 12))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('itera','billing','learning')
     and obj_description(p.oid, 'pg_proc') is not null
  union all
  -- ── the cron jobs this schema schedules (0053) ────────────────────────────
  select format('cron  %s %s', j.jobname, regexp_replace(j.schedule, '\s+', ' ', 'g'))
    from cron.job j
   where j.jobname like 'itera%'
) s order by line
