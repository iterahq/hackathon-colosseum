#!/usr/bin/env -S npx tsx
/**
 * QA-tenant seed — build the `qa-e2e` tenant's content FROM NOTHING, idempotently.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The e2e identities used to drive `dfl-batch` — the REAL cohort's tenant. Two
 * of the specs write learner rows, so every run put synthetic attempts,
 * progress and class answers inside the numbers a real teacher reads. Tainan
 * chose option C on 2026-08-13: give the test identities a tenant of their own.
 * Migration `0066_test_tenant_isolation_primitives.sql` shipped the primitives
 * (`itera.create_test_tenant`, `itera.grant_membership`,
 * `itera.test_tenant_isolation_violations`) and the tenant now exists:
 *
 *     slug `qa-e2e` · id 4f7ac88e-cba2-407b-b917-1c5618f1b9b1 · is_test = true
 *
 * An empty tenant drives nothing. This seed is the other half: the CONTENT.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A FIXTURE, AND NOT A COPY OF `educar-mais-contexto`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The obvious move is to copy the program the specs already used. It is not
 * available. Measured 2026-08-13 on the authoring MCP: `instantiate_program`
 * deep-copies WITHIN ONE TENANT — it inserts every row with
 * `tenant_id: srcRow.tenant_id`. No cross-tenant copy primitive exists.
 *
 * The constraint pushed us onto the better path anyway. A copy would be:
 *   · COUPLED — QA content becomes whatever `dfl-batch` held on copy day, and
 *     it drifts the moment an author edits the real lesson;
 *   · UNREVIEWABLE — nothing in this repository would say what QA contains;
 *   · UNREBUILDABLE — losing the rows would mean copying again from a source
 *     that has since changed.
 *
 * `db/seeds/qa-tenant.fixture.json` is the opposite of all three: versioned,
 * diffable, and sufficient to rebuild the tenant from an empty database.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HOW IT WRITES — a real end user, over PostgREST, under RLS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Password grant as `itera-smoke`, then every write goes through PostgREST with
 * THAT user's JWT. No `service_role`, no database password, no `psql`. This is
 * not ceremony:
 *
 *   · CLAUDE.md is explicit that DATA changes carry the caller's user-JWT so
 *     RLS applies and the write is attributable, while SCHEMA changes go
 *     through `db/migrations/` and a human merge. This file writes data only.
 *   · A `service_role` write would succeed even if the authoring policies were
 *     broken, so the seed would stop being evidence that a real author can
 *     produce this content.
 *
 * Measured 2026-08-13, which is what makes the identity work at all:
 * `itera-smoke@iterahq.dev` holds `tenant_admin` on `qa-e2e` (NOT `owner` — an
 * earlier note said owner; the membership row says tenant_admin), and
 * `itera.current_author_tenant_ids()` accepts author/instructor/tenant_admin/
 * owner. So `programs_author_insert`, `units_author_insert`,
 * `lessons_author_insert` and `activities_author_insert` all admit it here.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IDEMPOTENCE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Look up first, create only what is missing, PATCH what drifted. Running twice
 * changes nothing and errors on nothing. The natural keys are ordinals within
 * the parent, because `itera.units` / `lessons` / `activities` carry no slug and
 * no unique business key — see the fixture header.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS SEED CANNOT DO, AND WILL TELL YOU ABOUT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * It ends with a READINESS report and exits 3 when the tenant is not able to
 * host the flows. That is on purpose. This repository already paid for the
 * other posture: `e2e.yml` was green for its whole life while executing nearly
 * nothing. A setup step that reports success while the tenant cannot run a
 * class is the same failure wearing different clothes.
 *
 * One item is expected to be BLOCKED today, and no user-JWT can clear it:
 *
 *   `itera.tenants.live_class_enabled` is FALSE for `qa-e2e`.
 *
 * Measured on the live database 2026-08-13: `authenticated` holds SELECT and
 * nothing else on `itera.tenants`, and every policy on that table is `for
 * select`. `itera.create_test_tenant` does not set the flag. So flipping it
 * needs either a migration or a new SECURITY DEFINER primitive — schema work,
 * which belongs in `db/migrations/` behind the human gate, and deliberately not
 * in this PR.
 *
 * A second hazard cannot even be MEASURED from here, so it is recorded instead
 * of checked: `instructorTenantId()` (src/services/membership.service.ts) sorts
 * live-class-enabled tenants first but does NOT filter, and
 * `InstructorClassPage` then shows only programs of the resolved tenant. While
 * `claude-e2e-prof` keeps its `instructor` row in `dfl-batch` (enabled), that
 * tenant wins the sort and the QA program never appears in the select. The seed
 * cannot see that row — `memberships_select_admin` scopes it to tenants the
 * caller administers, and it does not administer `dfl-batch`. Closing it is the
 * REVOKE half of the move (`itera.revoke_membership`, migration 0056), which is
 * a decision about what `route-access-matrix.spec.ts` asserts, not a seed step.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   SUPABASE_URL=https://kjefmwlopzeaqgqtlbdn.supabase.co \
 *   SUPABASE_ANON_KEY=… \
 *   ITERA_SMOKE_USERNAME=… ITERA_SMOKE_PASSWORD=… \
 *   npm run seed:qa-tenant
 *
 *   npm run seed:qa-tenant -- --dry-run          # plan only, no writes
 *   npm run seed:qa-tenant -- --ignore-readiness # apply, exit 0 even if BLOCKED
 *
 * It prints the two pins the specs consume, as `KEY=VALUE` lines, and appends
 * them to `$GITHUB_OUTPUT` / `$GITHUB_ENV` when those are set:
 *
 *   ITERA_E2E_PROGRAM_SLUG=qa-e2e-program
 *   ITERA_E2E_LESSON_ID=<uuid>
 *
 * Exit codes: 0 applied (and ready) · 1 failed · 2 bad usage / missing env
 *             3 applied but NOT ready — read the READINESS block.
 *
 * NEVER prints a credential. Only names, and only presence.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/* ─── the fixture, typed ──────────────────────────────────────────────── */

