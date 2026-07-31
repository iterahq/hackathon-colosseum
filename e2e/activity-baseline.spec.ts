/**
 * ACTIVITY CHARACTERIZATION BASELINE — sub-plano 0 of
 * `20260731-itera-eventos-aprendizagem`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * READ THIS BEFORE CHANGING ANY ASSERTION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is a CHARACTERIZATION suite, not a correctness suite. Its job is to
 * describe what the activity layer does TODAY — including the parts that are
 * arguably wrong — so that the reducer refactor (sub-plano 1) can be judged by
 * a diff instead of by opinion.
 *
 * **Corollary, and it is binding: a test here that encodes WRONG behaviour is
 * still the baseline.** If you believe an assertion below describes a bug, the
 * correct move is to fix the PRODUCT in a separate PR and update this file in
 * that same PR, deliberately. Quietly "fixing" an assertion here destroys the
 * only property the suite has — that a red run means BEHAVIOUR MOVED.
 *
 * Every assertion that freezes something questionable is marked `🧊 FROZEN`
 * with what is odd about it. Those markers are the handover to sub-plano 1.
 *
 * ── Scope, and what is deliberately NOT here ────────────────────────────────
 *
 * Surface: the AUTHOR TEST HARNESS (`/author/activities/:id/test`) — Q1,
 * answered "harness". So `reveal`, `live`, `status: 'done'` and the LessonPlayer
 * chrome are all out of frame: the harness mounts `<ActivityRenderer>` with
 * `reveal`/`live` unset, and those axes are already covered exhaustively by
 * `src/utils/answerMachine.test.ts` (all 32 combinations) and the story tests.
 *
 * NOT covered, on purpose: progression, persistence, XP, lesson advance. The
 * harness never calls `persistActivityProgress` — that is what makes this suite
 * safe, and the refactor does not touch that path (V4 / the plan's own note).
 *
 * NOT covered, and it is a DECLARED HOLE: `concept_reveal`. See the last test.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  ALL_FIXTURES,
  CONCEPT,
  DOCUMENT_READONLY,
  DOCUMENT_REFLECTION,
  DIAGRAM,
  QUIZ,
  SINGLE_CHOICE,
  MULTI_CHOICE,
  MATCH,
  ORDER,
  CODE_NO_CHECKS,
  CODE_WITH_CHECKS,
  CODE_WITH_FAILING_CHECKS,
  VIDEO,
  SANDBOX_SCENARIO,
  CONCEPT_REVEAL,
  INVALID_SINGLE_CHOICE,
  INVALID_CODE,
  type ActivityFixture,
} from './support/activityFixtures';
import { installHarnessSubstrate, harnessUrl } from './support/harnessStub';

/* ══════════════════════════════════════════════════════════════════════════
 * Helpers
 * ══════════════════════════════════════════════════════════════════════════ */

/** Open a fixture in the author harness and wait for the harness to mount. */
async function open(page: Page, fx: ActivityFixture): Promise<void> {
  await installHarnessSubstrate(page, ALL_FIXTURES);
  await page.goto(harnessUrl(fx));
  await expect(page.getByTestId('activity-test-harness')).toBeVisible();
  // The route's own failure modes must not masquerade as a rendered activity.
  await expect(page.getByTestId('activity-not-found')).toHaveCount(0);
  await expect(page.getByTestId('test-load-error')).toHaveCount(0);
}

/** The renderer dispatched to the kind we asked for, and not to the fallback. */
async function expectDispatchedTo(page: Page, kind: string): Promise<void> {
  await expect(page.locator(`[data-activity-kind="${kind}"]`).first()).toBeVisible();
  await expect(page.locator('[data-activity-kind="unknown"]')).toHaveCount(0);
  // A spec that failed its Zod boundary renders the friendly invalid card
  // instead of the kind — which would silently characterize the WRONG screen.
  await expect(page.locator('[data-invalid-spec="true"]')).toHaveCount(0);
}

