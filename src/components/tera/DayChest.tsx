import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Confetti } from '@/components/passport/Confetti';
import { RARITY_EDGE } from '@/components/shop/shopStyles';
import { usePassportSound } from '@/hooks/usePassportSound';
import { useTeraCatalog } from '@/hooks/useTeraCatalog';
import { useI18n } from '@/i18n';
import { txUrl } from '@/lib/explorer';
import { chestVerifyPath } from '@/services/teraChest.service';
import type { Chest } from '@/types/tera';
import { FALLBACK_AVATAR_IMAGE } from '@/types/avatar';
import { markChestsSeen } from '@/utils/chestSeen';
import { chestRarity, isEarnOnlyTier, type ChestPhase } from '@/utils/dayChest';
import { ChestArt } from './ChestArt';

const LINK = 'inline-flex min-h-10 items-center [font:600_12px_JetBrains_Mono] text-[#3FD17F] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]';
/** The colour a tier is named in. The edge of a common Tera is too dark to read as text, so it is named in bone. */
const TIER_TEXT: Record<string, string> = { ...RARITY_EDGE, common: '#C9BFB0' };
/** How long the reveal waits for the picture before opening without it. */
const ART_WAIT_MS = 2500;
const tierColor = (rarity: string | null): string => (rarity && rarity in TIER_TEXT ? TIER_TEXT[rarity] : '#3FD17F');

interface Props {
  phase: ChestPhase;
  chest: Chest | null;
  /** The day the chest belongs to, known before the chest answers. */
  day: number;
  /** No entrance and no reveal: the chest of a day finished earlier, found again. */
  still?: boolean;
  /** `row`: one fixed-height row under the stamp. `hero`: the same moment standing alone, larger (a chest opened later). */
  size?: 'row' | 'hero';
}

/**
 * The chest of a stamped day: sealed on chain, waiting for its block, then the moment the Tera comes out, with its tier
 * named and coloured. A tier that is never for sale gets its own frame, chip, confetti and sound, so it cannot be taken
 * for a common one. A tap ends the motion at once; nothing here ever holds the way out of the lesson.
 */
