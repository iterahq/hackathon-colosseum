/**
 * Post-checkout landing — where Stripe returns the learner after the hosted
 * Checkout. Reads `?status=success|cancel` (set in the success/cancel URLs we
 * pass to itera-api in billing.service) and routes the learner back into the
 * player.
 *
 * Billing TRUTH is still fed by Stripe webhooks into itera-api's `billing.*`
 * tables (ADR-3) — this page confirms nothing on its own. What it DOES do is
 * wait for that truth to arrive (`useCheckoutActivation`): the webhook lands
 * seconds after the browser comes back, and `itera.my_subscription` says "no
 * subscription" until it does. Sending the learner straight to `/` in that
 * window meant `RequireSubscription` bounced the person who had just paid back
 * to the price tag — the worst possible moment in the funnel to look broken.
 */
import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { AppHeader } from '@/components/branded';
import { useI18n } from '@/i18n';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useCheckoutActivation } from '@/hooks/useCheckoutActivation';
import { useCheckoutLanding } from '@/hooks/useCheckoutLanding';
import { SHOW_APP_DOWNLOAD_LINE } from '@/config/appDownload';

export default function SubscribeReturnPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const success = useMemo(() => params.get('status') !== 'cancel', [params]);
  const { waiting, active, timedOut } = useCheckoutActivation(success);
  const landing = useCheckoutLanding(success && active);

  // The paid learner goes straight to the track of the program on sale; with
  // no single program to open, the home button below stays the way in.
  useEffect(() => {
    if (landing.path) navigate(landing.path, { replace: true });
  }, [landing.path, navigate]);

  const icon = !success ? (
    <XCircle className="w-12 h-12 text-muted-foreground mx-auto" data-testid="return-cancel" />
  ) : waiting ? (
    <Loader2
      className="w-12 h-12 text-evergreen mx-auto animate-spin"
      data-testid="return-waiting"
    />
  ) : active ? (
    <CheckCircle2 className="w-12 h-12 text-evergreen mx-auto" data-testid="return-success" />
  ) : (
    <Clock className="w-12 h-12 text-muted-foreground mx-auto" data-testid="return-timeout" />
  );

  const state = !success ? 'cancel' : waiting ? 'waiting' : active ? 'success' : 'slow';
  const copy = {
    cancel: { title: 'cancelTitle', body: 'cancelBody' },
    waiting: { title: 'waitingTitle', body: 'waitingBody' },
    success: { title: 'successTitle', body: 'successBody' },
    slow: { title: 'slowTitle', body: 'slowBody' },
  }[state];

  usePageTitle(t(`subscribe.return.${copy.title}`));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader active="discover" />

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center"
          data-testid="subscribe-return-card"
          data-activation={state}
        >
          {icon}

          <h1 className="font-display font-bold text-2xl text-foreground mt-4">
            {t(`subscribe.return.${copy.title}`)}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {t(`subscribe.return.${copy.body}`)}
          </p>
          {success && active && SHOW_APP_DOWNLOAD_LINE && (
            <p className="text-sm text-foreground mt-3" data-testid="return-app-line">
              {t('subscribe.return.appLine')}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3">
            {/* O caminho pra dentro só aparece quando o gate já deixa passar —
                oferecê-lo antes é oferecer o próprio paywall de volta. */}
            {(!success || active) && (
              <button
                type="button"
                onClick={() => navigate('/')}
                data-testid="return-home-button"
                className="w-full h-11 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors"
              >
                {t('subscribe.return.backHome')}
              </button>
            )}
            {timedOut && !active && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                data-testid="return-recheck-button"
                className="w-full h-11 rounded-full border border-border text-foreground font-medium hover:bg-muted transition-colors"
              >
                {t('subscribe.return.recheck')}
              </button>
            )}
            {!success && (
              <button
                type="button"
                onClick={() => navigate('/subscribe')}
                data-testid="return-retry-button"
                className="w-full h-11 rounded-full border border-border text-foreground font-medium hover:bg-muted transition-colors"
              >
                {t('subscribe.return.tryAgain')}
              </button>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
