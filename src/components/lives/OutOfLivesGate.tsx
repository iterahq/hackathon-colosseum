import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { BTN_PRIMARY, BTN_SECONDARY, DEVNET_BADGE, FOCUS, SHOP_GRID } from '@/components/shop/shopStyles';
import { TeraOutfit } from '@/components/tera/TeraOutfit';
import { useI18n } from '@/i18n';
import { formatCountdown } from '@/utils/lives';
import { LivesHearts } from './LivesHearts';

interface Props {
  lives: { current: number; max: number };
  secondsToNext: number;
  /** `price_label` of the refill; null while the shop list is loading or unavailable. */
  priceLabel: string | null;
  /** False for e-mail users: they see "Conectar carteira" instead of the purchase. */
  hasWallet: boolean;
  outfit: string | null;
  busy: boolean;
  onRefill: () => void;
  onConnect: () => void;
  onLeave: () => void;
}

/** The out-of-lives pause: full screen over the lesson, which stays mounted underneath exactly where it was. */
export function OutOfLivesGate({ lives, secondsToNext, priceLabel, hasWallet, outfit, busy, onRefill, onConnect, onLeave }: Props) {
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
        <div className="flex flex-col items-center gap-1" aria-live="off">
          <span className="[font:600_11px_JetBrains_Mono] uppercase tracking-[.1em] text-[#A0978A]">{t('lives.gate.next')}</span>
          <span data-testid="lives-gate-countdown" className="[font:700_44px/1_JetBrains_Mono] tabular-nums text-[#F4EDE2]">
            {time}
          </span>
        </div>
        <div className="mt-1 flex w-full flex-col gap-3">
          {hasWallet ? (
            <button type="button" autoFocus disabled={busy} onClick={onRefill} data-testid="lives-gate-refill" className={`${BTN_PRIMARY} w-full flex-wrap gap-x-2 gap-y-0 py-2 [font:700_16px_Inter]`}>
              <span>{priceLabel ? t('lives.gate.refill', { price: priceLabel }) : t('lives.gate.refillPlain')}</span>
              <span className={`${DEVNET_BADGE} border-[#249457] text-[#0A0908]/70`}>{t('shop.devnet')}</span>
            </button>
          ) : (
            <>
              <button type="button" autoFocus disabled={busy} onClick={onConnect} data-testid="lives-gate-connect" className={`${BTN_PRIMARY} w-full [font:700_16px_Inter]`}>
                {t('lives.gate.connect')}
              </button>
              <p className="[font:400_13px/1.4_Inter] text-[#A0978A]">{t('lives.gate.connectHint')}</p>
            </>
          )}
          <button type="button" onClick={onLeave} title={t('lives.gate.leave')} data-testid="lives-gate-wait" className={`${BTN_SECONDARY} w-full`}>
            {t('lives.gate.wait', { time })}
          </button>
        </div>
        <Link to="/shop" className={`rounded px-1 py-2 [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline ${FOCUS}`}>
          {t('lives.gate.shop')} →
        </Link>
      </motion.div>
    </div>
  );
}
