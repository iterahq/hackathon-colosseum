import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import type { Capabilities } from '@/types/learnerProfile';
import { graphLayout } from '@/components/graph/graphLayout';
import { isLit, type NodeView } from '@/components/graph/capabilityView';
import { nodeTier } from '@/components/graph/evidenceTier';
import { TierMedal } from '@/components/graph/TierMedal';
import '@/components/graph/graph.css';

const WIDE_FROM = 860;
const NARROW_MAX = 520;
const FALLBACK_WIDTH = 343;

interface Props {
  capabilities: Capabilities;
  views: Record<string, NodeView>;
  progress: Record<number, { proven: number; total: number }>;
  label: string;
  onSelect: (id: string) => void;
}

function Icon({ view, day }: { view: NodeView; day: number }) {
  const common = { width: 30, height: 30, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
  if (view === 'chain') return <svg {...common}><path d="M12 2.5l8 3v6c0 4.9-3.3 9.2-8 10.8-4.7-1.6-8-5.9-8-10.8v-6l8-3z" /><path d="M8.3 12.2l2.6 2.6 4.8-5.2" /></svg>;
  if (view === 'server' || view === 'checking') return <svg {...common}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
  if (view === 'recorded') return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
  if (view === 'unconfirmed') return <svg {...common}><path d="M12 6.5v7" /><path d="M12 17.5v.1" /></svg>;
  return <span className="[font:700_22px_'Barlow_Condensed']">{day}</span>;
}

export function CapabilityGraph({ capabilities, views, progress, label, onSelect }: Props) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const read = () => setMeasured(el.clientWidth);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const width = measured || FALLBACK_WIDTH;
  const mode = width >= WIDE_FROM ? 'wide' : 'narrow';
  const layout = useMemo(
    () => graphLayout(capabilities.nodes, mode, mode === 'narrow' ? Math.min(width, NARROW_MAX) : width),
    [capabilities.nodes, mode, width]
  );
  const nodes = useMemo(() => new Map(capabilities.nodes.map((n) => [n.id, n])), [capabilities.nodes]);
  const spots = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout.nodes]);
  const titles = useMemo(() => new Map(capabilities.trails.map((tr) => [tr.trail, tr.title])), [capabilities.trails]);

  return (
    <div ref={host} className="w-full" data-testid="capability-graph" data-mode={mode}>
      <div className="relative mx-auto" style={{ width: layout.width, height: layout.height }} role="group" aria-label={label}>
        <svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true">
          <defs>
            {layout.edges.map((e) => {
              const a = spots.get(e.from);
              const b = spots.get(e.to);
              return a && b ? (
                <linearGradient key={`${e.from}-${e.to}`} id={`graph-grad-${e.from}-${e.to}`} gradientUnits="userSpaceOnUse" x1={a.x} y1={a.y} x2={b.x} y2={b.y + 0.01}>
                  <stop offset="0" stopColor="#3FD17F" />
                  <stop offset="1" stopColor="#8DFFBC" />
                </linearGradient>
              ) : null;
            })}
          </defs>
          {layout.edges.map((e) => {
            const lit = isLit(views[e.from]) && isLit(views[e.to]);
            const key = `${e.from}-${e.to}`;
            return (
              <g key={key} data-edge={key} data-lit={lit} opacity={e.crossTrail ? 0.5 : 1}>
                <path d={e.path} fill="none" stroke="#2a2622" strokeWidth={e.crossTrail ? 1.25 : 2} strokeLinecap="round" />
                {lit && (
                  <>
                    <path d={e.path} fill="none" stroke={`url(#graph-grad-${key})`} strokeWidth={e.crossTrail ? 1.5 : 2.5} strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 4px rgba(63,209,127,.55))' }} />
                    <path d={e.path} className="graph-edge-flow" fill="none" stroke="#F4EDE2" strokeOpacity={0.55} strokeWidth={e.crossTrail ? 1 : 1.5} strokeLinecap="round" strokeDasharray="3 19" />
                  </>
                )}
              </g>
            );
          })}
        </svg>
        {layout.trails.map((tr) => (
          <div key={tr.trail} className="absolute flex flex-col justify-end gap-1.5 pb-3" style={{ left: tr.x, top: tr.y, width: tr.width, height: 64 }}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="truncate [font:700_24px/1_'Barlow_Condensed'] text-[#F4EDE2]">{titles.get(tr.trail) || `#${tr.trail + 1}`}</h3>
              <span className="shrink-0 [font:500_12px_JetBrains_Mono] text-[#A0978A]">{t('graph.trailCount', { n: progress[tr.trail]?.proven ?? 0, total: progress[tr.trail]?.total ?? 0 })}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-[#262320]">
              <div className="h-full rounded-full bg-[#3FD17F]" style={{ width: `${((progress[tr.trail]?.proven ?? 0) / Math.max(1, progress[tr.trail]?.total ?? 1)) * 100}%` }} />
            </div>
          </div>
        ))}
        {layout.nodes.map((spot) => {
          const node = nodes.get(spot.id);
          if (!node) return null;
          const view = views[node.id] ?? 'open';
          const isNext = capabilities.next === node.id && view === 'open';
          const lit = isLit(view) || view === 'recorded';
          const tier = view === 'open' ? null : nodeTier(node);
          const status = t(`graph.status.${view}`);
          return (
            <button
              key={node.id}
              type="button"
              data-testid="graph-node"
              data-node-id={node.id}
              data-view={view}
              data-next={isNext}
              data-tier={tier ?? undefined}
              aria-haspopup="dialog"
              aria-label={t('graph.node.aria', { title: node.title, status: tier ? `${status}. ${t(`graph.tier.${tier}`)}` : status })}
              onClick={() => onSelect(node.id)}
              className="graph-node absolute flex flex-col items-center bg-transparent p-0"
              style={{ left: spot.x - layout.labelWidth / 2, top: spot.y - layout.radius, width: layout.labelWidth }}
            >
              <span className="relative">
                <span className="graph-medal">
                  <Icon view={view} day={node.day} />
                </span>
                {tier && <TierMedal tier={tier} className="absolute -bottom-1 -right-1" />}
                {isNext && <span className="graph-ring" aria-hidden="true" />}
                {isNext && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#3FD17F] px-2 py-0.5 [font:700_10px/1.2_JetBrains_Mono] tracking-[.08em] text-[#0A0908]">{t('graph.next')}</span>
                )}
              </span>
              <span
                className={`mt-2 line-clamp-3 w-full rounded-md bg-[#0A0908]/90 px-1 py-0.5 text-center [font:500_13px/1.3_Inter] max-sm:[font:500_12.5px/1.3_Inter] ${lit ? 'text-[#F4EDE2]' : 'text-[#A0978A]'}`}
                style={{ maxHeight: layout.labelHeight }}
              >
                {node.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
