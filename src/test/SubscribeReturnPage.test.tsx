import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import SubscribeReturnPage from '@/pages/SubscribeReturnPage';
import { pageName } from '@/lib/pageTitle';

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

const getCatalogPrograms = vi.fn();
const enrollInProgram = vi.fn();
vi.mock('@/services/catalog.service', () => ({
  getCatalogPrograms: () => getCatalogPrograms(),
  enrollInProgram: (id: string) => enrollInProgram(id),
}));

const appDownload = vi.hoisted(() => ({ on: false }));
vi.mock('@/config/appDownload', () => ({
  get SHOW_APP_DOWNLOAD_LINE() {
    return appDownload.on;
  },
}));

const program = (id: string, slug: string, alreadyEnrolled = false) => ({ id, slug, alreadyEnrolled });

function renderReturn(status: 'success' | 'cancel') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/subscribe/return?status=${status}`]}>
        <I18nProvider>
          <Routes>
            <Route path="/subscribe/return" element={<SubscribeReturnPage />} />
            <Route path="/program/:slug" element={<div data-testid="track-page" />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SubscribeReturnPage', () => {
  beforeEach(() => {
    useEntitlement.mockReset();
    getCatalogPrograms.mockReset().mockResolvedValue([]);
    enrollInProgram.mockReset().mockResolvedValue({ enrolled: true });
    appDownload.on = false;
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

  it('names the page after what happened to the payment', () => {
    useEntitlement.mockReturnValue({ data: { active: true } });
    const { unmount } = renderReturn('success');
    expect(pageName.get()).toBe('Assinatura concluída');
    unmount();
    renderReturn('cancel');
    expect(pageName.get()).toBe('Pagamento cancelado');
  });

  it('cancelamento não espera nada — oferece voltar e tentar de novo', () => {
    useEntitlement.mockReturnValue({ data: { active: false } });

    renderReturn('cancel');

    expect(screen.getByTestId('return-cancel')).toBeTruthy();
    expect(screen.getByTestId('return-retry-button')).toBeTruthy();
    expect(screen.getByTestId('return-home-button')).toBeTruthy();
    expect(useEntitlement).toHaveBeenCalledWith({ pollWhileInactive: false });
  });

  describe('landing after payment', () => {
    beforeEach(() => useEntitlement.mockReturnValue({ data: { active: true } }));

    it('one program on offer: enrolls and opens its track', async () => {
      getCatalogPrograms.mockResolvedValue([program('p1', 'modele-dados')]);
      renderReturn('success');
      await waitFor(() => expect(screen.getByTestId('track-page')).toBeTruthy());
      expect(enrollInProgram).toHaveBeenCalledWith('p1');
    });

    it('enroll fails: stays put with the way home', async () => {
      getCatalogPrograms.mockResolvedValue([program('p1', 'modele-dados')]);
      enrollInProgram.mockRejectedValue(new Error('boom'));
      renderReturn('success');
      await waitFor(() => expect(enrollInProgram).toHaveBeenCalled());
      expect(screen.queryByTestId('track-page')).toBeNull();
      expect(screen.getByTestId('return-home-button')).toBeTruthy();
    });

    it('two programs on offer: no enroll, way home', async () => {
      getCatalogPrograms.mockResolvedValue([program('p1', 'a'), program('p2', 'b')]);
      renderReturn('success');
      await waitFor(() => expect(getCatalogPrograms).toHaveBeenCalled());
      await Promise.resolve();
      expect(enrollInProgram).not.toHaveBeenCalled();
      expect(screen.queryByTestId('track-page')).toBeNull();
      expect(screen.getByTestId('return-home-button')).toBeTruthy();
    });

    it('already enrolled in one program: opens its track without enrolling', async () => {
      getCatalogPrograms.mockResolvedValue([program('p1', 'a', true), program('p2', 'b')]);
      renderReturn('success');
      await waitFor(() => expect(screen.getByTestId('track-page')).toBeTruthy());
      expect(enrollInProgram).not.toHaveBeenCalled();
    });

    it('does not read the catalog before access is active, nor on cancel', () => {
      useEntitlement.mockReturnValue({ data: { active: false } });
      renderReturn('success');
      renderReturn('cancel');
      expect(getCatalogPrograms).not.toHaveBeenCalled();
    });

    it('app line is hidden while the flag is off and shown when on', () => {
      renderReturn('success');
      expect(screen.queryByTestId('return-app-line')).toBeNull();
      appDownload.on = true;
      renderReturn('success');
      expect(screen.getByTestId('return-app-line').textContent).toMatch(/app/i);
    });
  });
});
