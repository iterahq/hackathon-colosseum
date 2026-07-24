import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import OtpLoginPage from '@/pages/auth/OtpLoginPage';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ session: null, loading: false }),
}));

const sendLoginCode = vi.fn();
const verifyLoginCode = vi.fn();
vi.mock('@/services/otpAuth.service', () => ({
  sendLoginCode: (...a: unknown[]) => sendLoginCode(...a),
  verifyLoginCode: (...a: unknown[]) => verifyLoginCode(...a),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/auth/code']}>
      <I18nProvider>
        <Routes>
          <Route path="/auth/code" element={<OtpLoginPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigate.mockReset();
  sendLoginCode.mockReset();
  verifyLoginCode.mockReset();
});

describe('OtpLoginPage', () => {
  it('starts on the email step with no code field', () => {
    renderPage();
    expect(screen.getByTestId('otp-page')).toBeInTheDocument();
    expect(screen.getByTestId('otp-send-form')).toBeInTheDocument();
    expect(screen.queryByTestId('otp-code-input')).toBeNull();
  });

  it('sends the code then verifies it and navigates on success', async () => {
    sendLoginCode.mockResolvedValue({ error: null });
    verifyLoginCode.mockResolvedValue({ error: null });
    renderPage();

    fireEvent.change(screen.getByTestId('otp-email-input'), {
      target: { value: 'aluno@itera.dev' },
    });
    fireEvent.click(screen.getByTestId('submit-otp-send'));

    await waitFor(() => expect(sendLoginCode).toHaveBeenCalledWith('aluno@itera.dev'));
    await screen.findByTestId('otp-verify-form');

    fireEvent.change(screen.getByTestId('otp-code-input'), { target: { value: '123456' } });
    fireEvent.click(screen.getByTestId('submit-otp-verify'));

    await waitFor(() =>
      expect(verifyLoginCode).toHaveBeenCalledWith('aluno@itera.dev', '123456')
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('keeps only digits in the code field', async () => {
    sendLoginCode.mockResolvedValue({ error: null });
    renderPage();
    fireEvent.change(screen.getByTestId('otp-email-input'), { target: { value: 'a@b.dev' } });
    fireEvent.click(screen.getByTestId('submit-otp-send'));
    const input = (await screen.findByTestId('otp-code-input')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12ab34' } });
    expect(input.value).toBe('1234');
  });

  it('shows an error and does not navigate on a bad code', async () => {
    sendLoginCode.mockResolvedValue({ error: null });
    verifyLoginCode.mockResolvedValue({ error: 'Token has expired or is invalid' });
    renderPage();
    fireEvent.change(screen.getByTestId('otp-email-input'), { target: { value: 'a@b.dev' } });
    fireEvent.click(screen.getByTestId('submit-otp-send'));
    fireEvent.change(await screen.findByTestId('otp-code-input'), { target: { value: '000000' } });
    fireEvent.click(screen.getByTestId('submit-otp-verify'));

    expect(await screen.findByTestId('otp-error')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('surfaces the rate-limit message on send', async () => {
    sendLoginCode.mockResolvedValue({ error: 'Email rate limit exceeded' });
    renderPage();
    fireEvent.change(screen.getByTestId('otp-email-input'), { target: { value: 'a@b.dev' } });
    fireEvent.click(screen.getByTestId('submit-otp-send'));
    expect(await screen.findByTestId('otp-error')).toHaveTextContent(/muitas tentativas/i);
    expect(screen.queryByTestId('otp-verify-form')).toBeNull();
  });
});
