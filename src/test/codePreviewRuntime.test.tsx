import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from '@testing-library/react';
import { CodeAssertSchema, classTokens, type CodeCheck } from '@iterahq/activity-spec';
import {
  CODE_PREVIEW_RUNTIME_SOURCE,
  createRequireShim,
  installPreviewDialogShims,
  runCodeChecks,
} from '@/utils/codePreviewRuntime';

/**
 * The runtime that lives INSIDE the preview iframe, exercised against a real
 * jsdom DOM (and, for the interaction cases, a real React 18 root — the whole
 * point of `steps` is that they must work through React's synthetic events, so
 * a fake DOM would prove nothing).
 */

function nextTick(): Promise<void> {
  // Mirrors the iframe's own tick — rAF + a macrotask, exactly as
  // `CODE_PREVIEW_IFRAME_HTML` defines it. It used to be a bare `setTimeout(…,
  // 0)`, i.e. STRICTLY LESS yielding than the runtime this file claims to
  // reproduce; see the docblock on `nextTick` in `codeSnackExercises.test.tsx`.
  return new Promise((resolve) => {
    const raf: (cb: () => void) => unknown =
      typeof window.requestAnimationFrame === 'function'
        ? (cb) => window.requestAnimationFrame(cb)
        : (cb) => setTimeout(cb, 16);
    raf(() => setTimeout(resolve, 0));
  });
}

/** Build a preview root: `#root` (React mount) + the alert strip, as the iframe does. */
function makePreview() {
  const preview = document.createElement('div');
  const mount = document.createElement('div');
  const alertEl = document.createElement('div');
  alertEl.setAttribute('data-itera-alert', '');
  preview.append(mount, alertEl);
  document.body.appendChild(preview);
  return { preview, mount, alertEl };
}

async function runAgainstHtml(html: string, checks: CodeCheck[]) {
  const { preview } = makePreview();
  preview.querySelector('div')!.innerHTML = html;
  return runCodeChecks({
    root: preview,
    checks,
    remount: () => {},
    nextTick,
    win: window,
  });
}

const check = (over: Partial<CodeCheck> & Pick<CodeCheck, 'selector' | 'assert'>): CodeCheck => ({
  id: over.id ?? 'c1',
  label: over.label ?? 'check',
  ...over,
});

