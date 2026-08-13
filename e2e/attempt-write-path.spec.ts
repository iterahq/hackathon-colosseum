/**
 * WRITE-SIDE proof: a settled attempt reaches `itera.activity_results`, and the
 * proof can be repeated tomorrow.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A WRONG ANSWER, AND NOT A COMPLETION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Measured 2026-08-13: one full run of this suite against ITERA production
 * moved exactly ONE table in the whole `itera` schema — `class_sessions` (+3).
 * `activity_results`, `activity_traces`, `progress`, `class_answers`,
 * `xp_events` and `artifacts` did not move. Nothing proved that the app still
 * records an attempt at all.
 *
 * A completion spec cannot close that gap, and this is the load-bearing part. A
 * finished activity is deliberately not replayable, in three independent
 * places:
 *   · `resumeIndexFor` — every activity `completed` ⇒ seek to the completion
 *     screen (`setCompleted(true)`), so the lesson never re-renders;
 *   · a revisited activity is `done`, therefore `locked` by `answerMachine`
 *     (`done → locked → !acceptsSubmit`), therefore unanswerable;
 *   · `abandonment.ts` — `if (reviewing) return 'reviewing'`.
 * That suppression is INTENDED — a finished lesson reopens as a book — so any
 * spec built on "complete lesson 1 again" writes nothing on its second run and
 * forever after. `lesson-completion-unlock.spec.ts` carries the full history.
 *
 * A MISS is the one path that is idempotent BY CONSTRUCTION, and the mechanism
 * is in `persistActivityProgress`:
 *   · the attempt is an INSERT into `activity_results` — one row per attempt,
 *     no uniqueness, so every miss lands again;
 *   · the progress write is `upsert(..., { ignoreDuplicates: true })` with
 *     `status: 'in_progress'`, so a miss NEVER promotes the row to `completed`
 *     and never overwrites an existing one.
 * The learner is therefore resumed onto the same activity next run, and the
 * next run writes again. Repeatability is a property of the app here, not of
 * test hygiene, which is exactly why it is worth pinning.
 *
 * It is also the path defect D2 destroyed: `passed` was a column that only ever
 * held `true`, because the miss branch was silent. This spec is the guard on
 * the fix.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HOW THE ROW IS READ BACK
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * With the LEARNER'S OWN JWT, through PostgREST — the same path the app takes.
 * No service role, no new secret, no `psql`. The bearer token is the one the
 * app already holds in `localStorage`, and the `apikey` is lifted from the
 * app's own first REST call, so the read is RLS-scoped and attributable to the
 * learner. A read that bypassed RLS would prove the row exists; it would not
 * prove the learner wrote it.
 *
 * ⚠️ THIS SPEC WRITES TO PRODUCTION — one `activity_results` row and (on the
 * first run only) one `progress` row at `in_progress`, as `claude-e2e-aluno1`,
 * on a program authored for test fills. That is the point of the spec, and it
 * is why the activity is PINNED rather than discovered: an unpinned walk would
 * settle whatever it happened to land on.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ BUILT AND PARKED — THIS SPEC DOES NOT RUN ON THE DAILY CRON
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * It gates on `itera-aluno1`, which is `tier: 'optional'`, and `e2e.yml` does
 * NOT declare `ITERA_E2E_ALUNO1_*`. So on the cron this test SKIPS, loudly, and
 * the skip census counts it — it is UNVERIFIED there, never "passing".
 *
 * That is deliberate, not an oversight. A question is open with Tainan on plan
 * `20260812-ux-map-observed-reality-lens`: may the daily cron write synthetic
 * learner rows into the tables every accuracy metric reads? This spec writes
 * into exactly those tables. Declaring the secret in `e2e.yml` is what would
 * start the daily writes, so that one line waits for the answer.
 *
 * Until then the spec is run MANUALLY. Verified that way on 2026-08-13: two
 * consecutive runs, +1 `activity_results` row each (1 → 2 → 3), `passed=false`
 * on every row, `progress.status` still `in_progress` and `completed_at` still
 * NULL after both. Mutation-tested in the other direction by aborting the
 * `activity_results` POST at the network layer: the spec goes red on the
 * count poll, so the assertion is load-bearing rather than decorative.
 *
 * Run:
 *   ITERA_BASE_URL=https://app.iterahq.dev \
 *   ITERA_E2E_ALUNO1_USERNAME=… ITERA_E2E_ALUNO1_PASSWORD=… \
 *   npx playwright test e2e/attempt-write-path.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { ITERA_PLAYER_URL } from './support/capabilities';
import { requireCapabilities } from './support/gate';

const BASE = ITERA_PLAYER_URL;

const ALUNO1 = {
  user: process.env.ITERA_E2E_ALUNO1_USERNAME ?? '',
  pass: process.env.ITERA_E2E_ALUNO1_PASSWORD ?? '',
};

/**
 * The pinned miss. All three travel together and are overridable together —
 * changing the lesson without changing the option id would pick an option that
 * does not exist, which fails loudly rather than settling something else.
 *
 * `[TESTE] Peça certo à IA — versão preenchida` (program
 * `teste-personalizacao-fill-2026-08-05`, tenant `dfl-batch`). Chosen because
 * its FIRST activity is graded: `resumeIndexFor` lands the learner directly on
 * it, so the spec settles exactly one attempt and walks through no `concept`
 * screens on the way (each of which would write a `completed` row of its own
 * and make the run non-repeatable).
 */
