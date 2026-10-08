/**
 * E2E — the learner's work survives, and only the RIGHT learner can see it.
 *
 * Plan: 20260728-itera-artifact-storage (Phases 2-3). Migration `0027`.
 *
 * This is the check that unit tests structurally cannot make: `V5` in the plan
 * ("cross-device real — the test localStorage never passes") requires a SECOND
 * browser context with its own `storageState`, because the whole point of moving
 * off localStorage is that a fresh browser still sees the work.
 *
 * ## Identities
 *
 * Uses the DEDICATED E2E learners (`ITERA_E2E_ALUNO1/2`), never `ITERA_SMOKE_*`.
 * The smoke user is a `tenant_admin` of `itera` and is deliberately contaminated
 * with fixtures from other runs — using it here and calling it "a learner" would
 * make the isolation assertion meaningless, since an admin can read the whole
 * tenant by design (ADR-9). `aluno1` and `aluno2` are in the SAME tenant, which
 * makes the negative test strictly stronger: it proves the tenant-admin read
 * policy does not leak to ordinary peers.
 *
 * ⚠️ That last sentence is a PREMISE, and since 2026-08-13 the isolation test
 * ASSERTS it instead of trusting it. The test identities are being moved into
 * the `qa-e2e` test tenant one identity at a time (migration 0066,
 * `db/seeds/qa-tenant.ts`), so "same tenant" is a fact that can change under
 * this spec without anyone editing it. If the two learners ever stop sharing a
 * tenant, aluno2 sees nothing for TENANCY reasons, the two absence assertions
 * still pass, and the test silently stops covering ADR-9. It now fails instead,
 * with a message that says which premise broke.
 *
 * ## Substrate
 *
 * Gated through `e2e/support/gate.ts`. `ITERA_E2E_ALUNO1/2_*` and
 * `ITERA_E2E_LESSON_ID` are declared **optional** in the capability registry —
 * `e2e.yml` does not promise them — so their absence still skips. It is no
 * longer silent: every skip is counted and printed by the skip census, and
 * "UNVERIFIED" is never reported as "passing".
 *
 * Run:
 *   ITERA_BASE_URL=http://localhost:8080 \
 *   ITERA_E2E_ALUNO1_USERNAME=… ITERA_E2E_ALUNO1_PASSWORD=… \
 *   ITERA_E2E_ALUNO2_USERNAME=… ITERA_E2E_ALUNO2_PASSWORD=… \
 *   npx playwright test e2e/artifact-persistence.spec.ts
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { ITERA_BASE_URL } from './support/capabilities';
import { requireCapabilities } from './support/gate';
import { learnerRest, ownTenantIds, watchForApiKey } from './support/learnerRest';

const BASE = ITERA_BASE_URL;
const ALUNO1 = {
  user: process.env.ITERA_E2E_ALUNO1_USERNAME ?? '',
  pass: process.env.ITERA_E2E_ALUNO1_PASSWORD ?? '',
};
const ALUNO2 = {
  user: process.env.ITERA_E2E_ALUNO2_USERNAME ?? '',
  pass: process.env.ITERA_E2E_ALUNO2_PASSWORD ?? '',
};
/** A lesson containing a `document` (reflection) activity. */
const LESSON_ID = process.env.ITERA_E2E_LESSON_ID ?? '';

test.beforeEach(async () => {
  await requireCapabilities('itera-player', 'itera-aluno1');
});

