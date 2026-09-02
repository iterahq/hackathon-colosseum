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
 * Auth gate: Google login removed, signup removed, DFL is primary CTA, subscribe-cta present.
 * Sign-in still works for existing subscribers.
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
  }),
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

  it('does NOT have a link to /signup (goto-signup testId absent)', () => {
    renderAt('/login');
    expect(screen.queryByTestId('goto-signup')).not.toBeInTheDocument();
  });

  it('DOES have a DFL login button (oauth-dfl testId present)', () => {
    renderAt('/login');
    expect(screen.getByTestId('oauth-dfl')).toBeInTheDocument();
  });

  it('DOES have a subscribe CTA linking to iterahq.dev', () => {
    renderAt('/login');
    const cta = screen.getByTestId('subscribe-cta');
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('href', 'https://iterahq.dev');
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

describe('subscription-gated auth — /signup route', () => {
  it('redirects /signup to /login', () => {
    renderAt('/signup');
    // After redirect, the login page should be rendered (SignupPage is <Navigate to="/login">)
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('signup-page')).not.toBeInTheDocument();
  });
});
