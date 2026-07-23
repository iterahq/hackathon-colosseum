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
  data: [] as { tenantId: string; role: string; isPersonal?: boolean }[],
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

// The same guard, role="instructor" — protects the two /live/instructor routes
// (index + routed session) in App.tsx (plan 20260723-itera-live-routed-…).
function renderInstructorGuard() {
  return render(
    <MemoryRouter initialEntries={['/live/instructor']}>
      <Routes>
        <Route
          path="/live/instructor"
          element={
            <RequireRole role="instructor">
              <div data-testid="instructor-content">INSTRUCTOR OK</div>
            </RequireRole>
          }
        />
        <Route path="/" element={<div data-testid="home">HOME</div>} />
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

  it('redirects a federated learner who owns a personal plg tenant away from /admin (leak closed)', () => {
    // The bug shape: learner in dfl-batch + auto-granted personal `plg-<uid>` owner.
    // Owning a personal billing tenant must not open the /admin observability surface.
    membershipState.data = [
      { tenantId: 'dfl-batch', role: 'learner', isPersonal: false },
      { tenantId: 'plg-abc123', role: 'owner', isPersonal: true },
    ];
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

  it('role="instructor" renders for a staff instructor (guards /live/instructor)', () => {
    membershipState.data = [{ tenantId: 'T1', role: 'instructor' }];
    renderInstructorGuard();
    expect(screen.getByTestId('instructor-content')).toBeInTheDocument();
  });

  it('role="instructor" redirects a plain learner away from /live/instructor', () => {
    membershipState.data = [{ tenantId: 'T1', role: 'learner' }];
    renderInstructorGuard();
    expect(screen.queryByTestId('instructor-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('home')).toBeInTheDocument();
  });
});
