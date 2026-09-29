import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { CodeCheck } from '@iterahq/activity-spec';
import { buildHtmlPreviewDocument } from './codePreviewIframe.js';
import { HtmlLivePreview } from './HtmlLivePreview.js';
import type { CodeChecksRequest } from './types.js';

/**
 * The grading sequence of `useHtmlLivePreview`, driven through the component
 * with fake timers. vitest's jsdom does not run the appended grading script,
 * so the sandbox's `itera:checks` reply is dispatched by hand, the way
 * `codeSnackHtmlMode.test.tsx` does — and a reply that never comes is simply
 * not dispatched, which is exactly what a learner's unclosed `<!--`,
 * `<textarea>`, `<title>` or `<script>` does to the real one.
 */

const CODE = '<!doctype html><html><body><h1>Oi</h1></body></html>';
const CHECKS: CodeCheck[] = [{ id: 'h1', label: 'has h1', selector: 'h1', assert: { type: 'exists' } }];

const request = (token: number, code = CODE): CodeChecksRequest => ({ token, code, checks: CHECKS });

const frame = () => screen.getByTestId('code-preview-iframe') as HTMLIFrameElement;

async function reply(token: number, source: Window | null) {
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'itera:checks', results: [{ id: 'h1', passed: true }], token },
        source,
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useHtmlLivePreview — grading that never gets an answer', () => {
  it('times out, releases its listener, reports nothing and hands the preview back', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const onChecksResult = vi.fn();
    const { rerender } = render(<HtmlLivePreview code={CODE} onChecksResult={onChecksResult} />);
    const before = frame();

    rerender(<HtmlLivePreview code={CODE} checksRequest={request(1)} onChecksResult={onChecksResult} />);
    // The grading document is on screen and nobody answers it.
    expect(frame().srcdoc).toContain('__iteraRunChecks');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(onChecksResult).not.toHaveBeenCalled();
    const messageAdds = add.mock.calls.filter(([type]) => type === 'message').length;
    const messageRemoves = remove.mock.calls.filter(([type]) => type === 'message').length;
    expect(messageRemoves).toBe(messageAdds);
    // The learner's own page is back — on a fresh iframe, see the next test.
    expect(frame().srcdoc).toBe(buildHtmlPreviewDocument(CODE));
    expect(frame()).not.toBe(before);
  });

  it('keeps the editing preview alive after a timeout', async () => {
    const { rerender } = render(<HtmlLivePreview code={CODE} />);
    rerender(<HtmlLivePreview code={CODE} checksRequest={request(1)} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    const edited = CODE.replace('Oi', 'Ola');
    rerender(<HtmlLivePreview code={edited} checksRequest={request(1)} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(frame().srcdoc).toBe(buildHtmlPreviewDocument(edited));
  });

  it('ignores the stale run: only the newest submission is reported', async () => {
    const onChecksResult = vi.fn();
    const { rerender } = render(<HtmlLivePreview code={CODE} onChecksResult={onChecksResult} />);

    // Submission 1 never answers; the learner resets and submits again.
    rerender(<HtmlLivePreview code={CODE} checksRequest={request(1)} onChecksResult={onChecksResult} />);
    rerender(<HtmlLivePreview code={CODE} checksRequest={request(2)} onChecksResult={onChecksResult} />);

    await reply(2, frame().contentWindow);

    // One reply, one verdict — and it is submission 2's. A leaked listener
    // from submission 1 would have reported it a second time under token 1.
    expect(onChecksResult).toHaveBeenCalledTimes(1);
    expect(onChecksResult).toHaveBeenCalledWith([{ id: 'h1', passed: true }], 2);
  });

  it('a timed-out submission does not void the next one', async () => {
    const onChecksResult = vi.fn();
    const { rerender } = render(<HtmlLivePreview code={CODE} onChecksResult={onChecksResult} />);
    rerender(<HtmlLivePreview code={CODE} checksRequest={request(1)} onChecksResult={onChecksResult} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    rerender(<HtmlLivePreview code={CODE} checksRequest={request(2)} onChecksResult={onChecksResult} />);
    await reply(2, frame().contentWindow);

    expect(onChecksResult).toHaveBeenCalledTimes(1);
    expect(onChecksResult).toHaveBeenCalledWith([{ id: 'h1', passed: true }], 2);
  });
});

describe('useHtmlLivePreview — after a graded run', () => {
  it('puts the learner\'s preview back even though React saw the same srcDoc', async () => {
    const onChecksResult = vi.fn();
    const { rerender } = render(<HtmlLivePreview code={CODE} onChecksResult={onChecksResult} />);
    const editingDoc = frame().srcdoc;
    expect(editingDoc).toBe(buildHtmlPreviewDocument(CODE));

    rerender(<HtmlLivePreview code={CODE} checksRequest={request(1)} onChecksResult={onChecksResult} />);
    expect(frame().srcdoc).not.toBe(editingDoc);

    await reply(1, frame().contentWindow);

    expect(onChecksResult).toHaveBeenCalledWith([{ id: 'h1', passed: true }], 1);
    expect(frame().srcdoc).toBe(editingDoc);
  });
});
