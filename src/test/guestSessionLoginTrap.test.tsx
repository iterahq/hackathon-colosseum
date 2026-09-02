import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import LoginPage from '@/pages/auth/LoginPage';
import OtpLoginPage from '@/pages/auth/OtpLoginPage';
import { GuestEndCard } from '@/components/live/GuestEndCard';

/**
 * The trap this locks down (hit by real Educar+ learners, 2026-08):
 * a guest JWT persists in localStorage and keeps refreshing, so a learner who
 * had ONCE joined by link could never reach their own account — the sign-in
 * pages bounced them away as "already signed in", `RequireAuth` sent them to the
 * stored guest class, which had ended, and every route landed on the podium.
 */

const session = { access_token: '', user: { id: 'u1' } } as { access_token: string };

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({
    session,
    loading: false,
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
    configured: true,
  }),
}));
vi.mock('@/auth/dflFederation', () => ({ loginWithDfl: vi.fn() }));

function jwtWith(claims: Record<string, unknown>): string {
  return `h.${btoa(JSON.stringify(claims))}.s`;
}

const GUEST_JWT = jwtWith({ sub: 'g1', app_metadata: { is_guest: true } });
const REAL_JWT = jwtWith({ sub: 'u1', app_metadata: { provider: 'email' } });

function renderAt(path: string, element: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <Routes>
          <Route path={path} element={element} />
          <Route path="/" element={<div data-testid="app-home" />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  session.access_token = GUEST_JWT;
});

describe('a guest session must not hijack the sign-in surfaces', () => {
  it('renders the password form instead of redirecting', () => {
    renderAt('/login', <LoginPage />);
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
    expect(screen.queryByTestId('app-home')).not.toBeInTheDocument();
  });

  it('renders the OTP form instead of redirecting', () => {
    renderAt('/auth/otp', <OtpLoginPage />);
    expect(screen.queryByTestId('app-home')).not.toBeInTheDocument();
  });

  it('still redirects away when the session is a real account', () => {
    session.access_token = REAL_JWT;
    renderAt('/login', <LoginPage />);
    expect(screen.getByTestId('app-home')).toBeInTheDocument();
    expect(screen.queryByTestId('login-form')).not.toBeInTheDocument();
  });
});

describe('the guest end card offers a way back to a real account', () => {
  it('links to /login', () => {
    render(
      <MemoryRouter>
        <I18nProvider>
          <GuestEndCard />
        </I18nProvider>
      </MemoryRouter>
    );
    expect(screen.getByTestId('guest-end-login')).toHaveAttribute('href', '/login');
  });
});
