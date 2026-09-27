/**
 * The terminal-sandbox family under the ONE-BEHAVIOUR RULE (plan
 * `20260924-activity-type-one-behavior-rule`, ADR-1 + ADR-3, T11).
 *
 * `terminal_sandbox` read `spec.inputMode` to pick the surface, and in options
 * mode each STEP picked whole commands or tokens (`optionGranularity`). Each
 * kind below PINS its input, so a step cannot switch it:
 *
 * | kind                     | surface                          |
 * |--------------------------|----------------------------------|
 * | `terminal_type_command`  | type the line, press Enter       |
 * | `terminal_pick_command`  | tap a whole command (one tap runs) |
 * | `terminal_build_command` | assemble the line from tokens    |
 *
 * 🔁 ADR-3 reverses tsq2 = C (2026-08-06): the ramp command → token → free text
 * is a SEQUENCE of activities in the lesson, not a per-step choice.
 */
import { TerminalSandboxShell } from '../terminal/TerminalSandboxShell.js';
import type { ActivityCompletion, PortableActivity } from '../../renderer.js';
import { KindSpecGate } from './KindSpecGate.js';

type TerminalKindProps = {
  activity: PortableActivity;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
  reveal?: boolean;
};

export function TerminalTypeCommandActivity({ activity, onComplete, reveal = false }: TerminalKindProps) {
  return (
    <KindSpecGate kind={activity.kind} spec={activity.spec}>
      <TerminalSandboxShell
        activity={activity}
        onComplete={onComplete}
        reveal={reveal}
        variant="freeText"
        pinned
      />
    </KindSpecGate>
  );
}

export function TerminalPickCommandActivity({ activity, onComplete, reveal = false }: TerminalKindProps) {
  return (
    <KindSpecGate kind={activity.kind} spec={activity.spec}>
      <TerminalSandboxShell
        activity={activity}
        onComplete={onComplete}
        reveal={reveal}
        variant="options"
        granularity="command"
      />
    </KindSpecGate>
  );
}

export function TerminalBuildCommandActivity({ activity, onComplete, reveal = false }: TerminalKindProps) {
  return (
    <KindSpecGate kind={activity.kind} spec={activity.spec}>
      <TerminalSandboxShell
        activity={activity}
        onComplete={onComplete}
        reveal={reveal}
        variant="options"
        granularity="token"
      />
    </KindSpecGate>
  );
}
