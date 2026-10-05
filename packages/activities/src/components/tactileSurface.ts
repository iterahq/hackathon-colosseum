import {
  TACTILE_MISS,
  TACTILE_PICKED,
  TACTILE_PRESSABLE,
  TACTILE_RIGHT,
  TACTILE_SURFACE,
} from './tactile.js';
import { TOUCH_SURFACE } from './touchSurface.js';

export type SurfaceState = 'idle' | 'picked' | 'right' | 'miss' | 'lifted';

// TACTILE_SURFACE carries the resting border and fill. Tailwind orders two
// colour utilities by its own stylesheet, not by class order, so a state's
// colours can only win when the resting ones are left out.
const SURFACE_BASE = TACTILE_SURFACE.replace(' border-border bg-card', '');
const RESTING_COLORS = 'border-border bg-card';
const PRESS_ONLY = 'cursor-pointer active:translate-y-[2px] active:border-b-2';

const STATE_CLASSES: Record<SurfaceState, string> = {
  idle: RESTING_COLORS,
  picked: TACTILE_PICKED,
  right: TACTILE_RIGHT,
  miss: TACTILE_MISS,
  lifted: 'border-evergreen bg-card shadow-[0_10px_24px_rgba(0,0,0,0.45)]',
};

/** The class list of a tactile surface in one state, with no conflicting colours. */
export function tactileSurface(state: SurfaceState, pressable: boolean): string {
  const press = !pressable ? '' : state === 'idle' ? TACTILE_PRESSABLE : PRESS_ONLY;
  return `${SURFACE_BASE} ${TOUCH_SURFACE} ${STATE_CLASSES[state]} ${press}`.trim();
}
