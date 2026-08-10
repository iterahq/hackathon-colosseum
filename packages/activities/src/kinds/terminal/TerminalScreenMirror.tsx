/**
 * A learner's `terminal_sandbox` screen, REDRAWN read-only on someone else's
 * display — the Itera Player's live-class stage is the first caller.
 *
 * ── WHY THIS COMPONENT EXISTS AT ALL ────────────────────────────────────────
 * The obvious way to put a learner's terminal on the class stage is to mount the
 * activity again next to their name. That is what the stage did until 2026-08-10
 * and it is wrong in a way that is very hard to see: mounting the renderer seeds
 * `initialTerminalModel` from the VIEWER's client, so the room gets a pristine
 * prompt attributed to a learner who may have run a dozen commands. It does not
 * look broken. It looks like the learner did nothing.
 *
 * So the terminal is mirrored the way `code` is: the learner's own client
 * publishes what is on its screen, and the viewer DRAWS THAT. This component is
 * the drawing half, and it deliberately owns no state and runs no reducer — it
 * cannot invent a line, because it has no engine to invent one with.
 *
 * ── WHY IT SHIPS IN THE PACKAGE AND NOT IN THE HOST ─────────────────────────
 * It reuses `SandboxWindow`, `TerminalTranscript` and `TERMINAL_BODY`, which are
 * the same three pieces the live shell composes. A host-side copy would be a
 * second rendering of the same screen, free to drift from the one the learner is
 * looking at — and the ONE property a mirror has to keep is that the two
 * pictures match. `terminalGeometry.ts` exists for the same reason.
 *
 * The composer is absent, not disabled. There is nothing to submit here: the
 * viewer is not taking a turn, and a dead prompt bar would invite one.
 */
import { TerminalSquare } from 'lucide-react';
import { useActivityI18n } from '../../context.js';
import { ActivityShell } from '../../components/parts.js';
import { RichSpans } from '../../components/RichSpans.js';
import { parseInline } from '../../internal/richText.js';
import { SandboxWindow } from '../sandbox/SandboxWindow.js';
import { TerminalTranscript } from './TerminalTranscript.js';
import { TERMINAL_BODY } from './terminalGeometry.js';
import type { ActivityTerminalScreen } from '../../ports.js';

export function TerminalScreenMirror({
  screen,
  testid = 'terminal-screen-mirror',
}: {
  screen: ActivityTerminalScreen;
  testid?: string;
}) {
  const { t: tr } = useActivityI18n();
  const successLines = new Set(screen.successLines);

  return (
    <ActivityShell kind="terminal_sandbox" icon={TerminalSquare} label={tr('activity.sandboxScenario')}>
      <div
        className="flex flex-col gap-4"
        data-testid={testid}
        data-sandbox-kind="terminal"
        data-mirrored="true"
        data-command-count={screen.commandCount}
      >
        {/* The instruction the LEARNER has on screen, forwarded with the
            transcript. Without it the viewer reads commands with no question. */}
        {(screen.stepCount > 0 || screen.stepPrompt) && (
          <div className="flex flex-col gap-2" data-testid="sandbox-instruction">
            <div className="font-mono text-[11px] uppercase tracking-wider text-menta">
              {screen.won
                ? tr('terminal.mirror.completed')
                : `${tr('activity.step')} ${Math.min(screen.stepIdx + 1, screen.stepCount)}/${screen.stepCount}`}
            </div>
            {screen.stepPrompt && (
              <p className="text-[15px] font-medium text-foreground">
                <RichSpans spans={parseInline(screen.stepPrompt)} />
              </p>
            )}
          </div>
        )}

        <SandboxWindow title={screen.windowTitle} bodyClassName={TERMINAL_BODY}>
          <TerminalTranscript
            lines={[...screen.lines]}
            ps1={screen.ps1}
            successLines={successLines}
            successLabel={tr('terminal.stepCompleted')}
            /* The viewer's empty state is NOT the learner's. "Type a command"
               is an instruction the viewer cannot follow, and it would read as
               the mirror being broken rather than as the learner not having
               started. */
            emptyHint={tr('terminal.mirror.empty')}
          />
        </SandboxWindow>
      </div>
    </ActivityShell>
  );
}
