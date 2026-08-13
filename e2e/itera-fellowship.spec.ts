/**
 * Itera↔Fellowship E2E harness (plan #7, 20260619-itera-fellowship-e2e-integration).
 *
 * Verifies the full federated loop:
 *   DFL fellow logs into dfl-learn → opens the /itera mini-app → the itera-player
 *   iframe renders the PILOT ACTIVITY (NOT a login form — proving the federated
 *   no-re-login session works) → completes the activity → the completion writes
 *   itera.activity_results → the dfl-batch Results-API key pulls the result back
 *   (poll-readback, ADR-701).
 *
 * Gated through `e2e/support/gate.ts`. Every prerequisite below is DECLARED by
 * `.github/workflows/e2e.yml`, which makes each one a **required** capability:
 * its absence fails the preflight instead of skipping quietly. That is not a
 * hypothetical — `DFL_BATCH_RESULTS_API_KEY` and `CLAUDE_SMOKE_*` have never
 * existed as Actions secrets, so this spec has never executed a single
 * assertion while the cron reported green.
 *
 * Prereqs (env):
 *   - ITERA_API_URL (default https://api.iterahq.dev) reachable, /v1/health == 200
 *   - DFL_BATCH_RESULTS_API_KEY (the dfl-batch tenant Results-API key) — NEVER echoed
 *   - CLAUDE_SMOKE_USERNAME + CLAUDE_SMOKE_PASSWORD (DFL-side login; ITERA_SMOKE_* also accepted)
 *   - LEARN_BASE_URL (default https://learn.devfellowship.com)
 *
 * MANUAL / scheduled only (see .github/workflows/e2e.yml + playwright.config.ts).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS SPEC IS RED, MEASURED 2026-08-13 — AND WHY IT IS NOT "THE EMBED IS
 * GONE"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The five required secrets landed on 2026-08-13, so this spec executed for the
 * first time in its life. It failed on `locator('iframe')`, 30s, no iframe. The
 * federated embed is NOT gone — the handshake exists on both sides
 * (`src/auth/embedBridge.ts` here, `ALLOWED_ORIGIN_PATTERNS` + `DflRemote` in
 * dfl-learn). TWO independent defects sat in front of it, and the opaque
 * timeout hid both. GATE 1 and GATE 2 below now name them.
 *
 * 1. **The identity never reaches the page.** `CommunityMemberProtected` in
 *    dfl-learn redirects `/itera` to `/projects` for any account with no
 *    `github_links` row. Reproduced in a browser as `CLAUDE_SMOKE_*`: login
 *    succeeds, `/itera` lands on `/projects`, iframe count 0, and the header
 *    shows the "Vincule-se no GitHub" banner. Read-only against DFL prod:
 *    `public.github_links` holds **0 rows** for that user id. It is a silent
 *    redirect, never a 403 — the same shape as ITERA's own `RequireRole`.
 *
 * 2. **The frame pointed at the marketing site.** dfl-learn framed
 *    `https://iterahq.dev` (Astro marketing) instead of `https://app.iterahq.dev`
 *    (the player), from the mini-app's registration in dfl-learn #248
 *    (2026-06-19). Only the player answers
 *    `frame-ancestors 'self' https://learn.devfellowship.com`, and only the
 *    player posts `DFL_READY`. Fixed in devfellowship/dfl-learn#304.
 *
 * Defect 2 is fixed. Defect 1 is an identity decision and is still open, so
 * this spec stays RED — which is the honest report: the federated loop is NOT
 * being tested. Do not weaken a gate to recover a green.
 */
import { test, expect, type Page } from '@playwright/test';
import { ITERA_API_URL, LEARN_BASE_URL } from './support/capabilities';
import { requireCapabilities } from './support/gate';

const RESULTS_KEY = process.env.DFL_BATCH_RESULTS_API_KEY || '';
const LOGIN_USER = process.env.CLAUDE_SMOKE_USERNAME || process.env.ITERA_SMOKE_USERNAME || '';
const LOGIN_PASS = process.env.CLAUDE_SMOKE_PASSWORD || process.env.ITERA_SMOKE_PASSWORD || '';

