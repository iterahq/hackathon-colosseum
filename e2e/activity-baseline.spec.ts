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
 * `concept_reveal` era um buraco declarado aqui; desde 2026-07-31 tem renderer
 * e cobertura (seção 8).
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
  CHAT_SANDBOX,
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
 * Pick an option by its LABEL, never by index. Still the only handle for `quiz`,
 * whose options carry no `data-option-id` (see `optionById`).
 */
function optionByLabel(page: Page, testId: string, label: string): Locator {
  return page.getByTestId(testId).filter({ hasText: label }).first();
}

/**
 * Pick an option by its AUTHORED ID — the thing grading actually keys on.
 *
 * 🔄 BASELINE UPDATED (fix/choice-order-option-identity). The previous revision
 * of this file could only match on user-visible TEXT and carried a drift signal
 * saying so: `single-choice-option` / `multi-choice-option` / `match-*-card` /
 * `order-item` exposed no `data-option-id`, so the authored identity was
 * unreachable from the DOM. They now do, and these tests address the identity
 * instead of a rendering of it.
 *
 * This is a STRENGTHENING, not a loosening: `optionByLabel('… Guardar uma
 * informação')` passes for any element whose text happens to contain that
 * substring and breaks when an author fixes a typo; `optionById('a')` names the
 * exact option the answer key names, and would fail loudly if the renderer ever
 * associated the wrong id with the wrong label.
 *
 * DOM order is still never used: the shuffle is per-learner (`learnerShuffle`,
 * seeded on learner scope + activity id), so position is not a stable handle.
 */
function optionById(page: Page, testId: string, optionId: string): Locator {
  return page.locator(`[data-testid="${testId}"][data-option-id="${optionId}"]`);
}

/** The current `order-item` sequence, as AUTHORED ids. */
async function orderIds(page: Page): Promise<(string | null)[]> {
  return page
    .getByTestId('order-item')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-option-id')));
}

/**
 * Selection-sort `order-item` into the target ID sequence using `order-up`.
 * Mirrors `src/stories/interactions.ts::arrangeOrder`, which is the recipe the
 * repo's own story/unit tests use — same mechanic, same guarantees.
 * Re-queries after every click because React re-renders the whole `<ol>`.
 *
 * 🔄 BASELINE UPDATED: matches on `data-option-id` instead of inner text, and
 * guarantees AT LEAST ONE real move — `order-submit` now requires the learner
 * to have touched the list, so a target that happens to equal the starting
 * arrangement would otherwise leave the submit disabled.
 */
async function arrangeOrder(page: Page, ids: readonly string[]): Promise<void> {
  let moves = 0;
  for (let target = 0; target < ids.length; target++) {
    for (;;) {
      const current = await orderIds(page);
      const at = current.findIndex((id) => id === ids[target]);
      if (at === -1) {
        throw new Error(`order: item ${ids[target]} não está na lista (${current.join(', ')})`);
      }
      if (at <= target) break;
      await page.getByTestId('order-item').nth(at).getByTestId('order-up').click();
      moves += 1;
    }
  }
  if (moves === 0 && ids.length >= 2) {
    // A real round-trip: same arrangement, but the learner did move something.
    await page.getByTestId('order-item').nth(0).getByTestId('order-down').click();
    await page.getByTestId('order-item').nth(1).getByTestId('order-up').click();
  }
}

/** Tap-to-pair by AUTHORED id: arm a left card, then tap the right card. NOT drag. */
async function connectPair(page: Page, leftId: string, rightId: string): Promise<void> {
  await optionById(page, 'match-left-card', leftId).click();
  await optionById(page, 'match-right-card', rightId).click();
}

/* ══════════════════════════════════════════════════════════════════════════
 * 1 · EXPOSITION KINDS — conteúdo não conclui; só `code` sem checks conclui.
 * ══════════════════════════════════════════════════════════════════════════ */

