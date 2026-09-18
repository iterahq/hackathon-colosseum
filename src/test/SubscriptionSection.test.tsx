import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const cancelState = {
  mutate: vi.fn(),
  isPending: false,
  isError: false,
};

vi.mock('@/hooks/useEntitlement', () => ({ useEntitlement: () => state }));
vi.mock('@/hooks/useCancelSubscription', () => ({
  useCancelSubscription: () => cancelState,
}));
// O botão do portal tem teste próprio; aqui só não queremos o React Query real.
vi.mock('@/hooks/useBillingPortal', () => ({
  useBillingPortal: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

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
  cancelState.mutate = vi.fn();
  cancelState.isPending = false;
  cancelState.isError = false;
});

const activeSubscription: Entitlement = {
  active: true,
  status: 'active',
  currentPeriodEnd: '2026-09-15T00:00:00.000Z',
  seatCount: 1,
  cancelAtPeriodEnd: false,
};

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

  it('cancelar só acontece depois da confirmação', async () => {
    state.data = { ...activeSubscription };
    renderSection();

    expect(screen.queryByTestId('subscription-resume')).toBeNull();
    await userEvent.click(screen.getByTestId('subscription-cancel'));

    // Abrir o diálogo não é cancelar — o pedido só sai no confirm.
    expect(cancelState.mutate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('cancel-subscription-confirm'));
    expect(cancelState.mutate).toHaveBeenCalledWith(true);
  });

  it('desistir no diálogo não manda nada', async () => {
    state.data = { ...activeSubscription };
    renderSection();

    await userEvent.click(screen.getByTestId('subscription-cancel'));
    await userEvent.click(screen.getByTestId('cancel-subscription-keep'));
    expect(cancelState.mutate).not.toHaveBeenCalled();
  });

  it('a confirmação diz até quando o acesso pago vale', async () => {
    state.data = { ...activeSubscription };
    renderSection();

    await userEvent.click(screen.getByTestId('subscription-cancel'));
    const expected = resources.pt['subscription.cancel.bodyUntil'].replace(
      '{date}',
      formatBillingDate('2026-09-15T00:00:00.000Z', 'pt')
    );
    expect(screen.getByTestId('cancel-subscription-dialog').textContent).toContain(expected);
  });

  it('já agendada para cancelar oferece reativar, e reativar não pede confirmação', async () => {
    state.data = { ...activeSubscription, cancelAtPeriodEnd: true };
    renderSection();

    expect(screen.queryByTestId('subscription-cancel')).toBeNull();
    await userEvent.click(screen.getByTestId('subscription-resume'));
    expect(cancelState.mutate).toHaveBeenCalledWith(false);
  });

  it('turma isenta não tem o que cancelar', () => {
    state.data = {
      active: true,
      status: 'exempt',
      currentPeriodEnd: null,
      seatCount: null,
      cancelAtPeriodEnd: false,
    };
    renderSection();
    expect(screen.queryByTestId('subscription-cancel')).toBeNull();
    expect(screen.queryByTestId('subscription-resume')).toBeNull();
  });

  it('sem assinatura oferece assinar, nunca cancelar', () => {
    renderSection();
    expect(screen.getByTestId('subscription-cta')).toBeTruthy();
    expect(screen.queryByTestId('subscription-cancel')).toBeNull();
    expect(screen.queryByTestId('subscription-resume')).toBeNull();
  });

  it('falha na troca aparece na tela em vez de sumir', () => {
    state.data = { ...activeSubscription };
    cancelState.isError = true;
    renderSection();
    expect(screen.getByTestId('subscription-cancel-error').textContent).toBe(
      resources.pt['subscription.cancel.error']
    );
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
      'subscription.cancel.action',
      'subscription.cancel.title',
      'subscription.cancel.body',
      'subscription.cancel.bodyUntil',
      'subscription.cancel.keep',
      'subscription.cancel.confirm',
      'subscription.cancel.error',
      'subscription.resume.action',
    ] as const;
    for (const locale of ['pt', 'en'] as const) {
      for (const key of keys) expect(resources[locale][key]).toBeTruthy();
    }
  });
});
