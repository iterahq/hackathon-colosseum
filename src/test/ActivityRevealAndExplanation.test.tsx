import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import type { Activity, ActivityKind } from '@/types/content';

/**
 * Duas regressões da aula ao vivo, trancadas juntas porque compartilham o mesmo
 * momento: o aluno errou (ou o professor apertou "Revelar resposta") e precisa
 * receber alguma coisa de volta.
 *
 * 1. `quiz` era a ÚNICA kind a quem o renderer não passava `reveal`, então o
 *    revelar do professor não fazia nada na atividade principal.
 * 2. Errar mostrava estado vermelho e mais nada — a `explanation` autorada nunca
 *    chegava à tela justamente no momento em que ela importa.
 */

const QUIZ_SPEC = {
  question: 'Qual delas identifica a linha de forma única?',
  options: [
    { id: 'a', text: 'Nome', isCorrect: false },
    { id: 'b', text: 'Matrícula', isCorrect: true },
    { id: 'c', text: 'Data de nascimento', isCorrect: false },
  ],
  explanation: 'Nome e data de nascimento podem se repetir; a matrícula é única por aluno.',
};

const SINGLE_CHOICE_SPEC = {
  options: [
    { id: 'a', label: 'Alfa' },
    { id: 'b', label: 'Beta' },
  ],
  correct_option_id: 'b',
  explanation: 'Beta é a única que atende à condição pedida.',
};

const MULTI_CHOICE_SPEC = {
  options: [
    { id: 'a', label: 'Alfa' },
    { id: 'b', label: 'Beta' },
    { id: 'c', label: 'Gama' },
  ],
  correct_option_ids: ['a', 'c'],
  explanation: 'Alfa e Gama satisfazem as duas condições; Beta falha na segunda.',
};

const MATCH_SPEC = {
  left: [{ id: 'pk', label: 'Chave primária' }],
  right: [{ id: 'r-pk', label: 'Identifica unicamente uma linha' }],
  pairs: [{ left_id: 'pk', right_id: 'r-pk' }],
  explanation: 'A chave primária é o que dá identidade à linha.',
};

const ORDER_SPEC = {
  items: [
    { id: 'i1', label: 'Ler o enunciado' },
    { id: 'i2', label: 'Escrever o código' },
    { id: 'i3', label: 'Rodar os testes' },
  ],
  correct_order: ['i1', 'i2', 'i3'],
  explanation: 'Rodar os testes antes de escrever o código não prova nada.',
};

function makeActivity(kind: ActivityKind, spec: Record<string, unknown>): Activity {
  return { id: `t-${kind}`, lessonId: 'l', ordinal: 0, kind, spec, rubric: null };
}

function renderActivity(activity: Activity, reveal = false) {
  const onComplete = vi.fn();
  const view = render(
    <I18nProvider>
      <ActivityRenderer activity={activity} onComplete={onComplete} reveal={reveal} />
    </I18nProvider>
  );
  const rerenderWith = (next: boolean) =>
    view.rerender(
      <I18nProvider>
        <ActivityRenderer activity={activity} onComplete={onComplete} reveal={next} />
      </I18nProvider>
    );
  return { onComplete, rerenderWith };
}

function optionButton(label: string): HTMLButtonElement {
  return screen.getByText(label).closest('button') as HTMLButtonElement;
}

