import { motion, useReducedMotion } from 'framer-motion';
import { useI18n } from '@/i18n';
import { levelOf } from '@/utils/headerHud';
import { HeaderHudStat } from './HeaderHudStat';

interface Props {
  xp: number | null;
  streak: number | null;
  achievements: number | null;
}

/** The game HUD: streak flame, XP with its level and a sliver of progress, achievements. Phones get the first two. */
export function HeaderHud({ xp, streak, achievements }: Props) {
  const { t } = useI18n();
  const reduced = !!useReducedMotion();
  const level = levelOf(xp ?? 0);
  const loading = xp == null && streak == null && achievements == null;

  return (
    <div
      className="flex h-11 items-stretch divide-x divide-[#262320] rounded-[10px] border border-[#262320] bg-[#141210]"
      data-testid="header-hud"
      aria-busy={loading}
      aria-label={loading ? t('header.hud.loading') : undefined}
    >
      <HeaderHudStat
        icon="flame"
        tone={streak ? '#E07A4A' : '#5E574E'}
        dim={!streak}
        value={streak}
        unit={t('header.hud.streakUnit')}
        label={t('header.hud.streak', { n: streak ?? 0 })}
      />
      <HeaderHudStat
        icon="bolt"
        tone="#F2C66D"
        value={xp}
        unit={
          <span className="rounded-[4px] bg-[#3A311B] px-1 py-[1px] text-[#F2C66D]">{t('header.hud.level', { level: level.level })}</span>
        }
        label={t('header.hud.xp', { xp: xp ?? 0, level: level.level, into: level.into, span: level.span })}
      >
        <span className="mt-1 hidden h-[3px] w-full overflow-hidden rounded-full bg-[#262320] sm:block" aria-hidden>
          <motion.span
            className="block h-full rounded-full bg-[#F2C66D]"
            initial={false}
            animate={{ width: `${Math.max(4, Math.round(level.ratio * 100))}%` }}
            transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 20 }}
          />
        </span>
      </HeaderHudStat>
      <HeaderHudStat
        icon="star"
        tone="#3FD17F"
        value={achievements}
        unit={t('header.hud.achievementsShort')}
        label={t('header.hud.achievements', { n: achievements ?? 0 })}
        className="max-sm:hidden"
      />
    </div>
  );
}
