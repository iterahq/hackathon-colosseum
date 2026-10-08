/**
 * The tactile vocabulary every graded kind shares: surfaces with a ledge that
 * press down, one neutral "miss" look, and the motion presets around them.
 *
 * A miss is NEVER red inside an activity (Tainan, 2026-10-02): the wrong pick
 * goes dashed and quiet while the right one turns green. Red stays outside, in
 * the host's feedback footer.
 */
import type { Transition } from 'framer-motion';

/** The main call to action: a green key that sinks when pressed. */
export const TACTILE_CTA =
  'bg-evergreen text-obsidiana font-semibold shadow-[0_4px_0_#249457] transition-[transform,box-shadow,background-color] duration-100 hover:bg-evergreen-hi active:translate-y-[3px] active:shadow-[0_1px_0_#249457] disabled:translate-y-0 disabled:opacity-40 disabled:shadow-[0_4px_0_#249457] disabled:cursor-not-allowed';

/** The quieter action beside a CTA: an outlined key with the same ledge and press. */
export const TACTILE_SECONDARY =
  'border-2 border-b-4 border-border bg-card font-semibold text-foreground/80 transition-[transform,border-color,color] duration-100 hover:border-foreground/25 hover:text-foreground active:translate-y-[2px] active:border-b-2 disabled:translate-y-0 disabled:border-b-4 disabled:opacity-40 disabled:cursor-not-allowed';

/** A CTA after it settled: flat, no ledge, no press. */
export const TACTILE_CTA_SETTLED = 'bg-evergreen/15 text-menta border border-evergreen/40 cursor-default';

/** A settled CTA whose answer missed — quiet, never red. */
export const TACTILE_CTA_MISSED = 'border border-dashed border-foreground/30 text-foreground/60 cursor-default';

/** The resting surface of anything the learner can pick, drag or tap. */
export const TACTILE_SURFACE = 'rounded-2xl border-2 border-b-4 border-border bg-card transition-[transform,border-color,background-color] duration-100';

/** Added to a surface that still answers a press. */
export const TACTILE_PRESSABLE = 'cursor-pointer hover:border-foreground/25 active:translate-y-[2px] active:border-b-2';

/** A surface the learner picked, before any verdict. */
export const TACTILE_PICKED = 'border-evergreen bg-evergreen-soft/60';

/** A surface the verdict confirmed. */
export const TACTILE_RIGHT = 'border-evergreen bg-evergreen/10';

/** A surface the verdict missed: dashed and quiet. */
export const TACTILE_MISS = 'border-dashed border-foreground/30 bg-transparent text-foreground/60';

/** The spring a verdict mark or a picked surface lands with. */
export const SPRING_POP: Transition = { type: 'spring', stiffness: 520, damping: 22 };

/** The spring a reordered or dropped surface settles with. */
export const SPRING_SETTLE: Transition = { type: 'spring', stiffness: 420, damping: 32 };

/** Entrance of the nth item in a list: a short rise, staggered. */
export function enterItem(index: number, reduced: boolean | null) {
  return {
    initial: reduced ? false : ({ opacity: 0, y: 10 } as const),
    animate: { opacity: 1, y: 0 },
    transition: { ...SPRING_SETTLE, delay: reduced ? 0 : Math.min(index, 8) * 0.045 },
  };
}
