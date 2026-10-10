import { Link } from 'react-router-dom';
import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import { HeaderIcon } from '@/components/header/HeaderIcon';
import { HeroTera } from '@/components/dashboard/HeroTera';
import { useCompanion } from '@/hooks/useCompanion';
import { useHeaderStats } from '@/hooks/useHeaderStats';
import { useLearnerAvatar } from '@/hooks/useLearnerAvatar';
import { useProfile } from '@/hooks/useProfile';
import { useI18n } from '@/i18n';
import { DEFAULT_AVATAR_KEY } from '@/types/avatar';
import type { Trail } from '@/types/trailDashboard';
import { greetingName } from '@/utils/headerHud';
import { currentDayOf, trailName } from '@/utils/trailDashboard';

const CHIP = 'inline-flex h-9 items-center gap-2 rounded-full border border-[#262320] bg-[#141210] px-3 [font:600_12px_JetBrains_Mono] text-[#C9BFB0]';

/** The line above the hero: Tera, "welcome back" and the learner's quiet numbers (they no longer live in the header). */
export function WelcomeStrip({ trail }: { trail: Trail | null }) {
  const { t, tText } = useI18n();
  const stats = useHeaderStats();
  const avatar = useLearnerAvatar();
  const companion = useCompanion();
  const outfitTera = Boolean(companion.data) && avatar.key === DEFAULT_AVATAR_KEY && (avatar as { allowsOutfit?: boolean }).allowsOutfit !== false;
  const nickname = greetingName(useProfile().data?.displayName);
  const current = trail ? currentDayOf(trail) : null;
  const day = trail && current ? String(trail.days.indexOf(current) + 1).padStart(2, '0') : null;

  return (
    <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pt-3" data-testid="welcome-strip">
      <div className="flex min-w-0 items-center gap-3">
        {outfitTera ? <HeroTera /> : <LearnerAvatar avatar={avatar} size="lg" thumb={false} />}
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate [font:700_30px/1_'Barlow_Condensed'] max-sm:text-[24px]" data-testid="welcome-title">
            {nickname ? t('dash.welcome.named', { name: nickname }) : t('dash.welcome')}
          </h1>
          {trail && day && (
            <span className="truncate [font:500_12px_JetBrains_Mono] text-[#A0978A]">
              {t('dash.welcome.prompt', { day, total: trail.days.length, trail: tText(trailName(trail.title)) })}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2" data-testid="welcome-stats">
        <span className={CHIP} title={t('header.hud.streak', { n: stats.streak ?? 0 })}>
          <HeaderIcon name="flame" size={16} className="text-[#3FD17F]" />
          {t('dash.welcome.streak', { n: stats.streak ?? 0 })}
        </span>
        <span className={CHIP} title={t('header.hud.xp', { xp: stats.xp ?? 0, level: stats.level ?? 1, into: 0, span: 0 })}>
          <HeaderIcon name="bolt" size={16} className="text-[#3FD17F]" />
          {t('dash.welcome.xp', { xp: stats.xp ?? 0, level: stats.level ?? 1 })}
        </span>
        <Link to="/passport" className={`${CHIP} hover:border-[#3FD17F] hover:text-[#F4EDE2]`} title={t('header.hud.achievements', { n: stats.achievements ?? 0 })}>
          <HeaderIcon name="star" size={16} className="text-[#3FD17F]" />
          {t('dash.welcome.achievements', { n: stats.achievements ?? 0 })}
        </Link>
      </div>
    </section>
  );
}