export function DayChest({ phase, chest, day, still = false, size = 'row' }: Props) {
  const { t, locale } = useI18n();
  const reduce = Boolean(useReducedMotion());
  const sound = usePassportSound();
  const catalog = useTeraCatalog();
  const [skipped, setSkipped] = useState(false);
  const quiet = still || reduce || skipped;
  const hero = size === 'hero';
  const opened = phase === 'revealed' && chest?.tera != null;
  const art = opened ? (hero ? chest.tera.imageUrl : chest.tera.thumbUrl) : null;
  // The Tera comes out only once its picture is in the browser: an empty ring at the moment of the reveal is no reward.
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    if (!art || still || loaded === art) return;
    let alive = true;
    const done = () => alive && setLoaded(art);
    const picture = new Image();
    picture.onload = done;
    picture.onerror = done;
    picture.src = art;
    const id = window.setTimeout(done, ART_WAIT_MS);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [art, still, loaded]);
  const revealed = opened && (still || loaded === art);
  const shown: ChestPhase = opened && !revealed ? 'rolling' : phase;
  const rarity = revealed ? chestRarity(chest) : null;
  const earnOnly = isEarnOnlyTier(rarity, new Set(catalog.tiers.filter((tier) => tier.earnOnly).map((tier) => tier.rarity)));
  const tierName = revealed ? chest.tera.tierName || catalog.tiers.find((tier) => tier.rarity === rarity)?.tierName[locale] || t('chest.tera') : '';
  const color = tierColor(rarity);
  const chimed = useRef(still);
  const chestId = chest?.id ?? null;
  useEffect(() => {
    if (!revealed || !chestId) return;
    markChestsSeen([chestId]);
    if (chimed.current) return;
    chimed.current = true;
    sound(earnOnly ? 'celebration' : 'success', earnOnly ? 0.5 : 0.35);
  }, [revealed, chestId, sound, earnOnly]);
  const n = chest?.day || day;
  const stage = hero ? 176 : 104;
  const face = hero ? 156 : 94;

  return (
    <motion.section
      data-testid="day-chest"
      data-phase={shown}
      data-size={size}
      data-rarity={rarity ?? undefined}
      data-earn-only={revealed ? earnOnly : undefined}
      aria-live="polite"
      aria-label={t('chest.title', { n })}
      onClick={() => setSkipped(true)}
      initial={quiet ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: quiet ? 0 : 0.25 }}
      className={`relative w-full shrink-0 overflow-hidden rounded-[14px] bg-[#141210] text-left ${hero ? 'flex flex-col items-center gap-3 p-5 text-center' : '-mt-2 flex h-[140px] items-center gap-3 px-3'} ${earnOnly ? 'border-2' : 'border border-l-[3px]'}`}
      style={earnOnly ? { borderColor: color, backgroundImage: `linear-gradient(120deg, ${color}26, #141210 62%)`, boxShadow: `0 0 28px ${color}33` } : { borderColor: '#262320', borderLeftColor: revealed ? RARITY_EDGE[rarity as keyof typeof RARITY_EDGE] ?? color : shown === 'sealing' ? '#5E574E' : '#F2C66D' }}
    >
      {revealed && earnOnly && !quiet && <Confetti accent={color} />}
      {revealed && !quiet && (
        <motion.span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at ${hero ? '50% 34%' : '68px 50%'}, ${color}CC, transparent 58%)` }} initial={{ opacity: 0.95 }} animate={{ opacity: 0 }} transition={{ duration: 0.55, ease: 'easeOut' }} data-testid="day-chest-flash" />
      )}
      <div className="relative flex shrink-0 items-center justify-center" style={{ width: stage, height: stage }}>
        {revealed ? (
          <>
            <span aria-hidden className="absolute inset-0 overflow-hidden rounded-full">
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{ background: `repeating-conic-gradient(from 0deg, ${color}${earnOnly ? '66' : '2E'} 0deg 9deg, transparent 9deg 24deg)`, maskImage: 'radial-gradient(circle, #000 38%, transparent 70%)', WebkitMaskImage: 'radial-gradient(circle, #000 38%, transparent 70%)' }}
              initial={quiet ? false : { opacity: 0, scale: 0.5, rotate: -30 }}
              animate={quiet || !earnOnly ? { opacity: 1, scale: 1, rotate: 0 } : { opacity: 1, scale: 1, rotate: 360 }}
              transition={quiet ? { duration: 0 } : earnOnly ? { opacity: { duration: 0.4 }, scale: { duration: 0.4 }, rotate: { duration: 22, repeat: Infinity, ease: 'linear' } } : { duration: 0.45, delay: 0.1 }}
            />
            </span>
            <motion.img
              src={art ?? chest.tera.thumbUrl}
              alt=""
              draggable={false}
              data-testid="day-chest-tera"
              onError={(e) => {
                if (!e.currentTarget.src.endsWith(FALLBACK_AVATAR_IMAGE)) e.currentTarget.src = FALLBACK_AVATAR_IMAGE;
              }}
              className="relative rounded-full object-cover"
              style={{ width: face, height: face, boxShadow: `0 0 0 ${earnOnly ? 3 : 2}px ${color}, 0 0 ${earnOnly ? 34 : 18}px ${color}${earnOnly ? 'AA' : '55'}` }}
              initial={quiet ? false : { opacity: 0, scale: 0.3, y: 26 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={quiet ? { duration: 0 } : { type: 'spring', stiffness: 360, damping: 16, delay: 0.12 }}
            />
            <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[#141210] p-[2px]">
              <ChestArt open color={color} still={quiet} size={hero ? 40 : 28} />
            </span>
          </>
        ) : (
          <ChestArt open={false} color={shown === 'sealing' ? '#5E574E' : '#F2C66D'} shaking={shown === 'rolling'} still={quiet} size={hero ? 132 : 88} />
        )}
      </div>
      <div className={`flex min-w-0 flex-col ${hero ? 'items-center' : 'flex-1'}`}>
        {revealed ? (
          <>
            {earnOnly && (
              <span className={`${hero ? 'mb-1' : 'mb-0.5'} rounded-full px-2 py-[3px] [font:700_10px/1_JetBrains_Mono] uppercase tracking-[.08em] text-[#0A0908] ${hero ? '' : 'self-start'}`} style={{ background: color }} data-testid="day-chest-earn-only">
                {t('chest.earnOnlyChip')}
              </span>
            )}
            <span className={`max-w-full truncate [font:700_11px/1.4_JetBrains_Mono] uppercase tracking-[.08em] text-[#F2C66D] ${hero ? 'mb-1' : ''}`} data-testid="day-chest-won">{t('chest.won')}</span>
            <motion.span
              className={`max-w-full truncate uppercase ${hero ? "[font:700_40px/1_'Barlow_Condensed']" : "[font:700_28px/1_'Barlow_Condensed']"}`}
              style={{ color, textShadow: earnOnly ? `0 0 18px ${color}88` : undefined }}
              data-testid="day-chest-tier"
              initial={quiet ? false : { opacity: 0, x: hero ? 0 : -10, y: hero ? 8 : 0 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: quiet ? 0 : 0.25, delay: quiet ? 0 : 0.3 }}
            >
              {tierName}
            </motion.span>
            <span className={`max-w-full truncate text-[#F4EDE2] ${hero ? 'mt-1 [font:600_20px/1.2_Inter]' : '[font:600_16px/1.25_Inter]'}`} data-testid="day-chest-name">{chest.tera.title}</span>
            {hero && <span className="max-w-full truncate [font:600_10px/1.5_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A]" data-testid="day-chest-day">{t('chest.day', { n })}</span>}
            <span className={`[font:400_12px/1.3_Inter] text-[#C9BFB0] ${hero ? 'mt-1' : 'line-clamp-1'}`} data-testid="day-chest-yours">{t('chest.earned')}</span>
            <span className={`flex max-w-full flex-wrap items-center gap-x-4 ${hero ? 'justify-center' : '-mb-1'}`}>
              <Link to="/world#cast" className={`${LINK} whitespace-nowrap ${hero ? '' : `${earnOnly ? '!min-h-7' : '!min-h-8'} ![font:700_11px_JetBrains_Mono]`}`} data-testid="day-chest-world" onClick={(e) => e.stopPropagation()}>
                {t('chest.world')} →
              </Link>
              <Link to={chestVerifyPath(chest.id)} className={`${LINK} whitespace-nowrap !text-[#A0978A] ${hero ? '' : `${earnOnly ? '!min-h-7' : '!min-h-8'} ![font:600_11px_JetBrains_Mono]`}`} data-testid="day-chest-verify" onClick={(e) => e.stopPropagation()}>
                {t('chest.verify')} →
              </Link>
            </span>
          </>
        ) : (
          <>
            <span className="truncate [font:600_11px_JetBrains_Mono] uppercase tracking-[.08em] text-[#F2C66D]">{t('chest.title', { n })}</span>
            <span className={`[font:600_14px/1.35_Inter] text-[#F4EDE2] ${hero ? 'mt-1 max-w-[30ch]' : 'line-clamp-3'}`} data-testid="day-chest-line">
              {t(shown === 'rolling' ? 'chest.rolling' : shown === 'committed' ? 'chest.committed' : 'chest.sealing')}
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
