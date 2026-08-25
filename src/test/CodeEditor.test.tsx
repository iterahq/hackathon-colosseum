import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { CodeEditor } from '@/components/editor/CodeEditor';
import {
  configureTypeScriptDefaults,
  modelPathFor,
} from '@/components/editor/monacoTypescript';

/**
 * CodeEditor — TypeScript worker setup for a LEARNING surface.
 *
 * Two independent sources of RED SQUIGGLES UNDER CORRECT CODE were shipped by
 * Monaco's stock defaults:
 *
 *  1. no model path → `tsWorker#getScriptKind` falls back to `ScriptKind.TS`,
 *     so JSX (`<h1 className="…">`) is a SYNTAX error — semantic-validation
 *     flags cannot silence it, the model has to be `.tsx`;
 *  2. `noSemanticValidation: false` → `useState` (a runtime-injected global in
 *     the snack preview, never imported) reports "Cannot find name 'useState'",
 *     i.e. an error under the exact API the lesson teaches.
 *
 * Real-Monaco measurement of the class starter under these settings: 27 markers
 * (25 errors) before → 0 after, while a genuine syntax error ("'}' expected",
 * "Expected corresponding JSX closing tag") still surfaces.
 */

type ModelChangeEvent = {
  isUndoing?: boolean;
  isRedoing?: boolean;
  changes: { range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } }[];
};

type CapturedProps = {
  path?: string;
  language?: string;
  options?: { scrollbar?: { alwaysConsumeMouseWheel?: boolean } };
  beforeMount?: (monaco: unknown) => void;
  onMount?: (editor: unknown, monaco: unknown) => void;
};

const captured: CapturedProps[] = [];

vi.mock('@monaco-editor/react', () => ({
  default: (props: CapturedProps) => {
    captured.push(props);
    props.beforeMount?.(makeFakeMonaco());
    return <div data-testid="monaco-stub" />;
  },
}));

type FakeDefaults = {
  compilerOptions: Record<string, unknown>;
  diagnosticsOptions: Record<string, unknown>;
  getCompilerOptions: () => Record<string, unknown>;
  setCompilerOptions: (o: Record<string, unknown>) => void;
  setDiagnosticsOptions: (o: Record<string, unknown>) => void;
};

function makeFakeDefaults(seed: Record<string, unknown>): FakeDefaults {
  const d: FakeDefaults = {
    compilerOptions: { ...seed },
    diagnosticsOptions: {},
    getCompilerOptions: () => d.compilerOptions,
    setCompilerOptions: (o) => {
      d.compilerOptions = o;
    },
    setDiagnosticsOptions: (o) => {
      d.diagnosticsOptions = o;
    },
  };
  return d;
}

function makeFakeMonaco() {
  return {
    editor: { defineTheme: vi.fn(), setTheme: vi.fn() },
    languages: {
      typescript: {
        // Mirrors monaco's own defaults: TS type-checks, JS does not.
        typescriptDefaults: makeFakeDefaults({ allowNonTsExtensions: true, target: 99 }),
        javascriptDefaults: makeFakeDefaults({ allowNonTsExtensions: true, allowJs: true, target: 99 }),
        JsxEmit: { None: 0, Preserve: 1, React: 2, ReactNative: 3 },
      },
    },
  };
}

/**
 * Enough of a Monaco editor for the wall: it holds a value the test can move
 * under the component's feet, and records the `undo` the wall triggers.
 */
function makeFakeEditor(initial: string) {
  const listeners: ((e: ModelChangeEvent) => void)[] = [];
  let content = initial;
  return {
    trigger: vi.fn(),
    getValue: () => content,
    getModel: () => null,
    onDidChangeModelContent: (fn: (e: ModelChangeEvent) => void) => listeners.push(fn),
    onDidChangeCursorPosition: () => {},
    createDecorationsCollection: () => ({ set: vi.fn() }),
    setPosition: () => {},
    getVisibleRanges: () => [],
    revealLineInCenter: () => {},
    /** Apply an edit the way monaco would, then fire the listener. */
    apply(next: string, e: ModelChangeEvent) {
      content = next;
      listeners.forEach((fn) => fn(e));
    },
  };
}

const WHOLE_FILE = {
  changes: [{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 99, endColumn: 1 } }],
};

beforeEach(() => {
  captured.length = 0;
});

describe('modelPathFor', () => {
  it('maps typescript to a .tsx model so the worker parses JSX', () => {
    expect(modelPathFor('typescript', 7)).toBe('file:///itera-snack-7.tsx');
  });

  it('maps javascript to a .jsx model', () => {
    expect(modelPathFor('javascript', 3)).toBe('file:///itera-snack-3.jsx');
  });

  it('leaves non-TS-family languages on monaco default models', () => {
    expect(modelPathFor('html', 1)).toBeUndefined();
    expect(modelPathFor('css', 1)).toBeUndefined();
    expect(modelPathFor('json', 1)).toBeUndefined();
  });
});

