/**
 * O que a assinatura inclui, e em que termos.
 *
 * A tela de assinar mostrava só título, preço e botão. Quem chega de campanha
 * decide ali, e sem dizer o que vem junto nem que a cobrança é mensal e
 * cancelável, a única informação concreta da página é o valor — o pior recorte
 * possível pra pedir cartão.
 *
 * A lista vive em `@/consts/planIncludes` — e só com o que já existe.
 */
import { Check } from 'lucide-react';
import { useI18n } from '@/i18n';
import { PLAN_INCLUDES } from '@/consts/planIncludes';

export function PlanSummary() {
  const { t } = useI18n();

  return (
    <div className="mt-6 text-left" data-testid="subscribe-plan-summary">
      <ul className="flex flex-col gap-2.5">
        {PLAN_INCLUDES.map((key) => (
          <li key={key} className="flex items-start gap-2.5 text-sm text-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-evergreen" aria-hidden />
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-xs leading-relaxed text-muted-foreground" data-testid="subscribe-terms">
        {t('subscribe.terms')}
      </p>
    </div>
  );
}
