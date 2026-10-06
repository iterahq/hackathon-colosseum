/**
 * TERMINAL SANDBOX — the refinements only a real browser can adjudicate.
 * Plan `20260807-itera-terminal-sandbox-refinamentos`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE IS NOT `activity-baseline.spec.ts`
 * ═══════════════════════════════════════════════════════════════════════════
 * That suite is a frozen CHARACTERIZATION baseline: its contract is "a red run
 * means behaviour moved", and it is deliberately blind to whether the behaviour
 * it froze is good. This file is the opposite — every assertion here states
 * what the terminal MUST do, and each one was written because a screenshot
 * showed it not doing it.
 *
 * They share everything else: the same hermetic substrate (`harnessStub`), the
 * same credential-free `vite preview` of the code under test, the same blocking
 * `ci.yml` job (`playwright.baseline.config.ts` matches both files).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A BROWSER AND NOT VITEST
 * ═══════════════════════════════════════════════════════════════════════════
 * jsdom has no layout: every `getBoundingClientRect()` is zero, so the very
 * property §1 of the plan is about — WHERE the prompt sits — is unobservable
 * there. `src/test/TerminalSandboxActivity.test.tsx` keeps the verdict/trace
 * assertions (which need no pixels); geometry lives here, measured.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  ALL_FIXTURES,
  CHAT_SANDBOX,
  TERMINAL_FREE_TEXT,
  TERMINAL_OPTIONS,
  TERMINAL_PLAYER_CHROME,
  type ActivityFixture,
} from './support/activityFixtures';
import { installHarnessSubstrate, harnessUrl } from './support/harnessStub';

type Locale = 'pt' | 'en';

/** Open a terminal fixture in the author harness, mounted and dispatched. */
async function open(page: Page, fx: ActivityFixture, locale?: Locale): Promise<void> {
  await installHarnessSubstrate(page, ALL_FIXTURES);
  if (locale) {
    // `I18nProvider` reads the persisted choice on its first render, so this has
    // to land BEFORE any app script runs. The stub's `users` row carries no
    // `locale`, so `useLocaleSync` never overrides it.
    await page.addInitScript((l) => window.localStorage.setItem('itera.locale', l), locale);
  }
  await page.goto(harnessUrl(fx));
  await expect(page.getByTestId('activity-test-harness')).toBeVisible();
  // A spec that failed its Zod boundary renders the invalid card — asserting
  // against that screen would be asserting about nothing.
  await expect(page.locator('[data-invalid-spec="true"]')).toHaveCount(0);
  await expect(page.getByTestId('terminal-transcript')).toBeVisible();

  /**
   * ⚠️ WAIT FOR THE FONTS, OR EVERY MEASUREMENT IN THIS FILE IS A COIN FLIP.
   *
   * The terminal is `font-mono` end to end, and JetBrains Mono is the ONE brand
   * face `index.html` does not preload — it arrives on demand under
   * `font-display: swap`. So the first paint measures the system fallback and
   * the second measures the real face, with different metrics: the prompt bar's
   * line box changes height, and every `boundingBox()` below shifts with it.
   *
   * Observed 2026-08-10 while adding §6, on the UNCHANGED §1 assertions: the
   * same build produced `18.7px of body left below the prompt bar` (threshold
   * 18) on one cold run and passed on the next, and `the prompt moved with the
   * history` failed by 4.5px the same way. Both are geometry with ~2px of
   * slack, so a font swap alone is enough to flip them. This is not a new
   * flake — it just had no reason to be noticed until a section arrived that
   * measures glyph advance directly.
   */
  await page.evaluate(() => document.fonts.ready);
}

