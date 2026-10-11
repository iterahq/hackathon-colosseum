import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { HostHidesAnswerOnMiss, HostRecordsVerdict, HostUnlimitedAttempts } from '@iterahq/activities';
import { CODE_ATTEMPT_BUDGET } from '@iterahq/activities/code';
import { I18nProvider } from '@/i18n';
import type { Activity } from '@/types/content';
import { CODE_DROPDOWN_SPEC } from '@/stories/contractFixtures';
import { makeActivity } from '@/stories/activityFixtures';
import { SingleChoiceActivity } from '@/components/branded/activity/SingleChoiceActivity';
import { CodeSnackActivity } from '@/components/branded/activity/code/CodeSnackActivity';
import { CodeActivityHost } from './support/codeActivityHost';

/**
 * The lesson player's rules for a miss, proven at the package door: the host
 * turns them on by context, and without the provider nothing changes.
 */

const CHOICE = {
  instruction: { text: 'Which one?' },
  options: [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' },
    { id: 'c', label: 'Gamma' },
  ],
  correct_option_id: 'b',
  explanation: 'It is Beta, because of reasons.',
};

const option = (id: string) =>
  screen.getAllByTestId('single-choice-option').find((o) => o.getAttribute('data-option-id') === id) as HTMLElement;

function missChoice(hide: boolean | null) {
  const onComplete = vi.fn();
  const view = <SingleChoiceActivity activity={makeActivity('single_choice', CHOICE)} onComplete={onComplete} />;
  render(<I18nProvider>{hide === null ? view : <HostHidesAnswerOnMiss hide={hide}>{view}</HostHidesAnswerOnMiss>}</I18nProvider>);
  fireEvent.click(option('a'));
  fireEvent.click(screen.getByTestId('single-choice-submit'));
  return onComplete;
}

describe('a miss in a host that keeps the answer', () => {
  it('marks the pick as wrong, leaves the right option unmarked and hands no explanation up', () => {
    const onComplete = missChoice(true);
    expect(option('a').getAttribute('data-state')).toBe('wrong');
    expect(option('b').getAttribute('data-state')).not.toBe('correct');
    expect(screen.queryByTestId('answer-explanation')).toBeNull();
    expect(onComplete).toHaveBeenCalledWith(false, expect.objectContaining({ explanation: undefined }));
  });

  it('shows the key and the why once the host stops hiding (the second try)', () => {
    const onComplete = missChoice(false);
    expect(option('b').getAttribute('data-state')).toBe('correct');
    expect(onComplete).toHaveBeenCalledWith(false, expect.objectContaining({ explanation: 'It is Beta, because of reasons.' }));
  });

  it('changes nothing without the provider', () => {
    missChoice(null);
    expect(option('b').getAttribute('data-state')).toBe('correct');
  });

  it('never hides a right answer', () => {
    const onComplete = vi.fn();
    render(
      <I18nProvider>
        <HostHidesAnswerOnMiss hide>
          <SingleChoiceActivity activity={makeActivity('single_choice', CHOICE)} onComplete={onComplete} />
        </HostHidesAnswerOnMiss>
      </I18nProvider>,
    );
    fireEvent.click(option('b'));
    fireEvent.click(screen.getByTestId('single-choice-submit'));
    expect(option('b').getAttribute('data-state')).toBe('correct');
    expect(onComplete).toHaveBeenCalledWith(true, expect.anything());
  });
});

describe('guided code in a host with no attempt budget that records the verdict', () => {
  const activity: Activity = { id: 'rules-guided', lessonId: 'l', ordinal: 0, kind: 'code', spec: CODE_DROPDOWN_SPEC, rubric: null };
  const choose = (id: string, value: string) => act(() => void fireEvent.change(screen.getByTestId(`guided-blank-${id}`), { target: { value } }));
  const click = (testId: string) => act(() => void fireEvent.click(screen.getByTestId(testId)));

  function open() {
    const onComplete = vi.fn();
    const onVerdict = vi.fn();
    render(
      <CodeActivityHost>
        <HostUnlimitedAttempts>
          <HostRecordsVerdict onVerdict={onVerdict}>
            <CodeSnackActivity activity={activity} onComplete={onComplete} />
          </HostRecordsVerdict>
        </HostUnlimitedAttempts>
      </CodeActivityHost>,
    );
    return { onComplete, onVerdict };
  }

  it('never runs out of attempts and shows no budget line', () => {
    const { onVerdict } = open();
    choose('hook', 'useState');
    for (let attempt = 0; attempt < CODE_ATTEMPT_BUDGET + 2; attempt += 1) {
      choose('evento', 'onChange');
      click('guided-submit');
      expect(screen.getByTestId('guided-feedback').getAttribute('data-out-of-lives')).toBeNull();
      expect(screen.queryByTestId('code-attempts')).toBeNull();
      click('guided-retry');
    }
    expect(onVerdict).toHaveBeenCalledTimes(CODE_ATTEMPT_BUDGET + 2);
    expect(onVerdict).toHaveBeenLastCalledWith(false, expect.objectContaining({ response: expect.any(String) }));
    expect(screen.queryByTestId('guided-code-answer-shown')).toBeNull();
  });

  it('hands the pass up at the submit, before the Continue that completes', () => {
    const { onComplete, onVerdict } = open();
    choose('hook', 'useState');
    choose('evento', 'onClick');
    click('guided-submit');
    expect(onVerdict).toHaveBeenCalledWith(true, expect.objectContaining({ response: expect.stringContaining('useState') }));
    expect(onComplete).not.toHaveBeenCalled();
    click('guided-continue');
    expect(onComplete).toHaveBeenCalledWith(true, expect.anything());
  });
});
