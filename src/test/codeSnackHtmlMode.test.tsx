import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { ActivityCodeEditorProps } from '@iterahq/activities';
import { buildHtmlPreviewDocument, CodeEditorChecksActivity } from '@iterahq/activities/code';
import type { Activity } from '@/types/content';
import { CodeSnackActivity } from '@/components/branded/activity/code/CodeSnackActivity';
import { CodeActivityHost, previewIframe } from './support/codeActivityHost';

/**
 * `language: 'html'` — the plain-web mode that unlocks the Básico course. This
 * file is about the WIRING contract (raw source in a FRESH `srcDoc` per
 * render, debounced; a submit reaches the preview with the checks); the
 * realm-freshness fix itself — a top-level `let` surviving two renders + a
 * run-checks, a click listener firing exactly once after several renders, two
 * stepped checks in one submission not contaminating each other — is proven
 * with REAL script execution (the real `jsdom` package, a separate `JSDOM`
 * instance per "render") in
 * `packages/activities/src/code/codePreviewIframe.freshRealm.test.ts`, because
 * vitest's own jsdom environment is a SINGLE shared realm and cannot exercise
 * "fresh realm per render" at all.
 *
 * The `language` default/`'tsx'` path is asserted UNCHANGED here too — same
 * file, so a regression in either direction shows up next to its sibling.
 */

function makeActivity(spec: Record<string, unknown>, kind = 'code'): Activity {
  return { id: 't-code', lessonId: 'l', ordinal: 0, kind, spec, rubric: null } as Activity;
}

/** Same shape as `codeActivityHost.tsx`'s `MockCodeEditor`, but it also
 * surfaces the `language` prop the host injected it with — the one thing that
 * mock does not expose, and the one thing this file needs to check. */
function LanguageAwareMockEditor({ value, onChange, readOnly, language }: ActivityCodeEditorProps) {
  return (
    <textarea
      data-testid="mock-editor"
      data-code-language={language}
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
}

function renderSnack(spec: Record<string, unknown>) {
  render(
    <CodeActivityHost codeEditor={LanguageAwareMockEditor}>
      <CodeSnackActivity activity={makeActivity(spec)} onComplete={vi.fn()} />
    </CodeActivityHost>,
  );
}

const DEFAULT_HTML_CHECKS = [
  { id: 'title', label: 'has a title', selector: 'head > title', assert: { type: 'exists' } },
];

/** `html` mode lives on the one-behaviour kinds only — `code` is deprecated. */
function renderHtmlSnack(spec: Record<string, unknown>) {
  render(
    <CodeActivityHost codeEditor={LanguageAwareMockEditor}>
      <CodeEditorChecksActivity
        activity={makeActivity({ checks: DEFAULT_HTML_CHECKS, ...spec }, 'code_editor_checks')}
        onComplete={vi.fn()}
      />
    </CodeActivityHost>,
  );
}

const HTML_STARTER = [
  '<!doctype html>',
  '<html lang="pt-BR">',
  '<head><title>Minha página</title></head>',
  '<body><h1>Olá!</h1></body>',
  '</html>',
].join('');

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  window.localStorage.clear();
});

/**
 * The imperative `frame.srcdoc = …` HtmlLivePreview's grading path uses
 * (bypassing React) still reflects into the same DOM property React's own
 * `srcDoc` prop writes — this just reads it back after the debounce so a test
 * does not have to know which of the two wrote it last.
 */
function htmlIframeSrcDoc(): string {
  return (screen.getByTestId('code-preview-iframe') as HTMLIFrameElement).srcdoc;
}

