import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConceptActivity } from '@/components/branded/activity/ConceptActivity';
import { I18nProvider } from '@/i18n';
import type { Activity } from '@/types/content';

const show = (ui: ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

const concept = (text: string) =>
  ({
    id: 'a1',
    lesson_id: 'l1',
    ordinal: 1,
    kind: 'concept',
    status: 'todo',
    spec: { instruction: { text } },
  }) as unknown as Activity;

const TEXT = 'primeiro pedaço\n\n---\n\nsegundo pedaço\n\n---\n\nterceiro pedaço';

describe('ritmo da tela de conceito', () => {
  it('self-paced entrega um passo por vez', () => {
    show(<ConceptActivity activity={concept(TEXT)} onComplete={() => {}} />);
    expect(screen.getByText('primeiro pedaço')).toBeTruthy();
    expect(screen.queryByText('segundo pedaço')).toBeNull();
    expect(screen.getByTestId('rich-steps-progress').textContent).toBe('1 de 3');
  });

  it('o botão avança e some no último passo', () => {
    show(<ConceptActivity activity={concept(TEXT)} onComplete={() => {}} />);
    fireEvent.click(screen.getByTestId('rich-steps-next'));
    expect(screen.getByText('segundo pedaço')).toBeTruthy();
    fireEvent.click(screen.getByTestId('rich-steps-next'));
    expect(screen.getByText('terceiro pedaço')).toBeTruthy();
    expect(screen.queryByTestId('rich-steps-next')).toBeNull();
  });

  it('o contador acompanha o passo mostrado', () => {
    show(<ConceptActivity activity={concept(TEXT)} onComplete={() => {}} />);
    fireEvent.click(screen.getByTestId('rich-steps-next'));
    expect(screen.getByTestId('rich-steps-progress').textContent).toBe('2 de 3');
  });

  it('ao vivo mostra tudo de uma vez', () => {
    show(<ConceptActivity activity={concept(TEXT)} onComplete={() => {}} live />);
    expect(screen.getByText('terceiro pedaço')).toBeTruthy();
    expect(screen.queryByTestId('rich-steps-next')).toBeNull();
  });

  it('texto sem --- não ganha nenhum controle', () => {
    show(<ConceptActivity activity={concept('só um parágrafo')} onComplete={() => {}} />);
    expect(screen.queryByTestId('rich-steps-next')).toBeNull();
    expect(screen.queryByTestId('rich-steps-progress')).toBeNull();
  });

  it('a resposta só aparece depois do clique', () => {
    show(<ConceptActivity activity={concept('?> pergunta\n?= resposta')} onComplete={() => {}} />);
    expect(screen.queryByTestId('rich-reveal-answer')).toBeNull();
    fireEvent.click(screen.getByTestId('rich-reveal-show'));
    expect(screen.getByTestId('rich-reveal-answer').textContent).toBe('resposta');
  });

  it('ao vivo a resposta já vem aberta', () => {
    show(<ConceptActivity activity={concept('?> pergunta\n?= resposta')} onComplete={() => {}} live />);
    expect(screen.getByTestId('rich-reveal-answer')).toBeTruthy();
    expect(screen.queryByTestId('rich-reveal-show')).toBeNull();
  });

  it('revelar não conta como responder', () => {
    let completed = 0;
    show(
      <ConceptActivity
        activity={concept('?> pergunta\n?= resposta')}
        onComplete={() => {
          completed += 1;
        }}
      />,
    );
    fireEvent.click(screen.getByTestId('rich-reveal-show'));
    expect(completed).toBe(0);
  });
});
