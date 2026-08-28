/**
 * T1 — as INTERAÇÕES REAIS de cada kind, escritas UMA vez.
 *
 * Plano `20260728-itera-activity-testing`, Fase 3 / ADR-2 e ADR-4.
 *
 * Estes helpers são o que substitui as props `initialSelectedId` /
 * `initialSubmitted` / `initialConnections` / `initialOrder`, que foram
 * REMOVIDAS da produção nesta fase. A regra que elas violavam está no ADR-4:
 * um estado alcançável por prop mas não por clique é um falso verde — a story
 * ficava verde sobre um estado que nenhum aluno consegue produzir.
 *
 * Cada função aqui é escrita contra o DOM real do componente (os `data-testid`
 * de produção), e é consumida por DOIS clientes, exatamente como manda o ADR-2:
 *
 *   1. o `play` das stories  → o Tainan bate o olho no estado no Storybook;
 *   2. o Vitest (jsdom)      → `composeStories` roda o MESMO `play` no CI.
 *
 * `storybook/test` (NÃO `@storybook/test`, que deixou de existir no Storybook 9
 * — ADR-2/ADR-8; estamos no 10.4.6) é o pacote de interação canônico.
 *
 * ⚠️ POR QUE TUDO É POR RÓTULO, NUNCA POR POSIÇÃO: `single_choice`,
 * `multi_choice`, `match` e `order` embaralham suas opções por aluno
 * (`learnerShuffle`, seed = escopo do aluno + id da activity). A ordem é
 * ESTÁVEL para um aluno, mas continua sendo diferente entre alunos — e as
 * stories rodam sob um escopo anônimo por browser. Um helper que clicasse "a
 * segunda opção" seria flaky por construção.
 *
 * 💡 Desde que os elementos expõem `data-option-id` (a identidade AUTORADA), um
 * helper pode casar por id em vez de por texto — mais robusto, porque um typo
 * corrigido no enunciado não quebra mais o seletor.
 */
import { userEvent, within } from 'storybook/test';

type Canvas = HTMLElement;

/** Todos os elementos com um testid, dentro do canvas da story. */
function all(canvasElement: Canvas, testId: string): HTMLElement[] {
  return within(canvasElement).getAllByTestId(testId);
}

/** O primeiro elemento cujo texto CONTÉM `label` — a busca estável por rótulo. */
function byLabel(elements: HTMLElement[], label: string, what: string): HTMLElement {
  const hit = elements.find((el) => (el.textContent ?? '').includes(label));
  if (!hit) {
    throw new Error(
      `${what}: nenhum elemento com o rótulo ${JSON.stringify(label)}. ` +
        `Encontrados: ${elements.map((e) => JSON.stringify(e.textContent?.trim())).join(', ')}`,
    );
  }
  return hit;
}

/* ── 2 · Escolha ──────────────────────────────────────────────────────────── */

/** Clica a opção de `single_choice` cujo rótulo contém `label`. */
export async function pickSingleChoice(canvasElement: Canvas, label: string) {
  await userEvent.click(byLabel(all(canvasElement, 'single-choice-option'), label, 'single_choice'));
}

/** Marca (ou desmarca) as opções de `multi_choice` pelos rótulos, na ordem dada. */
export async function pickMultiChoice(canvasElement: Canvas, labels: string[]) {
  for (const label of labels) {
    await userEvent.click(byLabel(all(canvasElement, 'multi-choice-option'), label, 'multi_choice'));
  }
}

/** Clica a opção do `quiz` (a activity herói) cujo texto contém `label`. */
export async function pickQuizOption(canvasElement: Canvas, label: string) {
  await userEvent.click(byLabel(all(canvasElement, 'quiz-option'), label, 'quiz'));
}

/* ── 7 · Consulta ─────────────────────────────────────────────────────────── */

/**
 * Marca (ou desmarca) as opções de uma `question` pelos rótulos.
 *
 * Separado do `pickMultiChoice` de propósito, e não é só o testid: a `question`
 * NÃO embaralha (a ordem é conteúdo autorado, porque o plans-app endereça as
 * opções por letra), então aqui a busca por rótulo é uma conveniência e não uma
 * necessidade — enquanto nos kinds de escolha ela é a única forma estável.
 */
export async function markQuestionOptions(canvasElement: Canvas, labels: string[]) {
  for (const label of labels) {
    await userEvent.click(byLabel(all(canvasElement, 'question-option'), label, 'question'));
  }
}

/** Liga (ou desliga) o "Outro" — a saída de emergência, ligada por default. */
export async function toggleQuestionOther(canvasElement: Canvas) {
  await userEvent.click(within(canvasElement).getByTestId('question-other'));
}

/** Escreve no texto livre, que existe em TODA `question` e não pode ser desligado. */
export async function writeQuestionNote(canvasElement: Canvas, text: string) {
  await userEvent.type(within(canvasElement).getByTestId('question-text'), text);
}

/* ── 3 · Associação ───────────────────────────────────────────────────────── */

/**
 * Forma UM par: toca o card da esquerda (arma) e depois o da direita (fecha).
 * É o mecanismo real do `MatchActivity` — que, ao contrário do que a ADR-8
 * supõe, NÃO é drag-and-drop (ver a nota no PR): são dois taps.
 */
