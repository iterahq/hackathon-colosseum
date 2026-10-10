import { Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LivesBoundary } from '@/components/lives/LivesBoundary';
import { HEART } from '@/components/shop/shopStyles';
import { useLives } from '@/hooks/useLives';
import { useI18n } from '@/i18n';
import { formatCountdown } from '@/utils/lives';

function Cell() {
  const { t } = useI18n();
  const { active, lives, secondsToNext, loading } = useLives();
  // Same footprint as the chip, so the header does not jump when the lives arrive.
  if (active && !lives && loading) {
    return <span aria-hidden data-testid="header-lives-loading" className="block h-11 w-[84px] animate-pulse rounded-full border border-[#262320] bg-[#141210] motion-reduce:animate-none" />;
  }
  if (!active || !lives) return null;

  const full = lives.current >= lives.max;
  const unlimited = Boolean(lives.unlimitedUntil && Date.parse(lives.unlimitedUntil) > Date.now());
  const reserve = lives.current > lives.max;
  const time = formatCountdown(secondsToNext);
  const label = unlimited ? t('lives.hud.unlimited') : reserve ? t('lives.hud.reserve', { current: lives.current, max: lives.max }) : full ? t('lives.hud.full', { current: lives.current, max: lives.max }) : t('lives.hud.next', { current: lives.current, max: lives.max, time });
  const empty = lives.current <= 0;

  return (
    <Link
      to="/shop"
      aria-label={label}
      title={label}
      data-testid="header-lives"
      data-lives={lives.current}
      className="hd-focus flex h-11 items-center gap-1.5 rounded-full border border-[#262320] bg-[#141210] px-3 transition-colors hover:bg-[#1B1815]"
    >
      <Heart aria-hidden className="h-[18px] w-[18px]" strokeWidth={2.25} style={empty ? { color: '#5E574E', fill: 'transparent' } : { color: HEART, fill: HEART }} />
      <span className={`[font:700_15px_JetBrains_Mono] tabular-nums ${empty ? 'text-[#8A8276]' : 'text-[#F4EDE2]'}`}>
        {unlimited ? '∞' : reserve ? lives.current : `${lives.current}/${lives.max}`}
      </span>
    </Link>
  );
}

/** HUD cell: the learner's lives (current/max) with the time to the next one; opens Tera's shop. Absent while lives are off. */
export function HeaderLives() {
  return (
    <LivesBoundary>
      <Cell />
    </LivesBoundary>
  );
}
