/**
 * Mutation do botão "gerenciar pagamento": pede a sessão do Stripe Customer
 * Portal e navega o browser pra ela. componente → hook → service.
 *
 * Navegação de página inteira, como o checkout: a URL do portal é de uso único
 * e de vida curta, então abrir em aba nova (onde o clique pode chegar minutos
 * depois, ou nunca) só produziria sessão expirada.
 */
import { useMutation } from '@tanstack/react-query';
import { createBillingPortalSession } from '@/services/billing.service';
import { useI18n } from '@/i18n';

export function useBillingPortal() {
  const { locale } = useI18n();
  return useMutation({
    mutationFn: () => createBillingPortalSession(locale),
    onSuccess: (url) => window.location.assign(url),
  });
}
