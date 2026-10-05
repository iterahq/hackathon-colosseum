import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { ShellSurface } from '@/lib/shellSurface';
import { ShellAccessGate } from './ShellAccessGate';

const surface = vi.hoisted(() => ({ value: 'web' as ShellSurface }));
const entitlement = vi.hoisted(() => ({ data: { active: false }, isPending: false, isError: false, reads: 0 }));
vi.mock('@/hooks/useShellSurface', () => ({ useShellSurface: () => surface.value }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } }, loading: false, configured: true, signOut: vi.fn() }) }));
vi.mock('@/hooks/useMembership', () => ({ useMembership: () => ({ data: [{ tenantId: 'T', role: 'learner' }], isPending: false }) }));
vi.mock('@/hooks/useEntitlement', () => ({
  useEntitlement: () => {
    entitlement.reads += 1;
    return entitlement;
  },
}));

function renderGate() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <ShellAccessGate>
          <div data-testid="profile">PROFILE</div>
        </ShellAccessGate>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('ShellAccessGate (/profile)', () => {
  beforeEach(() => {
    surface.value = 'web';
    entitlement.data = { active: false };
    entitlement.reads = 0;
  });

  it('in a browser tab renders the route for an account without access and reads no entitlement', () => {
    renderGate();
    expect(screen.getByTestId('profile')).toBeInTheDocument();
    expect(entitlement.reads).toBe(0);
  });

  it('inside the shell an account without access meets the neutral screen', () => {
    surface.value = 'shell';
    renderGate();
    expect(screen.getByTestId('shell-no-access')).toBeInTheDocument();
    expect(screen.queryByTestId('profile')).not.toBeInTheDocument();
  });

  it('inside the shell an entitled account reaches the route', () => {
    surface.value = 'shell';
    entitlement.data = { active: true };
    renderGate();
    expect(screen.getByTestId('profile')).toBeInTheDocument();
  });
});
