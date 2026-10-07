/**
 * REPLAY — a `done` activity renders the answer the learner actually gave.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS BROKEN
 * ─────────────────────────────────────────────────────────────────────────────
 * `activity.status === 'done'` said the learner finished. It never said WHAT
 * they answered, so `answerMachine` refused to grade that render — correctly,
 * because `correct` was being computed against an EMPTY local selection and
 * honouring it would paint the button at random. The visible result was a
 * FRESH activity that was merely greyed out: no option marked, no verdict,
 * "Enviar" still sitting there. A host showing past activities in a transcript
 * displayed no trace of the learner's own work, and lost the half that teaches
 * most — WHICH answer they got wrong.
 *
 * `<ActivityRenderer priorAnswer={…}>` supplies the missing input.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT AN ADR-4 VIOLATION, ASSERTED RATHER THAN CLAIMED
 * ─────────────────────────────────────────────────────────────────────────────
 * Plan `20260728-itera-activity-testing`, ADR-4: *a state reachable by a prop
 * but not by a real user is a false green.* Three blocks below carry the
 * argument, and they are the reason this file is long:
 *
 *  1. **`renders exactly what CLICKING renders`** — the same option, reached
 *     two ways, produces the same DOM. That is the literal statement of ADR-4's
 *     test: the replayed state is one a real user reaches, because the test
 *     reaches it by clicking in the very same file.
 *  2. **`the ADR-4 floor`** — a payload that is not a real answer restores
 *     NOTHING. A bare `{}`, a prose-only completion, an abandoned trace, an
 *     option the author never wrote: each one leaves today's render untouched.
 *  3. **`a replay never settles an unfinished activity`** — the verdict is
 *     gated on `status === 'done'`, so no prop can jump a `todo` row to the
 *     answered state. It stays fully answerable.
 *
 * The interaction tests elsewhere are UNCHANGED and still click. Nothing in
 * this file replaces one.
 *
 * It renders the PACKAGE's `<ActivityRenderer>` (`@iterahq/activities`) rather
 * than the Player's dispatcher, because the prop is a promise to HOSTS and that
 * component is the door a host comes through.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  ActivityProvider,
  ActivityRenderer,
  type ActivityCompletion,
  type PortableActivity,
  type PortableActivityStatus,
} from '@iterahq/activities';
import { dragOrderRow } from './support/orderDragDouble';

vi.mock('framer-motion', async (importOriginal) => {
  const { withReorderDouble } = await import('./support/orderDragDouble');
  return withReorderDouble(await importOriginal<object>());
});

/* ─────────────────────────────── fixtures ────────────────────────────────── */

const SINGLE_SPEC = {
  options: [
    { id: 'a', label: 'Alfa' },
    { id: 'b', label: 'Beta' },
    { id: 'c', label: 'Gama' },
  ],
  correct_option_id: 'b',
};

const MULTI_SPEC = {
  options: [
    { id: 'a', label: 'Alfa' },
    { id: 'b', label: 'Beta' },
    { id: 'c', label: 'Gama' },
  ],
  correct_option_ids: ['a', 'c'],
};

const ORDER_SPEC = {
  items: [
    { id: 'i1', label: 'Ler o enunciado' },
    { id: 'i2', label: 'Escrever o código' },
    { id: 'i3', label: 'Rodar os testes' },
  ],
  correct_order: ['i1', 'i2', 'i3'],
};

const MATCH_SPEC = {
  left: [
    { id: 'pk', label: 'Chave primária' },
    { id: 'fk', label: 'Chave estrangeira' },
  ],
  right: [
    { id: 'r-pk', label: 'Identifica a linha' },
    { id: 'r-fk', label: 'Aponta para outra tabela' },
  ],
  pairs: [
    { left_id: 'pk', right_id: 'r-pk' },
    { left_id: 'fk', right_id: 'r-fk' },
  ],
};

