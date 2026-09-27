/**
 * The chat-sandbox family under the ONE-BEHAVIOUR RULE (plan
 * `20260924-activity-type-one-behavior-rule`, ADR-1 + ADR-3 + ADR-8, T10).
 *
 * `chat_sandbox` picked one of three renderers from the SHAPE of the spec
 * (`slots?.length`, `choices?.length`). Each kind below names its renderer; the
 * components stay shared (`SandboxScenarioShell` + one compose panel each), so
 * the screen of a remapped row is byte-for-byte the screen it had.
 *
 * | kind                | compose panel             | variant   |
 * |---------------------|---------------------------|-----------|
 * | `chat_compose`      | free prompt (seed chip)   | `ai`      |
 * | `chat_fill_select`  | fill every slot, dropdown | `words`   |
 * | `chat_fill_type`    | fill every slot, typed    | `words`   |
 * | `chat_pick_context` | pick a context chip       | `options` |
 * | `chat_rate_reply`   | none — rate the shown reply | `ai` + seeded run |
 *
 * `chat_rate_reply` starts from ONE seeded run (T25): the author's fallback
 * reply is on screen and the rate panel is up before any send. Without it the
 * kind could not complete (0 of 15 prepared specs did).
 */
import { SandboxScenarioShell } from '../sandbox/SandboxScenarioShell.js';
import type { SandboxVariant } from '../sandbox/SandboxControls.js';
import type { ActivityCompletion, PortableActivity } from '../../renderer.js';
import { KindSpecGate } from './KindSpecGate.js';

type ChatKindProps = {
  activity: PortableActivity;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
  reveal?: boolean;
};

function chatKind(variant: SandboxVariant, seedRun = false) {
  return function ChatKind({ activity, onComplete, reveal = false }: ChatKindProps) {
    return (
      <KindSpecGate kind={activity.kind} spec={activity.spec}>
        <SandboxScenarioShell
          activity={activity}
          onComplete={onComplete}
          reveal={reveal}
          variant={variant}
          seedRun={seedRun}
        />
      </KindSpecGate>
    );
  };
}

/** `chat_compose` — type a free prompt; the canned-result table answers. */
export const ChatComposeActivity = chatKind('ai');
/** `chat_fill_select` — pick every slot from a list. */
export const ChatFillSelectActivity = chatKind('words');
/** `chat_fill_type` — type every slot. */
export const ChatFillTypeActivity = chatKind('words');
/** `chat_pick_context` — pick a context chip. */
export const ChatPickContextActivity = chatKind('options');
/** `chat_rate_reply` — rate the shown reply good or bad; an answer key grades. */
export const ChatRateReplyActivity = chatKind('ai', true);
