/**
 * Self-serve subscribe surface (PLG) — the learner-facing "Assinar / Subscribe"
 * flow. Previously subscribe was ABM/API-key/admin-only; this is the first
 * self-serve entry point in the player.
 *
 * Flow:
 *   1. Learner clicks "Subscribe now".
 *   2. We call the EXISTING itera-api endpoint `POST /billing/checkout`
 *      (reused via billing.service — we do NOT reinvent billing) which creates
 *      a Stripe Checkout Session in the SANDBOX (TEST mode) server-side.
 *   3. We redirect the browser to the returned hosted Checkout URL.
 *   4. Stripe returns the learner to `/subscribe/return` (success or cancel),
 *      which routes them back into the player.
 *
 * No Stripe key ever touches the frontend — the session is created server-side.
 */
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Loader2, CreditCard } from 'lucide-react';
import { AppHeader } from '@/components/branded';
import { useI18n } from '@/i18n';
import {
  AlreadySubscribedError,
  createCheckout,
  formatPrice,
} from '@/services/billing.service';
import { useSeatPricing } from '@/hooks/useSeatPricing';
import { useEntitlement } from '@/hooks/useEntitlement';
import { PlanSummary } from '@/components/subscribe/PlanSummary';

export default function SubscribePage() {
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: pricing, isPending: pricingLoading } = useSeatPricing(locale);
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);
  const { data: entitlement } = useEntitlement();

  async function handleSubscribe() {
    setError(null);
    setLoading(true);
    try {
      // The active language picks the price, so Checkout charges what was quoted.
      const { checkoutUrl } = await createCheckout({ seats: 1, locale });
      // Full-page navigation to the hosted Stripe Checkout (SANDBOX).
      window.location.assign(checkoutUrl);
    } catch (err) {
      setAlreadySubscribed(err instanceof AlreadySubscribedError);
      setError(t(err instanceof AlreadySubscribedError ? 'subscribe.alreadySubscribed' : 'subscribe.error'));
      setLoading(false);
    }
  }

  // Anyone the paywall already lets through — paid, exempt tenant, pre-paywall
  // account — has nothing to buy here. /signup with an existing email lands on
  // this page too, so without this a paying learner is one click from a
  // second subscription.
  if (entitlement?.active) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader active="discover" />

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center"
          data-testid="subscribe-card"
        >
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[11px] uppercase tracking-wider bg-evergreen-soft text-evergreen-hi border border-evergreen/30">
            <Sparkles className="w-3 h-3" /> Itera
          </span>

          <h1 className="font-display font-bold text-2xl text-foreground mt-4">
            {t('subscribe.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">{t('subscribe.subtitle')}</p>

          {/* Language-aware price (pt → BRL R$100/mo, en → USD $20/mo). */}
          <div className="mt-5" data-testid="subscribe-price">
            {pricingLoading ? (
              <span className="text-sm text-muted-foreground">{t('subscribe.priceLoading')}</span>
            ) : pricing ? (
              <span className="inline-flex items-baseline gap-1">
                <span
                  className="font-display font-bold text-3xl text-foreground"
                  data-testid="subscribe-price-amount"
                >
                  {formatPrice(pricing, locale)}
                </span>
                <span className="text-sm text-muted-foreground">
                  /{locale === 'en' ? 'mo' : 'mês'}
                </span>
              </span>
            ) : null}
          </div>

          {/* O que vem junto e em que termos — antes do botão, porque é o que
              torna o preço interpretável. */}
          <PlanSummary />

          <button
            type="button"
            onClick={handleSubscribe}
            disabled={loading}
            data-testid="subscribe-button"
            className="mt-6 w-full h-12 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('subscribe.loading')}
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                {t('subscribe.button')}
              </>
            )}
          </button>

          {error && (
            <p className="text-sm text-destructive mt-4" data-testid="subscribe-error" role="alert">
              {error}{' '}
              {alreadySubscribed && (
                <Link to="/profile" className="underline" data-testid="subscribe-go-profile">
                  {t('subscribe.goToProfile')}
                </Link>
              )}
            </p>
          )}

          {/* Só quando o servidor AFIRMA test. Se o modo não chegou, calamos:
              prometer "nenhuma cobrança real" sobre uma cobrança real é o erro
              mais caro possível aqui. */}
          {pricing?.mode === 'test' && (
            <p className="text-xs text-muted-foreground mt-6" data-testid="subscribe-sandbox-notice">
              {t('subscribe.sandbox')}
            </p>
          )}
        </motion.div>
      </main>
    </div>
  );
}
