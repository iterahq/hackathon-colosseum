import type { CodeHelp } from '@iterahq/activity-spec';
import type { GuidedLine, GuidedValues, GuidedVariant } from './types.js';
import { CodeHelpLink } from '../CodeHelpLink.js';
import { CodeResetControl } from '../CodeResetControl.js';
import { GuidedCodeBank } from './GuidedCodeBank.js';
import { GuidedCodeKeys } from './GuidedCodeKeys.js';
import { GuidedCodeTemplate } from './GuidedCodeTemplate.js';

/**
 * The learner's half of the guided surface: the locked template, the word bank
 * when the variant has one, the reference link and the "recomeçar" escape hatch.
 *
 * The bank only exists for `bank` blanks. A dropdown carries its candidates next
 * to the hole and free text has none, so rendering an empty pool under those
 * would advertise an affordance that is not there.
 */
export function GuidedCodeWorkspace({
  variant,
  lines,
  values,
  activeBlankId,
  byBlank,
  revealed,
  wordBank,
  spentChips,
  hasTarget,
  help,
  disabled,
  resetDisabled,
  onAim,
  onSet,
  onPickChip,
  onReset,
  hideReset = false,
}: {
  variant: GuidedVariant;
  lines: GuidedLine[];
  values: GuidedValues;
  activeBlankId: string | null;
  byBlank: Record<string, boolean> | null;
  /** The holes are showing the AUTHORED answer, not the learner's. */
  revealed: boolean;
  wordBank: string[];
  spentChips: Record<string, number>;
  /** False when every hole is full: a chip has nowhere to land. */
  hasTarget: boolean;
  help?: CodeHelp;
  disabled: boolean;
  resetDisabled: boolean;
  onAim: (blankId: string) => void;
  onSet: (blankId: string, value: string) => void;
  /** A chip left the bank; the pane decides which hole it lands in. */
  onPickChip: (word: string) => void;
  onReset: () => void;
  hideReset?: boolean;
}) {
  const hasBank = variant === 'options' || variant === 'mixed';
  const hasText = lines.some((line) => line.segments.some((s) => s.kind === 'blank' && s.blank.kind === 'text'));

  return (
    // The live-class layer finds this marker to mirror the learner's pointer to
    // the class while they are on stage. An attribute rather than a prop, for the
    // same reason as in `CodeSnackPane`: the activity tree's public contract
    // carries no live-session concerns.
    <div className="flex flex-col" data-stage-cursor-source>
      <GuidedCodeTemplate
        lines={lines}
        wordBank={wordBank}
        values={values}
        activeBlankId={activeBlankId}
        byBlank={byBlank}
        revealed={revealed}
        readOnly={disabled}
        onActivate={(blank) => onAim(blank.id)}
        onChange={(blank, value) => onSet(blank.id, value)}
      />

      {hasText && <GuidedCodeKeys values={values} disabled={disabled} onSet={onSet} />}

      {hasBank && (
        <GuidedCodeBank
          words={wordBank}
          spent={spentChips}
          disabled={disabled || !hasTarget}
          onPick={onPickChip}
        />
      )}

      <CodeHelpLink help={help} />

      {!hideReset && <CodeResetControl onReset={onReset} disabled={resetDisabled} className="mt-2" />}
    </div>
  );
}
