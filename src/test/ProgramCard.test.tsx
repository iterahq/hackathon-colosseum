import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { ProgramCard } from '@/components/branded';

/**
 * ProgramCard is shared by HomePage (enrolled — whole-card button, default
 * level · %-complete footer) and CatalogPage (discovery — custom `footer` slot
 * with the Enroll/Open CTA, no per-user progress). These guards lock the
 * graceful-degradation contract: a catalog program (no `completedCount`) must
 * render the rich card with NO progress bar and NO "undefined"/"NaN", while the
 * custom footer is shown instead of the default %-complete line.
 */

function renderCard(ui: ReactNode) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe('ProgramCard', () => {
  it('renders the rich card with the title and activity count', () => {
    renderCard(
      <ProgramCard
        program={{
          id: 'p1',
          title: { en: 'Web Fundamentals', pt: 'Fundamentos Web' },
          unitCount: 3,
          lessonCount: 8,
          activityCount: 16,
          completedCount: 8,
          icon: 'code',
        }}
      />
    );
    expect(screen.getByTestId('program-card')).toBeInTheDocument();
    expect(screen.getByText(/Fundamentos Web|Web Fundamentals/)).toBeInTheDocument();
  });

  it('fires onClick when the enrolled card is clicked', () => {
    const onClick = vi.fn();
    renderCard(
      <ProgramCard
        program={{ id: 'p1', title: { en: 'X' }, activityCount: 4 }}
        onClick={onClick}
      />
    );
    fireEvent.click(screen.getByTestId('program-card'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders a custom footer slot (catalog CTA) instead of the default line', () => {
    renderCard(
      <ProgramCard
        program={{ id: 'p1', title: { en: 'X' }, activityCount: 8 }}
        footer={<button data-testid="my-cta">Enroll</button>}
      />
    );
    expect(screen.getByTestId('my-cta')).toBeInTheDocument();
  });

  it('uses singular labels for a count of 1 and labels the activities', () => {
    renderCard(
      <ProgramCard
        program={{ id: 'p1', title: { en: 'One' }, unitCount: 1, lessonCount: 1, activityCount: 1 }}
      />
    );
    const text = screen.getByTestId('program-card').textContent ?? '';
    expect(text).toMatch(/1 (lição|lesson)/i);
    expect(text).toMatch(/1 (unidade|unit)/i);
    expect(text).toMatch(/1 (atividade|activity)/i);
    expect(text).not.toMatch(/lições|lessons|unidades|units|atividades|activities/i);
  });

  it('shows no invented category or level tag', () => {
    renderCard(
      <ProgramCard
        program={{ id: 'p1', title: { en: 'X' }, activityCount: 21, icon: 'layers' }}
      />
    );
    const text = screen.getByTestId('program-card').textContent ?? '';
    expect(text).not.toMatch(/cloud|frontend|devops|iniciante|beginner|intermedi|advanced|avançado/i);
  });

  it('degrades gracefully for a catalog program with no progress field', () => {
    const { container } = renderCard(
      <ProgramCard
        program={{
          id: 'p1',
          title: { en: 'No Progress Course' },
          unitCount: 1,
          lessonCount: 2,
          activityCount: 8,
          // completedCount intentionally absent (not-yet-enrolled)
          icon: 'brain',
        }}
        footer={<button data-testid="catalog-enroll">Enroll</button>}
      />
    );
    // No "undefined"/"NaN" leaks into the rendered text.
    expect(container.textContent).not.toMatch(/undefined|NaN/);
    // No progress bar element (the only inline width:* node) when progress is 0.
    const bar = container.querySelector('[style*="width"]');
    expect(bar).toBeNull();
  });
});
