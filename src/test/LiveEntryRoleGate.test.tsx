/**
 * LiveEntryRoleGate — a bifurcação de entrada do admin na aula ao vivo.
 *
 * Um tenant_admin/owner é staff E aluno: o link `/live/:sessionId` sozinho não
 * diz qual dos dois ele quer ser. Quem não é admin não pode nem ver a pergunta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import type { Membership } from '@/services/membership.service';
import { LiveEntryRoleGate } from '@/components/live/LiveEntryRoleGate';
import { clearLiveEntryRole, readLiveEntryRole } from '@/utils/liveEntryRole';

const useMembership = vi.fn();
vi.mock('@/hooks/useMembership', () => ({
  useMembership: () => useMembership(),
}));

const SESSION = 'session-123';
const ADMIN: Membership[] = [{ tenantId: 'dfl', role: 'tenant_admin', tenantSlug: 'dfl-batch' }];
const LEARNER: Membership[] = [{ tenantId: 'dfl', role: 'learner', tenantSlug: 'dfl-batch' }];

function renderGate(memberships: Membership[], state?: { isPending: boolean; fetchStatus: string }) {
  useMembership.mockReturnValue({
    data: state?.isPending ? undefined : memberships,
    isPending: state?.isPending ?? false,
    fetchStatus: state?.fetchStatus ?? 'idle',
  });
  return render(
    <MemoryRouter initialEntries={[`/live/${SESSION}`]}>
      <I18nProvider>
        <Routes>
          <Route
            path="/live/:sessionId"
            element={
              <LiveEntryRoleGate>
                <div data-testid="student-surface">ALUNO</div>
              </LiveEntryRoleGate>
            }
          />
          <Route
            path="/live/instructor/:sessionId"
            element={<div data-testid="instructor-surface">PROFESSOR</div>}
          />
        </Routes>
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useMembership.mockReset();
  clearLiveEntryRole();
});

describe('LiveEntryRoleGate', () => {
  it('não pergunta nada a quem não é admin — entra direto como aluno', () => {
    renderGate(LEARNER);
    expect(screen.getByTestId('student-surface')).toBeInTheDocument();
    expect(screen.queryByTestId('live-entry-role-modal')).not.toBeInTheDocument();
  });

  it('pergunta ao admin antes de montar a sessão do aluno', () => {
    renderGate(ADMIN);
    expect(screen.getByTestId('live-entry-role-modal')).toBeInTheDocument();
    // A presença/ranking da sala não pode receber o admin antes da escolha.
    expect(screen.queryByTestId('student-surface')).not.toBeInTheDocument();
  });

  it('"entrar como aluno" leva à superfície do aluno', async () => {
    renderGate(ADMIN);
    await userEvent.click(screen.getByTestId('live-entry-as-learner'));
    expect(screen.getByTestId('student-surface')).toBeInTheDocument();
    expect(screen.queryByTestId('live-entry-role-modal')).not.toBeInTheDocument();
    expect(readLiveEntryRole(SESSION)).toBe('learner');
  });

  it('"entrar como professor" leva à superfície do instrutor da MESMA sessão', async () => {
    renderGate(ADMIN);
    await userEvent.click(screen.getByTestId('live-entry-as-instructor'));
    expect(screen.getByTestId('instructor-surface')).toBeInTheDocument();
    expect(readLiveEntryRole(SESSION)).toBe('instructor');
  });

  it('não repergunta numa remontagem da mesma sessão', async () => {
    const first = renderGate(ADMIN);
    await userEvent.click(screen.getByTestId('live-entry-as-learner'));
    first.unmount();
    renderGate(ADMIN);
    expect(screen.getByTestId('student-surface')).toBeInTheDocument();
    expect(screen.queryByTestId('live-entry-role-modal')).not.toBeInTheDocument();
  });

  it('segura a aula enquanto o papel ainda está sendo lido', () => {
    renderGate(ADMIN, { isPending: true, fetchStatus: 'fetching' });
    expect(screen.queryByTestId('student-surface')).not.toBeInTheDocument();
    expect(screen.queryByTestId('live-entry-role-modal')).not.toBeInTheDocument();
  });

  it('não trava a aula quando a query de membership está desabilitada', () => {
    renderGate(LEARNER, { isPending: true, fetchStatus: 'idle' });
    expect(screen.getByTestId('student-surface')).toBeInTheDocument();
  });
});
