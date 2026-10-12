import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { RARITY_EDGE } from '@/components/shop/shopStyles';
import { usePassportSound } from '@/hooks/usePassportSound';
import { useI18n } from '@/i18n';
import { txUrl } from '@/lib/explorer';
import { chestVerifyPath } from '@/services/teraChest.service';
import type { Chest } from '@/types/tera';
import { FALLBACK_AVATAR_IMAGE } from '@/types/avatar';
import type { ChestPhase } from '@/utils/dayChest';
import { ChestArt } from './ChestArt';

const LINK = '-mb-1 inline-flex min-h-10 items-center [font:600_12px_JetBrains_Mono] text-[#3FD17F] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]';
const tierColor = (tier: string | null): string => (tier && tier in RARITY_EDGE ? RARITY_EDGE[tier as keyof typeof RARITY_EDGE] : '#3FD17F');

interface Props {
  phase: ChestPhase;
  chest: Chest | null;
  /** The day the chest belongs to, known before the chest answers. */
  day: number;
  /** No entrance and no reveal: the chest of a day finished earlier, found again. */
  still?: boolean;
}

/**
 * The chest of a stamped day, one fixed-height row under the stamp: sealed on chain, waiting for its block, then
 * the Tera it gave. A tap ends the reveal at once; nothing here ever holds the way out of the lesson.
 */
export function DayChest({ phase, chest, day, still = false }: Props) {
  const { t } = useI18n();
  const reduce = Boolean(useReducedMotion());
  const sound = usePassportSound();
  const [skipped, setSkipped] = useState(false);
  const quiet = still || reduce || skipped;
  const revealed = phase === 'revealed' && chest?.tera != null;
  const chimed = useRef(still);
  useEffect(() => {
    if (!revealed || chimed.current) return;
    chimed.current = true;
    sound('success', 0.35);
  }, [revealed, sound]);
  const color = tierColor(revealed ? chest.tier : null);
  const n = chest?.day || day;

  return (
    <motion.section
      data-testid="day-chest"
      data-phase={phase}
      aria-live="polite"
      aria-label={t('chest.title', { n })}
      onClick={() => setSkipped(true)}
      initial={quiet ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: quiet ? 0 : 0.25 }}
      className="-mt-2 flex h-[104px] w-full shrink-0 items-center gap-3 overflow-hidden rounded-[14px] border border-l-[3px] border-[#262320] bg-[#141210] px-3 text-left"
      style={{ borderLeftColor: color }}
    >
      <div className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center">
        {revealed ? (
          <>
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{ boxShadow: `0 0 0 2px ${color}, 0 0 22px ${color}66` }}
              initial={quiet ? false : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: quiet ? 0 : 0.35, delay: quiet ? 0 : 0.2 }}
            />
            <motion.img
              src={chest.tera.thumbUrl}
              alt=""
              draggable={false}
              data-testid="day-chest-tera"
              onError={(e) => {
                if (!e.currentTarget.src.endsWith(FALLBACK_AVATAR_IMAGE)) e.currentTarget.src = FALLBACK_AVATAR_IMAGE;
              }}
              className="relative h-[68px] w-[68px] rounded-full object-cover"
              initial={quiet ? false : { opacity: 0, scale: 0.4, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={quiet ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 18, delay: 0.2 }}
            />
            <span className="absolute -bottom-1 -right-1 rounded-full bg-[#141210] p-[2px]">
              <ChestArt open color={color} still={quiet} size={26} />
            </span>
          </>
        ) : (
          <ChestArt open={false} color={phase === 'sealing' ? '#5E574E' : '#F2C66D'} shaking={phase === 'rolling'} still={quiet} size={64} />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {revealed ? (
          <>
            <span className="truncate [font:600_11px_JetBrains_Mono] uppercase tracking-[.08em]" style={{ color }} data-testid="day-chest-tier">
              {t('chest.kicker', { tier: chest.tera.tierName || t('chest.tera'), n })}
            </span>
            <span className="truncate [font:700_22px/1.1_'Barlow_Condensed'] text-[#F4EDE2]" data-testid="day-chest-name">{chest.tera.title}</span>
            <span className="truncate [font:400_12px/1.35_Inter] text-[#C9BFB0]">{t('chest.earned')}</span>
            <Link to={chestVerifyPath(chest.id)} className={LINK} data-testid="day-chest-verify" onClick={(e) => e.stopPropagation()}>
              {t('chest.verify')} →
            </Link>
          </>
        ) : (
          <>
            <span className="truncate [font:600_11px_JetBrains_Mono] uppercase tracking-[.08em] text-[#F2C66D]">{t('chest.title', { n })}</span>
            <span className="line-clamp-2 [font:600_13px/1.35_Inter] text-[#F4EDE2]" data-testid="day-chest-line">
              {t(phase === 'rolling' ? 'chest.rolling' : phase === 'committed' ? 'chest.committed' : 'chest.sealing')}
            </span>
            {chest?.commit ? (
              <a href={txUrl(chest.commit.tx)} target="_blank" rel="noopener noreferrer" className={LINK} data-testid="day-chest-commit" onClick={(e) => e.stopPropagation()}>
                {t('chest.commitLink', { slot: chest.commit.slot })} ↗
              </a>
            ) : (
              <span className="min-h-10" />
            )}
          </>
        )}
      </div>
    </motion.section>
  );
}
