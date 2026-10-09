import { Link } from 'react-router-dom';
import { LivesHearts } from '@/components/lives/LivesHearts';
import { TeraOutfit } from '@/components/tera/TeraOutfit';
import { useI18n } from '@/i18n';
import { addressUrl, shortAddress } from '@/lib/explorer';
import type { CompanionState, LivesState } from '@/types/shop';
import { formatCountdown } from '@/utils/lives';
import { CARD, DEVNET_BADGE, FOCUS, MONO_LABEL } from './shopStyles';

interface Props {
  companion: CompanionState | null;
  lives: LivesState | null;
  secondsToNext: number;
  /** Name of the outfit on show, and whether it is only being tried on. */
  showing: { name: string | null; preview: boolean; key: string | null };
}

const LINK = `rounded [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline ${FOCUS}`;

/** The top of the shop: the learner's Tera, big, wearing what is equipped or being tried on, with his on-chain facts. */
export function ShopTeraStage({ companion, lives, secondsToNext, showing }: Props) {
  const { t } = useI18n();
  const asset = companion?.assetAddress ?? null;
  const wearing = showing.name ? t(showing.preview ? 'shop.previewing' : 'shop.wearing', { name: showing.name }) : t('shop.wearingNone');

  return (
    <section className={`${CARD} flex flex-col items-center gap-6 border-b-[5px] border-b-[#2E2A25] p-5 sm:flex-row sm:items-stretch sm:gap-8 sm:p-7`} data-testid="shop-stage">
      <div className="flex flex-none flex-col items-center gap-3">
        <span className="relative flex h-[230px] w-[230px] items-end justify-center overflow-hidden rounded-[18px] border border-[#262320] bg-[#0F0D0B] pb-7">
          <span className="block origin-bottom scale-[1.55]">
            <TeraOutfit mood="neutral" size="xl" outfit={companion?.outfit} preview={showing.preview ? showing.key : undefined} />
          </span>
        </span>
        <span className={`${MONO_LABEL} text-[#A0978A]`} data-testid="shop-wearing">
          {wearing}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-4 max-sm:items-center max-sm:text-center">
        <div>
          <h1 className="[font:700_48px/1_'Barlow_Condensed'] max-sm:text-[38px]">{t('shop.title')}</h1>
          <p className="mt-2 max-w-[520px] [font:400_15px/1.5_Inter] text-[#C9BFB0]">{t('shop.subtitle')}</p>
        </div>
        {lives && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 max-sm:justify-center">
            <LivesHearts current={lives.current} max={lives.max} size={22} label={t('lives.chrome', { current: lives.current, max: lives.max })} className="gap-1" />
            <span className="[font:600_12px_JetBrains_Mono] tabular-nums text-[#A0978A]">
              {lives.current >= lives.max ? t('shop.lives.full') : t('shop.lives.next', { time: formatCountdown(secondsToNext) })}
            </span>
          </div>
        )}
        {companion && (
          <div className="flex w-full flex-col gap-2 rounded-[12px] border border-[#262320] bg-[#0F0D0B] p-4 max-sm:items-center" data-testid="shop-companion">
            <span className="flex flex-wrap items-center gap-2">
              <span className={`${MONO_LABEL} text-[#F4EDE2]`}>{t('shop.companion.title')}</span>
              <span className={DEVNET_BADGE}>{t('shop.devnet')}</span>
            </span>
            <span className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">
              {t('shop.companion.level', { level: companion.level })} · {companion.xp} XP · {t('shop.companion.streak', { n: companion.streak })}
            </span>
            {asset ? (
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1 max-sm:justify-center">
                <span className="[font:700_13px_JetBrains_Mono] text-[#F4EDE2]" title={asset}>
                  {shortAddress(asset)}
                </span>
                <a href={companion.explorerUrl ?? addressUrl(asset)} target="_blank" rel="noreferrer" className={LINK} data-testid="shop-companion-explorer">
                  {t('shop.companion.explorer')}
                </a>
                <Link to={`/c/${asset}`} className={LINK} data-testid="shop-companion-public">
                  {t('shop.companion.public')}
                </Link>
              </span>
            ) : (
              <span className="[font:400_13px/1.4_Inter] text-[#A0978A]">{t('shop.companion.unminted')}</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