/* ══════════════════════════════════════════════════════════════════════════
 * §1 — THE TERMINAL IS A TERMINAL-SIZED BOX, AND THE PROMPT IS ITS BOTTOM RAIL
 *
 * Tainan, TG 2026-08-10, looking at `terminal_sandbox` in the author harness:
 * *"o terminal component deve ter um min-height (…350px?), de forma que mesmo
 * qndo tem pouco conteudo fica parecendo um terminal mesmo. veja que o bloco de
 * input continua alinhado ao bottom"*.
 *
 * ── THIS SECTION USED TO ASSERT THE OPPOSITE. READ WHY BEFORE YOU REVERT ────
 * Until 2026-08-10 §1 was "THE PROMPT IS BORN AT THE TOP": it required the
 * transcript to reserve NO empty space and the prompt to be glued to the last
 * line. That was PR #303, and it was written from a screenshot of the failure
 * at the other extreme — a `h-[34dvh] min-h-[220px]` transcript that reserved
 * ~220px inside itself for one welcome line.
 *
 * #303 fixed the reserved space by making the transcript intrinsic, and the
 * whole window collapsed with it: one line of canned output produced a ~152px
 * box that reads as a code block, not as a terminal. That is the 2026-08-10
 * screenshot. Both screenshots are real; the setting that satisfies neither is
 * "let the content decide the height".
 *
 * So the law changed shape rather than direction: the BOX gets a floor
 * (`TERMINAL_BODY` on the window body), and the CONTENT gets none. The prompt
 * bar is the last, rigid child of that full-height column, the transcript is
 * the first and only growing one, and the empty space between them is the
 * screen real estate a terminal is supposed to have.
 *
 * WHAT EACH TEST HERE WOULD CATCH:
 *   · the floor deleted, or moved onto the transcript  → "terminal-sized body"
 *   · the prompt no longer last / no longer rigid      → "bottom rail"
 *   · `grow basis-0`/`min-h-0` lost by the transcript  → "scrolls inside"
 *   · a hard px floor that ignores small screens       → "narrow viewport"
 *   · the palette pulled inside the window             → "outside the window"
 * ══════════════════════════════════════════════════════════════════════════ */

/** Mirrors `TERMINAL_BODY` in `TerminalSandboxShell`: `min(314px, 40dvh)`. */
const BODY_FLOOR_PX = 314;
const BODY_FLOOR_DVH = 0.4;

async function boxOf(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox();
  expect(box, `${testId} must have a layout box`).not.toBeNull();
  return box!;
}

/**
 * The floor the body must be sitting on RIGHT NOW, computed from the live
 * viewport rather than hard-coded — the whole point of the `min()` is that the
 * number is different on a phone, so a constant would only test one branch.
 */
async function expectedFloor(page: Page): Promise<number> {
  const { vw, vh } = await page.evaluate(() => ({
    vw: window.innerWidth,
    vh: window.innerHeight,
  }));
  if (isShortPhone(vw, vh)) return SHORT_PHONE_FLOOR_PX;
  return Math.min(BODY_FLOOR_PX, BODY_FLOOR_DVH * vh);
}

/** Mirrors `TERMINAL_BODY`'s short-phone media rule: height <= 700 and width < 640. */
const SHORT_PHONE_FLOOR_PX = 112;
const SHORT_PHONE_TRANSCRIPT_MAX_DVH = 0.26;

function isShortPhone(vw: number, vh: number): boolean {
  return vh <= 700 && vw < 640;
}

/**
 * On a short phone the body follows its content instead of sitting on the
 * floor: it must never fall under `SHORT_PHONE_FLOOR_PX` (the #339 collapse), and
 * never exceed the 26dvh transcript cap plus the rigid prompt bar and the `p-4`
 * padding (8px of slack for the gap between them).
 */
async function expectShortPhoneBody(page: Page) {
  const vh = await page.evaluate(() => window.innerHeight);
  const body = await boxOf(page, 'sandbox-window-body');
  const bar = await boxOf(page, 'terminal-prompt-bar');
  expect(body.height, `body collapsed to ${body.height}px`).toBeGreaterThan(
    SHORT_PHONE_FLOOR_PX - 2,
  );
  expect(body.height, `body ate ${body.height}px of a ${vh}px phone`).toBeLessThan(
    SHORT_PHONE_TRANSCRIPT_MAX_DVH * vh + bar.height + 32 + 8,
  );
  expect(body.height).toBeLessThan(BODY_FLOOR_DVH * vh);
}

