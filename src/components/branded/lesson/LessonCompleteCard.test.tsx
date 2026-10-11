import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { LessonCompleteActions, LessonCompleteCard, PHONE_FILL } from './LessonCompleteCard';
vi.mock('@/hooks/useLearnerAvatar', async () => {
  const { DEFAULT_AVATAR } = await import('@/types/avatar');
  return { useLearnerAvatar: () => DEFAULT_AVATAR };
});

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

  it('an unfinished day says how many are left, with a neutral Tera, and offers the way back', () => {
    const onRedoMissing = vi.fn();
    renderCard({ doneCount: 13, total: 16, missing: 3, onRedoMissing });
    expect(screen.getByTestId('lesson-complete-title')).toHaveTextContent('Faltaram 3 atividades pra carimbar o dia');
    expect(screen.getByTestId('lesson-complete-count')).toHaveTextContent('13 de 16');
    expect(screen.queryByTestId('lesson-next-cta')).toBeNull();
    fireEvent.click(screen.getByTestId('lesson-redo-missing-cta'));
    expect(onRedoMissing).toHaveBeenCalledOnce();
    expect(screen.getByTestId('lesson-later-cta')).toHaveAttribute('href', '/');
  });

  it('shows the extra line only on a finished day', () => {
    renderCard({ note: 'stamp later' });
    expect(screen.getByTestId('lesson-complete-note')).toHaveTextContent('stamp later');
  });

  it('after gold the certifications come first and next/finish steps down', () => {
    const actions = (nextLessonId?: string) =>
      render(
        <I18nProvider>
          <MemoryRouter>
            <LessonCompleteActions gold nextLessonId={nextLessonId} />
          </MemoryRouter>
        </I18nProvider>
      );
    const first = actions('abc');
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveTextContent('Ver minhas certificações');
    expect(links[0]).toHaveAttribute('href', '/passport');
    expect(links[1]).toBe(screen.getByTestId('lesson-next-cta'));
    first.unmount();
    actions();
    expect(screen.getAllByRole('link')[1]).toBe(screen.getByTestId('lesson-finish-cta'));
  });

  it('stops filling the phone screen when something follows it below', () => {
    const filled = renderCard({ doneCount: 3, total: 3 });
    expect(screen.getByTestId('lesson-complete').className).toContain('max-sm:min-h-');
    filled.unmount();
    renderCard({ doneCount: 3, total: 3, fill: false });
    expect(screen.getByTestId('lesson-complete').className).not.toContain('max-sm:min-h-');
  });
});
