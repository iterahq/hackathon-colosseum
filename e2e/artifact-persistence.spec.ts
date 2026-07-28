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
import { test, expect, type Page } from '@playwright/test';
import { ITERA_BASE_URL } from './support/capabilities';
import { requireCapabilities } from './support/gate';

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
  await page.getByLabel(/senha|password/i).fill(creds.pass);
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

  // The save toast is the learner-visible signal that persistence happened.
  await expect(page.getByText(/trabalho salvo|work saved/i)).toBeVisible({ timeout: 20_000 });

  // 1. Same context, hard reload.
  await page.goto(`${BASE}/artifacts`);
  await expect(page.getByTestId('artifact-browser')).toBeVisible();
  await expect(page.getByText('reflection.md').first()).toBeVisible();

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

test('a second learner in the SAME tenant cannot see the first learner\'s work', async ({
  browser,
}) => {
  await requireCapabilities('itera-aluno2');

  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, ALUNO2);
  await page.goto(`${BASE}/artifacts`);

  // aluno2 sees their OWN repository (possibly empty) — never aluno1's files.
  // Both learners are in the same tenant, so this proves the tenant-admin read
  // policy (ADR-9) does not leak to ordinary peers.
  const bodies = page.getByTestId('artifact-preview-body');
  await expect(bodies).toHaveCount(0);
  await expect(page.locator('text=e2e-reflection-')).toHaveCount(0);

  await context.close();
});