for (const fx of [TERMINAL_FREE_TEXT, TERMINAL_OPTIONS]) {
  const surface = fx === TERMINAL_FREE_TEXT ? 'freeText' : 'options';
  const promptTestId = surface === 'freeText' ? 'terminal-input' : 'terminal-draft';

  test(`§1 ${surface}: the window keeps a terminal-sized body on almost no content`, async ({
    page,
  }) => {
    await open(page, fx);

    const body = await boxOf(page, 'sandbox-window-body');
    const floor = await expectedFloor(page);

    // EQUALITY, not `>=`. `>=` would also pass for a transcript that happened
    // to be tall enough this run, which is the state being ruled out — with one
    // canned line the content is ~60px, so anything else means the floor is
    // doing the work.
    expect(body.height, `window body was ${body.height}px, floor is ${floor}px`).toBeGreaterThan(
      floor - 2,
    );
    expect(body.height).toBeLessThan(floor + 2);
  });

  test(`§1 ${surface}: the prompt is the bottom rail, the transcript the top`, async ({ page }) => {
    await open(page, fx);

    const body = await boxOf(page, 'sandbox-window-body');
    const transcript = await boxOf(page, 'terminal-transcript');
    const bar = await boxOf(page, 'terminal-prompt-bar');
    const lastLine = await boxOf(page, 'transcript-last-line');
    const PAD = 16; // the body's `p-4`

    // Top of the column: the transcript starts where the content box starts.
    expect(transcript.y - body.y, 'transcript is not at the top of the body').toBeLessThan(PAD + 2);

    // Bottom rail: the prompt bar ends where the content box ends.
    const belowBar = body.y + body.height - (bar.y + bar.height);
    expect(belowBar, `${belowBar}px of body left below the prompt bar`).toBeLessThan(PAD + 2);
    expect(belowBar).toBeGreaterThan(-1);

    // And the empty space Tainan asked for is BETWEEN them — the exact quantity
    // #303 drove to zero. This is what goes red if the floor is removed.
    const gap = bar.y - (lastLine.y + lastLine.height);
    expect(gap, `only ${gap}px between the last line and the prompt`).toBeGreaterThan(80);

    // The prompt is still ON SCREEN, which is the point of pinning it.
    const promptBox = await boxOf(page, promptTestId);
    expect(promptBox.y + promptBox.height).toBeLessThan(body.y + body.height + 1);
  });
}

test('§1 the prompt stays on the bottom rail as commands land', async ({ page }) => {
  await open(page, TERMINAL_FREE_TEXT);

  const before = await boxOf(page, 'terminal-input');
  const input = page.getByTestId('terminal-input');
  await input.fill('git checkout -b feat/perfil');
  await input.press('Enter');
  await expect(page.getByTestId('terminal-transcript')).toContainText('feat/perfil');

  const after = await boxOf(page, 'terminal-input');
  // History fills the transcript from the top; the composer does not move.
  // Before 2026-08-10 this asserted the opposite (`after.y > before.y`) — see
  // the section header.
  expect(Math.abs(after.y - before.y), 'the prompt moved with the history').toBeLessThan(2);
});

test('§1 a long session scrolls INSIDE the terminal, and the box does not grow', async ({
  page,
}) => {
  await open(page, TERMINAL_FREE_TEXT);

  const bodyBefore = await boxOf(page, 'sandbox-window-body');
  const pageBefore = await page.evaluate(() => document.body.scrollHeight);

  // `git log` runs and unlocks nothing, so the activity never settles and the
  // prompt stays mounted. Twelve of them is far more than the box can hold.
  const input = page.getByTestId('terminal-input');
  for (let i = 0; i < 12; i += 1) {
    await input.fill('git log');
    await input.press('Enter');
  }

  const transcript = page.getByTestId('terminal-transcript');
  const overflow = await transcript.evaluate(
    (el) => el.scrollHeight - el.clientHeight,
  );
  expect(overflow, 'the transcript never overflowed - test is not exercising scroll').toBeGreaterThan(
    40,
  );

  const bodyAfter = await boxOf(page, 'sandbox-window-body');
  expect(Math.abs(bodyAfter.height - bodyBefore.height), 'the window grew with the history')
    .toBeLessThan(2);
  expect(
    await page.evaluate(() => document.body.scrollHeight),
    'the page grew with the history',
  ).toBeLessThan(pageBefore + 2);

  // The composer is still visible, which is the reason to scroll inside at all.
  const bar = await boxOf(page, 'terminal-prompt-bar');
  expect(bar.y + bar.height).toBeLessThan(bodyAfter.y + bodyAfter.height + 1);
});