/** The harness's in-memory verdict row. */
const verdict = (page: Page): Locator => page.getByTestId('test-verdict');

async function expectVerdict(page: Page, correct: boolean): Promise<void> {
  await expect(verdict(page)).toBeVisible();
  await expect(verdict(page)).toHaveAttribute('data-correct', String(correct));
  // The harness labels every verdict "not saved" — the visible half of V4.
  await expect(page.getByTestId('test-reset')).toBeVisible();
}

async function expectNoVerdict(page: Page): Promise<void> {
  await expect(verdict(page)).toHaveCount(0);
}

/**
 * Pick an option by its LABEL, never by index.
 *
 * ⚠️ `single_choice`, `multi_choice`, `match` and `order` shuffle with
 * `seededShuffle(items, Math.random().toString(36))` — a fresh RANDOM seed on
 * every mount. DOM order is therefore not reproducible across runs, and index
 * selection would make this suite flaky-by-construction.
 *
 * 🚩 DRIFT SIGNAL (reported, not fixed here): the option elements expose **no
 * `data-option-id`**, so the authored id — the thing grading actually keys on —
 * is unreachable from the DOM. Matching on user-visible text is the only handle
 * available. A `data-option-id` on `single-choice-option` / `multi-choice-option`
 * / `match-*-card` / `order-item` would make this whole class of test address
 * the real identity instead of a rendering of it.
 */
function optionByLabel(page: Page, testId: string, label: string): Locator {
  return page.getByTestId(testId).filter({ hasText: label }).first();
}

/**
 * Selection-sort `order-item` into the target label sequence using `order-up`.
 * Mirrors `src/stories/interactions.ts::arrangeOrder`, which is the recipe the
 * repo's own story/unit tests use — same mechanic, same guarantees.
 * Re-queries after every click because React re-renders the whole `<ol>`.
 */
async function arrangeOrder(page: Page, labels: readonly string[]): Promise<void> {
  for (let target = 0; target < labels.length; target++) {
    for (;;) {
      const items = page.getByTestId('order-item');
      const texts = await items.allInnerTexts();
      const at = texts.findIndex((t) => t.includes(labels[target]!));
      if (at <= target) break;
      await items.nth(at).getByTestId('order-up').click();
    }
  }
}

/** Read the current `order-item` label sequence, for asserting an arrangement. */
async function orderLabels(page: Page): Promise<string[]> {
  return page.getByTestId('order-item').allInnerTexts();
}

/** Tap-to-pair: arm a left card, then tap the right card. NOT drag. */
async function connectPair(page: Page, left: string, right: string): Promise<void> {
  await optionByLabel(page, 'match-left-card', left).click();
  await optionByLabel(page, 'match-right-card', right).click();
}

/* ══════════════════════════════════════════════════════════════════════════
 * 1 · EXPOSITION KINDS — a verdict exists, but only ever `true`.
 * ══════════════════════════════════════════════════════════════════════════ */

