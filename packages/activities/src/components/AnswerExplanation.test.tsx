import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ActivityProvider } from '../context.js';
import { AnswerExplanation } from './AnswerExplanation.js';
import { HostExplainsMisses } from './explainedMiss.js';

const I18N = { locale: 'en' as const, t: (key: string) => key };
const SPEC = { explanation: 'Because **it** is.' };

function renderBox(props: Partial<React.ComponentProps<typeof AnswerExplanation>> = {}, host = {}) {
  return render(
    <ActivityProvider i18n={I18N} {...host}>
      <AnswerExplanation spec={SPEC} shown correct={false} {...props} />
    </ActivityProvider>,
  );
}

describe('AnswerExplanation disclosure', () => {
  it('is collapsed on a miss', () => {
    renderBox();
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('answer-explanation-text')).toBeNull();
    expect(screen.queryByText(/Because/)).toBeNull();
  });

  it('expands and collapses with matching aria', async () => {
    renderBox();
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(button.getAttribute('aria-controls') ?? '')).toBeTruthy();
    expect(screen.getByTestId('answer-explanation-text').textContent).toContain('Because it is.');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    await waitFor(() => expect(screen.queryByTestId('answer-explanation-text')).toBeNull());
  });

  it('renders nothing without text, on a hit, or when the host explains it', () => {
    const { container, rerender } = renderBox({ spec: { explanation: '  ' } });
    expect(container.firstChild).toBeNull();
    rerender(
      <ActivityProvider i18n={I18N}>
        <AnswerExplanation spec={SPEC} shown correct />
      </ActivityProvider>,
    );
    expect(container.firstChild).toBeNull();
    rerender(
      <ActivityProvider i18n={I18N}>
        <HostExplainsMisses>
          <AnswerExplanation spec={SPEC} shown correct={false} handedUp />
        </HostExplainsMisses>
      </ActivityProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('plays the pick cue on expand only', () => {
    const play = vi.fn();
    renderBox({}, { sound: { play } });
    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith('pick');
  });

  it('starts collapsed again when remounted for a new miss', () => {
    const { unmount } = renderBox();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('answer-explanation-text')).toBeTruthy();
    unmount();
    renderBox();
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');
  });
});