function activity(
  kind: string,
  spec: Record<string, unknown>,
  status?: PortableActivityStatus,
): PortableActivity {
  return { id: `replay-${kind}`, kind: kind as PortableActivity['kind'], spec, rubric: null, status };
}

/**
 * The completion an activity really hands up, built the way `handleSubmit`
 * builds it: the terminal `answer_submitted` carries the AUTHORED ids.
 */
function completion(payload: Record<string, unknown>): ActivityCompletion {
  return {
    response: 'whatever the labels said',
    actions: [{ type: 'answer_submitted', at: 1_700_000_000_000, payload }],
  };
}

function mount(act: PortableActivity, priorAnswer?: ActivityCompletion) {
  const onComplete = vi.fn();
  const view = render(
    <ActivityProvider i18n={{ locale: 'pt', t: (k: string) => k, tText: () => '' }}>
      <ActivityRenderer activity={act} onComplete={onComplete} priorAnswer={priorAnswer} />
    </ActivityProvider>,
  );
  return { ...view, onComplete };
}

/** The verdict as the SCREEN reports it — `SubmitButton` stamps `data-correct`. */
function verdict(testId: string): string | null {
  return screen.getByTestId(testId).getAttribute('data-correct');
}

/**
 * Everything about the options grid a learner can see: which option is which,
 * which one is marked, and the exact verdict styling on each.
 */
function optionsSnapshot(testId: string): Array<Record<string, string | null>> {
  return screen.getAllByTestId(testId).map((el) => ({
    id: el.getAttribute('data-option-id'),
    selected: el.getAttribute('data-selected'),
    verdict: el.getAttribute('data-verdict'),
    className: el.className,
    disabled: String((el as HTMLButtonElement).disabled),
  }));
}

function submitSnapshot(testId: string): Record<string, string | null> {
  const el = screen.getByTestId(testId) as HTMLButtonElement;
  return {
    correct: el.getAttribute('data-correct'),
    submitted: el.getAttribute('data-submitted'),
    className: el.className,
    disabled: String(el.disabled),
    text: el.textContent,
  };
}

/* ═══════════════════ 1. the equivalence that answers ADR-4 ════════════════ */

