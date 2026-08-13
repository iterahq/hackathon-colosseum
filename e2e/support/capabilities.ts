/**
 * Capability registry — "green has to mean IT RAN AND PASSED, never it didn't run".
 *
 * ## The problem this file exists to kill
 *
 * Every spec in `e2e/` used to `test.skip()` on its own when a prerequisite was
 * missing, and the config header advertised that as a feature ("green-with-skips
 * rather than red"). The consequence is measurable: the daily `e2e.yml` cron has
 * been GREEN for its whole life while executing essentially nothing, because the
 * repo has never had `ITERA_SMOKE_*` or `CLAUDE_SMOKE_*` as Actions secrets. A
 * test that silently skips itself and reports green is worse than no test: it
 * buys false confidence.
 *
 * ## A capability is only allowed to exist while a test needs it
 *
 * The rule cuts both ways. A `required` capability that no spec names is a
 * secret CI must provide for zero assertions — the same false signal in the
 * other direction. When a spec is deleted, its now-orphaned capabilities go
 * with it (2026-08-13: `itera-api`, `learn-app`, `dfl-batch-results` and
 * `dfl-schema-527` left with `itera-fellowship.spec.ts`).
 *
 * ## The rule
 *
 * **If `.github/workflows/e2e.yml` DECLARES an env/secret, CI is supposed to
 * provide it → its absence is a FAILURE (`tier: 'required'`).** Everything the
 * workflow does not declare is foreign/optional substrate (`tier: 'optional'`):
 * it may still skip, but never silently — every skip is counted and printed by
 * the skip-census reporter at the end of every run.
 *
 * Enforcement is switched on by `E2E_REQUIRE_CAPABILITIES=1`, which the workflow
 * sets. A developer running `npm run e2e` locally without credentials keeps the
 * old skip behaviour and is not blocked.
 *
 * ## Where the failure surfaces
 *
 * ONE crisp place: `e2e/preflight.spec.ts`. It fails once, listing exactly which
 * secrets/substrates are missing and what to do about each — instead of N
 * scattered per-spec failures. The individual specs keep skipping so the report
 * still shows precisely which tests did not run and why.
 *
 * Never print a credential VALUE — only names, and only presence/absence.
 */

/** Enforcement switch. Set by `.github/workflows/e2e.yml`; off locally. */
export const ENFORCING = process.env.E2E_REQUIRE_CAPABILITIES === '1';

export type Tier = 'required' | 'optional';

export interface Capability {
  tier: Tier;
  /** Env vars that must ALL be non-empty. Presence only — values never read out. */
  env?: string[];
  /** Substrate reachability probe. Runs at most once per process. */
  probe?: () => Promise<boolean>;
  /** One line: what stops being tested when this is absent. */
  unlocks: string;
  /** Actionable remedy. NEVER contains a value. */
  remedy: string;
}

const url = (name: string, fallback: string) => (process.env[name] || fallback).replace(/\/$/, '');

/** HEAD/GET probe that never throws. */
async function reachable(target: string): Promise<boolean> {
  try {
    const res = await fetch(target, { redirect: 'follow' });
    return res.ok;
  } catch {
    return false;
  }
}

export const ITERA_BASE_URL = url('ITERA_BASE_URL', 'https://app.iterahq.dev');

/**
 * `ITERA_PLAYER_URL` historically defaulted to `http://127.0.0.1:8081` in three
 * specs, which is a developer's local `vite preview` — never reachable on the
 * cron runner. Falling back to `ITERA_BASE_URL` is what makes those specs
 * capable of running in CI at all.
 */
export const ITERA_PLAYER_URL = url('ITERA_PLAYER_URL', ITERA_BASE_URL);

