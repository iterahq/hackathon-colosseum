import { useSyncExternalStore } from 'react';

/** Tailwind's `sm` breakpoint is 640 px; a phone is anything narrower. */
export const NARROW_VIEWPORT_QUERY = '(max-width: 639.98px)';

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(NARROW_VIEWPORT_QUERY);
  query.addEventListener?.('change', onChange);
  return () => query.removeEventListener?.('change', onChange);
}

const read = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_VIEWPORT_QUERY).matches;

/** True on a phone-width viewport. Wide screens (and a missing `matchMedia`) read false. */
export function useNarrowViewport(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
