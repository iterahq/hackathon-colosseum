import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { LessonStepActions } from './LessonStepActions';

const mount = (props: Parameters<typeof LessonStepActions>[0]) =>
  render(
    <I18nProvider>
      <LessonStepActions {...props} />
    </I18nProvider>,
  );

describe('LessonStepActions', () => {
  it('offers only Continuar when there is nothing to retry', () => {
    const onContinue = vi.fn();
    mount({ onContinue });
    expect(screen.queryByTestId('lesson-retry-missed')).toBeNull();
    fireEvent.click(screen.getByTestId('concept-continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('puts the retry beside Continuar, in one row that shares the width', () => {
    const onRetry = vi.fn();
    mount({ onContinue: vi.fn(), onRetry });
    const retry = screen.getByTestId('lesson-retry-missed');
    const next = screen.getByTestId('concept-continue');
    expect(retry.parentElement).toBe(next.parentElement);
    expect(retry.parentElement?.className).toContain('flex');
    for (const button of [retry, next]) expect(button.className).toContain('flex-1');
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('holds Continuar while a save is in flight, and leaves the retry alone', () => {
    mount({ onContinue: vi.fn(), onRetry: vi.fn(), busy: true });
    expect(screen.getByTestId('concept-continue')).toBeDisabled();
    expect(screen.getByTestId('lesson-retry-missed')).toBeEnabled();
  });
});
