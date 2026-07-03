import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireSubscription } from '@/auth/RequireSubscription';

/**
 * PLG subscription gate (plan 20260624-itera-plg-subscribe-flow). Verifies:
 *   - active subscription -> renders the player,
 *   - no active subscription -> redirected to /subscribe,
 *   - tenant-admin -> exempt (renders even without a subscription),
 *   - unconfigured -> pass-through (mock/dev).
 */

const authState = {
  session: null as unknown,
  loading: false,
  configured: true,
};
const entitlementState = {
  data: { active: false, status: null, currentPeriodEnd: null } as {
    active: boolean;
    status: string | null;
    currentPeriodEnd: string | null;
  },
  isPending: false,
};
const membershipState = {
  data: [] as { tenantId: string; role: string; isPersonal?: boolean }[],
  isPending: false,
};

vi.mock('@/auth/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/useEntitlement', () => ({ useEntitlement: () => entitlementState }));
vi.mock('@/hooks/useMembership', () => ({ useMembership: () => membershipState }));

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <RequireSubscription>
              <div data-testid="player">PLAYER OK</div>
            </RequireSubscription>
          }
        />
        <Route path="/subscribe" element={<div data-testid="subscribe">SUBSCRIBE</div>} />
        <Route path="/login" element={<div data-testid="login">LOGIN</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RequireSubscription (PLG gate)', () => {
  beforeEach(() => {
    authState.session = { user: { id: 'u1' } };
    authState.loading = false;
    authState.configured = true;
    entitlementState.data = { active: false, status: null, currentPeriodEnd: null };
    entitlementState.isPending = false;
    membershipState.data = [{ tenantId: 'T', role: 'learner' }];
    membershipState.isPending = false;
  });

  it('renders the player when the subscription is active', () => {
    entitlementState.data = { active: true, status: 'active', currentPeriodEnd: null };
    renderGuard();
    expect(screen.getByTestId('player')).toBeInTheDocument();
  });

  it('redirects to /subscribe when there is no active subscription', () => {
    entitlementState.data = { active: false, status: null, currentPeriodEnd: null };
    renderGuard();
    expect(screen.queryByTestId('player')).not.toBeInTheDocument();
    expect(screen.getByTestId('subscribe')).toBeInTheDocument();
  });

  it('exempts a tenant-admin (renders even without a subscription)', () => {
    entitlementState.data = { active: false, status: null, currentPeriodEnd: null };
    membershipState.data = [{ tenantId: 'T', role: 'tenant_admin' }];
    renderGuard();
    expect(screen.getByTestId('player')).toBeInTheDocument();
  });

  it('does NOT exempt a federated learner who owns a personal plg tenant (leak closed)', () => {
    // The bug shape: learner in dfl-batch + auto-granted personal `plg-<uid>` owner.
    // Owning a personal billing tenant must not bypass the PLG seat paywall.
    entitlementState.data = { active: false, status: null, currentPeriodEnd: null };
    membershipState.data = [
      { tenantId: 'dfl-batch', role: 'learner', isPersonal: false },
      { tenantId: 'plg-abc123', role: 'owner', isPersonal: true },
    ];
    renderGuard();
    expect(screen.queryByTestId('player')).not.toBeInTheDocument();
    expect(screen.getByTestId('subscribe')).toBeInTheDocument();
  });

  it('redirects an unauthenticated user to /login', () => {
    authState.session = null;
    renderGuard();
    expect(screen.queryByTestId('player')).not.toBeInTheDocument();
    expect(screen.getByTestId('login')).toBeInTheDocument();
  });

  it('passes through when Supabase is not configured (mock/dev)', () => {
    authState.configured = false;
    renderGuard();
    expect(screen.getByTestId('player')).toBeInTheDocument();
  });
});
