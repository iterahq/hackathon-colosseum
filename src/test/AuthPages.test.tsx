import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { resources } from '@/i18n';
import LoginPage from '@/pages/auth/LoginPage';
import SignupPage from '@/pages/auth/SignupPage';

/**
 * Auth page tests — subscription-gated login (plan 20260706-iterahq-subscription-gated-login):
 *
 * FIX A: the home hero subtitle (pt+en) no longer forces "desenvolvedor"/"developer" copy.
 * Auth gate: Google login removed, DFL is primary CTA. Sign-in still works for
 * existing subscribers.
 *
 * Self-serve sign-up REOPENED (PLG front door): /signup renders a passwordless
 * form instead of redirecting to /login, and the login page links to it. The
 * paywall is unchanged — a fresh account lands on /subscribe, which is what the
 * assertions below pin.
 */

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

// Mock the auth context — we never hit Supabase in unit tests.
// signUpWithPassword is intentionally absent: it no longer exists in AuthContext.
const signInWithPassword = vi.fn();
const signInWithOAuth = vi.fn();
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({
    signInWithPassword,
    signInWithOAuth,
    configured: true,
    session: null,
    loading: false,
  }),
}));

// Passwordless sign-up talks to Supabase through this service — stub it.
const sendSignupCode = vi.fn();
const verifySignupCode = vi.fn();
vi.mock('@/services/otpAuth.service', () => ({
  sendSignupCode: (...args: unknown[]) => sendSignupCode(...args),
  verifySignupCode: (...args: unknown[]) => verifySignupCode(...args),
  sendLoginCode: vi.fn(),
  verifyLoginCode: vi.fn(),
}));

// DFL federation redirect — stub so the IdP button is inert in tests.
vi.mock('@/auth/dflFederation', () => ({ loginWithDfl: vi.fn() }));

function renderAt(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <I18nProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigate.mockReset();
  signInWithPassword.mockReset();
  signInWithOAuth.mockReset();
  sendSignupCode.mockReset();
  verifySignupCode.mockReset();
});

describe('FIX A — audience-neutral hero copy', () => {
  it('does not force "desenvolvedor"/"developer" in the home hero subtitle (pt+en)', () => {
    expect(resources.pt['home.heroSubtitle']).not.toMatch(/desenvolvedor|developer/i);
    expect(resources.en['home.heroSubtitle']).not.toMatch(/desenvolvedor|developer/i);
  });
});

describe('subscription-gated auth — login page', () => {
  it('renders the login page with the sign-in form', () => {
    renderAt('/login');
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });

  it('does NOT have a Google OAuth button', () => {
    renderAt('/login');
    expect(screen.queryByTestId('oauth-google')).not.toBeInTheDocument();
  });

  it('DOES link to /signup — the self-serve door the funnel needs', () => {
    renderAt('/login');
    expect(screen.getByTestId('goto-signup')).toBeInTheDocument();
  });

  it('DOES have a DFL login button (oauth-dfl testId present)', () => {
    renderAt('/login');
    expect(screen.getByTestId('oauth-dfl')).toBeInTheDocument();
  });


  it('signs in via signInWithPassword and navigates on success (no regression)', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    renderAt('/login');

    fireEvent.change(screen.getByTestId('email-input'), {
      target: { value: 'old@user.dev' },
    });
    fireEvent.change(screen.getByTestId('password-input'), {
      target: { value: 'mypassword' },
    });
    fireEvent.click(screen.getByTestId('submit-login'));

    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith('old@user.dev', 'mypassword')
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
  });
});

