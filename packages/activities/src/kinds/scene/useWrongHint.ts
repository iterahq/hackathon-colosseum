import { useCallback, useState } from 'react';
import type { WrongHintTone } from './WrongHint.js';

/**
 * Owns the try-again hint of a scene kind. `showHint` always bumps a counter, so
 * the same miss repeated with identical text shows the bar again after the
 * learner dismissed it (`tone: 'hit'` is for a note on a correct step); `showHint(null)` and `clearHint()` hide it. Spread
 * `hintProps` into `<WrongHint />`.
 */
export function useWrongHint() {
  const [state, setState] = useState<{ text: string | null; nonce: number; tone: WrongHintTone }>({
    text: null,
    nonce: 0,
    tone: 'miss',
  });
  const showHint = useCallback(
    (text: string | null | undefined, tone: WrongHintTone = 'miss') =>
      setState((s) => ({ text: text || null, nonce: s.nonce + 1, tone })),
    [],
  );
  const clearHint = useCallback(() => setState((s) => (s.text === null ? s : { ...s, text: null })), []);
  return { hint: state.text, showHint, clearHint, hintProps: state };
}
