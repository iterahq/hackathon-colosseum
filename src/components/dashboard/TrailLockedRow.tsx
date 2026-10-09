import { useI18n } from '@/i18n';
import type { Trail } from '@/types/trailDashboard';
import { colorOfTrail, shortName, trailName, trailPath } from '@/utils/trailDashboard';
import { TrailLegs, TrailNodes } from './TrailNodes';

/** A locked trail as a compact 44 px row: what it is, what unlocks it and its dormant path. */
export function TrailLockedRow({ trail }: { trail: Trail }) {
  const { t, tText } = useI18n();
  const color = colorOfTrail(trail);
  const name = tText(trailName(trail.title));
  const after = shortName(tText(trailName(trail.unlockedBy ?? trail.title)));
  const path = trailPath(trail.days.map((d) => d.state), { W: 340, H: 44, A: 8, r: 9 });
  const multi = trail.days.length > 1;

  return (
    <li
      data-testid="trail-card"
      data-status="locked"
      aria-disabled
      className="flex min-h-[44px] items-center gap-3 rounded-xl border border-[#262320] border-l-[4px] bg-[#141210] px-4 py-2 text-[#F4EDE2]"
      style={{ borderLeftColor: color.cs }}
    >
      <span className="min-w-0 flex-1 truncate [font:700_20px/1.1_'Barlow_Condensed']">{name}</span>
      {multi && (
        <svg viewBox="0 0 340 44" className="hidden h-8 w-[200px] shrink-0 overflow-visible md:block" aria-hidden>
          <TrailLegs path={path} color={color} variant="mini" />
          <TrailNodes nodes={path.nodes} color={color} variant="mini" />
        </svg>
      )}
      <span className="shrink-0 truncate [font:500_12px_JetBrains_Mono] text-[#A0978A] max-sm:max-w-[48%]">{t('dash.trail.locked', { name: after })}</span>
    </li>
  );
}
