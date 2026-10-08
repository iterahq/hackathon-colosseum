import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { ShellSurface } from '@/lib/shellSurface';
import { RequireSubscription } from './RequireSubscription';

/**
 * The gate inside the native shell (plan 20261003-itera-player-mobile, row W-7, Q-11 = A): an
 * account without access meets ONE neutral screen on every learner route, in both modes. The
 * browser behaviour of the same gate is pinned by `src/test/RequireSubscription.test.tsx`.
 */
const surface = vi.hoisted(() => ({ value: 'shell' as ShellSurface }));
const auth = vi.hoisted(() => ({ session: { user: { id: 'u1' } } as unknown, loading: false, configured: true, signOut: async () => undefined }));
const entitlement = vi.hoisted(() => ({
  data: { active: false } as { active: boolean } | undefined,
  isPending: false,
  isError: false,
  fetchStatus: 'idle' as 'idle' | 'fetching' | 'paused',
  failureCount: 0,
  failureReason: null as Error | null,
  refetch: vi.fn(),
}));
const membership = vi.hoisted(() => ({ data: [{ tenantId: 'T', role: 'learner' }] as { tenantId: string; role: string }[], isPending: false }));

vi.mock('@/hooks/useShellSurface', () => ({ useShellSurface: () => surface.value }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/useEntitlement', () => ({ useEntitlement: () => entitlement }));
vi.mock('@/hooks/useMembership', () => ({ useMembership: () => membership }));

const FORBIDDEN = /assin|plano|preço|R\$|criar conta|cadastr|subscri|trial|sign ?up|pagamento/i;

function renderGate(props: { graceOnError?: boolean; mode?: 'block' | 'preview' } = {}) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <RequireSubscription {...props}>
                <div data-testid="page">LEARNER PAGE</div>
              </RequireSubscription>
            }
          />
          <Route path="/subscribe" element={<div data-testid="subscribe">Assine por R$ 100</div>} />
          <Route path="/login" element={<div data-testid="login">LOGIN</div>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('RequireSubscription inside the shell', () => {
  beforeEach(() => {
    surface.value = 'shell';
    auth.session = { user: { id: 'u1' } };
    entitlement.data = { active: false };
    entitlement.isError = false;
    entitlement.isPending = false;
    entitlement.fetchStatus = 'idle';
    entitlement.failureCount = 0;
    entitlement.failureReason = null;
    entitlement.refetch.mockReset();
    membership.data = [{ tenantId: 'T', role: 'learner' }];
  });

  it.each(['block', 'preview'] as const)('mode %s: an account without access meets the neutral screen, never /subscribe nor the page', (mode) => {
    const { container } = renderGate({ mode });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Esta conta não tem acesso ativo.');
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
    expect(screen.queryByTestId('subscribe')).not.toBeInTheDocument();
    expect(screen.queryByTestId('page')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });

  describe('a read still pending', () => {
    beforeEach(() => {
      entitlement.data = undefined;
      entitlement.isPending = true;
      entitlement.fetchStatus = 'fetching';
    });

    it('waits behind the blank placeholder while the first attempt is in flight', () => {
      renderGate();
      expect(screen.getByTestId('route-settling')).toBeInTheDocument();
      expect(screen.queryByTestId('shell-access-unverified')).not.toBeInTheDocument();
    });

    it('says the access could not be checked, at once, when the browser is offline', () => {
      entitlement.fetchStatus = 'paused';
      renderGate();
      expect(screen.getByTestId('shell-access-unverified')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
      expect(entitlement.refetch).toHaveBeenCalledOnce();
    });

    it('says it after the first attempt died on the network, retries still running', () => {
      entitlement.failureCount = 1;
      entitlement.failureReason = new Error('TypeError: Failed to fetch');
      renderGate();
      expect(screen.getByTestId('shell-access-unverified')).toBeInTheDocument();
    });

    it('keeps waiting through the retries of any other error', () => {
      entitlement.failureCount = 2;
      entitlement.failureReason = new Error('permission denied');
      renderGate();
      expect(screen.getByTestId('route-settling')).toBeInTheDocument();
    });

    it('does not apply outside the shell', () => {
      surface.value = 'web';
      entitlement.fetchStatus = 'paused';
      renderGate();
      expect(screen.getByTestId('route-settling')).toBeInTheDocument();
    });
  });

  describe('a FAILED entitlement read', () => {
    beforeEach(() => {
      entitlement.isError = true;
    });

    it.each(['block', 'preview'] as const)('mode %s: with no earlier answer it says the access could not be checked, and retries', (mode) => {
      entitlement.data = undefined;
      const { container } = renderGate({ mode });
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Não foi possível verificar seu acesso.');
      expect(screen.queryByTestId('shell-no-access')).not.toBeInTheDocument();
      expect(screen.queryByTestId('page')).not.toBeInTheDocument();
      expect(screen.queryByTestId('subscribe')).not.toBeInTheDocument();
      expect(container.textContent).not.toMatch(FORBIDDEN);
      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
      expect(entitlement.refetch).toHaveBeenCalledOnce();
      expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
    });

    it.each(['block', 'preview'] as const)('mode %s: after an earlier "entitled" answer the learner keeps the page', (mode) => {
      entitlement.data = { active: true };
      renderGate({ mode });
      expect(screen.getByTestId('page')).toBeInTheDocument();
      expect(screen.queryByTestId('shell-no-access')).not.toBeInTheDocument();
      expect(screen.queryByTestId('shell-access-unverified')).not.toBeInTheDocument();
    });

    it('after an earlier "not entitled" answer it still does not claim "no access": the read must answer again', () => {
      entitlement.data = { active: false };
      renderGate();
      expect(screen.getByTestId('shell-access-unverified')).toBeInTheDocument();
      expect(screen.queryByTestId('shell-no-access')).not.toBeInTheDocument();
    });
  });

  it('only a read that ANSWERED "not entitled" shows the no-access sentence', () => {
    entitlement.data = { active: false };
    renderGate();
    expect(screen.getByTestId('shell-no-access')).toBeInTheDocument();
    expect(screen.queryByTestId('shell-access-unverified')).not.toBeInTheDocument();
  });

  it('graceOnError is untouched: a failed read still lets the live class through', () => {
    entitlement.isError = true;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderGate({ graceOnError: true });
    expect(screen.getByTestId('page')).toBeInTheDocument();
  });

  it('graceOnError with a read that answered "no access" meets the neutral screen', () => {
    renderGate({ graceOnError: true });
    expect(screen.getByTestId('shell-no-access')).toBeInTheDocument();
  });

  it('an entitled account and a tenant admin reach the page', () => {
    entitlement.data = { active: true };
    const first = renderGate();
    expect(screen.getByTestId('page')).toBeInTheDocument();
    first.unmount();
    entitlement.data = { active: false };
    membership.data = [{ tenantId: 'T', role: 'tenant_admin' }];
    renderGate();
    expect(screen.getByTestId('page')).toBeInTheDocument();
  });

  it('a signed-out visitor goes to the login', () => {
    auth.session = null;
    renderGate();
    expect(screen.getByTestId('login')).toBeInTheDocument();
  });

  describe('while the handshake is pending', () => {
    beforeEach(() => {
      surface.value = 'pending';
    });

    it.each(['block', 'preview'] as const)('mode %s: no redirect, no locked page, no neutral verdict yet', (mode) => {
      renderGate({ mode });
      expect(screen.getByTestId('shell-settling')).toBeInTheDocument();
      expect(screen.queryByTestId('subscribe')).not.toBeInTheDocument();
      expect(screen.queryByTestId('page')).not.toBeInTheDocument();
      expect(screen.queryByTestId('shell-no-access')).not.toBeInTheDocument();
    });

    it('an entitled account is not held back', () => {
      entitlement.data = { active: true };
      renderGate();
      expect(screen.getByTestId('page')).toBeInTheDocument();
    });
  });
});
