import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { ByocRounds } from '@/components/branded/activity/byoc/ByocRounds';
import { BYOC_BUILD_CONTEXT } from '@/stories/byocFixtures';

/**
 * `build_context` has no gabarito, so the things worth pinning are the ones a
 * grading test would never catch: that picking reveals the AI reply on the spot,
 * that one round shows at a time, and that finishing reports success EXACTLY
 * once — a second report would double-count the attempt.
 */

const tree = BYOC_BUILD_CONTEXT as Extract<
  typeof BYOC_BUILD_CONTEXT,
  { interaction: 'build_context' }
>;

function setup(done = false) {
  const onComplete = vi.fn();
  render(
    <I18nProvider>
      <ByocRounds tree={tree} seed="jogar futebol" done={done} onComplete={onComplete} />
    </I18nProvider>
  );
  return onComplete;
}

const next = () => screen.getByTestId('byoc-round-next');

describe('ByocRounds', () => {
  it('shows one round at a time and blocks advancing before a pick', () => {
    setup();
    expect(screen.getByTestId('byoc-rounds')).toHaveAttribute('data-round', 'r1');
    expect(next()).toBeDisabled();
    fireEvent.click(screen.getAllByTestId('byoc-round-option')[0]);
    expect(next()).toBeEnabled();
    fireEvent.click(next());
    expect(screen.getByTestId('byoc-rounds')).toHaveAttribute('data-round', 'r2');
  });

  it('reveals what the AI would answer as soon as the option is chosen', () => {
    setup();
    const first = tree.rounds[0].options[0];
    expect(screen.queryByText(String(first.ai_response))).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByTestId('byoc-round-option')[0]);
    expect(screen.getByText(String(first.ai_response))).toBeInTheDocument();
  });

  it('ends on the assembled prompt and reports completion once', () => {
    const onComplete = setup();
    for (let i = 0; i < tree.rounds.length; i += 1) {
      fireEvent.click(screen.getAllByTestId('byoc-round-option')[0]);
      fireEvent.click(next());
    }
    const assembled = screen.getByTestId('byoc-assembled-context').textContent ?? '';
    expect(assembled).toContain('jogar futebol');
    expect(assembled).toContain(String(tree.rounds[0].options[0].content));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(true);
  });

  it('does not re-report an activity finished in an earlier session', () => {
    const onComplete = setup(true);
    expect(screen.getByTestId('byoc-assembled-context')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