test('§1 narrow viewport: the floor degrades instead of eating the screen', async ({ page }) => {
  // iPhone SE portrait — the case a hard 350px would dominate.
  await page.setViewportSize({ width: 375, height: 667 });
  await open(page, TERMINAL_OPTIONS);

  // 375x667 is a short phone: the 40dvh floor (~267px) is dropped for a 112px
  // minimum and the body follows its content, so it must sit well under it.
  expect(await expectedFloor(page)).toBe(SHORT_PHONE_FLOOR_PX);
  await expectShortPhoneBody(page);

  // The same width just over the 700px limit keeps the `min()` floor, bound by 40dvh.
  await page.setViewportSize({ width: 375, height: 701 });
  const tall = await boxOf(page, 'sandbox-window-body');
  const tallFloor = await expectedFloor(page);
  expect(tallFloor).toBeLessThan(BODY_FLOOR_PX - 20);
  expect(tall.height).toBeGreaterThan(tallFloor - 2);
  expect(tall.height).toBeLessThan(tallFloor + 2);
  await page.setViewportSize({ width: 375, height: 667 });

  // Still a terminal, and still bottom-railed.
  // The rail rule: nothing sits under the prompt bar but the body's own bottom
  // padding. Body and bar are read together, retried until the layout settles
  // (web fonts re-wrap the hint line), and the padding is measured, not assumed:
  // the body read before the 701px round trip may be stale.
  await expect
    .poll(
      async () => {
        const bodyNow = await boxOf(page, 'sandbox-window-body');
        const bar = await boxOf(page, 'terminal-prompt-bar');
        const padBottom = await page
          .getByTestId('sandbox-window-body')
          .evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
        return bodyNow.y + bodyNow.height - (bar.y + bar.height) - padBottom;
      },
      { message: 'something sits below the prompt bar besides the body padding' },
    )
    .toBeLessThan(2);

  // No horizontal overflow at 375px.
  const overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflowX, 'the page scrolls sideways at 375px').toBeLessThan(2);
});

test('§1 options: the palette stays OUTSIDE the terminal window', async ({ page }) => {
  await open(page, TERMINAL_OPTIONS);

  const win = await boxOf(page, 'sandbox-window');
  const controls = await boxOf(page, 'terminal-controls');

  // "ESCOLHA O COMANDO" is the third zone. Inside the window it would ride the
  // transcript's scroll area and disappear mid-session.
  expect(controls.y, 'the option palette moved inside the window').toBeGreaterThan(
    win.y + win.height - 1,
  );
});

/* ══════════════════════════════════════════════════════════════════════════
 * §2 — THE ACERTO GETS ITS OWN SIGNAL
 *
 * Before this, only failure was visible: a wrong command printed in red, a
 * right one printed in the ordinary colour, and "I did it" had to be inferred
 * from the ABSENCE of red. Both sides are asserted here — an assertion that
 * only checked the happy path would pass for a terminal that ticks every line.
 * ══════════════════════════════════════════════════════════════════════════ */

test('§2 the step-completing command is ticked, the failing one is not', async ({ page }) => {
  await open(page, TERMINAL_FREE_TEXT);
  const input = page.getByTestId('terminal-input');
  const marks = page.getByTestId('terminal-success-mark');

  // A command that errors: output, no tick.
  await input.fill('git commit -m "cedo demais"');
  await input.press('Enter');
  await expect(page.getByTestId('terminal-transcript')).toContainText('nada em stage');
  await expect(marks).toHaveCount(0);

  // A command that runs fine but unlocks nothing: still no tick.
  await input.fill('git log');
  await input.press('Enter');
  await expect(marks).toHaveCount(0);

  // The move the step asked for: ticked, exactly once.
  await input.fill('git checkout -b feat/perfil');
  await input.press('Enter');
  await expect(marks).toHaveCount(1);
  await expect(page.locator('[data-line-kind="out"]', { has: marks })).toContainText('feat/perfil');
});

/* ══════════════════════════════════════════════════════════════════════════
 * §3 — THE SAME ACTIVITY, IN BOTH LANGUAGES
 *
 * The plan is explicit that asserting a key exists in the dictionary is empty
 * verification. So this section runs the SAME activity twice and compares the
 * two renders against each other — never against an expected constant, which
 * would just be the dictionary restated.
 *
 * Three layers are checked, because they are localized by three different
 * mechanisms and each can rot alone:
 *   chrome  → the app dictionary (`terminal.*`)
 *   engine  → the package's `ResponseTable` of `{ pt, en }` templates
 *   prompt  → the player's bilingual `ps1` fallback
 *
 * ⚠️ NOT checked, because it CANNOT pass: strings the author writes into the
 * spec (`ps1`, `windowTitle`, `welcome`, `cannedOutput`, `unknownCommand`) are
 * `z.string()` in `@iterahq/activity-spec` and render verbatim in both locales.
 * `TERMINAL_PLAYER_CHROME` is the fixture that authors none of them. The gap is
 * pinned by an explicit test in `src/test/terminalRenderedLocale.test.tsx`.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Everything the player owns on screen, in one read. */
