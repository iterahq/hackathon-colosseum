import { Link } from 'react-router-dom';
import { LivesRule } from '@/components/lives/LivesRule';
import { LivesHearts } from '@/components/lives/LivesHearts';
import { ArtZoom } from '@/components/artviewer';
import { LookStage } from '@/components/wardrobe/LookStage';
import { useI18n } from '@/i18n';
import { addressUrl, shortAddress } from '@/lib/explorer';
import type { LearnerAvatar } from '@/types/avatar';
import type { CompanionState, LivesState } from '@/types/shop';
import { formatCountdown } from '@/utils/lives';
import { CARD, FOCUS, MONO_LABEL } from './shopStyles';

interface Props {
  companion: CompanionState | null;
  lives: LivesState | null;
  secondsToNext: number;
  /** The learner's wallet, for the public profile link. */
  wallet?: string | null;
  avatar: LearnerAvatar;
  /** Name of the outfit Tera wears. */
  outfitName: string | null;
}

const LINK = `rounded [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline ${FOCUS}`;

/** The top of the shop: the learner's Tera, big, wearing what is equipped or being tried on, with his on-chain facts. */
export function ShopTeraStage({ companion, lives, secondsToNext, wallet = null, avatar, outfitName }: Props) {
  const { t } = useI18n();
  const asset = companion?.assetAddress ?? null;
  const wearing = !avatar.allowsOutfit ? avatar.title : outfitName ? t('shop.wearing', { name: outfitName }) : t('shop.wearingNone');

  return (
    <section className={`${CARD} flex flex-col items-center gap-6 border-b-[5px] border-b-[#2E2A25] p-5 sm:flex-row sm:items-stretch sm:gap-8 sm:p-7`} data-testid="shop-stage">
      <div className="flex flex-none flex-col items-center gap-3">
        <LookStage avatar={avatar} outfit={companion?.outfit ?? null} />
        <span className={`${MONO_LABEL} text-[#A0978A]`} data-testid="shop-wearing">
          {wearing}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-4 max-sm:items-center max-sm:text-center">
        <div>
          <h1 className="[font:700_48px/1_'Barlow_Condensed'] max-sm:text-[38px]">{t('shop.title')}</h1>
          <p className="mt-2 max-w-[520px] [font:400_15px/1.5_Inter] text-[#C9BFB0]">{t('shop.subtitle')}</p>
          <Link to="/world" className="mt-2 inline-block [font:600_14px_Inter] text-[#3FD17F] hover:underline" data-testid="shop-world-link">{t('shop.worldLink')}</Link>
          <p className="mt-2 [font:600_11px_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A]" data-testid="shop-devnet-note">
            {t('shop.devnetNote')}
          </p>
        </div>
        {lives && (
        <div className="flex flex-col gap-2 max-sm:items-center">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 max-sm:justify-center">
            <LivesHearts current={lives.current} max={lives.max} size={22} label={t('lives.chrome', { current: lives.current, max: lives.max })} className="gap-1" />
            <span className="[font:700_16px_JetBrains_Mono] tabular-nums text-[#F4EDE2]" data-testid="shop-lives-count" title={lives.current >= lives.max ? t('shop.lives.full') : t('shop.lives.next', { time: formatCountdown(secondsToNext) })}>
              {lives.current}/{lives.max}
            </span>
            {lives.current < lives.max && (
              <span className="[font:600_12px_JetBrains_Mono] tabular-nums text-[#A0978A]" data-testid="shop-lives-next">
                {t('shop.lives.next', { time: formatCountdown(secondsToNext) })}
              </span>
            )}
          </div>
          <LivesRule className="max-sm:text-center" />
          </div>
        )}
        {companion && (
          <div className="flex w-full items-center gap-4 rounded-[12px] border border-[#262320] bg-[#0F0D0B] p-4 max-sm:flex-col" data-testid="shop-companion">
            {companion.imageUrl && asset && (
              <ArtZoom title={t('shop.companion.title')} line={t('viewer.companion.line')} src={companion.imageUrl} asset={asset} explorerUrl={companion.explorerUrl} className="flex-none !rounded-[10px]">
                <img src={companion.imageUrl} alt="" loading="lazy" width={84} height={84} className="h-[84px] w-[84px] rounded-[10px] border border-[#262320]" data-testid="shop-companion-art" />
              </ArtZoom>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2 max-sm:items-center">
            <span className="flex flex-wrap items-center gap-2">
              <span className={`${MONO_LABEL} text-[#F4EDE2]`}>{t('shop.companion.title')}</span>
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
                {wallet && (
                  <Link to={`/u/${wallet}`} className={LINK} data-testid="shop-profile-link">
                    {t('profile.open')}
                  </Link>
                )}
              </span>
            ) : (
              <span className="[font:400_13px/1.4_Inter] text-[#A0978A]">{t('shop.companion.unminted')}</span>
            )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
