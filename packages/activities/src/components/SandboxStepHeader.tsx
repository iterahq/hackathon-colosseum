/**
 * The instruction block above a sandbox window, shared by the terminal and the
 * chat shells.
 *
 * A real class read a multi-step sandbox as ONE task: the prompt swapped in
 * place under an 11px label, so a learner who had just typed a command saw new
 * text appear and assumed they had misread the old one. The progression was
 * data the screen owned and never spent: nothing said how many steps there
 * were, which had been cleared, or that the text had just CHANGED.
 *
 * So the step is drawn as a track of segments, and the prompt is swapped with a
 * keyed transition instead of a re-render — motion is what makes the change
 * legible as a change. Under `prefers-reduced-motion` both collapse to the
 * static picture, which still carries the count and the filled segments.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useActivityI18n } from '../context.js';
import { RichSpans } from './RichSpans.js';
import { parseInline } from '../internal/richText.js';
import { SandboxHint } from '../kinds/sandbox/SandboxHint.js';

export function SandboxStepHeader({
  stepIdx,
  stepCount,
  prompt,
  hint,
  hintLabel,
}: {
  stepIdx: number;
  stepCount: number;
  prompt?: string;
  hint?: string;
  hintLabel: string;
}) {
  const { t: tr } = useActivityI18n();
  const reduceMotion = useReducedMotion();
  const cleared = useStepCleared(stepIdx);
  // The count reads `2/3`, not `2 de 3`: the slash is the substring the live
  // mirror and the tests already look for.
  const label = `${tr('activity.step')} ${stepIdx + 1}/${stepCount}`;

  return (
    <div className="flex flex-col gap-2" data-testid="sandbox-instruction" data-step-idx={stepIdx}>
      <div className="flex items-center gap-3">
        <div className="font-mono text-[11px] uppercase tracking-wider text-menta">{label}</div>
        {stepCount > 1 && (
          <div className="flex flex-1 gap-1" data-testid="sandbox-step-track" aria-hidden>
            {Array.from({ length: stepCount }, (_, i) => (
              <div
                key={i}
                className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/10"
                data-step-state={i < stepIdx ? 'done' : i === stepIdx ? 'current' : 'todo'}
              >
                <motion.div
                  className="h-full origin-left rounded-full bg-menta"
                  initial={false}
                  animate={{ scaleX: i <= stepIdx ? 1 : 0, opacity: i < stepIdx ? 0.55 : 1 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.45, ease: 'easeOut' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reserved, not inserted: a chip that appears in the flow would shove the
          sandbox window down and pull it back up 2.6s later, twice per step. */}
      {stepCount > 1 && (
        <div className="h-4">
          <AnimatePresence>
            {cleared && (
              <motion.div
                className="inline-flex items-center gap-1 rounded-full bg-menta/15 px-2 py-px text-[11px] font-semibold text-menta"
                data-testid="sandbox-step-cleared"
                initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
              >
                <Check className="h-3 w-3" aria-hidden />
                {`${tr('activity.step')} ${cleared}/${stepCount} · ${tr('activity.stepCleared')}`}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {prompt && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={stepIdx}
            className="text-[15px] font-medium text-foreground"
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: 'easeOut' }}
          >
            <RichSpans spans={parseInline(prompt)} />
          </motion.p>
        </AnimatePresence>
      )}

      {hint && <SandboxHint hint={hint} label={hintLabel} />}
    </div>
  );
}

const CLEARED_FLASH_MS = 2600;

/**
 * The step the learner JUST cleared, for as long as the flash lasts.
 *
 * The track and the prompt both describe where the learner IS; neither says
 * that anything happened. A learner mid-typing looks up at new text and cannot
 * tell whether they advanced or misread — so the transition gets its own
 * short-lived object on screen, which is the part they can miss and come back
 * to. It never fires on first render: there is no step to have cleared yet.
 */
function useStepCleared(stepIdx: number): number | null {
  const [cleared, setCleared] = useState<number | null>(null);
  const prev = useRef(stepIdx);
  useEffect(() => {
    if (stepIdx <= prev.current) {
      prev.current = stepIdx;
      return;
    }
    prev.current = stepIdx;
    setCleared(stepIdx);
    const id = setTimeout(() => setCleared(null), CLEARED_FLASH_MS);
    return () => clearTimeout(id);
  }, [stepIdx]);
  return cleared;
}
