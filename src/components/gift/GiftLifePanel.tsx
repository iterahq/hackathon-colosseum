import { Link } from 'react-router-dom';
import { CopyButton } from '@/components/passport/CopyButton';
import { PurchaseDialog } from '@/components/shop/PurchaseDialog';
import { BTN_PRIMARY, FOCUS } from '@/components/shop/shopStyles';
import { useAuth } from '@/auth/AuthContext';
import { useCompanion } from '@/hooks/useCompanion';
import { useGiftPrice } from '@/hooks/useGift';
import { usePurchase } from '@/hooks/usePurchase';
import { useI18n } from '@/i18n';
import { GIFT_ITEM_KEY } from '@/services/gift.service';
import { giftBlinkUrl } from '@/utils/gift';

interface Props {
  /** The recipient's wallet address. */
  wallet: string;
  className?: string;
}

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const LINK = `rounded [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline ${FOCUS}`;

/** "Gift a life" for one recipient: the paid button for a signed-in wallet, and the shareable blink link for everyone. */
export function GiftLifePanel({ wallet, className = '' }: Props) {
  const { t } = useI18n();
  const { session } = useAuth();
  const companion = useCompanion();
  const price = useGiftPrice();
  const purchase = usePurchase();
  const mine = companion.wallet;
  const own = Boolean(mine) && mine === wallet;
  const blink = giftBlinkUrl(SUPABASE_URL, wallet);
  const label = price.data ? t('gift.button', { price: price.data.priceLabel }) : t('gift.buttonPlain');

  return (
    <div className={`flex flex-col gap-3 ${className}`} data-testid="gift-panel">
      <div className="flex flex-wrap items-center gap-3">
        {!session && (
          <Link to="/login" className={`${BTN_PRIMARY} max-sm:w-full`} data-testid="gift-sign-in">
            {t('gift.signIn')}
          </Link>
        )}
        {session && !own && (
          <button
            type="button"
            disabled={purchase.busy || !mine || companion.isPending}
            onClick={() => void purchase.buy(GIFT_ITEM_KEY, undefined, wallet)}
            className={`${BTN_PRIMARY} max-sm:w-full`}
            data-testid="gift-button"
          >
            {label}
          </button>
        )}
        <CopyButton value={blink} label={t('gift.copyLink')} doneLabel={t('passport.copied')} display={t('gift.copyLink')} />
        <a href={blink} target="_blank" rel="noreferrer" className={`inline-flex min-h-11 items-center ${LINK}`} data-testid="gift-blink">
          {t('gift.openBlink')} ↗
        </a>
      </div>
      <p className="max-w-[560px] [font:500_13px/1.5_Inter] text-[#A0978A]" data-testid="gift-hint">
        {own ? t('gift.own') : session && !mine && !companion.isPending ? t('gift.needWallet') : t('gift.hint')}
      </p>
      <PurchaseDialog state={purchase.state} itemTitle={t('gift.buttonPlain')} itemKind="life" outfit={companion.outfit} onRetry={purchase.retry} onFund={() => void purchase.fund()} onClose={purchase.reset} />
    </div>
  );
}
