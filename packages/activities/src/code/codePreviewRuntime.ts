import type { CodeCheck, CodeStep } from '@iterahq/activity-spec';
import type { CodeCheckResult } from './types.js';

/**
 * The pieces of the code-snack preview that must run INSIDE the sandboxed
 * iframe (opaque origin), written here as ORDINARY TypeScript so they are unit
 * testable in jsdom, and shipped into the iframe by serialising them with
 * `String(fn)` (see `CODE_PREVIEW_RUNTIME_SOURCE` at the bottom + the consumer
 * in `./codePreviewIframe.ts`).
 *
 * ⚠️ HARD CONSTRAINT — every exported function in this file MUST be entirely
 * SELF-CONTAINED: no imports, no module-scope constants, no shared helpers.
 * `String(fn)` only carries the function's own body, so any outer reference
 * would become a `ReferenceError` inside the iframe (where nothing else from
 * this bundle exists). For the same reason the bodies avoid `async`/`await`
 * and generators — a bundler targeting an older baseline lowers those onto a
 * MODULE-SCOPE helper (`__async`), which would not survive serialisation.
 * Promise chains + plain `for` loops always do.
 *
 * Type-only imports are erased at build time and are therefore safe.
 */

/**
 * `require` shim for the iframe.
 *
 * The transpiler (sucrase, `imports` transform) rewrites the learner's ESM into
 * CommonJS — `import { useState } from 'react'` becomes `require('react')`. The
 * iframe has no module system, so without this shim the single most idiomatic
 * line a React learner can write blows up with "require is not defined". That is
 * a pit to fall into during a live class, not a teaching moment.
 *
 * An unknown module gets a friendly Portuguese message instead of a stack trace,
 * because the only thing the learner can act on is "only react is available".
 */
export function createRequireShim(win: { React: unknown; ReactDOM: unknown }) {
  return function iteraRequire(name: string): unknown {
    if (name === 'react') return win.React;
    if (name === 'react-dom' || name === 'react-dom/client') return win.ReactDOM;
    throw new Error(
      'Neste editor você só pode importar "react". Você tentou importar "' + name + '".',
    );
  };
}

/**
 * Shims `alert` / `confirm` / `prompt` inside the preview.
 *
 * The iframe is `sandbox="allow-scripts"` WITHOUT `allow-modals`, so the browser
 * silently swallows a real `alert()` — the learner writes the idiomatic line,
 * nothing happens, and they conclude their code is broken. Loosening the sandbox
 * to `allow-modals` is not an option (it hands student code a way to freeze the
 * page), so instead `alert` PAINTS its message into a visible strip inside the
 * preview. Two wins: the idiomatic call works visually, and it becomes
 * assertable by a check (`selector: '[data-itera-alert]'`).
 *
 * The strip holds the LAST message (replace, not accumulate) so an assertion on
 * it is deterministic no matter how many times the learner's code fires.
 * `confirm`/`prompt` are not worth a UI: they return a default so a snack that
 * calls them keeps running instead of hanging.
 */
export function installPreviewDialogShims(
  win: { alert?: unknown; confirm?: unknown; prompt?: unknown },
  alertEl: HTMLElement,
) {
  function reset() {
    alertEl.textContent = '';
    alertEl.setAttribute('hidden', '');
  }
  win.alert = function iteraAlert(message?: unknown) {
    alertEl.textContent = message === undefined ? '' : String(message);
    alertEl.removeAttribute('hidden');
  };
  win.confirm = function iteraConfirm() {
    return true;
  };
  win.prompt = function iteraPrompt() {
    return '';
  };
  reset();
  return { reset: reset };
}

