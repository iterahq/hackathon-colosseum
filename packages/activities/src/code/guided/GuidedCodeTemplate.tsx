import type { CodeBlank } from '@iterahq/activity-spec';
import type { GuidedLine, GuidedValues } from './types.js';
import { GuidedCodeBlank } from './GuidedCodeBlank.js';

/**
 * The LOCKED template: a code panel that looks like the editor next door but
 * accepts no typing except in the authored holes.
 *
 * Read-only text plus real widgets, NOT a patched Monaco. Monaco has no API for
 * "these ranges are editable and the rest is not" — the usual workaround is to
 * intercept every edit and roll back the ones outside the allowed ranges, which
 * leaves the learner fighting an editor that undoes their keystrokes, and still
 * loses to paste, multi-cursor and undo. A locked panel cannot get into that
 * argument: the code that must not change is not in an editor at all.
 */
export function GuidedCodeTemplate({
  lines,
  wordBank,
  values,
  activeBlankId,
  byBlank,
  revealed,
  readOnly,
  onActivate,
  onChange,
}: {
  lines: GuidedLine[];
  /** The chips of a bank exercise: a hole is as wide as the longest of them. */
  wordBank?: readonly string[];
  values: GuidedValues;
  activeBlankId: string | null;
  /** Per-blank verdicts, or `null` while the learner is still editing. */
  byBlank: Record<string, boolean> | null;
  /** The holes are showing the AUTHORED answer, not the learner's. */
  revealed: boolean;
  readOnly: boolean;
  onActivate: (blank: CodeBlank) => void;
  onChange: (blank: CodeBlank, value: string) => void;
}) {
  // A template that ends in a newline would draw a numbered line with nothing on it.
  const isEmpty = (line: GuidedLine) =>
    line.segments.every((segment) => segment.kind === 'code' && segment.text.trim() === '');
  let end = lines.length;
  while (end > 0 && isEmpty(lines[end - 1])) end -= 1;
  const shown = lines.slice(0, end);
  const gutterWidth = `${String(shown.length).length}ch`;

  return (
    <div
      data-testid="guided-code-template"
      // No height cap from `md` up: a capped template scrolled inside a page that
      // also scrolls, for the sake of one clipped line. A phone keeps a far cap so
      // a very long template cannot push the submit button a screen away.
      className="overflow-hidden rounded-2xl border border-border bg-[#0a0a0a] py-3 font-mono text-[13px] leading-[22px] max-sm:max-h-[62dvh] max-sm:overflow-y-auto max-sm:py-2.5 max-sm:leading-5"
    >
      {shown.map((line) => (
        <div key={line.number} className="flex items-start px-3">
          <span
            aria-hidden
            style={{ width: gutterWidth }}
            className="mr-4 shrink-0 select-none text-right text-neutral-600"
          >
            {line.number}
          </span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-neutral-100">
            {line.segments.map((segment, i) =>
              segment.kind === 'code' ? (
                <span key={i}>{segment.text}</span>
              ) : (
                <GuidedCodeBlank
                  key={segment.blank.id}
                  blank={segment.blank}
                  wordBank={wordBank}
                  value={values[segment.blank.id] ?? ''}
                  active={activeBlankId === segment.blank.id}
                  verdict={byBlank ? (byBlank[segment.blank.id] ?? null) : null}
                  revealed={revealed}
                  readOnly={readOnly}
                  onActivate={() => onActivate(segment.blank)}
                  onChange={(next) => onChange(segment.blank, next)}
                />
              ),
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
