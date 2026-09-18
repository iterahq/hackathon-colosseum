-- Itera migration 0101 — itera.mcp_tool_calls: one row per MCP tool call.
--
-- Plan: 20260918-umami-traffic-report-and-tracking-coverage (P7, ADR-5, ADR-6),
-- task T19. Tainan TG 2026-09-18 msg 18865 answered Q 2db9d193 = A: MCP usage
-- goes into a Supabase table with the caller's JWT under RLS, and Itera gets
-- the same table in its own database.
--
-- The DFL twin is devfellowship/dfl-schema PR #1000
-- (public.mcp_tool_calls). The columns and the RLS contract are the same. Two
-- things change, and each follows a convention of this repository:
--
--   * the table lives in schema `itera`, where every Itera-owned table lives
--     (itera-mcp reads it with `.schema('itera')`);
--   * the admin read uses itera.is_learning_operator() (0069): owner or
--     tenant_admin of the `itera` platform tenant. DFL uses
--     iam.is_global_admin(), which does not exist here.
--
-- DDL only. No seed row, no backfill, no data of any kind.
--
-- WHAT WRITES HERE
-- ----------------
-- iterahq/itera-mcp `instrumentMcpServer()` wraps every registered tool. Its
-- optional `supabase` sink (off by default, env MCP_USAGE_SINKS) inserts one
-- row per call with the SESSION's user-JWT client. Never service_role: RLS
-- attributes the row to the real caller.
--
-- WHAT NEVER GOES HERE
-- --------------------
-- No email, no JWT, no tool arguments, no tool result, no error message text.
-- `error_code` is a short code (`err.code ?? err.name`, or `tool_error`).
-- `user_agent` is capped at 200 characters by a CHECK, so a writer that forgets
-- to truncate fails loudly.
--
-- user_id IS THE SUPABASE AUTH USER (the JWT `sub`), NOT itera.users.id.
-- ----------------------------------------------------------------------
-- The MCP server knows the JWT `sub` and nothing else. An MCP caller does not
-- need an itera.users row to call a tool, so this column keys on auth.users.
--
-- THE RLS CONTRACT
-- ----------------
--   INSERT  authenticated, only WITH CHECK (user_id = auth.uid()).
--           `user_id` defaults to auth.uid(), so the sink can omit it.
--   SELECT  own rows, plus the platform operator (itera.is_learning_operator()).
--   UPDATE  no policy, no grant. A usage log is append-only.
--   DELETE  no policy, no grant. Rows go away only with the user (CASCADE).
--   anon    no privilege at all.
--
-- Proof: db/scripts/test-rls-mcp-tool-calls.sh, run by db-migration-check.
--
-- Idempotent: IF NOT EXISTS, DROP POLICY IF EXISTS, absolute GRANT/REVOKE.
begin;

create table if not exists itera.mcp_tool_calls (
  id             bigint      generated always as identity primary key,
  created_at     timestamptz not null default now(),
  server         text        not null,
  tool           text        not null,
  user_id        uuid        not null default auth.uid()
                             references auth.users(id) on delete cascade,
  session_id     text,
  client_name    text,
  client_version text,
  user_agent     text,
  duration_ms    integer,
  ok             boolean     not null,
  error_code     text,
  constraint mcp_tool_calls_server_chk     check (length(btrim(server)) > 0),
  constraint mcp_tool_calls_tool_chk       check (length(btrim(tool)) > 0),
  constraint mcp_tool_calls_duration_chk   check (duration_ms is null or duration_ms >= 0),
  constraint mcp_tool_calls_user_agent_chk check (user_agent is null or char_length(user_agent) <= 200),
  constraint mcp_tool_calls_error_code_chk check (error_code is null or char_length(error_code) <= 100)
);

comment on table itera.mcp_tool_calls is
  'MCP tool-call usage: one row per call, inserted by itera-mcp with the '
  'caller''s user-JWT (never service_role). No email, JWT, arguments, results '
  'or error text. Append-only. Plan: '
  '20260918-umami-traffic-report-and-tracking-coverage (P7, ADR-5, ADR-6).';
comment on column itera.mcp_tool_calls.server is
  'MCP server short name. itera-mcp writes "itera".';
comment on column itera.mcp_tool_calls.tool is
  'The registered tool name.';
comment on column itera.mcp_tool_calls.user_id is
  'The Supabase auth user (JWT sub), not itera.users.id. Defaults to '
  'auth.uid(); the INSERT policy refuses any other value. Never an email.';
comment on column itera.mcp_tool_calls.ok is
  'false when the tool callback threw or returned isError: true.';
comment on column itera.mcp_tool_calls.error_code is
  'A short code only (err.code, err.name, or tool_error). Never a message.';
comment on column itera.mcp_tool_calls.user_agent is
  'The request User-Agent, truncated by the writer to 200 characters.';

create index if not exists idx_mcp_tool_calls_created_at
  on itera.mcp_tool_calls (created_at);
create index if not exists idx_mcp_tool_calls_server_tool_created_at
  on itera.mcp_tool_calls (server, tool, created_at);
create index if not exists idx_mcp_tool_calls_user_created_at
  on itera.mcp_tool_calls (user_id, created_at);

alter table itera.mcp_tool_calls enable row level security;

drop policy if exists mcp_tool_calls_insert_self on itera.mcp_tool_calls;
create policy mcp_tool_calls_insert_self on itera.mcp_tool_calls
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists mcp_tool_calls_read_self on itera.mcp_tool_calls;
create policy mcp_tool_calls_read_self on itera.mcp_tool_calls
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists mcp_tool_calls_read_operator on itera.mcp_tool_calls;
create policy mcp_tool_calls_read_operator on itera.mcp_tool_calls
  for select to authenticated
  using (itera.is_learning_operator());

-- GRANTS. RLS applies on top; these decide which VERBS may be attempted.
-- 0002's blanket grant does not reach a table created afterwards, so every
-- line is written out (the 0068 pattern, db/README.md "Conventions").
revoke all on itera.mcp_tool_calls from public, anon, authenticated;
grant select, insert on itera.mcp_tool_calls to authenticated;
grant all on itera.mcp_tool_calls to service_role;

commit;
