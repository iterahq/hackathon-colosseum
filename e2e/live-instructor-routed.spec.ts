/**
 * Live instructor ROUTED session + open-classes INDEX — end-to-end (plan
 * 20260723-itera-live-routed-session-and-index) against a LIVE deployment
 * (default https://app.iterahq.dev).
 *
 * MANUAL only. NOT wired into the per-PR ci.yml gate. Capability-gated: skips
 * (never fails) when ITERA_E2E_PROF_* / ITERA_E2E_ALUNO1_* creds or a reachable
 * PLAYER_URL are absent — so the scheduled e2e.yml harness (which has no
 * ITERA_E2E_PROF creds) is a green-with-skips no-op here.
 *
 * Covers the plan's UI verifications:
 *   1. /live/instructor/:id opens the instructor view and survives a reload.
 *   2. the index lists the open class (a live card for the just-started session).
 *   4. a student joins the same class via /live/:id (multi-context).
 *   3. "Encerrar" from the index ends the class (asserted here in the UI; the DB
 *      `status='ended'` snapshot is checked out-of-band via itera-supabase-helpers).
 *
 * The runner (claude-main) captures the session id (written to
 * e2e-live-session-id.txt) and does the DB-side assertions (2-match, 3-ended,
 * 5-RLS) around the two ordered tests.
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const PLAYER_URL = (process.env.ITERA_PLAYER_URL || 'https://app.iterahq.dev').replace(/\/$/, '');
const PROF_EMAIL = process.env.ITERA_E2E_PROF_USERNAME || '';
const PROF_PASSWORD = process.env.ITERA_E2E_PROF_PASSWORD || '';
const ALUNO_EMAIL = process.env.ITERA_E2E_ALUNO1_USERNAME || '';
const ALUNO_PASSWORD = process.env.ITERA_E2E_ALUNO1_PASSWORD || '';

// A dfl-batch program+lesson WITH activities (resolved 2026-07-23 from the Itera
// DB). The program option value is the slug; the lesson option value is the id.
const PROGRAM_SLUG = process.env.ITERA_E2E_PROGRAM_SLUG || 'educar-mais-contexto';
const LESSON_ID = process.env.ITERA_E2E_LESSON_ID || 'f2945e79-dc1c-49c7-b6b6-6465ff0774bf';

const SESSION_ID_FILE = 'e2e-live-session-id.txt';
const SESSION_RE = /\/live\/instructor\/([0-9a-fA-F-]{36})(?:$|[?#])/;

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(`${PLAYER_URL}/login`);
    return res.ok || res.status === 200;
  } catch {
    return false;
  }
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${PLAYER_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="email-input"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('[data-testid="email-input"]').fill(email);
  await page.locator('[data-testid="password-input"]').fill(password);
  await page.locator('[data-testid="submit-login"]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
}

test.describe.serial('Live instructor routed session + index (live deployment)', () => {
  test.beforeAll(async () => {
    const ok = (await reachable()) && Boolean(PROF_EMAIL && PROF_PASSWORD && ALUNO_EMAIL && ALUNO_PASSWORD);
    test.skip(!ok, 'PLAYER_URL unreachable or ITERA_E2E_* creds absent — capability-gated skip');
  });

  test('prof starts a class → routed /live/instructor/:id → reload persists → index lists it → student joins', async ({
    page,
    browser,
  }) => {
    await login(page, PROF_EMAIL, PROF_PASSWORD);

    // Open the index and start a class.
    await page.goto(`${PLAYER_URL}/live/instructor`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="instructor-start"]').waitFor({ state: 'visible', timeout: 20_000 });

    await page.locator('[data-testid="instructor-program-select"]').selectOption(PROGRAM_SLUG);
    // The lesson select enables once the program's lessons load.
    const lessonSelect = page.locator('[data-testid="instructor-lesson-select"]');
    await expect(lessonSelect).toBeEnabled({ timeout: 15_000 });
    await lessonSelect.selectOption(LESSON_ID);

    const startBtn = page.locator('[data-testid="instructor-start-btn"]');
    await expect(startBtn).toBeEnabled({ timeout: 20_000 });
    await startBtn.click();

    // (Verification 1) Starting routes to the session's own URL.
    await page.waitForURL(SESSION_RE, { timeout: 30_000 });
    const sessionId = page.url().match(SESSION_RE)![1];
    writeFileSync(SESSION_ID_FILE, sessionId, 'utf8');
    await expect(page.locator('[data-testid="instructor-control"]')).toBeVisible({ timeout: 20_000 });

    // (Verification 1) A reload keeps the same routed session — not the form.
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(page.url()).toMatch(SESSION_RE);
    expect(page.url()).toContain(sessionId);
    await expect(page.locator('[data-testid="instructor-control"]')).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: 'e2e-live-instructor-session.png', fullPage: true });

    // (Verification 2) The index lists the open class as a live card.
    await page.goto(`${PLAYER_URL}/live/instructor`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-testid="instructor-live-now"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-testid="instructor-live-card"]').first()).toBeVisible();
    // The "Abrir" affordance routes back to the session.
    await expect(page.locator('[data-testid="instructor-live-card-open"]').first()).toBeVisible();
    await page.screenshot({ path: 'e2e-live-instructor-index.png', fullPage: true });

    // (Verification 4) A student joins the SAME class via /live/:id (multi-context).
    const studentCtx: BrowserContext = await browser.newContext();
    const student = await studentCtx.newPage();
    try {
      await login(student, ALUNO_EMAIL, ALUNO_PASSWORD);
      await student.goto(`${PLAYER_URL}/live/${sessionId}`, { waitUntil: 'domcontentloaded' });
      // A generic-name learner sees the name gate first — pass it.
      const gate = student.locator('[data-testid="live-name-gate"]');
      if (await gate.isVisible().catch(() => false)) {
        await student.locator('[data-testid="live-name-input"]').fill('Aluno E2E');
        await student.locator('[data-testid="live-avatar-option"]').first().click();
        await student.locator('[data-testid="live-name-gate-submit"]').click();
      }
      // The student is IN the session (reception/lobby before the prof begins),
      // NOT a "class not available" state.
      await expect(student.locator('[data-testid="live-main"]')).toBeVisible({ timeout: 20_000 });
      await expect(student.locator('[data-testid="live-not-found"]')).toHaveCount(0);
      await student.screenshot({ path: 'e2e-live-student.png', fullPage: true });
    } finally {
      await studentCtx.close();
    }
  });

  test('"Encerrar" from the index ends the class', async ({ page }) => {
    test.skip(!existsSync(SESSION_ID_FILE), 'no session id captured by the previous test');
    const sessionId = readFileSync(SESSION_ID_FILE, 'utf8').trim();

    await login(page, PROF_EMAIL, PROF_PASSWORD);
    await page.goto(`${PLAYER_URL}/live/instructor`, { waitUntil: 'domcontentloaded' });

    // Our session's live card is present; end it.
    const card = page.locator('[data-testid="instructor-live-card"]');
    await expect(card.first()).toBeVisible({ timeout: 20_000 });
    const endBtn = page.locator('[data-testid="instructor-live-card-end"]').first();
    await endBtn.click();

    // (Verification 3, UI) The live card for the ended session drops off the
    // index (the "Ao vivo agora" section shrinks / disappears). The durable
    // status='ended' snapshot is asserted out-of-band via the DB.
    await expect(page.locator('[data-testid="instructor-live-now"]')).toHaveCount(0, { timeout: 20_000 });
    await page.screenshot({ path: 'e2e-live-ended-index.png', fullPage: true });
    // Re-record for the DB check step.
    writeFileSync(SESSION_ID_FILE, sessionId, 'utf8');
  });
});
