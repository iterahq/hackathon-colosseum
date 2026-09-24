#!/usr/bin/env -S npx tsx
/**
 * Generic program-fixture seed — publish any `db/seeds/*.fixture.json` shaped
 * `{ program: { slug, title_i18n, units: [...] } }` (react-fundamentals.fixture.json,
 * react-effects.fixture.json, ...) into a tenant, idempotently, over PostgREST
 * under the caller's user-JWT. Same posture as `qa-tenant.ts`: CLAUDE.md is
 * explicit that DATA changes carry the caller's own JWT so RLS applies and the
 * write is attributable, while SCHEMA changes go through `db/migrations/` and a
 * human merge. This file writes data only, never `service_role`, never `psql`.
 *
 * Where this generalizes `qa-tenant.ts`: that script owns ONE fixture, ONE
 * hardcoded tenant, and a tenant/membership lifecycle this script does not
 * (`create_test_tenant`, `grant_membership`, the readiness report) — none of
 * that belongs to "publish an authored program". This script only does the
 * program → unit → lesson → activity upsert, generalized to any fixture path
 * and any tenant, plus the two things no existing seed does: it drops `_`-keys
 * itself (the React fixtures were never written for a seed to consume) and it
 * uploads the images they reference under `public/lesson-media/` to the real
 * `lesson-media` Storage bucket, rewriting the URLs before it writes a row.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run seed:program -- db/seeds/react-fundamentals.fixture.json --tenant dfl-batch
 *   npm run seed:program -- <fixture> --tenant <slug> --dry-run
 *   npm run seed:program -- <fixture> --tenant <slug> --catalog   # sets programs.is_catalog = true
 *
 * `--dry-run` touches NO network at all (not just no writes): it loads the
 * fixture, validates it, and prints the plan from the fixture alone, so it
 * needs none of the env below. Applying for real does.
 *
 * Env (same shape as `qa-tenant.ts`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
 * an author/tenant_admin/owner identity's own credentials —
 * `ITERA_SMOKE_USERNAME` / `ITERA_SMOKE_PASSWORD`, or any pair the caller sets.
 * NEVER prints a credential. Only names, and only presence.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT RUNS BEFORE A SINGLE NETWORK CALL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  1. Load the fixture and strip every `_`-prefixed key (`_comment`,
 *     `_solution` — fixture-only, never a column).
 *  2. Validate EVERY activity spec against the shared `@iterahq/activity-spec`
 *     parser (`safeParseActivitySpec`). One invalid activity fails the WHOLE
 *     run — fail closed, before any write, exactly like a broken fixture
 *     should never partially land.
 *  3. Resolve every `/lesson-media/...` reference in the fixture against
 *     `public/` and confirm the file exists, with a MIME type the
 *     `lesson-media` bucket accepts (`db/scripts/setup-storage-lesson-media.sql`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UPLOAD + REWRITE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Each local `public/lesson-media/...` file is uploaded once (deduped by local
 * path) to the SAME relative path in the `lesson-media` Storage bucket
 * (`x-upsert: true`, so a re-run overwrites rather than erroring), and every
 * reference in the fixture — `instruction.image_url`, an option `image_url`,
 * the `diagram` kind's camelCase `spec.imageUrl`, anything — is rewritten to
 * the bucket's public URL before it is written into a row. The rewrite walks
 * the whole spec value generically; it does not special-case field names.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IDEMPOTENCY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Same natural keys as `qa-tenant.ts`, because `itera.units` / `lessons` /
 * `activities` carry no slug and no unique business key: program by
 * `(tenant_id, slug)`, unit by `(program_id, ordinal)`, lesson by
 * `(unit_id, ordinal)`, activity by `(lesson_id, ordinal)`. Look up first,
 * create only what is missing, PATCH what drifted from the fixture. Running
 * twice changes nothing further and never duplicates a row.
 *
 * Exit codes: 0 applied (or dry-run) · 1 failed (validation or a write) ·
 * 2 bad usage.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { safeParseActivitySpec, type ActivityKind } from '@iterahq/activity-spec';

/* ─── the fixture, typed ──────────────────────────────────────────────── */

export type I18n = Record<string, string>;
export type Json = Record<string, unknown>;

