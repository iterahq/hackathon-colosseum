/**
 * A learner's `chat_sandbox` conversation, REDRAWN read-only on someone else's
 * display — the Itera Player's live-class stage is the first caller.
 *
 * ── THE SAME DEFECT THE TERMINAL HAD, ONE KIND OVER ─────────────────────────
 * The obvious way to put a learner's chat on the class stage is to mount the
 * activity again next to their name. That is what the stage did, and it is wrong
 * the same way `TerminalScreenMirror` documents: mounting the renderer seeds
 * `initialModel(scenario, locale)` from the VIEWER's client, so the room gets
 * the authored opener and an empty composer attributed to a learner who may have
 * had a whole conversation. It does not look broken. It looks like the learner
 * did nothing.
 *
 * So the chat is mirrored the way `code` and `terminal_sandbox` are: the
 * learner's own client publishes what is on its screen, and the viewer DRAWS
 * THAT. This component is the drawing half. It owns no state and runs no
 * reducer — it cannot invent a turn, because it has no runtime to invent one
 * with.
 *
 * ── WHAT IS DELIBERATELY MISSING ────────────────────────────────────────────
 * The composer is ABSENT, not disabled, and so are the choice chips and slot
 * panel. The viewer is not taking the learner's turn, and a dead input would
 * invite one. More importantly the composer is where the learner's UNSENT draft
 * lives, and that never crosses the wire at all — see `ActivityChatScreen`,
 * which states the rule at the type rather than only here.
 *
 * ── WHY IT SHIPS IN THE PACKAGE AND NOT IN THE HOST ─────────────────────────
 * It reuses `SandboxWindow`, `SandboxChatLog` and `CHAT_SCROLL`, which are the
 * same three pieces the live shell composes. A host-side copy would be a second
 * rendering of the same conversation, free to drift from the one the learner is
 * looking at — and the ONE property a mirror has to keep is that the two
 * pictures match.
 *
 * The transcript is drawn with `streamIndex: -1`: no turn is mid-typewriter for
 * the viewer. Replaying the animation on the mirror would show the room a reply
 * arriving that already arrived, and would restart it on every re-broadcast.
 */
import { MessageSquare } from 'lucide-react';
import { useActivityI18n } from '../../context.js';
import { ActivityShell } from '../../components/parts.js';
import { RichSpans } from '../../components/RichSpans.js';
import { parseInline } from '../../internal/richText.js';
import { SandboxChatLog } from './SandboxChatLog.js';
import { SandboxWindow } from './SandboxWindow.js';
import { CHAT_SCROLL } from './chatGeometry.js';
import type { ActivityChatScreen } from '../../ports.js';

export function ChatScreenMirror({
  screen,
  testid = 'chat-screen-mirror',
}: {
  screen: ActivityChatScreen;
  testid?: string;
}) {
  const { t: tr } = useActivityI18n();

  return (
    <ActivityShell kind="chat_sandbox" icon={MessageSquare} label={tr('activity.sandboxScenario')}>
      <div
        className="flex flex-col gap-4"
        data-testid={testid}
        data-sandbox-kind="chat"
        data-mirrored="true"
        data-sent-count={screen.sentCount}
      >
        {/* The instruction the LEARNER has on screen, forwarded with the
            transcript. Without it the viewer reads answers with no question. */}
        {(screen.stepCount > 0 || screen.stepPrompt) && (
          <div className="flex flex-col gap-2" data-testid="sandbox-instruction">
            {/* The counter is drawn only when the scenario HAS steps. The BYOC
                variant is a two-phase flow with no authored step list, and
                "Passo 1/0" would be a number invented by the mirror. */}
            {(screen.stepCount > 0 || screen.won) && (
              <div className="font-mono text-[11px] uppercase tracking-wider text-menta">
                {screen.won
                  ? tr('chat.mirror.completed')
                  : `${tr('activity.step')} ${Math.min(screen.stepIdx + 1, screen.stepCount)}/${screen.stepCount}`}
              </div>
            )}
            {screen.stepPrompt && (
              <p className="text-[15px] font-medium text-foreground">
                <RichSpans spans={parseInline(screen.stepPrompt)} />
              </p>
            )}
          </div>
        )}

        <SandboxWindow>
          <div className={CHAT_SCROLL} data-testid="sandbox-scroll">
            {screen.messages.length === 0 ? (
              /* The viewer's empty state is NOT the learner's. "Type your ask"
                 is an instruction the viewer cannot follow, and it would read as
                 the mirror being broken rather than as the learner not having
                 started. */
              <p className="text-sm text-muted-foreground" data-testid="chat-mirror-empty">
                {tr('chat.mirror.empty')}
              </p>
            ) : (
              <SandboxChatLog
                messages={screen.messages.map((m) => ({ role: m.role, text: m.text }))}
                streamIndex={-1}
                dots={false}
                revealed={0}
              />
            )}
          </div>
        </SandboxWindow>
      </div>
    </ActivityShell>
  );
}
