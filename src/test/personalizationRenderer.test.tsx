/**
 * A costura: o que o aluno LÊ já vem com o elenco dele dentro, e o pedido só
 * aparece quando há provider.
 *
 * O caso sem provider é o que protege o harness do autor e as stories — lá não
 * há elenco nem onde gravar, então perguntar seria pedir um dado que ninguém
 * pode guardar.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { PersonalizationContext } from '@/personalization/personalizationPort';
import type { PersonalizationPort, PersonalizationValues } from '@/types/personalization';
import type { Activity } from '@/types/content';

const ACTIVITY: Activity = {
  id: 'a1',
  lessonId: 'l1',
  ordinal: 0,
  kind: 'concept',
  spec: { instruction: { text: '{{familiar.nome}} tem {{familiar.idade}} anos.' } },
  rubric: null,
};

function renderWith(port: Partial<PersonalizationPort>, live = false) {
  const value: PersonalizationPort = {
    values: {},
    ready: true,
    mayAsk: true,
    save: vi.fn(async () => {}),
    dismiss: vi.fn(),
    ...port,
  };
  render(
    <I18nProvider>
      <PersonalizationContext.Provider value={value}>
        <ActivityRenderer activity={ACTIVITY} onComplete={vi.fn()} live={live} />
      </PersonalizationContext.Provider>
    </I18nProvider>
  );
  return value;
}

describe('personalização no ActivityRenderer', () => {
  it('sem provider não pergunta nada e usa os nomes de exemplo', () => {
    render(
      <I18nProvider>
        <ActivityRenderer activity={ACTIVITY} onComplete={vi.fn()} />
      </I18nProvider>
    );
    expect(screen.queryByTestId('personalization-form')).toBeNull();
    expect(screen.getByText('Ana tem 42 anos.')).toBeInTheDocument();
  });

  it('pede só os campos que ESTA atividade cita', () => {
    renderWith({ values: { 'familiar.nome': 'Cida' } });
    const inputs = screen.getAllByTestId('personalization-input');
    expect(inputs.map((i) => i.getAttribute('data-field'))).toEqual(['familiar.idade']);
  });

  it('grava o elenco inteiro, não só o campo novo', async () => {
    const save = vi.fn(async (_: PersonalizationValues) => {});
    renderWith({ values: { 'familiar.nome': 'Cida' }, save });
    fireEvent.change(screen.getByTestId('personalization-input'), { target: { value: '51' } });
    fireEvent.click(screen.getByTestId('personalization-submit'));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ 'familiar.nome': 'Cida', 'familiar.idade': '51' })
    );
  });

  it('com o elenco preenchido, a atividade já aparece com os nomes do aluno', () => {
    renderWith({ values: { 'familiar.nome': 'Cida', 'familiar.idade': '51' } });
    expect(screen.queryByTestId('personalization-form')).toBeNull();
    expect(screen.getByText('Cida tem 51 anos.')).toBeInTheDocument();
  });

  it('quem dispensa segue a aula com os nomes de exemplo', () => {
    renderWith({ mayAsk: false });
    expect(screen.queryByTestId('personalization-form')).toBeNull();
    expect(screen.getByText('Ana tem 42 anos.')).toBeInTheDocument();
  });

  it('AO VIVO não pergunta nada — o cronômetro já está correndo', () => {
    renderWith({}, true);
    expect(screen.queryByTestId('personalization-form')).toBeNull();
    expect(screen.getByText('Ana tem 42 anos.')).toBeInTheDocument();
  });
});
