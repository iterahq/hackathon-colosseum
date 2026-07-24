import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import type { Activity, ActivityKind } from '@/types/content';

/**
 * v1 general learning-activity taxonomy (plan 20260703). Asserts the branded
 * ActivityRenderer DISPATCHES each new kind to its component (converge — one
 * activity system) and that the interactive kinds honor the `onComplete(correct)`
 * contract (correct vs incorrect).
 */

function makeActivity(kind: ActivityKind, spec: Record<string, unknown>): Activity {
  return { id: `t-${kind}`, lessonId: 'l', ordinal: 0, kind, spec, rubric: null };
}

function renderActivity(activity: Activity, onComplete = vi.fn()) {
  render(
    <I18nProvider>
      <ActivityRenderer activity={activity} onComplete={onComplete} />
    </I18nProvider>,
  );
  return onComplete;
}

describe('ActivityRenderer — v1 general activity kinds', () => {
  it('dispatches concept to its shell with NO mark-done affordance', () => {
    renderActivity(makeActivity('concept', { instruction: { text: 'Hello concept' } }));
    expect(screen.getByTestId('activity-shell').getAttribute('data-activity-kind')).toBe('concept');
    expect(screen.getByText('Hello concept')).toBeInTheDocument();
    // Concept is pure reading — the learner does NOT "mark it done"; advancing is
    // shell-driven (LessonPlayer's Continuar / the live instructor).
    expect(screen.queryByTestId('activity-done')).toBeNull();
  });

  it('dispatches video to its shell', () => {
    renderActivity(makeActivity('video', { video_url: 'https://x/y.mp4' }));
    expect(screen.getByTestId('activity-shell').getAttribute('data-activity-kind')).toBe('video');
    expect(screen.getByTestId('video-player')).toBeInTheDocument();
  });

  // ONE-STEP (2026-07): a single "Enviar" click grades AND completes — there is
  // NO second "Marcar como concluída" button. The submit button then locks to a
  // disabled "Enviado" state. These assert onComplete fires on the submit click.
  it('single_choice: correct selection completes correct on submit (one step)', () => {
    const onComplete = renderActivity(
      makeActivity('single_choice', {
        options: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        correct_option_id: 'b',
      }),
    );
    fireEvent.click(screen.getByText('B'));
    fireEvent.click(screen.getByTestId('single-choice-submit'));
    expect(onComplete).toHaveBeenCalledWith(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    // No second completion button, and the submit button is now the locked
    // "Enviado" state.
    expect(screen.queryByTestId('activity-done')).toBeNull();
    const btn = screen.getByTestId('single-choice-submit') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('data-submitted')).toBe('true');
    expect(btn.textContent ?? '').toMatch(/Enviado/i);
  });

  it('single_choice: wrong selection completes incorrect on submit (one step)', () => {
    const onComplete = renderActivity(
      makeActivity('single_choice', {
        options: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        correct_option_id: 'b',
      }),
    );
    fireEvent.click(screen.getByText('A'));
    fireEvent.click(screen.getByTestId('single-choice-submit'));
    expect(onComplete).toHaveBeenCalledWith(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('single_choice: submit is disabled until an answer is selected', () => {
    renderActivity(
      makeActivity('single_choice', {
        options: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        correct_option_id: 'b',
      }),
    );
    const btn = screen.getByTestId('single-choice-submit') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('multi_choice: exact set completes correct on submit (one step)', () => {
    const onComplete = renderActivity(
      makeActivity('multi_choice', {
        options: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
          { id: 'c', label: 'C' },
        ],
        correct_option_ids: ['a', 'c'],
      }),
    );
    fireEvent.click(screen.getByText('A'));
    fireEvent.click(screen.getByText('C'));
    fireEvent.click(screen.getByTestId('multi-choice-submit'));
    expect(onComplete).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId('activity-done')).toBeNull();
  });

  it('order: correct sequence completes correct on submit (one step)', () => {
    const onComplete = renderActivity(
      makeActivity('order', {
        items: [
          { id: 'b', label: 'Second' },
          { id: 'a', label: 'First' },
        ],
        correct_order: ['a', 'b'],
      }),
    );
    // Options render in a per-learner shuffled order, so drive the list into the
    // correct sequence regardless of the starting order: if 'First' isn't on top,
    // move it up (2 items → one nudge is enough).
    if (!screen.getAllByTestId('order-item')[0].textContent?.includes('First')) {
      fireEvent.click(screen.getAllByTestId('order-down')[0]);
    }
    fireEvent.click(screen.getByTestId('order-submit'));
    expect(onComplete).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId('activity-done')).toBeNull();
  });

  it('match: connecting the right pairs completes correct on submit (one step)', () => {
    const onComplete = renderActivity(
      makeActivity('match', {
        left: [{ id: 'l1', label: 'Left1' }],
        right: [{ id: 'r1', label: 'Right1' }],
        pairs: [{ left_id: 'l1', right_id: 'r1' }],
      }),
    );
    fireEvent.click(screen.getByText('Left1'));
    fireEvent.click(screen.getByText('Right1'));
    fireEvent.click(screen.getByTestId('match-submit'));
    expect(onComplete).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId('activity-done')).toBeNull();
  });

  it('quiz: submit grades AND completes in one step, then locks to "Enviado"', () => {
    const onComplete = renderActivity(
      makeActivity('quiz', {
        question: 'Pick B',
        options: [
          { id: 'a', label: 'A', isCorrect: false },
          { id: 'b', label: 'B', isCorrect: true },
        ],
      }),
    );
    fireEvent.click(screen.getByText('B'));
    fireEvent.click(screen.getByTestId('quiz-submit'));
    expect(onComplete).toHaveBeenCalledWith(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('activity-done')).toBeNull();
    const btn = screen.getByTestId('quiz-submit') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent ?? '').toMatch(/Enviado/i);
  });
});
