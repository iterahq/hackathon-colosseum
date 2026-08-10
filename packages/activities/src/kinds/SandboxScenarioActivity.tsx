/**
 * ⚠️ `sandbox_scenario` — DEPRECATED, kept only for rows still carrying the old
 * kind. It owns no rendering of its own anymore: it reads the legacy
 * `spec.sandboxKind` discriminator and delegates to whichever of the two real
 * kinds that string selected.
 *
 * The discriminator is read off the RAW spec, not off the parsed type: 0.10.0
 * removed `sandboxKind` from `TerminalScenario` (terminal-ness is the activity
 * KIND now), but the un-migrated database rows still carry the field, and those
 * rows are exactly the ones that land here.
 *
 * `initialState.engine` is the fallback because a terminal row authored after
 * the split would arrive without the legacy field, and rendering a shell
 * scenario as a chat is a blank screen rather than an error.
 */
import { ChatSandboxActivity } from './ChatSandboxActivity.js';
import { TerminalSandboxActivity } from './TerminalSandboxActivity.js';
import type { ActivityCompletion, PortableActivity } from '../renderer.js';

export function SandboxScenarioActivity(props: {
  activity: PortableActivity;
  onComplete: (correct: boolean, detail?: ActivityCompletion) => void;
  reveal?: boolean;
}) {
  const spec = (props.activity.spec ?? {}) as Record<string, unknown>;
  const initialState = (spec.initialState ?? {}) as Record<string, unknown>;

  if (spec.sandboxKind === 'terminal' || 'engine' in initialState) {
    return <TerminalSandboxActivity {...props} />;
  }
  return <ChatSandboxActivity {...props} />;
}
