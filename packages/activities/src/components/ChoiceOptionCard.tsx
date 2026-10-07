import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { SPRING_POP, enterItem } from './tactile.js';
import { tactileSurface, type SurfaceState } from './tactileSurface.js';
import { VerdictMark } from './VerdictMark.js';
import { optionKeyLabel } from './useChoiceHotkeys.js';

export type ChoiceCardState = 'idle' | 'chosen' | 'correct' | 'wrong';

const SURFACE_OF: Record<ChoiceCardState, SurfaceState> = {
  idle: 'idle',
  chosen: 'picked',
  correct: 'right',
  wrong: 'miss',
};

/**
 * One tactile option of a choice list: key badge, the option's media, and a
 * verdict slot. `state` is `choiceOptionState()`'s answer, only mapped to looks.
 * In a row of several (`compact`) the slot would leave the label no width, so
 * the verdict is stamped on the corner.
 * The enter animation lives on a wrapper so it never fights the press transform
 * of the button itself.
 */
export function ChoiceOptionCard({
  index,
  state,
  chosen,
  shown,
  multi = false,
  compact = false,
  disabled,
  testId,
  optionId,
  onClick,
  children,
}: {
  index: number;
  state: ChoiceCardState;
  chosen: boolean;
  shown: boolean;
  multi?: boolean;
  /** The card shares its row with others: tighter padding, and the verdict lands on the corner instead of holding a slot. */
  compact?: boolean;
  disabled: boolean;
  testId: string;
  optionId: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const verdict = state === 'correct' ? 'right' : state === 'wrong' ? 'miss' : null;
  const dimmed = shown && state === 'idle';
  const keyed = !shown && state === 'chosen';
  return (
    <motion.div className="h-full" {...enterItem(index, reduced)}>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        data-testid={testId}
        data-choice-option=""
        data-option-id={optionId}
        data-selected={chosen ? 'true' : undefined}
        data-state={state}
        data-verdict={verdict ?? undefined}
        data-compact={compact ? 'true' : undefined}
        className={`w-full h-full min-h-14 flex items-center py-3 text-left ${compact ? 'relative gap-2 px-2.5' : 'gap-3 px-4'} ${tactileSurface(
          SURFACE_OF[state],
          !disabled,
        )} ${dimmed ? 'opacity-60' : ''} ${disabled ? 'cursor-default' : ''}`}
      >
        <motion.span
          key={String(keyed)}
          initial={keyed && !reduced ? { scale: 0.8 } : false}
          animate={{ scale: 1 }}
          transition={SPRING_POP}
          // The key is drawn by CSS: a text node would be read out before the
          // label and would answer to a query for the label's own text.
          aria-hidden="true"
          data-key={optionKeyLabel(index)}
          className={`w-7 h-7 flex-shrink-0 inline-flex items-center justify-center rounded-lg font-mono text-xs font-semibold ${
            keyed ? 'bg-evergreen text-obsidiana' : 'border border-border text-muted-foreground'
          } ${multi && keyed ? '' : 'before:content-[attr(data-key)]'}`}
        >
          {multi && keyed && <Check className="w-4 h-4" strokeWidth={3} />}
        </motion.span>
        <div className="flex items-center gap-3 flex-1 min-w-0">{children}</div>
        {compact ? (
          verdict && (
            <span data-verdict-corner="" className="absolute -right-2 -top-2 flex h-6 w-6 rounded-full bg-card">
              <VerdictMark verdict={verdict} />
            </span>
          )
        ) : (
          <VerdictMark verdict={verdict} />
        )}
      </button>
    </motion.div>
  );
}
