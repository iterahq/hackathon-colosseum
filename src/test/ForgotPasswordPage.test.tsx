import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';

const requestPasswordReset = vi.fn();
vi.mock('@/services/passwordReset.service', () => ({
  requestPasswordReset: (...args: unknown[]) => requestPasswordReset(...args),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/auth/forgot']}>
      <I18nProvider>
        <Routes>
          <Route path="/auth/forgot" element={<ForgotPasswordPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  );
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    requestPasswordReset.mockReset();
  });

  it('echoes the requested email back in the sent state', async () => {
    requestPasswordReset.mockResolvedValue({ error: null });
    renderPage();

    fireEvent.change(screen.getByTestId('forgot-email-input'), {
      target: { value: 'learner@itera.dev' },
    });
    fireEvent.click(screen.getByTestId('submit-forgot'));

    expect(await screen.findByTestId('forgot-sent-email')).toHaveTextContent('learner@itera.dev');
    expect(screen.getByTestId('forgot-use-code')).toBeInTheDocument();
  });

  describe('resend cooldown', () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
    afterEach(() => vi.useRealTimers());

    it('holds resend for 60s after the first send, then calls requestPasswordReset again', async () => {
      requestPasswordReset.mockResolvedValue({ error: null });
      renderPage();

      fireEvent.change(screen.getByTestId('forgot-email-input'), {
        target: { value: 'learner@itera.dev' },
      });
      fireEvent.click(screen.getByTestId('submit-forgot'));
      await screen.findByTestId('forgot-sent');
      expect(requestPasswordReset).toHaveBeenCalledTimes(1);

      const resend = screen.getByTestId('forgot-resend');
      expect(resend).toBeDisabled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      fireEvent.click(resend);
      await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(resend).toBeDisabled());
    });

    it('shows a rate-limited resend in the sent state', async () => {
      requestPasswordReset
        .mockResolvedValueOnce({ error: null })
        .mockResolvedValueOnce({ error: 'Email rate limit exceeded' });
      renderPage();

      fireEvent.change(screen.getByTestId('forgot-email-input'), {
        target: { value: 'learner@itera.dev' },
      });
      fireEvent.click(screen.getByTestId('submit-forgot'));
      await screen.findByTestId('forgot-sent');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      fireEvent.click(screen.getByTestId('forgot-resend'));

      expect(await screen.findByTestId('forgot-error')).toBeInTheDocument();
    });
  });
});
