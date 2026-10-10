import { Link } from 'react-router-dom';
import { LivesRule } from '@/components/lives/LivesRule';
import { LivesHearts } from '@/components/lives/LivesHearts';
import { ArtZoom } from '@/components/artviewer';
import { ShopLook, outfitDrawable } from './ShopLook';
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
    <section className={`${CARD} flex flex-col gap-3 border-b-[5px] border-b-[#2E2A25] p-4 sm:flex-row sm:items-center sm:gap-6`} data-testid="shop-stage">
      <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-5">
      <div className="flex w-[110px] flex-none flex-col items-center gap-1.5 sm:w-[132px]">
        <div className="flex h-[110px] w-[110px] items-end justify-center overflow-hidden rounded-[14px] border border-[#262320] bg-[#0F0D0B] p-1 sm:h-[132px] sm:w-[132px]" data-testid="look-stage" data-avatar={avatar.key} data-outfit-shown={outfitDrawable(avatar)}>
          <div className={outfitDrawable(avatar) ? 'origin-bottom scale-[0.7] sm:scale-[0.85]' : 'h-full w-full'}>
            <ShopLook avatar={avatar} outfit={companion?.outfit ?? null} />
          </div>
        </div>
        <span className={`${MONO_LABEL} line-clamp-1 !text-[10px] text-[#A0978A]`} data-testid="shop-wearing">
          {wearing}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        <div>
          <h1 className="[font:700_40px/1_'Barlow_Condensed'] max-sm:text-[30px]">{t('shop.title')}</h1>
          <p className="mt-1 hidden max-w-[520px] [font:400_14px/1.4_Inter] text-[#C9BFB0] sm:block">{t('shop.subtitle')}</p>
          <p className="mt-1 [font:600_10px_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A]" data-testid="shop-devnet-note">
            {t('shop.devnetNote')}
          </p>
        </div>
        {lives && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
          <LivesRule className="hidden sm:block" />
          </div>
        )}
      </div>
      </div>
        {companion && (
          <div className="flex items-center gap-3 rounded-[12px] border border-[#262320] bg-[#0F0D0B] p-3 sm:w-[400px] sm:flex-none" data-testid="shop-companion">
            {companion.imageUrl && asset && (
              <ArtZoom title={t('shop.companion.title')} line={t('viewer.companion.line')} src={companion.imageUrl} asset={asset} explorerUrl={companion.explorerUrl} className="flex-none !rounded-[10px]">
                <img src={companion.imageUrl} alt="" loading="lazy" width={64} height={64} className="h-16 w-16 rounded-[10px] border border-[#262320]" data-testid="shop-companion-art" />
              </ArtZoom>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className={`${MONO_LABEL} text-[#F4EDE2]`}>{t('shop.companion.title')}</span>
            </span>
            <span className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">
              {t('shop.companion.level', { level: companion.level })} · {companion.xp} XP · {t('shop.companion.streak', { n: companion.streak })}
            </span>
            {asset ? (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
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
    </section>
  );
}
