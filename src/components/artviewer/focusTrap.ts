const FOCUSABLE = 'a[href],button:not([disabled]),select:not([disabled]),input:not([disabled])';

/** Keeps Tab inside `root`: from the last control it wraps to the first, and back. Call from a keydown handler. */
export function trapTab(event: KeyboardEvent, root: HTMLElement | null): void {
  if (event.key !== 'Tab' || !root) return;
  const nodes = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
  if (nodes.length === 0) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const active = document.activeElement;
  const outside = !root.contains(active);
  if (event.shiftKey && (active === first || outside)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || outside)) {
    event.preventDefault();
    first.focus();
  }
}
