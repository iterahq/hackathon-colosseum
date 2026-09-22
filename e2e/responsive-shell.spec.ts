/**
 * E2E — responsiveness, made machine-verifiable.
 *
 * Origin: Tainan, 2026-07-28 — *"inclui então essa verificação no plano de testes
 * e implementa já"*, after being told that responsiveness was not verifiable by
 * machine today. His reference point, quoted: the sidebar is *"a referência de
 * responsividade em celular e tablet"*.
 *
 * ## Where this runs — ADR-3, binding
 *
 * `.github/workflows/e2e.yml` ONLY (workflow_dispatch + daily 06:00 UTC cron).
 * **Never `ci.yml`.** Adding viewports is not a licence to move Playwright into
 * the per-PR gate.
 *
 * ## The three viewports, and why these three
 *
 * Every test here is tagged `@responsive`, which is exactly the set the `mobile`
 * and `tablet` projects run (see `playwright.config.ts`). The rest of the suite
 * stays desktop-only — instructor/route-semantics specs learn nothing from a
 * second viewport and tripling a suite that needs live apps costs real money and
 * real flakiness.
 *
 * The three widths land in three DIFFERENT Tailwind buckets, which is the whole
 * point: 393 (< sm) · 810 (>= md, < lg) · 1280 (>= lg). The app's layout flips at
 * `lg`, so 810 is the informative tablet width — a 1024+ tablet would just be a
 * second desktop.
 *
 * ## What these assertions do NOT catch
 *
 * Typography/scale regressions, anything pixel-level, scroll/gesture behaviour,
 * and the activity state matrix. This is T3: rare and coarse by design.
 */
import { test, expect, type Page } from '@playwright/test';
import { ITERA_BASE_URL } from './support/capabilities';
import { requireCapabilities, skipBlocked } from './support/gate';
import {
  BREAKPOINTS,
  expectHitTarget,
  expectNoHorizontalOverflow,
  expectSidebarBreakpointContract,
  expectWithinViewport,
  isBelowLg,
} from './support/responsive';

const SMOKE_USER = () => process.env.ITERA_SMOKE_USERNAME ?? '';
const SMOKE_PASS = () => process.env.ITERA_SMOKE_PASSWORD ?? '';

async function login(page: Page) {
  await page.goto(`${ITERA_BASE_URL}/login`);
  await page.getByTestId('email-input').fill(SMOKE_USER());
  await page.getByTestId('password-input').fill(SMOKE_PASS());
  // testid, not the accessible name: "Entrar" also matches the federated
  // "Entrar com DFL" button, which is a different flow entirely.
  await page.getByTestId('submit-login').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45_000 });
}

/** Let the guards + any lazily-loaded chunk settle (PR #196). */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await expect(page.getByText(/^Loading…$/)).toHaveCount(0, { timeout: 45_000 }).catch(() => {});
}