export async function connectPair(canvasElement: Canvas, leftLabel: string, rightLabel: string) {
  await userEvent.click(byLabel(all(canvasElement, 'match-left-card'), leftLabel, 'match (esquerda)'));
  await userEvent.click(byLabel(all(canvasElement, 'match-right-card'), rightLabel, 'match (direita)'));
}

/** Forma vários pares, na ordem dada — a numeração das badges segue essa ordem. */
export async function connectPairs(canvasElement: Canvas, pairs: [string, string][]) {
  for (const [l, r] of pairs) await connectPair(canvasElement, l, r);
}

/* ── 4 · Ordenação ────────────────────────────────────────────────────────── */

/**
 * Coloca a lista na ordem dos rótulos, usando SÓ o botão "subir" — o mesmo
 * affordance acessível que o aluno de teclado/touch usa (o drag nativo do
 * `OrderActivity` não é dirigível em jsdom, e o componente oferece os dois).
 *
 * Selection-sort: para cada posição alvo, acha o item e o sobe até lá. A lista
 * é re-consultada a cada clique porque o React remonta a `<ol>`.
 *
 * ⚠️ O `order-submit` só habilita depois de o aluno MEXER na lista (o
 * embaralhamento inicial não conta como resposta composta). Se o alvo já for a
 * ordem em que a lista nasceu, o selection-sort não clica nada e o "Enviar"
 * continuaria desabilitado — então o helper faz um vai-e-volta real (descer o
 * primeiro item e subi-lo de novo), que deixa a ordem idêntica e a atividade
 * legitimamente tocada.
 */
export async function arrangeOrder(canvasElement: Canvas, labels: string[]) {
  let moves = 0;
  for (let target = 0; target < labels.length; target += 1) {
    for (let guard = 0; guard <= labels.length; guard += 1) {
      const items = all(canvasElement, 'order-item');
      const current = items.findIndex((li) => (li.textContent ?? '').includes(labels[target]));
      if (current === -1) throw new Error(`order: item ${JSON.stringify(labels[target])} não está na lista`);
      if (current === target) break;
      if (current < target) throw new Error(`order: item ${labels[target]} já passou da posição alvo`);
      await userEvent.click(within(items[current]).getByTestId('order-up'));
      moves += 1;
      if (guard === labels.length) throw new Error('order: não convergiu — o botão "subir" não moveu o item');
    }
  }
  if (moves === 0 && labels.length >= 2) {
    await userEvent.click(within(all(canvasElement, 'order-item')[0]).getByTestId('order-down'));
    await userEvent.click(within(all(canvasElement, 'order-item')[1]).getByTestId('order-up'));
  }
}

/* ── 5 · Produção ─────────────────────────────────────────────────────────── */

/**
 * Escreve na redação (`document` em modo reflexão). Usa `paste` em vez de
 * `type`: o `type` digita caractere a caractere e um texto de 40 palavras
 * custaria segundos de CI por story, sem provar nada a mais.
 */
export async function writeReflection(canvasElement: Canvas, text: string) {
  const input = within(canvasElement).getByTestId('document-reflection-input');
  await userEvent.click(input);
  await userEvent.paste(text);
}

/* ── 6 · Cenário com IA (determinístico) ──────────────────────────────────── */

/**
 * Compõe o prompt do sandbox determinístico. Cada forma de autoria expõe um
 * mecanismo diferente e o helper escolhe o que a story de fato renderizou:
 * chip de seed (variante `ai`), chip de escolha (variante `options`).
 */
export async function composeSandboxPrompt(canvasElement: Canvas, choiceLabel?: string) {
  const canvas = within(canvasElement);
  if (choiceLabel) {
    await userEvent.click(byLabel(canvas.getAllByRole('button'), choiceLabel, 'sandbox (chip de escolha)'));
    return;
  }
  await userEvent.click(canvas.getByTestId('sandbox-seed-chip'));
}

/**
 * Envia o prompt composto e ESPERA o typewriter terminar — o painel de
 * avaliação só monta depois da animação (`useAssistantStream`: 500 ms de
 * reticências + ~55 ticks de 28 ms). Sem essa espera o helper seria um teste
 * de corrida, não de comportamento.
 */
export async function sendSandboxPrompt(canvasElement: Canvas) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByTestId('sandbox-send'));
  await canvas.findByTestId('sandbox-eval', undefined, { timeout: 8000 });
}

/**
 * Avalia a resposta do sandbox. Só existem DUAS qualidades no
 * `SandboxEvalPanel` (`ruim` = "fraca", `top` = "forte") — a avaliação É o
 * exercício, e um terceiro botão "média" daria saída fácil.
 */
export async function rateSandbox(canvasElement: Canvas, quality: 'top' | 'ruim') {
  await userEvent.click(within(canvasElement).getByTestId(`sandbox-rate-${quality}`));
}

/* ── Transversal ──────────────────────────────────────────────────────────── */

/** Clica o "Enviar" de um kind graduado (`<testId>-submit`). */
export async function submitAnswer(canvasElement: Canvas, testId: string) {
  await userEvent.click(within(canvasElement).getByTestId(testId));
}

/** Clica o "Marcar como concluída" dos kinds de conclusão. */
export async function markDone(canvasElement: Canvas) {
  await userEvent.click(within(canvasElement).getByTestId('activity-done'));
}
