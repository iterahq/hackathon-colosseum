import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RootRoute } from './RootRoute';

const auth = vi.hoisted(() => ({ session: null as { access_token: string } | null, loading: false, configured: true }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/pages/landingLazy', () => ({ LazyLandingPage: () => <p>landing</p> }));
vi.mock('@/components/RouteSettling', () => ({ RouteSettling: () => <p>settling</p> }));
vi.mock('@/services/guestSession.service', () => ({ isGuestAccessToken: (token: string) => token === 'guest' }));

describe('RootRoute', () => {
  it('shows the landing to a visitor without a session', () => {
    auth.session = null;
    render(<RootRoute><p>home</p></RootRoute>);
    expect(screen.getByText('landing')).toBeInTheDocument();
    expect(screen.queryByText('home')).toBeNull();
  });

  it('shows the learner home to a signed-in user', () => {
    auth.session = { access_token: 'real' };
    render(<RootRoute><p>home</p></RootRoute>);
    expect(screen.getByText('home')).toBeInTheDocument();
  });

  it('treats a link-invited guest as a visitor', () => {
    auth.session = { access_token: 'guest' };
    render(<RootRoute><p>home</p></RootRoute>);
    expect(screen.getByText('landing')).toBeInTheDocument();
  });

  it('holds the frame while the session is still loading', () => {
    auth.session = null;
    auth.loading = true;
    render(<RootRoute><p>home</p></RootRoute>);
    expect(screen.getByText('settling')).toBeInTheDocument();
    auth.loading = false;
  });
});
