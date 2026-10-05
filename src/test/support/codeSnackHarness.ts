import { expect } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from '@testing-library/react';
import type { CodeCheck } from '@iterahq/activity-spec';
import { runHtmlChecksInDocument, type CodeCheckResult } from '@iterahq/activities/code';
import { transpileSnack } from '@/utils/transpileSnack';
import {
  createRequireShim,
  installPreviewDialogShims,
  runCodeChecks,
} from '@/utils/codePreviewRuntime';

/**
 * The code-snack grading pipeline the learner hits, reproduced for tests:
 * sucrase transpile → evaluate with the iframe's `require`/`alert` shims →
 * render with React 18 → run the checks against the resulting DOM. Shared by
 * every test that proves an authored snack (starter fails, solution passes).
 *
 * `gradeSource`'s optional `language` dispatches to the plain-web path
 * (`language: 'html'`) instead: `runHtmlChecksInDocument` from
 * `@iterahq/activities/code`, which parses `source` with `DOMParser` and grades
 * it WITHOUT executing any inline `<script>` (see that function's docblock —
 * a `steps` check that depends on a script side effect is not provable this
 * way; use a real preview / e2e for that). Every existing caller that does not
 * pass `language` keeps the exact tsx pipeline above, unchanged.
 */

const originalAlert = window.alert;
const originalConfirm = window.confirm;
const originalPrompt = window.prompt;

/** Call from `afterEach`: undo the dialog shims and empty the document. */
export function resetCodeSnackSandbox(): void {
  window.alert = originalAlert;
  window.confirm = originalConfirm;
  window.prompt = originalPrompt;
  document.body.innerHTML = '';
}

/** A stand-in for the iframe document: `#preview` = `#root` + the alert strip. */
export function makeSandbox() {
  const preview = document.createElement('div');
  const mount = document.createElement('div');
  const alertEl = document.createElement('div');
  alertEl.setAttribute('data-itera-alert', '');
  preview.append(mount, alertEl);
  document.body.appendChild(preview);

  const dialogs = installPreviewDialogShims(window, alertEl);
  // In the iframe these come off `window`; here they are the imported modules.
  const requireShim = createRequireShim({ React, ReactDOM });
  return { preview, mount, dialogs, requireShim };
}

/**
 * O MESMO tick do iframe (`CODE_PREVIEW_IFRAME_HTML`): rAF + uma macrotask.
 *
 * Antes daqui saía só `setTimeout(resolve, 0)` — uma macrotask, sem o rAF. Isso
 * é ESTRITAMENTE MENOS do que o runtime que este teste diz reproduzir, e o
 * docblock de `runCodeChecks` nomeia o contrato ("`nextTick` (rAF + a
 * macrotask)"). Um teste que cede menos turno que a produção corre uma corrida
 * que a produção não corre: era esse o flake herdado da #152.
 */
export function nextTick(): Promise<void> {
  return new Promise((resolve) => {
    const raf: (cb: () => void) => unknown =
      typeof window.requestAnimationFrame === 'function'
        ? (cb) => window.requestAnimationFrame(cb)
        : (cb) => setTimeout(cb, 16);
    raf(() => setTimeout(resolve, 0));
  });
}

/**
 * Exactly the iframe's `evalCode` + `mount` + check loop, in one call —
 * `language: 'html'` skips all of that and grades `source` as a plain HTML
 * document instead (see the module docblock).
 */
export async function gradeSource(
  source: string,
  checks: CodeCheck[],
  language?: string,
): Promise<CodeCheckResult[]> {
  if (language === 'html') return runHtmlChecksInDocument(source, checks);

  const { preview, mount, dialogs, requireShim } = makeSandbox();
  const Comp = evaluateSnack(source, requireShim);
  expect(typeof Comp, 'the snack must export a default component').toBe('function');

  let root: ReturnType<typeof ReactDOM.createRoot> | null = null;
  /**
   * `act` aqui não é enfeite, é o conserto do flake.
   *
   * `root.render()` fora de um evento é uma atualização de DEFAULT LANE: o
   * React 18 a agenda no Scheduler (via `setImmediate` no Node) e renderiza em
   * fatias de ~5 ms, re-agendando quando estoura a fatia. Sob CPU disputada —
   * o runner self-hosted roda 4 runners no mesmo host — a fatia estoura, o
   * commit escorrega para o próximo turno e a asserção seguinte lê o DOM
   * ANTERIOR. `act` drena a fila de trabalho do React até o fim, então a
   * espera é pelo commit ter acontecido, não por um prazo.
   *
   * Os `steps` (`click` / `fill`) não precisam disso: são eventos discretos,
   * flushados em microtask, e a macrotask do `nextTick` já vem depois deles.
   * É o mesmo padrão já usado em `codePreviewRuntime.test.tsx`.
   */
  const remount = () => {
    act(() => {
      if (root) root.unmount();
      dialogs.reset();
      mount.innerHTML = '';
      root = ReactDOM.createRoot(mount);
      root.render(React.createElement(Comp));
    });
  };
  remount();
  await nextTick();

  return runCodeChecks({ root: preview, checks, remount, nextTick, win: window });
}

/** Evaluates a snack and returns its default export. */
export function evaluateSnack(source: string, requireShim: ReturnType<typeof createRequireShim>) {
  const compiled = transpileSnack(source);
  expect(compiled.error, `transpile failed: ${compiled.error}`).toBeUndefined();
  const exportsObj: Record<string, unknown> = {};
  const moduleObj = { exports: exportsObj };
  new Function(
    'React',
    'useState',
    'useEffect',
    'useRef',
    'useMemo',
    'useCallback',
    'require',
    'exports',
    'module',
    compiled.code as string,
  )(
    React,
    React.useState,
    React.useEffect,
    React.useRef,
    React.useMemo,
    React.useCallback,
    requireShim,
    exportsObj,
    moduleObj,
  );
  return (moduleObj.exports as { default?: unknown }).default as () => React.JSX.Element;
}

/** Renders a snack once, the way the preview does, and returns its sandbox. */
export async function renderSnack(source: string) {
  const sandbox = makeSandbox();
  const Comp = evaluateSnack(source, sandbox.requireShim);
  act(() => {
    ReactDOM.createRoot(sandbox.mount).render(React.createElement(Comp));
  });
  await nextTick();
  sandbox.dialogs.reset();
  return sandbox;
}