async function chromeOf(page: Page): Promise<Record<string, string>> {
  return {
    step: (await page.getByTestId('sandbox-instruction').textContent()) ?? '',
    placeholder: (await page.getByTestId('terminal-input').getAttribute('placeholder')) ?? '',
    hint: (await page.getByTestId('sandbox-hint-toggle').textContent()) ?? '',
    run: (await page.getByTestId('terminal-run').getAttribute('aria-label')) ?? '',
    restart: (await page.getByTestId('terminal-restart').textContent()) ?? '',
    empty: (await page.getByTestId('terminal-transcript').textContent()) ?? '',
  };
}

test('§3 every piece of chrome changes with the locale', async ({ page }) => {
  await open(page, TERMINAL_PLAYER_CHROME, 'pt');
  const pt = await chromeOf(page);
  await open(page, TERMINAL_PLAYER_CHROME, 'en');
  const en = await chromeOf(page);

  for (const key of Object.keys(pt)) {
    expect(en[key], `"${key}" is identical in both locales`).not.toBe(pt[key]);
    expect(en[key]!.trim().length, `"${key}" rendered empty`).toBeGreaterThan(0);
  }
});

test('§3 the prompt prefix and the engine output change with the locale', async ({ page }) => {
  const transcriptAfter = async (locale: Locale, line: string) => {
    await open(page, TERMINAL_PLAYER_CHROME, locale);
    const input = page.getByTestId('terminal-input');
    await input.fill(line);
    await input.press('Enter');
    await expect(page.getByTestId('terminal-transcript')).not.toBeEmpty();
    return (await page.getByTestId('terminal-transcript').textContent()) ?? '';
  };

  // The prompt prefix — §3 names it. Player-owned fallback, so it translates.
  const ptOk = await transcriptAfter('pt', 'git checkout -b feat/perfil');
  const enOk = await transcriptAfter('en', 'git checkout -b feat/perfil');
  expect(ptOk).toContain('aluno@itera');
  expect(enOk).toContain('student@itera');

  // A SUCCESS line, from the engine's response table.
  expect(ptOk).toContain('Mudou para o novo ramo');
  expect(enOk).toContain('Switched to a new branch');

  // An ERROR line. Both sides, as §3 asks.
  expect(await transcriptAfter('pt', 'git commit -m "cedo"')).toContain('nada em stage');
  expect(await transcriptAfter('en', 'git commit -m "too soon"')).toContain('nothing staged');
});

test('§3 no Portuguese survives in the en render', async ({ page }) => {
  await open(page, TERMINAL_PLAYER_CHROME, 'en');
  const input = page.getByTestId('terminal-input');
  await input.fill('git commit -m "too soon"');
  await input.press('Enter');
  await expect(page.getByTestId('terminal-transcript')).toContainText('nothing staged');

  // The activity's own subtree — not the app shell, which is out of this plan's
  // scope, and not authored content, which this fixture deliberately has none of.
  const rendered = (await page.locator('[data-sandbox-kind="terminal"]').innerText()).toLowerCase();
  for (const word of [
    'passo',
    'dica',
    'recomeçar',
    'rodar',
    'digite',
    'escolha',
    'nada em stage',
    'mudou para',
    'aluno@',
  ]) {
    expect(rendered, `"${word}" leaked into the en render`).not.toContain(word);
  }
});

/* ══════════════════════════════════════════════════════════════════════════
 * §4 — SUBMISSION DIFFERS BY INPUT MODE
 *
 *   free text          → type it, then Enter / Run
 *   whole-command chip → ONE TAP SENDS, and no Run button exists
 *   token chips        → build the line, then Run
 *
 * The Run button used to render in all three, permanently disabled in the tap
 * surface. A control that never does anything is not neutral: it promises a
 * second step, and the learner waits for it.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Commands actually executed — the only honest counter for "did it submit". */
function ranCommands(page: Page) {
  return page.locator('[data-testid="terminal-transcript"] [data-line-kind="cmd"]');
}

test('§4 free text: Enter submits, and the Run button is present', async ({ page }) => {
  await open(page, TERMINAL_FREE_TEXT);
  await expect(page.getByTestId('terminal-prompt-bar')).toHaveAttribute('data-submit-mode', 'enter');
  await expect(page.getByTestId('terminal-run')).toBeVisible();

  await expect(ranCommands(page)).toHaveCount(0);
  const input = page.getByTestId('terminal-input');
  await input.fill('git checkout -b feat/perfil');
  await input.press('Enter');
  await expect(ranCommands(page)).toHaveCount(1);
});

