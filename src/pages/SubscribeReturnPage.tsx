/**
 * Post-checkout landing — where Stripe returns the learner after the hosted
 * Checkout (SANDBOX). Reads `?status=success|cancel` (set in the success/cancel
 * URLs we pass to itera-api in billing.service) and routes the learner back
 * into the player.
 *
 * We intentionally do NOT confirm the subscription from here — billing TRUTH is
 * fed by Stripe webhooks into itera-api's `billing.*` tables (ADR-3). This page
 * is a friendly bounce, not the source of subscription state.
 */
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';
import { AppHeader } from '@/components/branded';
import { useI18n } from '@/i18n';

export default function SubscribeReturnPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const success = useMemo(() => params.get('status') !== 'cancel', [params]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader active="discover" />

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center"
          data-testid="subscribe-return-card"
        >
          {success ? (
            <CheckCircle2 className="w-12 h-12 text-evergreen mx-auto" data-testid="return-success" />
          ) : (
            <XCircle className="w-12 h-12 text-muted-foreground mx-auto" data-testid="return-cancel" />
          )}

          <h1 className="font-display font-bold text-2xl text-foreground mt-4">
            {success ? t('subscribe.return.successTitle') : t('subscribe.return.cancelTitle')}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {success ? t('subscribe.return.successBody') : t('subscribe.return.cancelBody')}
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              data-testid="return-home-button"
              className="w-full h-11 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors"
            >
              {t('subscribe.return.backHome')}
            </button>
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
