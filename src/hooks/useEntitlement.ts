/**
 * React Query hook for the current user's Itera subscription entitlement (PLG
 * gating). componente → hook (useQuery) → service → fetch.
 *
 * Plan: 20260624-itera-plg-subscribe-flow (Phase 3).
 */
import { useQuery } from '@tanstack/react-query';
import { getMyEntitlement } from '@/services/entitlement.service';
import { useAuth } from '@/auth/AuthContext';
import { queryKeys } from '@/lib/queryKeys';

export function useEntitlement({ pollWhileInactive = false } = {}) {
  const { session, configured } = useAuth();
  return useQuery({
    queryKey: queryKeys.entitlement.mine(session?.user?.id ?? 'anon'),
    queryFn: getMyEntitlement,
    enabled: configured && Boolean(session),
    staleTime: 30_000,
    /**
     * `pollWhileInactive` existe por causa do retorno do Checkout. Quem paga
     * volta pro app ANTES de a Stripe entregar o webhook que escreve
     * `billing.subscriptions`, então a view que o paywall lê ainda diz "sem
     * assinatura". Com uma leitura só (e `staleTime` de 30s por cima), o aluno
     * que acabou de pagar é mandado de volta pra tela de preço.
     *
     * Só a superfície de retorno liga isso: repetir a leitura em toda tela
     * paywallada seria uma query a cada 2s pra sempre, pra uma resposta que
     * quase nunca muda.
     */
    refetchInterval: pollWhileInactive
      ? (query) => (query.state.data?.active ? false : 2_000)
      : undefined,
  });
}
