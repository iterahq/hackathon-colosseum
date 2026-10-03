import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
// The activity tree needs an i18n PORT, not just the app's provider — the
// bilingual-explanation cases below read `locale`. See the component.
import { ActivityI18nBridge } from '@/components/branded/activity/IteraActivityHost';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { mapActivity } from '@/services/programs.service';
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
  prompt: 'Qual delas identifica a linha de forma única?',
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
      <ActivityI18nBridge>
        <ActivityRenderer activity={activity} onComplete={onComplete} reveal={reveal} />
      </ActivityI18nBridge>
    </I18nProvider>
  );
  const rerenderWith = (next: boolean) =>
    view.rerender(
      <I18nProvider>
        <ActivityI18nBridge>
          <ActivityRenderer activity={activity} onComplete={onComplete} reveal={next} />
        </ActivityI18nBridge>
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

    expect(optionButton('Matrícula').getAttribute('data-verdict')).toBe('right');
    expect(optionButton('Nome').getAttribute('data-verdict')).toBeNull();
    screen
      .getAllByTestId('quiz-option')
      .forEach((o) => expect((o as HTMLButtonElement).disabled).toBe(true));
  });

  it('reveals nothing while the instructor has not revealed', () => {
    renderActivity(makeActivity('quiz', QUIZ_SPEC));

    expect(optionButton('Matrícula').getAttribute('data-verdict')).toBeNull();
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

  it('single_choice: whitespace only never becomes a card', () => {
    renderActivity(makeActivity('single_choice', { ...SINGLE_CHOICE_SPEC, explanation: '   ' }));
    fireEvent.click(screen.getByText('Alfa'));
    fireEvent.click(screen.getByTestId('single-choice-submit'));

    expect(screen.queryByTestId('answer-explanation')).toBeNull();
  });

  /**
   * Um `explanation` não-string já não chega ao renderer: desde o 0.11.0 o
   * schema por kind é `.strict()` e tipa o campo como texto localizado, então a
   * fronteira REPROVA o spec. A garantia ficou mais forte (o defeito morre antes
   * de renderizar), e é por isso que a asserção mudou de "não vira card" para
   * "não vira atividade".
   */
  it('single_choice: explanation não-string é reprovado na fronteira', () => {
    renderActivity(makeActivity('single_choice', { ...SINGLE_CHOICE_SPEC, explanation: 42 }));

    expect(screen.getByTestId('single-choice-invalid')).toBeInTheDocument();
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE BILINGUAL SHAPE — the one production actually stores
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every fixture above writes `explanation` as a plain string. Not one row in
 * production does. Audited 2026-08-07 against `itera.activities`: 41 rows carry
 * `spec.explanation` (quiz 34, single_choice 5, multi_choice 2) and **41 of 41
 * are `{ en, pt }` bags** — zero plain strings, zero empty locale values. The
 * shape the tests exercised was the shape nobody authors.
 *
 * `@iterahq/activity-spec` declares the field as `LocalizedTextSchema.optional()`
 * on all three kinds, so BOTH shapes are legitimate and both are locked here.
 *
 * `SPEC_ROW_*` below are verbatim `itera.activities.spec` payloads (ids
 * elided), NOT invented ones — an invented fixture can accidentally agree with
 * whatever the code happens to do.
 *
 * These assert the explanation **TEXT**, not that the component "renders". A
 * bag reaching `AnswerExplanation` used to render a blank panel: no card, no
 * error, no console warning. A test asserting "renders without error" passes
 * happily against a panel the learner never sees, which is exactly how a blank
 * explanation would survive review. So every assertion here is on the sentence.
 */

/** Verbatim prod row (`quiz`): a bilingual prompt AND a bilingual explanation. */
const SPEC_ROW_QUIZ = {
  prompt: {
    en: 'In a Pull Request diff, the red line with `−` is a line that has an error.',
    pt: 'No diff de um Pull Request, a linha vermelha com `−` é uma linha que deu erro.',
  },
  options: [
    { id: 'v', text: 'VERDADEIRO', isCorrect: false },
    { id: 'f', text: 'FALSO', isCorrect: true },
  ],
  explanation: {
    en: "Red with `−` is not an error — it's a line that **left** the file. Green with `+` is a line that came in. The diff is a before-and-after, not a bug report.",
    pt: 'Vermelho com `−` não é erro — é uma linha que **saiu** do arquivo. Verde com `+` é uma linha que entrou. O diff é um antes-e-depois, não um relatório de bugs.',
  },
};

/** Verbatim prod row (`quiz`): plain-string prompt, bilingual explanation. */
const SPEC_ROW_QUIZ_MIXED = {
  prompt: 'Pulse 2 — Um Cliente faz quantos Pedidos?',
  options: [
    { text: 'Um-para-muitos', isCorrect: true },
    { text: 'Um-para-um', isCorrect: false },
    { text: { en: 'Not related', pt: 'Sem relação' }, isCorrect: false },
  ],
  question: 'Pulse 2 — Um Cliente faz quantos Pedidos?',
  explanation: {
    en: "A Customer places MANY Orders, but each Order belongs to ONE Customer — one-to-many. Ask 'for one X, how many Y?' in both directions.",
    pt: "Um Cliente faz MUITOS Pedidos, mas cada Pedido pertence a UM Cliente — um-para-muitos. Pergunte 'para um X, quantos Y?' nas duas direções.",
  },
};

/** The DB row shape `programs.service.mapActivity` consumes. */
function row(kind: string, spec: Record<string, unknown>) {
  return { id: `row-${kind}`, lesson_id: 'l', ordinal: 0, kind, spec };
}

afterEach(() => localStorage.clear());

describe('a bilingual explanation reaches the learner in their own language', () => {
  /**
   * THE PRODUCTION PATH, END TO END: DB row → `mapActivity` → renderer → DOM.
   *
   * This is the invariant that actually protects the learner, and it spans two
   * files that have no other reason to be tested together. `mapActivity` is what
   * collapses the bag (`resolveLocalizedSpec`); `AnswerExplanation` is what puts
   * it on screen. Delete the resolution from the service and every OTHER
   * explanation test still passes — they all hand-feed plain strings. This one
   * fails, which is the whole point of it existing.
   */
  it.each([
    ['pt' as const, 'não é erro', 'is not an error'],
    ['en' as const, 'is not an error', 'não é erro'],
  ])('%s: quiz row from the DB renders the %s copy', (locale, expected, notExpected) => {
    localStorage.setItem('itera.locale', locale);
    renderActivity(mapActivity(row('quiz', SPEC_ROW_QUIZ)));

    fireEvent.click(screen.getByText('VERDADEIRO'));
    fireEvent.click(screen.getByTestId('quiz-submit'));

    const card = screen.getByTestId('answer-explanation');
    expect(card).toHaveTextContent(expected);
    expect(card).not.toHaveTextContent(notExpected);
  });

  it('a row mixing plain-string and bilingual fields still explains itself', () => {
    localStorage.setItem('itera.locale', 'en');
    renderActivity(mapActivity(row('quiz', SPEC_ROW_QUIZ_MIXED)));

    fireEvent.click(screen.getByText('Um-para-um'));
    fireEvent.click(screen.getByTestId('quiz-submit'));

    expect(screen.getByTestId('answer-explanation')).toHaveTextContent(
      'each Order belongs to ONE Customer'
    );
  });

  /**
   * The component's OWN defense, with the service deliberately out of the way.
   *
   * `ActivityTestHarness` (the author's "run as student") and the stories mount
   * `ActivityRenderer` with a spec that never passed through a mapper. Before
   * this, `typeof raw === 'string'` sent every such bag to the blank branch.
   */
  it.each([
    ['pt' as const, 'não é erro'],
    ['en' as const, 'is not an error'],
  ])('%s: an UNMAPPED bag no longer renders a blank panel', (locale, expected) => {
    localStorage.setItem('itera.locale', locale);
    renderActivity(
      makeActivity('single_choice', {
        options: [
          { id: 'a', label: 'Alfa' },
          { id: 'b', label: 'Beta' },
        ],
        correct_option_id: 'b',
        explanation: SPEC_ROW_QUIZ.explanation,
      })
    );

    fireEvent.click(screen.getByText('Alfa'));
    fireEvent.click(screen.getByTestId('single-choice-submit'));

    expect(screen.getByTestId('answer-explanation')).toHaveTextContent(expected);
  });

  /**
   * A bag missing the reader's locale falls back to `pt`, the product default
   * (`DEFAULT_LOCALE`) and the language every row was authored in before the EN
   * backfill of #253. Blank was the old answer here too, and it is the worst
   * one: the author wrote the sentence, it just never arrived.
   */
  it('en reader, pt-only bag: gets the Portuguese sentence, not nothing', () => {
    localStorage.setItem('itera.locale', 'en');
    renderActivity(
      makeActivity('multi_choice', {
        options: [
          { id: 'a', label: 'Alfa' },
          { id: 'b', label: 'Beta' },
          { id: 'c', label: 'Gama' },
        ],
        correct_option_ids: ['a', 'c'],
        explanation: { pt: 'Só a redação em português existe nesta linha.' },
      })
    );

    fireEvent.click(screen.getByText('Beta'));
    fireEvent.click(screen.getByTestId('multi-choice-submit'));

    expect(screen.getByTestId('answer-explanation')).toHaveTextContent(
      'Só a redação em português existe nesta linha.'
    );
  });

  /** A bag whose every locale is blank is still "the author wrote nothing". */
  it('an empty bag stays a non-card', () => {
    renderActivity(
      makeActivity('single_choice', {
        options: [
          { id: 'a', label: 'Alfa' },
          { id: 'b', label: 'Beta' },
        ],
        correct_option_id: 'b',
        explanation: { pt: '   ', en: '' },
      })
    );

    fireEvent.click(screen.getByText('Alfa'));
    fireEvent.click(screen.getByTestId('single-choice-submit'));

    expect(screen.queryByTestId('answer-explanation')).toBeNull();
  });
});
