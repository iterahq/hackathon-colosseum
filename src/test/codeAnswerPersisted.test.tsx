import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import type { Activity } from '@/types/content';
import type { ActivityCompleteDetail } from '@/components/branded/activity/activityFeedbackKinds';
import { buildAttemptFeedback, MAX_RESPONSE_CHARS } from '@/services/progress.service';
import { buildArtifact } from '@/services/artifactPolicy';

/**
 * THE LEARNER'S CODE LEAVES THE MACHINE — the gap this suite pins.
 *
 * Measured on the Itera DB, 2026-08-03: of 556 rows in `itera.activity_results`
 * only 29 (5%) carry any `response`, and NOT ONE of them is a `code` attempt.
 * Every code attempt recorded a boolean; the work itself lived exclusively in
 * `localStorage` (`codeSnapshot.service`) and died with the cache. That is the
 * kind where *"how did they get there"* is the entire question, and it was the
 * one kind keeping nothing.
 *
 * These tests are deliberately split in two, because the fix spans two modules
 * that must not be tested through each other:
 *
 *  1. the ACTIVITY hands the settled source up through the existing
 *     `ActivityCompleteDetail.response` channel — nothing is written here, and
 *     the author harness therefore stays write-free;
 *  2. the PLAYER-side pure functions turn that string into the two things the
 *     learner keeps: a capped attempt-log entry and an artifact row.
 *
 * ⚠️ What is NOT asserted, on purpose: that autosave changed. It did not. The
 * debounced draft still goes to `localStorage` and only to `localStorage`
 * (`CodeSnackRestore.test.tsx` owns that behaviour). Only the SETTLED
 * submission travels.
 */

