/**
 * `/program/:slug` for a program the learner CANNOT see — DFL-006A7.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS SUITE EXISTS, AND WHY A STATUS CHECK WOULD NOT CATCH THE BUG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The route always returned HTTP 200 and always rendered the nav bar. The
 * failure was INSIDE `<main>`: it rendered nothing at all — no error, no empty
 * state, no redirect. A smoke test that asserts "the page returns 200", or even
 * "the page has a header", passes against the broken build. So every assertion
 * here is written against the RENDERED CONTENT of `<main>`, never the status.
 *
 * The load-bearing assertion is `mainText.length > 0`. It is deliberately the
 * weakest possible statement of the bug, so it stays true no matter how the
 * empty state is redesigned later, and stays FALSE the moment `<main>` goes
 * blank again.
 *
 * ── The two shapes of the bug, both covered ────────────────────────────────
 *
 * 1. The learner is NOT enrolled. RLS hides the program row, PostgREST answers
 *    an empty result with HTTP 200, `getProgramBySlug` throws
 *    `ProgramNotFoundError`. Measured on the live Itera DB on 2026-08-13:
 *    `programs?slug=eq.fundamentos-web` returns `[]` for `aluno1`, `aluno2` and
 *    `prof`, and one row for the tenant_admin smoke user.
 * 2. The route param is absent. The query stays disabled, so it is
 *    PERMANENTLY `isPending` — the skeleton would never resolve.
 *
 * Both used to end in a `<main>` with zero text: (1) sat ~7s on a
 * text-free shimmer (three React Query retries of a permanent failure) and then
 * offered a `Retry` button that could never succeed; (2) sat on it forever.
 *
 * ── Substrate ──────────────────────────────────────────────────────────────
 *
 * Hermetic, like `activity-baseline.spec.ts`: `vite preview` of THIS tree with
 * a stub Supabase origin (`http://stub.supabase.invalid`, a reserved TLD that
 * can never resolve), every request intercepted by Playwright. No credential,
 * no DB, no live deploy — so it BLOCKS every PR instead of skipping.
 * `e2e/route-access-matrix.spec.ts` covers the neighbouring question (who may
 * reach the staff routes) but needs real logins, so it cannot block a PR.
 */
import { test, expect, type Page } from '@playwright/test';
import { seedSession, STUB_SUPABASE_URL } from './support/harnessStub';

const SLUG = 'fundamentos-web';

/**
 * The stub origin for a learner who can reach the app but cannot see this
 * program.
 *
 * `programs` answers PostgREST's empty-200 with an EMPTY BODY, which is what
 * `.maybeSingle()` turns into `data === null` — the same reply the real server
 * gives when RLS filters every row. That is the whole point: the client cannot
 * distinguish "hidden" from "absent", and the fix must not pretend it can.
 *
 * Everything else answers `[]`:
 *  - `my_subscription` → no row → entitlement inactive. The seeded session's
 *    `created_at` (2026-01-01) predates the subscription gate date, so
 *    `<RequireSubscription>` grandfathers the user through instead of bouncing
 *    to `/subscribe`. That keeps this suite about the program route.
 *  - `memberships` → `[]` → a learner with no staff role, which is exactly the
 *    persona that hits this bug.
 */
async function installNotEnrolledStub(page: Page): Promise<void> {
  await page.route(`${STUB_SUPABASE_URL}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.startsWith('/auth/v1/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: '{}',
      });
    }

    // `.maybeSingle()` sends `Accept: application/vnd.pgrst.object+json`. An
    // empty body is the empty-200 that becomes `data: null` — NOT an error.
    if (path.endsWith('/programs')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: '',
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: '[]',
    });
  });
}

/** The visible text inside `<main>`, once the page has settled. */
async function mainText(page: Page): Promise<string> {
  const main = page.locator('main');
  await expect(main).toHaveCount(1);
  // Long enough to outlast the OLD behaviour's ~7s of React Query retries, so a
  // regression cannot pass this test by being slow.
  await expect
    .poll(async () => (await main.innerText()).trim().length, { timeout: 20_000 })
    .toBeGreaterThan(0);
  return (await main.innerText()).trim();
}

test.describe('/program/:slug — the learner cannot see this program', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page);
    await installNotEnrolledStub(page);
  });

  test('renders an explicit state, never an empty <main>', async ({ page }) => {
    await page.goto(`/program/${SLUG}`);

    // (1) The bug itself, stated as weakly as it can be stated. This line fails
    //     against the pre-fix build.
    const text = await mainText(page);
    expect(text.length).toBeGreaterThan(0);

    // (2) The state is the DELIBERATE one, not an accident of some other branch.
    await expect(page.getByTestId('program-unavailable')).toBeVisible();

    // (3) It stays. A skeleton that resolves later would still be a blank page
    //     for the learner who arrived and left.
    await page.waitForTimeout(1_000);
    await expect(page.getByTestId('program-unavailable')).toBeVisible();
    expect((await page.locator('main').innerText()).trim().length).toBeGreaterThan(0);

    // (4) The route did NOT silently redirect. The fix is a rendered state on
    //     the same URL, so a wrong-but-green "redirect to /" cannot pass.
    expect(new URL(page.url()).pathname).toBe(`/program/${SLUG}`);
  });

  test('offers a way forward instead of a Retry that can never succeed', async ({ page }) => {
    await page.goto(`/program/${SLUG}`);
    await mainText(page);

    // Enrolment happens in the catalog, so that is the exit this screen owes
    // the learner. A `Retry` button here re-runs a read that RLS will refuse
    // again, forever.
    const catalog = page.getByTestId('program-unavailable-catalog');
    await expect(catalog).toBeVisible();
    await catalog.click();
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
      .toBe('/catalog');
  });

  test('the copy names BOTH causes — absent and not-enrolled', async ({ page }) => {
    await page.goto(`/program/${SLUG}`);
    const text = await mainText(page);

    // The client cannot tell the two apart (PostgREST answers both with an
    // empty result), so the screen must not claim only one of them. Asserted on
    // the rendered string in whichever locale the browser picked, because the
    // dictionary carries both.
    expect(text).toMatch(/matricul|enroll/i);
    expect(text).toMatch(/não existe|does not exist/i);
  });
});
