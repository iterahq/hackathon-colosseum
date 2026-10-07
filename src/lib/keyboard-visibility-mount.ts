/**
 * Keeps the field a learner is typing in on screen when the phone keyboard
 * rises. Two platforms, two behaviours (see `keyboard-visibility.ts`):
 *
 *  - the keyboard resizes the layout viewport (Android WebView): the page is
 *    shorter and the focused field may be below the new bottom edge;
 *  - only the visual viewport shrinks (iOS, Android Chrome): the layout stays,
 *    the keyboard covers its lower part, and a page with no overflow cannot
 *    scroll the field up. `--keyboard-inset` gives the document that much
 *    extra height (see `src/index.css`) while the keyboard is up.
 *
 * The inset follows the KEYBOARD, not focus: it is dropped by the `resize` that
 * closes the keyboard, so moving focus between fields or to a button never makes
 * the content jump while the keyboard animates. A field is moved with ONE
 * `window.scrollBy` computed from a freshly read visual viewport, and only when
 * it is clipped by it.
 *
 * Coarse pointers only: a laptop with a fine pointer never runs any of it.
 */
import { FIELD_MARGIN, isEditableField, isPinchZoomed, keyboardInset, scrollDelta, scrollPlan } from './keyboard-visibility';

/** The keyboard resizes the viewport in steps; act after the last one. */
const SETTLE_MS = 120;
/**
 * Android needs 250-300 ms to shrink the viewport after a focus. A focus before
 * the keyboard is up waits for the `resize`; this single late pass is only for
 * platforms that fire none in the resize model.
 */
const FALLBACK_MS = 400;

export function mountKeyboardVisibility(win: Window = window): void {
  if (!win.matchMedia?.('(pointer: coarse)').matches) return;
  const doc = win.document;
  const vv = win.visualViewport;
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** The visual viewport as it is right now, or null while pinch-zoomed. */
  const visibleArea = () => {
    if (vv && isPinchZoomed(vv.scale)) return null;
    const top = vv?.offsetTop ?? 0;
    const height = vv?.height ?? win.innerHeight;
    return { top, bottom: top + height, covered: keyboardInset(win.innerHeight, height, top) };
  };

  const syncInset = () => {
    const covered = visibleArea()?.covered ?? 0;
    // A little over the keyboard, so a field at the very end of the page can clear it.
    doc.documentElement.style.setProperty('--keyboard-inset', `${covered > 0 ? covered + 2 * FIELD_MARGIN : 0}px`);
  };

  const spanOf = (el: HTMLElement) => {
    const box = el.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom };
  };

  const settle = () => {
    syncInset();
    const el = doc.activeElement;
    const visible = visibleArea();
    if (!visible || !isEditableField(el)) return;
    const field = spanOf(el);
    const plan = scrollPlan(field, visible);
    if (plan === 'none') return;
    win.scrollBy(0, scrollDelta(field, visible, plan));
  };

  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(settle, ms);
  };

  doc.addEventListener('focusin', () => {
    syncInset();
    const el = doc.activeElement;
    const visible = visibleArea();
    if (!visible || !isEditableField(el)) return;
    const field = spanOf(el);
    const keyboardUp = visible.covered > 0 || field.bottom > win.innerHeight || field.top < 0;
    schedule(keyboardUp ? SETTLE_MS : FALLBACK_MS);
  });
  vv?.addEventListener('resize', () => {
    syncInset();
    if (isEditableField(doc.activeElement)) schedule(SETTLE_MS);
  });
}
