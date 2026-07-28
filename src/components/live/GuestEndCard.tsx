import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useI18n } from '@/i18n';

/**
 * Where a guest's live experience ENDS (ADR-3 + ADR-7).
 *
 * The authenticated surface exits to `/`, which is `RequireAuth` +
 * `RequireSubscription` — for a guest that is a login wall, i.e. the demo would
 * finish on a rejection screen. Guests land here instead: a thank-you plus the
 * ONE conversion affordance v1 ships, a link to `/signup`.
 *
 * v1 deliberately does NOT migrate the guest's work into the new account
 * (ADR-7); the guest row is kept server-side so that promotion stays possible
 * later, but nothing here promises it.
 */
export function GuestEndCard({ onBack }: { onBack?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-3xl border border-border bg-card p-8 md:p-10 text-center"
        data-testid="guest-end-card"
      >
        <div className="w-14 h-14 mx-auto rounded-2xl bg-clay/15 border border-clay/40 flex items-center justify-center text-clay">
          <Sparkles className="w-7 h-7" />
        </div>
        <h1 className="font-display text-2xl text-foreground mt-5">{t('live.guest.end.title')}</h1>
        <p className="text-sm text-muted-foreground mt-2">{t('live.guest.end.subtitle')}</p>

        <Link
          to="/signup"
          data-testid="guest-end-signup"
          className="mt-8 w-full h-12 px-6 inline-flex items-center justify-center rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors"
        >
          {t('live.guest.end.cta')}
        </Link>

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            data-testid="guest-end-back"
            className="mt-3 w-full h-11 rounded-full border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('live.guest.end.back')}
          </button>
        )}
      </motion.div>
    </div>
  );
}
