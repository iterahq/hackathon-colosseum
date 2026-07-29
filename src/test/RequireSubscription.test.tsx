import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireSubscription } from '@/auth/RequireSubscription';

/**
 * PLG subscription gate (plan 20260624-itera-plg-subscribe-flow +
 * 20260706-iterahq-subscription-gated-login). Verifies:
 *   - active subscription -> renders the player,
 *   - no active subscription -> redirected to /subscribe,
 *   - tenant-admin -> exempt (renders even without a subscription),
 *   - DFL-federated user -> entitled (D2 — DFL membership = subscription),
 *   - grandfathered user (created_at before gate date) -> entitled (D3),
 *   - unconfigured -> pass-through (mock/dev).
 */

const authState = {
  session: null as unknown,
  loading: false,
  configured: true,
  isDflFederated: false,
};
const entitlementState = {
  data: { active: false, status: null, currentPeriodEnd: null } as {
    active: boolean;
    status: string | null;
    currentPeriodEnd: string | null;
  },
  isPending: false,
  isError: false,
};
const membershipState = {
  data: [] as { tenantId: string; role: string; isPersonal?: boolean }[],
  isPending: false,
};

vi.mock('@/auth/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/useEntitlement', () => ({ useEntitlement: () => entitlementState }));
vi.mock('@/hooks/useMembership', () => ({ useMembership: () => membershipState }));

function renderGuard(graceOnError = false) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <RequireSubscription graceOnError={graceOnError}>
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
    authState.session = { user: { id: 'u1', created_at: '2027-01-01T00:00:00Z' } };
    authState.loading = false;
    authState.configured = true;
    authState.isDflFederated = false;
    entitlementState.data = { active: false, status: null, currentPeriodEnd: null };
    entitlementState.isPending = false;
    entitlementState.isError = false;
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

  it('a DFL-federated user is entitled (isDflFederated=true bypasses paywall)', () => {
    // D2: DFL membership IS the subscription — no itera payment needed.
    authState.isDflFederated = true;
    entitlementState.data = { active: false, status: null, currentPeriodEnd: null };
    renderGuard();
    expect(screen.getByTestId('player')).toBeInTheDocument();
  });

  it('a member of an exempt tenant is entitled (the free cohort walks in)', () => {
    // itera-api 0014: `itera.my_subscription` emits status='exempt'/is_active for
    // a tenant that gives its classes away. Same authority, no second bypass.
    entitlementState.data = { active: true, status: 'exempt', currentPeriodEnd: null };
    renderGuard();
    expect(screen.getByTestId('player')).toBeInTheDocument();
  });

  it('graceOnError: a FAILED entitlement read renders the player instead of paywalling', () => {
    // Live class runs on the same school wifi the query dies on. An unanswered
    // read is not a "no" — bouncing the learner mid-class costs a real class.
    entitlementState.isError = true;
    entitlementState.data = { active: false, status: null, currentPeriodEnd: null };
    renderGuard(true);
    expect(screen.getByTestId('player')).toBeInTheDocument();
    expect(screen.queryByTestId('subscribe')).not.toBeInTheDocument();
  });

  it('without graceOnError a FAILED read still paywalls (no free bypass by blocking the request)', () => {
    entitlementState.isError = true;
    entitlementState.data = { active: false, status: null, currentPeriodEnd: null };
    renderGuard();
    expect(screen.queryByTestId('player')).not.toBeInTheDocument();
    expect(screen.getByTestId('subscribe')).toBeInTheDocument();
  });

  it('a grandfathered user (created_at before gate date) is entitled', () => {
    // D3: accounts created before 2026-07-06 bypass the paywall.
    // Gate date = '2026-07-06' (default, VITE_SUBSCRIPTION_GATE_DATE not set in tests).
    authState.isDflFederated = false;
    authState.session = { user: { id: 'u1', created_at: '2020-01-01T00:00:00Z' } };
    entitlementState.data = { active: false, status: null, currentPeriodEnd: null };
    renderGuard();
    expect(screen.getByTestId('player')).toBeInTheDocument();
  });
});