export interface FixtureActivity {
  ordinal: number;
  kind: string;
  status: string;
  spec: Json;
  rubric: Json;
}
export interface FixtureLesson {
  ordinal: number;
  key: string;
  title_i18n: I18n;
  activities: FixtureActivity[];
}
export interface FixtureUnit {
  ordinal: number;
  title_i18n: I18n;
  lessons: FixtureLesson[];
}
export interface FixtureProgram {
  slug: string;
  title_i18n: I18n;
  units: FixtureUnit[];
}
export interface Fixture {
  program: FixtureProgram;
}

/* ─── pure helpers (unit-tested in program-fixture.test.ts) ──────────────── */

/**
 * Drop every `_`-prefixed key, recursively. `_comment` and `_solution` are
 * fixture-only annotations (the header of every `*.fixture.json` says so) —
 * neither is a column, and writing either would fail the insert on an unknown
 * key or, worse, silently widen `spec` with authoring scaffolding a learner
 * could read.
 */
export function stripUnderscoreKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUnderscoreKeys(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith('_')) continue;
      out[k] = stripUnderscoreKeys(v);
    }
    return out as T;
  }
  return value;
}

/** A `/lesson-media/...`-rooted reference, wherever it sits in a spec. */
const LESSON_MEDIA_RE = /^\/lesson-media\/[\w./-]+$/;

/**
 * Walk any value and collect every string that IS a lesson-media path.
 * Generic on purpose: `instruction.image_url` and the `diagram` kind's
 * camelCase `spec.imageUrl` are both just strings at some key, and a future
 * kind or field should not need this function to change.
 */
export function collectLessonMediaRefs(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    if (LESSON_MEDIA_RE.test(value)) out.add(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectLessonMediaRefs(v, out);
    return out;
  }
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collectLessonMediaRefs(v, out);
  }
  return out;
}

/**
 * Rewrite every string in `value` that appears as a key in `urlMap`, leaving
 * everything else — including lesson-media paths with no mapped upload, which
 * should never happen once the preflight has run, but this function has no
 * opinion about that; it only rewrites what it is given.
 */
export function rewriteLessonMediaUrls<T>(value: T, urlMap: ReadonlyMap<string, string>): T {
  if (typeof value === 'string') {
    return (urlMap.get(value) ?? value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => rewriteLessonMediaUrls(v, urlMap)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = rewriteLessonMediaUrls(v, urlMap);
    }
    return out as T;
  }
  return value;
}

/** MIME type by extension, matching the `lesson-media` bucket's allowlist. */
const MIME_BY_EXT: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export function mimeTypeFor(localPath: string): string | undefined {
  const dot = localPath.lastIndexOf('.');
  if (dot === -1) return undefined;
  return MIME_BY_EXT[localPath.slice(dot).toLowerCase()];
}

/** Natural (business) keys — stable across a re-run, never a database id. */
export function unitIdemKey(programSlug: string, ordinal: number): string {
  return `${programSlug}#unit:${ordinal}`;
}
export function lessonIdemKey(programSlug: string, unitOrdinal: number, lessonKey: string): string {
  return `${unitIdemKey(programSlug, unitOrdinal)}#lesson:${lessonKey}`;
}
export function activityIdemKey(lessonKeyPath: string, ordinal: number): string {
  return `${lessonKeyPath}#activity:${ordinal}`;
}

export interface PlanStep {
  kind: 'program' | 'unit' | 'lesson' | 'activity' | 'media';
  key: string;
  label: string;
}

/**
 * The INTENDED state, purely from the fixture — no DB read, no network. This
 * is what `--dry-run` prints. It does not know whether a row already exists
 * (that diff happens against a live tenant, which is exactly the network call
 * a dry run must not make), so it describes the fixture's shape rather than
 * "create" vs "update".
 */
