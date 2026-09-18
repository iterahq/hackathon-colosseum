/**
 * Porta de entrada do Stripe Customer Portal no perfil.
 *
 * Existe porque cancelar era a ÚNICA coisa que o assinante conseguia fazer
 * sozinho. Um cartão que vence não tinha conserto pelo app: a renovação falha,
 * a assinatura vai pra `past_due`, e `itera.my_subscription` só entitula
 * `active`/`trialing` — ou seja, quem estava pagando perde o acesso e depende
 * de alguém com o dashboard da Stripe aberto pra voltar.
 */
import { CreditCard, Loader2, ExternalLink } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useBillingPortal } from '@/hooks/useBillingPortal';

export function ManageBillingButton() {
  const { t } = useI18n();
  const portal = useBillingPortal();

  return (
    <>
      <button
        type="button"
        data-testid="subscription-manage-billing"
        disabled={portal.isPending}
        onClick={() => portal.mutate()}
        className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border px-6 font-medium text-foreground transition-colors hover:border-evergreen/60 disabled:opacity-60"
      >
        {portal.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CreditCard className="h-4 w-4" />
        )}
        {t('subscription.manage.action')}
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {portal.isError && (
        <p className="mt-3 text-sm text-destructive" data-testid="subscription-manage-error">
          {t('subscription.manage.error')}
        </p>
      )}
    </>
  );
}