type I18n = Record<string, string>;
type Json = Record<string, unknown>;

interface FixtureActivity {
  ordinal: number;
  kind: string;
  status: string;
  spec: Json;
  rubric: Json;
}
interface FixtureLesson {
  ordinal: number;
  key: string;
  title_i18n: I18n;
  activities: FixtureActivity[];
}
interface FixtureUnit {
  ordinal: number;
  title_i18n: I18n;
  lessons: FixtureLesson[];
}
interface FixtureMember {
  email: string;
  role: string;
  why: string;
}
interface Fixture {
  tenant: { slug: string; name: string };
  members: FixtureMember[];
  program: { slug: string; title_i18n: I18n; units: FixtureUnit[] };
  pins: { program_slug_env: string; lesson_id_env: string; lesson_key: string };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, 'qa-tenant.fixture.json'), 'utf-8')
) as Fixture;

const DRY_RUN = process.argv.includes('--dry-run');
const IGNORE_READINESS = process.argv.includes('--ignore-readiness');

/* ─── env, never echoed ───────────────────────────────────────────────── */

function req(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(
      `ERROR: env ${name} is required and is empty.\n` +
        '       Supply SUPABASE_URL, SUPABASE_ANON_KEY, ITERA_SMOKE_USERNAME and\n' +
        '       ITERA_SMOKE_PASSWORD. Values live in Infisical (/apps/itera and\n' +
        '       /shared) and must never be committed or printed.'
    );
    process.exit(2);
  }
  return v;
}

const SUPABASE_URL = req('SUPABASE_URL').replace(/\/$/, '');
const ANON_KEY = req('SUPABASE_ANON_KEY');
const REST = `${SUPABASE_URL}/rest/v1`;

/* ─── PostgREST, as the signed-in user ────────────────────────────────── */

