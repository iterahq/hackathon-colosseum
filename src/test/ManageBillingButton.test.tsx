import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { ManageBillingButton } from '@/components/profile/ManageBillingButton';

/**
 * O botão que abre o Stripe Customer Portal — o único caminho do aluno pra
 * trocar um cartão vencido. Sem ele a renovação falha, a assinatura vai pra
 * `past_due` e quem estava pagando perde o acesso sem nada que possa fazer.
 */

const portalState = {
  mutate: vi.fn(),
  isPending: false,
  isError: false,
};
vi.mock('@/hooks/useBillingPortal', () => ({ useBillingPortal: () => portalState }));

function renderButton() {
  return render(
    <I18nProvider>
      <ManageBillingButton />
    </I18nProvider>
  );
}

describe('ManageBillingButton', () => {
  beforeEach(() => {
    portalState.mutate = vi.fn();
    portalState.isPending = false;
    portalState.isError = false;
  });

  it('pede a sessão do portal ao clicar', () => {
    renderButton();
    fireEvent.click(screen.getByTestId('subscription-manage-billing'));
    expect(portalState.mutate).toHaveBeenCalledTimes(1);
  });

  it('não deixa disparar duas sessões enquanto a primeira está em voo', () => {
    portalState.isPending = true;
    renderButton();
    expect(screen.getByTestId<HTMLButtonElement>('subscription-manage-billing').disabled).toBe(
      true
    );
  });

  it('falha aparece na tela em vez de sumir', () => {
    portalState.isError = true;
    renderButton();
    expect(screen.getByTestId('subscription-manage-error')).toBeTruthy();
  });
});
