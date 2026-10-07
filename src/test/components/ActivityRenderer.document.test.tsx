import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import type { Activity } from '@/types/content';

/**
 * Round-1 finding #2/#3: the document "write what you learned" activity used to
 * render the prompt + a "Mark as done" button but NO text input, and completion
 * was ungated. These tests pin the fixed behavior:
 *   - a real textarea is rendered;
 *   - completion is DISABLED until the min_words rubric is met;
 *   - once met, the (real, clickable) button calls onComplete(true).
 */

function renderActivity(activity: Activity, onComplete = vi.fn()) {
  render(
    <I18nProvider>
      <ActivityRenderer activity={activity} onComplete={onComplete} />
    </I18nProvider>
  );
  return onComplete;
}

const stubActivity: Activity = {
  id: 'doc-1',
  lessonId: 'l1',
  ordinal: 1,
  kind: 'document',
  spec: { title: 'Escreva seu primeiro doc', prompt: 'Descreva o que você aprendeu.' },
  rubric: { min_words: 10 },
};

describe('DocumentActivity — reflection (min_words)', () => {
  // A reflection sent is kept as that learner's draft: each case starts clean.
  beforeEach(() => localStorage.clear());

  it('renders a real text input (not just a button)', () => {
    renderActivity(stubActivity);
    expect(screen.getByTestId('document-reflection-input')).toBeInTheDocument();
  });

  it('renders the prompt as the heading', () => {
    renderActivity(stubActivity);
    expect(screen.getByText(/Descreva o que você aprendeu/i)).toBeInTheDocument();
  });

  it('disables completion until min_words is met, then enables a working button', () => {
    const onComplete = renderActivity(stubActivity);
    const doneBtn = screen.getByTestId('activity-done') as HTMLButtonElement;

    // Too few words → disabled, clicking does nothing.
    expect(doneBtn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('document-reflection-input'), {
      target: { value: 'só três palavras aqui' }, // 4 words < 10
    });
    expect(doneBtn.disabled).toBe(true);

    // Meets min_words → enabled, click completes.
    fireEvent.change(screen.getByTestId('document-reflection-input'), {
      target: { value: 'uma duas tres quatro cinco seis sete oito nove dez onze' }, // 11 words
    });
    expect(doneBtn.disabled).toBe(false);
    fireEvent.click(doneBtn);
    // The reflection now rides UP in the detail payload so the player can persist
    // it (plan 20260728-itera-artifact-storage). `correct` is still the 1st arg.
    expect(onComplete).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        artifact: expect.objectContaining({ type: 'text', filename: 'reflection.md' }),
      })
    );
  });

  it('shows a live word count', () => {
    renderActivity(stubActivity);
    fireEvent.change(screen.getByTestId('document-reflection-input'), {
      target: { value: 'uma duas tres' },
    });
    expect(screen.getByTestId('document-word-count')).toHaveTextContent('3');
  });

  it('free-form reflection (no min_words) requires any non-empty text', () => {
    const onComplete = renderActivity({ ...stubActivity, rubric: null });
    const doneBtn = screen.getByTestId('activity-done') as HTMLButtonElement;
    expect(doneBtn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('document-reflection-input'), {
      target: { value: 'aprendi bastante' },
    });
    expect(doneBtn.disabled).toBe(false);
    fireEvent.click(doneBtn);
    expect(onComplete).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        // THE regression this guards: the learner's text used to live only in
        // `useState` and was destroyed on unmount. It must now leave the
        // component so the player can persist it.
        artifact: expect.objectContaining({ content: 'aprendi bastante' }),
      })
    );
  });

  /**
   * ESTE TESTE MEDIA A TELA DE LEITURA PURA — que deixou de existir.
   *
   * `prompt` virou obrigatório no contrato do `document` (0.11.0), então um spec
   * com só `body` REPROVA na fronteira: o aluno vê o card de spec inválido, não a
   * tela de leitura. As duas asserções antigas (`queryBy…toBeNull()`) continuavam
   * VERDES exatamente por isso — passavam a valer sobre o card de erro, e o teste
   * já não podia falhar.
   *
   * Não é regressão do aperto: as 49 rows de `document` em produção (lidas em
   * 2026-08-09) todas têm `prompt`, ou seja nenhuma atividade viva chegava nesse
   * ramo. Ele segue no `DocumentActivity` alcançável só por `prompt: ''`.
   */
  it('document sem `prompt` é reprovado na fronteira, não renderiza leitura', () => {
    renderActivity({
      id: 'doc-2',
      lessonId: 'l1',
      ordinal: 1,
      kind: 'document',
      spec: { body: 'Leia este conteúdo.' },
      rubric: null,
    });
    expect(screen.getByTestId('document-invalid')).toBeInTheDocument();
    expect(screen.queryByTestId('document-prompt')).toBeNull();
    expect(screen.queryByTestId('activity-done')).toBeNull();
  });
});
