import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { ActivityCompletion } from '../renderer.js';

const HidesAnswerOnMissContext = createContext(false);
const UnlimitedAttemptsContext = createContext(false);
const VerdictRecorderContext = createContext<VerdictRecorder | null>(null);

/** Called at the instant a submission is judged, before the learner presses any "continue". */
export type VerdictRecorder = (correct: boolean, detail?: ActivityCompletion) => void;

/**
 * A host where a miss must not hand the answer over wraps the renderer in this
 * provider with `hide`. A missed choice then marks only what the learner picked,
 * and the authored explanation (which names the answer) stays out. Without the
 * provider nothing changes: the live class and the instructor's reveal keep the key.
 */
export function HostHidesAnswerOnMiss({ hide, children }: { hide: boolean; children: ReactNode }) {
  return <HidesAnswerOnMissContext.Provider value={hide}>{children}</HidesAnswerOnMissContext.Provider>;
}

export function useHostHidesAnswerOnMiss(): boolean {
  return useContext(HidesAnswerOnMissContext);
}

/**
 * A host with its own cost for a miss (the lesson player's lives) wraps the
 * renderer in this provider: the `code` kinds then have no per-exercise attempt
 * budget, no budget line and no terminal "out of attempts" state.
 */
export function HostUnlimitedAttempts({ children }: { children: ReactNode }) {
  return <UnlimitedAttemptsContext.Provider value>{children}</UnlimitedAttemptsContext.Provider>;
}

export function useHostUnlimitedAttempts(): boolean {
  return useContext(UnlimitedAttemptsContext);
}

/**
 * A host that records a verdict when it happens, not when the learner moves on,
 * passes `onVerdict` here. Kinds that show their own verdict and wait for a
 * "continue" (the `code` family) call it at the submit; `onComplete` still fires
 * on the "continue" exactly as before.
 */
export function HostRecordsVerdict({ onVerdict, children }: { onVerdict: VerdictRecorder; children: ReactNode }) {
  return <VerdictRecorderContext.Provider value={onVerdict}>{children}</VerdictRecorderContext.Provider>;
}

export function useHostVerdictRecorder(): VerdictRecorder | null {
  return useContext(VerdictRecorderContext);
}
