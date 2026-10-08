import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { SingleChoiceActivity } from '@/components/branded/activity/SingleChoiceActivity';
import { MultiChoiceActivity } from '@/components/branded/activity/MultiChoiceActivity';
import { MatchActivity } from '@/components/branded/activity/MatchActivity';
import type { Activity, ActivityKind } from '@/types/content';

/**
 * Learner-facing option cards must show the FULL option text (wraps to multiple
 * lines) — never clamp/ellipsis it. These guard against a regression to
 * `truncate` / `line-clamp` / `whitespace-nowrap` on the label span, and assert
 * that options sharing a row keep equal heights while a stacked list does not.
 */

const LONG =
  'This is a deliberately very long option label that would previously be cut off with an ellipsis but must now wrap across multiple lines so the learner can read all of it';

function activity(kind: ActivityKind, spec: Record<string, unknown>): Activity {
  return { id: `t-${kind}`, lessonId: 'l', ordinal: 0, kind, spec, rubric: null, status: undefined };
}

/**
 * The span that decides how the label wraps. Since the labels draw their inline
 * marks (`InlineLabel`), the text sits one span deeper than the wrapping one.
 */
function labelSpan(text: string): HTMLElement {
  const inner = screen.getByText(text);
  return inner.closest<HTMLElement>('.break-words') ?? inner;
}

describe('option cards — full text (no truncation), equal height only in a shared row', () => {
  it('single_choice renders the full long label and does NOT clamp it', () => {
    render(
      <I18nProvider>
        <SingleChoiceActivity
          activity={activity('single_choice', {
            options: [
              { id: 'a', label: LONG },
              { id: 'b', label: 'Short' },
            ],
            correct_option_id: 'a',
          })}
          onComplete={vi.fn()}
        />
      </I18nProvider>,
    );
    const span = labelSpan(LONG);
    expect(span).toBeTruthy();
    expect(span.className).not.toMatch(/truncate|text-ellipsis|line-clamp|whitespace-nowrap/);
    expect(span.className).toMatch(/break-words/);
    // A stacked list sizes each card by its own text: no equal rows.
    const container = screen.getByTestId('single-choice-options');
    expect(container.className).not.toMatch(/auto-rows-fr/);
  });

  it('single_choice options that share a row keep equal heights', () => {
    render(
      <I18nProvider>
        <SingleChoiceActivity
          activity={activity('single_choice', {
            options: [
              { id: 'a', label: 'A' },
              { id: 'b', label: 'B' },
              { id: 'c', label: 'C' },
            ],
            correct_option_id: 'a',
          })}
          onComplete={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getByTestId('single-choice-options').className).toMatch(/(^| )auto-rows-fr/);
  });

  it('multi_choice renders the full long label and does NOT clamp it', () => {
    render(
      <I18nProvider>
        <MultiChoiceActivity
          activity={activity('multi_choice', {
            options: [
              { id: 'a', label: LONG },
              { id: 'b', label: 'Short' },
            ],
            correct_option_ids: ['a'],
          })}
          onComplete={vi.fn()}
        />
      </I18nProvider>,
    );
    const span = labelSpan(LONG);
    expect(span.className).not.toMatch(/truncate|text-ellipsis|line-clamp|whitespace-nowrap/);
    const container = screen.getByTestId('multi-choice-options');
    expect(container.className).not.toMatch(/auto-rows-fr/);
  });

  it('match cards render the full long label and do NOT clamp it (both columns equal-height)', () => {
    render(
      <I18nProvider>
        <MatchActivity
          activity={activity('match', {
            left: [
              { id: 'a', label: LONG },
              { id: 'b', label: 'Beta' },
            ],
            right: [
              { id: 'ra', label: 'DefA' },
              { id: 'rb', label: 'DefB' },
            ],
            pairs: [
              { left_id: 'a', right_id: 'ra' },
              { left_id: 'b', right_id: 'rb' },
            ],
          })}
          onComplete={vi.fn()}
        />
      </I18nProvider>,
    );
    const span = labelSpan(LONG);
    expect(span.className).not.toMatch(/truncate|text-ellipsis|line-clamp|whitespace-nowrap/);
    expect(screen.getByTestId('match-left').className).toMatch(/auto-rows-fr/);
    expect(screen.getByTestId('match-right').className).toMatch(/auto-rows-fr/);
  });
});