describe('self-serve sign-up — /signup route', () => {
  it('renders the sign-up form instead of redirecting to /login', () => {
    renderAt('/signup');
    expect(screen.getByTestId('signup-page')).toBeInTheDocument();
    expect(screen.getByTestId('signup-send-form')).toBeInTheDocument();
  });

  it('asks for the code after sending, and creates the account on verify', async () => {
    sendSignupCode.mockResolvedValue({ error: null });
    verifySignupCode.mockResolvedValue({ error: null });
    renderAt('/signup');

    fireEvent.change(screen.getByTestId('signup-email-input'), {
      target: { value: 'new@learner.dev' },
    });
    fireEvent.click(screen.getByTestId('submit-signup-send'));
    await waitFor(() => expect(sendSignupCode).toHaveBeenCalledWith('new@learner.dev'));

    const code = await screen.findByTestId('signup-code-input');
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(screen.getByTestId('submit-signup-verify'));

    await waitFor(() =>
      expect(verifySignupCode).toHaveBeenCalledWith('new@learner.dev', '123456')
    );
    // A fresh account has no entitlement: it must land on the paywall, never on
    // a learner surface. This is the assertion that keeps sign-up from becoming
    // free access.
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/subscribe', { replace: true }));
  });

  it('never reveals that an email already has an account', async () => {
    sendSignupCode.mockResolvedValue({ error: null });
    renderAt('/signup');

    fireEvent.change(screen.getByTestId('signup-email-input'), {
      target: { value: 'existing@learner.dev' },
    });
    fireEvent.click(screen.getByTestId('submit-signup-send'));

    // Same neutral confirmation an unknown address gets — no "already taken".
    // Scoped to the message node, not the whole block: the block also echoes
    // the email back (new UX), and "existing@learner.dev" itself contains
    // "exist" — that would be a false positive against the whole block's text.
    const sent = await screen.findByTestId('signup-sent-message');
    expect(sent.textContent ?? '').not.toMatch(/já|exist|taken|cadastrad/i);
  });

  it('surfaces the rate-limit message instead of a silent success', async () => {
    sendSignupCode.mockResolvedValue({ error: 'Email rate limit exceeded' });
    renderAt('/signup');

    fireEvent.change(screen.getByTestId('signup-email-input'), {
      target: { value: 'flood@learner.dev' },
    });
    fireEvent.click(screen.getByTestId('submit-signup-send'));

    expect(await screen.findByTestId('signup-error')).toBeInTheDocument();
    expect(screen.queryByTestId('signup-verify-form')).not.toBeInTheDocument();
  });

  it('echoes the address the code was sent to, on the code step', async () => {
    sendSignupCode.mockResolvedValue({ error: null });
    renderAt('/signup');

    fireEvent.change(screen.getByTestId('signup-email-input'), {
      target: { value: 'new@learner.dev' },
    });
    fireEvent.click(screen.getByTestId('submit-signup-send'));

    expect(await screen.findByTestId('signup-sent-email')).toHaveTextContent('new@learner.dev');
  });

  it('"change email" goes back to the email step, keeping it editable', async () => {
    sendSignupCode.mockResolvedValue({ error: null });
    renderAt('/signup');

    fireEvent.change(screen.getByTestId('signup-email-input'), {
      target: { value: 'new@learner.dev' },
    });
    fireEvent.click(screen.getByTestId('submit-signup-send'));
    await screen.findByTestId('signup-verify-form');

    fireEvent.click(screen.getByTestId('signup-change-email'));

    expect(await screen.findByTestId('signup-send-form')).toBeInTheDocument();
  });

  it('resend is held for the cooldown after the first send, then calls sendSignupCode again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      sendSignupCode.mockResolvedValue({ error: null });
      renderAt('/signup');

      fireEvent.change(screen.getByTestId('signup-email-input'), {
        target: { value: 'new@learner.dev' },
      });
      fireEvent.click(screen.getByTestId('submit-signup-send'));
      await screen.findByTestId('signup-verify-form');
      expect(sendSignupCode).toHaveBeenCalledTimes(1);

      const resend = screen.getByTestId('signup-resend');
      expect(resend).toBeDisabled();

      await vi.advanceTimersByTimeAsync(60_000);
      expect(resend).not.toBeDisabled();
      fireEvent.click(resend);
      expect(sendSignupCode).toHaveBeenCalledTimes(2);
      expect(resend).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failed resend is shown instead of pretending a code went out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      sendSignupCode.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: 'Email rate limit exceeded' });
      renderAt('/signup');

      fireEvent.change(screen.getByTestId('signup-email-input'), {
        target: { value: 'new@learner.dev' },
      });
      fireEvent.click(screen.getByTestId('submit-signup-send'));
      await screen.findByTestId('signup-verify-form');

      await vi.advanceTimersByTimeAsync(60_000);
      fireEvent.click(screen.getByTestId('signup-resend'));

      expect(await screen.findByTestId('signup-error')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
