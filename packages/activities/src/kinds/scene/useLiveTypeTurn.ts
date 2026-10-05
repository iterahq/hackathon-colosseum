import { useEffect, useRef, useState, type RefObject } from 'react';

const SETTLE_MS = 700;
const MAX_LENGTH = 40;
const EDIT_TRACE_DEBOUNCE_MS = 800;

/**
 * The learner's half of `live_type`: once the ghost finishes, the target text
 * becomes the learner's, pre-selected so typing replaces it. The gate opens
 * when their OWN text (≥ `minLength`, different from the original) holds still
 * for a moment. Only `{ length }` is ever recorded — never the text.
 */
export function useLiveTypeTurn({
  original,
  minLength,
  ghostDone,
  solved,
  inputRef,
  onGate,
  onEdit,
}: {
  original: string;
  minLength: number;
  ghostDone: boolean;
  solved: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onGate: (length: number) => void;
  onEdit: (length: number) => void;
}) {
  const [mine, setMine] = useState<string | null>(null);
  const editTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!ghostDone || mine !== null) return;
    setMine(original);
    if (solved) return;
    // A learner who starts typing inside this window must never lose it: only
    // select the ghost's text if it is STILL there, untouched, when the timer
    // fires. Without this guard a fast typist (or a real-browser test with no
    // artificial delay) can have the selection wipe out everything already
    // typed the instant this fires mid-keystroke.
    const timer = window.setTimeout(() => {
      const el = inputRef.current;
      if (el && el.value === original) el.select();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [ghostDone, mine, original, solved, inputRef]);

  useEffect(() => {
    if (solved || mine === null) return;
    const own = mine.trim();
    if (own.length < minLength || own === original) return;
    const timer = window.setTimeout(() => onGate(own.length), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [mine, solved, minLength, original, onGate]);

  useEffect(() => () => window.clearTimeout(editTimer.current), []);

  const change = (value: string) => {
    const next = value.slice(0, MAX_LENGTH);
    setMine(next);
    window.clearTimeout(editTimer.current);
    editTimer.current = window.setTimeout(() => onEdit(next.length), EDIT_TRACE_DEBOUNCE_MS);
  };

  return { mine, change };
}
