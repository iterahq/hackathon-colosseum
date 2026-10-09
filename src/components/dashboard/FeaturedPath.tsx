import { useI18n } from '@/i18n';
import type { PathNode, Trail, TrailColor } from '@/types/trailDashboard';
import { dayName, trailPath } from '@/utils/trailDashboard';
import { TrailLegs, TrailNodes } from './TrailNodes';

interface Props {
  trail: Trail;
  color: TrailColor;
  onOpenDay: (lessonId: string) => void;
}

const W = 740;
const H = 250;
const ROW = 84;

const hit = (n: PathNode) => Math.max(44, n.r * 2);

/** A day is openable once it is done or current; the ones after wait for the current one. */
function DayButton({ node, title, size, onOpen, style }: { node: PathNode; title: string; size: number; onOpen: () => void; style: React.CSSProperties }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      aria-label={t('dash.dayAria', { n: node.day, title })}
      disabled={node.state === 'upcoming'}
      onClick={onOpen}
      className="absolute rounded-full bg-transparent enabled:cursor-pointer disabled:cursor-default"
      style={{ width: size, height: size, ...style }}
    />
  );
}

/** The featured trail's days: a wide zig-zag from 640 px up, a tall one beside the day names on a phone. */
export function FeaturedPath({ trail, color, onOpenDay }: Props) {
  const { t, tText } = useI18n();
  const states = trail.days.map((d) => d.state);
  const wide = trailPath(states, { W, H: 150, A: 34, r: 30 });
  const tallH = Math.max(H, trail.days.length * ROW);
  const tall = trailPath(states, { W: 170, H: tallH, A: 28, r: 26, vertical: true });
  const labelWidth = `${Math.min(18, 90 / trail.days.length)}%`;

  return (
    <>
      <div className="relative hidden w-full max-w-[740px] sm:block" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full overflow-visible">
          <TrailLegs path={wide} color={color} variant="hero" />
          <TrailNodes nodes={wide.nodes} color={color} variant="hero" />
        </svg>
        {wide.nodes.map((n) => {
          const day = trail.days[n.day - 1];
          return (
            <div key={day.id}>
              <DayButton
                node={n}
                title={tText(dayName(day.title))}
                size={hit(n)}
                onOpen={() => onOpenDay(day.id)}
                style={{ left: `${(n.cx / W) * 100}%`, top: `${(n.cy / H) * 100}%`, transform: 'translate(-50%,-50%)' }}
              />
              <div
                className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center gap-0.5 text-center"
                style={{ left: `${(n.cx / W) * 100}%`, top: `${((n.cy + n.r + 14) / H) * 100}%`, width: labelWidth }}
              >
                <span className="[font:500_12px_JetBrains_Mono]" style={{ color: n.state === 'current' ? color.cl : '#F4EDE2' }}>
                  {t('dash.day', { n: n.day })}
                </span>
                <span className="[font:500_13px/1.25_Inter] text-[#A0978A]">{tText(dayName(day.title))}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative w-full sm:hidden" style={{ height: tallH }}>
        <svg width={170} height={tallH} className="absolute left-0 top-0 overflow-visible">
          <TrailLegs path={tall} color={color} variant="hero" />
          <TrailNodes nodes={tall.nodes} color={color} variant="hero" />
        </svg>
        {tall.nodes.map((n) => {
          const day = trail.days[n.day - 1];
          return (
            <div key={day.id}>
              <DayButton
                node={n}
                title={tText(dayName(day.title))}
                size={hit(n)}
                onOpen={() => onOpenDay(day.id)}
                style={{ left: n.cx - hit(n) / 2, top: n.cy - hit(n) / 2 }}
              />
              <div className="pointer-events-none absolute right-0 flex flex-col gap-0.5" style={{ left: 184, top: n.cy - 18 }}>
                <span className="[font:500_12px_JetBrains_Mono]" style={{ color: n.state === 'current' ? color.cl : '#F4EDE2' }}>
                  {t('dash.day', { n: n.day })}
                </span>
                <span className="[font:500_13px/1.25_Inter] text-[#A0978A]">{tText(dayName(day.title))}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
