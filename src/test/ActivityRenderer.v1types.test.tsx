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
  it('dispatches concept to its shell', () => {
    renderActivity(makeActivity('concept', { instruction: { text: 'Hello concept' } }));
    expect(screen.getByTestId('activity-shell').getAttribute('data-activity-kind')).toBe('concept');
    expect(screen.getByText('Hello concept')).toBeInTheDocument();
  });

  it('dispatches video to its shell', () => {
    renderActivity(makeActivity('video', { video_url: 'https://x/y.mp4' }));
    expect(screen.getByTestId('activity-shell').getAttribute('data-activity-kind')).toBe('video');
    expect(screen.getByTestId('video-player')).toBeInTheDocument();
  });

  it('single_choice: correct selection completes correct', () => {
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
    fireEvent.click(screen.getByTestId('activity-done'));
    expect(onComplete).toHaveBeenCalledWith(true);
  });

  it('single_choice: wrong selection completes incorrect', () => {
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
    fireEvent.click(screen.getByTestId('activity-done'));
    expect(onComplete).toHaveBeenCalledWith(false);
  });

  it('multi_choice: exact set completes correct', () => {
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
    fireEvent.click(screen.getByTestId('activity-done'));
    expect(onComplete).toHaveBeenCalledWith(true);
  });

  it('order: correct sequence completes correct via move buttons', () => {
    const onComplete = renderActivity(
      makeActivity('order', {
        items: [
          { id: 'b', label: 'Second' },
          { id: 'a', label: 'First' },
        ],
        correct_order: ['a', 'b'],
      }),
    );
    // initial order = [b, a]; move the first item (b) down to get [a, b].
    fireEvent.click(screen.getAllByTestId('order-down')[0]);
    fireEvent.click(screen.getByTestId('order-submit'));
    fireEvent.click(screen.getByTestId('activity-done'));
    expect(onComplete).toHaveBeenCalledWith(true);
  });

  it('match: connecting the right pairs completes correct', () => {
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
    fireEvent.click(screen.getByTestId('activity-done'));
    expect(onComplete).toHaveBeenCalledWith(true);
  });
});
