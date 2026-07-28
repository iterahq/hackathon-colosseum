/**
 * E2E — who can reach the staff surfaces, proven against a REAL running app.
 *
 * Written for the /admin + /author code-splitting change: converting those
 * routes to `React.lazy` must not move a single access boundary. Unit tests
 * pin the guard composition; this pins the deployed behaviour end-to-end,
 * including the async chunk fetch that only exists in a real build.
 *
 * ## The matrix
 *
 * Three identities with genuinely different roles (verified in itera.memberships):
 *
 *   smoke   — tenant_admin  → /admin ALLOW · /admin/artifacts ALLOW · /author ALLOW
 *   prof    — instructor    → /admin DENY  · /admin/artifacts DENY  · /author ALLOW
 *   aluno1  — learner       → /admin DENY  · /admin/artifacts DENY  · /author DENY
 *
 * `prof` is what makes this matrix worth running: `canAuthor()` accepts
 * instructor, and an instructor is NOT a tenant_admin — so `prof` exercises the
 * `author` gate in ISOLATION. With only the tenant_admin smoke user (which
 * satisfies both gates) an /author pass would prove nothing about the author
 * role itself.
 *
 * `/artifacts` (the learner surface `/admin/artifacts` shares its ArtifactBrowser
 * with) is asserted NOT to be role-blocked. It is RequireAuth + RequireSubscription,
 * so a learner without an active plan legitimately lands on /subscribe — that is
 * the PLG gate, not a role regression, and the assertion allows for it.
 *
 * Capability-probes and test.skip()s when the substrate is absent, matching the
 * convention of the sibling specs here.
 *
 * Run:
 *   ITERA_BASE_URL=http://localhost:4173 \
 *   ITERA_SMOKE_USERNAME=… ITERA_SMOKE_PASSWORD=… \
 *   ITERA_E2E_PROF_USERNAME=… ITERA_E2E_PROF_PASSWORD=… \
 *   ITERA_E2E_ALUNO1_USERNAME=… ITERA_E2E_ALUNO1_PASSWORD=… \
 *   npx playwright test e2e/route-access-matrix.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.ITERA_BASE_URL ?? '';

const IDENTITIES = {
  smoke: {
    label: 'tenant_admin (itera-smoke)',
    user: process.env.ITERA_SMOKE_USERNAME ?? '',
    pass: process.env.ITERA_SMOKE_PASSWORD ?? '',
  },
  prof: {
    label: 'instructor (claude-e2e-prof)',
    user: process.env.ITERA_E2E_PROF_USERNAME ?? '',
    pass: process.env.ITERA_E2E_PROF_PASSWORD ?? '',
  },
  aluno1: {
    label: 'learner (claude-e2e-aluno1)',
    user: process.env.ITERA_E2E_ALUNO1_USERNAME ?? '',
    pass: process.env.ITERA_E2E_ALUNO1_PASSWORD ?? '',
  },
} as const;

type IdentityKey = keyof typeof IDENTITIES;

const SHOT_DIR = process.env.ITERA_SHOT_DIR ?? '';

async function login(page: Page, id: IdentityKey) {
  const { user, pass } = IDENTITIES[id];
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/e-?mail/i).fill(user);
  await page.getByLabel(/senha|password/i).fill(pass);
  // testid, not the accessible name: "Entrar" also matches the "Entrar com DFL"
  // federated-IdP button, which is a different flow entirely.
  await page.getByTestId('submit-login').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45_000 });
}

/** Navigate and let the guards + any lazy chunk settle, then report where we ended. */
async function landOn(page: Page, path: string): Promise<string> {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle').catch(() => {});
  // The guards render "Loading…" while auth/membership resolve; wait it out.
  await expect(page.getByText(/^Loading…$/)).toHaveCount(0, { timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(700);
  return new URL(page.url()).pathname;
}

async function shoot(page: Page, name: string) {
  if (!SHOT_DIR) return;
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });
}

function ready(id: IdentityKey) {
  return Boolean(BASE && IDENTITIES[id].user && IDENTITIES[id].pass);
}

test.describe('route access matrix — /admin, /admin/artifacts, /author, /artifacts', () => {
  test('tenant_admin reaches every staff surface', async ({ page }) => {
    test.skip(!ready('smoke'), 'ITERA_BASE_URL / ITERA_SMOKE_* not set.');
    await login(page, 'smoke');

    expect(await landOn(page, '/admin')).toMatch(/^\/admin/);
    await shoot(page, 'smoke-admin');

    expect(await landOn(page, '/admin/artifacts')).toBe('/admin/artifacts');
    await shoot(page, 'smoke-admin-artifacts');

    expect(await landOn(page, '/author')).toBe('/author');
    await shoot(page, 'smoke-author');

    // Learner surface: reachable, and never bounced by a ROLE gate.
    const artifacts = await landOn(page, '/artifacts');
    expect(artifacts).not.toBe('/login');
    await shoot(page, 'smoke-artifacts');
  });

  test('instructor reaches /author but is denied /admin (author gate in isolation)', async ({
    page,
  }) => {
    test.skip(!ready('prof'), 'ITERA_E2E_PROF_* not set.');
    await login(page, 'prof');

    // canAuthor() accepts instructor -> /author must render.
    expect(await landOn(page, '/author')).toBe('/author');
    await shoot(page, 'prof-author');

    // isTenantAdmin() rejects instructor -> /admin must redirect away.
    expect(await landOn(page, '/admin')).not.toMatch(/^\/admin/);
    await shoot(page, 'prof-admin-denied');

    expect(await landOn(page, '/admin/artifacts')).not.toMatch(/^\/admin/);
    await shoot(page, 'prof-admin-artifacts-denied');
  });

  test('learner is denied every staff surface', async ({ page }) => {
    test.skip(!ready('aluno1'), 'ITERA_E2E_ALUNO1_* not set.');
    await login(page, 'aluno1');

    expect(await landOn(page, '/admin')).not.toMatch(/^\/admin/);
    await shoot(page, 'aluno-admin-denied');

    expect(await landOn(page, '/admin/artifacts')).not.toMatch(/^\/admin/);
    await shoot(page, 'aluno-admin-artifacts-denied');

    expect(await landOn(page, '/author')).not.toMatch(/^\/author/);
    await shoot(page, 'aluno-author-denied');

    // The learner's OWN repository stays reachable (or hits the PLG /subscribe
    // gate — never /login, and never a role bounce).
    const artifacts = await landOn(page, '/artifacts');
    expect(artifacts).not.toBe('/login');
    await shoot(page, 'aluno-artifacts');
  });
});