describe('runCodeChecks — assert evaluation', () => {
  it('exists — passes when a node matches, fails when none does', async () => {
    expect(
      await runAgainstHtml('<button>oi</button>', [check({ selector: 'button', assert: { type: 'exists' } })]),
    ).toEqual([{ id: 'c1', passed: true }]);
    expect(
      await runAgainstHtml('<span>oi</span>', [check({ selector: 'button', assert: { type: 'exists' } })]),
    ).toEqual([{ id: 'c1', passed: false }]);
  });

  it('count — compares the number of matches exactly (0 included)', async () => {
    const list = '<ul><li>um</li><li>dois</li><li>três</li></ul>';
    expect(
      await runAgainstHtml(list, [check({ selector: 'li', assert: { type: 'count', equals: 3 } })]),
    ).toEqual([{ id: 'c1', passed: true }]);
    expect(
      await runAgainstHtml(list, [check({ selector: 'li', assert: { type: 'count', equals: 2 } })]),
    ).toEqual([{ id: 'c1', passed: false }]);
    expect(
      await runAgainstHtml(list, [check({ selector: 'img', assert: { type: 'count', equals: 0 } })]),
    ).toEqual([{ id: 'c1', passed: true }]);
  });

  it('text — equals compares the TRIMMED textContent, case-sensitively', async () => {
    const html = '<p>  Bem-vinda  </p>';
    expect(
      await runAgainstHtml(html, [
        check({ selector: 'p', assert: { type: 'text', equals: 'Bem-vinda' } }),
      ]),
    ).toEqual([{ id: 'c1', passed: true }]);
    expect(
      await runAgainstHtml(html, [
        check({ selector: 'p', assert: { type: 'text', equals: 'bem-vinda' } }),
      ]),
    ).toEqual([{ id: 'c1', passed: false }]);
  });

  it('text — contains is a substring test', async () => {
    const html = '<p>Olá, Ana! Que bom te ver.</p>';
    expect(
      await runAgainstHtml(html, [check({ selector: 'p', assert: { type: 'text', contains: 'Ana' } })]),
    ).toEqual([{ id: 'c1', passed: true }]);
    expect(
      await runAgainstHtml(html, [check({ selector: 'p', assert: { type: 'text', contains: 'Bia' } })]),
    ).toEqual([{ id: 'c1', passed: false }]);
  });

  it('text — equals collapses internal whitespace runs, not just the ends', async () => {
    // The learner wrote the right words with sloppy spacing/newlines — that is
    // the RIGHT answer and must be accepted.
    const html = '<p>Ana   vai\n  estudar   matemática</p>';
    expect(
      await runAgainstHtml(html, [
        check({ selector: 'p', assert: { type: 'text', equals: 'Ana vai estudar matemática' } }),
      ]),
    ).toEqual([{ id: 'c1', passed: true }]);
  });

  it('text — equals matches across NFC/NFD accent encodings', async () => {
    // "matemática" typed with a COMBINING acute (NFD) is byte-different from the
    // composed form but identical on screen — it must still pass.
    const decomposed = 'matemática'.normalize('NFD');
    expect(
      await runAgainstHtml(`<p>${decomposed}</p>`, [
        check({ selector: 'p', assert: { type: 'text', equals: 'matemática' } }),
      ]),
    ).toEqual([{ id: 'c1', passed: true }]);
  });

  it('text — contains accepts a valid answer with extra trailing punctuation', async () => {
    // The reported bug: a perfect useState solution renders "…matemática!" and
    // was rejected by an exact `equals`. With the content authored as `contains`
    // the sentence appearing is what counts, punctuation and all.
    const html = '<p data-resultado>Ana vai estudar matemática!</p>';
    expect(
      await runAgainstHtml(html, [
        check({
          selector: '[data-resultado]',
          assert: { type: 'text', contains: 'Ana vai estudar matemática' },
        }),
      ]),
    ).toEqual([{ id: 'c1', passed: true }]);
  });

  it('class — matches a token substring on the class attribute', async () => {
    const html = '<button class="px-4 py-2 bg-emerald-500 text-white">Enviar</button>';
    expect(
      await runAgainstHtml(html, [
        check({ selector: 'button', assert: { type: 'class', contains: 'bg-emerald-500' } }),
      ]),
    ).toEqual([{ id: 'c1', passed: true }]);
    expect(
      await runAgainstHtml(html, [
        check({ selector: 'button', assert: { type: 'class', contains: 'bg-sky-500' } }),
      ]),
    ).toEqual([{ id: 'c1', passed: false }]);
  });

  it('class — is case-sensitive (BG-Emerald-500 must not pass)', async () => {
    expect(
      await runAgainstHtml('<button class="BG-Emerald-500">x</button>', [
        check({ selector: 'button', assert: { type: 'class', contains: 'bg-emerald-500' } }),
      ]),
    ).toEqual([{ id: 'c1', passed: false }]);
  });

  /**
   * `equals` — the EXACT form, new in `@iterahq/activity-spec@0.13.0` and
   * reachable from an author for the first time on the 0.14.0 bump.
   *
   * `contains` decided a pedagogical question by omission: for "make the button
   * green" its tolerance is right, and for "give it exactly these three
   * utilities" it is wrong. `equals` is how an author says which one they mean.
   */
  describe('class — the exact form', () => {
    const exact = (equals: string) =>
      check({ selector: 'button', assert: { type: 'class', equals } });

    it('passes on the same SET, whatever the order', async () => {
      const html = '<button class="px-4 bg-emerald-500 text-white">Enviar</button>';
      expect(await runAgainstHtml(html, [exact('px-4 bg-emerald-500 text-white')])).toEqual([
        { id: 'c1', passed: true },
      ]);
      expect(await runAgainstHtml(html, [exact('text-white px-4 bg-emerald-500')])).toEqual([
        { id: 'c1', passed: true },
      ]);
    });

    it('ignores repeated whitespace and duplicates on BOTH sides', async () => {
      // A duplicate is not a difference: the assertion is over a SET, and an
      // author who writes a class twice means the class once.
      expect(
        await runAgainstHtml('<button class="  px-4   px-4  bg-emerald-500 ">x</button>', [
          exact('bg-emerald-500\tpx-4'),
        ]),
      ).toEqual([{ id: 'c1', passed: true }]);
    });

    it('FAILS on one extra class — the whole reason the form exists', async () => {
      // The case that separates `equals` from `contains`. `contains` passes here.
      const html = '<button class="px-4 bg-emerald-500 rounded">x</button>';
      expect(await runAgainstHtml(html, [exact('px-4 bg-emerald-500')])).toEqual([
        { id: 'c1', passed: false },
      ]);
      expect(
        await runAgainstHtml(html, [
          check({ selector: 'button', assert: { type: 'class', contains: 'bg-emerald-500' } }),
        ]),
      ).toEqual([{ id: 'c1', passed: true }]);
    });

    it('FAILS on a missing class', async () => {
      expect(
        await runAgainstHtml('<button class="px-4">x</button>', [exact('px-4 bg-emerald-500')]),
      ).toEqual([{ id: 'c1', passed: false }]);
    });

    it('FAILS on an element with no class attribute at all', async () => {
      expect(await runAgainstHtml('<button>x</button>', [exact('px-4')])).toEqual([
        { id: 'c1', passed: false },
      ]);
    });
  });

  /**
   * 🔴 THE TWO-IMPLEMENTATIONS GUARD.
   *
   * `codePreviewRuntime.ts` is serialised with `String(fn)` into an
   * opaque-origin iframe, so it CANNOT import `classTokens` — an imported
   * symbol would be a `ReferenceError` in there. The split is therefore
   * duplicated by necessity, and `@iterahq/activity-spec` says in as many words
   * why that is dangerous: "two implementations of what counts as one class is
   * how an exercise starts passing in the author's preview and failing for the
   * learner."
   *
   * So the copy is not left on trust. Each case below is a string where a
   * plausible-but-wrong split would diverge, and the expectation is derived from
   * `classTokens` at run time rather than hard-coded — a hard-coded expectation
   * would keep passing after the package changed its mind.
   */
  describe('the inline class split agrees with classTokens from the package', () => {
    const CASES = [
      'px-4 bg-emerald-500',
      '  px-4   bg-emerald-500  ', // collapsed runs + leading/trailing
      'px-4\tbg-emerald-500\nrounded', // tab and newline are separators too
      'px-4 px-4', // a duplicate collapses to one member
      '', // the empty set
      '   ', // whitespace only is ALSO the empty set
      'a',
    ];

    it.each(CASES)('agrees on %j', async (value) => {
      const expected = [...classTokens(value)].sort();

      // Drive the REAL runtime rather than a re-implementation of it: build an
      // element carrying exactly these classes and assert `equals` passes for
      // the token set the package computes, in a shuffled order.
      const html = `<button class="${value}">x</button>`;
      const shuffled = [...expected].reverse().join('  ');

      if (expected.length === 0) {
        // The empty set is unauthorable — 0.13.0 rejects an `equals` of only
        // whitespace, because it passes only on an element with no classes and
        // `selector` says that better. Assert the SCHEMA refuses it, so this
        // case is covered by the layer that actually owns it.
        expect(CodeAssertSchema.safeParse({ type: 'class', equals: value }).success).toBe(false);
        return;
      }

      expect(
        await runAgainstHtml(html, [
          check({ selector: 'button', assert: { type: 'class', equals: shuffled } }),
        ]),
      ).toEqual([{ id: 'c1', passed: true }]);

      // ...and adding any one token the package did NOT produce must fail, which
      // is what proves the runtime's set is not merely a superset.
      expect(
        await runAgainstHtml(html, [
          check({ selector: 'button', assert: { type: 'class', equals: `${shuffled} zzz-extra` } }),
        ]),
      ).toEqual([{ id: 'c1', passed: false }]);
    });
  });

  it('attr — equals / contains / missing attribute', async () => {
    const html = '<input type="checkbox" aria-label="marcar tarefa" />';
    expect(
      await runAgainstHtml(html, [
        check({ selector: 'input', assert: { type: 'attr', name: 'type', equals: 'checkbox' } }),
      ]),
    ).toEqual([{ id: 'c1', passed: true }]);
    expect(
      await runAgainstHtml(html, [
        check({ selector: 'input', assert: { type: 'attr', name: 'aria-label', contains: 'tarefa' } }),
      ]),
    ).toEqual([{ id: 'c1', passed: true }]);
    expect(
      await runAgainstHtml(html, [
        check({ selector: 'input', assert: { type: 'attr', name: 'placeholder', equals: 'x' } }),
      ]),
    ).toEqual([{ id: 'c1', passed: false }]);
  });

  it('a check that throws counts as not passed and never rejects', async () => {
    const results = await runAgainstHtml('<p>oi</p>', [
      check({ id: 'bad', selector: 'p:::invalid', assert: { type: 'exists' } }),
      check({ id: 'good', selector: 'p', assert: { type: 'exists' } }),
    ]);
    expect(results).toEqual([
      { id: 'bad', passed: false },
      { id: 'good', passed: true },
    ]);
  });

  it('returns one result per check, in spec order', async () => {
    const results = await runAgainstHtml('<p class="a">oi</p>', [
      check({ id: 'a', selector: 'p', assert: { type: 'exists' } }),
      check({ id: 'b', selector: 'p', assert: { type: 'class', contains: 'z' } }),
      check({ id: 'c', selector: 'p', assert: { type: 'text', equals: 'oi' } }),
    ]);
    expect(results.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(results.map((r) => r.passed)).toEqual([true, false, true]);
  });
});

/** A checkbox WITH state — the "fixed" ToDoList the learner is meant to produce. */
function WorkingTodo() {
  const [done, setDone] = useState(false);
  return (
    <ul>
      <li className={done ? 'line-through' : ''}>
        <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
        Levar o violão
      </li>
    </ul>
  );
}

/** The broken starter: the checkbox renders but nothing happens on click. */
function BrokenTodo() {
  return (
    <ul>
      <li>
        <input type="checkbox" checked={false} readOnly />
        Levar o violão
      </li>
    </ul>
  );
}

/** Two controlled inputs + a submit that paints the greeting. */
function Greeter() {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(`Oi, ${name}! Boas ideias aí de ${city}.`);
      }}
    >
      <input name="nome" value={name} onChange={(e) => setName(e.target.value)} />
      <textarea name="cidade" value={city} onChange={(e) => setCity(e.target.value)} />
      <button type="submit">Enviar</button>
      <p data-resultado>{msg}</p>
    </form>
  );
}

