/**
 * A ponte entre `storybook/test` e o `act()` do React — sem ela, o tier T1 é
 * ruído de `console.error`.
 *
 * ── O PROBLEMA (real, e não óbvio) ──────────────────────────────────────────
 * `storybook/test` empacota a SUA PRÓPRIA cópia de `@testing-library/dom` +
 * `@testing-library/user-event`. Quando o `@testing-library/react` é importado,
 * ele chama `configure({ eventWrapper, asyncWrapper })` na cópia DELE, e é isso
 * que embrulha cada evento em `act()` — o que faz o React parar de avisar
 * *"An update to X inside a test was not wrapped in act(...)"*.
 *
 * Como as duas cópias são instâncias diferentes do módulo, essa configuração
 * NÃO alcança o `userEvent` que as stories usam. Resultado: todo `play` rodando
 * no Vitest despejava avisos de `act` em `console.error` — e os testes desta
 * fase falham em QUALQUER `console.error`, de propósito. Suprimir o aviso seria
 * o caminho errado (é sinal legítimo); a correção é configurar a cópia do
 * `storybook/test` do mesmo jeito que o RTL configura a dele.
 *
 * Importe este módulo (pelo efeito colateral) em todo teste que dirija stories.
 * Em Storybook de verdade — browser, sem ambiente de `act` — ele nem entra:
 * é um módulo de `src/test/`, não do preview.
 */
import { act } from '@testing-library/react';
import { configure } from 'storybook/test';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

configure({
  /** Todo evento síncrono (clique, tecla) roda dentro de `act()`. */
  eventWrapper: (cb: () => unknown) => {
    let result: unknown;
    act(() => {
      result = cb();
    });
    return result;
  },
  /**
   * `waitFor`/`findBy*` precisam do OPOSTO: sair do ambiente de `act` enquanto
   * fazem polling (senão o React reclama de act aninhado), e devolver o
   * controle ao event loop uma vez no fim. É a mesma estratégia do RTL.
   */
  asyncWrapper: async (cb: () => Promise<unknown>) => {
    const previous = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      const result = await cb();
      await new Promise((resolve) => setTimeout(resolve, 0));
      return result;
    } finally {
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  },
});
