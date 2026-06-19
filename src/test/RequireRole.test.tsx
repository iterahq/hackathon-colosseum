import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireRole } from '@/auth/RequireRole';

// Mock the auth + membership hooks the guard depends on.
const authState = {
  session: null as unknown,
  loading: false,
  configured: true,
};
const membershipState = {
  data: [] as { tenantId: string; role: string }[],
  isPending: false,
};

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => authState,
}));
vi.mock('@/hooks/useMembership', () => ({
  useMembership: () => membershipState,
}));

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route
          path="/admin"
          element={
            <RequireRole role="tenant_admin">
              <div data-testid="admin-content">ADMIN OK</div>
            </RequireRole>
          }
        />
        <Route path="/" element={<div data-testid="home">HOME</div>} />
        <Route path="/login" element={<div data-testid="login">LOGIN</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RequireRole (V4/V5 route guard)', () => {
  beforeEach(() => {
    authState.session = { user: { id: 'u1' } };
    authState.loading = false;
    authState.configured = true;
    membershipState.data = [];
    membershipState.isPending = false;
  });

  it('renders children for a tenant_admin (V1 surface visible)', () => {
    membershipState.data = [{ tenantId: 'TA', role: 'tenant_admin' }];
    renderGuard();
    expect(screen.getByTestId('admin-content')).toBeInTheDocument();
  });

  it('redirects a learner away from /admin to "/" (V5)', () => {
    membershipState.data = [{ tenantId: 'TA', role: 'learner' }];
    renderGuard();
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('home')).toBeInTheDocument();
  });

  it('redirects an unauthenticated user to /login', () => {
    authState.session = null;
    renderGuard();
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('login')).toBeInTheDocument();
  });

  it('denies when Supabase is not configured (no data => no leak)', () => {
    authState.configured = false;
    membershipState.data = [{ tenantId: 'TA', role: 'tenant_admin' }];
    renderGuard();
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('home')).toBeInTheDocument();
  });
});
