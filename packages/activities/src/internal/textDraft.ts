import { useCallback, useEffect, useRef } from 'react';
import { useActivityStorage } from '../context.js';
import { usePagehideFlush } from './usePagehideFlush.js';

/** The slot a free-text answer is kept in while it is being written. */
export const TEXT_DRAFT_KEY_PREFIX = 'itera.text.draft:';

export function textDraftKey(activityId: string): string {
  return `${TEXT_DRAFT_KEY_PREFIX}${activityId}`;
}

export function textDraftActivityId(key: string): string {
  return key.startsWith(TEXT_DRAFT_KEY_PREFIX) ? key.slice(TEXT_DRAFT_KEY_PREFIX.length) : '';
}

/** The same window as the code editor's autosave. */
const AUTOSAVE_DEBOUNCE_MS = 600;

export interface TextDraft {
  /** What was being written when the page last went away; `''` when nothing. */
  read: () => string;
  /** Keep the text, debounced; flushed if the page hides inside the window. */
  save: (text: string) => void;
  /**
   * Write what is pending now. Called when the text is sent — and the draft is
   * KEPT: if that save fails and the page reloads, the learner still has it. A
   * finished activity never reads the draft, and the host forgets it on a reset.
   */
  flush: () => void;
}

/**
 * A free-text answer in progress survives a reload: on a phone, switching apps
 * is enough for the page to be thrown away with everything typed in it.
 */
export function useTextDraft(activityId: string): TextDraft {
  const storage = useActivityStorage();
  const storageRef = useRef(storage);
  storageRef.current = storage;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWriteRef = useRef<(() => void) | null>(null);
  usePagehideFlush(pendingWriteRef);

  const drop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingWriteRef.current = null;
  }, []);
  // Never flushed on unmount: a lesson reset clears the draft and re-mounts the
  // activity, and a flush here would write the old text straight back.
  useEffect(() => drop, [drop, activityId]);

  const read = useCallback(() => storageRef.current.read(textDraftKey(activityId)) ?? '', [activityId]);

  const save = useCallback(
    (text: string) => {
      drop();
      const write = () => {
        if (pendingWriteRef.current !== write) return;
        pendingWriteRef.current = null;
        if (timerRef.current) clearTimeout(timerRef.current);
        if (text === '') storageRef.current.clear(textDraftKey(activityId));
        else storageRef.current.write(textDraftKey(activityId), text);
      };
      pendingWriteRef.current = write;
      timerRef.current = setTimeout(write, AUTOSAVE_DEBOUNCE_MS);
    },
    [activityId, drop],
  );

  const flush = useCallback(() => pendingWriteRef.current?.(), []);

  return { read, save, flush };
}
