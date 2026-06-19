#!/usr/bin/env -S npx tsx
/**
 * Fellowship → Itera pilot seed (plan #7, 20260619-itera-fellowship-e2e-integration).
 *
 * Federates a small cohort of DFL fellows into the EXISTING `dfl-batch` Itera
 * tenant (migrations 0006/0007 already applied to the live Itera DB). For each
 * fellow it:
 *   1. Creates an Itera Supabase auth user (admin API, email_confirm=true) —
 *      idempotent (re-create of an existing email is a no-op).
 *   2. Upserts itera.users(email, display_name, locale, dfl_subject=<DFL uid>).
 *   3. Links itera.identities(provider='dfl', provider_subject=<itera_auth_uid>)
 *      — provider_subject is the ITERA auth uid so the RLS helper
 *      itera.current_itera_user_id() resolves auth.uid()::text. The DFL uid
 *      lives opaquely in itera.users.dfl_subject (ADR-4, NOT an FK).
 *   4. Ensures itera.memberships(tenant='dfl-batch', role='learner').
 *
 * Source of fellows (READ-ONLY for DFL):
 *   - If DFL_SUPABASE_URL + DFL_SUPABASE_SERVICE_ROLE_KEY are present, SELECT a
 *     small pilot set from DFL prod (auth.users.id AS dfl_subject, email, name).
 *     [Gated — only runs when creds present; this script NEVER writes DFL prod.]
 *   - Otherwise fall back to db/seeds/fellowship-pilot.fixture.json (CLAUDE_SMOKE
 *     fellow + placeholders, N>=1). The real cohort-seed task may not have run.
 *
 * E3 join (DFL-side lms.milestones.external_ref): capability-gated. dfl-schema
 * #527 (the external_ref column) is HUMAN-GATE and may be UNMERGED — this seed
 * NEVER writes DFL prod, so it always SKIPS the E3 write with a logged reason.
 * (The E3 population belongs to a DFL-side migration, not this Itera seed.)
 *
 * Env: ITERA_SUPABASE_URL, ITERA_SUPABASE_SERVICE_ROLE_KEY, ITERA_DB_URL
 *      (+ PGPASSWORD if not embedded in the URL).
 *      Optional: DFL_SUPABASE_URL, DFL_SUPABASE_SERVICE_ROLE_KEY (DFL read).
 *
 * Usage:
 *   npm run seed:fellowship-pilot            # apply
 *   npm run seed:fellowship-pilot -- --dry-run   # plan only, no writes
 *
 * Idempotent: re-run = no-op (unique constraints + ON CONFLICT).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const TENANT_SLUG = 'dfl-batch';
const DRY_RUN = process.argv.includes('--dry-run');

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Fellow {
  email: string;
  display_name: string;
  locale: string;
  dfl_subject: string;
}

function req(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`ERROR: env ${name} is required.`);
    process.exit(1);
  }
  return v;
}

function prefix(s: string, n = 6): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

/** Run a SQL statement via psql against ITERA_DB_URL. Returns trimmed stdout. */
function psql(sql: string): string {
  const dbUrl = req('ITERA_DB_URL');
  const res = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-tAc', sql], {
    encoding: 'utf-8',
  });
  if (res.status !== 0) {
    throw new Error(`psql failed: ${res.stderr || res.stdout}`);
  }
  return (res.stdout || '').trim();
}

/** Escape a string for single-quoted SQL literals. */
function lit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * Load the pilot cohort: DFL prod SELECT when creds present, else the fixture.
 * NEVER writes DFL prod — read-only.
 */
async function loadFellows(): Promise<{ fellows: Fellow[]; source: string }> {
  const dflUrl = process.env.DFL_SUPABASE_URL;
  const dflKey = process.env.DFL_SUPABASE_SERVICE_ROLE_KEY;

  if (dflUrl && dflKey) {
    // READ-ONLY DFL pilot lookup. Resolve the CLAUDE_SMOKE fellow (and any
    // additional pilot emails listed in PILOT_EMAILS, comma-separated) via the
    // DFL auth admin API — a plain GET, no writes. Falls through to the fixture
    // on any failure.
    try {
      const wanted = (
        process.env.PILOT_EMAILS ||
        process.env.CLAUDE_SMOKE_USERNAME ||
        ''
      )
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      if (wanted.length) {
        const res = await fetch(`${dflUrl}/auth/v1/admin/users?page=1&per_page=200`, {
          headers: { apikey: dflKey, Authorization: `Bearer ${dflKey}` },
        });
        if (res.ok) {
          const body = (await res.json()) as { users?: Array<Record<string, unknown>> };
          const fellows: Fellow[] = (body.users || [])
            .filter((u) => wanted.includes(String(u.email || '').toLowerCase()))
            .map((u) => ({
              email: String(u.email),
              display_name:
                String((u.user_metadata as Record<string, unknown> | undefined)?.name || u.email),
              locale: 'pt',
              dfl_subject: String(u.id), // DFL auth.users.id — opaque (ADR-4)
            }));
          if (fellows.length) {
            return { fellows, source: 'dfl-prod (read-only auth admin lookup)' };
          }
        }
      }
    } catch (err) {
      console.warn(`[seed] DFL read failed, falling back to fixture: ${(err as Error).message}`);
    }
  }

  const fixture = JSON.parse(
    readFileSync(join(__dirname, 'fellowship-pilot.fixture.json'), 'utf-8')
  ) as { fellows: Fellow[] };
  return { fellows: fixture.fellows, source: 'fixture (fellowship-pilot.fixture.json)' };
}

