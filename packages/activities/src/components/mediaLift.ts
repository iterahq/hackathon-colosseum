/**
 * Hover/focus "lift" shared by every media card (inline media blocks and the
 * instruction image/video box). Motion is dropped under prefers-reduced-motion;
 * the ring and shadow stay so the affordance is still visible.
 */
export const MEDIA_LIFT =
  'transition-transform duration-300 ease-out hover:scale-[1.03] hover:shadow-2xl hover:shadow-black/40 hover:ring-1 hover:ring-menta/40 focus-visible:scale-[1.03] focus-visible:shadow-2xl focus-visible:shadow-black/40 focus-visible:ring-1 focus-visible:ring-menta/40 focus-visible:outline-none focus-within:ring-1 focus-within:ring-menta/40 motion-reduce:transform-none motion-reduce:transition-none';
