import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { EnrolledProgramCard } from './EnrolledProgramCard';

const base = {
  id: 'p1',
  title: { en: 'Frontend Fundamentals', pt: 'Fundamentos de Frontend' },
  unitCount: 3,
  lessonCount: 8,
  activityCount: 20,
  icon: 'code',
};

function renderCard(completedCount: number | undefined, onOpen = vi.fn()) {
  render(
    <I18nProvider>
      <EnrolledProgramCard program={{ ...base, completedCount }} onOpen={onOpen} />
    </I18nProvider>,
  );
  return onOpen;
}

describe('EnrolledProgramCard', () => {
  it('renders the shared catalog card', () => {
    renderCard(0);
    expect(screen.getByTestId('catalog-program-card')).toBeInTheDocument();
  });

  it('shows Start and no progress line before the first activity', () => {
    renderCard(undefined);
    expect(screen.getByTestId('program-open')).toHaveTextContent('Começar');
    expect(screen.getByTestId('program-card').textContent).not.toMatch(/%|NaN|undefined/);
  });

  it('shows the percentage and Continue once started', () => {
    renderCard(5);
    expect(screen.getByText('25% concluído')).toBeInTheDocument();
    expect(screen.getByTestId('program-open')).toHaveTextContent('Continuar');
  });

  it('opens the program from the CTA and from the thumbnail', () => {
    const onOpen = renderCard(5);
    fireEvent.click(screen.getByTestId('program-open'));
    fireEvent.click(screen.getByRole('button', { name: 'Fundamentos de Frontend' }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
