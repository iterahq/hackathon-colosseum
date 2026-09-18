import { ShieldCheck, Undo2 } from 'lucide-react';
import { useI18n } from '@/i18n';

/** Reassurance next to the price: cancellable, and Stripe (not Itera) holds the card. */
export function SubscribeTrustLine() {
  const { t } = useI18n();

  return (
    <p
      className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
      data-testid="subscribe-trust-line"
    >
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <Undo2 className="h-3.5 w-3.5" aria-hidden /> {t('subscribe.trust.cancelAnytime')}
      </span>
      <span aria-hidden>·</span>
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> {t('subscribe.trust.securePayment')}
      </span>
    </p>
  );
}
