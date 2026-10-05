/**
 * blockReveal — a block lands when the reader reaches it, and everything
 * inside (marks, list rows, the heading bar) waits for that moment instead of
 * animating unseen below the fold.
 */
import { createContext, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export interface BlockRevealState {
  /** The block is on screen (or the browser cannot tell, which counts as on screen). */
  landed: boolean;
  /** Seconds the block waits before it rises — its slot in the first-paint stagger. */
  delay: number;
}

export const BlockReveal = createContext<BlockRevealState>({ landed: true, delay: 0 });

/** A block that lands this soon after mount was above the fold, so it takes a stagger slot. */
const FIRST_PAINT_MS = 400;

export interface OnScreen {
  landed: boolean;
  /** Landed within the first paint — part of the opening cascade, not a scroll reveal. */
  early: boolean;
}

/**
 * True once any pixel of the node is on screen. Where nothing can observe
 * (jsdom, an old WebView) it is true from the start, so text is never held
 * back by a missing API.
 */
export function useOnScreen(ref: RefObject<Element | null>, disabled: boolean): OnScreen {
  const mountedAt = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const [state, setState] = useState<OnScreen>(() => ({
    landed: disabled || typeof IntersectionObserver === 'undefined',
    early: true,
  }));

  useEffect(() => {
    if (state.landed) return;
    const node = ref.current;
    if (!node) {
      setState({ landed: true, early: true });
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setState({ landed: true, early: performance.now() - mountedAt.current < FIRST_PAINT_MS });
      observer.disconnect();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, state.landed]);

  return disabled ? { landed: true, early: true } : state;
}
