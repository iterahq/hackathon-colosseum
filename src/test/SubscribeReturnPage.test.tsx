import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import SubscribeReturnPage from '@/pages/SubscribeReturnPage';

/**
 * O retorno do Checkout. O caso que importa é a JANELA entre o browser voltar e
 * o webhook da Stripe chegar: nela a view de entitlement ainda diz "sem
 * assinatura", e oferecer o caminho pra dentro devolve ao paywall quem acabou
 * de pagar.
 */

const useEntitlement = vi.fn();
vi.mock('@/hooks/useEntitlement', () => ({
  useEntitlement: (...args: unknown[]) => useEntitlement(...args),
}));

vi.mock('@/components/branded', () => ({
  AppHeader: () => <div data-testid="app-header" />,
}));

function renderReturn(status: 'success' | 'cancel') {
  return render(
    <MemoryRouter initialEntries={[`/subscribe/return?status=${status}`]}>
      <I18nProvider>
        <SubscribeReturnPage />
      </I18nProvider>
    </MemoryRouter>
  );
}

describe('SubscribeReturnPage', () => {
  beforeEach(() => {
    useEntitlement.mockReset();
    vi.useRealTimers();
  });

  it('enquanto o webhook não chegou, espera — e NÃO oferece a porta de entrada', () => {
    useEntitlement.mockReturnValue({ data: { active: false } });

    renderReturn('success');

    expect(screen.getByTestId('return-waiting')).toBeTruthy();
    expect(screen.getByTestId('subscribe-return-card').dataset.activation).toBe('waiting');
    // O botão levaria a `/`, que é gated: o gate mandaria de volta pro preço.
    expect(screen.queryByTestId('return-home-button')).toBeNull();
  });

  it('pede a releitura enquanto espera, e só enquanto espera', () => {
    useEntitlement.mockReturnValue({ data: { active: false } });
    renderReturn('success');
    expect(useEntitlement).toHaveBeenCalledWith({ pollWhileInactive: true });

    useEntitlement.mockClear();
    useEntitlement.mockReturnValue({ data: { active: true } });
    renderReturn('success');
    // Liberado: nada mais a aprender, o poll para.
    expect(useEntitlement).toHaveBeenLastCalledWith({ pollWhileInactive: false });
  });

  it('quando o entitlement vira ativo, libera o caminho pra dentro', () => {
    useEntitlement.mockReturnValue({ data: { active: true } });

    renderReturn('success');

    expect(screen.getByTestId('return-success')).toBeTruthy();
    expect(screen.getByTestId('return-home-button')).toBeTruthy();
  });

  it('passado o limite sem ativar, para de prometer e assume o "não sei ainda"', async () => {
    vi.useFakeTimers();
    useEntitlement.mockReturnValue({ data: { active: false } });

    renderReturn('success');
    await vi.advanceTimersByTimeAsync(46_000);
    vi.useRealTimers();

    await waitFor(() => expect(screen.getByTestId('return-timeout')).toBeTruthy());
    // A cobrança aconteceu: a tela não pode sugerir que o pagamento falhou.
    expect(screen.getByTestId('return-recheck-button')).toBeTruthy();
    expect(screen.queryByTestId('return-home-button')).toBeNull();
  });

  it('cancelamento não espera nada — oferece voltar e tentar de novo', () => {
    useEntitlement.mockReturnValue({ data: { active: false } });

    renderReturn('cancel');

    expect(screen.getByTestId('return-cancel')).toBeTruthy();
    expect(screen.getByTestId('return-retry-button')).toBeTruthy();
    expect(screen.getByTestId('return-home-button')).toBeTruthy();
    expect(useEntitlement).toHaveBeenCalledWith({ pollWhileInactive: false });
  });
});
