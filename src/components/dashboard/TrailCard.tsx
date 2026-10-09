import { LockGlyph } from '@/components/passport/LockGlyph';
import { useI18n } from '@/i18n';
import type { PassportPageData } from '@/types/achievements';
import type { Trail } from '@/types/trailDashboard';
import { colorOfTrail, programLabel, shortName, trailName } from '@/utils/trailDashboard';
import { TrailCertLine } from './TrailCertLine';
import { TrailDayPath } from './TrailDayPath';

interface Props {
  trail: Trail;
  cert?: PassportPageData;
  onOpen: (trail: Trail) => void;
}

function useCardWords(trail: Trail) {
  const { t, tText } = useI18n();
  switch (trail.status) {
    case 'done':
      return { tag: t('dash.trail.done'), cta: t('dash.trail.review') };
    case 'locked':
      return { tag: t('dash.trail.after', { name: shortName(tText(trailName(trail.unlockedBy ?? trail.title))) }), cta: t('dash.trail.blocked') };
    case 'fresh':
      return { tag: t('dash.trail.fresh'), cta: t('dash.trail.start') };
    default:
      return { tag: t('dash.trail.inProgress'), cta: t('dash.trail.continue') };
  }
}

/** A trail as a card that is always on screen: name, state, the five days, its certification and one action. */
export function TrailCard({ trail, cert, onOpen }: Props) {
  const { t, tText } = useI18n();
  const { tag, cta } = useCardWords(trail);
  const locked = trail.status === 'locked';
  const done = trail.status === 'done';
  const primary = trail.status === 'in_progress' || trail.status === 'fresh';
  const name = tText(trailName(trail.title));
  const color = colorOfTrail(trail);
  const action = primary
    ? 'border-0 border-b-[5px] active:translate-y-[4px] active:border-b-[1px]'
    : done
      ? 'border border-b-[4px] bg-transparent active:translate-y-[3px] active:border-b'
      : 'border border-[#262320] bg-[#1C1916] text-[#8A8276]';
  const actionStyle = primary
    ? { background: color.c, color: color.ink, borderBottomColor: color.cd }
    : done
      ? { borderColor: color.c, borderBottomColor: color.cd, color: color.cl }
      : undefined;

  return (
    <article
      data-testid="trail-card"
      data-status={trail.status}
      aria-disabled={locked || undefined}
      className={`relative flex min-w-0 flex-auto flex-col justify-center gap-5 overflow-hidden rounded-[14px] border border-[#262320] border-b-[4px] bg-[#141210] py-5 pl-6 pr-5 sm:pl-8 sm:pr-7 ${locked ? 'text-[#A0978A]' : 'text-[#F4EDE2]'}`}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: locked ? '#262320' : color.c }} />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-col gap-1.5 md:w-[210px]">
          <span className="flex items-center gap-1.5 [font:500_12px_JetBrains_Mono]" style={{ color: locked ? '#A0978A' : color.cl }}>
            {locked && <LockGlyph size={13} />}
            {tag}
          </span>
          <h3 className="m-0 truncate [font:700_44px/1_'Barlow_Condensed'] max-sm:text-[36px]">{name}</h3>
          <span className="truncate [font:400_13px_Inter] text-[#A0978A]">
            {programLabel(tText(trail.programTitle))} · {t('passport.days', { done: trail.doneDays, total: trail.days.length })}
          </span>
        </div>
        <TrailCertLine done={trail.doneDays} total={trail.days.length} locked={locked} cert={cert} />
        <button
          type="button"
          data-testid="trail-card-action"
          disabled={locked}
          style={actionStyle}
          onClick={() => onOpen(trail)}
          className={`inline-flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl px-6 [font:700_20px_'Barlow_Condensed'] uppercase tracking-[.03em] transition-transform duration-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3FD17F] enabled:cursor-pointer disabled:cursor-not-allowed sm:w-[210px] ${action}`}
        >
          {locked && <LockGlyph size={16} />}
          {cta}
        </button>
      </div>
      <TrailDayPath trail={trail} muted={locked} color={color} />
    </article>
  );
}