test('§4 whole-command options: one tap submits, with no Run button at all', async ({ page }) => {
  await open(page, TERMINAL_OPTIONS);
  await expect(page.getByTestId('terminal-prompt-bar')).toHaveAttribute('data-submit-mode', 'tap');
  await expect(page.getByTestId('terminal-run')).toHaveCount(0);

  await page.getByTestId('terminal-option-command').filter({ hasText: 'git branch' }).click();
  // One click, one command — no second action was needed or available.
  await expect(ranCommands(page)).toHaveCount(1);
});

test('§4 token options: chips do NOT submit, Run submits once', async ({ page }) => {
  await open(page, TERMINAL_OPTIONS);

  // Clear the tap step to reach the token step — the ramp is per-step (tsq2 → C).
  await page.getByTestId('terminal-option-command').filter({ hasText: 'checkout -b' }).click();
  await expect(page.getByTestId('terminal-prompt-bar')).toHaveAttribute(
    'data-submit-mode',
    'assemble',
  );
  await expect(page.getByTestId('terminal-run')).toBeVisible();

  const before = await ranCommands(page).count();
  await page.getByTestId('terminal-option-token').filter({ hasText: /^git$/ }).click();
  await page.getByTestId('terminal-option-token').filter({ hasText: /^status$/ }).click();
  // Two taps, zero commands. The line is only being composed.
  await expect(ranCommands(page)).toHaveCount(before);

  await page.getByTestId('terminal-run').click();
  await expect(ranCommands(page)).toHaveCount(before + 1);
});

/* ══════════════════════════════════════════════════════════════════════════
 * §5 — "MONTAR COMANDO" IS A TRAY OF CHIPS, NOT A TEXT INPUT
 *
 * The palette and the prompt are two sides of ONE set, and the interaction is
 * TRANSFER: a chip tapped below leaves the tray and appears above as a pill; a
 * pill tapped above goes back down. The invariant every assertion leans on is
 * that the two sides always sum to the authored list — which is what makes
 * "the chip moved" checkable instead of "something appeared somewhere".
 * ══════════════════════════════════════════════════════════════════════════ */

test('§5 chips transfer both ways, and the two sides always sum', async ({ page }) => {
  await open(page, TERMINAL_OPTIONS);
  // Clear the tap step to reach the token step.
  await page.getByTestId('terminal-option-command').filter({ hasText: 'checkout -b' }).click();

  const palette = page.getByTestId('terminal-option-token');
  const pills = page.getByTestId('terminal-pill');
  const authored = await palette.count();
  expect(authored).toBeGreaterThan(2);
  await expect(pills).toHaveCount(0);

  // UP: out of the tray, into the prompt.
  await palette.filter({ hasText: /^git$/ }).click();
  await expect(palette).toHaveCount(authored - 1);
  await expect(pills).toHaveCount(1);
  await expect(page.getByTestId('terminal-option-token').filter({ hasText: /^git$/ })).toHaveCount(
    0,
  );

  await palette.filter({ hasText: /^status$/ }).click();
  await expect(page.getByTestId('terminal-draft')).toHaveAttribute('data-draft', 'git status');
  expect((await palette.count()) + (await pills.count())).toBe(authored);

  // DOWN: tap the pill, it returns to the tray.
  await pills.first().click();
  await expect(pills).toHaveCount(1);
  await expect(palette).toHaveCount(authored - 1);
  await expect(page.getByTestId('terminal-draft')).toHaveAttribute('data-draft', 'status');
  expect((await palette.count()) + (await pills.count())).toBe(authored);
});

test('§5 the composed line is pills, and running it returns them all', async ({ page }) => {
  await open(page, TERMINAL_OPTIONS);
  await page.getByTestId('terminal-option-command').filter({ hasText: 'checkout -b' }).click();

  const palette = page.getByTestId('terminal-option-token');
  const authored = await palette.count();
  // `git log` on purpose: it RUNS but unlocks nothing, so the activity does not
  // settle and the tray is still mounted to be counted. Composing the winning
  // command here would end the activity and unmount the thing under test.
  await palette.filter({ hasText: /^git$/ }).click();
  await palette.filter({ hasText: /^log$/ }).click();

  // Each chip is its own control — that is what makes the return trip clickable.
  await expect(page.getByTestId('terminal-pill')).toHaveCount(2);
  await expect(page.getByTestId('terminal-pill').first()).toHaveAttribute('aria-label', /git/);

  await page.getByTestId('terminal-run').click();
  await expect(page.getByTestId('terminal-transcript')).toContainText('git log');
  await expect(page.getByTestId('terminal-pill')).toHaveCount(0);
  await expect(palette).toHaveCount(authored);
});

