/**
 * O que a assinatura inclui, em chaves de i18n.
 *
 * ⚠️ Só o que JÁ existe no produto. O checkout é single-seat e `seat_count` não
 * tem enforcement nenhum, então assento por volume e plano de time NÃO entram
 * aqui: prometer isso na hora de pedir o cartão é vender o que não entregamos.
 */
export const PLAN_INCLUDES = [
  'subscribe.includes.catalog',
  'subscribe.includes.live',
  'subscribe.includes.aiReview',
  'subscribe.includes.badges',
] as const;
