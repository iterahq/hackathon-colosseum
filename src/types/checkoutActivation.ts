/**
 * O estado da espera entre o Checkout voltar e o acesso ser liberado.
 * Preenchido por `useCheckoutActivation`; lido pela superfície de retorno.
 *
 * `waiting` e `timedOut` são distintos de propósito: o primeiro afirma que o
 * acesso está a caminho, o segundo admite que não sabemos — e a cobrança já
 * aconteceu nos dois.
 */
export interface CheckoutActivation {
  /** A cobrança passou e o entitlement ainda não chegou. */
  waiting: boolean;
  /** O gate já deixa passar. */
  active: boolean;
  /** Passou do limite de espera e seguimos sem resposta. */
  timedOut: boolean;
}