describe('code_editor_checks — language: "html"', () => {
  it('seeds the editor with the FULL document and switches Monaco to html', () => {
    renderHtmlSnack({ prompt: 'Escreva sua primeira página', starter: HTML_STARTER, language: 'html' });
    const editor = screen.getByTestId('mock-editor') as HTMLTextAreaElement;
    expect(editor.value).toBe(HTML_STARTER);
    expect(editor.dataset.codeLanguage).toBe('html');
  });

  it('renders a FRESH document built from the raw source — no transpile step', () => {
    renderHtmlSnack({ prompt: 'p', starter: HTML_STARTER, language: 'html' });
    // The debounced first render.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(htmlIframeSrcDoc()).toBe(buildHtmlPreviewDocument(HTML_STARTER));
  });

  it('mounts no React/Tailwind CDN — the plain-web contract ships none of that', () => {
    renderHtmlSnack({ prompt: 'p', starter: HTML_STARTER, language: 'html' });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const srcDoc = htmlIframeSrcDoc();
    expect(srcDoc).not.toContain('/vendor/react');
    expect(srcDoc).not.toContain('tailwind-play-cdn');
    // …and no `#root`/`#preview` wrapper — `checks[].selector` resolves
    // against the WHOLE document, not a sub-tree this preview invented.
    expect(srcDoc).not.toContain('id="preview"');
  });

  it('debounces re-renders while typing — one navigation, not one per keystroke', () => {
    renderHtmlSnack({ prompt: 'p', starter: HTML_STARTER, language: 'html' });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const before = htmlIframeSrcDoc();

    act(() => {
      fireEvent.change(screen.getByTestId('mock-editor'), {
        target: { value: HTML_STARTER.replace('Olá!', 'Oi!') },
      });
    });
    // Immediately after typing, nothing has re-rendered yet.
    expect(htmlIframeSrcDoc()).toBe(before);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(htmlIframeSrcDoc()).toBe(buildHtmlPreviewDocument(HTML_STARTER.replace('Olá!', 'Oi!')));
  });

  it('a submit reaches the preview with the SUBMITTED source and checks, and reports the verdict', async () => {
    const CHECKS = [
      { id: 'lang', label: 'html tem lang', selector: 'html[lang]', assert: { type: 'exists' } },
    ];
    renderHtmlSnack({ prompt: 'p', starter: HTML_STARTER, language: 'html', checks: CHECKS });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    const frame = screen.getByTestId('code-preview-iframe') as HTMLIFrameElement;
    const source = frame.contentWindow;
    if (!source) throw new Error('the preview iframe has no contentWindow');

    act(() => {
      fireEvent.click(screen.getByTestId('code-submit'));
    });

    // ONE stepless check ⇒ ONE fresh document, containing the submitted
    // source and the check the learner asked for.
    const gradedDoc = htmlIframeSrcDoc();
    expect(gradedDoc).toContain(HTML_STARTER);
    expect(gradedDoc).toContain('"selector":"html[lang]"');

    // Answer as the sandboxed realm would. `await act(async …)` (not the sync
    // overload) is required here: resolving `loadAndWaitForChecks`'s promise
    // from a dispatched event resumes `gradeHtml`'s `.then` on the MICROTASK
    // queue, one tick after `dispatchEvent` itself returns.
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'itera:checks', results: [{ id: 'lang', passed: true }] },
          source,
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('code-checks-feedback')).toHaveAttribute('data-all-passed', 'true');
  });
});

describe('code (deprecated) — gains no behaviour', () => {
  it('rejects language: "html" with the invalid-spec card instead of rendering it', () => {
    renderSnack({ prompt: 'p', starter: HTML_STARTER, language: 'html' });
    expect(screen.getByTestId('code-invalid')).toBeInTheDocument();
    expect(screen.queryByTestId('code-preview-iframe')).toBeNull();
  });
});

describe('code_editor_ungraded — language: "html"', () => {
  it('renders the html preview too — the mode follows the shared panes, not one kind', () => {
    render(
      <CodeActivityHost codeEditor={LanguageAwareMockEditor}>
        <CodeEditorChecksActivity
          activity={makeActivity({ prompt: 'p', starter: HTML_STARTER, language: 'html' }, 'code_editor_ungraded')}
          onComplete={vi.fn()}
        />
      </CodeActivityHost>,
    );
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect((screen.getByTestId('mock-editor') as HTMLTextAreaElement).dataset.codeLanguage).toBe('html');
    expect(htmlIframeSrcDoc()).toBe(buildHtmlPreviewDocument(HTML_STARTER));
  });
});

describe('CodeSnackActivity — language default (tsx) stays exactly as it was', () => {
  const STARTER = 'export default function App() { return <div>oi</div>; }';

  it('seeds the editor with the tsx starter untouched and keeps Monaco on typescript', () => {
    renderSnack({ prompt: 'p', starter: STARTER });
    const editor = screen.getByTestId('mock-editor') as HTMLTextAreaElement;
    expect(editor.value).toBe(STARTER);
    expect(editor.dataset.codeLanguage).toBe('typescript');
  });

  it('posts sucrase-TRANSPILED code to the preview, and uses the React template', () => {
    renderSnack({ prompt: 'p', starter: STARTER });
    const sandbox = previewIframe();
    sandbox.boot();

    const renderMsg = sandbox.posted.find((m) => m.type === 'itera:code');
    // Sucrase's `imports` transform rewrites JSX/`export default` — the posted
    // code is no longer byte-identical to the learner's source.
    expect(renderMsg?.code).not.toBe(STARTER);
    expect(renderMsg?.code).toContain('React.createElement');

    const iframe = screen.getByTestId('code-preview-iframe') as HTMLIFrameElement;
    expect(iframe.srcdoc).toContain('/vendor/react.production.min.js');
  });
});
