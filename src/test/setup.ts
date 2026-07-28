import "@testing-library/jest-dom";

/**
 * Setup COMPARTILHADO pelos ~100 arquivos de teste — e por isso deliberadamente
 * condicional ao DOM.
 *
 * Antes, o `Object.defineProperty(window, …)` rodava incondicionalmente, então
 * QUALQUER arquivo que optasse por `@vitest-environment node` explodia aqui
 * ("window is not defined") — mesmo sendo um teste puro, sem React. Era o drift
 * capturado na Fase 1 do plano `20260728-itera-activity-testing` (ver o cabeçalho
 * de `src/utils/answerMachine.test.ts`). Com o guard, o padrão jsdom continua
 * idêntico para todo mundo e o ambiente `node` fica disponível para os testes de
 * lógica pura, que não pagam mais o custo de montar um DOM.
 */
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}
