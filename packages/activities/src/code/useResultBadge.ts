import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks whether the result pane has something the learner has not looked at.
 *
 * `markStale` is called when the learner edits the code (the preview is
 * re-rendered under them); a new `results` object (a check run finished or its
 * verdict changed) counts too. Only while the other pane is showing: the pane
 * being looked at is by definition seen. Opening the result clears it.
 */
export function useResultBadge<R>(pane: 'code' | 'preview', results: R | null) {
  const [unseen, setUnseen] = useState(false);
  const lastResults = useRef<R | null>(results);

  useEffect(() => {
    if (results === lastResults.current) return;
    lastResults.current = results;
    if (results !== null && pane === 'code') setUnseen(true);
  }, [results, pane]);

  useEffect(() => {
    if (pane === 'preview') setUnseen(false);
  }, [pane]);

  const markStale = useCallback(() => {
    if (pane === 'code') setUnseen(true);
  }, [pane]);

  return { unseen, markStale };
}
