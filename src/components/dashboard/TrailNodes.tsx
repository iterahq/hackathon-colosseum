import type { PathNode, TrailColor, TrailPath } from '@/types/trailDashboard';

type Variant = 'hero' | 'mini';

const STROKES: Record<Variant, { base: number; dash: string; live: string; node: number; icon: number }> = {
  hero: { base: 4, dash: '8 8', live: '8 6', node: 2.5, icon: 2.6 },
  mini: { base: 2.5, dash: '5 5', live: '5 5', node: 2, icon: 2 },
};

const lit = (n: PathNode) => n.state !== 'upcoming';

/** The dashed line of a trail: the whole path, the finished legs and the animated leg to the current day. */
export function TrailLegs({ path, color, variant }: { path: TrailPath; color: TrailColor; variant: Variant }) {
  const s = STROKES[variant];
  return (
    <>
      <path d={path.base} fill="none" stroke="#2E2A25" strokeWidth={s.base} strokeDasharray={s.dash} />
      <path d={path.done} fill="none" stroke={color.c} strokeWidth={s.base} />
      {variant === 'hero' && (
        <path d={path.live} fill="none" stroke={color.c} strokeWidth={s.base} strokeDasharray={s.live} className="dash-flow" />
      )}
    </>
  );
}

/** The day nodes: a check when done, a lock when waiting, the day number (hero only) on the current one. */
export function TrailNodes({ nodes, color, variant }: { nodes: PathNode[]; color: TrailColor; variant: Variant }) {
  const s = STROKES[variant];
  return (
    <>
      {nodes.map((n) => (
        <g key={n.day}>
          {n.ring > 0 && variant === 'hero' && (
            <circle cx={n.cx} cy={n.cy} r={n.ring} fill="none" stroke={color.c} strokeWidth={2} className="dash-pulse" />
          )}
          <circle cx={n.cx} cy={n.cy} r={n.r} fill={lit(n) ? color.c : '#1C1916'} stroke={lit(n) ? color.cd : '#2E2A25'} strokeWidth={s.node} />
          {n.icon && (
            <path d={n.icon} fill="none" stroke={lit(n) ? color.ink : '#8A8276'} strokeWidth={s.icon} strokeLinecap="round" strokeLinejoin="round" />
          )}
          {n.label && variant === 'hero' && (
            <text x={n.cx} y={n.textY} textAnchor="middle" fontFamily="JetBrains Mono" fontWeight={700} fontSize={n.fontSize} fill={color.ink}>
              {n.label}
            </text>
          )}
        </g>
      ))}
    </>
  );
}
