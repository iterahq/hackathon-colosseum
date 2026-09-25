/**
 * `question` — the CALLER decides "Outro" and the notes box (1.3.0).
 *
 * Plan `20260924-activity-type-one-behavior-rule`, T23 renderer half, Tainan's
 * answer to Q-R2-4 (2026-09-25): *"deixa customizavel pelo caller (ou seja
 * itera-player nunca usaria isso, mas plans-app consegue 'solicitar' componente
 * dessa forma, com o other)"*.
 *
 * The precedence rule under test, per field:
 *   - the caller prop WINS, in both directions;
 *   - when the prop is absent, today's spec behaviour holds
 *     (`allow_other` default true, notes box on).
 *
 * It mounts the package's `QuestionActivity` and `QuestionActivityBody`
 * directly, because the prop is a promise to HOSTS. The package's
 * `ActivityRenderer` does not forward it — the Itera Player never passes it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ActivityProvider,
  QuestionActivity,
  QuestionActivityBody,
  QUESTION_OTHER_ID,
  resolveQuestionInputs,
  type PortableActivity,
  type QuestionCallerOptions,
} from '@iterahq/activities';

afterEach(cleanup);

const I18N = { locale: 'pt' as const, t: (k: string) => k, tText: () => '' };

const BASE_SPEC = {
  title: 'Qual caminho?',
  mode: 'single' as const,
  options: [
    { id: 'a', label: 'Manter' },
    { id: 'b', label: 'Trocar' },
  ],
};

function activity(spec: Record<string, unknown>): PortableActivity {
  return {
    id: 'q-1',
    kind: 'question',
    spec,
    status: 'todo',
  } as unknown as PortableActivity;
}

function mount(spec: Record<string, unknown>, callerOptions?: QuestionCallerOptions) {
  const onComplete = vi.fn();
  render(
    <ActivityProvider i18n={I18N}>
      <QuestionActivity
        activity={activity(spec)}
        onComplete={onComplete}
        callerOptions={callerOptions}
      />
    </ActivityProvider>,
  );
  return { onComplete };
}

const other = () => screen.queryByTestId('question-other');
const notes = () => screen.queryByTestId('question-text');

describe('resolveQuestionInputs — the precedence rule, pure', () => {
  it('absent prop → the spec decides; allow_other defaults to true', () => {
    expect(resolveQuestionInputs({}, undefined)).toEqual({ allowOther: true, allowNotes: true });
    expect(resolveQuestionInputs({ allow_other: false })).toEqual({
      allowOther: false,
      allowNotes: true,
    });
  });
  it('the caller prop wins in BOTH directions', () => {
    expect(resolveQuestionInputs({ allow_other: true }, { allowOther: false }).allowOther).toBe(
      false,
    );
    expect(resolveQuestionInputs({ allow_other: false }, { allowOther: true }).allowOther).toBe(
      true,
    );
    expect(resolveQuestionInputs({}, { allowNotes: false }).allowNotes).toBe(false);
  });
});

describe('QuestionActivity — callerOptions', () => {
  it('prop on → "Outro" is shown, even when the spec says allow_other: false', () => {
    mount({ ...BASE_SPEC, allow_other: false }, { allowOther: true });
    expect(other()).not.toBeNull();
  });

  it('prop off → "Outro" is hidden, even when the spec says allow_other: true', () => {
    mount({ ...BASE_SPEC, allow_other: true }, { allowOther: false });
    expect(other()).toBeNull();
  });

  it('prop absent → the spec behaviour: "Outro" on by default, off with allow_other: false', () => {
    mount(BASE_SPEC);
    expect(other()).not.toBeNull();
    expect(notes()).not.toBeNull();
    cleanup();
    mount({ ...BASE_SPEC, allow_other: false });
    expect(other()).toBeNull();
    // The notes box does not depend on the spec.
    expect(notes()).not.toBeNull();
  });

  it('allowNotes: false hides the notes box, and a selection is then required', () => {
    const { onComplete } = mount(BASE_SPEC, { allowNotes: false, allowOther: false });
    expect(notes()).toBeNull();
    const submit = screen.getByTestId('question-submit');
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getAllByTestId('question-option')[1]);
    fireEvent.click(submit);
    expect(onComplete).toHaveBeenCalledTimes(1);
    const [, detail] = onComplete.mock.calls[0];
    expect(detail.response).toBe('');
    const submitted = detail.actions.find(
      (a: { type: string }) => a.type === 'answer_submitted',
    );
    expect(submitted.payload).toEqual({ option_ids: ['b'], other: false, has_text: false });
  });

  it('"Outro" chosen through the caller prop records the OTHER sentinel', () => {
    const { onComplete } = mount({ ...BASE_SPEC, allow_other: false }, { allowOther: true });
    fireEvent.click(other()!);
    fireEvent.click(screen.getByTestId('question-submit'));
    const [, detail] = onComplete.mock.calls[0];
    const submitted = detail.actions.find(
      (a: { type: string }) => a.type === 'answer_submitted',
    );
    expect(submitted.payload.option_ids).toEqual([QUESTION_OTHER_ID]);
    expect(submitted.payload.other).toBe(true);
  });
});

describe('QuestionActivityBody — the controlled body a host draws in its own chrome', () => {
  function body(props: Partial<Parameters<typeof QuestionActivityBody>[0]> = {}) {
    const onToggle = vi.fn();
    const onNotesChange = vi.fn();
    render(
      <QuestionActivityBody
        options={[
          { id: 'A', label: 'Manter' },
          { id: 'B', label: 'Trocar' },
        ]}
        multi={false}
        selected={[]}
        notes=""
        onToggle={onToggle}
        onNotesChange={onNotesChange}
        {...props}
      />,
    );
    return { onToggle, onNotesChange };
  }

  it('prop on → "Outro" is shown and reports the sentinel', () => {
    const { onToggle } = body({ callerOptions: { allowOther: true }, specAllowOther: false });
    fireEvent.click(other()!);
    expect(onToggle).toHaveBeenCalledWith(QUESTION_OTHER_ID);
  });

  it('prop off → "Outro" is hidden even when specAllowOther is true', () => {
    body({ callerOptions: { allowOther: false }, specAllowOther: true });
    expect(other()).toBeNull();
  });

  it('prop absent → today\'s behaviour: "Outro" and the notes box are on', () => {
    body();
    expect(other()).not.toBeNull();
    expect(notes()).not.toBeNull();
  });

  it('the body is controlled: it marks what `selected` says, and owns no state', () => {
    const { onToggle } = body({ selected: ['B', QUESTION_OTHER_ID] });
    const marked = screen
      .getAllByTestId('question-option')
      .filter((el) => el.getAttribute('data-selected') === 'true')
      .map((el) => el.getAttribute('data-option-id'));
    expect(marked).toEqual(['B']);
    expect(other()).toHaveAttribute('data-selected', 'true');
    fireEvent.click(screen.getAllByTestId('question-option')[0]);
    expect(onToggle).toHaveBeenCalledWith('A');
    // Still B: the parent did not apply the toggle.
    expect(screen.getAllByTestId('question-option')[0]).not.toHaveAttribute('data-selected');
  });
});
