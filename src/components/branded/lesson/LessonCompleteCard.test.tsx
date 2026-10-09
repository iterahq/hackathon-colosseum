import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { LessonCompleteCard, PHONE_FILL } from './LessonCompleteCard';

function renderCard(props: Partial<Parameters<typeof LessonCompleteCard>[0]> = {}) {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <LessonCompleteCard doneCount={12} total={18} {...props} />
      </MemoryRouter>
    </I18nProvider>
  );
}

describe('LessonCompleteCard', () => {
  it('shows the count of finished activities', () => {
    renderCard();
    expect(screen.getByTestId('lesson-complete')).toHaveTextContent('12/18');
  });

  it('fills the free height on a phone and centres its content', () => {
    renderCard();
    const card = screen.getByTestId('lesson-complete');
    for (const cls of PHONE_FILL.split(' ')) expect(card.className).toContain(cls);
    expect(PHONE_FILL).toContain('max-sm:min-h-[calc(100svh');
    expect(PHONE_FILL).toContain('max-sm:justify-center');
  });

  it('routes the primary button to the next lesson when there is one', () => {
    renderCard({ nextLessonId: 'abc' });
    expect(screen.getByTestId('lesson-next-cta')).toHaveAttribute('href', '/lesson/abc');
    expect(screen.queryByTestId('lesson-finish-cta')).toBeNull();
  });

  it('routes to the dashboard when the course is over', () => {
    renderCard();
    expect(screen.getByTestId('lesson-finish-cta')).toHaveAttribute('href', '/');
  });

  it('offers the review button only when there is something to revisit', () => {
    const onReview = vi.fn();
    const { unmount } = renderCard({ onReview });
    fireEvent.click(screen.getByTestId('lesson-review-cta'));
    expect(onReview).toHaveBeenCalledTimes(1);
    unmount();
    renderCard();
    expect(screen.queryByTestId('lesson-review-cta')).toBeNull();
  });
});
