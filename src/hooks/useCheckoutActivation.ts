/**
 * A espera entre pagar e ter acesso.
 *
 * O browser volta do Checkout hospedado ANTES de a Stripe entregar o webhook
 * que escreve `billing.subscriptions`, então `itera.my_subscription` — a mesma
 * view que o `RequireSubscription` lê — ainda responde "sem assinatura" por
 * alguns segundos. Este hook concentra a decisão de esperar, para que a página
 * de retorno só descreva estado, e mantém a fronteira componente → hook →
 * service do repo.
 *
 * Três estados possíveis, e nenhum deles afirma mais do que se sabe:
 *   - `waiting`  — a cobrança passou, o acesso ainda não chegou;
 *   - `active`   — o gate já deixa passar;
 *   - `timedOut` — passou do limite e continuamos sem saber.
 */
import { useEffect, useState } from 'react';
import { useEntitlement } from '@/hooks/useEntitlement';
import type { CheckoutActivation } from '@/types/checkoutActivation';

/**
 * Quanto esperar antes de parar de prometer que o acesso está chegando. A
 * Stripe costuma entregar em poucos segundos; 45s é muito além do normal e
 * ainda curto o bastante pra ninguém ficar preso num spinner.
 */
export const ACTIVATION_TIMEOUT_MS = 45_000;

export function useCheckoutActivation(expectActivation: boolean): CheckoutActivation {
  const [timedOut, setTimedOut] = useState(false);
  const [activated, setActivated] = useState(false);

  const { data: entitlement } = useEntitlement({
    pollWhileInactive: expectActivation && !timedOut && !activated,
  });
  const active = Boolean(entitlement?.active) || activated;

  // Uma vez liberado, fica liberado nesta tela: o poll para junto, e sem isto
  // uma leitura seguinte devolvendo `undefined` faria a tela regredir pra
  // "esperando" com o acesso já concedido.
  useEffect(() => {
    if (entitlement?.active) setActivated(true);
  }, [entitlement?.active]);

  useEffect(() => {
    if (!expectActivation || active) return;
    const id = window.setTimeout(() => setTimedOut(true), ACTIVATION_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [expectActivation, active]);

  return { waiting: expectActivation && !active && !timedOut, active, timedOut };
}