export function buildPlan(
  fixture: Fixture,
  tenantSlug: string,
  opts: { catalog: boolean }
): PlanStep[] {
  const steps: PlanStep[] = [];
  const { program } = fixture;
  steps.push({
    kind: 'program',
    key: program.slug,
    label:
      `upsert program '${program.slug}' into tenant '${tenantSlug}'` +
      (opts.catalog ? ' (is_catalog=true)' : ''),
  });
  for (const unit of program.units) {
    const uKey = unitIdemKey(program.slug, unit.ordinal);
    steps.push({ kind: 'unit', key: uKey, label: `unit ordinal ${unit.ordinal}` });
    for (const lesson of unit.lessons) {
      const lKey = lessonIdemKey(program.slug, unit.ordinal, lesson.key);
      steps.push({ kind: 'lesson', key: lKey, label: `lesson '${lesson.key}' (ordinal ${lesson.ordinal})` });
      for (const activity of lesson.activities) {
        steps.push({
          kind: 'activity',
          key: activityIdemKey(lKey, activity.ordinal),
          label: `activity ordinal ${activity.ordinal} (${activity.kind}, ${activity.status})`,
        });
      }
    }
  }
  return steps;
}

export function buildMediaPlan(fixture: Fixture): string[] {
  return [...collectLessonMediaRefs(fixture.program)].sort();
}

/* ─── stable JSON compare, for drift checks (same shape as qa-tenant.ts) ── */

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

/* ─── everything below this line touches the filesystem or the network ──── */
/* istanbul ignore next -- exercised by manual --dry-run runs, not vitest */

function parseArgs(argv: string[]): { fixturePath: string; tenant: string; dryRun: boolean; catalog: boolean } {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const dryRun = argv.includes('--dry-run');
  const catalog = argv.includes('--catalog');
  const tenantIdx = argv.indexOf('--tenant');
  const tenant = tenantIdx !== -1 ? argv[tenantIdx + 1] : undefined;
  if (!positional[0] || !tenant) {
    console.error(
      'Usage: npm run seed:program -- <fixture path> --tenant <slug> [--dry-run] [--catalog]'
    );
    process.exit(2);
  }
  return { fixturePath: positional[0], tenant, dryRun, catalog };
}

function loadFixture(fixturePath: string): Fixture {
  const abs = resolve(fixturePath);
  if (!existsSync(abs)) {
    console.error(`ERROR: fixture not found: ${abs}`);
    process.exit(2);
  }
  const raw = JSON.parse(readFileSync(abs, 'utf-8'));
  return stripUnderscoreKeys(raw) as Fixture;
}

interface ValidationIssue {
  path: string;
  message: string;
}

/** Fail closed: every activity spec must parse before ANY write happens. */
function validateActivities(fixture: Fixture): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const unit of fixture.program.units) {
    for (const lesson of unit.lessons) {
      for (const activity of lesson.activities) {
        const path = `unit ${unit.ordinal} > lesson '${lesson.key}' > activity ${activity.ordinal}`;
        const parsed = safeParseActivitySpec(activity.kind as ActivityKind, activity.spec);
        if (!parsed.success) {
          issues.push({ path, message: `kind '${activity.kind}': ${JSON.stringify(parsed.error.issues)}` });
        }
      }
    }
  }
  return issues;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

interface MediaCheck {
  localPath: string;
  absPath: string;
  mime: string | undefined;
}

function checkMedia(refs: string[]): { ok: MediaCheck[]; issues: ValidationIssue[] } {
  const ok: MediaCheck[] = [];
  const issues: ValidationIssue[] = [];
  for (const ref of refs) {
    const absPath = join(REPO_ROOT, 'public', ref);
    const mime = mimeTypeFor(ref);
    if (!existsSync(absPath)) {
      issues.push({ path: ref, message: `not committed at ${absPath}` });
      continue;
    }
    if (!mime) {
      issues.push({ path: ref, message: 'extension is not accepted by the lesson-media bucket' });
      continue;
    }
    ok.push({ localPath: ref, absPath, mime });
  }
  return { ok, issues };
}

function req(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`ERROR: env ${name} is required and is empty.`);
    process.exit(2);
  }
  return v;
}

const log = (line: string) => console.log(`[program-seed] ${line}`);

