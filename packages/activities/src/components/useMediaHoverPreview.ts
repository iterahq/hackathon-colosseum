/**
 * useMediaHoverPreview — the hover-intent state behind the big image preview.
 *
 * Only a hover-capable fine pointer opens it (touch keeps tap → lightbox); it
 * waits a beat so a mouse sweeping across the page to scroll does not flash a
 * full-screen image, and closes with no delay on leave, press or Escape. The
 * one exception to "leave closes": a pointer heading for the switch on the
 * open preview (`hoverTravel`) keeps it open until it gets there, turns
 * away, or pauses. The learner's switch is global, OFF until turned on, and
 * shared through `mediaHoverPreference`.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PointerEventHandler } from 'react';
import { useActivityStorage } from '../context.js';
import {
  MEDIA_HOVER_PREFERENCE_KEY,
  readMediaHoverPreference,
  resetMediaHoverPreference,
  subscribeMediaHoverPreference,
  writeMediaHoverPreference,
} from '../internal/mediaHoverPreference.js';
import { isInside, travelKeepsOpen, type Point } from '../internal/hoverTravel.js';

export const HOVER_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
export const HOVER_OPEN_DELAY_MS = 160;
/** A pointer that stops on its way to the preview switch is not going there. */
export const HOVER_TRAVEL_IDLE_MS = 300;

function matchesHoverPointer(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(HOVER_POINTER_QUERY).matches
    : false;
}

export interface MediaHoverZoneHandlers {
  onPointerEnter: PointerEventHandler;
  onPointerLeave: PointerEventHandler;
  onPointerDown: PointerEventHandler;
}

export function useMediaHoverPreview() {
  const storage = useActivityStorage();
  const enabled = useSyncExternalStore(
    subscribeMediaHoverPreference,
    () => readMediaHoverPreference(storage),
    () => false,
  );
  const setEnabled = useCallback((next: boolean) => writeMediaHoverPreference(storage, next), [storage]);

  const [finePointer, setFinePointer] = useState(matchesHoverPointer);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(HOVER_POINTER_QUERY);
    const update = () => setFinePointer(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  // Another tab flipped the switch: drop the cached value so this one follows.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === MEDIA_HOVER_PREFERENCE_KEY) resetMediaHoverPreference();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  openRef.current = open;
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const switchRef = useRef<HTMLButtonElement | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const travel = useRef<{ last: Point | null; idle: ReturnType<typeof setTimeout> | null; stop: () => void } | null>(null);
  const endTravel = useCallback(() => {
    travel.current?.stop();
    travel.current = null;
  }, []);

  const close = useCallback(() => {
    cancel();
    endTravel();
    setOpen(false);
  }, [cancel, endTravel]);

  const beginTravel = useCallback(
    (from: Point) => {
      endTravel();
      const state = { last: from, idle: null as ReturnType<typeof setTimeout> | null, stop: () => {} };
      const armIdle = () => {
        if (state.idle !== null) clearTimeout(state.idle);
        state.idle = setTimeout(close, HOVER_TRAVEL_IDLE_MS);
      };
      const onMove = (event: PointerEvent) => {
        const point = { x: event.clientX, y: event.clientY };
        const target = switchRef.current?.getBoundingClientRect();
        const thumb = thumbRef.current?.getBoundingClientRect();
        if (thumb && isInside(point, thumb)) {
          endTravel();
          return;
        }
        if (!target || !travelKeepsOpen(state.last, point, target)) {
          close();
          return;
        }
        state.last = point;
        if (isInside(point, target)) {
          if (state.idle !== null) clearTimeout(state.idle);
          state.idle = null;
        } else armIdle();
      };
      window.addEventListener('pointermove', onMove);
      state.stop = () => {
        window.removeEventListener('pointermove', onMove);
        if (state.idle !== null) clearTimeout(state.idle);
      };
      armIdle();
      travel.current = state;
    },
    [close, endTravel],
  );

  useEffect(() => () => {
    cancel();
    endTravel();
  }, [cancel, endTravel]);
  useEffect(() => {
    if (!enabled) close();
  }, [enabled, close]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const handlers: MediaHoverZoneHandlers = {
    onPointerEnter: () => {
      if (!enabled || !finePointer) return;
      endTravel();
      cancel();
      if (openRef.current) return;
      timer.current = setTimeout(() => setOpen(true), HOVER_OPEN_DELAY_MS);
    },
    onPointerLeave: (event) => {
      if (openRef.current && switchRef.current) beginTravel({ x: event.clientX, y: event.clientY });
      else close();
    },
    onPointerDown: close,
  };

  const disable = useCallback(() => {
    setEnabled(false);
    close();
  }, [setEnabled, close]);

  return {
    enabled,
    setEnabled,
    disable,
    finePointer,
    open: open && enabled && finePointer,
    handlers,
    thumbRef,
    switchRef,
  };
}