export const CAPABILITIES = {
  // ── required: the workflow declares these, so CI must provide them ─────────
  'itera-player': {
    tier: 'required',
    probe: () => reachable(`${ITERA_BASE_URL}/login`),
    unlocks: 'every spec that drives app.iterahq.dev',
    remedy: `The Itera player at ${ITERA_BASE_URL} did not answer 2xx on /login. Check the Dokploy app \`itera-player\` before re-running.`,
  },
  'itera-smoke': {
    tier: 'required',
    env: ['ITERA_SMOKE_USERNAME', 'ITERA_SMOKE_PASSWORD'],
    unlocks:
      'author-activity-kinds (12 kinds), route-access-matrix (tenant_admin row), the responsive learner shell and the live-sidebar breakpoint contract',
    remedy:
      'Add repo Actions secrets ITERA_SMOKE_USERNAME + ITERA_SMOKE_PASSWORD (the itera-smoke identity; values live in Infisical /shared, NEVER in the repo). A blocking question is open with Tainan on plan 20260728-itera-activity-testing — this red clears the moment it is answered.',
  },
  // `itera-api`, `learn-app` and `dfl-batch-results` used to live here. They
  // unlocked ONE spec — `itera-fellowship.spec.ts` — and that spec is gone
  // (see e2e/README.md, "What is NOT covered"). A `required` capability that
  // unlocks nothing is a secret CI must provide for zero assertions, so they
  // were removed with the spec instead of being left behind.
  'claude-smoke': {
    tier: 'required',
    env: ['CLAUDE_SMOKE_USERNAME', 'CLAUDE_SMOKE_PASSWORD'],
    unlocks: 'the lesson-unlock spec',
    remedy:
      'Add the repo Actions secrets CLAUDE_SMOKE_USERNAME + CLAUDE_SMOKE_PASSWORD.',
  },

  // ── optional: foreign / dedicated substrate the workflow does NOT declare ──
  'itera-prof': {
    tier: 'optional',
    env: ['ITERA_E2E_PROF_USERNAME', 'ITERA_E2E_PROF_PASSWORD'],
    unlocks: 'the instructor row of the route-access matrix and the routed live-session spec',
    remedy: 'Dedicated instructor identity. Provision ITERA_E2E_PROF_* to cover the instructor role in isolation.',
  },
  'itera-aluno1': {
    tier: 'optional',
    env: ['ITERA_E2E_ALUNO1_USERNAME', 'ITERA_E2E_ALUNO1_PASSWORD'],
    unlocks: 'the learner row of the route-access matrix, artifact persistence, the student join',
    remedy: 'Dedicated clean-learner identity. Provision ITERA_E2E_ALUNO1_* — the smoke user is a tenant_admin and cannot stand in for a learner.',
  },
  'itera-aluno2': {
    tier: 'optional',
    env: ['ITERA_E2E_ALUNO2_USERNAME', 'ITERA_E2E_ALUNO2_PASSWORD'],
    unlocks: 'the cross-learner artifact isolation assertion',
    remedy: 'Second learner in the SAME tenant. Provision ITERA_E2E_ALUNO2_*.',
  },
  'itera-lesson': {
    tier: 'optional',
    env: ['ITERA_E2E_LESSON_ID'],
    unlocks: 'the reflection-survives-a-fresh-context artifact test',
    remedy:
      'Pin a lesson containing a `document` (reflection) activity via ITERA_E2E_LESSON_ID. ' +
      'Run `npm run seed:qa-tenant`: it builds that lesson in the `qa-e2e` test tenant from ' +
      'db/seeds/qa-tenant.fixture.json and prints the id. Do NOT pin a dfl-batch lesson — ' +
      'the specs that consume this pin write learner rows, and dfl-batch is the real cohort.',
  },
  'byoc-activity': {
    tier: 'optional',
    env: ['ITERA_BYOC_ACTIVITY_ID'],
    unlocks: 'the BYOC live responder+judge comparison spec',
    remedy: 'Pin the BYOC sandbox_scenario activity id via ITERA_BYOC_ACTIVITY_ID.',
  },
  // `dfl-schema-527` used to sit here. It gated ONE test inside
  // `itera-fellowship.spec.ts` (the E3/Gantt join on
  // `lms.milestones.external_ref`) and existed only to keep an unconditional
  // skip visible in the census. The spec is deleted, so the entry gated
  // nothing. The dependency it named is still unmerged; e2e/README.md records
  // it, which is where a gap belongs once no test carries it.
} as const satisfies Record<string, Capability>;

export type CapabilityName = keyof typeof CAPABILITIES;

const probeCache = new Map<CapabilityName, Promise<boolean>>();

function envPresent(cap: Capability): boolean {
  return (cap.env ?? []).every((name) => Boolean(process.env[name]));
}

/** Presence of a capability. Probes are memoised per process. */
export async function isPresent(name: CapabilityName): Promise<boolean> {
  const cap: Capability = CAPABILITIES[name];
  if (!envPresent(cap)) return false;
  if (!cap.probe) return true;
  let p = probeCache.get(name);
  if (!p) {
    p = cap.probe();
    probeCache.set(name, p);
  }
  return p;
}

export interface CapabilityStatus {
  name: CapabilityName;
  tier: Tier;
  present: boolean;
  /** Which env vars are missing (names only, never values). */
  missingEnv: string[];
  /** True when the env is complete but the substrate probe failed. */
  probeFailed: boolean;
}

export async function auditCapabilities(): Promise<CapabilityStatus[]> {
  const names = Object.keys(CAPABILITIES) as CapabilityName[];
  return Promise.all(
    names.map(async (name) => {
      const cap: Capability = CAPABILITIES[name];
      const missingEnv = (cap.env ?? []).filter((e) => !process.env[e]);
      const present = await isPresent(name);
      return {
        name,
        tier: cap.tier,
        present,
        missingEnv,
        probeFailed: missingEnv.length === 0 && !present,
      };
    })
  );
}

/** Human-readable, value-free explanation of why a capability is absent. */
export function explain(status: CapabilityStatus): string {
  const cap: Capability = CAPABILITIES[status.name];
  const cause = status.missingEnv.length
    ? `missing env: ${status.missingEnv.join(', ')}`
    : 'substrate probe failed';
  return `[${status.tier}] ${status.name} — ${cause}\n    blocks: ${cap.unlocks}\n    fix:    ${cap.remedy}`;
}
