import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LessonSaveError } from './LessonSaveError';

const mount = (props: Parameters<typeof LessonSaveError>[0]) =>
  render(
    <I18nProvider>
      <LessonSaveError {...props} />
    </I18nProvider>,
  );

describe('LessonSaveError', () => {
  it('announces the failed save and retries on demand', () => {
    const onRetry = vi.fn();
    mount({ onRetry });
    expect(screen.getByRole('alert')).toBe(screen.getByTestId('lesson-save-error'));
    fireEvent.click(screen.getByTestId('lesson-save-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('cannot be pressed twice while the retry is running', () => {
    mount({ onRetry: vi.fn(), busy: true });
    expect(screen.getByTestId('lesson-save-retry')).toBeDisabled();
  });
});
