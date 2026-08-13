-- ============================================================================
-- bootstrap-roles.sql — give the two service roles a way to log in.
--
-- WHAT IS MISSING FROM THE IMAGE, AND WHY
-- ---------------------------------------
-- `supabase/postgres:17.6.1.160` ships the ROLES (`anon`, `authenticated`,
-- `service_role`, `authenticator`, `supabase_auth_admin`, `supabase_admin`) but
-- ships NO PASSWORDS for them — the hosted product sets those per project, and
-- the image cannot bake in a secret. `db/scripts/fresh-apply-bootstrap.sql`
-- never noticed, because it only ever connects as `supabase_admin` over the
-- host's trusted socket.
--
-- The moment a SERVICE connects over TCP the gap is fatal, and it is fatal in a
-- way that reads like a configuration error rather than a missing password:
--
--   gotrue    → FATAL: password authentication failed for user "supabase_auth_admin"
--   postgrest → FATAL: password authentication failed for user "authenticator"
--
-- So this file is the counterpart of `fresh-apply-bootstrap.sql`: that one adds
-- the runtime OBJECTS the image does not ship, this one adds the runtime
-- CREDENTIALS. Both are throwaway-database-only by construction — the password
-- is the literal string `postgres` on a loopback port.
--
-- 🚨 NEVER RUN THIS AGAINST ANYTHING THAT IS NOT A DISPOSABLE CONTAINER.
-- `bringup/up.sh` reaches it only through 127.0.0.1 on a port it started
-- itself, and `bringup/down.sh` destroys the volume.
-- ============================================================================

-- ---- login credentials -----------------------------------------------------
ALTER ROLE authenticator       WITH LOGIN PASSWORD 'postgres';
ALTER ROLE supabase_auth_admin WITH LOGIN PASSWORD 'postgres';

-- ---- what GoTrue needs on `auth` -------------------------------------------
-- The image creates `auth` owned by `supabase_admin`. GoTrue connects as
-- `supabase_auth_admin` and runs its OWN migrations there, which means creating
-- and altering tables — it must own the schema, not merely be able to read it.
ALTER SCHEMA auth OWNER TO supabase_auth_admin;
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;

DO $own$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname, c.relkind
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'auth' AND c.relkind IN ('r', 'p', 'v', 'S')
  LOOP
    IF r.relkind = 'S' THEN
      EXECUTE format('ALTER SEQUENCE auth.%I OWNER TO supabase_auth_admin', r.relname);
    ELSIF r.relkind = 'v' THEN
      EXECUTE format('ALTER VIEW auth.%I OWNER TO supabase_auth_admin', r.relname);
    ELSE
      EXECUTE format('ALTER TABLE auth.%I OWNER TO supabase_auth_admin', r.relname);
    END IF;
  END LOOP;
END;
$own$;

-- ---- what PostgREST needs --------------------------------------------------
-- `authenticator` holds no privileges of its own. It SWITCHES to `anon` for an
-- unauthenticated request and to the `role` claim of the JWT for an
-- authenticated one, so it must be a member of all three or every request ends
-- in "permission denied to set role".
GRANT anon, authenticated, service_role TO authenticator;