describe('configureTypeScriptDefaults', () => {
  it('disables semantic diagnostics by default while keeping syntax ones', () => {
    const monaco = makeFakeMonaco();
    configureTypeScriptDefaults(monaco as never, false);

    for (const d of [
      monaco.languages.typescript.typescriptDefaults,
      monaco.languages.typescript.javascriptDefaults,
    ]) {
      expect(d.diagnosticsOptions.noSemanticValidation).toBe(true);
      // Real mistakes MUST still be flagged — this is the pedagogical signal.
      expect(d.diagnosticsOptions.noSyntaxValidation).toBe(false);
      expect(d.diagnosticsOptions.noSuggestionDiagnostics).toBe(true);
    }
  });

  it('re-enables semantic diagnostics when a caller opts in', () => {
    const monaco = makeFakeMonaco();
    configureTypeScriptDefaults(monaco as never, true);

    for (const d of [
      monaco.languages.typescript.typescriptDefaults,
      monaco.languages.typescript.javascriptDefaults,
    ]) {
      expect(d.diagnosticsOptions.noSemanticValidation).toBe(false);
      expect(d.diagnosticsOptions.noSyntaxValidation).toBe(false);
      expect(d.diagnosticsOptions.noSuggestionDiagnostics).toBe(false);
    }
  });

  it('turns JSX on without dropping the pre-existing compiler options', () => {
    const monaco = makeFakeMonaco();
    configureTypeScriptDefaults(monaco as never, false);

    const opts = monaco.languages.typescript.typescriptDefaults.getCompilerOptions();
    expect(opts.jsx).toBe(monaco.languages.typescript.JsxEmit.React);
    expect(opts.allowNonTsExtensions).toBe(true);
    expect(opts.target).toBe(99);
  });

  it('no-ops on a monaco build without the typescript language service', () => {
    expect(() => configureTypeScriptDefaults({ languages: {} } as never, false)).not.toThrow();
  });
});

describe('CodeEditor', () => {
  it('hands monaco a .tsx model path so JSX is not a syntax error', () => {
    render(<CodeEditor value="const a = 1" />);
    expect(captured[0].path).toMatch(/^file:\/\/\/itera-snack-\d+\.tsx$/);
    expect(captured[0].language).toBe('typescript');
  });

  it('gives every instance its OWN model path (shared paths share content)', () => {
    render(
      <>
        <CodeEditor value="a" />
        <CodeEditor value="b" />
      </>
    );
    const paths = [...new Set(captured.map((p) => p.path))];
    expect(paths).toHaveLength(2);
  });

  it('configures the worker with semantic validation OFF by default', () => {
    const monaco = makeFakeMonaco();
    render(<CodeEditor value="x" />);
    captured[0].beforeMount?.(monaco);
    expect(
      monaco.languages.typescript.typescriptDefaults.diagnosticsOptions.noSemanticValidation
    ).toBe(true);
  });

  it('honours the semanticValidation opt-in', () => {
    const monaco = makeFakeMonaco();
    render(<CodeEditor value="x" semanticValidation />);
    captured[0].beforeMount?.(monaco);
    expect(
      monaco.languages.typescript.typescriptDefaults.diagnosticsOptions.noSemanticValidation
    ).toBe(false);
  });

  /**
   * The wall reverts what lands outside a region. A whole-document replacement
   * is outside every region BY DEFINITION, so "recomeçar do código inicial" —
   * measured in the 2026-08-17 class — was undone the instant it applied, and
   * the learner got back the draft they had just thrown away.
   */
  describe('editable-region wall', () => {
    const regions = [{ startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 10 }];

    it('reverts a learner edit that lands outside every region', () => {
      const editor = makeFakeEditor('starter');
      render(<CodeEditor value="starter" editableRegions={regions} />);
      captured[0].onMount?.(editor, makeFakeMonaco());

      editor.apply('learner typed on a locked line', WHOLE_FILE);

      expect(editor.trigger).toHaveBeenCalledWith('editableRegions', 'undo', null);
    });

    it('lets the owner replace the whole document (reset to starter)', () => {
      const editor = makeFakeEditor('the learner draft');
      const { rerender } = render(<CodeEditor value="the learner draft" editableRegions={regions} />);
      captured[0].onMount?.(editor, makeFakeMonaco());

      rerender(<CodeEditor value="starter" editableRegions={regions} />);
      editor.apply('starter', WHOLE_FILE);

      expect(editor.trigger).not.toHaveBeenCalled();
    });
  });

  /**
   * Reported from the 2026-08-24 class: after finishing an exercise the learner
   * could not scroll back up to the statement. Monaco's stock
   * `alwaysConsumeMouseWheel: true` eats the wheel event even when the editor is
   * already at its top, and `CODE_PANE_BOX` gives the editor 55vh — so the
   * pointer is over it by default and the page never moves.
   */
  it('lets the wheel reach the page once the editor has nothing left to scroll', () => {
    render(<CodeEditor value="x" />);
    expect(captured[0].options?.scrollbar?.alwaysConsumeMouseWheel).toBe(false);
  });

  it('still registers the iterate-dark theme in beforeMount', () => {
    const monaco = makeFakeMonaco();
    render(<CodeEditor value="x" />);
    captured[0].beforeMount?.(monaco);
    expect(monaco.editor.defineTheme).toHaveBeenCalledWith('iterate-dark', expect.anything());
  });
});
