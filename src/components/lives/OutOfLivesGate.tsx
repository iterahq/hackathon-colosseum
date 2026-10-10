import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { BTN_PRIMARY, FOCUS, SHOP_GRID } from '@/components/shop/shopStyles';
import { TeraOutfit } from '@/components/tera/TeraOutfit';
import { useI18n } from '@/i18n';
import { formatCountdown } from '@/utils/lives';
import { LivesHearts } from './LivesHearts';
import { LivesRule } from './LivesRule';

interface Props {
  lives: { current: number; max: number };
  secondsToNext: number;
  /** `price_label` of the refill; null while the shop list is loading or unavailable. */
  priceLabel: string | null;
  /** The shop list is still loading: the button holds the price's place and waits for it. */
  pricePending?: boolean;
  /** False for e-mail users without a linked wallet: they see "Vincular carteira" instead of the purchase. */
  hasWallet: boolean;
  outfit: string | null;
  /** Explorer link of the on-chain Tera (the last mirror, else the asset); null renders nothing. */
  chainUrl?: string | null;
  busy: boolean;
  onRefill: () => void;
  onConnect: () => void;
  onLeave: () => void;
}

/** Room for "· US$ 0.10 ≈ 0.00055 SOL": on a phone the price takes its own line from the first paint. */
const PRICE_BOX = 'min-h-6 min-w-[13.5rem]';

/** The out-of-lives pause: full screen over the lesson, which stays mounted underneath exactly where it was. */
export function OutOfLivesGate({ lives, secondsToNext, priceLabel, pricePending = false, hasWallet, outfit, chainUrl = null, busy, onRefill, onConnect, onLeave }: Props) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const time = formatCountdown(secondsToNext);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lives-gate-title"
      data-testid="lives-gate"
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto px-5 py-8 text-[#F4EDE2]"
      style={SHOP_GRID}
    >
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="m-auto flex w-full max-w-[440px] flex-col items-center gap-5 text-center"
      >
        <span className="relative flex h-[190px] w-[190px] items-end justify-center rounded-full border-2 border-[#262320] bg-[#141210] pb-9">
          <TeraOutfit mood="oops" size="xl" outfit={outfit} />
        </span>
        <LivesHearts current={lives.current} max={lives.max} size={26} label={t('lives.chrome', lives)} className="gap-1.5" data-testid="lives-gate-hearts" />
        <h1 id="lives-gate-title" className="[font:700_40px/1_'Barlow_Condensed'] max-sm:text-[34px]">
          {t('lives.gate.title')}
        </h1>
        <p className="max-w-[360px] [font:400_16px/1.5_Inter] text-[#C9BFB0]">{t('lives.gate.body')}</p>
        <LivesRule />
        <div className="flex flex-col items-center gap-1" aria-live="off">
          <span className="[font:600_11px_JetBrains_Mono] uppercase tracking-[.1em] text-[#A0978A]">{t('lives.gate.next')}</span>
          <span data-testid="lives-gate-countdown" className="[font:700_44px/1_JetBrains_Mono] tabular-nums text-[#F4EDE2]">
            {time}
          </span>
        </div>
        <div className="mt-1 flex w-full flex-col gap-3">
          {hasWallet ? (
            <button type="button" autoFocus disabled={busy || pricePending} aria-busy={pricePending || undefined} onClick={onRefill} data-testid="lives-gate-refill" className={`${BTN_PRIMARY} w-full flex-wrap gap-x-2 gap-y-0 py-2 [font:700_16px_Inter] disabled:opacity-100`}>
              <span className="whitespace-nowrap">{t('lives.gate.refillPlain')}</span>
              {/* The price keeps one box, loaded or not, so the button never changes size. */}
              {(priceLabel || pricePending) && (
                <span className={`inline-flex items-center justify-center whitespace-nowrap ${PRICE_BOX}`} data-testid="lives-gate-price">
                  {priceLabel ? `· ${priceLabel}` : <span aria-hidden className="h-3 w-full animate-pulse rounded-full bg-[#0A0908]/25 motion-reduce:animate-none" />}
                </span>
              )}
            </button>
          ) : (
            <>
              <button type="button" autoFocus disabled={busy} onClick={onConnect} data-testid="lives-gate-connect" className={`${BTN_PRIMARY} w-full [font:700_16px_Inter]`}>
                {t('wallet.link.cta')}
              </button>
              <p className="[font:400_13px/1.4_Inter] text-[#A0978A]">{t('wallet.link.hint')}</p>
            </>
          )}
          <button type="button" onClick={onLeave} title={t('lives.gate.leave')} data-testid="lives-gate-wait" className={`mx-auto rounded px-2 py-2 [font:600_14px_Inter] text-[#A0978A] underline underline-offset-4 hover:text-[#F4EDE2] ${FOCUS}`}>
            {t('lives.gate.wait', { time })}
          </button>
        </div>
        <Link to="/shop" className={`rounded px-1 py-1 [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline ${FOCUS}`}>
          {t('lives.gate.shop')} →
        </Link>
        {chainUrl && (
          <a href={chainUrl} target="_blank" rel="noopener noreferrer" data-testid="lives-gate-chain" className={`rounded px-1 [font:500_12px_JetBrains_Mono] text-[#A0978A] hover:text-[#3FD17F] ${FOCUS}`}>
            {t('lives.gate.onchain', { current: lives.current, max: lives.max })} ↗
          </a>
        )}
      </motion.div>
    </div>
  );
}