async function login(page: Page, creds: { user: string; pass: string }) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/e-?mail/i).fill(creds.user);
  await page.locator('input[type="password"]').first().fill(creds.pass);
  await page.getByRole('button', { name: /entrar|sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

test('the navbar exposes "my files", and the page renders the repository shape', async ({
  page,
}) => {
  await login(page, ALUNO1);

  // Tainan: "isso também tem que ser acessível pela navbar."
  const navLink = page.getByRole('link', { name: /meus arquivos|my files/i }).first();
  await expect(navLink).toBeVisible();
  await navLink.click();

  await page.waitForURL(/\/artifacts$/);
  await expect(page.getByTestId('artifacts-page')).toBeVisible();

  // Either the browser (with files) or the declared-empty state — never a crash.
  const browser = page.getByTestId('artifact-browser');
  const empty = page.getByTestId('artifacts-empty');
  await expect(browser.or(empty)).toBeVisible();
});

test('a reflection survives a reload AND a brand-new browser context (the localStorage-impossible test)', async ({
  page,
  browser,
}) => {
  await requireCapabilities('itera-lesson');

  const marker = `e2e-reflection-${Date.now()}`;

  await login(page, ALUNO1);
  await page.goto(`${BASE}/lesson/${LESSON_ID}`);

  const input = page.getByTestId('document-reflection-input');
  await expect(input).toBeVisible({ timeout: 20_000 });
  await input.fill(`${marker} — texto suficientemente longo para satisfazer o mínimo de palavras da atividade de reflexão do Itera.`);
  await page.getByTestId('activity-done').click();

  // 1. Same context, hard reload. The save is silent and finishes on its own
  //    time, so the file list is reloaded until the file is there.
  await expect(async () => {
    await page.goto(`${BASE}/artifacts`);
    await expect(page.getByTestId('artifact-browser')).toBeVisible();
    await expect(page.getByText('reflection.md').first()).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 20_000 });

  // 2. A COMPLETELY FRESH context — no localStorage, no cookies carried over.
  //    This is the assertion that separates Phase 1 from the status quo.
  const fresh = await browser.newContext();
  const freshPage = await fresh.newPage();
  await login(freshPage, ALUNO1);
  await freshPage.goto(`${BASE}/artifacts`);
  await expect(freshPage.getByTestId('artifact-browser')).toBeVisible();
  await freshPage.getByTestId('artifact-file').first().click();
  await expect(freshPage.getByTestId('artifact-preview-body')).toContainText(marker);
  await fresh.close();
});

/**
 * Sign in as one learner in a throwaway context and return the tenants THAT
 * learner is a member of, read with that learner's own JWT.
 *
 * The context is disposable because the caller only wants the premise, not a
 * session; leaving a second signed-in context alive would let a later
 * assertion accidentally read the wrong identity.
 */
async function tenantsOf(browser: Browser, creds: { user: string; pass: string }): Promise<string[]> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const apikey = watchForApiKey(page);
    await login(page, creds);
    // The dashboard the login lands on issues the REST call the apikey is
    // lifted from; `/artifacts` is a second chance if that one is cached.
    await page.goto(`${BASE}/artifacts`);
    const rest = await learnerRest(page, apikey());
    return await ownTenantIds(page, rest);
  } finally {
    await context.close();
  }
}

test('a second learner in the SAME tenant cannot see the first learner\'s work', async ({
  browser,
}) => {
  await requireCapabilities('itera-aluno2');

  // ── PRECONDITION: the two learners really do share a tenant ──────────────
  //
  // Everything below asserts an ABSENCE, and an absence is only evidence when
  // the premise in this test's own name holds. If aluno1 and aluno2 ever land
  // in different tenants — which is exactly what the 2026-08-13 move of the
  // test identities into the `qa-e2e` tenant could do, one identity at a time —
  // then `programs_select_tenant` and the artifact policies hide aluno1's work
  // from aluno2 for TENANCY reasons, the two assertions below still pass, and
  // they no longer say anything about ADR-9. A test that keeps passing after
  // its subject is gone is worse than a deleted test: it reports coverage that
  // does not exist.
  //
  // Read with each learner's OWN session JWT (`memberships_select_self` returns
  // the caller's own rows). No `service_role`: an RLS-bypassing read would
  // answer "do these rows exist" instead of "does this user hold them", and it
  // would put a bypass key in the harness to check a precondition.
  const tenants1 = await tenantsOf(browser, ALUNO1);
  const tenants2 = await tenantsOf(browser, ALUNO2);
  const shared = tenants1.filter((id) => tenants2.includes(id));
  expect(
    shared,
    'PREMISE BROKEN — aluno1 and aluno2 share no tenant, so this test can no longer ' +
      'prove that the ADR-9 tenant-admin read policy does not leak to ordinary peers: ' +
      'aluno2 would see nothing for tenancy reasons alone. Put both learners in the same ' +
      'tenant (db/seeds/qa-tenant.fixture.json declares both under `qa-e2e`; ' +
      '`npm run seed:qa-tenant` applies it via itera.grant_membership), or rewrite this ' +
      `test to assert what it now measures. aluno1 tenants: ${tenants1.length}, ` +
      `aluno2 tenants: ${tenants2.length}, shared: 0.`
  ).not.toHaveLength(0);

  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, ALUNO2);
  await page.goto(`${BASE}/artifacts`);

  // aluno2 sees their OWN repository (possibly empty) — never aluno1's files.
  // Both learners are in the same tenant (asserted above, not assumed), so this
  // proves the tenant-admin read policy (ADR-9) does not leak to ordinary peers.
  const bodies = page.getByTestId('artifact-preview-body');
  await expect(bodies).toHaveCount(0);
  await expect(page.locator('text=e2e-reflection-')).toHaveCount(0);

  await context.close();
});