test.describe('exposição — kinds sem caminho de erro', () => {
  // ♨️ `document` SAIU deste grupo em 09/08/2026: o contrato 0.11.0 exige
  // `prompt`, então toda activity de `document` que a fronteira aceita cai no ramo
  // de reflexão — textarea + concluir travado na contagem. Ela deixou de ser
  // exposição, e as duas formas que restam são medidas no §3.
  for (const fx of [DIAGRAM, VIDEO] as const) {
    // ♨️ DESCONGELADO em 03/08/2026: estes três tinham `activity-done` cravado em
    // `onComplete(true)`. Conteúdo não é exercício — enquanto o botão existiu,
    // metade da turma não clicava e o pódio da aula ao vivo virava ranking de
    // quem lembrou de clicar, não de quem acertou.
    test(`${fx.label}: conteúdo NÃO tem afordância de conclusão`, async ({ page }) => {
      await open(page, fx);
      await expectDispatchedTo(page, fx.kind);
      await expect(page.getByTestId('activity-done')).toHaveCount(0);
      await expect(page.locator('[data-testid$="-submit"]')).toHaveCount(0);
      await expectNoVerdict(page);
    });
  }

  test('code sem checks: "Marcar como concluída" → veredito CORRETO', async ({ page }) => {
    await open(page, CODE_NO_CHECKS);
    await expectDispatchedTo(page, 'code');
    await page.getByTestId('activity-done').click();
    await expectVerdict(page, true);
  });

  test('code sem checks: 🧊 FROZEN — não existe caminho para veredito INCORRETO', async ({ page }) => {
    await open(page, CODE_NO_CHECKS);
    // The ONLY affordance is `activity-done`, which is hard-wired to
    // `onComplete(true)`. There is no submit, no grading, no wrong answer.
    await expect(page.getByTestId('activity-done')).toBeVisible();
    await expect(page.getByTestId('code-submit')).toHaveCount(0);
    await expectNoVerdict(page);
  });

  test('video: o player é exibido, e ele é a atividade inteira', async ({ page }) => {
    await open(page, VIDEO);
    await expect(page.getByTestId('video-player')).toBeVisible();
    // O fixture é um link do YouTube — o link que um autor cola de verdade. Como
    // `<video src>` toca arquivo e não página, ele NÃO vira player: vira o cartão
    // que abre em nova aba. Congelado aqui porque a alternativa é a tela preta
    // muda que o aluno via antes.
    await expect(page.getByTestId('instruction-video-external')).toBeVisible();
    // Sem gate de assistir e sem conclusão: o vídeo é exposição pura.
    await expect(page.getByTestId('activity-done')).toHaveCount(0);
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

  test('sem rubric: o textarea existe e "concluir" abre com UMA palavra', async ({ page }) => {
    await open(page, DOCUMENT_READONLY);
    // `DocumentActivity` takes the reflection branch whenever `spec.prompt` is
    // present OR `min_words > 0` — and `prompt` is REQUIRED since 0.11.0, so a
    // document without a rubric is not the read-only screen most people assume
    // it is. Without a `min_words` the gate falls back to `>= 1` word, which is
    // the only thing that separates the two shapes on screen.
    await expect(page.getByTestId('document-reflection-input')).toBeVisible();
    await expect(page.getByTestId('document-min-words')).toHaveCount(0);
    await expect(page.getByTestId('activity-done')).toBeDisabled();
    await page.getByTestId('document-reflection-input').fill('pronto');
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

  // 🔄 BASELINE UPDATED: matched by AUTHORED id (`spec.correct_option_id` is
  // `'a'`) instead of by rendered label. Same verdicts, sturdier handle.
  test('correct_option_id → veredito CORRETO', async ({ page }) => {
    await open(page, SINGLE_CHOICE);
    await optionById(page, 'single-choice-option', 'a').click();
    await page.getByTestId('single-choice-submit').click();
    await expectVerdict(page, true);
  });

  test('distrator → veredito INCORRETO', async ({ page }) => {
    await open(page, SINGLE_CHOICE);
    await optionById(page, 'single-choice-option', 'b').click();
    await page.getByTestId('single-choice-submit').click();
    await expectVerdict(page, false);
  });

  test('cada opção expõe sua identidade AUTORADA no DOM', async ({ page }) => {
    await open(page, SINGLE_CHOICE);
    // The property the telemetry plan depends on: the id an event would carry
    // is readable from the element, and it is the AUTHORED id — not the
    // post-shuffle position, which differs per learner.
    const ids = await page
      .getByTestId('single-choice-option')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-option-id')));
    expect([...ids].sort()).toEqual(['a', 'b', 'c']);
  });

  test('a ordem das opções é ESTÁVEL para o mesmo aluno entre montagens', async ({ page }) => {
    await open(page, SINGLE_CHOICE);
    const first = await page
      .getByTestId('single-choice-option')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-option-id')));
    await page.reload();
    await expect(page.getByTestId('activity-test-harness')).toBeVisible();
    const second = await page
      .getByTestId('single-choice-option')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-option-id')));
    // 🔄 BASELINE UPDATED: with `Math.random()` per mount this was a coin flip
    // (1/6 of agreeing) and could not have been asserted at all. The seed is now
    // learner-scope + activity id. That learners still differ from EACH OTHER is
    // proven in `src/utils/learnerShuffle.test.ts` — a browser context here only
    // ever has one learner.
    expect(second).toEqual(first);
  });
});

// 🔄 BASELINE UPDATED: options are picked by AUTHORED id — `correct_option_ids`
// is `['a','b','c']` and `'d'` is the distractor — instead of by label
// substring. The verdicts asserted are unchanged.
test.describe('multi_choice', () => {
  test('conjunto EXATO → veredito CORRETO', async ({ page }) => {
    await open(page, MULTI_CHOICE);
    await expectDispatchedTo(page, 'multi_choice');
    for (const optionId of ['a', 'b', 'c']) {
      await optionById(page, 'multi-choice-option', optionId).click();
    }
    await page.getByTestId('multi-choice-submit').click();
    await expectVerdict(page, true);
  });

  test('subconjunto das corretas → veredito INCORRETO', async ({ page }) => {
    await open(page, MULTI_CHOICE);
    // Grading is exact SET equality, not "contains only correct ones": a
    // strictly-correct-but-incomplete answer is wrong.
    await optionById(page, 'multi-choice-option', 'a').click();
    await page.getByTestId('multi-choice-submit').click();
    await expectVerdict(page, false);
  });

  test('corretas + distrator → veredito INCORRETO', async ({ page }) => {
    await open(page, MULTI_CHOICE);
    for (const optionId of ['a', 'b', 'c', 'd']) {
      await optionById(page, 'multi-choice-option', optionId).click();
    }
    await page.getByTestId('multi-choice-submit').click();
    await expectVerdict(page, false);
  });

  test('cada opção expõe sua identidade AUTORADA no DOM', async ({ page }) => {
    await open(page, MULTI_CHOICE);
    const ids = await page
      .getByTestId('multi-choice-option')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-option-id')));
    expect([...ids].sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

// 🔄 BASELINE UPDATED: cards are tapped by AUTHORED id — `spec.pairs` is
// `p1↔r1`, `p2↔r2`, which is EXACTLY what grading compares — instead of by
// label. The verdicts asserted are unchanged.
test.describe('match', () => {
  test('submit só libera com TODOS os pares formados', async ({ page }) => {
    await open(page, MATCH);
    await expectDispatchedTo(page, 'match');
    await expect(page.getByTestId('match-submit')).toBeDisabled();
    await connectPair(page, 'p1', 'r1');
    await expect(page.getByTestId('match-submit')).toBeDisabled();
    await connectPair(page, 'p2', 'r2');
    await expect(page.getByTestId('match-submit')).toBeEnabled();
  });

  test('pares corretos → veredito CORRETO', async ({ page }) => {
    await open(page, MATCH);
    await connectPair(page, 'p1', 'r1');
    await connectPair(page, 'p2', 'r2');
    await page.getByTestId('match-submit').click();
    await expectVerdict(page, true);
  });

  test('pares cruzados → veredito INCORRETO', async ({ page }) => {
    await open(page, MATCH);
    await connectPair(page, 'p1', 'r2');
    await connectPair(page, 'p2', 'r1');
    await page.getByTestId('match-submit').click();
    await expectVerdict(page, false);
  });

  test('desfazer um par antes de enviar volta a bloquear o submit', async ({ page }) => {
    await open(page, MATCH);
    await connectPair(page, 'p1', 'r1');
    await connectPair(page, 'p2', 'r2');
    await expect(page.getByTestId('match-submit')).toBeEnabled();
    // Tapping either card of an existing pair removes the pair.
    await optionById(page, 'match-left-card', 'p1').click();
    await expect(page.getByTestId('match-submit')).toBeDisabled();
  });

  test('cada card expõe sua identidade AUTORADA no DOM', async ({ page }) => {
    await open(page, MATCH);
    const read = (testId: string) =>
      page
        .getByTestId(testId)
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-option-id')));
    expect((await read('match-left-card')).sort()).toEqual(['p1', 'p2']);
    expect((await read('match-right-card')).sort()).toEqual(['r1', 'r2']);
  });
});

/** The authored solution for the `order` fixture — `spec.correct_order`. */
const ORDER_SOLUTION = ['i1', 'i2', 'i3'] as const;

test.describe('order', () => {
  /**
   * 🔄 BASELINE UPDATED — this test previously read:
   *
   *   test('🧊 FROZEN — o submit já nasce HABILITADO, sem nenhuma interação')
   *     await expect(page.getByTestId('order-submit')).toBeEnabled();
   *
   * It froze `hasAnswer = order.length > 0`, i.e. the pre-populated shuffle
   * counting as a composed answer. The PRODUCT changed: `hasAnswer` is now
   * `touched`, so a learner who has moved nothing has not answered. The
   * assertion is INVERTED, not deleted — it still asserts the exact same
   * observable (the submit's enabled state on first paint), with the opposite
   * expected value, and it still fails loudly if that state moves again.
   */
  test('o submit nasce DESABILITADO até o aluno mexer na lista', async ({ page }) => {
    await open(page, ORDER);
    await expectDispatchedTo(page, 'order');
    await expect(page.getByTestId('order-submit')).toBeDisabled();
    // One move — the smallest real learner act — is what opens it.
    await page.getByTestId('order-item').nth(0).getByTestId('order-down').click();
    await expect(page.getByTestId('order-submit')).toBeEnabled();
  });

  /**
   * 🔄 BASELINE ADDED — the other half of the same defect. The old shuffle was
   * `Math.random()` per mount, so on a 3-item list it dealt the SOLUTION about
   * 1 run in 6, handing out an acerto for zero work. The initial arrangement is
   * now guaranteed to differ from `correct_order`.
   */
  test('o embaralhamento inicial NUNCA é a solução', async ({ page }) => {
    await open(page, ORDER);
    expect(await orderIds(page)).not.toEqual([...ORDER_SOLUTION]);
  });

  /** 🔄 BASELINE ADDED — the per-learner seed is stable across remounts. */
  test('a ordem inicial é ESTÁVEL para o mesmo aluno entre montagens', async ({ page }) => {
    await open(page, ORDER);
    const first = await orderIds(page);
    await page.reload();
    await expect(page.getByTestId('activity-test-harness')).toBeVisible();
    expect(await orderIds(page)).toEqual(first);
  });

  // 🔄 BASELINE UPDATED: the target sequence and the assertion are expressed in
  // AUTHORED ids (`correct_order`), so this now asserts the exact arrangement
  // rather than "each row's text contains this substring".
  test('ordem correta → veredito CORRETO', async ({ page }) => {
    await open(page, ORDER);
    await arrangeOrder(page, ORDER_SOLUTION);
    expect(await orderIds(page)).toEqual([...ORDER_SOLUTION]);
    await page.getByTestId('order-submit').click();
    await expectVerdict(page, true);
  });

  test('uma troca fora de lugar → veredito INCORRETO', async ({ page }) => {
    await open(page, ORDER);
    await arrangeOrder(page, ORDER_SOLUTION);
    // Push the first item down once — any permutation ≠ correct_order is wrong.
    await page.getByTestId('order-item').nth(0).getByTestId('order-down').click();
    await page.getByTestId('order-submit').click();
    await expectVerdict(page, false);
  });

  /**
   * 🔄 BASELINE UPDATED — this test previously read:
   *
   *   test('🧊 FROZEN — após enviar, os controles de reordenar SOMEM')
   *     await expect(page.getByTestId('order-up')).toHaveCount(0);
   *     await expect(page.getByTestId('order-down')).toHaveCount(0);
   *
   * `locked` unmounted the controls, which deletes screen content the learner
   * needs as the reference for what they answered. The PRODUCT changed: the
   * controls stay mounted and are DISABLED. `toHaveCount(0)` became
   * `toHaveCount(3)` + `toBeDisabled()` — the same observable, asserted with
   * strictly MORE precision than before (their count and their state, where the
   * old test only asserted their absence).
   */
  test('após enviar, os controles de reordenar ficam DESABILITADOS (não somem)', async ({ page }) => {
    await open(page, ORDER);
    await page.getByTestId('order-item').nth(0).getByTestId('order-down').click();
    await page.getByTestId('order-submit').click();
    await expect(verdict(page)).toBeVisible();

    const ups = page.getByTestId('order-up');
    const downs = page.getByTestId('order-down');
    await expect(ups).toHaveCount(ORDER_SOLUTION.length);
    await expect(downs).toHaveCount(ORDER_SOLUTION.length);
    for (let i = 0; i < ORDER_SOLUTION.length; i++) {
      await expect(ups.nth(i)).toBeDisabled();
      await expect(downs.nth(i)).toBeDisabled();
    }
    // And the answered sequence is still fully on screen, identities included.
    expect((await orderIds(page)).filter(Boolean)).toHaveLength(ORDER_SOLUTION.length);
  });

  test('cada item expõe sua identidade AUTORADA no DOM', async ({ page }) => {
    await open(page, ORDER);
    expect([...(await orderIds(page))].sort()).toEqual([...ORDER_SOLUTION]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 5 · `code` — two screens, and (desde a PR #234) um veredito negativo
 *     alcançável: "seguir mesmo assim" deixou de ser live-only.
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

  test('com `checks` que FALHAM → seguir mesmo assim → veredito INCORRETO', async ({ page }) => {
    await open(page, CODE_WITH_FAILING_CHECKS);
    await page.getByTestId('code-submit').click();
    const feedback = page.getByTestId('code-checks-feedback');
    await expect(feedback).toBeVisible({ timeout: 20_000 });
    await expect(feedback).toHaveAttribute('data-all-passed', 'false');

    // ♨️ DESCONGELADO em 03/08/2026 (PR #234). Era o `🧊 FROZEN` desta seção: em
    // self-paced (`live=false`, o que o harness E o LessonPlayer usam)
    // `code-checks-continue` NÃO era renderizado quando os checks falhavam, e
    // `onComplete(false)` ficava inalcançável para `code` — o aluno só podia
    // tentar de novo, para sempre. Era o único kind graduado incapaz de produzir
    // veredito falso, e foi exatamente o beco sem saída que a PR #234 corrigiu.
    // O que se registra continua sendo o resultado REAL: seguir não vira acerto.
    await expect(page.getByTestId('code-checks-retry')).toBeVisible();
    await page.getByTestId('code-checks-continue').click();
    await expectVerdict(page, false);
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
 * 6 · `chat_sandbox` — a multi-step mastery loop.
 *
 * ⚠️ CHANGED 2026-07-31 (fix: sandbox verdict). The header used to read
 * "a multi-step run with NO negative verdict", and the FROZEN test below blamed
 * a hard-coded `onComplete(true, …)`. The hard-coded `true` is GONE — the shell
 * now emits `isSuccess(scenario, model)`, so a force-reveal without success
 * emits `false`. That path is prop-driven (`reveal`) and the author harness this
 * suite drives does NOT pass it, so it is locked in Vitest instead
 * (`src/test/ChatSandboxActivity.test.tsx`, "force-reveal verdict").
 *
 * NOT ONE ASSERTION BELOW WAS WEAKENED OR REMOVED — every expect() is
 * byte-identical to PR #238. What changed is the RATIONALE attached to the
 * frozen one, which had become factually false, plus the note on what is still
 * open and why.
 * ══════════════════════════════════════════════════════════════════════════ */

test.describe('chat_sandbox', () => {
  test('variante de escolhas: chips e composer começam VAZIOS', async ({ page }) => {
    await open(page, CHAT_SANDBOX);
    await expectDispatchedTo(page, 'chat_sandbox');
    await expect(page.getByTestId('sandbox-window')).toBeVisible();
    await expect(page.getByTestId('sandbox-choices')).toBeVisible();
    // The composer is never pre-filled: sending requires a real learner act.
    await expect(page.getByTestId('sandbox-send')).toBeDisabled();
  });

  test('chip forte → enviar → avaliar "top" → veredito CORRETO', async ({ page }) => {
    await open(page, CHAT_SANDBOX);
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
    await open(page, CHAT_SANDBOX);
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
    // it flips the pass semantics of the live sandbox rows and
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
    await open(page, CHAT_SANDBOX);
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
 * 8 · `concept_reveal` — o buraco declarado, agora FECHADO.
 * ══════════════════════════════════════════════════════════════════════════ */

test.describe('concept_reveal', () => {
  // Q3 do sub-plano ("implementar o renderer ou aposentar o kind") foi
  // respondida em 2026-07-31 pelo renderer: as 29 linhas vivas em
  // `itera.activities` deixaram de cair em <UnknownActivity>. Este bloco era a
  // declaração do buraco; virou a cobertura dele.
  test('renderiza o card, com a resposta escondida até o aluno pedir', async ({ page }) => {
    await open(page, CONCEPT_REVEAL);

    await expect(page.locator('[data-activity-kind="unknown"]')).toHaveCount(0);
    await expect(page.getByTestId('concept-reveal-card')).toHaveAttribute('data-revealed', 'false');
    await expect(page.getByTestId('concept-reveal-prompt')).toBeVisible();
    await expect(page.getByTestId('concept-reveal-answer')).toHaveCount(0);

    await page.getByTestId('concept-reveal-show').click();
    await expect(page.getByTestId('concept-reveal-card')).toHaveAttribute('data-revealed', 'true');
    await expect(page.getByTestId('concept-reveal-answer')).toBeVisible();
  });

  test('não pontua: revelar não produz veredito nem conclusão', async ({ page }) => {
    // Pensar alto no meio da explicação não pode virar nota — o kind nunca
    // chama `onComplete`, então o harness não registra veredito nenhum.
    await open(page, CONCEPT_REVEAL);
    await page.getByTestId('concept-reveal-show').click();
    await expect(page.getByTestId('concept-reveal-answer')).toBeVisible();
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
    await optionById(page, 'single-choice-option', 'a').click();
    await page.getByTestId('single-choice-submit').click();
    await expectVerdict(page, true);

    // Nothing left the hermetic substrate — so there is no `itera.progress`,
    // `itera.activity_results`, `xp_events` or `itera.artifacts` write to count.
    // This is V4 by construction rather than by measurement.
    expect(foreign, `requisições externas inesperadas:\n${foreign.join('\n')}`).toEqual([]);
  });

  test('todo veredito é rotulado "not saved" e é resetável', async ({ page }) => {
    await open(page, CODE_NO_CHECKS);
    await page.getByTestId('activity-done').click();
    await expect(verdict(page).getByTestId('test-not-saved')).toBeVisible();
    await page.getByTestId('test-reset').click();
    await expectNoVerdict(page);
  });
});