const LESSON_ID = process.env.ITERA_E2E_MISS_LESSON_ID ?? 'ab1cb2a9-36dd-4ee4-a9b2-c8ae47bc00e9';
const ACTIVITY_ID = process.env.ITERA_E2E_MISS_ACTIVITY_ID ?? 'd42a29d0-4263-424d-99aa-f4ff7746b329';
/** A DISTRACTOR — `correct_option_id` is `especifico`. Never the right one. */
const WRONG_OPTION_ID = process.env.ITERA_E2E_MISS_WRONG_OPTION_ID ?? 'adjetivos';

/** Collapse whitespace so rendered text and stored JSON compare like for like. */
const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The learner's own Supabase credentials, lifted from the running app. */
interface LearnerRest {
  base: string;
  apikey: string;
  token: string;
}

async function login(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  const email = page.locator('input[type="email"], input[autocomplete="email"]').first();
  const pass = page.locator('input[type="password"], input[autocomplete="current-password"]').first();
  await email.waitFor({ state: 'visible', timeout: 20_000 });
  await email.fill(ALUNO1.user);
  await pass.fill(ALUNO1.pass);
  await page.locator('[data-testid="login-form"] button[type="submit"], button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
}

/**
 * The session the APP is using, not one this spec minted. Reading the token out
 * of the app's own storage is what makes the read-back attributable: it is the
 * identity that just answered, carrying whatever claims the access-token hook
 * gave it.
 */
async function learnerRest(page: Page, apikey: string): Promise<LearnerRest> {
  const found = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const token = (JSON.parse(raw) as { access_token?: string }).access_token ?? '';
    // `sb-<project-ref>-auth-token` — the ref IS the REST host, so no second
    // secret is needed to know where to read from.
    const ref = key.replace(/^sb-/, '').replace(/-auth-token$/, '');
    return { token, ref };
  });
  expect(found, 'the app holds no Supabase session after login').not.toBeNull();
  expect(found!.token, 'the app session carries no access token').not.toBe('');
  expect(apikey, 'the app made no REST call to lift an apikey from').not.toBe('');
  return { base: `https://${found!.ref}.supabase.co/rest/v1`, apikey, token: found!.token };
}

/** Every attempt THIS learner has on the pinned activity, newest first. */
async function ownAttempts(page: Page, rest: LearnerRest) {
  const res = await page.request.get(
    `${rest.base}/activity_results?activity_id=eq.${ACTIVITY_ID}&select=id,passed,feedback,created_at&order=created_at.desc`,
    {
      headers: {
        apikey: rest.apikey,
        Authorization: `Bearer ${rest.token}`,
        'Accept-Profile': 'itera',
      },
    }
  );
  expect(res.status(), `PostgREST refused the learner's own read: ${await res.text()}`).toBe(200);
  return (await res.json()) as { id: string; passed: boolean; feedback: unknown; created_at: string }[];
}

/** This learner's progress row for the pinned activity, or null. */
async function ownProgress(page: Page, rest: LearnerRest) {
  const res = await page.request.get(
    `${rest.base}/progress?activity_id=eq.${ACTIVITY_ID}&select=status,completed_at`,
    {
      headers: {
        apikey: rest.apikey,
        Authorization: `Bearer ${rest.token}`,
        'Accept-Profile': 'itera',
      },
    }
  );
  expect(res.status(), `PostgREST refused the learner's own progress read: ${await res.text()}`).toBe(200);
  const rows = (await res.json()) as { status: string; completed_at: string | null }[];
  return rows[0] ?? null;
}

