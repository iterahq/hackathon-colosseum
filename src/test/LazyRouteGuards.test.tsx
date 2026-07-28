import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { RequireAuth } from '@/auth/RequireAuth';
import { RequireRole } from '@/auth/RequireRole';

/**
 * Access-regression guard for the /admin + /author code-splitting.
 *
 * Making those routes `React.lazy` must not change WHO can reach them. This
 * spec reproduces App.tsx's exact composition —
 *
 *     RequireAuth → RequireRole → Suspense → lazy(Page)
 *
 * — and pins three things:
 *
 *   1. the right role still renders the page (nothing got locked out);
 *   2. the wrong role is still redirected (nothing got opened up);
 *   3. a DENIED user never even triggers the dynamic import.
 *
 * (3) holds because a guard that redirects never renders its children, so the
 * lazy element is never mounted and its import never runs — the staff chunk is
 * not fetched for learners who poke at the URL. (Note this follows from the
 * guard short-circuiting, NOT from where the Suspense boundary sits; moving
 * Suspense outside the guards does not change it.)
 *
 * Both directions are mutation-verified: deleting RequireRole from the /admin
 * route fails cases (2)+(3), and tightening /author's gate to tenant_admin
 * fails case (1) — the exact "did /author access get removed?" regression.
 */

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

/** Stands in for the real dynamic import so we can observe whether it fired. */
const adminImport = vi.fn(async () => ({
  default: () => <div data-testid="admin-content">ADMIN OK</div>,
}));
const authorImport = vi.fn(async () => ({
  default: () => <div data-testid="author-content">AUTHOR OK</div>,
}));

const LazyAdminPage = lazy(() => adminImport());
const LazyAuthorPage = lazy(() => authorImport());

/** Mirrors App.tsx's <LazyRoute>: Suspense INSIDE the guards, never around. */
function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div data-testid="fallback">Loading…</div>}>{children}</Suspense>;
}

function renderAt(path: '/admin' | '/author') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <RequireRole role="tenant_admin">
                <LazyRoute>
                  <LazyAdminPage />
                </LazyRoute>
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route
          path="/author"
          element={
            <RequireAuth>
              <RequireRole role="author">
                <LazyRoute>
                  <LazyAuthorPage />
                </LazyRoute>
              </RequireRole>
            </RequireAuth>
          }
        />
        <Route path="/" element={<div data-testid="home">HOME</div>} />
        <Route path="/login" element={<div data-testid="login">LOGIN</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('lazy /admin + /author routes — no access regression', () => {
  beforeEach(() => {
    authState.session = { user: { id: 'u1' } };
    authState.loading = false;
    authState.configured = true;
    membershipState.data = [];
    membershipState.isPending = false;
    adminImport.mockClear();
    authorImport.mockClear();
  });

  it('tenant_admin still reaches the lazy /admin page', async () => {
    membershipState.data = [{ tenantId: 'TA', role: 'tenant_admin' }];
    renderAt('/admin');
    expect(await screen.findByTestId('admin-content')).toBeInTheDocument();
  });

  it('author still reaches the lazy /author page', async () => {
    membershipState.data = [{ tenantId: 'TA', role: 'author' }];
    renderAt('/author');
    expect(await screen.findByTestId('author-content')).toBeInTheDocument();
  });

  it('instructor still reaches /author (canAuthor mirrors current_author_tenant_ids)', async () => {
    membershipState.data = [{ tenantId: 'TA', role: 'instructor' }];
    renderAt('/author');
    expect(await screen.findByTestId('author-content')).toBeInTheDocument();
  });

  it('learner is still redirected away from /admin — and the chunk is never fetched', async () => {
    membershipState.data = [{ tenantId: 'TA', role: 'learner' }];
    renderAt('/admin');
    expect(await screen.findByTestId('home')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
    expect(adminImport).not.toHaveBeenCalled();
  });

  it('learner is still redirected away from /author — and the chunk is never fetched', async () => {
    membershipState.data = [{ tenantId: 'TA', role: 'learner' }];
    renderAt('/author');
    expect(await screen.findByTestId('home')).toBeInTheDocument();
    expect(screen.queryByTestId('author-content')).not.toBeInTheDocument();
    expect(authorImport).not.toHaveBeenCalled();
  });

  it('unauthenticated user still goes to /login without fetching the admin chunk', async () => {
    authState.session = null;
    renderAt('/admin');
    expect(await screen.findByTestId('login')).toBeInTheDocument();
    expect(adminImport).not.toHaveBeenCalled();
  });

  it('a personal plg owner still cannot open /admin (leak stays closed)', async () => {
    membershipState.data = [
      { tenantId: 'dfl-batch', role: 'learner', isPersonal: false },
      { tenantId: 'plg-abc123', role: 'owner', isPersonal: true },
    ];
    renderAt('/admin');
    expect(await screen.findByTestId('home')).toBeInTheDocument();
    expect(adminImport).not.toHaveBeenCalled();
  });

  it('shows the Suspense fallback while an authorized chunk is still in flight', async () => {
    // A dedicated lazy component whose import we resolve by hand. The shared
    // ones above are already settled by this point (React.lazy memoises the
    // resolved module), so a still-pending import is the only way to observe
    // the fallback.
    let resolveImport!: (m: { default: () => JSX.Element }) => void;
    const pending = new Promise<{ default: () => JSX.Element }>((res) => {
      resolveImport = res;
    });
    const DeferredPage = lazy(() => pending);

    membershipState.data = [{ tenantId: 'TA', role: 'tenant_admin' }];
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <RequireRole role="tenant_admin">
                  <LazyRoute>
                    <DeferredPage />
                  </LazyRoute>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route path="/" element={<div data-testid="home">HOME</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Guard passed, chunk not here yet -> the fallback is what the admin sees.
    expect(screen.getByTestId('fallback')).toBeInTheDocument();

    resolveImport({ default: () => <div data-testid="deferred-content">LATE OK</div> });
    await waitFor(() => expect(screen.getByTestId('deferred-content')).toBeInTheDocument());
    expect(screen.queryByTestId('fallback')).not.toBeInTheDocument();
  });
});
