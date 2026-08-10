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
  CHAT_SANDBOX_MIGRATED,
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
}

/* ══════════════════════════════════════════════════════════════════════════
 * §1 — THE PROMPT IS BORN AT THE TOP
 *
 * The transcript used to be a FIXED `h-[34dvh] min-h-[220px]` pane, so on the
 * first frame the window reserved ~220px for one welcome line and parked the
 * prompt at the bottom of it. The learner met a dead gap between the context
 * line and the cursor. A terminal grows DOWNWARD: the cursor starts glued to
 * the last line and the history pushes it.
 *
 * ── WHY NOT THE PLAN'S LITERAL PROXY ───────────────────────────────────────
 * The plan proposed "the input box's `top` is less than half the panel height".
 * That proxy is UNSATISFIABLE once the fix lands, and it was already failing
 * before it — measured on Desktop Chrome, `sandbox-window` at y=355:
 *
 *   before the fix:  window height ~332px (36 chrome + 220 reserved + prompt),
 *                    prompt top ~639  vs midline ~521  → BELOW the midline
 *   after  the fix:  window height  152px, prompt top 462 vs midline 431
 *                    → still BELOW the midline
 *
 * The reason is structural: the prompt bar is the LAST child of a window that
 * now shrinks to its content, so it necessarily occupies the bottom slice. The
 * midline says nothing about the gap — it only measures how much history there
 * is. What actually distinguishes the two screenshots is SLACK: 199px of
 * reserved emptiness before, 0px after. So that is what is asserted here, on
 * both surfaces, plus the gap to the prompt and the downward growth.
 * ══════════════════════════════════════════════════════════════════════════ */

async function boxOf(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox();
  expect(box, `${testId} must have a layout box`).not.toBeNull();
  return box!;
}

for (const fx of [TERMINAL_FREE_TEXT, TERMINAL_OPTIONS]) {
  const surface = fx === TERMINAL_FREE_TEXT ? 'freeText' : 'options';
  const promptTestId = surface === 'freeText' ? 'terminal-input' : 'terminal-draft';

  test(`§1 ${surface}: the transcript reserves no empty space`, async ({ page }) => {
    await open(page, fx);

    const transcript = await boxOf(page, 'terminal-transcript');
    const lastLine = await boxOf(page, 'transcript-last-line');

    // How much of the transcript box is blank below its own content.
    const slack = transcript.height - (lastLine.y + lastLine.height - transcript.y);
    expect(slack, `transcript reserved ${slack}px of empty space below its content`).toBeLessThan(
      8,
    );
  });

  test(`§1 ${surface}: no dead gap between the last line and the prompt`, async ({ page }) => {
    await open(page, fx);

    const lastLine = await boxOf(page, 'transcript-last-line');
    const promptBox = await boxOf(page, promptTestId);

    const gap = promptBox.y - (lastLine.y + lastLine.height);
    expect(gap, `gap between last transcript line and prompt was ${gap}px`).toBeLessThan(48);
    expect(gap).toBeGreaterThanOrEqual(0);
  });
}

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

test('§1 the transcript GROWS downward as commands land', async ({ page }) => {
  await open(page, TERMINAL_FREE_TEXT);

  const before = await boxOf(page, 'terminal-input');
  const input = page.getByTestId('terminal-input');
  await input.fill('git checkout -b feat/perfil');
  await input.press('Enter');
  await expect(page.getByTestId('terminal-transcript')).toContainText('feat/perfil');

  const after = await boxOf(page, 'terminal-input');
  // The history pushed the prompt DOWN. A fixed-height pane would leave it put,
  // which is exactly the regression this file exists to catch.
  expect(after.y).toBeGreaterThan(before.y);
});

/* ══════════════════════════════════════════════════════════════════════════
 * §7 — THE MIGRATED CHAT KIND STILL RENDERS THE CHAT
 *
 * `chat_sandbox` is a kind the DB can hold (migration 0057) and no row uses yet:
 * all 48 live sandbox rows are still `sandbox_scenario`. Nothing else in either
 * suite mounts it, so a player that only dispatched the legacy kind would be
 * green everywhere and then blank the screen the day the rows move. This is the
 * fixtures' own post-migration shape, so a difference here is a difference in the
 * DISPATCH and nothing else.
 *
 * There is no `terminal_sandbox` twin of this test any more, and that is not a
 * gap: since 0.12.0 the terminal spec parses under NO other kind, so every
 * `open()` above already mounts `terminal_sandbox` — the dispatch is asserted by
 * the whole file rather than by one case. `CHAT_SANDBOX_MIGRATED` keeps its own
 * test because the legacy kind can still hold a chat spec, so its dispatch is the
 * one that can silently go missing.
 * ══════════════════════════════════════════════════════════════════════════ */

test('§7 chat_sandbox mounts the chat, not the invalid card', async ({ page }) => {
  await installHarnessSubstrate(page, ALL_FIXTURES);
  await page.goto(harnessUrl(CHAT_SANDBOX_MIGRATED));

  await expect(page.getByTestId('activity-test-harness')).toBeVisible();
  await expect(page.locator('[data-invalid-spec="true"]')).toHaveCount(0);
  await expect(page.getByTestId('sandbox-window')).toBeVisible();
  await expect(page.getByTestId('terminal-transcript')).toHaveCount(0);
});