describe('single_choice — a replay renders exactly what CLICKING renders', () => {
  /**
   * THE ADR-4 ARGUMENT, AS AN EQUALITY.
   *
   * ADR-4 forbids a state reachable by a prop but NOT by a real user. So the
   * test reaches the state both ways in the same file: once by clicking option
   * `a` and pressing Enviar, once by handing back the completion that click
   * produced. If the two DOMs are equal, the replayed state is by construction
   * a state a real user produces — which is the opposite of a false green.
   *
   * The shuffle is per-learner and per-activity, so both mounts deal the same
   * order and the snapshots are comparable position by position.
   */
  it('wrong answer: clicked and replayed produce the same screen', () => {
    // (a) A real learner, clicking.
    const live = mount(activity('single_choice', SINGLE_SPEC));
    fireEvent.click(screen.getByTestId('single-choice-options').querySelector('[data-option-id="a"]')!);
    fireEvent.click(screen.getByTestId('single-choice-submit'));
    expect(live.onComplete).toHaveBeenCalledWith(false, expect.anything());
    const clickedOptions = optionsSnapshot('single-choice-option');
    const clickedSubmit = submitSnapshot('single-choice-submit');
    // The payload the activity ITSELF emitted — the exact value a host persists.
    const emitted = live.onComplete.mock.calls[0][1] as ActivityCompletion;
    cleanup();

    // (b) The same answer, replayed onto the completed row.
    const replay = mount(activity('single_choice', SINGLE_SPEC, 'done'), emitted);
    expect(optionsSnapshot('single-choice-option')).toEqual(clickedOptions);
    expect(submitSnapshot('single-choice-submit')).toEqual(clickedSubmit);
    // And a replay is not an event: nobody did anything, so nothing settles.
    expect(replay.onComplete).not.toHaveBeenCalled();
  });

  it('right answer: clicked and replayed produce the same screen', () => {
    const live = mount(activity('single_choice', SINGLE_SPEC));
    fireEvent.click(screen.getByTestId('single-choice-options').querySelector('[data-option-id="b"]')!);
    fireEvent.click(screen.getByTestId('single-choice-submit'));
    expect(live.onComplete).toHaveBeenCalledWith(true, expect.anything());
    const clickedOptions = optionsSnapshot('single-choice-option');
    const clickedSubmit = submitSnapshot('single-choice-submit');
    const emitted = live.onComplete.mock.calls[0][1] as ActivityCompletion;
    cleanup();

    mount(activity('single_choice', SINGLE_SPEC, 'done'), emitted);
    expect(optionsSnapshot('single-choice-option')).toEqual(clickedOptions);
    expect(submitSnapshot('single-choice-submit')).toEqual(clickedSubmit);
  });

  it('marks the WRONG pick as a quiet miss and the right one as right — the pedagogical half', () => {
    mount(
      activity('single_choice', SINGLE_SPEC, 'done'),
      completion({ option_ids: ['a'] }),
    );
    expect(verdict('single-choice-submit')).toBe('false');
    const byId = Object.fromEntries(
      optionsSnapshot('single-choice-option').map((o) => [o.id, o]),
    );
    // The learner's own pick is marked AND flagged wrong.
    expect(byId.a.selected).toBe('true');
    expect(byId.a.verdict).toBe('miss');
    // The answer key is flagged too, which is what makes the render teach.
    expect(byId.b.verdict).toBe('right');
    // An unpicked distractor stays neutral — we mark what they got wrong, not
    // every option they did not choose.
    expect(byId.c.selected).toBeNull();
    expect(byId.c.verdict).toBeNull();
  });
});

/* ══════════════════════════ 2. the ADR-4 floor ════════════════════════════ */

describe('single_choice — the ADR-4 floor: what a payload CANNOT do', () => {
  /** The render every case in this block must be indistinguishable from. */
  function todaysDoneRender() {
    const view = mount(activity('single_choice', SINGLE_SPEC, 'done'));
    const snap = {
      options: optionsSnapshot('single-choice-option'),
      submit: submitSnapshot('single-choice-submit'),
    };
    view.unmount();
    return snap;
  }

  const CANNOT_RESTORE: Array<[string, ActivityCompletion]> = [
    ['an empty completion', {}],
    ['prose only — no machine-readable answer', { response: 'Alfa', message: 'Você errou' }],
    [
      'an ABANDONED attempt — clicks, but never Enviar',
      { actions: [{ type: 'option_selected', at: 1, payload: { option_id: 'a' } }] },
    ],
    ['a settled action with no selection', completion({ option_ids: [] })],
    ['an option the author never wrote', completion({ option_ids: ['ghost'] })],
    ['a malformed selection', completion({ option_ids: 'a' })],
    // Two ids is some OTHER kind's trace. Taking the first would put a pick on
    // screen that nobody made here.
    ['a selection this kind cannot submit — two ids', completion({ option_ids: ['a', 'b'] })],
  ];

  it.each(CANNOT_RESTORE)('%s leaves the render exactly as it is today', (_name, payload) => {
    const baseline = todaysDoneRender();
    mount(activity('single_choice', SINGLE_SPEC, 'done'), payload);
    expect(optionsSnapshot('single-choice-option')).toEqual(baseline.options);
    expect(submitSnapshot('single-choice-submit')).toEqual(baseline.submit);
    // Said again, plainly: no verdict, and no option claimed as chosen.
    expect(verdict('single-choice-submit')).toBeNull();
    expect(
      optionsSnapshot('single-choice-option').every((o) => o.selected === null),
    ).toBe(true);
  });

  it('a bare boolean is not even expressible — the seam carries no verdict', () => {
    // `priorAnswer` is typed `ActivityCompletion`, which has no `correct` field.
    // There is no "pretend this was right" to pass. Reaching past the type gets
    // nowhere either: with no settled action there is nothing to restore.
    // @ts-expect-error — a verdict is not part of the completion contract.
    mount(activity('single_choice', SINGLE_SPEC, 'done'), { correct: true });
    expect(verdict('single-choice-submit')).toBeNull();
  });

  it('naming the CORRECT option still only reaches the state that pick produces', () => {
    // The honest limit of the guarantee, written down rather than glossed. A
    // host CAN hand back a selection that happens to be right — and gets
    // exactly the screen a learner who picked it gets, verdict re-derived by
    // the same comparison. What it cannot do is assert a verdict that the
    // selection does not support, which is the state ADR-4 is about.
    mount(activity('single_choice', SINGLE_SPEC, 'done'), completion({ option_ids: ['b'] }));
    expect(verdict('single-choice-submit')).toBe('true');
    cleanup();
    mount(activity('single_choice', SINGLE_SPEC, 'done'), completion({ option_ids: ['c'] }));
    expect(verdict('single-choice-submit')).toBe('false');
  });
});

