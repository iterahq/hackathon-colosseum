import { Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HEART } from '@/components/shop/shopStyles';
import { useLives } from '@/hooks/useLives';
import { useI18n } from '@/i18n';
import { formatCountdown } from '@/utils/lives';

/** HUD cell: the learner's lives (current/max) with the time to the next one; opens Tera's shop. Absent while lives are off. */
export function HeaderLives() {
  const { t } = useI18n();
  const { active, lives, secondsToNext } = useLives();
  if (!active || !lives) return null;

  const full = lives.current >= lives.max;
  const time = formatCountdown(secondsToNext);
  const label = full ? t('lives.hud.full', { current: lives.current, max: lives.max }) : t('lives.hud.next', { current: lives.current, max: lives.max, time });
  const empty = lives.current <= 0;

  return (
    <Link
      to="/shop"
      aria-label={label}
      title={label}
      data-testid="header-lives"
      data-lives={lives.current}
      className="hd-focus flex items-center gap-1.5 rounded-l-[9px] px-2.5 transition-colors hover:bg-[#1B1815] sm:px-3"
    >
      <Heart aria-hidden width={18} height={18} strokeWidth={2.25} style={empty ? { color: '#5E574E', fill: 'transparent' } : { color: HEART, fill: HEART }} />
      <span className="flex flex-col leading-none">
        <span className="flex items-baseline gap-1">
          <span className={`[font:700_16px_JetBrains_Mono] tabular-nums ${empty ? 'text-[#8A8276]' : 'text-[#F4EDE2]'}`}>
            {lives.current}
            <span className="text-[#8A8276] max-sm:hidden">/{lives.max}</span>
          </span>
          <span className="[font:500_10px_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A] max-xl:hidden">{t('lives.hud.unit')}</span>
        </span>
        {!full && (
          <span className="mt-1 [font:600_9px_JetBrains_Mono] tabular-nums text-[#A0978A] max-sm:hidden" data-testid="header-lives-countdown">
            +1 · {time}
          </span>
        )}
      </span>
    </Link>
  );
}
