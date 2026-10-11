import type { SealedAnswer } from '../../components/hostLessonRules.js';
import type { CodeBlank } from '@iterahq/activity-spec';
import type { ActivityCompletion } from '../../renderer.js';

export type GuidedSegment = { kind: 'code'; text: string } | { kind: 'blank'; blank: CodeBlank };

export interface GuidedLine {
  number: number;
  segments: GuidedSegment[];
}

/** The learner's answers, by blank id. Absent/empty means "not filled yet". */
export type GuidedValues = Record<string, string>;

/**
 * Which variant a guided spec is, decided by the KINDS of its blanks — the same
 * shape-dispatch the sandbox kind does over `slots`/`choices`.
 *
 * `mixed` exists because the schema allows blanks of different kinds in one
 * template and silently picking one of them would misreport the activity.
 */
export type GuidedVariant = 'options' | 'dropdown' | 'text' | 'mixed';

export interface GuidedGrade {
  byBlank: Record<string, boolean>;
  correctCount: number;
  allCorrect: boolean;
}

/**
 * Guided activities settle in one step: there is no separate "run the checks"
 * round trip, because a blank's correctness IS its answer text. `submitted` is
 * where the verdict lives and `settled` is terminal, matching the vocabulary of
 * `CodeSnackPhase` so the two surfaces read the same in a trace.
 */
export type GuidedPhase = 'editing' | 'submitted' | 'settled';

export interface UseGuidedCodeOptions {
  /** Carries the SUBSTITUTED source up as `detail.response`, like the open editor. */
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
  /**
   * The host is showing the gabarito (the professor stopped the clock).
   *
   * PRESENTATION ONLY, and the hook is where that is enforced: it never writes a
   * draft, never grades, never settles. A revealed answer that reached the draft
   * store or `onComplete` would turn a teaching move into learner data — the
   * class would rank by who was on screen when the professor clicked.
   */
  reveal?: boolean;
  /** The activity came without its answers: every verdict is the host's judge's. */
  sealed?: SealedAnswer | null;
}