/** Mount a component the way the iframe does, exposing an idempotent remount. */
function mountComponent(Comp: () => JSX.Element) {
  const { preview, mount } = makePreview();
  let root: Root | null = null;
  const remount = () => {
    act(() => {
      if (root) root.unmount();
      mount.innerHTML = '';
      root = createRoot(mount);
      root.render(<Comp />);
    });
  };
  remount();
  return { preview, remount };
}

describe('runCodeChecks — simulated steps', () => {
  it('click drives a REAL React handler (the working checkbox becomes checked)', async () => {
    const { preview, remount } = mountComponent(WorkingTodo);
    const results = await runCodeChecks({
      root: preview,
      checks: [
        check({
          id: 'marca',
          selector: 'input[type="checkbox"]:checked',
          steps: [{ do: 'click', selector: 'input[type="checkbox"]' }],
          assert: { type: 'count', equals: 1 },
        }),
      ],
      remount,
      nextTick,
      win: window,
    });
    expect(results).toEqual([{ id: 'marca', passed: true }]);
  });

  it('the SAME check fails on the stateless starter (this is the exercise)', async () => {
    const { preview, remount } = mountComponent(BrokenTodo);
    const results = await runCodeChecks({
      root: preview,
      checks: [
        check({
          id: 'marca',
          selector: 'input[type="checkbox"]:checked',
          steps: [{ do: 'click', selector: 'input[type="checkbox"]' }],
          assert: { type: 'count', equals: 1 },
        }),
      ],
      remount,
      nextTick,
      win: window,
    });
    expect(results).toEqual([{ id: 'marca', passed: false }]);
  });

  it('fill writes through the native setter so a CONTROLLED input sees it', async () => {
    const { preview, remount } = mountComponent(Greeter);
    const results = await runCodeChecks({
      root: preview,
      checks: [
        check({
          id: 'saudacao',
          selector: '[data-resultado]',
          steps: [
            { do: 'fill', selector: 'input[name="nome"]', value: 'Ana' },
            { do: 'fill', selector: 'textarea[name="cidade"]', value: 'Niterói' },
            { do: 'click', selector: 'button[type="submit"]' },
          ],
          assert: { type: 'text', contains: 'Oi, Ana!' },
        }),
      ],
      remount,
      nextTick,
      win: window,
    });
    expect(results).toEqual([{ id: 'saudacao', passed: true }]);
    // The textarea value landed too (proving the textarea prototype branch).
    expect(preview.querySelector('[data-resultado]')?.textContent).toContain('Niterói');
  });

  it('re-mounts before every stepped check, so results do not depend on order', async () => {
    const { preview, remount } = mountComponent(WorkingTodo);
    const results = await runCodeChecks({
      root: preview,
      checks: [
        // Clicking once checks the box…
        check({
          id: 'marca',
          selector: 'input[type="checkbox"]:checked',
          steps: [{ do: 'click', selector: 'input[type="checkbox"]' }],
          assert: { type: 'count', equals: 1 },
        }),
        // …and this one ALSO clicks once. Without isolation it would inherit the
        // checked box, toggle it OFF, and fail.
        check({
          id: 'risca',
          selector: 'li.line-through',
          steps: [{ do: 'click', selector: 'input[type="checkbox"]' }],
          assert: { type: 'count', equals: 1 },
        }),
      ],
      remount,
      nextTick,
      win: window,
    });
    expect(results).toEqual([
      { id: 'marca', passed: true },
      { id: 'risca', passed: true },
    ]);
  });

  it('a check WITHOUT steps does not remount (it reads the current render)', async () => {
    const { preview } = makePreview();
    preview.querySelector('div')!.innerHTML = '<p>oi</p>';
    const remount = vi.fn();
    await runCodeChecks({
      root: preview,
      checks: [check({ selector: 'p', assert: { type: 'exists' } })],
      remount,
      nextTick,
      win: window,
    });
    expect(remount).not.toHaveBeenCalled();
  });

  it('a step whose target is missing fails the check without killing the run', async () => {
    const { preview, remount } = mountComponent(WorkingTodo);
    const results = await runCodeChecks({
      root: preview,
      checks: [
        check({
          id: 'fantasma',
          selector: 'input',
          steps: [{ do: 'click', selector: 'button.nao-existe' }],
          assert: { type: 'exists' },
        }),
        check({ id: 'depois', selector: 'input', assert: { type: 'exists' } }),
      ],
      remount,
      nextTick,
      win: window,
    });
    expect(results).toEqual([
      { id: 'fantasma', passed: false },
      { id: 'depois', passed: true },
    ]);
  });
});

