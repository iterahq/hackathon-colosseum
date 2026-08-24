import type { CodeBlank } from '@iterahq/activity-spec';
import { useActivityI18n } from '../../context.js';
import { blankWidthCh } from './guidedCode.js';

/**
 * One interactive hole, drawn INSIDE the code so it reads as part of the line
 * rather than as a form below it. Three shapes, and the difficulty is the point
 * of each:
 *   • `bank`   — the words are all on screen; the exercise is placement.
 *   • `select` — the candidates are next to the hole; the exercise is choosing.
 *   • `text`   — nothing is given; the exercise is recall.
 *
 * The widget never changes width as the learner works (`blankWidthCh` sizes it
 * from the longest candidate): a hole that grew while you typed would push the
 * rest of the line sideways, and one sized to the answer would leak its length.
 */
export function GuidedCodeBlank({
  blank,
  value,
  active,
  verdict,
  revealed,
  readOnly,
  onActivate,
  onChange,
}: {
  blank: CodeBlank;
  value: string;
  /** `bank` only: this is the hole the next chip lands in. */
  active: boolean;
  /** `null` while editing — right/wrong only exists after a submit. */
  verdict: boolean | null;
  /**
   * The value shown is the AUTHORED answer, put there by the professor.
   *
   * A third tone rather than reusing the green one: green says "you got it", and
   * on a revealed hole that sentence is false about the only person reading it.
   */
  revealed: boolean;
  readOnly: boolean;
  onActivate: () => void;
  onChange: (value: string) => void;
}) {
  const { t } = useActivityI18n();
  const width = `${blankWidthCh(blank)}ch`;
  const testId = `guided-blank-${blank.id}`;
  const base = blank.placeholder ?? t('code.guided.blankLabel');
  // The verdict is a colour, and colour alone is not a verdict for anyone using a
  // screen reader (or unable to tell green from red). Same for the reveal: it
  // says so in the accessible name, not only in the border.
  const label = revealed ? `${base} — ${t('code.guided.revealedBlank')}` : base;
  const invalid = verdict === false || undefined;

  const tone = revealed
    ? 'border-streak bg-streak/15 text-streak'
    : verdict === true
      ? 'border-evergreen bg-evergreen/15 text-evergreen-hi'
      : verdict === false
        ? 'border-destructive bg-destructive/15 text-destructive'
        : active
          ? 'border-evergreen bg-evergreen/10 text-evergreen-hi'
          : 'border-border bg-white/5 text-neutral-100 hover:border-evergreen/60';

  const shared = `mx-0.5 inline-flex h-6 items-center rounded-md border px-1.5 align-middle font-mono text-[13px] leading-none outline-none transition-colors focus-visible:ring-1 focus-visible:ring-evergreen/60 disabled:cursor-not-allowed ${tone}`;
  const marks = { 'data-testid': testId, 'data-revealed': revealed ? 'true' : 'false' };

  if (blank.kind === 'select') {
    return (
      <select
        {...marks}
        data-blank-kind="select"
        aria-label={label}
        aria-invalid={invalid}
        disabled={readOnly}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width }}
        className={shared}
      >
        <option value="">{blank.placeholder ?? '…'}</option>
        {(blank.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (blank.kind === 'text') {
    return (
      <input
        {...marks}
        data-blank-kind="text"
        aria-label={label}
        aria-invalid={invalid}
        disabled={readOnly}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={blank.placeholder ?? '…'}
        spellCheck={false}
        autoComplete="off"
        style={{ width }}
        className={`${shared} placeholder:text-neutral-600`}
      />
    );
  }

  // `bank`: a target, not a field. Tapping an EMPTY hole aims the bank at it;
  // tapping a FILLED one gives the chip back — which is the only way to fix a
  // mistake without a separate "clear" affordance cluttering every line.
  return (
    <button
      type="button"
      {...marks}
      data-blank-kind="bank"
      data-active={active ? 'true' : 'false'}
      aria-label={value ? `${label}: ${value}` : label}
      aria-invalid={invalid}
      disabled={readOnly}
      onClick={() => (value ? onChange('') : onActivate())}
      style={{ width }}
      className={`${shared} justify-center ${value ? '' : 'border-dashed'}`}
    >
      {value || (active ? '▍' : '…')}
    </button>
  );
}