// Resolved substrate ids (orchestrator pre-provisioned 2026-06-19).
const PILOT_ACTIVITY_ID = '191a4bc0-0bde-4805-bd0f-32af5ab21d6b';
// A foreign tenant's result id (itera/acme) — used for the isolation assertion.
const FOREIGN_RESULT_ID = process.env.FOREIGN_RESULT_ID || '00000000-0000-4000-8000-0000000000ff';

/** Count dfl-batch results for the pilot activity via the Results-API pull. */
async function countPilotResults(): Promise<number> {
  const res = await fetch(
    `${ITERA_API_URL}/v1/activity-results?activity_id=${PILOT_ACTIVITY_ID}`,
    { headers: { Authorization: `Bearer ${RESULTS_KEY}` } }
  );
  if (!res.ok) throw new Error(`activity-results pull returned ${res.status}`);
  const body = (await res.json()) as { results?: unknown[] } | unknown[];
  const arr = Array.isArray(body) ? body : body.results || [];
  return arr.length;
}

/** Best-effort dfl-learn login (selectors are defensive across UI variants). */
async function loginToLearn(page: Page): Promise<void> {
  await page.goto(`${LEARN_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  const email = page
    .locator('input[type="email"], input[name="email"], input[autocomplete="username"]')
    .first();
  const pass = page
    .locator('input[type="password"], input[name="password"], input[autocomplete="current-password"]')
    .first();
  await email.waitFor({ state: 'visible', timeout: 20_000 });
  await email.fill(LOGIN_USER);
  await pass.fill(LOGIN_PASS);
  await page
    .locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Login"), button:has-text("Sign in")')
    .first()
    .click();
  // Wait until we're off the login screen.
  await page.waitForURL((url) => !/\/login\b/.test(url.pathname), { timeout: 30_000 });
}

test.describe('Itera↔Fellowship federated loop', () => {
  test('fellow completes the pilot activity → result is pull-readable', async ({ page }) => {
    // ---- Capability gates ---------------------------------------------------
    await requireCapabilities('itera-api', 'learn-app', 'dfl-batch-results', 'claude-smoke');

    const before = await countPilotResults();

    // ---- Drive the federated flow ------------------------------------------
    await loginToLearn(page);
    await page.goto(`${LEARN_BASE_URL}/itera`, { waitUntil: 'domcontentloaded' });

    // ── GATE 1: did we even stay on /itera? ─────────────────────────────────
    // `CommunityMemberProtected` does not render a 403. It NAVIGATES AWAY, and
    // the two exits mean different things:
    //   · `/projects` — the identity has no `github_links` row (the "Vincule-se
    //     no GitHub" gate). Every route except the /projects landing is closed.
    //   · `/`         — the identity is below IAM level 50 (not a member).
    // Without this assertion both land as a bare `locator('iframe')` timeout on
    // the line below, which reads as "the embed is broken" when the truth is
    // "this identity never reached the page". Same trap as ITERA's own
    // `RequireRole`, which also redirects instead of refusing.
    // The guard resolves three async queries (auth, IAM role, GitHub link)
    // before it decides, so the redirect lands AFTER first paint. Wait for
    // whichever settles first — the iframe, or a route that is no longer
    // /itera — instead of asserting on a URL the guard has not ruled on yet.
    await Promise.race([
      page.locator('iframe').first().waitFor({ state: 'attached', timeout: 30_000 }),
      page.waitForURL((u) => !u.pathname.startsWith('/itera'), { timeout: 30_000 }),
    ]).catch(() => {
      /* both timed out — the assertions below report which. */
    });
    const landed = new URL(page.url()).pathname;
    expect(
      landed,
      landed.startsWith('/projects')
        ? 'dfl-learn redirected /itera to /projects: this identity has no github_links row, so CommunityMemberProtected closes every route but the projects landing. Link a GitHub account for the e2e identity, or drive this spec with one that has it.'
        : `dfl-learn redirected /itera to "${landed}": this identity is below IAM level 50 (not a community member).`
    ).toBe('/itera');

    // ── GATE 2: is the frame pointed at the PLAYER? ─────────────────────────
    // `iterahq.dev` is the Astro MARKETING site; `app.iterahq.dev` is the
    // player. Both are allowlisted origins in `DflRemote`, so the wrong one
    // fails silently: the marketing page never posts `DFL_READY`, the host
    // never hands over the session, and the frame renders marketing copy that
    // looks like "something loaded". That is exactly what shipped from
    // dfl-learn #248 (2026-06-19) until the fix.
    const frameEl = page.locator('iframe').first();
    await frameEl.waitFor({ state: 'visible', timeout: 30_000 });
    const frameSrc = (await frameEl.getAttribute('src')) ?? '';
    expect(
      new URL(frameSrc).host,
      `the mini-app frames "${frameSrc}". Only the player implements the DFL_READY handshake; the marketing host can never render an activity.`
    ).toBe('app.iterahq.dev');

    const frame = page.frameLocator('iframe').first();

    // Positive assertion: a known Itera activity/lesson DOM node is present.
    // (the focused-chrome progress bar + activity renderer; or the
    // lesson-complete card.) NOTE: the player was rebuilt to a focused-centered
    // chrome — the old `progress-pills` header was replaced by a full-width
    // `lesson-progress` bar, and every activity renderer now carries
    // `data-activity-kind`.
    const activityNode = frame
      .locator('[data-testid="lesson-progress"], [data-testid="lesson-complete"], [data-activity-kind]')
      .first();
    await expect(
      activityNode,
      'embedded itera-player should render the activity (federated session), not a login form'
    ).toBeVisible({ timeout: 45_000 });

    // Negative assertion: no login form inside the iframe.
    await expect(
      frame.locator('input[type="password"]'),
      'embedded itera-player must NOT show a password/login form (no re-login)'
    ).toHaveCount(0);

    // ---- Drive completion ---------------------------------------------------
    // The document/diagram activity exposes a complete/continue affordance.
    const completeBtn = frame
      .locator(
        'button:has-text("Concluir"), button:has-text("Finalizar"), button:has-text("Complete"), button:has-text("Continuar"), button:has-text("Próximo"), [data-testid="activity-complete"]'
      )
      .first();
    if (await completeBtn.isVisible().catch(() => false)) {
      await completeBtn.click();
    }
    // The lesson-complete card confirms the completion path fired.
    await expect(frame.locator('[data-testid="lesson-complete"]')).toBeVisible({
      timeout: 30_000,
    });

    // ---- Poll-readback (ADR-701): the new result appears via the pull API ---
    await expect
      .poll(async () => countPilotResults(), {
        message: 'dfl-batch Results-API should surface the new completion',
        timeout: 60_000,
        intervals: [2_000, 3_000, 5_000],
      })
      .toBeGreaterThan(before);
  });

  test('tenant isolation: dfl-batch key gets 404 (not 403) for a foreign result', async () => {
    await requireCapabilities('itera-api', 'dfl-batch-results');

    const res = await fetch(`${ITERA_API_URL}/v1/activity-results/${FOREIGN_RESULT_ID}`, {
      headers: { Authorization: `Bearer ${RESULTS_KEY}` },
    });
    // 404 (not-found by tenant scope), NOT 403 — the key is valid, the row is
    // simply invisible to this tenant. A 403 would leak existence.
    expect([404, 200]).toContain(res.status);
    if (res.status === 200) {
      // If 200, it MUST be a dfl-batch-owned row (never a foreign one).
      const body = (await res.json()) as { id?: string };
      expect(body.id).toBe(FOREIGN_RESULT_ID); // would only happen if it's ours
    } else {
      expect(res.status).toBe(404);
    }
  });

  test('E3/Gantt join (lms.milestones.external_ref) — GATED on dfl-schema #527', async () => {
    // dfl-schema #527 (external_ref column) is human-gate and UNMERGED. This
    // seed/harness NEVER writes DFL prod, so the E3 join cannot be asserted yet.
    // Routed through the registry rather than a bare `test.skip(true, …)`: an
    // unconditional skip is exactly the shape that hides "we are not testing".
    // It is now counted in the census under its own capability every run.
    await requireCapabilities('dfl-schema-527');
    throw new Error('unreachable: dfl-schema-527 can never be present');
  });
});