describe('createRequireShim', () => {
  const win = { React: { tag: 'react' }, ReactDOM: { tag: 'react-dom' } };

  it('resolves react and react-dom to the iframe globals', () => {
    const req = createRequireShim(win);
    expect(req('react')).toBe(win.React);
    expect(req('react-dom')).toBe(win.ReactDOM);
    expect(req('react-dom/client')).toBe(win.ReactDOM);
  });

  it('throws a friendly Portuguese message for anything else', () => {
    const req = createRequireShim(win);
    expect(() => req('lodash')).toThrow(/só pode importar "react"/);
    expect(() => req('lodash')).toThrow(/lodash/);
  });

  it('makes the transpiled `import ... from "react"` shape runnable', () => {
    // What sucrase's `imports` transform actually emits for
    // `import React, { useState } from 'react'`.
    const transpiled = [
      'function _interop(obj){return obj&&obj.__esModule?obj:{default:obj};}',
      "var _react = require('react'); var _react2 = _interop(_react);",
      'exports.hooks = _react.useState; exports.def = _react2.default;',
    ].join('\n');
    const React = { useState: () => {} };
    const exports: Record<string, unknown> = {};
    new Function('require', 'exports', transpiled)(
      createRequireShim({ React, ReactDOM: {} }),
      exports,
    );
    expect(exports.hooks).toBe(React.useState);
    expect(exports.def).toBe(React);
  });
});

