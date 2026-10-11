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
import { fireEvent, userEvent, within } from 'storybook/test';

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

/**
 * `inspect`: escolhe cada peça da PÁGINA e depois a linha dela no código. Cada par certo
 * vira uma ficha; achar todas abre o gate. Mouse e dedo são o mesmo pointer event.
 */
export async function discoverAllTwins(canvasElement: Canvas) {
  const pieces = within(canvasElement).getAllByTestId('inspect-page-target');
  const lines = within(canvasElement).getAllByTestId('inspect-code-target');
  for (const [index, piece] of pieces.entries()) {
    await userEvent.click(piece);
    await userEvent.click(lines[index]);
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
 * Arrasta a linha `from` até a posição `to` pela alça (o grip), com o ponteiro:
 * o único jeito de reordenar o `order`. Num browser de verdade o framer
 * acompanha o `pointermove`; o jsdom não tem layout, então os testes de jsdom
 * passam o próprio `drag` (ver `src/test/support/orderDragDouble.tsx`).
 */
export async function dragOrderRowByPointer(canvasElement: Canvas, from: number, to: number) {
  // Uma casa por vez: as linhas trocam de lugar no meio do gesto, e um arrasto
  // longo mede o alvo num layout que já mudou.
  const step = to > from ? 1 : -1;
  for (let at = from; at !== to; at += step) {
    await dragOrderRowOneSlot(canvasElement, at, at + step);
    // A troca anima o layout; a próxima medida espera ele assentar.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function dragOrderRowOneSlot(canvasElement: Canvas, from: number, to: number) {
  const rows = all(canvasElement, 'order-item');
  const grip = within(rows[from]).getByTestId('order-grip');
  const start = grip.getBoundingClientRect();
  const end = rows[to].getBoundingClientRect();
  const clientX = start.left + start.width / 2;
  const startY = start.top + start.height / 2;
  const endY = end.top + end.height / 2 + (to > from ? 4 : -4);
  // Eventos crus, um por frame: o framer só troca duas linhas quando o ponteiro
  // tem VELOCIDADE, e ela vem do intervalo entre dois `pointermove`.
  const at = (clientY: number): PointerEventInit => ({
    clientX,
    clientY,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 1,
    bubbles: true,
    cancelable: true,
  });
  const frame = () => new Promise((resolve) => setTimeout(resolve, 20));
  const STEPS = 12;
  grip.dispatchEvent(new PointerEvent('pointerdown', at(startY)));
  for (let step = 1; step <= STEPS; step += 1) {
    await frame();
    grip.dispatchEvent(new PointerEvent('pointermove', at(startY + ((endY - startY) * step) / STEPS)));
  }
  await frame();
  grip.dispatchEvent(new PointerEvent('pointerup', { ...at(endY), buttons: 0 }));
  await frame();
}

/**
 * Coloca a lista na ordem dos rótulos arrastando as linhas.
 *
 * Selection-sort: para cada posição alvo, acha o item e o arrasta até lá. A lista
 * é re-consultada a cada arrasto porque o React remonta a `<ol>`.
 *
 * ⚠️ O `order-submit` só habilita depois de o aluno MEXER na lista (o
 * embaralhamento inicial não conta como resposta composta). Se o alvo já for a
 * ordem em que a lista nasceu, o selection-sort não arrasta nada e o "Enviar"
 * continuaria desabilitado — então o helper faz um vai-e-volta real (arrastar o
 * primeiro item para baixo e de volta), que deixa a ordem idêntica e a atividade
 * legitimamente tocada.
 */
export async function arrangeOrder(
  canvasElement: Canvas,
  labels: string[],
  drag: (canvas: Canvas, from: number, to: number) => Promise<void> = dragOrderRowByPointer,
) {
  let moves = 0;
  for (let target = 0; target < labels.length; target += 1) {
    const items = all(canvasElement, 'order-item');
    const current = items.findIndex((li) => (li.textContent ?? '').includes(labels[target]));
    if (current === -1) throw new Error(`order: item ${JSON.stringify(labels[target])} não está na lista`);
    if (current === target) continue;
    if (current < target) throw new Error(`order: item ${labels[target]} já passou da posição alvo`);
    await drag(canvasElement, current, target);
    moves += 1;
    const after = all(canvasElement, 'order-item').findIndex((li) => (li.textContent ?? '').includes(labels[target]));
    if (after !== target) throw new Error(`order: o arrasto não moveu ${JSON.stringify(labels[target])} para a posição ${target}`);
  }
  if (moves === 0 && labels.length >= 2) {
    await drag(canvasElement, 0, 1);
    await drag(canvasElement, 1, 0);
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

/* ── 6b · Os kinds de chat de UM comportamento (T10) ───────────────────────── */

/**
 * `chat_fill_select`: toca a opção de uma lacuna pelo RÓTULO que o aluno lê.
 * `chat_fill_type`: digita na lacuna, achada pelo placeholder autorado.
 */
export async function fillSandboxSlot(
  canvasElement: Canvas,
  slot: { option: string } | { placeholder: string; text: string },
) {
  const canvas = within(canvasElement);
  if ('option' in slot) {
    await userEvent.click(byLabel(canvas.getAllByRole('button'), slot.option, 'sandbox (opção da lacuna)'));
    return;
  }
  const input = canvas.getByPlaceholderText(slot.placeholder);
  await userEvent.click(input);
  await userEvent.paste(slot.text);
}

/**
 * Envia num kind SÓ-COMPOSE e espera o assentamento. Não existe passo de
 * avaliação nesses kinds (ADR-3), então não há painel a esperar — o que
 * aparece é o recap (`sandbox-reveal`).
 */
export async function sendSandboxAndSettle(canvasElement: Canvas) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByTestId('sandbox-send'));
  await canvas.findByTestId('sandbox-reveal', undefined, { timeout: 8000 });
}

/**
 * `chat_rate_reply`: a resposta reserva do autor já está na tela (a execução
 * semeada, T25). Espera o typewriter terminar e o painel de avaliação montar,
 * e avalia.
 */
export async function rateSeededReply(canvasElement: Canvas, quality: 'top' | 'ruim') {
  const canvas = within(canvasElement);
  await canvas.findByTestId('sandbox-eval', undefined, { timeout: 8000 });
  await userEvent.click(canvas.getByTestId(`sandbox-rate-${quality}`));
}

/* ── 6c · Os kinds de terminal de UM comportamento (T11) ───────────────────── */

/** `terminal_pick_command`: um toque num comando INTEIRO roda a linha. */
export async function tapTerminalCommand(canvasElement: Canvas, command: string) {
  const buttons = within(canvasElement).getAllByTestId('terminal-option-command');
  const target = buttons.find((b) => b.getAttribute('data-option') === command);
  if (!target) throw new Error(`terminal: a paleta não tem o comando "${command}"`);
  await userEvent.click(target);
}

/** `terminal_build_command`: sobe os tokens na ordem e roda a linha montada. */
export async function buildTerminalLine(canvasElement: Canvas, tokens: string[]) {
  for (const token of tokens) {
    const chips = within(canvasElement).getAllByTestId('terminal-option-token');
    const target = chips.find((c) => c.getAttribute('data-option') === token);
    if (!target) throw new Error(`terminal: a bandeja não tem o token "${token}"`);
    await userEvent.click(target);
  }
  await userEvent.click(within(canvasElement).getByTestId('terminal-run'));
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

/* ── 8 · Cena — scene-mechanics batch (dial/plug/selector/timeline/arrange/press) ── */

/**
 * Arrasta um `<input type="range">` até `value`, do jeito que dispara o
 * `onChange` controlado do React — `userEvent` não tem um "drag de slider"
 * embutido, e `element.value = x` sozinho não reflete pro React porque ele lê
 * o valor por um setter nativo interceptado. Usado por `dial` e `timeline`.
 */
export function dragSlider(slider: HTMLInputElement, value: number) {
  // `fireEvent` sets the value through the native setter AND goes through the
  // configured event wrapper, so under jsdom the update lands inside `act`.
  fireEvent.input(slider, { target: { value: String(value) } });
}
