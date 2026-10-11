import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SingleChoiceActivity } from './SingleChoiceActivity.js';
import { HostJudgesAnswers, type ActivityJudge, type JudgeOutcome } from '../components/hostLessonRules.js';
import type { PortableActivity } from '../renderer.js';

const activity = {
  id: 'sc-sealed',
  kind: 'single_choice',
  status: 'todo',
  sealed: true,
  spec: {
    options: [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Beta' },
      { id: 'c', label: 'Gamma' },
    ],
    correct_option_id: 'a',
  },
} as unknown as PortableActivity;

const option = (id: string) =>
  screen.getAllByTestId('single-choice-option').find((o) => o.getAttribute('data-option-id') === id) as HTMLElement;

function deferred() {
  let resolve!: (value: JudgeOutcome | null) => void;
  const promise = new Promise<JudgeOutcome | null>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function mount(judge: ActivityJudge, onComplete = vi.fn()) {
  render(
    <HostJudgesAnswers judge={judge}>
      <SingleChoiceActivity activity={activity} onComplete={onComplete} />
    </HostJudgesAnswers>,
  );
  return onComplete;
}

const pickAndSubmit = (id: string) => {
  fireEvent.click(option(id));
  fireEvent.click(screen.getByTestId('single-choice-submit'));
};

describe('SingleChoiceActivity sealed', () => {
  it('asks the judge once and completes only after it answers', async () => {
    const pending = deferred();
    const judge = vi.fn<ActivityJudge>(() => pending.promise);
    const onComplete = mount(judge);

    pickAndSubmit('b');

    expect(judge).toHaveBeenCalledTimes(1);
    expect(judge).toHaveBeenCalledWith('sc-sealed', { answer: { option_ids: ['b'] }, response: 'Beta' });
    expect(onComplete).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve({ passed: true, key: { correct_option_id: 'b' } });
    });
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it('a miss carries the judge explanation and marks only the pick', async () => {
    const judge = vi.fn<ActivityJudge>(async () => ({ passed: false, explanation: 'Because X' }));
    const onComplete = mount(judge);

    pickAndSubmit('b');

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith(false, expect.objectContaining({ explanation: 'Because X' }));
    expect(option('b').getAttribute('data-state')).toBe('wrong');
    for (const id of ['a', 'c']) expect(option(id).getAttribute('data-state')).not.toBe('correct');
  });

  it('a pass completes as correct', async () => {
    const judge = vi.fn<ActivityJudge>(async () => ({ passed: true, key: { correct_option_id: 'b' } }));
    const onComplete = mount(judge);

    pickAndSubmit('b');

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith(true, expect.anything());
  });

  it('no verdict leaves it open, says so, and lets the learner send again', async () => {
    const judge = vi.fn<ActivityJudge>().mockResolvedValueOnce(null).mockResolvedValueOnce({ passed: true });
    const onComplete = mount(judge);

    pickAndSubmit('b');

    expect(await screen.findByTestId('judge-unreachable')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
    const submit = screen.getByTestId('single-choice-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);

    fireEvent.click(submit);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(judge).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('judge-unreachable')).toBeNull();
  });
});
