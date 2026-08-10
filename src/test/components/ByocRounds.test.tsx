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
    expect(onComplete).toHaveBeenCalledWith(true, { response: assembled });
  });

  it('does not re-report an activity finished in an earlier session', () => {
    const onComplete = setup(true);
    expect(screen.getByTestId('byoc-rounds')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  // The picks of an earlier session are not in this render, so printing the
  // assembly would show the bare seed under "this is the request you built".
  it('does not claim an assembled prompt it does not have', () => {
    setup(true);
    expect(screen.queryByTestId('byoc-assembled-context')).not.toBeInTheDocument();
  });

  // The closing question is built from the learner's OWN picks, so an earlier
  // session — whose picks this render does not have — must not show an empty one.
  it('closes with a question made of the learner picks, and only when it has them', () => {
    setup(true);
    expect(screen.queryByTestId('byoc-closing-question')).not.toBeInTheDocument();
  });

  it('reveals the AI reply again from the closing question, without grading it', () => {
    setup();
    for (let i = 0; i < tree.rounds.length; i += 1) {
      fireEvent.click(screen.getAllByTestId('byoc-round-option')[0]);
      fireEvent.click(next());
    }
    const options = screen.getAllByTestId('byoc-closing-option');
    expect(options).toHaveLength(tree.rounds.length);
    fireEvent.click(options[0]);
    expect(options[0].dataset.selected).toBe('true');
    expect(options[0].querySelector('[data-tone="picked"]')).toBeInTheDocument();
    // Option ids are unique per ROUND, not across the tree — every round here
    // has an `a` and a `b`. Identifying a closing option by `option.id` picked
    // all of them at once and gave React duplicate keys.
    expect(options.slice(1).map((o) => o.dataset.selected)).toEqual([undefined, undefined]);
  });

  // The host rebuilds `onComplete` on every render; as an effect dependency it
  // reported completion again on each one.
  it('reports once even when the host hands a new callback every render', () => {
    const onComplete = vi.fn();
    const view = (fn: (correct: boolean) => void) => (
      <I18nProvider>
        <ByocRounds tree={tree} seed="jogar futebol" onComplete={fn} />
      </I18nProvider>
    );
    const { rerender } = render(view(onComplete));
    for (let i = 0; i < tree.rounds.length; i += 1) {
      fireEvent.click(screen.getAllByTestId('byoc-round-option')[0]);
      fireEvent.click(next());
    }
    rerender(view((c: boolean) => onComplete(c)));
    rerender(view((c: boolean) => onComplete(c)));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
