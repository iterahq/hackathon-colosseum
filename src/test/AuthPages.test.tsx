import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { resources } from '@/i18n';
import LoginPage from '@/pages/auth/LoginPage';
import SignupPage from '@/pages/auth/SignupPage';

/**
 * FIX B (round-3 focus group) — a self-serve visitor must reach a REAL sign-up
 * flow, not the login-only page. Asserts:
 *  (a) /signup renders a registration form with a heading distinct from the
 *      login "Bem-vindo de volta" heading,
 *  (b) submitting the signup form calls signUpWithPassword (mocked AuthContext),
 *  (c) login ↔ signup cross-links navigate between the two routes.
 * Plus FIX A: the home hero subtitle (pt+en) no longer forces "desenvolvedor"/
 * "developer" copy on everyone.
 */

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

// Mock the auth context — we never hit Supabase in unit tests.
const signInWithPassword = vi.fn();
const signUpWithPassword = vi.fn();
const signInWithOAuth = vi.fn();
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({
    signInWithPassword,
    signUpWithPassword,
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
  signUpWithPassword.mockReset();
  signInWithOAuth.mockReset();
});

describe('FIX A — audience-neutral hero copy', () => {
  it('does not force "desenvolvedor"/"developer" in the home hero subtitle (pt+en)', () => {
    expect(resources.pt['home.heroSubtitle']).not.toMatch(/desenvolvedor|developer/i);
    expect(resources.en['home.heroSubtitle']).not.toMatch(/desenvolvedor|developer/i);
  });
});

describe('FIX B — /signup registration flow', () => {
  it('renders a registration form with a heading distinct from "Bem-vindo de volta"', () => {
    renderAt('/signup');
    expect(screen.getByTestId('signup-page')).toBeInTheDocument();
    expect(screen.getByTestId('signup-form')).toBeInTheDocument();
    // Distinct heading: signup says "Crie sua conta", NOT the login welcome.
    expect(screen.getByText('Crie sua conta')).toBeInTheDocument();
    expect(screen.queryByText('Bem-vindo de volta')).not.toBeInTheDocument();
  });

  it('submitting the signup form calls signUpWithPassword and navigates on success', async () => {
    signUpWithPassword.mockResolvedValue({ error: null });
    renderAt('/signup');

    fireEvent.change(screen.getByTestId('email-input'), {
      target: { value: 'new@user.dev' },
    });
    fireEvent.change(screen.getByTestId('password-input'), {
      target: { value: 'sup3rsecret' },
    });
    fireEvent.click(screen.getByTestId('submit-signup'));

    await waitFor(() =>
      expect(signUpWithPassword).toHaveBeenCalledWith('new@user.dev', 'sup3rsecret')
    );
    expect(signInWithPassword).not.toHaveBeenCalled();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('the login page links to /signup', () => {
    renderAt('/login');
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.getByText('Bem-vindo de volta')).toBeInTheDocument();
    const link = screen.getByTestId('goto-signup');
    expect(link).toHaveAttribute('href', '/signup');
  });

  it('the signup page links to /login', () => {
    renderAt('/signup');
    const link = screen.getByTestId('goto-login');
    expect(link).toHaveAttribute('href', '/login');
  });

  it('the login page still signs IN via signInWithPassword (no regression)', async () => {
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
    expect(signUpWithPassword).not.toHaveBeenCalled();
  });
});