/* ══════════════════════════════════════════════════════════════════════════
 * §6 — ON A PHONE, THE PROMPT PREFIX GIVES ITS WIDTH BACK TO THE LEARNER
 *
 * Tainan, TG 2026-08-10, with a phone screenshot of the composer: *"no mobile
 * não aparece o input completo, talvez no mobile mostrar só $ para aparecer o
 * restante do input"*. In that screenshot the typed command was clipped to TWO
 * characters. `aluno@itera:~/meu-projeto$` is 26 monospace glyphs — ~200px at
 * 13px — and it is `shrink-0` (correctly: a prefix that shrinks is a prefix
 * that lies), so on a 375px screen the only element left to squeeze was the
 * learner's own line.
 *
 * ── WHAT THESE ASSERTIONS ARE ABOUT, AND WHAT THEY ARE NOT ─────────────────
 * The first test is the bug, stated as a measurement: at 375px the composer
 * must hold a real command with NO horizontal clipping. It is deliberately not
 * "the short span is visible" — that would pass for a `$` sitting next to an
 * input that is still 40px wide, which is the failure, not the fix. The
 * visibility checks are the second test, and they exist to say WHICH mechanism
 * produced the width, so a red run points at a cause.
 *
 * ── THE REGRESSION RISK IS THE DESKTOP, NOT THE PHONE ──────────────────────
 * `#339` tuned this window a few hours before this change. So §6 also asserts
 * the desktop render is UNCHANGED (full prefix, no sigil), and re-checks the
 * §1 floor and bottom rail at 375px in BOTH input modes — the layout that just
 * landed has to survive a change to its first child.
 * ══════════════════════════════════════════════════════════════════════════ */

/** iPhone SE portrait — below Tailwind's `sm` (640px), and the width he shot. */
const PHONE = { width: 375, height: 667 };

/** The command the free-text scenario's own hint tells the learner to type. */
const REAL_COMMAND = 'git checkout -b feat/perfil';

/**
 * How many characters of their own text the learner can see AT ONCE.
 *
 * Measured, not assumed: a 60-glyph probe is far wider than the field, so the
 * input's `scrollWidth` is the CONTENT width and the division gives the real
 * advance of the rendered monospace face — no hard-coded 7.8px that goes stale
 * the day the font or the `text-[13px]` changes.
 *
 * ⚠️ The probe is written straight onto the DOM node and put back, NOT typed
 * with `fill()`. `fill()` waits for actionability, and the exact regression
 * this function exists to measure — the composer squeezed to a sliver by a
 * full-length prefix — is *not visible* to Playwright, so the number would be
 * replaced by a 45-second timeout that names the probe instead of the width.
 * Measured with the fix reverted: this returns ~2.3, and `fill()` times out.
 * The value is restored before returning, so React's controlled state and the
 * DOM still agree.
 */
async function visibleChars(page: Page): Promise<number> {
  return page.getByTestId('terminal-input').evaluate((el: HTMLInputElement, n) => {
    const before = el.value;
    el.value = 'x'.repeat(n);
    const chars = el.clientWidth / (el.scrollWidth / n);
    el.value = before;
    return chars;
  }, 60);
}

test('§6 phone: the composer is wide enough to read what you type', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, TERMINAL_FREE_TEXT);

  // THE ASSERTION, in the unit Tainan used — he counted characters, not pixels:
  // his screenshot showed TWO. Measured on this build: ~25 with the sigil, ~2
  // with the full prefix, so the floor sits an order of magnitude away from
  // both and states a property rather than pinning today's layout.
  const chars = await visibleChars(page);
  expect(chars, `only ${chars.toFixed(1)} characters of the typed line are visible`).toBeGreaterThan(
    20,
  );

  // A real command is then READABLE — at most a couple of glyphs scroll out of
  // the field, which is ordinary text-input behaviour and not the bug.
  const input = page.getByTestId('terminal-input');
  await input.fill(REAL_COMMAND);
  await expect(input).toHaveValue(REAL_COMMAND);
  expect(chars, `"${REAL_COMMAND}" is ${REAL_COMMAND.length} characters`).toBeGreaterThan(
    REAL_COMMAND.length - 4,
  );

  // …and the composer is most of the bar, not a sliver beside the prefix.
  const bar = await boxOf(page, 'terminal-prompt-bar');
  const box = await boxOf(page, 'terminal-input');
  expect(box.width / bar.width, 'the composer is a sliver of the prompt bar').toBeGreaterThan(0.7);

  // Nothing has escaped sideways, and the Run button is still reachable.
  await expect(page.getByTestId('terminal-run')).toBeVisible();
  const overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflowX, 'the page scrolls sideways at 375px').toBeLessThan(2);

  // The command still RUNS, and the transcript echoes the FULL prefix — the
  // `user@host:dir` context is displaced, not deleted.
  await input.press('Enter');
  await expect(page.getByTestId('terminal-transcript')).toContainText('aluno@itera');
});

