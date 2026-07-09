/**
 * Match — connect cards on the LEFT to cards on the RIGHT (plan: card-select
 * matching, NOT a free canvas). Tap a left card to arm it, then tap a right
 * card to form a connection; tap a connected card again to clear it. Each right
 * card maps to at most one left. Submit checks every connection against
 * `spec.pairs`. Reuses InstructionPanel + `onComplete(correct)`.
 *
 * `initial*` props are story-only hooks for the answered/correct/incorrect states.
 */
import { useState } from 'react';
import { CheckCircle2, Link2, XCircle } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Activity, ChoiceOption, MatchSpec } from '@/types/content';
import { InstructionPanel } from './InstructionPanel';
import { ActivityShell, DoneButton } from './parts';

// Distinct connection accent colors (cycled) so paired cards read as linked.
const LINK_COLORS = ['#3FD17F', '#62D996', '#E0A86F', '#7CA9E0', '#C88BE0', '#E0C36E'];

function CardBody({ option }: { option: ChoiceOption }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {option.image_url && (
        <img src={option.image_url} alt={option.label ?? option.id} className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
      )}
      {option.label && <span className="flex-1 min-w-0 break-words">{option.label}</span>}
      {option.audio_url && (
        <audio src={option.audio_url} controls className="h-7 max-w-[8rem]" onClick={(e) => e.stopPropagation()} />
      )}
    </div>
  );
}

export function MatchActivity({
  activity,
  onComplete,
  initialConnections,
  initialSubmitted = false,
}: {
  activity: Activity;
  onComplete: (correct: boolean) => void;
  /** left_id -> right_id */
  initialConnections?: Record<string, string>;
  initialSubmitted?: boolean;
}) {
  const { t } = useI18n();
  const spec = activity.spec as unknown as MatchSpec;
  const left = spec?.left ?? [];
  const right = spec?.right ?? [];
  const pairs = spec?.pairs ?? [];

  const [connections, setConnections] = useState<Record<string, string>>(initialConnections ?? {});
  const [armedLeft, setArmedLeft] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(initialSubmitted);
  const isDone = activity.status === 'done';
  const locked = submitted || isDone;

  // Assign a stable color index per left card (by connection order in left[]).
  const colorForLeft = (leftId: string) => LINK_COLORS[left.findIndex((l) => l.id === leftId) % LINK_COLORS.length];
  const rightToLeft: Record<string, string> = {};
  for (const [l, r] of Object.entries(connections)) rightToLeft[r] = l;

  function tapLeft(id: string) {
    if (locked) return;
    if (connections[id]) {
      // clear an existing connection on re-tap
      setConnections((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setArmedLeft(id);
      return;
    }
    setArmedLeft((cur) => (cur === id ? null : id));
  }

  function tapRight(id: string) {
    if (locked) return;
    if (rightToLeft[id]) {
      // clear the connection that uses this right card
      setConnections((prev) => {
        const next = { ...prev };
        delete next[rightToLeft[id]];
        return next;
      });
      return;
    }
    if (!armedLeft) return;
    setConnections((prev) => ({ ...prev, [armedLeft]: id }));
    setArmedLeft(null);
  }

  const isPairCorrect = (leftId: string) => pairs.some((p) => p.left_id === leftId && p.right_id === connections[leftId]);
  const allCorrect =
    submitted &&
    pairs.length > 0 &&
    Object.keys(connections).length === pairs.length &&
    pairs.every((p) => connections[p.left_id] === p.right_id);

  const canSubmit = Object.keys(connections).length === Math.min(left.length, pairs.length || left.length);

  return (
    <ActivityShell kind="match" icon={Link2} label={t('activity.match')}>
      <InstructionPanel spec={spec?.instruction} />
      <p className="mt-4 text-xs font-mono uppercase tracking-wider text-muted-foreground">
        {t('activity.matchHint')}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4" data-testid="match-columns">
        <div className="space-y-2.5" data-testid="match-left">
          {left.map((o) => {
            const connected = Boolean(connections[o.id]);
            const armed = armedLeft === o.id;
            const color = connected ? colorForLeft(o.id) : undefined;
            const ok = submitted && connected && isPairCorrect(o.id);
            const bad = submitted && connected && !isPairCorrect(o.id);
            return (
              <button
                key={o.id}
                onClick={() => tapLeft(o.id)}
                disabled={locked}
                data-testid="match-left-card"
                data-connected={connected ? 'true' : undefined}
                className={`w-full flex items-center justify-between gap-2 py-3 px-4 rounded-2xl border text-left transition-colors ${
                  ok
                    ? 'border-verde-tech bg-verde-tech/10'
                    : bad
                      ? 'border-destructive bg-destructive/10'
                      : armed
                        ? 'border-menta bg-menta/10 ring-2 ring-menta/40'
                        : 'border-border bg-card hover:border-verde-tech/50'
                }`}
              >
                <CardBody option={o} />
                {connected && (
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                )}
                {ok && <CheckCircle2 className="w-4 h-4 text-menta flex-shrink-0" />}
                {bad && <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="space-y-2.5" data-testid="match-right">
          {right.map((o) => {
            const usedByLeft = rightToLeft[o.id];
            const color = usedByLeft ? colorForLeft(usedByLeft) : undefined;
            return (
              <button
                key={o.id}
                onClick={() => tapRight(o.id)}
                disabled={locked}
                data-testid="match-right-card"
                data-connected={usedByLeft ? 'true' : undefined}
                className={`w-full flex items-center justify-between gap-2 py-3 px-4 rounded-2xl border text-left transition-colors ${
                  usedByLeft ? 'border-menta bg-menta/5' : 'border-border bg-card hover:border-verde-tech/50'
                }`}
              >
                <CardBody option={o} />
                {usedByLeft && (
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {!submitted ? (
        <button
          disabled={!canSubmit}
          onClick={() => setSubmitted(true)}
          data-testid="match-submit"
          className="mt-6 w-full h-12 px-6 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('activity.submit')}
        </button>
      ) : (
        <DoneButton done={isDone} onClick={() => onComplete(Boolean(allCorrect))} />
      )}
    </ActivityShell>
  );
}
