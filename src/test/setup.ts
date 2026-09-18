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

  // O jsdom não implementa `ResizeObserver`, e o `useSurfaceSize` da camada de
  // anotação depende dele. Stub inerte de propósito: um observer que "funcionasse"
  // aqui provaria só o mock — quem quiser provar que a superfície REMEDE tem que
  // disparar a mudança na mão.
  if (!("ResizeObserver" in window)) {
    Object.defineProperty(window, "ResizeObserver", {
      writable: true,
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
  }

  // jsdom does not implement `elementFromPoint`; the DS `InputOTP` (input-otp)
  // polls it internally for focus/paste tracking. Without a stub it throws
  // from a detached setTimeout after the test has already finished.
  if (typeof document.elementFromPoint !== "function") {
    document.elementFromPoint = () => null;
  }
}