async function main(): Promise<void> {
  const { fixturePath, tenant, dryRun, catalog } = parseArgs(process.argv.slice(2));
  const fixture = loadFixture(fixturePath);

  const activityIssues = validateActivities(fixture);
  if (activityIssues.length) {
    console.error(`[program-seed] ${activityIssues.length} activity spec(s) fail validation. Nothing was written.`);
    for (const issue of activityIssues) console.error(`  - ${issue.path}: ${issue.message}`);
    process.exit(1);
  }

  const mediaRefs = buildMediaPlan(fixture);
  const { ok: media, issues: mediaIssues } = checkMedia(mediaRefs);
  if (mediaIssues.length) {
    console.error(`[program-seed] ${mediaIssues.length} lesson-media reference(s) cannot be resolved. Nothing was written.`);
    for (const issue of mediaIssues) console.error(`  - ${issue.path}: ${issue.message}`);
    process.exit(1);
  }

  const plan = buildPlan(fixture, tenant, { catalog });
  log(`fixture '${fixturePath}' → tenant '${tenant}'${dryRun ? ' [DRY-RUN]' : ''}`);
  for (const step of plan) log(`  ${step.kind.padEnd(8)} ${step.label}`);
  for (const m of media) log(`  media    upload ${m.localPath} → lesson-media/${m.localPath.replace(/^\/lesson-media\//, '')}`);
  log(`${plan.filter((s) => s.kind === 'activity').length} activity spec(s) validated against @iterahq/activity-spec.`);

  if (dryRun) {
    log('DRY-RUN — no network call was made. Nothing was written.');
    return;
  }

  const SUPABASE_URL = req('SUPABASE_URL').replace(/\/$/, '');
  const ANON_KEY = req('SUPABASE_ANON_KEY');
  const REST = `${SUPABASE_URL}/rest/v1`;
  let accessToken = '';

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
      throw new Error(`password grant failed (HTTP ${res.status}). Check ITERA_SMOKE_USERNAME/PASSWORD.`);
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
    const res = await fetch(`${REST}/${table}`, { method: 'POST', headers: headers(true), body: JSON.stringify(row) });
    if (!res.ok) throw new Error(`INSERT ${table} → ${res.status}: ${await res.text()}`);
    return ((await res.json()) as T[])[0];
  }

  async function patch(table: string, filter: string, row: Json): Promise<void> {
    const res = await fetch(`${REST}/${table}?${filter}`, { method: 'PATCH', headers: headers(true), body: JSON.stringify(row) });
    if (!res.ok) throw new Error(`PATCH ${table} → ${res.status}: ${await res.text()}`);
  }

  /** Upload one local file to the `lesson-media` bucket, at the SAME relative path. */
  async function uploadMedia(check: MediaCheck): Promise<string> {
    const bucketPath = check.localPath.replace(/^\/lesson-media\//, '');
    const bytes = readFileSync(check.absPath);
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/lesson-media/${bucketPath}`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': check.mime as string,
        'x-upsert': 'true',
      },
      body: bytes,
    });
    if (!res.ok) throw new Error(`upload ${check.localPath} → ${res.status}: ${await res.text()}`);
    return `${SUPABASE_URL}/storage/v1/object/public/lesson-media/${bucketPath}`;
  }

  interface TenantRow {
    id: string;
    slug: string;
  }
  interface ProgramRow {
    id: string;
    slug: string;
    title_i18n: I18n;
    is_catalog: boolean;
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

  await login();
  log('authenticated (password grant, user-JWT — no service_role)');

  const tenants = await get<TenantRow>(`tenants?slug=eq.${tenant}&select=id,slug`);
  if (!tenants.length) {
    console.error(`ERROR: tenant '${tenant}' not found. This seed never creates a tenant.`);
    process.exit(1);
  }
  const tenantRow = tenants[0];

  log(`uploading ${media.length} media file(s)`);
  const urlMap = new Map<string, string>();
  for (const m of media) {
    const url = await uploadMedia(m);
    urlMap.set(m.localPath, url);
    log(`  ${m.localPath} → ${url}`);
  }

  const program = rewriteLessonMediaUrls(fixture.program, urlMap);

  const foundPrograms = await get<ProgramRow>(
    `programs?tenant_id=eq.${tenantRow.id}&slug=eq.${program.slug}&select=id,slug,title_i18n,is_catalog`
  );
  let programRow: ProgramRow;
  if (foundPrograms.length) {
    programRow = foundPrograms[0];
    const patchBody: Json = {};
    if (!same(programRow.title_i18n, program.title_i18n)) patchBody.title_i18n = program.title_i18n;
    if (catalog && !programRow.is_catalog) patchBody.is_catalog = true;
    if (Object.keys(patchBody).length) {
      await patch('programs', `id=eq.${programRow.id}`, patchBody);
      log(`updated program ${program.slug}`);
      programRow = { ...programRow, ...patchBody } as ProgramRow;
    } else {
      log(`program ${program.slug} already matches (id ${programRow.id})`);
    }
  } else {
    programRow = await insert<ProgramRow>('programs', {
      tenant_id: tenantRow.id,
      slug: program.slug,
      title_i18n: program.title_i18n,
      ...(catalog ? { is_catalog: true } : {}),
    });
    log(`created program ${program.slug} (id ${programRow.id})`);
  }

  let unitCount = 0;
  let lessonCount = 0;
  let activityCount = 0;

  for (const wantUnit of program.units) {
    const foundUnits = await get<UnitRow>(
      `units?program_id=eq.${programRow.id}&ordinal=eq.${wantUnit.ordinal}&select=id,ordinal,title_i18n`
    );
    let unitRow: UnitRow;
    if (foundUnits.length) {
      unitRow = foundUnits[0];
      if (!same(unitRow.title_i18n, wantUnit.title_i18n)) {
        await patch('units', `id=eq.${unitRow.id}`, { title_i18n: wantUnit.title_i18n });
        log(`retitled unit ordinal ${wantUnit.ordinal}`);
      }
    } else {
      unitRow = await insert<UnitRow>('units', {
        program_id: programRow.id,
        ordinal: wantUnit.ordinal,
        title_i18n: wantUnit.title_i18n,
      });
      log(`created unit ordinal ${wantUnit.ordinal} (id ${unitRow.id})`);
    }
    unitCount += 1;

    for (const wantLesson of wantUnit.lessons) {
      const foundLessons = await get<LessonRow>(
        `lessons?unit_id=eq.${unitRow.id}&ordinal=eq.${wantLesson.ordinal}&select=id,ordinal,title_i18n`
      );
      let lessonRow: LessonRow;
      if (foundLessons.length) {
        lessonRow = foundLessons[0];
        if (!same(lessonRow.title_i18n, wantLesson.title_i18n)) {
          await patch('lessons', `id=eq.${lessonRow.id}`, { title_i18n: wantLesson.title_i18n });
          log(`retitled lesson '${wantLesson.key}'`);
        }
      } else {
        lessonRow = await insert<LessonRow>('lessons', {
          unit_id: unitRow.id,
          ordinal: wantLesson.ordinal,
          title_i18n: wantLesson.title_i18n,
        });
        log(`created lesson '${wantLesson.key}' (id ${lessonRow.id})`);
      }
      lessonCount += 1;

      for (const wantActivity of wantLesson.activities) {
        const foundActivities = await get<ActivityRow>(
          `activities?lesson_id=eq.${lessonRow.id}&ordinal=eq.${wantActivity.ordinal}&select=id,ordinal,kind,status,spec,rubric`
        );
        const payload: Json = {
          kind: wantActivity.kind,
          status: wantActivity.status,
          spec: wantActivity.spec,
          rubric: wantActivity.rubric,
        };
        if (foundActivities.length) {
          const row = foundActivities[0];
          const drifted =
            row.kind !== wantActivity.kind ||
            row.status !== wantActivity.status ||
            !same(row.spec, wantActivity.spec) ||
            !same(row.rubric, wantActivity.rubric);
          if (drifted) {
            await patch('activities', `id=eq.${row.id}`, payload);
            log(`rewrote activity ordinal ${wantActivity.ordinal} (${wantActivity.kind}) to match the fixture`);
          }
        } else {
          const created = await insert<ActivityRow>('activities', {
            lesson_id: lessonRow.id,
            ordinal: wantActivity.ordinal,
            ...payload,
          });
          log(`created activity ordinal ${wantActivity.ordinal} (${wantActivity.kind}, id ${created.id})`);
        }
        activityCount += 1;
      }
    }
  }

  log(`done — program '${program.slug}', ${unitCount} unit(s), ${lessonCount} lesson(s), ${activityCount} activity(ies).`);
}

// Run only when invoked as a script (`tsx db/seeds/program-fixture.ts`), never
// on import — `program-fixture.test.ts` imports the pure helpers above and
// must not trigger a real run (argv parsing, `process.exit`, network calls).
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) {
  main().catch((err: unknown) => {
    console.error('[program-seed] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