describe('quiz honors `reveal` like every other graded kind', () => {
  it('flags the correct option and freezes the inputs with no submission', () => {
    renderActivity(makeActivity('quiz', QUIZ_SPEC), true);

    expect(optionButton('Matrícula').classList.contains('border-verde-tech')).toBe(true);
    expect(optionButton('Nome').classList.contains('border-verde-tech')).toBe(false);
    screen
      .getAllByTestId('quiz-option')
      .forEach((o) => expect((o as HTMLButtonElement).disabled).toBe(true));
  });

  it('reveals nothing while the instructor has not revealed', () => {
    renderActivity(makeActivity('quiz', QUIZ_SPEC));

    expect(optionButton('Matrícula').classList.contains('border-verde-tech')).toBe(false);
    expect((screen.getAllByTestId('quiz-option')[0] as HTMLButtonElement).disabled).toBe(false);
  });

  it('revealing over an unsent pick never claims the learner submitted', () => {
    const { onComplete, rerenderWith } = renderActivity(makeActivity('quiz', QUIZ_SPEC));
    fireEvent.click(screen.getByText('Nome'));
    rerenderWith(true);

    const submit = screen.getByTestId('quiz-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(submit.dataset.submitted).toBeUndefined();
    expect(submit.dataset.correct).toBeUndefined();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe('the authored explanation surfaces on a wrong answer only', () => {
  it('quiz: shown after a wrong submission', () => {
    renderActivity(makeActivity('quiz', QUIZ_SPEC));
    expect(screen.queryByTestId('answer-explanation')).toBeNull();

    fireEvent.click(screen.getByText('Nome'));
    fireEvent.click(screen.getByTestId('quiz-submit'));

    expect(screen.getByTestId('answer-explanation')).toHaveTextContent(QUIZ_SPEC.explanation);
  });

  it('quiz: NOT shown after a correct submission', () => {
    renderActivity(makeActivity('quiz', QUIZ_SPEC));

    fireEvent.click(screen.getByText('Matrícula'));
    fireEvent.click(screen.getByTestId('quiz-submit'));

    expect(screen.queryByTestId('answer-explanation')).toBeNull();
  });

  it('quiz: a correct answer keeps the why hidden even once the class reveals', () => {
    const { rerenderWith } = renderActivity(makeActivity('quiz', QUIZ_SPEC));
    fireEvent.click(screen.getByText('Matrícula'));
    fireEvent.click(screen.getByTestId('quiz-submit'));
    rerenderWith(true);

    expect(screen.queryByTestId('answer-explanation')).toBeNull();
  });

  it('single_choice: same beat, from the one shared primitive', () => {
    renderActivity(makeActivity('single_choice', SINGLE_CHOICE_SPEC));
    fireEvent.click(screen.getByText('Alfa'));
    fireEvent.click(screen.getByTestId('single-choice-submit'));

    expect(screen.getByTestId('answer-explanation')).toHaveTextContent(SINGLE_CHOICE_SPEC.explanation);
  });

  it('multi_choice: same beat, from the one shared primitive', () => {
    renderActivity(makeActivity('multi_choice', MULTI_CHOICE_SPEC));
    fireEvent.click(screen.getByText('Beta'));
    fireEvent.click(screen.getByTestId('multi-choice-submit'));

    expect(screen.getByTestId('answer-explanation')).toHaveTextContent(MULTI_CHOICE_SPEC.explanation);
  });

  it('single_choice: nothing extra when the spec carries no explanation', () => {
    const { explanation: _omitted, ...noExplanation } = SINGLE_CHOICE_SPEC;
    renderActivity(makeActivity('single_choice', noExplanation));
    fireEvent.click(screen.getByText('Alfa'));
    fireEvent.click(screen.getByTestId('single-choice-submit'));

    expect(screen.queryByTestId('answer-explanation')).toBeNull();
  });

  it.each([
    ['whitespace only', '   '],
    ['not a string', 42],
  ])('single_choice: %s never becomes a card', (_name, explanation) => {
    renderActivity(makeActivity('single_choice', { ...SINGLE_CHOICE_SPEC, explanation }));
    fireEvent.click(screen.getByText('Alfa'));
    fireEvent.click(screen.getByTestId('single-choice-submit'));

    expect(screen.queryByTestId('answer-explanation')).toBeNull();
  });
});

/**
 * `showKey` (match/order) troca a tela pelo GABARITO, mas o veredito continua
 * sendo o do rascunho do aluno — que o embaralhamento pode ter acertado por
 * acaso. Gatilho é `gradeResult`, não o rascunho: quem não enviou nada é quem
 * mais precisa do porquê.
 */
describe('a reveal with no submission always gets the why', () => {
  it.each([
    ['match', MATCH_SPEC],
    ['order', ORDER_SPEC],
  ])('%s', (kind, spec) => {
    renderActivity(makeActivity(kind as ActivityKind, spec), true);

    expect(screen.getByTestId('answer-explanation')).toHaveTextContent(spec.explanation);
  });
});
