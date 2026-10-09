import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LessonCompleteCard } from '@/components/branded/lesson/LessonCompleteCard';
import { I18nProvider } from '@/i18n';
import { LessonCompanionContext } from './lessonCompanion';

const renderCard = (value?: { bonus: number; outfit: string | null }) =>
  render(
    <I18nProvider>
      <MemoryRouter>
        {value ? (
          <LessonCompanionContext.Provider value={value}>
            <LessonCompleteCard doneCount={3} total={3} />
          </LessonCompanionContext.Provider>
        ) : (
          <LessonCompleteCard doneCount={3} total={3} />
        )}
      </MemoryRouter>
    </I18nProvider>
  );

describe('end-of-lesson companion', () => {
  it('shows nothing extra when lives are off', () => {
    renderCard();
    expect(screen.queryByTestId('lesson-lives-bonus')).toBeNull();
    expect(screen.getByTestId('tera-outfit')).toHaveAttribute('data-outfit', 'none');
  });

  it('shows the zero-mistake bonus and the learner outfit', () => {
    renderCard({ bonus: 1, outfit: 'outfit_crown' });
    expect(screen.getByTestId('lesson-lives-bonus')).toHaveTextContent('+1 vida');
    expect(screen.getByTestId('tera-outfit')).toHaveAttribute('data-outfit', 'outfit_crown');
  });
});
