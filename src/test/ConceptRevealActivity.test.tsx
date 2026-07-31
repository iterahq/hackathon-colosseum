import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConceptActivity } from '@/components/branded/activity/ConceptActivity';
import { ConceptRevealActivity } from '@/components/branded/activity/ConceptRevealActivity';
import { I18nProvider } from '@/i18n';
import type { Activity } from '@/types/content';

const show = (ui: ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

const make = (kind: string, spec: unknown) =>
  ({ id: 'a1', lessonId: 'l1', ordinal: 1, kind, status: 'todo', spec }) as unknown as Activity;

const reveal = make('concept_reveal', {
  instruction: { text: 'O `title` chegou por prop.' },
  reveal: { prompt: 'Por que a tela não atualizou?', answer: 'Porque `title` é prop, não estado.' },
});

describe('concept_reveal', () => {
  it('a resposta só aparece depois do clique', () => {
    show(<ConceptRevealActivity activity={reveal} onComplete={() => {}} />);
    expect(screen.queryByTestId('concept-reveal-answer')).toBeNull();
    const button = screen.getByTestId('concept-reveal-show');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(screen.getByTestId('concept-reveal-answer').textContent).toContain('é prop');
    // O botão sobrevive ao clique: é ele que anuncia a mudança de estado.
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('ao vivo a resposta já vem aberta e o botão nem existe', () => {
    // Quem dita o ritmo da aula ao vivo é o professor falando: um gate de clique
    // ali só atrasaria a explicação.
    show(<ConceptRevealActivity activity={reveal} onComplete={() => {}} live />);
    expect(screen.getByTestId('concept-reveal-answer')).toBeTruthy();
    expect(screen.queryByTestId('concept-reveal-show')).toBeNull();
    expect(screen.getByTestId('concept-reveal-card').dataset.revealed).toBe('true');
  });

  it('revelar não conta como responder', () => {
    let completed = 0;
    show(<ConceptRevealActivity activity={reveal} onComplete={() => (completed += 1)} />);
    fireEvent.click(screen.getByTestId('concept-reveal-show'));
    expect(completed).toBe(0);
  });

  it('o enunciado e a resposta passam pelo markdown-leve', () => {
    show(<ConceptRevealActivity activity={reveal} onComplete={() => {}} live />);
    expect(screen.getByTestId('concept-reveal-answer').querySelector('code')?.textContent).toBe(
      'title',
    );
  });
});

describe('concept — sem passos, sem card', () => {
  it('mostra a tela inteira de uma vez', () => {
    const text = 'primeiro pedaço\n\n---\n\nsegundo pedaço\n\n---\n\nterceiro pedaço';
    show(<ConceptActivity activity={make('concept', { instruction: { text } })} onComplete={() => {}} />);
    expect(screen.getByText('primeiro pedaço')).toBeTruthy();
    expect(screen.getByText('terceiro pedaço')).toBeTruthy();
    expect(screen.queryByText('---')).toBeNull();
  });

  it('não tem affordance de revelação nenhuma', () => {
    show(
      <ConceptActivity
        activity={make('concept', { instruction: { text: 'só um parágrafo' } })}
        onComplete={() => {}}
      />,
    );
    expect(screen.queryByTestId('concept-reveal-show')).toBeNull();
  });
});