/* ═════════════ 3. a replay never settles an unfinished activity ═══════════ */

describe('a replay onto a NOT-done activity seeds the inputs and stops there', () => {
  it('single_choice: no verdict, and the learner can still answer', () => {
    const { onComplete } = mount(
      activity('single_choice', SINGLE_SPEC, 'in_progress'),
      completion({ option_ids: ['b'] }),
    );
    // Seeded — the learner sees where they were.
    const byId = Object.fromEntries(
      optionsSnapshot('single-choice-option').map((o) => [o.id, o]),
    );
    expect(byId.b.selected).toBe('true');
    // But NOT settled: no verdict, nothing locked, Enviar is live.
    expect(verdict('single-choice-submit')).toBeNull();
    expect(byId.b.verdict).toBeNull();
    expect(byId.b.disabled).toBe('false');
    const submit = screen.getByTestId('single-choice-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);

    // And answering still works, through the normal path.
    fireEvent.click(screen.getByTestId('single-choice-options').querySelector('[data-option-id="a"]')!);
    fireEvent.click(submit);
    expect(onComplete).toHaveBeenCalledWith(false, expect.anything());
  });

  it('single_choice: `todo` behaves the same way', () => {
    mount(activity('single_choice', SINGLE_SPEC, 'todo'), completion({ option_ids: ['b'] }));
    expect(verdict('single-choice-submit')).toBeNull();
  });
});

/* ═══════════════════════ 4. the other graded kinds ═══════════════════════ */

describe('multi_choice — the submitted SET comes back', () => {
  it('restores the set and grades it, right and wrong', () => {
    mount(activity('multi_choice', MULTI_SPEC, 'done'), completion({ option_ids: ['a', 'c'] }));
    expect(verdict('multi-choice-submit')).toBe('true');
    const chosen = optionsSnapshot('multi-choice-option')
      .filter((o) => o.selected === 'true')
      .map((o) => o.id)
      .sort();
    expect(chosen).toEqual(['a', 'c']);
    cleanup();

    mount(activity('multi_choice', MULTI_SPEC, 'done'), completion({ option_ids: ['a', 'b'] }));
    expect(verdict('multi-choice-submit')).toBe('false');
  });

  it('clicked and replayed produce the same screen', () => {
    const live = mount(activity('multi_choice', MULTI_SPEC));
    const grid = screen.getByTestId('multi-choice-options');
    fireEvent.click(grid.querySelector('[data-option-id="a"]')!);
    fireEvent.click(grid.querySelector('[data-option-id="b"]')!);
    fireEvent.click(screen.getByTestId('multi-choice-submit'));
    const clicked = optionsSnapshot('multi-choice-option');
    const clickedSubmit = submitSnapshot('multi-choice-submit');
    const emitted = live.onComplete.mock.calls[0][1] as ActivityCompletion;
    cleanup();

    mount(activity('multi_choice', MULTI_SPEC, 'done'), emitted);
    expect(optionsSnapshot('multi-choice-option')).toEqual(clicked);
    expect(submitSnapshot('multi-choice-submit')).toEqual(clickedSubmit);
  });

  it('a duplicated pick restores nothing — the UI cannot produce one', () => {
    mount(activity('multi_choice', MULTI_SPEC, 'done'), completion({ option_ids: ['a', 'a'] }));
    expect(verdict('multi-choice-submit')).toBeNull();
  });
});

describe('order — the submitted SEQUENCE comes back', () => {
  const rendered = () =>
    screen.getAllByTestId('order-item').map((el) => el.getAttribute('data-option-id'));

  it('restores the arrangement and grades it', () => {
    mount(activity('order', ORDER_SPEC, 'done'), completion({ order: ['i3', 'i1', 'i2'] }));
    expect(rendered()).toEqual(['i3', 'i1', 'i2']);
    expect(verdict('order-submit')).toBe('false');
    cleanup();

    mount(activity('order', ORDER_SPEC, 'done'), completion({ order: ['i1', 'i2', 'i3'] }));
    expect(rendered()).toEqual(['i1', 'i2', 'i3']);
    expect(verdict('order-submit')).toBe('true');
  });

  it('shows the learner’s own arrangement, never the shuffle it would have dealt', () => {
    // Without a replay this kind deals a per-learner shuffle that deliberately
    // AVOIDS the solution. Restoring the solved order proves the replay really
    // replaced that draw rather than colouring on top of it.
    mount(activity('order', ORDER_SPEC, 'done'), completion({ order: ['i1', 'i2', 'i3'] }));
    expect(rendered()).toEqual(ORDER_SPEC.correct_order);
  });

  it('a PARTIAL arrangement restores nothing', () => {
    mount(activity('order', ORDER_SPEC, 'done'), completion({ order: ['i1', 'i2'] }));
    expect(verdict('order-submit')).toBeNull();
  });

  it('clicked and replayed produce the same screen', () => {
    const live = mount(activity('order', ORDER_SPEC));
    // Drag the first row below the second — a real reordering.
    dragOrderRow(screen.getAllByTestId('order-item')[0].getAttribute('data-option-id')!, 1);
    fireEvent.click(screen.getByTestId('order-submit'));
    const clickedOrder = rendered();
    const clickedSubmit = submitSnapshot('order-submit');
    const emitted = live.onComplete.mock.calls[0][1] as ActivityCompletion;
    cleanup();

    mount(activity('order', ORDER_SPEC, 'done'), emitted);
    expect(rendered()).toEqual(clickedOrder);
    expect(submitSnapshot('order-submit')).toEqual(clickedSubmit);
  });
});

describe('match — the submitted PAIRING comes back', () => {
  const badges = () =>
    screen.queryAllByTestId('match-badge').map((el) => el.getAttribute('data-state'));

  it('restores the pairing and grades every badge', () => {
    mount(
      activity('match', MATCH_SPEC, 'done'),
      completion({ pairs: [['pk', 'r-pk'], ['fk', 'r-fk']] }),
    );
    expect(verdict('match-submit')).toBe('true');
    // Four cards, four badges, all green.
    expect(badges()).toEqual(['correct', 'correct', 'correct', 'correct']);
    cleanup();

    mount(
      activity('match', MATCH_SPEC, 'done'),
      completion({ pairs: [['pk', 'r-fk'], ['fk', 'r-pk']] }),
    );
    expect(verdict('match-submit')).toBe('false');
    expect(badges()).toEqual(['incorrect', 'incorrect', 'incorrect', 'incorrect']);
  });

  it('a card paired twice restores nothing', () => {
    mount(
      activity('match', MATCH_SPEC, 'done'),
      completion({ pairs: [['pk', 'r-pk'], ['pk', 'r-fk']] }),
    );
    expect(verdict('match-submit')).toBeNull();
    expect(badges()).toEqual([]);
  });

  it('clicked and replayed produce the same screen', () => {
    const live = mount(activity('match', MATCH_SPEC));
    const left = screen.getByTestId('match-left');
    const right = screen.getByTestId('match-right');
    fireEvent.click(left.querySelector('[data-option-id="pk"]')!);
    fireEvent.click(right.querySelector('[data-option-id="r-fk"]')!);
    fireEvent.click(left.querySelector('[data-option-id="fk"]')!);
    fireEvent.click(right.querySelector('[data-option-id="r-pk"]')!);
    fireEvent.click(screen.getByTestId('match-submit'));
    const clickedBadges = badges();
    const clickedSubmit = submitSnapshot('match-submit');
    const emitted = live.onComplete.mock.calls[0][1] as ActivityCompletion;
    cleanup();

    mount(activity('match', MATCH_SPEC, 'done'), emitted);
    expect(badges()).toEqual(clickedBadges);
    expect(submitSnapshot('match-submit')).toEqual(clickedSubmit);
  });
});

/* ════════════════ 5. the kinds that do NOT restore — confirmed ════════════ */

describe('kinds with no answer state are untouched', () => {
  /**
   * Checked, not assumed. `concept` and `concept_reveal` never grade, so there
   * is nothing for a replay to seed — and the proof that the prop reaches them
   * harmlessly is that the DOM is byte-identical with and without it.
   */
  const UNAFFECTED: Array<[string, Record<string, unknown>]> = [
    ['concept', { instruction: { text: 'Uma ideia.' } }],
    [
      'concept_reveal',
      { instruction: { text: 'Pense.' }, reveal: { prompt: 'E então?', answer: 'Assim.' } },
    ],
  ];

  it.each(UNAFFECTED)('%s renders identically with and without a replay', (kind, spec) => {
    const without = mount(activity(kind, spec, 'done'));
    const html = without.container.innerHTML;
    without.unmount();

    const withPrior = mount(activity(kind, spec, 'done'), completion({ option_ids: ['a'] }));
    expect(withPrior.container.innerHTML).toBe(html);
  });

  it('quiz ignores the replay ON PURPOSE — see CONTRACT.md', () => {
    // `quiz` grades, so it looks like a candidate. It is excluded because its
    // options stay CLICKABLE on a `done` render (`disabled={submitted ||
    // reveal}`, deliberately without `done` — see the component). A verdict on
    // a screen the learner can still re-pick would recolour under them, which
    // is a worse render than the one this change is fixing. Restoring it needs
    // that interaction decision revisited first, and that is not this change.
    const spec = {
      question: 'Qual identifica a linha?',
      options: [
        { id: 'a', text: 'Nome', isCorrect: false },
        { id: 'b', text: 'Matrícula', isCorrect: true },
      ],
    };
    const without = mount(activity('quiz', spec, 'done'));
    const html = without.container.innerHTML;
    without.unmount();

    const withPrior = mount(activity('quiz', spec, 'done'), completion({ option_ids: ['0'] }));
    expect(withPrior.container.innerHTML).toBe(html);
    expect(verdict('quiz-submit')).toBeNull();
  });
});

/* ═════════ 6. `question` — the kind whose restore carries NO verdict ═══════ */

/**
 * The other four kinds restore an answer AND the grade derived from it. This
 * one has no grade, which changes what the restore has to be checked for.
 *
 * Two things are asserted that the graded kinds cannot assert, because they are
 * the whole point of the kind:
 *
 *   1. a restored, `done` question is still NEUTRAL — `data-correct` never
 *      appears, so nothing on the screen says the person was right or wrong;
 *   2. the FREE TEXT comes back, and it comes back from `response` rather than
 *      from the trace, because the trace deliberately carries `has_text` and
 *      never the words (`PAYLOADS_CARRY_NO_FREE_TEXT`).
 */
describe('question — the answer comes back, and no verdict comes with it', () => {
  const QUESTION_SPEC = {
    title: 'Qual caminho?',
    mode: 'single' as const,
    options: [
      { id: 'a', label: 'Manter' },
      { id: 'b', label: 'Trocar' },
      { id: 'c', label: 'Flag' },
    ],
    recommended_option_id: 'a',
  };

  /** The completion `QuestionActivity.handleSubmit` really builds. */
  function answered(
    optionIds: string[],
    other: boolean,
    text: string,
  ): ActivityCompletion {
    return {
      response: text,
      actions: [
        {
          type: 'answer_submitted',
          at: 1_700_000_000_000,
          payload: {
            option_ids: other ? [...optionIds, 'OTHER'] : optionIds,
            other,
            has_text: text.trim().length > 0,
          },
        },
      ],
    };
  }

  it('restores the marked option and stays neutral — no verdict anywhere', () => {
    mount(activity('question', QUESTION_SPEC, 'done'), answered(['b'], false, ''));
    const marked = optionsSnapshot('question-option').filter((o) => o.selected === 'true');
    expect(marked.map((o) => o.id)).toEqual(['b']);
    // The assertion that matters: settled, and NOT graded.
    expect(verdict('question-submit')).toBeNull();
    expect(screen.getByTestId('question-submit')).toHaveAttribute('data-submitted', 'true');
  });

  it('restores the FREE TEXT, which lives in `response` and not in the trace', () => {
    mount(
      activity('question', QUESTION_SPEC, 'done'),
      answered([], false, 'Nenhuma das três, na verdade.'),
    );
    expect((screen.getByTestId('question-text') as HTMLTextAreaElement).value).toBe(
      'Nenhuma das três, na verdade.',
    );
    expect(verdict('question-submit')).toBeNull();
  });

  it('restores the OTHER sentinel without dropping the rest of the payload', () => {
    // `priorOptionIds` drops the WHOLE payload on an id the spec does not
    // declare, and `OTHER` is by definition not an authored option. The kind
    // passes the sentinel through as a known id for exactly this reason — the
    // regression this guards is a silent one: the answer would simply not come
    // back, with no error anywhere.
    mount(activity('question', QUESTION_SPEC, 'done'), answered(['a'], true, ''));
    expect(screen.getByTestId('question-other')).toHaveAttribute('data-selected', 'true');
    const marked = optionsSnapshot('question-option').filter((o) => o.selected === 'true');
    expect(marked.map((o) => o.id)).toEqual(['a']);
  });

  it('an option the spec does not declare restores nothing — same rule as the graded kinds', () => {
    mount(activity('question', QUESTION_SPEC, 'done'), answered(['zzz'], false, ''));
    expect(optionsSnapshot('question-option').filter((o) => o.selected === 'true')).toEqual([]);
  });

  it('the recommendation is a marker, not a restored verdict', () => {
    // Present before any answer, present after one, and never on the option the
    // person actually chose unless the asker had recommended it.
    mount(activity('question', QUESTION_SPEC, 'done'), answered(['b'], false, ''));
    const recommended = screen
      .getAllByTestId('question-option')
      .filter((el) => el.getAttribute('data-recommended') === 'true');
    expect(recommended.map((el) => el.getAttribute('data-option-id'))).toEqual(['a']);
  });

  it('a replay onto a NOT-done question seeds the inputs and leaves it answerable', () => {
    mount(activity('question', QUESTION_SPEC), answered(['b'], false, 'meio a meio'));
    const marked = optionsSnapshot('question-option').filter((o) => o.selected === 'true');
    expect(marked.map((o) => o.id)).toEqual(['b']);
    // Still open: the submit is live, and nothing is stamped as sent.
    const submit = screen.getByTestId('question-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    expect(submit.getAttribute('data-submitted')).toBeNull();
  });
});