describe('installPreviewDialogShims', () => {
  it('paints alert() into the visible strip instead of being swallowed', () => {
    const alertEl = document.createElement('div');
    const win: { alert?: (m?: unknown) => void } = {};
    installPreviewDialogShims(win, alertEl);

    expect(alertEl.hasAttribute('hidden')).toBe(true);
    win.alert!('Recado enviado!');
    expect(alertEl.textContent).toBe('Recado enviado!');
    expect(alertEl.hasAttribute('hidden')).toBe(false);
  });

  it('keeps only the LAST message, so an assertion on it is deterministic', () => {
    const alertEl = document.createElement('div');
    const win: { alert?: (m?: unknown) => void } = {};
    installPreviewDialogShims(win, alertEl);
    win.alert!('primeiro');
    win.alert!('segundo');
    expect(alertEl.textContent).toBe('segundo');
  });

  it('coerces non-strings and handles a bare alert()', () => {
    const alertEl = document.createElement('div');
    const win: { alert?: (m?: unknown) => void } = {};
    installPreviewDialogShims(win, alertEl);
    win.alert!(42);
    expect(alertEl.textContent).toBe('42');
    win.alert!();
    expect(alertEl.textContent).toBe('');
  });

  it('reset() clears and re-hides the strip (called on every remount)', () => {
    const alertEl = document.createElement('div');
    const win: { alert?: (m?: unknown) => void } = {};
    const { reset } = installPreviewDialogShims(win, alertEl);
    win.alert!('oi');
    reset();
    expect(alertEl.textContent).toBe('');
    expect(alertEl.hasAttribute('hidden')).toBe(true);
  });

  it('confirm/prompt return defaults instead of hanging the preview', () => {
    const alertEl = document.createElement('div');
    const win: { confirm?: () => boolean; prompt?: () => string } = {};
    installPreviewDialogShims(win, alertEl);
    expect(win.confirm!()).toBe(true);
    expect(win.prompt!()).toBe('');
  });

  it('an alert-driven check is assertable through runCodeChecks', async () => {
    const { preview, alertEl } = makePreview();
    const win: { alert?: (m?: unknown) => void } = {};
    installPreviewDialogShims(win, alertEl);
    preview.querySelector('div')!.innerHTML = '<button>Enviar</button>';
    preview.querySelector('button')!.addEventListener('click', () => win.alert!('Recado enviado!'));

    const results = await runCodeChecks({
      root: preview,
      checks: [
        check({
          id: 'alerta',
          selector: '[data-itera-alert]',
          steps: [{ do: 'click', selector: 'button' }],
          assert: { type: 'text', contains: 'Recado enviado' },
        }),
      ],
      // No React here — remount is a no-op, the listener survives.
      remount: () => {},
      nextTick,
      win: window,
    });
    expect(results).toEqual([{ id: 'alerta', passed: true }]);
  });
});

