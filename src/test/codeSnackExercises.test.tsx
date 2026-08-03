import { afterEach, describe, expect, it } from 'vitest';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from '@testing-library/react';
import { safeParseActivitySpec, type CodeCheck } from '@iterahq/activity-spec';
import { transpileSnack } from '@/utils/transpileSnack';
import {
  createRequireShim,
  installPreviewDialogShims,
  runCodeChecks,
} from '@/utils/codePreviewRuntime';
import { CODE_SNACK_EXERCISES } from './fixtures/codeSnackExercises';

/**
 * The authored exercises, driven through the REAL pipeline the learner hits:
 * schema parse → sucrase transpile (`imports` transform) → evaluate with the
 * iframe's `require`/`alert` shims → render with React 18 → run the checks
 * against the resulting DOM.
 *
 * Two properties are asserted per exercise, and they are the ones that actually
 * matter pedagogically:
 *   • the STARTER must FAIL — otherwise there is no exercise, just a screen;
 *   • the SOLUTION must PASS EVERY check — otherwise the class hits a trap that
 *     cannot be solved.
 *
 * This is also what proves the `import { useState } from "react"` starters work
 * at all: without the `require` shim they die with "require is not defined".
 */

const originalAlert = window.alert;
const originalConfirm = window.confirm;
const originalPrompt = window.prompt;

afterEach(() => {
  window.alert = originalAlert;
  window.confirm = originalConfirm;
  window.prompt = originalPrompt;
  document.body.innerHTML = '';
});

/** A stand-in for the iframe document: `#preview` = `#root` + the alert strip. */
function makeSandbox() {
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
function nextTick(): Promise<void> {
  return new Promise((resolve) => {
    const raf: (cb: () => void) => unknown =
      typeof window.requestAnimationFrame === 'function'
        ? (cb) => window.requestAnimationFrame(cb)
        : (cb) => setTimeout(cb, 16);
    raf(() => setTimeout(resolve, 0));
  });
}

/** Exactly the iframe's `evalCode` + `mount` + check loop, in one call. */
async function gradeSource(source: string, checks: CodeCheck[]) {
  const { preview, mount, dialogs, requireShim } = makeSandbox();
  const compiled = transpileSnack(source);
  expect(compiled.error, `transpile failed: ${compiled.error}`).toBeUndefined();

  const exportsObj: Record<string, unknown> = {};
  const moduleObj = { exports: exportsObj };
  const factory = new Function(
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
  );
  factory(
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
  const Comp = (moduleObj.exports as { default?: unknown }).default as () => JSX.Element;
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

describe.each(CODE_SNACK_EXERCISES)('exercício $slug', (exercise) => {
  const checks = exercise.spec.checks ?? [];

  it('has a spec the shared schema accepts, checks included', () => {
    const parsed = safeParseActivitySpec('code', exercise.spec);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    // The schema is `strip` — this is what catches a field the schema forgot.
    expect(parsed.data.checks).toEqual(exercise.spec.checks);
    expect(checks.length).toBeGreaterThan(0);
  });

  it('every check has a learner-readable label and a hint', () => {
    for (const c of checks) {
      expect(c.label.length).toBeGreaterThan(3);
      expect(c.hint, `check ${c.id} sem hint`).toBeTruthy();
    }
    expect(new Set(checks.map((c) => c.id)).size).toBe(checks.length);
  });

  it('the starter already renders something (never a blank screen)', async () => {
    const { preview, mount, dialogs, requireShim } = makeSandbox();
    const compiled = transpileSnack(exercise.spec.starter as string);
    expect(compiled.error).toBeUndefined();
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
    const Comp = (moduleObj.exports as { default?: unknown }).default as () => JSX.Element;
    // Mesmo motivo do `remount` acima: sem `act` o commit pode escorregar para
    // depois da asserção e a story "não renderizou nada" vira falso vermelho.
    act(() => {
      ReactDOM.createRoot(mount).render(React.createElement(Comp));
    });
    await nextTick();
    dialogs.reset();
    expect(mount.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    expect(preview.querySelectorAll('*').length).toBeGreaterThan(2);
  });

  it('the STARTER fails at least one check (otherwise it is not an exercise)', async () => {
    const results = await gradeSource(exercise.spec.starter as string, checks);
    expect(results).toHaveLength(checks.length);
    expect(results.some((r) => !r.passed)).toBe(true);
  });

  it('the expected SOLUTION passes every check', async () => {
    const results = await gradeSource(exercise.solution, checks);
    const failed = results.filter((r) => !r.passed).map((r) => r.id);
    expect(failed, `checks que não passaram: ${failed.join(', ')}`).toEqual([]);
  });
});
