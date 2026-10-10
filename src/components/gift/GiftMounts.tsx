import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { BTN_PRIMARY, CARD, FOCUS } from '@/components/shop/shopStyles';
import { LearnerMascot } from '@/components/avatar/LearnerMascot';
import { isGuestRoutePath } from '@/guest/guestRoute';
import { useCompanion } from '@/hooks/useCompanion';
import { useGiftInbox, useMarkGiftsSeen } from '@/hooks/useGift';
import { useI18n } from '@/i18n';
import { queryKeys } from '@/lib/queryKeys';
import { claimReferral } from '@/services/gift.service';
import { isGuestAccessToken } from '@/services/guestSession.service';
import { captureRef, clearRef, giftLabel, pendingRef } from '@/utils/gift';

/** Routes where a celebration must not cover the work in progress. */
const QUIET = /^\/(lesson|live|login|signup|auth|author|admin)(\/|$)/;

/** Keeps `?ref=` from the landing URL through sign-in, then claims it once for the account that signed in. */
function ReferralClaim() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  // Read during the first render: a redirect to /login drops the query string right after.
  useState(() => captureRef(window.location.search, window.localStorage));
  const userId = session?.user?.id ?? null;
  const guest = isGuestAccessToken(session?.access_token);
  const claimed = useRef<string | null>(null);

  useEffect(() => {
    const code = pendingRef(window.localStorage);
    if (!userId || guest || !code || claimed.current === userId) return;
    claimed.current = userId;
    void claimReferral(code)
      .then(() => {
        clearRef(window.localStorage);
        void queryClient.invalidateQueries({ queryKey: queryKeys.referral.mine(userId) });
      })
      .catch(() => {
        // The network failed: the code stays stored and the next load tries again.
        claimed.current = null;
      });
  }, [userId, guest, queryClient]);
  return null;
}

/** "{who} gave you a life!": shown once, the next time the app loads after a gift landed. */
function GiftMoment() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const quiet = QUIET.test(pathname);
  const inbox = useGiftInbox({ enabled: !quiet });
  const seen = useMarkGiftsSeen();
  const companion = useCompanion({ enabled: !quiet });
  const gifts = inbox.data ?? [];
  if (quiet || gifts.length === 0) return null;

  const [first] = gifts;
  const proof = first.mirrorExplorerUrl ?? first.paymentExplorerUrl;
  const close = () => seen.mutate(gifts.map((gift) => gift.id));
  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-[#0A0908]/85 p-4 backdrop-blur-sm" data-testid="gift-moment">
      <div role="dialog" aria-modal="true" aria-labelledby="gift-moment-title" className={`${CARD} flex w-full max-w-[400px] flex-col items-center gap-4 border-[#3FD17F] px-6 pb-6 pt-8 text-center`}>
        <span className="flex h-[150px] items-end justify-center">
          <LearnerMascot mood="happy" outfit={companion.outfit} />
        </span>
        <h2 id="gift-moment-title" className="[font:700_30px/1.05_'Barlow_Condensed'] text-[#F4EDE2]" data-testid="gift-moment-title">
          {gifts.length === 1 ? t('gift.received.title', { name: giftLabel(first.fromName, first.fromWallet) }) : t('gift.received.many', { n: gifts.length })}
        </h2>
        <p className="[font:400_15px/1.5_Inter] text-[#C9BFB0]">{t('gift.received.body')}</p>
        {proof && (
          <a href={proof} target="_blank" rel="noreferrer" className={`rounded [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline ${FOCUS}`} data-testid="gift-moment-proof">
            {t('gift.received.proof')} ↗
          </a>
        )}
        <button type="button" autoFocus onClick={close} className={`${BTN_PRIMARY} mt-1 w-full`} data-testid="gift-moment-done">
          {t('gift.received.done')}
        </button>
      </div>
    </div>
  );
}

/** App-wide: the invite code kept through sign-in and the recipient's gift moment. Never on the guest route. */
export function GiftMounts() {
  const { pathname } = useLocation();
  if (isGuestRoutePath(pathname)) return null;
  return (
    <>
      <ReferralClaim />
      <GiftMoment />
    </>
  );
}