describe('CODE_PREVIEW_RUNTIME_SOURCE', () => {
  /**
   * The functions above are shipped into the iframe by SERIALISING them
   * (`String(fn)`), so they must be fully self-contained — a reference to
   * anything at module scope would only blow up at runtime, inside a sandbox,
   * in front of a classroom. This rebuilds them FROM the serialised source and
   * exercises them, which is exactly the artifact the iframe evaluates.
   */
  it('rebuilds working shims from the serialised source', () => {
    const factory = new Function(
      CODE_PREVIEW_RUNTIME_SOURCE +
        '\nreturn {req:__iteraCreateRequire, dialogs:__iteraInstallDialogs, run:__iteraRunChecks};',
    ) as () => {
      req: typeof createRequireShim;
      dialogs: typeof installPreviewDialogShims;
      run: typeof runCodeChecks;
    };
    const { req, dialogs, run } = factory();

    const React = { tag: 'react' };
    expect(req({ React, ReactDOM: {} })('react')).toBe(React);
    expect(() => req({ React, ReactDOM: {} })('axios')).toThrow(/só pode importar "react"/);

    const alertEl = document.createElement('div');
    const win: { alert?: (m?: unknown) => void } = {};
    dialogs(win, alertEl);
    win.alert!('oi');
    expect(alertEl.textContent).toBe('oi');

    expect(typeof run).toBe('function');
  });

  it('runs checks from the serialised source against a real DOM', async () => {
    const factory = new Function(
      CODE_PREVIEW_RUNTIME_SOURCE + '\nreturn __iteraRunChecks;',
    ) as () => typeof runCodeChecks;
    const run = factory();
    const { preview } = makePreview();
    preview.querySelector('div')!.innerHTML = '<button class="bg-emerald-500">Enviar</button>';

    const results = await run({
      root: preview,
      checks: [check({ selector: 'button', assert: { type: 'class', contains: 'bg-emerald-500' } })],
      remount: () => {},
      nextTick,
      win: window,
    });
    expect(results).toEqual([{ id: 'c1', passed: true }]);
  });
});
