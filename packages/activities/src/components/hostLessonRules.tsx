import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ActivityCompletion, PortableActivity } from '../renderer.js';

const HidesAnswerOnMissContext = createContext(false);
const UnlimitedAttemptsContext = createContext(false);
const VerdictRecorderContext = createContext<VerdictRecorder | null>(null);
const AnswerJudgeContext = createContext<ActivityJudge | null>(null);
const MissNoteContext = createContext<string | null>(null);

/**
 * One line a host wants under every missed exercise that shows its own verdict
 * (the `code` family): what the miss means in that host, in its words.
 */
export function HostNotesMisses({ note, children }: { note: string; children: ReactNode }) {
  return <MissNoteContext.Provider value={note}>{children}</MissNoteContext.Provider>;
}

export function useHostMissNote(): string | null {
  return useContext(MissNoteContext);
}

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

/** What a learner submitted, as the kind's `answer_submitted` action and its `response` carry it. */
export interface JudgeSubmission {
  answer?: Record<string, unknown> | null;
  response?: string | null;
}

/** The verdict of a host that grades, with what it lets the screen show now. */
export interface JudgeOutcome {
  passed: boolean;
  /** The answer fields the spec was served without. Present only when the answer passed. */
  key?: Record<string, unknown>;
  explanation?: string;
  /** Fill kinds: which holes hold an accepted answer. */
  blanks?: Record<string, boolean>;
  /** Editor kinds: the result of each named check. */
  checks?: ReadonlyArray<{ id: string; passed: boolean }>;
}

/** Resolves `null` when no verdict could be had: nothing was graded and the learner may send again. */
export type ActivityJudge = (activityId: string, submission: JudgeSubmission) => Promise<JudgeOutcome | null>;

/**
 * A host whose activities arrive SEALED (`activity.sealed`: the spec carries no
 * answer key) grades through this provider. A sealed kind asks it at the submit
 * and shows what comes back; an activity that is not sealed never calls it.
 */
export function HostJudgesAnswers({ judge, children }: { judge: ActivityJudge; children: ReactNode }) {
  return <AnswerJudgeContext.Provider value={judge}>{children}</AnswerJudgeContext.Provider>;
}

export interface SealedAnswer {
  /** The last verdict; `null` before the first one. */
  outcome: JudgeOutcome | null;
  judging: boolean;
  /** The last submission got no verdict. */
  unreachable: boolean;
  ask: (submission: JudgeSubmission) => Promise<JudgeOutcome | null>;
  /** Drops the verdict: the learner is answering again. */
  clear: () => void;
}

const unreachableJudge: ActivityJudge = () => Promise.resolve(null);

/** The judge of a sealed activity; `null` for an activity that carries its own key. */
export function useSealedAnswer(activity: PortableActivity): SealedAnswer | null {
  const judge = useContext(AnswerJudgeContext) ?? unreachableJudge;
  const [outcome, setOutcome] = useState<JudgeOutcome | null>(null);
  const [judging, setJudging] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const activityRef = useRef(activity.id);
  const busyRef = useRef(false);

  useEffect(() => {
    activityRef.current = activity.id;
    busyRef.current = false;
    setOutcome(null);
    setJudging(false);
    setUnreachable(false);
  }, [activity.id]);

  const ask = useCallback(
    async (submission: JudgeSubmission) => {
      if (busyRef.current) return null;
      const asked = activity.id;
      busyRef.current = true;
      setJudging(true);
      setUnreachable(false);
      let verdict: JudgeOutcome | null = null;
      try {
        verdict = await judge(asked, submission);
      } catch {
        verdict = null;
      }
      if (activityRef.current !== asked) return null;
      busyRef.current = false;
      setJudging(false);
      setUnreachable(verdict === null);
      if (verdict) setOutcome(verdict);
      return verdict;
    },
    [activity.id, judge],
  );

  const clear = useCallback(() => setOutcome(null), []);

  if (!activity.sealed) return null;
  return { outcome, judging, unreachable, ask, clear };
}
