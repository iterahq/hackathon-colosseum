import { act, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ActivityProvider } from '@iterahq/activities';
import type { ActivityCodeEditorProps } from '@iterahq/activities';
import { I18nProvider, useI18n } from '@/i18n';
import { ITERA_ACTIVITY_STORAGE } from '@/components/branded/activity/IteraActivityHost';

/**
 * The test-side twin of `IteraActivityHost`, for the `code` kind.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THESE TESTS STOPPED USING `vi.mock`
 * ─────────────────────────────────────────────────────────────────────────────
 * Before Fase C step 5 the `code` tests mocked two modules by path:
 * `@/components/editor/CodeEditor` (Monaco does not run in jsdom) and
 * `@/components/branded/activity/code/CodeLivePreview` (neither does a
 * sandboxed iframe). Both stopped working the moment the kind moved into
 * `@iterahq/activities/code`, and the reason is worth stating because it is not
 * a quirk of vitest: **`vi.mock` replaces a module for whoever IMPORTS THAT
 * SPECIFIER**, and the pane inside the package imports its own siblings by
 * relative path. Mocking the app's re-export shim now swaps a module nobody in
 * the render tree reads.
 *
 * That is not a problem to work around — it is the extraction working. So the
 * two mocks were replaced by the two things they were faking:
 *
 *  · the editor is a PORT now (`codeEditor` on the activity host context), so a
 *    test injects a `<textarea>` the same way the Player injects Monaco. Same
 *    `data-testid="mock-editor"`, so every existing assertion still reads;
 *  · the preview is driven through its REAL message protocol (see
 *    `previewIframe` below), so what the tests exercise is the actual
 *    parent-side of the contract — `itera:ready`, `itera:run-checks`,
 *    `itera:checks`, token echo — rather than a hand-written imitation of it.
 *
 * The second one is a strict upgrade in fidelity: the old mock answered every
 * request instantly and in order, which is exactly the behaviour the real
 * protocol is designed NOT to assume.
 */

/** The editor stub — same testid the pre-extraction `vi.mock` used. */
export function MockCodeEditor({ value, onChange, readOnly }: ActivityCodeEditorProps) {
  return (
    <textarea
      data-testid="mock-editor"
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
}

function Bridge({
  children,
  codeEditor,
}: {
  children: ReactNode;
  codeEditor: typeof MockCodeEditor;
}) {
  const i18n = useI18n();
  // The REAL storage adapter, on purpose: a test that let the package fall back
  // to its own localStorage default would still pass while asserting nothing
  // about where a learner's draft actually lands in the Player.
  return (
    <ActivityProvider i18n={i18n} storage={ITERA_ACTIVITY_STORAGE} codeEditor={codeEditor}>
      {children}
    </ActivityProvider>
  );
}

/** `<I18nProvider>` + the activity host context a `code` snack needs. */
export function CodeActivityHost({
  children,
  codeEditor = MockCodeEditor,
}: {
  children: ReactNode;
  codeEditor?: typeof MockCodeEditor;
}) {
  return (
    <I18nProvider>
      <Bridge codeEditor={codeEditor}>{children}</Bridge>
    </I18nProvider>
  );
}

/** One `itera:run-checks` the parent asked the sandbox for. */
export interface PreviewRunRequest {
  token: number;
  code: string;
  checks: { id: string }[];
}

/**
 * Play the part of the sandboxed preview iframe, over its real protocol.
 *
 * jsdom renders the `<iframe srcDoc sandbox="allow-scripts">` but never runs a
 * line of it, so the document inside stays silent forever. This stands in for
 * that document: it captures what the parent posts INTO the frame and lets a
 * test post the answers back OUT of it, with `event.source` set to the frame's
 * own window — which is the check `CodeLivePreview` uses to refuse messages
 * from anywhere else, and therefore the check a stub has to satisfy honestly.
 *
 * Call it AFTER the first render; the parent posts nothing before `boot()`.
 */
export function previewIframe() {
  const frame = screen.getByTestId('code-preview-iframe') as HTMLIFrameElement;
  const source = frame.contentWindow;
  if (!source) throw new Error('the preview iframe has no contentWindow');

  const posted: { type: string; token?: number; code?: string; checks?: { id: string }[] }[] = [];
  source.postMessage = ((message: unknown) => {
    posted.push(message as { type: string });
  }) as typeof source.postMessage;

  const deliver = (data: unknown) => {
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data, source }));
    });
  };

  return {
    /** Everything the parent sent into the frame, in order. */
    posted,
    /** Only the graded runs — the old mock's `requests`. */
    get runs(): PreviewRunRequest[] {
      return posted.filter((m) => m.type === 'itera:run-checks') as PreviewRunRequest[];
    },
    /** The sandbox finished booting. Nothing is posted into it before this. */
    boot: () => deliver({ type: 'itera:ready' }),
    /** Answer a run. `token` defaults to the most recent one asked for. */
    answer: (results: { id: string; passed: boolean }[], token?: number) => {
      const runs = posted.filter((m) => m.type === 'itera:run-checks');
      const last = runs[runs.length - 1] as PreviewRunRequest | undefined;
      deliver({ type: 'itera:checks', results, token: token ?? last?.token });
    },
  };
}

/** Type into the injected editor. */
export function typeCode(value: string) {
  act(() => {
    fireEvent.change(screen.getByTestId('mock-editor'), { target: { value } });
  });
}

/** The injected editor element. */
export const codeEditorEl = () => screen.getByTestId('mock-editor') as HTMLTextAreaElement;
