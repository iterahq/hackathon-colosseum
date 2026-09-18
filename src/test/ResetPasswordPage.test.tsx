import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const session = vi.hoisted(() => ({ current: null as { user: { id: string } } | null }));
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ session: session.current, loading: false }),
}));

const updatePassword = vi.fn();
vi.mock('@/services/passwordReset.service', () => ({
  updatePassword: (...args: unknown[]) => updatePassword(...args),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/auth/reset']}>
      <I18nProvider>
        <Routes>
          <Route path="/auth/reset" element={<ResetPasswordPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  );
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    navigate.mockReset();
    updatePassword.mockReset();
    session.current = null;
  });

  it('shows the invalid-link state with "request new link" as the primary action', () => {
    renderPage();
    expect(screen.getByTestId('reset-invalid')).toBeInTheDocument();
    expect(screen.getByTestId('request-new-link')).toBeInTheDocument();
  });

  describe('with a recovery session', () => {
    beforeEach(() => {
      session.current = { user: { id: 'u1' } };
    });

    it('checklist reflects length and match requirements live', () => {
      renderPage();
      const checklist = screen.getByTestId('reset-checklist');
      expect(checklist).toHaveTextContent('8 caracteres');

      fireEvent.change(screen.getByTestId('new-password-input'), {
        target: { value: 'longenough1' },
      });
      fireEvent.change(screen.getByTestId('confirm-password-input'), {
        target: { value: 'longenough1' },
      });
      expect(checklist).toHaveTextContent('senhas coincidem');
    });

    it('shows a success state then navigates home', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      updatePassword.mockResolvedValue({ error: null });
      renderPage();

      fireEvent.change(screen.getByTestId('new-password-input'), {
        target: { value: 'longenough1' },
      });
      fireEvent.change(screen.getByTestId('confirm-password-input'), {
        target: { value: 'longenough1' },
      });
      fireEvent.click(screen.getByTestId('submit-reset'));

      await screen.findByTestId('reset-success');
      await vi.advanceTimersByTimeAsync(1500);
      expect(navigate).toHaveBeenCalledWith('/', { replace: true });
      vi.useRealTimers();
    });

    it('rejects a mismatched confirmation without calling the service', async () => {
      renderPage();
      fireEvent.change(screen.getByTestId('new-password-input'), {
        target: { value: 'longenough1' },
      });
      fireEvent.change(screen.getByTestId('confirm-password-input'), {
        target: { value: 'different1' },
      });
      fireEvent.click(screen.getByTestId('submit-reset'));

      expect(await screen.findByTestId('reset-error')).toBeInTheDocument();
      expect(updatePassword).not.toHaveBeenCalled();
    });
  });
});
