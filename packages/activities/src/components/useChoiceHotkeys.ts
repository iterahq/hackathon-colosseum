import { useEffect, useRef, type RefObject } from 'react';

/** A, B, C… for the nth option; past Z, the number. */
export function optionKeyLabel(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

/** The option a key press names: a letter or a digit 1-9, or -1. */
export function optionIndexForKey(key: string, count: number): number {
  if (key.length !== 1) return -1;
  const lower = key.toLowerCase();
  const index = /[1-9]/.test(lower) ? Number(lower) - 1 : lower >= 'a' && lower <= 'z' ? lower.charCodeAt(0) - 97 : -1;
  return index >= 0 && index < count ? index : -1;
}

const TYPING = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/**
 * Keyboard play for a choice list: a letter or digit picks that option and
 * Enter submits. Live only while `enabled` and not under an `inert` ancestor,
 * and only for keys aimed at the activity itself or at nothing in particular
 * (then only the first live activity answers) — never at a text field.
 */
export function useChoiceHotkeys({
  scope,
  count,
  enabled,
  onPick,
  onSubmit,
}: {
  scope: RefObject<HTMLElement>;
  count: number;
  enabled: boolean;
  onPick: (index: number) => void;
  onSubmit: () => void;
}) {
  const latest = useRef({ count, onPick, onSubmit });
  latest.current = { count, onPick, onSubmit };

  // Marks the live roots so a key aimed at nothing in particular has one owner.
  useEffect(() => {
    const root = scope.current;
    if (!enabled || !root) return;
    root.setAttribute('data-choice-scope', '');
    return () => root.removeAttribute('data-choice-scope');
  }, [enabled, scope]);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(TYPING)) return;
      const root = scope.current;
      // The live class locks an activity with `inert` on an ancestor, not with
      // `locked`: a key pressed then would submit an attempt the host drops.
      if (!root || root.closest('[inert]')) return;
      if (!target || target === document.body) {
        // Several activities may be mounted; a loose key belongs to the first live one.
        const first = Array.from(document.querySelectorAll('[data-choice-scope]')).find((el) => !el.closest('[inert]'));
        if (first !== root) return;
      } else if (!root.contains(target)) {
        return;
      }
      if (e.key === 'Enter') {
        // A focused button owns Enter, except our own options: those would
        // re-toggle themselves instead of sending the answer.
        const owner = target?.closest('button, a');
        if (owner && !owner.hasAttribute('data-choice-option')) return;
        e.preventDefault();
        latest.current.onSubmit();
        return;
      }
      const index = optionIndexForKey(e.key, latest.current.count);
      if (index === -1) return;
      e.preventDefault();
      latest.current.onPick(index);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, scope]);
}
