import { useI18n } from '@/i18n';
import type { Trail } from '@/types/trailDashboard';
import { barFill, colorOfTrail, programLabel, shortName, trailName, trailPath } from '@/utils/trailDashboard';
import { TrailLegs, TrailNodes } from './TrailNodes';
import { countOf } from '@/utils/plural';

interface Props {
  trail: Trail;
  onOpen: (trail: Trail) => void;
}

/** Tag and call to action of a card, by trail status. */
function useCardWords(trail: Trail) {
  const { t, tText } = useI18n();
  switch (trail.status) {
    case 'done':
      return { tag: t('dash.trail.done'), cta: t('dash.trail.review') };
    case 'locked':
      return { tag: t('dash.trail.locked', { name: shortName(tText(trailName(trail.unlockedBy ?? trail.title))) }), cta: t('dash.trail.blocked') };
    case 'fresh':
      return { tag: t('dash.trail.fresh'), cta: t('dash.trail.start') };
    default:
      return { tag: t('dash.trail.inProgress'), cta: t('dash.trail.continue') };
  }
}

export function TrailCard({ trail, onOpen }: Props) {
  const { t, tText } = useI18n();
  const color = colorOfTrail(trail);
  const { tag, cta } = useCardWords(trail);
  const locked = trail.status === 'locked';
  const done = trail.status === 'done';
  const name = tText(trailName(trail.title));
  const path = trailPath(trail.days.map((d) => d.state), { W: 250, H: 56, A: 10, r: 9 });
  const single = trail.days.length === 1;
  const fill = barFill(trail.doneActivities, trail.totalActivities);
  const accent = locked ? '#A0978A' : color.cl;

  return (
    <button
      type="button"
      data-testid="trail-card"
      data-status={trail.status}
      disabled={locked}
      aria-disabled={locked}
      onClick={() => onOpen(trail)}
      className="relative flex flex-col overflow-visible rounded-[14px] border border-[#262320] border-b-[5px] bg-[#141210] p-0 text-left text-[#F4EDE2] transition-transform duration-75 enabled:cursor-pointer enabled:active:translate-y-[3px] disabled:cursor-default"
      style={{ borderBottomColor: locked ? '#262320' : color.c }}
    >
      <span className="h-2 rounded-t-[13px]" style={{ background: color.c }} />
      <span className="flex min-w-0 flex-col gap-2.5 px-5 py-[18px]">
        <span className="min-h-[18px] truncate [font:500_12px_JetBrains_Mono]" style={{ color: accent }}>
          {tag}
        </span>
        <span className="[font:700_32px/1_'Barlow_Condensed']">{name}</span>
        <span className="line-clamp-2 [font:400_14px_Inter] text-[#A0978A]">{programLabel(tText(trail.programTitle))}</span>
        {single ? (
          <span className="my-1.5 flex flex-col gap-2">
            <span className="flex w-full max-w-[250px] gap-1" aria-hidden>
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} className="h-1.5 flex-1 rounded-sm" style={{ background: i < fill ? color.cl : '#262320' }} />
              ))}
            </span>
            <span className="[font:500_12px_JetBrains_Mono] text-[#A0978A]">
              {t('dash.trail.oneDay', { activities: countOf(t, trail.totalActivities, 'activity') })}
            </span>
          </span>
        ) : (
          <svg viewBox="0 0 250 56" className="my-1.5 w-full max-w-[250px] overflow-visible" aria-hidden>
            <TrailLegs path={path} color={color} variant="mini" />
            <TrailNodes nodes={path.nodes} color={color} variant="mini" />
          </svg>
        )}
        <span className="flex items-center justify-between [font:500_13px_JetBrains_Mono]">
          <span className="text-[#C9BFB0]">
            {trail.doneDays}/{trail.days.length}
          </span>
          <span style={{ color: accent }}>{cta}</span>
        </span>
      </span>
      {done && (
        <span
          className="absolute -top-3.5 right-4 box-border flex h-16 w-16 -rotate-[8deg] flex-col items-center justify-center rounded-full border-b-[5px]"
          style={{ background: color.c, color: color.ink, borderBottomColor: color.cd }}
        >
          <span className="max-w-[56px] truncate [font:700_18px/1_'Barlow_Condensed']">{name}</span>
          <span className="[font:700_11px_JetBrains_Mono]">{t('dash.trail.medal', { done: trail.doneDays, total: trail.days.length })}</span>
        </span>
      )}
    </button>
  );
}