test.describe('exposição — kinds sem caminho de erro', () => {
  for (const fx of [DIAGRAM, VIDEO, DOCUMENT_READONLY, CODE_NO_CHECKS] as const) {
    test(`${fx.label}: "Marcar como concluída" → veredito CORRETO`, async ({ page }) => {
      await open(page, fx);
      await expectDispatchedTo(page, fx.kind);
      await page.getByTestId('activity-done').click();
      await expectVerdict(page, true);
    });

    test(`${fx.label}: 🧊 FROZEN — não existe caminho para veredito INCORRETO`, async ({ page }) => {
      await open(page, fx);
      // The ONLY affordance is `activity-done`, which is hard-wired to
      // `onComplete(true)`. There is no submit, no grading, no wrong answer.
      // Frozen as an inventory fact: if the refactor ever gives one of these a
      // false verdict, this assertion is what notices.
      await expect(page.getByTestId('activity-done')).toBeVisible();
      await expect(page.locator('[data-testid$="-submit"]')).toHaveCount(0);
      await expectNoVerdict(page);
    });
  }

  test('video: 🧊 FROZEN — o "concluir" NÃO exige assistir ao vídeo', async ({ page }) => {
    await open(page, VIDEO);
    await expect(page.getByTestId('video-player')).toBeVisible();
    // No watch gate of any kind: Done is enabled from the first paint. Also
    // note `video-skeleton` never clears here — the media never loads in a
    // hermetic run — and Done works anyway. Both are today's behaviour.
    await page.getByTestId('activity-done').click();
    await expectVerdict(page, true);
  });

  test('diagram: 🧊 FROZEN — `mermaid` é exibido como TEXTO, não como diagrama', async ({ page }) => {
    await open(page, DIAGRAM);
    // There is no mermaid dependency in package.json; the spec's `mermaid`
    // source is dumped into a <pre>. Freezing it so a future renderer change is
    // a deliberate, visible diff rather than a surprise.
    await expect(page.getByTestId('activity-shell')).toContainText('graph TD');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2 · `concept` — the kind that cannot complete in this surface at all.
 * ══════════════════════════════════════════════════════════════════════════ */

test.describe('concept', () => {
  test('renderiza o InstructionPanel', async ({ page }) => {
    await open(page, CONCEPT);
    await expectDispatchedTo(page, 'concept');
    await expect(page.getByTestId('instruction-panel')).toBeVisible();
    await expect(page.getByTestId('instruction-text')).toBeVisible();
  });

  test('🧊 FROZEN — no harness do autor NÃO existe afordância de conclusão', async ({ page }) => {
    await open(page, CONCEPT);
    // `ConceptActivity` never calls `onComplete`. The continue button
    // (`concept-continue`) is rendered by the LESSON PLAYER's shell, not by the
    // activity — so on this route a `concept` can never reach a verdict.
    //
    // 🚩 This also means the pre-existing `e2e/author-activity-kinds.spec.ts`
    // case `{ kind: 'concept', depth: 'verdict', drive: markDone }` is WRONG:
    // it clicks `activity-done`, which this kind does not render. It only stays
    // green because that suite's persona never discovers a concept and skips.
    // NOT FIXED HERE — characterization only.
    await expect(page.getByTestId('activity-done')).toHaveCount(0);
    await expect(page.getByTestId('concept-continue')).toHaveCount(0);
    await expectNoVerdict(page);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3 · `document` — the reflection gate.
 * ══════════════════════════════════════════════════════════════════════════ */

test.describe('document (reflexão com rubric.min_words)', () => {
  test('abaixo do mínimo: "concluir" fica BLOQUEADO e não há veredito', async ({ page }) => {
    await open(page, DOCUMENT_REFLECTION);
    await expectDispatchedTo(page, 'document');
    await expect(page.getByTestId('document-min-words')).toBeVisible();
    await page.getByTestId('document-reflection-input').fill('curto demais');
    await expect(page.getByTestId('document-word-count')).toContainText('2');
    await expect(page.getByTestId('activity-done')).toBeDisabled();
    await expectNoVerdict(page);
  });

  test('atingindo o mínimo: libera e conclui CORRETO', async ({ page }) => {
    await open(page, DOCUMENT_REFLECTION);
    await page
      .getByTestId('document-reflection-input')
      .fill('uma resposta suficientemente longa para satisfazer o mínimo de palavras exigido aqui');
    await expect(page.getByTestId('activity-done')).toBeEnabled();
    await page.getByTestId('activity-done').click();
    await expectVerdict(page, true);
  });

  test('🧊 FROZEN — o texto NÃO é avaliado: qualquer palavreado suficiente é CORRETO', async ({ page }) => {
    await open(page, DOCUMENT_REFLECTION);
    // The gate is a word COUNT, nothing else. Ten unrelated words pass.
    await page
      .getByTestId('document-reflection-input')
      .fill('um dois três quatro cinco seis sete oito nove dez');
    await page.getByTestId('activity-done').click();
    await expectVerdict(page, true);
  });

  test('🧊 FROZEN — o variante "somente leitura" também mostra o textarea de reflexão', async ({ page }) => {
    await open(page, DOCUMENT_READONLY);
    // `DocumentActivity` takes the reflection branch whenever `spec.prompt` is
    // present OR `min_words > 0`. A spec with only `body`/`title` is the ONLY
    // shape that reaches the plain read-only screen — so "document without a
    // rubric" is not the read-only variant most people assume it is.
    await expect(page.getByTestId('document-reflection-input')).toHaveCount(0);
    await expect(page.getByTestId('document-min-words')).toHaveCount(0);
    await expect(page.getByTestId('activity-done')).toBeEnabled();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4 · GRADED KINDS — acerto E erro, which is the point of the whole suite.
 * ══════════════════════════════════════════════════════════════════════════ */

test.describe('quiz', () => {
  test('opção com isCorrect → veredito CORRETO', async ({ page }) => {
    await open(page, QUIZ);
    await expectDispatchedTo(page, 'quiz');
    // Quiz is the ONE choice kind that does NOT shuffle — options render in
    // spec order. Still matched by label, for uniformity with its siblings.
    await optionByLabel(page, 'quiz-option', 'FALSO').click();
    await page.getByTestId('quiz-submit').click();
    await expectVerdict(page, true);
  });

  test('opção errada → veredito INCORRETO + explicação', async ({ page }) => {
    await open(page, QUIZ);
    await optionByLabel(page, 'quiz-option', 'VERDADEIRO').click();
    await page.getByTestId('quiz-submit').click();
    await expectVerdict(page, false);
    // `answer-explanation` renders on a WRONG submit only.
    await expect(page.getByTestId('answer-explanation')).toBeVisible();
  });

  test('🧊 FROZEN — acerto NÃO mostra a explicação', async ({ page }) => {
    await open(page, QUIZ);
    await optionByLabel(page, 'quiz-option', 'FALSO').click();
    await page.getByTestId('quiz-submit').click();
    await expectVerdict(page, true);
    await expect(page.getByTestId('answer-explanation')).toHaveCount(0);
  });

  test('🧊 FROZEN — não há retentativa no lugar; só o reset do harness', async ({ page }) => {
    await open(page, QUIZ);
    await optionByLabel(page, 'quiz-option', 'VERDADEIRO').click();
    await page.getByTestId('quiz-submit').click();
    await expectVerdict(page, false);
    // `answerMachine`: locked = submitted || done || reveal. The submit locks
    // and the activity offers NO way back. Only the harness's own remount does.
    await expect(page.getByTestId('quiz-submit')).toHaveAttribute('data-submitted', 'true');
    await page.getByTestId('test-reset').click();
    await expectNoVerdict(page);
    await expect(page.getByTestId('quiz-submit')).toBeDisabled();
  });
});

test.describe('single_choice', () => {
  test('submit começa DESABILITADO até haver resposta', async ({ page }) => {
    await open(page, SINGLE_CHOICE);
    await expectDispatchedTo(page, 'single_choice');
    await expect(page.getByTestId('single-choice-submit')).toBeDisabled();
  });

  test('correct_option_id → veredito CORRETO', async ({ page }) => {
    await open(page, SINGLE_CHOICE);
    await optionByLabel(page, 'single-choice-option', 'Guardar uma informação').click();
    await page.getByTestId('single-choice-submit').click();
    await expectVerdict(page, true);
  });

  test('distrator → veredito INCORRETO', async ({ page }) => {
    await open(page, SINGLE_CHOICE);
    await optionByLabel(page, 'single-choice-option', 'Mudar a cor do computador').click();
    await page.getByTestId('single-choice-submit').click();
    await expectVerdict(page, false);
  });
});

test.describe('multi_choice', () => {
  test('conjunto EXATO → veredito CORRETO', async ({ page }) => {
    await open(page, MULTI_CHOICE);
    await expectDispatchedTo(page, 'multi_choice');
    for (const label of ['só registra quando', 'não some sozinho', 'para e pergunta']) {
      await optionByLabel(page, 'multi-choice-option', label).click();
    }
    await page.getByTestId('multi-choice-submit').click();
    await expectVerdict(page, true);
  });

  test('subconjunto das corretas → veredito INCORRETO', async ({ page }) => {
    await open(page, MULTI_CHOICE);
    // Grading is exact SET equality, not "contains only correct ones": a
    // strictly-correct-but-incomplete answer is wrong.
    await optionByLabel(page, 'multi-choice-option', 'só registra quando').click();
    await page.getByTestId('multi-choice-submit').click();
    await expectVerdict(page, false);
  });

  test('corretas + distrator → veredito INCORRETO', async ({ page }) => {
    await open(page, MULTI_CHOICE);
    for (const label of [
      'só registra quando',
      'não some sozinho',
      'para e pergunta',
      'salva sozinho de minuto',
    ]) {
      await optionByLabel(page, 'multi-choice-option', label).click();
    }
    await page.getByTestId('multi-choice-submit').click();
    await expectVerdict(page, false);
  });
});

test.describe('match', () => {
  test('submit só libera com TODOS os pares formados', async ({ page }) => {
    await open(page, MATCH);
    await expectDispatchedTo(page, 'match');
    await expect(page.getByTestId('match-submit')).toBeDisabled();
    await connectPair(page, 'git commit', 'registra uma mudança');
    await expect(page.getByTestId('match-submit')).toBeDisabled();
    await connectPair(page, 'git branch', 'cria uma linha paralela');
    await expect(page.getByTestId('match-submit')).toBeEnabled();
  });

  test('pares corretos → veredito CORRETO', async ({ page }) => {
    await open(page, MATCH);
    await connectPair(page, 'git commit', 'registra uma mudança');
    await connectPair(page, 'git branch', 'cria uma linha paralela');
    await page.getByTestId('match-submit').click();
    await expectVerdict(page, true);
  });

  test('pares cruzados → veredito INCORRETO', async ({ page }) => {
    await open(page, MATCH);
    await connectPair(page, 'git commit', 'cria uma linha paralela');
    await connectPair(page, 'git branch', 'registra uma mudança');
    await page.getByTestId('match-submit').click();
    await expectVerdict(page, false);
  });

  test('desfazer um par antes de enviar volta a bloquear o submit', async ({ page }) => {
    await open(page, MATCH);
    await connectPair(page, 'git commit', 'registra uma mudança');
    await connectPair(page, 'git branch', 'cria uma linha paralela');
    await expect(page.getByTestId('match-submit')).toBeEnabled();
    // Tapping either card of an existing pair removes the pair.
    await optionByLabel(page, 'match-left-card', 'git commit').click();
    await expect(page.getByTestId('match-submit')).toBeDisabled();
  });
});

test.describe('order', () => {
  test('🧊 FROZEN — o submit já nasce HABILITADO, sem nenhuma interação', async ({ page }) => {
    await open(page, ORDER);
    await expectDispatchedTo(page, 'order');
    // `hasAnswer = order.length > 0`, and the list is pre-populated by the
    // shuffle — so the learner can submit an answer they never composed. The
    // initial shuffle can even be the correct one by chance.
    await expect(page.getByTestId('order-submit')).toBeEnabled();
  });

  test('ordem correta → veredito CORRETO', async ({ page }) => {
    await open(page, ORDER);
    const target = ['editar o arquivo', 'git add', 'git commit'];
    await arrangeOrder(page, target);
    const got = await orderLabels(page);
    expect(got.map((t, i) => t.includes(target[i]!))).toEqual([true, true, true]);
    await page.getByTestId('order-submit').click();
    await expectVerdict(page, true);
  });

  test('uma troca fora de lugar → veredito INCORRETO', async ({ page }) => {
    await open(page, ORDER);
    await arrangeOrder(page, ['editar o arquivo', 'git add', 'git commit']);
    // Push the first item down once — any permutation ≠ correct_order is wrong.
    await page.getByTestId('order-item').nth(0).getByTestId('order-down').click();
    await page.getByTestId('order-submit').click();
    await expectVerdict(page, false);
  });

  test('🧊 FROZEN — após enviar, os controles de reordenar SOMEM', async ({ page }) => {
    await open(page, ORDER);
    await page.getByTestId('order-submit').click();
    await expect(verdict(page)).toBeVisible();
    // `locked` removes `order-up`/`order-down` entirely rather than disabling
    // them — so the learner cannot even see what they would have changed.
    await expect(page.getByTestId('order-up')).toHaveCount(0);
    await expect(page.getByTestId('order-down')).toHaveCount(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 5 · `code` — two screens, and an unreachable negative verdict.
 * ══════════════════════════════════════════════════════════════════════════ */

test.describe('code', () => {
  test('sem `checks`: screen de exposição — "concluir", sem submit graduado', async ({ page }) => {
    await open(page, CODE_NO_CHECKS);
    await expectDispatchedTo(page, 'code');
    await expect(page.getByTestId('code-preview-iframe')).toBeVisible();
    await expect(page.getByTestId('activity-done')).toBeVisible();
    await expect(page.getByTestId('code-submit')).toHaveCount(0);
  });

  test('com `checks`: screen graduado — submit, sem "concluir"', async ({ page }) => {
    await open(page, CODE_WITH_CHECKS);
    await expect(page.getByTestId('code-submit')).toBeVisible();
    await expect(page.getByTestId('activity-done')).toHaveCount(0);
  });

  test('com `checks` que PASSAM → continuar → veredito CORRETO', async ({ page }) => {
    await open(page, CODE_WITH_CHECKS);
    await page.getByTestId('code-submit').click();
    const feedback = page.getByTestId('code-checks-feedback');
    await expect(feedback).toBeVisible({ timeout: 20_000 });
    await expect(feedback).toHaveAttribute('data-all-passed', 'true');
    await page.getByTestId('code-checks-continue').click();
    await expectVerdict(page, true);
  });

  test('🧊 FROZEN — com `checks` que FALHAM, o veredito INCORRETO é INALCANÇÁVEL', async ({ page }) => {
    await open(page, CODE_WITH_FAILING_CHECKS);
    await page.getByTestId('code-submit').click();
    const feedback = page.getByTestId('code-checks-feedback');
    await expect(feedback).toBeVisible({ timeout: 20_000 });
    await expect(feedback).toHaveAttribute('data-all-passed', 'false');

    // 🚩 THE ODD PART, frozen deliberately: in self-paced mode (`live=false`,
    // which is what the harness AND the LessonPlayer use) `code-checks-continue`
    // is NOT rendered when checks fail. So `onComplete(false)` cannot happen for
    // `code` outside a live class — the learner can only retry, forever. Every
    // other graded kind can produce a false verdict; this one cannot.
    await expect(page.getByTestId('code-checks-continue')).toHaveCount(0);
    await expect(page.getByTestId('code-checks-retry')).toBeVisible();
    await expectNoVerdict(page);
  });

  test('retry devolve o editor ao estado editável', async ({ page }) => {
    await open(page, CODE_WITH_FAILING_CHECKS);
    await page.getByTestId('code-submit').click();
    await expect(page.getByTestId('code-checks-feedback')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('code-checks-retry').click();
    await expect(page.getByTestId('code-submit')).toBeVisible();
    await expect(page.locator('[data-activity-kind="code"]')).toHaveAttribute('data-phase', 'editing');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 6 · `sandbox_scenario` — a multi-step mastery loop.
 *
 * ⚠️ CHANGED 2026-07-31 (fix: sandbox_scenario verdict). The header used to read
 * "a multi-step run with NO negative verdict", and the FROZEN test below blamed
 * a hard-coded `onComplete(true, …)`. The hard-coded `true` is GONE — the shell
 * now emits `isSuccess(scenario, model)`, so a force-reveal without success
 * emits `false`. That path is prop-driven (`reveal`) and the author harness this
 * suite drives does NOT pass it, so it is locked in Vitest instead
 * (`src/test/SandboxScenarioActivity.test.tsx`, "force-reveal verdict").
 *
 * NOT ONE ASSERTION BELOW WAS WEAKENED OR REMOVED — every expect() is
 * byte-identical to PR #238. What changed is the RATIONALE attached to the
 * frozen one, which had become factually false, plus the note on what is still
 * open and why.
 * ══════════════════════════════════════════════════════════════════════════ */

test.describe('sandbox_scenario', () => {
  test('variante de escolhas: chips e composer começam VAZIOS', async ({ page }) => {
    await open(page, SANDBOX_SCENARIO);
    await expectDispatchedTo(page, 'sandbox_scenario');
    await expect(page.getByTestId('sandbox-window')).toBeVisible();
    await expect(page.getByTestId('sandbox-choices')).toBeVisible();
    // The composer is never pre-filled: sending requires a real learner act.
    await expect(page.getByTestId('sandbox-send')).toBeDisabled();
  });

  test('chip forte → enviar → avaliar "top" → veredito CORRETO', async ({ page }) => {
    await open(page, SANDBOX_SCENARIO);
    // Only `add-especifico` resolves to a `quality: 'top'` canned result.
    await page.getByText(/redação de escola/i).first().click();
    await page.getByTestId('sandbox-send').click();
    // The typewriter (500ms dots + ~55 ticks) must finish before the eval panel
    // mounts — `showControls = !done && !stream.active`.
    await expect(page.getByTestId('sandbox-eval')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('sandbox-rate-top').click();
    await expect(page.getByTestId('sandbox-reveal')).toBeVisible();
    await expectVerdict(page, true);
  });

  test('🧊 FROZEN — avaliação ERRADA não gera veredito incorreto, só um retry', async ({ page }) => {
    await open(page, SANDBOX_SCENARIO);
    await page.getByText(/redação de escola/i).first().click();
    await page.getByTestId('sandbox-send').click();
    await expect(page.getByTestId('sandbox-eval')).toBeVisible({ timeout: 20_000 });

    // 🚩 STILL FROZEN, but for a DIFFERENT reason than PR #238 recorded. The
    // hard-coded `onComplete(true, …)` is gone; the emit now carries the
    // scenario's own `success` predicate. What keeps this path verdict-free is
    // the RETRY LOOP: rating wrongly renders the canned critique, `retry()`
    // DELETES the failed `Evaluation` from the model, and the learner re-judges
    // until `isSuccess` — so the wrong judgment never reaches a settle.
    //
    // Whether that fumble SHOULD count against the verdict is a product call —
    // it flips the pass semantics of the 24 live `sandbox_scenario` rows and
    // contradicts the retry-to-mastery intent recorded in `SandboxEvalPanel`
    // ("a wrong one is rejected with the canned critique + a retry, so the
    // student re-judges instead of coasting through"). Open as a blocking
    // question on plan `20260731-itera-e2e-baseline-atividades`. When it is
    // answered, this assertion is expected to change — deliberately, with the
    // decision cited, never by quietly loosening it to make the suite pass.
    await page.getByTestId('sandbox-rate-ruim').click();
    await expect(page.getByTestId('sandbox-eval-wrong')).toBeVisible();
    await expect(page.getByTestId('sandbox-eval-retry')).toBeVisible();
    await expectNoVerdict(page);
  });

  test('chip fraco → crítica de resposta fraca, sem avançar de passo', async ({ page }) => {
    await open(page, SANDBOX_SCENARIO);
    await page.getByText(/oi, tudo bem/i).first().click();
    await page.getByTestId('sandbox-send').click();
    await expect(page.getByTestId('sandbox-compose-weak')).toBeVisible({ timeout: 20_000 });
    await expectNoVerdict(page);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 7 · SPEC BOUNDARY (estado F) — a mal-authored spec must not crash the screen.
 * ══════════════════════════════════════════════════════════════════════════ */

test.describe('fronteira de spec inválido', () => {
  test('kind validado na FRONTEIRA → card amigável, sem crash', async ({ page }) => {
    await open(page, INVALID_SINGLE_CHOICE);
    await expect(page.getByTestId('single-choice-invalid')).toBeVisible();
    await expect(page.locator('[data-invalid-spec="true"]')).toBeVisible();
    await expectNoVerdict(page);
  });

  test('kind validado no COMPONENTE → card amigável próprio', async ({ page }) => {
    await open(page, INVALID_CODE);
    await expect(page.getByTestId('code-invalid')).toBeVisible();
    await expectNoVerdict(page);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 8 · THE DECLARED HOLE — `concept_reveal`.
 * ══════════════════════════════════════════════════════════════════════════ */

test.describe('concept_reveal — buraco DECLARADO, não coberto', () => {
  test('🕳️ 29 atividades vivas caem em <UnknownActivity>', async ({ page }) => {
    await open(page, CONCEPT_REVEAL);

    // `concept_reveal` has **29 live rows** in `itera.activities` (Itera DB,
    // 2026-07-31) and appears NOWHERE in the code: not in `ACTIVITY_KINDS`
    // (11 values), not in the TS union, not in the renderer switch, not in
    // `@iterahq/activity-spec`. Every one of those 29 renders the fallback.
    //
    // Q3 of the sub-plan — implement the renderer or retire the kind — is STILL
    // OPEN. This test is not coverage of the kind; it is the declaration that
    // the baseline has a hole here, written so the hole cannot be forgotten.
    // When Q3 is answered, this test is expected to change.
    await expect(page.locator('[data-activity-kind="unknown"]')).toBeVisible();
    await expect(page.locator('[data-activity-kind="unknown"]')).toContainText(
      'Unsupported activity kind: concept_reveal'
    );
    // No shell, no testid, no completion affordance, no verdict — ever.
    await expect(page.getByTestId('activity-shell')).toHaveCount(0);
    await expect(page.getByTestId('activity-done')).toHaveCount(0);
    await expectNoVerdict(page);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 9 · V4 — the harness writes NOTHING. Proven structurally.
 * ══════════════════════════════════════════════════════════════════════════ */

test.describe('garantia do harness', () => {
  test('nenhuma requisição sai para fora da origem stub durante um run completo', async ({ page }) => {
    const foreign: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost' && u.hostname !== 'stub.supabase.invalid') {
        foreign.push(r.url());
      }
    });

    // A full graded round-trip on the kind that persists the most in the player.
    await open(page, SINGLE_CHOICE);
    await optionByLabel(page, 'single-choice-option', 'Guardar uma informação').click();
    await page.getByTestId('single-choice-submit').click();
    await expectVerdict(page, true);

    // Nothing left the hermetic substrate — so there is no `itera.progress`,
    // `itera.activity_results`, `xp_events` or `itera.artifacts` write to count.
    // This is V4 by construction rather than by measurement.
    expect(foreign, `requisições externas inesperadas:\n${foreign.join('\n')}`).toEqual([]);
  });

  test('todo veredito é rotulado "not saved" e é resetável', async ({ page }) => {
    await open(page, DIAGRAM);
    await page.getByTestId('activity-done').click();
    await expect(verdict(page)).toContainText('not saved');
    await page.getByTestId('test-reset').click();
    await expectNoVerdict(page);
  });
});
