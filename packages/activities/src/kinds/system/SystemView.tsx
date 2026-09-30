import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useActivityI18n } from '../../context.js';
import { localizedText } from '../../internal/localizedText.js';
import type { SceneLocalizedText, ViewBind, ViewNode } from '../../specs.js';
import { SceneBrowserBar } from '../scene/SceneBrowserBar.js';
import { SCENE_PAGE_BACKGROUND } from '../scene/sceneTheme.js';
import { getPath, isBind, renderId } from './viewModel.js';

export interface SystemRegion {
  id: string;
  label: string;
  color: string;
  /** One outline per segment; each segment is the rendered ids it wraps. The label sits on one of them. */
  segments: readonly (readonly string[])[];
  depth: number;
}

export interface SystemViewProps {
  view: ViewNode;
  state?: unknown;
  urlLabel?: string;
  highlight?: readonly string[];
  selected?: ReadonlySet<string>;
  selectable?: boolean;
  tappable?: ReadonlySet<string>;
  onTap?: (id: string) => void;
  onLasso?: (ids: string[]) => void;
  regions?: readonly SystemRegion[];
  inputValues?: Readonly<Record<string, string>>;
  unboundLabel?: (id: string) => string | undefined;
  testId?: string;
}

const INK = '#3B1F2B';
const BODY = '#6B4452';
const ACCENT = '#6366F1';

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function unionOf(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  return { left, top, width: right - left, height: bottom - top };
}

function intersects(a: Box, b: Box): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

