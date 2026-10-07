/**
 * Decisions behind "the field being typed in stays visible above the phone
 * keyboard". Pure on purpose: the DOM wiring is `keyboard-visibility-mount.ts`.
 */

export interface Span {
  top: number;
  bottom: number;
}

/** Room kept between the field and the edge of the visible area. */
export const FIELD_MARGIN = 16;

/**
 * How much of the layout viewport the keyboard covers. Zero when the keyboard
 * resizes the layout viewport itself (`innerHeight` shrinks with it): nothing is
 * hidden below the page, the page is just shorter.
 */
export function keyboardInset(innerHeight: number, visibleHeight: number, visibleOffsetTop: number): number {
  return Math.max(0, Math.round(innerHeight - visibleHeight - visibleOffsetTop));
}

/** A pinch-zoomed page shrinks the visual viewport too; that is not a keyboard. */
export const SCALE_TOLERANCE = 0.01;

export function isPinchZoomed(scale: number): boolean {
  return Math.abs(scale - 1) > SCALE_TOLERANCE;
}

/**
 * Where a field goes, and only if it is actually clipped by the visible area.
 * The margin shapes the TARGET, never the trigger: a field the browser already
 * panned into view must not get a second hop. `center` when it fits in the
 * visible area; `start` when it is taller than that (a long textarea: its top
 * matters more than its middle).
 */
export function scrollPlan(field: Span, visible: Span, margin = FIELD_MARGIN): 'none' | 'center' | 'start' {
  const clipped = field.bottom > visible.bottom || field.top < visible.top;
  if (!clipped) return 'none';
  const fits = field.bottom - field.top <= visible.bottom - visible.top - 2 * margin;
  return fits ? 'center' : 'start';
}

/**
 * How far to scroll the page so the field lands where the plan says, measured
 * against the VISIBLE area. `scrollIntoView` aims at the layout viewport, which
 * is taller than the visible area while a keyboard covers part of it, and it
 * also scrolls `overflow: hidden` ancestors, which nothing restores.
 */
export function scrollDelta(field: Span, visible: Span, plan: 'none' | 'center' | 'start', margin = FIELD_MARGIN): number {
  if (plan === 'center') return (field.top + field.bottom) / 2 - (visible.top + visible.bottom) / 2;
  if (plan === 'start') return field.top - (visible.top + margin);
  return 0;
}

const NOT_TEXT = /^(checkbox|radio|button|submit|reset|range|hidden|file|image|color)$/;

/** A text field, a textarea or a contenteditable host: what raises a keyboard. */
export function isEditableField(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return !NOT_TEXT.test(el.type) && !el.readOnly && !el.disabled;
  return el.isContentEditable === true;
}
