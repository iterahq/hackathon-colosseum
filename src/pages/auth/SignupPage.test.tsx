import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import SignupPage, { signUpErrorKey } from './SignupPage';

const auth = vi.hoisted(() => ({
  session: null,
  loading: false,
  signUpWithPassword: vi.fn(async () => ({ error: 'User already registered', code: 'user_already_exists' })),
  configured: true,
}));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth }));

function mount() {
  localStorage.setItem('itera.locale', 'en');
  return render(
    <MemoryRouter>
      <I18nProvider>
        <SignupPage />
      </I18nProvider>
    </MemoryRouter>
  );
}

describe('signUpErrorKey', () => {
  it('names what the server refused', () => {
    expect(signUpErrorKey('user_already_exists', 'User already registered').key).toBe('door.signUp.error.exists');
    expect(signUpErrorKey('weak_password', 'Password should be at least 6 characters.').key).toBe('door.signUp.error.weak');
    expect(signUpErrorKey('email_address_invalid', 'Email address "x" is invalid').key).toBe('door.signUp.error.email');
    expect(signUpErrorKey('over_email_send_rate_limit', 'email rate limit exceeded').key).toBe('door.signUp.error.rate');
    expect(signUpErrorKey(null, 'Database error saving new user')).toEqual({ key: 'door.signUp.error.generic', detail: 'Database error saving new user' });
  });
});

describe('SignupPage', () => {
  it('says the build is free and sends no e-mail, with no subscription step', () => {
    mount();
    expect(screen.getByTestId('signup-page')).toHaveTextContent('Free on this hackathon build');
    expect(screen.getByTestId('signup-page')).toHaveTextContent('No e-mail is sent');
    expect(screen.queryByTestId('auth-progress-steps')).toBeNull();
    expect(screen.queryByText(/stripe/i)).toBeNull();
  });

  it('refuses a short password before calling the server', async () => {
    mount();
    fireEvent.change(screen.getByTestId('signup-email-input'), { target: { value: 'judge@example.org' } });
    fireEvent.change(screen.getByTestId('signup-password-input'), { target: { value: 'short' } });
    fireEvent.submit(screen.getByTestId('signup-form'));
    expect(await screen.findByTestId('signup-error')).toHaveTextContent('at least 8 characters');
    expect(auth.signUpWithPassword).not.toHaveBeenCalled();
  });

  it('shows the server reason when the e-mail is taken', async () => {
    mount();
    fireEvent.change(screen.getByTestId('signup-email-input'), { target: { value: 'judge@example.org' } });
    fireEvent.change(screen.getByTestId('signup-password-input'), { target: { value: 'long-enough-1' } });
    fireEvent.submit(screen.getByTestId('signup-form'));
    await waitFor(() => expect(auth.signUpWithPassword).toHaveBeenCalledWith('judge@example.org', 'long-enough-1'));
    expect(await screen.findByTestId('signup-error')).toHaveTextContent('already has an account');
  });
});
