import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import AuthPage from './AuthPage';

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ session: { access_token: 'signed-in-token' }, loading: false, signInWithPassword: vi.fn(), signInWithSolana: vi.fn(), configured: true }),
}));
vi.mock('@/auth/dflFederation', () => ({ loginWithDfl: vi.fn() }));
vi.mock('@/services/guestSession.service', () => ({ isGuestAccessToken: () => false }));

function landing(entry: string | { pathname: string; search?: string; state?: unknown }) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <I18nProvider>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="/bounties/:slug" element={<p>bounty page</p>} />
          <Route path="/" element={<p>home</p>} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe('AuthPage return path', () => {
  it('sends a signed-in visitor back to the bounty named in the link', () => {
    landing('/login?next=%2Fbounties%2Fcard-de-evento-responsivo');
    expect(screen.getByText('bounty page')).toBeInTheDocument();
  });

  it('still honours the router state', () => {
    landing({ pathname: '/login', state: { from: { pathname: '/bounties/x' } } });
    expect(screen.getByText('bounty page')).toBeInTheDocument();
  });

  it('never leaves the app for a foreign next', () => {
    landing('/login?next=%2F%2Fevil.example%2Fbounties%2Fx');
    expect(screen.getByText('home')).toBeInTheDocument();
  });
});