test.describe('a wrong answer is recorded, and recording it is repeatable', () => {
  test('a miss on a pinned activity appends exactly one attempt and never completes it', async ({ page }) => {
    await requireCapabilities('itera-player', 'itera-aluno1');

    // The app's own REST calls carry the anon key. Capturing it here is what
    // lets the read-back below use the app's exact channel without this repo
    // holding a second secret.
    let apikey = '';
    page.on('request', (r) => {
      if (apikey) return;
      if (!r.url().includes('/rest/v1/')) return;
      apikey = r.headers()['apikey'] ?? '';
    });

    await login(page);
    const rest = await learnerRest(page, apikey);

    const before = await ownAttempts(page, rest);
    const progressBefore = await ownProgress(page, rest);
    // ⚠️ NON-VACUITY. `completed` must not already be the state, or the
    // assertion at the end of this test is true before the test does anything —
    // and, worse, the lesson would seek past the pinned activity and settle
    // nothing at all.
    expect(
      progressBefore?.status,
      'the pinned activity is already completed for this learner — pick another, this one can no longer be missed'
    ).not.toBe('completed');

    // ── settle a MISS ────────────────────────────────────────────────────────
    await page.goto(`${BASE}/lesson/${LESSON_ID}`, { waitUntil: 'domcontentloaded' });

    // This program personalises its enunciados ("{{familiar.nome}}"), so the
    // first open asks the learner who to name. Take the "use example names"
    // exit: the spec is about the write path, and inventing family names for a
    // test identity is data nobody asked for. Conditional on purpose — once the
    // choice is stored the form does not come back, so a hard wait here would
    // make the SECOND run fail for a reason unrelated to what is under test.
    //
    // Waiting on whichever of the two arrives FIRST is the load-bearing detail:
    // the form mounts asynchronously, so an immediate `isVisible()` reads false
    // and walks straight into a 30s timeout on options that are still behind
    // the form.
    const personalization = page.locator('[data-testid="personalization-form"]');
    await page
      .locator('[data-testid="personalization-form"], [data-testid="single-choice-options"]')
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 });
    if (await personalization.isVisible().catch(() => false)) {
      await page.locator('[data-testid="personalization-dismiss"]').click();
    }

    await page.locator('[data-testid="single-choice-options"]').waitFor({ state: 'visible', timeout: 30_000 });

    // Selecting by the AUTHORED option id, never by position: the options are
    // shuffled per learner and per mount, so an index would pick a different
    // answer on a different run. This also doubles as the assertion that the
    // resume landed on the PINNED activity — a different activity has no option
    // with this id, and the click fails instead of settling something else.
    const wrong = page
      .locator(`[data-testid="single-choice-option"][data-option-id="${WRONG_OPTION_ID}"]`)
      .first();
    await expect(
      wrong,
      `the resumed activity does not offer option "${WRONG_OPTION_ID}" — the learner did not land on the pinned activity`
    ).toBeVisible({ timeout: 20_000 });
    // What the learner SEES on the option they pick. The recorded response is
    // the option's label, not its id, so this is what the read-back has to
    // match — and matching on the rendered text is the stronger claim anyway.
    const wrongLabel = normalise(await wrong.innerText());
    expect(wrongLabel.length, 'the distractor option rendered no text').toBeGreaterThan(20);
    await wrong.click();
    await page.locator('[data-testid="single-choice-submit"]').click();

    // The verdict beat. The footer is where the learner learns they missed, and
    // its "Continuar" is what commits the attempt for a footer-graded kind.
    const footer = page.locator('[data-testid="feedback-footer"]');
    await expect(footer).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-testid="feedback-footer-continue"]').click();

    // ── the row landed ───────────────────────────────────────────────────────
    await expect
      .poll(async () => (await ownAttempts(page, rest)).length, {
        message: 'the miss did not reach itera.activity_results',
        timeout: 30_000,
        intervals: [1_000, 2_000, 3_000],
      })
      .toBe(before.length + 1);

    const after = await ownAttempts(page, rest);
    const newest = after[0];
    // A miss recorded as a pass is the exact defect this guards: `passed` used
    // to be a column that only ever held `true`.
    expect(newest.passed, 'the attempt was recorded, but recorded as a PASS').toBe(false);
    // …and it kept WHAT was answered, not just that it was wrong. Without this
    // the row counts errors while preserving none of them.
    expect(
      normalise(JSON.stringify(newest.feedback ?? {})),
      'the attempt recorded no response content — error analysis has nothing to read'
    ).toContain(wrongLabel);

    // ── and it stays repeatable ──────────────────────────────────────────────
    // The property that makes this spec runnable tomorrow: a miss records
    // `in_progress` and never promotes to `completed`, so the learner resumes
    // onto this same activity and the next run writes again.
    const progressAfter = await ownProgress(page, rest);
    expect(progressAfter, 'the miss wrote no progress row at all').not.toBeNull();
    expect(
      progressAfter!.status,
      'a MISS promoted progress to completed — the next run will seek past this activity and write nothing'
    ).not.toBe('completed');
    expect(progressAfter!.completed_at, 'a miss stamped completed_at').toBeNull();
  });
});
