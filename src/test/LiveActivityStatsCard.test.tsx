import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LiveActivityStatsCard } from '@/components/live/LiveActivityStatsCard';
import type { ClassAnswerer } from '@/types/liveClass';

const answerers: ClassAnswerer[] = [
  { userId: 'a', name: 'Ana', avatarUrl: null, state: 'done' },
  { userId: 'b', name: 'Bruno', avatarUrl: null, state: 'done' },
  { userId: 'c', name: 'Caio', avatarUrl: null, state: 'wrong' },
  { userId: 'd', name: 'Duda', avatarUrl: null, state: 'pending' },
];

function renderCard(over: Partial<React.ComponentProps<typeof LiveActivityStatsCard>> = {}) {
  return render(
    <I18nProvider>
      <LiveActivityStatsCard kind="single_choice" answerers={answerers} {...over} />
    </I18nProvider>
  );
}

describe('LiveActivityStatsCard', () => {
  it('shows a localized activity-kind label (no raw enum leak)', () => {
    renderCard();
    const text = screen.getByTestId('live-activity-stats').textContent ?? '';
    expect(text).toContain('Múltipla escolha');
    expect(text).not.toContain('single_choice');
    expect(text).not.toContain('single choice');
  });

  it('falls back to a generic label for an unknown kind', () => {
    renderCard({ kind: 'mystery_type' });
    const text = screen.getByTestId('live-activity-stats').textContent ?? '';
    expect(text).toContain('Atividade');
    expect(text).not.toContain('mystery');
  });

  it('summarises answered vs total and the correct/wrong/waiting split', () => {
    renderCard();
    // 2 correct + 1 wrong = 3 answered of 4 present.
    expect(screen.getByTestId('live-stats-answered').textContent).toContain('3/4');
    const card = screen.getByTestId('live-activity-stats').textContent ?? '';
    expect(card).toContain('2'); // correct
    expect(card).toContain('1'); // wrong
  });

  it('handles an empty room without dividing by zero', () => {
    renderCard({ answerers: [] });
    expect(screen.getByTestId('live-stats-answered').textContent).toContain('0/0');
  });

  it('collapses correct/wrong into one responded bucket for the learner', () => {
    renderCard({ hideCorrectness: true });
    const card = screen.getByTestId('live-activity-stats').textContent ?? '';
    // 2 correct + 1 wrong = 3 responded; the wrong label never leaks.
    expect(card).toContain('responderam');
    expect(card).not.toContain('erraram');
    expect(card).not.toContain('acertaram');
    expect(screen.getByTestId('live-stats-answered').textContent).toContain('3/4');
  });
});