for (const fx of [TERMINAL_FREE_TEXT, TERMINAL_OPTIONS]) {
  const surface = fx === TERMINAL_FREE_TEXT ? 'freeText' : 'options';

  test(`§6 ${surface}: the phone sees the sigil, the desktop sees the full prefix`, async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await open(page, fx);

    await expect(page.getByTestId('terminal-ps1-short')).toBeVisible();
    await expect(page.getByTestId('terminal-ps1-short')).toHaveText('$');
    await expect(page.getByTestId('terminal-ps1-full')).toBeHidden();
    // The authored prompt is never rewritten — only its rendering is chosen.
    await expect(page.getByTestId('terminal-ps1')).toHaveAttribute('data-ps1', /aluno@itera/);

    // DESKTOP — the state `#339` tuned, which must not have moved.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId('terminal-ps1-full')).toBeVisible();
    await expect(page.getByTestId('terminal-ps1-full')).toHaveText(/aluno@itera/);
    await expect(page.getByTestId('terminal-ps1-short')).toBeHidden();
  });

  test(`§6 ${surface}: the #339 window survives at 375px`, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await open(page, fx);

    // Same two properties §1 owns, re-measured with the prefix shortened: the
    // short-phone window never collapses, and the prompt is still the bottom rail.
    const body = await boxOf(page, 'sandbox-window-body');
    await expectShortPhoneBody(page);

    const bar = await boxOf(page, 'terminal-prompt-bar');
    const belowBar = body.y + body.height - (bar.y + bar.height);
    expect(belowBar, `${belowBar}px of body left below the prompt bar`).toBeLessThan(20);
    expect(belowBar).toBeGreaterThan(-1);

    // The bar is ONE line: a prefix that wrapped would push the window past its
    // floor, which is the failure `TERMINAL_BODY`'s `min-h` was left open for.
    expect(bar.height, `the prompt bar wrapped to ${bar.height}px`).toBeLessThan(56);
  });
}

for (const width of [360, 390]) {
  test(`§6 options: the draft hint is shown in full at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page, TERMINAL_OPTIONS);

    const hint = await page.getByTestId('terminal-draft').evaluate((el) => ({
      clippedX: el.scrollWidth - el.clientWidth,
      clippedY: el.scrollHeight - el.clientHeight,
      ellipsis: getComputedStyle(el).whiteSpace === 'nowrap',
    }));
    expect(hint.ellipsis, 'the hint is still a single truncated line').toBe(false);
    expect(hint.clippedX).toBeLessThan(2);
    expect(hint.clippedY).toBeLessThan(2);
  });
}

/* ══════════════════════════════════════════════════════════════════════════
 * §7 — THE CHAT KIND STILL RENDERS THE CHAT
 *
 * Nothing else in either suite mounts `chat_sandbox`, so a regression in its
 * dispatch would be green everywhere and blank on screen.
 *
 * There is no `terminal_sandbox` twin of this test, and that is not a gap: since
 * 0.12.0 the terminal spec parses under NO other kind, so every `open()` above
 * already mounts `terminal_sandbox` — the dispatch is asserted by the whole file
 * rather than by one case.
 * ══════════════════════════════════════════════════════════════════════════ */

test('§7 chat_sandbox mounts the chat, not the invalid card', async ({ page }) => {
  await installHarnessSubstrate(page, ALL_FIXTURES);
  await page.goto(harnessUrl(CHAT_SANDBOX));

  await expect(page.getByTestId('activity-test-harness')).toBeVisible();
  await expect(page.locator('[data-invalid-spec="true"]')).toHaveCount(0);
  await expect(page.getByTestId('sandbox-window')).toBeVisible();
  await expect(page.getByTestId('terminal-transcript')).toHaveCount(0);
});

