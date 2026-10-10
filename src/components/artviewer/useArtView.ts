/** Zoom and pan state of the art viewer: wheel, pinch, drag, double click and keys, all through `artViewerMath`. */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { VIEW_HOME, ZOOM_STEP, clampPan, fitSize, zoomAt, type Size, type View } from './artViewerMath';

const PAN_KEYS: Record<string, [number, number]> = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] };

export function useArtView(aspect: number) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stage, setStage] = useState<Size>({ width: 0, height: 0 });
  const [view, setView] = useState<View>(VIEW_HOME);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const fit = fitSize(stage, aspect);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => setView((v) => clampPan(v, fit, stage)), [fit.width, fit.height, stage.width, stage.height]); // eslint-disable-line react-hooks/exhaustive-deps

  const fromCentre = useCallback((clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 } : { x: 0, y: 0 };
  }, []);

  const zoomBy = useCallback((factor: number, point = { x: 0, y: 0 }) => setView((v) => zoomAt(v, v.zoom * factor, point, fit, stage)), [fit, stage]);
  const reset = useCallback(() => setView(VIEW_HOME), []);

  // React attaches wheel listeners as passive: the page would scroll behind the viewer.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, fromCentre(e.clientX, e.clientY));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy, fromCentre]);

  const onPointerDown = (e: ReactPointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const previous = pointers.current.get(e.pointerId);
    if (!previous) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const all = [...pointers.current.values()];
    if (all.length === 2) {
      const distance = Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y);
      if (pinch.current) zoomBy(distance / pinch.current, fromCentre((all[0].x + all[1].x) / 2, (all[0].y + all[1].y) / 2));
      pinch.current = distance;
      return;
    }
    setView((v) => clampPan({ zoom: v.zoom, x: v.x + e.clientX - previous.x, y: v.y + e.clientY - previous.y }, fit, stage));
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
  };

  const onKey = useCallback(
    (key: string): boolean => {
      if (key === '+' || key === '=') zoomBy(ZOOM_STEP);
      else if (key === '-' || key === '_') zoomBy(1 / ZOOM_STEP);
      else if (key === '0') reset();
      else if (PAN_KEYS[key]) setView((v) => clampPan({ zoom: v.zoom, x: v.x + PAN_KEYS[key][0], y: v.y + PAN_KEYS[key][1] }, fit, stage));
      else return false;
      return true;
    },
    [zoomBy, reset, fit, stage]
  );

  return {
    stageRef,
    view,
    fit,
    ready: stage.width > 0,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
    toggle: (e: { clientX: number; clientY: number }) => (view.zoom > 1 ? reset() : zoomBy(2.5, fromCentre(e.clientX, e.clientY))),
    reset,
    onKey,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