/**
 * Runs the deterministic checks against the RENDERED preview DOM and resolves
 * with one `{ id, passed }` per check, in spec order.
 *
 * Design notes that make this work instead of silently mis-grading:
 *
 *  • ISOLATION — a check carrying `steps` MUTATES the DOM, so letting the next
 *    check inherit that state would make results depend on ordering. Every
 *    check WITH steps therefore re-mounts the component from scratch first.
 *    Checks without steps read the current render (nothing to isolate from).
 *  • YIELDING — React 18 commits asynchronously; asserting straight after an
 *    action reads the PREVIOUS DOM. `nextTick` (rAF + a macrotask) is awaited
 *    after the remount and after every action.
 *  • CONTAINMENT — a check that throws (bad selector, missing element, a step
 *    that cannot run) counts as NOT PASSED. It never rejects and never takes
 *    the preview down with it.
 */
export function runCodeChecks(options: {
  /** The preview root; every selector is scoped inside it. */
  root: ParentNode;
  checks: CodeCheck[];
  /** Re-render the component from its initial state (and clear the alert strip). */
  remount: () => void;
  /** Resolves once the browser has painted / React has committed. */
  nextTick: () => Promise<void>;
  /** The window owning `root` — needed for the `instanceof` in `fill`. */
  win: Window;
}): Promise<CodeCheckResult[]> {
  const root = options.root;
  const checks = options.checks || [];
  const results: CodeCheckResult[] = [];

  function firstMatch(selector: string): Element | null {
    return root.querySelector(selector);
  }

  function applyStep(step: CodeStep): void {
    const el = firstMatch(step.selector) as HTMLElement | null;
    if (!el) throw new Error('no element matches ' + step.selector);
    if (step.do === 'click') {
      // React 18 delegates events at the root container, so a native `.click()`
      // does reach the learner's onClick handler.
      el.click();
      return;
    }
    // `fill` — a React CONTROLLED input ignores `el.value = x` (React tracks the
    // value on the DOM node and would see no change), so write through the
    // native setter and fire a bubbling `input` event, which is what React's
    // onChange listens to. Without this the form exercise fails 100% of the
    // time with no visible reason.
    const win = options.win as unknown as {
      HTMLTextAreaElement: typeof HTMLTextAreaElement;
      HTMLInputElement: typeof HTMLInputElement;
      Event: typeof Event;
    };
    const proto =
      el instanceof win.HTMLTextAreaElement
        ? win.HTMLTextAreaElement.prototype
        : win.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    const setter = descriptor && descriptor.set;
    if (!setter) throw new Error('cannot set value on ' + step.selector);
    setter.call(el, step.value);
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
  }

  function evaluate(check: CodeCheck): boolean {
    // Judge text like a human reader (both operands): collapse whitespace, trim,
    // then drop accents and case.
    //
    // The checks only see the DOM, so an exercise that asks the learner to TYPE
    // a title — "Matemática", "Clean Code" — used to grade that title character
    // for character. In a real class that failed people who HAD solved it:
    // `matematica` without the accent, `clean code` without the capitals. What
    // the exercise measures is the JSX around the string, never the spelling of
    // the string. A different WORD still fails: this folds how a word is
    // written, never which word it is.
    //
    // ⚠️ `text` only. `class` and `attr` below keep comparing byte for byte —
    // `flex` and `Flex` are different CSS classes, and folding there would pass
    // code that does not work.
    function normalizeText(value: string): string {
      return (value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    }
    const nodes = root.querySelectorAll(check.selector);
    const assert = check.assert;
    if (assert.type === 'count') return nodes.length === assert.equals;
    if (nodes.length === 0) return false;
    const el = nodes[0];
    if (assert.type === 'exists') return true;
    if (assert.type === 'text') {
      const text = normalizeText(el.textContent || '');
      if (assert.equals !== undefined && text !== normalizeText(assert.equals)) return false;
      if (assert.contains !== undefined && text.indexOf(normalizeText(assert.contains)) === -1)
        return false;
      // Neither operand given → degenerates to "an element matched".
      return true;
    }
    if (assert.type === 'class') {
      // Read the ATTRIBUTE rather than `el.className`, which is an
      // SVGAnimatedString (not a string) on SVG nodes.
      const cls = el.getAttribute('class') || '';

      // `equals` — new in `@iterahq/activity-spec@0.13.0`. `contains` is
      // tolerant by design (a learner who solves the exercise and then adds
      // classes of their own still passes); `equals` is the exact form, for
      // "give it exactly these three utilities". The schema requires exactly
      // one of the two, so the author picks the tolerance per exercise instead
      // of the schema picking it for every exercise at once.
      //
      // Set comparison, not string comparison: order, repeated whitespace and a
      // duplicated class are NOT differences. One extra class on the element
      // is, which is the whole point of the form.
      //
      // ⚠️ The split is INLINE rather than `classTokens` from the package, and
      // it has to be: this function is serialised with `String(fn)` into an
      // opaque-origin iframe (see the file header), where an imported symbol
      // would be a `ReferenceError`. That is exactly the "two implementations
      // of what counts as one class" the package warns about, so the copy is
      // not left on trust — `codePreviewRuntime.test.tsx` asserts this split
      // agrees with `classTokens` itself, over the cases that distinguish them.
      if (assert.equals !== undefined) {
        const want = assert.equals.split(/\s+/).filter(Boolean);
        const have = cls.split(/\s+/).filter(Boolean);
        for (let i = 0; i < want.length; i++) {
          if (have.indexOf(want[i]) === -1) return false;
        }
        for (let i = 0; i < have.length; i++) {
          if (want.indexOf(have[i]) === -1) return false;
        }
        return true;
      }
      // `contains` — substring of the class attribute, byte for byte as before.
      if (assert.contains !== undefined) return cls.indexOf(assert.contains) !== -1;
      // Unreachable through the schema (exactly one of the two is required, and
      // a bare `{ type: 'class' }` stopped parsing in 0.13.0 precisely because
      // it asserted nothing and always passed). Kept explicit so a spec that
      // reached here some other way fails LOUD rather than passing vacuously.
      return false;
    }
    // `attr`
    const value = el.getAttribute(assert.name);
    if (value === null) return false;
    if (assert.equals !== undefined && value !== assert.equals) return false;
    if (assert.contains !== undefined && value.indexOf(assert.contains) === -1) return false;
    return true;
  }

  function settle(check: CodeCheck, passed: boolean): Promise<CodeCheckResult[]> {
    results.push({ id: check.id, passed: passed });
    return runFrom(results.length);
  }

  function runFrom(index: number): Promise<CodeCheckResult[]> {
    if (index >= checks.length) return Promise.resolve(results);
    const check = checks[index];
    const steps = check.steps || [];
    let chain: Promise<unknown> = Promise.resolve();

    if (steps.length > 0) {
      // Fresh mount so the simulated interaction starts from the initial state.
      chain = chain
        .then(function () {
          options.remount();
        })
        .then(options.nextTick);
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        chain = chain
          .then(function () {
            applyStep(step);
          })
          .then(options.nextTick);
      }
    }

    return chain.then(
      function () {
        let passed = false;
        try {
          passed = evaluate(check);
        } catch (err) {
          passed = false;
        }
        return settle(check, passed);
      },
      function () {
        // A step could not run (element missing / not fillable) — the behaviour
        // the check describes simply isn't there yet.
        return settle(check, false);
      },
    );
  }

  return runFrom(0);
}

/**
 * The three functions above, serialised and bound to stable global names the
 * iframe bootstrap calls. Concatenated into the iframe document.
 */
export const CODE_PREVIEW_RUNTIME_SOURCE = [
  'var __iteraCreateRequire = ' + String(createRequireShim) + ';',
  'var __iteraInstallDialogs = ' + String(installPreviewDialogShims) + ';',
  'var __iteraRunChecks = ' + String(runCodeChecks) + ';',
].join('\n');