test.describe('responsive shell', { tag: '@responsive' }, () => {
  /**
   * The credential-free case. It needs nothing but a reachable player, so it
   * runs on EVERY scheduled run at all three viewports — which is what makes
   * "the responsive machinery actually executes" a checkable claim rather than
   * an assertion about secrets we do not have yet.
   */
  test('login — no horizontal scroll, and the primary affordance is thumb-sized', async ({ page }) => {
    await requireCapabilities('itera-player');

    await page.goto(`${ITERA_BASE_URL}/login`);
    await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 30_000 });

    const width = page.viewportSize()!.width;
    await expectNoHorizontalOverflow(page, `login @${width}px`);

    const submit = page.getByTestId('submit-login');
    await expectHitTarget(submit, `login submit @${width}px`);
    await expectWithinViewport(submit, `login submit @${width}px`);

    for (const id of ['email-input', 'password-input']) {
      await expectWithinViewport(page.getByTestId(id), `${id} @${width}px`);
    }

    // The federated-IdP button is the other primary affordance on this screen.
    const oauth = page.getByTestId('oauth-dfl');
    if (await oauth.count()) await expectHitTarget(oauth, `DFL sign-in @${width}px`);
  });

  test('learner shell — home, catalog and the file repository fit the viewport', async ({ page }) => {
    await requireCapabilities('itera-player', 'itera-smoke');
    test.setTimeout(180_000);

    await login(page);
    const width = page.viewportSize()!.width;

    for (const [path, anchor] of [
      ['/', 'programs-grid'],
      ['/catalog', 'catalog-grid'],
      ['/artifacts', 'artifacts-page'],
    ] as const) {
      await page.goto(`${ITERA_BASE_URL}${path}`);
      await settle(page);
      // The anchor may legitimately be an empty state on a fresh tenant; what
      // matters for THIS tier is that whatever rendered fits the screen.
      await page.getByTestId(anchor).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
      await expectNoHorizontalOverflow(page, `${path} @${width}px`);
    }
  });

  /**
   * The anchor case Tainan named.
   *
   * Reaching a live sidebar means having a live class, so this test starts one
   * and ALWAYS ends it (`finally`). Precedent: `live-instructor-routed.spec.ts`
   * already starts and ends a class on this same substrate. `ITERA_SMOKE_*` is a
   * `tenant_admin`, and `RequireRole role="instructor"` accepts
   * instructor/tenant_admin/owner (`src/auth/RequireRole.tsx` → `isInstructor`),
   * so the smoke identity is sufficient — no extra credential is introduced.
   *
   * The contract asserted is read from the code, not guessed:
   * `flex flex-col lg:flex-row` on the wrapper, `w-full lg:w-[340px]` on the
   * `<aside>`. Below `lg` it is a full-bleed stacked block; at `lg+` it is a
   * 340px rail that starts where the content ends.
   */
  test('live sidebar — honours its breakpoint contract instead of overlapping content', async ({ page }) => {
    await requireCapabilities('itera-player', 'itera-smoke');
    test.setTimeout(240_000);

    await login(page);
    await page.goto(`${ITERA_BASE_URL}/live/instructor`);
    await settle(page);

    const startForm = page.getByTestId('instructor-start');
    if (!(await startForm.count())) {
      skipBlocked(
        'the live-class surface did not offer the start form for this identity ' +
          '(tenant not live-enabled, or the role gate bounced) — the sidebar contract is UNVERIFIED, not passing'
      );
    }

    // Pick the first real option of each select; the itera tenant's catalogue
    // is not pinned by env here on purpose — a hardcoded id would rot.
    const programSelect = page.getByTestId('instructor-program-select');
    await expect(programSelect).toBeVisible({ timeout: 30_000 });
    const programValues = await programSelect.locator('option').evaluateAll((opts) =>
      opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean)
    );
    if (!programValues.length) {
      skipBlocked('this identity sees no program it can teach — no live class can be started');
    }

    let sessionId = '';
    try {
      let started = false;
      for (const slug of programValues) {
        await programSelect.selectOption(slug);
        const lessonSelect = page.getByTestId('instructor-lesson-select');
        await expect(lessonSelect).toBeEnabled({ timeout: 20_000 }).catch(() => {});
        const lessonValues = await lessonSelect.locator('option').evaluateAll((opts) =>
          opts.map((o) => (o as HTMLOptionElement).value).filter(Boolean)
        );
        for (const lessonId of lessonValues) {
          await lessonSelect.selectOption(lessonId);
          const startBtn = page.getByTestId('instructor-start-btn');
          const enabled = await expect(startBtn)
            .toBeEnabled({ timeout: 20_000 })
            .then(() => true, () => false);
          if (!enabled) continue; // lesson has no activities — try the next one
          await startBtn.click();
          await page.waitForURL(/\/live\/instructor\/[0-9a-fA-F-]{36}/, { timeout: 45_000 });
          sessionId = page.url().split('/').pop() ?? '';
          started = true;
          break;
        }
        if (started) break;
      }

      if (!started) {
        skipBlocked(
          'no program/lesson visible to this identity has activities, so no live class could be started — ' +
            'the sidebar contract is UNVERIFIED, not passing'
        );
      }

      await expect(page.getByTestId('instructor-control')).toBeVisible({ timeout: 30_000 });

      // ── The assertion this whole spec exists for ────────────────────────────
      await expectSidebarBreakpointContract(page, {
        sidebar: 'instructor-sidebar',
        toggle: 'live-sidebar-toggle',
        main: 'main',
      });

      // The controls the professor has to hit on a phone must be thumb-sized.
      if (isBelowLg(page)) {
        await expectHitTarget(page.getByTestId('instructor-copy-link'), 'copy-join-link @mobile/tablet');
        await expectHitTarget(page.getByTestId('instructor-end'), 'end-class @mobile/tablet');
      }
    } finally {
      // Never leave a class running on prod, whatever happened above.
      if (sessionId) {
        await page
          .getByTestId('instructor-end')
          .click({ timeout: 20_000 })
          .catch(() => {});
      }
    }
  });
});

/**
 * A guard on the harness itself. The fan-out is only worth 3x the wall-clock if
 * the three viewports exercise three DIFFERENT breakpoint branches; a project
 * added at, say, 1100px would cost a third more and prove nothing new.
 * Credential-free, sub-second, and it fails loudly.
 */
const EXPECTED_BUCKET: Record<string, string> = { desktop: 'lg+', mobile: 'base', tablet: 'md' };

test.describe('responsive harness', { tag: '@responsive' }, () => {
  test('each viewport project sits in its own Tailwind bucket', async ({ page }, testInfo) => {
    const width = page.viewportSize()!.width;
    const bucket =
      width >= BREAKPOINTS.lg ? 'lg+' : width >= BREAKPOINTS.md ? 'md' : width >= BREAKPOINTS.sm ? 'sm' : 'base';
    const expected = EXPECTED_BUCKET[testInfo.project.name];
    expect(
      expected,
      `unknown viewport project "${testInfo.project.name}" (${width}px) — declare its bucket in ` +
        `e2e/responsive-shell.spec.ts so the fan-out stays deliberate`
    ).toBeDefined();
    expect(
      bucket,
      `project "${testInfo.project.name}" is ${width}px, which is Tailwind bucket "${bucket}", ` +
        `but the matrix reserves it for "${expected}"`
    ).toBe(expected);
  });
});