/** Create (idempotently) an Itera Supabase auth user; return its auth uid. */
async function ensureIteraAuthUser(email: string): Promise<string> {
  const url = req('ITERA_SUPABASE_URL');
  const key = req('ITERA_SUPABASE_SERVICE_ROLE_KEY');

  // Create — ignore "already registered".
  await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      email_confirm: true,
      password:
        process.env.ITERA_SEED_DEFAULT_PASSWORD ||
        // random — federated fellows sign in via the embed exchange, not password.
        `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}Aa1!`,
    }),
  }).catch(() => undefined);

  // Resolve the uid (handles both "just created" and "already existed").
  const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const body = (await res.json()) as { users?: Array<{ id: string; email: string }> };
  const match = (body.users || []).find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (!match) throw new Error(`could not resolve Itera auth uid for ${email}`);
  return match.id;
}

async function main() {
  console.log(`[seed] Fellowship → Itera pilot (tenant=${TENANT_SLUG})${DRY_RUN ? ' [DRY-RUN]' : ''}`);

  // Guard: tenant must already exist (0006 applied).
  const tenantId = DRY_RUN
    ? '<dry-run>'
    : psql(`select id from itera.tenants where slug = ${lit(TENANT_SLUG)}`);
  if (!DRY_RUN && !tenantId) {
    console.error(
      `ERROR: tenant '${TENANT_SLUG}' not found. Apply db/migrations/0006_dfl_federation_dfl_batch.sql first.`
    );
    process.exit(1);
  }

  const { fellows, source } = await loadFellows();
  console.log(`[seed] cohort source: ${source} (${fellows.length} fellow(s))`);

  // E3 capability gate — logged, never executed (we never write DFL prod).
  console.log(
    '[seed] E3 (lms.milestones.external_ref) SKIPPED — this seed never writes DFL prod; ' +
      'dfl-schema #527 (external_ref column) is human-gate/UNMERGED. external_ref population ' +
      'belongs to a DFL-side migration, not this Itera seed.'
  );

  for (const f of fellows) {
    if (DRY_RUN) {
      console.log(
        `[seed] would seed ${f.email} (dfl_subject=${prefix(f.dfl_subject, 8)}) → ` +
          `auth user + itera.users + identities(dfl) + memberships(${TENANT_SLUG}/learner)`
      );
      continue;
    }

    const iteraAuthUid = await ensureIteraAuthUser(f.email);

    // Upsert the Itera-local user + opaque dfl_subject, link the dfl identity
    // (keyed on the ITERA auth uid for RLS), and ensure the dfl-batch membership.
    psql(`
      with up_user as (
        insert into itera.users (email, display_name, locale, dfl_subject)
        values (${lit(f.email)}, ${lit(f.display_name)}, ${lit(f.locale)}, ${lit(f.dfl_subject)})
        on conflict (email) do update
          set display_name = excluded.display_name,
              dfl_subject  = coalesce(itera.users.dfl_subject, excluded.dfl_subject)
        returning id
      ),
      uid as (select id from up_user union all select id from itera.users where email = ${lit(f.email)} limit 1),
      ins_identity as (
        insert into itera.identities (user_id, provider, provider_subject)
        select id, 'dfl', ${lit(iteraAuthUid)} from uid
        on conflict (provider, provider_subject) do nothing
        returning 1
      )
      insert into itera.memberships (user_id, tenant_id, role)
      select uid.id, t.id, 'learner'
      from uid, itera.tenants t
      where t.slug = ${lit(TENANT_SLUG)}
      on conflict (user_id, tenant_id) do nothing;
    `);

    console.log(
      `[seed] ✓ ${f.email} → itera auth uid ${prefix(iteraAuthUid, 8)}, ` +
        `dfl identity linked, member of ${TENANT_SLUG}`
    );
  }

  console.log(`[seed] done — ${fellows.length} fellow(s) ${DRY_RUN ? 'planned' : 'seeded'}.`);
}

main().catch((err) => {
  console.error('[seed] FAILED:', err.message || err);
  process.exit(1);
});