vi.mock('@/components/editor/CodeEditor', () => ({
  CodeEditor: ({
    value,
    onChange,
    readOnly,
  }: {
    value: string;
    onChange?: (v: string) => void;
    readOnly?: boolean;
  }) => (
    <textarea
      data-testid="mock-editor"
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

const preview = vi.hoisted(() => ({
  results: [] as { id: string; passed: boolean }[],
}));

vi.mock('@/components/branded/activity/code/CodeLivePreview', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    CodeLivePreview: ({
      code,
      checksRequest,
      onChecksResult,
    }: {
      code: string;
      checksRequest?: { token: number; code: string } | null;
      onChecksResult?: (r: { id: string; passed: boolean }[], token: number) => void;
    }) => {
      React.useEffect(() => {
        if (!checksRequest) return;
        onChecksResult?.(preview.results, checksRequest.token);
      }, [checksRequest, onChecksResult]);
      return React.createElement('div', { 'data-testid': 'mock-preview' }, code);
    },
  };
});

vi.mock('@/services/codeSnapshot.service', () => ({
  saveCodeSnapshot: vi.fn(),
  clearCodeSnapshot: vi.fn(),
  readCodeSnapshot: () => null,
}));

import { CodeSnackActivity } from '@/components/branded/activity/code/CodeSnackActivity';

const STARTER = 'export default function App() { return <p>oi</p>; }';

function makeActivity(spec: Record<string, unknown>): Activity {
  return { id: 't-code', lessonId: 'l', ordinal: 0, kind: 'code', spec, rubric: null };
}

/** Render and capture the `detail` of the one `onComplete`. */
function renderSnack(spec: Record<string, unknown>) {
  const details: (ActivityCompleteDetail | undefined)[] = [];
  const onComplete = vi.fn((_c: boolean, d?: ActivityCompleteDetail) => details.push(d));
  render(
    <I18nProvider>
      <CodeSnackActivity activity={makeActivity(spec)} onComplete={onComplete} />
    </I18nProvider>
  );
  return { onComplete, detail: () => details[0] };
}

function type(source: string) {
  act(() => {
    fireEvent.change(screen.getByTestId('mock-editor'), { target: { value: source } });
  });
}

describe('the code snack hands the settled SOURCE up, not just a boolean', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    preview.results = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ungraded snack: "Concluir" carries what the learner actually wrote', () => {
    const { onComplete, detail } = renderSnack({ prompt: 'p', starter: STARTER });
    type('const answer = 42;');
    fireEvent.click(screen.getByTestId('activity-done'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(detail()?.response).toBe('const answer = 42;');
  });

  it('untouched snack: the STARTER is what was submitted, and that is the honest record', () => {
    // Not "empty". A learner who clicked through without editing genuinely
    // submitted the starter, and an empty response would misreport that as
    // "nothing to see" instead of "they changed nothing" — a distinction the
    // whole point of this data is to preserve.
    const { detail } = renderSnack({ prompt: 'p', starter: STARTER });
    fireEvent.click(screen.getByTestId('activity-done'));
    expect(detail()?.response).toBe(STARTER);
  });

  it('graded snack: a FAILED attempt keeps the source too — that is the interesting one', () => {
    // A pass tells you they got there. A fail plus the source tells you WHERE
    // they were stuck, which is the question the attempt log exists to answer
    // and the one a boolean can never answer.
    preview.results = [{ id: 'c1', passed: false }];
    const { onComplete, detail } = renderSnack({
      prompt: 'p',
      starter: STARTER,
      checks: [
        { id: 'c1', label: 'o botão diz "oi"', selector: 'p', assert: { type: 'text', equals: 'oi' } },
      ],
    });
    type('minha tentativa quebrada');
    act(() => {
      fireEvent.click(screen.getByTestId('code-submit'));
    });
    act(() => {
      fireEvent.click(screen.getByTestId('code-checks-continue'));
    });

    expect(onComplete).toHaveBeenCalledWith(false, expect.objectContaining({ response: 'minha tentativa quebrada' }));
    expect(detail()?.response).toBe('minha tentativa quebrada');
  });
});

describe('what the player then keeps — the two destinations, as pure functions', () => {
  const SOURCE = 'const answer = 42;';

  it('the attempt log stores the source verbatim under the shared cap', () => {
    // Same channel, same cap, same table as every other kind's answer. Nothing
    // about `code` is special here, which is the point: no new column, no new
    // policy, no new grant.
    expect(buildAttemptFeedback(SOURCE)).toEqual({ response: SOURCE });
  });

  it('an over-long submission is TRUNCATED and says so — never silently shortened', () => {
    // Measured 2026-08-03: all 15 authored `code` starters are 158–1388 chars,
    // none over 2000, so the shared cap is not a de-facto truncation of this
    // kind. It still has to behave honestly when a learner writes past it.
    const long = 'x'.repeat(MAX_RESPONSE_CHARS + 500);
    const fb = buildAttemptFeedback(long);
    expect(fb.response).toHaveLength(MAX_RESPONSE_CHARS);
    expect(fb.response_truncated).toBe(true);
    expect(fb.response_length).toBe(MAX_RESPONSE_CHARS + 500);
  });

  it('the artifact default for `code` was already `persist: true` — this is its call site', () => {
    // `KIND_ARTIFACT_DEFAULTS.code` has said `persist: true` since PR #191,
    // with a comment reading "not yet WIRED … the default is correct in advance
    // so that wiring it later is one call site, not another policy decision".
    // Handing the source up IS that call site; this asserts the wiring closed.
    const artifact = buildArtifact(
      { kind: 'code', artifactPolicy: null },
      null,
      { response: SOURCE, title: 'Meu primeiro componente' }
    );
    expect(artifact).toMatchObject({ type: 'code', content: SOURCE, filename: 'solution.txt' });
  });

  it('an empty submission produces NO artifact — an empty file is not a deliverable', () => {
    expect(buildArtifact({ kind: 'code', artifactPolicy: null }, null, { response: '' })).toBeNull();
  });

  it('an author who opted OUT still gets nothing, source or not', () => {
    // The policy stays the authority. Wiring the producer must not become a
    // back door around `mode: 'never'`.
    expect(
      buildArtifact({ kind: 'code', artifactPolicy: { mode: 'never' } }, null, { response: SOURCE })
    ).toBeNull();
  });
});
