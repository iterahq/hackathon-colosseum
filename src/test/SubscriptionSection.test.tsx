import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider, resources } from '@/i18n';
import type { Entitlement } from '@/types/entitlement';
import { formatBillingDate } from '@/utils/formatBillingDate';
import { SubscriptionSection } from '@/components/profile/SubscriptionSection';

const state = {
  data: null as Entitlement | null,
  isPending: false,
  isError: false,
  refetch: vi.fn(),
};

vi.mock('@/hooks/useEntitlement', () => ({ useEntitlement: () => state }));

function renderSection() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <SubscriptionSection />
      </I18nProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  state.data = {
    active: false,
    status: null,
    currentPeriodEnd: null,
    seatCount: null,
    cancelAtPeriodEnd: false,
  };
  state.isPending = false;
  state.isError = false;
});

describe('SubscriptionSection', () => {
  it('sem assinatura, oferece o caminho de assinar', () => {
    renderSection();
    expect(screen.getByTestId('subscription-status').dataset.active).toBe('false');
    expect(screen.getByTestId('subscription-cta').getAttribute('href')).toBe('/subscribe');
  });

  it('assinatura ativa mostra a data de renovação e as vagas, sem CTA', () => {
    state.data = {
      active: true,
      status: 'active',
      currentPeriodEnd: '2026-09-15T00:00:00.000Z',
      seatCount: 3,
      cancelAtPeriodEnd: false,
    };
    renderSection();
    expect(screen.getByTestId('subscription-detail').textContent).toMatch(/2026/);
    expect(screen.getByTestId('subscription-seats').textContent).toMatch(/3/);
    expect(screen.queryByTestId('subscription-cta')).toBeNull();
  });

  it('cancelada no fim do ciclo diz até quando o acesso vale', () => {
    // Ainda ativa: dizer "renova em" aqui faria o aluno contar com um acesso que
    // acaba — é a única diferença que ele precisa ver antes da data chegar.
    state.data = {
      active: true,
      status: 'active',
      currentPeriodEnd: '2026-09-15T00:00:00.000Z',
      seatCount: 1,
      cancelAtPeriodEnd: true,
    };
    renderSection();
    const expected = resources.pt['subscription.endsOn'].replace(
      '{date}',
      formatBillingDate('2026-09-15T00:00:00.000Z', 'pt')
    );
    expect(screen.getByTestId('subscription-detail').textContent).toBe(expected);
  });

  it('turma isenta não é lida como "sem assinatura"', () => {
    state.data = {
      active: true,
      status: 'exempt',
      currentPeriodEnd: null,
      seatCount: null,
      cancelAtPeriodEnd: false,
    };
    renderSection();
    expect(screen.getByTestId('subscription-status').textContent).toContain(
      resources.pt['subscription.status.exempt']
    );
    expect(screen.getByTestId('subscription-detail').textContent).toContain(
      resources.pt['subscription.exemptHint']
    );
    expect(screen.queryByTestId('subscription-seats')).toBeNull();
  });

  it('leitura que falhou oferece tentar de novo, e não paywall', () => {
    state.isError = true;
    renderSection();
    expect(screen.getByTestId('subscription-error')).toBeTruthy();
    expect(screen.queryByTestId('subscription-status')).toBeNull();
  });

  it('as chaves existem nos dois idiomas', () => {
    const keys = [
      'subscription.section',
      'subscription.status.active',
      'subscription.status.inactive',
      'subscription.status.exempt',
      'subscription.activeHint',
      'subscription.inactiveHint',
      'subscription.exemptHint',
      'subscription.renewsOn',
      'subscription.endsOn',
      'subscription.seats',
      'subscription.loadError',
    ] as const;
    for (const locale of ['pt', 'en'] as const) {
      for (const key of keys) expect(resources[locale][key]).toBeTruthy();
    }
  });
});