/** A declarative mini-interface rendered from data — the shared stage of the system kinds. */
export function SystemView({
  view,
  state,
  urlLabel = 'app',
  highlight = [],
  selected,
  selectable = false,
  tappable,
  onTap,
  onLasso,
  regions = [],
  inputValues,
  unboundLabel,
  testId = 'system-view',
}: SystemViewProps) {
  const { locale } = useActivityI18n();
  const stageRef = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const [boxes, setBoxes] = useState<Record<string, Box[]>>({});
  const [lasso, setLasso] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const text = (value: SceneLocalizedText | ViewBind | undefined, scope: unknown, id: string): { value: string; bound: boolean } => {
    if (isBind(value)) {
      const resolved = getPath(scope, value.bind);
      if (resolved != null) return { value: String(resolved), bound: true };
      const label = unboundLabel?.(id);
      return label ? { value: label, bound: true } : { value: value.bind, bound: false };
    }
    return { value: localizedText(value ?? '', locale), bound: true };
  };

  const register = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) nodes.current.set(id, el);
      else nodes.current.delete(id);
    },
    [],
  );

  const boxOf = useCallback((el: HTMLElement): Box => {
    const stage = stageRef.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { left: r.left - (stage?.left ?? 0), top: r.top - (stage?.top ?? 0), width: r.width, height: r.height };
  }, []);

  const regionKey = regions.map((r) => `${r.id}:${r.depth}:${r.segments.map((seg) => seg.join(',')).join(';')}`).join('|');
  const regionsRef = useRef(regions);
  regionsRef.current = regions;

  useLayoutEffect(() => {
    const regions = regionsRef.current;
    if (regions.length === 0) {
      setBoxes({});
      return;
    }
    const measure = () => {
      const next: Record<string, Box[]> = {};
      const maxDepth = Math.max(0, ...regions.map((r) => r.depth));
      for (const region of regions) {
        const pad = 4 + (maxDepth - region.depth) * 6;
        const outlines = region.segments
          .map((segment) =>
            unionOf(segment.map((id) => nodes.current.get(id)).filter((el): el is HTMLElement => !!el).map(boxOf)),
          )
          .filter((union): union is Box => !!union)
          .map((union) => ({
            left: union.left - pad,
            top: union.top - pad,
            width: union.width + pad * 2,
            height: union.height + pad * 2,
          }));
        if (outlines.length > 0) next[region.id] = outlines;
      }
      setBoxes(next);
    };
    measure();
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [regionKey, boxOf]);

  const startLasso = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onLasso || event.pointerType !== 'mouse' || event.button !== 0) return;
    if ((event.target as HTMLElement).closest('[data-system-leaf]')) return;
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage) return;
    const x = event.clientX - stage.left;
    const y = event.clientY - stage.top;
    setLasso({ x0: x, y0: y, x1: x, y1: y });
  };

  const moveLasso = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!lasso) return;
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage) return;
    setLasso({ ...lasso, x1: event.clientX - stage.left, y1: event.clientY - stage.top });
  };

  const endLasso = () => {
    if (!lasso) return;
    const area: Box = {
      left: Math.min(lasso.x0, lasso.x1),
      top: Math.min(lasso.y0, lasso.y1),
      width: Math.abs(lasso.x1 - lasso.x0),
      height: Math.abs(lasso.y1 - lasso.y0),
    };
    setLasso(null);
    if (area.width < 8 && area.height < 8) return;
    const hits: string[] = [];
    nodes.current.forEach((el, id) => {
      if (el.dataset.systemLeaf !== undefined && intersects(area, boxOf(el))) hits.push(id);
    });
    if (hits.length > 0) onLasso?.(hits);
  };

  const highlighted = new Set(highlight);

  const renderLeaf = (node: ViewNode, id: string, scope: unknown): ReactNode => {
    switch (node.type) {
      case 'heading':
        return (
          <span
            style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 26, lineHeight: 1.05, color: INK }}
          >
            {text(node.text, scope, id).value}
          </span>
        );
      case 'text': {
        const t = text(node.text, scope, id);
        return <span style={{ fontSize: 15, color: BODY, fontFamily: t.bound ? undefined : 'monospace' }}>{t.value}</span>;
      }
      case 'input': {
        const typed = inputValues?.[id];
        const bound = node.value ? getPath(scope, node.value.bind) : undefined;
        const value = typed ?? (bound == null ? '' : String(bound));
        return (
          <span
            className="block w-full truncate rounded-lg border bg-white px-3 py-2 text-left text-[14px]"
            style={{ borderColor: '#E7D3DA', color: value ? INK : '#B39AA3' }}
          >
            {value || localizedText(node.placeholder ?? '', locale)}
          </span>
        );
      }
      case 'button':
        return (
          <span
            className="inline-block whitespace-nowrap rounded-full px-4 py-2 text-[14px] font-bold text-white"
            style={{ background: '#DB2777', boxShadow: '0 4px 0 #9D174D' }}
          >
            {localizedText(node.text, locale)}
          </span>
        );
      case 'checkbox_item': {
        const done = getPath(scope, node.checked.bind) === true;
        const t = text(node.text, scope, id);
        return (
          <span className="flex w-full items-center gap-3 rounded-lg bg-white/70 px-3 py-2 text-left">
            <span
              className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border-2 transition-colors"
              style={{ borderColor: done ? '#16A34A' : '#C9B3BB', background: done ? '#22C55E' : 'white' }}
              data-checked={done ? 'true' : 'false'}
            >
              {done && <Check className="h-3 w-3 text-white" strokeWidth={4} />}
            </span>
            <span
              className="text-[15px]"
              style={{
                color: done ? '#A08790' : INK,
                textDecoration: done ? 'line-through' : undefined,
                fontFamily: t.bound ? undefined : 'monospace',
              }}
            >
              {t.value}
            </span>
          </span>
        );
      }
      default:
        return null;
    }
  };

  const renderNode = (node: ViewNode, scope: unknown, index: number | undefined, rowParent: boolean): ReactNode => {
    const id = renderId(node.id, index);
    const lit = highlighted.has(id);
    const ring: CSSProperties = lit
      ? { boxShadow: '0 0 0 3px #F59E0B, 0 0 18px 4px rgba(245,158,11,0.45)', borderRadius: 10 }
      : {};
    if (node.type === 'box') {
      const row = node.children.length > 0 && node.children.every((c) => c.type === 'input' || c.type === 'button');
      return (
        <div
          key={id}
          ref={register(id)}
          data-view-id={id}
          data-testid={`system-node-${id}`}
          data-highlighted={lit ? 'true' : undefined}
          className={row ? 'flex items-center gap-2' : 'flex flex-col gap-4'}
          style={{ ...ring, transition: 'box-shadow 200ms' }}
        >
          {node.children.map((child) => renderNode(child, scope, index, row))}
        </div>
      );
    }
    if (node.type === 'list') {
      const items = getPath(scope, node.bind);
      const list = Array.isArray(items) ? items : [];
      return (
        <div
          key={id}
          ref={register(id)}
          data-view-id={id}
          data-testid={`system-node-${id}`}
          data-highlighted={lit ? 'true' : undefined}
          className="flex flex-col gap-2.5"
          style={{ ...ring, transition: 'box-shadow 200ms' }}
        >
          {list.length === 0 ? (
            <span className="py-3 text-center text-[13px]" style={{ color: '#B39AA3' }}>
              {localizedText(node.empty ?? '', locale)}
            </span>
          ) : (
            list.map((item, i) => renderNode(node.item, item, i, false))
          )}
        </div>
      );
    }
    const isSelected = selected?.has(id) ?? false;
    const interactive = selectable || (tappable?.has(id) ?? false);
    const grow = rowParent && node.type === 'input' ? 'flex-1 min-w-0' : '';
    const cue = tappable?.has(id) && !lit ? { boxShadow: '0 0 0 2px #F59E0B', borderRadius: 10 } : {};
    const style: CSSProperties = {
      ...cue,
      ...ring,
      ...(isSelected ? { boxShadow: `0 0 0 2px ${ACCENT}`, background: 'rgba(99,102,241,0.12)', borderRadius: 10 } : {}),
      transition: 'box-shadow 200ms, background 200ms',
    };
    const common = {
      ref: register(id),
      'data-view-id': id,
      'data-system-leaf': '',
      'data-testid': `system-node-${id}`,
      'data-selected': isSelected ? 'true' : undefined,
      'data-highlighted': lit ? 'true' : undefined,
    };
    if (interactive) {
      return (
        <button
          key={id}
          type="button"
          {...common}
          aria-pressed={selectable ? isSelected : undefined}
          onClick={() => onTap?.(id)}
          className={`block text-left p-0.5 -m-0.5 cursor-pointer ${node.type === 'checkbox_item' ? 'w-full' : ''} ${grow}`}
          style={style}
        >
          {renderLeaf(node, id, scope)}
        </button>
      );
    }
    return (
      <div key={id} {...common} className={`p-0.5 -m-0.5 ${grow}`} style={style}>
        {renderLeaf(node, id, scope)}
      </div>
    );
  };

  return (
    <div className="rounded-xl overflow-hidden border border-black/10" style={{ background: SCENE_PAGE_BACKGROUND }} data-testid={testId}>
      <SceneBrowserBar url={urlLabel} />
      <div
        ref={stageRef}
        className="relative p-5 sm:p-6 select-none"
        style={{ touchAction: lasso ? 'none' : undefined }}
        onPointerDown={startLasso}
        onPointerMove={moveLasso}
        onPointerUp={endLasso}
        onPointerLeave={endLasso}
      >
        {renderNode(view, state, undefined, false)}
        {regions.map((region) => {
          const outlines = boxes[region.id];
          if (!outlines) return null;
          // A top label goes on the first outline, a bottom label on the last.
          const top = region.depth % 2 === 0;
          const labelled = top ? 0 : outlines.length - 1;
          return outlines.map((box, i) => (
            <div
              key={`${region.id}-${i}`}
              data-testid={i === 0 ? `system-region-${region.id}` : `system-region-${region.id}-${i}`}
              data-region={region.id}
              className="pointer-events-none absolute rounded-xl border-2 border-dashed"
              style={{ ...box, borderColor: region.color, background: `${region.color}0F` }}
            >
              {i === labelled && (
                <span
                  className={`absolute right-2 z-10 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold leading-4 text-white shadow ${
                    top ? 'top-0 -translate-y-1/2' : 'bottom-0 translate-y-1/2'
                  }`}
                  style={{ background: region.color }}
                >
                  {region.label}
                </span>
              )}
            </div>
          ));
        })}
        {lasso && (
          <div
            className="pointer-events-none absolute rounded border border-dashed"
            style={{
              left: Math.min(lasso.x0, lasso.x1),
              top: Math.min(lasso.y0, lasso.y1),
              width: Math.abs(lasso.x1 - lasso.x0),
              height: Math.abs(lasso.y1 - lasso.y0),
              borderColor: ACCENT,
              background: 'rgba(99,102,241,0.08)',
            }}
          />
        )}
      </div>
    </div>
  );
}