let accessToken = '';

/**
 * The Itera app lives in the `itera` schema (`public` is empty), so every
 * request carries `Accept-Profile` and, when it writes, `Content-Profile`.
 * Omitting them makes PostgREST answer about a schema with no tables, which
 * reads as "the row does not exist" rather than as a mistake.
 */
function headers(write = false): Record<string, string> {
  const h: Record<string, string> = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Accept-Profile': 'itera',
    'Content-Type': 'application/json',
  };
  if (write) {
    h['Content-Profile'] = 'itera';
    h.Prefer = 'return=representation';
  }
  return h;
}

async function login(): Promise<void> {
  const email = req('ITERA_SMOKE_USERNAME');
  const password = req('ITERA_SMOKE_PASSWORD');
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    // The body of a failed grant can echo the submitted email. Report the
    // status and nothing else.
    throw new Error(
      `password grant failed for ITERA_SMOKE_USERNAME (HTTP ${res.status}). ` +
        'Check the credential in Infisical /shared; the value is never printed here.'
    );
  }
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error('password grant returned no access_token');
  accessToken = body.access_token;
}

async function get<T>(path: string): Promise<T[]> {
  const res = await fetch(`${REST}/${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T[];
}

async function insert<T>(table: string, row: Json): Promise<T> {
  const res = await fetch(`${REST}/${table}`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`INSERT ${table} → ${res.status}: ${await res.text()}`);
  const rows = (await res.json()) as T[];
  return rows[0];
}

async function patch(table: string, filter: string, row: Json): Promise<void> {
  const res = await fetch(`${REST}/${table}?${filter}`, {
    method: 'PATCH',
    headers: headers(true),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`PATCH ${table} → ${res.status}: ${await res.text()}`);
}

async function rpc<T>(fn: string, args: Json): Promise<T> {
  const res = await fetch(`${REST}/rpc/${fn}`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`RPC ${fn} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

/* ─── helpers ─────────────────────────────────────────────────────────── */

/** Stable JSON, so a drift check compares VALUES and not key order. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const obj = v as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(',')}}`;
}

const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

const log = (line: string) => console.log(`[qa-seed] ${line}`);
const act = (line: string) => log(DRY_RUN ? `WOULD ${line}` : line);

/**
 * Stand-in id for a row a dry run only PLANNED to create. Its children can then
 * be planned too, instead of the run dying on `invalid input syntax for uuid` —
 * which is what a dry run that queries a non-existent parent gets from
 * PostgREST, and which reads like a bug in the seed rather than like the run
 * doing exactly what was asked.
 */
const PLANNED = '<planned>';
const isPlanned = (id: string) => id === PLANNED;

/* ─── row shapes we read back ─────────────────────────────────────────── */

interface TenantRow {
  id: string;
  slug: string;
  is_test: boolean;
  live_class_enabled: boolean;
}
interface ProgramRow {
  id: string;
  slug: string;
  title_i18n: I18n;
}
interface UnitRow {
  id: string;
  ordinal: number;
  title_i18n: I18n;
}
interface LessonRow {
  id: string;
  ordinal: number;
  title_i18n: I18n;
}
interface ActivityRow {
  id: string;
  ordinal: number;
  kind: string;
  status: string;
  spec: Json;
  rubric: Json;
}
interface MembershipRow {
  user_id: string;
  role: string;
  users: { email: string } | null;
}
interface ViolationRow {
  email: string;
  test_tenant: string;
  real_tenant: string;
  role_in_real: string;
}

/* ─── the steps ───────────────────────────────────────────────────────── */

/**
 * The tenant. `itera.create_test_tenant` is idempotent by slug and refuses to
 * reclassify an existing non-test tenant, so calling it unconditionally is both
 * the create path and the lookup path. That is what makes "from nothing" true.
 */
async function ensureTenant(): Promise<TenantRow> {
  const found = await get<TenantRow>(
    `tenants?slug=eq.${FIXTURE.tenant.slug}&select=id,slug,is_test,live_class_enabled`
  );
  if (found.length) {
    log(`tenant ${found[0].slug} present (id ${found[0].id}, is_test=${found[0].is_test})`);
    return found[0];
  }
  if (DRY_RUN) {
    act(`create tenant ${FIXTURE.tenant.slug} via itera.create_test_tenant`);
    return { id: PLANNED, slug: FIXTURE.tenant.slug, is_test: true, live_class_enabled: false };
  }
  const created = await rpc<TenantRow>('create_test_tenant', {
    p_slug: FIXTURE.tenant.slug,
    p_name: FIXTURE.tenant.name,
  });
  act(`created tenant ${created.slug} (id ${created.id})`);
  return created;
}

/**
 * Memberships, through `itera.grant_membership` (migration 0066) — the only
 * write path a user-JWT has, since `authenticated` holds SELECT and nothing
 * else on `itera.memberships`.
 *
 * The function carries a PROMOTION GUARD: inside an `is_test` tenant it refuses
 * a role above the target's existing highest role, because
 * `itera.custom_access_token_hook` publishes max(role) across ALL memberships
 * as one `user_role` claim. Without that guard, granting `owner` here would
 * promote every test identity everywhere and
 * `e2e/route-access-matrix.spec.ts` would keep passing while asserting the
 * wrong thing. The fixture therefore reproduces each identity at the role it
 * already holds — instructor for prof, learner for the alunos — and the guard
 * is the thing that proves it, not this comment.
 */
async function ensureMembers(tenant: TenantRow): Promise<MembershipRow[]> {
  if (isPlanned(tenant.id)) {
    for (const want of FIXTURE.members) act(`grant ${want.role} to ${want.email}`);
    return [];
  }
  const current = await get<MembershipRow>(
    `memberships?tenant_id=eq.${tenant.id}&select=user_id,role,users(email)`
  );
  const byEmail = new Map(
    current.filter((m) => m.users?.email).map((m) => [m.users!.email.toLowerCase(), m])
  );

  for (const want of FIXTURE.members) {
    const have = byEmail.get(want.email.toLowerCase());
    if (have && have.role === want.role) {
      log(`member ${want.email} already ${want.role}`);
      continue;
    }
    if (DRY_RUN) {
      act(`grant ${want.role} to ${want.email}`);
      continue;
    }
    try {
      await rpc<MembershipRow>('grant_membership', {
        p_tenant_id: tenant.id,
        p_role: want.role,
        p_user_email: want.email,
      });
      act(`granted ${want.role} to ${want.email}`);
    } catch (err) {
      // A missing identity, or a promotion the guard refuses, must not abort
      // the content seed — the content is useful on its own and the READINESS
      // block reports the shortfall in one place.
      log(`WARNING could not grant ${want.role} to ${want.email}: ${(err as Error).message}`);
    }
  }

  if (DRY_RUN) return current;
  return get<MembershipRow>(`memberships?tenant_id=eq.${tenant.id}&select=user_id,role,users(email)`);
}

async function ensureProgram(tenant: TenantRow): Promise<ProgramRow> {
  const found = await get<ProgramRow>(
    `programs?tenant_id=eq.${tenant.id}&slug=eq.${FIXTURE.program.slug}&select=id,slug,title_i18n`
  );
  if (found.length) {
    const row = found[0];
    if (!same(row.title_i18n, FIXTURE.program.title_i18n)) {
      if (!DRY_RUN) await patch('programs', `id=eq.${row.id}`, { title_i18n: FIXTURE.program.title_i18n });
      act(`retitled program ${row.slug}`);
    } else {
      log(`program ${row.slug} present (id ${row.id})`);
    }
    return { ...row, title_i18n: FIXTURE.program.title_i18n };
  }
  if (DRY_RUN) {
    act(`create program ${FIXTURE.program.slug}`);
    return { id: PLANNED, slug: FIXTURE.program.slug, title_i18n: FIXTURE.program.title_i18n };
  }
  const created = await insert<ProgramRow>('programs', {
    tenant_id: tenant.id,
    slug: FIXTURE.program.slug,
    title_i18n: FIXTURE.program.title_i18n,
  });
  act(`created program ${created.slug} (id ${created.id})`);
  return created;
}

async function ensureUnit(programId: string, want: FixtureUnit): Promise<UnitRow> {
  if (isPlanned(programId)) {
    act(`create unit ordinal ${want.ordinal}`);
    return { id: PLANNED, ordinal: want.ordinal, title_i18n: want.title_i18n };
  }
  const found = await get<UnitRow>(
    `units?program_id=eq.${programId}&ordinal=eq.${want.ordinal}&select=id,ordinal,title_i18n`
  );
  if (found.length) {
    const row = found[0];
    if (!same(row.title_i18n, want.title_i18n)) {
      if (!DRY_RUN) await patch('units', `id=eq.${row.id}`, { title_i18n: want.title_i18n });
      act(`retitled unit ordinal ${want.ordinal}`);
    }
    return row;
  }
  if (DRY_RUN) {
    act(`create unit ordinal ${want.ordinal}`);
    return { id: PLANNED, ordinal: want.ordinal, title_i18n: want.title_i18n };
  }
  const created = await insert<UnitRow>('units', {
    program_id: programId,
    ordinal: want.ordinal,
    title_i18n: want.title_i18n,
  });
  act(`created unit ordinal ${want.ordinal} (id ${created.id})`);
  return created;
}

async function ensureLesson(unitId: string, want: FixtureLesson): Promise<LessonRow> {
  if (isPlanned(unitId)) {
    act(`create lesson ordinal ${want.ordinal}`);
    return { id: PLANNED, ordinal: want.ordinal, title_i18n: want.title_i18n };
  }
  const found = await get<LessonRow>(
    `lessons?unit_id=eq.${unitId}&ordinal=eq.${want.ordinal}&select=id,ordinal,title_i18n`
  );
  if (found.length) {
    const row = found[0];
    if (!same(row.title_i18n, want.title_i18n)) {
      if (!DRY_RUN) await patch('lessons', `id=eq.${row.id}`, { title_i18n: want.title_i18n });
      act(`retitled lesson ordinal ${want.ordinal}`);
    }
    return row;
  }
  if (DRY_RUN) {
    act(`create lesson ordinal ${want.ordinal}`);
    return { id: PLANNED, ordinal: want.ordinal, title_i18n: want.title_i18n };
  }
  const created = await insert<LessonRow>('lessons', {
    unit_id: unitId,
    ordinal: want.ordinal,
    title_i18n: want.title_i18n,
  });
  act(`created lesson ordinal ${want.ordinal} (id ${created.id})`);
  return created;
}

/**
 * Returns nothing on purpose: no caller needs the activity id, and an unused
 * return here would be one more shape to keep true as the fixture grows.
 */
async function ensureActivity(lessonId: string, want: FixtureActivity): Promise<void> {
  if (isPlanned(lessonId)) {
    act(`create activity ordinal ${want.ordinal} (${want.kind})`);
    return;
  }
  const found = await get<ActivityRow>(
    `activities?lesson_id=eq.${lessonId}&ordinal=eq.${want.ordinal}&select=id,ordinal,kind,status,spec,rubric`
  );
  const payload: Json = {
    kind: want.kind,
    status: want.status,
    spec: want.spec,
    rubric: want.rubric,
  };
  if (found.length) {
    const row = found[0];
    // The fixture is the source of truth, so a row that drifted is REWRITTEN
    // rather than left alone. Leaving it would make the diff in this repository
    // a claim about QA content instead of a description of it.
    const drifted =
      row.kind !== want.kind ||
      row.status !== want.status ||
      !same(row.spec, want.spec) ||
      !same(row.rubric, want.rubric);
    if (drifted) {
      if (!DRY_RUN) await patch('activities', `id=eq.${row.id}`, payload);
      act(`rewrote activity ordinal ${want.ordinal} (${want.kind}) to match the fixture`);
    } else {
      log(`activity ordinal ${want.ordinal} (${want.kind}) already matches`);
    }
    return;
  }
  if (DRY_RUN) {
    act(`create activity ordinal ${want.ordinal} (${want.kind})`);
    return;
  }
  const created = await insert<ActivityRow>('activities', {
    lesson_id: lessonId,
    ordinal: want.ordinal,
    ...payload,
  });
  act(`created activity ordinal ${want.ordinal} (${want.kind}, id ${created.id})`);
}

/* ─── readiness ───────────────────────────────────────────────────────── */

interface Check {
  ok: boolean;
  name: string;
  detail: string;
}

function report(checks: Check[]): boolean {
  console.log('');
  console.log('[qa-seed] ── READINESS ─────────────────────────────────────────────');
  for (const c of checks) {
    console.log(`[qa-seed] ${c.ok ? 'PASS   ' : 'BLOCKED'} ${c.name}`);
    console.log(`[qa-seed]         ${c.detail}`);
  }
  console.log('[qa-seed] ──────────────────────────────────────────────────────────');
  return checks.every((c) => c.ok);
}

/* ─── main ────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  log(`seeding tenant '${FIXTURE.tenant.slug}' from db/seeds/qa-tenant.fixture.json${DRY_RUN ? ' [DRY-RUN]' : ''}`);
  await login();
  log('authenticated as ITERA_SMOKE_USERNAME (password grant, user-JWT — no service_role)');

  const tenant = await ensureTenant();
  const members = await ensureMembers(tenant);
  const program = await ensureProgram(tenant);

  let pinnedLessonId = '';
  let publishedActivities = 0;

  for (const wantUnit of FIXTURE.program.units) {
    const unit = await ensureUnit(program.id, wantUnit);
    for (const wantLesson of wantUnit.lessons) {
      const lesson = await ensureLesson(unit.id, wantLesson);
      if (wantLesson.key === FIXTURE.pins.lesson_key) pinnedLessonId = lesson.id;
      for (const wantActivity of wantLesson.activities) {
        await ensureActivity(lesson.id, wantActivity);
        if (wantActivity.status === 'published') publishedActivities += 1;
      }
    }
  }

  if (!pinnedLessonId) {
    throw new Error(
      `the fixture pins lesson key '${FIXTURE.pins.lesson_key}', but no lesson carries it. ` +
        'Fix db/seeds/qa-tenant.fixture.json — the specs consume the pin, so an unresolved key ' +
        'would hand CI an empty env var.'
    );
  }

  /* The pins the specs consume. Printed as KEY=VALUE so a shell can `eval` or
     a workflow can `>> "$GITHUB_ENV"` them without parsing prose. */
  console.log('');
  console.log(`${FIXTURE.pins.program_slug_env}=${program.slug}`);
  console.log(`${FIXTURE.pins.lesson_id_env}=${pinnedLessonId}`);
  console.log('');

  for (const sink of ['GITHUB_OUTPUT', 'GITHUB_ENV']) {
    const path = process.env[sink];
    if (!path || DRY_RUN) continue;
    appendFileSync(
      path,
      `${FIXTURE.pins.program_slug_env}=${program.slug}\n${FIXTURE.pins.lesson_id_env}=${pinnedLessonId}\n`
    );
    log(`wrote both pins to $${sink}`);
  }

  const haveEmails = new Set(
    members.filter((m) => m.users?.email).map((m) => `${m.users!.email.toLowerCase()}:${m.role}`)
  );
  const missingMembers = FIXTURE.members.filter(
    (m) => !haveEmails.has(`${m.email.toLowerCase()}:${m.role}`)
  );

  /**
   * The GRANT half of the move is this seed's job. The REVOKE half is not, and
   * pretending otherwise is how a half-finished migration gets filed as done.
   * `itera.test_tenant_isolation_violations()` (migration 0066) is the assertable
   * form of the invariant, so the seed reads it instead of describing it.
   *
   * Expect it to be NON-EMPTY right after a first successful seed: each identity
   * now holds a metric-producing role in BOTH `qa-e2e` and `dfl-batch`, so its
   * rows are still inside the real cohort's roster, completion and engagement
   * figures. Nothing improves until `itera.revoke_membership` (migration 0056)
   * removes the `dfl-batch` side — a decision about what
   * `e2e/route-access-matrix.spec.ts` asserts, and therefore not a seed step.
   */
  let violations: ViolationRow[] = [];
  let violationsRead = true;
  try {
    violations = await rpc<ViolationRow[]>('test_tenant_isolation_violations', {});
  } catch (err) {
    violationsRead = false;
    log(`WARNING could not read itera.test_tenant_isolation_violations(): ${(err as Error).message}`);
  }

  const ready = report([
    {
      ok: tenant.is_test,
      name: 'the tenant is marked is_test',
      detail: tenant.is_test
        ? `${tenant.slug} carries is_test = true, so membership-scoped readers exclude it structurally.`
        : `${tenant.slug} is NOT is_test. Refuse to seed test content into a real tenant.`,
    },
    {
      ok: publishedActivities > 0,
      name: 'the pinned lesson has published activities',
      detail:
        `${publishedActivities} activity row(s) at status=published. A draft row is invisible to a ` +
        'non-author through activities_select_tenant, so the learner specs would see an empty lesson.',
    },
    {
      ok: missingMembers.length === 0,
      name: 'every identity the specs drive is a member',
      detail:
        missingMembers.length === 0
          ? 'prof, aluno1 and aluno2 hold the fixture role in this tenant.'
          : `missing: ${missingMembers.map((m) => `${m.email} as ${m.role}`).join(', ')}. ` +
            'itera.grant_membership refused or the itera.users row does not exist. ' +
            'The promotion guard refuses a role above the identity\'s current highest role.',
    },
    {
      ok: tenant.live_class_enabled,
      name: 'the tenant may host a live class',
      detail: tenant.live_class_enabled
        ? 'live_class_enabled = true.'
        : 'live_class_enabled = FALSE. e2e/live-instructor-routed.spec.ts cannot run here: ' +
          'isLiveClassEnabledForUser() returns false and InstructorClassPage stays inert. ' +
          'NO user-JWT can fix this — authenticated holds SELECT only on itera.tenants and every ' +
          'policy there is `for select`. It needs a migration or a SECURITY DEFINER primitive, ' +
          'through db/migrations/ and the human gate. Measured 2026-08-13.',
    },
    {
      ok: violationsRead && violations.length === 0,
      name: 'no test identity still produces metrics in a real tenant',
      detail: !violationsRead
        ? 'itera.test_tenant_isolation_violations() could not be read, so this invariant is UNVERIFIED — which is not the same as satisfied.'
        : violations.length === 0
          ? 'itera.test_tenant_isolation_violations() returns zero rows. The isolation holds.'
          : `${violations.length} row(s): ` +
            violations.map((v) => `${v.email} is ${v.role_in_real} in ${v.real_tenant}`).join('; ') +
            '. This seed does the GRANT half only. Until itera.revoke_membership ' +
            '(migration 0056) removes the real-tenant side, these identities still count ' +
            "inside the real cohort's roster, completion and engagement figures.",
    },
  ]);

  if (DRY_RUN) {
    log('DRY-RUN — nothing was written.');
    return;
  }
  if (!ready && !IGNORE_READINESS) {
    log('content applied, but the tenant is NOT ready. Exiting 3. Pass --ignore-readiness to override.');
    process.exit(3);
  }
  log('done.');
}

main().catch((err: unknown) => {
  console.error('[qa-seed] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
